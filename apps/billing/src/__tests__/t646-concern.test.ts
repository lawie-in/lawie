import './setupDb';
import './setupEnv';
import crypto from 'crypto';

import { enqueueEmail } from '@lawie/email-client';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { env } from '../config/env';
import logger from '../config/logger';
import { Payment } from '../models/Payment.model';
import { PaymentConcern } from '../models/PaymentConcern.model';
import { eraseBillingAccount } from '../services/account-erase.service';
import {
  concernIpKey,
  concernUserKey,
  setConcernRateLimitRedis,
} from '../services/concern-rate-limit';

import { headers, INTERNAL_SECRET, seedUser } from './t436-helpers';

// T-646 AC3 (Arjun 4, 5, 7): POST /payments/:id/concerns, the email view and erase.
// Real routes, in-memory Mongo; the rate-limit Redis and the email queue are fakes.

jest.mock('@lawie/email-client', () => ({
  ...jest.requireActual('@lawie/email-client'),
  enqueueEmail: jest.fn(),
}));

const NOTE = 'My card 4111-1111 was charged twice, call me on 9876543210';

class FakeRedis {
  store = new Map<string, number>();
  ttl = new Map<string, number>();
  fail = false;
  async incr(k: string) {
    if (this.fail) throw new Error('redis down');
    const n = (this.store.get(k) ?? 0) + 1;
    this.store.set(k, n);
    return n;
  }
  async pttl(k: string) {
    if (this.fail) throw new Error('redis down');
    return this.ttl.get(k) ?? -1;
  }
  async pexpire(k: string, ms: number) {
    if (this.fail) throw new Error('redis down');
    this.ttl.set(k, ms);
    return 1;
  }
}

let redis: FakeRedis;
let savedRedisUrl: string | undefined;

async function mkPayment(userId: mongoose.Types.ObjectId, over: Record<string, unknown> = {}) {
  const now = new Date();
  return Payment.create({
    userId,
    kind: 'topup',
    status: 'paid',
    razorpayPaymentId: `pay_${Math.random().toString(36).slice(2, 14)}`,
    amountPaise: 19900,
    refundedPaise: 0,
    inkUnits: 20,
    inkReversedUnits: 0,
    source: 'webhook',
    createdAt: now,
    updatedAt: now,
    ...over,
  });
}

const post = (
  userId: unknown,
  paymentId: string,
  body: unknown,
  extra: Record<string, string> = {},
) =>
  request(app)
    .post(`/payments/${paymentId}/concerns`)
    .set({ ...headers(String(userId)), ...extra })
    .send(body as object);

beforeEach(() => {
  redis = new FakeRedis();
  setConcernRateLimitRedis(redis as never);
  savedRedisUrl = env.REDIS_URL;
  (env as unknown as Record<string, unknown>).REDIS_URL = 'redis://dummy:6379';
  (enqueueEmail as jest.Mock).mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  (env as unknown as Record<string, unknown>).REDIS_URL = savedRedisUrl;
  setConcernRateLimitRedis(null);
  jest.restoreAllMocks();
});

describe('POST /payments/:id/concerns - happy path', () => {
  it('stores the concern, returns 201 {id,status,reference}, queues both jobs with ids only', async () => {
    const u = await seedUser();
    const pay = await mkPayment(u);
    const res = await post(u, String(pay._id), { reason: 'charged_no_ink', note: NOTE });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      concern: {
        id: expect.stringMatching(/^[a-f0-9]{24}$/),
        status: 'open',
        reference: expect.stringMatching(/^PC-[A-HJ-NP-Z2-9]{8}$/),
      },
    });
    expect(JSON.stringify(res.body)).not.toContain('4111');

    const row = await PaymentConcern.findById(res.body.concern.id).lean();
    expect(row).toMatchObject({
      reason: 'charged_no_ink',
      note: NOTE,
      status: 'open',
      reference: res.body.concern.reference,
      openKey: String(pay._id),
    });
    expect(String(row!.userId)).toBe(String(u));
    expect(String(row!.paymentId)).toBe(String(pay._id));

    const calls = (enqueueEmail as jest.Mock).mock.calls.map((c) => c[0]);
    expect(calls).toHaveLength(2);
    const id = res.body.concern.id;
    const ack = calls.find((c) => c.template === 'billing.concernReceived');
    const notify = calls.find((c) => c.template === 'admin.paymentConcern');
    expect(ack).toEqual({
      template: 'billing.concernReceived',
      to: [],
      data: { userId: String(u), concernId: id },
      idempotencyKey: `concern-ack-${id}`,
    });
    expect(notify).toEqual({
      template: 'admin.paymentConcern',
      to: [],
      data: { userId: String(u), concernId: id },
      idempotencyKey: `concern-notify-${id}`,
    });
    // Arjun 5: the note is never in job data (nor the reason, an email address, ...).
    expect(JSON.stringify(calls)).not.toContain('4111');
    expect(JSON.stringify(calls)).not.toContain('9876543210');

    const after = await PaymentConcern.findById(id).lean();
    expect(after!.ackQueuedAt).toBeInstanceOf(Date);
    expect(after!.notifyQueuedAt).toBeInstanceOf(Date);
  });

  it('never logs the note', async () => {
    const u = await seedUser();
    const pay = await mkPayment(u);
    const spies = (['info', 'warn', 'error', 'debug'] as const).map((l) =>
      jest.spyOn(logger, l).mockImplementation((() => logger) as never),
    );
    await post(u, String(pay._id), { reason: 'other', note: NOTE });
    const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(logged).not.toContain('4111');
    expect(logged).not.toContain('9876543210');
  });

  it('accepts every signed reason; note optional except for other; trims', async () => {
    const u = await seedUser();
    for (const reason of ['charged_no_ink', 'charged_twice', 'wrong_amount', 'refund_request']) {
      const pay = await mkPayment(u);
      const res = await post(u, String(pay._id), { reason });
      expect(res.status).toBe(201);
    }
    const pay = await mkPayment(u);
    const res = await post(u, String(pay._id), { reason: 'other', note: '  hi  ' });
    expect(res.status).toBe(201);
    expect((await PaymentConcern.findById(res.body.concern.id).lean())!.note).toBe('hi');
  });

  it('a failed enqueue never fails the request; the concern is stored, markers stay null', async () => {
    const u = await seedUser();
    const pay = await mkPayment(u);
    (enqueueEmail as jest.Mock).mockRejectedValue(new Error('queue down'));
    const res = await post(u, String(pay._id), { reason: 'charged_no_ink' });
    expect(res.status).toBe(201);
    const row = await PaymentConcern.findById(res.body.concern.id).lean();
    expect(row!.ackQueuedAt).toBeNull();
    expect(row!.notifyQueuedAt).toBeNull();
  });

  it('with REDIS_URL unset the concern is stored but nothing is queued', async () => {
    (env as unknown as Record<string, unknown>).REDIS_URL = undefined;
    const u = await seedUser();
    const pay = await mkPayment(u);
    const res = await post(u, String(pay._id), { reason: 'charged_no_ink' });
    expect(res.status).toBe(201);
    expect(enqueueEmail).not.toHaveBeenCalled();
  });
});

describe('POST /payments/:id/concerns - 404', () => {
  it("another user's payment -> 404, nothing stored or queued", async () => {
    const owner = await seedUser();
    const other = await seedUser();
    const pay = await mkPayment(owner);
    const res = await post(other, String(pay._id), { reason: 'charged_no_ink' });
    expect(res.status).toBe(404);
    expect(await PaymentConcern.countDocuments({})).toBe(0);
    expect(enqueueEmail).not.toHaveBeenCalled();
  });

  it('unknown id -> 404', async () => {
    const u = await seedUser();
    const res = await post(u, String(new mongoose.Types.ObjectId()), { reason: 'charged_no_ink' });
    expect(res.status).toBe(404);
  });

  it.each(['abc', '123', 'zzzzzzzzzzzzzzzzzzzzzzzz', '12345678901234567890123', '$ne'])(
    'malformed id %s -> 404',
    async (id) => {
      const u = await seedUser();
      const res = await post(u, id, { reason: 'charged_no_ink' });
      expect(res.status).toBe(404);
    },
  );

  it('an order-only (created) payment -> 404', async () => {
    const u = await seedUser();
    const pay = await mkPayment(u, { status: 'created' });
    expect((await post(u, String(pay._id), { reason: 'charged_no_ink' })).status).toBe(404);
  });

  it('needs the internal headers -> 401', async () => {
    const res = await request(app)
      .post(`/payments/${new mongoose.Types.ObjectId()}/concerns`)
      .send({ reason: 'other', note: 'x' });
    expect(res.status).toBe(401);
  });
});

describe('POST /payments/:id/concerns - 400', () => {
  it.each([
    ['no body', undefined],
    ['array body', []],
    ['missing reason', { note: 'x' }],
    ['unknown reason', { reason: 'bogus' }],
    ['numeric reason', { reason: 1 }],
    ['other without note', { reason: 'other' }],
    ['other with blank note', { reason: 'other', note: '   ' }],
    ['note not a string', { reason: 'charged_no_ink', note: 5 }],
    ['note over 500', { reason: 'charged_no_ink', note: 'a'.repeat(501) }],
  ])('%s -> 400 invalid_concern, nothing stored', async (_n, body) => {
    const u = await seedUser();
    const pay = await mkPayment(u);
    const res = await post(u, String(pay._id), body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_concern' });
    expect(await PaymentConcern.countDocuments({})).toBe(0);
  });

  it('a note of exactly 500 characters is accepted', async () => {
    const u = await seedUser();
    const pay = await mkPayment(u);
    const res = await post(u, String(pay._id), { reason: 'other', note: 'a'.repeat(500) });
    expect(res.status).toBe(201);
  });
});

describe('POST /payments/:id/concerns - 409', () => {
  it('a second concern while one is open -> 409 concern_open', async () => {
    const u = await seedUser();
    const pay = await mkPayment(u);
    expect((await post(u, String(pay._id), { reason: 'charged_no_ink' })).status).toBe(201);
    const second = await post(u, String(pay._id), { reason: 'wrong_amount' });
    expect(second.status).toBe(409);
    expect(second.body).toEqual({ error: 'concern_open' });
    expect(await PaymentConcern.countDocuments({})).toBe(1);
    expect(enqueueEmail).toHaveBeenCalledTimes(2); // from the first only
  });

  it('a concurrent pair yields one 201 and one 409', async () => {
    const u = await seedUser();
    const pay = await mkPayment(u);
    await PaymentConcern.init();
    const rs = await Promise.all([
      post(u, String(pay._id), { reason: 'charged_no_ink' }),
      post(u, String(pay._id), { reason: 'charged_no_ink' }),
    ]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await PaymentConcern.countDocuments({})).toBe(1);
  });

  it('after the concern is resolved (openKey cleared) a new one is allowed', async () => {
    const u = await seedUser();
    const pay = await mkPayment(u);
    const first = await post(u, String(pay._id), { reason: 'charged_no_ink' });
    await PaymentConcern.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(first.body.concern.id) },
      { $set: { status: 'resolved' }, $unset: { openKey: '' } },
    );
    expect((await post(u, String(pay._id), { reason: 'wrong_amount' })).status).toBe(201);
  });
});

describe('POST /payments/:id/concerns - rate limits (Arjun 7)', () => {
  it('per user: the 6th concern in 24h -> 429 rate_limited + Retry-After, nothing stored', async () => {
    const u = await seedUser();
    for (let i = 0; i < 5; i += 1) {
      const pay = await mkPayment(u);
      expect((await post(u, String(pay._id), { reason: 'charged_no_ink' })).status).toBe(201);
    }
    const pay = await mkPayment(u);
    const res = await post(u, String(pay._id), { reason: 'charged_no_ink' });
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('rate_limited');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(res.headers['retry-after'])).toBeLessThanOrEqual(24 * 3600);
    expect(await PaymentConcern.countDocuments({})).toBe(5);
    expect(redis.ttl.get(concernUserKey(String(u)))).toBe(24 * 60 * 60 * 1000);
  });

  it('per user: a 409 or 404 does not use up the user quota', async () => {
    const u = await seedUser();
    const pay = await mkPayment(u);
    await post(u, String(pay._id), { reason: 'charged_no_ink' }); // uses 1
    await post(u, String(pay._id), { reason: 'charged_no_ink' }); // 409
    await post(u, String(new mongoose.Types.ObjectId()), { reason: 'charged_no_ink' }); // 404
    expect(redis.store.get(concernUserKey(String(u)))).toBe(1);
  });

  it('per user: another user is unaffected', async () => {
    const a = await seedUser();
    const b = await seedUser();
    redis.store.set(concernUserKey(String(a)), 5);
    redis.ttl.set(concernUserKey(String(a)), 1000);
    const pa = await mkPayment(a);
    const pb = await mkPayment(b);
    expect((await post(a, String(pa._id), { reason: 'charged_no_ink' })).status).toBe(429);
    expect((await post(b, String(pb._id), { reason: 'charged_no_ink' })).status).toBe(201);
  });

  it('per IP: the 21st POST in an hour -> 429, key is the sha256 of the (last X-Forwarded-For) address', async () => {
    const u = await seedUser();
    const pay = await mkPayment(u);
    const xff = { 'x-forwarded-for': '1.1.1.1, 203.0.113.9' };
    // Bad bodies are refused before the IP is counted, so seed 20 hits directly.
    const key = concernIpKey('203.0.113.9');
    expect(key).toBe(
      `billing:concern:ip:${crypto.createHash('sha256').update('203.0.113.9').digest('hex')}`,
    );
    expect(key).not.toContain('203.0.113.9');
    redis.store.set(key, 20);
    redis.ttl.set(key, 90_000);
    const res = await post(u, String(pay._id), { reason: 'charged_no_ink' }, xff);
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('rate_limited');
    expect(res.headers['retry-after']).toBe('90');
    expect(await PaymentConcern.countDocuments({})).toBe(0);
    // Only hashed keys in Redis, never the raw address.
    expect([...redis.store.keys()].some((k) => k.includes('203.0.113.9'))).toBe(false);
  });

  it('per IP: 20 valid-body POSTs are allowed, the 21st is not', async () => {
    const u = await seedUser();
    const pay = await mkPayment(u);
    const xff = { 'x-forwarded-for': '198.51.100.7' };
    // First creates (201), the next 19 are 409s that still count against the IP.
    const statuses: number[] = [];
    for (let i = 0; i < 21; i += 1) {
      statuses.push((await post(u, String(pay._id), { reason: 'charged_no_ink' }, xff)).status);
    }
    expect(statuses[0]).toBe(201);
    expect(statuses.slice(1, 20).every((s) => s === 409)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});

describe('POST /payments/:id/concerns - Redis down (fail closed)', () => {
  it('Redis error -> 503 and nothing stored or queued', async () => {
    const u = await seedUser();
    const pay = await mkPayment(u);
    redis.fail = true;
    const res = await post(u, String(pay._id), { reason: 'charged_no_ink', note: NOTE });
    expect(res.status).toBe(503);
    expect(await PaymentConcern.countDocuments({})).toBe(0);
    expect(enqueueEmail).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toContain('4111');
  });

  it('REDIS_URL unset and no client -> 503 and nothing stored', async () => {
    setConcernRateLimitRedis(null);
    (env as unknown as Record<string, unknown>).REDIS_URL = undefined;
    const u = await seedUser();
    const pay = await mkPayment(u);
    const res = await post(u, String(pay._id), { reason: 'charged_no_ink' });
    expect(res.status).toBe(503);
    expect(await PaymentConcern.countDocuments({})).toBe(0);
  });

  it('the per-user count failing after the IP count still stores nothing', async () => {
    const u = await seedUser();
    const pay = await mkPayment(u);
    let n = 0;
    const real = redis.incr.bind(redis);
    redis.incr = async (k: string) => {
      n += 1;
      if (n === 2) throw new Error('redis down');
      return real(k);
    };
    const res = await post(u, String(pay._id), { reason: 'charged_no_ink' });
    expect(res.status).toBe(503);
    expect(await PaymentConcern.countDocuments({})).toBe(0);
  });
});

describe('GET /internal/payment-concerns/:id/email-view', () => {
  const view = (id: string, secret: string | null = INTERNAL_SECRET) =>
    request(app)
      .get(`/internal/payment-concerns/${id}/email-view`)
      .set(secret === null ? {} : { 'x-internal-secret': secret });

  async function mkConcern() {
    const u = await seedUser({ name: 'Asha Verma' });
    const pay = await mkPayment(u, { razorpayPaymentId: 'pay_ViewTest123' });
    const res = await post(u, String(pay._id), { reason: 'refund_request', note: NOTE });
    return { u, pay, concernId: res.body.concern.id as string, ref: res.body.concern.reference };
  }

  it('401 without the secret, 400 on a bad id, 404 when unknown', async () => {
    expect((await view('507f1f77bcf86cd799439011', null)).status).toBe(401);
    expect((await view('507f1f77bcf86cd799439011', 'wrong-secret-value-xx')).status).toBe(401);
    expect((await view('nope')).status).toBe(400);
    expect((await view('507f1f77bcf86cd799439011')).status).toBe(404);
  });

  it('200 with ids, reference, reason code, name, masked email, links; never the note', async () => {
    const { u, pay, concernId, ref } = await mkConcern();
    const res = await view(concernId);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({
      concernId,
      userId: String(u),
      paymentId: String(pay._id),
      razorpayPaymentId: 'pay_ViewTest123',
      reference: ref,
      reason: 'refund_request',
      name: 'Asha Verma',
      notifyTo: env.SUPPORT_NOTIFY_EMAIL,
      adminUrl: 'https://dashboard.razorpay.com/app/payments/pay_ViewTest123',
    });
    expect(res.body.paymentUrl).toContain(`/dashboard/settings?tab=billing#payment-${pay._id}`);
    expect(res.body.maskedEmail).toMatch(/^[^*]\*\*\*@example\.com$/);
    expect(res.body.email).toMatch(/@example\.com$/);
    expect(res.body).not.toHaveProperty('note');
    expect(JSON.stringify(res.body)).not.toContain('4111');
  });

  it('defaults the support address to contact@lawie.in', () => {
    expect(env.SUPPORT_NOTIFY_EMAIL).toBe('contact@lawie.in');
  });

  it('410 when the user is erased', async () => {
    const { concernId } = await mkConcern();
    const invoiceEmail = await import('../services/invoice-email.service');
    jest.spyOn(invoiceEmail, 'isErasedUser').mockResolvedValue(true);
    expect((await view(concernId)).status).toBe(410);
  });
});

describe('account erase (Arjun 5)', () => {
  it('unsets the concern note, keeps the row; dry run counts without changing', async () => {
    const u = await seedUser();
    const pay = await mkPayment(u);
    const res = await post(u, String(pay._id), { reason: 'charged_no_ink', note: NOTE });
    const id = res.body.concern.id;

    const dry = await eraseBillingAccount({ userId: String(u), dryRun: true });
    expect(dry.counts.paymentconcerns).toBe(1);
    expect((await PaymentConcern.findById(id).lean())!.note).toBe(NOTE);

    const done = await eraseBillingAccount({ userId: String(u), dryRun: false });
    expect(done.ok).toBe(true);
    expect(done.counts.paymentconcerns).toBe(1);
    const row = await PaymentConcern.collection.findOne({ _id: new mongoose.Types.ObjectId(id) });
    expect(row).not.toBeNull();
    expect(row).not.toHaveProperty('note');
    expect(row!.reference).toBe(res.body.concern.reference);
    expect(await Payment.countDocuments({ userId: u })).toBe(1); // payments kept
  });

  it("does not touch another user's concern note", async () => {
    const a = await seedUser();
    const b = await seedUser();
    const pb = await mkPayment(b);
    const res = await post(b, String(pb._id), { reason: 'other', note: 'keep me' });
    await eraseBillingAccount({ userId: String(a), dryRun: false });
    expect((await PaymentConcern.findById(res.body.concern.id).lean())!.note).toBe('keep me');
  });
});

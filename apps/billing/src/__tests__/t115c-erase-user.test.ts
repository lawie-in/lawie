/**
 * T-115c — billing POST /internal/erase-user and GET /internal/subscription-status/:userId.
 * Ajay: couponusages deleted; inkledger usage rows deleted; admin_grant / referral_bonus rows
 * keep only type, amount and date; creditledgers draft_spent loses its reference; payments and
 * subscriptions are kept. Arjun ruling 4: blocking statuses, unknown statuses block.
 */
import './setupDb';

import mongoose, { Types } from 'mongoose';
import request from 'supertest';

import app from '../app';
import {
  INK_SCRUB_REASONS,
  INK_USAGE_REASONS,
  SUBSCRIPTION_CLOSE_GATE,
  eraseBillingAccount,
} from '../services/account-erase.service';

const SECRET = process.env.INTERNAL_SECRET as string;
const EMAIL = 'billing.person@example.com';
const NAME = 'Billing Person';
const CODE = 'REFCODE77';

const db = () => mongoose.connection.db!;
const uid = new Types.ObjectId();
const other = new Types.ObjectId();
const id = uid.toString();

const erase = (body: unknown, secret: string | null = SECRET) => {
  const r = request(app).post('/internal/erase-user');
  if (secret !== null) r.set('x-internal-secret', secret);
  return r.send(body as object);
};
const status = (userId: string, secret: string | null = SECRET) => {
  const r = request(app).get(`/internal/subscription-status/${userId}`);
  if (secret !== null) r.set('x-internal-secret', secret);
  return r;
};

async function seed() {
  const when = new Date('2026-09-01T10:00:00Z');
  const row = (userId: Types.ObjectId, reason: string, extra: Record<string, unknown> = {}) => ({
    userId,
    reason,
    delta: 5,
    bucket: 'inkTopup',
    balanceAfter: 10,
    createdAt: when,
    ...extra,
  });
  await db()
    .collection('inkledger')
    .insertMany([
      row(uid, 'generate', { reference: 'Bail u/s 437 for Ravi', metadata: { title: NAME } }),
      row(uid, 'regenerate', { reference: 'Bail again' }),
      row(uid, 'topup_purchase', { reference: 'pay_123', metadata: { orderId: 'order_9' } }),
      row(uid, 'sub_renewal', { reference: 'sub_1' }),
      row(uid, 'free_seed'),
      row(uid, 'admin_grant', { reference: `Gift for ${NAME}`, metadata: { note: EMAIL } }),
      row(uid, 'referral_bonus', {
        reference: CODE,
        metadata: { referralCode: CODE, bonusInk: 3 },
      }),
      row(uid, 'some_future_reason', { reference: 'keep me' }),
      row(other, 'generate', { reference: 'other user draft' }),
      row(other, 'admin_grant', { reference: 'other note', metadata: { note: 'x' } }),
    ]);
  await db()
    .collection('creditledgers')
    .insertMany([
      {
        userId: uid,
        source: 'draft_spent',
        amount: -1,
        reference: 'Bail u/s 437',
        createdAt: when,
      },
      { userId: uid, source: 'signup_bonus', amount: 3, reference: 'keepme', createdAt: when },
      {
        userId: other,
        source: 'draft_spent',
        amount: -1,
        reference: 'other title',
        createdAt: when,
      },
    ]);
  const coupon = new Types.ObjectId();
  await db()
    .collection('couponusages')
    .insertMany([
      { couponId: coupon, userId: uid, createdAt: when },
      { couponId: coupon, userId: uid, createdAt: when },
      { couponId: coupon, userId: other, createdAt: when },
    ]);
  await db().collection('subscriptions').insertOne({
    userId: uid,
    status: 'cancelled',
    razorpaySubscriptionId: 'sub_1',
    createdAt: when,
  });
}

describe('constants', () => {
  it('usage and scrub reasons are the signed lists', () => {
    expect([...INK_USAGE_REASONS]).toEqual(['generate', 'regenerate']);
    expect([...INK_SCRUB_REASONS]).toEqual(['admin_grant', 'referral_bonus']);
  });
  it('the close gate lists', () => {
    expect([...SUBSCRIPTION_CLOSE_GATE.blocking]).toEqual([
      'active',
      'authenticated',
      'pending',
      'halted',
      'paused',
    ]);
    expect([...SUBSCRIPTION_CLOSE_GATE.allowed]).toEqual([
      'created',
      'cancelled',
      'completed',
      'expired',
      'none',
    ]);
  });
});

describe('POST /internal/erase-user — guards', () => {
  it.each([
    ['no secret', null],
    ['wrong secret', 'x'.repeat(SECRET.length)],
    ['empty secret', ''],
    ['a prefix of the secret', SECRET.slice(0, -1)],
    ['the secret with extra', `${SECRET}x`],
  ])('401 with %s, and nothing is touched', async (_n, secret) => {
    await seed();
    const res = await erase({ userId: id }, secret);
    expect(res.status).toBe(401);
    expect(await db().collection('couponusages').countDocuments({ userId: uid })).toBe(2);
    expect(await db().collection('inkledger').countDocuments({ userId: uid })).toBe(8);
  });

  it.each([
    ['no body', {}],
    ['no userId', { dryRun: true }],
    ['numeric userId', { userId: 5 }],
    ['malformed userId', { userId: 'abc' }],
    ['object userId', { userId: { $ne: null } }],
  ])('400 for %s', async (_n, body) => {
    expect((await erase(body)).status).toBe(400);
  });

  it.each(['true', 'false', 1, 0, null, 'yes'])(
    '400 when dryRun is %p (never read as false), and nothing is erased',
    async (dryRun) => {
      await seed();
      const res = await erase({ userId: id, dryRun });
      expect(res.status).toBe(400);
      expect(await db().collection('couponusages').countDocuments({ userId: uid })).toBe(2);
    },
  );
});

describe('POST /internal/erase-user — erase', () => {
  it('deletes usage and coupon rows; scrubs grants; keeps payments; counts match', async () => {
    await seed();
    const res = await erase({ userId: id });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      dryRun: false,
      counts: { couponusages: 2, inkledger: 2, inkledger_scrubbed: 2, creditledgers: 1 },
    });
    expect(res.headers['cache-control']).toBe('no-store');

    const ink = await db().collection('inkledger').find({ userId: uid }).toArray();
    expect(ink.map((r) => r.reason).sort()).toEqual([
      'admin_grant',
      'free_seed',
      'referral_bonus',
      'some_future_reason',
      'sub_renewal',
      'topup_purchase',
    ]);
    for (const r of ink.filter((x) => INK_SCRUB_REASONS.includes(x.reason))) {
      expect(r).not.toHaveProperty('reference');
      expect(r).not.toHaveProperty('metadata');
      expect(r.delta).toBe(5);
      expect(r.createdAt).toEqual(new Date('2026-09-01T10:00:00Z'));
    }
    // Payment rows and unknown reasons keep their references.
    expect(ink.find((r) => r.reason === 'topup_purchase')).toMatchObject({
      reference: 'pay_123',
      metadata: { orderId: 'order_9' },
    });
    expect(ink.find((r) => r.reason === 'some_future_reason')!.reference).toBe('keep me');

    const credits = await db().collection('creditledgers').find({ userId: uid }).toArray();
    expect(credits).toHaveLength(2);
    expect(credits.find((c) => c.source === 'draft_spent')).not.toHaveProperty('reference');
    expect(credits.find((c) => c.source === 'signup_bonus')!.reference).toBe('keepme');

    expect(await db().collection('couponusages').countDocuments({ userId: uid })).toBe(0);
    expect(await db().collection('subscriptions').countDocuments({ userId: uid })).toBe(1);

    // Another user is untouched.
    expect(await db().collection('couponusages').countDocuments({ userId: other })).toBe(1);
    expect(await db().collection('inkledger').countDocuments({ userId: other })).toBe(2);
    expect(
      (await db().collection('inkledger').findOne({ userId: other, reason: 'admin_grant' }))!
        .reference,
    ).toBe('other note');
    expect((await db().collection('creditledgers').findOne({ userId: other }))!.reference).toBe(
      'other title',
    );
  });

  it('Ajay: after erasure nothing under that userId holds the email, name or referral code', async () => {
    await seed();
    await erase({ userId: id });
    for (const c of await db().collections()) {
      for (const doc of await c.find({ userId: uid }).toArray()) {
        const txt = JSON.stringify(doc);
        for (const needle of [EMAIL, NAME, CODE, 'Bail', 'Ravi']) {
          expect({ c: c.collectionName, leaks: txt.includes(needle) }).toMatchObject({
            leaks: false,
          });
        }
      }
    }
  });

  it('is idempotent: a second run returns zero counts and changes nothing', async () => {
    await seed();
    await erase({ userId: id });
    const snapshot = JSON.stringify(
      await db().collection('inkledger').find({ userId: uid }).toArray(),
    );
    const res = await erase({ userId: id });
    expect(res.status).toBe(200);
    expect(res.body.counts).toEqual({
      couponusages: 0,
      inkledger: 0,
      inkledger_scrubbed: 0,
      creditledgers: 0,
    });
    expect(JSON.stringify(await db().collection('inkledger').find({ userId: uid }).toArray())).toBe(
      snapshot,
    );
  });

  it('a user with nothing is 200 with zero counts', async () => {
    const res = await erase({ userId: new Types.ObjectId().toString() });
    expect(res.status).toBe(200);
    expect(Object.values(res.body.counts).every((n) => n === 0)).toBe(true);
  });

  it('dryRun:true returns the same counts and changes nothing', async () => {
    await seed();
    const before = JSON.stringify([
      await db().collection('inkledger').find({}).sort({ _id: 1 }).toArray(),
      await db().collection('creditledgers').find({}).sort({ _id: 1 }).toArray(),
      await db().collection('couponusages').find({}).sort({ _id: 1 }).toArray(),
    ]);
    const res = await erase({ userId: id, dryRun: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      dryRun: true,
      counts: { couponusages: 2, inkledger: 2, inkledger_scrubbed: 2, creditledgers: 1 },
    });
    const after = JSON.stringify([
      await db().collection('inkledger').find({}).sort({ _id: 1 }).toArray(),
      await db().collection('creditledgers').find({}).sort({ _id: 1 }).toArray(),
      await db().collection('couponusages').find({}).sort({ _id: 1 }).toArray(),
    ]);
    expect(after).toBe(before);
  });

  it('a failing step answers 500 with failedAt and the counts so far; a retry finishes', async () => {
    await seed();
    const spy = jest
      .spyOn(mongoose.Collection.prototype, 'deleteMany')
      .mockRejectedValueOnce(new Error('mongo hiccup'));
    const res = await erase({ userId: id });
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ ok: false, error: 'erase_failed' });
    expect(typeof res.body.failedAt).toBe('string');
    const retry = await erase({ userId: id });
    expect(retry.status).toBe(200);
    expect(await db().collection('couponusages').countDocuments({ userId: uid })).toBe(0);
    expect(
      await db().collection('inkledger').countDocuments({ userId: uid, reason: 'generate' }),
    ).toBe(0);
  });

  it('the service logs and returns ok:false rather than throwing', async () => {
    const r = await eraseBillingAccount({ userId: 'not-an-id' });
    expect(r.ok).toBe(false);
  });
});

describe('GET /internal/subscription-status/:userId', () => {
  const sub = (userId: Types.ObjectId, st: unknown, createdAt = new Date()) =>
    db().collection('subscriptions').insertOne({
      userId,
      status: st,
      createdAt,
      razorpaySubscriptionId: new Types.ObjectId().toString(),
    });

  it('401 without or with a wrong secret; 400 for a bad id', async () => {
    expect((await status(id, null)).status).toBe(401);
    expect((await status(id, 'nope')).status).toBe(401);
    expect((await status('not-an-id')).status).toBe(400);
  });

  it('no subscription: active false, status none', async () => {
    const res = await status(id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ active: false, status: 'none' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it.each(['active', 'authenticated', 'pending', 'halted', 'paused'])('%s blocks', async (st) => {
    await sub(uid, st);
    expect((await status(id)).body).toEqual({ active: true, status: st });
  });

  it.each(['created', 'cancelled', 'completed', 'expired'])('%s does not block', async (st) => {
    await sub(uid, st);
    expect((await status(id)).body).toEqual({ active: false, status: st });
  });

  it.each(['some_new_razorpay_status', '', 'ACTIVE', null, 7])(
    'an unknown status %p blocks (fail closed)',
    async (st) => {
      await sub(uid, st);
      const res = await status(id);
      expect(res.status).toBe(200);
      expect(res.body.active).toBe(true);
    },
  );

  it('a blocking subscription wins over a newer allowed one', async () => {
    await sub(uid, 'halted', new Date('2026-01-01'));
    await sub(uid, 'cancelled', new Date('2026-06-01'));
    expect((await status(id)).body).toEqual({ active: true, status: 'halted' });
  });

  it('several allowed ones report the latest status', async () => {
    await sub(uid, 'expired', new Date('2026-01-01'));
    await sub(uid, 'cancelled', new Date('2026-06-01'));
    expect((await status(id)).body).toEqual({ active: false, status: 'cancelled' });
  });

  it("another user's subscription does not count", async () => {
    await sub(other, 'active');
    expect((await status(id)).body).toEqual({ active: false, status: 'none' });
  });

  it('500 status_unavailable if the read fails', async () => {
    const spy = jest.spyOn(db(), 'collection').mockImplementation(() => {
      throw new Error('mongo down');
    });
    const res = await status(id);
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'status_unavailable' });
  });
});

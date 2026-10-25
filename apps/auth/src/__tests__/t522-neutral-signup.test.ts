/**
 * T-522 (Arjun rulings 1-4, 22 Oct 2026 + open points (a)-(c)) - POST /register is neutral.
 *
 *  - a new and an existing address get the identical 202, body, headers, and both take >= 500 ms
 *    (timings are not compared with each other)
 *  - no tokens, no session, no cookie; referralApplied is gone
 *  - 422 validation comes first, before any lookup or count, for a new and an existing address
 *  - E11000 on the email index is the existing-address outcome, with no Sentry event
 *  - an existing address gets one auth.signupAttempt job (userId only) at most once an hour (NX
 *    key); a store failure on that key sends nothing
 *  - IP 20/h and email-hash 5/h -> 429 rate_limited + Retry-After; counted BEFORE the lookup;
 *    a store failure -> 503
 */
import './setupEnv';

jest.mock('ioredis', () => jest.requireActual('ioredis-mock'));

jest.mock('@lawie/email-client', () => ({
  enqueueEmail: jest.fn(),
}));

jest.mock('@sentry/node', () => ({
  ...jest.requireActual('@sentry/node'),
  captureException: jest.fn(),
}));

import './setupDb';

import { enqueueEmail } from '@lawie/email-client';
import * as Sentry from '@sentry/node';
import bcrypt from 'bcryptjs';
import supertest from 'supertest';

import app from '../app';
import logger from '../config/logger';
import redis from '../config/redis';
import { Session } from '../models/Session.model';
import { User } from '../models/User.model';
import {
  SIGNUP_EMAIL_CAP,
  SIGNUP_IP_CAP,
  signupAttemptMailKey,
  signupEmailKey,
  signupIpKey,
} from '../services/signup-rate-limit';

import { makeCode, rawUsers, waitFor } from './t234-helpers';

// Each sign-up is padded to 500 ms and hashes with bcrypt cost 12; allow for a loaded machine.
jest.setTimeout(30_000);

const enqueueMock = enqueueEmail as unknown as jest.Mock;
const PASSWORD = 'Passw0rdOk';
const FLOOR_MS = 500;
// The signed neutral body (Arjun open point (a)): HTTP 202, auth's standard wrapper.
const NEUTRAL_BODY = { status: 'success', data: { status: 'check_email' } };

const reg = (email: string, extra: Record<string, unknown> = {}, ip = '203.0.113.9') =>
  supertest(app)
    .post('/register')
    .set('X-Forwarded-For', ip)
    .send({ email, password: PASSWORD, name: 'Neutral Person', ...extra });

/** Headers that must match; Date and Content-Length vary by nature (the body is compared too). */
function comparableHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...headers };
  delete rest.date;
  return rest;
}

beforeEach(async () => {
  await redis.flushall();
  enqueueMock.mockReset();
  enqueueMock.mockResolvedValue({ jobId: 'j1', queue: 'email-high', deduped: false });
  (Sentry.captureException as jest.Mock).mockClear();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
  jest.spyOn(logger, 'info').mockImplementation(() => undefined);
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

async function existingUser(email = 'taken@example.com') {
  return User.create({ email, name: 'Already Here', password: PASSWORD });
}

describe('T-522 neutral register: the same answer for a new and an existing address', () => {
  it('both give 202 with the identical body and identical headers', async () => {
    await existingUser('taken@example.com');
    const fresh = await reg('brand-new@example.com');
    const taken = await reg('taken@example.com');

    expect(fresh.status).toBe(202);
    expect(taken.status).toBe(202);
    expect(fresh.body).toEqual(NEUTRAL_BODY);
    expect(taken.body).toEqual(NEUTRAL_BODY);
    expect(fresh.text).toBe(taken.text);
    expect(fresh.headers['cache-control']).toBe('no-store');
    expect(taken.headers['cache-control']).toBe('no-store');
    expect(fresh.headers['set-cookie']).toBeUndefined();
    expect(taken.headers['set-cookie']).toBeUndefined();
    expect(comparableHeaders(fresh.headers)).toEqual(comparableHeaders(taken.headers));
  });

  it('both take at least 500 ms (timings are not compared with each other)', async () => {
    await existingUser('taken@example.com');
    const t0 = Date.now();
    const fresh = await reg('brand-new@example.com');
    const freshMs = Date.now() - t0;
    const t1 = Date.now();
    const taken = await reg('taken@example.com');
    const takenMs = Date.now() - t1;

    expect(fresh.status).toBe(202);
    expect(taken.status).toBe(202);
    expect(freshMs).toBeGreaterThanOrEqual(FLOOR_MS);
    expect(takenMs).toBeGreaterThanOrEqual(FLOOR_MS);
  });

  it('the existing address runs one bcrypt cost-12 hash (the dummy), like the new address does', async () => {
    await existingUser('taken@example.com');
    const hashSpy = jest.spyOn(bcrypt, 'hash');
    const res = await reg('taken@example.com');
    expect(res.status).toBe(202);
    expect(hashSpy).toHaveBeenCalledWith(PASSWORD, 12);
  });

  it('the new address is created unverified, with no tokens, no session, no cookie', async () => {
    const res = await reg('brand-new@example.com');
    expect(res.status).toBe(202);
    expect(JSON.stringify(res.body)).not.toMatch(/accessToken|refreshToken|token|user|id/i);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.headers['authorization']).toBeUndefined();

    const u = await rawUsers().findOne({ email: 'brand-new@example.com' });
    expect(u).not.toBeNull();
    expect(u!.emailVerified).toBe(false);
    expect(await Session.countDocuments({ userId: u!._id })).toBe(0);
  });

  it('the existing address creates nothing and changes nothing on the account', async () => {
    const before = await existingUser('taken@example.com');
    const res = await reg('taken@example.com', { name: 'Someone Else' });
    expect(res.status).toBe(202);
    expect(await User.countDocuments({ email: 'taken@example.com' })).toBe(1);
    const after = await User.findById(before._id).lean();
    expect(after!.name).toBe('Already Here');
  });

  it('the address is matched case-insensitively (an existing address in other case is existing)', async () => {
    await existingUser('taken@example.com');
    const res = await reg('TAKEN@Example.com');
    expect(res.status).toBe(202);
    expect(res.body).toEqual(NEUTRAL_BODY);
    expect(await User.countDocuments({})).toBe(1);
  });

  it('referralApplied is absent, with a valid code, an invalid code, and on an existing address', async () => {
    await makeCode({ code: 'NEUTRAL01', bonusInk: 3 });
    await existingUser('taken@example.com');
    const valid = await reg('ref-new@example.com', { referralCode: 'NEUTRAL01' });
    const invalid = await reg('ref-new2@example.com', { referralCode: 'NOSUCHCODE' });
    const onTaken = await reg('taken@example.com', { referralCode: 'NEUTRAL01' });
    for (const res of [valid, invalid, onTaken]) {
      expect(res.status).toBe(202);
      expect(res.body).toEqual(NEUTRAL_BODY);
      expect(res.text).not.toContain('referral');
    }
  });

  it('the new address queues the verify mail, userId only', async () => {
    const res = await reg('brand-new@example.com');
    expect(res.status).toBe(202);
    await waitFor(async () => enqueueMock.mock.calls.length === 1);
    const u = await User.findOne({ email: 'brand-new@example.com' }).lean();
    expect(enqueueMock).toHaveBeenCalledWith({
      template: 'auth.verifyEmail',
      userId: String(u!._id),
    });
  });
});

describe('T-522 neutral register: 422 comes before any lookup or count', () => {
  const BAD = [
    ['a weak password', { email: 'x@example.com', password: 'weak', name: 'N' }],
    ['a bad email', { email: 'not-an-email', password: PASSWORD, name: 'N' }],
    ['a missing name', { email: 'x@example.com', password: PASSWORD }],
  ] as const;

  it.each(BAD)(
    '%s: 422 for a new address, nothing counted, nothing looked up',
    async (_n, body) => {
      const findOne = jest.spyOn(User, 'findOne');
      const incr = jest.spyOn(redis, 'incr');
      const res = await supertest(app).post('/register').send(body);
      expect(res.status).toBe(422);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(findOne).not.toHaveBeenCalled();
      expect(incr).not.toHaveBeenCalled();
      expect(await redis.keys('auth:signup*')).toEqual([]);
      expect(enqueueMock).not.toHaveBeenCalled();
    },
  );

  it('the same weak password for an EXISTING address is also 422 (not the neutral 202), nothing sent', async () => {
    await existingUser('taken@example.com');
    const findOne = jest.spyOn(User, 'findOne');
    const res = await supertest(app)
      .post('/register')
      .send({ email: 'taken@example.com', password: 'weak', name: 'N' });
    expect(res.status).toBe(422);
    expect(findOne).not.toHaveBeenCalled();
    expect(await redis.keys('auth:signup*')).toEqual([]);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('a 422 does not take a rate-limit slot: five bad calls leave the email bucket untouched', async () => {
    for (let i = 0; i < SIGNUP_EMAIL_CAP + 1; i += 1) {
      const res = await supertest(app)
        .post('/register')
        .send({ email: 'same@example.com', password: 'weak', name: 'N' });
      expect(res.status).toBe(422);
    }
    const ok = await reg('same@example.com');
    expect(ok.status).toBe(202);
  });
});

describe('T-522 neutral register: E11000 is the existing-address outcome', () => {
  it('a concurrent create that loses the unique index answers 202, mails once, and sends nothing to Sentry', async () => {
    await User.init();
    const winner = await existingUser('race@example.com');
    // Make the first pre-check miss, so User.create really hits the unique index (E11000).
    jest.spyOn(User, 'findOne').mockReturnValueOnce({ lean: () => Promise.resolve(null) } as never);

    const res = await reg('race@example.com');

    expect(res.status).toBe(202);
    expect(res.body).toEqual(NEUTRAL_BODY);
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(await User.countDocuments({ email: 'race@example.com' })).toBe(1);
    await waitFor(async () => enqueueMock.mock.calls.length === 1);
    expect(enqueueMock).toHaveBeenCalledWith({
      template: 'auth.signupAttempt',
      userId: String(winner._id),
    });
  });

  it('an E11000 on a different key is not swallowed: it is still an error', async () => {
    jest.spyOn(User, 'create').mockRejectedValueOnce(
      Object.assign(new Error('dup'), {
        code: 11000,
        keyPattern: { emailVerifyTokenHash: 1 },
        keyValue: { emailVerifyTokenHash: 'x' },
      }) as never,
    );
    const res = await reg('other-key@example.com');
    expect(res.status).toBe(500);
  });
});

describe('T-522 neutral register: the existing-address mail (AJ-522-M5), at most once an hour', () => {
  it('queues one auth.signupAttempt job with userId only (no address, no name, no link)', async () => {
    const u = await existingUser('taken@example.com');
    const res = await reg('taken@example.com');
    expect(res.status).toBe(202);
    await waitFor(async () => enqueueMock.mock.calls.length === 1);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const arg = enqueueMock.mock.calls[0][0] as Record<string, unknown>;
    expect(arg).toEqual({ template: 'auth.signupAttempt', userId: String(u._id) });
    expect(Object.keys(arg).sort()).toEqual(['template', 'userId']);
    expect(JSON.stringify(arg)).not.toContain('@');
  });

  it('a second and third attempt in the same hour send nothing more (still the same 202)', async () => {
    await existingUser('taken@example.com');
    const first = await reg('taken@example.com');
    const second = await reg('taken@example.com');
    const third = await reg('taken@example.com');
    for (const r of [first, second, third]) {
      expect(r.status).toBe(202);
      expect(r.body).toEqual(NEUTRAL_BODY);
    }
    await waitFor(async () => enqueueMock.mock.calls.length === 1);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });

  it('the hourly key is SET NX EX 3600 and holds the hash of the address, never the address', async () => {
    await existingUser('taken@example.com');
    await reg('taken@example.com');
    const key = signupAttemptMailKey('taken@example.com');
    expect(await redis.get(key)).toBe('1');
    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(3500);
    expect(ttl).toBeLessThanOrEqual(3600);
    for (const k of await redis.keys('auth:*')) {
      expect(k).not.toContain('taken@example.com');
    }
  });

  it('after the key lapses (an hour later) one more mail is sent', async () => {
    await existingUser('taken@example.com');
    await reg('taken@example.com');
    await waitFor(async () => enqueueMock.mock.calls.length === 1);
    await redis.del(signupAttemptMailKey('taken@example.com'));
    await reg('taken@example.com');
    await waitFor(async () => enqueueMock.mock.calls.length === 2);
    expect(enqueueMock).toHaveBeenCalledTimes(2);
  });

  it('a store failure on the NX key sends no mail, and the answer is the same 202', async () => {
    await existingUser('taken@example.com');
    const realSet = redis.set.bind(redis) as (...a: unknown[]) => Promise<unknown>;
    jest.spyOn(redis, 'set').mockImplementation(((key: string, ...rest: unknown[]) => {
      if (String(key).startsWith('auth:signup-attempt:')) return Promise.reject(new Error('boom'));
      return realSet(key, ...rest);
    }) as never);

    const res = await reg('taken@example.com');
    expect(res.status).toBe(202);
    expect(res.body).toEqual(NEUTRAL_BODY);
    await new Promise((r) => setTimeout(r, 100));
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('a failing enqueue does not change the answer', async () => {
    await existingUser('taken@example.com');
    enqueueMock.mockRejectedValue(new Error('queue down'));
    const res = await reg('taken@example.com');
    expect(res.status).toBe(202);
    expect(res.body).toEqual(NEUTRAL_BODY);
  });

  it('no mail goes to a NEW address as a signup attempt', async () => {
    await reg('brand-new@example.com');
    await waitFor(async () => enqueueMock.mock.calls.length >= 1);
    for (const c of enqueueMock.mock.calls) {
      expect((c[0] as { template: string }).template).not.toBe('auth.signupAttempt');
    }
  });
});

describe('T-522 neutral register: rate limits (IP 20/h, email 5/h)', () => {
  const futureTtl = async (key: string, count: number) => {
    await redis.set(key, String(count));
    await redis.pexpire(key, 40 * 60 * 1000);
  };

  it('the 21st request from one IP in the hour is 429 rate_limited with Retry-After', async () => {
    const ip = '198.51.100.7';
    await futureTtl(signupIpKey(ip), SIGNUP_IP_CAP);
    const res = await reg('fresh-one@example.com', {}, ip);
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('rate_limited');
    expect(typeof res.body.retryAfter).toBe('number');
    expect(res.headers['retry-after']).toBe(String(res.body.retryAfter));
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(res.headers['retry-after'])).toBeLessThanOrEqual(3600);
    expect(await User.countDocuments({})).toBe(0);
  });

  it('the 20th request from one IP still passes', async () => {
    const ip = '198.51.100.8';
    await futureTtl(signupIpKey(ip), SIGNUP_IP_CAP - 1);
    const res = await reg('fresh-two@example.com', {}, ip);
    expect(res.status).toBe(202);
  });

  it('the 6th request for one address in the hour is 429, with a different IP each time', async () => {
    const results: number[] = [];
    // sequential would take 6 x 500 ms; the quota is counted before the pad, so run in parallel
    const all = await Promise.all(
      Array.from({ length: SIGNUP_EMAIL_CAP + 1 }, (_v, i) =>
        reg('hammered@example.com', {}, `192.0.2.${i + 1}`),
      ),
    );
    for (const r of all) results.push(r.status);
    expect(results.filter((s) => s === 202)).toHaveLength(SIGNUP_EMAIL_CAP);
    expect(results.filter((s) => s === 429)).toHaveLength(1);
    const limited = all.find((r) => r.status === 429)!;
    expect(limited.body.error).toBe('rate_limited');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('an EXISTING address is limited exactly like a new one (the 429 tells nothing)', async () => {
    await existingUser('taken@example.com');
    await futureTtl(signupEmailKey('taken@example.com'), SIGNUP_EMAIL_CAP);
    await futureTtl(signupEmailKey('new-one@example.com'), SIGNUP_EMAIL_CAP);
    const a = await reg('taken@example.com');
    const b = await reg('new-one@example.com');
    expect(a.status).toBe(429);
    expect(b.status).toBe(429);
    expect(a.body.error).toBe(b.body.error);
    expect(a.headers['retry-after']).toBeDefined();
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(await User.countDocuments({ email: 'new-one@example.com' })).toBe(0);
  });

  it('the email counter is incremented BEFORE the lookup', async () => {
    const incr = jest.spyOn(redis, 'incr');
    const findOne = jest.spyOn(User, 'findOne');
    const res = await reg('order@example.com');
    expect(res.status).toBe(202);
    const emailIncr =
      incr.mock.invocationCallOrder[
        incr.mock.calls.findIndex((c) => c[0] === signupEmailKey('order@example.com'))
      ];
    expect(emailIncr).toBeDefined();
    expect(findOne.mock.invocationCallOrder[0]).toBeGreaterThan(emailIncr);
    expect(await redis.get(signupEmailKey('order@example.com'))).toBe('1');
  });

  it('a limited request is not looked up at all', async () => {
    await futureTtl(signupEmailKey('limited@example.com'), SIGNUP_EMAIL_CAP);
    const findOne = jest.spyOn(User, 'findOne');
    const res = await reg('limited@example.com');
    expect(res.status).toBe(429);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('the keys hold a hash of the address, never the address', async () => {
    await reg('keyed@example.com');
    const keys = await redis.keys('auth:signup:*');
    expect(keys.length).toBe(2);
    for (const k of keys) expect(k).not.toContain('keyed@example.com');
    expect(await redis.get(signupEmailKey('keyed@example.com'))).toBe('1');
  });

  it('a store failure is 503 service_unavailable, with nothing looked up or created', async () => {
    jest.spyOn(redis, 'incr').mockRejectedValue(new Error('redis exploded secret-detail'));
    const findOne = jest.spyOn(User, 'findOne');
    const res = await reg('down@example.com');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'service_unavailable' });
    expect(JSON.stringify(res.body)).not.toContain('secret-detail');
    expect(findOne).not.toHaveBeenCalled();
    expect(await User.countDocuments({})).toBe(0);
    expect(enqueueMock).not.toHaveBeenCalled();
  });
});

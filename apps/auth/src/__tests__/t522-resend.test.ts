/**
 * T-522 (Arjun rulings 2 and 5, 22 Oct 2026) - the two resend routes.
 *
 *  - signed in, POST /verify-email/resend: 1 per 2 min, 5 per day
 *  - public, POST /verify-email/resend-by-email { email }: always the neutral 202 (same body,
 *    headers and >= 500 ms floor as /register). An unknown, verified, Google, password-less,
 *    inactive or closing address gets nothing. An unverified password account gets the verify
 *    mail (userId only; the worker mints the 'signin' link). A per-user cap hit is still 202 with
 *    nothing sent. It shares the sign-up IP (20/h) and email (5/h) buckets: 429 + Retry-After,
 *    503 on a store failure, counted before the lookup.
 */
import './setupEnv';

jest.mock('ioredis', () => jest.requireActual('ioredis-mock'));

jest.mock('@lawie/email-client', () => ({
  enqueueEmail: jest.fn(),
}));

import './setupDb';

import { enqueueEmail } from '@lawie/email-client';
import supertest from 'supertest';

import app from '../app';
import logger from '../config/logger';
import redis from '../config/redis';
import { User } from '../models/User.model';
import {
  SIGNUP_EMAIL_CAP,
  SIGNUP_IP_CAP,
  signupEmailKey,
  signupIpKey,
} from '../services/signup-rate-limit';

import { rawUsers } from './t234-helpers';

const enqueueMock = enqueueEmail as unknown as jest.Mock;
const PASSWORD = 'Passw0rdOk';
const NEUTRAL_BODY = { status: 'success', data: { status: 'check_email' } };

const byEmail = (email: unknown, ip = '203.0.113.50') =>
  supertest(app).post('/verify-email/resend-by-email').set('X-Forwarded-For', ip).send({ email });

beforeEach(async () => {
  await redis.flushall();
  enqueueMock.mockReset();
  enqueueMock.mockResolvedValue({ jobId: 'j1', queue: 'email-high', deduped: false });
  jest.spyOn(logger, 'info').mockImplementation(() => undefined);
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

let n = 0;
async function mk(fields: Record<string, unknown> = {}) {
  n += 1;
  return User.create({
    email: `t522-rs-${n}@example.com`,
    name: 'Resend Person',
    password: PASSWORD,
    ...fields,
  });
}

const sent = () => enqueueMock.mock.calls.map((c) => c[0] as Record<string, unknown>);

describe('T-522 signed-in resend: 1 per 2 min, 5 per day', () => {
  async function tokenFor(email: string) {
    const res = await supertest(app).post('/login').send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    return res.body.data.accessToken as string;
  }
  const resend = (t: string) =>
    supertest(app)
      .post('/verify-email/resend')
      .set({ Authorization: `Bearer ${t}` });

  it('a second request inside 2 minutes is 429 with a wait between 61 s and 120 s', async () => {
    const u = await mk();
    const t = await tokenFor(u.email);
    expect((await resend(t)).status).toBe(202);
    const res = await resend(t);
    expect(res.status).toBe(429);
    expect(res.body.retryAfter).toBeGreaterThan(60);
    expect(res.body.retryAfter).toBeLessThanOrEqual(120);
    expect(Number(res.headers['retry-after'])).toBe(res.body.retryAfter);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });

  it('after the 2 minutes pass the next is allowed; the sixth in a day is 429 with a day-long wait', async () => {
    const u = await mk();
    const t = await tokenFor(u.email);
    for (let i = 0; i < 5; i += 1) {
      expect((await resend(t)).status).toBe(202);
      await redis.del(`auth:verify-email:min:${String(u._id)}`);
    }
    const res = await resend(t);
    expect(res.status).toBe(429);
    expect(res.body.retryAfter).toBeGreaterThan(24 * 3600 - 120);
    expect(enqueueMock).toHaveBeenCalledTimes(5);
  });
});

describe('T-522 review: signed-in resend for an inactive or erasing account', () => {
  const resend = (t: string) =>
    supertest(app)
      .post('/verify-email/resend')
      .set({ Authorization: `Bearer ${t}` });

  it.each([
    ['inactive', { isActive: false }],
    ['erasing', { erasure: { requestedAt: new Date(), stage: 'locked' } }],
  ])('%s: 404, nothing queued, and the cap is not used', async (_name, change) => {
    const u = await mk();
    const login = await supertest(app).post('/login').send({ email: u.email, password: PASSWORD });
    const t = login.body.data.accessToken as string;
    await rawUsers().updateOne({ _id: u._id }, { $set: change });

    const keysBefore = (await redis.keys('auth:verify-email*')).sort();
    for (let i = 0; i < 3; i += 1) {
      expect((await resend(t)).status).toBe(404);
    }
    expect(enqueueMock).not.toHaveBeenCalled();
    expect((await redis.keys('auth:verify-email*')).sort()).toEqual(keysBefore);
  });
});

describe('T-522 resend-by-email: always the neutral 202', () => {
  it('unknown, unverified, verified and Google addresses get the identical status, body and headers', async () => {
    await mk({ email: 'unverified@example.com' });
    await mk({ email: 'verified@example.com', emailVerified: true });
    await mk({
      email: 'google@example.com',
      password: undefined,
      authProvider: 'google',
      googleId: 'g-rs-1',
    });
    const results = [];
    for (const e of [
      'nobody@example.com',
      'unverified@example.com',
      'verified@example.com',
      'google@example.com',
    ]) {
      results.push(await byEmail(e));
    }
    for (const r of results) {
      expect(r.status).toBe(202);
      expect(r.body).toEqual(NEUTRAL_BODY);
      expect(r.text).toBe(results[0].text);
      expect(r.headers['cache-control']).toBe('no-store');
      expect(r.headers['set-cookie']).toBeUndefined();
      const rest = { ...r.headers };
      delete rest.date;
      const rest0 = { ...results[0].headers };
      delete rest0.date;
      expect(rest).toEqual(rest0);
    }
  });

  it('every answer takes at least 500 ms (the floor), found or not', async () => {
    await mk({ email: 'unverified@example.com' });
    for (const e of ['nobody@example.com', 'unverified@example.com']) {
      const t0 = Date.now();
      const r = await byEmail(e);
      expect(r.status).toBe(202);
      expect(Date.now() - t0).toBeGreaterThanOrEqual(500);
    }
  });

  it('an unknown address gets nothing', async () => {
    await byEmail('nobody@example.com');
    await new Promise((r) => setTimeout(r, 50));
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('a verified address gets nothing', async () => {
    await mk({ email: 'verified@example.com', emailVerified: true });
    await byEmail('verified@example.com');
    await new Promise((r) => setTimeout(r, 50));
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('a Google address (authProvider google, or a linked googleId) gets nothing', async () => {
    await mk({ email: 'g1@example.com', password: undefined, authProvider: 'google' });
    await mk({ email: 'g2@example.com', googleId: 'g-linked' });
    await byEmail('g1@example.com');
    await byEmail('g2@example.com');
    await new Promise((r) => setTimeout(r, 50));
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('an inactive, closing (erasure) or password-less unverified account gets nothing', async () => {
    const a = await mk({ email: 'inactive@example.com' });
    await rawUsers().updateOne({ _id: a._id }, { $set: { isActive: false } });
    const b = await mk({ email: 'closing@example.com' });
    await rawUsers().updateOne(
      { _id: b._id },
      { $set: { erasure: { requestedAt: new Date(), stage: 'locked' } } },
    );
    const c = await mk({ email: 'nopass@example.com' });
    await rawUsers().updateOne({ _id: c._id }, { $unset: { password: 1 } });
    for (const e of ['inactive@example.com', 'closing@example.com', 'nopass@example.com']) {
      const r = await byEmail(e);
      expect(r.status).toBe(202);
      expect(r.body).toEqual(NEUTRAL_BODY);
    }
    await new Promise((r) => setTimeout(r, 50));
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('an unverified password account gets the verify mail: one job, userId only (the worker mints the signin link)', async () => {
    const u = await mk({ email: 'unverified@example.com' });
    const r = await byEmail('Unverified@Example.com');
    expect(r.status).toBe(202);
    await new Promise((res) => setTimeout(res, 50));
    expect(sent()).toEqual([{ template: 'auth.verifyEmail', userId: String(u._id) }]);
    expect(JSON.stringify(sent())).not.toContain('@');
  });

  it('the per-user cap: a second request inside 2 minutes is still 202, with nothing more sent', async () => {
    const u = await mk({ email: 'unverified@example.com' });
    const first = await byEmail('unverified@example.com');
    const second = await byEmail('unverified@example.com');
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(second.text).toBe(first.text);
    await new Promise((res) => setTimeout(res, 50));
    expect(sent()).toEqual([{ template: 'auth.verifyEmail', userId: String(u._id) }]);
  });

  it('the day cap (5) is neutral too: the sixth send in a day is 202 and sends nothing', async () => {
    const u = await mk({ email: 'unverified@example.com' });
    await redis.set(`auth:verify-email:day:${String(u._id)}`, '5');
    await redis.pexpire(`auth:verify-email:day:${String(u._id)}`, 3_600_000);
    const r = await byEmail('unverified@example.com');
    expect(r.status).toBe(202);
    expect(r.body).toEqual(NEUTRAL_BODY);
    await new Promise((res) => setTimeout(res, 50));
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('a failing cap store or enqueue does not change the 202', async () => {
    await mk({ email: 'unverified@example.com' });
    enqueueMock.mockRejectedValue(new Error('queue down'));
    const r = await byEmail('unverified@example.com');
    expect(r.status).toBe(202);
    expect(r.body).toEqual(NEUTRAL_BODY);
  });
});

describe('T-522 resend-by-email: input and limits', () => {
  it.each([[undefined], [''], ['not-an-email'], [42], [{ $ne: 1 }]])(
    'a missing or badly formed address (%j) is 400 invalid_email, nothing counted',
    async (email) => {
      const r = await byEmail(email);
      expect(r.status).toBe(400);
      expect(r.body).toEqual({ error: 'invalid_email' });
      expect(await redis.keys('auth:signup:*')).toEqual([]);
    },
  );

  it('is public: it needs no sign-in', async () => {
    const r = await byEmail('nobody@example.com');
    expect(r.status).toBe(202);
  });

  it('shares the IP bucket (20/h): over it is 429 rate_limited with Retry-After', async () => {
    const ip = '198.51.100.77';
    await redis.set(signupIpKey(ip), String(SIGNUP_IP_CAP));
    await redis.pexpire(signupIpKey(ip), 30 * 60 * 1000);
    const r = await byEmail('nobody@example.com', ip);
    expect(r.status).toBe(429);
    expect(r.body.error).toBe('rate_limited');
    expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
    expect(r.headers['retry-after']).toBe(String(r.body.retryAfter));
  });

  it('shares the email bucket (5/h) with sign-up: sign-ups and resends add up to the same five', async () => {
    const email = 'shared@example.com';
    await redis.set(signupEmailKey(email), String(SIGNUP_EMAIL_CAP - 1));
    await redis.pexpire(signupEmailKey(email), 30 * 60 * 1000);
    // the fifth request is a sign-up ...
    const signup = await supertest(app)
      .post('/register')
      .set('X-Forwarded-For', '192.0.2.200')
      .send({ email, password: PASSWORD, name: 'Shared' });
    expect(signup.status).toBe(202);
    // ... so the sixth, a resend, is limited
    const r = await byEmail(email, '192.0.2.201');
    expect(r.status).toBe(429);
    expect(r.body.error).toBe('rate_limited');
  });

  it('counts the email before the lookup, so a known and an unknown address are limited the same way', async () => {
    await mk({ email: 'known@example.com' });
    for (const e of ['known@example.com', 'unknown@example.com']) {
      await redis.set(signupEmailKey(e), String(SIGNUP_EMAIL_CAP));
      await redis.pexpire(signupEmailKey(e), 30 * 60 * 1000);
    }
    const a = await byEmail('known@example.com');
    const b = await byEmail('unknown@example.com');
    expect(a.status).toBe(429);
    expect(b.status).toBe(429);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('a store failure is 503 service_unavailable, nothing looked up or sent', async () => {
    await mk({ email: 'unverified@example.com' });
    jest.spyOn(redis, 'incr').mockRejectedValue(new Error('redis exploded secret-detail'));
    const findOne = jest.spyOn(User, 'findOne');
    const r = await byEmail('unverified@example.com');
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ error: 'service_unavailable' });
    expect(r.text).not.toContain('secret-detail');
    expect(findOne).not.toHaveBeenCalled();
    expect(enqueueMock).not.toHaveBeenCalled();
  });
});

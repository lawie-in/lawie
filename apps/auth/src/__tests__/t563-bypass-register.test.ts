/**
 * T-563 AC1 - POST /register with the bypass switched on (fake secret). Wrong/missing secret and
 * a missing bypass-test header are the neutral T-522 202 (no test account); the right secret gives
 * the 201 test account; the name, email, rate and cap rules; one-time Ink; no mail, no referral.
 */
import './setupEnv';
import './t563-bypass-env';

jest.mock('ioredis', () => jest.requireActual('ioredis-mock'));
jest.mock('@lawie/email-client', () => ({ enqueueEmail: jest.fn() }));

import './setupDb';

import { enqueueEmail } from '@lawie/email-client';
import supertest from 'supertest';

import app from '../app';
import logger from '../config/logger';
import redis from '../config/redis';
import { Session } from '../models/Session.model';
import { User } from '../models/User.model';
import {
  DAILY_LOGIN_BONUS,
  grantTestInk,
  tryGrantDailyLoginBonus,
} from '../services/credit-bonus.service';
import {
  hashIpForTestSignup,
  testSignupAcceptKey,
  tryTestSignupBypass,
} from '../services/test-signup-bypass.service';

import { ledger, rawUsers } from './t234-helpers';

jest.setTimeout(60_000);

const SECRET = process.env.TEST_SIGNUP_BYPASS_SECRET as string;
const PASSWORD = 'Passw0rdOk';
const IP = '203.0.113.50';
const NEUTRAL_BODY = { status: 'success', data: { status: 'check_email' } };
const enqueueMock = enqueueEmail as unknown as jest.Mock;

type Hdrs = Record<string, string>;
const GOOD: Hdrs = { 'bypass-test': 'true', 'bypass-password': SECRET };
const reg = (
  email: string,
  name: string,
  headers: Hdrs = {},
  extra: Record<string, unknown> = {},
  ip = IP,
) =>
  supertest(app)
    .post('/register')
    .set('X-Forwarded-For', ip)
    .set(headers)
    .send({ email, password: PASSWORD, name, ...extra });

let warnSpy: jest.SpyInstance;
beforeEach(async () => {
  await redis.flushall();
  enqueueMock.mockReset();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
  jest.spyOn(logger, 'info').mockImplementation(() => undefined);
  warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const noTestAccounts = async () =>
  expect(await User.countDocuments({ isTestAccount: true })).toBe(0);

describe('T-563 not applied: neutral 202, no test account, identical to a normal sign-up', () => {
  it('the baseline: a normal sign-up is the neutral 202', async () => {
    const res = await reg('normal@example.com', 'TEST_normal');
    expect(res.status).toBe(202);
    expect(res.body).toEqual(NEUTRAL_BODY);
  });

  it.each([
    ['a missing bypass-password', { 'bypass-test': 'true' }],
    ['a wrong secret', { 'bypass-test': 'true', 'bypass-password': 'lts_' + 'z'.repeat(40) }],
    ['an empty secret', { 'bypass-test': 'true', 'bypass-password': '' }],
    ['bypass-test not true (TRUE)', { 'bypass-test': 'TRUE', 'bypass-password': SECRET }],
    ['bypass-test not true (1)', { 'bypass-test': '1', 'bypass-password': SECRET }],
    ['bypass-test missing', { 'bypass-password': SECRET }],
  ])('%s', async (_n, headers) => {
    const base = await reg('base@example.com', 'TEST_base');
    const res = await reg('case@example.com', 'TEST_case', headers);
    expect(res.status).toBe(202);
    expect(res.body).toEqual(NEUTRAL_BODY);
    expect(res.text).toBe(base.text);
    expect(res.headers['set-cookie']).toBeUndefined();
    await noTestAccounts();
    // It is an ordinary, unverified account, not a verified one.
    const u = await rawUsers().findOne({ email: 'case@example.com' });
    expect(u?.emailVerified).toBe(false);
    expect(await Session.countDocuments({})).toBe(0);
  });

  it('a wrong secret logs exactly one warn test_signup_rejected with the IP hash only', async () => {
    const wrong = 'lts_' + 'z'.repeat(40);
    await reg('wrong@example.com', 'TEST_wrong', {
      'bypass-test': 'true',
      'bypass-password': wrong,
    });
    const rejected = warnSpy.mock.calls.filter((c) => c[1] === 'test_signup_rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0][0]).toEqual({ ipHash: hashIpForTestSignup(IP) });
    const all = JSON.stringify(warnSpy.mock.calls);
    for (const leak of [wrong, SECRET, 'wrong@example.com', IP]) {
      expect(all).not.toContain(leak);
    }
  });

  it('bypass-test not true logs nothing', async () => {
    await reg('quiet@example.com', 'TEST_quiet', { 'bypass-password': SECRET });
    expect(warnSpy.mock.calls.filter((c) => c[1] === 'test_signup_rejected')).toHaveLength(0);
  });

  it('from the 6th wrong secret from one IP: no 429; ordinary 202, identical to a baseline, warn still logged', async () => {
    const bad = { 'bypass-test': 'true', 'bypass-password': 'lts_' + 'z'.repeat(40) };
    const base = await reg('base6@example.com', 'TEST_x', {}, {}, '203.0.113.77');
    for (let i = 1; i <= 5; i++) {
      const r = await reg(`rej${i}@example.com`, 'TEST_x', bad);
      expect(r.status).toBe(202);
    }
    warnSpy.mockClear();
    const sixth = await reg('rej6@example.com', 'TEST_x', bad);
    expect(sixth.status).toBe(202);
    expect(sixth.text).toBe(base.text);
    expect(sixth.headers['retry-after']).toBeUndefined();
    expect(warnSpy.mock.calls.filter((c) => c[1] === 'test_signup_rejected')).toHaveLength(1);
    await noTestAccounts();
  });

  it('after 5 rejections from an IP, even the RIGHT secret is an ordinary 202 and no test account', async () => {
    const bad = { 'bypass-test': 'true', 'bypass-password': 'lts_' + 'z'.repeat(40) };
    for (let i = 1; i <= 5; i++) await reg(`pre${i}@example.com`, 'TEST_x', bad);
    const res = await reg('TEST_right@example.com', 'TEST_right', GOOD);
    expect(res.status).toBe(202);
    expect(res.body).toEqual(NEUTRAL_BODY);
    await noTestAccounts();
    expect((await rawUsers().findOne({ email: 'test_right@example.com' }))?.emailVerified).toBe(
      false,
    );
    // A different IP is unaffected.
    const other = await reg('TEST_other2@example.com', 'TEST_other', GOOD, {}, '203.0.113.88');
    expect(other.status).toBe(201);
  });
});

describe('T-563 right secret', () => {
  it('201 with tokens, a session and the login-shaped body', async () => {
    const res = await reg('TEST_a@example.com', 'TEST_alpha', GOOD);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(typeof res.body.data.refreshToken).toBe('string');
    expect(res.body.data.user).toMatchObject({ email: 'test_a@example.com', role: 'Lawyer' });
    expect(await Session.countDocuments({ userId: res.body.data.user.id })).toBe(1);
  });

  it('the account: test, verified, consent recorded as test, privacy current, no referral', async () => {
    const res = await reg('TEST_b@example.com', 'TEST_beta', GOOD, { referralCode: 'WHATEVER1' });
    expect(res.status).toBe(201);
    const u = await rawUsers().findOne({ email: 'test_b@example.com' });
    expect(u).toMatchObject({
      isTestAccount: true,
      emailVerified: true,
      acceptedVia: 'test',
      termsVersion: 'test-bypass',
      privacyAcceptedVia: 'signup',
    });
    expect(u!.privacyVersion).toBeTruthy();
    expect(u!.termsAcceptedAt).toBeInstanceOf(Date);
    expect(u!.referredVia ?? null).toBeNull();
    expect(u!.signupSource ?? null).toBeNull();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('isTestAccount is immutable', async () => {
    const res = await reg('TEST_c@example.com', 'TEST_gamma', GOOD);
    const id = res.body.data.user.id;
    await User.updateOne({ _id: id }, { $set: { isTestAccount: false } }).catch(() => undefined);
    const doc = await User.findById(id);
    doc!.set('isTestAccount', false);
    await doc!.save().catch(() => undefined);
    expect((await rawUsers().findOne({ email: 'test_c@example.com' }))!.isTestAccount).toBe(true);
  });

  it('+60 Ink units and exactly one test_grant ledger row, once only', async () => {
    const res = await reg('TEST_d@example.com', 'TEST_delta', GOOD);
    const id = res.body.data.user.id;
    const u = await rawUsers().findOne({ email: 'test_d@example.com' });
    expect(u!.inkTopup).toBe(60);
    const rows = await ledger().find({ userId: u!._id }).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reason: 'test_grant', delta: 60 });
    // A second grant does nothing.
    expect(await grantTestInk(id)).toBe(false);
    expect((await rawUsers().findOne({ _id: u!._id }))!.inkTopup).toBe(60);
    expect(await ledger().countDocuments({ userId: u!._id })).toBe(1);
    // A second sign-up with the same address is the ordinary neutral path.
    const again = await reg('TEST_d@example.com', 'TEST_delta', GOOD);
    expect(again.status).toBe(202);
    expect(await ledger().countDocuments({ userId: u!._id })).toBe(1);
  });

  it('the daily login bonus is skipped', async () => {
    const res = await reg('TEST_e@example.com', 'TEST_epsilon', GOOD);
    const id = res.body.data.user.id;
    expect(DAILY_LOGIN_BONUS).toBeGreaterThan(0);
    expect(await tryGrantDailyLoginBonus(id)).toBe(0);
    const login = await supertest(app)
      .post('/login')
      .send({ email: 'test_e@example.com', password: PASSWORD });
    expect(login.status).toBe(200);
    const u = await rawUsers().findOne({ email: 'test_e@example.com' });
    expect(u!.earnedCredits ?? 0).toBe(0);
    expect(u!.lastLoginBonusAt ?? null).toBeNull();
  });

  it('a name not starting with TEST: 400 invalid_test_name, nothing created', async () => {
    const res = await reg('x@example.com', 'test_lower', GOOD);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_test_name' });
    expect(await User.countDocuments({})).toBe(0);
  });

  it.each(['u@test.lawie.in', 'u@gmail.com', 'u@lawie.in', 'u@sub.example.com'])(
    'non-reserved email %s: ordinary sign-up (neutral 202, unverified)',
    async (email) => {
      const res = await reg(email, 'TEST_ordinary', GOOD);
      expect(res.status).toBe(202);
      expect(res.body).toEqual(NEUTRAL_BODY);
      await noTestAccounts();
      expect((await rawUsers().findOne({ email }))!.emailVerified).toBe(false);
    },
  );

  it('a non-reserved email with a bad name is still ordinary (not 400)', async () => {
    const res = await reg('u@gmail.com', 'plain name', GOOD);
    expect(res.status).toBe(202);
  });

  it.each(['u@example.com', 'u@example.org', 'TEST_anushka@lawie.test', 'u@a.b.test'])(
    'reserved %s passes',
    async (email) => {
      const res = await reg(email, 'TEST_reserved', GOOD);
      expect(res.status).toBe(201);
    },
  );

  it('20 accepted a day per IP: the 21st is 429 and creates nothing', async () => {
    await redis.set(testSignupAcceptKey(hashIpForTestSignup(IP)), '20', 'EX', 3600);
    const res = await reg('TEST_cap@example.com', 'TEST_cap', GOOD);
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
    expect(await User.countDocuments({})).toBe(0);
  });

  it('a different IP is not affected by that IP cap', async () => {
    await redis.set(testSignupAcceptKey(hashIpForTestSignup(IP)), '20', 'EX', 3600);
    const res = await reg('TEST_other@example.com', 'TEST_other', GOOD, {}, '203.0.113.99');
    expect(res.status).toBe(201);
  });

  it('200 live test accounts: 409 test_accounts_cap', async () => {
    const now = new Date();
    await rawUsers().insertMany(
      Array.from({ length: 200 }, (_v, i) => ({
        email: `seed${i}@example.com`,
        name: `TEST_seed${i}`,
        isTestAccount: true,
        createdAt: now,
      })),
    );
    const res = await reg('TEST_over@example.com', 'TEST_over', GOOD);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'test_accounts_cap' });
    expect(await User.countDocuments({ isTestAccount: true })).toBe(200);
  });
});

describe('T-563 rate-limit store failure (service level)', () => {
  const payload = { email: 'TEST_s@example.com', password: PASSWORD, name: 'TEST_store' };
  const req = (headers: Hdrs) => ({ headers, ip: IP, meta: { ip: IP, userAgent: 'jest' } });
  const broken = {
    get: jest.fn().mockResolvedValue(null),
    incr: jest.fn().mockRejectedValue(new Error('down')),
    pttl: jest.fn(),
    pexpire: jest.fn(),
  } as never;

  it('right secret + store failure: unavailable (503), nothing created', async () => {
    const out = await tryTestSignupBypass(payload, req(GOOD), { redis: broken });
    expect(out).toEqual({ kind: 'unavailable' });
    expect(await User.countDocuments({})).toBe(0);
  });

  it('the 503 reaches the client', async () => {
    jest.spyOn(redis, 'incr').mockRejectedValue(new Error('down'));
    const res = await reg('TEST_s2@example.com', 'TEST_store', GOOD);
    expect(res.status).toBe(503);
    expect(await User.countDocuments({ isTestAccount: true })).toBe(0);
  });

  it('wrong secret + store failure: still not applied (the ordinary path decides)', async () => {
    const out = await tryTestSignupBypass(
      payload,
      req({ 'bypass-test': 'true', 'bypass-password': 'lts_' + 'z'.repeat(40) }),
      { redis: broken },
    );
    expect(out).toEqual({ kind: 'not_applied' });
  });

  it('switched off or no secret configured: nothing runs, nothing logged', async () => {
    for (const o of [{ enabled: false }, { secret: undefined }]) {
      const out = await tryTestSignupBypass(payload, req(GOOD), o);
      expect(out).toEqual({ kind: 'not_applied' });
    }
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('T-563 the header has no effect anywhere but /register', () => {
  it('login: same answer with and without the header, no account is made', async () => {
    const plain = await supertest(app)
      .post('/login')
      .send({ email: 'nobody@example.com', password: PASSWORD });
    const withH = await supertest(app)
      .post('/login')
      .set(GOOD)
      .send({ email: 'nobody@example.com', password: PASSWORD });
    expect(withH.status).toBe(plain.status);
    expect(withH.status).toBeGreaterThanOrEqual(400);
    expect(withH.body).toEqual(plain.body);
    expect(await User.countDocuments({})).toBe(0);
  });

  it('resend-by-email: the neutral 202 as without the header, nothing created', async () => {
    const plain = await supertest(app)
      .post('/verify-email/resend-by-email')
      .send({ email: 'n@example.com' });
    const withH = await supertest(app)
      .post('/verify-email/resend-by-email')
      .set(GOOD)
      .send({ email: 'n@example.com' });
    expect(withH.status).toBe(plain.status);
    expect(withH.body).toEqual(plain.body);
    expect(withH.body.data?.accessToken).toBeUndefined();
    expect(await User.countDocuments({})).toBe(0);
  });

  it('verify-email: a bad token is refused the same way with the header', async () => {
    const plain = await supertest(app).post('/verify-email').send({ token: 'bad' });
    const withH = await supertest(app).post('/verify-email').set(GOOD).send({ token: 'bad' });
    expect(withH.status).toBe(plain.status);
    expect(withH.body).toEqual(plain.body);
    expect(withH.body.data?.accessToken).toBeUndefined();
  });
});

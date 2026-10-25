/**
 * T-563 AC1 - the rest of the cage, with the bypass switched OFF in env (setupEnv clears it):
 * the header does nothing without a configured secret; internal mint/prepare routes refuse test
 * accounts; the 7-day sweep; the test-accounts script; admin counts exclude test accounts.
 */
import './setupEnv';

jest.mock('ioredis', () => jest.requireActual('ioredis-mock'));
jest.mock('@lawie/email-client', () => ({ enqueueEmail: jest.fn() }));

import './setupDb';

import { enqueueEmail } from '@lawie/email-client';
import mongoose, { Types } from 'mongoose';
import supertest from 'supertest';

import app from '../app';
import logger from '../config/logger';
import redis from '../config/redis';
import { User } from '../models/User.model';
import * as erase from '../services/account-erase.service';
import { signAccessToken } from '../services/jwt.service';
import { createSession } from '../services/session.service';
import {
  TEST_ACCOUNT_LOCK_FILTER,
  runTestAccountSweep,
  testAccountsOlderThanFilter,
} from '../services/test-account-sweep.service';

import { rawUsers } from './t234-helpers';

jest.setTimeout(60_000);

const DAY = 24 * 60 * 60 * 1000;
const SECRET = process.env.INTERNAL_SECRET as string;
const GOLDEN = '0000000000000000000f147e';
const PASSWORD = 'Passw0rdOk';
const NOW = new Date();
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);
const ENQUEUE = enqueueEmail as unknown as jest.Mock;

type Plan = { status: number; body: unknown } | 'throw';
const plan: { sub: Plan } = { sub: { status: 200, body: { active: false, status: 'none' } } };
let fetchCalls: Array<{ url: string; method?: string }> = [];

let warnSpy: jest.SpyInstance;
beforeEach(async () => {
  await redis.flushall();
  plan.sub = { status: 200, body: { active: false, status: 'none' } };
  fetchCalls = [];
  global.fetch = jest.fn(async (url: string, init?: { method?: string }) => {
    const u = String(url);
    fetchCalls.push({ url: u, method: init?.method });
    if (u.includes('subscription-status')) {
      const sub = plan.sub;
      if (sub === 'throw') throw new Error('ECONNREFUSED');
      return { status: sub.status, json: async () => sub.body };
    }
    return { status: 200, json: async () => ({ ok: true, counts: {} }) };
  }) as unknown as typeof fetch;
  jest.spyOn(logger, 'info').mockImplementation(() => undefined);
  warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

async function seed(
  extra: Record<string, unknown> = {},
  _id: Types.ObjectId = new Types.ObjectId(),
): Promise<string> {
  const createdAt = (extra['createdAt'] as Date | undefined) ?? NOW;
  await rawUsers().insertOne({
    _id,
    email: `u${String(_id)}@example.com`,
    name: 'Seed Person',
    role: 'Lawyer',
    isActive: true,
    emailVerified: true,
    updatedAt: createdAt,
    ...extra,
    createdAt,
  });
  return String(_id);
}
const doc = (id: string) => rawUsers().findOne({ _id: new Types.ObjectId(id) });
const touched = async (id: string) => {
  const d = await doc(id);
  return d === null || d.erasure !== undefined;
};

describe('T-563 the header without a configured secret', () => {
  it('is the neutral 202 as a normal sign-up and makes no test account', async () => {
    const hdr = { 'bypass-test': 'true', 'bypass-password': 'lts_' + 'k'.repeat(40) };
    const base = await supertest(app)
      .post('/register')
      .send({ email: 'a@example.com', password: PASSWORD, name: 'TEST_a' });
    const res = await supertest(app)
      .post('/register')
      .set(hdr)
      .send({ email: 'b@example.com', password: PASSWORD, name: 'TEST_b' });
    expect(res.status).toBe(202);
    expect(res.text).toBe(base.text);
    expect(await User.countDocuments({ isTestAccount: true })).toBe(0);
    expect(warnSpy.mock.calls.filter((c) => c[1] === 'test_signup_rejected')).toHaveLength(0);
  });
});

describe('T-563 internal mint/prepare routes refuse a test account', () => {
  beforeEach(() => ENQUEUE.mockReset());
  afterEach(() => expect(ENQUEUE).not.toHaveBeenCalled());
  const post = (path: string, userId: string) =>
    supertest(app).post(path).set('x-internal-secret', SECRET).send({ userId });

  it('verify-email mint: 409 not_eligible', async () => {
    const id = await seed({ isTestAccount: true, emailVerified: false });
    const res = await post('/internal/verify-email/mint', id);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'not_eligible' });
  });
  it('unverified-notice prepare: 409 not_eligible', async () => {
    const id = await seed({ isTestAccount: true, emailVerified: false, createdAt: daysAgo(25) });
    const res = await post('/internal/unverified-notice/prepare', id);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'not_eligible' });
  });
  it('password-reset mint: 404 not_found', async () => {
    const id = await seed({ isTestAccount: true, authProvider: 'email' });
    const res = await post('/internal/password-reset/mint', id);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });
  it('signup-attempt prepare: 404 not_found', async () => {
    const id = await seed({ isTestAccount: true });
    const res = await post('/internal/signup-attempt/prepare', id);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });
  it('controls: a normal user is not refused by the test-account check', async () => {
    const id = await seed({ authProvider: 'email' });
    expect((await post('/internal/signup-attempt/prepare', id)).status).toBe(200);
  });
});

describe('T-563 the 7-day test-account sweep', () => {
  it('erases test accounts older than 7 days through lockAccount(onlyIf) and runAccountErase', async () => {
    const old = await seed({ isTestAccount: true, createdAt: daysAgo(8) });
    const young = await seed({ isTestAccount: true, createdAt: daysAgo(3) });
    const real = await seed({ createdAt: daysAgo(40) });
    const lockSpy = jest.spyOn(erase, 'lockAccount');
    const eraseSpy = jest.spyOn(erase, 'runAccountErase');

    const counts = await runTestAccountSweep(NOW);

    expect(counts).toMatchObject({ found: 1, erased: 1, withActivePlan: 0 });
    expect(lockSpy).toHaveBeenCalledTimes(1);
    expect(lockSpy).toHaveBeenCalledWith(old, { onlyIf: TEST_ACCOUNT_LOCK_FILTER });
    expect(eraseSpy).toHaveBeenCalledWith(old);
    expect(await touched(old)).toBe(true);
    expect(await touched(young)).toBe(false);
    expect(await touched(real)).toBe(false);
    expect((await doc(real))!.isActive).toBe(true);
  });

  it('exactly 7 days is not yet due; an account already being erased is not selected', async () => {
    const edge = await seed({ isTestAccount: true, createdAt: daysAgo(7 - 0.01) });
    await seed({
      isTestAccount: true,
      createdAt: daysAgo(9),
      erasure: { requestedAt: NOW, stage: 'locked' },
    });
    const counts = await runTestAccountSweep(NOW);
    expect(counts.found).toBe(0);
    expect(await touched(edge)).toBe(false);
  });

  it('never selects an Admin or the golden-set account', async () => {
    const admin = await seed({ isTestAccount: true, role: 'Admin', createdAt: daysAgo(30) });
    const golden = await seed(
      { isTestAccount: true, createdAt: daysAgo(30) },
      new Types.ObjectId(GOLDEN),
    );
    const counts = await runTestAccountSweep(NOW);
    expect(counts.found).toBe(0);
    expect(await touched(admin)).toBe(false);
    expect(await touched(golden)).toBe(false);
    const f = testAccountsOlderThanFilter(NOW);
    expect(f).toMatchObject({ isTestAccount: true, role: { $ne: 'Admin' } });
  });

  it('an active plan does not hold the erase: one warn with id and status, no cancel call', async () => {
    plan.sub = { status: 200, body: { active: true, status: 'active' } };
    const id = await seed({ isTestAccount: true, createdAt: daysAgo(8) });
    const counts = await runTestAccountSweep(NOW);
    expect(counts).toMatchObject({ found: 1, erased: 1, withActivePlan: 1 });
    expect(await touched(id)).toBe(true);
    const w = warnSpy.mock.calls.filter((c) => c[1] === 'test_account_erase_with_plan');
    expect(w).toHaveLength(1);
    expect(w[0][0]).toEqual({ userId: id, subscriptionStatus: 'active' });
    expect(fetchCalls.some((c) => /cancel/i.test(c.url))).toBe(false);
  });

  it('billing unreachable still skips the account (retried next run)', async () => {
    plan.sub = 'throw';
    const id = await seed({ isTestAccount: true, createdAt: daysAgo(8) });
    const counts = await runTestAccountSweep(NOW);
    expect(counts).toMatchObject({ found: 1, erased: 0, skippedBillingUnavailable: 1 });
    expect(await touched(id)).toBe(false);
  });

  it('the lock condition is checked at lock time (account turned Admin since selection): skipped', async () => {
    const id = await seed({ isTestAccount: true, createdAt: daysAgo(8) });
    jest.spyOn(erase, 'fetchSubscriptionStatus').mockImplementation(async () => {
      await rawUsers().updateOne({ _id: new Types.ObjectId(id) }, { $set: { role: 'Admin' } });
      return { kind: 'ok', active: false, status: 'none' };
    });
    const counts = await runTestAccountSweep(NOW);
    expect(counts).toMatchObject({ erased: 0, skippedNoLongerDue: 1 });
    expect(await touched(id)).toBe(false);
  });
});

describe('T-563 scripts/test-accounts.ts', () => {
  async function runScript(...args: string[]) {
    const out: string[] = [];
    const err: string[] = [];
    jest.spyOn(console, 'log').mockImplementation((...a) => void out.push(a.join(' ')));
    jest.spyOn(console, 'error').mockImplementation((...a) => void err.push(a.join(' ')));
    jest.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);
    jest.spyOn(mongoose, 'disconnect').mockResolvedValue();
    jest.spyOn(redis, 'quit').mockResolvedValue('OK');
    const code = await new Promise<number>((resolve) => {
      let first = true;
      jest.spyOn(process, 'exit').mockImplementation(((c?: number) => {
        if (first) resolve(c ?? 0);
        first = false;
      }) as never);
      const argv = process.argv;
      process.argv = ['node', 'test-accounts', ...args];
      jest.isolateModules(() => {
        jest.doMock('mongoose', () => mongoose);
        jest.doMock('dotenv', () => ({ config: jest.fn() }));
        jest.doMock('../config/redis', () => ({ __esModule: true, default: redis }));
        jest.doMock('../models/User.model', () => ({ User }));
        jest.doMock('../services/account-erase.service', () => erase);
        require('../scripts/test-accounts');
      });
      process.argv = argv;
    });
    return { code, out: out.join('\n'), err: err.join('\n') };
  }

  let oldId: string;
  let youngId: string;
  let realId: string;
  beforeEach(async () => {
    oldId = await seed({ isTestAccount: true, createdAt: daysAgo(3), name: 'Secret Name Old' });
    youngId = await seed({
      isTestAccount: true,
      createdAt: new Date(NOW.getTime() - 3 * 3600_000),
    });
    realId = await seed({ createdAt: daysAgo(30) });
  });

  it('list prints ids and counts only, older than 1d by default, and writes nothing', async () => {
    const before = await rawUsers().find({}).toArray();
    const r = await runScript('list');
    expect(r.code).toBe(0);
    expect(r.out).toContain(oldId);
    expect(r.out).not.toContain(youngId);
    expect(r.out).not.toContain(realId);
    expect(r.out).toMatch(/"count": 1/);
    expect(r.out).not.toContain('@example.com');
    expect(r.out).not.toContain('Secret Name');
    expect(await rawUsers().find({}).toArray()).toEqual(before);
    expect(fetchCalls).toHaveLength(0);
  });

  it('delete without --apply is a dry run: lists, writes nothing, calls nobody', async () => {
    const lockSpy = jest.spyOn(erase, 'lockAccount');
    const before = await rawUsers().find({}).toArray();
    const r = await runScript('delete');
    expect(r.code).toBe(0);
    expect(r.out).toContain(oldId);
    expect(r.out).toMatch(/Dry run/);
    expect(lockSpy).not.toHaveBeenCalled();
    expect(fetchCalls).toHaveLength(0);
    expect(await rawUsers().find({}).toArray()).toEqual(before);
  });

  it('delete --apply erases through lockAccount(onlyIf isTestAccount); younger and real stay', async () => {
    const lockSpy = jest.spyOn(erase, 'lockAccount');
    const r = await runScript('delete', '--apply');
    expect(r.code).toBe(0);
    expect(lockSpy).toHaveBeenCalledTimes(1);
    expect(lockSpy.mock.calls[0][0]).toBe(oldId);
    expect(lockSpy.mock.calls[0][1]).toEqual({
      onlyIf: expect.objectContaining({ isTestAccount: true }),
    });
    expect(await touched(oldId)).toBe(true);
    expect(await touched(youngId)).toBe(false);
    expect(await touched(realId)).toBe(false);
    expect(r.out).not.toContain('@example.com');
    expect(r.out).not.toContain('Secret Name');
  });

  it('--apply erases an account with an active plan anyway (warn, no cancel)', async () => {
    plan.sub = { status: 200, body: { active: true, status: 'active' } };
    const r = await runScript('delete', '--apply');
    expect(r.code).toBe(0);
    expect(await touched(oldId)).toBe(true);
    expect(r.out).toMatch(/active plan/);
    expect(r.out).toMatch(/withActivePlan/);
    expect(fetchCalls.some((c) => /cancel/i.test(c.url))).toBe(false);
  });

  it('--apply with billing unreachable skips the account', async () => {
    plan.sub = 'throw';
    const r = await runScript('delete', '--apply');
    expect(await touched(oldId)).toBe(false);
    expect(r.out).toMatch(/skipped/);
  });

  it('--older-than parsing: 2d / 12h / 0d / --older-than=1d', async () => {
    const mk = async (ageMs: number) =>
      seed({ isTestAccount: true, createdAt: new Date(NOW.getTime() - ageMs) });
    const fiveH = await mk(5 * 3600_000);
    const idsOf = (s: string) => ({
      old: s.includes(oldId),
      young: s.includes(youngId),
      five: s.includes(fiveH),
    });
    expect(idsOf((await runScript('list', '--older-than', '2d')).out)).toEqual({
      old: true,
      young: false,
      five: false,
    });
    expect(idsOf((await runScript('list', '--older-than', '4d')).out)).toEqual({
      old: false,
      young: false,
      five: false,
    });
    expect(idsOf((await runScript('list', '--older-than', '4h')).out)).toEqual({
      old: true,
      young: false,
      five: true,
    });
    expect(idsOf((await runScript('list', '--older-than=1h')).out)).toEqual({
      old: true,
      young: true,
      five: true,
    });
    expect(idsOf((await runScript('list', '--older-than', '0d')).out)).toEqual({
      old: true,
      young: true,
      five: true,
    });
  });

  it.each([
    [['list', '--older-than', 'abc']],
    [['list', '--older-than', '5x']],
    [['list', '--older-than']],
    [['list', '--apply']],
    [['frobnicate']],
    [[]],
  ])('usage error %j -> exit 2, nothing changed', async (args) => {
    const before = await rawUsers().find({}).toArray();
    const r = await runScript(...args);
    expect(r.code).toBe(2);
    expect(await rawUsers().find({}).toArray()).toEqual(before);
  });

  it('skips Admin and golden-set accounts even with 0d', async () => {
    const admin = await seed({ isTestAccount: true, role: 'Admin', createdAt: daysAgo(20) });
    const golden = await seed(
      { isTestAccount: true, createdAt: daysAgo(20) },
      new Types.ObjectId(GOLDEN),
    );
    const l = await runScript('list', '--older-than', '0d');
    expect(l.out).not.toContain(admin);
    expect(l.out).not.toContain(golden);
    await runScript('delete', '--older-than', '0d', '--apply');
    expect(await touched(admin)).toBe(false);
    expect(await touched(golden)).toBe(false);
  });
});

describe('T-563 admin counts exclude test accounts (auth admin-users)', () => {
  it('count-by-source counts the normal user only', async () => {
    await seed({ signupSource: { utmSource: 'google' } });
    await seed({ isTestAccount: true, signupSource: { utmSource: 'google' } });
    await seed({ isTestAccount: true });
    const adminId = new Types.ObjectId().toString();
    const token = signAccessToken({
      sub: adminId,
      email: 'admin@example.com',
      name: 'Admin',
      role: 'Admin',
      plan: 'free',
    });
    await createSession(
      adminId,
      token,
      `refresh-${token.slice(-24)}`,
      { plan: 'free', email: 'admin@example.com', role: 'Admin', name: 'Admin' },
      {},
    );
    const res = await supertest(app)
      .get('/admin/users/count-by-source')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.bySource).toEqual([{ source: 'google', count: 1 }]);
  });
});

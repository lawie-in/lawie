/**
 * T-115c round 2 — the race recheck before the User document goes, the sweep order
 * (least recently tried first, so old failing accounts cannot starve a new one), and the
 * "keeps failing" warn from the fifth failed attempt (ids only). Drafting and billing are a
 * mocked global.fetch; in-memory Mongo; ioredis-mock.
 */

import './setupEnv';

jest.mock('ioredis', () => require('ioredis-mock'));

import './setupDb';

import { Types } from 'mongoose';
import supertest from 'supertest';

import app from '../app';
import logger from '../config/logger';
import redis from '../config/redis';
import { User } from '../models/User.model';
import {
  ACCOUNT_ERASE_SWEEP_BATCH,
  ERASE_ATTEMPTS_WARN_THRESHOLD,
  runAccountErase,
  runAccountEraseSweep,
} from '../services/account-erase.service';

const EMAIL = 'recheck.person@example.com';
const NAME = 'Recheck Person';

interface Call {
  service: 'drafting' | 'billing';
  userId: string;
  nth: number;
  stageAtCall: string | undefined;
  dryRun: unknown;
}
let calls: Call[];
/** Per call hook: return a status to override (default 200 ok). */
let fail: (c: Call) => boolean;
/** Counts a service answers with, by its nth call for the same user. */
let countsFor: (c: Call) => Record<string, number> | { [k: string]: number };

beforeEach(async () => {
  await redis.flushall();
  calls = [];
  fail = () => false;
  countsFor = () => ({});
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('subscription-status')) {
      return { status: 200, json: async () => ({ active: false, status: 'none' }) };
    }
    const body = JSON.parse(String(init?.body));
    const service = u.startsWith('http://localhost:4002') ? 'drafting' : 'billing';
    const user = await User.collection.findOne({ _id: new Types.ObjectId(body.userId) });
    const nth = calls.filter((c) => c.service === service && c.userId === body.userId).length + 1;
    const c: Call = {
      service,
      userId: body.userId,
      nth,
      stageAtCall: user?.erasure?.stage,
      dryRun: body.dryRun,
    };
    calls.push(c);
    if (fail(c)) return { status: 500, json: async () => ({ ok: false }) };
    return { status: 200, json: async () => ({ ok: true, counts: countsFor(c) }) };
  }) as unknown as typeof fetch;
});
afterEach(() => jest.restoreAllMocks());

async function lockedUser(extra: Record<string, unknown> = {}, requestedAt = new Date()) {
  const id = new Types.ObjectId();
  await User.collection.insertOne({
    _id: id,
    email: `u${String(id)}@example.com`,
    name: NAME,
    isActive: false,
    erasure: { requestedAt, stage: 'locked' },
    ...extra,
  });
  return String(id);
}
const raw = (id: string) => User.collection.findOne({ _id: new Types.ObjectId(id) });

describe('race recheck before the User document goes', () => {
  it('runs drafting and billing once more after audit_done; rows written late are removed and counted', async () => {
    const id = await lockedUser({ email: EMAIL });
    // A request that was in flight when the lock landed writes 3 rows after the first drafting pass.
    countsFor = (c): Record<string, number> => {
      if (c.service === 'drafting') return { documents: c.nth === 1 ? 2 : 3 };
      return { couponusages: c.nth === 1 ? 0 : 1 };
    };
    const run = await runAccountErase(id);
    expect(run.done).toBe(true);
    expect(run.counts.drafting).toEqual({ documents: 2 });
    expect(run.counts.recheck).toEqual({
      drafting: { documents: 3 },
      billing: { couponusages: 1 },
    });
    expect(calls.map((c) => `${c.service}#${c.nth}`)).toEqual([
      'drafting#1',
      'billing#1',
      'drafting#2',
      'billing#2',
    ]);
    // The first pass runs at stage "locked"; the recheck only once the stage is audit_done.
    expect(calls.map((c) => c.stageAtCall)).toEqual([
      'locked',
      'drafting_erased',
      'audit_done',
      'audit_done',
    ]);
    expect(await raw(id)).toBeNull();
  });

  it('the recheck sends the email to drafting (for the reviewer-token match) and nothing else new', async () => {
    const id = await lockedUser({ email: EMAIL });
    const bodies: Array<Record<string, unknown>> = [];
    const inner = global.fetch as jest.Mock;
    global.fetch = jest.fn(async (u: string, init?: RequestInit) => {
      if (!String(u).includes('subscription-status')) bodies.push(JSON.parse(String(init?.body)));
      return inner(u, init);
    }) as unknown as typeof fetch;
    await runAccountErase(id);
    expect(bodies).toEqual([
      { userId: id, email: EMAIL },
      { userId: id },
      { userId: id, email: EMAIL },
      { userId: id },
    ]);
  });

  it.each(['drafting', 'billing'] as const)(
    'a %s failure in the recheck: failedAt "recheck", not done, User kept at stage audit_done, attempt recorded',
    async (service) => {
      const id = await lockedUser({ email: EMAIL });
      fail = (c) => c.service === service && c.nth === 2;
      const run = await runAccountErase(id);
      expect(run).toMatchObject({ done: false, failedAt: 'recheck' });
      const u = await raw(id);
      expect(u).not.toBeNull();
      expect(u!.erasure.stage).toBe('audit_done');
      expect(u!.isActive).toBe(false);
      expect(u!.erasure.attempts).toBe(1);
      expect(u!.erasure.lastAttemptAt).toBeInstanceOf(Date);
    },
  );

  it('after a recheck failure the resume runs only the recheck, then finishes (no step re-run)', async () => {
    const id = await lockedUser({ email: EMAIL });
    fail = (c) => c.service === 'billing' && c.nth === 2;
    await runAccountErase(id);
    calls = [];
    fail = () => false;
    const run = await runAccountErase(id);
    expect(run.done).toBe(true);
    expect(calls.map((c) => c.service)).toEqual(['drafting', 'billing']);
    expect(calls.every((c) => c.stageAtCall === 'audit_done')).toBe(true);
    expect(await raw(id)).toBeNull();
  });

  it('the sweep retries a recheck failure and finishes it', async () => {
    const id = await lockedUser();
    fail = (c) => c.service === 'drafting' && c.nth === 2;
    expect((await runAccountEraseSweep()).pending).toBe(1);
    fail = () => false;
    expect(await runAccountEraseSweep()).toEqual({ found: 1, finished: 1, pending: 0 });
    expect(await raw(id)).toBeNull();
  });

  it('DELETE /me answers 202 on a recheck failure, then resume completes (200-equivalent: user gone)', async () => {
    const password = 'Passw0rdOk';
    const u = await User.create({ email: 'rc@example.com', name: NAME, password });
    const id = String(u._id);
    const login = await supertest(app).post('/login').send({ email: 'rc@example.com', password });
    const d = login.body.data as { tokens?: { accessToken: string }; accessToken?: string };
    const token = (d.tokens?.accessToken ?? d.accessToken)!;
    fail = (c) => c.service === 'drafting' && c.nth === 2;
    const res = await supertest(app)
      .delete('/me')
      .set({ Authorization: `Bearer ${token}` })
      .send({ password });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: 'pending' });
    expect((await raw(id))!.erasure.stage).toBe('audit_done');
    fail = () => false;
    expect((await runAccountErase(id)).done).toBe(true);
    expect(await raw(id)).toBeNull();
  });

  it('a dry run skips the recheck: two calls, no counts.recheck, nothing changed', async () => {
    const id = await lockedUser();
    const run = await runAccountErase(id, { dryRun: true });
    expect(run.done).toBe(true);
    expect(run.counts.recheck).toBeUndefined();
    expect(calls.map((c) => c.service)).toEqual(['drafting', 'billing']);
    expect(calls.every((c) => c.dryRun === true)).toBe(true);
    expect((await raw(id))!.erasure.stage).toBe('locked');
  });

  it('a failed final delete also records the attempt', async () => {
    const id = await lockedUser();
    jest.spyOn(User, 'deleteOne').mockRejectedValueOnce(new Error('hiccup') as never);
    const run = await runAccountErase(id);
    expect(run.failedAt).toBe('user');
    expect((await raw(id))!.erasure.attempts).toBe(1);
  });
});

describe('sweep order: least recently tried first', () => {
  const t = (m: number) => new Date(Date.UTC(2026, 9, 14, 0, m));

  it('accounts never tried come first (oldest request first), then by lastAttemptAt ascending', async () => {
    const a = await lockedUser({}, t(0)); // tried at t30
    await User.collection.updateOne(
      { _id: new Types.ObjectId(a) },
      { $set: { 'erasure.lastAttemptAt': t(30) } },
    );
    const b = await lockedUser({}, t(1)); // tried at t10
    await User.collection.updateOne(
      { _id: new Types.ObjectId(b) },
      { $set: { 'erasure.lastAttemptAt': t(10) } },
    );
    const c = await lockedUser({}, t(5)); // never tried, newer request
    const d = await lockedUser({}, t(2)); // never tried, older request
    await runAccountEraseSweep();
    const order = calls.filter((x) => x.service === 'drafting' && x.nth === 1).map((x) => x.userId);
    expect(order).toEqual([d, c, b, a]);
  });

  it('starved case: 50 failing old accounts do not block a new one', async () => {
    expect(ACCOUNT_ERASE_SWEEP_BATCH).toBe(50);
    const oldIds: string[] = [];
    for (let i = 0; i < 50; i += 1) oldIds.push(await lockedUser({}, t(i)));
    const fresh = await lockedUser({}, t(59)); // the 51st: outside the first batch
    const stuck = new Set(oldIds);
    fail = (c) => stuck.has(c.userId);

    const first = await runAccountEraseSweep();
    expect(first).toEqual({ found: 50, finished: 0, pending: 50 });
    expect(await raw(fresh)).not.toBeNull(); // not reached yet
    // Every old account now has a lastAttemptAt; the new one has none.
    const tried = await User.collection.countDocuments({
      'erasure.lastAttemptAt': { $exists: true },
    });
    expect(tried).toBe(50);

    calls = [];
    const second = await runAccountEraseSweep();
    expect(second.found).toBe(50);
    expect(second.finished).toBe(1);
    expect(await raw(fresh)).toBeNull();
    // It went first in the second run.
    expect(calls[0].userId).toBe(fresh);
    // The old ones are still locked, not lost.
    expect(await User.collection.countDocuments({ 'erasure.requestedAt': { $exists: true } })).toBe(
      50,
    );
  });
});

describe('the "keeps failing" warn', () => {
  const keepsFailing = (spy: jest.SpyInstance) =>
    spy.mock.calls.filter((a) => a[1] === 'Account erase keeps failing');

  it('is silent below the threshold, then fires on each failure from attempt 5, ids only', async () => {
    expect(ERASE_ATTEMPTS_WARN_THRESHOLD).toBe(5);
    const id = await lockedUser({ email: EMAIL, name: NAME });
    fail = (c) => c.service === 'drafting';
    const warn = jest.spyOn(logger, 'warn');

    for (let i = 1; i <= 4; i += 1) await runAccountErase(id);
    expect((await raw(id))!.erasure.attempts).toBe(4);
    expect(keepsFailing(warn)).toHaveLength(0);

    await runAccountErase(id);
    expect(keepsFailing(warn)).toHaveLength(1);
    expect(keepsFailing(warn)[0][0]).toEqual({
      userId: id,
      failedAt: 'drafting_erased',
      attempts: 5,
    });

    await runAccountErase(id);
    expect(keepsFailing(warn)).toHaveLength(2);
    expect(keepsFailing(warn)[1][0]).toEqual({
      userId: id,
      failedAt: 'drafting_erased',
      attempts: 6,
    });

    // No email or name in any warn.
    const blob = JSON.stringify(warn.mock.calls);
    expect(blob).not.toContain(EMAIL);
    expect(blob).not.toContain(NAME);
  });

  it('reports the failing stage, including recheck', async () => {
    const id = await lockedUser({ 'erasure.attempts': 4 } as never);
    await User.collection.updateOne(
      { _id: new Types.ObjectId(id) },
      { $set: { 'erasure.attempts': 4 } },
    );
    fail = (c) => c.service === 'billing' && c.nth === 2;
    const warn = jest.spyOn(logger, 'warn');
    await runAccountErase(id);
    expect(keepsFailing(warn)[0][0]).toEqual({ userId: id, failedAt: 'recheck', attempts: 5 });
  });

  it('a user that succeeds never triggers it', async () => {
    const id = await lockedUser();
    const warn = jest.spyOn(logger, 'warn');
    await runAccountErase(id);
    expect(keepsFailing(warn)).toHaveLength(0);
  });
});

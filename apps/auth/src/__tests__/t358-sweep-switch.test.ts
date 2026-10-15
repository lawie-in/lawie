/**
 * T-358 round 3 (Arjun): UNVERIFIED_SWEEP_ENABLED. Off unless exactly 'true'. While off the sweep
 * only counts (read-only) and logs one line with enabled:false and counts; it never enqueues,
 * never calls billing, never locks or erases. The verify routes and the worker are not gated.
 * This file runs with the variable UNSET (the default), so a bare runUnverifiedSweep() is the
 * production default.
 */

import './setupEnv';

jest.mock('ioredis', () => require('ioredis-mock'));
jest.mock('@lawie/email-client', () => ({ enqueueEmail: jest.fn() }));

import './setupDb';

import { enqueueEmail } from '@lawie/email-client';
import { Types } from 'mongoose';
import supertest from 'supertest';

import app from '../app';
import logger from '../config/logger';
import redis from '../config/redis';
import { User } from '../models/User.model';
import * as sessionService from '../services/session.service';
import {
  UNVERIFIED_DELETE_BATCH,
  runUnverifiedSweep,
  startUnverifiedSweep,
  stopUnverifiedSweep,
} from '../services/unverified-sweep.service';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-14T10:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const enqueue = enqueueEmail as jest.Mock;
const SECRET = process.env.INTERNAL_SECRET as string;
const NAME = 'Switch Person';

async function seed(
  o: { firstAt?: Date; warnAt?: Date; createdAt?: Date; extra?: Record<string, unknown> } = {},
) {
  const _id = new Types.ObjectId();
  const created = o.createdAt ?? ago(60 * DAY);
  await User.collection.insertOne({
    _id,
    email: `u${String(_id)}@example.com`,
    name: NAME,
    authProvider: 'email',
    emailVerified: false,
    isActive: true,
    role: 'Advocate',
    createdAt: created,
    updatedAt: created,
    ...(o.firstAt ? { firstVerifySentAt: o.firstAt, firstVerifySentVia: 'verify' } : {}),
    ...(o.warnAt ? { unverifiedNoticeSentAt: o.warnAt } : {}),
    ...(o.extra ?? {}),
  });
  return String(_id);
}
const raw = (id: string) => User.collection.findOne({ _id: new Types.ObjectId(id) });

let fetchMock: jest.Mock;
let infoSpy: jest.SpyInstance;
let warnSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;
beforeEach(async () => {
  await redis.flushall();
  enqueue.mockReset();
  enqueue.mockResolvedValue({ jobId: 'j', queue: 'q', deduped: false });
  fetchMock = jest.fn(async () => ({
    status: 200,
    json: async () => ({ active: false, status: 'none', ok: true, counts: {} }),
  }));
  global.fetch = fetchMock as unknown as typeof fetch;
  infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
  warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  stopUnverifiedSweep();
  jest.restoreAllMocks();
});

/** A mixed population: first notice due, warning due, held, and due for deletion. */
async function population() {
  return {
    first: await seed({}),
    warn: await seed({ firstAt: ago(25 * DAY) }),
    heldNoWarning: await seed({ firstAt: ago(40 * DAY) }),
    del: await seed({ firstAt: ago(40 * DAY), warnAt: ago(10 * DAY) }),
  };
}

describe('default (variable unset) is OFF: counts only', () => {
  it('enqueues nothing, calls no service, locks and erases nothing, kills no session', async () => {
    const p = await population();
    const kill = jest.spyOn(sessionService, 'deleteAllUserSessions');
    const before = await User.collection.find({}).toArray();
    const counts = await runUnverifiedSweep(NOW);
    expect(enqueue).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled(); // no billing, no drafting
    expect(kill).not.toHaveBeenCalled();
    expect(await User.collection.find({}).toArray()).toEqual(before);
    for (const id of Object.values(p)) {
      const u = await raw(id);
      expect(u).not.toBeNull();
      expect(u!.erasure).toBeUndefined();
      expect(u!.isActive).toBe(true);
    }
    expect(counts).toMatchObject({
      noticesQueued: 0,
      noticesDeduped: 0,
      noticeEnqueueFailed: 0,
      deleteFound: 0,
      deleted: 0,
      erasePending: 0,
      skippedNoLongerDue: 0,
      skippedSubscriptionActive: 0,
      skippedBillingUnavailable: 0,
    });
  });

  it('returns the counts: heldNoFirstEmail, heldNoWarning, dueNoticeUnsent (their sum), deletionsDue', async () => {
    await population();
    const counts = await runUnverifiedSweep(NOW);
    expect(counts.heldNoFirstEmail).toBe(1);
    expect(counts.heldNoWarning).toBe(1);
    expect(counts.dueNoticeUnsent).toBe(2);
    expect(counts.deletionsDue).toBe(1);
  });

  it('logs exactly one line, enabled:false, counts only, no email or name; warn when anything is due', async () => {
    await population();
    await runUnverifiedSweep(NOW);
    const all = [...infoSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls];
    expect(all).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toEqual({
      enabled: false,
      heldNoFirstEmail: 1,
      heldNoWarning: 1,
      dueNoticeUnsent: 2,
      deletionsDue: 1,
    });
    const text = JSON.stringify(all);
    expect(text).not.toContain('@');
    expect(text).not.toContain(NAME);
    expect(text).not.toContain('example.com');
  });

  it('info (not warn) when nothing is due', async () => {
    await seed({ firstAt: ago(5 * DAY) });
    await runUnverifiedSweep(NOW);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy.mock.calls[0][0]).toMatchObject({
      enabled: false,
      dueNoticeUnsent: 0,
      deletionsDue: 0,
    });
  });

  it('deletionsDue counts every due account, not just one batch', async () => {
    const n = UNVERIFIED_DELETE_BATCH + 7;
    await User.collection.insertMany(
      Array.from({ length: n }, () => {
        const _id = new Types.ObjectId();
        return {
          _id,
          email: `bulk${String(_id)}@example.com`,
          name: NAME,
          authProvider: 'email',
          emailVerified: false,
          isActive: true,
          role: 'Advocate',
          createdAt: ago(90 * DAY),
          updatedAt: ago(90 * DAY),
          firstVerifySentAt: ago(40 * DAY),
          firstVerifySentVia: 'verify',
          unverifiedNoticeSentAt: ago(10 * DAY),
        };
      }),
    );
    const counts = await runUnverifiedSweep(NOW);
    expect(counts.deletionsDue).toBe(n);
    expect(await User.countDocuments({})).toBe(n);
  });

  it('exclusions are honoured in the counts (verified, Google, Admin, erasing, golden-set)', async () => {
    const due = { firstAt: ago(40 * DAY), warnAt: ago(10 * DAY) };
    await seed({ ...due, extra: { emailVerified: true } });
    await seed({ ...due, extra: { authProvider: 'google' } });
    await seed({ ...due, extra: { googleId: 'g-1' } });
    await seed({ ...due, extra: { role: 'Admin' } });
    await seed({ ...due, extra: { erasure: { requestedAt: NOW, stage: 'locked' } } });
    const counts = await runUnverifiedSweep(NOW);
    expect(counts).toMatchObject({ deletionsDue: 0, dueNoticeUnsent: 0 });
  });

  it('the off counts equal what ON would act on', async () => {
    await population();
    const off = await runUnverifiedSweep(NOW);
    const on = await runUnverifiedSweep(NOW, { enabled: true });
    expect(on.deleteFound).toBe(off.deletionsDue);
    expect(on.deleted).toBe(off.deletionsDue);
    expect(on.noticesQueued).toBe(3); // one first notice, two warnings (F 25d and F 40d, no warning yet)
    // The held counts are read after the actions in an ON run; the account that was held for the
    // first email is still held (its notice is not confirmed), and so is the one with no warning.
    expect(on.heldNoFirstEmail).toBe(off.heldNoFirstEmail);
    expect(on.heldNoWarning).toBe(off.heldNoWarning);
    expect(on.dueNoticeUnsent).toBe(off.dueNoticeUnsent);
  });

  it('an explicit enabled:false is the same as the default', async () => {
    await population();
    const a = await runUnverifiedSweep(NOW);
    const b = await runUnverifiedSweep(NOW, { enabled: false });
    expect(b).toEqual(a);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('explicit enabled:true acts (and returns deletionsDue: 0)', async () => {
    await population();
    const counts = await runUnverifiedSweep(NOW, { enabled: true });
    expect(enqueue).toHaveBeenCalledTimes(3);
    expect(counts.deleted).toBe(1);
    expect(counts.deletionsDue).toBe(0);
  });

  it('never throws: a count failure is logged without values and returns zeros', async () => {
    jest.spyOn(User, 'countDocuments').mockRejectedValue(new Error('boom leak@example.com'));
    const counts = await runUnverifiedSweep(NOW);
    expect(counts).toMatchObject({ heldNoFirstEmail: 0, deletionsDue: 0 });
    expect(JSON.stringify([warnSpy.mock.calls, infoSpy.mock.calls])).not.toContain('leak@');
  });
});

describe('the boot run and the hourly tick still run while off (and still only count)', () => {
  it('start runs once at boot, counts, logs enabled:false, and does nothing else; a tick runs again', async () => {
    await population();
    const cb: { fn: (() => void) | null } = { fn: null };
    const timer = { unref: jest.fn() } as unknown as NodeJS.Timeout;
    const setSpy = jest.spyOn(global, 'setInterval').mockImplementation(((
      fn: () => void,
      ms?: number,
    ) => {
      cb.fn = fn;
      expect(ms).toBe(60 * 60 * 1000);
      return timer;
    }) as never);
    jest.spyOn(global, 'clearInterval').mockImplementation(() => undefined);
    const count = jest.spyOn(User, 'countDocuments');
    startUnverifiedSweep();
    setSpy.mockRestore();
    const waitFor = async (n: number) => {
      for (let i = 0; i < 300 && count.mock.calls.length < n; i += 1)
        await new Promise((r) => setTimeout(r, 10));
      expect(count.mock.calls.length).toBeGreaterThanOrEqual(n);
    };
    await waitFor(3); // boot run: held first email, held warning, deletions due
    await new Promise((r) => setTimeout(r, 80));
    const afterBoot = count.mock.calls.length;
    expect(afterBoot).toBe(3);
    cb.fn!();
    await waitFor(afterBoot + 1);
    expect(enqueue).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy.mock.calls.every((c) => (c[0] as { enabled?: boolean }).enabled === false)).toBe(
      true,
    );
  });
});

describe('the verify routes are not gated by the switch', () => {
  const H = 'x-internal-secret';
  it('prepare and outcome work while the sweep is off', async () => {
    const id = await seed({});
    const prep = await supertest(app)
      .post('/internal/unverified-notice/prepare')
      .set(H, SECRET)
      .send({ userId: id });
    expect(prep.status).toBe(200);
    expect(prep.body).toMatchObject({ notice: 'first', variant: 'A' });
    const out = await supertest(app)
      .post('/internal/unverified-notice/outcome')
      .set(H, SECRET)
      .send({ userId: id, mail: 'verify', outcome: 'sent' });
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ firstStamped: true, warningStamped: false });
    expect((await raw(id))!.firstVerifySentAt).toBeInstanceOf(Date);
  });
});

describe('env parsing of UNVERIFIED_SWEEP_ENABLED (fresh module load per case)', () => {
  function load(value: string | undefined): boolean {
    const saved = process.env.UNVERIFIED_SWEEP_ENABLED;
    if (value === undefined) delete process.env.UNVERIFIED_SWEEP_ENABLED;
    else process.env.UNVERIFIED_SWEEP_ENABLED = value;
    try {
      let result: boolean | undefined;
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        result = require('../config/env').env.UNVERIFIED_SWEEP_ENABLED as boolean;
      });
      return result as boolean;
    } finally {
      if (saved === undefined) delete process.env.UNVERIFIED_SWEEP_ENABLED;
      else process.env.UNVERIFIED_SWEEP_ENABLED = saved;
    }
  }

  it("only the exact string 'true' is on", () => {
    expect(load('true')).toBe(true);
  });

  it.each([
    undefined,
    '',
    'false',
    '1',
    'TRUE',
    'True',
    ' true',
    'true ',
    'yes',
    'on',
    '0',
    'tru',
    'truee',
  ])('%j is off', (v) => {
    expect(load(v)).toBe(false);
  });

  it('an odd value never stops the service from loading its env (no throw, no exit)', () => {
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
    for (const v of ['{"a":1}', '\u0000x', 'x'.repeat(10_000), 'null', 'undefined']) {
      expect(() => load(v)).not.toThrow();
      expect(load(v)).toBe(false);
    }
    expect(exit).not.toHaveBeenCalled();
  });

  it('the shipped default in this test process is off (variable unset)', () => {
    expect(process.env.UNVERIFIED_SWEEP_ENABLED).toBeUndefined();
  });
});

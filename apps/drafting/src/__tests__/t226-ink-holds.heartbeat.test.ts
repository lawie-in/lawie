/**
 * T-226 round 3 — the hold heartbeat, the sweep-release guard and the
 * lost-hold re-hold, driven through withInkHold directly (fake req/res).
 *
 * Time: only Date is faked (jest.useFakeTimers with everything else left
 * real) so the Mongo driver keeps its real timers. The heartbeat interval is
 * captured by a setInterval spy so each test fires its ticks by hand and can
 * count live intervals.
 *
 * Cases: 5a (45-minute run), 5b (killed run), 5c (timer cleared on done,
 * error, disconnect), 5d (hold removed while alive: re-hold or withhold),
 * 5e (beats stop past 60 minutes), the sweep/route interleaves, the late
 * beat, a failed beat, and a holdInk throw during the re-hold.
 */
import './setupDb';
import { EventEmitter } from 'events';
import type { Request, Response } from 'express';
import mongoose from 'mongoose';

import { Generation } from '../models/Generation.model';
import { User } from '../models/User.model';
import { insufficientInkBody } from '../middleware/enforceCredits';
import * as credits from '../services/credits.service';
import {
  INK_HOLD_HEARTBEAT_MS,
  INK_HOLD_MAX_HEARTBEAT_MS,
  INK_HOLD_TTL_MS,
  getCreditBalance,
  holdInk,
  releaseExpiredHolds,
  releaseInk,
} from '../services/credits.service';
import { type InkHoldHandle, withInkHold } from '../routes/documents.routes';

jest.setTimeout(60_000);

const USER_ID = '507f1f77bcf86cd7994392d1';
const OID = new mongoose.Types.ObjectId(USER_ID);
const MIN = 60_000;
const COST = 2; // Ink; 4 storage units
const PRE_STREAM_ERROR = { error: 'Generation failed' };
const PII = ['test@test.com', 'Test Advocate', 'secret-driver-text'];

const ALL_BUT_DATE = [
  'hrtime',
  'nextTick',
  'performance',
  'queueMicrotask',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'setImmediate',
  'clearImmediate',
  'setInterval',
  'clearInterval',
  'setTimeout',
  'clearTimeout',
] as const;

// ── Harness ──────────────────────────────────────────────────────────────────

interface FakeTimer {
  cb: () => void;
  cleared: boolean;
  unref: () => FakeTimer;
}
let timers: FakeTimer[] = [];
let T0 = 0;
let extendSpy: jest.SpyInstance;

const liveTimers = () => timers.filter((t) => !t.cleared);
const flush = () => new Promise<void>((r) => setImmediate(r));
const at = (minutes: number) => jest.setSystemTime(T0 + minutes * MIN);

/** Fire the heartbeat tick and wait for the beat it started. */
async function tick(t: FakeTimer = timers[0]) {
  const calls = extendSpy.mock.calls.length;
  t.cb();
  if (extendSpy.mock.calls.length > calls) await extendSpy.mock.results[calls].value.catch(() => 0);
  await flush();
}

function makeRes() {
  const ee = new EventEmitter() as EventEmitter & {
    headersSent: boolean;
    writableFinished: boolean;
    writes: string[];
    status: jest.Mock;
    json: jest.Mock;
    write: (s: string) => boolean;
    end: jest.Mock;
  };
  ee.headersSent = false;
  ee.writableFinished = false;
  ee.writes = [];
  ee.status = jest.fn(() => ee);
  ee.json = jest.fn(() => ee);
  ee.write = (s: string) => {
    ee.headersSent = true;
    ee.writes.push(s);
    return true;
  };
  ee.end = jest.fn(() => {
    ee.writableFinished = true;
  });
  return ee;
}
type FakeRes = ReturnType<typeof makeRes>;

const fakeReq = () => ({ jwtPayload: { sub: USER_ID } }) as unknown as Request;

function drive(
  res: FakeRes,
  run: (ink: InkHoldHandle) => Promise<void>,
  runId = 'run-1',
  runSequence = 1,
) {
  return withInkHold(
    fakeReq(),
    res as unknown as Response,
    { runId, runSequence },
    COST,
    PRE_STREAM_ERROR,
    run,
  );
}

const hasEvent = (res: FakeRes, name: string) =>
  res.writes.some((w) => w.startsWith(`event: ${name}\n`));

async function seed(inkTopup: number) {
  await User.create({
    _id: USER_ID,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup,
  });
}

interface RawUser {
  inkTopup: number;
  inkHolds: Array<{ runId: string; expiresAt: Date; deliver?: boolean; reference?: string }>;
  inkSettled?: Array<{ runId: string; runSequence: number }>;
}
const rawUser = async () => (await User.collection.findOne({ _id: OID })) as unknown as RawUser;
const rows = () =>
  mongoose.connection
    .db!.collection('inkledger')
    .find({ userId: OID, reason: 'generate' })
    .toArray();
const holdOf = async (runId = 'run-1') => (await rawUser()).inkHolds.find((h) => h.runId === runId);

async function expireNow(runId = 'run-1') {
  await User.collection.updateOne(
    { _id: OID },
    { $set: { 'inkHolds.$[h].expiresAt': new Date(Date.now() - 60_000) } },
    { arrayFilters: [{ 'h.runId': runId, 'h.runSequence': 1 }] },
  );
}

function captureLogs() {
  return (['error', 'warn', 'log', 'info'] as const).reduce(
    (acc, m) => ({ ...acc, [m]: jest.spyOn(console, m).mockImplementation(() => undefined) }),
    {} as Record<'error' | 'warn' | 'log' | 'info', jest.SpyInstance>,
  );
}
const text = (s: jest.SpyInstance) => s.mock.calls.flat().map(String).join(' ');

/** Mock the sweep's Generation lookup to run `hook` first, then answer `found`. */
function sweepLookup(hook: () => Promise<void>, found: unknown = null) {
  return jest.spyOn(Generation, 'findOne').mockImplementation((() => ({
    select: () => ({
      lean: async () => {
        await hook();
        return found;
      },
    }),
  })) as never);
}

beforeEach(() => {
  timers = [];
  jest.useFakeTimers({ doNotFake: [...ALL_BUT_DATE], now: new Date() });
  T0 = Date.now();
  const realSet = global.setInterval;
  const realClear = global.clearInterval;
  jest.spyOn(global, 'setInterval').mockImplementation(((
    cb: () => void,
    ms?: number,
    ...rest: unknown[]
  ) => {
    if (ms === INK_HOLD_HEARTBEAT_MS) {
      const t: FakeTimer = { cb, cleared: false, unref: () => t };
      timers.push(t);
      return t as unknown as NodeJS.Timeout;
    }
    return (realSet as (...a: unknown[]) => NodeJS.Timeout)(cb, ms, ...rest);
  }) as never);
  jest.spyOn(global, 'clearInterval').mockImplementation(((h: unknown) => {
    const t = timers.find((x) => x === h);
    if (t) t.cleared = true;
    else realClear(h as NodeJS.Timeout);
  }) as never);
  extendSpy = jest.spyOn(credits, 'extendInkHold');
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// ── 5a ───────────────────────────────────────────────────────────────────────

describe('5a: a 45-minute run with a 30-minute TTL', () => {
  it('extends the hold at each beat, the sweep at 35 min leaves it alone, and settle at 45 min writes one set of rows', async () => {
    expect(INK_HOLD_HEARTBEAT_MS).toBeLessThan(INK_HOLD_TTL_MS);
    await seed(20); // 10 Ink
    const res = makeRes();
    await drive(res, async (ink) => {
      expect(timers).toHaveLength(1);
      const first = (await holdOf())!.expiresAt.getTime();
      expect(first).toBe(T0 + INK_HOLD_TTL_MS);

      for (let m = 5; m <= 45; m += 5) {
        at(m);
        await tick();
        expect((await holdOf())!.expiresAt.getTime()).toBe(T0 + m * MIN + INK_HOLD_TTL_MS);
        if (m === 35) {
          // Without the beat this hold expired at 30 min.
          expect(await releaseExpiredHolds(USER_ID)).toEqual({ settled: 0, released: 0 });
          expect(await holdOf()).toBeDefined();
          expect((await rawUser()).inkTopup).toBe(16);
        }
      }
      expect(extendSpy).toHaveBeenCalledTimes(9);
      await ink.finish({ saved: true, duplicate: false, reference: 'doc-45' });
      ink.sendDone({ ok: true });
    });

    expect(hasEvent(res, 'done')).toBe(true);
    const u = await rawUser();
    expect(u.inkHolds).toEqual([]);
    expect(u.inkTopup).toBe(16);
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ delta: -4, runId: 'run-1', reference: 'doc-45' });
    expect(u.inkSettled).toHaveLength(1);
    expect(liveTimers()).toHaveLength(0);
  });
});

// ── 5b ───────────────────────────────────────────────────────────────────────

describe('5b: the request is killed without cleanup (no beat, no close)', () => {
  async function killedRun() {
    await seed(20);
    const res = makeRes();
    void drive(res, () => new Promise<void>(() => undefined)); // never returns
    await waitUntil(async () => !!(await holdOf()));
    expect(timers).toHaveLength(1); // the timer exists but never fires again
    return res;
  }
  async function waitUntil(cond: () => Promise<boolean>) {
    for (let i = 0; i < 200 && !(await cond()); i++) await flush();
  }

  it('with no completed Generation, the sweep releases it after the TTL', async () => {
    await killedRun();
    at(29);
    expect(await releaseExpiredHolds(USER_ID)).toEqual({ settled: 0, released: 0 });
    at(31);
    expect(await releaseExpiredHolds(USER_ID)).toEqual({ settled: 0, released: 1 });
    const u = await rawUser();
    expect(u.inkHolds).toEqual([]);
    expect(u.inkTopup).toBe(20);
    expect(await rows()).toHaveLength(0);
    expect(extendSpy).not.toHaveBeenCalled();
  });

  it('with a completed Generation, the sweep settles it after the TTL', async () => {
    await killedRun();
    await Generation.create({
      userId: USER_ID,
      docType: 'petition',
      status: 'completed',
      tokensUsed: 10,
      runId: 'run-1',
      runSequence: 1,
      runType: 'initial',
    });
    at(31);
    expect(await releaseExpiredHolds(USER_ID)).toEqual({ settled: 1, released: 0 });
    expect((await rawUser()).inkTopup).toBe(16);
    expect(await rows()).toHaveLength(1);
    expect(extendSpy).not.toHaveBeenCalled();
  });
});

// ── 5c ───────────────────────────────────────────────────────────────────────

describe('5c: the timer is cleared on done, error and disconnect', () => {
  it('on done: cleared by the time withInkHold returns; a stale tick never extends', async () => {
    await seed(20);
    const res = makeRes();
    await drive(res, async (ink) => {
      await ink.finish({ saved: true, duplicate: false });
      expect(liveTimers()).toHaveLength(0); // cleared before settle
      ink.sendDone({});
    });
    expect(liveTimers()).toHaveLength(0);
    expect(timers).toHaveLength(1);
    expect(extendSpy).not.toHaveBeenCalled();
  });

  it('on error (the run releases and sends its own error): cleared, hold released', async () => {
    await seed(20);
    const res = makeRes();
    await drive(res, async (ink) => {
      await ink.release();
      expect(liveTimers()).toHaveLength(0);
    });
    expect(liveTimers()).toHaveLength(0);
    expect((await rawUser()).inkTopup).toBe(20);
    expect(extendSpy).not.toHaveBeenCalled();
  });

  it('on a throw out of run: cleared, the safety net releases the hold, the throw propagates', async () => {
    await seed(20);
    const res = makeRes();
    await expect(
      drive(res, async () => {
        await tick();
        throw new Error('pipeline blew up');
      }),
    ).rejects.toThrow('pipeline blew up');
    expect(liveTimers()).toHaveLength(0);
    const u = await rawUser();
    expect(u.inkHolds).toEqual([]);
    expect(u.inkTopup).toBe(20);
  });

  it('on disconnect: cleared as soon as the response closes, and the finished run is still settled', async () => {
    await seed(20);
    const res = makeRes();
    await drive(res, async (ink) => {
      await tick();
      expect(extendSpy).toHaveBeenCalledTimes(1);
      expect(liveTimers()).toHaveLength(1);
      res.emit('close'); // client left, nothing written
      expect(liveTimers()).toHaveLength(0);
      await ink.finish({ saved: true, duplicate: false });
      ink.sendDone({});
    });
    expect(extendSpy).toHaveBeenCalledTimes(1);
    expect((await rawUser()).inkTopup).toBe(16);
    expect(await rows()).toHaveLength(1);
  });

  it('on disconnect with no saved document: released, not charged', async () => {
    await seed(20);
    const res = makeRes();
    await drive(res, async (ink) => {
      res.emit('close');
      expect(liveTimers()).toHaveLength(0);
      await ink.finish({ saved: false, duplicate: false });
    });
    expect((await rawUser()).inkTopup).toBe(20);
    expect(await rows()).toHaveLength(0);
  });

  it('a beat already in flight finishes before settle starts', async () => {
    await seed(20);
    const res = makeRes();
    let release!: () => void;
    const slow = new Promise<{ extended: boolean }>((r) => {
      release = () => r({ extended: true });
    });
    extendSpy.mockImplementationOnce(() => slow);
    const order: string[] = [];
    await drive(res, async (ink) => {
      timers[0].cb(); // beat starts and hangs
      const fin = ink.finish({ saved: true, duplicate: false }).then(() => order.push('finish'));
      await flush();
      await flush();
      expect(await holdOf()).toBeDefined(); // settle has not run yet
      order.push('beat-done');
      release();
      await fin;
      ink.sendDone({});
    });
    expect(order).toEqual(['beat-done', 'finish']);
    expect(await rows()).toHaveLength(1);
  });
});

// ── failed beat ──────────────────────────────────────────────────────────────

describe('a failed beat', () => {
  it('logs at warn with ids only, the run continues, and the next beat retries and succeeds', async () => {
    await seed(20);
    const logs = captureLogs();
    extendSpy.mockRejectedValueOnce(new Error('secret-driver-text test@test.com Test Advocate'));
    const res = makeRes();
    await drive(res, async (ink) => {
      at(5);
      await tick();
      expect(logs.warn).toHaveBeenCalledTimes(1);
      const w = text(logs.warn);
      expect(w).toContain('runId=run-1');
      expect(w).toContain('runSequence=1');
      for (const pii of PII) expect(w).not.toContain(pii);
      expect((await holdOf())!.expiresAt.getTime()).toBe(T0 + INK_HOLD_TTL_MS); // unchanged

      at(10);
      await tick();
      expect((await holdOf())!.expiresAt.getTime()).toBe(T0 + 10 * MIN + INK_HOLD_TTL_MS);
      await ink.finish({ saved: true, duplicate: false });
      ink.sendDone({});
    });
    expect(hasEvent(res, 'done')).toBe(true);
    expect(logs.warn).toHaveBeenCalledTimes(1);
    expect(await rows()).toHaveLength(1);
    expect((await rawUser()).inkTopup).toBe(16);
  });
});

// ── 5d ───────────────────────────────────────────────────────────────────────

describe('5d: the hold is removed while the run is alive', () => {
  it('released by the sweep: settle re-holds once and the user is charged once, done is sent', async () => {
    await seed(20);
    const holdSpy = jest.spyOn(credits, 'holdInk');
    const res = makeRes();
    await drive(res, async (ink) => {
      expect(await releaseInk(USER_ID, 'run-1', 1)).toEqual({ released: true });
      expect((await rawUser()).inkTopup).toBe(20);
      await ink.finish({ saved: true, duplicate: false, reference: 'doc-r' });
      ink.sendDone({});
    });
    expect(holdSpy).toHaveBeenCalledTimes(2); // the first hold and one re-hold
    expect(hasEvent(res, 'done')).toBe(true);
    expect(hasEvent(res, 'error')).toBe(false);
    const u = await rawUser();
    expect(u.inkTopup).toBe(16);
    expect(u.inkHolds).toEqual([]);
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ delta: -4, reference: 'doc-r' });
    expect(u.inkSettled).toHaveLength(1);
  });

  it('released, and the balance was spent meanwhile: error event with the 402 text, no done, error log with the run id, no PII', async () => {
    await seed(4); // exactly one draft
    const logs = captureLogs();
    const res = makeRes();
    await drive(res, async (ink) => {
      await releaseInk(USER_ID, 'run-1', 1);
      await User.collection.updateOne({ _id: OID }, { $set: { inkTopup: 0 } }); // spent elsewhere
      await ink.finish({ saved: true, duplicate: false });
      ink.sendDone({ title: 'secret-driver-text' }); // must write nothing
    });
    expect(hasEvent(res, 'done')).toBe(false);
    expect(res.writes.join('')).not.toContain('secret-driver-text');
    expect(res.writes).toHaveLength(1);
    const evt = JSON.parse(res.writes[0].replace(/^event: error\ndata: /, '').trim());
    const expected = insufficientInkBody(COST, await getCreditBalance(USER_ID)).message;
    expect(expected).toContain('0');
    expect(evt).toEqual({
      reason: expected,
      retryable: false,
      code: 'insufficient_ink',
      runId: 'run-1',
    });
    expect(res.end).toHaveBeenCalledTimes(1);

    const err = text(logs.error);
    expect(err).toContain('runId=run-1');
    for (const pii of PII) expect(err).not.toContain(pii);
    const u = await rawUser();
    expect(u.inkTopup).toBe(0);
    expect(u.inkHolds).toEqual([]);
    expect(await rows()).toHaveLength(0);
  });

  /** The single SSE error event a withheld draft writes. */
  const withheldEvent = (res: FakeRes) => {
    expect(res.writes).toHaveLength(1);
    return JSON.parse(res.writes[0].replace(/^event: error\ndata: /, '').trim());
  };

  it('T-288: holdInk throws during the re-hold: handled like a refused re-hold (402 text error event, no done), logged by class name only, nothing charged', async () => {
    await seed(20);
    const logs = captureLogs();
    const real = credits.holdInk;
    jest
      .spyOn(credits, 'holdInk')
      .mockImplementationOnce(real)
      .mockRejectedValueOnce(new Error('secret-driver-text test@test.com Test Advocate'));
    const res = makeRes();
    await drive(res, async (ink) => {
      await releaseInk(USER_ID, 'run-1', 1);
      await ink.finish({ saved: true, duplicate: false });
      ink.sendDone({ title: 'secret-driver-text' }); // must write nothing
    });
    expect(hasEvent(res, 'done')).toBe(false);
    expect(res.writes.join('')).not.toContain('secret-driver-text');
    const expected = insufficientInkBody(COST, await getCreditBalance(USER_ID)).message;
    expect(withheldEvent(res)).toEqual({
      reason: expected,
      retryable: false,
      code: 'insufficient_ink',
      runId: 'run-1',
    });
    expect(res.end).toHaveBeenCalledTimes(1);
    const err = text(logs.error);
    expect(err).toContain('re-hold failed');
    expect(err).toContain('runId=run-1');
    expect(err).toContain('Error');
    for (const pii of PII) expect(err).not.toContain(pii);
    const u = await rawUser();
    expect(u.inkTopup).toBe(20); // not charged
    expect(u.inkHolds).toEqual([]);
    expect(await rows()).toHaveLength(0);
  });

  it('T-288: the re-hold succeeds but the retried settleInk throws: the new hold is released, the draft is withheld, no done', async () => {
    await seed(20);
    const logs = captureLogs();
    const real = credits.settleInk;
    jest
      .spyOn(credits, 'settleInk')
      .mockImplementationOnce(real)
      .mockRejectedValueOnce(new Error('secret-driver-text test@test.com'));
    const res = makeRes();
    await drive(res, async (ink) => {
      await releaseInk(USER_ID, 'run-1', 1);
      await ink.finish({ saved: true, duplicate: false });
      ink.sendDone({});
    });
    expect(hasEvent(res, 'done')).toBe(false);
    const evt = withheldEvent(res);
    expect(evt).toMatchObject({ code: 'insufficient_ink', retryable: false, runId: 'run-1' });
    const err = text(logs.error);
    expect(err).toContain('re-hold failed');
    expect(err).toContain('runId=run-1');
    for (const pii of PII) expect(err).not.toContain(pii);
    const u = await rawUser();
    expect(u.inkTopup).toBe(20); // balance back
    expect(u.inkHolds).toEqual([]); // the new hold is gone
    expect(await rows()).toHaveLength(0);
  });

  it('T-288: ...and the release also fails: error log with the ids and the class name, the draft is still withheld', async () => {
    await seed(20);
    const logs = captureLogs();
    const real = credits.settleInk;
    jest
      .spyOn(credits, 'settleInk')
      .mockImplementationOnce(real)
      .mockRejectedValueOnce(new Error('secret-driver-text'));
    const res = makeRes();
    await drive(res, async (ink) => {
      await releaseInk(USER_ID, 'run-1', 1); // real, before the spy is armed
      jest
        .spyOn(credits, 'releaseInk')
        .mockRejectedValueOnce(new TypeError('secret-driver-text test@test.com'));
      await ink.finish({ saved: true, duplicate: false });
      ink.sendDone({});
    });
    expect(hasEvent(res, 'done')).toBe(false);
    expect(withheldEvent(res)).toMatchObject({ code: 'insufficient_ink', runId: 'run-1' });
    const err = text(logs.error);
    expect(err).toContain('releaseInk failed after a failed re-hold');
    expect(err).toContain('runId=run-1');
    expect(err).toContain('runSequence=1');
    expect(err).toContain('TypeError');
    for (const pii of PII) expect(err).not.toContain(pii);
    expect(await rows()).toHaveLength(0); // never charged; the sweep owns the leftover hold
  });

  it('T-288: the re-hold throws AND the balance read for the 402 text fails: reason falls back to "Insufficient Ink", still no done', async () => {
    await seed(20);
    captureLogs();
    const real = credits.holdInk;
    jest
      .spyOn(credits, 'holdInk')
      .mockImplementationOnce(real)
      .mockRejectedValueOnce(new Error('secret-driver-text'));
    jest.spyOn(credits, 'getCreditBalance').mockRejectedValue(new Error('secret-driver-text'));
    const res = makeRes();
    await drive(res, async (ink) => {
      await releaseInk(USER_ID, 'run-1', 1);
      await ink.finish({ saved: true, duplicate: false });
      ink.sendDone({});
    });
    expect(hasEvent(res, 'done')).toBe(false);
    expect(withheldEvent(res)).toEqual({
      reason: 'Insufficient Ink',
      retryable: false,
      code: 'insufficient_ink',
      runId: 'run-1',
    });
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  it('PIN (T-288 scope): wasInkSettled throws: paid-or-not is unknown, so the draft IS delivered and the "could not check" error is logged', async () => {
    await seed(20);
    const logs = captureLogs();
    jest
      .spyOn(credits, 'wasInkSettled')
      .mockRejectedValueOnce(new Error('secret-driver-text test@test.com'));
    const holdSpy = jest.spyOn(credits, 'holdInk');
    const res = makeRes();
    await drive(res, async (ink) => {
      await releaseInk(USER_ID, 'run-1', 1);
      await ink.finish({ saved: true, duplicate: false });
      ink.sendDone({});
    });
    expect(holdSpy).toHaveBeenCalledTimes(1); // no re-hold attempted
    expect(hasEvent(res, 'done')).toBe(true);
    expect(hasEvent(res, 'error')).toBe(false);
    const err = text(logs.error);
    expect(err).toContain('could not check whether it was settled');
    expect(err).toContain('runId=run-1');
    expect(err).toContain('Error');
    for (const pii of PII) expect(err).not.toContain(pii);
  });
});

// ── 5e ───────────────────────────────────────────────────────────────────────

describe('5e: past 60 minutes beats stop and the sweep may release', () => {
  it('beats run up to 55 min, the 60-min tick stops the timer without extending, and the sweep releases once the last extension expires', async () => {
    expect(INK_HOLD_MAX_HEARTBEAT_MS).toBe(60 * MIN);
    await seed(20);
    const res = makeRes();
    let ink!: InkHoldHandle;
    let end!: () => void;
    const ended = new Promise<void>((r) => (end = r));
    const running = drive(res, async (h) => {
      ink = h;
      await ended;
    });
    for (let i = 0; i < 200 && !(await holdOf()); i++) await flush();

    for (let m = 5; m <= 55; m += 5) {
      at(m);
      await tick();
    }
    expect(extendSpy).toHaveBeenCalledTimes(11);
    expect(liveTimers()).toHaveLength(1);

    at(60);
    await tick();
    await flush();
    expect(extendSpy).toHaveBeenCalledTimes(11); // no beat at 60
    expect(liveTimers()).toHaveLength(0);

    // Last extension was at 55 min, so it expires at 85 min.
    at(84);
    expect(await releaseExpiredHolds(USER_ID)).toEqual({ settled: 0, released: 0 });
    at(86);
    expect(await releaseExpiredHolds(USER_ID)).toEqual({ settled: 0, released: 1 });
    expect((await rawUser()).inkTopup).toBe(20);
    expect(ink).toBeDefined();
    end();
    await running;
    expect(await rows()).toHaveLength(0);
  });
});

// ── sweep / route interleaves ────────────────────────────────────────────────

describe('sweep and route racing on one expired hold', () => {
  it('route marks deliver between the sweep read and its release: charged once, one set of rows, the route does NOT re-hold', async () => {
    await seed(20);
    const holdSpy = jest.spyOn(credits, 'holdInk');
    const res = makeRes();
    let gateOpen!: () => void;
    const gate = new Promise<void>((r) => (gateOpen = r));
    const running = drive(res, async (ink) => {
      await gate;
      await ink.finish({ saved: true, duplicate: false, reference: 'doc-race' });
      ink.sendDone({});
    });
    for (let i = 0; i < 200 && !(await holdOf()); i++) await flush();
    await expireNow();

    // The sweep has read the hold as undelivered; before its release the
    // route's settle marks it delivered.
    sweepLookup(async () => {
      await User.collection.updateOne(
        { _id: OID },
        { $set: { 'inkHolds.$[h].deliver': true, 'inkHolds.$[h].reference': 'doc-race' } },
        { arrayFilters: [{ 'h.runId': 'run-1', 'h.runSequence': 1 }] },
      );
    });
    expect(await releaseExpiredHolds(USER_ID)).toEqual({ settled: 1, released: 0 });
    jest.mocked(Generation.findOne).mockRestore();

    // The route's own settle now loses the pull.
    gateOpen();
    await running;
    expect(holdSpy).toHaveBeenCalledTimes(1); // no re-hold
    expect(hasEvent(res, 'done')).toBe(true);
    const u = await rawUser();
    expect(u.inkTopup).toBe(16); // charged once
    expect(u.inkHolds).toEqual([]);
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ delta: -4, reference: 'doc-race' });
    expect(u.inkSettled).toHaveLength(1);
  });

  it('the sweep settles through a completed Generation before the route does: no re-hold, charged once', async () => {
    await seed(20);
    const holdSpy = jest.spyOn(credits, 'holdInk');
    const res = makeRes();
    let gateOpen!: () => void;
    const gate = new Promise<void>((r) => (gateOpen = r));
    const running = drive(res, async (ink) => {
      await gate;
      await ink.finish({ saved: true, duplicate: false });
      ink.sendDone({});
    });
    for (let i = 0; i < 200 && !(await holdOf()); i++) await flush();
    const docId = new mongoose.Types.ObjectId();
    await Generation.create({
      userId: USER_ID,
      docType: 'petition',
      status: 'completed',
      tokensUsed: 10,
      runId: 'run-1',
      runSequence: 1,
      runType: 'initial',
      documentId: docId,
    });
    await expireNow();
    expect(await releaseExpiredHolds(USER_ID)).toEqual({ settled: 1, released: 0 });

    gateOpen();
    await running;
    expect(holdSpy).toHaveBeenCalledTimes(1);
    expect(hasEvent(res, 'done')).toBe(true);
    expect(hasEvent(res, 'error')).toBe(false);
    expect((await rawUser()).inkTopup).toBe(16);
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0].reference).toBe(String(docId));
  });

  it('rule: a run already in inkSettled gets `done` and no re-hold; a run in neither inkHolds nor inkSettled is re-held', async () => {
    await seed(20);
    // In inkSettled (settled elsewhere): no re-hold, done sent.
    let holdSpy = jest.spyOn(credits, 'holdInk');
    const res1 = makeRes();
    await drive(res1, async (ink) => {
      await credits.settleInk(USER_ID, 'run-1', 1); // another settler won
      await ink.finish({ saved: true, duplicate: false });
      ink.sendDone({});
    });
    expect(holdSpy).toHaveBeenCalledTimes(1);
    expect(hasEvent(res1, 'done')).toBe(true);
    expect((await rawUser()).inkTopup).toBe(16);
    expect(await rows()).toHaveLength(1);

    // In neither (released): re-held and charged.
    holdSpy.mockRestore();
    holdSpy = jest.spyOn(credits, 'holdInk');
    const res2 = makeRes();
    await drive(
      res2,
      async (ink) => {
        await releaseInk(USER_ID, 'run-2', 1);
        await ink.finish({ saved: true, duplicate: false });
        ink.sendDone({});
      },
      'run-2',
    );
    expect(holdSpy).toHaveBeenCalledTimes(2);
    expect(hasEvent(res2, 'done')).toBe(true);
    expect((await rawUser()).inkTopup).toBe(12);
    expect(await rows()).toHaveLength(2);
  });

  it('late beat: the sweep reads an expired hold, a beat extends it before the sweep release, the sweep leaves it alone (no refund) and the route then settles once', async () => {
    await seed(20);
    const holdSpy = jest.spyOn(credits, 'holdInk');
    const res = makeRes();
    let gateOpen!: () => void;
    const gate = new Promise<void>((r) => (gateOpen = r));
    const running = drive(res, async (ink) => {
      await gate;
      await ink.finish({ saved: true, duplicate: false, reference: 'doc-late' });
      ink.sendDone({});
    });
    for (let i = 0; i < 200 && !(await holdOf()); i++) await flush();
    await expireNow(); // the sweep will read it as expired

    sweepLookup(async () => {
      // The late beat lands after the sweep's read, before its release.
      expect(await credits.extendInkHold(USER_ID, 'run-1', 1)).toEqual({ extended: true });
    });
    expect(await releaseExpiredHolds(USER_ID)).toEqual({ settled: 0, released: 0 });
    jest.mocked(Generation.findOne).mockRestore();

    const h = await holdOf();
    expect(h).toBeDefined(); // still present
    expect(h!.deliver).toBeUndefined();
    expect(h!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect((await rawUser()).inkTopup).toBe(16); // still held, no refund
    expect(await rows()).toHaveLength(0);

    gateOpen();
    await running;
    expect(holdSpy).toHaveBeenCalledTimes(1); // no re-hold: the hold was never lost
    expect(hasEvent(res, 'done')).toBe(true);
    const u = await rawUser();
    expect(u.inkTopup).toBe(16);
    expect(u.inkHolds).toEqual([]);
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ delta: -4, reference: 'doc-late' });
  });

  it('control: without the late beat, the same undelivered expired hold is released', async () => {
    await seed(20);
    await holdInk({ userId: USER_ID, costCredits: COST, runId: 'run-1', runSequence: 1 });
    await expireNow();
    sweepLookup(async () => undefined);
    expect(await releaseExpiredHolds(USER_ID)).toEqual({ settled: 0, released: 1 });
    expect((await rawUser()).inkTopup).toBe(20);
  });
});

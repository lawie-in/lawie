/**
 * T-372 — the SSE `done` event carries the new Ink balance, read after a confirmed settle.
 * Driven through withInkHold directly (fake req/res, in-memory Mongo), as t226-ink-holds.heartbeat does.
 * Real timers: the balance read is capped at 1 s, and the hang case waits for that cap.
 */
import './setupDb';
import { EventEmitter } from 'events';
import type { Request, Response } from 'express';

import { User } from '../models/User.model';
import { type InkHoldHandle, withInkHold } from '../routes/documents.routes';
import * as credits from '../services/credits.service';
import { getCreditBalance, releaseInk } from '../services/credits.service';

jest.mock('../utils/sse-keepalive', () => ({ startSseKeepAlive: () => () => {} }));
jest.setTimeout(30_000);

const USER_ID = '507f1f77bcf86cd799439372';
const COST = 2; // Ink; 4 storage units
const PII = ['test@test.com', 'Test Advocate', 'secret-driver-text'];
const DONE = { docId: 'd1', rulePack: true, missingClauses: [], disclaimer: 'x' };

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

function drive(res: FakeRes, run: (ink: InkHoldHandle) => Promise<void>) {
  return withInkHold(
    { jwtPayload: { sub: USER_ID } } as unknown as Request,
    res as unknown as Response,
    { runId: 'run-1', runSequence: 1 },
    COST,
    { error: 'Generation failed' },
    run,
  );
}

/** The parsed `done` event, or null. */
function doneOf(res: FakeRes): Record<string, unknown> | null {
  const w = res.writes.find((x) => x.startsWith('event: done\n'));
  return w ? (JSON.parse(w.split('\ndata: ')[1]) as Record<string, unknown>) : null;
}
const normalRun = (ink: InkHoldHandle) =>
  (async () => {
    await ink.finish({ saved: true, duplicate: false });
    ink.sendDone({ ...DONE });
  })();

function captureLogs() {
  return (['error', 'warn', 'log', 'info'] as const).reduce(
    (acc, m) => ({ ...acc, [m]: jest.spyOn(console, m).mockImplementation(() => undefined) }),
    {} as Record<'error' | 'warn' | 'log' | 'info', jest.SpyInstance>,
  );
}
const text = (s: jest.SpyInstance) => s.mock.calls.flat().map(String).join(' ');

beforeEach(async () => {
  await User.create({
    _id: USER_ID,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: 20, // 10 Ink; 8 Ink after one settle
  });
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('done carries balance.totalInk after a confirmed settle', () => {
  it('settled: balance equals getCreditBalance, the existing fields are unchanged', async () => {
    const res = makeRes();
    await drive(res, normalRun);
    const done = doneOf(res);
    expect(done).toEqual({ ...DONE, balance: { totalInk: 8 } });
    expect((await getCreditBalance(USER_ID)).totalInk).toBe(8);
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  it('uses the value getCreditBalance returns (mocked), and only totalInk is sent', async () => {
    jest
      .spyOn(credits, 'getCreditBalance')
      .mockResolvedValue({ totalInk: 41, inkTopup: 41, planTier: 'free' } as never);
    const res = makeRes();
    await drive(res, normalRun);
    expect(doneOf(res)?.balance).toEqual({ totalInk: 41 });
  });

  it('a balance of 0 is sent', async () => {
    jest.spyOn(credits, 'getCreditBalance').mockResolvedValue({ totalInk: 0 } as never);
    const res = makeRes();
    await drive(res, normalRun);
    expect(doneOf(res)?.balance).toEqual({ totalInk: 0 });
  });

  it('paid by the sweep (wasInkSettled true): balance sent, nothing re-held', async () => {
    const real = credits.holdInk;
    const holdSpy = jest.spyOn(credits, 'holdInk').mockImplementation(real);
    jest.spyOn(credits, 'settleInk').mockResolvedValueOnce({ settled: false, reason: 'no_hold' });
    jest.spyOn(credits, 'wasInkSettled').mockResolvedValue(true);
    const res = makeRes();
    await drive(res, normalRun);
    expect(holdSpy).toHaveBeenCalledTimes(1);
    expect(doneOf(res)?.balance).toBeDefined();
  });

  it('retried settle succeeded after a release: balance sent, charged once', async () => {
    const res = makeRes();
    await drive(res, async (ink) => {
      await releaseInk(USER_ID, 'run-1', 1); // the hold is gone and unpaid
      await ink.finish({ saved: true, duplicate: false });
      ink.sendDone({ ...DONE });
    });
    expect(doneOf(res)?.balance).toEqual({ totalInk: 8 });
    expect((await getCreditBalance(USER_ID)).totalInk).toBe(8);
  });

  it('a re-hold answered "duplicate" does not charge twice', async () => {
    const real = credits.holdInk;
    jest
      .spyOn(credits, 'holdInk')
      .mockImplementationOnce(real)
      .mockResolvedValueOnce({ ok: false, reason: 'duplicate' } as never);
    // first settle says the hold is gone and unpaid; the retried settle is the real one
    jest.spyOn(credits, 'settleInk').mockResolvedValueOnce({ settled: false, reason: 'no_hold' });
    jest.spyOn(credits, 'wasInkSettled').mockResolvedValue(false);
    const res = makeRes();
    await drive(res, normalRun);
    expect(doneOf(res)?.balance).toEqual({ totalInk: 8 });
    expect((await getCreditBalance(USER_ID)).totalInk).toBe(8); // 10 - 2, not 10 - 4
  });
});

describe('done without a balance', () => {
  it('getCreditBalance throws: done is still sent, no balance, and the log holds no amount or user data', async () => {
    const logs = captureLogs();
    jest
      .spyOn(credits, 'getCreditBalance')
      .mockRejectedValue(new Error('secret-driver-text test@test.com Test Advocate 8'));
    const res = makeRes();
    await drive(res, normalRun);
    expect(doneOf(res)).toEqual(DONE);
    const warn = text(logs.warn);
    expect(warn).toContain('balance read for done failed');
    expect(warn).toContain('runId=run-1');
    expect(warn).toContain('Error');
    for (const pii of PII) expect(warn).not.toContain(pii);
    expect(warn).not.toMatch(/totalInk|\b8\b/);
    expect(res.writes.join('')).not.toContain('secret-driver-text');
  });

  it('getCreditBalance hangs: done arrives within about a second, no balance', async () => {
    jest.spyOn(credits, 'getCreditBalance').mockImplementation(() => new Promise(() => {}));
    const res = makeRes();
    const started = Date.now();
    await drive(res, normalRun);
    const took = Date.now() - started;
    expect(took).toBeGreaterThanOrEqual(900);
    expect(took).toBeLessThan(2500);
    expect(doneOf(res)).toEqual(DONE);
  });

  it.each([NaN, Infinity, -Infinity, '8', null, undefined])(
    'a non-finite or non-number totalInk (%p) gives no balance',
    async (totalInk) => {
      jest.spyOn(credits, 'getCreditBalance').mockResolvedValue({ totalInk } as never);
      const res = makeRes();
      await drive(res, normalRun);
      expect(doneOf(res)).toEqual(DONE);
    },
  );

  it('a balance read that resolves to nothing gives no balance', async () => {
    jest.spyOn(credits, 'getCreditBalance').mockResolvedValue(undefined as never);
    const res = makeRes();
    await drive(res, normalRun);
    expect(doneOf(res)).toEqual(DONE);
  });

  it('failed settle: no balance and no balance read', async () => {
    logsOff();
    const balanceSpy = jest.spyOn(credits, 'getCreditBalance');
    jest.spyOn(credits, 'settleInk').mockRejectedValue(new Error('db down'));
    const res = makeRes();
    await drive(res, normalRun);
    expect(balanceSpy).not.toHaveBeenCalled();
    expect(doneOf(res)).toEqual(DONE);
  });

  it('settle refused for another reason: no balance read', async () => {
    const balanceSpy = jest.spyOn(credits, 'getCreditBalance');
    jest
      .spyOn(credits, 'settleInk')
      .mockResolvedValue({ settled: false, reason: 'other' } as never);
    const res = makeRes();
    await drive(res, normalRun);
    expect(balanceSpy).not.toHaveBeenCalled();
    expect(doneOf(res)).toEqual(DONE);
  });

  it('withheld draft (re-hold refused): no done, no balance in anything written', async () => {
    logsOff();
    const real = credits.holdInk;
    jest
      .spyOn(credits, 'holdInk')
      .mockImplementationOnce(real)
      .mockResolvedValueOnce({ ok: false, reason: 'insufficient' } as never);
    jest.spyOn(credits, 'wasInkSettled').mockResolvedValue(false);
    const balanceSpy = jest.spyOn(credits, 'getCreditBalance');
    const res = makeRes();
    await drive(res, async (ink) => {
      await releaseInk(USER_ID, 'run-1', 1);
      balanceSpy.mockClear();
      await ink.finish({ saved: true, duplicate: false });
      ink.sendDone({ ...DONE });
    });
    expect(doneOf(res)).toBeNull();
    expect(res.writes.join('')).not.toContain('"balance"');
    // the only balance read is the 402 message of the withheld error, not a done balance
    expect(res.writes.join('')).toContain('insufficient_ink');
  });

  it('duplicate attempt: released, no done balance, no charge', async () => {
    const balanceSpy = jest.spyOn(credits, 'getCreditBalance');
    const res = makeRes();
    await drive(res, async (ink) => {
      await ink.finish({ saved: true, duplicate: true });
    });
    expect(doneOf(res)).toBeNull();
    expect(balanceSpy).not.toHaveBeenCalled();
    expect((await getCreditBalance(USER_ID)).totalInk).toBe(10);
  });

  it('release (failed run): no balance read', async () => {
    const balanceSpy = jest.spyOn(credits, 'getCreditBalance');
    const res = makeRes();
    await drive(res, async (ink) => {
      await ink.release();
    });
    expect(balanceSpy).not.toHaveBeenCalled();
    expect(doneOf(res)).toBeNull();
  });
});

function logsOff() {
  captureLogs();
}

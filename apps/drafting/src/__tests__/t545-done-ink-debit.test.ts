/**
 * T-545 — the SSE `done` event carries `inkDebited`: the Ink actually settled for the run.
 * Present (a number, in Ink = units / 2) only after a settle we can vouch for; ABSENT whenever
 * there was no such settle. 0 and absent are different. Driven through withInkHold directly
 * (fake req/res, in-memory Mongo), as t372-done-balance.test.ts does.
 *
 * Arjun's rulings (22 Oct 2026): flat on done (never under `cost`); the units-to-Ink
 * conversion goes through credits.inkFromUnits only; a warn `ink_debit_unknown` with a
 * stable path tag (runId and path only) on each of the three "delivered, debit unknown" paths;
 * the sweep keeps the full hold, which is what justifies `cost` on the sweep-paid path.
 */
import './setupDb';
import { EventEmitter } from 'events';
import { readFileSync } from 'fs';
import mongoose from 'mongoose';
import { join } from 'path';
import type { Request, Response } from 'express';

import { User } from '../models/User.model';
import { createVerifiedUser } from './verifiedUser';
import { type InkHoldHandle, withInkHold } from '../routes/documents.routes';
import * as credits from '../services/credits.service';
import {
  getCreditBalance,
  inkFromUnits,
  releaseExpiredHolds,
  releaseInk,
} from '../services/credits.service';
import { GOLDEN_SET_USER_ID } from '../services/run-origin';

jest.mock('../utils/sse-keepalive', () => ({ startSseKeepAlive: () => () => {} }));
jest.setTimeout(30_000);

const USER_ID = '507f1f77bcf86cd799439545';
const OID = new mongoose.Types.ObjectId(USER_ID);
const COST = 2; // Ink; 4 storage units
const PII = ['test@test.com', 'Test Advocate', 'secret-driver-text'];
const DONE = { docId: 'd1', rulePack: true, missingClauses: [], disclaimer: 'x' };
const WARN_TAG = 'ink_debit_unknown';

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

function drive(
  res: FakeRes,
  run: (ink: InkHoldHandle) => Promise<void>,
  opts: { userId?: string; cost?: number } = {},
) {
  return withInkHold(
    { jwtPayload: { sub: opts.userId ?? USER_ID } } as unknown as Request,
    res as unknown as Response,
    { runId: 'run-1', runSequence: 1 },
    opts.cost ?? COST,
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
/** The warn calls that carry the T-545 tag. */
const debitWarns = (s: jest.SpyInstance) =>
  s.mock.calls.filter((c) => c.map(String).join(' ').includes(WARN_TAG));

function expectNoDebit(res: FakeRes) {
  const done = doneOf(res);
  expect(done).not.toBeNull();
  expect(done).not.toHaveProperty('inkDebited');
  expect(Object.keys(done as object)).not.toContain('inkDebited');
  expect(res.writes.join('')).not.toContain('inkDebited');
}

beforeEach(async () => {
  await createVerifiedUser({
    _id: USER_ID,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: 20, // 10 Ink; 8 Ink after one 2-Ink settle
  });
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('T-545 inkDebited is PRESENT after a settle we can vouch for', () => {
  it('settled run: inkDebited is units / 2 (Ink, not units), flat on done, and equals the balance drop', async () => {
    const logs = captureLogs();
    const res = makeRes();
    await drive(res, normalRun);
    const done = doneOf(res);
    expect(done?.inkDebited).toBe(2); // 4 units, not 4
    expect(done).toEqual({ ...DONE, inkDebited: 2, balance: { totalInk: 8 } });
    expect(10 - (await getCreditBalance(USER_ID)).totalInk).toBe(done?.inkDebited);
    // flat: not nested under cost (or anything else)
    expect(done).not.toHaveProperty('cost');
    expect(JSON.stringify(done).match(/inkDebited/g)).toHaveLength(1);
    expect(debitWarns(logs.warn)).toHaveLength(0);
  });

  it('a .5 Ink run (1 unit): inkDebited is 0.5', async () => {
    const res = makeRes();
    await drive(res, normalRun, { cost: 0.5 });
    expect(doneOf(res)?.inkDebited).toBe(0.5);
    // getCreditBalance floors to whole Ink; the raw units show the one unit kept
    const raw = (await User.collection.findOne({ _id: OID })) as unknown as { inkTopup: number };
    expect(raw.inkTopup).toBe(19);
  });

  it('ledger_failed (the Ink is kept): inkDebited is still sent', async () => {
    captureLogs();
    jest
      .spyOn(mongoose.mongo.Collection.prototype, 'bulkWrite')
      .mockRejectedValueOnce(new Error('ledger down'));
    const settleSpy = jest.spyOn(credits, 'settleInk');
    const res = makeRes();
    await drive(res, normalRun);
    await expect(settleSpy.mock.results[0].value).resolves.toMatchObject({
      settled: true,
      reason: 'ledger_failed',
      units: 4,
    });
    expect(doneOf(res)?.inkDebited).toBe(2);
    expect((await getCreditBalance(USER_ID)).totalInk).toBe(8); // the Ink really is kept
  });

  it('a real 0-unit settle: inkDebited is 0 (present, not absent)', async () => {
    const real = credits.settleInk;
    jest
      .spyOn(credits, 'settleInk')
      .mockImplementation((u, r, s, _actual, ref) => real(u, r, s, 0, ref));
    const res = makeRes();
    await drive(res, normalRun);
    const done = doneOf(res);
    expect(done).toHaveProperty('inkDebited', 0);
    expect(done?.inkDebited).toBe(0);
    expect((await getCreditBalance(USER_ID)).totalInk).toBe(10); // all refunded
  });

  it('paid by the sweep (no_hold, then wasInkSettled true): inkDebited is the held cost, nothing re-held', async () => {
    const holdSpy = jest.spyOn(credits, 'holdInk');
    const res = makeRes();
    await drive(res, async (ink) => {
      // The sweep settles this run's delivered, expired hold before the route's own settle.
      await User.collection.updateOne(
        { _id: OID },
        { $set: { 'inkHolds.$[h].deliver': true, 'inkHolds.$[h].expiresAt': new Date(0) } },
        { arrayFilters: [{ 'h.runId': 'run-1', 'h.runSequence': 1 }] },
      );
      expect(await releaseExpiredHolds(USER_ID)).toEqual({ settled: 1, released: 0 });
      await ink.finish({ saved: true, duplicate: false });
      ink.sendDone({ ...DONE });
    });
    expect(holdSpy).toHaveBeenCalledTimes(1);
    expect(doneOf(res)?.inkDebited).toBe(COST);
    expect((await getCreditBalance(USER_ID)).totalInk).toBe(8); // charged once, by the sweep
  });

  it('paid by the sweep, mocked settle/wasInkSettled: inkDebited is exactly cost (Ink)', async () => {
    jest.spyOn(credits, 'settleInk').mockResolvedValueOnce({ settled: false, reason: 'no_hold' });
    jest.spyOn(credits, 'wasInkSettled').mockResolvedValue(true);
    const res = makeRes();
    await drive(res, normalRun, { cost: 3.5 });
    expect(doneOf(res)?.inkDebited).toBe(3.5);
  });

  it('re-hold, then the retried settle succeeds: inkDebited is the retried settle, charged once', async () => {
    const res = makeRes();
    await drive(res, async (ink) => {
      await releaseInk(USER_ID, 'run-1', 1); // the hold is gone and unpaid
      await ink.finish({ saved: true, duplicate: false });
      ink.sendDone({ ...DONE });
    });
    expect(doneOf(res)?.inkDebited).toBe(2);
    expect((await getCreditBalance(USER_ID)).totalInk).toBe(8);
  });

  it('client gone but saved: the run is settled, so inkDebited is present', async () => {
    const res = makeRes();
    await drive(res, async (ink) => {
      res.emit('close'); // the client left before done
      await ink.finish({ saved: true, duplicate: false });
      ink.sendDone({ ...DONE });
    });
    expect(doneOf(res)?.inkDebited).toBe(2);
  });

  it('the conversion goes through inkFromUnits only', async () => {
    const spy = jest.spyOn(credits, 'inkFromUnits').mockReturnValue(77);
    const res = makeRes();
    await drive(res, normalRun);
    expect(spy).toHaveBeenCalledWith(4);
    expect(doneOf(res)?.inkDebited).toBe(77);
  });

  it('inkFromUnits is units / 2, and the route never divides by 2 itself', () => {
    expect(inkFromUnits(4)).toBe(2);
    expect(inkFromUnits(5)).toBe(2.5);
    expect(inkFromUnits(1)).toBe(0.5);
    expect(inkFromUnits(0)).toBe(0);
    const src = readFileSync(join(__dirname, '../routes/documents.routes.ts'), 'utf8');
    // (the contract comment mentions "units / 2"; strip comments before checking the code)
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/units\s*\/\s*2/i);
    expect(code).not.toMatch(/inkDebited\s*=\s*[^;\n]*\/\s*2/);
  });

  it('settleInk returns units when Ink is kept, and none for fixture_run and no_hold', async () => {
    const { holdInk, settleInk } = credits;
    await holdInk({ userId: USER_ID, costCredits: 1.5, runId: 'u-a', runSequence: 1 });
    expect(await settleInk(USER_ID, 'u-a', 1)).toMatchObject({ settled: true, units: 3 });
    const noHold = await settleInk(USER_ID, 'u-a', 1);
    expect(noHold).toEqual({ settled: false, reason: 'no_hold' });
    const fx = await settleInk(GOLDEN_SET_USER_ID, 'u-fx', 1);
    expect(fx).toEqual({ settled: true, reason: 'fixture_run' });
    expect(fx).not.toHaveProperty('units');
  });
});

describe('T-545 inkDebited is ABSENT when there is no settle we can vouch for', () => {
  it('settle throws: absent, and the warn carries only runId and the path', async () => {
    const logs = captureLogs();
    jest
      .spyOn(credits, 'settleInk')
      .mockRejectedValue(new Error('secret-driver-text test@test.com Test Advocate'));
    const res = makeRes();
    await drive(res, normalRun);
    expectNoDebit(res);
    const warns = debitWarns(logs.warn);
    expect(warns).toHaveLength(1);
    expect(warns[0]).toHaveLength(1); // one argument: no error class, no amount
    expect(warns[0][0]).toBe('[drafting] ink_debit_unknown (runId=run-1, path=settle_threw)');
    for (const pii of PII) expect(String(warns[0][0])).not.toContain(pii);
    expect(String(warns[0][0])).not.toMatch(/units|\b[24]\b|balance|test@|Error/i);
  });

  it('re-hold, retried settle still no_hold: absent, warn rehold_no_hold', async () => {
    const logs = captureLogs();
    jest.spyOn(credits, 'settleInk').mockResolvedValue({ settled: false, reason: 'no_hold' });
    jest.spyOn(credits, 'wasInkSettled').mockResolvedValue(false);
    const res = makeRes();
    await drive(res, normalRun);
    expectNoDebit(res);
    const warns = debitWarns(logs.warn);
    expect(warns).toHaveLength(1);
    expect(warns[0]).toEqual(['[drafting] ink_debit_unknown (runId=run-1, path=rehold_no_hold)']);
  });

  it('wasInkSettled throws: absent, warn was_settled_threw', async () => {
    const logs = captureLogs();
    jest.spyOn(credits, 'settleInk').mockResolvedValueOnce({ settled: false, reason: 'no_hold' });
    jest
      .spyOn(credits, 'wasInkSettled')
      .mockRejectedValue(new Error('secret-driver-text test@test.com'));
    const res = makeRes();
    await drive(res, normalRun);
    expectNoDebit(res);
    const warns = debitWarns(logs.warn);
    expect(warns).toHaveLength(1);
    expect(warns[0]).toEqual([
      '[drafting] ink_debit_unknown (runId=run-1, path=was_settled_threw)',
    ]);
  });

  it('settle refused for another reason (settled false): absent, no balance', async () => {
    captureLogs();
    jest
      .spyOn(credits, 'settleInk')
      .mockResolvedValue({ settled: false, reason: 'other' } as never);
    const res = makeRes();
    await drive(res, normalRun);
    expectNoDebit(res);
    expect(doneOf(res)).toEqual(DONE);
  });

  it('fixture run: absent (nothing was ever charged), and no warn', async () => {
    const logs = captureLogs();
    const res = makeRes();
    await drive(res, normalRun, { userId: GOLDEN_SET_USER_ID });
    expectNoDebit(res);
    expect(debitWarns(logs.warn)).toHaveLength(0);
  });

  it('duplicate attempt: released, the route still sends done, with no inkDebited and no charge', async () => {
    const logs = captureLogs();
    const res = makeRes();
    await drive(res, async (ink) => {
      await ink.finish({ saved: true, duplicate: true });
      ink.sendDone({ ...DONE });
    });
    expectNoDebit(res);
    expect(debitWarns(logs.warn)).toHaveLength(0);
    expect((await getCreditBalance(USER_ID)).totalInk).toBe(10);
  });

  it('released (client gone and not saved): absent', async () => {
    const logs = captureLogs();
    const res = makeRes();
    await drive(res, async (ink) => {
      res.emit('close');
      await ink.finish({ saved: false, duplicate: false });
      ink.sendDone({ ...DONE });
    });
    expectNoDebit(res);
    expect(debitWarns(logs.warn)).toHaveLength(0);
    expect((await getCreditBalance(USER_ID)).totalInk).toBe(10); // refunded
  });

  it('released by ink.release() (failed run) then done: absent', async () => {
    captureLogs();
    const res = makeRes();
    await drive(res, async (ink) => {
      await ink.release();
      ink.sendDone({ ...DONE });
    });
    expectNoDebit(res);
    expect((await getCreditBalance(USER_ID)).totalInk).toBe(10);
  });

  it('withheld draft (re-hold refused): no done at all, so no inkDebited anywhere', async () => {
    captureLogs();
    const real = credits.holdInk;
    jest
      .spyOn(credits, 'holdInk')
      .mockImplementationOnce(real)
      .mockResolvedValueOnce({ ok: false, reason: 'insufficient' } as never);
    jest.spyOn(credits, 'wasInkSettled').mockResolvedValue(false);
    const res = makeRes();
    await drive(res, async (ink) => {
      await releaseInk(USER_ID, 'run-1', 1);
      await ink.finish({ saved: true, duplicate: false });
      ink.sendDone({ ...DONE });
    });
    expect(doneOf(res)).toBeNull();
    expect(res.writes.join('')).not.toContain('inkDebited');
  });
});

describe('T-545 the sweep keeps the full hold (justifies `cost` on the sweep-paid path)', () => {
  it('a delivered, expired hold is settled by the sweep for the whole hold: units equal the hold, nothing refunded', async () => {
    await credits.holdInk({ userId: USER_ID, costCredits: 3, runId: 'sw-a', runSequence: 1 });
    await User.collection.updateOne(
      { _id: OID },
      { $set: { 'inkHolds.$[h].deliver': true, 'inkHolds.$[h].expiresAt': new Date(0) } },
      { arrayFilters: [{ 'h.runId': 'sw-a' }] },
    );
    expect((await getCreditBalance(USER_ID)).totalInk).toBe(7);
    expect(await releaseExpiredHolds(USER_ID)).toEqual({ settled: 1, released: 0 });
    expect((await getCreditBalance(USER_ID)).totalInk).toBe(7); // no refund
    expect(await credits.wasInkSettled(USER_ID, 'sw-a', 1)).toBe(true);
    const rows = await mongoose.connection
      .db!.collection('inkledger')
      .find({ userId: OID, reason: 'generate' })
      .toArray();
    expect(rows.reduce((sum, r) => sum - (r.delta as number), 0)).toBe(6); // all 6 units
  });

  it('source guard: every settleInk call inside releaseExpiredHolds passes no actualUnits (fails if T-202 changes the sweep)', () => {
    const src = readFileSync(join(__dirname, '../services/credits.service.ts'), 'utf8');
    const start = src.indexOf('export async function releaseExpiredHolds(');
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf('\nexport ', start + 10);
    const body = src.slice(start, end === -1 ? undefined : end);
    const calls: string[][] = [];
    for (let i = body.indexOf('settleInk('); i !== -1; i = body.indexOf('settleInk(', i + 1)) {
      let depth = 0;
      let cur = '';
      const args: string[] = [];
      for (let j = i + 'settleInk('.length; j < body.length; j++) {
        const ch = body[j];
        if (ch === '(' || ch === '[' || ch === '{') depth++;
        if (ch === ')' || ch === ']' || ch === '}') {
          if (depth === 0) break;
          depth--;
        }
        if (ch === ',' && depth === 0) {
          args.push(cur.trim());
          cur = '';
        } else cur += ch;
      }
      if (cur.trim()) args.push(cur.trim());
      calls.push(args);
    }
    expect(calls.length).toBeGreaterThanOrEqual(2); // the settle branch and the re-read branch
    for (const args of calls) {
      // (ownerId, runId, runSequence) or (..., undefined, reference): the 4th is never a number
      expect(args.length === 3 || args[3] === 'undefined').toBe(true);
    }
  });

  it('the sweep charges exactly the held Ink: ledger delta equals the hold, so `cost` is what was debited', async () => {
    const COST_MIXED = 3.5; // 7 units, spread over buckets
    await User.updateOne(
      { _id: USER_ID },
      { $set: { inkSub: 3, inkAnnualCarry: 2, inkTopup: 20 } },
    );
    await credits.holdInk({
      userId: USER_ID,
      costCredits: COST_MIXED,
      runId: 'sw-b',
      runSequence: 1,
    });
    await User.collection.updateOne(
      { _id: OID },
      { $set: { 'inkHolds.$[h].deliver': true, 'inkHolds.$[h].expiresAt': new Date(0) } },
      { arrayFilters: [{ 'h.runId': 'sw-b' }] },
    );
    const before = (await getCreditBalance(USER_ID)).totalInk;
    expect(await releaseExpiredHolds(USER_ID)).toEqual({ settled: 1, released: 0 });
    // Nothing is refunded by the sweep: the balance does not move after the hold.
    expect((await getCreditBalance(USER_ID)).totalInk).toBe(before);
    const rows = await mongoose.connection
      .db!.collection('inkledger')
      .find({ userId: OID, reason: 'generate' })
      .toArray();
    const keptInk = rows.reduce((sum, r) => sum - (r.delta as number), 0) / 2;
    expect(keptInk).toBe(COST_MIXED);
    expect(inkFromUnits(COST_MIXED * 2)).toBe(COST_MIXED);
  });
});

describe('T-545 old client: a loose parse ignores the field', () => {
  it('a client that reads only the pre-T-545 fields gets exactly them, from the same done event', async () => {
    const res = makeRes();
    await drive(res, normalRun);
    const done = doneOf(res) as Record<string, unknown>;
    // What an old client reads.
    const { docId, rulePack, missingClauses, disclaimer, balance } = done;
    expect({ docId, rulePack, missingClauses, disclaimer, balance }).toEqual({
      ...DONE,
      balance: { totalInk: 8 },
    });
    // The field is additive: every pre-existing key is still there with its value.
    for (const [k, v] of Object.entries(DONE)) expect(done[k]).toEqual(v);
  });
});

/**
 * T-577 items 7 and 8 - settle at the delivered band, and AJ-577-M6 (Ajay's condition):
 * for EVERY delivered paragraph count the Ink debited is never more than the quoted Ink
 * (the ceiling shown), across finish(), the sweep, a lost-hold re-hold, done-after-sweep,
 * retries (runSequence > 1) and a second delivered() call (the repair round's final count).
 * Driven through withInkHold with fake req/res (as t545), in-memory Mongo. No model call.
 */
import './setupDb';
import { EventEmitter } from 'events';
import mongoose from 'mongoose';
import type { Request, Response } from 'express';

import { AppSetting } from '../models/AppSetting.model';
import { User } from '../models/User.model';
import { createVerifiedUser } from './verifiedUser';
import { type InkHoldHandle, withInkHold } from '../routes/documents.routes';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import {
  _resetParagraphBandWarnings,
  DraftQuote,
  getCreditBalance,
  holdInk,
  ParagraphQuote,
  quoteDraft,
  releaseExpiredHolds,
  releaseInk,
  settleInkForDelivered,
} from '../services/credits.service';

jest.mock('../utils/sse-keepalive', () => ({ startSseKeepAlive: () => () => {} }));
jest.setTimeout(120_000);

const USER_ID = '507f1f77bcf86cd799439577';
const OID = new mongoose.Types.ObjectId(USER_ID);
const START = 40; // Ink
const DONE = { docId: 'd1', rulePack: true, missingClauses: [], disclaimer: 'x' };

function makeRes() {
  const ee = new EventEmitter() as EventEmitter & Record<string, any>;
  ee.headersSent = false;
  ee.writableFinished = false;
  ee.writes = [] as string[];
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
  quote: DraftQuote,
  run: (ink: InkHoldHandle) => Promise<void>,
  opts: { runId?: string; runSequence?: number } = {},
) {
  return withInkHold(
    { jwtPayload: { sub: USER_ID } } as unknown as Request,
    res as unknown as Response,
    { runId: opts.runId ?? 'run-577', runSequence: opts.runSequence ?? 1, quote },
    quote.ink,
    { error: 'Generation failed' },
    run,
  );
}
const doneOf = (res: FakeRes): Record<string, any> | null => {
  const w = (res.writes as string[]).find((x) => x.startsWith('event: done\n'));
  return w ? JSON.parse(w.split('\ndata: ')[1]) : null;
};
const spent = async (): Promise<number> => START - (await getCreditBalance(USER_ID)).totalInk;
const quoteFor = async (n: number): Promise<ParagraphQuote> => {
  const q = await quoteDraft('bail_regular', { paragraphs: n });
  if (!q || !q.asks) throw new Error('expected an asking quote');
  return q;
};
const topUp = (): Promise<unknown> =>
  User.collection.updateOne(
    { _id: OID },
    { $set: { inkTopup: START * 2, inkSub: 0, inkAnnualCarry: 0 } },
  );
const holdOf = async () => {
  const u = (await User.collection.findOne({ _id: OID })) as any;
  return (u.inkHolds ?? []) as any[];
};
const deliverAndFinish = (count: number) => async (ink: InkHoldHandle) => {
  await ink.delivered(count);
  await ink.finish({ saved: true, duplicate: false });
  ink.sendDone({ ...DONE });
};

beforeEach(async () => {
  _clearAppSettingsCache();
  _resetParagraphBandWarnings();
  await AppSetting.create({
    key: 'pricing.paragraph_bands.base_2',
    value: JSON.stringify([
      { upTo: 10, add: 0 },
      { upTo: 18, add: 1 },
      { upTo: 25, add: 2 },
    ]),
  });
  _clearAppSettingsCache();
  await createVerifiedUser({
    _id: USER_ID,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: START * 2,
  });
});
afterEach(() => jest.restoreAllMocks());

describe('item 7: settle at the delivered band', () => {
  it('finish(): quote 4 (25 asked), deliver 12 -> debit 3 Ink; done.inkDebited 3; ledger 6 units', async () => {
    const q = await quoteFor(25);
    expect(q.ink).toBe(4);
    const res = makeRes();
    let heldQuoted: number | undefined;
    await drive(res, q, async (ink) => {
      heldQuoted = (await holdOf())[0].quotedUnits;
      expect(await ink.delivered(12)).toBe(3);
      expect((await holdOf())[0].settleUnits).toBe(6);
      await ink.finish({ saved: true, duplicate: false });
      ink.sendDone({ ...DONE });
    });
    expect(heldQuoted).toBe(8);
    expect(doneOf(res)!.inkDebited).toBe(3);
    expect(await spent()).toBe(3);
    const rows = await mongoose.connection
      .db!.collection('inkledger')
      .find({ userId: OID, reason: 'generate' })
      .toArray();
    expect(rows.reduce((s, r) => s - (r.delta as number), 0)).toBe(6);
    expect(await holdOf()).toHaveLength(0);
  });

  it('delivered at the quoted band: the full quote is debited', async () => {
    const res = makeRes();
    await drive(res, await quoteFor(25), deliverAndFinish(22));
    expect(doneOf(res)!.inkDebited).toBe(4);
    expect(await spent()).toBe(4);
  });

  it('sweep with stored settleUnits: an expired delivered hold is settled at the delivered band, remainder refunded', async () => {
    const q = await quoteFor(25);
    await holdInk({
      userId: USER_ID,
      costCredits: q.ink,
      runId: 'sw',
      runSequence: 1,
      quoted: true,
    });
    expect((await holdOf())[0].quotedUnits).toBe(8);
    expect(await spent()).toBe(4);
    await User.collection.updateOne(
      { _id: OID },
      {
        $set: {
          'inkHolds.$[h].settleUnits': 6,
          'inkHolds.$[h].deliver': true,
          'inkHolds.$[h].expiresAt': new Date(0),
        },
      },
      { arrayFilters: [{ 'h.runId': 'sw' }] },
    );
    expect(await releaseExpiredHolds(USER_ID)).toEqual({ settled: 1, released: 0 });
    expect(await spent()).toBe(3);
  });

  it('sweep of a quoted hold with no stored settleUnits keeps the full hold (as before)', async () => {
    const q = await quoteFor(25);
    await holdInk({
      userId: USER_ID,
      costCredits: q.ink,
      runId: 'sw2',
      runSequence: 1,
      quoted: true,
    });
    await User.collection.updateOne(
      { _id: OID },
      { $set: { 'inkHolds.$[h].deliver': true, 'inkHolds.$[h].expiresAt': new Date(0) } },
      { arrayFilters: [{ 'h.runId': 'sw2' }] },
    );
    await releaseExpiredHolds(USER_ID);
    expect(await spent()).toBe(4);
  });

  it('lost hold: the hold is gone at finish(); the re-hold of the quote settles at the delivered band', async () => {
    const q = await quoteFor(25);
    const res = makeRes();
    await drive(res, q, async (ink) => {
      await ink.delivered(12);
      await releaseInk(USER_ID, 'run-577', 1);
      expect(await spent()).toBe(0);
      await ink.finish({ saved: true, duplicate: false });
      ink.sendDone({ ...DONE });
    });
    expect(doneOf(res)!.inkDebited).toBe(3);
    expect(await spent()).toBe(3);
  });

  it('done after the sweep settled it: inkDebited is the delivered band, not the quote; one debit only', async () => {
    const q = await quoteFor(25);
    const res = makeRes();
    await drive(res, q, async (ink) => {
      await ink.delivered(12);
      await User.collection.updateOne(
        { _id: OID },
        { $set: { 'inkHolds.$[h].deliver': true, 'inkHolds.$[h].expiresAt': new Date(0) } },
        { arrayFilters: [{ 'h.runId': 'run-577' }] },
      );
      expect(await releaseExpiredHolds(USER_ID)).toEqual({ settled: 1, released: 0 });
      await ink.finish({ saved: true, duplicate: false });
      ink.sendDone({ ...DONE });
    });
    expect(doneOf(res)!.inkDebited).toBe(3);
    expect(await spent()).toBe(3);
  });

  it('a flat quote (pack does not ask): delivered() does nothing, the hold has no quote fields, full price settles', async () => {
    const flat = (await quoteDraft('bail_anticipatory'))!;
    expect(flat.asks).toBe(false);
    const res = makeRes();
    await drive(res, flat, async (ink) => {
      const h = (await holdOf())[0];
      expect(h).not.toHaveProperty('quotedUnits');
      expect(await ink.delivered(3)).toBeUndefined();
      expect((await holdOf())[0]).not.toHaveProperty('settleUnits');
      await ink.finish({ saved: true, duplicate: false });
      ink.sendDone({ ...DONE });
    });
    expect(doneOf(res)!.inkDebited).toBe(flat.ink);
    expect(await spent()).toBe(flat.ink);
  });

  it('a failed run releases the whole hold even after delivered()', async () => {
    const res = makeRes();
    await drive(res, await quoteFor(25), async (ink) => {
      await ink.delivered(12);
      await ink.release();
      ink.sendDone({ ...DONE });
    });
    expect(await spent()).toBe(0);
    expect(doneOf(res)).not.toHaveProperty('inkDebited');
  });
});

describe('item 8 (AJ-577-M6): debit <= quoted Ink for every delivered count', () => {
  const ASKED = [7, 10, 11, 18, 19, 25];
  it('every delivered count 0..26 and 40, each quote: the debit equals the pure settle figure and never exceeds the quote', async () => {
    for (const asked of ASKED) {
      const q = await quoteFor(asked);
      for (const delivered of [...Array.from({ length: 27 }, (_, i) => i), 40]) {
        await topUp();
        const before = (await getCreditBalance(USER_ID)).totalInk;
        const res = makeRes();
        await drive(res, q, deliverAndFinish(delivered), { runId: `r-${asked}-${delivered}` });
        const debit = before - (await getCreditBalance(USER_ID)).totalInk;
        expect(debit).toBeLessThanOrEqual(q.ink);
        expect(debit).toBe(settleInkForDelivered(q, delivered));
        expect(doneOf(res)!.inkDebited).toBe(debit);
        expect(doneOf(res)!.inkDebited).toBeLessThanOrEqual(q.ink);
      }
    }
  });

  it('a retry (runSequence 2) holds the same quote again and is also capped; the first attempt, released, charged nothing', async () => {
    const q = await quoteFor(25);
    const first = makeRes();
    await drive(
      first,
      q,
      async (ink) => {
        await ink.delivered(25);
        await ink.release();
      },
      { runSequence: 1 },
    );
    expect(await spent()).toBe(0);
    const second = makeRes();
    await drive(second, q, deliverAndFinish(9), { runSequence: 2 });
    expect(await spent()).toBe(2);
    expect(doneOf(second)!.inkDebited).toBe(2);
    expect(doneOf(second)!.inkDebited).toBeLessThanOrEqual(q.ink);
  });

  it('retry that delivers more than asked (30 > 25): capped at the quote', async () => {
    const q = await quoteFor(18);
    const res = makeRes();
    await drive(res, q, deliverAndFinish(30), { runSequence: 3 });
    expect(await spent()).toBe(3);
  });

  it('the repair round: delivered() called twice (short first, final count after repair) settles at the last count, still <= quote', async () => {
    const q = await quoteFor(25);
    for (const [firstCount, finalCount] of [
      [5, 20],
      [20, 5],
      [12, 12],
      [0, 30],
    ]) {
      const before = (await getCreditBalance(USER_ID)).totalInk;
      const res = makeRes();
      await drive(
        res,
        q,
        async (ink) => {
          await ink.delivered(firstCount);
          await ink.delivered(finalCount);
          await ink.finish({ saved: true, duplicate: false });
          ink.sendDone({ ...DONE });
        },
        { runId: `rep-${firstCount}-${finalCount}` },
      );
      const debit = before - (await getCreditBalance(USER_ID)).totalInk;
      expect(debit).toBe(settleInkForDelivered(q, finalCount));
      expect(debit).toBeLessThanOrEqual(q.ink);
    }
  });

  it('every ending path (finish, sweep, lost hold, done-after-sweep) stays <= quote for every delivered count', async () => {
    const q = await quoteFor(25);
    for (const delivered of [0, 1, 6, 7, 10, 11, 18, 19, 25, 26, 99]) {
      const want = settleInkForDelivered(q, delivered);
      // lost hold
      await topUp();
      let before = (await getCreditBalance(USER_ID)).totalInk;
      await drive(
        makeRes(),
        q,
        async (ink) => {
          await ink.delivered(delivered);
          await releaseInk(USER_ID, `lh-${delivered}`, 1);
          await ink.finish({ saved: true, duplicate: false });
          ink.sendDone({ ...DONE });
        },
        { runId: `lh-${delivered}` },
      );
      expect(before - (await getCreditBalance(USER_ID)).totalInk).toBe(want);
      // done after sweep
      await topUp();
      before = (await getCreditBalance(USER_ID)).totalInk;
      const res = makeRes();
      await drive(
        res,
        q,
        async (ink) => {
          await ink.delivered(delivered);
          await User.collection.updateOne(
            { _id: OID },
            { $set: { 'inkHolds.$[h].deliver': true, 'inkHolds.$[h].expiresAt': new Date(0) } },
            { arrayFilters: [{ 'h.runId': `ds-${delivered}` }] },
          );
          await releaseExpiredHolds(USER_ID);
          await ink.finish({ saved: true, duplicate: false });
          ink.sendDone({ ...DONE });
        },
        { runId: `ds-${delivered}` },
      );
      const debit = before - (await getCreditBalance(USER_ID)).totalInk;
      expect(debit).toBe(want);
      expect(doneOf(res)!.inkDebited).toBe(want);
      expect(debit).toBeLessThanOrEqual(q.ink);
    }
  });
});

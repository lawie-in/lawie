/**
 * T-226 — Ink holds, at the service level (credits.service): holdInk,
 * releaseInk, settleInk, releaseExpiredHolds, startHoldSweep / stopHoldSweep,
 * and spendInk's awaited writes.
 *
 * Covers AC1 (atomic hold), AC3 (release), AC5 (sweep), AC7 (actualUnits),
 * AC8 (a ledger failure after the pull keeps the Ink; the deliver mark makes the sweep settle), AC9 (a billing
 * renewal leaves the hold alone) and the fixture-user regression (AC6.6).
 * The route-level behaviour is in t226-ink-holds.routes.test.ts.
 *
 * Storage units: 1 Ink = 2 units. holdInk takes Ink, the buckets hold units.
 */
import './setupDb';
import mongoose from 'mongoose';

import { Generation } from '../models/Generation.model';
import { User } from '../models/User.model';
import { createVerifiedUser } from './verifiedUser';
import {
  INK_HOLD_TTL_MS,
  holdInk,
  releaseExpiredHolds,
  releaseInk,
  settleInk,
  spendInk,
  startHoldSweep,
  stopHoldSweep,
  wasInkSettled,
  INK_SETTLED_KEEP,
  extendInkHold,
} from '../services/credits.service';
import { GOLDEN_SET_USER_ID } from '../services/run-origin';

const USER_ID = '507f1f77bcf86cd7994392b1';
const OID = new mongoose.Types.ObjectId(USER_ID);
const TEMP_FIELDS = ['_ds', '_dc', '_dt', '_r1', '_r2', '_h'];

type Balance = { inkSub: number; inkAnnualCarry: number; inkTopup: number };

async function seed(b: Partial<Balance> = {}, userId = USER_ID) {
  await createVerifiedUser({
    _id: userId,
    plan: 'free',
    planTier: 'free',
    inkSub: b.inkSub ?? 0,
    inkAnnualCarry: b.inkAnnualCarry ?? 0,
    inkTopup: b.inkTopup ?? 0,
  });
}

async function rawUser(userId = USER_ID) {
  return (await User.collection.findOne({
    _id: new mongoose.Types.ObjectId(userId),
  })) as unknown as Record<string, unknown> &
    Balance & {
      inkHolds?: Array<Record<string, unknown>>;
      inkSettled?: Array<Record<string, unknown>>;
    };
}

function ledger() {
  return mongoose.connection.db!.collection('inkledger');
}

async function generateRows(runId?: string) {
  return ledger()
    .find({ userId: OID, reason: 'generate', ...(runId ? { runId } : {}) })
    .sort({ sourceBucket: 1 })
    .toArray();
}

function total(u: Balance) {
  return (u.inkSub ?? 0) + (u.inkAnnualCarry ?? 0) + (u.inkTopup ?? 0);
}

/** Move a hold's expiry into the past (a crashed run's hold). */
async function expire(runId: string, runSequence: number, userId = USER_ID) {
  await User.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(userId) },
    { $set: { 'inkHolds.$[h].expiresAt': new Date(Date.now() - 60_000) } },
    { arrayFilters: [{ 'h.runId': runId, 'h.runSequence': runSequence }] },
  );
}

async function completedGeneration(runId: string, runSequence: number, userId = USER_ID) {
  await Generation.create({
    userId,
    docType: 'petition',
    status: 'completed',
    tokensUsed: 10,
    runId,
    runSequence,
    runType: 'initial',
  });
}

afterEach(() => {
  stopHoldSweep();
  jest.restoreAllMocks();
});

describe('holdInk (AC1)', () => {
  it('takes the Ink and records the hold in one write: split by bucket order sub, carry, topup', async () => {
    // 3 Ink = 6 units: 2 from sub, 1 from carry (topup untouched).
    await seed({ inkSub: 2, inkAnnualCarry: 5, inkTopup: 10 });
    const r = await holdInk({ userId: USER_ID, costCredits: 3, runId: 'r-1', runSequence: 1 });
    expect(r.ok).toBe(true);

    const u = await rawUser();
    expect(u.inkSub).toBe(0);
    expect(u.inkAnnualCarry).toBe(1);
    expect(u.inkTopup).toBe(10);
    expect(u.inkHolds).toHaveLength(1);
    expect(u.inkHolds![0]).toMatchObject({
      runId: 'r-1',
      runSequence: 1,
      units: 6,
      unit: 'ink2',
      split: { sub: 2, carry: 4, topup: 0 },
    });
  });

  it("expires the hold INK_HOLD_TTL_MS from now, and the TTL is not below Arjun's 15 minutes", async () => {
    expect(INK_HOLD_TTL_MS).toBeGreaterThanOrEqual(15 * 60 * 1000);
    await seed({ inkTopup: 10 });
    const before = Date.now();
    await holdInk({ userId: USER_ID, costCredits: 1, runId: 'r-ttl', runSequence: 1 });
    const after = Date.now();
    const exp = (await rawUser()).inkHolds![0].expiresAt as Date;
    expect(exp.getTime()).toBeGreaterThanOrEqual(before + INK_HOLD_TTL_MS);
    expect(exp.getTime()).toBeLessThanOrEqual(after + INK_HOLD_TTL_MS);
  });

  it('leaves no temp fields (_ds, _dc, _dt, _r1, _r2) on the user after a hold, a release or a settle', async () => {
    await seed({ inkSub: 1, inkAnnualCarry: 1, inkTopup: 10 });
    await holdInk({ userId: USER_ID, costCredits: 2, runId: 'r-a', runSequence: 1 });
    await holdInk({ userId: USER_ID, costCredits: 1, runId: 'r-b', runSequence: 1 });
    let u = await rawUser();
    for (const f of TEMP_FIELDS) expect(u).not.toHaveProperty(f);

    await releaseInk(USER_ID, 'r-a', 1);
    u = await rawUser();
    for (const f of TEMP_FIELDS) expect(u).not.toHaveProperty(f);

    await settleInk(USER_ID, 'r-b', 1);
    u = await rawUser();
    for (const f of TEMP_FIELDS) expect(u).not.toHaveProperty(f);
  });

  it('refuses with insufficient_ink when the balance is short, and changes nothing', async () => {
    await seed({ inkTopup: 3 }); // 1.5 Ink
    const r = await holdInk({ userId: USER_ID, costCredits: 2, runId: 'r-short', runSequence: 1 });
    expect(r).toEqual({ ok: false, reason: 'insufficient_ink' });
    const u = await rawUser();
    expect(u.inkTopup).toBe(3);
    expect(u.inkHolds).toEqual([]);
  });

  it('refuses with user_not_found for an unknown or malformed user', async () => {
    expect(await holdInk({ userId: USER_ID, costCredits: 1, runId: 'x', runSequence: 1 })).toEqual({
      ok: false,
      reason: 'user_not_found',
    });
    expect(
      await holdInk({ userId: 'not-an-id', costCredits: 1, runId: 'x', runSequence: 1 }),
    ).toEqual({ ok: false, reason: 'user_not_found' });
  });

  it('refuses a second hold for the same (runId, runSequence) as duplicate, even with Ink to spare', async () => {
    await seed({ inkTopup: 100 });
    expect(
      (await holdInk({ userId: USER_ID, costCredits: 1, runId: 'dup', runSequence: 2 })).ok,
    ).toBe(true);
    const again = await holdInk({ userId: USER_ID, costCredits: 1, runId: 'dup', runSequence: 2 });
    expect(again).toEqual({ ok: false, reason: 'duplicate' });
    const u = await rawUser();
    expect(u.inkTopup).toBe(98); // only one hold took Ink
    expect(u.inkHolds).toHaveLength(1);
    // Same run, next sequence, is a different key.
    expect(
      (await holdInk({ userId: USER_ID, costCredits: 1, runId: 'dup', runSequence: 3 })).ok,
    ).toBe(true);
  });

  it('works on a user document with no inkHolds field and no Ink fields at all (treated as 0)', async () => {
    await User.collection.insertOne({ _id: OID, plan: 'free', inkTopup: 4 });
    const r = await holdInk({ userId: USER_ID, costCredits: 2, runId: 'bare', runSequence: 1 });
    expect(r.ok).toBe(true);
    const u = await rawUser();
    expect(u.inkTopup).toBe(0);
    expect(u.inkHolds).toHaveLength(1);
  });

  it('5 parallel holds with different keys on a balance for one: exactly one wins, balance 0', async () => {
    await seed({ inkTopup: 2 }); // one 1-Ink draft
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        holdInk({ userId: USER_ID, costCredits: 1, runId: `par-${i}`, runSequence: 1 }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const refused = results.filter((r) => !r.ok);
    expect(refused).toHaveLength(4);
    for (const r of refused) expect(r).toEqual({ ok: false, reason: 'insufficient_ink' });
    const u = await rawUser();
    expect(total(u)).toBe(0);
    expect(u.inkHolds).toHaveLength(1);
  });

  it('5 parallel holds with the same key and Ink to spare: one wins, four are duplicate, one debit', async () => {
    await seed({ inkTopup: 100 });
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        holdInk({ userId: USER_ID, costCredits: 1, runId: 'same', runSequence: 1 }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === 'duplicate')).toHaveLength(4);
    const u = await rawUser();
    expect(u.inkTopup).toBe(98);
    expect(u.inkHolds).toHaveLength(1);
  });
});

describe('fixture user (AC6.6)', () => {
  it('is never held, settled or released and writes no ledger row', async () => {
    expect(
      await holdInk({ userId: GOLDEN_SET_USER_ID, costCredits: 2, runId: 'fx', runSequence: 1 }),
    ).toEqual({ ok: true, fixture: true });
    expect(await settleInk(GOLDEN_SET_USER_ID, 'fx', 1)).toEqual({
      settled: true,
      reason: 'fixture_run',
    });
    expect(await releaseInk(GOLDEN_SET_USER_ID, 'fx', 1)).toEqual({ released: false });
    expect(await ledger().countDocuments({})).toBe(0);
    expect(await User.collection.countDocuments({})).toBe(0);
  });
});

describe('releaseInk (AC3)', () => {
  it('returns each bucket its split and drops the hold; a second call changes nothing', async () => {
    await seed({ inkSub: 2, inkAnnualCarry: 5, inkTopup: 10 });
    const start = await rawUser();
    await holdInk({ userId: USER_ID, costCredits: 5, runId: 'rel', runSequence: 1 }); // 10 units: 2/5/3
    expect(total(await rawUser())).toBe(total(start) - 10);

    expect(await releaseInk(USER_ID, 'rel', 1)).toEqual({ released: true });
    let u = await rawUser();
    expect({ s: u.inkSub, c: u.inkAnnualCarry, t: u.inkTopup }).toEqual({ s: 2, c: 5, t: 10 });
    expect(u.inkHolds).toEqual([]);

    expect(await releaseInk(USER_ID, 'rel', 1)).toEqual({ released: false });
    u = await rawUser();
    expect({ s: u.inkSub, c: u.inkAnnualCarry, t: u.inkTopup }).toEqual({ s: 2, c: 5, t: 10 });
    expect(await ledger().countDocuments({})).toBe(0); // no ledger row for a release
  });

  it('releases only the hold named, leaving the other holds', async () => {
    await seed({ inkTopup: 20 });
    await holdInk({ userId: USER_ID, costCredits: 1, runId: 'k1', runSequence: 1 });
    await holdInk({ userId: USER_ID, costCredits: 2, runId: 'k2', runSequence: 1 });
    await releaseInk(USER_ID, 'k1', 1);
    const u = await rawUser();
    expect(u.inkHolds).toHaveLength(1);
    expect(u.inkHolds![0].runId).toBe('k2');
    expect(u.inkTopup).toBe(20 - 4);
  });
});

describe('settleInk (AC1, AC7, AC8)', () => {
  it('keeps the Ink, writes one generate row per bucket from the stored split, and drops the hold', async () => {
    await seed({ inkSub: 2, inkAnnualCarry: 5, inkTopup: 10 });
    await holdInk({ userId: USER_ID, costCredits: 5, runId: 'set', runSequence: 1 }); // 2/5/3
    const r = await settleInk(USER_ID, 'set', 1, undefined, 'Bail (doc-1)');
    expect(r).toMatchObject({ settled: true, units: 10 });

    const rows = await generateRows('set');
    expect(rows.map((x) => [x.sourceBucket, x.delta])).toEqual([
      ['annual_carry', -5],
      ['sub', -2],
      ['topup', -3],
    ]);
    for (const row of rows) {
      expect(row).toMatchObject({ reason: 'generate', runSequence: 1, reference: 'Bail (doc-1)' });
    }
    const u = await rawUser();
    expect(u.inkHolds).toEqual([]);
    expect(total(u)).toBe(17 - 10);
    // balanceAfter on the last-written (topup) row is the balance after the whole draft.
    expect(rows.find((x) => x.sourceBucket === 'topup')!.balanceAfter).toBe(7);
  });

  it('is idempotent: a second settle finds no hold and writes nothing more', async () => {
    await seed({ inkTopup: 10 });
    await holdInk({ userId: USER_ID, costCredits: 2, runId: 'idem', runSequence: 1 });
    await settleInk(USER_ID, 'idem', 1);
    const second = await settleInk(USER_ID, 'idem', 1);
    expect(second).toEqual({ settled: false, reason: 'no_hold' });
    expect(await generateRows('idem')).toHaveLength(1);
    expect((await rawUser()).inkTopup).toBe(6);
  });

  it('writes the ledger rows once even if settle runs concurrently twice', async () => {
    await seed({ inkSub: 1, inkTopup: 10 });
    await holdInk({ userId: USER_ID, costCredits: 2, runId: 'conc', runSequence: 1 }); // sub 1, topup 3
    await Promise.all([settleInk(USER_ID, 'conc', 1), settleInk(USER_ID, 'conc', 1)]);
    const rows = await generateRows('conc');
    expect(rows).toHaveLength(2); // sub + topup, once each
    expect(new Set(rows.map((r) => r.sourceBucket)).size).toBe(2);
    expect((await rawUser()).inkHolds).toEqual([]);
  });

  it('with no hold for the key does nothing', async () => {
    await seed({ inkTopup: 10 });
    expect(await settleInk(USER_ID, 'nope', 1)).toEqual({ settled: false, reason: 'no_hold' });
    expect(await ledger().countDocuments({})).toBe(0);
  });

  it('AC7: actualUnits below the hold refunds the difference in the same write as the $pull', async () => {
    await seed({ inkTopup: 20 });
    await holdInk({ userId: USER_ID, costCredits: 5, runId: 'act', runSequence: 1 }); // 10 units
    expect((await rawUser()).inkTopup).toBe(10);

    const r = await settleInk(USER_ID, 'act', 1, 4); // keep 4 of 10
    expect(r).toMatchObject({ settled: true, units: 4 });
    const u = await rawUser();
    expect(u.inkTopup).toBe(16); // 10 left + 6 refunded
    expect(u.inkHolds).toEqual([]);
    const rows = await generateRows('act');
    expect(rows).toHaveLength(1);
    expect(rows[0].delta).toBe(-4);
    expect(rows[0].balanceAfter).toBe(16);
  });

  it('AC7: a refund across buckets keeps the first-taken buckets (sub, carry, topup order)', async () => {
    await seed({ inkSub: 2, inkAnnualCarry: 2, inkTopup: 10 });
    await holdInk({ userId: USER_ID, costCredits: 4, runId: 'mix', runSequence: 1 }); // 8: 2/2/4
    await settleInk(USER_ID, 'mix', 1, 3); // keep 3: sub 2, carry 1; refund carry 1, topup 4
    const u = await rawUser();
    expect({ s: u.inkSub, c: u.inkAnnualCarry, t: u.inkTopup }).toEqual({ s: 0, c: 1, t: 10 });
    const rows = await generateRows('mix');
    const sum = rows.reduce((a, r) => a + (r.delta as number), 0);
    expect(sum).toBe(-3);
  });

  it('AC7: actualUnits of 0 refunds everything and writes no ledger row; above the hold is capped at the hold', async () => {
    await seed({ inkTopup: 20 });
    await holdInk({ userId: USER_ID, costCredits: 2, runId: 'zero', runSequence: 1 });
    await settleInk(USER_ID, 'zero', 1, 0);
    expect((await rawUser()).inkTopup).toBe(20);
    expect(await generateRows('zero')).toHaveLength(0);

    await holdInk({ userId: USER_ID, costCredits: 2, runId: 'over', runSequence: 1 });
    await settleInk(USER_ID, 'over', 1, 999);
    expect((await rawUser()).inkTopup).toBe(16);
    expect((await generateRows('over'))[0].delta).toBe(-4);
  });

  it('AC8: a ledger write failure after the pull keeps the Ink, loses the rows, and logs ids and units only', async () => {
    await seed({ inkTopup: 10 });
    await holdInk({ userId: USER_ID, costCredits: 2, runId: 'lf', runSequence: 1 });
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest
      .spyOn(mongoose.mongo.Collection.prototype, 'bulkWrite')
      .mockRejectedValueOnce(new Error('ledger down'));

    const r = await settleInk(USER_ID, 'lf', 1);
    expect(r).toMatchObject({ settled: true, reason: 'ledger_failed', units: 4 });

    const logged = errSpy.mock.calls.flat().join(' ');
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(logged).toContain(`userId=${USER_ID}`);
    expect(logged).toContain('runId=lf');
    expect(logged).toContain('runSequence=1');
    expect(logged).toContain('units=4');
    expect(logged).not.toContain('ledger down');

    // The hold is gone, the Ink stays kept, and no generate row exists.
    const u = await rawUser();
    expect(u.inkHolds).toEqual([]);
    expect(u.inkTopup).toBe(6);
    expect(await generateRows('lf')).toHaveLength(0);
  });

  it('AC8: a retry of a settle that failed after some rows landed does not double the rows', async () => {
    await seed({ inkSub: 2, inkTopup: 10 });
    await holdInk({ userId: USER_ID, costCredits: 3, runId: 'part', runSequence: 1 }); // sub 2, topup 4
    // Simulate a half-written earlier attempt: the sub row exists already.
    await ledger().insertOne({
      userId: OID,
      delta: -2,
      reason: 'generate',
      sourceBucket: 'sub',
      balanceAfter: 6,
      runId: 'part',
      runSequence: 1,
      createdAt: new Date(),
    });
    await settleInk(USER_ID, 'part', 1);
    const rows = await generateRows('part');
    expect(rows.map((r) => r.sourceBucket).sort()).toEqual(['sub', 'topup']);
    expect((await rawUser()).inkHolds).toEqual([]);
  });
});

describe('settleInk races and faults (Arjun 12 Oct ruling: only the pull winner writes rows)', () => {
  it('5 concurrent settles on one hold: one returns settled, four return no_hold, one set of rows', async () => {
    await seed({ inkSub: 1, inkAnnualCarry: 1, inkTopup: 10 });
    await holdInk({ userId: USER_ID, costCredits: 3, runId: 'race', runSequence: 1 }); // 1/1/4
    const results = await Promise.all(
      Array.from({ length: 5 }, () => settleInk(USER_ID, 'race', 1)),
    );
    expect(results.filter((r) => r.settled)).toHaveLength(1);
    expect(results.filter((r) => !r.settled)).toEqual(
      Array(4).fill({ settled: false, reason: 'no_hold' }),
    );
    expect(results.find((r) => r.settled)).toMatchObject({ settled: true, units: 6 });

    const rows = await generateRows('race');
    expect(rows.map((r) => r.sourceBucket).sort()).toEqual(['annual_carry', 'sub', 'topup']);
    expect(rows.reduce((a, r) => a + (r.delta as number), 0)).toBe(-6);
    const u = await rawUser();
    expect(u.inkHolds).toEqual([]);
    expect(total(u)).toBe(6); // 12 - 6 kept
  });

  it('concurrent settles with actualUnits write one set of rows and refund once', async () => {
    await seed({ inkTopup: 20 });
    await holdInk({ userId: USER_ID, costCredits: 5, runId: 'racea', runSequence: 1 }); // 10 units
    const results = await Promise.all(
      Array.from({ length: 3 }, () => settleInk(USER_ID, 'racea', 1, 4)),
    );
    expect(results.filter((r) => r.settled)).toHaveLength(1);
    expect((await rawUser()).inkTopup).toBe(16); // refunded 6, once
    const rows = await generateRows('racea');
    expect(rows).toHaveLength(1);
    expect(rows[0].delta).toBe(-4);
  });

  it('pull-first regression: the ledger write fails after the pull, no completed Generation: the hold is already gone, so the sweep has nothing to refund', async () => {
    // What this proves: settleInk pulls the hold before it writes rows, so a
    // failed ledger write cannot leave a hold behind for the sweep to release.
    // (The deliver mark is not what protects this case; the pull is.)
    await seed({ inkTopup: 10 });
    await holdInk({ userId: USER_ID, costCredits: 2, runId: 'df', runSequence: 1 });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest
      .spyOn(mongoose.mongo.Collection.prototype, 'bulkWrite')
      .mockRejectedValueOnce(new Error('ledger down'));
    expect(await settleInk(USER_ID, 'df', 1)).toMatchObject({
      settled: true,
      reason: 'ledger_failed',
      units: 4,
    });
    jest.restoreAllMocks();

    // The hold is gone right after the settle, before any sweep runs.
    expect((await rawUser()).inkHolds).toEqual([]);
    expect(await wasInkSettled(USER_ID, 'df', 1)).toBe(true);
    expect(await Generation.countDocuments({ runId: 'df' })).toBe(0);
    expect(await releaseExpiredHolds(USER_ID)).toEqual({ settled: 0, released: 0 });
    const u = await rawUser();
    expect(u.inkTopup).toBe(6); // kept, not refunded
    expect(await generateRows('df')).toHaveLength(0);
  });

  it('process died after the deliver mark but before the pull: the expired hold is settled by the sweep with the stored reference, not released', async () => {
    await seed({ inkSub: 1, inkTopup: 10 });
    await holdInk({ userId: USER_ID, costCredits: 2, runId: 'dd', runSequence: 1 }); // sub 1, topup 3
    // What settleInk's first step leaves behind.
    await User.collection.updateOne(
      { _id: OID },
      { $set: { 'inkHolds.$[h].deliver': true, 'inkHolds.$[h].reference': 'doc-ref-9' } },
      { arrayFilters: [{ 'h.runId': 'dd', 'h.runSequence': 1 }] },
    );
    expect(await Generation.countDocuments({ runId: 'dd' })).toBe(0);
    await expire('dd', 1);

    expect(await releaseExpiredHolds(USER_ID)).toEqual({ settled: 1, released: 0 });
    let u = await rawUser();
    expect(u.inkHolds).toEqual([]);
    expect(total(u)).toBe(7); // 11 - 4 kept, nothing refunded
    expect(u.inkSub).toBe(0);
    expect(u.inkTopup).toBe(7);
    const rows = await generateRows('dd');
    expect(rows.map((r) => r.sourceBucket).sort()).toEqual(['sub', 'topup']);
    expect(rows.reduce((a, r) => a + (r.delta as number), 0)).toBe(-4);
    for (const row of rows) expect(row.reference).toBe('doc-ref-9');

    // A second sweep changes nothing.
    expect(await releaseExpiredHolds(USER_ID)).toEqual({ settled: 0, released: 0 });
    u = await rawUser();
    expect(u.inkTopup).toBe(7);
    expect(await generateRows('dd')).toHaveLength(2);
  });

  it('an expired hold with no deliver mark and no completed Generation is still released (control)', async () => {
    await seed({ inkTopup: 10 });
    await holdInk({ userId: USER_ID, costCredits: 2, runId: 'ctl', runSequence: 1 });
    await expire('ctl', 1);
    expect(await releaseExpiredHolds(USER_ID)).toEqual({ settled: 0, released: 1 });
    expect((await rawUser()).inkTopup).toBe(10);
    expect(await generateRows('ctl')).toHaveLength(0);
  });

  it('concurrent settle and release on one hold: exactly one wins and the balance is consistent', async () => {
    // Repeat to give the race a chance to fall both ways.
    for (let i = 0; i < 12; i++) {
      await User.deleteMany({});
      await ledger().deleteMany({});
      await seed({ inkSub: 1, inkTopup: 10 });
      const runId = `sr-${i}`;
      await holdInk({ userId: USER_ID, costCredits: 2, runId, runSequence: 1 }); // 4 units
      const [s, r] = await Promise.all([
        settleInk(USER_ID, runId, 1),
        releaseInk(USER_ID, runId, 1),
      ]);
      expect(s.settled !== r.released).toBe(true); // exactly one won

      const u = await rawUser();
      expect(u.inkHolds).toEqual([]);
      const rows = await generateRows(runId);
      if (s.settled) {
        expect(total(u)).toBe(7); // kept: 11 - 4
        expect(rows.reduce((a, x) => a + (x.delta as number), 0)).toBe(-4);
      } else {
        expect(total(u)).toBe(11); // refunded
        expect(rows).toHaveLength(0);
      }
    }
  });
});

describe('inkSettled and extendInkHold (T-226 round 3)', () => {
  it('records the settled key in the same write as the pull; a released hold is not recorded', async () => {
    await seed({ inkTopup: 20 });
    await holdInk({ userId: USER_ID, costCredits: 1, runId: 'is-a', runSequence: 1 });
    await holdInk({ userId: USER_ID, costCredits: 1, runId: 'is-b', runSequence: 1 });
    await settleInk(USER_ID, 'is-a', 1);
    await releaseInk(USER_ID, 'is-b', 1);
    expect(await wasInkSettled(USER_ID, 'is-a', 1)).toBe(true);
    expect(await wasInkSettled(USER_ID, 'is-a', 2)).toBe(false);
    expect(await wasInkSettled(USER_ID, 'is-b', 1)).toBe(false);
    expect(await wasInkSettled('not-an-id', 'is-a', 1)).toBe(false);
    const u = await rawUser();
    expect(u.inkSettled).toHaveLength(1);
    expect(u.inkSettled![0]).toMatchObject({ runId: 'is-a', runSequence: 1 });
    expect(u.inkSettled![0].settledAt).toBeInstanceOf(Date);
  });

  it('is capped at INK_SETTLED_KEEP (50): the oldest keys drop, the newest stay', async () => {
    expect(INK_SETTLED_KEEP).toBe(50);
    await seed({ inkTopup: 400 });
    for (let i = 0; i < 55; i++) {
      await holdInk({ userId: USER_ID, costCredits: 1, runId: `cap-${i}`, runSequence: 1 });
      await settleInk(USER_ID, `cap-${i}`, 1);
    }
    const u = await rawUser();
    expect(u.inkSettled).toHaveLength(50);
    expect(u.inkSettled![0].runId).toBe('cap-5');
    expect(u.inkSettled![49].runId).toBe('cap-54');
    expect(await wasInkSettled(USER_ID, 'cap-4', 1)).toBe(false);
    expect(await wasInkSettled(USER_ID, 'cap-54', 1)).toBe(true);
  });

  it('extendInkHold moves expiresAt to now + TTL for that hold only, never creates a hold, and is a no-op for the fixture user', async () => {
    await seed({ inkTopup: 20 });
    await holdInk({ userId: USER_ID, costCredits: 1, runId: 'ext-a', runSequence: 1 });
    await holdInk({ userId: USER_ID, costCredits: 1, runId: 'ext-b', runSequence: 1 });
    await expire('ext-a', 1);
    await expire('ext-b', 1);
    const before = Date.now();
    expect(await extendInkHold(USER_ID, 'ext-a', 1)).toEqual({ extended: true });
    const holds = (await rawUser()).inkHolds!;
    const a = holds.find((h) => h.runId === 'ext-a')!.expiresAt as Date;
    const b = holds.find((h) => h.runId === 'ext-b')!.expiresAt as Date;
    expect(a.getTime()).toBeGreaterThanOrEqual(before + INK_HOLD_TTL_MS);
    expect(b.getTime()).toBeLessThan(before);

    expect(await extendInkHold(USER_ID, 'ghost', 1)).toEqual({ extended: false });
    expect((await rawUser()).inkHolds).toHaveLength(2);
    expect(await extendInkHold(GOLDEN_SET_USER_ID, 'ext-a', 1)).toEqual({ extended: false });
  });

  it('a settled hold is not refunded by a later sweep, and a re-read of a missing hold does nothing', async () => {
    await seed({ inkTopup: 10 });
    await holdInk({ userId: USER_ID, costCredits: 2, runId: 'gone', runSequence: 1 });
    await settleInk(USER_ID, 'gone', 1);
    expect(await releaseExpiredHolds(USER_ID)).toEqual({ settled: 0, released: 0 });
    expect(total(await rawUser())).toBe(6);
  });
});

describe('spendInk (AC8: writes are awaited)', () => {
  it('has written its inkledger rows and removed its temp fields by the time it returns', async () => {
    await seed({ inkSub: 1, inkTopup: 10 });
    const r = await spendInk({
      userId: USER_ID,
      costCredits: 2,
      reason: 'generate',
      runId: 'sp',
      runSequence: 1,
    });
    expect(r.success).toBe(true);
    // No waiting: both writes are already done.
    expect(await generateRows('sp')).toHaveLength(2);
    const u = await rawUser();
    for (const f of TEMP_FIELDS) expect(u).not.toHaveProperty(f);
  });
});

describe('releaseExpiredHolds (AC5)', () => {
  it('settles an expired hold with a completed Generation, releases one with none, leaves a live one; a second run changes nothing', async () => {
    await seed({ inkTopup: 100 });
    await holdInk({ userId: USER_ID, costCredits: 2, runId: 'done-run', runSequence: 1 });
    await holdInk({ userId: USER_ID, costCredits: 3, runId: 'lost-run', runSequence: 1 });
    await holdInk({ userId: USER_ID, costCredits: 1, runId: 'live-run', runSequence: 1 });
    await completedGeneration('done-run', 1);
    await expire('done-run', 1);
    await expire('lost-run', 1);
    expect((await rawUser()).inkTopup).toBe(100 - 4 - 6 - 2);

    const first = await releaseExpiredHolds(USER_ID);
    expect(first).toEqual({ settled: 1, released: 1 });

    let u = await rawUser();
    // done-run kept (4 units gone), lost-run returned (6 back), live-run untouched.
    expect(u.inkTopup).toBe(100 - 4 - 2);
    expect(u.inkHolds!.map((h) => h.runId)).toEqual(['live-run']);
    const rows = await generateRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ runId: 'done-run', delta: -4 });

    const snapshot = { u: await rawUser(), rows: await generateRows() };
    const second = await releaseExpiredHolds(USER_ID);
    expect(second).toEqual({ settled: 0, released: 0 });
    u = await rawUser();
    expect(u).toEqual(snapshot.u);
    expect(await generateRows()).toEqual(snapshot.rows);
  });

  it('a failed Generation does not count as completed: that hold is released', async () => {
    await seed({ inkTopup: 20 });
    await holdInk({ userId: USER_ID, costCredits: 2, runId: 'failed-run', runSequence: 1 });
    await Generation.create({
      userId: USER_ID,
      docType: 'petition',
      status: 'failed',
      tokensUsed: 0,
      runId: 'failed-run',
      runSequence: 1,
      runType: 'initial',
    });
    await expire('failed-run', 1);
    expect(await releaseExpiredHolds(USER_ID)).toEqual({ settled: 0, released: 1 });
    expect((await rawUser()).inkTopup).toBe(20);
    expect(await generateRows()).toHaveLength(0);
  });

  it('a completed Generation for a different sequence of the same run does not settle this hold', async () => {
    await seed({ inkTopup: 20 });
    await holdInk({ userId: USER_ID, costCredits: 2, runId: 'seq-run', runSequence: 2 });
    await completedGeneration('seq-run', 1);
    await expire('seq-run', 2);
    expect(await releaseExpiredHolds(USER_ID)).toEqual({ settled: 0, released: 1 });
    expect((await rawUser()).inkTopup).toBe(20);
  });

  it('with no user id sweeps every user', async () => {
    const other = '507f1f77bcf86cd7994392b2';
    await seed({ inkTopup: 20 });
    await seed({ inkTopup: 20 }, other);
    await holdInk({ userId: USER_ID, costCredits: 1, runId: 'u1', runSequence: 1 });
    await holdInk({ userId: other, costCredits: 1, runId: 'u2', runSequence: 1 });
    await expire('u1', 1);
    await expire('u2', 1, other);
    expect(await releaseExpiredHolds()).toEqual({ settled: 0, released: 2 });
    expect((await rawUser()).inkTopup).toBe(20);
    expect((await rawUser(other)).inkTopup).toBe(20);
  });

  it("a new holdInk first closes that user's expired holds, so a crashed run's Ink is back", async () => {
    await seed({ inkTopup: 2 }); // one 1-Ink draft
    await holdInk({ userId: USER_ID, costCredits: 1, runId: 'crashed', runSequence: 1 });
    // Balance is 0 now; a new draft would be refused...
    expect(
      await holdInk({ userId: USER_ID, costCredits: 1, runId: 'next', runSequence: 1 }),
    ).toEqual({ ok: false, reason: 'insufficient_ink' });
    // ...until the crashed hold expires.
    await expire('crashed', 1);
    const r = await holdInk({ userId: USER_ID, costCredits: 1, runId: 'next', runSequence: 1 });
    expect(r.ok).toBe(true);
    const u = await rawUser();
    expect(u.inkHolds!.map((h) => h.runId)).toEqual(['next']);
  });
});

describe('startHoldSweep / stopHoldSweep', () => {
  it('the background sweep closes an expired hold on its interval; a second start is a no-op; stop ends it', async () => {
    await seed({ inkTopup: 20 });
    await holdInk({ userId: USER_ID, costCredits: 2, runId: 'bg', runSequence: 1 });
    await expire('bg', 1);

    startHoldSweep(20);
    startHoldSweep(20); // no second timer
    const t0 = Date.now();
    while ((await rawUser()).inkHolds!.length > 0) {
      if (Date.now() - t0 > 5000) throw new Error('the sweep did not close the hold');
      await new Promise((r) => setTimeout(r, 20));
    }
    expect((await rawUser()).inkTopup).toBe(20);

    stopHoldSweep();
    stopHoldSweep(); // safe when not running
    // After stop nothing closes a new expired hold.
    await holdInk({ userId: USER_ID, costCredits: 2, runId: 'bg2', runSequence: 1 });
    await expire('bg2', 1);
    await new Promise((r) => setTimeout(r, 150));
    expect((await rawUser()).inkHolds).toHaveLength(1);
  });
});

describe('AC9: a billing renewal while a hold is open', () => {
  it('a $set of the buckets (as ink-ledger.service does) leaves inkHolds untouched', async () => {
    await seed({ inkSub: 4, inkAnnualCarry: 0, inkTopup: 10 });
    await holdInk({ userId: USER_ID, costCredits: 3, runId: 'ren', runSequence: 1 });
    const before = (await rawUser()).inkHolds;
    expect(before).toHaveLength(1);

    // Renewal: the bucket is reset, not incremented.
    await User.collection.updateOne(
      { _id: OID },
      { $set: { inkSub: 600, inkAnnualCarry: 0, inkSubMonthlyAllotment: 600 } },
    );

    const after = await rawUser();
    expect(after.inkHolds).toEqual(before);
    expect(after.inkSub).toBe(600);

    // The hold still closes normally afterwards.
    expect(await settleInk(USER_ID, 'ren', 1)).toMatchObject({ settled: true, units: 6 });
    expect((await rawUser()).inkHolds).toEqual([]);
  });

  it('a renewal or cancel $set of the buckets leaves inkSettled untouched too', async () => {
    await seed({ inkSub: 4, inkTopup: 10 });
    await holdInk({ userId: USER_ID, costCredits: 1, runId: 'ren-s', runSequence: 1 });
    await settleInk(USER_ID, 'ren-s', 1);
    const before = (await rawUser()).inkSettled;
    expect(before).toHaveLength(1);

    // Renewal, then cancel (as billing writes them).
    await User.collection.updateOne(
      { _id: OID },
      { $set: { inkSub: 600, inkAnnualCarry: 0, inkSubMonthlyAllotment: 600 } },
    );
    await User.collection.updateOne(
      { _id: OID },
      { $set: { inkSub: 0, inkAnnualCarry: 0, inkSubMonthlyAllotment: 0 } },
    );
    expect((await rawUser()).inkSettled).toEqual(before);
    expect(await wasInkSettled(USER_ID, 'ren-s', 1)).toBe(true);
  });

  /** Non-test .ts files under `root` that mention any of the user hold fields. */
  function filesTouchingHoldFields(root: string): string[] {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { execFileSync } = require('child_process') as typeof import('child_process');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path') as typeof import('path');
    let out = '';
    try {
      out = execFileSync(
        'grep',
        [
          '-rlE',
          'inkHolds|inkSettled',
          '--include=*.ts',
          '--exclude-dir=node_modules',
          '--exclude-dir=dist',
          '--exclude-dir=__tests__',
          root,
        ],
        { encoding: 'utf8' },
      );
    } catch {
      out = ''; // grep exits 1 for no match
    }
    return out
      .split('\n')
      .filter(Boolean)
      .map((f) => path.relative(root, f))
      .sort();
  }

  it('nothing outside credits.service and the User model writes inkHolds or inkSettled (billing is untouched)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path') as typeof import('path');
    const apps = path.resolve(__dirname, '../../..');
    expect(filesTouchingHoldFields(apps)).toEqual([
      'drafting/src/models/User.model.ts',
      'drafting/src/services/credits.service.ts',
    ]);
  });

  it('T-288: the grep can fail: a file that writes inkSettled (or inkHolds) outside the two allowed files is found', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs') as typeof import('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const os = require('os') as typeof import('os');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path') as typeof import('path');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 't288-grep-'));
    try {
      fs.mkdirSync(path.join(root, 'billing'));
      fs.writeFileSync(path.join(root, 'billing', 'clean.ts'), 'export const a = { inkSub: 0 };\n');
      expect(filesTouchingHoldFields(root)).toEqual([]);

      fs.writeFileSync(
        path.join(root, 'billing', 'renewal.ts'),
        'export const u = { $set: { inkSettled: [] } };\n',
      );
      expect(filesTouchingHoldFields(root)).toEqual(['billing/renewal.ts']);

      fs.writeFileSync(path.join(root, 'billing', 'cancel.ts'), 'const x = { inkHolds: [] };\n');
      expect(filesTouchingHoldFields(root)).toEqual(['billing/cancel.ts', 'billing/renewal.ts']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

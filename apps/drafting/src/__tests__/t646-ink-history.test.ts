/**
 * T-646 — GET /credits/history: the signed-in user's Ink history.
 *
 * Reads the inkledger only, 1 Ink = 2 units, newest first, cursor pages, the running
 * balance computed from the user's buckets (not the stored balanceAfter). Ajay AJ-646-M5
 * (title only, "deleted" flag), M8 (Test Ink label only on a test account), M9b (no bonus line).
 */
import './setupDb';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { createVerifiedUser } from './verifiedUser';
import { GOLDEN_SET_USER_ID } from '../services/run-origin';
import {
  currentBucketsWithHolds,
  getInkHistory,
  replayInkLedger,
  walkBack,
} from '../services/ink-history.service';

jest.setTimeout(60_000);

const SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd7994392d1';
const OTHER_ID = '507f1f77bcf86cd7994392d2';
const OID = new mongoose.Types.ObjectId(USER_ID);
const OTHER_OID = new mongoose.Types.ObjectId(OTHER_ID);
const DAY = 24 * 60 * 60 * 1000;

function hdr(userId = USER_ID) {
  return {
    'x-internal-secret': SECRET,
    'x-user-id': userId,
    'x-user-email': 't@test.com',
    'x-user-name': 'T',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  };
}

const db = () => mongoose.connection.db!;
const ledger = () => db().collection('inkledger');
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

async function seedUser(fields: Record<string, unknown> = {}, id = USER_ID) {
  await createVerifiedUser({ _id: id });
  if (Object.keys(fields).length > 0) {
    await db()
      .collection('users')
      .updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: fields });
  }
}

interface Row {
  delta: number;
  reason: string;
  sourceBucket?: string;
  runId?: string;
  at: Date;
  metadata?: Record<string, unknown>;
  balanceAfter?: number;
  userId?: mongoose.Types.ObjectId;
}
async function seedRows(rows: Row[]) {
  if (rows.length === 0) return;
  await ledger().insertMany(
    rows.map((r) => ({
      userId: r.userId ?? OID,
      delta: r.delta,
      reason: r.reason,
      sourceBucket: r.sourceBucket ?? 'topup',
      ...(r.runId ? { runId: r.runId } : {}),
      ...(r.metadata ? { metadata: r.metadata } : {}),
      ...(r.balanceAfter !== undefined ? { balanceAfter: r.balanceAfter } : {}),
      createdAt: r.at,
    })),
  );
}

async function get(qs = '', userId = USER_ID) {
  return request(app).get(`/credits/history${qs}`).set(hdr(userId));
}

describe('auth and ownership', () => {
  it('401 without the internal secret or without a user', async () => {
    expect((await request(app).get('/credits/history')).status).toBe(401);
    const { 'x-user-id': _omit, ...noUser } = hdr();
    void _omit;
    expect((await request(app).get('/credits/history').set(noUser)).status).toBe(401);
  });

  it('returns only the authenticated user; a userId query parameter is ignored', async () => {
    await seedUser({ inkTopup: 10 });
    await seedUser({ inkTopup: 40 }, OTHER_ID);
    await seedRows([
      { delta: 10, reason: 'topup_purchase', at: daysAgo(2) },
      { delta: 40, reason: 'topup_purchase', at: daysAgo(2), userId: OTHER_OID },
    ]);
    const res = await get(`?userId=${OTHER_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].inkDelta).toBe(5);
    expect(res.body.balance).toBe(5);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('an empty ledger gives no entries and a null cursor', async () => {
    await seedUser();
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ entries: [], balance: 0, nextCursor: null });
  });
});

describe('entries, units and the running balance', () => {
  it('newest first, units halved, labels mapped, balanceAfter replays the buckets (Arjun)', async () => {
    await seedUser({ inkTopup: 34 });
    await seedRows([
      { delta: 10, reason: 'free_seed', at: daysAgo(5), balanceAfter: 10 },
      { delta: 30, reason: 'topup_purchase', at: daysAgo(4), balanceAfter: 40 },
      { delta: -6, reason: 'generate', runId: 'r-a', at: daysAgo(3), balanceAfter: 34 },
    ]);
    const res = await get();
    const e = res.body.entries;
    expect(e.map((x: { label: string }) => x.label)).toEqual(['draft', 'topup', 'signup']);
    expect(e.map((x: { kind: string }) => x.kind)).toEqual(['usage', 'purchase', 'grant']);
    expect(e.map((x: { inkDelta: number }) => x.inkDelta)).toEqual([-3, 15, 5]);
    // replay == stored balanceAfter (units) for a clean bucket
    expect(e.map((x: { balanceAfter: number }) => x.balanceAfter * 2)).toEqual([34, 40, 10]);
    // newest entry == the current balance
    expect(e[0].balanceAfter).toBe(res.body.balance);
    expect(res.body.balance).toBe(17);
    expect(new Date(e[0].createdAt).getTime()).toBeGreaterThan(new Date(e[1].createdAt).getTime());
  });

  it('maps referral, coupon and an unknown reason', async () => {
    await seedUser({ inkTopup: 6 });
    await seedRows([
      { delta: 2, reason: 'referral_bonus', at: daysAgo(3) },
      { delta: 2, reason: 'coupon_grant', at: daysAgo(2) },
      { delta: 2, reason: 'something_new', at: daysAgo(1) },
    ]);
    const res = await get();
    expect(res.body.entries.map((x: { label: string }) => x.label)).toEqual([
      'other',
      'coupon',
      'referral',
    ]);
  });

  it('newest balance includes the units of an open hold (debited, no ledger row yet)', async () => {
    // buckets now 20 units + a hold of 6 units = the ledger's 26
    await seedUser({
      inkTopup: 20,
      inkHolds: [
        {
          runId: 'held',
          runSequence: 1,
          units: 6,
          split: { sub: 0, carry: 0, topup: 6 },
          unit: 'ink2',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 600000),
        },
      ],
    });
    await seedRows([{ delta: 26, reason: 'topup_purchase', at: daysAgo(1) }]);
    const res = await get();
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].balanceAfter).toBe(13);
    expect(res.body.balance).toBe(10);
  });

  it('does not write: user buckets and holds are unchanged after a read', async () => {
    await seedUser({ inkTopup: 20, inkHolds: [] });
    await seedRows([{ delta: 20, reason: 'topup_purchase', at: daysAgo(1) }]);
    await get();
    const u = await db().collection('users').findOne({ _id: OID });
    expect(u!.inkTopup).toBe(20);
    expect(u!.inkHolds).toEqual([]);
  });
});

describe('pagination', () => {
  async function seed25() {
    await seedUser({ inkTopup: 50 });
    await seedRows(
      Array.from({ length: 25 }, (_, i) => ({
        delta: 2,
        reason: 'topup_purchase',
        at: new Date(Date.now() - (30 - i) * 60_000),
      })),
    );
  }

  it('default limit is 20, with a next cursor', async () => {
    await seed25();
    const res = await get();
    expect(res.body.entries).toHaveLength(20);
    expect(res.body.nextCursor).toBe(res.body.entries[19].id);
  });

  it('cursor pages chain without gaps or repeats and end with a null cursor', async () => {
    await seed25();
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res: request.Response = await get(`?limit=10${cursor ? `&cursor=${cursor}` : ''}`);
      expect(res.status).toBe(200);
      seen.push(...res.body.entries.map((x: { id: string }) => x.id));
      cursor = res.body.nextCursor;
      pages++;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);
  });

  it('limit is capped at 100 and a bad limit falls back to the default', async () => {
    await seed25();
    expect((await get('?limit=100000')).body.entries).toHaveLength(25);
    expect((await get('?limit=abc')).body.entries).toHaveLength(20);
    expect((await get('?limit=-3')).body.entries).toHaveLength(20);
    expect((await get('?limit=3')).body.entries).toHaveLength(3);
  });

  it('an unknown cursor is a 400, as is an over-long one', async () => {
    await seed25();
    expect((await get('?cursor=507f1f77bcf86cd7994399ff')).status).toBe(400);
    expect((await get(`?cursor=${'a'.repeat(100)}`)).status).toBe(400);
  });

  it("another user's entry id is not a valid cursor for me", async () => {
    await seedUser({ inkTopup: 2 });
    await seedUser({ inkTopup: 2 }, OTHER_ID);
    await seedRows([{ delta: 2, reason: 'topup_purchase', at: daysAgo(1) }]);
    await seedRows([{ delta: 2, reason: 'topup_purchase', at: daysAgo(1), userId: OTHER_OID }]);
    const theirs = await get('', OTHER_ID);
    expect((await get(`?cursor=${theirs.body.entries[0].id}`)).status).toBe(400);
  });
});

describe('usage grouping and document titles', () => {
  it('consecutive usage rows of one run are one entry; another run is another', async () => {
    await seedUser({ inkSub: 0, inkTopup: 8 });
    await seedRows([
      { delta: 20, reason: 'topup_purchase', at: daysAgo(5) },
      {
        delta: -4,
        reason: 'generate',
        runId: 'run-1',
        sourceBucket: 'sub',
        at: new Date(Date.now() - 4 * DAY),
      },
      {
        delta: -6,
        reason: 'generate',
        runId: 'run-1',
        sourceBucket: 'topup',
        at: new Date(Date.now() - 4 * DAY + 1000),
      },
      {
        delta: -2,
        reason: 'regenerate',
        runId: 'run-1',
        sourceBucket: 'topup',
        at: new Date(Date.now() - 4 * DAY + 2000),
      },
      { delta: -4, reason: 'generate', runId: 'run-2', sourceBucket: 'topup', at: daysAgo(3) },
    ]);
    // the sub bucket had 4 units that the first row spent; give it to the user via an earlier grant
    await seedRows([{ delta: 4, reason: 'admin_grant', sourceBucket: 'sub', at: daysAgo(6) }]);
    const res = await get();
    const usage = res.body.entries.filter((x: { kind: string }) => x.kind === 'usage');
    expect(usage).toHaveLength(2);
    expect(usage[0].inkDelta).toBe(-2); // run-2
    expect(usage[1].inkDelta).toBe(-6); // run-1: 4 + 6 + 2 units
  });

  it('shows the document title only; a deleted or missing document is flagged, never named', async () => {
    await seedUser({ inkTopup: 0 });
    const docOk = new mongoose.Types.ObjectId();
    const docGone = new mongoose.Types.ObjectId();
    await db()
      .collection('documents')
      .insertMany([
        {
          _id: docOk,
          userId: OID,
          title: 'Bail application Ram Kumar',
          runId: 'run-ok',
          isDeleted: false,
          content: 'SECRET-BODY-TEXT',
          sections: [{ text: 'SECRET-SECTION-TEXT' }],
          createdAt: new Date(),
        },
        {
          _id: docGone,
          userId: OID,
          title: 'Hidden title',
          runId: 'run-gone',
          isDeleted: true,
          content: 'SECRET-BODY-TEXT',
          createdAt: new Date(),
        },
      ]);
    await db()
      .collection('generations')
      .insertMany([
        { userId: OID, runId: 'run-ok', runSequence: 1, documentId: docOk },
        { userId: OID, runId: 'run-gone', runSequence: 1, documentId: docGone },
      ]);
    await seedRows([
      { delta: 20, reason: 'topup_purchase', at: daysAgo(6) },
      { delta: -2, reason: 'generate', runId: 'run-ok', at: daysAgo(5) },
      { delta: -2, reason: 'generate', runId: 'run-gone', at: daysAgo(4) },
      { delta: -2, reason: 'generate', runId: 'run-never', at: daysAgo(3) },
      { delta: -2, reason: 'generate', at: daysAgo(2) }, // pre-T-003, no run id
    ]);
    await db()
      .collection('users')
      .updateOne({ _id: OID }, { $set: { inkTopup: 12 } });
    const res = await get();
    const [noRun, never, gone, ok] = res.body.entries;
    expect(ok).toMatchObject({
      documentTitle: 'Bail application Ram Kumar',
      documentDeleted: false,
    });
    expect(gone).toMatchObject({ documentTitle: null, documentDeleted: true });
    expect(never).toMatchObject({ documentTitle: null, documentDeleted: true });
    expect(noRun).toMatchObject({ documentTitle: null, documentDeleted: false });
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain('SECRET-BODY-TEXT');
    expect(raw).not.toContain('SECRET-SECTION-TEXT');
    expect(raw).not.toContain('Hidden title');
    expect(Object.keys(ok).sort()).toEqual(
      [
        'balanceAfter',
        'createdAt',
        'documentDeleted',
        'documentTitle',
        'id',
        'inkDelta',
        'kind',
        'label',
      ].sort(),
    );
  });

  it("another user's document with the same runId is never shown", async () => {
    await seedUser({ inkTopup: 0 });
    await db().collection('documents').insertOne({
      userId: OTHER_OID,
      title: 'Not yours',
      runId: 'run-x',
      isDeleted: false,
      createdAt: new Date(),
    });
    await seedRows([
      { delta: 4, reason: 'topup_purchase', at: daysAgo(3) },
      { delta: -4, reason: 'generate', runId: 'run-x', at: daysAgo(2) },
    ]);
    const res = await get();
    expect(res.body.entries[0].documentTitle).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain('Not yours');
  });

  it('a document with a pending deletion request counts as deleted', async () => {
    await seedUser({ inkTopup: 0 });
    await db()
      .collection('documents')
      .insertOne({
        userId: OID,
        title: 'Going away',
        runId: 'run-d',
        isDeleted: false,
        deletion: { requestedAt: new Date() },
        createdAt: new Date(),
      });
    await seedRows([
      { delta: 4, reason: 'topup_purchase', at: daysAgo(3) },
      { delta: -4, reason: 'generate', runId: 'run-d', at: daysAgo(2) },
    ]);
    const e = (await get()).body.entries[0];
    expect(e).toMatchObject({ documentTitle: null, documentDeleted: true });
  });
});

describe('labels: Ajay M8 test grant, refund reversal, plan changes', () => {
  async function labelFor(isTestAccount: unknown) {
    await seedUser(
      isTestAccount === undefined ? { inkTopup: 20 } : { inkTopup: 20, isTestAccount },
    );
    await seedRows([{ delta: 20, reason: 'test_grant', at: daysAgo(1) }]);
    return (await get()).body.entries[0].label;
  }

  it('test_grant label only when users.isTestAccount is exactly true', async () => {
    expect(await labelFor(true)).toBe('test_grant');
  });
  it.each([[false], [undefined], ['true'], [1]])(
    'test_grant row on a non-test account (%p) shows admin_grant',
    async (flag) => {
      expect(await labelFor(flag)).toBe('admin_grant');
    },
  );

  // AJ-646-M11 (1f07122c) condition 2: "Test Ink" only for test or fixture accounts.
  // getInkHistory returns an empty page for the golden-set fixture user before it reads
  // any row, so the fixture user never gets a label at all, and in particular never a
  // real-looking one. The `|| isFixtureUser(userId)` in the replay call is therefore not
  // reachable through getInkHistory (reported to the lead).
  it('the fixture user: a test_grant row is never listed, so no label shows (no leak)', async () => {
    const fixtureOid = new mongoose.Types.ObjectId(GOLDEN_SET_USER_ID);
    await seedUser({ inkTopup: 20 }, GOLDEN_SET_USER_ID);
    await seedRows([{ delta: 20, reason: 'test_grant', at: daysAgo(1), userId: fixtureOid }]);
    const page = await getInkHistory(GOLDEN_SET_USER_ID);
    expect(page.entries).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  it('a real user (isTestAccount false or absent) never gets test_grant, with or without other rows', async () => {
    await seedUser({ inkTopup: 24, isTestAccount: false });
    await seedRows([
      { delta: 20, reason: 'test_grant', at: daysAgo(2) },
      { delta: 4, reason: 'admin_grant', at: daysAgo(1) },
    ]);
    const labels = (await getInkHistory(USER_ID)).entries.map((e) => e.label);
    expect(labels).toEqual(['admin_grant', 'admin_grant']);
    expect(labels).not.toContain('test_grant');
  });

  it('a test account (isTestAccount === true) still gets test_grant through getInkHistory', async () => {
    await seedUser({ inkTopup: 20, isTestAccount: true });
    await seedRows([{ delta: 20, reason: 'test_grant', at: daysAgo(1) }]);
    expect((await getInkHistory(USER_ID)).entries.map((e) => e.label)).toEqual(['test_grant']);
  });

  it('admin_grant is admin_grant for everyone', async () => {
    await seedUser({ inkTopup: 4, isTestAccount: true });
    await seedRows([{ delta: 4, reason: 'admin_grant', at: daysAgo(1) }]);
    expect((await get()).body.entries[0].label).toBe('admin_grant');
  });

  it('refund_reversal: one entry for a debit that spans buckets, with the split replayed', async () => {
    // before: sub 4, topup 20 units (12 Ink). Reversal takes 4 from sub and 8 from topup.
    await seedUser({ inkSub: 0, inkTopup: 12 });
    await seedRows([
      { delta: 4, reason: 'admin_grant', sourceBucket: 'sub', at: daysAgo(4) },
      { delta: 20, reason: 'topup_purchase', sourceBucket: 'topup', at: daysAgo(3) },
      {
        delta: -12,
        reason: 'refund_reversal',
        sourceBucket: 'topup',
        at: daysAgo(1),
        metadata: { buckets: { sub: 4, annual_carry: 0, topup: 8 } },
      },
    ]);
    const e = (await get()).body.entries;
    expect(e[0]).toMatchObject({
      kind: 'refund_reversal',
      label: 'refund_reversal',
      inkDelta: -6,
      balanceAfter: 6,
    });
    expect(e[1].balanceAfter).toBe(12);
    expect(e[2].balanceAfter).toBe(2);
  });

  it('AJ-646-M10c: a linked refund of a 0-Ink payment shows the Refund row with the full -n reversed', async () => {
    // The plan grant (100 units = 50 Ink) was won by a charge whose own Payment row says 0 Ink;
    // the refund of that charge reverses the whole grant against the named grant row.
    await seedUser({ inkSub: 0 });
    await seedRows([
      {
        delta: 100,
        reason: 'sub_renewal',
        sourceBucket: 'sub',
        at: daysAgo(3),
        metadata: { razorpayPaymentId: 'pay_zero_ink' },
      },
      {
        delta: -100,
        reason: 'refund_reversal',
        sourceBucket: 'sub',
        at: daysAgo(1),
        metadata: {
          razorpayPaymentId: 'pay_zero_ink',
          refundId: 'rfnd_zero_ink',
          dueUnits: 100,
          grantLedgerId: 'led_grant_1',
          grantPaymentId: 'pay_zero_ink',
          buckets: { sub: 100, annual_carry: 0, topup: 0 },
        },
      },
    ]);
    const e = (await get()).body.entries;
    expect(e[0]).toMatchObject({
      kind: 'refund_reversal',
      label: 'refund_reversal',
      inkDelta: -50,
      balanceAfter: 0,
    });
    expect(e[1]).toMatchObject({ inkDelta: 50, balanceAfter: 50 });
    // Ids from the billing metadata never reach the customer's history.
    expect(JSON.stringify(e)).not.toMatch(/pay_zero_ink|rfnd_zero_ink|led_grant_1/);
  });

  it('a pending refund reversal (delta 0) is not shown', async () => {
    await seedUser({ inkTopup: 4 });
    await seedRows([
      { delta: 4, reason: 'topup_purchase', at: daysAgo(2) },
      { delta: 0, reason: 'refund_reversal', at: daysAgo(1) },
    ]);
    const e = (await get()).body.entries;
    expect(e).toHaveLength(1);
    expect(e[0].label).toBe('topup');
  });

  it('plan renewal SETS the plan bucket: leftover shows as plan_ink_ended, then the plan grant; the older renewal outside the window is the start', async () => {
    await seedUser({ inkSub: 600 });
    await seedRows([
      { delta: 400, reason: 'sub_renewal', sourceBucket: 'sub', at: daysAgo(100) }, // outside the window
      { delta: -100, reason: 'generate', runId: 'rp', sourceBucket: 'sub', at: daysAgo(20) },
      { delta: 600, reason: 'sub_renewal', sourceBucket: 'sub', at: daysAgo(10) },
    ]);
    const res = await get();
    const e = res.body.entries;
    expect(e.map((x: { label: string }) => x.label)).toEqual(['plan', 'plan_ink_ended', 'draft']);
    expect(e.map((x: { inkDelta: number }) => x.inkDelta)).toEqual([300, -150, -50]);
    expect(e.map((x: { balanceAfter: number }) => x.balanceAfter)).toEqual([300, 0, 150]);
    expect(res.body.balance).toBe(300);
  });

  it('cancel/expire zero plan and carry: one plan_ended entry for what was removed', async () => {
    await seedUser({ inkSub: 0, inkAnnualCarry: 0, inkTopup: 20 });
    await seedRows([
      { delta: 20, reason: 'topup_purchase', sourceBucket: 'topup', at: daysAgo(9) },
      { delta: 100, reason: 'sub_renewal', sourceBucket: 'sub', at: daysAgo(8) },
      { delta: 0, reason: 'sub_cancelled', sourceBucket: 'sub', at: daysAgo(2) },
    ]);
    const e = (await get()).body.entries;
    expect(e[0]).toMatchObject({
      label: 'plan_ended',
      kind: 'other',
      inkDelta: -50,
      balanceAfter: 10,
    });
    expect(e[1]).toMatchObject({ label: 'plan', inkDelta: 50 });
  });
});

describe('window: 90 days or 500 rows, whichever is smaller', () => {
  it('rows older than 90 days are not listed', async () => {
    await seedUser({ inkTopup: 8 });
    await seedRows([
      { delta: 4, reason: 'topup_purchase', at: daysAgo(95) },
      { delta: 4, reason: 'topup_purchase', at: daysAgo(89) },
      { delta: 0, reason: 'topup_purchase', at: daysAgo(1) },
    ]);
    const res = await get();
    expect(res.body.entries).toHaveLength(1);
    // the walk-back starts from the real buckets: the older row is part of the opening 4 units
    expect(res.body.entries[0].balanceAfter).toBe(4);
  });

  it('with more than 500 rows in 90 days only the newest 500 are listed, balances still right', async () => {
    await seedUser({ inkTopup: 2 * 520 });
    const base = Date.now() - 30 * DAY;
    await seedRows(
      Array.from({ length: 520 }, (_, i) => ({
        delta: 2,
        reason: 'topup_purchase',
        at: new Date(base + i * 60_000),
      })),
    );
    const ids: string[] = [];
    let last: { balanceAfter: number } | undefined;
    let cursor: string | null = null;
    let guard = 0;
    do {
      const res: request.Response = await get(`?limit=100${cursor ? `&cursor=${cursor}` : ''}`);
      expect(res.status).toBe(200);
      for (const e of res.body.entries) {
        ids.push(e.id);
        last = e;
      }
      cursor = res.body.nextCursor;
      guard++;
    } while (cursor && guard < 10);
    expect(ids).toHaveLength(500);
    expect(new Set(ids).size).toBe(500);
    // the oldest listed entry is row 21 of 520: 21 Ink-units-of-2 = 21 Ink
    expect(last!.balanceAfter).toBe(21);
  });
});

describe('M9b: nothing but Ink', () => {
  it('legacy creditledgers (earnedCredits) rows never appear and no entry says bonus', async () => {
    await seedUser({ inkTopup: 4 });
    await db()
      .collection('creditledgers')
      .insertMany([
        { userId: OID, delta: 5, reason: 'referral_bonus', createdAt: daysAgo(1) },
        { userId: OID, delta: 3, reason: 'bonus', createdAt: daysAgo(2) },
      ]);
    await seedRows([{ delta: 4, reason: 'topup_purchase', at: daysAgo(3) }]);
    const res = await get();
    expect(res.body.entries).toHaveLength(1);
    expect(JSON.stringify(res.body).toLowerCase()).not.toContain('bonus');
    expect(res.body.entries[0].label).toBe('topup');
  });

  it('a referral_bonus row in inkledger is labelled referral, not bonus', async () => {
    await seedUser({ inkTopup: 4 });
    await seedRows([{ delta: 4, reason: 'referral_bonus', at: daysAgo(1) }]);
    const body = JSON.stringify((await get()).body).toLowerCase();
    expect(body).toContain('"referral"');
    expect(body).not.toContain('bonus');
  });
});

describe('source guard', () => {
  it('ink-history.service only reads: no update/insert/delete calls and no logging of titles', () => {
    const raw = fs.readFileSync(
      path.resolve(__dirname, '../services/ink-history.service.ts'),
      'utf8',
    );
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(src).not.toMatch(
      /\.(updateOne|updateMany|findOneAndUpdate|insertOne|insertMany|deleteOne|deleteMany|bulkWrite|replaceOne)\(/,
    );
    expect(src).not.toMatch(/logger\./);
    expect(src).not.toMatch(/\$set|\$inc|\$push|\$pull/);
  });

  it('the route takes the user from the auth context only', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../routes/ink-history.routes.ts'), 'utf8');
    expect(src).toContain('req.jwtPayload!.sub');
    expect(src).not.toMatch(/req\.(query|params|body)\.userId/);
  });
});

describe('pure helpers', () => {
  const oid = (n: number) => `row${n}`;
  it('replayInkLedger adds per bucket and never goes below zero', () => {
    const out = replayInkLedger(
      [
        {
          _id: oid(1),
          delta: 10,
          reason: 'topup_purchase',
          sourceBucket: 'topup',
          createdAt: new Date(1000),
        },
        {
          _id: oid(2),
          delta: -30,
          reason: 'generate',
          sourceBucket: 'topup',
          runId: 'r',
          createdAt: new Date(2000),
        },
      ],
      {},
    );
    expect(out.map((d) => d.balanceUnits)).toEqual([10, 0]);
  });

  it('replayInkLedger honours isTestAccount only for test_grant', () => {
    const row = [
      { _id: 'a', delta: 2, reason: 'test_grant', sourceBucket: 'topup', createdAt: new Date(1) },
    ];
    expect(replayInkLedger(row, { isTestAccount: true })[0].label).toBe('test_grant');
    expect(replayInkLedger(row, { isTestAccount: false })[0].label).toBe('admin_grant');
    expect(replayInkLedger(row)[0].label).toBe('admin_grant');
  });

  it('walkBack undoes rows newest first and reports set buckets as unknown', () => {
    const r = walkBack({ sub: 0, annual_carry: 0, topup: 30 }, [
      { _id: '2', delta: -10, reason: 'generate', sourceBucket: 'topup' },
      { _id: '1', delta: 40, reason: 'topup_purchase', sourceBucket: 'topup' },
    ]);
    expect(r.state.topup).toBe(0);
    expect(r.unknown.size).toBe(0);
    const u = walkBack({ sub: 5, annual_carry: 0, topup: 0 }, [
      { _id: '3', delta: 0, reason: 'sub_cancelled', sourceBucket: 'sub' },
    ]);
    expect([...u.unknown].sort()).toEqual(['annual_carry', 'sub']);
  });

  it('currentBucketsWithHolds adds open hold splits back', () => {
    expect(
      currentBucketsWithHolds({
        inkSub: 2,
        inkAnnualCarry: 0,
        inkTopup: 4,
        inkHolds: [{ split: { sub: 2, carry: 1, topup: 3 } }, { split: { topup: 1 } }],
      }),
    ).toEqual({ sub: 4, annual_carry: 1, topup: 8 });
    expect(currentBucketsWithHolds({})).toEqual({ sub: 0, annual_carry: 0, topup: 0 });
  });
});

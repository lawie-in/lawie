import './setupDb';
import './setupEnv';
import * as Sentry from '@sentry/node';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { findSubscriptionPlan } from '../config/credit-skus';
import logger from '../config/logger';
import { Payment } from '../models/Payment.model';
import { User } from '../models/User.model';

import {
  headers,
  refundPayload,
  seedSub,
  seedUser,
  subPayload,
  unix,
  webhook,
} from './t436-helpers';

// T-646 round 3b (Arjun's final rules, confirmed by Vikram):
//  P: Ink is taken back only by refunding the charge that granted it.
//  (a) attribution by payment id: the sub_renewal row stores metadata.razorpayPaymentId.
//  (b) option B backstop: due = min(proRata, grantDelta - alreadyReversed) per grant id.
//  (d) GET /payments: inkReversalLinked rows show the stored reversal, uncapped.
//  (g) a lost-claim subscription.charged stamps its payment id on the cycle's grant row.

jest.mock('../config/razorpay', () => ({
  razorpay: {
    subscriptions: { create: jest.fn(), fetch: jest.fn() },
    invoices: { fetch: jest.fn() },
  },
}));
jest.mock('@sentry/node', () => ({
  ...jest.requireActual('@sentry/node'),
  withScope: jest.fn(),
  captureMessage: jest.fn(),
  captureException: jest.fn(),
}));

const SUB = 'sub_t436';
const PLAN = findSubscriptionPlan('solo_monthly')!;
const PLAN_UNITS = PLAN.inkPerCycle * 2;

const ledger = () => mongoose.connection.db!.collection('inkledger');
const payRow = (id: string) => Payment.findOne({ razorpayPaymentId: id }).lean();
const inkOf = async (id: unknown) => (await User.findById(id).lean())!;
const get = (userId: unknown) =>
  request(app)
    .get('/payments')
    .set(headers(String(userId)));
const reversals = () => ledger().countDocuments({ reason: 'refund_reversal' });
const grantRows = (u: unknown) => ledger().find({ userId: u, reason: 'sub_renewal' }).toArray();

let scopes: Array<Record<string, jest.Mock>> = [];
beforeEach(() => {
  scopes = [];
  (Sentry.withScope as jest.Mock).mockImplementation((cb: (s: unknown) => void) => {
    const s = {
      setFingerprint: jest.fn(),
      setSDKProcessingMetadata: jest.fn(),
      addEventProcessor: jest.fn(),
      setTags: jest.fn(),
      setExtras: jest.fn(),
    };
    scopes.push(s);
    cb(s);
  });
  (Sentry.captureMessage as jest.Mock).mockReset();
  (Sentry.captureException as jest.Mock).mockReset();
});
afterEach(() => jest.restoreAllMocks());

/** A refund.processed payload that also carries the payment entity (a plan payment). */
function planRefund(paymentId: string, refundId: string, amount = 79900) {
  return {
    ...refundPayload({ refundId, paymentId, amount }),
    payment: {
      entity: {
        id: paymentId,
        amount: 79900,
        status: 'captured',
        subscription_id: SUB,
        created_at: unix('2026-10-01T10:00:00Z'),
      },
    },
  };
}

function expectUnresolvedReported(refundId: string, paymentId: string) {
  const msgs = (Sentry.captureMessage as jest.Mock).mock.calls;
  expect(msgs).toHaveLength(1);
  expect(msgs[0][0]).toMatch(/refund-ink-unresolved/);
  const tags = scopes.flatMap((s) => s.setTags.mock.calls.map((c) => c[0]));
  expect(tags).toEqual([
    { reason: 'refund-ink-unresolved', refundId, razorpayPaymentId: paymentId },
  ]);
}

const noPaidCount = (o: Parameters<typeof subPayload>[0]) => {
  const p = subPayload(o) as { subscription: { entity: Record<string, unknown> } };
  delete p.subscription.entity.paid_count;
  return p;
};

// ── 1. Arjun's duplicate case ──────────────────────────────────────────────────────────────

describe("Arjun's duplicate case: P2 is a second charge with no grant of its own", () => {
  async function setup() {
    const u = await seedUser();
    await seedSub(u);
    // P1 wins the cycle: grants PLAN_UNITS, grant stamped with pay_P1.
    await webhook('subscription.charged', subPayload({ paymentId: 'pay_P1' }));
    // P2: same cycle, lost claim, 0 Ink, no grant.
    await webhook('subscription.charged', subPayload({ paymentId: 'pay_P2' }));
    // Extra Ink from elsewhere in the same bucket.
    await User.updateOne({ _id: u }, { $inc: { inkSub: 30 } });
    expect((await inkOf(u)).inkSub).toBe(PLAN_UNITS + 30);
    return u;
  }

  it('refunding P2 reverses nothing, is unresolved + Sentry; the user keeps everything', async () => {
    const u = await setup();
    expect(await payRow('pay_P2')).toMatchObject({ kind: 'plan', inkUnits: 0 });
    const res = await webhook('refund.processed', planRefund('pay_P2', 'rfnd_P2'));
    expect(res.status).toBe(200);
    expect(await reversals()).toBe(0);
    expect((await inkOf(u)).inkSub).toBe(PLAN_UNITS + 30);
    expectUnresolvedReported('rfnd_P2', 'pay_P2');
  });

  it('refunding P1 reverses exactly the grant (100) and the extra 30 stays', async () => {
    const u = await setup();
    await webhook('refund.processed', planRefund('pay_P2', 'rfnd_P2'));
    (Sentry.captureMessage as jest.Mock).mockClear();
    const res = await webhook('refund.processed', planRefund('pay_P1', 'rfnd_P1'));
    expect(res.status).toBe(200);
    expect(await ledger().findOne({ _id: 'refund:rfnd_P1' as never })).toMatchObject({
      reason: 'refund_reversal',
      state: 'done',
      delta: -PLAN_UNITS,
    });
    expect((await inkOf(u)).inkSub).toBe(30);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });
});

// ── 2. Option B clamp ─────────────────────────────────────────────────────────────────────

describe('option B: one grant is reversed at most once across payments', () => {
  const ORDER = 'order_dbl';
  // Top-up_mid: 10 Ink = 20 units. A double charge of ONE order: two payments, one claim.
  const GRANT = 20;

  async function setup() {
    const u = await seedUser();
    // The one claim the order granted, and 30 units of extra Ink in the same bucket.
    await ledger().insertOne({
      _id: `topup:${ORDER}` as never,
      userId: u,
      delta: GRANT,
      reason: 'topup',
      sourceBucket: 'topup',
      balanceAfter: GRANT,
      state: 'done',
      metadata: { razorpayOrderId: ORDER },
      createdAt: new Date(),
    });
    await User.updateOne({ _id: u }, { $set: { inkTopup: GRANT + 30 } });
    for (const id of ['pay_A', 'pay_B']) {
      await Payment.create({
        userId: u,
        kind: 'topup',
        status: 'paid',
        razorpayPaymentId: id,
        razorpayOrderId: ORDER,
        amountPaise: 19900,
        refundedPaise: 0,
        inkUnits: GRANT,
        inkReversedUnits: 0,
        source: 'webhook',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    return u;
  }
  const refund = (paymentId: string, refundId: string, amount: number) =>
    webhook('refund.processed', refundPayload({ refundId, paymentId, amount }));

  it('second refund takes only granted - alreadyReversed, then 0 -> grant_already_reversed, extra untouched', async () => {
    const u = await setup();
    const info = jest.spyOn(logger, 'info');

    // A: 60% of 20 = 12.
    expect((await refund('pay_A', 'rfnd_A1', 11940)).status).toBe(200);
    expect(await ledger().findOne({ _id: 'refund:rfnd_A1' as never })).toMatchObject({
      delta: -12,
      state: 'done',
      metadata: expect.objectContaining({
        grantLedgerId: `topup:${ORDER}`,
        grantPaymentId: 'pay_A',
        dueUnits: 12,
      }),
    });
    expect((await inkOf(u)).inkTopup).toBe(GRANT + 30 - 12);

    // B, full refund: pro rata would be 20; only 8 of the grant is left.
    expect((await refund('pay_B', 'rfnd_B1', 19900)).status).toBe(200);
    expect(await ledger().findOne({ _id: 'refund:rfnd_B1' as never })).toMatchObject({
      delta: -8,
      metadata: expect.objectContaining({ grantLedgerId: `topup:${ORDER}`, dueUnits: 8 }),
    });
    expect((await inkOf(u)).inkTopup).toBe(30);

    // A again (the remaining 40%): pro rata 8, but the grant is fully reversed already.
    const before = await reversals();
    expect((await refund('pay_A', 'rfnd_A2', 7960)).status).toBe(200);
    expect(await reversals()).toBe(before);
    expect(await ledger().findOne({ _id: 'refund:rfnd_A2' as never })).toBeNull();
    expect((await inkOf(u)).inkTopup).toBe(30);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
    const line = info.mock.calls.find((c) => String(c[1]).includes('grant already fully reversed'));
    expect(line).toBeDefined();
    // Ids only.
    expect(Object.keys(line![0] as object).sort()).toEqual(
      expect.arrayContaining(['grantLedgerId']),
    );
    expect(JSON.stringify(line![0])).not.toMatch(/example\.com|Asha/);
  });

  it('another user’s reversal naming the same grant id is not counted (userId scoped)', async () => {
    const u = await setup();
    const other = await seedUser();
    await ledger().insertOne({
      _id: 'refund:rfnd_foreign' as never,
      userId: other,
      delta: -GRANT,
      reason: 'refund_reversal',
      state: 'done',
      metadata: {
        razorpayPaymentId: 'pay_X',
        refundId: 'rfnd_foreign',
        dueUnits: GRANT,
        grantLedgerId: `topup:${ORDER}`,
        grantPaymentId: 'pay_X',
      },
      createdAt: new Date(),
    });
    await refund('pay_A', 'rfnd_A1', 19900);
    expect(await ledger().findOne({ _id: 'refund:rfnd_A1' as never })).toMatchObject({
      delta: -GRANT,
    });
    expect((await inkOf(u)).inkTopup).toBe(30);
  });
});

// ── 3 + 4. Payment id on the grant row ───────────────────────────────────────────────────

describe('round 2 by payment id: the Payment write failed, the redelivery wrote the row with 0', () => {
  it('refunding P reverses the full grant', async () => {
    const u = await seedUser();
    await seedSub(u);
    const spy = jest
      .spyOn(Payment.collection, 'updateOne')
      .mockRejectedValue(new Error('write exploded'));
    await webhook('subscription.charged', subPayload({ paymentId: 'pay_rp' }));
    spy.mockRestore();
    expect(await Payment.countDocuments({})).toBe(0);
    await webhook('subscription.charged', subPayload({ paymentId: 'pay_rp' }));
    expect(await payRow('pay_rp')).toMatchObject({ inkUnits: 0 });
    expect((await grantRows(u))[0].metadata).toMatchObject({ razorpayPaymentId: 'pay_rp' });

    await webhook('refund.processed', planRefund('pay_rp', 'rfnd_rp'));
    expect(await ledger().findOne({ _id: 'refund:rfnd_rp' as never })).toMatchObject({
      delta: -PLAN_UNITS,
      state: 'done',
    });
    expect((await inkOf(u)).inkSub ?? 0).toBe(0);
  });
});

describe('(g) a lost-claim subscription.charged stamps its payment id on the cycle grant', () => {
  it('activated wins without a payment entity; the charge stamps it; refunding that charge reverses 100', async () => {
    const u = await seedUser();
    await seedSub(u);
    await webhook('subscription.activated', subPayload({ paymentId: null }));
    let rows = await grantRows(u);
    expect(rows).toHaveLength(1);
    expect((rows[0].metadata as Record<string, unknown>).razorpayPaymentId).toBeUndefined();
    expect((rows[0].metadata as Record<string, unknown>).paidCount).toBe(1);
    expect((await inkOf(u)).inkSub).toBe(PLAN_UNITS);

    await webhook('subscription.charged', subPayload({ paymentId: 'pay_g1' }));
    rows = await grantRows(u);
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toMatchObject({ razorpayPaymentId: 'pay_g1' });
    expect(await payRow('pay_g1')).toMatchObject({ kind: 'plan', inkUnits: 0 });
    expect((await inkOf(u)).inkSub).toBe(PLAN_UNITS);

    const res = await webhook('refund.processed', planRefund('pay_g1', 'rfnd_g1'));
    expect(res.status).toBe(200);
    expect(await ledger().findOne({ _id: 'refund:rfnd_g1' as never })).toMatchObject({
      delta: -PLAN_UNITS,
      state: 'done',
      metadata: expect.objectContaining({ grantPaymentId: 'pay_g1' }),
    });
    expect((await inkOf(u)).inkSub ?? 0).toBe(0);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();

    // The display: a linked 0-Ink row shows the uncapped removal and a negative delta.
    const shown = (await get(u)).body.payments[0];
    expect([shown.inkAddedInk, shown.inkReversedInk, shown.inkReversalLinked]).toEqual([
      0,
      PLAN.inkPerCycle,
      true,
    ]);
    expect(shown.inkDelta).toBe(-PLAN.inkPerCycle);
  });

  it('an already-set payment id is never overwritten', async () => {
    const u = await seedUser();
    await seedSub(u);
    await webhook('subscription.charged', subPayload({ paymentId: 'pay_first' }));
    await webhook('subscription.charged', subPayload({ paymentId: 'pay_second' }));
    const rows = await grantRows(u);
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toMatchObject({ razorpayPaymentId: 'pay_first' });
  });

  it('current_start fallback (no paid_count): the same period is stamped', async () => {
    const u = await seedUser();
    await seedSub(u);
    await webhook('subscription.activated', noPaidCount({ paymentId: null }));
    const before = await grantRows(u);
    expect(before).toHaveLength(1);
    expect(before[0].metadata).toHaveProperty('periodStart');
    await webhook('subscription.charged', noPaidCount({ paymentId: 'pay_cs' }));
    const rows = await grantRows(u);
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toMatchObject({ razorpayPaymentId: 'pay_cs' });
  });

  it('paid_count 0 -> no stamp', async () => {
    const u = await seedUser();
    await seedSub(u);
    await webhook('subscription.activated', subPayload({ paymentId: null }));
    await webhook('subscription.charged', subPayload({ paymentId: 'pay_z', paidCount: 0 }));
    const rows = await grantRows(u);
    expect(rows).toHaveLength(1);
    expect((rows[0].metadata as Record<string, unknown>).razorpayPaymentId).toBeUndefined();
  });

  it('another cycle’s grant is not stamped by a charge of a different cycle', async () => {
    const u = await seedUser();
    await seedSub(u);
    await webhook('subscription.activated', subPayload({ paymentId: null })); // cycle 1, unstamped
    await webhook('subscription.charged', subPayload({ paymentId: 'pay_c2', paidCount: 2 }));
    const rows = await grantRows(u);
    expect(rows).toHaveLength(2);
    const byCount = Object.fromEntries(
      rows.map((r) => [(r.metadata as Record<string, unknown>).paidCount, r.metadata]),
    );
    expect(byCount[1]).not.toHaveProperty('razorpayPaymentId');
    expect(byCount[2]).toMatchObject({ razorpayPaymentId: 'pay_c2' });
  });
});

// ── 5. Partial refund of a granting charge ───────────────────────────────────────────────

describe('partial refund of the granting charge: the same share, rounded down, never below 0', () => {
  async function granted(paymentId: string) {
    const u = await seedUser();
    await seedSub(u);
    await webhook('subscription.charged', subPayload({ paymentId }));
    return u;
  }

  it('39950 of 79900 against a 100 grant takes 50', async () => {
    const u = await granted('pay_pr');
    await webhook('refund.processed', planRefund('pay_pr', 'rfnd_pr', 39950));
    expect(await ledger().findOne({ _id: 'refund:rfnd_pr' as never })).toMatchObject({
      delta: -50,
    });
    expect((await inkOf(u)).inkSub).toBe(PLAN_UNITS - 50);
  });

  it('an odd amount floors (10000 of 79900 of 100 -> 12)', async () => {
    const u = await granted('pay_pr');
    await webhook('refund.processed', planRefund('pay_pr', 'rfnd_odd', 10000));
    expect(await ledger().findOne({ _id: 'refund:rfnd_odd' as never })).toMatchObject({
      delta: -12,
    });
    expect((await inkOf(u)).inkSub).toBe(PLAN_UNITS - 12);
  });

  it('a tiny refund rounds to 0 and never goes below 0', async () => {
    const u = await granted('pay_pr');
    await webhook('refund.processed', planRefund('pay_pr', 'rfnd_tiny', 100));
    expect((await inkOf(u)).inkSub).toBe(PLAN_UNITS);
    const row = await ledger().findOne({ _id: 'refund:rfnd_tiny' as never });
    expect(row === null || row.delta === 0).toBe(true);
  });

  it('then the rest: the two partials add up to the grant, never more', async () => {
    const u = await granted('pay_pr');
    await webhook('refund.processed', planRefund('pay_pr', 'rfnd_p1', 39950));
    await webhook('refund.processed', planRefund('pay_pr', 'rfnd_p2', 79900));
    expect((await inkOf(u)).inkSub ?? 0).toBe(0);
    expect(await ledger().findOne({ _id: 'refund:rfnd_p2' as never })).toMatchObject({
      delta: -50,
    });
  });
});

// ── 6. GET /payments: inkReversalLinked ──────────────────────────────────────────────────

describe('(d) GET /payments inkReversalLinked', () => {
  async function mkRow(u: mongoose.Types.ObjectId, id: string, over: Record<string, unknown>) {
    return Payment.create({
      userId: u,
      kind: 'plan',
      status: 'refunded',
      razorpayPaymentId: id,
      amountPaise: 79900,
      refundedPaise: 79900,
      inkUnits: 0,
      inkReversedUnits: 0,
      source: 'webhook',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...over,
    });
  }
  function reversalRow(
    u: mongoose.Types.ObjectId,
    refundId: string,
    meta: Record<string, unknown>,
    over: Record<string, unknown> = {},
  ) {
    return ledger().insertOne({
      _id: `refund:${refundId}` as never,
      userId: u,
      delta: -200,
      reason: 'refund_reversal',
      state: 'done',
      metadata: { refundId, dueUnits: 200, ...meta },
      createdAt: new Date(),
      ...over,
    });
  }

  it('linked 0-Ink row: added 0, reversed 100 uncapped, linked true, negative inkDelta', async () => {
    const u = await seedUser();
    await mkRow(u, 'pay_l1', { inkUnits: 0, inkReversedUnits: 200 });
    await reversalRow(u, 'rfnd_l1', { grantLedgerId: 'led_1', grantPaymentId: 'pay_l1' });
    const warn = jest.spyOn(logger, 'warn');
    const p = (await get(u)).body.payments[0];
    expect([p.inkAddedInk, p.inkReversedInk, p.inkReversalLinked, p.inkDelta]).toEqual([
      0,
      100,
      true,
      -100,
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('linked through metadata.razorpayPaymentId alone', async () => {
    const u = await seedUser();
    await mkRow(u, 'pay_l2', { inkUnits: 0, inkReversedUnits: 200 });
    await reversalRow(u, 'rfnd_l2', { grantLedgerId: 'led_2', razorpayPaymentId: 'pay_l2' });
    const p = (await get(u)).body.payments[0];
    expect([p.inkReversalLinked, p.inkReversedInk]).toEqual([true, 100]);
  });

  it('not linked: no grantLedgerId, non-string grantLedgerId, pending state, other user, other payment', async () => {
    const u = await seedUser();
    const other = await seedUser();
    const cases: Array<[string, () => Promise<unknown>]> = [
      ['pay_n1', () => reversalRow(u, 'rfnd_n1', { grantPaymentId: 'pay_n1' })],
      ['pay_n2', () => reversalRow(u, 'rfnd_n2', { grantLedgerId: 7, grantPaymentId: 'pay_n2' })],
      [
        'pay_n3',
        () =>
          reversalRow(
            u,
            'rfnd_n3',
            { grantLedgerId: 'l', grantPaymentId: 'pay_n3' },
            { state: 'pending' },
          ),
      ],
      [
        'pay_n4',
        () => reversalRow(other, 'rfnd_n4', { grantLedgerId: 'l', grantPaymentId: 'pay_n4' }),
      ],
      ['pay_n5', () => reversalRow(u, 'rfnd_n5', { grantLedgerId: 'l', grantPaymentId: 'pay_zz' })],
    ];
    for (const [id, seed] of cases) {
      await mkRow(u, id, { inkUnits: 20, inkReversedUnits: 20 });
      await seed();
    }
    jest.spyOn(logger, 'warn');
    const res = (await get(u)).body.payments as Array<{
      referenceTail: string;
      inkReversalLinked: boolean;
    }>;
    expect(res).toHaveLength(5);
    for (const p of res) expect(p.inkReversalLinked).toBe(false);
  });

  it('unlinked over-reversal: capped at added, linked false, ONE warn with ids and numbers only', async () => {
    const u = await seedUser();
    const row = await mkRow(u, 'pay_over', { inkUnits: 20, inkReversedUnits: 30 });
    const warn = jest.spyOn(logger, 'warn');
    const p = (await get(u)).body.payments[0];
    expect([p.inkAddedInk, p.inkReversedInk, p.inkDelta, p.inkReversalLinked]).toEqual([
      10,
      10,
      0,
      false,
    ]);
    const lines = warn.mock.calls.filter((c) => String(c[1]).includes('reversal exceeds added'));
    expect(lines).toHaveLength(1);
    expect(lines[0][0]).toEqual({
      paymentId: String(row._id),
      razorpayPaymentId: 'pay_over',
      addedUnits: 20,
      storedReversedUnits: 30,
    });
  });

  it('a failed row is never linked and shows 0, 0, 0', async () => {
    const u = await seedUser();
    await mkRow(u, 'pay_f', { status: 'failed', inkUnits: 0, inkReversedUnits: 200 });
    await reversalRow(u, 'rfnd_f', { grantLedgerId: 'l', grantPaymentId: 'pay_f' });
    const p = (await get(u)).body.payments[0];
    expect([p.inkAddedInk, p.inkReversedInk, p.inkDelta, p.inkReversalLinked]).toEqual([
      0,
      0,
      0,
      false,
    ]);
  });
});

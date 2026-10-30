import './setupDb';
import './setupEnv';
import { join } from 'path';

import mongoose from 'mongoose';

import { Payment } from '../models/Payment.model';

import { seedSub, seedUser, unix } from './t436-helpers';

// T-646 round 3b (h): the one-shot offline attribution of legacy plan grants. A subscription
// with exactly ONE un-stamped sub_renewal row AND exactly ONE captured plan charge in total is
// attributed (grant stamped first, then the Payment row gets the grant's delta). Anything else
// is ambiguous: inkUnits 0, one log line. Dry run (the default) writes nothing.
// Only the exported function is called; the script's main() is never run.

jest.mock('../config/razorpay', () => ({
  razorpay: {
    subscriptions: { create: jest.fn(), fetch: jest.fn() },
    invoices: { fetch: jest.fn(), all: jest.fn() },
    payments: { all: jest.fn() },
  },
}));
const { razorpay } = jest.requireMock('../config/razorpay') as {
  razorpay: { invoices: { fetch: jest.Mock } };
};

// The script lives outside tsconfig's rootDir (./src), so a static import would break
// `yarn build` (TS6059). Load it at run time by path; Jest compiles it with ts-jest.
const SCRIPT = join(__dirname, '..', '..', 'scripts', 'backfill-payments');
type Entity = Record<string, unknown>;
interface Deps {
  subscriptionIdFor: (entity: Entity) => Promise<string | null>;
  countCapturedPlanCharges: (razorpaySubscriptionId: string) => Promise<number>;
  log: (line: string) => void;
}
interface BackfillResult {
  counts: Record<string, number>;
  unattributedIds: string[];
  ambiguousIds: string[];
  refundedKeptInkIds: string[];
}
const runPaymentsBackfill = (
  jest.requireActual(SCRIPT) as {
    runPaymentsBackfill: (
      payments: Entity[],
      options?: { apply?: boolean; deps?: Partial<Deps> },
    ) => Promise<BackfillResult>;
  }
).runPaymentsBackfill;

const SUB = 'sub_t436';
const GRANT_UNITS = 100;
const ledger = () => mongoose.connection.db!.collection('inkledger');
const payRow = (id: string) => Payment.findOne({ razorpayPaymentId: id }).lean();

beforeEach(() => {
  razorpay.invoices.fetch.mockReset();
  razorpay.invoices.fetch.mockResolvedValue({ subscription_id: SUB });
});

function planEntity(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    amount: 79900,
    status: 'captured',
    invoice_id: `inv_${id}`,
    created_at: unix('2026-10-25T10:00:00Z'),
    ...over,
  };
}

function legacyGrant(
  u: mongoose.Types.ObjectId,
  over: { paymentId?: string; delta?: number; subId?: string } = {},
) {
  return ledger().insertOne({
    userId: u,
    delta: over.delta ?? GRANT_UNITS,
    reason: 'sub_renewal',
    sourceBucket: 'sub',
    balanceAfter: over.delta ?? GRANT_UNITS,
    metadata: {
      razorpaySubscriptionId: over.subId ?? SUB,
      ...(over.paymentId ? { razorpayPaymentId: over.paymentId } : {}),
    },
    createdAt: new Date('2026-10-25T10:00:05Z'),
  });
}

async function setup() {
  const u = await seedUser();
  await seedSub(u, SUB, { planId: 'solo_monthly' });
  return u;
}

const deps = (charges: number) => ({
  subscriptionIdFor: jest.fn(async () => SUB),
  countCapturedPlanCharges: jest.fn(async () => charges),
  log: jest.fn(),
});

const stampOf = async () =>
  (await ledger().find({ reason: 'sub_renewal' }).toArray()).map(
    (r) => (r.metadata as Record<string, unknown>).razorpayPaymentId,
  );

describe('importing the script', () => {
  it('connects to nothing, loads no env file, exits nothing', () => {
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const load = jest.fn();
    let connect: jest.SpyInstance | undefined;
    jest.isolateModules(() => {
      jest.doMock('dotenv', () => ({ config: load }));
      const fresh = jest.requireActual('mongoose') as typeof mongoose;
      connect = jest.spyOn(fresh, 'connect');
      const mod = jest.requireActual(SCRIPT) as {
        runPaymentsBackfill: unknown;
      };
      expect(typeof mod.runPaymentsBackfill).toBe('function');
    });
    expect(connect).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
    exit.mockRestore();
  });
});

describe('runPaymentsBackfill: legacy plan grants', () => {
  it("Arjun's case: a subscription with TWO charges is ambiguous in a dry run; grant and row untouched", async () => {
    const u = await setup();
    await legacyGrant(u);
    const d = deps(2);
    const r = await runPaymentsBackfill([planEntity('pay_a'), planEntity('pay_b')], {
      deps: d,
    });
    expect(r.counts).toMatchObject({ inScope: 2, attributed: 0, ambiguous: 2, written: 2 });
    expect(r.ambiguousIds.sort()).toEqual(['pay_a', 'pay_b']);
    expect(await stampOf()).toEqual([undefined]);
    expect(await Payment.countDocuments({})).toBe(0);
    expect(d.log).toHaveBeenCalledTimes(2);
  });

  it('two charges with apply: still ambiguous; rows written with inkUnits 0, grant unstamped', async () => {
    const u = await setup();
    await legacyGrant(u);
    const r = await runPaymentsBackfill([planEntity('pay_a'), planEntity('pay_b')], {
      apply: true,
      deps: deps(2),
    });
    expect(r.counts).toMatchObject({ attributed: 0, ambiguous: 2 });
    expect(await stampOf()).toEqual([undefined]);
    expect(await payRow('pay_a')).toMatchObject({ inkUnits: 0, source: 'backfill' });
    expect(await payRow('pay_b')).toMatchObject({ inkUnits: 0 });
  });

  it('1 grant + 1 charge with apply: grant stamped, row inkUnits = the grant delta', async () => {
    const u = await setup();
    await legacyGrant(u, { delta: 80 });
    const r = await runPaymentsBackfill([planEntity('pay_one')], { apply: true, deps: deps(1) });
    expect(r.counts).toMatchObject({ attributed: 1, ambiguous: 0, written: 1 });
    expect(await stampOf()).toEqual(['pay_one']);
    expect(await payRow('pay_one')).toMatchObject({ kind: 'plan', inkUnits: 80 });
  });

  it('1 grant + 1 charge in a dry run: counted as attributed, nothing written', async () => {
    const u = await setup();
    await legacyGrant(u);
    const r = await runPaymentsBackfill([planEntity('pay_one')], { deps: deps(1) });
    expect(r.counts).toMatchObject({ attributed: 1, ambiguous: 0 });
    expect(await stampOf()).toEqual([undefined]);
    expect(await Payment.countDocuments({})).toBe(0);
  });

  it('a second apply run changes nothing (idempotent)', async () => {
    const u = await setup();
    await legacyGrant(u);
    await runPaymentsBackfill([planEntity('pay_one')], { apply: true, deps: deps(1) });
    const r = await runPaymentsBackfill([planEntity('pay_one')], { apply: true, deps: deps(1) });
    expect(r.counts.alreadyRecorded).toBe(1);
    expect(await stampOf()).toEqual(['pay_one']);
    expect(await payRow('pay_one')).toMatchObject({ inkUnits: GRANT_UNITS });
    expect(await Payment.countDocuments({})).toBe(1);
  });

  it('a row that already has inkUnits > 0 is alreadyRecorded and untouched', async () => {
    const u = await setup();
    await legacyGrant(u);
    await Payment.create({
      userId: u,
      kind: 'plan',
      status: 'paid',
      razorpayPaymentId: 'pay_rec',
      razorpaySubscriptionId: SUB,
      amountPaise: 79900,
      refundedPaise: 0,
      inkUnits: 60,
      inkReversedUnits: 0,
      source: 'webhook',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const r = await runPaymentsBackfill([planEntity('pay_rec')], { apply: true, deps: deps(1) });
    expect(r.counts).toMatchObject({ alreadyRecorded: 1, attributed: 0, ambiguous: 0 });
    expect(await payRow('pay_rec')).toMatchObject({ inkUnits: 60, source: 'webhook' });
    expect(await stampOf()).toEqual([undefined]);
  });

  it('a top-up is untouched by attribution', async () => {
    const u = await setup();
    await legacyGrant(u);
    const topup = {
      id: 'pay_top',
      amount: 19900,
      status: 'captured',
      notes: { user_id: String(u), sku_id: 'topup_mid' },
      created_at: unix('2026-10-25T10:00:00Z'),
    };
    const d = deps(1);
    const r = await runPaymentsBackfill([topup], { apply: true, deps: d });
    expect(r.counts).toMatchObject({ attributed: 0, ambiguous: 0, written: 1 });
    expect(await stampOf()).toEqual([undefined]);
    expect(await payRow('pay_top')).toMatchObject({ kind: 'topup', inkUnits: 20 });
    expect(d.countCapturedPlanCharges).not.toHaveBeenCalled();
  });

  it('two un-stamped grants -> ambiguous, nothing stamped', async () => {
    const u = await setup();
    await legacyGrant(u);
    await legacyGrant(u);
    const r = await runPaymentsBackfill([planEntity('pay_one')], { apply: true, deps: deps(1) });
    expect(r.counts).toMatchObject({ attributed: 0, ambiguous: 1 });
    expect(await stampOf()).toEqual([undefined, undefined]);
    expect(await payRow('pay_one')).toMatchObject({ inkUnits: 0 });
  });

  it('a grant already stamped with another payment id is not an un-stamped grant -> ambiguous', async () => {
    const u = await setup();
    await legacyGrant(u, { paymentId: 'pay_other' });
    const r = await runPaymentsBackfill([planEntity('pay_one')], { apply: true, deps: deps(1) });
    expect(r.counts).toMatchObject({ attributed: 0, ambiguous: 1 });
    expect(await stampOf()).toEqual(['pay_other']);
    expect(await payRow('pay_one')).toMatchObject({ inkUnits: 0 });
  });

  it('a grant already stamped with THIS payment id is confirmed by id, not re-attributed', async () => {
    const u = await setup();
    await legacyGrant(u, { paymentId: 'pay_one', delta: 90 });
    const r = await runPaymentsBackfill([planEntity('pay_one')], { apply: true, deps: deps(2) });
    expect(r.counts).toMatchObject({ attributed: 0, ambiguous: 0, written: 1 });
    expect(await payRow('pay_one')).toMatchObject({ inkUnits: 90 });
  });

  it('out-of-scope statuses are not counted', async () => {
    await setup();
    const r = await runPaymentsBackfill(
      [planEntity('pay_f', { status: 'failed' }), planEntity('pay_c', { status: 'created' })],
      { deps: deps(1) },
    );
    expect(r.counts.inScope).toBe(0);
  });
});

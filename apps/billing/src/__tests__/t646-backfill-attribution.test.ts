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

// ── Arjun review of 9b5ef4dc: must-fix (a)/(b) and condition 3 ───────────────────────────

const mkRow = (u: mongoose.Types.ObjectId, id: string, over: Record<string, unknown> = {}) =>
  Payment.create({
    userId: u,
    kind: 'plan',
    status: 'paid',
    razorpayPaymentId: id,
    razorpaySubscriptionId: SUB,
    amountPaise: 79900,
    refundedPaise: 0,
    inkUnits: 0,
    inkReversedUnits: 0,
    source: 'webhook',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  });

describe('must-fix: one grant never becomes reversible twice', () => {
  it("Arjun's case: two captured charges on ONE paid invoice, P1 row carries Ink -> P2 ambiguous, grant unstamped (dry run and apply)", async () => {
    const u = await setup();
    await legacyGrant(u);
    await mkRow(u, 'pay_P1', { inkUnits: 60 });
    // The invoice count is 1 (one paid invoice); both payment entities resolve to S.
    for (const apply of [false, true]) {
      const d = deps(1);
      const r = await runPaymentsBackfill([planEntity('pay_P1'), planEntity('pay_P2')], {
        apply,
        deps: d,
      });
      expect(r.counts).toMatchObject({ alreadyRecorded: 1, attributed: 0, ambiguous: 1 });
      expect(r.ambiguousIds).toEqual(['pay_P2']);
      expect(await stampOf()).toEqual([undefined]);
    }
    expect(await payRow('pay_P2')).toMatchObject({ inkUnits: 0, source: 'backfill' });
    expect(await payRow('pay_P1')).toMatchObject({ inkUnits: 60, source: 'webhook' });
  });

  it('(b) alone: an inked row on S makes it ambiguous although the invoice count and E(S) are both 1', async () => {
    const u = await setup();
    await legacyGrant(u);
    // status 'created' is outside R(S), so only the inkUnits check can see this row.
    await mkRow(u, 'pay_P1', { status: 'created', inkUnits: 60 });
    for (const apply of [false, true]) {
      const r = await runPaymentsBackfill([planEntity('pay_P2')], { apply, deps: deps(1) });
      expect(r.counts).toMatchObject({ attributed: 0, ambiguous: 1 });
    }
    expect(await stampOf()).toEqual([undefined]);
    expect(await payRow('pay_P2')).toMatchObject({ inkUnits: 0 });
  });

  it('(b) control: an inked row of ANOTHER subscription does not block attribution', async () => {
    const u = await setup();
    await legacyGrant(u);
    await mkRow(u, 'pay_o', {
      status: 'created',
      inkUnits: 60,
      razorpaySubscriptionId: 'sub_other',
    });
    const r = await runPaymentsBackfill([planEntity('pay_P2')], { apply: true, deps: deps(1) });
    expect(r.counts).toMatchObject({ attributed: 1, ambiguous: 0 });
    expect(await stampOf()).toEqual(['pay_P2']);
  });

  it('(a) alone, E(S): two entities resolve to S, no inked row, invoice count 1 -> both ambiguous', async () => {
    const u = await setup();
    await legacyGrant(u);
    for (const apply of [false, true]) {
      const r = await runPaymentsBackfill([planEntity('pay_a'), planEntity('pay_b')], {
        apply,
        deps: deps(1),
      });
      expect(r.counts).toMatchObject({ attributed: 0, ambiguous: 2 });
    }
    expect(await stampOf()).toEqual([undefined]);
    expect(await payRow('pay_a')).toMatchObject({ inkUnits: 0 });
  });

  it('(a) alone, R(S): a paid 0-Ink row of another payment of S plus this entity -> ambiguous', async () => {
    const u = await setup();
    await legacyGrant(u);
    await mkRow(u, 'pay_prev', { inkUnits: 0 });
    const r = await runPaymentsBackfill([planEntity('pay_now')], { apply: true, deps: deps(1) });
    expect(r.counts).toMatchObject({ attributed: 0, ambiguous: 1 });
    expect(await stampOf()).toEqual([undefined]);
  });

  it('(a) alone, R(S) counts refunded and partly_refunded rows too', async () => {
    const u = await setup();
    await legacyGrant(u);
    await mkRow(u, 'pay_ref', { status: 'refunded', refundedPaise: 79900 });
    const r = await runPaymentsBackfill([planEntity('pay_now')], { deps: deps(1) });
    expect(r.counts).toMatchObject({ attributed: 0, ambiguous: 1 });
  });

  it('the invoice count still wins when it is the larger (3 invoices, 1 entity) -> ambiguous', async () => {
    const u = await setup();
    await legacyGrant(u);
    const r = await runPaymentsBackfill([planEntity('pay_one')], { deps: deps(3) });
    expect(r.counts).toMatchObject({ attributed: 0, ambiguous: 1 });
  });

  it('a lone charge with no other payment of S is still attributed', async () => {
    const u = await setup();
    await legacyGrant(u);
    const r = await runPaymentsBackfill([planEntity('pay_one')], { apply: true, deps: deps(1) });
    expect(r.counts).toMatchObject({ attributed: 1, ambiguous: 0 });
    expect(await stampOf()).toEqual(['pay_one']);
  });
});

describe('condition 3: one payment failing never aborts the run', () => {
  const SUB2 = 'sub_t436_b';
  const BOOM = 'secret-detail-do-not-log';

  async function twoSubs() {
    const u1 = await setup();
    await legacyGrant(u1);
    const u2 = await seedUser();
    await seedSub(u2, SUB2, { planId: 'solo_monthly' });
    await legacyGrant(u2, { subId: SUB2 });
    razorpay.invoices.fetch.mockImplementation(async (inv: string) => ({
      subscription_id: inv === 'inv_pay_x' ? SUB : SUB2,
    }));
  }
  const failure = (name: string) => Object.assign(new Error(BOOM), { name });
  const stampsBySub = async () =>
    Object.fromEntries(
      (await ledger().find({ reason: 'sub_renewal' }).toArray()).map((r) => [
        (r.metadata as Record<string, unknown>).razorpaySubscriptionId,
        (r.metadata as Record<string, unknown>).razorpayPaymentId,
      ]),
    );

  it('stamp throws for the first payment: ambiguous, ids + error name logged, second payment attributed', async () => {
    await twoSubs();
    const proto = Object.getPrototypeOf(ledger()) as {
      findOneAndUpdate: (...a: unknown[]) => Promise<unknown>;
    };
    const orig = proto.findOneAndUpdate;
    let thrown = 0;
    jest.spyOn(proto, 'findOneAndUpdate').mockImplementation(function (
      this: { collectionName: string },
      ...a: unknown[]
    ) {
      if (this.collectionName === 'inkledger' && thrown === 0) {
        thrown += 1;
        return Promise.reject(failure('StampBoom'));
      }
      return orig.apply(this, a);
    });
    const d = { ...deps(1), subscriptionIdFor: jest.fn(async () => null) };
    const r = await runPaymentsBackfill([planEntity('pay_x'), planEntity('pay_y')], {
      apply: true,
      deps: d,
    });
    jest.restoreAllMocks();
    expect(r.counts).toMatchObject({ inScope: 2, attributed: 1, ambiguous: 1 });
    expect(r.ambiguousIds).toEqual(['pay_x']);
    expect(await stampsBySub()).toEqual({ [SUB]: undefined, [SUB2]: 'pay_y' });
    expect(await payRow('pay_x')).toMatchObject({ inkUnits: 0 });
    expect(await payRow('pay_y')).toMatchObject({ inkUnits: GRANT_UNITS });
    const lines = d.log.mock.calls.map((c) => String(c[0]));
    expect(lines.filter((l) => l.includes('pay_x') && l.includes('StampBoom'))).toHaveLength(1);
    expect(lines.join('\n')).not.toContain(BOOM);
  });

  it('the Payment upsert throws for the first payment: ambiguous (not attributed), logged, second processed', async () => {
    await twoSubs();
    const real = Payment.collection.updateOne.bind(Payment.collection);
    jest
      .spyOn(Payment.collection, 'updateOne')
      .mockImplementation(((filter: { razorpayPaymentId?: string }, ...rest: unknown[]) =>
        filter?.razorpayPaymentId === 'pay_x'
          ? Promise.reject(failure('UpsertBoom'))
          : (real as (...a: unknown[]) => unknown)(filter, ...rest)) as never);
    const d = deps(1);
    const r = await runPaymentsBackfill([planEntity('pay_x'), planEntity('pay_y')], {
      apply: true,
      deps: d,
    });
    jest.restoreAllMocks();
    expect(r.counts).toMatchObject({ inScope: 2, attributed: 1, ambiguous: 1, written: 1 });
    expect(r.ambiguousIds).toEqual(['pay_x']);
    expect(await payRow('pay_x')).toBeNull();
    expect(await payRow('pay_y')).toMatchObject({ inkUnits: GRANT_UNITS });
    const lines = d.log.mock.calls.map((c) => String(c[0]));
    expect(lines.filter((l) => l.includes('pay_x') && l.includes('UpsertBoom'))).toHaveLength(1);
    expect(lines.join('\n')).not.toContain(BOOM);
    // Known (developer report): the stamp already succeeded, so G stays stamped with pay_x.
    expect((await stampsBySub())[SUB]).toBe('pay_x');
  });

  it('a failing upsert of an already-ambiguous payment is counted ambiguous once', async () => {
    const u = await setup();
    await legacyGrant(u);
    const real = Payment.collection.updateOne.bind(Payment.collection);
    jest
      .spyOn(Payment.collection, 'updateOne')
      .mockImplementation(((filter: { razorpayPaymentId?: string }, ...rest: unknown[]) =>
        filter?.razorpayPaymentId === 'pay_a'
          ? Promise.reject(failure('UpsertBoom'))
          : (real as (...a: unknown[]) => unknown)(filter, ...rest)) as never);
    const r = await runPaymentsBackfill([planEntity('pay_a'), planEntity('pay_b')], {
      apply: true,
      deps: deps(2),
    });
    jest.restoreAllMocks();
    expect(r.counts).toMatchObject({ ambiguous: 2, attributed: 0 });
    expect(r.ambiguousIds.sort()).toEqual(['pay_a', 'pay_b']);
    expect(await payRow('pay_b')).toMatchObject({ inkUnits: 0 });
  });
});

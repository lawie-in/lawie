/**
 * Tests for ink-ledger.service.ts — SCRUM-101
 *
 * Uses mongodb-memory-server via setupDb.ts (same pattern as credit-grant tests).
 * All amounts are in integer units ×2 (1 Ink = 2 units).
 */
import mongoose from 'mongoose';

import { User } from '../models/User.model';
import {
  cancelSubscriptionInk,
  deductInk,
  getInkBalance,
  grantSubscriptionInk,
  grantTopupInk,
  seedFreeInk,
} from '../services/ink-ledger.service';

import './setupDb';
import './setupEnv';

// ── Helpers ────────────────────────────────────────────────────────────────

async function createUser(
  overrides: Partial<{
    inkSub: number;
    inkAnnualCarry: number;
    inkTopup: number;
    inkSubMonthlyAllotment: number;
    email: string;
  }> = {},
) {
  return User.create({
    email: overrides.email ?? `test-${Math.random().toString(36).slice(2)}@test.com`,
    inkSub: overrides.inkSub ?? 0,
    inkAnnualCarry: overrides.inkAnnualCarry ?? 0,
    inkTopup: overrides.inkTopup ?? 0,
    inkSubMonthlyAllotment: overrides.inkSubMonthlyAllotment ?? 0,
  });
}

async function inkLedgerRows(userId: mongoose.Types.ObjectId) {
  return mongoose.connection
    .db!.collection('inkledger')
    .find({ userId })
    .sort({ createdAt: 1 })
    .toArray();
}

// ── Test 1 — Deduction cost: generate=2, regenerate=1 ─────────────────────

describe('deductInk — cost units', () => {
  it('generate deducts 2 units', async () => {
    const user = await createUser({ inkSub: 10 });

    const result = await deductInk({
      userId: user._id.toString(),
      costUnits: 2,
      reason: 'generate',
    });

    expect(result.success).toBe(true);
    expect(result.inkSub).toBe(8);

    const updated = await User.findById(user._id).lean();
    expect(updated!.inkSub).toBe(8);
  });

  it('regenerate deducts 1 unit', async () => {
    const user = await createUser({ inkSub: 10 });

    const result = await deductInk({
      userId: user._id.toString(),
      costUnits: 1,
      reason: 'regenerate',
    });

    expect(result.success).toBe(true);
    expect(result.inkSub).toBe(9);

    const updated = await User.findById(user._id).lean();
    expect(updated!.inkSub).toBe(9);
  });

  it('writes ledger row with correct reason', async () => {
    const user = await createUser({ inkSub: 10 });

    await deductInk({ userId: user._id.toString(), costUnits: 2, reason: 'generate' });

    const rows = await inkLedgerRows(user._id);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].reason).toBe('generate');
    expect(rows[0].delta).toBe(-2);
    expect(rows[0].sourceBucket).toBe('sub');
  });
});

// ── Test 2 — Deduction order: sub → carry → topup ─────────────────────────

describe('deductInk — bucket ordering', () => {
  it('drains inkSub before inkAnnualCarry and inkTopup', async () => {
    const user = await createUser({ inkSub: 4, inkAnnualCarry: 6, inkTopup: 8 });

    const result = await deductInk({
      userId: user._id.toString(),
      costUnits: 4,
      reason: 'generate',
    });

    expect(result.success).toBe(true);
    expect(result.inkSub).toBe(0);
    expect(result.inkAnnualCarry).toBe(6); // untouched
    expect(result.inkTopup).toBe(8); // untouched
  });

  it('spills from inkSub into inkAnnualCarry when sub is exhausted', async () => {
    const user = await createUser({ inkSub: 2, inkAnnualCarry: 6, inkTopup: 8 });

    const result = await deductInk({
      userId: user._id.toString(),
      costUnits: 4, // 2 from sub, 2 from carry
      reason: 'generate',
    });

    expect(result.success).toBe(true);
    expect(result.inkSub).toBe(0);
    expect(result.inkAnnualCarry).toBe(4); // 6 - 2 = 4
    expect(result.inkTopup).toBe(8); // untouched

    // Should have written 2 ledger rows (sub + annual_carry)
    const rows = await inkLedgerRows(user._id);
    const reasons = rows.map((r) => r.sourceBucket);
    expect(reasons).toContain('sub');
    expect(reasons).toContain('annual_carry');
    expect(reasons).not.toContain('topup');
  });

  it('spills from carry into inkTopup when both sub and carry exhausted', async () => {
    const user = await createUser({ inkSub: 1, inkAnnualCarry: 1, inkTopup: 8 });

    const result = await deductInk({
      userId: user._id.toString(),
      costUnits: 4, // 1 from sub, 1 from carry, 2 from topup
      reason: 'generate',
    });

    expect(result.success).toBe(true);
    expect(result.inkSub).toBe(0);
    expect(result.inkAnnualCarry).toBe(0);
    expect(result.inkTopup).toBe(6); // 8 - 2 = 6

    const rows = await inkLedgerRows(user._id);
    const buckets = rows.map((r) => r.sourceBucket);
    expect(buckets).toContain('sub');
    expect(buckets).toContain('annual_carry');
    expect(buckets).toContain('topup');
  });

  it('deducts entirely from inkTopup when sub and carry are zero', async () => {
    const user = await createUser({ inkSub: 0, inkAnnualCarry: 0, inkTopup: 10 });

    const result = await deductInk({
      userId: user._id.toString(),
      costUnits: 2,
      reason: 'regenerate',
    });

    expect(result.success).toBe(true);
    expect(result.inkTopup).toBe(8);

    const rows = await inkLedgerRows(user._id);
    expect(rows).toHaveLength(1);
    expect(rows[0].sourceBucket).toBe('topup');
  });
});

// ── Test 3 — Block at 0: insufficient balance ─────────────────────────────

describe('deductInk — insufficient balance', () => {
  it('returns success=false with reason insufficient_ink when balance < cost', async () => {
    const user = await createUser({ inkSub: 1, inkAnnualCarry: 0, inkTopup: 0 });

    const result = await deductInk({
      userId: user._id.toString(),
      costUnits: 2, // only 1 unit available
      reason: 'generate',
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('insufficient_ink');

    // Balances must be unchanged
    const updated = await User.findById(user._id).lean();
    expect(updated!.inkSub).toBe(1);
  });

  it('returns success=false with reason insufficient_ink when all buckets are 0', async () => {
    const user = await createUser({ inkSub: 0, inkAnnualCarry: 0, inkTopup: 0 });

    const result = await deductInk({
      userId: user._id.toString(),
      costUnits: 1,
      reason: 'regenerate',
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('insufficient_ink');
  });

  it('returns success=false with reason user_not_found for non-existent userId', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const result = await deductInk({ userId: fakeId, costUnits: 2, reason: 'generate' });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('user_not_found');
  });

  it('returns success=false with reason user_not_found for invalid userId', async () => {
    const result = await deductInk({ userId: 'bad-id', costUnits: 2, reason: 'generate' });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('user_not_found');
  });

  it('does not write a ledger row on failure', async () => {
    const user = await createUser({ inkSub: 1 });

    await deductInk({ userId: user._id.toString(), costUnits: 5, reason: 'generate' });

    const rows = await inkLedgerRows(user._id);
    expect(rows).toHaveLength(0);
  });
});

// ── Test 4 — Concurrency: N parallel deducts never overdraft ──────────────

describe('deductInk — concurrency safety', () => {
  it('never overdrafts when N parallel deducts compete for N-1 worth of balance', async () => {
    // Balance = 4 units; each deduct costs 2; only 2 calls can succeed
    const N = 5;
    const costPerCall = 2;
    const initialBalance = (N - 1) * costPerCall; // 8 units → covers exactly N-1=4 calls

    const user = await createUser({ inkSub: initialBalance });

    const results = await Promise.all(
      Array.from({ length: N }, () =>
        deductInk({
          userId: user._id.toString(),
          costUnits: costPerCall,
          reason: 'generate',
        }),
      ),
    );

    const successes = results.filter((r) => r.success).length;
    const failures = results.filter((r) => !r.success).length;

    // Exactly N-1 should succeed, 1 should fail
    expect(successes).toBe(N - 1);
    expect(failures).toBe(1);

    // Final balance must be exactly 0 (no negative)
    const updated = await User.findById(user._id).lean();
    const finalBalance =
      ((updated!.inkSub as number | undefined) ?? 0) +
      ((updated!.inkAnnualCarry as number | undefined) ?? 0) +
      ((updated!.inkTopup as number | undefined) ?? 0);
    expect(finalBalance).toBe(0);
  });

  it('never goes below 0 under high concurrency with mixed balance', async () => {
    // 6 units spread: 4 sub + 2 topup; 5 deducts of 2 units each → 3 succeed, 2 fail
    const user = await createUser({ inkSub: 4, inkAnnualCarry: 0, inkTopup: 2 });

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        deductInk({ userId: user._id.toString(), costUnits: 2, reason: 'generate' }),
      ),
    );

    const successes = results.filter((r) => r.success).length;
    expect(successes).toBe(3);

    const updated = await User.findById(user._id).lean();
    const finalBalance =
      ((updated!.inkSub as number | undefined) ?? 0) +
      ((updated!.inkAnnualCarry as number | undefined) ?? 0) +
      ((updated!.inkTopup as number | undefined) ?? 0);
    expect(finalBalance).toBe(0);
  });
});

// ── Test 5 — Expiry (end of the paid period) zeroes sub + carry, leaves topup intact ──────────

describe('cancelSubscriptionInk', () => {
  it('zeroes inkSub and inkAnnualCarry but leaves inkTopup intact', async () => {
    const user = await createUser({ inkSub: 50, inkAnnualCarry: 30, inkTopup: 20 });

    await cancelSubscriptionInk(user._id.toString());

    const updated = await User.findById(user._id).lean();
    expect(updated!.inkSub).toBe(0);
    expect(updated!.inkAnnualCarry).toBe(0);
    expect(updated!.inkTopup).toBe(20); // unchanged
  });

  it('writes a ledger row with reason sub_cancelled', async () => {
    const user = await createUser({ inkSub: 10, inkTopup: 5 });

    await cancelSubscriptionInk(user._id.toString());

    const rows = await inkLedgerRows(user._id);
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe('sub_cancelled');
    expect(rows[0].balanceAfter).toBe(5); // only inkTopup survives
  });

  it('is a no-op for non-existent userId', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    await expect(cancelSubscriptionInk(fakeId)).resolves.toBeUndefined();
  });
});

// ── Test 6 — No annual carry (T-433): plan Ink expires, yearly included ───

describe('grantSubscriptionInk — no annual carry (T-433)', () => {
  it('leaves inkAnnualCarry at 0 on a yearly grant with leftover inkSub', async () => {
    const user = await createUser({ inkSub: 40, inkAnnualCarry: 0 });

    const granted = await grantSubscriptionInk({
      userId: user._id.toString(),
      inkUnits: 100,
      planTier: 'solo',
      billingCycle: 'yearly',
    });

    expect(granted).toBe(100);

    const updated = await User.findById(user._id).lean();
    expect(updated!.inkSub).toBe(100);
    expect(updated!.inkAnnualCarry).toBe(0); // was 20 before T-433
    expect(updated!.inkSubMonthlyAllotment).toBe(100);
  });

  it('keeps carry 0, drops old sub Ink and leaves inkTopup unchanged on a yearly grant', async () => {
    const user = await createUser({ inkSub: 500, inkAnnualCarry: 0, inkTopup: 37 });

    await grantSubscriptionInk({
      userId: user._id.toString(),
      inkUnits: 100,
      planTier: 'pro',
      billingCycle: 'yearly',
    });

    const updated = await User.findById(user._id).lean();
    expect(updated!.inkAnnualCarry).toBe(0);
    expect(updated!.inkSub).toBe(100); // exactly the new allotment, old 500 expired
    expect(updated!.inkTopup).toBe(37); // top-up Ink never expires
  });

  it('never increases a seeded carry on a yearly grant', async () => {
    // Legacy value seeded directly; the grant must neither add to it nor cap it.
    const user = await createUser({ inkSub: 80, inkAnnualCarry: 150 });

    await grantSubscriptionInk({
      userId: user._id.toString(),
      inkUnits: 100,
      planTier: 'solo',
      billingCycle: 'yearly',
    });

    const updated = await User.findById(user._id).lean();
    expect(updated!.inkAnnualCarry).toBe(150); // exactly as seeded
    expect(updated!.inkSub).toBe(100);
  });

  it('does not push a seeded carry above the old 2x cap either', async () => {
    const user = await createUser({ inkSub: 500, inkAnnualCarry: 190 });

    await grantSubscriptionInk({
      userId: user._id.toString(),
      inkUnits: 100,
      planTier: 'pro',
      billingCycle: 'yearly',
    });

    const updated = await User.findById(user._id).lean();
    expect(updated!.inkAnnualCarry).toBe(190);
  });

  it('ledger balanceAfter on a yearly grant is new sub + topup, with no carry added', async () => {
    const user = await createUser({ inkSub: 60, inkAnnualCarry: 0, inkTopup: 10 });

    await grantSubscriptionInk({
      userId: user._id.toString(),
      inkUnits: 100,
      planTier: 'solo',
      billingCycle: 'yearly',
    });

    const rows = await inkLedgerRows(user._id);
    expect(rows).toHaveLength(1);
    expect(rows[0].delta).toBe(100);
    expect(rows[0].balanceAfter).toBe(110); // 100 sub + 0 carry + 10 topup (was 130 with carry)
  });

  it('does NOT carry on monthly renewal', async () => {
    const user = await createUser({ inkSub: 80, inkAnnualCarry: 50 });

    await grantSubscriptionInk({
      userId: user._id.toString(),
      inkUnits: 100,
      planTier: 'solo',
      billingCycle: 'monthly',
    });

    const updated = await User.findById(user._id).lean();
    expect(updated!.inkAnnualCarry).toBe(50); // unchanged on monthly
    expect(updated!.inkSub).toBe(100); // reset to new allotment
  });

  it('resets inkSub to new allotment (not increment)', async () => {
    const user = await createUser({ inkSub: 999 });

    await grantSubscriptionInk({
      userId: user._id.toString(),
      inkUnits: 100,
      planTier: 'solo',
      billingCycle: 'monthly',
    });

    const updated = await User.findById(user._id).lean();
    expect(updated!.inkSub).toBe(100); // set, not 999+100
  });

  it('returns 0 for non-existent userId', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const result = await grantSubscriptionInk({
      userId: fakeId,
      inkUnits: 100,
      planTier: 'solo',
      billingCycle: 'monthly',
    });
    expect(result).toBe(0);
  });

  it('writes a ledger row with reason sub_renewal', async () => {
    const user = await createUser({ inkSub: 10 });

    await grantSubscriptionInk({
      userId: user._id.toString(),
      inkUnits: 100,
      planTier: 'solo',
      billingCycle: 'monthly',
    });

    const rows = await inkLedgerRows(user._id);
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe('sub_renewal');
    expect(rows[0].delta).toBe(100);
    expect(rows[0].sourceBucket).toBe('sub');
  });
});

// ── Additional: getInkBalance ──────────────────────────────────────────────

describe('getInkBalance', () => {
  it('returns correct balances and totalSpendable', async () => {
    const user = await createUser({ inkSub: 10, inkAnnualCarry: 5, inkTopup: 3 });

    const bal = await getInkBalance(user._id.toString());

    expect(bal).not.toBeNull();
    expect(bal!.inkSub).toBe(10);
    expect(bal!.inkAnnualCarry).toBe(5);
    expect(bal!.inkTopup).toBe(3);
    expect(bal!.totalSpendable).toBe(18);
  });

  it('returns null for non-existent user', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    expect(await getInkBalance(fakeId)).toBeNull();
  });

  it('returns null for invalid userId', async () => {
    expect(await getInkBalance('not-a-valid-id')).toBeNull();
  });
});

// ── Additional: grantTopupInk ──────────────────────────────────────────────

describe('grantTopupInk', () => {
  it('increments inkTopup and writes a ledger row', async () => {
    const user = await createUser({ inkTopup: 6 });

    const granted = await grantTopupInk({
      userId: user._id.toString(),
      inkUnits: 20,
      razorpayOrderId: 'order_abc123',
      razorpayPaymentId: 'pay_xyz789',
      topupSkuId: 'ink_mid',
      amountInr: 49900,
    });

    expect(granted).toBe(20);

    const updated = await User.findById(user._id).lean();
    expect(updated!.inkTopup).toBe(26); // 6 + 20

    const rows = await inkLedgerRows(user._id);
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe('topup_purchase');
    expect(rows[0].delta).toBe(20);
    expect(rows[0].sourceBucket).toBe('topup');
    expect(rows[0].reference).toBe('order_abc123');
  });

  it('is idempotent on duplicate razorpayOrderId', async () => {
    const user = await createUser({ inkTopup: 0 });

    await grantTopupInk({
      userId: user._id.toString(),
      inkUnits: 20,
      razorpayOrderId: 'order_dup001',
      topupSkuId: 'ink_mid',
      amountInr: 49900,
    });

    const second = await grantTopupInk({
      userId: user._id.toString(),
      inkUnits: 20,
      razorpayOrderId: 'order_dup001',
      topupSkuId: 'ink_mid',
      amountInr: 49900,
    });

    expect(second).toBe(0); // duplicate skipped

    const updated = await User.findById(user._id).lean();
    expect(updated!.inkTopup).toBe(20); // only credited once
  });
});

// ── Additional: seedFreeInk ────────────────────────────────────────────────

describe('seedFreeInk', () => {
  it('seeds 10 units into inkTopup for a fresh user', async () => {
    const user = await createUser({ inkSub: 0, inkAnnualCarry: 0, inkTopup: 0 });

    await seedFreeInk(user._id.toString());

    const updated = await User.findById(user._id).lean();
    expect(updated!.inkTopup).toBe(10);

    const rows = await inkLedgerRows(user._id);
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe('free_seed');
    expect(rows[0].delta).toBe(10);
  });

  it('is idempotent — does not re-seed if ink already exists', async () => {
    const user = await createUser({ inkTopup: 10 });

    await seedFreeInk(user._id.toString());
    await seedFreeInk(user._id.toString());

    const updated = await User.findById(user._id).lean();
    expect(updated!.inkTopup).toBe(10); // still 10, not 30

    const rows = await inkLedgerRows(user._id);
    expect(rows).toHaveLength(0); // no ledger rows written
  });
});

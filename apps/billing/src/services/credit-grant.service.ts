/**
 * Billing-side credit grant — writes subscriptionCredits / topupCredits to the
 * shared User collection + appends a CreditLedger row when a Razorpay webhook
 * confirms a successful charge.
 *
 * Mirrors the auth-side `credit-bonus.service.ts` (direct Mongo writes; no
 * cross-service round-trip). The drafting service owns the canonical schema.
 */
import mongoose from 'mongoose';

import logger from '../config/logger';
import { User } from '../models/User.model';

interface LedgerRow {
  userId: string;
  source: 'plan_renewal' | 'topup_purchase';
  bucket: 'subscriptionCredits' | 'topupCredits';
  amount: number;
  balanceAfter: number;
  reference?: string;
  metadata?: Record<string, unknown>;
}

async function writeLedgerRow(row: LedgerRow): Promise<void> {
  const conn = mongoose.connection;
  if (!conn.db) return;
  try {
    await conn.db.collection('creditledgers').insertOne({
      userId: new mongoose.Types.ObjectId(row.userId),
      source: row.source,
      bucket: row.bucket,
      amount: row.amount,
      balanceAfter: row.balanceAfter,
      reference: row.reference,
      metadata: row.metadata,
      createdAt: new Date(),
    });
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : err },
      'credit-grant: ledger insert failed',
    );
  }
}

/**
 * Grant subscriptionCredits on plan renewal. The bucket is RESET (not
 * incremented) — last month's subscription credits lapse on renewal.
 */
export async function grantSubscriptionCredits(input: {
  userId: string;
  credits: number;
  planTier: 'practice' | 'firm';
  billingCycle: 'monthly' | 'yearly';
  planRenewsAt?: Date;
  razorpaySubscriptionId?: string;
  amountInr?: number;
}): Promise<number> {
  const { userId, credits, planTier, billingCycle, planRenewsAt, razorpaySubscriptionId, amountInr } = input;
  if (!mongoose.Types.ObjectId.isValid(userId)) return 0;

  // Set (not increment) for subscriptionCredits — monthly grant lapses each cycle.
  const updated = await User.findByIdAndUpdate(
    new mongoose.Types.ObjectId(userId),
    {
      $set: {
        subscriptionCredits: credits,
        planTier,
        billingCycle,
        ...(planRenewsAt ? { planRenewsAt } : {}),
        plan: 'pro' as const, // keep legacy boolean in sync
      },
    },
    { new: true },
  ).lean();
  if (!updated) return 0;

  await writeLedgerRow({
    userId,
    source: 'plan_renewal',
    bucket: 'subscriptionCredits',
    amount: credits,
    balanceAfter: credits,
    reference: `${planTier} ${billingCycle} renewal`,
    metadata: { razorpaySubscriptionId, amountInr, planTier, billingCycle },
  });

  logger.info(
    { userId, credits, planTier, billingCycle },
    'subscription credits granted',
  );
  return credits;
}

/** Grant topupCredits on a successful one-off Razorpay order. */
export async function grantTopupCredits(input: {
  userId: string;
  credits: number;
  amountInr: number;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  topupSkuId: string;
}): Promise<number> {
  const { userId, credits, amountInr, razorpayOrderId, razorpayPaymentId, topupSkuId } = input;
  if (!mongoose.Types.ObjectId.isValid(userId)) return 0;

  const updated = await User.findByIdAndUpdate(
    new mongoose.Types.ObjectId(userId),
    { $inc: { topupCredits: credits } },
    { new: true },
  ).lean();
  if (!updated) return 0;

  await writeLedgerRow({
    userId,
    source: 'topup_purchase',
    bucket: 'topupCredits',
    amount: credits,
    balanceAfter: (updated.topupCredits as number | undefined) ?? credits,
    reference: `Top-up ${credits} credits`,
    metadata: { razorpayOrderId, razorpayPaymentId, amountInr, topupSkuId },
  });

  logger.info(
    { userId, credits, amountInr, razorpayOrderId },
    'topup credits granted',
  );
  return credits;
}

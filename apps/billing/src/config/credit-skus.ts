/**
 * Credit SKU catalog — pricing + Razorpay plan IDs.
 *
 * Source of truth for the public /pricing page, /billing/plans endpoint, and
 * credit allocation on webhook events. Prices are in INR (paise unit for
 * Razorpay).
 *
 * Razorpay plan IDs live in env (one per subscription SKU); top-up SKUs use
 * Razorpay one-off orders and don't need a pre-created plan.
 *
 * Per founder approval 2026-05-12 (mocks: Pricing Design folder).
 *
 * ---------------------------------------------------------------------------
 * CFO SIGN-OFF — 2026-05-12 — Vikram
 * Verified all 7 SKUs (4 subscription + 3 top-up) against 2026-05-10
 * founder-approved credit-system decisions. All prices and credit grants
 * match. See ./BILLING_SIGNOFF.md for full audit table.
 * Cleared for SCRUM-73 production rollout.
 * ---------------------------------------------------------------------------
 */

export interface SubscriptionPlanSku {
  id: 'practice_monthly' | 'practice_yearly' | 'firm_monthly' | 'firm_yearly';
  tier: 'practice' | 'firm';
  cycle: 'monthly' | 'yearly';
  priceInr: number; // total rupees charged per period
  creditsPerCycle: number; // grants this many subscriptionCredits per renewal
  /** Reads from env so the founder can swap Razorpay plans without redeploy. */
  razorpayPlanIdEnvKey:
    | 'RAZORPAY_PLAN_PRACTICE_MONTHLY'
    | 'RAZORPAY_PLAN_PRACTICE_YEARLY'
    | 'RAZORPAY_PLAN_FIRM_MONTHLY'
    | 'RAZORPAY_PLAN_FIRM_YEARLY';
}

export const SUBSCRIPTION_PLANS: SubscriptionPlanSku[] = [
  {
    id: 'practice_monthly',
    tier: 'practice',
    cycle: 'monthly',
    priceInr: 799,
    creditsPerCycle: 80,
    razorpayPlanIdEnvKey: 'RAZORPAY_PLAN_PRACTICE_MONTHLY',
  },
  {
    id: 'practice_yearly',
    tier: 'practice',
    cycle: 'yearly',
    priceInr: 7990,
    creditsPerCycle: 80, // monthly drip — same monthly grant
    razorpayPlanIdEnvKey: 'RAZORPAY_PLAN_PRACTICE_YEARLY',
  },
  {
    id: 'firm_monthly',
    tier: 'firm',
    cycle: 'monthly',
    priceInr: 1499,
    creditsPerCycle: 200,
    razorpayPlanIdEnvKey: 'RAZORPAY_PLAN_FIRM_MONTHLY',
  },
  {
    id: 'firm_yearly',
    tier: 'firm',
    cycle: 'yearly',
    priceInr: 14990,
    creditsPerCycle: 200,
    razorpayPlanIdEnvKey: 'RAZORPAY_PLAN_FIRM_YEARLY',
  },
];

export interface TopupSku {
  id: 'topup_20' | 'topup_60' | 'topup_150';
  credits: number;
  priceInr: number;
  badge?: 'POPULAR' | 'BEST_VALUE';
  pricePerCreditInr: number;
}

export const TOPUP_SKUS: TopupSku[] = [
  { id: 'topup_20', credits: 20, priceInr: 199, pricePerCreditInr: 9.95 },
  { id: 'topup_60', credits: 60, priceInr: 499, badge: 'POPULAR', pricePerCreditInr: 8.32 },
  { id: 'topup_150', credits: 150, priceInr: 999, badge: 'BEST_VALUE', pricePerCreditInr: 6.66 },
];

export function findSubscriptionPlan(id: string): SubscriptionPlanSku | undefined {
  return SUBSCRIPTION_PLANS.find((p) => p.id === id);
}

export function findTopupSku(id: string): TopupSku | undefined {
  return TOPUP_SKUS.find((t) => t.id === id);
}

/** Reverse lookup by Razorpay plan id at webhook time. */
export function findPlanByRazorpayId(razorpayPlanId: string): SubscriptionPlanSku | undefined {
  for (const plan of SUBSCRIPTION_PLANS) {
    if (process.env[plan.razorpayPlanIdEnvKey] === razorpayPlanId) return plan;
  }
  return undefined;
}

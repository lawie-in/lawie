/**
 * Credit SKU catalog — Ink pricing, Razorpay plan IDs.
 *
 * Source of truth for the public /pricing page, /billing/plans endpoint, and
 * ink allocation on webhook events. Prices are in INR (paise for Razorpay).
 *
 * Subscription plan IDs live in env (one per SKU); top-up SKUs use one-off
 * Razorpay Orders and don't need pre-created plans.
 *
 * Ink amounts are in display units (1 Ink = 2 integer units in the ledger).
 * Callers multiply by 2 before passing to grantSubscriptionInk / grantTopupInk.
 *
 * Per SCRUM-102 — Ink pricing finalized 2026-06-10 (Pricing Model Finalized doc).
 */

export interface SubscriptionPlanSku {
  id: 'solo_monthly' | 'solo_yearly' | 'pro_monthly' | 'pro_yearly';
  tier: 'solo' | 'pro';
  cycle: 'monthly' | 'yearly';
  priceInr: number;
  inkPerCycle: number; // Ink display units per renewal (×2 to get ledger units)
  /** Reads from env so the founder can swap Razorpay plans without redeploy. */
  razorpayPlanIdEnvKey:
    | 'RAZORPAY_PLAN_SOLO_MONTHLY'
    | 'RAZORPAY_PLAN_SOLO_YEARLY'
    | 'RAZORPAY_PLAN_PRO_MONTHLY'
    | 'RAZORPAY_PLAN_PRO_YEARLY';
}

export const SUBSCRIPTION_PLANS: SubscriptionPlanSku[] = [
  {
    id: 'solo_monthly',
    tier: 'solo',
    cycle: 'monthly',
    priceInr: 799,
    inkPerCycle: 50,
    razorpayPlanIdEnvKey: 'RAZORPAY_PLAN_SOLO_MONTHLY',
  },
  {
    id: 'solo_yearly',
    tier: 'solo',
    cycle: 'yearly',
    priceInr: 7990,
    inkPerCycle: 50, // monthly drip — same monthly grant per renewal
    razorpayPlanIdEnvKey: 'RAZORPAY_PLAN_SOLO_YEARLY',
  },
  {
    id: 'pro_monthly',
    tier: 'pro',
    cycle: 'monthly',
    priceInr: 1999,
    inkPerCycle: 150,
    razorpayPlanIdEnvKey: 'RAZORPAY_PLAN_PRO_MONTHLY',
  },
  {
    id: 'pro_yearly',
    tier: 'pro',
    cycle: 'yearly',
    priceInr: 19990,
    inkPerCycle: 150,
    razorpayPlanIdEnvKey: 'RAZORPAY_PLAN_PRO_YEARLY',
  },
];

export interface TopupSku {
  id: 'topup_mini' | 'topup_mid' | 'topup_max';
  ink: number; // Ink display units (×2 to get ledger units)
  priceInr: number;
  badge?: 'POPULAR' | 'BEST_VALUE';
  pricePerInkInr: number;
}

export const TOPUP_SKUS: TopupSku[] = [
  { id: 'topup_mini', ink: 3, priceInr: 65, pricePerInkInr: 21.7 },
  { id: 'topup_mid', ink: 10, priceInr: 199, badge: 'POPULAR', pricePerInkInr: 19.9 },
  { id: 'topup_max', ink: 28, priceInr: 499, badge: 'BEST_VALUE', pricePerInkInr: 17.8 },
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

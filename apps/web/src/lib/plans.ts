/**
 * Billing plan catalogue (T-370). The single source for plan names, prices and Ink shown in the
 * web app: billing's public GET /api/billing/plans. Never hard-code a price or Ink amount.
 */
import { apiFetch } from './apiFetch';

export type PlanTier = 'solo' | 'pro';
export type PlanCycle = 'monthly' | 'yearly';

export interface SubscriptionPlan {
  id: string;
  tier: PlanTier;
  cycle: PlanCycle;
  priceInr: number;
  /** Ink granted per month (yearly plans drip the same monthly grant). */
  inkPerCycle: number;
}

export interface TopupSku {
  id: string;
  ink: number;
  priceInr: number;
  badge?: 'POPULAR' | 'BEST_VALUE';
  pricePerInkInr: number;
}

export interface PlanCatalogue {
  subscriptions: SubscriptionPlan[];
  topups: TopupSku[];
}

/** Fetch the plan catalogue from billing. Throws on a network error or a non-2xx response. */
export async function fetchPlans(): Promise<PlanCatalogue> {
  const res = await apiFetch('/api/billing/plans');
  if (!res.ok) throw new Error(`GET /api/billing/plans failed: ${res.status}`);
  const body = (await res.json()) as Partial<PlanCatalogue> | null;
  if (!body || !Array.isArray(body.subscriptions)) {
    throw new Error('GET /api/billing/plans returned no subscriptions');
  }
  return {
    subscriptions: body.subscriptions,
    topups: Array.isArray(body.topups) ? body.topups : [],
  };
}

/** Display name of a plan's tier, e.g. "Pro". */
export function planName(plan: SubscriptionPlan): string {
  return plan.tier.charAt(0).toUpperCase() + plan.tier.slice(1);
}

/** Price per cycle, e.g. "₹1,999/month" (or "₹1,999/mo" with `short`). */
export function formatPlanPrice(plan: SubscriptionPlan, short = false): string {
  const per = plan.cycle === 'yearly' ? (short ? 'yr' : 'year') : short ? 'mo' : 'month';
  return `₹${plan.priceInr.toLocaleString('en-IN')}/${per}`;
}

/** Monthly Ink grant, e.g. "150 Ink/month". */
export function formatPlanInk(plan: SubscriptionPlan): string {
  return `${plan.inkPerCycle} Ink/month`;
}

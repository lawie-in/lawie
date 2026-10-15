/**
 * T-364: the one source of subscription plan data (price, cycle, Ink) for
 * billing (credit-skus.ts SUBSCRIPTION_PLANS, which also serves GET /plans) and
 * the web pricing/marketing pages and PaywallModal (imported at build time).
 * Plain const, no Node-only imports: it is bundled into the browser.
 *
 * priceInr is whole rupees per cycle. inkPerCycle is DISPLAY Ink per month
 * (yearly plans drip the same monthly grant; settleYearlyDrip).
 *
 * Numbers per Vikram (handoff/finance/T-399-T-398-vikram.md): unchanged.
 */
export const PLANS = {
  solo_monthly: { tier: 'solo', cycle: 'monthly', priceInr: 799, inkPerCycle: 50 },
  solo_yearly: { tier: 'solo', cycle: 'yearly', priceInr: 7990, inkPerCycle: 50 },
  pro_monthly: { tier: 'pro', cycle: 'monthly', priceInr: 1999, inkPerCycle: 150 },
  pro_yearly: { tier: 'pro', cycle: 'yearly', priceInr: 19990, inkPerCycle: 150 },
} as const;

export type SubscriptionPlanId = keyof typeof PLANS;

/**
 * T-399: Ink per plan, used by the yearly drip (settleYearlyDrip). Derived from
 * PLANS. Values are DISPLAY Ink per month (what the pricing page says). The
 * users collection stores Ink as integer ledger units, so multiply by
 * INK_UNITS_PER_INK before writing inkSub and friends.
 */
export const INK_PER_CYCLE = {
  solo_monthly: PLANS.solo_monthly.inkPerCycle,
  solo_yearly: PLANS.solo_yearly.inkPerCycle,
  pro_monthly: PLANS.pro_monthly.inkPerCycle,
  pro_yearly: PLANS.pro_yearly.inkPerCycle,
} as const;

/** 1 display Ink = 2 ledger units (0.5 Ink = 1 unit, so no floats). */
export const INK_UNITS_PER_INK = 2;

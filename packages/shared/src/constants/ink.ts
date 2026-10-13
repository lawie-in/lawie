/**
 * T-399: Ink per plan, one source for billing (credit-skus.ts) and the yearly
 * drip (settleYearlyDrip). Values are DISPLAY Ink per month (what the pricing
 * page says). The users collection stores Ink as integer ledger units, so
 * multiply by INK_UNITS_PER_INK before writing inkSub and friends.
 *
 * Numbers per Vikram (handoff/finance/T-399-T-398-vikram.md): unchanged.
 */
export const INK_PER_CYCLE = {
  solo_monthly: 50,
  solo_yearly: 50,
  pro_monthly: 150,
  pro_yearly: 150,
} as const;

export type SubscriptionPlanId = keyof typeof INK_PER_CYCLE;

/** 1 display Ink = 2 ledger units (0.5 Ink = 1 unit, so no floats). */
export const INK_UNITS_PER_INK = 2;

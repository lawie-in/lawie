/**
 * T-523: credits and billing mocks. Shapes are the app's own types (type-only imports, erased at
 * run time), so a change to what the app expects breaks `tsc`, not just a spec.
 */
import type { SubscriptionStatus } from '../../src/components/billing/subscriptionStatus';
import type { CreditBalance } from '../../src/hooks/useCredits';
import type { PlanCatalogue, SubscriptionPlan, TopupSku } from '../../src/lib/plans';
import { E2E_BASE_URL, isLocalUrl } from '../guards';

// ── GET /api/credits/balance (raw body, hooks/useCredits.ts) ──────────────────────────────────

/** Default: a Free user with 5 Ink (top-up bucket). */
export function creditBalance(overrides: Partial<CreditBalance> = {}): CreditBalance {
  return {
    topupCredits: 0,
    earnedCredits: 0,
    subscriptionCredits: 0,
    total: 0,
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: 5,
    totalInk: 5,
    inkSubMonthlyAllotment: 0,
    planTier: 'free',
    billingCycle: 'none',
    ...overrides,
  };
}

export const balances = {
  free: () => creditBalance(),
  zeroInk: () => creditBalance({ inkTopup: 0, totalInk: 0 }),
  solo: () =>
    creditBalance({
      inkSub: 50,
      inkTopup: 0,
      totalInk: 50,
      inkSubMonthlyAllotment: 50,
      planTier: 'solo',
      billingCycle: 'monthly',
    }),
  pro: () =>
    creditBalance({
      inkSub: 150,
      inkTopup: 0,
      totalInk: 150,
      inkSubMonthlyAllotment: 150,
      planTier: 'pro',
      billingCycle: 'monthly',
    }),
};

// ── GET /api/billing/status ({ data }, components/billing/subscriptionStatus.ts) ──────────────

/** A fixed renewal date, so screenshots do not drift with the clock. */
export const E2E_RENEWS_AT = '2026-11-22T00:00:00.000Z';

export function subscriptionStatus(overrides: Partial<SubscriptionStatus> = {}): {
  status: 'success';
  data: SubscriptionStatus;
} {
  return {
    status: 'success',
    data: {
      status: null,
      tier: 'free',
      renewsAt: null,
      state: 'active',
      cancelAtCycleEnd: false,
      ...overrides,
    },
  };
}

export const statuses = {
  free: () => subscriptionStatus(),
  solo: () => subscriptionStatus({ status: 'active', tier: 'solo', renewsAt: E2E_RENEWS_AT }),
  pro: () => subscriptionStatus({ status: 'active', tier: 'pro', renewsAt: E2E_RENEWS_AT }),
  pastDue: (tier: 'solo' | 'pro' = 'pro') =>
    subscriptionStatus({ status: 'pending', tier, renewsAt: E2E_RENEWS_AT, state: 'past_due' }),
  endsAt: (tier: 'solo' | 'pro' = 'pro') =>
    subscriptionStatus({
      status: 'active',
      tier,
      renewsAt: E2E_RENEWS_AT,
      cancelAtCycleEnd: true,
    }),
  lapsed: (tier: 'solo' | 'pro' = 'pro') =>
    subscriptionStatus({ status: 'halted', tier, renewsAt: E2E_RENEWS_AT, state: 'lapsed' }),
};

// ── GET /api/billing/plans (raw body, lib/plans.ts; values from @lawie/shared PLANS) ──────────

export const E2E_SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  { id: 'solo_monthly', tier: 'solo', cycle: 'monthly', priceInr: 799, inkPerCycle: 50 },
  { id: 'solo_yearly', tier: 'solo', cycle: 'yearly', priceInr: 7990, inkPerCycle: 50 },
  { id: 'pro_monthly', tier: 'pro', cycle: 'monthly', priceInr: 1999, inkPerCycle: 150 },
  { id: 'pro_yearly', tier: 'pro', cycle: 'yearly', priceInr: 19990, inkPerCycle: 150 },
];

/** apps/billing/src/config/credit-skus.ts TOPUP_SKUS. */
export const E2E_TOPUPS: TopupSku[] = [
  { id: 'topup_mini', ink: 3, priceInr: 65, pricePerInkInr: 21.7 },
  { id: 'topup_mid', ink: 10, priceInr: 199, badge: 'POPULAR', pricePerInkInr: 19.9 },
  { id: 'topup_max', ink: 28, priceInr: 499, badge: 'BEST_VALUE', pricePerInkInr: 17.8 },
];

export function plansCatalogue(overrides: Partial<PlanCatalogue> = {}): PlanCatalogue {
  return { subscriptions: E2E_SUBSCRIPTION_PLANS, topups: E2E_TOPUPS, ...overrides };
}

// ── GET /api/billing/invoices ({ data: rows }, components/billing/InvoicesCard.tsx) ──────────

export interface InvoiceRowBody {
  id: string;
  number: string;
  kind: 'invoice' | 'credit_note';
  issuedAt: string;
  total: number;
  originalInvoiceNumber?: string | null;
  placeOfSupply?: { source: 'user' | 'fallback' } | null;
}

export function invoiceRow(overrides: Partial<InvoiceRowBody> = {}): InvoiceRowBody {
  return {
    id: 'inv_e2e_0001',
    number: 'LW/2026-27/0001',
    kind: 'invoice',
    issuedAt: '2026-10-01T06:30:00.000Z',
    total: 1999,
    originalInvoiceNumber: null,
    placeOfSupply: { source: 'user' },
    ...overrides,
  };
}

export function invoices(rows: InvoiceRowBody[] = []): {
  status: 'success';
  data: InvoiceRowBody[];
} {
  return { status: 'success', data: rows };
}

// ── POST /api/billing/subscribe and /cancel ───────────────────────────────────────────────────

/**
 * POST /api/billing/subscribe. The app sends the browser to `shortUrl`, so it MUST be local
 * (never a Razorpay host): throws otherwise.
 */
export function subscribeReply(shortUrl = `${E2E_BASE_URL}/dashboard/payment/success?e2e=1`): {
  status: 'success';
  data: { shortUrl: string };
} {
  if (!isLocalUrl(shortUrl)) {
    throw new Error(`T-550: subscribe shortUrl must be a local URL, got ${shortUrl}`);
  }
  return { status: 'success', data: { shortUrl } };
}

/** POST /api/billing/cancel: the status after a cancel at cycle end. */
export function cancelReply(tier: 'solo' | 'pro' = 'pro'): ReturnType<typeof subscriptionStatus> {
  return statuses.endsAt(tier);
}

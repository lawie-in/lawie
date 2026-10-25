/**
 * T-509: the subscription status from billing's GET /api/billing/status (T-508), and the rules
 * the settings Plan block and the payment success page share.
 */
import { apiFetch } from '@/lib/apiFetch';

export type PaidTier = 'solo' | 'pro';
export type AnyTier = 'free' | PaidTier;
export type SubscriptionState = 'active' | 'past_due' | 'lapsed';

export interface SubscriptionStatus {
  /** Raw Razorpay-side status, or null when the user never had a subscription. */
  status: string | null;
  tier: AnyTier;
  /** ISO date the paid period runs to, or null. */
  renewsAt: string | null;
  state: SubscriptionState;
  cancelAtCycleEnd: boolean;
}

const TIERS: readonly AnyTier[] = ['free', 'solo', 'pro'];
const STATES: readonly SubscriptionState[] = ['active', 'past_due', 'lapsed'];

/** The status payload, or null when the body is not what T-508 serves. */
export function parseSubscriptionStatus(data: unknown): SubscriptionStatus | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  if (!TIERS.includes(d.tier as AnyTier) || !STATES.includes(d.state as SubscriptionState)) {
    return null;
  }
  return {
    status: typeof d.status === 'string' ? d.status : null,
    tier: d.tier as AnyTier,
    renewsAt: typeof d.renewsAt === 'string' ? d.renewsAt : null,
    state: d.state as SubscriptionState,
    cancelAtCycleEnd: d.cancelAtCycleEnd === true,
  };
}

/** GET /api/billing/status. Throws on a network error, a non-2xx reply or an unexpected body. */
export async function fetchSubscriptionStatus(): Promise<SubscriptionStatus> {
  const res = await apiFetch('/api/billing/status', { cache: 'no-store' });
  if (!res.ok) throw new Error(`GET /api/billing/status failed: ${res.status}`);
  const body = (await res.json()) as { data?: unknown } | null;
  const parsed = parseSubscriptionStatus(body?.data);
  if (!parsed) throw new Error('GET /api/billing/status returned an unexpected body');
  return parsed;
}

/** The plan tier on the credits balance (what the webhook has granted), or null if unknown. */
export async function fetchCreditsPlanTier(): Promise<AnyTier | null> {
  try {
    const res = await apiFetch('/api/credits/balance');
    if (!res.ok) return null;
    const body = (await res.json()) as { planTier?: unknown } | null;
    return TIERS.includes(body?.planTier as AnyTier) ? (body!.planTier as AnyTier) : null;
  } catch {
    return null;
  }
}

/** Live: the user is on the plan (paid, or in payment trouble inside the paid period). */
export function isLive(s: SubscriptionStatus): boolean {
  return s.state === 'active' || s.state === 'past_due';
}

/**
 * The plan the user is on. A lapsed or unfinished subscription counts as Free, except
 * `authenticated` (Razorpay took the mandate; the webhook has not activated the plan yet).
 */
export function currentTier(s: SubscriptionStatus): AnyTier {
  if (isLive(s) || s.status === 'authenticated') return s.tier;
  return 'free';
}

/** The plan ends at the end of the paid period (cancelled at cycle end, or ended at Razorpay). */
export function endsAtPeriodEnd(s: SubscriptionStatus): boolean {
  return s.cancelAtCycleEnd || s.status === 'cancelled' || s.status === 'completed';
}

/**
 * Pending Ink (AC3): billing says a paid plan is active or authorised, but the credits balance
 * (the webhook's grant) is still on another tier. While this is true the Ink shown is stale.
 */
export function isInkPending(s: SubscriptionStatus | null, creditsTier: AnyTier | null): boolean {
  if (!s || creditsTier === null) return false;
  if (s.status !== 'active' && s.status !== 'authenticated') return false;
  const tier = currentTier(s);
  return tier !== 'free' && creditsTier !== tier;
}

/** How often, and for how long, a pending state is re-checked. Bounded: never a forever poll. */
export const PENDING_POLL_MS = 5000;
export const PENDING_POLL_LIMIT_MS = 120_000;

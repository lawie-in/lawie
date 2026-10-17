'use client';

import { CheckCircle2, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { PLAN_COPY, tierName } from '@/components/billing/planCopy';
import {
  PENDING_POLL_LIMIT_MS,
  currentTier,
  fetchCreditsPlanTier,
  fetchSubscriptionStatus,
  type PaidTier,
} from '@/components/billing/subscriptionStatus';
import { useAuth } from '@/context/AuthContext';
import { notifyCreditsChanged } from '@/hooks/useCredits';
import { refreshAccessToken } from '@/lib/apiFetch';
import { getRefreshToken } from '@/lib/auth';

/** How often the page re-checks billing while the plan has not landed. */
const SUCCESS_POLL_MS = 3000;
/** Pause on the final line before going to the dashboard. */
const REDIRECT_AFTER_MS = 1500;

type Phase = 'pending' | 'landed' | 'timeout';

/**
 * Razorpay redirects here after a subscription payment (callback_url, billing T-444).
 *
 * T-509 (AC3): never show Ink that has gone stale. Until billing's GET /status says the paid
 * plan is active AND the credits balance is on that plan (the webhook has granted it), the page
 * shows the pending line, re-checking every 3 s for at most 2 minutes. When the plan lands it
 * says "Welcome to Lawie {Solo|Pro}!" and goes to the dashboard; after 2 minutes it goes there
 * anyway (the dashboard keeps its own balance up to date).
 *
 * The session is refreshed once through apiFetch's shared refresh (T-299: refresh tokens are
 * single-use, so this page never calls /api/auth/refresh itself), so the new JWT carries the plan.
 */
export default function PaymentSuccessPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [phase, setPhase] = useState<Phase>('pending');
  const [tier, setTier] = useState<PaidTier | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    async function syncSession() {
      const access = await refreshAccessToken();
      const refresh = getRefreshToken();
      if (!cancelled && access && refresh) login(access, refresh);
    }

    function finish(next: Phase) {
      setPhase(next);
      timer = setTimeout(() => router.replace('/dashboard'), REDIRECT_AFTER_MS);
    }

    async function check() {
      let landed: PaidTier | null = null;
      try {
        const s = await fetchSubscriptionStatus();
        const t = currentTier(s);
        if (t !== 'free' && s.status === 'active' && (await fetchCreditsPlanTier()) === t) {
          landed = t;
        }
      } catch {
        // Billing unreachable for now: keep the pending line and try again.
      }
      if (cancelled) return;
      if (landed) {
        setTier(landed);
        await syncSession();
        if (cancelled) return;
        notifyCreditsChanged();
        finish('landed');
        return;
      }
      if (Date.now() - startedAt >= PENDING_POLL_LIMIT_MS) {
        await syncSession();
        if (!cancelled) finish('timeout');
        return;
      }
      timer = setTimeout(() => void check(), SUCCESS_POLL_MS);
    }

    void check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [login, router]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      {phase === 'landed' && tier ? (
        <>
          <CheckCircle2 size={40} className="text-green-500" aria-hidden="true" />
          <p className="text-lg font-bold text-slate-900" role="status">
            {`Welcome to Lawie ${tierName(tier)}!`}
          </p>
          <p className="text-sm text-slate-500">Redirecting you to the dashboard…</p>
        </>
      ) : (
        <>
          <Loader2 size={32} className="animate-spin text-amber-500" aria-hidden="true" />
          <p className="text-sm font-medium text-slate-700" role="status">
            {PLAN_COPY.paymentPending}
          </p>
          {phase === 'timeout' ? (
            <p className="text-sm text-slate-500">Redirecting you to the dashboard…</p>
          ) : null}
        </>
      )}
    </div>
  );
}

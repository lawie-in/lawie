'use client';

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
import {
  Card,
  Spinner,
  loopPlayState,
  usePageVisible,
  usePrefersReducedMotion,
} from '@/components/ui';
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
 * T-525: the landed mark. A brass disc with an On Brass check, drawn inline (ui/Seal needs signed
 * lettering and there is none for this page). Decorative: the welcome line carries the meaning.
 * It stamps in once with the seal's motion (globals.css .nl-seal-stamping, halved on the mobile
 * cap); under reduced motion, or when the tab is hidden as it lands, it shows the end state, and
 * a stamp in progress pauses while the tab is hidden.
 */
function LandedMark() {
  const reduced = usePrefersReducedMotion();
  const visible = usePageVisible();
  // Decided once, when the mark mounts: a landing seen later (hidden tab) does not replay.
  const [stamp] = useState(() => !reduced && visible);
  return (
    <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true" className="overflow-visible">
      <g
        className={stamp ? 'nl-seal-stamping' : 'nl-seal-stamped'}
        style={stamp ? loopPlayState(visible) : undefined}
      >
        <circle cx="32" cy="32" r="30" fill="var(--brass)" />
        <circle
          cx="32"
          cy="32"
          r="25"
          fill="none"
          stroke="var(--on-brass)"
          strokeOpacity="0.6"
          strokeWidth="1.5"
        />
        <path
          d="M21 33l7 7 15-16"
          fill="none"
          stroke="var(--on-brass)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

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

  // T-525: the spinner loop pauses while the tab is hidden (spec 2.4); none under reduced motion
  // (Spinner's own motion-reduce rule).
  const pageVisible = usePageVisible();

  // T-525: a centred folio in the layout's Night Library container (no second max-width wrapper:
  // the card width is the dialog width, 440px).
  return (
    <div className="nl flex min-h-[60svh] items-center justify-center">
      <Card
        as="div"
        variant="folio"
        className="gap-nl-4 flex w-full max-w-[440px] flex-col items-center text-center"
      >
        {phase === 'landed' && tier ? (
          <>
            <LandedMark />
            <p className="nl-h2 text-nl-text" role="status">
              {`Welcome to Lawie ${tierName(tier)}!`}
            </p>
            <p className="nl-body text-nl-soft">Redirecting you to the dashboard…</p>
          </>
        ) : (
          <>
            <span className="text-nl-brass-dark" aria-hidden="true">
              <Spinner
                className={pageVisible ? 'h-8 w-8' : 'h-8 w-8 [animation-play-state:paused]'}
              />
            </span>
            <p className="nl-body text-nl-text" role="status">
              {PLAN_COPY.paymentPending}
            </p>
            {phase === 'timeout' ? (
              <p className="nl-body text-nl-soft">Redirecting you to the dashboard…</p>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}

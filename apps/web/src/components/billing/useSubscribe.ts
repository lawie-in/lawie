'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { isPrivacyBlocked, privacyFetch } from '@/components/PrivacyUpdatePrompt';
import { openVerifyIfDraftRefused } from '@/components/VerifyEmailPrompt';
import type { GstStateController } from '@/hooks/useGstState';
import { signupConsentGate } from '@/lib/signupConsent';

/** T-343 action key for the subscribe call (its P7 box and aria-describedby). */
export const SUBSCRIBE_ACTION_KEY = 'subscribe';

/**
 * Why a subscribe call stopped before payment: a gate the user can fix. The verify-email refusal
 * is not a gate since T-522: it opens the AJ-522-M6 Subscribe dialog instead.
 */
export type SubscribeGate = 'privacy' | null;

/**
 * T-509: starts a subscription for a plan id. The State is checked first (T-436), then
 * POST /api/billing/subscribe; on success the browser goes to Razorpay's page. The privacy gate
 * comes back as `gate`. A 403 email_verification_required opens the AJ-522-M6 Subscribe dialog at
 * the moment of the action (T-522, Rajesh §3; no redirect, Choose stays enabled). Every other
 * refusal (409 subscription_exists /
 * subscription_in_progress, 503 try_again, 500, a missing link, the network) is `failedPlanId`,
 * shown as the generic failure. Server text never reaches the user.
 */
export function useSubscribe(gst: GstStateController) {
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const [failedPlanId, setFailedPlanId] = useState<string | null>(null);
  const [gate, setGate] = useState<SubscribeGate>(null);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  // Set once the browser is sent to Razorpay: the buttons stay disabled while the page leaves,
  // so a second press cannot start another subscribe for the other plan.
  const redirecting = useRef(false);

  useEffect(() => {
    mounted.current = true;
    // Back from Razorpay: a page restored from the back/forward cache keeps the "redirecting"
    // state, so reset it or the Choose buttons stay disabled.
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      redirecting.current = false;
      inFlight.current = false;
      if (mounted.current) setPendingPlanId(null);
    };
    window.addEventListener('pageshow', onPageShow);
    return () => {
      mounted.current = false;
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  const subscribe = useCallback(
    async (planId: string) => {
      if (inFlight.current || redirecting.current) return;
      inFlight.current = true;
      // The pressed Choose button, read before it shows its loading state: the M6 dialog returns
      // focus here when it closes (Rajesh, 22 Oct).
      const chooser = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setPendingPlanId(planId);
      setFailedPlanId(null);
      try {
        // T-436 (spec §2): no State -> the picker shows its error and takes focus; no call.
        if (!(await gst.ensureReady())) return;
        // T-642 (AJ-642-M3/M6): no subscribe / upgrade checkout while the Google sign-up consent
        // is needed; the gate brings the consent panel into view. finally resets as usual.
        if (await signupConsentGate()) return;
        const res = await privacyFetch(SUBSCRIBE_ACTION_KEY, '/api/billing/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId }),
        });
        if (!mounted.current) return;
        if (isPrivacyBlocked(res)) {
          setGate('privacy');
          return;
        }
        if (await openVerifyIfDraftRefused(res, 'subscribe', chooser)) return;
        if (!res.ok) {
          setFailedPlanId(planId);
          return;
        }
        const body = (await res.json().catch(() => null)) as {
          data?: { shortUrl?: unknown };
        } | null;
        const shortUrl = body?.data?.shortUrl;
        if (typeof shortUrl === 'string' && shortUrl) {
          setGate(null);
          window.location.href = shortUrl;
          // After the assignment: if it throws, catch and finally reset as usual.
          redirecting.current = true;
          return;
        }
        if (mounted.current) setFailedPlanId(planId);
      } catch {
        if (mounted.current) setFailedPlanId(planId);
      } finally {
        if (!redirecting.current) {
          inFlight.current = false;
          if (mounted.current) setPendingPlanId(null);
        }
      }
    },
    [gst],
  );

  const clearGate = useCallback(() => setGate(null), []);
  const clearFailure = useCallback(() => setFailedPlanId(null), []);

  return { subscribe, pendingPlanId, failedPlanId, gate, clearGate, clearFailure };
}

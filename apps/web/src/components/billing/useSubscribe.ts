'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { isPrivacyBlocked, privacyFetch } from '@/components/PrivacyUpdatePrompt';
import { isEmailVerificationRequired } from '@/components/VerifyEmailPrompt';
import type { GstStateController } from '@/hooks/useGstState';

/** T-343 action key for the subscribe call (its P7 box and aria-describedby). */
export const SUBSCRIBE_ACTION_KEY = 'subscribe';

/** Why a subscribe call stopped before payment: a gate the user can fix. */
export type SubscribeGate = 'verify' | 'privacy' | null;

/**
 * T-509: starts a subscription for a plan id. The State is checked first (T-436), then
 * POST /api/billing/subscribe; on success the browser goes to Razorpay's page. The verify-email
 * and privacy gates come back as `gate`; every other refusal (409 subscription_exists /
 * subscription_in_progress, 503 try_again, 500, a missing link, the network) is `failedPlanId`,
 * shown as the generic failure. Server text never reaches the user.
 */
export function useSubscribe(gst: GstStateController) {
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const [failedPlanId, setFailedPlanId] = useState<string | null>(null);
  const [gate, setGate] = useState<SubscribeGate>(null);
  const mounted = useRef(true);
  const inFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const subscribe = useCallback(
    async (planId: string) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setPendingPlanId(planId);
      setFailedPlanId(null);
      try {
        // T-436 (spec §2): no State -> the picker shows its error and takes focus; no call.
        if (!(await gst.ensureReady())) return;
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
        if (await isEmailVerificationRequired(res)) {
          if (mounted.current) setGate('verify');
          return;
        }
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
          return;
        }
        if (mounted.current) setFailedPlanId(planId);
      } catch {
        if (mounted.current) setFailedPlanId(planId);
      } finally {
        inFlight.current = false;
        if (mounted.current) setPendingPlanId(null);
      }
    },
    [gst],
  );

  const clearGate = useCallback(() => setGate(null), []);
  const clearFailure = useCallback(() => setFailedPlanId(null), []);

  return { subscribe, pendingPlanId, failedPlanId, gate, clearGate, clearFailure };
}

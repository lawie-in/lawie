'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { CancelPlanDialog } from '@/components/billing/CancelPlanDialog';
import { PlanChooser, PlanChooserSkeleton } from '@/components/billing/PlanChooser';
import { PLAN_COPY, SUPPORT_EMAIL, planDate } from '@/components/billing/planCopy';
import {
  PENDING_POLL_LIMIT_MS,
  PENDING_POLL_MS,
  currentTier,
  fetchSubscriptionStatus,
  isInkPending,
  isLive,
  parseSubscriptionStatus,
  type AnyTier,
  type SubscriptionStatus,
} from '@/components/billing/subscriptionStatus';
import { SubscriptionStatusCard } from '@/components/billing/SubscriptionStatusCard';
import { SUBSCRIBE_ACTION_KEY, useSubscribe } from '@/components/billing/useSubscribe';
import {
  PrivacyBlockedNotice,
  isPrivacyBlocked,
  onPrivacyAccepted,
  privacyFetch,
  privacyPrecheck,
  usePrivacyDescribedBy,
} from '@/components/PrivacyUpdatePrompt';
import { Banner, Card, ErrorState, InkChip } from '@/components/ui';
import { useCredits } from '@/hooks/useCredits';
import type { GstStateController } from '@/hooks/useGstState';
import { fetchPlans, type SubscriptionPlan } from '@/lib/plans';

/** T-343 action key for the cancel call (its own P7 box). */
export const CANCEL_ACTION_KEY = 'plan-cancel';

const TIERS: readonly AnyTier[] = ['free', 'solo', 'pro'];

/** A subscription that ended (not an unfinished checkout) shows the Lapsed card. */
function showsStatusCard(s: SubscriptionStatus | null): s is SubscriptionStatus {
  if (!s || s.tier === 'free' || !s.status) return false;
  if (isLive(s)) return true;
  return s.state === 'lapsed' && s.status !== 'created' && s.status !== 'authenticated';
}

/** AJ-509-M2 banner text, with {support email} as a mailto link. */
function PaymentFailedMessage() {
  const [before, after] = PLAN_COPY.paymentFailedHelp(SUPPORT_EMAIL).split(SUPPORT_EMAIL);
  return (
    <>
      {before}
      <a href={`mailto:${SUPPORT_EMAIL}`} className="nl-focus underline underline-offset-4">
        {SUPPORT_EMAIL}
      </a>
      {after}
    </>
  );
}

export interface PlanPanelProps {
  /** The Plan block's State controller (T-436): checked before any subscribe call. */
  gst: GstStateController;
  /** The State nag and picker, rendered above the plan cards. */
  gstSlot?: React.ReactNode;
}

/**
 * T-509 — the Settings Plan block (Rajesh's spec §06; copy §4, §5). Ink (or "pending" after a
 * payment until the webhook lands), the gate and payment banners, the status card with Cancel,
 * the plan cards and the GST note. Plans and the current plan come from billing (GET /plans,
 * GET /status); the JWT plan is never used (it does not know Solo).
 */
export function PlanPanel({ gst, gstSlot }: PlanPanelProps) {
  const { balance, loaded, refresh } = useCredits();
  const { subscribe, pendingPlanId, failedPlanId, gate, clearGate } = useSubscribe(gst);
  const chooseDescribedBy = usePrivacyDescribedBy(SUBSCRIBE_ACTION_KEY);

  const [plans, setPlans] = useState<SubscriptionPlan[] | null>(null);
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadKey, setLoadKey] = useState(0);
  const mounted = useRef(true);

  const [switchNote, setSwitchNote] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelFailed, setCancelFailed] = useState(false);
  const [cancelBlocked, setCancelBlocked] = useState(false);
  const [cancelledDate, setCancelledDate] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Plans and status load together: the cards need the current plan to offer the right action.
  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    Promise.all([fetchPlans(), fetchSubscriptionStatus()])
      .then(([catalogue, s]) => {
        if (cancelled) return;
        // Yearly stays hidden (T-399).
        setPlans(catalogue.subscriptions.filter((p) => p.cycle === 'monthly'));
        setStatus(s);
        setLoadState('ready');
      })
      .catch(() => {
        if (!cancelled) setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [loadKey]);

  const reload = useCallback(() => setLoadKey((k) => k + 1), []);

  // An accepted privacy policy clears the privacy banner; the user presses the action again.
  useEffect(
    () =>
      onPrivacyAccepted(() => {
        clearGate();
        setCancelBlocked(false);
      }),
    [clearGate],
  );

  // ── Pending Ink (AC3) ──────────────────────────────────────────────────────────────────────
  // Rule: billing says a paid plan is active/authorised but the credits balance is still on
  // another tier, so the Ink on screen is stale. Show the pending line instead of the number
  // and re-check /status and the balance every 5 s, for at most 2 minutes. When they agree the
  // number shows; after 2 minutes the poll stops and the number shows as it is.
  const creditsTier: AnyTier | null =
    loaded && TIERS.includes(balance.planTier) ? balance.planTier : null;
  const pendingNow = isInkPending(status, creditsTier);
  const [pollExpired, setPollExpired] = useState(false);
  const [pollTick, setPollTick] = useState(0);
  const pollStartedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!pendingNow) {
      pollStartedAt.current = null;
      return undefined;
    }
    if (pollExpired) return undefined;
    if (pollStartedAt.current === null) pollStartedAt.current = Date.now();
    const timer = window.setTimeout(async () => {
      if (Date.now() - (pollStartedAt.current ?? Date.now()) >= PENDING_POLL_LIMIT_MS) {
        setPollExpired(true);
        return;
      }
      try {
        const s = await fetchSubscriptionStatus();
        if (mounted.current) setStatus(s);
      } catch {
        // Keep the last status; the next tick tries again.
      }
      try {
        await refresh();
      } catch {
        // Keep the last balance; the next tick tries again.
      }
      if (mounted.current) setPollTick((t) => t + 1);
    }, PENDING_POLL_MS);
    return () => window.clearTimeout(timer);
  }, [pendingNow, pollExpired, pollTick, refresh]);

  const showPending = pendingNow && !pollExpired;

  // ── Cancel ─────────────────────────────────────────────────────────────────────────────────
  async function confirmCancel() {
    if (cancelLoading) return;
    setCancelLoading(true);
    setCancelFailed(false);
    try {
      const res = await privacyFetch(CANCEL_ACTION_KEY, '/api/billing/cancel', {
        method: 'POST',
      });
      if (!mounted.current) return;
      if (isPrivacyBlocked(res)) {
        setCancelOpen(false);
        setCancelBlocked(true);
        return;
      }
      if (res.ok) {
        const body = (await res.json().catch(() => null)) as { data?: unknown } | null;
        const next = parseSubscriptionStatus(body?.data);
        if (!mounted.current) return;
        if (next) setStatus(next);
        else reload();
        setCancelledDate(planDate((next ?? status)?.renewsAt) || null);
        setSwitchNote(false);
        setCancelOpen(false);
        return;
      }
      if (res.status === 409) {
        // No live plan to cancel (it ended meanwhile): show what billing has now.
        setCancelOpen(false);
        reload();
        return;
      }
      setCancelFailed(true);
    } catch {
      if (mounted.current) setCancelFailed(true);
    } finally {
      if (mounted.current) setCancelLoading(false);
    }
  }

  // ── Privacy gate: Review and accept ────────────────────────────────────────────────────────
  const privacyKey =
    gate === 'privacy' ? SUBSCRIBE_ACTION_KEY : cancelBlocked ? CANCEL_ACTION_KEY : null;
  async function reviewPrivacy() {
    if (!privacyKey) return;
    // Opens the re-accept dialog when it can show; otherwise the P7 box below (with its own
    // Accept) is the way forward, so bring it into view.
    if (await privacyPrecheck(privacyKey)) return;
    const box = document.getElementById(`reaccept-p7-${privacyKey}`);
    box?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  // ── Render ─────────────────────────────────────────────────────────────────────────────────
  const tier: AnyTier = status ? currentTier(status) : 'free';
  const renewsDate = planDate(status?.renewsAt);
  const statusCard = showsStatusCard(status);
  const paymentFailed = statusCard && status.state === 'past_due';

  return (
    <div className="nl gap-nl-4 mt-nl-2 flex flex-col">
      <div>
        {showPending ? (
          <InkChip balance="" role="status">
            {PLAN_COPY.paymentPending}
          </InkChip>
        ) : loaded && Number.isFinite(balance.totalInk) ? (
          <p className="nl-body-sm text-nl-soft">{`You have ${balance.totalInk} Ink`}</p>
        ) : null}
      </div>

      {/* AJ-509-M2: no action on this banner; billing has no way to retry a past_due payment yet.
          The address is a mailto link, as elsewhere in the dashboard. */}
      {paymentFailed ? <Banner kind="payment-failed" message={<PaymentFailedMessage />} /> : null}

      {/* T-522 (Rajesh): no verify banner here. The dashboard's M3 verify bar is the one
          persistent sign, and a subscribe refused with 403 email_verification_required opens
          the AJ-522-M6 Subscribe dialog (useSubscribe); Choose stays enabled. */}
      {privacyKey ? (
        <Banner
          kind="privacy-reaccept"
          message={PLAN_COPY.privacyGate}
          action={{ label: PLAN_COPY.privacyAction, onClick: () => void reviewPrivacy() }}
        />
      ) : null}
      <div>
        <PrivacyBlockedNotice actionKey={SUBSCRIBE_ACTION_KEY} />
        <PrivacyBlockedNotice actionKey={CANCEL_ACTION_KEY} />
      </div>

      {loadState === 'ready' && statusCard ? (
        <SubscriptionStatusCard
          status={status}
          onCancel={() => {
            setCancelFailed(false);
            setCancelOpen(true);
          }}
          cancelledDate={cancelledDate}
        />
      ) : null}
      {switchNote && renewsDate ? (
        <p className="nl-body-sm text-nl-text" role="status">
          {PLAN_COPY.switchNote(renewsDate)}
        </p>
      ) : null}

      {gstSlot}

      {loadState === 'loading' ? <PlanChooserSkeleton /> : null}
      {loadState === 'error' ? (
        <Card
          state="error"
          errorMessage={PLAN_COPY.genericFailure}
          onRetry={reload}
          retryLabel={PLAN_COPY.retry}
        />
      ) : null}
      {loadState === 'ready' && plans ? (
        <PlanChooser
          plans={plans}
          current={tier}
          switchDate={renewsDate}
          pendingPlanId={pendingPlanId}
          onChoose={(plan) => void subscribe(plan.id)}
          onSwitch={() => setSwitchNote(true)}
          chooseDescribedBy={chooseDescribedBy}
        />
      ) : null}

      {failedPlanId ? (
        <ErrorState
          message={PLAN_COPY.genericFailure}
          onRetry={() => void subscribe(failedPlanId)}
          retryLabel={PLAN_COPY.retry}
        />
      ) : null}

      {loadState !== 'error' ? (
        <p className="nl-body-sm text-nl-soft">{PLAN_COPY.cardsNote}</p>
      ) : null}

      <CancelPlanDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        date={renewsDate}
        onConfirm={() => void confirmCancel()}
        loading={cancelLoading}
        failed={cancelFailed}
      />
    </div>
  );
}

export default PlanPanel;

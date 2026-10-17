'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { GstStatePicker } from '@/components/billing/GstStatePicker';
import { PLAN_COPY } from '@/components/billing/planCopy';
import {
  PrivacyBlockedNotice,
  isPrivacyBlocked,
  privacyFetch,
  usePrivacyDescribedBy,
} from '@/components/PrivacyUpdatePrompt';
import {
  VerifyEmailCard,
  isEmailVerificationRequired,
  useNeedsEmailVerification,
} from '@/components/VerifyEmailPrompt';
import { type GstStateController, useGstState } from '@/hooks/useGstState';
import { fetchPlans, type PlanCycle, type PlanTier, type SubscriptionPlan } from '@/lib/plans';

/**
 * T-370: the settings "Upgrade" block. The label (name, price, Ink) comes from billing's
 * GET /plans and the subscribe call sends that plan's id, so the plan shown is the plan bought.
 * T-509: Settings now uses PlanPanel (Free, Solo, Pro, status and Cancel); this single-plan
 * block is no longer mounted there.
 */
export type PlanUpgradeProps = ({ planId?: string } | { tier: PlanTier; cycle: PlanCycle }) & {
  /**
   * T-436: a State picker the parent already renders (settings Plan block). Without it this
   * block renders its own picker above the Upgrade button.
   */
  gst?: GstStateController;
};

const DEFAULT_PLAN_ID = 'pro_monthly';

/** A plan is chosen by its tier and cycle, or by its id (default pro_monthly). */
function selectorOf(props: PlanUpgradeProps): { planId?: string; tierCycle?: string } {
  if ('tier' in props) return { tierCycle: `${props.tier}_${props.cycle}` };
  return { planId: props.planId ?? DEFAULT_PLAN_ID };
}

function planName(plan: SubscriptionPlan): string {
  return plan.tier.charAt(0).toUpperCase() + plan.tier.slice(1);
}

function planPrice(plan: SubscriptionPlan): string {
  const per = plan.cycle === 'yearly' ? 'year' : 'month';
  return `₹${plan.priceInr.toLocaleString('en-IN')}/${per}`;
}

/** T-509: copy §5 generic failure. Server text never reaches the user. */
const SUBSCRIBE_FAILED = PLAN_COPY.genericFailure;

/** T-436: the block with its own State picker (no `gst` from the parent). */
function PlanUpgradeWithPicker(props: PlanUpgradeProps) {
  const gst = useGstState('gst-state-upgrade');
  return <PlanUpgradeBlock {...props} gst={gst} ownPicker />;
}

export function PlanUpgrade(props: PlanUpgradeProps = {}) {
  if (props.gst) return <PlanUpgradeBlock {...props} gst={props.gst} ownPicker={false} />;
  return <PlanUpgradeWithPicker {...props} />;
}

function PlanUpgradeBlock(
  props: PlanUpgradeProps & { gst: GstStateController; ownPicker: boolean },
) {
  const { gst, ownPicker } = props;
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [subscribeError, setSubscribeError] = useState('');
  const privacyDescribedBy = usePrivacyDescribedBy('subscribe');
  // T-223 trigger 3: unverified email user -> the verify card replaces the upgrade button.
  const needsVerification = useNeedsEmailVerification();

  const { planId, tierCycle } = selectorOf(props);

  useEffect(() => {
    let cancelled = false;
    setPlan(null);
    setLoadError(false);
    fetchPlans()
      .then((catalogue) => {
        if (cancelled) return;
        const found = catalogue.subscriptions.find((p) =>
          tierCycle ? `${p.tier}_${p.cycle}` === tierCycle : p.id === planId,
        );
        if (found) setPlan(found);
        else setLoadError(true);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [planId, tierCycle]);

  async function handleSubscribe() {
    if (!plan) return;
    setSubscribing(true);
    setSubscribeError('');
    try {
      // T-436 (spec §2): no State -> the error shows and the select takes focus; no billing
      // call. An unsaved pick is saved first (only after privacy acceptance, Ajay 7 (2)).
      if (!(await gst.ensureReady())) return; // finally resets
      const res = await privacyFetch('subscribe', '/api/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id }),
      });
      if (isPrivacyBlocked(res)) return; // T-343: prompt or P7 box shown; finally resets
      if (await isEmailVerificationRequired(res)) return; // T-223: the card shows instead
      if (!res.ok) {
        setSubscribeError(SUBSCRIBE_FAILED);
        return;
      }
      const data = (await res.json().catch(() => null)) as { data?: { shortUrl?: unknown } } | null;
      const shortUrl = data?.data?.shortUrl;
      if (typeof shortUrl === 'string' && shortUrl) {
        window.location.href = shortUrl;
      } else {
        setSubscribeError(SUBSCRIBE_FAILED);
      }
    } catch {
      setSubscribeError(SUBSCRIBE_FAILED);
    } finally {
      setSubscribing(false);
    }
  }

  // The verify card replaces the button, so it shows even while the plan loads or failed.
  if (loadError && !needsVerification) {
    return (
      <p className="mt-4 text-xs text-red-600">
        Could not load plan details. Please refresh the page to upgrade.
      </p>
    );
  }

  return (
    <>
      {subscribeError && (
        <p role="alert" className="mt-3 text-xs text-red-600">
          {subscribeError}
        </p>
      )}
      <div className="mt-3">
        <PrivacyBlockedNotice actionKey="subscribe" />
      </div>
      {ownPicker && !needsVerification && <GstStatePicker gst={gst} className="mt-4 max-w-xs" />}
      {needsVerification ? (
        <div className="mt-4">
          <VerifyEmailCard />
        </div>
      ) : (
        <button
          onClick={handleSubscribe}
          aria-describedby={privacyDescribedBy}
          disabled={!plan || subscribing}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-60"
        >
          {(!plan || subscribing) && <Loader2 size={12} className="animate-spin" />}
          {plan ? `Upgrade to ${planName(plan)} — ${planPrice(plan)}` : 'Loading plan…'}
        </button>
      )}
    </>
  );
}

export default PlanUpgrade;

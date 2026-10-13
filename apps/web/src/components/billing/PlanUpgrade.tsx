'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  PrivacyBlockedNotice,
  isPrivacyBlocked,
  privacyFetch,
  usePrivacyDescribedBy,
} from '@/components/PrivacyUpdatePrompt';
import { fetchPlans, type PlanCycle, type PlanTier, type SubscriptionPlan } from '@/lib/plans';

/**
 * T-370: the settings "Upgrade" block. The label (name, price, Ink) comes from billing's
 * GET /plans and the subscribe call sends that plan's id, so the plan shown is the plan bought.
 */
export type PlanUpgradeProps = { planId?: string } | { tier: PlanTier; cycle: PlanCycle };

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

function planInk(plan: SubscriptionPlan): string {
  return `${plan.inkPerCycle} Ink/month`;
}

export function PlanUpgrade(props: PlanUpgradeProps = {}) {
  const [plan, setPlan] = useState<SubscriptionPlan | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [subscribeError, setSubscribeError] = useState('');
  const privacyDescribedBy = usePrivacyDescribedBy('subscribe');

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
      const res = await privacyFetch('subscribe', '/api/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id }),
      });
      if (isPrivacyBlocked(res)) return; // T-343: prompt or P7 box shown; finally resets
      const data = await res.json();
      if (!res.ok) {
        setSubscribeError(data.error ?? 'Failed to start subscription. Please try again.');
        return;
      }
      const shortUrl = data.data?.shortUrl;
      if (shortUrl) {
        window.location.href = shortUrl;
      } else {
        setSubscribeError('No payment link returned. Please contact support.');
      }
    } catch {
      setSubscribeError('Network error. Please try again.');
    } finally {
      setSubscribing(false);
    }
  }

  if (loadError) {
    return (
      <p className="mt-4 text-xs text-red-600">
        Could not load plan details. Please refresh the page to upgrade.
      </p>
    );
  }

  return (
    <>
      {subscribeError && <p className="mt-3 text-xs text-red-600">{subscribeError}</p>}
      <div className="mt-3">
        <PrivacyBlockedNotice actionKey="subscribe" />
      </div>
      <button
        onClick={handleSubscribe}
        aria-describedby={privacyDescribedBy}
        disabled={!plan || subscribing}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-60"
      >
        {(!plan || subscribing) && <Loader2 size={12} className="animate-spin" />}
        {plan ? `Upgrade to ${planName(plan)} — ${planPrice(plan)}` : 'Loading plan…'}
      </button>
      {plan && (
        <ul className="mt-4 space-y-1.5 text-xs text-slate-500">
          <li>✓ {planInk(plan)}</li>
          <li>✓ All document types (bail, notice, agreements, complaints)</li>
          <li>✓ BNS / IPC section auto-fill</li>
          <li>✓ Priority support</li>
        </ul>
      )}
    </>
  );
}

export default PlanUpgrade;

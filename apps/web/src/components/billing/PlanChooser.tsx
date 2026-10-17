'use client';

import { PLAN_COPY, planInkLine, planPriceLine, tierName } from '@/components/billing/planCopy';
import type { AnyTier } from '@/components/billing/subscriptionStatus';
import { Button, Card, Chip, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { SubscriptionPlan } from '@/lib/plans';

/**
 * T-509 — the plan cards (Rajesh's spec §06; copy §4.1, §4.2): Free, Solo, Pro, monthly only
 * (yearly hidden, T-399). Prices and Ink come from billing's GET /plans. The current plan shows
 * "Current plan" and is highlighted. With a paid plan current, the other paid card opens the
 * switch note instead of a subscribe call: billing refuses a second live plan (T-444).
 */
export interface PlanChooserProps {
  /** Monthly plans from the catalogue. */
  plans: SubscriptionPlan[];
  current: AnyTier;
  /** Formatted end of the paid period; '' hides the switch buttons (the note needs a date). */
  switchDate: string;
  /** Plan id whose subscribe call is in flight. */
  pendingPlanId: string | null;
  onChoose: (plan: SubscriptionPlan) => void;
  onSwitch: () => void;
  /** aria-describedby for the Choose buttons (privacy P7 box). */
  chooseDescribedBy?: string;
}

const TIER_ORDER = { solo: 0, pro: 1 } as const;

export function PlanChooser({
  plans,
  current,
  switchDate,
  pendingPlanId,
  onChoose,
  onSwitch,
  chooseDescribedBy,
}: PlanChooserProps) {
  const paid = plans
    .filter((p) => p.cycle === 'monthly')
    .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);

  function paidAction(plan: SubscriptionPlan) {
    if (plan.tier === current) return <Chip variant="brass">{PLAN_COPY.currentPlan}</Chip>;
    if (current !== 'free') {
      if (!switchDate) return null;
      return (
        <Button variant="ghost" onClick={onSwitch}>
          {plan.tier === 'pro' ? PLAN_COPY.upgradeToPro : PLAN_COPY.switchToSolo}
        </Button>
      );
    }
    return (
      <Button
        variant="ghost"
        loading={pendingPlanId === plan.id}
        disabled={pendingPlanId !== null}
        aria-describedby={chooseDescribedBy}
        onClick={() => onChoose(plan)}
      >
        {plan.tier === 'pro' ? PLAN_COPY.choosePro : PLAN_COPY.chooseSolo}
      </Button>
    );
  }

  const cardClass = (isCurrent: boolean) =>
    cn('gap-nl-2 flex flex-col', isCurrent && 'border-nl-brass border-2');

  return (
    <ul
      className="nl gap-nl-3 grid grid-cols-1 min-[640px]:grid-cols-2 min-[900px]:grid-cols-3"
      data-testid="plan-chooser"
    >
      <Card
        as="li"
        title={PLAN_COPY.freeName}
        className={cardClass(current === 'free')}
        data-tier="free"
        aria-current={current === 'free' ? 'true' : undefined}
      >
        <p className="nl-body text-nl-text">{PLAN_COPY.freePrice}</p>
        <p className="nl-body-sm text-nl-soft">{PLAN_COPY.freeInk}</p>
        <div className="mt-nl-2">
          {current === 'free' ? (
            <Chip variant="brass">{PLAN_COPY.currentPlan}</Chip>
          ) : (
            <p className="nl-body-sm text-nl-soft">{PLAN_COPY.freePlan}</p>
          )}
        </div>
      </Card>
      {paid.map((plan) => (
        <Card
          key={plan.id}
          as="li"
          title={tierName(plan.tier)}
          className={cardClass(current === plan.tier)}
          data-tier={plan.tier}
          aria-current={current === plan.tier ? 'true' : undefined}
        >
          <p className="nl-body text-nl-text">{planPriceLine(plan)}</p>
          <p className="nl-body-sm text-nl-soft">{planInkLine(plan)}</p>
          <div className="mt-nl-2">{paidAction(plan)}</div>
        </Card>
      ))}
    </ul>
  );
}

/** Loading: three skeleton cards (spec §06 states). */
export function PlanChooserSkeleton() {
  return (
    <ul
      className="nl gap-nl-3 grid grid-cols-1 min-[640px]:grid-cols-2 min-[900px]:grid-cols-3"
      aria-busy="true"
    >
      {[0, 1, 2].map((i) => (
        <Card key={i} as="li">
          {/* One "Still working…" line for the group, not one per card. */}
          <Skeleton lines={3} slowText={i === 0 ? undefined : ''} />
        </Card>
      ))}
    </ul>
  );
}

export default PlanChooser;

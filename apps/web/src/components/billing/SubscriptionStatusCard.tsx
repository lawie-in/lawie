'use client';

import { PLAN_COPY, planDate, tierName } from '@/components/billing/planCopy';
import {
  endsAtPeriodEnd,
  isLive,
  type SubscriptionStatus,
} from '@/components/billing/subscriptionStatus';
import { Button, Card, Chip } from '@/components/ui';

/**
 * T-509 — the status card (Rajesh's spec §06; copy §4.3, §4.4): plan, state (Active, Payment
 * failed, Lapsed), "Renews on" or "Ends on", and the Cancel link (ghost, opens the confirm
 * dialog) while the plan is live and not already ending. After a cancel the confirmation line
 * shows here, inline (no toast provider is mounted).
 */
export interface SubscriptionStatusCardProps {
  status: SubscriptionStatus;
  onCancel: () => void;
  /** Formatted end date after a successful cancel; shows `Your plan will end on {date}.` */
  cancelledDate?: string | null;
}

export function SubscriptionStatusCard({
  status,
  onCancel,
  cancelledDate,
}: SubscriptionStatusCardProps) {
  if (status.tier === 'free') return null;
  const live = isLive(status);
  const ending = endsAtPeriodEnd(status);
  const date = planDate(status.renewsAt);

  let chip: React.ReactNode;
  if (status.state === 'past_due') chip = <Chip variant="error">{PLAN_COPY.paymentFailed}</Chip>;
  else if (status.state === 'active') chip = <Chip variant="ok">{PLAN_COPY.active}</Chip>;
  else chip = <Chip variant="neutral">{PLAN_COPY.lapsed}</Chip>;

  let line: string | null = null;
  if (status.state === 'lapsed') line = PLAN_COPY.lapsedHelp;
  else if (date && ending) line = PLAN_COPY.endsOn(date);
  else if (date && status.state === 'active') line = PLAN_COPY.renewsOn(date);

  return (
    <Card
      label={live ? PLAN_COPY.currentPlan : undefined}
      title={tierName(status.tier)}
      className="gap-nl-2 flex flex-col"
      data-testid="subscription-status"
      data-sub-state={status.state}
    >
      <div className="gap-nl-3 flex flex-wrap items-center">
        {chip}
        {line ? <p className="nl-body-sm text-nl-soft">{line}</p> : null}
      </div>
      {cancelledDate ? (
        <p className="nl-body-sm text-nl-text" role="status">
          {PLAN_COPY.cancelDone(cancelledDate)}
        </p>
      ) : null}
      {live && !ending && date ? (
        <div>
          {/* T-535: ghost danger; the filled destructive stays in CancelPlanDialog. */}
          <Button variant="ghost-danger" onClick={onCancel}>
            {PLAN_COPY.cancelLink}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

export default SubscriptionStatusCard;

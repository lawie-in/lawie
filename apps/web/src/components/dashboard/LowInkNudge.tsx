'use client';

/**
 * T-520: low-Ink nudge (copy 3.3), a tile note in warn below 3 Ink. Low: "{n} Ink left…". Zero on
 * a paid plan with a known renewal date: "It refills on {date}…". Zero on Free: "You have used
 * your 5 Ink…". Zero on a plan with no date known falls back to the Low line. Top up opens the
 * existing TopUpModal (owned by the caller); See plans goes to Settings; Not now hides it.
 */
import Link from 'next/link';

import { DASHBOARD_COPY } from './dashboardCopy';

import { Button } from '@/components/ui';

export interface LowInkNudgeProps {
  balance: number;
  /** Paid plan the user is on, or 'free'. Null while unknown. */
  tier: 'free' | 'solo' | 'pro' | null;
  /** Formatted renewal date for the zero-on-a-plan line, or '' when unknown. */
  renewsOn: string;
  onTopUp: () => void;
  onDismiss: () => void;
}

export function lowInkMessage(balance: number, tier: LowInkNudgeProps['tier'], renewsOn: string) {
  if (balance <= 0 && tier === 'free') return DASHBOARD_COPY.zeroInkFree;
  if (balance <= 0 && (tier === 'solo' || tier === 'pro') && renewsOn) {
    return DASHBOARD_COPY.zeroInkPlan(renewsOn);
  }
  return DASHBOARD_COPY.lowInk(balance);
}

export function LowInkNudge({ balance, tier, renewsOn, onTopUp, onDismiss }: LowInkNudgeProps) {
  return (
    // T-524 (Arjun): a quieter status. It keeps role=status so it is named and findable, but
    // aria-live="off" stops screen readers announcing it every time the dashboard loads; the
    // Ink tile is in the reading order, so it is still discovered where it sits.
    <div
      role="status"
      aria-live="off"
      data-low-ink=""
      className="nl rounded-nl-md bg-nl-warn-light p-nl-3 text-nl-warn mt-nl-3 gap-nl-3 flex flex-col"
    >
      <p className="nl-body-sm m-0 font-medium">{lowInkMessage(balance, tier, renewsOn)}</p>
      <div className="gap-nl-2 flex flex-wrap items-center">
        {/* T-524 (Rajesh): ghost here; the command bar's Draft is the one primary on the page. */}
        <Button size="sm" variant="ghost" onClick={onTopUp}>
          {DASHBOARD_COPY.topUp}
        </Button>
        <Link
          href="/dashboard/settings"
          className="nl-focus nl-body-sm rounded-nl-md border-nl-line px-nl-4 text-nl-brass-dark inline-flex min-h-[44px] items-center border bg-transparent font-medium no-underline"
        >
          {DASHBOARD_COPY.seePlans}
        </Link>
        <button
          type="button"
          onClick={onDismiss}
          className="nl-focus nl-body-sm rounded-nl-md px-nl-3 inline-flex min-h-[44px] items-center font-medium underline underline-offset-4"
        >
          {DASHBOARD_COPY.notNow}
        </button>
      </div>
    </div>
  );
}

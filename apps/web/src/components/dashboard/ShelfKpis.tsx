'use client';

/**
 * T-520: the KPI grid (spec 03, copy 3.4). Tiles 1 Ink balance, 3 Drafts this month, 4 Draft and
 * finalised, 5 Plan and renewal, 6 Ink used this month, 7 Drafts by type. Item 2 (the shelf) and
 * item 8 (the command bar) are rendered by the page. No time-saved tile.
 *
 * Grid: 2 columns at 360, 4 at 900px and up, 16px gutters; Ink spans 2, Drafts by type spans 2.
 * A tile with no data yet shows a skeleton, never a zero. After a failed load a tile keeps its
 * last values; with none it shows only its label (the page shows the error with Retry).
 */
import { useId } from 'react';

import { DASHBOARD_COPY, LOW_INK_THRESHOLD } from './dashboardCopy';
import { LowInkNudge } from './LowInkNudge';
import type { DashboardSummary, LoadStatus } from './useDashboardData';

import { PLAN_COPY, planDate, tierName } from '@/components/billing/planCopy';
import {
  currentTier,
  endsAtPeriodEnd,
  type AnyTier,
  type SubscriptionStatus,
} from '@/components/billing/subscriptionStatus';
import { Chip, Inkwell, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';

/** Copy 4.1: Free is 5 Ink, one time; the inkwell's full mark when there is no monthly allotment. */
const FREE_INK = 5;

function Tile({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const id = useId();
  // T-524 (Arjun): a labelled group, not a <section>: six region landmarks crowded the page's
  // landmark list. The label stays a heading, so heading navigation still finds each tile.
  return (
    <div
      role="group"
      aria-labelledby={id}
      className={cn('nl border-nl-line bg-nl-card p-nl-4 min-w-0 border', className)}
    >
      <h2 id={id} className="nl-label text-nl-brass-dark mb-nl-2 mt-0">
        {label}
      </h2>
      {children}
    </div>
  );
}

/** One bar, no "Still working…" (the page shows that once). */
function TileSkeleton() {
  return <Skeleton lines={1} slowText="" className="pt-nl-2" />;
}

/**
 * T-524 (DESIGN.md Typography): a KPI number is Tiro 40px (2.5rem) on a 44px (2.75rem) line (Title face, dashboard
 * size), tabular. `small` is for the tiles whose value is a sentence, not a number (draft and
 * finalised, plan and renewal): Subtitle (Mukta 500 18px), as a heading under 20px. min-w-0 and
 * break-words let a long value (12,345 Ink in a 2-column tile at 360px) wrap inside the tile
 * instead of widening it.
 */
function Value({ children, small = false }: { children: React.ReactNode; small?: boolean }) {
  return (
    <p
      className={cn(
        'text-nl-text m-0 min-w-0 break-words tabular-nums',
        small ? 'nl-h3' : 'font-nl-display text-[2.5rem] font-normal leading-[2.75rem]',
      )}
    >
      {children}
    </p>
  );
}

/**
 * T-524: KPI numbers in Indian grouping (1234567 -> "12,34,567"); Ink can be a half (12.5), so
 * at most one decimal. A non-finite value is printed as it is (it never reaches here in
 * practice: the tiles only render real numbers).
 */
const KPI_NUMBER = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });
export function formatKpi(n: number): string {
  return Number.isFinite(n) ? KPI_NUMBER.format(n) : String(n);
}

/** Bar fill in percent, clamped to 0-100. */
function pct(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
}

function Bar({ percent }: { percent: number }) {
  return (
    // T-524 forced colours: the track gets a CanvasText border and the fill is drawn in
    // CanvasText (forced-color-adjust: none on the leaf only), so the meter stays readable.
    <span
      aria-hidden="true"
      className="bg-nl-wood block h-2 w-full overflow-hidden forced-colors:border forced-colors:[border-color:CanvasText]"
    >
      <span
        className="bg-nl-brass block h-full forced-colors:[background-color:CanvasText] forced-colors:[forced-color-adjust:none]"
        style={{ width: `${percent}%` }}
      />
    </span>
  );
}

export interface InkState {
  /** useCredits().loaded: a real balance has arrived. */
  loaded: boolean;
  /** useCredits().loading: the first balance fetch has not settled. */
  loading: boolean;
  totalInk: number;
  /** Plan Ink a month (0 on Free). */
  monthlyAllotment: number;
}

export interface ShelfKpisProps {
  ink: InkState;
  summary: { data: DashboardSummary | null; status: LoadStatus };
  plan: { data: SubscriptionStatus | null; status: LoadStatus };
  /** Low-Ink nudge dismissed ("Not now"). */
  nudgeDismissed: boolean;
  onDismissNudge: () => void;
  onTopUp: () => void;
}

/** The plan the nudge and tile 5 talk about, or null while unknown. */
function planTier(plan: SubscriptionStatus | null): AnyTier | null {
  return plan ? currentTier(plan) : null;
}

/** Copy 3.4 item 5 (and 4.3 when the plan ends at the period end). */
function PlanValue({ plan }: { plan: SubscriptionStatus }) {
  const tier = currentTier(plan);
  if (tier === 'free') return <Value small>{DASHBOARD_COPY.freePlanNoRenewal}</Value>;
  const name = tierName(tier);
  const date = planDate(plan.renewsAt);
  return (
    <>
      <Value small>
        {endsAtPeriodEnd(plan) || !date ? name : DASHBOARD_COPY.planRenews(name, date)}
      </Value>
      {endsAtPeriodEnd(plan) && date ? (
        <p className="nl-body-sm text-nl-soft mt-nl-1 mb-0">{PLAN_COPY.endsOn(date)}</p>
      ) : null}
      {plan.state === 'past_due' ? (
        <Chip variant="error" className="mt-nl-2">
          {PLAN_COPY.paymentFailed}
        </Chip>
      ) : null}
    </>
  );
}

/**
 * Humanised docType id ("bail_regular" -> "Bail regular"). The repo has no static display-name
 * map (names only come from the template-configs fetch), so the id is humanised, not relabelled.
 */
export function typeLabel(docType: string): string {
  const s = docType.replace(/_/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function ShelfKpis({
  ink,
  summary,
  plan,
  nudgeDismissed,
  onDismissNudge,
  onTopUp,
}: ShelfKpisProps) {
  const s = summary.data;
  const summaryPending = !s && summary.status === 'loading';
  const inkKnown = ink.loaded && Number.isFinite(ink.totalInk);
  const tier = planTier(plan.data);
  const showNudge = inkKnown && ink.totalInk < LOW_INK_THRESHOLD && !nudgeDismissed;
  const inkReference = ink.monthlyAllotment > 0 ? ink.monthlyAllotment : FREE_INK;

  const byType = s
    ? Object.entries(s.byType)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
    : [];
  const byTypeMax = byType.reduce((m, [, n]) => Math.max(m, n), 0);

  return (
    <div className="gap-nl-4 grid grid-cols-2 min-[900px]:grid-cols-4">
      {/* 1 Ink balance */}
      <Tile label={DASHBOARD_COPY.inkBalance} className="col-span-2">
        {inkKnown ? (
          <>
            <div className="gap-nl-4 flex items-center">
              <Inkwell balance={pct(ink.totalInk, inkReference)} className="shrink-0" />
              <Value>{DASHBOARD_COPY.inkValue(formatKpi(ink.totalInk))}</Value>
            </div>
            {showNudge ? (
              <LowInkNudge
                balance={ink.totalInk}
                tier={tier}
                renewsOn={
                  // "It refills on {date}" only for a live plan that will renew (not cancelled
                  // at cycle end, not ended, not past due); otherwise the nudge says the Low line.
                  plan.data && plan.data.state === 'active' && !endsAtPeriodEnd(plan.data)
                    ? planDate(plan.data.renewsAt)
                    : ''
                }
                onTopUp={onTopUp}
                onDismiss={onDismissNudge}
              />
            ) : null}
          </>
        ) : ink.loading ? (
          <TileSkeleton />
        ) : null}
      </Tile>

      {/* 3 Drafts this month */}
      <Tile label={DASHBOARD_COPY.draftsThisMonth}>
        {s ? (
          <Value>{formatKpi(s.draftsThisMonth)}</Value>
        ) : summaryPending ? (
          <TileSkeleton />
        ) : null}
      </Tile>

      {/* 4 Draft and finalised: an exported document is a finalised one. */}
      <Tile label={DASHBOARD_COPY.draftAndFinalised}>
        {s ? (
          <Value small>
            {DASHBOARD_COPY.draftAndFinalisedOrExportedValue(
              s.statusCounts.draft,
              s.statusCounts.finalised + s.statusCounts.exported,
            )}
          </Value>
        ) : summaryPending ? (
          <TileSkeleton />
        ) : null}
      </Tile>

      {/* 5 Plan and renewal */}
      <Tile label={DASHBOARD_COPY.planAndRenewal}>
        {plan.data ? (
          <PlanValue plan={plan.data} />
        ) : plan.status === 'loading' ? (
          <TileSkeleton />
        ) : null}
      </Tile>

      {/* 6 Ink used this month (meter against the plan's Ink a month, when there is one) */}
      <Tile label={DASHBOARD_COPY.inkUsedThisMonth}>
        {s ? (
          <>
            <Value>{DASHBOARD_COPY.inkUsedValue(formatKpi(s.inkUsedThisMonth))}</Value>
            {ink.loaded && ink.monthlyAllotment > 0 ? (
              <div className="mt-nl-3">
                <Bar percent={pct(s.inkUsedThisMonth, ink.monthlyAllotment)} />
              </div>
            ) : null}
          </>
        ) : summaryPending ? (
          <TileSkeleton />
        ) : null}
      </Tile>

      {/* 7 Drafts by type (three bars) */}
      <Tile label={DASHBOARD_COPY.draftsByType} className="col-span-2">
        {s ? (
          byType.length === 0 ? (
            <p className="nl-body text-nl-soft m-0">{DASHBOARD_COPY.draftsByTypeEmpty}</p>
          ) : (
            <ul role="list" className="gap-nl-3 m-0 flex list-none flex-col p-0">
              {byType.map(([docType, n]) => (
                <li key={docType} className="gap-nl-1 flex min-w-0 flex-col">
                  <span className="gap-nl-3 nl-body-sm text-nl-soft flex min-w-0 justify-between">
                    <span className="min-w-0 truncate">{typeLabel(docType)}</span>
                    <span className="text-nl-text shrink-0 tabular-nums">{n}</span>
                  </span>
                  <Bar percent={pct(n, byTypeMax)} />
                </li>
              ))}
            </ul>
          )
        ) : summaryPending ? (
          <TileSkeleton />
        ) : null}
      </Tile>
    </div>
  );
}

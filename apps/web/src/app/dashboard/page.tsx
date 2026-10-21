'use client';

/**
 * T-520: "Your shelf" (Night Library spec 03; copy handoff/copy/T-511-copy-v1.md section 3).
 * Order: greeting, title and date line; command bar; error (if any); KPI grid; shelf.
 * Data: Ink from useCredits (only once a real balance has arrived), the shelf from
 * GET /api/documents, tiles 3, 4, 6 and 7 from the T-506 summary, tile 5 from the T-508 status.
 * Loading: skeleton tiles and three skeleton spines, "Still working…" after 8s. Error: one line
 * with Retry, tiles keep their last values. No time-saved tile.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import { TopUpModal } from '@/components/credits/TopUpModal';
import { DashboardCommandBar } from '@/components/dashboard/DashboardCommandBar';
import { DASHBOARD_COPY } from '@/components/dashboard/dashboardCopy';
import { Shelf } from '@/components/dashboard/Shelf';
import { ShelfKpis } from '@/components/dashboard/ShelfKpis';
import {
  useDashboardSummary,
  usePlanStatus,
  useShelfDocuments,
} from '@/components/dashboard/useDashboardData';
import { ErrorState, STILL_WORKING_AFTER_MS } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useCredits } from '@/hooks/useCredits';

/** Copy 3.1 date line `{weekday}, {date}`, India time. */
function dateLine(now: Date): string {
  const tz = 'Asia/Kolkata';
  const weekday = new Intl.DateTimeFormat('en-IN', { weekday: 'long', timeZone: tz }).format(now);
  const date = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: tz,
  }).format(now);
  return `${weekday}, ${date}`;
}

/** True after `ms` while `active`; resets when it stops. */
function useSlow(active: boolean, ms: number): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) {
      setSlow(false);
      return undefined;
    }
    const t = window.setTimeout(() => setSlow(true), ms);
    return () => window.clearTimeout(t);
  }, [active, ms]);
  return slow;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { balance, loaded: inkLoaded, loading: inkLoading, refresh: refreshInk } = useCredits();
  const docs = useShelfDocuments();
  const summary = useDashboardSummary();
  const plan = usePlanStatus();
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [topUpOpen, setTopUpOpen] = useState(false);
  // Client only: the layout renders this page after auth has loaded, so no server/client mismatch.
  const [today, setToday] = useState<string | null>(null);

  useEffect(() => {
    setToday(dateLine(new Date()));
  }, []);

  const reloadDocs = docs.reload;
  const reloadSummary = summary.reload;
  const reloadPlan = plan.reload;
  const retry = useCallback(() => {
    reloadDocs();
    reloadSummary();
    reloadPlan();
    refreshInk().catch(() => undefined);
  }, [reloadDocs, reloadSummary, reloadPlan, refreshInk]);

  // Any source that failed with nothing to show: documents, summary, Ink balance, or plan.
  const failed =
    docs.status === 'error' ||
    summary.status === 'error' ||
    (!inkLoading && !inkLoaded) ||
    (plan.status === 'error' && !plan.data);
  const firstLoad =
    (docs.data === null && docs.status === 'loading') ||
    (summary.data === null && summary.status === 'loading');
  const slow = useSlow(firstLoad, STILL_WORKING_AFTER_MS);

  const ink = useMemo(
    () => ({
      loaded: inkLoaded,
      loading: inkLoading,
      totalInk: balance.totalInk,
      monthlyAllotment: Number.isFinite(balance.inkSubMonthlyAllotment)
        ? balance.inkSubMonthlyAllotment
        : 0,
    }),
    [inkLoaded, inkLoading, balance.totalInk, balance.inkSubMonthlyAllotment],
  );

  if (!user) return null;

  return (
    <div className="gap-nl-6 px-nl-4 py-nl-6 min-[900px]:px-nl-8 mx-auto flex w-full max-w-[1180px] flex-col">
      <header className="gap-nl-1 flex flex-col">
        <p className="nl-body text-nl-soft m-0">{DASHBOARD_COPY.greeting(user.name)}</p>
        <h1 className="nl-h1 text-nl-text m-0">{DASHBOARD_COPY.title}</h1>
        {today ? <p className="nl-body-sm text-nl-muted m-0">{today}</p> : null}
      </header>

      <DashboardCommandBar />

      {failed ? (
        <ErrorState
          message={DASHBOARD_COPY.error}
          onRetry={retry}
          retryLabel={DASHBOARD_COPY.retry}
        />
      ) : null}

      <ShelfKpis
        ink={ink}
        summary={{ data: summary.data, status: summary.status }}
        plan={{ data: plan.data, status: plan.status }}
        nudgeDismissed={nudgeDismissed}
        onDismissNudge={() => setNudgeDismissed(true)}
        onTopUp={() => setTopUpOpen(true)}
      />

      <Shelf docs={docs.data} status={docs.status} />

      {/* One live region for the whole page, filled after 8s of first loading (spec 08). */}
      <p role="status" className="nl-body-sm text-nl-muted m-0">
        {slow ? DASHBOARD_COPY.stillWorking : null}
      </p>

      {topUpOpen ? <TopUpModal onClose={() => setTopUpOpen(false)} /> : null}
    </div>
  );
}

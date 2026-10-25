'use client';

/**
 * T-520: "Your shelf" (Night Library spec 03; copy handoff/copy/T-511-copy-v1.md section 3).
 * Order: greeting, title and date line; command bar; error (if any); KPI grid; shelf.
 * Data: Ink from useCredits (only once a real balance has arrived), the shelf from
 * GET /api/documents, tiles 3, 4, 6 and 7 from the T-506 summary, tile 5 from the T-508 status.
 * Loading: skeleton tiles and three skeleton spines, "Still working…" after 8s. Error: one line
 * with Retry, tiles keep their last values. No time-saved tile.
 *
 * T-524: "Still working…" sits right after the command bar and error slot, so it is on screen at
 * 360px. Retry keeps the error line mounted until every source settles, so keyboard focus stays
 * on Retry; if the error then goes away, focus moves to the page title. A blank name drops the
 * greeting line (no invented wording); a long one wraps.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
import { ReferralNotAppliedNotice } from '@/components/VerifyEmailPrompt';
import { useAuth } from '@/context/AuthContext';
import { useCredits } from '@/hooks/useCredits';
import { cn } from '@/lib/cn';

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
  // T-524: true from a Retry press until every source has settled (see the effect below).
  const [retrying, setRetrying] = useState(false);
  const [inkRetryPending, setInkRetryPending] = useState(false);
  const mounted = useRef(true);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  /** Keyboard focus was inside the error line (Retry) when it last had focus. */
  const focusInError = useRef(false);
  // Client only: the layout renders this page after auth has loaded, so no server/client mismatch.
  const [today, setToday] = useState<string | null>(null);

  useEffect(() => {
    setToday(dateLine(new Date()));
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reloadDocs = docs.reload;
  const reloadSummary = summary.reload;
  const reloadPlan = plan.reload;
  const retry = useCallback(() => {
    // Each reload sets its status to 'loading' in this same batch, so the settle effect below
    // cannot see "nothing loading" before the requests have started.
    setRetrying(true);
    setInkRetryPending(true);
    reloadDocs();
    reloadSummary();
    reloadPlan();
    Promise.resolve(refreshInk())
      .catch(() => undefined)
      .finally(() => {
        if (mounted.current) setInkRetryPending(false);
      });
  }, [reloadDocs, reloadSummary, reloadPlan, refreshInk]);

  const retrySettled =
    docs.status !== 'loading' &&
    summary.status !== 'loading' &&
    plan.status !== 'loading' &&
    !inkRetryPending;
  useEffect(() => {
    if (retrying && retrySettled) setRetrying(false);
  }, [retrying, retrySettled]);

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
  const showError = failed || retrying;

  // The error line went away (the retry worked) while it held focus: put focus on the page title,
  // not on <body>.
  useEffect(() => {
    if (showError || !focusInError.current) return;
    focusInError.current = false;
    const active = typeof document === 'undefined' ? null : document.activeElement;
    if (!active || active === document.body) titleRef.current?.focus();
  }, [showError]);

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
  const name = typeof user.name === 'string' ? user.name.trim() : '';

  return (
    <div className="gap-nl-6 px-nl-4 py-nl-6 min-[900px]:px-nl-8 mx-auto flex w-full max-w-[1180px] flex-col">
      <header className="gap-nl-1 flex min-w-0 flex-col">
        {/* No name: leave the greeting out rather than show "Hello," or invent a fallback. */}
        {name ? (
          <p className="nl-body text-nl-soft m-0 min-w-0 break-words">
            {DASHBOARD_COPY.greeting(name)}
          </p>
        ) : null}
        <h1 ref={titleRef} tabIndex={-1} className="nl-h1 text-nl-text m-0 focus:outline-none">
          {DASHBOARD_COPY.title}
        </h1>
        {today ? <p className="nl-body-sm text-nl-muted m-0">{today}</p> : null}
      </header>

      {/* T-522 (AJ-522-S3): the one-time "code not applied" line, after verification only. */}
      <ReferralNotAppliedNotice />

      {/* T-524: no Ctrl/Cmd+K focus jump behind the top-up modal (it has no focus trap). */}
      <DashboardCommandBar hotkeySuspended={topUpOpen} />

      {showError ? (
        <div
          ref={errorRef}
          onFocus={() => {
            focusInError.current = true;
          }}
          onBlur={(e) => {
            const next = e.relatedTarget as Node | null;
            if (next && errorRef.current?.contains(next)) return;
            // Focus moved somewhere real; a blur with no target (the line unmounting, or the
            // window losing focus) keeps the flag so the effect above can restore focus.
            if (next) focusInError.current = false;
          }}
        >
          <ErrorState
            message={DASHBOARD_COPY.error}
            onRetry={retry}
            retryLabel={DASHBOARD_COPY.retry}
          />
        </div>
      ) : null}

      {/* One live region for the whole page, filled after 8s of first loading (spec 08). T-524:
          here, under the command bar, so it is on screen at 360px instead of below the shelf.
          Visually hidden while empty (still in the accessibility tree, so the later text is
          announced) so it adds no gap. */}
      <p role="status" className={cn('nl-body-sm text-nl-muted m-0', !slow && 'sr-only')}>
        {slow ? DASHBOARD_COPY.stillWorking : null}
      </p>

      <ShelfKpis
        ink={ink}
        summary={{ data: summary.data, status: summary.status }}
        plan={{ data: plan.data, status: plan.status }}
        nudgeDismissed={nudgeDismissed}
        onDismissNudge={() => setNudgeDismissed(true)}
        onTopUp={() => setTopUpOpen(true)}
      />

      <Shelf docs={docs.data} status={docs.status} />

      {topUpOpen ? <TopUpModal onClose={() => setTopUpOpen(false)} /> : null}
    </div>
  );
}

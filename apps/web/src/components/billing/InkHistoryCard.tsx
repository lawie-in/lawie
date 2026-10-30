'use client';

/**
 * T-646 §2: the Ink history card in Settings → Billing (Rajesh's design note; Ajay AJ-646-M5).
 * Strings: paymentCopy.ts.
 *
 * - GET /api/credits/history?limit=20[&cursor=] (drafting, through the existing /api/credits
 *   proxy) → { entries, balance, nextCursor }, newest first; Show more fetches the next 20.
 * - The current balance first (InkChip), then rows grouped by IST day (Today, Yesterday, date).
 * - A use shows the document title only (never content); a deleted document shows
 *   "Deleted document" (AJ-646-M5). Credits in Moss (ok) text, uses in Text.
 * - The running balance comes from drafting (computed from the ledger there).
 * - #ink scrolls to the card once it has loaded.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  PAYMENT_COPY,
  formatIstTime,
  formatSignedInk,
  inkDayLabel,
  istDayKey,
} from '@/components/billing/paymentCopy';
import { Button, Card, InkChip, formatInk, loopPlayState, usePageVisible } from '@/components/ui';
import { apiFetch } from '@/lib/apiFetch';
import { cn } from '@/lib/cn';

export const INK_HISTORY_PAGE_SIZE = 20;
export const INK_CARD_ID = 'ink';

const KINDS = ['purchase', 'plan', 'grant', 'usage', 'refund_reversal', 'other'] as const;
export type InkEntryKind = (typeof KINDS)[number];

export interface InkEntry {
  id: string;
  createdAt: string;
  kind: InkEntryKind;
  label: string;
  inkDelta: number;
  balanceAfter: number;
  documentTitle: string | null;
  documentDeleted: boolean;
}

export interface InkHistoryPageData {
  entries: InkEntry[];
  balance: number;
  nextCursor: string | null;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Keeps only well-formed entries; null when the body is not the history at all. */
export function parseInkHistory(body: unknown): InkHistoryPageData | null {
  const b = (body ?? null) as Record<string, unknown> | null;
  if (!b || !Array.isArray(b.entries) || !isNum(b.balance)) return null;
  const entries: InkEntry[] = [];
  for (const raw of b.entries) {
    const r = (raw ?? {}) as Record<string, unknown>;
    if (
      typeof r.id !== 'string' ||
      typeof r.createdAt !== 'string' ||
      !(KINDS as readonly unknown[]).includes(r.kind) ||
      !isNum(r.inkDelta) ||
      !isNum(r.balanceAfter)
    ) {
      continue;
    }
    entries.push({
      id: r.id,
      createdAt: r.createdAt,
      kind: r.kind as InkEntryKind,
      label: typeof r.label === 'string' ? r.label : 'other',
      inkDelta: r.inkDelta,
      balanceAfter: r.balanceAfter,
      documentTitle:
        typeof r.documentTitle === 'string' && r.documentTitle ? r.documentTitle : null,
      documentDeleted: r.documentDeleted === true,
    });
  }
  return {
    entries,
    balance: b.balance,
    nextCursor: typeof b.nextCursor === 'string' && b.nextCursor ? b.nextCursor : null,
  };
}

/** What the row says (titles only; AJ-646-M5 for a deleted document). */
export function inkEntryText(e: InkEntry): string {
  if (e.kind === 'usage') {
    if (e.documentDeleted) return PAYMENT_COPY.deletedDocument;
    return e.documentTitle ? PAYMENT_COPY.inkDraft(e.documentTitle) : PAYMENT_COPY.inkDraftUntitled;
  }
  return PAYMENT_COPY.inkLabels[e.label] ?? PAYMENT_COPY.inkLabels.other;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'loaded'; entries: InkEntry[]; balance: number; nextCursor: string | null };

export function InkHistoryCard() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [moreLoading, setMoreLoading] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const deepLinkDone = useRef(false);
  const pageVisible = usePageVisible();

  const fetchPage = useCallback(async (cursor: string | null) => {
    const q = new URLSearchParams({ limit: String(INK_HISTORY_PAGE_SIZE) });
    if (cursor) q.set('cursor', cursor);
    const res = await apiFetch(`/api/credits/history?${q.toString()}`);
    if (!res.ok) {
      console.error('[ink-history] load failed:', res.status);
      return null;
    }
    return parseInkHistory(await res.json().catch(() => null));
  }, []);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    setMoreFailed(false);
    try {
      const page = await fetchPage(null);
      setState(page ? { kind: 'loaded', ...page } : { kind: 'error' });
    } catch (err) {
      console.error('[ink-history] load failed:', err instanceof Error ? err.name : 'error');
      setState({ kind: 'error' });
    }
  }, [fetchPage]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (deepLinkDone.current || state.kind === 'loading') return;
    deepLinkDone.current = true;
    if (window.location.hash !== `#${INK_CARD_ID}`) return;
    window.requestAnimationFrame(() =>
      document.getElementById(INK_CARD_ID)?.scrollIntoView({ block: 'start' }),
    );
  }, [state]);

  const showMore = async () => {
    if (state.kind !== 'loaded' || !state.nextCursor || moreLoading) return;
    setMoreLoading(true);
    setMoreFailed(false);
    try {
      const page = await fetchPage(state.nextCursor);
      if (!page) {
        setMoreFailed(true);
        return;
      }
      setState((prev) =>
        prev.kind === 'loaded'
          ? {
              kind: 'loaded',
              entries: [
                ...prev.entries,
                ...page.entries.filter((e) => !prev.entries.some((p) => p.id === e.id)),
              ],
              balance: prev.balance,
              nextCursor: page.nextCursor,
            }
          : prev,
      );
    } catch (err) {
      console.error('[ink-history] more failed:', err instanceof Error ? err.name : 'error');
      setMoreFailed(true);
    } finally {
      setMoreLoading(false);
    }
  };

  // Day groups, in order (entries are newest first).
  const groups: { key: string; label: string; entries: InkEntry[] }[] = [];
  if (state.kind === 'loaded') {
    const now = new Date();
    for (const e of state.entries) {
      const key = istDayKey(e.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.entries.push(e);
      else groups.push({ key, label: inkDayLabel(e.createdAt, now), entries: [e] });
    }
  }

  return (
    <Card aria-labelledby="ink-history-heading" id={INK_CARD_ID} className="scroll-mt-nl-4">
      <h2 id="ink-history-heading" className="nl-h3 text-nl-text">
        {PAYMENT_COPY.inkHeading}
      </h2>

      {state.kind === 'loaded' && (
        <p className="nl-body-sm mt-nl-2 gap-nl-2 text-nl-soft flex items-center">
          <InkChip balance={state.balance} />
          <span>{PAYMENT_COPY.inkBalance}</span>
        </p>
      )}

      {state.kind === 'loading' && (
        <div className="mt-nl-3">
          <p role="status" className="sr-only">
            {PAYMENT_COPY.inkLoading}
          </p>
          <ul aria-hidden="true" className="divide-nl-line divide-y">
            {[0, 1, 2].map((i) => (
              <li key={i} className="py-nl-3">
                <div
                  className="nl-skeleton h-nl-4 rounded-nl-sm w-full"
                  style={loopPlayState(pageVisible)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="mt-nl-3 gap-nl-3 flex flex-wrap items-center">
          <p role="alert" className="nl-body text-nl-err">
            {PAYMENT_COPY.error}
          </p>
          <Button variant="ghost" onClick={() => void load()}>
            {PAYMENT_COPY.retry}
          </Button>
        </div>
      )}

      {state.kind === 'loaded' && state.entries.length === 0 && (
        <p className="nl-body mt-nl-3 text-nl-muted">{PAYMENT_COPY.inkEmpty}</p>
      )}

      {state.kind === 'loaded' && state.entries.length > 0 && (
        <>
          <div role="table" aria-label={PAYMENT_COPY.inkListLabel} className="mt-nl-3">
            <div role="rowgroup" className="sr-only">
              <div role="row">
                <span role="columnheader">{PAYMENT_COPY.inkColWhen}</span>
                <span role="columnheader">{PAYMENT_COPY.inkColWhat}</span>
                <span role="columnheader">{PAYMENT_COPY.inkColChange}</span>
                <span role="columnheader">{PAYMENT_COPY.inkColBalance}</span>
              </div>
            </div>
            {groups.map((g) => (
              <div role="rowgroup" key={g.key} className="mt-nl-2 first:mt-0">
                <div role="row">
                  <span
                    role="rowheader"
                    className="nl-body-sm text-nl-muted pt-nl-2 block font-medium"
                  >
                    {g.label}
                  </span>
                </div>
                <div className="divide-nl-line divide-y">
                  {g.entries.map((e) => {
                    const text = inkEntryText(e);
                    const credit = e.inkDelta > 0;
                    return (
                      <div
                        key={e.id}
                        role="row"
                        className={cn(
                          'py-nl-3 gap-x-nl-3 gap-y-nl-1 grid items-center',
                          'grid-cols-[minmax(0,1fr)_auto]',
                          'min-[720px]:gap-x-nl-4 min-[720px]:min-h-[44px] min-[720px]:grid-cols-[5rem_minmax(0,1fr)_auto_6rem]',
                        )}
                      >
                        <span
                          role="cell"
                          className="nl-body-sm text-nl-text col-start-1 row-start-2 tabular-nums min-[720px]:row-start-1"
                        >
                          <time dateTime={e.createdAt}>{formatIstTime(e.createdAt)}</time>
                        </span>
                        <span
                          role="cell"
                          title={text}
                          className="nl-body text-nl-text col-start-1 row-start-1 min-w-0 truncate min-[720px]:col-start-2"
                        >
                          {text}
                        </span>
                        <span
                          role="cell"
                          className={cn(
                            'font-nl-display col-start-2 row-start-1 whitespace-nowrap text-right text-[18px] tabular-nums leading-snug min-[720px]:col-start-3',
                            credit ? 'text-nl-ok' : 'text-nl-text',
                          )}
                        >
                          {PAYMENT_COPY.inkChange(formatSignedInk(e.inkDelta))}
                        </span>
                        <span
                          role="cell"
                          className="nl-body-sm text-nl-muted col-start-2 row-start-2 whitespace-nowrap text-right tabular-nums min-[720px]:col-start-4 min-[720px]:row-start-1"
                        >
                          {PAYMENT_COPY.inkChange(formatInk(e.balanceAfter))}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {state.nextCursor && (
            <Button
              variant="ghost"
              className="mt-nl-3"
              loading={moreLoading}
              onClick={() => void showMore()}
            >
              {PAYMENT_COPY.showMore}
            </Button>
          )}
          {moreFailed && (
            <p role="alert" className="nl-body-sm mt-nl-2 text-nl-err">
              {PAYMENT_COPY.error}
            </p>
          )}
        </>
      )}
    </Card>
  );
}

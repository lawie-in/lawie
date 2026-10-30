'use client';

/**
 * T-520: the dashboard's data. Every fetch goes through apiFetch; network errors, non-2xx replies
 * and junk bodies become an `error` status, never a throw into render. Each hook keeps the last
 * good data through a failed reload (spec 03: "tiles keep their last values"), ignores replies
 * from a superseded request, and does not set state after unmount.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchSubscriptionStatus,
  type SubscriptionStatus,
} from '@/components/billing/subscriptionStatus';
import { apiFetch } from '@/lib/apiFetch';

export type LoadStatus = 'loading' | 'ready' | 'error';

export interface Loadable<T> {
  data: T | null;
  status: LoadStatus;
  reload: () => void;
}

/**
 * Runs `load` on mount and on reload(); latest request wins; unmount-safe. `load` must be a
 * stable (module-level) function.
 */
function useLoadable<T>(load: () => Promise<T>): Loadable<T> {
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const seq = useRef(0);
  const mounted = useRef(true);

  const run = useCallback(() => {
    const id = ++seq.current;
    setStatus('loading');
    let promise: Promise<T>;
    try {
      promise = load();
    } catch (err) {
      promise = Promise.reject(err);
    }
    promise.then(
      (value) => {
        if (!mounted.current || id !== seq.current) return;
        setData(value);
        setStatus('ready');
      },
      () => {
        if (!mounted.current || id !== seq.current) return;
        setStatus('error');
      },
    );
  }, [load]);

  useEffect(() => {
    mounted.current = true;
    run();
    return () => {
      mounted.current = false;
    };
  }, [run]);

  return { data, status, reload: run };
}

// ── T-506 summary ───────────────────────────────────────────────────────────

export interface DashboardSummary {
  draftsThisMonth: number;
  byType: Record<string, number>;
  /** T-689b: by screen label; absent from an older server (the tile then uses byType). */
  byTypeLabelled?: Array<{ key: string; label: string; n: number }>;
  statusCounts: { draft: number; finalised: number; exported: number };
  inkUsedThisMonth: number;
}

/** T-689b: the well-formed byTypeLabelled rows, or undefined when there are none. */
function parseByTypeLabelled(v: unknown): DashboardSummary['byTypeLabelled'] {
  if (!Array.isArray(v)) return undefined;
  const rows: NonNullable<DashboardSummary['byTypeLabelled']> = [];
  for (const r of v) {
    if (!isRecord(r)) continue;
    const n = count(r.n);
    if (typeof r.key !== 'string' || r.key === '') continue;
    if (typeof r.label !== 'string' || r.label.trim() === '') continue;
    if (n === null || n <= 0) continue;
    rows.push({ key: r.key, label: r.label, n });
  }
  return rows.length > 0 ? rows : undefined;
}

function count(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

/** The T-506 body, or null when it is not what the endpoint serves. */
export function parseDashboardSummary(body: unknown): DashboardSummary | null {
  if (!isRecord(body)) return null;
  const drafts = count(body.draftsThisMonth);
  const inkUsed = count(body.inkUsedThisMonth);
  const sc = body.statusCounts;
  if (drafts === null || inkUsed === null || !isRecord(sc) || !isRecord(body.byType)) return null;
  const draft = count(sc.draft);
  const finalised = count(sc.finalised);
  const exported = count(sc.exported);
  if (draft === null || finalised === null || exported === null) return null;
  const byType: Record<string, number> = {};
  for (const [k, v] of Object.entries(body.byType)) {
    const n = count(v);
    if (k && n !== null && n > 0) byType[k] = n;
  }
  const byTypeLabelled = parseByTypeLabelled(body.byTypeLabelled);
  return {
    draftsThisMonth: drafts,
    byType,
    ...(byTypeLabelled ? { byTypeLabelled } : {}),
    statusCounts: { draft, finalised, exported },
    inkUsedThisMonth: inkUsed,
  };
}

async function loadSummary(): Promise<DashboardSummary> {
  const res = await apiFetch('/api/drafting/dashboard/summary', { cache: 'no-store' });
  if (!res.ok) throw new Error(`summary ${res.status}`);
  const parsed = parseDashboardSummary(await res.json());
  if (!parsed) throw new Error('summary: unexpected body');
  return parsed;
}

export function useDashboardSummary(): Loadable<DashboardSummary> {
  return useLoadable(loadSummary);
}

// ── Recent documents (the shelf) ────────────────────────────────────────────

export interface ShelfDocument {
  _id: string;
  title: string;
  status: 'draft' | 'finalised' | 'exported';
}

/** How many spines the dashboard shows. */
export const SHELF_SIZE = 8;

const STATUSES = ['draft', 'finalised', 'exported'] as const;

/** GET /api/documents body to shelf documents; null when the body is not a document list. */
export function parseShelfDocuments(body: unknown): ShelfDocument[] | null {
  if (!isRecord(body) || !Array.isArray(body.documents)) return null;
  const out: ShelfDocument[] = [];
  for (const d of body.documents) {
    if (!isRecord(d) || typeof d._id !== 'string' || !d._id) continue;
    const status = STATUSES.includes(d.status as ShelfDocument['status'])
      ? (d.status as ShelfDocument['status'])
      : 'draft';
    out.push({ _id: d._id, title: typeof d.title === 'string' ? d.title : '', status });
  }
  return out;
}

async function loadDocuments(): Promise<ShelfDocument[]> {
  const res = await apiFetch('/api/documents');
  if (!res.ok) throw new Error(`documents ${res.status}`);
  const parsed = parseShelfDocuments(await res.json());
  if (!parsed) throw new Error('documents: unexpected body');
  return parsed.slice(0, SHELF_SIZE);
}

export function useShelfDocuments(): Loadable<ShelfDocument[]> {
  return useLoadable(loadDocuments);
}

// ── Plan and renewal (T-508 status) ─────────────────────────────────────────

export function usePlanStatus(): Loadable<SubscriptionStatus> {
  return useLoadable(fetchSubscriptionStatus);
}

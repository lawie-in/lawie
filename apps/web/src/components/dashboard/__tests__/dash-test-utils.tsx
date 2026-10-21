// Shared helpers for the T-520 dashboard tests. Not a test file (jest matches *.test.ts(x) only).
import { act } from 'react';

import type { DashboardSummary } from '../useDashboardData';

import type { SubscriptionStatus } from '@/components/billing/subscriptionStatus';

export const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
export const notOk = (status = 500) => ({ ok: false, status, json: async () => ({}) });

/** Let promise chains and state updates settle. */
export async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
}

export const PATHS = {
  summary: '/api/drafting/dashboard/summary',
  documents: '/api/documents',
  balance: '/api/credits/balance',
  status: '/api/billing/status',
} as const;

export type Handlers = Partial<Record<string, () => Promise<unknown>>>;

/** Points a jest.fn() apiFetch at per-path handlers; an unlisted path rejects like a dead network. */
export function routeApi(mock: jest.Mock, handlers: Handlers): void {
  mock.mockImplementation((path: string) => {
    const h = handlers[path];
    return h ? h() : Promise.reject(new Error(`unrouted ${path}`));
  });
}

export const NEVER = () => new Promise<never>(() => undefined);

export function summaryBody(over: Partial<Record<string, unknown>> = {}) {
  return {
    month: '2026-10',
    draftsThisMonth: 7,
    byType: { bail_regular: 4, legal_notice: 2, plaint: 1 },
    statusCounts: { draft: 3, finalised: 2, exported: 2 },
    inkUsedThisMonth: 9,
    failedCount: 0,
    ...over,
  };
}

export function parsedSummary(over: Partial<DashboardSummary> = {}): DashboardSummary {
  return {
    draftsThisMonth: 7,
    byType: { bail_regular: 4, legal_notice: 2, plaint: 1 },
    statusCounts: { draft: 3, finalised: 2, exported: 2 },
    inkUsedThisMonth: 9,
    ...over,
  };
}

export function balanceBody(totalInk: number, inkSubMonthlyAllotment = 0) {
  return {
    topupCredits: 0,
    earnedCredits: 0,
    subscriptionCredits: 0,
    total: 0,
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: totalInk,
    totalInk,
    inkSubMonthlyAllotment,
    planTier: 'free',
    billingCycle: 'none',
  };
}

/** The T-508 envelope: billing wraps the status in { data }. */
export function statusBody(over: Partial<SubscriptionStatus> = {}) {
  return {
    data: {
      status: null,
      tier: 'free',
      renewsAt: null,
      state: 'active',
      cancelAtCycleEnd: false,
      ...over,
    },
  };
}

export const RENEWS_ISO = '2026-11-15T10:00:00.000Z';
export const RENEWS_TEXT = '15 Nov 2026';

export function docsBody(n: number, status: 'draft' | 'finalised' | 'exported' = 'draft') {
  return {
    documents: Array.from({ length: n }, (_, i) => ({
      _id: `d${i + 1}`,
      title: `Matter ${i + 1}`,
      status,
    })),
  };
}

/** The visible text of one tile, found by its label. */
export function tileText(container: ParentNode, label: string): string {
  const h = Array.from(container.querySelectorAll('h2')).find((e) => e.textContent === label);
  return h?.closest('section')?.textContent ?? '';
}
export function tile(container: ParentNode, label: string): HTMLElement | null {
  const h = Array.from(container.querySelectorAll('h2')).find((e) => e.textContent === label);
  return (h?.closest('section') as HTMLElement | null) ?? null;
}

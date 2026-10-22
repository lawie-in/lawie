/**
 * T-523: mock builders for the e2e specs. Every builder takes typed overrides and has a sensible
 * default (a verified Free user with 5 Ink). `shellMocks` answers what the signed-in shell loads;
 * a spec adds or overrides endpoints with a later `mockApi` call (later registrations win).
 * When the fixture fails a test with "unmocked API", add that endpoint here or in the spec.
 */
import type { SubscriptionStatus } from '../../src/components/billing/subscriptionStatus';
import type { CreditBalance } from '../../src/hooks/useCredits';

import { me, type MeData } from './auth';
import { balances, invoices, plansCatalogue, statuses, subscriptionStatus } from './billing';
import { dashboardSummary, documents, type DocumentRow } from './drafting';
import { json, type ApiMocks } from './reply';

export * from './auth';
export * from './billing';
export * from './drafting';
export * from './reply';

export interface ShellOptions {
  balance?: CreditBalance;
  status?: { status: 'success'; data: SubscriptionStatus };
  me?: Partial<MeData>;
  documents?: DocumentRow[];
}

/** The signed-in shell's background calls, answered with the defaults or the given values. */
export function shellMocks(opts: ShellOptions = {}): ApiMocks {
  return {
    'GET /api/auth/me': json(me(opts.me)),
    'GET /api/credits/balance': json(opts.balance ?? balances.free()),
    'GET /api/billing/status': json(opts.status ?? statuses.free()),
    'GET /api/billing/plans': json(plansCatalogue()),
    'GET /api/billing/invoices': json(invoices()),
    'GET /api/drafting/dashboard/summary': json(dashboardSummary()),
    'GET /api/documents': json(documents(opts.documents)),
    // The section finder (mounted by the dashboard layout) hydrates these once.
    'GET /api/users/me/bookmarks/sections': json({ bookmarks: [] }),
    'GET /api/users/me/recent/sections': json({ recent: [] }),
  };
}

/** Ready-made shells for the plan states the T-520 screenshot matrix needs. */
export const shells = {
  free: () => shellMocks(),
  zeroInk: () => shellMocks({ balance: balances.zeroInk() }),
  solo: () => shellMocks({ balance: balances.solo(), status: statuses.solo() }),
  pro: () => shellMocks({ balance: balances.pro(), status: statuses.pro() }),
  pastDue: () => shellMocks({ balance: balances.pro(), status: statuses.pastDue('pro') }),
  endsAt: () => shellMocks({ balance: balances.pro(), status: statuses.endsAt('pro') }),
  custom: (status: Partial<SubscriptionStatus>, balance?: CreditBalance) =>
    shellMocks({ status: subscriptionStatus(status), balance }),
};

/**
 * T-523: drafting mocks (dashboard summary, documents, the one drafting flow). Shapes are the
 * app's own types where it exports them (type-only imports, erased at run time).
 */
import type {
  DashboardSummary,
  ShelfDocument,
} from '../../src/components/dashboard/useDashboardData';
import type {
  Brief,
  BriefItem,
  BriefResponse,
  KindSummary,
} from '../../src/components/intake/briefTypes';

import { sse, type MockReply, type SseDone, type SseEvent } from './reply';

// ── GET /api/drafting/dashboard/summary (raw body) ───────────────────────────────────────────

export function dashboardSummary(overrides: Partial<DashboardSummary> = {}): DashboardSummary {
  return {
    draftsThisMonth: 3,
    byType: { legal_notice: 2, bail_application: 1 },
    statusCounts: { draft: 2, finalised: 1, exported: 0 },
    inkUsedThisMonth: 3,
    ...overrides,
  };
}

export const emptyDashboardSummary = (): DashboardSummary =>
  dashboardSummary({
    draftsThisMonth: 0,
    byType: {},
    statusCounts: { draft: 0, finalised: 0, exported: 0 },
    inkUsedThisMonth: 0,
  });

// ── GET /api/documents ({ documents }) ───────────────────────────────────────────────────────

export interface DocumentRow extends ShelfDocument {
  /** The documents list page reads `docType` and `courtName` (app/dashboard/documents/page.tsx). */
  docType: string;
  courtName: string;
  createdAt: string;
  updatedAt: string;
}

export function documentRow(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    _id: 'doc_e2e_0001',
    title: 'Legal notice: recovery of dues',
    status: 'draft',
    docType: 'legal_notice',
    courtName: '',
    createdAt: '2026-10-20T05:30:00.000Z',
    updatedAt: '2026-10-20T05:30:00.000Z',
    ...overrides,
  };
}

export function documents(rows: DocumentRow[] = defaultDocuments()): { documents: DocumentRow[] } {
  return { documents: rows };
}

export function defaultDocuments(): DocumentRow[] {
  return [
    documentRow(),
    documentRow({
      _id: 'doc_e2e_0002',
      title: 'Regular bail application',
      status: 'finalised',
      docType: 'bail_application',
      courtName: 'Sessions Court, Pune',
    }),
    documentRow({
      _id: 'doc_e2e_0003',
      title: 'Legal notice: dishonoured cheque',
      status: 'draft',
    }),
  ];
}

// ── GET /api/documents/intake/enabled, /template-configs ─────────────────────────────────────

export const intakeEnabled = (enabled = true): { enabled: boolean } => ({ enabled });

export const E2E_TEMPLATES: KindSummary[] = [
  {
    template_id: 'legal_notice',
    display_name: 'Legal notice',
    category: 'Notices',
    description: 'A notice before filing a civil or cheque case.',
    plan_access: 'free',
    credits_cost: 1,
  },
  {
    template_id: 'bail_application',
    display_name: 'Bail application',
    category: 'Criminal',
    description: 'Regular bail before a Sessions Court.',
    plan_access: 'free',
    credits_cost: 1,
  },
];

export function templateConfigs(
  templates: KindSummary[] = E2E_TEMPLATES,
  guidedCreditsCost = 1,
): { templates: KindSummary[]; guided_credits_cost: number } {
  return { templates, guided_credits_cost: guidedCreditsCost };
}

// ── POST /api/documents/intake/brief (components/intake/briefTypes.ts BriefResponse) ─────────

export function briefItem(overrides: Partial<BriefItem> = {}): BriefItem {
  return {
    key: 'sender_name',
    part: 'parties',
    label: 'Sender',
    kind: 'text',
    required: true,
    options: [],
    value: 'Ravi Kumar',
    source: 'description',
    please_check: false,
    placeholder: '[SENDER]',
    party_name: true,
    ...overrides,
  };
}

export function brief(overrides: Partial<Brief> = {}): Brief {
  return {
    kind: { id: 'legal_notice', name: 'Legal notice', court_document: false },
    court: { state: null, court_type: null, court: null },
    items: [
      briefItem(),
      briefItem({
        key: 'recipient_name',
        label: 'Recipient',
        value: 'Mehta Traders',
        placeholder: '[RECIPIENT]',
      }),
      briefItem({
        key: 'amount_due',
        part: 'numbers',
        label: 'Amount due',
        kind: 'amount',
        value: '250000',
        placeholder: '[AMOUNT]',
        party_name: false,
      }),
    ],
    loose_dates: [],
    unplaced: [],
    still_unknown: [],
    can_confirm: true,
    confirm_blockers: [],
    confirm_message: null,
    ...overrides,
  };
}

/** A brief ready to confirm (outcome 'brief', no questions). */
export function briefResponse(overrides: Partial<BriefResponse> = {}): BriefResponse {
  return {
    intake_id: 'intake_e2e_0001',
    outcome: 'brief',
    brief: brief(),
    questions: [],
    ...overrides,
  };
}

// ── POST /api/documents/generate-from-brief (text/event-stream) ──────────────────────────────

export function generateDone(overrides: Partial<SseDone> = {}): SseDone {
  return {
    docId: 'doc_e2e_new1',
    rulePack: true,
    startingDraft: false,
    startingDraftLabel: null,
    labelReason: null,
    missingClauses: [],
    disclaimer: 'E2E mock disclaimer. Not legal text.',
    inkDebited: 1,
    balance: { totalInk: 4 },
    ...overrides,
  };
}

/** A successful stream: a few tokens, then `done`. Synthetic text only, never model output. */
export function generateEvents(done: Partial<SseDone> = {}): SseEvent[] {
  return [
    { text: 'LEGAL NOTICE\n\n' },
    { text: 'To: Mehta Traders\n\n' },
    { text: 'E2E mock draft body.' },
    { event: 'done', data: generateDone(done) },
  ];
}

/** The generate-from-brief reply. To observe the generating step use `gated()` (mocks/reply.ts), not a delay. */
export function generateReply(
  events: SseEvent[] = generateEvents(),
  opts: { delayMs?: number } = {},
): MockReply {
  return sse(events, { delayMs: opts.delayMs ?? 0, headers: { 'x-run-id': 'run_e2e_0001' } });
}

/** A stream that fails with the service's `error` event. */
export function generateErrorReply(
  reason = 'The drafting service could not finish this draft.',
  extra: { retryable?: boolean; code?: string } = {},
): MockReply {
  return generateReply([{ event: 'error', data: { reason, ...extra } }], { delayMs: 0 });
}

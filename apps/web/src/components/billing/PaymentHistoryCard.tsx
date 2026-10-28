'use client';

/**
 * T-646 §1: the Payments card in Settings → Billing (Rajesh's design note; Vikram's statuses and
 * amounts; Ajay's AJ-646 rulings). Strings: paymentCopy.ts.
 *
 * - GET /api/billing/payments → { payments: [...] }, the caller's own payments, newest first.
 *   Any other shape is a load error, never a crash; malformed rows are dropped.
 * - 10 rows, then Show more (10 at a time, client side).
 * - One structure for every width (CSS grid, not two trees): a 6-column table row from 720px,
 *   a stacked card row below. Table semantics through ARIA roles (role=table/row/cell) so the
 *   same nodes serve both layouts.
 * - Amount: GST-inclusive with paise ("₹65.00 incl. GST"); a partly refunded row shows both.
 * - Reference: "…" + the last characters billing sends (never the full id), with a copy button.
 * - Invoice: the existing /api/billing/invoices/:id/pdf, fetched as the Invoices card does.
 * - Deep links: #payments scrolls to the card; #payment-<id> to the row (a row not in the list
 *   scrolls to the card instead, never an error).
 */
import { Copy } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { invoicePdfFilename } from '@/components/billing/InvoicesCard';
import {
  PAYMENT_COPY,
  formatIstDateTime,
  formatRupeesPaise,
  formatSignedInk,
  type PaymentStatus,
} from '@/components/billing/paymentCopy';
import {
  ConcernViewDialog,
  RaiseConcernDialog,
  parseConcern,
  type ConcernPaymentSummary,
  type PaymentConcern,
} from '@/components/billing/RaiseConcernDialog';
import {
  Button,
  Card,
  Chip,
  ToastProvider,
  formatInk,
  loopPlayState,
  usePageVisible,
  useToast,
  type ChipVariant,
} from '@/components/ui';
import { apiFetch } from '@/lib/apiFetch';
import { cn } from '@/lib/cn';
import { downloadBlob } from '@/lib/download';

export const PAYMENTS_PAGE_SIZE = 10;
export const PAYMENTS_CARD_ID = 'payments';
export const paymentRowId = (id: string) => `payment-${id}`;

const STATUSES: readonly PaymentStatus[] = [
  'paid',
  'failed',
  'processing',
  'refunded',
  'partly_refunded',
];

export interface PaymentRow {
  id: string;
  createdAt: string;
  kind: 'plan' | 'topup';
  amountPaise: number;
  status: PaymentStatus;
  checking: boolean;
  refundedPaise: number;
  /** Net Ink change (added minus taken back). */
  inkDelta: number;
  /** Ink the payment added; null when billing did not send it (fall back to inkDelta). */
  inkAddedInk: number | null;
  /** Ink a refund took back; null when billing did not send it (then not shown). */
  inkReversedInk: number | null;
  referenceTail: string;
  invoiceId: string | null;
  concern: PaymentConcern | null;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Keeps only well-formed rows; null when the body is not the payments list at all. */
export function parsePayments(body: unknown): PaymentRow[] | null {
  const list = (body as { payments?: unknown } | null)?.payments;
  if (!Array.isArray(list)) return null;
  const rows: PaymentRow[] = [];
  for (const raw of list) {
    const r = (raw ?? {}) as Record<string, unknown>;
    if (
      typeof r.id !== 'string' ||
      typeof r.createdAt !== 'string' ||
      (r.kind !== 'plan' && r.kind !== 'topup') ||
      !isNum(r.amountPaise) ||
      !(STATUSES as readonly unknown[]).includes(r.status) ||
      typeof r.referenceTail !== 'string'
    ) {
      continue;
    }
    rows.push({
      id: r.id,
      createdAt: r.createdAt,
      kind: r.kind,
      amountPaise: r.amountPaise,
      status: r.status as PaymentStatus,
      checking: r.checking === true,
      refundedPaise: isNum(r.refundedPaise) ? r.refundedPaise : 0,
      inkDelta: isNum(r.inkDelta) ? r.inkDelta : 0,
      inkAddedInk: isNum(r.inkAddedInk) ? r.inkAddedInk : null,
      inkReversedInk: isNum(r.inkReversedInk) ? r.inkReversedInk : null,
      referenceTail: r.referenceTail,
      invoiceId: typeof r.invoiceId === 'string' && r.invoiceId ? r.invoiceId : null,
      concern: parseConcern(r.concern),
    });
  }
  return rows;
}

/** Design §1: paid ok, processing warn, failed error, refunded neutral. Label always carries it. */
export const STATUS_CHIP: Record<PaymentStatus, ChipVariant> = {
  paid: 'ok',
  processing: 'warn',
  failed: 'error',
  refunded: 'neutral',
  partly_refunded: 'neutral',
};

/** Design §3: open warn, resolved ok, refunded neutral; anything else neutral. */
export function concernChip(status: string): { variant: ChipVariant; label: string } {
  const label = PAYMENT_COPY.concernStatus[status] ?? PAYMENT_COPY.concernStatusOther;
  const variant: ChipVariant =
    status === 'open' ? 'warn' : status === 'resolved' ? 'ok' : 'neutral';
  return { variant, label };
}

/**
 * VIKRAM §3: the Ink lines under the purpose. Line 1: "+{added} Ink" (or the net inkDelta when
 * billing did not send inkAddedInk). Line 2, refunded / partly refunded rows with
 * inkReversedInk > 0 only: "−{n} Ink removed for the refund" (AJ-646-M10), n clamped to the Ink
 * added when both are known. A fully refunded top-up shows both.
 */
export function inkLines(row: PaymentRow): string[] {
  const lines: string[] = [];
  if (row.inkAddedInk !== null) {
    if (row.inkAddedInk > 0) lines.push(PAYMENT_COPY.inkChange(formatSignedInk(row.inkAddedInk)));
  } else if (row.inkDelta !== 0) {
    lines.push(PAYMENT_COPY.inkChange(formatSignedInk(row.inkDelta)));
  }
  const refunded = row.status === 'refunded' || row.status === 'partly_refunded';
  if (refunded && row.inkReversedInk !== null && row.inkReversedInk > 0) {
    // AJ-646-M10: never more than was added (when both are known).
    const shown =
      row.inkAddedInk !== null ? Math.min(row.inkReversedInk, row.inkAddedInk) : row.inkReversedInk;
    if (shown > 0) lines.push(PAYMENT_COPY.inkTakenBack(formatInk(shown)));
  }
  return lines;
}

export function purposeLabel(row: PaymentRow): string {
  return row.kind === 'plan' ? PAYMENT_COPY.purposePlan : PAYMENT_COPY.purposeTopup;
}

export function summaryFor(row: PaymentRow): ConcernPaymentSummary {
  return {
    id: row.id,
    purpose: purposeLabel(row),
    amount: PAYMENT_COPY.amountInclGst(formatRupeesPaise(row.amountPaise)),
    date: formatIstDateTime(row.createdAt),
  };
}

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'loaded'; rows: PaymentRow[] };

const linkButtonClass =
  'nl-focus nl-body-sm inline-flex min-h-[44px] min-w-[44px] touch-manipulation select-none items-center justify-center gap-nl-1 px-nl-2 font-medium text-nl-brass-dark underline underline-offset-4';

/** The card with its own toast region (no app-wide ToastProvider is mounted yet). */
export function PaymentHistoryCard() {
  return (
    <ToastProvider closeLabel={PAYMENT_COPY.toastClose} viewportLabel={PAYMENT_COPY.toastRegion}>
      <PaymentHistoryCardBody />
    </ToastProvider>
  );
}

type DialogState =
  | { kind: 'none' }
  | { kind: 'raise'; row: PaymentRow }
  | { kind: 'view'; row: PaymentRow; concern: PaymentConcern };

function PaymentHistoryCardBody() {
  const toast = useToast();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [shownCount, setShownCount] = useState(PAYMENTS_PAGE_SIZE);
  const [announce, setAnnounce] = useState('');
  const [invoiceFailedId, setInvoiceFailedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  /** Concerns sent in this session, by payment id, until the list reloads with them. */
  const [sentConcerns, setSentConcerns] = useState<Record<string, PaymentConcern>>({});
  const downloading = useRef(new Set<string>());
  const returnFocus = useRef<HTMLElement | null>(null);
  /** After a concern is sent, focus goes to that row's View button. */
  const focusViewFor = useRef<string | null>(null);
  const deepLinkDone = useRef(false);
  const pageVisible = usePageVisible();

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const res = await apiFetch('/api/billing/payments');
      if (!res.ok) {
        console.error('[payments] load failed:', res.status);
        setState({ kind: 'error' });
        return;
      }
      const body: unknown = await res.json().catch(() => null);
      const rows = parsePayments(body);
      setState(rows ? { kind: 'loaded', rows } : { kind: 'error' });
      if (rows) setSentConcerns({});
    } catch (err) {
      console.error('[payments] load failed:', err instanceof Error ? err.name : 'error');
      setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Deep links (design §5), once, after the first load.
  useEffect(() => {
    if (deepLinkDone.current || state.kind === 'loading') return;
    const hash = window.location.hash.replace(/^#/, '');
    if (hash !== PAYMENTS_CARD_ID && !hash.startsWith('payment-')) return;
    deepLinkDone.current = true;
    const rows = state.kind === 'loaded' ? state.rows : [];
    const target = hash.startsWith('payment-') ? hash.slice('payment-'.length) : null;
    const index = target ? rows.findIndex((r) => r.id === target) : -1;
    if (index >= PAYMENTS_PAGE_SIZE) {
      setShownCount(Math.ceil((index + 1) / PAYMENTS_PAGE_SIZE) * PAYMENTS_PAGE_SIZE);
    }
    window.requestAnimationFrame(() => {
      const el =
        (index >= 0 && document.getElementById(paymentRowId(target!))) ||
        document.getElementById(PAYMENTS_CARD_ID);
      el?.scrollIntoView({ block: index >= 0 ? 'center' : 'start' });
    });
  }, [state]);

  const downloadInvoice = async (row: PaymentRow) => {
    if (!row.invoiceId || downloading.current.has(row.id)) return;
    downloading.current.add(row.id);
    setInvoiceFailedId(null);
    try {
      const res = await apiFetch(`/api/billing/invoices/${encodeURIComponent(row.invoiceId)}/pdf`);
      if (!res.ok) {
        console.error('[payments] invoice pdf failed:', res.status);
        setInvoiceFailedId(row.id);
        return;
      }
      // The invoice number is not in the payments list; the PDF is named after the invoice id.
      downloadBlob(await res.blob(), invoicePdfFilename(row.invoiceId));
    } catch (err) {
      console.error('[payments] invoice pdf failed:', err instanceof Error ? err.name : 'error');
      setInvoiceFailedId(row.id);
    } finally {
      downloading.current.delete(row.id);
    }
  };

  const copyReference = async (tail: string) => {
    try {
      await navigator.clipboard.writeText(tail);
      setAnnounce('');
      window.setTimeout(() => setAnnounce(PAYMENT_COPY.copied), 0);
    } catch {
      // No clipboard (insecure context, denied): the reference is still on screen to select.
    }
  };

  const rows = state.kind === 'loaded' ? state.rows : [];
  const shown = rows.slice(0, shownCount);
  const remaining = Math.max(0, rows.length - shownCount);

  const closeDialog = (open: boolean) => {
    if (!open) setDialog({ kind: 'none' });
  };
  const restoreFocus = (e: Event) => {
    const rowId = focusViewFor.current;
    focusViewFor.current = null;
    const view = rowId
      ? document
          .getElementById(paymentRowId(rowId))
          ?.querySelector<HTMLElement>('[data-concern-view]')
      : null;
    if (view) {
      e.preventDefault();
      view.focus();
      return;
    }
    if (returnFocus.current?.isConnected) {
      e.preventDefault();
      returnFocus.current.focus();
    }
  };

  return (
    <Card aria-labelledby="payments-heading" id={PAYMENTS_CARD_ID} className="scroll-mt-nl-4">
      <h2 id="payments-heading" className="nl-h3 text-nl-text">
        {PAYMENT_COPY.heading}
      </h2>
      <p className="nl-body-sm mt-nl-1 text-nl-muted">{PAYMENT_COPY.intro}</p>

      {state.kind === 'loading' && (
        <div className="mt-nl-3">
          <p role="status" className="sr-only">
            {PAYMENT_COPY.loading}
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

      {state.kind === 'loaded' && rows.length === 0 && (
        <p className="nl-body mt-nl-3 text-nl-muted">{PAYMENT_COPY.empty}</p>
      )}

      {state.kind === 'loaded' && rows.length > 0 && (
        <>
          <div role="table" aria-label={PAYMENT_COPY.listLabel} className="mt-nl-3">
            <div role="rowgroup" className="sr-only">
              <div role="row">
                <span role="columnheader">{PAYMENT_COPY.colDate}</span>
                <span role="columnheader">{PAYMENT_COPY.colPurpose}</span>
                <span role="columnheader">{PAYMENT_COPY.colAmount}</span>
                <span role="columnheader">{PAYMENT_COPY.colStatus}</span>
                <span role="columnheader">{PAYMENT_COPY.colReference}</span>
                <span role="columnheader">{PAYMENT_COPY.colActions}</span>
              </div>
            </div>
            <div role="rowgroup" className="divide-nl-line divide-y">
              {shown.map((row) => {
                const concern = sentConcerns[row.id] ?? row.concern;
                const chip = concern ? concernChip(concern.status) : null;
                const canRaise = !concern || concern.status !== 'open';
                const amount = formatRupeesPaise(row.amountPaise);
                return (
                  <div
                    key={row.id}
                    id={paymentRowId(row.id)}
                    role="row"
                    className={cn(
                      'py-nl-3 gap-x-nl-3 gap-y-nl-1 scroll-mt-nl-4 grid items-center',
                      // 360 first (design §4): line 1 purpose | amount; line 2 date · status |
                      // reference; line 3 actions. From 720px: one 6-column row.
                      'grid-cols-[auto_minmax(0,1fr)_auto]',
                      'min-[720px]:gap-x-nl-4 min-[720px]:min-h-[44px] min-[720px]:grid-cols-[9.5rem_minmax(0,1fr)_auto_auto_auto_auto]',
                    )}
                  >
                    {/* Date (col 1 on desktop; line 2 left on phones) */}
                    <span
                      role="cell"
                      className="nl-body-sm text-nl-text col-start-1 row-start-2 whitespace-nowrap tabular-nums min-[720px]:row-start-1"
                    >
                      <time dateTime={row.createdAt}>{formatIstDateTime(row.createdAt)}</time>
                    </span>
                    {/* Purpose + Ink change */}
                    <span
                      role="cell"
                      className="col-span-2 col-start-1 row-start-1 min-w-0 min-[720px]:col-span-1 min-[720px]:col-start-2"
                    >
                      <span
                        className="nl-body text-nl-text block truncate font-medium max-[719px]:whitespace-normal"
                        title={purposeLabel(row)}
                      >
                        {purposeLabel(row)}
                      </span>
                      {inkLines(row).map((line) => (
                        <span key={line} className="nl-body-sm text-nl-muted block tabular-nums">
                          {line}
                        </span>
                      ))}
                    </span>
                    {/* Amount */}
                    <span
                      role="cell"
                      className="col-start-3 row-start-1 whitespace-nowrap text-right min-[720px]:col-start-3"
                    >
                      <span className="font-nl-display text-nl-text block text-[18px] tabular-nums leading-snug">
                        {PAYMENT_COPY.amountInclGst(amount)}
                      </span>
                      {(row.status === 'refunded' || row.status === 'partly_refunded') &&
                        row.refundedPaise > 0 && (
                          <span className="nl-body-sm text-nl-soft block tabular-nums">
                            {PAYMENT_COPY.refundedAmount(formatRupeesPaise(row.refundedPaise))}
                          </span>
                        )}
                    </span>
                    {/* Status */}
                    <span
                      role="cell"
                      className="col-start-2 row-start-2 justify-self-start min-[720px]:col-start-4 min-[720px]:row-start-1"
                    >
                      <Chip variant={STATUS_CHIP[row.status]}>
                        {PAYMENT_COPY.status[row.status]}
                      </Chip>
                    </span>
                    {/* Reference */}
                    <span
                      role="cell"
                      className="nl-body-sm text-nl-muted col-start-3 row-start-2 inline-flex items-center justify-end whitespace-nowrap tabular-nums min-[720px]:col-start-5 min-[720px]:row-start-1"
                    >
                      <span aria-label={PAYMENT_COPY.referenceAria(row.referenceTail)}>
                        …{row.referenceTail}
                      </span>
                      <button
                        type="button"
                        aria-label={PAYMENT_COPY.copyReference}
                        onClick={() => void copyReference(row.referenceTail)}
                        className="nl-focus text-nl-soft inline-flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center"
                      >
                        <Copy aria-hidden="true" className="h-4 w-4" strokeWidth={1.5} />
                      </button>
                    </span>
                    {/* Actions */}
                    <span
                      role="cell"
                      className="gap-nl-1 col-span-3 col-start-1 row-start-3 flex flex-wrap items-center empty:hidden min-[720px]:col-span-1 min-[720px]:col-start-6 min-[720px]:row-start-1 min-[720px]:justify-end"
                    >
                      {row.invoiceId && (
                        <button
                          type="button"
                          onClick={() => void downloadInvoice(row)}
                          className={linkButtonClass}
                        >
                          {PAYMENT_COPY.invoice}
                        </button>
                      )}
                      {concern && chip && (
                        <>
                          <Chip variant={chip.variant}>{chip.label}</Chip>
                          <Button
                            variant="ghost"
                            data-concern-view=""
                            onClick={(e) => {
                              returnFocus.current = e.currentTarget;
                              setDialog({ kind: 'view', row, concern });
                            }}
                          >
                            {PAYMENT_COPY.view}
                          </Button>
                        </>
                      )}
                      {canRaise && (
                        <Button
                          variant="ghost"
                          onClick={(e) => {
                            returnFocus.current = e.currentTarget;
                            setDialog({ kind: 'raise', row });
                          }}
                        >
                          {PAYMENT_COPY.raiseConcern}
                        </Button>
                      )}
                    </span>
                    {(row.status === 'failed' || (row.status === 'processing' && row.checking)) && (
                      <p
                        role="cell"
                        className="nl-body-sm text-nl-soft col-span-3 col-start-1 min-[720px]:col-span-6"
                      >
                        {row.status === 'failed' ? PAYMENT_COPY.failedNote : PAYMENT_COPY.checking}
                      </p>
                    )}
                    {invoiceFailedId === row.id && (
                      <div role="cell" className="col-span-3 col-start-1 min-[720px]:col-span-6">
                        <p role="alert" className="nl-body-sm text-nl-err">
                          {PAYMENT_COPY.invoiceFailed}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {remaining > 0 && (
            <Button
              variant="ghost"
              className="mt-nl-3"
              onClick={() => setShownCount((n) => n + PAYMENTS_PAGE_SIZE)}
            >
              {PAYMENT_COPY.showMore}
            </Button>
          )}
        </>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>

      {dialog.kind === 'raise' && (
        <RaiseConcernDialog
          open
          onOpenChange={closeDialog}
          payment={summaryFor(dialog.row)}
          onCloseAutoFocus={restoreFocus}
          onStale={() => void load()}
          onSubmitted={(concern) => {
            const id = dialog.row.id;
            setSentConcerns((prev) => ({ ...prev, [id]: concern }));
            toast.show({ kind: 'success', message: PAYMENT_COPY.concernSent });
            // Focus target: the row's View button replaces Raise a concern.
            focusViewFor.current = id;
          }}
        />
      )}
      {dialog.kind === 'view' && (
        <ConcernViewDialog
          open
          onOpenChange={closeDialog}
          payment={summaryFor(dialog.row)}
          concern={dialog.concern}
          statusLabel={concernChip(dialog.concern.status).label}
          onCloseAutoFocus={restoreFocus}
        />
      )}
    </Card>
  );
}

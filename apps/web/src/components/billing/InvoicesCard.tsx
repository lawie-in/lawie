'use client';

/**
 * T-436 (c): the Invoices card on /dashboard/settings.
 *
 * Spec: handoff/marketing/invoices-list-spec-t436.md (Rajesh, as settled by Arjun, 15 Oct).
 * Strings: handoff/marketing/copy/t436-ui-strings.md section B (Madhuri), word for word.
 *
 * - Lists the caller's issued invoices and credit notes (GET /api/billing/invoices, newest
 *   first, amounts in paise). A credit note is marked with the "Credit note" badge.
 * - Shows date, number, amount (the total charged or credited) and a PDF button only: no tax
 *   breakdown, SAC or State (spec §1).
 * - The PDF is fetched with apiFetch (a plain link cannot send the sign-in token) and saved
 *   under billing's file name (invoicePdfFilename), built here because Content-Disposition is
 *   not exposed cross-origin.
 * - A response of any other shape is treated as a load error, never a crash.
 */
import { Download } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { apiFetch } from '@/lib/apiFetch';
import { downloadBlob } from '@/lib/download';

/** Madhuri, t436-ui-strings.md section B. Word for word. */
export const INVOICES_STRINGS = {
  heading: 'Invoices',
  pdf: 'PDF',
  pdfAriaInvoice: (invoiceNumber: string) => `Download invoice ${invoiceNumber} as PDF`,
  pdfAriaCreditNote: (invoiceNumber: string) => `Download credit note ${invoiceNumber} as PDF`,
  empty: 'No invoices yet',
  loading: 'Loading invoices…',
  error: 'Could not load your invoices.',
  retry: 'Try again',
  showMore: 'Show more',
  moreShown: (n: number) => `${n} more invoices shown`,
  creditNote: 'Credit note',
} as const;

/** Rajesh's spec §6: the list's accessible name. */
const LIST_LABEL = 'Invoices, newest first';

/** Rows shown before "Show more" (spec §5: a year of monthly charges). */
export const INVOICES_FIRST_PAGE = 12;

export interface InvoiceRow {
  id: string;
  number: string;
  kind: 'invoice' | 'credit_note';
  issuedAt: string;
  /** Paise, GST-inclusive; positive for credit notes too. */
  total: number;
  originalInvoiceNumber: string | null;
}

/** billing's invoicePdfFilename: every character but A-Z, a-z, 0-9 and "-" becomes "-". */
export function invoicePdfFilename(number: string): string {
  return `${number.replace(/[^A-Za-z0-9-]/g, '-')}.pdf`;
}

/** Spec §3: `₹799`, `₹1,299`, `₹12,999`; paise only when non-zero (`₹799.50`). */
export function formatInvoiceAmount(paise: number): string {
  const whole = paise % 100 === 0;
  const digits = whole ? 0 : 2;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(paise / 100);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Spec §3: `14 Oct 2026`, in IST. Fixed month names (some locales print "Sept"). */
export function formatInvoiceDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return `${get('day')} ${MONTHS[get('month') - 1]} ${get('year')}`;
}

/** Keeps only well-formed rows; null when the body is not the invoices list at all. */
export function parseInvoices(body: unknown): InvoiceRow[] | null {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return null;
  const rows: InvoiceRow[] = [];
  for (const raw of data) {
    const r = (raw ?? {}) as Record<string, unknown>;
    if (
      typeof r.id !== 'string' ||
      typeof r.number !== 'string' ||
      (r.kind !== 'invoice' && r.kind !== 'credit_note') ||
      typeof r.issuedAt !== 'string' ||
      typeof r.total !== 'number' ||
      !Number.isFinite(r.total)
    ) {
      continue;
    }
    rows.push({
      id: r.id,
      number: r.number,
      kind: r.kind,
      issuedAt: r.issuedAt,
      total: r.total,
      originalInvoiceNumber:
        typeof r.originalInvoiceNumber === 'string' ? r.originalInvoiceNumber : null,
    });
  }
  return rows;
}

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'loaded'; rows: InvoiceRow[] };

/** Same link style as the spec §4: underlined text, 44 px target. */
const pdfButtonClass =
  'inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 px-2 text-xs font-medium text-slate-600 underline hover:text-slate-900';

const smallButtonClass =
  'min-h-[44px] rounded-lg border border-slate-300 px-3 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50';

export function InvoicesCard() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [expanded, setExpanded] = useState(false);
  const [announce, setAnnounce] = useState('');
  const downloading = useRef(new Set<string>());

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const res = await apiFetch('/api/billing/invoices');
      if (!res.ok) {
        setState({ kind: 'error' });
        return;
      }
      const body: unknown = await res.json().catch(() => null);
      const rows = parseInvoices(body);
      setState(rows ? { kind: 'loaded', rows } : { kind: 'error' });
    } catch (err) {
      console.error('[invoices] load failed:', err instanceof Error ? err.name : 'error');
      setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const downloadPdf = async (row: InvoiceRow) => {
    if (downloading.current.has(row.id)) return;
    downloading.current.add(row.id);
    try {
      const res = await apiFetch(`/api/billing/invoices/${encodeURIComponent(row.id)}/pdf`);
      if (!res.ok) {
        console.error('[invoices] pdf failed:', res.status);
        return;
      }
      downloadBlob(await res.blob(), invoicePdfFilename(row.number));
    } catch (err) {
      console.error('[invoices] pdf failed:', err instanceof Error ? err.name : 'error');
    } finally {
      downloading.current.delete(row.id);
    }
  };

  const rows = state.kind === 'loaded' ? state.rows : [];
  const hidden = Math.max(0, rows.length - INVOICES_FIRST_PAGE);
  const shown = expanded ? rows : rows.slice(0, INVOICES_FIRST_PAGE);

  const showMore = () => {
    if (expanded) return;
    setExpanded(true);
    setAnnounce(INVOICES_STRINGS.moreShown(hidden));
  };

  return (
    <section
      aria-labelledby="invoices-heading"
      className="mt-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h2 id="invoices-heading" className="text-sm font-semibold text-slate-700">
        {INVOICES_STRINGS.heading}
      </h2>

      {state.kind === 'loading' && (
        <div className="mt-3">
          <p role="status" className="sr-only">
            {INVOICES_STRINGS.loading}
          </p>
          <ul aria-hidden="true" className="divide-y divide-slate-200">
            {[0, 1, 2].map((i) => (
              <li key={i} className="py-3">
                <div className="h-4 w-full rounded bg-slate-100" />
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p role="alert" className="text-sm text-slate-600">
            {INVOICES_STRINGS.error}
          </p>
          <button type="button" onClick={() => void load()} className={smallButtonClass}>
            {INVOICES_STRINGS.retry}
          </button>
        </div>
      )}

      {state.kind === 'loaded' && rows.length === 0 && (
        <p className="mt-3 text-sm text-slate-600">{INVOICES_STRINGS.empty}</p>
      )}

      {state.kind === 'loaded' && rows.length > 0 && (
        <>
          <ul aria-label={LIST_LABEL} className="mt-3 divide-y divide-slate-200">
            {shown.map((row) => {
              const isCreditNote = row.kind === 'credit_note';
              return (
                // DOM order (spec §7): number, amount, date, link. 375 px: two lines by the
                // grid; 1280 px: one line, date first, by `order`.
                <li
                  key={row.id}
                  className="grid grid-cols-[1fr_auto] items-center gap-x-3 py-3 sm:flex sm:gap-x-4"
                >
                  <span className="flex flex-wrap items-center gap-2 break-all text-sm text-slate-800 sm:order-2 sm:flex-1">
                    {row.number}
                    {isCreditNote && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {INVOICES_STRINGS.creditNote}
                      </span>
                    )}
                  </span>
                  <span className="text-right text-sm text-slate-800 sm:order-3">
                    {formatInvoiceAmount(row.total)}
                  </span>
                  <time
                    dateTime={row.issuedAt}
                    className="text-xs text-slate-500 sm:order-1 sm:w-32"
                  >
                    {formatInvoiceDate(row.issuedAt)}
                  </time>
                  <span className="justify-self-end sm:order-4">
                    <button
                      type="button"
                      onClick={() => void downloadPdf(row)}
                      aria-label={
                        isCreditNote
                          ? INVOICES_STRINGS.pdfAriaCreditNote(row.number)
                          : INVOICES_STRINGS.pdfAriaInvoice(row.number)
                      }
                      className={pdfButtonClass}
                    >
                      <Download aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.5} />
                      {INVOICES_STRINGS.pdf}
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
          {hidden > 0 && (
            // Stays rendered once expanded so focus is not dropped (spec §5).
            <button
              type="button"
              aria-expanded={expanded}
              onClick={showMore}
              className={`${smallButtonClass} mt-3`}
            >
              {INVOICES_STRINGS.showMore}
            </button>
          )}
          <p role="status" aria-live="polite" className="sr-only">
            {announce}
          </p>
        </>
      )}
    </section>
  );
}

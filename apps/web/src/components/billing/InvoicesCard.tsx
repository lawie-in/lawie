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

import { Button, Card, Chip, loopPlayState, usePageVisible } from '@/components/ui';
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
  // Added 15 Oct (Priya, Shashank), same file.
  againstInvoice: (invoiceNumber: string) => `Against invoice ${invoiceNumber}`,
  pdfFailed: 'We could not download this invoice. Please try again.',
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
  /**
   * T-436 (b): 'fallback' when billing had no State for the user and used ours (Ajay Addendum
   * 3); null when the row does not say. Drives the settings nag only; never shown on the row.
   */
  placeOfSupplySource: 'user' | 'fallback' | null;
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
    const pos = (r.placeOfSupply ?? null) as { source?: unknown } | null;
    const source = pos?.source;
    rows.push({
      id: r.id,
      number: r.number,
      kind: r.kind,
      issuedAt: r.issuedAt,
      total: r.total,
      originalInvoiceNumber:
        typeof r.originalInvoiceNumber === 'string' ? r.originalInvoiceNumber : null,
      placeOfSupplySource: source === 'user' || source === 'fallback' ? source : null,
    });
  }
  return rows;
}

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'loaded'; rows: InvoiceRow[] };

/**
 * Same link style as the spec §4: underlined text, 44 px target. T-525: Brass Text, the one link
 * colour (DESIGN.md Don'ts).
 */
const pdfButtonClass =
  'nl-focus nl-body-sm inline-flex min-h-[44px] min-w-[44px] touch-manipulation select-none items-center justify-center gap-nl-1 px-nl-2 font-medium text-nl-brass-dark underline underline-offset-4';

export interface InvoicesCardProps {
  /** T-436 (b): called with the rows each time they load (the settings State nag reads them). */
  onRowsLoaded?: (rows: InvoiceRow[]) => void;
}

export function InvoicesCard({ onRowsLoaded }: InvoicesCardProps = {}) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [expanded, setExpanded] = useState(false);
  const [announce, setAnnounce] = useState('');
  /** The row whose last PDF download failed (its inline alert shows), or null. */
  const [pdfFailedId, setPdfFailedId] = useState<string | null>(null);
  const downloading = useRef(new Set<string>());
  // T-525: the skeleton pulse pauses while the tab is hidden (spec 2.4).
  const pageVisible = usePageVisible();

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

  // Kept in a ref so a new callback identity does not reload the list.
  const onRowsLoadedRef = useRef(onRowsLoaded);
  useEffect(() => {
    onRowsLoadedRef.current = onRowsLoaded;
  }, [onRowsLoaded]);
  useEffect(() => {
    if (state.kind === 'loaded') onRowsLoadedRef.current?.(state.rows);
  }, [state]);

  const downloadPdf = async (row: InvoiceRow) => {
    if (downloading.current.has(row.id)) return;
    downloading.current.add(row.id);
    // A new attempt clears the last failure message.
    setPdfFailedId(null);
    try {
      const res = await apiFetch(`/api/billing/invoices/${encodeURIComponent(row.id)}/pdf`);
      if (!res.ok) {
        console.error('[invoices] pdf failed:', res.status);
        setPdfFailedId(row.id);
        return;
      }
      downloadBlob(await res.blob(), invoicePdfFilename(row.number));
    } catch (err) {
      console.error('[invoices] pdf failed:', err instanceof Error ? err.name : 'error');
      setPdfFailedId(row.id);
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
    <Card aria-labelledby="invoices-heading">
      <h2 id="invoices-heading" className="nl-h3 text-nl-text">
        {INVOICES_STRINGS.heading}
      </h2>

      {state.kind === 'loading' && (
        <div className="mt-nl-3">
          <p role="status" className="sr-only">
            {INVOICES_STRINGS.loading}
          </p>
          {/* Wood skeleton rows (DESIGN.md Cards: loading); static under reduced motion. */}
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
            {INVOICES_STRINGS.error}
          </p>
          <Button variant="ghost" onClick={() => void load()}>
            {INVOICES_STRINGS.retry}
          </Button>
        </div>
      )}

      {state.kind === 'loaded' && rows.length === 0 && (
        <p className="nl-body mt-nl-3 text-nl-soft">{INVOICES_STRINGS.empty}</p>
      )}

      {state.kind === 'loaded' && rows.length > 0 && (
        <>
          <ul aria-label={LIST_LABEL} className="mt-nl-3 divide-nl-line divide-y">
            {shown.map((row) => {
              const isCreditNote = row.kind === 'credit_note';
              return (
                // DOM order (spec §7): number, amount, date, link. 375 px: two lines by the
                // grid; 1280 px: one line, date first, by `order`.
                <li
                  key={row.id}
                  className="gap-x-nl-3 py-nl-3 sm:gap-x-nl-4 grid grid-cols-[1fr_auto] items-center sm:flex sm:flex-wrap"
                >
                  <span className="nl-body-sm gap-nl-2 text-nl-text flex flex-wrap items-center break-all tabular-nums sm:order-2 sm:flex-1">
                    {row.number}
                    {isCreditNote && <Chip variant="neutral">{INVOICES_STRINGS.creditNote}</Chip>}
                    {isCreditNote && row.originalInvoiceNumber && (
                      <span className="nl-body-sm text-nl-muted basis-full">
                        {INVOICES_STRINGS.againstInvoice(row.originalInvoiceNumber)}
                      </span>
                    )}
                  </span>
                  <span className="nl-body-sm text-nl-text text-right tabular-nums sm:order-3">
                    {formatInvoiceAmount(row.total)}
                  </span>
                  <time
                    dateTime={row.issuedAt}
                    className="nl-body-sm text-nl-muted tabular-nums sm:order-1 sm:w-32"
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
                      <Download aria-hidden="true" className="h-4 w-4" strokeWidth={1.5} />
                      {INVOICES_STRINGS.pdf}
                    </button>
                  </span>
                  {pdfFailedId === row.id && (
                    <p
                      role="alert"
                      className="nl-body-sm mt-nl-1 text-nl-err col-span-2 sm:order-5 sm:basis-full"
                    >
                      {INVOICES_STRINGS.pdfFailed}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          {hidden > 0 && (
            // Stays rendered once expanded so focus is not dropped (spec §5).
            <Button variant="ghost" aria-expanded={expanded} onClick={showMore} className="mt-nl-3">
              {INVOICES_STRINGS.showMore}
            </Button>
          )}
          <p role="status" aria-live="polite" className="sr-only">
            {announce}
          </p>
        </>
      )}
    </Card>
  );
}

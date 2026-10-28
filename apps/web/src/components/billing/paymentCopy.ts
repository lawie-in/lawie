/**
 * T-646: every user-facing string of the Billing tab's Payments card, Ink history card and the
 * Raise a concern dialog (Ajay: all T-646 strings live here).
 *
 * Sources, per string:
 *   - AJ-646-M1..M6: handoff/legal/T-511-copy-rulings-ajay.md, signed, byte for byte.
 *   - AJ-517-M11 grievance line: imported from components/marketing/nl-copy.ts (not copied).
 *   - VIKRAM: handoff/tickets/T-646-payment-history-and-concerns.md "## Vikram" (statuses,
 *     "We're checking this payment", the failed-payment line, "incl. GST").
 *   - ROW-455: handoff/copy/T-511-copy-v1.md row 455 (generic failure + Retry), signed.
 *   - DESIGN: Rajesh's design note (handoff/design/T-646-payment-ink-history-concern.md); the
 *     bracketed placeholders, not yet signed by Ajay.
 *   - DEV: plain wording added by the developer where neither gives one; for Ajay's check.
 */
import { formatInvoiceDate } from '@/components/billing/InvoicesCard';
import { formatInk } from '@/components/ui';

export type PaymentStatus = 'paid' | 'failed' | 'processing' | 'refunded' | 'partly_refunded';
export type ConcernReason =
  | 'charged_no_ink'
  | 'charged_twice'
  | 'wrong_amount'
  | 'refund_request'
  | 'other';

/** API reason codes, in Ajay's M1 order. */
export const CONCERN_REASONS: readonly ConcernReason[] = [
  'charged_no_ink',
  'charged_twice',
  'wrong_amount',
  'refund_request',
  'other',
];

/** Max characters in the concern note (DESIGN §3). */
export const CONCERN_NOTE_MAX = 500;

export const PAYMENT_COPY = {
  // ── Payments card ──────────────────────────────────────────────────────
  heading: 'Payments', // DESIGN
  intro: 'Times in IST.', // DESIGN ("[Times in IST]" once in the card intro)
  listLabel: 'Payments, newest first', // DEV (as the Invoices card)
  empty: 'No payments yet.', // DESIGN
  error: 'Something did not work. Try again.', // ROW-455
  retry: 'Retry', // ROW-455
  showMore: 'Show more', // DESIGN
  loading: 'Loading payments…', // DEV
  colDate: 'Date', // DEV (sr-only table header)
  colPurpose: 'Payment', // DEV
  colAmount: 'Amount', // DEV
  colStatus: 'Status', // DEV
  colReference: 'Reference', // DEV
  colActions: 'Actions', // DEV
  purposePlan: 'Plan', // DESIGN ("[Solo plan]"; the API gives no plan name)
  purposeTopup: 'Top-up', // DESIGN ("[Top-up, 20 Ink]")
  status: {
    paid: 'Paid',
    failed: 'Failed',
    processing: 'Processing',
    refunded: 'Refunded',
    partly_refunded: 'Partly refunded',
  } satisfies Record<PaymentStatus, string>, // VIKRAM §1
  checking: "We're checking this payment", // VIKRAM §2
  failedNote: 'If money left your account, your bank returns it automatically.', // VIKRAM §1
  /** "₹65.00 incl. GST" (VIKRAM §3). */
  amountInclGst: (amount: string) => `${amount} incl. GST`,
  refundedAmount: (amount: string) => `Refunded ${amount}`, // DEV (VIKRAM §1: both figures)
  inkChange: (signed: string) => `${signed} Ink`, // DESIGN ("−2 Ink" / "+50 Ink")
  referenceAria: (tail: string) => `Payment reference ending ${tail}`, // DEV
  copyReference: 'Copy reference', // DESIGN
  copied: 'Copied', // DESIGN
  invoice: 'Invoice', // DESIGN
  invoiceFailed: 'We could not download this invoice. Please try again.', // T-436 (INVOICES_STRINGS.pdfFailed)
  raiseConcern: 'Raise a concern', // DESIGN
  view: 'View', // DESIGN
  concernStatus: {
    open: 'Concern: open',
    resolved: 'Concern: resolved',
    refunded: 'Concern: refunded',
  } as Record<string, string>, // DESIGN §3
  concernStatusOther: 'Concern raised', // DEV (a status the design does not name)
  concernSent: 'Concern sent. We have emailed you an acknowledgement.', // DESIGN §3
  toastClose: 'Close', // DEV (Toast close button name)
  toastRegion: 'Notifications', // DEV

  // ── Raise a concern dialog ─────────────────────────────────────────────
  dialogTitle: 'Raise a concern', // DESIGN
  /** "{purpose} · ₹{amount} · {date}" (DESIGN §3). */
  dialogAbout: (purpose: string, amount: string, date: string) =>
    `${purpose} · ${amount} · ${date}`,
  reasonLabel: 'Reason', // DESIGN
  reasonPlaceholder: 'Choose a reason', // DEV (no default selected)
  reasons: {
    charged_no_ink: 'Charged, but Ink not added',
    charged_twice: 'Charged twice',
    wrong_amount: 'Wrong amount charged',
    refund_request: 'I want a refund',
    other: 'Something else',
  } satisfies Record<ConcernReason, string>, // AJ-646-M1
  noteLabel: 'Tell us what happened', // AJ-646-M1
  noteHint: 'Please do not include case details or card numbers.', // AJ-646-M1
  notePlaceholderOptional: 'Optional', // DESIGN
  noteCounter: (n: number) => `${n}/${CONCERN_NOTE_MAX}`, // DESIGN
  responseTimes: 'We acknowledge every concern within 24 hours and resolve it within 15 days.', // AJ-646-M3
  submit: 'Submit', // DESIGN
  cancel: 'Cancel', // DESIGN
  errorChooseReason: 'Choose a reason.', // DESIGN
  errorNoteRequired: 'Tell us what happened.', // DEV (note required for Something else)
  errorNoteTooLong: `Keep it to ${CONCERN_NOTE_MAX} characters.`, // DEV
  // POST /payments/:id/concerns refusals.
  errorGeneric: 'Something did not work. Try again.', // ROW-455 (503, 5xx, network)
  errorInvalid: 'Check the reason and the note, then try again.', // DEV (400)
  errorNotFound: 'We could not find this payment. Reload the page and try again.', // DEV (404)
  errorOpenConcern: 'There is already an open concern on this payment.', // DEV (409)
  errorTooMany: 'Too many attempts. Wait a few minutes, then try again.', // DEV (429)

  // ── View concern (read-only) ───────────────────────────────────────────
  viewTitle: 'Your concern', // DEV
  viewReference: 'Reference', // DEV
  viewStatus: 'Status', // DEV
  viewReason: 'Reason', // DESIGN
  viewNote: 'Tell us what happened', // AJ-646-M1 (the field's label)
  viewSent: 'Sent', // DEV
  close: 'Close', // DEV

  // ── Ink history card ───────────────────────────────────────────────────
  inkHeading: 'Ink history', // DESIGN
  inkBalance: 'Balance', // DESIGN
  inkListLabel: 'Ink history, newest first', // DEV
  inkEmpty: 'No Ink activity yet.', // DESIGN
  inkLoading: 'Loading Ink history…', // DEV
  inkColWhen: 'Time', // DEV (sr-only)
  inkColWhat: 'Activity', // DEV
  inkColChange: 'Change', // DEV
  inkColBalance: 'Balance after', // DEV
  today: 'Today', // DESIGN
  yesterday: 'Yesterday', // DESIGN
  /** "Draft: {document title}" (DESIGN §2). */
  inkDraft: (title: string) => `Draft: ${title}`,
  inkDraftUntitled: 'Draft', // DEV (a use from before run ids)
  deletedDocument: 'Deleted document', // AJ-646-M5
  inkLabels: {
    topup: 'Top-up', // DESIGN
    plan: 'Plan Ink', // DESIGN ("[Plan Ink: Solo]"; no plan name in the API)
    plan_ink_ended: 'Plan Ink ended', // DEV (unused plan Ink reset at renewal)
    plan_ended: 'Plan ended', // DEV (plan cancelled or expired)
    signup: 'Sign-up Ink', // DESIGN
    referral: 'Referral Ink', // DESIGN
    coupon: 'Coupon Ink', // DEV
    admin_grant: 'Ink from Lawie', // DEV
    test_grant: 'Test Ink', // DEV
    refund_reversal: 'Refund', // DESIGN ("[Refund]")
    other: 'Other', // DEV
  } as Record<string, string>,
} as const;

const MINUS = '−';

/** Paise → "₹65.00" (en-IN, always with paise: VIKRAM §3). */
export function formatRupeesPaise(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

/** ISO → "12 Oct 2026, 14:32" in IST (DESIGN §1). */
export function formatIstDateTime(iso: string): string {
  const date = formatInvoiceDate(iso);
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${date}, ${get('hour')}:${get('minute')}`;
}

/** ISO → "14:32" in IST. */
export function formatIstTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('hour')}:${get('minute')}`;
}

/** Signed Ink with a true minus: 2 → "+2", -2.5 → "−2.5", 0 → "0". */
export function formatSignedInk(n: number): string {
  if (n > 0) return `+${formatInk(n)}`;
  if (n < 0) return `${MINUS}${formatInk(-n)}`;
  return formatInk(0);
}

/** IST calendar day key "YYYY-MM-DD" for grouping. */
export function istDayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Day header: Today / Yesterday (IST) / "12 Oct 2026". */
export function inkDayLabel(iso: string, now: Date = new Date()): string {
  const key = istDayKey(iso);
  if (key === istDayKey(now.toISOString())) return PAYMENT_COPY.today;
  if (key === istDayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())) {
    return PAYMENT_COPY.yesterday;
  }
  return formatInvoiceDate(iso);
}

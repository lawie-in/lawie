'use client';

/**
 * T-646 §3: Raise a concern on one payment, and the read-only View of a concern already sent.
 *
 * - ui/Dialog (bottom sheet ≤ 640, centred 440 above); the description names the payment so the
 *   user never files against the wrong row.
 * - Reason: required, no default; the five codes in Ajay's M1 order and wording.
 * - Note: 500 characters max with a live counter; required only for "Something else".
 * - Beside the form: Ajay's M3 response times and the M11 Grievance Officer line (AJ-646-M4).
 * - POST /api/billing/payments/:id/concerns { reason, note } → 201 { concern }. Server text never
 *   reaches the user: each refusal maps to a line in paymentCopy.ts. The form keeps its values on
 *   failure; Escape and the scrim do nothing while submitting (Dialog confirmLoading).
 * - Nothing typed here is logged.
 */
import * as RadixDialog from '@radix-ui/react-dialog';
import { useEffect, useId, useState } from 'react';

import {
  CONCERN_NOTE_MAX,
  CONCERN_REASONS,
  PAYMENT_COPY,
  formatIstDateTime,
  type ConcernReason,
} from '@/components/billing/paymentCopy';
import { grievanceLine } from '@/components/marketing/nl-copy';
import {
  Button,
  DIALOG_OVERLAY_CLASS,
  DIALOG_SHEET_CLASS,
  Dialog,
  Textarea,
} from '@/components/ui';
import { apiFetch } from '@/lib/apiFetch';
import { cn } from '@/lib/cn';

export interface PaymentConcern {
  id: string;
  status: string;
  reference: string;
  /** Present when the API returns them (e.g. the 201 body); the list gives id/status/reference. */
  reason?: ConcernReason;
  note?: string;
  createdAt?: string;
}

/** What the dialog shows about the payment (already formatted by the row). */
export interface ConcernPaymentSummary {
  id: string;
  purpose: string;
  amount: string;
  date: string;
}

/** Keeps a well-formed concern; null otherwise. */
export function parseConcern(raw: unknown): PaymentConcern | null {
  const c = (raw ?? null) as Record<string, unknown> | null;
  if (!c || typeof c !== 'object') return null;
  if (typeof c.id !== 'string' || typeof c.status !== 'string' || typeof c.reference !== 'string') {
    return null;
  }
  const out: PaymentConcern = { id: c.id, status: c.status, reference: c.reference };
  if (typeof c.reason === 'string' && (CONCERN_REASONS as readonly string[]).includes(c.reason)) {
    out.reason = c.reason as ConcernReason;
  }
  if (typeof c.note === 'string') out.note = c.note;
  if (typeof c.createdAt === 'string') out.createdAt = c.createdAt;
  return out;
}

/** The refusal line for a POST status (never the server's text). */
export function concernErrorFor(status: number): string {
  switch (status) {
    case 400:
      return PAYMENT_COPY.errorInvalid;
    case 404:
      return PAYMENT_COPY.errorNotFound;
    case 409:
      return PAYMENT_COPY.errorOpenConcern;
    case 429:
      return PAYMENT_COPY.errorTooMany;
    default:
      return PAYMENT_COPY.errorGeneric;
  }
}

/** AJ-646-M3 + AJ-646-M4 (the M11 line, imported): shown beside the concern flow. */
export function ConcernPolicyLines({ className }: { className?: string }) {
  const g = grievanceLine();
  return (
    <div className={cn('gap-nl-1 flex flex-col', className)}>
      <p className="nl-body-sm text-nl-muted">{PAYMENT_COPY.responseTimes}</p>
      <p className="nl-body-sm text-nl-muted">
        {g.before}
        <a
          href={`mailto:${g.email}`}
          className="nl-focus text-nl-brass-dark underline underline-offset-4"
        >
          {g.email}
        </a>
        {g.after}
      </p>
    </div>
  );
}

const SELECT_CLASS =
  'nl-focus nl-body min-h-[44px] w-full rounded-nl-sm border border-[color:var(--line-control)] bg-nl-card px-nl-3 text-nl-text';

export interface RaiseConcernDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: ConcernPaymentSummary;
  /** 201: the concern as returned (or built from what was sent when the body is short). */
  onSubmitted: (concern: PaymentConcern) => void;
  /** 404 / 409: the row is stale; the list should reload. */
  onStale?: () => void;
  /** Return focus to the row's button (design: focus returns to Raise a concern). */
  onCloseAutoFocus?: (event: Event) => void;
}

export function RaiseConcernDialog({
  open,
  onOpenChange,
  payment,
  onSubmitted,
  onStale,
  onCloseAutoFocus,
}: RaiseConcernDialogProps) {
  const uid = useId();
  const reasonId = `${uid}-reason`;
  const reasonErrorId = `${uid}-reason-error`;
  const noteId = `${uid}-note`;
  const [reason, setReason] = useState<ConcernReason | ''>('');
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A fresh form each time the dialog opens for a payment.
  useEffect(() => {
    if (!open) return;
    setReason('');
    setNote('');
    setSubmitted(false);
    setSending(false);
    setError(null);
  }, [open, payment.id]);

  const noteRequired = reason === 'other';
  const reasonError = submitted && reason === '' ? PAYMENT_COPY.errorChooseReason : undefined;
  const noteError = !submitted
    ? undefined
    : note.length > CONCERN_NOTE_MAX
      ? PAYMENT_COPY.errorNoteTooLong
      : noteRequired && note.trim() === ''
        ? PAYMENT_COPY.errorNoteRequired
        : undefined;

  async function submit() {
    if (sending) return;
    setSubmitted(true);
    setError(null);
    const trimmed = note.trim();
    if (
      reason === '' ||
      trimmed.length > CONCERN_NOTE_MAX ||
      (reason === 'other' && trimmed === '')
    ) {
      return;
    }
    setSending(true);
    try {
      const res = await apiFetch(
        `/api/billing/payments/${encodeURIComponent(payment.id)}/concerns`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason, note: trimmed }),
        },
      );
      if (res.status === 201 || res.ok) {
        const body = (await res.json().catch(() => null)) as { concern?: unknown } | null;
        const parsed = parseConcern(body?.concern);
        const concern: PaymentConcern = parsed
          ? { reason, note: trimmed, ...parsed }
          : { id: '', status: 'open', reference: '', reason, note: trimmed };
        setSending(false);
        onSubmitted(concern);
        onOpenChange(false);
        return;
      }
      // Status only, never the body (it could echo the note).
      console.error('[payments] concern refused:', res.status);
      setError(concernErrorFor(res.status));
      setSending(false);
      if (res.status === 404 || res.status === 409) onStale?.();
    } catch (err) {
      console.error('[payments] concern failed:', err instanceof Error ? err.name : 'error');
      setError(PAYMENT_COPY.errorGeneric);
      setSending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={PAYMENT_COPY.dialogTitle}
      description={PAYMENT_COPY.dialogAbout(payment.purpose, payment.amount, payment.date)}
      confirmLabel={PAYMENT_COPY.submit}
      cancelLabel={PAYMENT_COPY.cancel}
      onConfirm={() => void submit()}
      confirmLoading={sending}
      error={error}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="gap-nl-4 flex flex-col"
      >
        <div className="gap-nl-1 flex flex-col">
          <label htmlFor={reasonId} className="nl-body-sm text-nl-soft font-medium">
            {PAYMENT_COPY.reasonLabel}
          </label>
          <select
            id={reasonId}
            value={reason}
            required
            disabled={sending}
            aria-invalid={reasonError ? true : undefined}
            aria-describedby={reasonError ? reasonErrorId : undefined}
            onChange={(e) => setReason(e.target.value as ConcernReason | '')}
            className={cn(SELECT_CLASS, reasonError && 'border-nl-err')}
          >
            <option value="" disabled>
              {PAYMENT_COPY.reasonPlaceholder}
            </option>
            {CONCERN_REASONS.map((code) => (
              <option key={code} value={code}>
                {PAYMENT_COPY.reasons[code]}
              </option>
            ))}
          </select>
          {reasonError ? (
            <p id={reasonErrorId} className="nl-body-sm text-nl-err">
              {reasonError}
            </p>
          ) : null}
        </div>

        <div className="gap-nl-1 flex flex-col">
          <Textarea
            id={noteId}
            label={PAYMENT_COPY.noteLabel}
            help={PAYMENT_COPY.noteHint}
            error={noteError}
            rows={3}
            maxLength={CONCERN_NOTE_MAX}
            required={noteRequired}
            disabled={sending}
            placeholder={noteRequired ? undefined : PAYMENT_COPY.notePlaceholderOptional}
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, CONCERN_NOTE_MAX))}
            className="max-[640px]:min-h-[8.5rem]"
          />
          <p className="nl-body-sm text-nl-muted self-end tabular-nums" aria-live="polite">
            {PAYMENT_COPY.noteCounter(note.length)}
          </p>
        </div>

        <ConcernPolicyLines />
      </form>
    </Dialog>
  );
}

export interface ConcernViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: ConcernPaymentSummary;
  concern: PaymentConcern;
  statusLabel: string;
  onCloseAutoFocus?: (event: Event) => void;
}

/**
 * The read-only View (design §3). One Close button, so built on Radix with ui/Dialog's exported
 * overlay and sheet classes rather than ui/Dialog (which always has two buttons).
 */
export function ConcernViewDialog({
  open,
  onOpenChange,
  payment,
  concern,
  statusLabel,
  onCloseAutoFocus,
}: ConcernViewDialogProps) {
  const rows: { term: string; value: string }[] = [];
  if (concern.reference) rows.push({ term: PAYMENT_COPY.viewReference, value: concern.reference });
  rows.push({ term: PAYMENT_COPY.viewStatus, value: statusLabel });
  if (concern.reason)
    rows.push({ term: PAYMENT_COPY.viewReason, value: PAYMENT_COPY.reasons[concern.reason] });
  if (concern.note) rows.push({ term: PAYMENT_COPY.viewNote, value: concern.note });
  if (concern.createdAt) {
    const sent = formatIstDateTime(concern.createdAt);
    if (sent) rows.push({ term: PAYMENT_COPY.viewSent, value: sent });
  }

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={DIALOG_OVERLAY_CLASS} />
        <RadixDialog.Content
          onCloseAutoFocus={onCloseAutoFocus}
          className={cn(
            DIALOG_SHEET_CLASS,
            'gap-nl-4 p-nl-6',
            'pb-[calc(var(--space-6)+env(safe-area-inset-bottom,0px))]',
          )}
        >
          <RadixDialog.Title className="nl-h2 text-nl-text">
            {PAYMENT_COPY.viewTitle}
          </RadixDialog.Title>
          <RadixDialog.Description className="nl-body text-nl-soft">
            {PAYMENT_COPY.dialogAbout(payment.purpose, payment.amount, payment.date)}
          </RadixDialog.Description>
          <dl className="gap-nl-3 flex flex-col">
            {rows.map((r) => (
              <div key={r.term} className="gap-nl-1 flex flex-col">
                <dt className="nl-body-sm text-nl-soft font-medium">{r.term}</dt>
                <dd className="nl-body text-nl-text whitespace-pre-wrap break-words">{r.value}</dd>
              </div>
            ))}
          </dl>
          <ConcernPolicyLines />
          <div className="flex justify-end">
            <RadixDialog.Close asChild>
              <Button variant="ghost">{PAYMENT_COPY.close}</Button>
            </RadixDialog.Close>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

'use client';

/**
 * T-705: revise a delivered draft (one free revision per draft, then the original draft's Ink).
 *
 * Strings: Ajay, signed 30 Oct 2026 (handoff/legal/T-703-T-705-signoff-ajay.md (b)), byte for
 * byte; Cancel is the document dialog's (DeleteDocumentDialog); the failure lines are the signed
 * generation lines (generationFailure.ts). No Ink is taken until the revision is delivered; the
 * cost line shows before Revise.
 *
 * POST /api/documents/<id>/revise (gateway → drafting) with {note, expected_ink}; the SSE is read
 * with the generate reader (lib/generateStream). On `done` the page reloads the document.
 * The note is never logged.
 */
import { useId, useState } from 'react';

import { PaywallModal } from '@/components/credits/PaywallModal';
import { DELETE_DIALOG_TEXT } from '@/components/documents/DeleteDocumentDialog';
import {
  DRAFT_DID_NOT_FINISH,
  FACT_QUESTION_CODES,
  INSUFFICIENT_INK_CODE,
  SOMETHING_DID_NOT_WORK,
} from '@/components/intake/generationFailure';
import { Dialog, formatInk } from '@/components/ui';
import { openVerifyInsteadOfPaywall } from '@/components/VerifyEmailPrompt';
import { notifyCreditsChanged } from '@/hooks/useCredits';
import { apiFetch } from '@/lib/apiFetch';
import { readSseEvents } from '@/lib/generateStream';

export const REVISE_COPY = {
  title: 'Revise this draft',
  noteLabel: 'What should change?',
  free: 'Your first revision of this draft is free.',
  costs: (n: string) => `This revision costs ${n} Ink.`,
  helper: 'To add new facts, edit the brief first.',
  confirm: 'Revise',
  limit: 'Revision limit reached for this draft (10).',
  cancel: DELETE_DIALOG_TEXT.cancel,
} as const;

/** The note's length on the server (zod, trimmed). */
export const NOTE_MIN = 10;
export const NOTE_MAX = 2000;

export interface ReviseDialogProps {
  documentId: string;
  /** The document's type or title, for the paywall (as OneFlow passes the kind name). */
  documentLabel: string;
  revisions: { count: number; freeUsed: boolean };
  revisionLimit: number;
  /** The original draft's quote; null when the server could not read it. */
  originalInk: number | null;
  /** Closed without a revision. `stale`: the price changed, so the page should reload. */
  onClose: (stale: boolean) => void;
  /** The revision was delivered and saved: reload the document. */
  onRevised: () => void;
  /** Save pending edits first, so the revision starts from them. False: do not start. */
  beforeRevise?: () => Promise<boolean>;
}

/** The Ink the next revision costs: 0 for the first, else the original quote (null: unknown). */
export function nextRevisionInk(count: number, originalInk: number | null): number | null {
  return count === 0 ? 0 : originalInk;
}

export default function ReviseDialog({
  documentId,
  documentLabel,
  revisions,
  revisionLimit,
  originalInk,
  onClose,
  onRevised,
  beforeRevise,
}: ReviseDialogProps) {
  const [note, setNote] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [limitHit, setLimitHit] = useState(revisions.count >= revisionLimit);
  // T-388 / T-521, as OneFlow: a 402 with the server's cost opens the paywall (top-up path).
  const [paywall, setPaywall] = useState<{ cost: number; balance: number } | null>(null);
  const noteId = useId();
  const helperId = useId();

  const ink = nextRevisionInk(revisions.count, originalInk);
  const trimmed = note.trim();
  const noteOk = trimmed.length >= NOTE_MIN && trimmed.length <= NOTE_MAX;
  const blocked = limitHit || stale || ink === null || working;

  const costLine =
    ink === null ? null : ink === 0 ? REVISE_COPY.free : REVISE_COPY.costs(formatInk(ink));

  const revise = async () => {
    if (blocked || !noteOk || ink === null) return;
    setError(null);
    setWorking(true);
    try {
      if (beforeRevise && !(await beforeRevise())) {
        setError(SOMETHING_DID_NOT_WORK);
        return;
      }
      const res = await apiFetch(`/api/documents/${encodeURIComponent(documentId)}/revise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: trimmed, expected_ink: ink }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          cost?: number;
          balance?: { totalInk?: number };
        };
        if (res.status === 402) {
          // T-223 trigger 2: an unverified email user gets the verify modal, not the paywall.
          if (await openVerifyInsteadOfPaywall()) return;
          // T-388: the paywall shows the server's cost, never a made-up one.
          if (typeof data.cost === 'number' && Number.isFinite(data.cost) && data.cost > 0) {
            setPaywall({ cost: data.cost, balance: data.balance?.totalInk ?? 0 });
            return;
          }
          // T-565 W12: a 402 with no cost has no paywall; the generic line.
          setError(SOMETHING_DID_NOT_WORK);
          return;
        }
        if (res.status === 429 && data.error === 'revision_limit') {
          setLimitHit(true);
          return;
        }
        if (res.status === 409 && data.error === 'price_changed') {
          // The price shown is no longer the price: close and reload to show the new line.
          setStale(true);
        }
        setError(SOMETHING_DID_NOT_WORK);
        return;
      }
      if (!res.body) {
        setError(DRAFT_DID_NOT_FINISH);
        return;
      }

      let done = null as Record<string, unknown> | null;
      let failure = null as string | null;
      await readSseEvents(res.body, (event, payload) => {
        if (event === 'error') {
          // As OneFlow (T-521, T-565 W13): the server's reason only for insufficient_ink (the
          // Ink text) and a withheld draft's signed question; otherwise the signed generic line.
          failure =
            typeof payload.code === 'string' &&
            (payload.code === INSUFFICIENT_INK_CODE || FACT_QUESTION_CODES.has(payload.code)) &&
            typeof payload.reason === 'string' &&
            payload.reason !== ''
              ? payload.reason
              : DRAFT_DID_NOT_FINISH;
          return false;
        }
        if (event === 'done') done = payload;
      });
      if (failure !== null || !done) {
        setError(failure ?? DRAFT_DID_NOT_FINISH);
        return;
      }
      const totalInk = (done.balance as { totalInk?: unknown } | undefined)?.totalInk;
      if (typeof totalInk === 'number' && Number.isFinite(totalInk)) {
        notifyCreditsChanged({ totalInk });
      } else {
        notifyCreditsChanged();
      }
      onRevised();
    } catch {
      setError(DRAFT_DID_NOT_FINISH);
    } finally {
      setWorking(false);
    }
  };

  if (paywall) {
    return (
      <PaywallModal
        documentLabel={documentLabel}
        cost={paywall.cost}
        balance={paywall.balance}
        onClose={() => setPaywall(null)}
      />
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !working) onClose(stale);
      }}
      title={REVISE_COPY.title}
      confirmLabel={REVISE_COPY.confirm}
      cancelLabel={REVISE_COPY.cancel}
      onConfirm={() => void revise()}
      confirmLoading={working}
      error={limitHit ? REVISE_COPY.limit : error}
    >
      <div className="gap-nl-2 flex flex-col">
        <label htmlFor={noteId} className="nl-body text-nl-text font-medium">
          {REVISE_COPY.noteLabel}
        </label>
        <textarea
          id={noteId}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={NOTE_MAX}
          rows={5}
          disabled={working || limitHit}
          aria-describedby={helperId}
          className="nl-body border-nl-line bg-nl-card text-nl-text rounded-nl-sm p-nl-3 nl-focus w-full border"
        />
        <p id={helperId} className="nl-body-sm text-nl-muted">
          {REVISE_COPY.helper}
        </p>
        {costLine && !limitHit && <p className="nl-body text-nl-text">{costLine}</p>}
      </div>
    </Dialog>
  );
}

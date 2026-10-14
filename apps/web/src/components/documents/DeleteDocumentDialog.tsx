'use client';

import { AlertCircle, Loader2, Trash2 } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useModalFocus } from '@/hooks/useModalFocus';
import { apiFetch } from '@/lib/apiFetch';

/**
 * T-115b — confirm and delete one document (Rajesh's spec
 * handoff/marketing/delete-document-spec-t115b.md §2-3, where it is called
 * ConfirmDeleteDialog). Shared by the My documents list and the document page.
 *
 * Mount it to open it; the parent unmounts it on `onClose` / `onDeleted`. It calls
 * `DELETE /api/documents/:id` itself:
 * - 200, or 404 (already gone): `onDeleted('deleted')`;
 * - 202 `{ status: 'pending' }` (hidden, the server finishes the erase):
 *   `onDeleted('pending')`. The caller shows "Deleting the document.", never
 *   "Document deleted." (Ajay's condition 1: "deleted" only once every part is erased);
 * - anything else, or no answer: the dialog stays open with the signed error line, and
 *   Delete can be pressed again.
 * After `onDeleted` focus is the caller's to move (the opener may be gone); after
 * `onClose` it returns to the opener.
 *
 * The text below is Ajay's, signed 14 Oct 2026 (handoff/legal/dpdp-v1-calls-signed.md).
 * Do not reword. The title may hold a client's name: it is shown, never logged or sent
 * to analytics.
 */

export type DeleteOutcome = 'deleted' | 'pending';

export const DELETE_DIALOG_TEXT = {
  title: 'Delete this document?',
  body: 'This deletes the document and everything in it, including its drafts and annexures. You cannot undo this. Ink used on it is not refunded.',
  backups: 'Backup copies are erased within 7 days.',
  confirm: 'Delete document',
  cancel: 'Cancel',
  working: 'Deleting...',
  workingStatus: 'Deleting the document.',
  error:
    "We couldn't finish deleting this document. Please try again. If this keeps happening, write to us at privacy@lawie.in.",
} as const;

/** The status line the list shows after the dialog closes (Madhuri's strings, T-115 section A). */
export const DELETE_STATUS_TEXT: Record<DeleteOutcome, string> = {
  deleted: 'Document deleted.',
  pending: 'Deleting the document.',
};

// The document page navigates to the list after a delete; the list reads the outcome
// once, to show the status line. The outcome only: never the id or the title.
const OUTCOME_KEY = 'lawie:document-delete-outcome';

export function rememberDeleteOutcome(outcome: DeleteOutcome): void {
  try {
    window.sessionStorage.setItem(OUTCOME_KEY, outcome);
  } catch {
    // Storage blocked: the list simply shows no status line.
  }
}

export function takeDeleteOutcome(): DeleteOutcome | null {
  try {
    const v = window.sessionStorage.getItem(OUTCOME_KEY);
    window.sessionStorage.removeItem(OUTCOME_KEY);
    return v === 'deleted' || v === 'pending' ? v : null;
  } catch {
    return null;
  }
}

export default function DeleteDocumentDialog({
  documentId,
  title,
  onClose,
  onDeleted,
  fallbackFocusRef,
}: {
  documentId: string;
  title: string;
  /** Cancel, Escape or the backdrop. Not called while the delete is running. */
  onClose: () => void;
  onDeleted: (outcome: DeleteOutcome) => void;
  /** Where focus returns on close when the opener is gone. */
  fallbackFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  const workingRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  const close = () => {
    if (workingRef.current) return;
    onClose();
  };

  const { skipReturnFocus } = useModalFocus({
    containerRef: dialogRef,
    initialFocusRef: cancelRef,
    onEscape: close,
    fallbackFocusRef,
    lockPage: true,
  });

  const handleDelete = async () => {
    if (workingRef.current) return;
    workingRef.current = true;
    setWorking(true);
    setFailed(false);
    let outcome: DeleteOutcome | null = null;
    try {
      const res = await apiFetch(`/api/documents/${encodeURIComponent(documentId)}`, {
        method: 'DELETE',
      });
      if (res.status === 200 || res.status === 404) outcome = 'deleted';
      else if (res.status === 202) outcome = 'pending';
    } catch {
      // No answer: the error line below. Nothing is logged (the error may name the URL).
    }
    workingRef.current = false;
    if (outcome) {
      skipReturnFocus();
      onDeleted(outcome);
      return;
    }
    setWorking(false);
    setFailed(true);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      onClick={close}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl sm:max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="font-heading text-brand-navy text-xl font-semibold">
          {DELETE_DIALOG_TEXT.title}
        </h2>
        <p className="text-brand-muted mt-2 break-words text-sm">{title}</p>
        <div id={bodyId} className="text-brand-navy mt-3 space-y-2 text-base">
          <p>{DELETE_DIALOG_TEXT.body}</p>
          <p>{DELETE_DIALOG_TEXT.backups}</p>
        </div>

        {failed && (
          <p
            role="alert"
            className="bg-brand-error-light text-brand-error mt-4 flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{DELETE_DIALOG_TEXT.error}</span>
          </p>
        )}

        <p role="status" className="sr-only">
          {working ? DELETE_DIALOG_TEXT.workingStatus : ''}
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={close}
            disabled={working}
            className="border-brand-navy text-brand-navy focus-visible:ring-brand-teal inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg border bg-white px-4 text-sm font-medium focus:outline-none focus-visible:ring-2 disabled:opacity-40 sm:w-auto"
          >
            {DELETE_DIALOG_TEXT.cancel}
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            aria-disabled={working ? 'true' : undefined}
            className="bg-brand-error focus-visible:ring-brand-teal inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg px-6 text-base font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 aria-disabled:cursor-not-allowed sm:w-auto sm:min-w-[12rem]"
          >
            {working ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 size={16} aria-hidden="true" />
            )}
            {working ? DELETE_DIALOG_TEXT.working : DELETE_DIALOG_TEXT.confirm}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

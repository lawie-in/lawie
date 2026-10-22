'use client';

import { AlertCircle, Loader2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { input as inputClass, label as labelClass } from '@/components/intake/ui';
import { useModalFocus } from '@/hooks/useModalFocus';
import { apiFetch } from '@/lib/apiFetch';
import { clearAllLocalState } from '@/lib/auth';

/**
 * T-115c — confirm closing the account and erasing it (Rajesh's spec
 * handoff/marketing/close-account-spec-t115c.md §2-4). Mount it to open it; the Settings
 * page unmounts it on `onClose`.
 *
 * It reads GET /api/auth/me for `hasPassword`: password accounts re-prove with the password,
 * Google-only accounts by typing their email (Arjun's decision 3). Then DELETE /api/auth/me:
 * - 200 `{ status: 'done' }`: every part is erased. Clear everything this browser stored and
 *   go to the public /account-closed page.
 * - 202 `{ status: 'pending' }`: the account is locked and signed out, and the server finishes
 *   the erase. Shows Ajay's signed partial-failure line. On dismiss, clears local state and
 *   goes to the home page, NOT /account-closed: "closed" may show only once every part of the
 *   erase is done (Ajay's condition 1, dpdp-v1-calls-signed.md).
 * - 403 `wrong_password`: "Nothing was changed" is true, the server refuses before any write.
 * - 403 `reauth_required` (Google-only, sign-in older than 15 minutes): the generic line plus
 *   "Sign in again, then try once more."
 * - 409 `subscription_active`: no cancel path exists, so Arjun's fallback line, no link.
 * - anything else, or no answer: the generic line; the button works again.
 * apiFetch refreshes only on 401, and every refusal above is 403, 409 or 503, so it is safe.
 *
 * Dialog title, body and buttons are Ajay's, signed 14 Oct 2026; the partial-failure line is
 * his, signed 14 Oct 2026 (b26b017, which replaced 1a842e1's line). Other strings are Madhuri's (dpdp-ui-strings-t115.md B).
 * Do not reword. The password and email are never logged or stored.
 */
export const CLOSE_DIALOG_TEXT = {
  title: 'Close your account and erase your data?',
  body: 'This erases your account, your profile and every document you have created on Lawie. Any unused Ink and any active plan end now and are not refunded. We keep payment and invoice records for as long as tax law requires. You cannot undo this.',
  backups: 'Backup copies are erased within 7 days.',
  confirm: 'Close account and erase',
  cancel: 'Cancel',
  passwordLabel: 'Your password',
  passwordHelp: 'Enter your password to confirm it is you.',
  emailLabel: 'Type your email address',
  emailHelp: 'Type the email address you sign in with, to confirm it is you.',
  working: 'Closing...',
  workingStatus: 'Closing your account. Please wait.',
  wrongPassword: 'That password is not right. Nothing was changed.',
  wrongEmail: 'That email address does not match. Nothing was changed.',
  planActive: 'Cancel your plan first.',
  planActiveHow: 'Write to contact@lawie.in to cancel.',
  generic: 'We could not close your account. Try again.',
  signInAgain: 'Sign in again, then try once more.',
  partial:
    "We couldn't finish erasing your data. Your account is closed and you have been signed out. We will finish erasing it; if you have any questions, write to us at contact@lawie.in.",
} as const;

type ErrorKind = 'wrong' | 'reauth' | 'plan' | 'generic' | 'partial';

/** GET /api/auth/me → hasPassword. Null when it cannot be read. */
async function fetchHasPassword(): Promise<boolean | null> {
  try {
    const res = await apiFetch('/api/auth/me', { cache: 'no-store' });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { hasPassword?: unknown } };
    const v = body?.data?.hasPassword;
    return typeof v === 'boolean' ? v : null;
  } catch {
    return null;
  }
}

async function errorCode(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { error?: unknown };
    return typeof body?.error === 'string' ? body.error : null;
  } catch {
    return null;
  }
}

export default function ConfirmCloseAccountDialog({
  onClose,
  fallbackFocusRef,
}: {
  /** Cancel, Escape or the backdrop. Not called while closing is running. */
  onClose: () => void;
  /** Where focus returns on close when the opener is gone (the Close account button). */
  fallbackFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [meFailed, setMeFailed] = useState(false);
  const [value, setValue] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<ErrorKind | null>(null);
  const workingRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const fieldId = useId();
  const helpId = useId();
  const errorId = useId();

  useEffect(() => {
    let live = true;
    void fetchHasPassword().then((v) => {
      if (!live) return;
      if (v === null) setMeFailed(true);
      else setHasPassword(v);
    });
    return () => {
      live = false;
    };
  }, []);

  const finishPending = () => {
    skipReturnFocus();
    clearAllLocalState();
    window.location.replace('/');
  };

  const close = () => {
    if (workingRef.current) return;
    if (error === 'partial') {
      finishPending();
      return;
    }
    setValue('');
    onClose();
  };

  const { skipReturnFocus } = useModalFocus({
    containerRef: dialogRef,
    initialFocusRef: cancelRef,
    onEscape: close,
    fallbackFocusRef,
    lockPage: true,
  });

  const filled = value.trim().length > 0;
  // After a 409 the button stays off until the dialog is reopened (spec §3).
  const blocked =
    working || !filled || hasPassword === null || error === 'plan' || error === 'partial';

  const handleClose = async () => {
    if (workingRef.current || blocked) return;
    workingRef.current = true;
    setWorking(true);
    setError(null);
    let next: ErrorKind | null = 'generic';
    try {
      const res = await apiFetch('/api/auth/me', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hasPassword ? { password: value } : { email: value.trim() }),
      });
      if (res.status === 200) {
        workingRef.current = false;
        skipReturnFocus();
        clearAllLocalState();
        window.location.replace('/account-closed');
        return;
      }
      if (res.status === 202) next = 'partial';
      else if (res.status === 409) next = 'plan';
      else if (res.status === 403) {
        const code = await errorCode(res);
        if (code === 'wrong_password') next = 'wrong';
        else if (code === 'reauth_required') next = 'reauth';
      }
    } catch {
      // No answer: the generic line. Nothing is logged.
    }
    workingRef.current = false;
    setWorking(false);
    if (next === 'partial') setValue('');
    setError(next);
  };

  const errorLines: string[] =
    error === 'wrong'
      ? [hasPassword ? CLOSE_DIALOG_TEXT.wrongPassword : CLOSE_DIALOG_TEXT.wrongEmail]
      : error === 'reauth'
        ? [CLOSE_DIALOG_TEXT.generic, CLOSE_DIALOG_TEXT.signInAgain]
        : error === 'plan'
          ? [CLOSE_DIALOG_TEXT.planActive, CLOSE_DIALOG_TEXT.planActiveHow]
          : error === 'partial'
            ? [CLOSE_DIALOG_TEXT.partial]
            : error === 'generic' || meFailed
              ? [CLOSE_DIALOG_TEXT.generic]
              : [];

  const showField = hasPassword !== null && error !== 'partial';
  const fieldInvalid = error === 'wrong';

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
        className="max-h-[90dvh] max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-xl bg-white p-6 shadow-2xl supports-[height:100dvh]:max-h-[90dvh] sm:max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="font-heading text-brand-navy text-xl font-semibold">
          {CLOSE_DIALOG_TEXT.title}
        </h2>
        <div id={bodyId} className="text-brand-navy mt-3 space-y-2 text-base">
          <p>{CLOSE_DIALOG_TEXT.body}</p>
          <p>{CLOSE_DIALOG_TEXT.backups}</p>
        </div>

        {showField && (
          <div className="mt-4">
            <label htmlFor={fieldId} className={labelClass}>
              {hasPassword ? CLOSE_DIALOG_TEXT.passwordLabel : CLOSE_DIALOG_TEXT.emailLabel}
            </label>
            <p id={helpId} className="text-brand-muted mt-1 text-sm">
              {hasPassword ? CLOSE_DIALOG_TEXT.passwordHelp : CLOSE_DIALOG_TEXT.emailHelp}
            </p>
            <input
              id={fieldId}
              type={hasPassword ? 'password' : 'email'}
              autoComplete={hasPassword ? 'current-password' : 'off'}
              value={value}
              disabled={working}
              onChange={(e) => {
                setValue(e.target.value);
                if (error === 'wrong') setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (filled) void handleClose();
                }
              }}
              aria-invalid={fieldInvalid ? 'true' : undefined}
              aria-describedby={fieldInvalid ? `${helpId} ${errorId}` : helpId}
              className={`${inputClass} mt-2`}
            />
          </div>
        )}

        {errorLines.length > 0 && (
          <div
            id={errorId}
            role="alert"
            className="bg-brand-error-light text-brand-error mt-4 flex items-start gap-2 rounded-lg px-3 py-2 text-sm"
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div className="space-y-1">
              {errorLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
        )}

        <p role="status" className="sr-only">
          {working ? CLOSE_DIALOG_TEXT.workingStatus : ''}
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={close}
            disabled={working}
            className="border-brand-navy text-brand-navy focus-visible:ring-brand-teal inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg border bg-white px-4 text-sm font-medium focus:outline-none focus-visible:ring-2 disabled:opacity-40 sm:w-auto"
          >
            {CLOSE_DIALOG_TEXT.cancel}
          </button>
          {error !== 'partial' && (
            <button
              type="button"
              onClick={() => void handleClose()}
              aria-disabled={blocked ? 'true' : undefined}
              className="bg-brand-error focus-visible:ring-brand-teal inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg px-6 text-base font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-60 sm:w-auto"
            >
              {working && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              {working ? CLOSE_DIALOG_TEXT.working : CLOSE_DIALOG_TEXT.confirm}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

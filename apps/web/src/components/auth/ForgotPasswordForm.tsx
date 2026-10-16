'use client';

/**
 * T-221 — /forgot-password. Rajesh's states F1-F6:
 *   F1 default · F2 invalid format (client only) · F3 sending · F4 sent (the same for every
 *   outcome, known email or not, AC1) · F5 rate limited (429, minutes from Retry-After) ·
 *   F6 network / 5xx / 15 s timeout, with "Try again".
 * Copy: handoff/marketing/copy/forgot-password-t221.md (screen 1), signed by Ajay
 * (handoff/legal/T-221-forgot-password-signed.md); lines that file lacks come from the ticket's
 * "Copy (Madhuri, final)" Screen 1 table. Every user-facing string is in FORGOT_STRINGS.
 * The typed email is only echoed on the page; it is never logged or stored.
 */
import { AlertTriangle, Loader2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';

export const FORGOT_STRINGS = {
  title: 'Reset your password',
  sub: "Enter the email you use for Lawie. We'll send you a link to set a new password.",
  label: 'Email address',
  placeholder: 'you@example.com',
  cta: 'Send reset link',
  ctaLoading: 'Sending...',
  back: 'Back to sign in',
  errEmpty: 'Enter your email address.',
  errFormat: 'Enter a full email address, like you@example.com.',
  sentTitle: 'Check your email',
  /** `{email}` is replaced with the address the user typed. */
  sentBody:
    "If {email} has a Lawie account, we've sent it an email. It works once and expires in 30 minutes.",
  sentSpam: 'Not there? Check Spam and Promotions.',
  sentSecondary: 'Use a different email',
  /** `{n}` is replaced with the minutes from Retry-After (2 or more). */
  limit: 'Too many requests. Please wait {n} minutes, then try again.',
  limitOne: 'Too many requests. Please wait 1 minute, then try again.',
  limitUnknown: 'Too many requests. Please wait a few minutes, then try again.',
  network: "We couldn't reach Lawie. Check your connection and try again.",
  networkCta: 'Try again',
} as const;

const S = FORGOT_STRINGS;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REQUEST_TIMEOUT_MS = 15_000;

type Phase =
  | { kind: 'form' }
  | { kind: 'sending' }
  | { kind: 'sent'; email: string }
  | { kind: 'limited'; minutes: number | null }
  | { kind: 'error' };

function retryMinutes(res: Response, body: unknown): number | null {
  const header = Number(res.headers.get('Retry-After'));
  const fromBody = Number((body as { retryAfter?: unknown } | null)?.retryAfter);
  const seconds = Number.isFinite(header) && header > 0 ? header : fromBody;
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.max(1, Math.ceil(seconds / 60));
}

export function limitMessage(minutes: number | null): string {
  if (minutes === null) return S.limitUnknown;
  if (minutes === 1) return S.limitOne;
  return S.limit.replace('{n}', String(minutes));
}

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'form' });
  const inFlight = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (phase.kind === 'sent') headingRef.current?.focus();
    if (phase.kind === 'limited' || phase.kind === 'error') alertRef.current?.focus();
  }, [phase.kind]);

  async function submit() {
    if (inFlight.current) return; // ignore double submits
    const trimmed = email.trim();
    if (!trimmed) {
      setFieldError(S.errEmpty);
      inputRef.current?.focus();
      return;
    }
    if (!EMAIL_RE.test(trimmed)) {
      setFieldError(S.errFormat);
      inputRef.current?.focus();
      return;
    }
    setFieldError(null);
    inFlight.current = true;
    setPhase({ kind: 'sending' });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
        signal: controller.signal,
        cache: 'no-store',
      });
      if (res.ok) {
        setPhase({ kind: 'sent', email: trimmed });
      } else if (res.status === 429) {
        const body: unknown = await res.json().catch(() => null);
        setPhase({ kind: 'limited', minutes: retryMinutes(res, body) });
      } else if (res.status === 400) {
        // The server's format check disagreed with ours: same line as F2.
        setFieldError(S.errFormat);
        setPhase({ kind: 'form' });
      } else {
        setPhase({ kind: 'error' });
      }
    } catch {
      setPhase({ kind: 'error' });
    } finally {
      clearTimeout(timer);
      inFlight.current = false;
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submit();
  }

  function backToForm() {
    setPhase({ kind: 'form' });
    // The field keeps the typed address; focus it so the user can edit.
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  const sending = phase.kind === 'sending';

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50 px-4 pb-6 pt-4 sm:py-12">
      <Link href="/" className="mb-6 sm:mb-8">
        <Image
          src="/assets/lawie-lockup.png"
          alt="Lawie"
          width={210}
          height={48}
          className="h-12 w-auto sm:h-14"
          priority
        />
      </Link>

      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl shadow-slate-200/60">
        <div className="p-5 sm:p-8">
          {phase.kind === 'sent' ? (
            <div>
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="text-xl font-bold text-slate-900 focus:outline-none sm:text-2xl"
              >
                {S.sentTitle}
              </h1>
              <p className="mt-3 break-words text-base text-slate-700">
                {S.sentBody.split('{email}')[0]}
                <span className="font-semibold text-slate-900">{phase.email}</span>
                {S.sentBody.split('{email}')[1]}
              </p>
              <p className="mt-3 text-sm text-slate-600">{S.sentSpam}</p>
              <button
                type="button"
                onClick={backToForm}
                className="text-lawie-600 hover:text-lawie-700 mt-5 inline-flex min-h-11 items-center text-sm font-semibold hover:underline"
              >
                {S.sentSecondary}
              </button>
              <div className="mt-2">
                <Link
                  href="/login"
                  className="text-lawie-600 hover:text-lawie-700 inline-flex min-h-11 items-center text-sm font-medium hover:underline"
                >
                  {S.back}
                </Link>
              </div>
            </div>
          ) : (
            <form noValidate onSubmit={onSubmit}>
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="text-xl font-bold text-slate-900 focus:outline-none sm:text-2xl"
              >
                {S.title}
              </h1>
              <p className="mt-1 text-sm text-slate-600">{S.sub}</p>

              <div className="mt-5">
                <label
                  htmlFor="forgot-email"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  {S.label}
                </label>
                <input
                  ref={inputRef}
                  id="forgot-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder={S.placeholder}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldError) setFieldError(null);
                  }}
                  disabled={sending}
                  aria-invalid={fieldError ? true : undefined}
                  aria-describedby={fieldError ? 'forgot-email-error' : undefined}
                  className={`focus:ring-lawie-600 h-12 w-full rounded-xl border bg-white px-4 text-base text-slate-900 transition placeholder:text-slate-500 focus:outline-none focus:ring-2 sm:text-sm ${
                    fieldError ? 'border-red-700' : 'border-slate-500'
                  }`}
                />
                {fieldError && (
                  <p id="forgot-email-error" className="mt-1.5 text-sm text-red-700">
                    {fieldError}
                  </p>
                )}
              </div>

              {phase.kind === 'limited' && (
                <div
                  ref={alertRef}
                  role="alert"
                  tabIndex={-1}
                  className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-700"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <p>{limitMessage(phase.minutes)}</p>
                </div>
              )}

              {phase.kind === 'error' && (
                <div
                  ref={alertRef}
                  role="alert"
                  tabIndex={-1}
                  className="mt-4 flex items-start gap-2.5 rounded-xl bg-red-50 p-4 text-sm text-red-700 focus:outline-none focus:ring-2 focus:ring-red-700"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <div>
                    <p>{S.network}</p>
                    <button
                      type="button"
                      onClick={() => void submit()}
                      className="mt-2 inline-flex min-h-11 items-center font-semibold underline hover:text-red-900"
                    >
                      {S.networkCta}
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={sending}
                aria-busy={sending || undefined}
                className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-base font-semibold text-white transition hover:bg-slate-700 active:scale-[0.98] disabled:opacity-60"
              >
                {sending && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
                {sending ? S.ctaLoading : S.cta}
              </button>

              <div className="mt-4 text-center">
                <Link
                  href="/login"
                  className="text-lawie-600 hover:text-lawie-700 inline-flex min-h-11 items-center text-sm font-medium hover:underline"
                >
                  {S.back}
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

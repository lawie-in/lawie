'use client';

/**
 * T-221 — /reset-password/[token]. Rajesh's states R1-R5:
 *   (check on load: GET /api/auth/reset-password/<token>; an invalid link goes straight to R5)
 *   R1 one password field, show/hide, live 4-rule checklist (grey idle, green met, red only
 *      after a submit attempt) · R2 weak (client check, or the server's 422 mapped to the rule
 *      lines; never the validator's raw text) · R3 saving · R4 success (no auto sign-in) ·
 *   R5 expired, used or malformed link.
 * Copy: handoff/marketing/copy/forgot-password-t221.md (screen 2), signed by Ajay
 * (handoff/legal/T-221-forgot-password-signed.md); every user-facing string is in RESET_STRINGS.
 * The token is read from the URL and only ever sent to the API; it is never rendered.
 */
import { AlertTriangle, CheckCircle2, Circle, Eye, EyeOff, Loader2, XCircle } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';

export const RESET_STRINGS = {
  title: 'Set a new password',
  label: 'New password',
  show: 'Show password',
  hide: 'Hide password',
  ruleMinLength: 'At least 8 characters',
  ruleUppercase: 'One capital letter (A-Z)',
  ruleLowercase: 'One small letter (a-z)',
  ruleNumber: 'One number (0-9)',
  ruleMet: '(done)',
  ruleUnmet: '(not yet)',
  errShort: 'Use at least 8 characters to continue.',
  errUpper: 'Add a capital letter to continue.',
  errLower: 'Add a small letter to continue.',
  errNumber: 'Add a number to continue.',
  errSeveral: 'Your password needs everything in the list below.',
  cta: 'Save new password',
  ctaLoading: 'Saving...',
  network: "We couldn't reach Lawie. Check your connection and try again.",
  doneTitle: 'Password changed',
  doneBody:
    "You can now sign in with your new password. To keep your account safe, we've signed you out on all other devices.",
  doneCta: 'Sign in',
  deadTitle: 'This link no longer works',
  deadBody:
    'Reset links work once and expire 30 minutes after we send them. If you already set a new password, sign in with it.',
  deadCta: 'Send a new link',
  deadSecondary: 'Back to sign in',
} as const;

const S = RESET_STRINGS;
const REQUEST_TIMEOUT_MS = 15_000;
const TOKEN_RE = /^[a-f0-9]{64}$/;

/** Mirrors passwordSchema in apps/auth/src/validators/auth.validator.ts. Change both together. */
type RuleId = 'min_length' | 'uppercase' | 'lowercase' | 'number';
const RULES: { id: RuleId; label: string; error: string; test: (p: string) => boolean }[] = [
  { id: 'min_length', label: S.ruleMinLength, error: S.errShort, test: (p) => p.length >= 8 },
  { id: 'uppercase', label: S.ruleUppercase, error: S.errUpper, test: (p) => /[A-Z]/.test(p) },
  { id: 'lowercase', label: S.ruleLowercase, error: S.errLower, test: (p) => /[a-z]/.test(p) },
  { id: 'number', label: S.ruleNumber, error: S.errNumber, test: (p) => /\d/.test(p) },
];

/** One unmet rule: its own line. Two or more: the "everything in the list" line. */
function weakMessage(unmet: RuleId[]): string {
  if (unmet.length === 1) return RULES.find((r) => r.id === unmet[0])?.error ?? S.errSeveral;
  return S.errSeveral;
}

type Phase = 'checking' | 'form' | 'saving' | 'done' | 'dead';

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
  } finally {
    clearTimeout(timer);
  }
}

export default function ResetPasswordForm() {
  const params = useParams<{ token: string }>();
  const raw = typeof params?.token === 'string' ? params.token : '';
  const token = TOKEN_RE.test(raw) ? raw : null;

  const [phase, setPhase] = useState<Phase>(token ? 'checking' : 'dead');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [serverUnmet, setServerUnmet] = useState<RuleId[] | null>(null);
  const [networkError, setNetworkError] = useState(false);
  const inFlight = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const apiUrl = token
    ? `${process.env.NEXT_PUBLIC_API_URL}/api/auth/reset-password/${encodeURIComponent(token)}`
    : null;

  // Check on load (Rajesh): a dead link shows R5 before the user types anything. If the check
  // itself fails (network), show the form; the save answers for the link anyway.
  useEffect(() => {
    if (!apiUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithTimeout(apiUrl, { method: 'GET' });
        const body = (await res.json().catch(() => null)) as { valid?: unknown } | null;
        if (cancelled) return;
        setPhase(res.ok && body?.valid === false ? 'dead' : 'form');
      } catch {
        if (!cancelled) setPhase('form');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  useEffect(() => {
    if (phase === 'done' || phase === 'dead') headingRef.current?.focus();
  }, [phase]);

  const clientUnmet = RULES.filter((r) => !r.test(password)).map((r) => r.id);
  // Server's view wins until the user edits the password again.
  const unmet = serverUnmet ?? clientUnmet;
  const showWeak = attempted && unmet.length > 0;

  async function save() {
    if (inFlight.current || !apiUrl) return; // ignore double submits
    setAttempted(true);
    setNetworkError(false);
    if (clientUnmet.length > 0) {
      inputRef.current?.focus();
      return;
    }
    inFlight.current = true;
    setPhase('saving');
    try {
      const res = await fetchWithTimeout(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setPassword('');
        setPhase('done');
        return;
      }
      if (res.status === 422) {
        const body = (await res.json().catch(() => null)) as { unmet?: unknown } | null;
        const ids = Array.isArray(body?.unmet)
          ? (body.unmet as unknown[]).filter((u): u is RuleId => RULES.some((r) => r.id === u))
          : [];
        setServerUnmet(ids.length > 0 ? ids : RULES.map((r) => r.id));
        setPhase('form');
        setTimeout(() => inputRef.current?.focus(), 0);
        return;
      }
      if (res.status === 400) {
        setPhase('dead');
        return;
      }
      setNetworkError(true);
      setPhase('form');
    } catch {
      setNetworkError(true);
      setPhase('form');
    } finally {
      inFlight.current = false;
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void save();
  }

  const saving = phase === 'saving';

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
          {phase === 'done' && (
            <div>
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="flex items-center gap-2 text-xl font-bold text-slate-900 focus:outline-none sm:text-2xl"
              >
                <CheckCircle2 className="h-6 w-6 shrink-0 text-green-700" aria-hidden="true" />
                {S.doneTitle}
              </h1>
              <p className="mt-3 text-base text-slate-700">{S.doneBody}</p>
              <Link
                href="/login"
                className="mt-5 flex h-12 w-full items-center justify-center rounded-xl bg-slate-900 text-base font-semibold text-white transition hover:bg-slate-700"
              >
                {S.doneCta}
              </Link>
            </div>
          )}

          {phase === 'dead' && (
            <div>
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="text-xl font-bold text-slate-900 focus:outline-none sm:text-2xl"
              >
                {S.deadTitle}
              </h1>
              <p className="mt-3 text-base text-slate-700">{S.deadBody}</p>
              <Link
                href="/forgot-password"
                className="mt-5 flex h-12 w-full items-center justify-center rounded-xl bg-slate-900 text-base font-semibold text-white transition hover:bg-slate-700"
              >
                {S.deadCta}
              </Link>
              <div className="mt-4 text-center">
                <Link
                  href="/login"
                  className="text-lawie-600 hover:text-lawie-700 inline-flex min-h-11 items-center text-sm font-medium hover:underline"
                >
                  {S.deadSecondary}
                </Link>
              </div>
            </div>
          )}

          {(phase === 'checking' || phase === 'form' || phase === 'saving') && (
            <form noValidate onSubmit={onSubmit} aria-busy={phase === 'checking' || undefined}>
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="text-xl font-bold text-slate-900 focus:outline-none sm:text-2xl"
              >
                {S.title}
              </h1>

              {phase === 'checking' ? (
                <div className="mt-6 flex justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-500" aria-hidden="true" />
                </div>
              ) : (
                <>
                  <div className="mt-5">
                    <label
                      htmlFor="new-password"
                      className="mb-1.5 block text-sm font-medium text-slate-700"
                    >
                      {S.label}
                    </label>
                    <div className="relative">
                      <input
                        ref={inputRef}
                        id="new-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setServerUnmet(null);
                        }}
                        disabled={saving}
                        aria-invalid={showWeak || undefined}
                        aria-describedby={
                          showWeak ? 'new-password-error password-rules' : 'password-rules'
                        }
                        className={`focus:ring-lawie-600 h-12 w-full rounded-xl border bg-white px-4 pr-12 text-base text-slate-900 transition focus:outline-none focus:ring-2 sm:text-sm ${
                          showWeak ? 'border-red-700' : 'border-slate-500'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((p) => !p)}
                        aria-label={showPassword ? S.hide : S.show}
                        aria-pressed={showPassword}
                        className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center rounded-r-xl text-slate-600 transition-colors hover:text-slate-900"
                      >
                        {showPassword ? (
                          <EyeOff className="h-5 w-5" aria-hidden="true" />
                        ) : (
                          <Eye className="h-5 w-5" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                    {showWeak && (
                      <p id="new-password-error" className="mt-1.5 text-sm text-red-700">
                        {weakMessage(unmet)}
                      </p>
                    )}
                    <ul id="password-rules" className="mt-2 space-y-1 text-sm">
                      {RULES.map((rule) => {
                        const met = !unmet.includes(rule.id);
                        const failed = !met && attempted;
                        return (
                          <li
                            key={rule.id}
                            className={`flex items-center gap-2 ${
                              met ? 'text-green-700' : failed ? 'text-red-700' : 'text-slate-600'
                            }`}
                          >
                            {met ? (
                              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                            ) : failed ? (
                              <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                            ) : (
                              <Circle className="h-4 w-4 shrink-0" aria-hidden="true" />
                            )}
                            <span>{rule.label}</span>
                            <span className="sr-only">{met ? S.ruleMet : S.ruleUnmet}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  {networkError && (
                    <div
                      role="alert"
                      className="mt-4 flex items-start gap-2.5 rounded-xl bg-red-50 p-4 text-sm text-red-700"
                    >
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <p>{S.network}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={saving}
                    aria-busy={saving || undefined}
                    className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-base font-semibold text-white transition hover:bg-slate-700 active:scale-[0.98] disabled:opacity-60"
                  >
                    {saving && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
                    {saving ? S.ctaLoading : S.cta}
                  </button>
                </>
              )}
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

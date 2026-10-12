'use client';

/**
 * T-223 AC4 — "verify your email" prompt (Rajesh's spec, handoff/marketing/verify-prompt-spec-t223.md;
 * Madhuri's strings, handoff/marketing/copy/verify-email-t223.md part B, as signed by Ajay in
 * handoff/legal/T-223-verify-email-signed.md, which wins where they differ).
 *
 * One shared core (masked address, resend, status) in three places, plus the link landing page:
 *  1. Banner on every dashboard page for a signed-in, unverified email user (default export,
 *     mounted once in app/dashboard/layout.tsx, which also mounts the modal).
 *  2. Modal when a draft is refused for lack of Ink (402) and the user is unverified:
 *     callers do `if (await openVerifyInsteadOfPaywall()) return;` before opening the paywall.
 *  3. Inline card at checkout in place of the pay button (`<VerifyEmailCard />` where
 *     `useNeedsEmailVerification()` is true; a billing 403 email_verification_required turns it on
 *     through `isEmailVerificationRequired(res)`).
 *  Landing: `<VerifyEmailLanding />` (app/verify-email/page.tsx).
 *
 * The state comes from GET /api/auth/me (`emailVerified`, `hasGoogle`, T-223 phase 2). Google
 * users never see a prompt. When /me fails or lacks the fields, nothing shows (fail open); the
 * server's 403 at checkout stays the guard. Privacy first: privacy 403s are handled by
 * privacyFetch before any of this runs, and the privacy dialog is modal over the banner.
 *
 * The address is shown masked only (first character, ***, domain). Nothing here logs the
 * address or the token. The token goes in the POST body, never in a path.
 */
import * as Dialog from '@radix-ui/react-dialog';
import { AlertCircle, CheckCircle2, Clock, Loader2, Mail, X } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { card, primaryButton } from '@/components/intake/ui';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/apiFetch';
import { getAccessToken } from '@/lib/auth';

// ── Madhuri's strings, signed by Ajay. Changes only with his sign-off. ─────────────────────────
export const VERIFY_STRINGS = {
  title: 'Verify your email',
  body: (masked: string) =>
    `We sent a verification link to ${masked}. Open it to verify your email.`,
  resend: 'Resend email',
  sent: (masked: string) => `Email sent to ${masked}. Check your inbox and your spam folder.`,
  limitWait: (minutes: number) =>
    minutes <= 1 ? 'Try again in 1 minute.' : `Try again in ${minutes} minutes.`,
  expired: 'This link has expired. Send a new one.',
  already: 'Your email is already verified.',
  verified: 'Your email is verified. You can continue.',
  networkError: "Couldn't send the email. Check your connection and try again.",
  banner: (masked: string) =>
    `Verify your email. You need it to receive your 5 sign-up Ink and to buy Ink. We sent a link to ${masked}.`,
  modalTitle: 'Verify your email to continue',
  modalBody: (masked: string) =>
    `Verify your email to receive your 5 sign-up Ink. We sent a link to ${masked}.`,
  checkoutTitle: 'Verify your email before you buy',
  // "Additions for Ajay" (13 Oct): Meera approved, Ajay checking in parallel.
  limitReady: 'You can resend the email now.',
  landingError: "We couldn't verify your email just now. Please try again.",
  landingErrorRetry: 'Try again',
  landingExpiredSignedOut: 'This link has expired. Sign in to send a new one.',
  landingExpiredSignedOutCta: 'Sign in',
  checkoutBody: (masked: string) =>
    `We sent a link to ${masked}. Verify your email, then come back to buy Ink.`,
} as const;

/** Close / dismiss label. Not in Madhuri's file (UI chrome, same as ReferralOfferModal). */
const CLOSE_LABEL = 'Close';

/** Billing 403 body code at checkout (T-223 phase 1, apps/billing billing.routes.ts). */
export const EMAIL_VERIFICATION_REQUIRED = 'email_verification_required';
/** Resend 429 code: VERIFY_RESEND_LIMITED in apps/auth/src/services/verify-email.service.ts. */
export const VERIFY_RESEND_LIMITED = 'verify_email_rate_limited';
/** POST /verify-email 400 code for an expired, used or forged link (phase-2 contract). */
export const VERIFY_LINK_INVALID = 'verify_link_invalid';

/** a***@example.com: first character, ***, domain. Never the full address. */
export function maskEmail(email: string | null | undefined): string {
  if (typeof email !== 'string') return '***';
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

// ── Store (module level, so plain functions can open the modal) ──────────────────────────────

type ResendPhase = 'idle' | 'loading' | 'sent' | 'limited' | 'error' | 'already';
type Place = 'banner' | 'modal' | 'checkout' | 'landing';

interface VerifyState {
  /** From /me: null = unknown (fail open, nothing shows). */
  emailVerified: boolean | null;
  hasGoogle: boolean | null;
  /** A billing 403 said verification is required, whatever /me said. */
  requiredByServer: boolean;
  modalOpen: boolean;
  bannerDismissed: boolean;
  resend: ResendPhase;
  /** ms epoch when the resend limit ends (from the server's retryAfter). */
  limitUntil: number;
  /** The core whose resend made the current status: only it announces. */
  origin: Place | null;
}

const initial: VerifyState = {
  emailVerified: null,
  hasGoogle: null,
  requiredByServer: false,
  modalOpen: false,
  bannerDismissed: false,
  resend: 'idle',
  limitUntil: 0,
  origin: null,
};

let state: VerifyState = initial;
const listeners = new Set<() => void>();
let returnFocusTo: HTMLElement | null = null;

function setState(patch: Partial<VerifyState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

function useVerifyState(): VerifyState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => initial,
  );
}

function needsVerification(s: VerifyState): boolean {
  if (s.emailVerified === true || s.hasGoogle === true) return false;
  if (s.requiredByServer) return true;
  return s.emailVerified === false && s.hasGoogle === false;
}

// ── Server calls ─────────────────────────────────────────────────────────────────────────────

interface VerifyStatus {
  emailVerified: boolean;
  hasGoogle: boolean;
}

/** GET /api/auth/me. Null on any error, or when the T-223 fields are missing (fail open). */
async function fetchVerifyStatus(): Promise<VerifyStatus | null> {
  try {
    const res = await apiFetch('/api/auth/me', { cache: 'no-store' });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: Record<string, unknown> };
    const data = body?.data;
    if (!data || typeof data.emailVerified !== 'boolean' || typeof data.hasGoogle !== 'boolean') {
      return null;
    }
    return { emailVerified: data.emailVerified, hasGoogle: data.hasGoogle };
  } catch {
    return null;
  }
}

async function refreshVerifyStatus(): Promise<VerifyStatus | null> {
  const status = await fetchVerifyStatus();
  if (status) {
    setState({
      emailVerified: status.emailVerified,
      hasGoogle: status.hasGoogle,
      requiredByServer: status.emailVerified || status.hasGoogle ? false : state.requiredByServer,
    });
  }
  return status;
}

function currentTrigger(): HTMLElement | null {
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  return active instanceof HTMLElement && active !== document.body ? active : null;
}

/**
 * Trigger 2 (Priya): the draft was refused for lack of Ink (402). Asks /me; for an unverified
 * email user (no Google) it opens the verify modal and returns true, so the caller skips the
 * paywall. Verified, Google, or /me unavailable: returns false and the paywall shows as before.
 */
export async function openVerifyInsteadOfPaywall(): Promise<boolean> {
  const trigger = currentTrigger();
  const status = await refreshVerifyStatus();
  if (!status || status.emailVerified || status.hasGoogle) return false;
  returnFocusTo = trigger;
  setState({ modalOpen: true });
  return true;
}

/**
 * Trigger 3: true when a checkout response is billing's 403 email_verification_required. It
 * also turns the inline card on (useNeedsEmailVerification becomes true).
 */
export async function isEmailVerificationRequired(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  try {
    const body = (await res.clone().json()) as { error?: unknown };
    if (body?.error !== EMAIL_VERIFICATION_REQUIRED) return false;
  } catch {
    return false;
  }
  setState({ requiredByServer: true, emailVerified: false });
  return true;
}

/** True while the signed-in user must verify before paying (render the card, not the pay button). */
export function useNeedsEmailVerification(): boolean {
  const s = useVerifyState();
  return needsVerification(s);
}

function retryAfterMs(res: Response, body: { retryAfter?: unknown } | null): number {
  const fromBody = Number(body?.retryAfter);
  if (Number.isFinite(fromBody) && fromBody > 0) return fromBody * 1000;
  const fromHeader = Number(res.headers.get('Retry-After'));
  if (Number.isFinite(fromHeader) && fromHeader > 0) return fromHeader * 1000;
  return 0;
}

async function resend(origin: Place): Promise<void> {
  if (state.resend === 'loading') return;
  if (state.resend === 'limited' && Date.now() < state.limitUntil) return;
  setState({ resend: 'loading', origin });
  try {
    const res = await apiFetch('/api/auth/verify-email/resend', { method: 'POST' });
    if (res.status === 202 || res.ok) {
      setState({ resend: 'sent' });
      return;
    }
    if (res.status === 429) {
      const body = (await res.json().catch(() => null)) as { retryAfter?: unknown } | null;
      const wait = retryAfterMs(res, body);
      // No wait from the server: say nothing we cannot back up; let the user try again.
      if (wait <= 0) return setState({ resend: 'error' });
      setState({ resend: 'limited', limitUntil: Date.now() + wait });
      return;
    }
    if (res.status === 409) {
      setState({ resend: 'already', emailVerified: true, requiredByServer: false });
      return;
    }
    setState({ resend: 'error' });
  } catch {
    setState({ resend: 'error' });
  }
}

// ── Shared core ──────────────────────────────────────────────────────────────────────────────

const statusRow = 'flex items-start gap-2 rounded-lg px-3 py-2 text-sm leading-5';
const okRow = `${statusRow} bg-brand-teal-light text-brand-teal-dark`;
const waitRow = `${statusRow} bg-brand-gold-light text-brand-gold-dark`;
const errRow = `${statusRow} bg-brand-error-light text-brand-error`;

/** Re-renders every second while a limit is running; announces only start and minute text. */
function useLimitMinutes(limitUntil: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= limitUntil) {
        window.clearInterval(id);
        if (state.resend === 'limited') setState({ resend: 'idle' });
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [active, limitUntil]);
  return Math.max(0, Math.ceil((limitUntil - now) / 60_000));
}

interface CoreProps {
  place: Place;
  masked: string;
  /** Only the landing page shows "expired". */
  expired?: boolean;
  /** Id for the reason line (aria-describedby target in the modal). */
  describedById?: string;
}

function VerifyCoreControls({ place, masked, expired }: CoreProps) {
  const s = useVerifyState();
  const limited = s.resend === 'limited' && s.limitUntil > Date.now();
  const minutes = useLimitMinutes(s.limitUntil, s.resend === 'limited');
  // Live-region and alert text, set once per state change (never every second).
  const [announced, setAnnounced] = useState('');
  const [alerted, setAlerted] = useState('');
  const mine = s.origin === place;
  const statusId = `verify-status-${place}`;
  /** Previous resend phase, to catch the end of a limit (limited -> idle). */
  const prevResend = useRef<ResendPhase>(s.resend);

  useEffect(() => {
    const limitEnded = prevResend.current === 'limited' && s.resend === 'idle';
    prevResend.current = s.resend;
    let polite = '';
    let alert = '';
    // verify.limit_ready: once, when the wait ends and the button is back.
    if (mine && limitEnded) polite = VERIFY_STRINGS.limitReady;
    else if (mine && s.resend === 'sent') polite = VERIFY_STRINGS.sent(masked);
    else if (mine && s.resend === 'already') polite = VERIFY_STRINGS.already;
    else if (mine && s.resend === 'error') alert = VERIFY_STRINGS.networkError;
    else if (mine && s.resend === 'limited') {
      // Once, when the limit starts (spec §4); limit_ready says when it ends.
      alert = VERIFY_STRINGS.limitWait(
        Math.max(1, Math.ceil((state.limitUntil - Date.now()) / 60_000)),
      );
    } else if (expired && s.resend === 'idle' && !limitEnded) alert = VERIFY_STRINGS.expired;
    setAnnounced(polite);
    setAlerted(alert);
  }, [mine, s.resend, masked, expired]);

  const loading = s.resend === 'loading';
  const disabled = loading || limited || s.resend === 'already';
  const showResend = s.resend !== 'already';

  return (
    <div className="flex flex-col gap-2">
      {showResend && (
        <button
          type="button"
          className={`${primaryButton} w-full sm:w-auto ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
          aria-disabled={disabled || undefined}
          aria-busy={loading || undefined}
          aria-describedby={statusId}
          onClick={() => {
            if (!disabled) void resend(place);
          }}
        >
          {loading && (
            <Loader2 size={16} aria-hidden="true" className="shrink-0 motion-safe:animate-spin" />
          )}
          {VERIFY_STRINGS.resend}
        </button>
      )}
      <div id={statusId} className="flex flex-col gap-2">
        {/* Visible status rows. Icons plus text: colour is never the only signal. */}
        {s.resend === 'sent' && (
          <p className={okRow} aria-hidden={mine ? 'true' : undefined}>
            <CheckCircle2 size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            {VERIFY_STRINGS.sent(masked)}
          </p>
        )}
        {s.resend === 'already' && (
          <p className={okRow} aria-hidden={mine ? 'true' : undefined}>
            <CheckCircle2 size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            {VERIFY_STRINGS.already}
          </p>
        )}
        {limited && (
          <p className={waitRow}>
            <Clock size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            {/* Visual only; the alert below says it once when the limit starts. */}
            <span aria-hidden="true">{VERIFY_STRINGS.limitWait(minutes)}</span>
          </p>
        )}
        {expired && s.resend === 'idle' && (
          <p className={errRow} aria-hidden="true">
            <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            {VERIFY_STRINGS.expired}
          </p>
        )}
        {s.resend === 'error' && (
          <p className={errRow} aria-hidden={mine ? 'true' : undefined}>
            <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            {VERIFY_STRINGS.networkError}
          </p>
        )}
      </div>
      {/* One polite region and one alert node per core, always in the DOM. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announced}
      </div>
      <div role="alert" className="sr-only">
        {alerted}
      </div>
    </div>
  );
}

// ── 1. Banner + 2. Modal (default export, mounted once in dashboard/layout.tsx) ──────────────

export default function VerifyEmailPrompt() {
  const { user, isLoading } = useAuth();
  const s = useVerifyState();
  const userId = user?.id ?? null;

  // Signed out: forget everything (the next user starts fresh).
  useEffect(() => {
    if (!isLoading && !userId) setState({ ...initial });
  }, [isLoading, userId]);

  // On sign-in / each dashboard load: ask the server.
  useEffect(() => {
    if (!userId) return;
    setState({ ...initial });
    void refreshVerifyStatus();
  }, [userId]);

  if (!userId || (!needsVerification(s) && !s.modalOpen)) return null;
  const masked = maskEmail(user?.email);

  return (
    <>
      {needsVerification(s) && !s.bannerDismissed && !s.modalOpen && (
        <VerifyEmailBanner masked={masked} />
      )}
      <VerifyEmailModal masked={masked} open={s.modalOpen} />
    </>
  );
}

function VerifyEmailBanner({ masked }: { masked: string }) {
  return (
    <div
      role="region"
      aria-label={VERIFY_STRINGS.title}
      className="border-brand-line bg-brand-gold-light text-brand-navy border-b px-4 py-3"
    >
      <div className="relative mx-auto flex max-w-[720px] flex-col gap-3 pr-11 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex flex-1 items-start gap-3">
          <Mail size={24} aria-hidden="true" className="text-brand-navy shrink-0" />
          <p className="text-sm leading-6">{VERIFY_STRINGS.banner(masked)}</p>
        </div>
        <div className="sm:shrink-0">
          <VerifyCoreControls place="banner" masked={masked} />
        </div>
        <button
          type="button"
          aria-label={CLOSE_LABEL}
          onClick={() => setState({ bannerDismissed: true })}
          className="text-brand-navy focus-visible:ring-brand-teal absolute right-0 top-0 inline-flex h-11 w-11 items-center justify-center rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function VerifyEmailModal({ masked, open }: { masked: string; open: boolean }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const close = useCallback(() => setState({ modalOpen: false }), []);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="bg-brand-navy/55 fixed inset-0 z-[55]" />
        <Dialog.Content
          aria-describedby="verify-modal-reason"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            titleRef.current?.focus();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            const target =
              returnFocusTo && returnFocusTo.isConnected
                ? returnFocusTo
                : (document.getElementById('dashboard-main') ?? document.querySelector('main'));
            returnFocusTo = null;
            target?.focus();
          }}
          className="fixed left-1/2 top-1/2 z-[56] flex max-h-[90vh] w-[calc(100%-32px)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-2xl bg-white p-5 sm:p-7"
        >
          <div className="flex items-start gap-3 pr-10">
            <Mail size={24} aria-hidden="true" className="text-brand-navy shrink-0" />
            <Dialog.Title asChild>
              <h2
                ref={titleRef}
                tabIndex={-1}
                className="font-heading text-brand-navy text-xl font-semibold leading-7 focus:outline-none"
              >
                {VERIFY_STRINGS.modalTitle}
              </h2>
            </Dialog.Title>
          </div>
          <p id="verify-modal-reason" className="text-brand-navy text-[15px] leading-6">
            {VERIFY_STRINGS.modalBody(masked)}
          </p>
          <VerifyCoreControls place="modal" masked={masked} />
          <Dialog.Close asChild>
            <button
              type="button"
              aria-label={CLOSE_LABEL}
              className="text-brand-navy focus-visible:ring-brand-teal absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── 3. Inline card at checkout ───────────────────────────────────────────────────────────────

export function VerifyEmailCard() {
  const { user } = useAuth();
  const masked = maskEmail(user?.email);
  return (
    <section
      role="region"
      aria-labelledby="verify-checkout-title"
      className={`${card} text-brand-navy flex flex-col gap-3`}
    >
      <div className="flex items-start gap-3">
        <Mail size={24} aria-hidden="true" className="text-brand-navy shrink-0" />
        <h2 id="verify-checkout-title" className="text-base font-semibold leading-6">
          {VERIFY_STRINGS.checkoutTitle}
        </h2>
      </div>
      <p className="text-sm leading-6">{VERIFY_STRINGS.checkoutBody(masked)}</p>
      <VerifyCoreControls place="checkout" masked={masked} />
    </section>
  );
}

// ── Landing page core (app/verify-email/page.tsx) ────────────────────────────────────────────

type LandingResult = 'verified' | 'already' | 'expired' | 'error';

/** One POST per token per page load: React dev double-effects must not spend the link twice. */
const submitted = new Map<string, Promise<LandingResult>>();

async function submitToken(token: string): Promise<LandingResult> {
  try {
    // Public route: the token is the credential. apiFetch adds the Bearer header if signed in.
    const res = await apiFetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const body = (await res.json().catch(() => null)) as {
      status?: unknown;
      error?: unknown;
    } | null;
    if (res.ok && body?.status === 'verified') return 'verified';
    if (res.ok && body?.status === 'already_verified') return 'already';
    if (res.status === 400) return 'expired';
    return 'error';
  } catch {
    return 'error';
  }
}

export function VerifyEmailLanding() {
  const { user, isLoading } = useAuth();
  const params = useSearchParams();
  const [result, setResult] = useState<LandingResult | null>(null);
  const [token] = useState(() => params.get('token'));
  /** Bumped by "Try again" after a server or network failure: submits the token again. */
  const [attempt, setAttempt] = useState(0);
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Take the token out of the address bar and history straight away (nothing else reads it).
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('token=')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (isLoading) return;
    let cancelled = false;
    void (async () => {
      // Signed in and already verified (or Google): say so without spending the link.
      if (user && getAccessToken()) {
        const status = await refreshVerifyStatus();
        if (status && (status.emailVerified || status.hasGoogle)) {
          if (!cancelled) setResult('already');
          return;
        }
      }
      if (!token) {
        if (!cancelled) setResult('expired');
        return;
      }
      let p = submitted.get(token);
      if (!p) {
        p = submitToken(token);
        submitted.set(token, p);
      }
      const r = await p;
      if (r === 'verified' || r === 'already') {
        setState({ emailVerified: true, requiredByServer: false });
      }
      if (!cancelled) setResult(r);
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoading, user, token, attempt]);

  const retry = useCallback(() => {
    if (token) submitted.delete(token);
    setResult(null);
    setAttempt((a) => a + 1);
    // The retry button goes away while the call runs: keep focus on the page, not <body>.
    titleRef.current?.focus();
  }, [token]);

  const masked = maskEmail(user?.email);
  const done = result === 'verified' || result === 'already';

  return (
    <main className="bg-brand-page flex min-h-screen items-center justify-center px-4 py-10">
      <section
        role="region"
        aria-labelledby="verify-landing-title"
        aria-busy={result === null || undefined}
        className={`${card} text-brand-navy flex w-full max-w-[480px] flex-col gap-4`}
      >
        <div className="flex items-start gap-3">
          <Mail size={24} aria-hidden="true" className="text-brand-navy shrink-0" />
          <h1
            ref={titleRef}
            tabIndex={-1}
            id="verify-landing-title"
            className="font-heading text-xl font-semibold leading-7 focus:outline-none"
          >
            {VERIFY_STRINGS.title}
          </h1>
        </div>
        {result === null && (
          <Loader2
            size={24}
            aria-hidden="true"
            className="text-brand-muted motion-safe:animate-spin"
          />
        )}
        {done && (
          <p className={okRow}>
            <CheckCircle2 size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            {result === 'verified' ? VERIFY_STRINGS.verified : VERIFY_STRINGS.already}
          </p>
        )}
        {/* Expired, used, forged (one state, T-223 AC2). Signed in: resend in place. Signed out:
            resending needs sign-in, so the button goes to the login page. */}
        {result === 'expired' &&
          (user ? (
            <VerifyCoreControls place="landing" masked={masked} expired />
          ) : (
            <div className="flex flex-col gap-2">
              <p className={errRow} role="alert">
                <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
                {VERIFY_STRINGS.landingExpiredSignedOut}
              </p>
              <Link href="/login" className={`${primaryButton} w-full sm:w-auto`}>
                {VERIFY_STRINGS.landingExpiredSignedOutCta}
              </Link>
            </div>
          ))}
        {/* Server (5xx) or network failure: not an expired link. Retry submits the token again. */}
        {result === 'error' && (
          <div className="flex flex-col gap-2">
            <p className={errRow} role="alert">
              <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
              {VERIFY_STRINGS.landingError}
            </p>
            <button type="button" className={`${primaryButton} w-full sm:w-auto`} onClick={retry}>
              {VERIFY_STRINGS.landingErrorRetry}
            </button>
          </div>
        )}
        {/* Done: the polite announcement of the result. */}
        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {done ? (result === 'verified' ? VERIFY_STRINGS.verified : VERIFY_STRINGS.already) : ''}
        </div>
      </section>
    </main>
  );
}

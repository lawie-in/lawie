'use client';

/**
 * T-223 AC4, reworked by T-522 — the "verify your email" surfaces (Rajesh's T-522 design note,
 * handoff/design/T-522-neutral-signup-verify-design.md; copy: Ajay AJ-522-M3, M4, M6, S3, S5, S6,
 * S8 in components/marketing/nl-copy.ts VERIFY_COPY, and the T-223 strings below).
 *
 * One shared core (masked address, signed-in resend, status) in these places:
 *  1. The verify bar (ui/Banner, not dismissible) on every dashboard page for a signed-in,
 *     unverified email user (default export, mounted once in app/dashboard/layout.tsx, which also
 *     mounts the draft refusal dialog).
 *  2. The draft refusal dialog (AJ-522-M6, ui/Dialog), opened at the moment of the action, never
 *     a redirect: callers do `if (await openVerifyIfDraftRefused(res)) return;` on a 403
 *     email_verification_required from generate, preflight or intake. The T-223 Ink-refusal path
 *     (`openVerifyInsteadOfPaywall`, on a 402) opens the same dialog.
 *  3. Inline card at checkout in place of the pay button (`<VerifyEmailCard />` where
 *     `useNeedsEmailVerification()` is true; a billing 403 email_verification_required turns it on
 *     through `isEmailVerificationRequired(res)`).
 *  4. The one-time "code not applied" notice on the dashboard (AJ-522-S3).
 *  Landing: `<VerifyEmailLanding />` (app/verify-email/page.tsx), the five S5 states.
 *
 * The state comes from GET /api/auth/me (`emailVerified`, `hasGoogle`, `signupInkGranted`,
 * `referralStatus`). Google users never see a prompt. When /me fails or lacks the fields, nothing
 * shows (fail open); the server's 403 stays the guard. Privacy first: privacy 403s are handled by
 * privacyFetch before any of this runs, and the privacy dialog is modal over the bar.
 * Never fenced here (AJ-522-M1 a): Settings, Privacy, export, delete account, withdraw consent.
 *
 * The address is shown masked only (first character, ***, domain). Nothing here logs the
 * address or the token. The token goes in the POST body, never in a path.
 */
import { AlertCircle, AlertTriangle, CheckCircle2, Clock, Loader2, Mail } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { card, primaryButton } from '@/components/intake/ui';
import { VERIFY_COPY } from '@/components/marketing/nl-copy';
import { Banner, Button, Dialog, Skeleton } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/apiFetch';
import { getAccessToken } from '@/lib/auth';
import { cn } from '@/lib/cn';

// ── Madhuri's strings, signed by Ajay (T-223). Changes only with his sign-off. ─────────────────
// T-522: the T-223 bar and modal bodies (`banner`, `modalBody`) are gone: AJ-522-M3 and M6
// (VERIFY_COPY) replace them. The surfaces in this file use AJ-522-M4 and S6 for the resend lines
// and AJ-522-S5 for the landing. The other T-223 lines stay for components/billing/PlanPanel.tsx
// until its T-522 step (after Shashank's billing merge).
export const VERIFY_STRINGS = {
  title: 'Verify your email',
  resend: 'Resend email',
  sent: (masked: string) => `Email sent to ${masked}. Check your inbox and your spam folder.`,
  limitWait: (minutes: number) =>
    minutes <= 1 ? 'Try again in 1 minute.' : `Try again in ${minutes} minutes.`,
  already: 'Your email is already verified.',
  networkError: "Couldn't send the email. Check your connection and try again.",
  checkoutTitle: 'Verify your email before you buy',
  checkoutBody: (masked: string) =>
    `We sent a link to ${masked}. Verify your email, then come back to buy Ink.`,
} as const;

/** Billing and drafting 403 body code (T-223; drafting since T-522). */
export const EMAIL_VERIFICATION_REQUIRED = 'email_verification_required';
/** Resend 429 code: VERIFY_RESEND_LIMITED in apps/auth/src/services/verify-email.service.ts. */
export const VERIFY_RESEND_LIMITED = 'verify_email_rate_limited';
/** POST /verify-email 400 code for an expired, used or forged link (phase-2 contract). */
export const VERIFY_LINK_INVALID = 'verify_link_invalid';

/** The signed-in resend limit (auth verify-rate-limit.ts, Arjun T-522): one per 2 minutes. */
export const RESEND_INTERVAL_MS = 2 * 60_000;
/** How long the sent and end-of-wait lines stay before the bar goes back to its M3 line. */
export const STATUS_LINE_MS = 6_000;

/** a***@example.com: first character, ***, domain. Never the full address. */
export function maskEmail(email: string | null | undefined): string {
  if (typeof email !== 'string') return '***';
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

// ── Store (module level, so plain functions can open the dialog) ─────────────────────────────

/** ready = a wait window just ended (S6 line). */
type ResendPhase = 'idle' | 'loading' | 'sent' | 'limited' | 'ready' | 'error';
type Place = 'banner' | 'modal' | 'checkout' | 'landing';
type ReferralStatus = 'applied' | 'not_applied' | null;

interface VerifyState {
  /** From /me: null = unknown (fail open, nothing shows). */
  emailVerified: boolean | null;
  hasGoogle: boolean | null;
  /** From /me: the sign-up Ink was granted (M3 drops its Ink clause). */
  signupInkGranted: boolean;
  /** From /me: the outcome of a referral code sent at sign-up. */
  referralStatus: ReferralStatus;
  /** A 403 email_verification_required said verification is required, whatever /me said. */
  requiredByServer: boolean;
  /** The draft refusal dialog (AJ-522-M6). */
  modalOpen: boolean;
  resend: ResendPhase;
  /** ms epoch when the resend limit ends (from the server's retryAfter). */
  limitUntil: number;
  /** The core whose resend made the current status. */
  origin: Place | null;
}

const initial: VerifyState = {
  emailVerified: null,
  hasGoogle: null,
  signupInkGranted: false,
  referralStatus: null,
  requiredByServer: false,
  modalOpen: false,
  resend: 'idle',
  limitUntil: 0,
  origin: null,
};

let state: VerifyState = initial;
const listeners = new Set<() => void>();
/** One timer for the phase that ends on its own (sent, limited, ready). */
let phaseTimer: ReturnType<typeof setTimeout> | null = null;

function setState(patch: Partial<VerifyState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function clearPhaseTimer(): void {
  if (phaseTimer !== null) clearTimeout(phaseTimer);
  phaseTimer = null;
}

/** Resets the store (sign-out, a new user). */
function resetState(): void {
  clearPhaseTimer();
  setState({ ...initial });
}

/** After `ms`, if the resend is still in `phase`, move it to `next`. */
function endPhaseAfter(phase: ResendPhase, ms: number, next: ResendPhase): void {
  clearPhaseTimer();
  phaseTimer = setTimeout(() => {
    phaseTimer = null;
    if (state.resend !== phase) return;
    setState({ resend: next });
    // The end-of-wait line goes back to the M3 line after a moment, like the sent line.
    if (next === 'ready') endPhaseAfter('ready', STATUS_LINE_MS, 'idle');
  }, ms);
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

function isVerifiedState(s: VerifyState): boolean {
  return s.emailVerified === true || s.hasGoogle === true;
}

// ── Server calls ─────────────────────────────────────────────────────────────────────────────

interface VerifyStatus {
  emailVerified: boolean;
  hasGoogle: boolean;
  signupInkGranted: boolean;
  referralStatus: ReferralStatus;
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
    return {
      emailVerified: data.emailVerified,
      hasGoogle: data.hasGoogle,
      signupInkGranted: data.signupInkGranted === true,
      referralStatus:
        data.referralStatus === 'applied' || data.referralStatus === 'not_applied'
          ? data.referralStatus
          : null,
    };
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
      signupInkGranted: status.signupInkGranted,
      referralStatus: status.referralStatus,
      requiredByServer: status.emailVerified || status.hasGoogle ? false : state.requiredByServer,
    });
  }
  return status;
}

/**
 * T-522 (Rajesh §3): a draft action (generate, preflight, intake) answered 403
 * email_verification_required opens the M6 Draft dialog and returns true; the caller keeps the
 * advocate where they were (no redirect) and leaves its buttons enabled. Any other response:
 * false, and the response body is untouched (read from a clone).
 */
export async function openVerifyIfDraftRefused(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  try {
    const body = (await res.clone().json()) as { error?: unknown } | null;
    if (body?.error !== EMAIL_VERIFICATION_REQUIRED) return false;
  } catch {
    return false;
  }
  setState({ requiredByServer: true, emailVerified: false, modalOpen: true });
  return true;
}

/**
 * T-223 trigger 2: the draft was refused for lack of Ink (402). Asks /me; for an unverified
 * email user (no Google) it opens the draft refusal dialog (AJ-522-M6) and returns true, so the
 * caller skips the paywall. Verified, Google, or /me unavailable: returns false and the paywall
 * shows as before. Since T-522 the drafting fence answers 403 before any 402, so this is a
 * fallback.
 */
export async function openVerifyInsteadOfPaywall(): Promise<boolean> {
  const status = await refreshVerifyStatus();
  if (!status || status.emailVerified || status.hasGoogle) return false;
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

function isLimited(s: VerifyState): boolean {
  return s.resend === 'limited' && Date.now() < s.limitUntil;
}

/** The signed-in resend (POST /api/auth/verify-email/resend). */
async function resend(origin: Place): Promise<void> {
  if (state.resend === 'loading') return;
  if (isLimited(state)) {
    // Still in the wait: the wait line stays; nothing is sent.
    setState({ origin });
    return;
  }
  clearPhaseTimer();
  setState({ resend: 'loading', origin });
  try {
    const res = await apiFetch('/api/auth/verify-email/resend', { method: 'POST' });
    if (res.status === 202 || res.ok) {
      setState({ resend: 'sent' });
      endPhaseAfter('sent', STATUS_LINE_MS, 'idle');
      return;
    }
    if (res.status === 429) {
      const body = (await res.json().catch(() => null)) as { retryAfter?: unknown } | null;
      // The 2-minute or the daily limit. No wait from the server: hold the 2-minute window.
      const wait = retryAfterMs(res, body) || RESEND_INTERVAL_MS;
      setState({ resend: 'limited', limitUntil: Date.now() + wait });
      endPhaseAfter('limited', wait, 'ready');
      return;
    }
    if (res.status === 409) {
      // Already verified: the bar and the dialog go away.
      setState({ resend: 'idle', emailVerified: true, requiredByServer: false, modalOpen: false });
      return;
    }
    setState({ resend: 'error' });
  } catch {
    setState({ resend: 'error' });
  }
}

/** The status line for a resend phase (AJ-522-M4, S6, S8); '' when there is none. */
function statusLine(phase: ResendPhase): string {
  switch (phase) {
    case 'sent':
      return VERIFY_COPY.sent;
    case 'limited':
      return VERIFY_COPY.wait;
    case 'ready':
      return VERIFY_COPY.ready;
    case 'error':
      return VERIFY_COPY.failed;
    default:
      return '';
  }
}

// ── Shared core (checkout card and landing) ──────────────────────────────────────────────────

const STATUS_ROW = 'flex items-start gap-2 rounded-lg px-3 py-2 text-sm leading-5';
const ROW_TONE: Record<'ok' | 'wait' | 'err', string> = {
  ok: 'bg-brand-teal-light text-brand-teal-dark',
  wait: 'bg-brand-gold-light text-brand-gold-dark',
  err: 'bg-brand-error-light text-brand-error',
};

function toneOf(phase: ResendPhase): 'ok' | 'wait' | 'err' {
  if (phase === 'error') return 'err';
  if (phase === 'limited') return 'wait';
  return 'ok';
}

function StatusIcon({ phase }: { phase: ResendPhase }) {
  if (phase === 'error') {
    return <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />;
  }
  if (phase === 'limited') {
    return <Clock size={16} aria-hidden="true" className="mt-0.5 shrink-0" />;
  }
  return <CheckCircle2 size={16} aria-hidden="true" className="mt-0.5 shrink-0" />;
}

/** The legacy-shell resend core: the checkout card (T-223 Place 3). */
function VerifyCoreControls({ place }: { place: Place }) {
  const s = useVerifyState();
  const loading = s.resend === 'loading';
  const disabled = loading || isLimited(s);
  const line = statusLine(s.resend);
  const statusId = `verify-status-${place}`;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className={cn(
          primaryButton,
          'w-full sm:w-auto',
          disabled && 'cursor-not-allowed opacity-40',
        )}
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
        {VERIFY_COPY.resend}
      </button>
      {/* Icons plus text: colour is never the only signal. One polite region, always present. */}
      <div id={statusId} role="status" aria-live="polite" aria-atomic="true">
        {line ? (
          <p className={cn(STATUS_ROW, ROW_TONE[toneOf(s.resend)])}>
            <StatusIcon phase={s.resend} />
            {line}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ── 1. Verify bar + 2. Draft refusal dialog (default export, mounted in dashboard/layout.tsx) ─

export default function VerifyEmailPrompt() {
  const { user, isLoading } = useAuth();
  const s = useVerifyState();
  const userId = user?.id ?? null;

  // Signed out: forget everything (the next user starts fresh).
  useEffect(() => {
    if (!isLoading && !userId) resetState();
  }, [isLoading, userId]);

  // On sign-in / each dashboard load: ask the server.
  useEffect(() => {
    if (!userId) return;
    resetState();
    void refreshVerifyStatus();
  }, [userId]);

  if (!userId || (!needsVerification(s) && !s.modalOpen)) return null;
  const masked = maskEmail(user?.email);

  return (
    <>
      {needsVerification(s) && <VerifyEmailBar masked={masked} />}
      <DraftRefusalDialog masked={masked} open={s.modalOpen} />
    </>
  );
}

/**
 * Rajesh §2: ui/Banner kind verify-email (warn, role=status), full width under the top bar, not
 * dismissible. The text line swaps for the resend states; the bar does not grow a second row.
 */
function VerifyEmailBar({ masked }: { masked: string }) {
  const s = useVerifyState();
  const line = statusLine(s.resend);
  const message =
    s.resend === 'error' ? (
      <span className="text-nl-err">{line}</span>
    ) : (
      line || VERIFY_COPY.bar(masked, s.signupInkGranted)
    );
  return (
    <Banner
      kind="verify-email"
      message={message}
      action={{
        label: s.resend === 'error' ? VERIFY_COPY.retry : VERIFY_COPY.resend,
        onClick: () => {
          // While a send runs or a wait window is open the press does nothing new; the wait line
          // stays on the bar.
          if (state.resend === 'loading') return;
          void resend('banner');
        },
      }}
    />
  );
}

/**
 * AJ-522-M6 Draft refusal (Rajesh §3): ui/Dialog, `Resend email` primary, `Not now` ghost with
 * first focus (it comes first in the Dialog's DOM order). Escape and the scrim close. The resend
 * status line sits in the dialog body.
 */
function DraftRefusalDialog({ masked, open }: { masked: string; open: boolean }) {
  const s = useVerifyState();
  const line = s.origin === 'modal' ? statusLine(s.resend) : '';
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setState({ modalOpen: false });
      }}
      title={VERIFY_COPY.draftTitle}
      description={VERIFY_COPY.draftBody(masked)}
      confirmLabel={VERIFY_COPY.resend}
      cancelLabel={VERIFY_COPY.notNow}
      confirmLoading={s.resend === 'loading' && s.origin === 'modal'}
      onConfirm={() => void resend('modal')}
    >
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={cn(
          'nl-body-sm m-0',
          s.resend === 'error' && 'text-nl-err',
          s.resend === 'limited' && 'text-nl-warn',
          (s.resend === 'sent' || s.resend === 'ready') && 'text-nl-ok',
          !line && 'sr-only',
        )}
      >
        {line}
      </p>
    </Dialog>
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
      className={cn(card, 'text-brand-navy flex flex-col gap-3')}
    >
      <div className="flex items-start gap-3">
        <Mail size={24} aria-hidden="true" className="text-brand-navy shrink-0" />
        <h2 id="verify-checkout-title" className="text-base font-semibold leading-6">
          {VERIFY_STRINGS.checkoutTitle}
        </h2>
      </div>
      <p className="text-sm leading-6">{VERIFY_STRINGS.checkoutBody(masked)}</p>
      <VerifyCoreControls place="checkout" />
    </section>
  );
}

// ── 4. One-time "code not applied" notice (AJ-522-S3) ────────────────────────────────────────

const REFERRAL_NOTICE_SEEN_PREFIX = 'lawie.referralNotice.seen:';

function referralNoticeSeen(userId: string): boolean {
  try {
    return localStorage.getItem(REFERRAL_NOTICE_SEEN_PREFIX + userId) === '1';
  } catch {
    return false;
  }
}

function markReferralNoticeSeen(userId: string): void {
  try {
    localStorage.setItem(REFERRAL_NOTICE_SEEN_PREFIX + userId, '1');
  } catch {
    // Storage unavailable: the notice shows again next time, which is never a silent drop.
  }
}

/**
 * AJ-522-S3 (placement per Addendum 1): on a dashboard load after verification, only when
 * GET /me says referralStatus === 'not_applied', once. It is marked seen only after it has
 * rendered (the effect runs after the commit), so a user who never loads the dashboard still
 * sees it on the next load. It stays for the rest of this visit.
 */
export function ReferralNotAppliedNotice() {
  const { user } = useAuth();
  const s = useVerifyState();
  const userId = user?.id ?? null;
  const eligible = Boolean(userId) && isVerifiedState(s) && s.referralStatus === 'not_applied';
  const [shownFor, setShownFor] = useState<string | null>(null);

  useEffect(() => {
    if (eligible && userId && shownFor !== userId && !referralNoticeSeen(userId)) {
      setShownFor(userId);
    }
  }, [eligible, userId, shownFor]);

  const shown = shownFor !== null && shownFor === userId;

  useEffect(() => {
    if (shown && userId) markReferralNoticeSeen(userId);
  }, [shown, userId]);

  if (!shown) return null;
  return (
    <p role="status" className="gap-nl-2 nl-body text-nl-text m-0 flex items-start">
      <AlertTriangle className="text-nl-warn mt-1 h-5 w-5 shrink-0" aria-hidden="true" />
      <span>{VERIFY_COPY.referralNotApplied}</span>
    </p>
  );
}

// ── Brass check disc (the T-525 payment mark, drawn here; decorative) ────────────────────────

/**
 * The 64px brass disc with the On Brass check. `stamp`: the Seal motion (550ms; a 150ms fade
 * under reduced motion, globals.css). Otherwise the end state with a 150ms fade in.
 */
export function CheckDisc({ stamp = false }: { stamp?: boolean }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width="64"
      height="64"
      aria-hidden="true"
      className={cn(
        'shrink-0 overflow-visible',
        !stamp && 'motion-safe:animate-[nl-fade-in_150ms_ease_both]',
      )}
    >
      <g className={stamp ? 'nl-seal-stamping' : 'nl-seal-stamped'}>
        <circle cx="32" cy="32" r="30" fill="var(--brass)" />
        <circle
          cx="32"
          cy="32"
          r="25"
          fill="none"
          stroke="var(--on-brass)"
          strokeOpacity="0.6"
          strokeWidth="1.5"
        />
        <path
          d="M21 33l7 7 15-16"
          fill="none"
          stroke="var(--on-brass)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

// ── Landing page core (app/verify-email/page.tsx), Rajesh §4 / AJ-522-S5 ─────────────────────

const SIGNIN_HREF = '/login?mode=signin';

/** null = verifying. */
type LandingResult = 'signedIn' | 'verifiedSignedOut' | 'expired' | 'error';

interface SubmitOutcome {
  kind: 'verified' | 'expired' | 'error';
  /** Present when the link was a sign-in link (the server opened a session). */
  tokens?: { accessToken: string; refreshToken: string };
}

/** One POST per token per page load: React dev double-effects must not spend the link twice. */
const submitted = new Map<string, Promise<SubmitOutcome>>();

async function submitToken(token: string): Promise<SubmitOutcome> {
  try {
    // Public route: the token is the credential. apiFetch adds the Bearer header if signed in.
    const res = await apiFetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      referrerPolicy: 'no-referrer',
    });
    const body = (await res.json().catch(() => null)) as {
      status?: unknown;
      accessToken?: unknown;
      refreshToken?: unknown;
    } | null;
    if (res.ok && (body?.status === 'verified' || body?.status === 'already_verified')) {
      const { accessToken, refreshToken } = body;
      if (typeof accessToken === 'string' && typeof refreshToken === 'string') {
        return { kind: 'verified', tokens: { accessToken, refreshToken } };
      }
      return { kind: 'verified' };
    }
    if (res.status === 400) return { kind: 'expired' };
    return { kind: 'error' };
  } catch {
    return { kind: 'error' };
  }
}

export function VerifyEmailLanding() {
  const { user, isLoading, login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [result, setResult] = useState<LandingResult | null>(null);
  const [token] = useState(() => params.get('token'));
  /** Bumped by "Try again" after a server or network failure: submits the token again. */
  const [attempt, setAttempt] = useState(0);
  const titleRef = useRef<HTMLHeadingElement>(null);
  // The session as it was when this attempt started (the link's own sign-in changes `user`,
  // which must not re-run the flow).
  const userRef = useRef(user);
  userRef.current = user;

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
      const signedIn = Boolean(userRef.current && getAccessToken());
      // Already verified and already signed in: skip the page without spending the link.
      if (signedIn) {
        const status = await refreshVerifyStatus();
        if (status && (status.emailVerified || status.hasGoogle)) {
          if (!cancelled) router.replace('/dashboard');
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
      const outcome = await p;
      if (outcome.kind === 'verified') {
        // A sign-in link: the existing AuthContext login path stores the session.
        if (outcome.tokens) login(outcome.tokens.accessToken, outcome.tokens.refreshToken);
        setState({ emailVerified: true, requiredByServer: false });
        if (!cancelled) {
          setResult(outcome.tokens || signedIn ? 'signedIn' : 'verifiedSignedOut');
        }
        return;
      }
      if (!cancelled) setResult(outcome.kind);
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoading, token, attempt, login, router]);

  // Each new state moves focus to its title, so it is read first.
  useEffect(() => {
    if (result !== null) titleRef.current?.focus();
  }, [result]);

  const retry = useCallback(() => {
    if (token) submitted.delete(token);
    setResult(null);
    setAttempt((a) => a + 1);
    // The retry button goes away while the call runs: keep focus on the page, not <body>.
    titleRef.current?.focus();
  }, [token]);

  const L = VERIFY_COPY.landing;
  const verified = result === 'signedIn' || result === 'verifiedSignedOut';
  const title =
    result === null
      ? VERIFY_STRINGS.title
      : verified
        ? L.verifiedTitle
        : result === 'expired'
          ? L.expiredTitle
          : VERIFY_STRINGS.title;

  return (
    <main className="nl nl-root px-nl-4 py-nl-8 flex min-h-[100svh] flex-col items-center justify-center">
      <section
        aria-labelledby="verify-landing-title"
        className="border-nl-line border-t-nl-brass bg-nl-card shadow-nl-card relative w-full max-w-[440px] overflow-hidden border border-t"
      >
        <div className="p-nl-6 gap-nl-4 min-[900px]:p-nl-10 relative flex flex-col">
          {verified ? <CheckDisc stamp /> : null}
          <h1
            ref={titleRef}
            tabIndex={-1}
            id="verify-landing-title"
            className={cn(
              'nl-h1 m-0 focus:outline-none',
              result === 'expired' ? 'text-nl-err' : 'text-nl-text',
            )}
          >
            {title}
          </h1>

          {/* Verifying: a one-line skeleton, "Still working…" after 8 s (ui/Skeleton). */}
          {result === null ? <Skeleton lines={1} /> : null}

          {verified ? (
            <>
              <p role="status" className="nl-body text-nl-soft m-0">
                {result === 'signedIn' ? L.verifiedSignedIn : L.verifiedSignedOut}
              </p>
              <Button
                className="w-full"
                onClick={() => router.push(result === 'signedIn' ? '/dashboard' : SIGNIN_HREF)}
              >
                {result === 'signedIn' ? L.goToShelf : L.signIn}
              </Button>
            </>
          ) : null}

          {/* Expired, used or forged (AJ-522-M1 b): signs no one in. Resend only for a session
              that already exists (S5), so nothing reveals whether an account exists. */}
          {result === 'expired' ? (
            <>
              <p className="nl-body text-nl-soft m-0">{L.expiredLine}</p>
              <Button className="w-full" onClick={() => router.push(SIGNIN_HREF)}>
                {L.signIn}
              </Button>
              {user ? <LandingResend /> : null}
            </>
          ) : null}

          {/* Server (5xx) or network failure: not an expired link. Try again submits it again. */}
          {result === 'error' ? (
            <>
              <p role="alert" className="nl-body text-nl-err m-0">
                {L.failed}
              </p>
              <Button className="w-full" onClick={retry}>
                {L.tryAgain}
              </Button>
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}

/** The signed-in resend on the expired state (a ghost under the primary Sign in). */
function LandingResend() {
  const s = useVerifyState();
  const line = s.origin === 'landing' ? statusLine(s.resend) : '';
  const loading = s.resend === 'loading';
  const limited = isLimited(s);
  return (
    <div className="gap-nl-2 flex flex-col">
      <Button
        variant="ghost"
        className="w-full"
        loading={loading}
        aria-disabled={limited || undefined}
        aria-describedby="verify-status-landing"
        onClick={() => {
          if (!limited) void resend('landing');
        }}
      >
        {VERIFY_COPY.resend}
      </Button>
      <p
        id="verify-status-landing"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={cn(
          'nl-body-sm m-0',
          s.resend === 'error' && 'text-nl-err',
          s.resend === 'limited' && 'text-nl-warn',
          (s.resend === 'sent' || s.resend === 'ready') && 'text-nl-ok',
          !line && 'sr-only',
        )}
      >
        {line}
      </p>
    </div>
  );
}

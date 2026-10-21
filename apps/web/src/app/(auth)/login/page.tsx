'use client';

import { AlertTriangle, CheckCircle2, Circle, Gift } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';

import ReferralOfferModal from './ReferralOfferModal';

import { NightFooter } from '@/components/marketing/NightFooter';
import { NightTopBar } from '@/components/marketing/NightTopBar';
import { AUTH_COPY, CONSENT_COPY } from '@/components/marketing/nl-copy';
import {
  CONTROL_LINE,
  NL_GHOST_HOVER,
  NL_PRIMARY_BUTTON_HOVER,
} from '@/components/marketing/nl-link';
import { Lamp, Spinner } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/cn';
import { clearSignupSource, readSignupSource } from '@/lib/signup-source';

// T-234 — email + password sign-in and sign-up next to Google.
// Design: Rajesh (handoff/tickets/T-234-…md). Copy: "Final" column of
// handoff/marketing/copy/login-page-t234.md, signed by Ajay (handoff/legal/T-234-login-copy-signed.md).
// T-221: "Forgot password?" (Sign in mode) links to /forgot-password.
// T-517: Night Library reskin (spec 02; copy §2.1, §2.2, §2.4 and AJ-517-M1..M4, M9; strings in
// components/marketing/nl-copy.ts). Tabs: Create account first, then Sign in. Behaviour kept:
// PKCE Google start, referral box, signup-source tags, field validation, 409 handling, ?mode= /
// ?ref= / ?error=, the error summary (role=alert, focused). New: the consent checkbox on Create
// account (AJ-517-M3), which gates Create account and Google; network vs server errors with Retry.

type Mode = 'signin' | 'signup';
type Field = 'name' | 'email' | 'password';
type FieldErrors = Partial<Record<Field, string>>;

type ServerError =
  | { kind: 'list'; items: string[] } // 422
  | { kind: 'conflict'; message: string } // 409
  | { kind: 'unauthorized' } // 401
  | { kind: 'message'; message: string } // 403 (any other text)
  | { kind: 'accountDeactivated' } // T-299: 403 with the deactivated text, or ?error=account_deactivated
  | { kind: 'oauthFailed' } // T-299: ?error=oauth_failed or ?error=invalid_code
  | { kind: 'network' } // fetch failed (no response), or the Google start could not store state
  | { kind: 'server' } // 429, 5xx and any other unexpected status (T-517: split from network)
  | { kind: 'signInIncomplete' } // T-319: ?error=sign_in_incomplete from /auth/callback
  | { kind: 'insecureContext' }; // T-319: no crypto.subtle / getRandomValues (not https)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mirrors apps/auth/src/validators/auth.validator.ts registerSchema.password exactly:
// .min(8) · /[A-Z]/ · /[a-z]/ · /\d/. Change both together.
// AJ-517-M4: the existing signed checklist stays (it states the real rule).
const PASSWORD_RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: AUTH_COPY.passwordRules.length, test: (p) => p.length >= 8 },
  { label: AUTH_COPY.passwordRules.upper, test: (p) => /[A-Z]/.test(p) },
  { label: AUTH_COPY.passwordRules.lower, test: (p) => /[a-z]/.test(p) },
  { label: AUTH_COPY.passwordRules.digit, test: (p) => /\d/.test(p) },
];
// Ajay Addendum 1: a code that showed R5/R6 (applied) and was no longer valid at sign-up.
const REFERRAL_NOT_APPLIED_MESSAGE =
  'Your referral code was no longer valid, so no bonus Ink was added.';
// Ajay Addendum 3: a code typed but never applied (R5/R6 never shown) and invalid at sign-up.
const REFERRAL_NOT_VALID_MESSAGE = 'Your referral code was not valid, so no bonus Ink was added.';
// Tab-scoped marker read once by /auth/callback to pick between the two lines above after a
// Google sign-up: '1' = R5/R6 showed for the code sent, '0' = never applied. Wording only; the
// server never sees it and it grants nothing.
const REFERRAL_SHOWN_KEY = 'lawie_referral_shown';

// T-319: the line for /login?error=sign_in_incomplete (no verifier in this tab at /auth/callback).
// Approved by Ajay; change it only here.
const SIGN_IN_INCOMPLETE_MESSAGE = "We couldn't finish signing you in. Please try again.";

// T-299: the line for /login?error=oauth_failed and ?error=invalid_code (the Google sign-in did not
// complete). Approved by Priya; change it only here.
const OAUTH_FAILED_MESSAGE = "Google sign-in didn't work. Please try again.";

// T-299: the deactivated-account line (Ajay). "Contact support" is rendered as a link to /contact
// (Ajay's condition, Priya chose /contact), the same for ?error=account_deactivated and for a
// password sign-in answered 403 with exactly the API text below.
const DEACTIVATED_LEAD = 'Your account has been deactivated.';
const DEACTIVATED_LINK_TEXT = 'Contact support';
const CONTACT_HREF = '/contact';
// Must equal the 403 text in apps/auth/src/services/auth.service.ts (loginUser). Matched exactly;
// the API text itself is never rendered for this case.
const DEACTIVATED_API_MESSAGE = 'Your account has been deactivated. Contact support.';

// T-299: the fixed set of ?error= codes this page answers. Anything else shows nothing, and the
// query value is never printed.
// T-242: ?ref=CODE → the referral box value. Trimmed, upper-cased, capped at 16 (the box's and the
// API's limit). Empty → null. The visitor can still see and edit it (Ajay, T-242 signed).
const REFERRAL_CODE_MAX_LENGTH = 16;
function referralFromQuery(raw: string | null): string | null {
  const code = (raw ?? '').trim().toUpperCase().slice(0, REFERRAL_CODE_MAX_LENGTH);
  return code || null;
}

function serverErrorFromQuery(code: string | null): ServerError | null {
  switch (code) {
    case 'oauth_failed':
    case 'invalid_code':
      return { kind: 'oauthFailed' };
    case 'account_deactivated':
      return { kind: 'accountDeactivated' };
    case 'sign_in_incomplete':
      return { kind: 'signInIncomplete' };
    default:
      return null;
  }
}

// T-319 round 2: shown instead of the network error when the browser has no crypto.subtle or
// crypto.getRandomValues (a non-secure origin). Approved by Arjun and Ajay; change it only here.
const GOOGLE_NEEDS_HTTPS_MESSAGE = 'Google sign-in needs a secure (https) connection.';

// T-319 (Arjun): PKCE-style binding for Google sign-in. The verifier stays in this tab's
// sessionStorage; only its SHA-256 (the challenge) goes to the API. /auth/callback reads, deletes
// and sends it with the one-time code. Must match the key in app/auth/callback/page.tsx.
const OAUTH_VERIFIER_KEY = 'lawie.oauth.verifier';

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

type OAuthChallengeResult =
  | { ok: true; challenge: string }
  // insecure: crypto.subtle or crypto.getRandomValues is missing (non-secure origin).
  // failed: anything else, e.g. sessionStorage blocked or full.
  | { ok: false; reason: 'insecure' | 'failed' };

// Creates and stores a fresh verifier and returns its challenge.
async function createOAuthChallenge(): Promise<OAuthChallengeResult> {
  let subtle: SubtleCrypto | undefined;
  try {
    subtle = window.crypto?.subtle;
    if (!subtle || typeof window.crypto.getRandomValues !== 'function') {
      return { ok: false, reason: 'insecure' };
    }
  } catch {
    return { ok: false, reason: 'insecure' };
  }
  try {
    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    const verifier = base64url(bytes);
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    sessionStorage.setItem(OAUTH_VERIFIER_KEY, verifier);
    if (sessionStorage.getItem(OAUTH_VERIFIER_KEY) !== verifier) {
      return { ok: false, reason: 'failed' };
    }
    return { ok: true, challenge: base64url(new Uint8Array(digest)) };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

// Which field a T-208 422 message belongs to (cheap prefix match, per design).
// "Invalid email format" is the API's email-format message, so it maps to Email too.
function fieldForMessage(msg: string): Field | null {
  if (/^(email|invalid email)/i.test(msg)) return 'email';
  if (/^(password|must contain)/i.test(msg)) return 'password';
  if (/^name/i.test(msg)) return 'name';
  return null;
}

function validateField(field: Field, value: string): string | undefined {
  if (field === 'name') return value.trim() ? undefined : AUTH_COPY.errName;
  if (field === 'email') {
    if (!value.trim()) return AUTH_COPY.errEmailEmpty;
    return EMAIL_RE.test(value.trim()) ? undefined : AUTH_COPY.errEmailFormat;
  }
  return value ? undefined : AUTH_COPY.errPassword;
}

// Underline input on the folio (spec 3 Input; DESIGN.md Inputs / Shapes): bottom border only,
// 1px Control Line at rest (T-528), 2px brass on focus (the extra pixel comes out of the bottom
// padding, so the field does not grow), Rust on error. Name, email and password use it.
const inputBase =
  'nl-focus nl-body block min-h-[48px] w-full rounded-none border-0 border-b bg-transparent px-0 py-nl-2 text-nl-text placeholder:text-nl-muted focus:border-b-2 focus:pb-[7px] disabled:cursor-not-allowed disabled:opacity-50';

function inputClass(invalid: boolean) {
  return `${inputBase} ${invalid ? 'border-nl-err' : `${CONTROL_LINE} focus:border-nl-brass`}`;
}

// Boxed input (1px Control Line, radius md): only the referral code. T-528: its group is ruled
// off with Line hairlines on the folio ground (no Wood panel, no box inside the folio's border).
const boxedInputClass = `nl-focus nl-body block min-h-[48px] w-full rounded-nl-md border ${CONTROL_LINE} bg-nl-card px-nl-3 py-nl-2 text-nl-text placeholder:text-nl-muted focus:border-b-2 focus:border-nl-brass disabled:cursor-not-allowed disabled:opacity-50`;

// Field labels: DESIGN.md Label style (nl-label: 500, 12px, 0.12em, uppercase) in Brass Text.
const LABEL = 'nl-label mb-nl-1 block text-nl-brass-dark';
const FIELD_ERROR = 'nl-body-sm mt-nl-1 text-nl-err';
const TEXT_LINK =
  'nl-focus rounded-nl-sm font-medium text-nl-brass-dark underline underline-offset-4';

function GoogleIcon() {
  return (
    <svg
      className="h-5 w-5 shrink-0"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  // Sign in links use an explicit ?mode=signin, never bare /login. Next 16.2.4 bug: after a direct
  // load of /login?mode=signup, hydration caches the route under the key "/login" with canonical URL
  // "/login?mode=signup" (create-initial-router-state → discoverKnownRoute), so a client navigation
  // to plain /login resolves to the current URL and does nothing. No param still means Sign in.
  const SIGNIN_HREF = '/login?mode=signin';
  const SIGNUP_HREF = '/login?mode=signup';

  // T-242 (Priya): /login?ref=CODE pre-fills the referral box. Same shape as the box and the
  // API: trimmed, upper-cased, at most 16 characters (registerSchema.referralCode .max(16)).
  const refParam = referralFromQuery(searchParams.get('ref'));

  // Mode lives in the URL (/login?mode=signup) so marketing links and Back work. Default: Sign in.
  // A ?ref= link opens Create account, the only mode with the referral box, unless the link
  // explicitly asks for ?mode=signin.
  const modeParam = searchParams.get('mode');
  const mode: Mode =
    modeParam === 'signup' || (refParam && modeParam !== 'signin') ? 'signup' : 'signin';
  const isSignup = mode === 'signup';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverInvalid, setServerInvalid] = useState<Set<Field>>(new Set());
  // T-319 / T-299: read ?error= once, on mount, and map it through the fixed set above.
  const [serverError, setServerError] = useState<ServerError | null>(() =>
    serverErrorFromQuery(searchParams.get('error')),
  );
  const [submitting, setSubmitting] = useState(false);
  const [referralNotice, setReferralNotice] = useState<string | null>(null);
  // T-517 (AJ-511-M11, AJ-517-M3): consent on Create account. Unticked by default; gates Create
  // account and Google on that tab. Not sent: the server stamps the version.
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | undefined>(undefined);
  // What Retry repeats after a network or server error.
  const lastAttempt = useRef<'email' | 'google'>('email');

  // Referral code — SCRUM-71 (Create account only)
  const [referralCode, setReferralCode] = useState(() => refParam ?? '');
  const [referralValid, setReferralValid] = useState<boolean | null>(null);
  const [referralLabel, setReferralLabel] = useState('');
  const [referralBonusInk, setReferralBonusInk] = useState(0);
  const [validating, setValidating] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState(false);
  // Ajay condition 2: an existing account (409) never sees R5/R6; show R7 until the email changes.
  const [referralExistingAccount, setReferralExistingAccount] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const consentRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const applyRef = useRef<HTMLButtonElement>(null);
  const tabRefs = useRef<Record<Mode, HTMLButtonElement | null>>({ signin: null, signup: null });
  const prevMode = useRef<Mode>(mode);
  // Focus moves to the first empty field only for a switch from the bottom switch link or
  // "Sign in instead". Tablist switches (click, arrows, Home/End) keep focus on the tab.
  const focusFieldOnSwitch = useRef(false);
  // True only while the mode switch moves focus itself, so that move doesn't blur-validate the
  // field the user was in (it keeps focus while a switch link is pressed, see keepFieldFocus).
  const switchingFocus = useRef(false);
  const fieldsRef = useRef({ name, email });
  fieldsRef.current = { name, email };

  // Switching mode (tab, switch link, "Sign in instead" or Back) keeps the email, clears the
  // password and errors, and moves focus to the first empty field.
  useEffect(() => {
    if (prevMode.current === mode) return;
    prevMode.current = mode;
    const moveFocus = focusFieldOnSwitch.current;
    focusFieldOnSwitch.current = false;
    setPassword('');
    setShowPassword(false);
    setFieldErrors({});
    setServerInvalid(new Set());
    setServerError(null);
    setConsentError(undefined);
    if (!moveFocus) return;
    const { name: n, email: em } = fieldsRef.current;
    const target = mode === 'signup' && !n.trim() ? nameRef : !em.trim() ? emailRef : passwordRef;
    // Wait a frame so the signup-only Full name field is mounted.
    requestAnimationFrame(() => {
      switchingFocus.current = true;
      target.current?.focus();
      switchingFocus.current = false;
    });
  }, [mode]);

  useEffect(() => {
    if (serverError) summaryRef.current?.focus();
  }, [serverError]);

  const switchMode = useCallback(
    (next: Mode) => {
      if (next === mode) return;
      router.push(next === 'signup' ? SIGNUP_HREF : SIGNIN_HREF, { scroll: false });
    },
    [mode, router],
  );

  const onTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    // T-517: Create account is the first tab, Sign in the last.
    const next: Mode =
      e.key === 'Home' ? 'signup' : e.key === 'End' ? 'signin' : isSignup ? 'signin' : 'signup';
    tabRefs.current[next]?.focus();
    switchMode(next);
  };

  // ── Referral ────────────────────────────────────────────────────────────────

  const validateCode = async (code: string): Promise<boolean | null> => {
    if (!code) {
      setReferralValid(null);
      return null;
    }
    setValidating(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/auth/validate-code/${encodeURIComponent(code)}`,
      );
      if (res.ok) {
        const data = await res.json();
        setReferralValid(data.valid);
        setReferralLabel(data.label ?? '');
        // {n} comes from the server: ReferralCode.bonusInk, the value grantReferralInk credits.
        setReferralBonusInk(data.bonusInk ?? 0);
        return Boolean(data.valid);
      }
      return null;
    } catch {
      setReferralValid(null);
      return null;
    } finally {
      setValidating(false);
    }
  };

  // Stable identity so the modal's mount effect (focus, trap, focus return) runs once.
  const closeOfferModal = useCallback(() => setShowOfferModal(false), []);

  const handleApply = async () => {
    const code = referralCode.trim().toUpperCase();
    if (!code) return;
    const valid = await validateCode(code);
    if (valid) setShowOfferModal(true);
  };

  // The code is sent only from Create account, and not when it was already shown as invalid (R7).
  const referralToSend = (): string | undefined => {
    const code = referralCode.trim().toUpperCase();
    if (!isSignup || !code || referralValid === false) return undefined;
    return code;
  };

  // T-517 (AJ-517-M3): Create account and Google on that tab wait for the consent box.
  const consentMissing = (): boolean => {
    if (!isSignup || consent) return false;
    setConsentError(CONSENT_COPY.required);
    return true;
  };

  const handleGoogleLogin = async () => {
    lastAttempt.current = 'google';
    if (consentMissing()) {
      consentRef.current?.focus();
      return;
    }
    // T-319: no verifier, no redirect. No crypto (non-secure origin): the https line. Any other
    // failure (sessionStorage): the existing network-style error.
    const result = await createOAuthChallenge();
    if (!result.ok) {
      setServerError(
        result.reason === 'insecure' ? { kind: 'insecureContext' } : { kind: 'network' },
      );
      return;
    }
    const { challenge } = result;
    const code = referralToSend();
    try {
      if (code) sessionStorage.setItem(REFERRAL_SHOWN_KEY, referralValid === true ? '1' : '0');
      else sessionStorage.removeItem(REFERRAL_SHOWN_KEY);
    } catch {
      // Storage unavailable: the callback falls back to the "not valid" line.
    }
    const params = new URLSearchParams({ challenge });
    if (code) params.set('referralCode', code);
    // T-242: the landing link's tags go to our auth service only, which keeps them only if this
    // Google sign-in creates a new account. T-344: not cleared here. A cancelled or failed Google
    // sign-in comes back to /login?error=… with the tags still in sessionStorage for the next try;
    // /auth/callback clears them only once the sign-in has succeeded.
    const source = readSignupSource();
    if (source?.utmSource) params.set('utmSource', source.utmSource);
    if (source?.utmMedium) params.set('utmMedium', source.utmMedium);
    if (source?.utmCampaign) params.set('utmCampaign', source.utmCampaign);
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/api/auth/google?${params.toString()}`;
  };

  // ── Email + password ────────────────────────────────────────────────────────

  const fieldValue = (f: Field) => (f === 'name' ? name : f === 'email' ? email : password);

  const onBlurField = (f: Field) => {
    if (switchingFocus.current) return;
    setFieldErrors((prev) => ({ ...prev, [f]: validateField(f, fieldValue(f)) }));
  };

  // Once a field shows an error, re-check it as the user types so the error clears when fixed.
  const onChangeField = (f: Field, value: string) => {
    if (f === 'name') setName(value);
    else if (f === 'email') {
      setEmail(value);
      setReferralExistingAccount(false);
    } else setPassword(value);
    if (fieldErrors[f]) {
      setFieldErrors((prev) => ({ ...prev, [f]: validateField(f, value) }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitEmail();
  };

  const submitEmail = async () => {
    if (submitting) return;
    lastAttempt.current = 'email';

    const fields: Field[] = isSignup ? ['name', 'email', 'password'] : ['email', 'password'];
    const errs: FieldErrors = {};
    for (const f of fields) {
      const msg = validateField(f, fieldValue(f));
      if (msg) errs[f] = msg;
    }
    setFieldErrors(errs);
    const noConsent = consentMissing();
    const firstInvalid = fields.find((f) => errs[f]);
    if (firstInvalid) {
      const refs = { name: nameRef, email: emailRef, password: passwordRef };
      refs[firstInvalid].current?.focus();
      return;
    }
    if (noConsent) {
      consentRef.current?.focus();
      return;
    }

    setSubmitting(true);
    setServerError(null);
    setServerInvalid(new Set());

    // T-242: the landing link's tags go only with Create account (sanitized again by the API).
    const body = isSignup
      ? {
          name: name.trim(),
          email: email.trim(),
          password,
          referralCode: referralToSend(),
          ...(readSignupSource() ?? {}),
        }
      : { email: email.trim(), password };

    let res: Response;
    try {
      res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/auth/${isSignup ? 'register' : 'login'}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
    } catch {
      setSubmitting(false);
      setServerError({ kind: 'network' });
      return;
    }

    let json: {
      message?: unknown;
      data?: { accessToken?: string; refreshToken?: string; referralApplied?: boolean };
    } = {};
    try {
      json = await res.json();
    } catch {
      // Non-JSON body (proxy error page etc.) — handled by status below.
    }

    const accessToken = json.data?.accessToken;
    const refreshToken = json.data?.refreshToken;
    if (res.ok && accessToken && refreshToken) {
      login(accessToken, refreshToken);
      // T-242: the account now holds the tags; the browser keeps them no longer.
      if (isSignup) clearSignupSource();
      // The code sent was not valid at account creation. The account exists; tell the user once
      // before going on. Addendum 1 line if R5/R6 showed for it, Addendum 3 line if never applied.
      if (isSignup && json.data?.referralApplied === false) {
        setSubmitting(false);
        setReferralNotice(
          referralValid === true ? REFERRAL_NOT_APPLIED_MESSAGE : REFERRAL_NOT_VALID_MESSAGE,
        );
        return;
      }
      router.replace('/dashboard');
      return;
    }

    setSubmitting(false);
    const message = typeof json.message === 'string' ? json.message : '';

    if (res.status === 422 && message) {
      const items = message
        .split('; ')
        .map((m) => m.trim())
        .filter(Boolean);
      const marked = new Set<Field>();
      for (const m of items) {
        const f = fieldForMessage(m);
        if (f && fields.includes(f)) marked.add(f);
      }
      setServerInvalid(marked);
      setServerError({ kind: 'list', items });
    } else if (res.status === 409 && message) {
      if (isSignup) setReferralExistingAccount(true);
      setServerError({ kind: 'conflict', message });
    } else if (res.status === 401) {
      setPassword('');
      setServerError({ kind: 'unauthorized' });
    } else if (res.status === 403 && message === DEACTIVATED_API_MESSAGE) {
      // T-299: same line and link as ?error=account_deactivated.
      setServerError({ kind: 'accountDeactivated' });
    } else if (res.status === 403 && message) {
      setServerError({ kind: 'message', message });
    } else {
      // T-517 (§2.4): 429, 5xx and anything unexpected get the server banner with Retry.
      setServerError({ kind: 'server' });
    }
  };

  const retry = () => {
    setServerError(null);
    if (lastAttempt.current === 'google') void handleGoogleLogin();
    else void submitEmail();
  };

  // Pressing a mode-switch link must not blur the focused field: the blur would show its
  // validation error, push the link down, and the mouseup would miss it (no click fires).
  const keepFieldFocus = (e: React.MouseEvent) => e.preventDefault();

  const isInvalid = (f: Field) => Boolean(fieldErrors[f]) || serverInvalid.has(f);
  const describedBy = (...ids: (string | false | undefined)[]) =>
    ids.filter(Boolean).join(' ') || undefined;

  const showReferralInvalid =
    referralValid === false || (referralValid === true && referralExistingAccount);
  const showReferralApplied = referralValid === true && !referralExistingAccount;

  // ── Render ──────────────────────────────────────────────────────────────────

  const tabs: readonly (readonly [Mode, string])[] = [
    ['signup', AUTH_COPY.tabs.signup],
    ['signin', AUTH_COPY.tabs.signin],
  ];

  return (
    <div className="nl nl-root flex min-h-[100svh] flex-col overflow-x-clip">
      {showOfferModal && showReferralApplied && isSignup && (
        <ReferralOfferModal
          code={referralCode.trim().toUpperCase()}
          label={referralLabel}
          bonusInk={referralBonusInk}
          onClose={closeOfferModal}
          fallbackFocusRef={applyRef}
        />
      )}

      <NightTopBar showActions={false} />

      <main className="px-nl-4 py-nl-4 min-[640px]:py-nl-8 min-[900px]:py-nl-12 flex flex-1 flex-col items-center">
        {/* The folio holds the form; the lamp pool sits on it (spec 02). */}
        <div className="border-nl-line border-t-nl-brass bg-nl-card shadow-nl-card relative w-full max-w-[440px] overflow-hidden border border-t">
          <Lamp />
          <div className="p-nl-6 min-[900px]:p-nl-10 relative">
            {referralNotice ? (
              <div role="status">
                <p className="gap-nl-2 nl-body text-nl-text flex items-start">
                  <AlertTriangle
                    className="text-nl-warn mt-1 h-5 w-5 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{referralNotice}</span>
                </p>
                <button
                  type="button"
                  onClick={() => router.replace('/dashboard')}
                  className={cn(
                    'nl-focus rounded-nl-md bg-nl-brass text-nl-on-brass mt-nl-5 h-11 w-full touch-manipulation font-medium',
                    NL_PRIMARY_BUTTON_HOVER,
                  )}
                >
                  {AUTH_COPY.continue}
                </button>
              </div>
            ) : (
              <>
                {/* Mode switch: hand-rolled ARIA tablist (T-234), Create account first (T-517). */}
                <div
                  role="tablist"
                  aria-label={AUTH_COPY.tablistLabel}
                  className={cn(CONTROL_LINE, 'grid grid-cols-2 border-b')}
                >
                  {tabs.map(([m, label]) => {
                    const selected = mode === m;
                    return (
                      <button
                        key={m}
                        ref={(el) => {
                          tabRefs.current[m] = el;
                        }}
                        id={`tab-${m}`}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        aria-controls="auth-panel"
                        tabIndex={selected ? 0 : -1}
                        onClick={() => switchMode(m)}
                        onKeyDown={onTabKeyDown}
                        className={cn(
                          'nl-focus nl-body -mb-px min-h-[44px] touch-manipulation border-b-2 font-medium',
                          selected
                            ? 'border-nl-brass text-nl-text'
                            : 'text-nl-soft [@media(hover:hover)_and_(pointer:fine)]:hover:text-nl-text border-transparent',
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                <div id="auth-panel" role="tabpanel" aria-labelledby={`tab-${mode}`}>
                  <h1 className="nl-h1 mt-nl-6 text-nl-text">
                    {isSignup ? AUTH_COPY.heading.signup : AUTH_COPY.heading.signin}
                  </h1>
                  <p className="nl-body-sm mt-nl-1 text-nl-soft">
                    {isSignup ? AUTH_COPY.subline.signup : AUTH_COPY.subline.signin}
                  </p>

                  {/* Referral code — SCRUM-71, Create account only (Priya decision 2) */}
                  {isSignup && (
                    <div className="mt-nl-5 border-nl-line py-nl-4 border-y">
                      <div className="mb-nl-3 gap-nl-2 flex items-center">
                        <Gift size={14} className="text-nl-brass-dark" aria-hidden="true" />
                        <label
                          htmlFor="referral-code"
                          className="nl-body-sm text-nl-text font-medium"
                        >
                          Have a referral code?
                        </label>
                      </div>
                      <div className="gap-nl-2 flex">
                        <input
                          id="referral-code"
                          type="text"
                          placeholder="Enter code"
                          value={referralCode}
                          onChange={(e) => {
                            setReferralCode(e.target.value.toUpperCase());
                            setReferralValid(null);
                            setReferralExistingAccount(false);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void handleApply();
                            }
                          }}
                          maxLength={16}
                          autoComplete="off"
                          disabled={submitting}
                          aria-describedby={
                            referralValid !== null ? 'referral-feedback' : undefined
                          }
                          className={cn(
                            boxedInputClass,
                            'placeholder:font-nl-body min-w-0 flex-1 font-mono uppercase tracking-widest placeholder:normal-case placeholder:tracking-normal',
                          )}
                        />
                        <button
                          ref={applyRef}
                          type="button"
                          onClick={() => void handleApply()}
                          disabled={!referralCode.trim() || validating || submitting}
                          className={cn(
                            'nl-focus rounded-nl-md px-nl-4 text-nl-brass-dark min-h-[48px] shrink-0 border font-medium disabled:opacity-50',
                            CONTROL_LINE,
                            NL_GHOST_HOVER,
                          )}
                        >
                          {validating ? 'Checking…' : 'Apply'}
                        </button>
                      </div>

                      {/* Inline feedback */}
                      {showReferralApplied && (
                        <p
                          id="referral-feedback"
                          className="nl-body-sm mt-nl-2 gap-nl-1 text-nl-ok flex items-start"
                        >
                          <CheckCircle2 size={14} className="mt-1 shrink-0" aria-hidden="true" />
                          <span>
                            {referralBonusInk > 0
                              ? `Code applied${referralLabel ? ` — ${referralLabel}` : ''}. ${referralBonusInk} Ink will be added when you create your account.`
                              : 'Code applied. Bonus Ink will be added when you create your account.'}
                          </span>
                        </p>
                      )}
                      {showReferralInvalid && (
                        <p
                          id="referral-feedback"
                          className="nl-body-sm mt-nl-2 gap-nl-1 text-nl-err flex items-start"
                        >
                          <AlertTriangle size={14} className="mt-1 shrink-0" aria-hidden="true" />
                          <span>
                            This code isn&apos;t valid or has expired. Check it and try again.
                          </span>
                        </p>
                      )}
                    </div>
                  )}

                  {/* Google OAuth (gated by the consent box on Create account, AJ-517-M3) */}
                  <button
                    onClick={() => void handleGoogleLogin()}
                    type="button"
                    disabled={submitting}
                    className={cn(
                      'nl-focus rounded-nl-md bg-nl-card mt-nl-5 gap-nl-3 px-nl-4 text-nl-text flex min-h-[48px] w-full touch-manipulation items-center justify-center border font-medium disabled:opacity-50',
                      // T-528 (Rajesh): a non-primary hover (Brass border, Brass Soft ground), no halo.
                      CONTROL_LINE,
                      NL_GHOST_HOVER,
                    )}
                  >
                    <GoogleIcon />
                    {AUTH_COPY.google}
                  </button>
                  {/* Sign in tab only, beside the Google button (AJ-517-M18): the T-234 consent
                      line (Ajay, 11 Oct 2026), word for word, with its Terms and Privacy links. A
                      Google sign-in from this tab can still create an account and has no
                      checkbox. */}
                  {!isSignup && (
                    <p className="nl-body-sm mt-nl-3 text-nl-soft">
                      {AUTH_COPY.byContinuing.before}
                      <Link href="/terms" target="_blank" rel="noopener" className={TEXT_LINK}>
                        {AUTH_COPY.byContinuing.terms}
                      </Link>
                      {AUTH_COPY.byContinuing.middle}
                      <Link href="/privacy" target="_blank" rel="noopener" className={TEXT_LINK}>
                        {AUTH_COPY.byContinuing.privacy}
                      </Link>
                      {AUTH_COPY.byContinuing.after}
                    </p>
                  )}

                  <div className="my-nl-5 gap-nl-3 flex items-center">
                    <div className="bg-nl-line h-px flex-1" />
                    <span className="nl-body-sm text-nl-soft">{AUTH_COPY.orEmail}</span>
                    <div className="bg-nl-line h-px flex-1" />
                  </div>

                  <form onSubmit={handleSubmit} noValidate className="gap-nl-4 flex flex-col">
                    {isSignup && (
                      <div>
                        <label htmlFor="name" className={LABEL}>
                          {AUTH_COPY.nameLabel}
                        </label>
                        <input
                          ref={nameRef}
                          id="name"
                          type="text"
                          autoComplete="name"
                          maxLength={100}
                          value={name}
                          disabled={submitting}
                          onChange={(e) => onChangeField('name', e.target.value)}
                          onBlur={() => onBlurField('name')}
                          aria-invalid={isInvalid('name') || undefined}
                          aria-describedby={describedBy(
                            'name-help',
                            fieldErrors.name && 'name-error',
                          )}
                          className={inputClass(isInvalid('name'))}
                        />
                        <p id="name-help" className="nl-body-sm mt-nl-1 text-nl-soft">
                          {AUTH_COPY.nameHelp}
                        </p>
                        {fieldErrors.name && (
                          <p id="name-error" className={FIELD_ERROR}>
                            {fieldErrors.name}
                          </p>
                        )}
                      </div>
                    )}

                    <div>
                      <label htmlFor="email" className={LABEL}>
                        {AUTH_COPY.emailLabel}
                      </label>
                      <input
                        ref={emailRef}
                        id="email"
                        type="email"
                        autoComplete="email"
                        maxLength={254}
                        placeholder={AUTH_COPY.emailPlaceholder}
                        value={email}
                        disabled={submitting}
                        onChange={(e) => onChangeField('email', e.target.value)}
                        onBlur={() => onBlurField('email')}
                        aria-invalid={isInvalid('email') || undefined}
                        aria-describedby={describedBy(fieldErrors.email && 'email-error')}
                        className={inputClass(isInvalid('email'))}
                      />
                      {fieldErrors.email && (
                        <p id="email-error" className={FIELD_ERROR}>
                          {fieldErrors.email}
                        </p>
                      )}
                    </div>

                    <div>
                      {/* T-221: "Forgot password?" sits in the label row, right-aligned, Sign in
                          only, with a 44 px hit area. */}
                      <div className="mb-nl-1 flex items-center justify-between">
                        <label htmlFor="password" className="nl-label text-nl-brass-dark block">
                          {AUTH_COPY.passwordLabel}
                        </label>
                        {!isSignup && (
                          <Link
                            href="/forgot-password"
                            className="nl-focus nl-body-sm rounded-nl-sm text-nl-brass-dark -my-3 -mr-2 inline-flex min-h-11 min-w-11 items-center justify-end px-2 font-medium underline-offset-4 [@media(hover:hover)_and_(pointer:fine)]:hover:underline"
                          >
                            {AUTH_COPY.forgot}
                          </Link>
                        )}
                      </div>
                      <div className="relative">
                        <input
                          ref={passwordRef}
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete={isSignup ? 'new-password' : 'current-password'}
                          value={password}
                          disabled={submitting}
                          onChange={(e) => onChangeField('password', e.target.value)}
                          onBlur={() => onBlurField('password')}
                          aria-invalid={isInvalid('password') || undefined}
                          aria-describedby={describedBy(
                            fieldErrors.password && 'password-error',
                            isSignup && 'password-rules',
                          )}
                          className={`${inputClass(isInvalid('password'))} pr-[72px]`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((p) => !p)}
                          aria-label={showPassword ? AUTH_COPY.hideAria : AUTH_COPY.showAria}
                          className="nl-focus nl-body-sm rounded-nl-md px-nl-3 text-nl-brass-dark absolute right-0 top-0 flex h-12 min-w-[44px] items-center justify-center font-medium"
                        >
                          {showPassword ? AUTH_COPY.hide : AUTH_COPY.show}
                        </button>
                      </div>
                      {fieldErrors.password && (
                        <p id="password-error" className={FIELD_ERROR}>
                          {fieldErrors.password}
                        </p>
                      )}
                      {isSignup && (
                        <div id="password-rules" className="nl-body-sm mt-nl-2 text-nl-soft">
                          <p>{AUTH_COPY.passwordNeeds}</p>
                          <ul className="mt-nl-1 gap-nl-1 flex list-none flex-col p-0">
                            {PASSWORD_RULES.map((rule) => {
                              const met = rule.test(password);
                              return (
                                <li key={rule.label} className="gap-nl-2 flex items-center">
                                  {met ? (
                                    <CheckCircle2
                                      className="text-nl-ok h-4 w-4 shrink-0"
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <Circle
                                      className="text-nl-soft h-4 w-4 shrink-0"
                                      aria-hidden="true"
                                    />
                                  )}
                                  <span className={met ? 'text-nl-text' : undefined}>
                                    {rule.label}
                                  </span>
                                  <span className="sr-only">
                                    {met ? AUTH_COPY.ruleDone : AUTH_COPY.ruleNotYet}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Consent, Create account only (AJ-511-M11, AJ-517-M3, worded by AJ-517-M16):
                        unticked by default, the Terms version and the Privacy Policy version, no
                        date. Gates Create account and Google. */}
                    {isSignup && (
                      <div>
                        <div className="gap-nl-3 flex items-start">
                          {/* T-528 (Rajesh): the box takes the Control Line at rest, so it is drawn
                              (appearance-none); a native box's border cannot be coloured. Checked:
                              Brass fill, On Brass tick. Forced colours get the native control. */}
                          <span className="relative mt-[3px] inline-flex h-5 w-5 shrink-0">
                            <input
                              ref={consentRef}
                              id="consent"
                              type="checkbox"
                              checked={consent}
                              disabled={submitting}
                              onChange={(e) => {
                                setConsent(e.target.checked);
                                if (e.target.checked) setConsentError(undefined);
                              }}
                              aria-invalid={consentError ? true : undefined}
                              aria-describedby={consentError ? 'consent-error' : undefined}
                              className={cn(
                                'nl-focus rounded-nl-sm bg-nl-card checked:border-nl-brass checked:bg-nl-brass peer m-0 block h-5 w-5 cursor-pointer appearance-none border disabled:cursor-not-allowed disabled:opacity-50 forced-colors:appearance-auto',
                                CONTROL_LINE,
                              )}
                            />
                            <svg
                              aria-hidden="true"
                              focusable="false"
                              viewBox="0 0 20 20"
                              className="text-nl-on-brass pointer-events-none absolute inset-0 hidden h-5 w-5 peer-checked:block forced-colors:hidden"
                            >
                              <path
                                d="M5 10.5l3 3 7-7"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </span>
                          <label htmlFor="consent" className="nl-body-sm text-nl-soft">
                            {CONSENT_COPY.before}
                            <Link
                              href="/terms"
                              target="_blank"
                              rel="noopener"
                              className={TEXT_LINK}
                            >
                              {CONSENT_COPY.terms}
                            </Link>
                            {CONSENT_COPY.middle}
                            <Link
                              href="/privacy"
                              target="_blank"
                              rel="noopener"
                              className={TEXT_LINK}
                            >
                              {CONSENT_COPY.privacy}
                            </Link>
                            {CONSENT_COPY.after}
                          </label>
                        </div>
                        {consentError && (
                          <p id="consent-error" className={FIELD_ERROR}>
                            {consentError}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Error summary — directly above submit */}
                    {serverError && (
                      <div
                        ref={summaryRef}
                        role="alert"
                        tabIndex={-1}
                        className="nl-focus bg-nl-err-light p-nl-4 nl-body-sm text-nl-err gap-nl-2 flex items-start"
                      >
                        <AlertTriangle className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
                        <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                          {serverError.kind === 'list' &&
                            (serverError.items.length > 1 ? (
                              <>
                                <p className="font-medium">{AUTH_COPY.checkFollowing}</p>
                                <ul className="mt-nl-1 list-disc pl-5">
                                  {serverError.items.map((m) => (
                                    <li key={m}>{m}</li>
                                  ))}
                                </ul>
                              </>
                            ) : (
                              <p>{serverError.items[0]}</p>
                            ))}
                          {serverError.kind === 'conflict' && (
                            <p>
                              {serverError.message}{' '}
                              <Link
                                href={SIGNIN_HREF}
                                scroll={false}
                                onMouseDown={keepFieldFocus}
                                onClick={() => {
                                  focusFieldOnSwitch.current = true;
                                }}
                                className="font-medium underline underline-offset-4"
                              >
                                {AUTH_COPY.signInInstead}
                              </Link>
                            </p>
                          )}
                          {serverError.kind === 'unauthorized' && (
                            <>
                              <p>{AUTH_COPY.wrongPassword}</p>
                              <p className="mt-nl-1">{AUTH_COPY.googleHint}</p>
                            </>
                          )}
                          {serverError.kind === 'message' && <p>{serverError.message}</p>}
                          {serverError.kind === 'accountDeactivated' && (
                            <p>
                              {DEACTIVATED_LEAD}{' '}
                              <Link
                                href={CONTACT_HREF}
                                className="font-medium underline underline-offset-4"
                              >
                                {DEACTIVATED_LINK_TEXT}
                              </Link>
                              .
                            </p>
                          )}
                          {serverError.kind === 'oauthFailed' && <p>{OAUTH_FAILED_MESSAGE}</p>}
                          {(serverError.kind === 'network' || serverError.kind === 'server') && (
                            <div className="gap-x-nl-3 flex flex-wrap items-center">
                              <p>
                                {serverError.kind === 'network'
                                  ? AUTH_COPY.network
                                  : AUTH_COPY.serverError}
                              </p>
                              <button
                                type="button"
                                onClick={retry}
                                className="nl-focus rounded-nl-md inline-flex min-h-[44px] items-center font-medium underline underline-offset-4"
                              >
                                {AUTH_COPY.retry}
                              </button>
                            </div>
                          )}
                          {serverError.kind === 'insecureContext' && (
                            <p>{GOOGLE_NEEDS_HTTPS_MESSAGE}</p>
                          )}
                          {serverError.kind === 'signInIncomplete' && (
                            <p>{SIGN_IN_INCOMPLETE_MESSAGE}</p>
                          )}
                        </div>
                      </div>
                    )}

                    <div>
                      <button
                        type="submit"
                        disabled={submitting}
                        aria-busy={submitting || undefined}
                        className={cn(
                          'nl-focus rounded-nl-md bg-nl-brass text-nl-on-brass gap-nl-2 flex h-11 w-full touch-manipulation items-center justify-center text-[15px] font-medium disabled:cursor-wait disabled:opacity-80',
                          // T-528: DESIGN.md primary hover, halo plus 1px lift (gated, enabled only).
                          NL_PRIMARY_BUTTON_HOVER,
                        )}
                      >
                        {submitting && <Spinner />}
                        {submitting
                          ? AUTH_COPY.loading
                          : isSignup
                            ? AUTH_COPY.submit.signup
                            : AUTH_COPY.submit.signin}
                      </button>
                    </div>
                  </form>

                  <p className="nl-body-sm mt-nl-5 text-nl-soft text-center">
                    {isSignup ? AUTH_COPY.haveAccount : AUTH_COPY.newToLawie}
                    <Link
                      href={isSignup ? SIGNIN_HREF : SIGNUP_HREF}
                      scroll={false}
                      onMouseDown={keepFieldFocus}
                      onClick={() => {
                        focusFieldOnSwitch.current = true;
                      }}
                      className={cn(TEXT_LINK, 'inline-block py-3')}
                    >
                      {isSignup ? AUTH_COPY.switchToSignin : AUTH_COPY.switchToSignup}
                    </Link>
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      {/* /login is not in ANALYTICS_ALLOWED_PATHS, so Cookie settings would do nothing here. */}
      <NightFooter showCookieSettings={false} />
    </div>
  );
}

// useSearchParams in a client page needs a Suspense boundary for `next build`.
export default function LoginPage() {
  return (
    <Suspense fallback={<main className="nl nl-root min-h-[100svh]" />}>
      <LoginContent />
    </Suspense>
  );
}

'use client';

import { AlertTriangle, CheckCircle2, Circle, Eye, EyeOff, Gift, Loader2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';

import ReferralOfferModal from './ReferralOfferModal';

import { useAuth } from '@/context/AuthContext';
import { clearSignupSource, readSignupSource } from '@/lib/signup-source';

// T-234 — email + password sign-in and sign-up next to Google.
// Design: Rajesh (handoff/tickets/T-234-…md). Copy: "Final" column of
// handoff/marketing/copy/login-page-t234.md, signed by Ajay (handoff/legal/T-234-login-copy-signed.md).
// "Forgot password?" is deliberately not rendered until T-221 ships /forgot-password (AC3).

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
  | { kind: 'network' } // 429, 5xx, network
  | { kind: 'signInIncomplete' } // T-319: ?error=sign_in_incomplete from /auth/callback
  | { kind: 'insecureContext' }; // T-319: no crypto.subtle / getRandomValues (not https)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mirrors apps/auth/src/validators/auth.validator.ts registerSchema.password exactly:
// .min(8) · /[A-Z]/ · /[a-z]/ · /\d/. Change both together.
const PASSWORD_RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'One capital letter (A–Z)', test: (p) => /[A-Z]/.test(p) },
  { label: 'One small letter (a–z)', test: (p) => /[a-z]/.test(p) },
  { label: 'One number (0–9)', test: (p) => /\d/.test(p) },
];

const NETWORK_MESSAGE = 'Couldn’t reach Lawie. Check your connection and try again.';
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
  if (field === 'name') return value.trim() ? undefined : 'Enter your full name.';
  if (field === 'email') {
    if (!value.trim()) return 'Enter your email.';
    return EMAIL_RE.test(value.trim()) ? undefined : 'Enter a valid email, like name@gmail.com';
  }
  return value ? undefined : 'Enter your password.';
}

const inputBase =
  'h-12 w-full rounded-xl border bg-white px-4 text-base text-slate-900 transition focus:outline-none focus:ring-2 focus:ring-lawie-600';

function inputClass(invalid: boolean) {
  return `${inputBase} ${invalid ? 'border-red-700' : 'border-slate-500'}`;
}

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
    const next: Mode =
      e.key === 'Home' ? 'signin' : e.key === 'End' ? 'signup' : isSignup ? 'signin' : 'signup';
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

  const handleGoogleLogin = async () => {
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
    // Google sign-in creates a new account. Cleared here: after this redirect the tab is either
    // signed up (tags stored with the account) or signed in to an existing one (tags not used).
    const source = readSignupSource();
    if (source?.utmSource) params.set('utmSource', source.utmSource);
    if (source?.utmMedium) params.set('utmMedium', source.utmMedium);
    if (source?.utmCampaign) params.set('utmCampaign', source.utmCampaign);
    clearSignupSource();
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const fields: Field[] = isSignup ? ['name', 'email', 'password'] : ['email', 'password'];
    const errs: FieldErrors = {};
    for (const f of fields) {
      const msg = validateField(f, fieldValue(f));
      if (msg) errs[f] = msg;
    }
    setFieldErrors(errs);
    const firstInvalid = fields.find((f) => errs[f]);
    if (firstInvalid) {
      const refs = { name: nameRef, email: emailRef, password: passwordRef };
      refs[firstInvalid].current?.focus();
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
      setServerError({ kind: 'network' });
    }
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

  return (
    <>
      {showOfferModal && showReferralApplied && isSignup && (
        <ReferralOfferModal
          code={referralCode.trim().toUpperCase()}
          label={referralLabel}
          bonusInk={referralBonusInk}
          onClose={closeOfferModal}
          fallbackFocusRef={applyRef}
        />
      )}

      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50 px-4 pb-6 pt-4 sm:py-12">
        {/* Logo */}
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

        {/* Card */}
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl shadow-slate-200/60">
          <div className="p-5 sm:p-8">
            {referralNotice ? (
              <div role="status">
                <p className="flex items-start gap-2 text-base text-slate-900">
                  <AlertTriangle
                    className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"
                    aria-hidden="true"
                  />
                  <span>{referralNotice}</span>
                </p>
                <button
                  type="button"
                  onClick={() => router.replace('/dashboard')}
                  className="bg-lawie-600 hover:bg-lawie-700 mt-5 h-12 w-full rounded-xl text-base font-semibold text-white"
                >
                  Continue
                </button>
              </div>
            ) : (
              <>
                <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
                  {isSignup ? 'Create your Lawie account' : 'Sign in to Lawie'}
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  {isSignup
                    ? 'Set up your account and start your first draft.'
                    : 'Welcome back. Sign in to continue drafting.'}
                </p>

                {/* Mode switch */}
                <div
                  role="tablist"
                  aria-label="Sign in or create account"
                  className="mt-4 grid grid-cols-2 rounded-xl bg-slate-100 p-1 sm:mt-5"
                >
                  {(
                    [
                      ['signin', 'Sign in'],
                      ['signup', 'Create account'],
                    ] as const
                  ).map(([m, label]) => {
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
                        className={`h-11 rounded-lg text-sm font-semibold transition ${
                          selected
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                <div id="auth-panel" role="tabpanel" aria-labelledby={`tab-${mode}`}>
                  {/* Referral code — SCRUM-71, Create account only (Priya decision 2) */}
                  {isSignup && (
                    <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <Gift size={14} className="text-amber-600" aria-hidden="true" />
                        <label
                          htmlFor="referral-code"
                          className="text-sm font-semibold text-slate-800"
                        >
                          Have a referral code?
                        </label>
                      </div>
                      <div className="flex gap-2">
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
                          aria-describedby={
                            referralValid !== null ? 'referral-feedback' : undefined
                          }
                          className="focus:ring-lawie-600 h-12 min-w-0 flex-1 rounded-lg border border-slate-500 bg-white px-3 font-mono text-base uppercase tracking-widest text-slate-900 placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-500 focus:outline-none focus:ring-2"
                        />
                        <button
                          ref={applyRef}
                          type="button"
                          onClick={() => void handleApply()}
                          disabled={!referralCode.trim() || validating}
                          className="h-12 shrink-0 rounded-lg bg-slate-900 px-4 text-base font-semibold text-white hover:bg-slate-700 active:scale-[0.98] disabled:opacity-40"
                        >
                          {validating ? 'Checking…' : 'Apply'}
                        </button>
                      </div>

                      {/* Inline feedback */}
                      {showReferralApplied && (
                        <p
                          id="referral-feedback"
                          className="mt-2 flex items-start gap-1.5 text-sm text-green-700"
                        >
                          <CheckCircle2 size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
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
                          className="mt-2 flex items-start gap-1.5 text-sm text-red-700"
                        >
                          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                          <span>
                            This code isn&apos;t valid or has expired. Check it and try again.
                          </span>
                        </p>
                      )}
                    </div>
                  )}

                  {/* Google OAuth */}
                  <button
                    onClick={() => void handleGoogleLogin()}
                    type="button"
                    className="mt-4 flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-500 bg-white px-4 text-base font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-[0.98] sm:mt-5"
                  >
                    <GoogleIcon />
                    Continue with Google
                  </button>

                  <div className="my-4 flex items-center gap-3 sm:my-5">
                    <div className="h-px flex-1 bg-slate-200" />
                    <span className="text-sm text-slate-600">or with email</span>
                    <div className="h-px flex-1 bg-slate-200" />
                  </div>

                  <form onSubmit={handleSubmit} noValidate className="space-y-4">
                    {isSignup && (
                      <div>
                        <label
                          htmlFor="name"
                          className="mb-1.5 block text-sm font-medium text-slate-700"
                        >
                          Full name
                        </label>
                        <input
                          ref={nameRef}
                          id="name"
                          type="text"
                          autoComplete="name"
                          value={name}
                          onChange={(e) => onChangeField('name', e.target.value)}
                          onBlur={() => onBlurField('name')}
                          aria-invalid={isInvalid('name') || undefined}
                          aria-describedby={describedBy(fieldErrors.name && 'name-error')}
                          className={inputClass(isInvalid('name'))}
                        />
                        {fieldErrors.name && (
                          <p id="name-error" className="mt-1.5 text-sm text-red-700">
                            {fieldErrors.name}
                          </p>
                        )}
                      </div>
                    )}

                    <div>
                      <label
                        htmlFor="email"
                        className="mb-1.5 block text-sm font-medium text-slate-700"
                      >
                        Email
                      </label>
                      <input
                        ref={emailRef}
                        id="email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => onChangeField('email', e.target.value)}
                        onBlur={() => onBlurField('email')}
                        aria-invalid={isInvalid('email') || undefined}
                        aria-describedby={describedBy(fieldErrors.email && 'email-error')}
                        className={inputClass(isInvalid('email'))}
                      />
                      {fieldErrors.email && (
                        <p id="email-error" className="mt-1.5 text-sm text-red-700">
                          {fieldErrors.email}
                        </p>
                      )}
                    </div>

                    <div>
                      {/* "Forgot password?" goes in this row (right-aligned, Sign in only, a
                          <Link href="/forgot-password"> with a 44 px hit area) once T-221 ships.
                          Not rendered until then (AC3). */}
                      <label
                        htmlFor="password"
                        className="mb-1.5 block text-sm font-medium text-slate-700"
                      >
                        Password
                      </label>
                      <div className="relative">
                        <input
                          ref={passwordRef}
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete={isSignup ? 'new-password' : 'current-password'}
                          value={password}
                          onChange={(e) => onChangeField('password', e.target.value)}
                          onBlur={() => onBlurField('password')}
                          aria-invalid={isInvalid('password') || undefined}
                          aria-describedby={describedBy(
                            fieldErrors.password && 'password-error',
                            isSignup && 'password-rules',
                          )}
                          className={`${inputClass(isInvalid('password'))} pr-12`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((p) => !p)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          className="absolute right-0 top-0 flex h-12 w-12 items-center justify-center rounded-r-xl text-slate-600 transition-colors hover:text-slate-900"
                        >
                          {showPassword ? (
                            <EyeOff className="h-5 w-5" aria-hidden="true" />
                          ) : (
                            <Eye className="h-5 w-5" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                      {fieldErrors.password && (
                        <p id="password-error" className="mt-1.5 text-sm text-red-700">
                          {fieldErrors.password}
                        </p>
                      )}
                      {isSignup && (
                        <div id="password-rules" className="mt-2 text-sm text-slate-600">
                          <p>Your password needs:</p>
                          <ul className="mt-1 space-y-1">
                            {PASSWORD_RULES.map((rule) => {
                              const met = rule.test(password);
                              return (
                                <li key={rule.label} className="flex items-center gap-2">
                                  {met ? (
                                    <CheckCircle2
                                      className="h-4 w-4 shrink-0 text-slate-900"
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <Circle
                                      className="h-4 w-4 shrink-0 text-slate-500"
                                      aria-hidden="true"
                                    />
                                  )}
                                  <span className={met ? 'text-slate-900' : undefined}>
                                    {rule.label}
                                  </span>
                                  <span className="sr-only">{met ? '(done)' : '(not yet)'}</span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Error summary — directly above submit */}
                    {serverError && (
                      <div
                        ref={summaryRef}
                        role="alert"
                        tabIndex={-1}
                        className="flex items-start gap-2.5 rounded-xl bg-red-50 p-4 text-sm text-red-700 focus:outline-none focus:ring-2 focus:ring-red-700"
                      >
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <div>
                          {serverError.kind === 'list' &&
                            (serverError.items.length > 1 ? (
                              <>
                                <p className="font-semibold">Please check the following:</p>
                                <ul className="mt-1 list-disc space-y-0.5 pl-5">
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
                                className="font-semibold underline hover:text-red-900"
                              >
                                Sign in instead
                              </Link>
                            </p>
                          )}
                          {serverError.kind === 'unauthorized' && (
                            <>
                              <p>Email or password is incorrect.</p>
                              <p className="mt-1">
                                Signed up with Google? Use Continue with Google above.
                              </p>
                            </>
                          )}
                          {serverError.kind === 'message' && <p>{serverError.message}</p>}
                          {serverError.kind === 'accountDeactivated' && (
                            <p>
                              {DEACTIVATED_LEAD}{' '}
                              <Link
                                href={CONTACT_HREF}
                                className="font-semibold underline hover:text-red-900"
                              >
                                {DEACTIVATED_LINK_TEXT}
                              </Link>
                              .
                            </p>
                          )}
                          {serverError.kind === 'oauthFailed' && <p>{OAUTH_FAILED_MESSAGE}</p>}
                          {serverError.kind === 'network' && <p>{NETWORK_MESSAGE}</p>}
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
                        className="bg-lawie-600 shadow-lawie-600/25 hover:bg-lawie-700 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-semibold text-white shadow-lg transition-all active:scale-[0.98] disabled:cursor-wait disabled:opacity-80"
                      >
                        {submitting && (
                          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                        )}
                        {submitting
                          ? isSignup
                            ? 'Creating your account…'
                            : 'Signing in…'
                          : isSignup
                            ? 'Create account'
                            : 'Sign in'}
                      </button>

                      {/* Consent line — Ajay, 11 Oct 2026. Word for word; no edits without his
                          sign-off. Directly under submit, both modes, covers Google too. No checkbox. */}
                      <p className="mt-3 text-sm text-slate-600">
                        By continuing, you agree to Lawie&apos;s{' '}
                        <Link
                          href="/terms"
                          target="_blank"
                          rel="noopener"
                          className="underline hover:text-slate-900"
                        >
                          Terms of Service
                        </Link>{' '}
                        and confirm you have read our{' '}
                        <Link
                          href="/privacy"
                          target="_blank"
                          rel="noopener"
                          className="underline hover:text-slate-900"
                        >
                          Privacy Policy
                        </Link>
                        .
                      </p>
                    </div>
                  </form>

                  <p className="mt-5 text-center text-sm text-slate-600">
                    {isSignup ? 'Already have an account? ' : 'New to Lawie? '}
                    <Link
                      href={isSignup ? SIGNIN_HREF : SIGNUP_HREF}
                      scroll={false}
                      onMouseDown={keepFieldFocus}
                      onClick={() => {
                        focusFieldOnSwitch.current = true;
                      }}
                      className="text-lawie-700 inline-block py-3 font-semibold hover:underline"
                    >
                      {isSignup ? 'Sign in' : 'Create an account'}
                    </Link>
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        <p className="mt-6 max-w-sm text-center text-xs text-slate-600 sm:mt-8">
          Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.
          <br />
          <Link href="/terms" className="underline hover:text-slate-900">
            Terms
          </Link>{' '}
          ·{' '}
          <Link href="/privacy" className="underline hover:text-slate-900">
            Privacy
          </Link>
        </p>
      </main>
    </>
  );
}

// useSearchParams in a client page needs a Suspense boundary for `next build`.
export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-50" />}>
      <LoginContent />
    </Suspense>
  );
}

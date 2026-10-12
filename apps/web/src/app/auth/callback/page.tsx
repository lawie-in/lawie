'use client';

import { AlertTriangle } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/context/AuthContext';

// T-234 — one-time notices when a referral code sent with Google added no Ink.
// not_applied: Ajay Addendum 1. existing_account: Ajay Addendum 2.
// Both signed in handoff/legal/T-234-login-copy-signed.md.
// not_applied has two wordings: Addendum 1 if R5/R6 showed for the code, Addendum 3 if it was
// never applied. The login page records which in sessionStorage (REFERRAL_SHOWN_KEY) before the
// Google redirect; missing or unreadable means "not valid", which makes no claim the code ever was.
const REFERRAL_NOT_APPLIED_MESSAGE =
  'Your referral code was no longer valid, so no bonus Ink was added.';
const REFERRAL_NOT_VALID_MESSAGE = 'Your referral code was not valid, so no bonus Ink was added.';
const REFERRAL_EXISTING_ACCOUNT_MESSAGE =
  'Referral bonuses are for new accounts only, so no bonus Ink was added.';
const REFERRAL_SHOWN_KEY = 'lawie_referral_shown';

// Reads and clears the marker, so it applies to this sign-in only.
function takeReferralShown(): boolean {
  try {
    const shown = sessionStorage.getItem(REFERRAL_SHOWN_KEY) === '1';
    sessionStorage.removeItem(REFERRAL_SHOWN_KEY);
    return shown;
  } catch {
    return false;
  }
}

function referralNoticeFor(value: string | null): string | null {
  const shown = takeReferralShown();
  if (value === 'existing_account') return REFERRAL_EXISTING_ACCOUNT_MESSAGE;
  if (value === 'not_applied') {
    return shown ? REFERRAL_NOT_APPLIED_MESSAGE : REFERRAL_NOT_VALID_MESSAGE;
  }
  return null;
}

function CallbackHandler() {
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useAuth();
  const handled = useRef(false);
  // T-234: the auth service adds referral=not_applied (new account, code no longer valid) or
  // referral=existing_account (account already existed). Show the notice once, then continue.
  const [referralNotice, setReferralNotice] = useState<string | null>(null);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const accessToken = params.get('accessToken');
    const refreshToken = params.get('refreshToken');
    const error = params.get('error');

    if (error) {
      router.replace('/login?error=' + error);
      return;
    }

    if (!accessToken || !refreshToken) {
      router.replace('/login?error=missing_tokens');
      return;
    }

    login(accessToken, refreshToken);
    const notice = referralNoticeFor(params.get('referral'));
    if (notice) {
      // Drop the tokens from the address bar while the notice is on screen.
      window.history.replaceState(null, '', '/auth/callback');
      setReferralNotice(notice);
      return;
    }
    router.replace('/dashboard');
  }, [params, login, router]);

  if (!referralNotice) return null;

  // Same look as the email-path notice on the login page.
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#F8FAFC] px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-5 shadow-xl shadow-slate-200/60 sm:p-8">
        <div role="status">
          <p className="flex items-start gap-2 text-base text-slate-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
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
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  // Visually identical to DashboardLayout's loading-state spinner so the
  // user sees one continuous loading screen during the OAuth → dashboard
  // handoff. No "Signing you in…" label — the callback typically takes
  // ~150ms and a transient label reads as a context switch.
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
      <Suspense>
        <CallbackHandler />
      </Suspense>
    </div>
  );
}

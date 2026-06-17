'use client';

import { Eye, EyeOff, AlertTriangle, CheckCircle2, Tag, Gift, X, Zap } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

// Founder decision 2026-05-17: Google OAuth is the only sign-in for Phase 1.
// Keep the email/password code path intact (handlers, state, JSX block below)
// so we can flip the flag back if Google ever goes down or a regulator demands
// non-OAuth fallback. Flipping `ENABLE_PASSWORD_LOGIN = true` restores it.
const ENABLE_PASSWORD_LOGIN = false;

function ReferralOfferModal({
  code,
  label,
  bonusDrafts,
  onAccept,
  onClose,
}: {
  code: string;
  label: string;
  bonusDrafts: number;
  onAccept: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header band */}
        <div
          className="relative overflow-hidden px-6 py-5"
          style={{ background: 'linear-gradient(135deg, #b45309 0%, #d97706 60%, #f59e0b 100%)' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full p-1 text-white/60 hover:bg-white/20 hover:text-white"
          >
            <X size={15} />
          </button>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/25">
              <Gift size={18} className="text-white" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-100">
                Referral offer
              </p>
              <h2 className="mt-0.5 text-lg font-bold text-white">You&apos;ve been invited!</h2>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {/* Code chip */}
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <Tag size={14} className="shrink-0 text-amber-600" />
            <span className="font-mono text-sm font-bold tracking-widest text-amber-800">
              {code}
            </span>
            {label && <span className="ml-auto text-xs text-amber-700">{label}</span>}
          </div>

          {/* What you get */}
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            What you get
          </p>
          <ul className="space-y-2.5">
            <li className="flex items-start gap-2.5 text-sm text-slate-700">
              <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-green-500" />
              <span>
                <strong>{bonusDrafts} bonus drafts</strong> credited on first sign-in
              </span>
            </li>
            <li className="flex items-start gap-2.5 text-sm text-slate-700">
              <Zap size={15} className="mt-0.5 shrink-0 text-amber-500" />
              <span>Stacks with your free daily login bonus</span>
            </li>
            <li className="flex items-start gap-2.5 text-sm text-slate-700">
              <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-green-500" />
              <span>No credit card required — start drafting immediately</span>
            </li>
          </ul>

          {/* CTA */}
          <button
            type="button"
            onClick={onAccept}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white hover:bg-slate-700 active:scale-[0.98]"
          >
            Claim offer &amp; continue with Google
          </button>
          <p className="mt-2 text-center text-[11px] text-slate-400">
            Bonus applied automatically after sign-in
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice] = useState('Sign in with Google to continue.');

  // Referral code — SCRUM-71
  const [referralCode, setReferralCode] = useState('');
  const [referralValid, setReferralValid] = useState<boolean | null>(null);
  const [referralLabel, setReferralLabel] = useState('');
  const [referralBonusDrafts, setReferralBonusDrafts] = useState(0);
  const [validating, setValidating] = useState(false);
  const [showOfferModal, setShowOfferModal] = useState(false);

  const validateCode = async (code: string) => {
    if (!code) {
      setReferralValid(null);
      return;
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
        setReferralBonusDrafts(data.bonusDrafts ?? 0);
      }
    } catch {
      setReferralValid(null);
    } finally {
      setValidating(false);
    }
  };

  const handleApply = async () => {
    const code = referralCode.trim().toUpperCase();
    if (!code) return;
    await validateCode(code);
    // modal is shown only after validation confirms valid
    setShowOfferModal(true);
  };

  const handleEmailLogin = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Email/password login coming soon. Please use Google sign-in.');
  };

  const handleGoogleLogin = () => {
    const code = referralCode.trim().toUpperCase();
    if (code) sessionStorage.setItem('lawie_referral_code', code);
    const base = `${process.env.NEXT_PUBLIC_API_URL}/api/auth/google`;
    const url = code ? `${base}?referralCode=${encodeURIComponent(code)}` : base;
    window.location.href = url;
  };

  return (
    <>
      {showOfferModal && referralValid === true && (
        <ReferralOfferModal
          code={referralCode.trim().toUpperCase()}
          label={referralLabel}
          bonusDrafts={referralBonusDrafts}
          onAccept={() => {
            setShowOfferModal(false);
            handleGoogleLogin();
          }}
          onClose={() => setShowOfferModal(false)}
        />
      )}

      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50 px-4 py-12">
        {/* Logo */}
        <Link href="/" className="mb-8">
          <Image
            src="/assets/lawie-lockup.png"
            alt="Lawie"
            width={210}
            height={48}
            className="h-28 w-auto"
            priority
          />
        </Link>

        {/* Card */}
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl shadow-slate-200/60">
          {/* Dev notice banner */}
          <div className="flex items-start gap-2.5 border-b border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{notice}</span>
          </div>

          <div className="p-8">
            <h1 className="text-2xl font-bold text-slate-900">Sign in to Lawie</h1>
            <p className="mt-1.5 text-sm text-slate-500">
              Access your AI legal drafting workspace.
            </p>

            {/* Referral code — SCRUM-71 */}
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Gift size={14} className="text-amber-500" />
                <span className="text-sm font-semibold text-slate-800">Have a referral code?</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. LWPATNA1"
                  value={referralCode}
                  onChange={(e) => {
                    setReferralCode(e.target.value.toUpperCase());
                    setReferralValid(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && void handleApply()}
                  maxLength={16}
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm uppercase tracking-widest text-slate-900 placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <button
                  type="button"
                  onClick={() => void handleApply()}
                  disabled={!referralCode.trim() || validating}
                  className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 active:scale-[0.98] disabled:opacity-40"
                >
                  {validating ? 'Checking…' : 'Apply'}
                </button>
              </div>

              {/* Inline feedback */}
              {referralValid === true && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-green-700">
                  <CheckCircle2 size={12} />
                  Code accepted{referralLabel ? ` — ${referralLabel}` : ''}.{' '}
                  {referralBonusDrafts > 0
                    ? `${referralBonusDrafts} bonus drafts on signup.`
                    : 'Bonus credited on signup.'}
                </p>
              )}
              {referralValid === false && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-red-500">
                  <AlertTriangle size={12} />
                  Code not recognised or no longer active.
                </p>
              )}
            </div>

            {/* Google OAuth */}
            <button
              onClick={handleGoogleLogin}
              type="button"
              className="mt-5 flex w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-[0.98]"
            >
              <svg
                className="h-5 w-5 shrink-0"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
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
              Continue with Google
            </button>

            {ENABLE_PASSWORD_LOGIN && (
              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-xs font-medium text-slate-400">or continue with email</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
            )}

            {ENABLE_PASSWORD_LOGIN && (
              <form onSubmit={handleEmailLogin} className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@legalfirm.com"
                    className="focus:ring-lawie-600 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 transition placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2"
                  />
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                      Password
                    </label>
                    <span className="text-lawie-600 hover:text-lawie-700 cursor-pointer text-xs font-medium">
                      Forgot password?
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="focus:ring-lawie-600 w-full rounded-xl border border-slate-300 px-4 py-3 pr-11 text-sm text-slate-900 transition placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4.5 w-4.5" />
                      ) : (
                        <Eye className="h-4.5 w-4.5" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="bg-lawie-600 shadow-lawie-600/25 hover:bg-lawie-700 mt-2 w-full rounded-xl py-3 text-sm font-semibold text-white shadow-lg transition-all active:scale-[0.98]"
                >
                  Sign in
                </button>
              </form>
            )}

            <p className="mt-6 text-center text-sm text-slate-500">
              New advocate?{' '}
              <span className="text-slate-700">Sign in with Google to create your account.</span>
            </p>
          </div>
        </div>

        <p className="mt-8 max-w-sm text-center text-xs text-slate-400">
          AI-assisted drafting tool — not a substitute for legal advice.
          <br />
          <Link href="/terms" className="underline hover:text-slate-600">
            Terms
          </Link>{' '}
          ·{' '}
          <Link href="/privacy" className="underline hover:text-slate-600">
            Privacy
          </Link>
        </p>
      </main>
    </>
  );
}

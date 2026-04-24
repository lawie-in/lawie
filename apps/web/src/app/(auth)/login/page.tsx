'use client';

import { Eye, EyeOff, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import LawieLogoMark from '@/components/LawieLogoMark';

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice] = useState('Email/password login coming soon. Use Google to sign in now.');

  const handleEmailLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Email/password auth is SCRUM-9 — not yet implemented
    alert('Email/password login coming soon. Please use Google sign-in.');
  };

  const handleGoogleLogin = () => {
    // Full-page redirect to the auth service OAuth flow
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/api/auth/google`;
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50 px-4 py-12">
      {/* Logo */}
      <Link href="/" className="mb-8">
        <LawieLogoMark variant="dark" className="h-12 w-auto" />
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
          <p className="mt-1.5 text-sm text-slate-500">Access your AI legal drafting workspace.</p>

          {/* Google OAuth */}
          <button
            onClick={handleGoogleLogin}
            type="button"
            className="mt-7 flex w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-[0.98]"
          >
            {/* Google SVG icon */}
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

          {/* Divider */}
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-medium text-slate-400">or continue with email</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          {/* Email + Password form */}
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
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

          <p className="mt-6 text-center text-sm text-slate-500">
            Don&apos;t have an account?{' '}
            <span className="text-lawie-600 hover:text-lawie-700 cursor-pointer font-medium">
              Sign up — coming soon
            </span>
          </p>
        </div>
      </div>

      {/* Disclaimer */}
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
  );
}

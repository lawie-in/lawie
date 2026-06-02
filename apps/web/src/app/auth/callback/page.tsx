'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';

import { useAuth } from '@/context/AuthContext';

function CallbackHandler() {
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useAuth();
  const handled = useRef(false);

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
    router.replace('/dashboard');
  }, [params, login, router]);

  return null;
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

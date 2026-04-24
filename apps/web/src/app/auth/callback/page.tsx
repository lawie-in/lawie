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
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="border-lawie-600 inline-block h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
        <p className="mt-4 text-sm text-slate-500">Signing you in…</p>
      </div>
      <Suspense>
        <CallbackHandler />
      </Suspense>
    </div>
  );
}

'use client';

import { CheckCircle2, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { getRefreshToken, saveTokens } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Razorpay redirects here after successful subscription payment.
 * We call /auth/refresh to get a new JWT that reflects plan: 'pro',
 * update the stored tokens, then send the user to the dashboard.
 */
export default function PaymentSuccessPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [status, setStatus] = useState<'refreshing' | 'done' | 'error'>('refreshing');

  useEffect(() => {
    async function activate() {
      try {
        // Give the webhook a moment to land and upgrade plan in DB
        await new Promise((r) => setTimeout(r, 2500));

        const refreshToken = getRefreshToken();
        if (!refreshToken) {
          // No token — just redirect, user will see updated plan on next login
          setStatus('done');
          setTimeout(() => router.replace('/dashboard'), 1500);
          return;
        }

        const res = await fetch(`${API_URL}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });

        if (res.ok) {
          const data = await res.json();
          const { accessToken, refreshToken: newRefreshToken } = data.data ?? data;
          saveTokens(accessToken, newRefreshToken);
          login(accessToken, newRefreshToken);
        }
        // If refresh fails, still redirect — plan will update on next login
      } finally {
        setStatus('done');
        setTimeout(() => router.replace('/dashboard'), 1500);
      }
    }
    activate();
  }, [login, router]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      {status === 'refreshing' ? (
        <>
          <Loader2 size={32} className="animate-spin text-amber-500" />
          <p className="text-sm font-medium text-slate-700">Activating your Pro plan…</p>
          <p className="text-xs text-slate-400">This only takes a moment.</p>
        </>
      ) : (
        <>
          <CheckCircle2 size={40} className="text-green-500" />
          <p className="text-lg font-bold text-slate-900">Welcome to Lawie Pro!</p>
          <p className="text-sm text-slate-500">Redirecting you to the dashboard…</p>
        </>
      )}
    </div>
  );
}

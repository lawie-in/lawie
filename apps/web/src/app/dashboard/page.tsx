'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useAuth } from '@/context/AuthContext';

export default function DashboardPage() {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();

  // Redirect to login if no valid session
  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="border-lawie-600 inline-block h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              Welcome, {user.name.split(' ')[0]}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {user.email} · {user.plan === 'pro' ? 'Pro plan' : 'Free plan'}
            </p>
          </div>
          <button
            onClick={() => {
              logout();
              router.replace('/login');
            }}
            className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
          >
            Sign out
          </button>
        </div>

        {/* Placeholder widgets — Sprint 2 */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {['Cases', 'Documents', 'Clients'].map((item) => (
            <div key={item} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-700">{item}</h2>
              <p className="mt-1 text-sm text-slate-400">Coming in Sprint 2</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

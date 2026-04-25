'use client';

import { useRouter } from 'next/navigation';

import { useAuth } from '@/context/AuthContext';
import { useUsage } from '@/hooks/useUsage';

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { data: usage } = useUsage();
  const router = useRouter();

  if (!user) return null;

  const isPro = user.plan === 'pro';

  function handleSignOut() {
    logout();
    router.replace('/login');
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Settings</h1>

      {/* Profile */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Profile</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-slate-500">Name</label>
            <input
              type="text"
              defaultValue={user.name}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500">Email</label>
            <input
              type="email"
              defaultValue={user.email}
              disabled
              className="mt-1 w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500">Bar Council</label>
            <input
              type="text"
              placeholder="e.g. Bar Council of Delhi"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500">Enrollment Number</label>
            <input
              type="text"
              placeholder="e.g. D/123/2018"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
            />
          </div>
        </div>
        <button className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-700">
          Save changes
        </button>
      </div>

      {/* Plan */}
      <div
        className={`mt-4 rounded-xl border p-6 shadow-sm ${
          isPro ? 'border-[#86EFAC] bg-[#F0FDF4]' : 'border-[#FDE68A] bg-[#FFF7ED]'
        }`}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">Plan</h2>
            {isPro ? (
              <>
                <p className="mt-1 text-sm text-slate-700">Unlimited documents</p>
                <p className="text-xs text-slate-400">Next billing cycle — managed via Razorpay</p>
              </>
            ) : (
              <p className="mt-1 text-sm text-slate-600">
                {usage?.used ?? 0} of {usage?.limit ?? 3} documents used —{' '}
                <span className="font-medium">{usage?.remaining ?? 3} remaining</span>
              </p>
            )}
          </div>
          {isPro && (
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
              Active
            </span>
          )}
        </div>

        {!isPro && (
          <>
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL}/api/billing/subscribe`}
              className="mt-4 inline-block rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-amber-600"
            >
              Upgrade to Pro — ₹799/month
            </a>
            <ul className="mt-4 space-y-1.5 text-xs text-slate-500">
              <li>✓ Unlimited document generations</li>
              <li>✓ All document types (bail, notice, agreements, complaints)</li>
              <li>✓ BNS / IPC section auto-fill</li>
              <li>✓ Priority support</li>
            </ul>
          </>
        )}

        {isPro && (
          <div className="mt-4 flex gap-2">
            <button className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50">
              Cancel subscription
            </button>
            <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50">
              Manage on Razorpay
            </button>
          </div>
        )}
      </div>

      {/* Sign out */}
      <div className="mt-8 border-t border-slate-200 pt-6">
        <button onClick={handleSignOut} className="text-xs text-slate-400 hover:text-slate-600">
          Sign out of Lawie
        </button>
      </div>
    </div>
  );
}

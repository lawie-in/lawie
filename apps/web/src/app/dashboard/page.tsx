'use client';

import { Scale, Home, Megaphone, AlignLeft } from 'lucide-react';
import Link from 'next/link';

import { useAuth } from '@/context/AuthContext';
import { useUsage } from '@/hooks/useUsage';

const QUICK_CREATE = [
  {
    label: 'Bail application',
    borderColor: 'border-t-blue-400',
    iconColor: 'text-blue-400',
    icon: Scale,
    href: '/dashboard/new?type=bail',
  },
  {
    label: 'Legal notice',
    borderColor: 'border-t-amber-400',
    iconColor: 'text-amber-400',
    icon: Megaphone,
    href: '/dashboard/new?type=notice',
  },
  {
    label: 'Rent agreement',
    borderColor: 'border-t-green-400',
    iconColor: 'text-green-400',
    icon: Home,
    href: '/dashboard/new?type=rent',
  },
  {
    label: 'Consumer complaint',
    borderColor: 'border-t-purple-400',
    iconColor: 'text-purple-400',
    icon: AlignLeft,
    href: '/dashboard/new?type=consumer',
  },
];

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getLastName(name: string): string {
  return name.split(' ').pop() ?? name;
}

function QuickCreateGrid() {
  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-700">Quick create</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {QUICK_CREATE.map(({ label, borderColor, iconColor, icon: Icon, href }) => (
          <Link
            key={label}
            href={href}
            className={`rounded-xl border border-t-[3px] border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${borderColor}`}
          >
            <Icon size={20} className={iconColor} />
            <p className="mt-2 text-sm font-semibold text-slate-800">{label}</p>
            <p className="mt-1 text-xs text-blue-500">Create new →</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function RecentDocumentsTable() {
  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-700">Recent documents</h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Title</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={4} className="px-4 py-10 text-center text-xs text-slate-400">
                No documents yet — use Quick create above to draft your first one
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: usage, loading: usageLoading } = useUsage();

  if (!user) return null;

  const isPro = user.plan === 'pro';
  const docCount = usage?.used ?? 0;
  const lastName = getLastName(user.name);

  // ── Empty state — free user, 0 documents ──────────────────────────────────
  if (!isPro && !usageLoading && docCount === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Welcome to Lawie, <span className="text-amber-500">Advocate {lastName}</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          You have {usage?.limit ?? 3} free documents this month. Let&apos;s draft your first one.
        </p>

        <div className="mt-16 flex flex-col items-center text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-50 ring-8 ring-amber-100">
            <Scale size={34} className="text-amber-500" />
          </div>
          <h2 className="mt-6 text-xl font-bold text-slate-900">
            Create your first court-ready document
          </h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
            Draft a bail application, legal notice, or rent agreement — formatted for your court,
            with the right BNS sections, in under 5 minutes.
          </p>
          <Link
            href="/dashboard/new"
            className="mt-6 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50"
          >
            Start drafting →
          </Link>
          <p className="mt-3 text-xs text-slate-400">
            Free plan: {usage?.limit ?? 3} documents/month — no credit card required
          </p>
        </div>
      </div>
    );
  }

  // ── Pro user or free user with documents ─────────────────────────────────
  return (
    <div className="space-y-8">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {getGreeting()}, <span className="text-amber-500">Advocate {lastName}</span>
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {isPro
            ? 'Unlimited documents — draft as much as you need'
            : `You have ${usage?.remaining ?? 0} document${usage?.remaining === 1 ? '' : 's'} remaining this month`}
        </p>
      </div>

      {/* Usage / Pro banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        {isPro ? (
          <>
            <div>
              <p className="text-sm font-semibold text-slate-700">Pro plan — unlimited documents</p>
              <p className="mt-0.5 text-xs text-slate-400">
                {docCount} documents drafted this month
              </p>
            </div>
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
              Pro member
            </span>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              {/* Usage dots */}
              <div className="flex items-center gap-1.5">
                {Array.from({ length: usage?.limit ?? 3 }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-5 w-5 rounded-full border-2 transition-colors ${
                      i < docCount
                        ? 'border-amber-500 bg-amber-500'
                        : 'border-amber-300 bg-transparent'
                    }`}
                  />
                ))}
              </div>
              <p className="text-sm text-slate-600">
                {docCount} of {usage?.limit ?? 3} documents used
              </p>
            </div>
            <Link
              href="/dashboard/settings"
              className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-amber-600"
            >
              Upgrade to Pro — ₹799/mo
            </Link>
          </>
        )}
      </div>

      <QuickCreateGrid />
      <RecentDocumentsTable />
    </div>
  );
}

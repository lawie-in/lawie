'use client';

/**
 * /admin — Founder home / Operations overview.
 *
 * Design: docs/Admin Panel Design/Founder home _ KPIs_ activity_ system status.png
 *
 * Layout chrome lives in apps/web/src/app/admin/layout.tsx. This page renders:
 *   • Top: title + Export CSV + New referral code shortcut
 *   • 5 KPI tiles (active advocates, drafts, panel reviews pending, free→paid, ink in circulation)
 *   • Two-column body: Recent activity (left, ~60%) + side rail (right, ~40%)
 *     — side rail stacks AI runtime + monthly revenue
 *   • Bottom: Top referral codes table
 */

import { Download, Loader2, PlusCircle, Sparkles, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { apiFetch } from '@/lib/apiFetch';

interface Kpis {
  activeAdvocates: { value: number; deltaWeek: number };
  draftsGenerated: { value: number; deltaPct: number };
  panelReviewsPending: { value: number; overdue: number };
  conversion: { valuePct: number; deltaPct: number };
  monthlyRevenue: { inr: number; paid: number; newPaid: number; churn: number };
  inkCirculation?: number;
}

interface ActivityItem {
  type: 'signup' | 'draft' | 'review' | 'redemption' | 'topup';
  label: string;
  detail: string;
  at: string;
}

interface AiRuntime {
  drafting_model: string | null;
  preflight_model: string | null;
}

interface TopReferral {
  code: string;
  label?: string;
  uses: number;
  maxUses: number | null;
  isActive: boolean;
  createdAt: string;
}

type ActivityTab = 'all' | 'signups' | 'drafts' | 'reviews' | 'topups';

const ACTIVITY_TAB_LABELS: { key: ActivityTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'signups', label: 'Signups' },
  { key: 'drafts', label: 'Drafts' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'topups', label: 'Topups' },
];

const ACTIVITY_TYPE_MAP: Record<ActivityTab, ActivityItem['type'][]> = {
  all: ['signup', 'draft', 'review', 'redemption', 'topup'],
  signups: ['signup'],
  drafts: ['draft'],
  reviews: ['review'],
  topups: ['topup', 'redemption'],
};

export default function AdminOverviewPage() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityTab, setActivityTab] = useState<ActivityTab>('all');
  const [aiRuntime, setAiRuntime] = useState<AiRuntime | null>(null);
  const [topReferrals, setTopReferrals] = useState<TopReferral[]>([]);
  const [loading, setLoading] = useState(true);
  const [csvExporting, setCsvExporting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [kpisRes, actRes, runtimeRes, refsRes] = await Promise.all([
          apiFetch('/api/drafting/admin/overview/kpis'),
          apiFetch('/api/drafting/admin/overview/activity'),
          apiFetch('/api/drafting/admin/overview/ai-runtime'),
          apiFetch('/api/auth/admin/referral-codes'),
        ]);
        if (kpisRes.ok) setKpis(await kpisRes.json());
        if (actRes.ok) setActivity((await actRes.json()).items ?? []);
        if (runtimeRes.ok) setAiRuntime(await runtimeRes.json());
        if (refsRes.ok) {
          const body = await refsRes.json();
          setTopReferrals(
            ((body.codes ?? []) as TopReferral[])
              .slice()
              .sort((a, b) => b.uses - a.uses)
              .slice(0, 5),
          );
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredActivity = activity.filter((it) =>
    ACTIVITY_TYPE_MAP[activityTab].includes(it.type),
  );

  const handleExportCsv = async () => {
    setCsvExporting(true);
    try {
      const res = await apiFetch('/api/drafting/admin/overview/activity?format=csv');
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lawie-activity-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setCsvExporting(false);
    }
  };

  return (
    <div>
      <AdminPageHeader title="Operations overview" eyebrow="Updated just now">
        <button
          type="button"
          onClick={() => void handleExportCsv()}
          disabled={csvExporting}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {csvExporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          Export CSV
        </button>
        <Link
          href="/admin/referral-codes"
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-700"
        >
          <PlusCircle size={13} /> New referral code
        </Link>
      </AdminPageHeader>

      {loading && (
        <div className="flex items-center gap-2 py-10 text-sm text-slate-400">
          <Loader2 size={14} className="animate-spin" />
          Loading overview…
        </div>
      )}

      {/* KPI tiles */}
      {kpis && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
          <KpiTile
            label="Active advocates"
            value={kpis.activeAdvocates.value.toLocaleString('en-IN')}
            delta={
              kpis.activeAdvocates.deltaWeek > 0
                ? `+${kpis.activeAdvocates.deltaWeek} this week`
                : 'No change this week'
            }
            positive={kpis.activeAdvocates.deltaWeek > 0}
          />
          <KpiTile
            label="Drafts generated"
            value={kpis.draftsGenerated.value.toLocaleString('en-IN')}
            delta={
              kpis.draftsGenerated.deltaPct >= 0
                ? `+${kpis.draftsGenerated.deltaPct}% vs last week`
                : `${kpis.draftsGenerated.deltaPct}% vs last week`
            }
            positive={kpis.draftsGenerated.deltaPct >= 0}
          />
          <KpiTile
            label="Panel reviews pending"
            value={String(kpis.panelReviewsPending.value)}
            delta={
              kpis.panelReviewsPending.overdue > 0
                ? `${kpis.panelReviewsPending.overdue} overdue (>72h)`
                : 'On track'
            }
            positive={kpis.panelReviewsPending.overdue === 0}
            warn={kpis.panelReviewsPending.overdue > 0}
          />
          <KpiTile
            label="Free→Pro conversion"
            value={`${kpis.conversion.valuePct}%`}
            delta={
              kpis.conversion.deltaPct
                ? `${kpis.conversion.deltaPct > 0 ? '+' : ''}${kpis.conversion.deltaPct}% vs last month`
                : 'baseline'
            }
            positive={kpis.conversion.deltaPct >= 0}
          />
          <KpiTile
            label="Ink in circulation"
            value={
              kpis.inkCirculation !== null && kpis.inkCirculation !== undefined
                ? Math.floor(kpis.inkCirculation / 2).toLocaleString('en-IN')
                : '—'
            }
            delta="across all advocates"
            positive={true}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.5fr_1fr]">
        {/* Recent activity */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <header className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Recent activity</h2>
            <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5 text-[10px] font-medium">
              {ACTIVITY_TAB_LABELS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActivityTab(key)}
                  className={`rounded-md px-2.5 py-1 transition ${
                    activityTab === key
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </header>
          <ul className="divide-y divide-slate-100">
            {filteredActivity.length === 0 ? (
              <li className="py-6 text-center text-xs text-slate-400">
                {activity.length === 0
                  ? 'No recent activity in the last 7 days.'
                  : `No ${activityTab === 'all' ? '' : activityTab + ' '}activity to show.`}
              </li>
            ) : (
              filteredActivity.slice(0, 8).map((it, i) => (
                <li key={i} className="flex items-start gap-3 py-3 text-sm">
                  <span
                    className={`mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                      it.type === 'signup'
                        ? 'bg-green-500'
                        : it.type === 'draft'
                          ? 'bg-blue-500'
                          : it.type === 'review'
                            ? 'bg-amber-500'
                            : it.type === 'topup'
                              ? 'bg-purple-500'
                              : 'bg-slate-400'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800">{it.label}</p>
                    {it.detail && <p className="truncate text-xs text-slate-500">{it.detail}</p>}
                  </div>
                  <span className="flex-shrink-0 text-[11px] text-slate-400">
                    {relativeTime(it.at)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>

        {/* Right rail */}
        <div className="space-y-5">
          {/* AI runtime */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <header className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">AI runtime</h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700">
                <span className="h-1 w-1 rounded-full bg-green-500" />
                All systems
              </span>
            </header>
            <RuntimeRow
              label="ai.drafting_model"
              value={aiRuntime?.drafting_model ?? '(not configured)'}
              ok={!!aiRuntime?.drafting_model}
            />
            <RuntimeRow
              label="ai.preflight_model"
              value={aiRuntime?.preflight_model ?? '(rules-only)'}
              ok={true}
            />
            <p className="mt-3 text-[11px] text-slate-400">
              Cache TTL ~1 min · Changes propagate without redeploy.
            </p>
          </section>

          {/* Monthly revenue */}
          {kpis && (
            <section className="rounded-xl border border-slate-200 bg-slate-900 p-5 text-slate-100 shadow-sm">
              <div className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-300">
                <TrendingUp size={11} /> This month
              </div>
              <p className="text-3xl font-bold">
                ₹{kpis.monthlyRevenue.inr.toLocaleString('en-IN')}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">MRR</p>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-700 pt-3 text-xs">
                <Stat
                  label="Paid"
                  value={kpis.monthlyRevenue.paid.toLocaleString('en-IN')}
                  tint="text-slate-100"
                />
                <Stat label="New" value={`+${kpis.monthlyRevenue.newPaid}`} tint="text-green-400" />
                <Stat
                  label="Churn"
                  value={String(kpis.monthlyRevenue.churn)}
                  tint="text-amber-300"
                />
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Top referral codes */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Top referral codes</h2>
          <Link
            href="/admin/referral-codes"
            className="text-xs font-medium text-amber-700 hover:text-amber-900"
          >
            Manage all →
          </Link>
        </header>
        {topReferrals.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-400">No codes yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-4">Code</th>
                <th className="py-2 pr-4">Label</th>
                <th className="py-2 pr-4 text-center">Signups</th>
                <th className="py-2 pr-4 text-center">Cap</th>
                <th className="py-2 pr-4 text-center">Status</th>
                <th className="py-2 pr-4">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topReferrals.map((rc) => (
                <tr key={rc.code}>
                  <td className="py-2.5 pr-4 font-mono font-semibold text-slate-900">{rc.code}</td>
                  <td className="py-2.5 pr-4 text-slate-600">{rc.label ?? '—'}</td>
                  <td className="py-2.5 pr-4 text-center font-mono text-slate-800">{rc.uses}</td>
                  <td className="py-2.5 pr-4 text-center text-slate-500">{rc.maxUses ?? '∞'}</td>
                  <td className="py-2.5 pr-4 text-center">
                    {rc.isActive ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                        Disabled
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 text-xs text-slate-500">
                    {new Date(rc.createdAt).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function KpiTile({
  label,
  value,
  delta,
  positive,
  warn,
}: {
  label: string;
  value: string;
  delta: string;
  positive: boolean;
  warn?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
      <p
        className={`mt-1.5 text-xs font-medium ${
          warn ? 'text-amber-600' : positive ? 'text-green-600' : 'text-red-500'
        }`}
      >
        {delta}
      </p>
    </div>
  );
}

function RuntimeRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-xs">
      <code className="font-mono text-slate-600">{label}</code>
      <span
        className={`flex items-center gap-1 font-mono ${ok ? 'text-slate-800' : 'text-amber-700'}`}
      >
        {!ok && <Sparkles size={11} />}
        {value}
      </span>
    </div>
  );
}

function Stat({ label, value, tint }: { label: string; value: string; tint: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-0.5 font-bold ${tint}`}>{value}</p>
    </div>
  );
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

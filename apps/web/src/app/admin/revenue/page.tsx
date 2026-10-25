'use client';

/**
 * /admin/revenue — MRR, ARR, topup revenue, plan mix, 6-month trend.
 */

import { Loader2, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { apiFetch } from '@/lib/apiFetch';

interface RevenueData {
  mrr: number;
  arr: number;
  activeCount: number;
  topupRevenueThisMonth: number;
  arpu: number;
  planMix: Record<string, number>;
  trend: Array<{ month: string; subInr: number; topupInr: number }>;
}

const PLAN_MIX_COLORS: Record<string, string> = {
  solo_monthly: 'bg-amber-400',
  solo_yearly: 'bg-amber-600',
  pro_monthly: 'bg-purple-400',
  pro_yearly: 'bg-purple-700',
  unknown: 'bg-slate-300',
};

const PLAN_MIX_LABELS: Record<string, string> = {
  solo_monthly: 'Solo / Monthly',
  solo_yearly: 'Solo / Yearly',
  pro_monthly: 'Pro / Monthly',
  pro_yearly: 'Pro / Yearly',
};

export default function AdminRevenuePage() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/billing/admin/billing/revenue');
        if (res.ok) {
          setData(await res.json());
        } else {
          setError('Failed to load revenue data.');
        }
      } catch {
        setError('Network error.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalPlanCount = data ? Object.values(data.planMix).reduce((a, b) => a + b, 0) : 0;

  const maxTrend = data ? Math.max(...data.trend.map((t) => t.subInr + t.topupInr), 1) : 1;

  return (
    <div>
      <AdminPageHeader title="Revenue" eyebrow="MRR · ARR · plan mix · 6-month trend">
        <Link
          href="/admin/subscriptions"
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-700"
        >
          <TrendingUp size={13} /> View subscriptions
        </Link>
      </AdminPageHeader>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 py-10 text-sm text-slate-400">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      )}

      {data && (
        <>
          {/* KPI tiles */}
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
            <KpiTile label="MRR" value={`₹${data.mrr.toLocaleString('en-IN')}`} />
            <KpiTile label="ARR" value={`₹${data.arr.toLocaleString('en-IN')}`} />
            <KpiTile label="Active subscribers" value={data.activeCount.toLocaleString('en-IN')} />
            <KpiTile
              label="Topup revenue (month)"
              value={`₹${data.topupRevenueThisMonth.toLocaleString('en-IN')}`}
            />
            <KpiTile label="ARPU" value={`₹${data.arpu.toLocaleString('en-IN')}`} />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
            {/* 6-month trend */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-slate-800">
                Revenue trend (6 months)
              </h2>
              <div className="flex h-40 items-end gap-2">
                {data.trend.map((t) => {
                  const total = t.subInr + t.topupInr;
                  const pct = Math.round((total / maxTrend) * 100);
                  const subPct = total > 0 ? Math.round((t.subInr / total) * pct) : 0;
                  const topupPct = pct - subPct;
                  return (
                    <div key={t.month} className="flex flex-1 flex-col items-center gap-1">
                      <p className="font-mono text-[9px] text-slate-500">
                        ₹{Math.round(total / 1000)}k
                      </p>
                      <div className="flex w-full flex-1 flex-col-reverse overflow-hidden rounded-t-md bg-slate-100">
                        {t.topupInr > 0 && (
                          <div
                            className="w-full bg-purple-400 transition-all"
                            style={{ height: `${topupPct}%` }}
                          />
                        )}
                        {t.subInr > 0 && (
                          <div
                            className="w-full bg-amber-400 transition-all"
                            style={{ height: `${subPct}%` }}
                          />
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400">{t.month}</p>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center gap-4 text-[11px] text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-amber-400" /> Subscriptions
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-purple-400" /> Topups
                </span>
              </div>
            </section>

            {/* Plan mix */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-slate-800">Plan mix</h2>
              {totalPlanCount === 0 ? (
                <p className="text-xs text-slate-400">No active subscriptions.</p>
              ) : (
                <>
                  {/* Stacked bar */}
                  <div className="mb-4 flex h-3 w-full overflow-hidden rounded-full">
                    {Object.entries(data.planMix).map(([key, count]) => (
                      <div
                        key={key}
                        className={`h-full transition-all ${PLAN_MIX_COLORS[key] ?? 'bg-slate-300'}`}
                        style={{ width: `${Math.round((count / totalPlanCount) * 100)}%` }}
                      />
                    ))}
                  </div>
                  <div className="space-y-2">
                    {Object.entries(data.planMix).map(([key, count]) => (
                      <div key={key} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2 w-2 rounded-sm ${PLAN_MIX_COLORS[key] ?? 'bg-slate-300'}`}
                          />
                          <span className="text-slate-600">{PLAN_MIX_LABELS[key] ?? key}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800">{count}</span>
                          <span className="text-slate-400">
                            {Math.round((count / totalPlanCount) * 100)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

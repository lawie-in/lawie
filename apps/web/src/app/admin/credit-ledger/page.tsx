'use client';

/**
 * /admin/credit-ledger — founder credit accounting.
 *
 * Design: docs/Pricing Design/Founder view _ buckets_ ledger_ telemetry.png
 *
 * Surfaces (top → bottom):
 *   • 4 KPI tiles (Credits in circulation, Granted, Spent, Top-up revenue)
 *   • Credit-bucket bar (P2/P4 enforcement viz) with legend
 *   • Filter tabs (All / Spent / Granted / Top-ups / Renewals)
 *   • Recent ledger entries table
 *   • Live telemetry box (last 5 min)
 */

import { Coins, Download, Loader2, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { AdminPageHeader, ServiceHealthyBadge } from '@/components/admin/AdminPageHeader';
import { apiFetch } from '@/lib/apiFetch';

interface Kpis {
  creditsInCirculation: number;
  bucketSums: {
    subscriptionCredits: number;
    earnedCredits: number;
    topupCredits: number;
  };
  grantedThisMonth: number;
  spentThisMonth: number;
  topupRevenueInr: number;
  topupPacksSold: number;
  activeAdvocates: number;
}

interface LedgerEntry {
  _id: string;
  userId: string;
  userName: string;
  userTier: 'free' | 'practice' | 'firm';
  source: string;
  bucket: 'subscriptionCredits' | 'earnedCredits' | 'topupCredits';
  amount: number;
  balanceAfter: number;
  reference?: string;
  templateId?: string;
  createdAt: string;
}

const TAB_FILTERS: Record<string, string | undefined> = {
  all: undefined,
  spent: 'draft_spent',
  granted: 'login_bonus', // expanded server-side via OR group
  topups: 'topup_purchase',
  renewals: 'plan_renewal',
};

const BUCKET_PILL: Record<string, string> = {
  subscriptionCredits: 'bg-amber-100 text-amber-700',
  earnedCredits: 'bg-green-100 text-green-700',
  topupCredits: 'bg-blue-100 text-blue-700',
};

const SOURCE_LABEL: Record<string, string> = {
  draft_spent: 'Spent',
  login_bonus: 'Login bonus',
  rating_bonus: 'Rating bonus',
  signup_bonus: 'Signup bonus',
  plan_renewal: 'Plan renewal',
  topup_purchase: 'Top-up',
  admin_grant: 'Admin grant',
  admin_revoke: 'Admin revoke',
  plan_lapsed: 'Plan lapsed',
};

export default function CreditLedgerPage() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [tab, setTab] = useState<keyof typeof TAB_FILTERS>('all');
  const [loading, setLoading] = useState(true);

  const fetchKpis = useCallback(async () => {
    const res = await apiFetch('/api/drafting/admin/credits/kpis');
    if (res.ok) setKpis(await res.json());
  }, []);

  const fetchLedger = useCallback(async (filter: string | undefined) => {
    const qs = filter ? `?source=${encodeURIComponent(filter)}&limit=50` : '?limit=50';
    const res = await apiFetch(`/api/drafting/admin/credits/ledger${qs}`);
    if (res.ok) {
      const body = await res.json();
      setEntries(body.entries ?? []);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await Promise.all([fetchKpis(), fetchLedger(undefined)]);
      setLoading(false);
    })();
  }, [fetchKpis, fetchLedger]);

  useEffect(() => {
    void fetchLedger(TAB_FILTERS[tab]);
  }, [tab, fetchLedger]);

  const totalBuckets = kpis
    ? kpis.bucketSums.subscriptionCredits +
      kpis.bucketSums.earnedCredits +
      kpis.bucketSums.topupCredits
    : 0;
  const pct = (n: number) => (totalBuckets > 0 ? (n / totalBuckets) * 100 : 0);

  return (
    <div>
      <AdminPageHeader
        title="Credit ledger"
        eyebrow={`Real-time credit accounting · ${kpis?.activeAdvocates ?? 0} active advocates`}
        statusBadge={<ServiceHealthyBadge label="Audit reconcile" />}
      >
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Download size={13} /> Export CSV
        </a>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-700"
        >
          <ShieldCheck size={13} /> Audit reconcile
        </button>
      </AdminPageHeader>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-slate-400">
          <Loader2 size={14} className="animate-spin" />
          Loading ledger…
        </div>
      ) : (
        <>
          {/* KPI tiles */}
          {kpis && (
            <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiTile
                label="Credits in circulation"
                value={kpis.creditsInCirculation.toLocaleString('en-IN')}
                accent="amber"
                sub={`across ${kpis.activeAdvocates} active advocates`}
              />
              <KpiTile
                label="Granted (30d)"
                value={`+${kpis.grantedThisMonth.toLocaleString('en-IN')}`}
                accent="green"
                sub="login · sub · top-ups"
              />
              <KpiTile
                label="Spent (30d)"
                value={`–${kpis.spentThisMonth.toLocaleString('en-IN')}`}
                accent="red"
                sub="draft consumption"
              />
              <KpiTile
                label="Top-up revenue (30d)"
                value={`₹${kpis.topupRevenueInr.toLocaleString('en-IN')}`}
                accent="blue"
                sub={`${kpis.topupPacksSold} packs sold`}
              />
            </div>
          )}

          {/* Bucket bar */}
          {kpis && totalBuckets > 0 && (
            <section className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <header className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">
                  Credits by bucket{' '}
                  <span className="ml-1 text-xs font-normal text-slate-400">
                    (P2 / P4 enforcement)
                  </span>
                </h2>
                <div className="flex items-center gap-3 text-[11px]">
                  <BucketChip color="bg-amber-400" label="subscriptionCredits" value={kpis.bucketSums.subscriptionCredits} />
                  <BucketChip color="bg-green-500" label="earnedCredits" value={kpis.bucketSums.earnedCredits} />
                  <BucketChip color="bg-blue-500" label="topupCredits" value={kpis.bucketSums.topupCredits} />
                </div>
              </header>
              <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="bg-amber-400"
                  style={{ width: `${pct(kpis.bucketSums.subscriptionCredits)}%` }}
                  title="subscriptionCredits"
                />
                <div
                  className="bg-green-500"
                  style={{ width: `${pct(kpis.bucketSums.earnedCredits)}%` }}
                  title="earnedCredits"
                />
                <div
                  className="bg-blue-500"
                  style={{ width: `${pct(kpis.bucketSums.topupCredits)}%` }}
                  title="topupCredits"
                />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-xs">
                <BucketBreakdown
                  label="Subscription"
                  value={kpis.bucketSums.subscriptionCredits}
                  note="Lapses on monthly renewal"
                  color="text-amber-700"
                />
                <BucketBreakdown
                  label="Earned"
                  value={kpis.bucketSums.earnedCredits}
                  note="Login · rating · permanent"
                  color="text-green-700"
                />
                <BucketBreakdown
                  label="Top-up"
                  value={kpis.bucketSums.topupCredits}
                  note="Purchased · permanent"
                  color="text-blue-700"
                />
              </div>
            </section>
          )}

          {/* Filter tabs */}
          <div className="mb-3 flex items-center gap-1 rounded-lg bg-slate-100 p-1 w-fit">
            {(['all', 'spent', 'granted', 'topups', 'renewals'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  tab === t
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {/* Ledger table */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <header className="border-b border-slate-100 bg-slate-50 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800">Recent ledger entries</h2>
            </header>
            {entries.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">
                No ledger entries match this filter.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-2">Time</th>
                    <th className="px-4 py-2">Advocate</th>
                    <th className="px-4 py-2">Tier</th>
                    <th className="px-4 py-2">Source</th>
                    <th className="px-4 py-2">Bucket</th>
                    <th className="px-4 py-2 text-right">±</th>
                    <th className="px-4 py-2 text-right">Balance</th>
                    <th className="px-4 py-2">Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {entries.map((e) => (
                    <tr key={e._id}>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500">
                        {new Date(e.createdAt).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">{e.userName}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            e.userTier === 'free'
                              ? 'bg-slate-100 text-slate-600'
                              : e.userTier === 'practice'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-purple-100 text-purple-700'
                          }`}
                        >
                          {e.userTier}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">
                        {SOURCE_LABEL[e.source] ?? e.source}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${BUCKET_PILL[e.bucket] ?? ''}`}>
                          {e.bucket}
                        </span>
                      </td>
                      <td className={`px-4 py-2.5 text-right font-mono text-sm font-semibold ${
                        e.amount >= 0 ? 'text-green-600' : 'text-red-500'
                      }`}>
                        {e.amount >= 0 ? `+${e.amount}` : e.amount}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-700">
                        {e.balanceAfter}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{e.reference ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Telemetry */}
          <section className="mt-5 rounded-xl border border-slate-700 bg-slate-900 p-5 font-mono text-[11px] text-slate-200 shadow-sm">
            <header className="mb-2 flex items-center gap-1.5 text-amber-300">
              <Coins size={11} />
              <span className="font-semibold tracking-[0.1em]">TELEMETRY EVENTS EMITTED · LAST 5 MIN</span>
            </header>
            {entries.slice(0, 5).map((e, i) => (
              <p key={i} className="text-slate-300">
                <span className="text-amber-200">
                  {e.source === 'topup_purchase'
                    ? 'topup.purchased'
                    : e.source === 'draft_spent'
                      ? 'credits.spent'
                      : e.source === 'plan_renewal'
                        ? 'tier.renewed'
                        : 'credits.granted'}
                </span>
                <span className="text-slate-500"> {'{ '}</span>
                userId:&nbsp;
                <span className="text-cyan-300">&quot;{e.userId.slice(-8)}&quot;</span>,
                amount:&nbsp;
                <span className={e.amount >= 0 ? 'text-green-400' : 'text-red-400'}>
                  {e.amount}
                </span>
                ,&nbsp;source:&nbsp;
                <span className="text-cyan-300">&quot;{e.source}&quot;</span>
                <span className="text-slate-500"> {'}'}</span>
              </p>
            ))}
            {entries.length === 0 && (
              <p className="text-slate-500">{'// no recent events'}</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function KpiTile({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: string;
  accent: 'amber' | 'green' | 'red' | 'blue';
  sub: string;
}) {
  const tint =
    accent === 'green'
      ? 'text-green-600'
      : accent === 'red'
        ? 'text-red-500'
        : accent === 'blue'
          ? 'text-blue-600'
          : 'text-amber-600';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${tint}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-400">{sub}</p>
    </div>
  );
}

function BucketChip({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-sm ${color}`} />
      <code className="text-slate-700">{label}</code>
      <span className="font-mono text-slate-500">{value.toLocaleString('en-IN')}</span>
    </div>
  );
}

function BucketBreakdown({
  label,
  value,
  note,
  color,
}: {
  label: string;
  value: number;
  note: string;
  color: string;
}) {
  return (
    <div>
      <p className={`font-semibold ${color}`}>
        {label}: <span className="font-mono">{value.toLocaleString('en-IN')}</span>
      </p>
      <p className="text-[10px] text-slate-400">{note}</p>
    </div>
  );
}

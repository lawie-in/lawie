'use client';

/**
 * /admin/subscriptions — View all Razorpay subscriptions, payment history, sync.
 */

import {
  ChevronRight,
  Copy,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
  X,
  ExternalLink,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { apiFetch } from '@/lib/apiFetch';

interface SubRow {
  _id: string;
  userId: string;
  userName: string;
  userEmail: string;
  razorpaySubscriptionId: string;
  planLabel: string;
  planType: string;
  amountInr: number;
  status: string;
  currentPeriodEnd: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

interface SubDetail extends SubRow {
  razorpayPlanId: string;
  currentPeriodStart: string | null;
  paymentHistory: Array<{
    paymentId: string;
    amount: number;
    status: 'captured' | 'failed';
    paidAt: string;
  }>;
}

type StatusFilter = '' | 'active' | 'paused' | 'cancelled' | 'expired';

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  authenticated: 'bg-blue-100 text-blue-700',
  created: 'bg-slate-100 text-slate-600',
  paused: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-red-100 text-red-700',
  expired: 'bg-slate-100 text-slate-500',
};

export default function AdminSubscriptionsPage() {
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<StatusFilter>('');
  const [query, setQuery] = useState('');
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');

  const [selected, setSelected] = useState<SubDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [copied, setCopied] = useState('');

  const fetchSubs = useCallback(async (q: string, st: StatusFilter) => {
    setFetching(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (q) params.set('q', q);
      if (st) params.set('status', st);
      const res = await apiFetch(`/api/billing/admin/billing/subscriptions?${params}`);
      if (res.ok) {
        const body = await res.json();
        setSubs(body.subscriptions ?? []);
        setTotal(body.total ?? 0);
      } else {
        setError('Failed to load subscriptions.');
      }
    } catch {
      setError('Network error.');
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    void fetchSubs(query, status);
  }, [status, fetchSubs]);

  const openDetail = async (razId: string) => {
    setDetailLoading(true);
    setSyncMsg('');
    try {
      const res = await apiFetch(`/api/billing/admin/billing/subscriptions/${razId}`);
      if (res.ok) setSelected(await res.json());
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSync = async () => {
    if (!selected) return;
    setSyncing(true);
    setSyncMsg('');
    try {
      const res = await apiFetch(
        `/api/billing/admin/billing/subscriptions/${selected.razorpaySubscriptionId}/sync`,
        { method: 'POST' },
      );
      if (res.ok) {
        const body = await res.json();
        setSyncMsg(`Synced — status: ${body.status}`);
        setSelected((prev) => (prev ? { ...prev, status: body.status } : prev));
        void fetchSubs(query, status);
      } else {
        setSyncMsg('Sync failed — check Razorpay dashboard');
      }
    } finally {
      setSyncing(false);
    }
  };

  const copyId = (id: string) => {
    void navigator.clipboard.writeText(id);
    setCopied(id);
    setTimeout(() => setCopied(''), 2000);
  };

  const STATUS_TABS: { key: StatusFilter; label: string }[] = [
    { key: '', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'paused', label: 'Paused' },
    { key: 'cancelled', label: 'Cancelled' },
    { key: 'expired', label: 'Expired' },
  ];

  return (
    <div className="relative">
      <AdminPageHeader title="Subscriptions" eyebrow={`${total.toLocaleString('en-IN')} total`} />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Filter row */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {STATUS_TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatus(key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                status === key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                void fetchSubs(e.target.value, status);
              }}
              placeholder="Search name, email, or sub ID"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 pl-8 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {fetching ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : subs.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">No subscriptions found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Advocate</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Period ends</th>
                <th className="px-4 py-3">Razorpay ID</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {subs.map((s) => (
                <tr
                  key={s._id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => void openDetail(s.razorpaySubscriptionId)}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{s.userName || '—'}</p>
                    <p className="text-xs text-slate-400">{s.userEmail}</p>
                  </td>
                  <td className="px-4 py-3 capitalize text-slate-600">{s.planLabel}</td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_COLORS[s.status] ?? 'bg-slate-100 text-slate-500'}`}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-slate-800">
                    ₹{s.amountInr.toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {s.currentPeriodEnd
                      ? new Date(s.currentPeriodEnd).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })
                      : s.cancelledAt
                        ? `Cancelled ${new Date(s.cancelledAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`
                        : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="max-w-[120px] truncate font-mono text-[11px] text-slate-500">
                        {s.razorpaySubscriptionId}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyId(s.razorpaySubscriptionId);
                        }}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        {copied === s.razorpaySubscriptionId ? (
                          <CheckCircle2 size={12} className="text-green-500" />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ChevronRight size={14} className="text-slate-300" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Slide-out panel */}
      {(selected || detailLoading) && (
        <>
          <div className="fixed inset-0 z-30 bg-slate-900/40" onClick={() => setSelected(null)} />
          <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-2xl">
            {detailLoading || !selected ? (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 size={18} className="animate-spin text-slate-400" />
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
                  <div>
                    <p className="text-base font-bold text-slate-900">
                      {selected.userName || selected.userEmail}
                    </p>
                    <p className="text-xs capitalize text-slate-500">{selected.planLabel}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="flex-1 space-y-6 px-6 py-5">
                  {/* Status + amount */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Status
                      </p>
                      <span
                        className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS_COLORS[selected.status] ?? ''}`}
                      >
                        {selected.status}
                      </span>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Amount
                      </p>
                      <p className="mt-1 font-mono text-sm font-bold text-slate-900">
                        ₹{selected.amountInr.toLocaleString('en-IN')}
                      </p>
                    </div>
                  </div>

                  {/* Dates */}
                  <section>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Billing period
                    </p>
                    <dl className="space-y-1 text-xs">
                      <DetailRow
                        label="Start"
                        value={
                          selected.currentPeriodStart
                            ? new Date(selected.currentPeriodStart).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })
                            : null
                        }
                      />
                      <DetailRow
                        label="End"
                        value={
                          selected.currentPeriodEnd
                            ? new Date(selected.currentPeriodEnd).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })
                            : null
                        }
                      />
                      <DetailRow
                        label="Created"
                        value={new Date(selected.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      />
                    </dl>
                  </section>

                  {/* Razorpay ID */}
                  <section>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Razorpay
                    </p>
                    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <code className="flex-1 truncate font-mono text-[11px] text-slate-600">
                        {selected.razorpaySubscriptionId}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyId(selected.razorpaySubscriptionId)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        {copied === selected.razorpaySubscriptionId ? (
                          <CheckCircle2 size={12} className="text-green-500" />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                      <a
                        href={`https://dashboard.razorpay.com/app/subscriptions/${selected.razorpaySubscriptionId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-slate-400 hover:text-slate-700"
                        title="Open in Razorpay"
                      >
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </section>

                  {/* Payment history */}
                  {selected.paymentHistory.length > 0 && (
                    <section>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Payment history
                      </p>
                      <div className="overflow-hidden rounded-xl border border-slate-100">
                        {selected.paymentHistory.map((p, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between border-b border-slate-50 px-3 py-2.5 text-xs last:border-0"
                          >
                            <div>
                              <p className="font-mono text-[11px] text-slate-500">{p.paymentId}</p>
                              <p className="text-slate-400">
                                {new Date(p.paidAt).toLocaleDateString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-slate-800">
                                ₹{p.amount.toLocaleString('en-IN')}
                              </p>
                              <span
                                className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                  p.status === 'captured'
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-red-100 text-red-600'
                                }`}
                              >
                                {p.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Sync */}
                  {syncMsg && <p className="text-xs text-slate-600">{syncMsg}</p>}
                  <button
                    type="button"
                    onClick={() => void handleSync()}
                    disabled={syncing}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {syncing ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <RefreshCw size={12} />
                    )}
                    Sync from Razorpay
                  </button>
                </div>
              </>
            )}
          </aside>
        </>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-20 flex-shrink-0 text-slate-400">{label}</dt>
      <dd className="text-slate-700">{value || '—'}</dd>
    </div>
  );
}

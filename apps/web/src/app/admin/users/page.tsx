'use client';

/**
 * /admin/users — User management: search, view, grant ink, deactivate.
 */

import { CheckCircle2, ChevronRight, Loader2, Search, X, Zap } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { apiFetch } from '@/lib/apiFetch';

interface UserRow {
  _id: string;
  name: string;
  email: string;
  planTier: 'free' | 'solo' | 'pro';
  billingCycle: string;
  planRenewsAt: string | null;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  inkSub: number;
  inkAnnualCarry: number;
  inkTopup: number;
  totalInk: number;
}

interface UserDetail extends UserRow {
  phone: string | null;
  barCouncilId: string | null;
  state: string | null;
  practiceAreas: string[];
  referredVia: string | null;
  draftCount: number;
  recentInkLedger: Array<{
    delta: number;
    reason: string;
    sourceBucket: string;
    reference: string | null;
    createdAt: string;
  }>;
}

type Tab = 'all' | 'free' | 'solo' | 'pro' | 'inactive';
const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'free', label: 'Free' },
  { key: 'solo', label: 'Solo' },
  { key: 'pro', label: 'Pro' },
  { key: 'inactive', label: 'Inactive' },
];

const TIER_COLORS: Record<string, string> = {
  free: 'bg-slate-100 text-slate-600',
  solo: 'bg-amber-100 text-amber-800',
  pro: 'bg-purple-100 text-purple-800',
};

const GRANT_REASONS = ['support_grant', 'compensation', 'event_bonus'] as const;

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');

  const [selected, setSelected] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [grantInk, setGrantInk] = useState('');
  const [grantReason, setGrantReason] = useState<(typeof GRANT_REASONS)[number]>('support_grant');
  const [grantNote, setGrantNote] = useState('');
  const [granting, setGranting] = useState(false);
  const [grantSuccess, setGrantSuccess] = useState('');
  const [grantError, setGrantError] = useState('');

  const [statusLoading, setStatusLoading] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchUsers = useCallback(async (q: string, t: Tab) => {
    setFetching(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (q) params.set('q', q);
      if (t !== 'all') params.set('tier', t);
      const res = await apiFetch(`/api/drafting/admin/users?${params}`);
      if (res.ok) {
        const body = await res.json();
        setUsers(body.users ?? []);
        setTotal(body.total ?? 0);
      } else {
        setError('Failed to load users.');
      }
    } catch {
      setError('Network error.');
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers(query, tab);
  }, [tab, fetchUsers]);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void fetchUsers(val, tab), 300);
  };

  const openDetail = async (userId: string) => {
    setDetailLoading(true);
    setGrantSuccess('');
    setGrantError('');
    setGrantInk('');
    setGrantNote('');
    setGrantReason('support_grant');
    try {
      const res = await apiFetch(`/api/drafting/admin/users/${userId}`);
      if (res.ok) setSelected(await res.json());
    } finally {
      setDetailLoading(false);
    }
  };

  const handleGrant = async () => {
    if (!selected) return;
    const inkVal = parseInt(grantInk, 10);
    if (!inkVal || inkVal < 1) {
      setGrantError('Enter a valid Ink amount (≥1)');
      return;
    }
    setGranting(true);
    setGrantError('');
    try {
      const res = await apiFetch(`/api/drafting/admin/users/${selected._id}/grant-ink`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inkUnits: inkVal * 2, reason: grantReason, note: grantNote }),
      });
      if (res.ok) {
        const body = await res.json();
        setGrantSuccess(`Granted ${inkVal} Ink. New topup balance: ${body.inkTopupNew} Ink.`);
        setGrantInk('');
        setGrantNote('');
        setSelected((prev) =>
          prev
            ? {
                ...prev,
                inkTopup: body.inkTopupNew,
                totalInk: prev.inkSub + prev.inkAnnualCarry + body.inkTopupNew,
              }
            : prev,
        );
        void fetchUsers(query, tab);
      } else {
        const body = await res.json();
        setGrantError(body.error ?? 'Grant failed');
      }
    } catch {
      setGrantError('Network error');
    } finally {
      setGranting(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!selected) return;
    setStatusLoading(true);
    try {
      const res = await apiFetch(`/api/auth/admin/users/${selected._id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !selected.isActive }),
      });
      if (res.ok) {
        const body = await res.json();
        setSelected((prev) => (prev ? { ...prev, isActive: body.isActive } : prev));
        void fetchUsers(query, tab);
      }
    } finally {
      setStatusLoading(false);
    }
  };

  return (
    <div className="relative">
      <AdminPageHeader title="Users" eyebrow={`${total.toLocaleString('en-IN')} advocates total`} />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Filter row */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                tab === key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search name or email"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 pl-8 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {fetching ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : users.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">No users found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3 text-center">Plan</th>
                <th className="px-4 py-3 text-center">Ink</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3">Last active</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr
                  key={u._id}
                  className={`cursor-pointer hover:bg-slate-50 ${!u.isActive ? 'opacity-50' : ''}`}
                  onClick={() => void openDetail(u._id)}
                >
                  <td className="px-4 py-3 font-medium text-slate-900">{u.name || '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{u.email}</td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${TIER_COLORS[u.planTier]}`}
                    >
                      {u.planTier}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-xs font-semibold text-slate-800">
                    {u.totalInk}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {new Date(u.createdAt).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {u.lastLoginAt
                      ? new Date(u.lastLoginAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                        })
                      : '—'}
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

      {/* Slide-out detail panel */}
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
                {/* Panel header */}
                <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
                  <div>
                    <p className="text-base font-bold text-slate-900">
                      {selected.name || selected.email}
                    </p>
                    <p className="text-xs text-slate-500">{selected.email}</p>
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
                  {/* Status badge */}
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold capitalize ${TIER_COLORS[selected.planTier]}`}
                    >
                      {selected.planTier}
                    </span>
                    <span className="text-xs text-slate-400">{selected.billingCycle}</span>
                    {selected.planRenewsAt && (
                      <span className="text-xs text-slate-400">
                        · renews{' '}
                        {new Date(selected.planRenewsAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                        })}
                      </span>
                    )}
                    {!selected.isActive && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                        Inactive
                      </span>
                    )}
                  </div>

                  {/* Ink balances */}
                  <section>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Ink balances
                    </p>
                    <div className="space-y-1.5 rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <InkRow label="Subscription (resets)" value={selected.inkSub} />
                      <InkRow label="Annual carry" value={selected.inkAnnualCarry} />
                      <InkRow label="Topup (permanent)" value={selected.inkTopup} />
                      <div className="border-t border-slate-200 pt-1.5">
                        <InkRow label="Total" value={selected.totalInk} bold />
                      </div>
                    </div>
                  </section>

                  {/* Profile */}
                  <section>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Profile
                    </p>
                    <dl className="space-y-1 text-xs">
                      <ProfileRow label="Bar Council ID" value={selected.barCouncilId} />
                      <ProfileRow label="State" value={selected.state} />
                      <ProfileRow label="Phone" value={selected.phone} />
                      <ProfileRow
                        label="Practice areas"
                        value={selected.practiceAreas?.join(', ') || null}
                      />
                      <ProfileRow label="Total drafts" value={String(selected.draftCount)} />
                      <ProfileRow
                        label="Joined"
                        value={new Date(selected.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      />
                    </dl>
                  </section>

                  {/* Recent ink ledger */}
                  {selected.recentInkLedger.length > 0 && (
                    <section>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Recent ink activity
                      </p>
                      <div className="overflow-hidden rounded-xl border border-slate-100">
                        {selected.recentInkLedger.map((row, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between border-b border-slate-50 px-3 py-2 text-xs last:border-0"
                          >
                            <span className="text-slate-600">{row.reason.replace(/_/g, ' ')}</span>
                            <span
                              className={`font-mono font-semibold ${row.delta > 0 ? 'text-green-600' : 'text-red-500'}`}
                            >
                              {row.delta > 0 ? '+' : ''}
                              {row.delta}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Grant ink */}
                  <section>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Grant ink
                    </p>
                    <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Zap
                            size={12}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-500"
                          />
                          <input
                            type="number"
                            placeholder="Ink amount"
                            value={grantInk}
                            onChange={(e) => setGrantInk(e.target.value)}
                            min={1}
                            className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
                          />
                        </div>
                        <select
                          value={grantReason}
                          onChange={(e) =>
                            setGrantReason(e.target.value as (typeof GRANT_REASONS)[number])
                          }
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
                        >
                          {GRANT_REASONS.map((r) => (
                            <option key={r} value={r}>
                              {r.replace(/_/g, ' ')}
                            </option>
                          ))}
                        </select>
                      </div>
                      <input
                        type="text"
                        placeholder="Note (optional)"
                        value={grantNote}
                        onChange={(e) => setGrantNote(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                      {grantError && <p className="text-xs text-red-500">{grantError}</p>}
                      {grantSuccess && (
                        <p className="flex items-center gap-1 text-xs text-green-700">
                          <CheckCircle2 size={12} /> {grantSuccess}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleGrant()}
                        disabled={granting || !grantInk}
                        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                      >
                        {granting ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Zap size={12} />
                        )}
                        Grant Ink
                      </button>
                    </div>
                  </section>
                </div>

                {/* Panel footer — status toggle */}
                <div className="border-t border-slate-100 px-6 py-4">
                  <button
                    type="button"
                    onClick={() => void handleToggleStatus()}
                    disabled={statusLoading}
                    className={`w-full rounded-lg py-2 text-xs font-semibold transition ${
                      selected.isActive
                        ? 'border border-red-200 text-red-600 hover:bg-red-50'
                        : 'border border-green-200 text-green-700 hover:bg-green-50'
                    } disabled:opacity-50`}
                  >
                    {statusLoading ? (
                      <Loader2 size={12} className="mx-auto animate-spin" />
                    ) : selected.isActive ? (
                      'Deactivate account'
                    ) : (
                      'Reactivate account'
                    )}
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

function InkRow({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-500">{label}</span>
      <span className={`font-mono ${bold ? 'font-bold text-slate-900' : 'text-slate-700'}`}>
        {value} Ink
      </span>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-28 flex-shrink-0 text-slate-400">{label}</dt>
      <dd className="text-slate-700">{value || '—'}</dd>
    </div>
  );
}

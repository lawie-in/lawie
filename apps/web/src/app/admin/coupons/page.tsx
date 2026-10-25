'use client';

import { CheckCircle2, Copy, Loader2, PlusCircle, Search, Tag } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { apiFetch } from '@/lib/apiFetch';

interface CouponRow {
  _id: string;
  code: string;
  label: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  applicablePlans: string[];
  maxUses: number | null;
  maxUsesPerUser: number;
  uses: number;
  isActive: boolean;
  expiresAt: string | null;
  razorpayOfferId: string | null;
  createdAt: string;
}

type FilterTab = 'all' | 'active' | 'disabled';

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  // Create form
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [maxUsesPerUser, setMaxUsesPerUser] = useState('1');
  const [expiresAt, setExpiresAt] = useState('');
  const [razorpayOfferId, setRazorpayOfferId] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Filter
  const [tab, setTab] = useState<FilterTab>('all');
  const [query, setQuery] = useState('');

  const fetchCoupons = useCallback(async () => {
    setFetching(true);
    try {
      const res = await apiFetch('/api/billing/admin/coupons');
      if (res.ok) {
        const body = await res.json();
        setCoupons(body.coupons ?? []);
      } else {
        setError('Failed to load coupons.');
      }
    } catch {
      setError('Network error.');
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    void fetchCoupons();
  }, [fetchCoupons]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    if (!label.trim()) {
      setCreateError('Label is required.');
      return;
    }
    if (!discountValue || Number(discountValue) < 1) {
      setCreateError('Discount value must be ≥ 1.');
      return;
    }
    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        label: label.trim(),
        discountType,
        discountValue: Number(discountValue),
        maxUsesPerUser: Number(maxUsesPerUser) || 1,
      };
      if (code.trim()) body.code = code.trim();
      if (maxUses.trim()) body.maxUses = Number(maxUses);
      if (expiresAt.trim()) body.expiresAt = new Date(expiresAt).toISOString();
      if (razorpayOfferId.trim()) body.razorpayOfferId = razorpayOfferId.trim();

      const res = await apiFetch('/api/billing/admin/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const created = await res.json();
        setCoupons((prev) => [created, ...prev]);
        setCode('');
        setLabel('');
        setDiscountValue('');
        setMaxUses('');
        setMaxUsesPerUser('1');
        setExpiresAt('');
        setRazorpayOfferId('');
      } else {
        const data = await res.json();
        setCreateError(data.error ?? 'Failed to create coupon.');
      }
    } catch {
      setCreateError('Network error.');
    } finally {
      setCreating(false);
    }
  };

  const handleDisable = async (code: string) => {
    try {
      const res = await apiFetch(`/api/billing/admin/coupons/${code}/disable`, { method: 'PATCH' });
      if (res.ok)
        setCoupons((prev) => prev.map((c) => (c.code === code ? { ...c, isActive: false } : c)));
    } catch {
      /* non-fatal */
    }
  };

  const handleCopy = (code: string) => {
    void navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const filtered = coupons.filter((c) => {
    if (tab === 'active' && !c.isActive) return false;
    if (tab === 'disabled' && c.isActive) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      if (!c.code.toLowerCase().includes(q) && !c.label.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const counts = {
    all: coupons.length,
    active: coupons.filter((c) => c.isActive).length,
    disabled: coupons.filter((c) => !c.isActive).length,
  };

  return (
    <div>
      <AdminPageHeader
        title="Coupon codes"
        eyebrow="Checkout discount codes · applied at Razorpay order / subscription time"
      >
        <button
          type="button"
          onClick={() => document.getElementById('coupon-label')?.focus()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-700"
        >
          <PlusCircle size={13} /> New coupon
        </button>
      </AdminPageHeader>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Create form */}
      <form
        onSubmit={handleCreate}
        className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <p className="mb-3 text-sm font-semibold text-slate-800">Create coupon</p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <input
            id="coupon-label"
            type="text"
            placeholder="Label (e.g. Launch discount)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={100}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <input
            type="text"
            placeholder="Code (leave blank to auto-generate)"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={20}
            className="rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <div className="flex gap-2">
            <select
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as 'percent' | 'fixed')}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="percent">% off</option>
              <option value="fixed">₹ off</option>
            </select>
            <input
              type="number"
              placeholder={discountType === 'percent' ? '20 (%)' : '100 (₹)'}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              min={1}
              max={discountType === 'percent' ? 100 : undefined}
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          <input
            type="number"
            placeholder="Max total uses (∞)"
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            min={1}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <input
            type="number"
            placeholder="Max per user (default 1)"
            value={maxUsesPerUser}
            onChange={(e) => setMaxUsesPerUser(e.target.value)}
            min={1}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <input
            type="date"
            placeholder="Expires (optional)"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <input
            type="text"
            placeholder="Razorpay Offer ID (for subscriptions)"
            value={razorpayOfferId}
            onChange={(e) => setRazorpayOfferId(e.target.value)}
            className="col-span-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 lg:col-span-2"
          />
          <button
            type="submit"
            disabled={creating}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {creating ? <Loader2 size={13} className="animate-spin" /> : <PlusCircle size={13} />}
            Create
          </button>
        </div>
        {createError && <p className="mt-2 text-xs text-red-600">{createError}</p>}

        <p className="mt-3 text-[11px] text-slate-400">
          <Tag size={11} className="mr-1 inline" />
          For subscription discounts: create an Offer in the Razorpay dashboard first, paste its ID
          here. For top-up discounts: leave Razorpay Offer ID blank — the checkout will apply the
          discount to the Razorpay order amount directly.
        </p>
      </form>

      {/* Tabs + search */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {(['all', 'active', 'disabled'] as FilterTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                tab === t ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
              <span
                className={`rounded-full px-1.5 text-[10px] ${tab === t ? 'bg-slate-700 text-amber-200' : 'bg-white text-slate-500'}`}
              >
                {counts[t]}
              </span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search code or label"
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
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">
            {coupons.length === 0
              ? 'No coupons yet. Create one above.'
              : 'No coupons match this filter.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Label</th>
                <th className="px-4 py-3 text-center">Discount</th>
                <th className="px-4 py-3 text-center">Uses / Cap</th>
                <th className="px-4 py-3 text-center">Per user</th>
                <th className="px-4 py-3 text-center">Expires</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((c) => {
                const usePct =
                  c.maxUses && c.maxUses > 0
                    ? Math.min(100, (c.uses / c.maxUses) * 100)
                    : Math.min(100, (c.uses / Math.max(c.uses, 10)) * 100);
                return (
                  <tr key={c._id} className={c.isActive ? '' : 'opacity-60'}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-slate-900">{c.code}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(c.code)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          {copied === c.code ? (
                            <CheckCircle2 size={13} className="text-green-500" />
                          ) : (
                            <Copy size={13} />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{c.label}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                        {c.discountType === 'percent'
                          ? `${c.discountValue}%`
                          : `₹${c.discountValue}`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-1 text-xs">
                          <span className="font-semibold text-slate-800">{c.uses}</span>
                          <span className="text-slate-400">/ {c.maxUses ?? '∞'}</span>
                        </div>
                        <div className="h-1 w-16 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-purple-400"
                            style={{ width: `${usePct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500">
                      {c.maxUsesPerUser}×
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-slate-400">
                      {c.expiresAt
                        ? new Date(c.expiresAt).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {c.isActive ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                          Active
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                          Disabled
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.isActive && (
                        <button
                          type="button"
                          onClick={() => handleDisable(c.code)}
                          className="text-xs font-medium text-red-500 hover:text-red-700"
                        >
                          Disable
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

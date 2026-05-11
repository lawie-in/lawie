'use client';

/**
 * /admin/referral-codes — founder admin (SCRUM-71).
 *
 * Layout chrome lives in apps/web/src/app/admin/layout.tsx. This page just
 * renders the content surface: generate-code card, status tabs (All/Active/
 * Disabled), and a table with code, label, signups, cap, status, actions.
 *
 * Design: docs/Admin Panel Design/Code generation _ ledger with usage bars.png
 */

import { CheckCircle2, Copy, Loader2, PlusCircle, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { apiFetch } from '@/lib/apiFetch';

interface ReferralCodeRow {
  code: string;
  label?: string;
  isActive: boolean;
  maxUses: number | null;
  uses: number;
  createdAt: string;
}

type Tab = 'all' | 'active' | 'disabled';

export default function ReferralCodesPage() {
  const [codes, setCodes] = useState<ReferralCodeRow[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');

  // Generate
  const [label, setLabel] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  // Filter + search
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');

  const fetchCodes = useCallback(async () => {
    setFetching(true);
    try {
      const res = await apiFetch('/api/auth/admin/referral-codes');
      if (res.ok) {
        const body = await res.json();
        setCodes(body.codes ?? []);
      } else {
        setError('Failed to load referral codes.');
      }
    } catch {
      setError('Network error loading codes.');
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    void fetchCodes();
  }, [fetchCodes]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setGenError('');
    try {
      const body: Record<string, unknown> = {};
      if (label.trim()) body.label = label.trim();
      if (maxUses.trim()) body.maxUses = parseInt(maxUses, 10);

      const res = await apiFetch('/api/auth/admin/referral-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const newCode = await res.json();
        setCodes((prev) => [newCode, ...prev]);
        setLabel('');
        setMaxUses('');
      } else {
        const data = await res.json();
        setGenError(data.error ?? 'Failed to generate code');
      }
    } catch {
      setGenError('Network error');
    } finally {
      setGenerating(false);
    }
  };

  const handleDisable = async (code: string) => {
    try {
      const res = await apiFetch(`/api/auth/admin/referral-codes/${code}/disable`, {
        method: 'PATCH',
      });
      if (res.ok) {
        setCodes((prev) => prev.map((c) => (c.code === code ? { ...c, isActive: false } : c)));
      }
    } catch {
      /* non-fatal */
    }
  };

  const handleCopy = (code: string) => {
    void navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  // ── Filter ──────────────────────────────────────────────────────────────
  const filtered = codes.filter((c) => {
    if (tab === 'active' && !c.isActive) return false;
    if (tab === 'disabled' && c.isActive) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      const hit = c.code.toLowerCase().includes(q) || (c.label ?? '').toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });

  const counts = {
    all: codes.length,
    active: codes.filter((c) => c.isActive).length,
    disabled: codes.filter((c) => !c.isActive).length,
  };

  return (
    <div>
      <AdminPageHeader
        title="Referral codes"
        eyebrow="Each redeemed code grants 25 bonus drafts"
      >
        <button
          type="button"
          onClick={() => document.getElementById('referral-gen-label')?.focus()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-700"
        >
          <PlusCircle size={13} /> New code
        </button>
      </AdminPageHeader>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Generate */}
      <form
        onSubmit={handleGenerate}
        className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="mb-3 flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-800">Generate new code</p>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
            8-char uppercase
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_220px_120px]">
          <input
            id="referral-gen-label"
            type="text"
            placeholder="Label (e.g. Patna bar review)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={100}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <input
            type="number"
            placeholder="Max uses (blank = ∞)"
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            min={1}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <button
            type="submit"
            disabled={generating}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {generating ? <Loader2 size={13} className="animate-spin" /> : <PlusCircle size={13} />}
            Generate
          </button>
        </div>
        {genError && <p className="mt-2 text-xs text-red-600">{genError}</p>}
      </form>

      {/* Tabs + search */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {(['all', 'active', 'disabled'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                tab === t
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
              <span
                className={`rounded-full px-1.5 text-[10px] ${
                  tab === t ? 'bg-slate-700 text-amber-200' : 'bg-white text-slate-500'
                }`}
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
            <Loader2 size={14} className="animate-spin" />
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">
            {codes.length === 0
              ? 'No referral codes yet. Generate one above.'
              : 'No codes match this filter.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Label</th>
                <th className="px-4 py-3">Signups</th>
                <th className="px-4 py-3 text-center">Cap</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((rc) => {
                const pct =
                  rc.maxUses && rc.maxUses > 0
                    ? Math.min(100, (rc.uses / rc.maxUses) * 100)
                    : Math.min(100, (rc.uses / Math.max(rc.uses, 10)) * 100);
                return (
                  <tr key={rc.code} className={rc.isActive ? '' : 'opacity-60'}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-slate-900">{rc.code}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(rc.code)}
                          className="text-slate-400 hover:text-slate-600"
                          title="Copy code"
                        >
                          {copied === rc.code ? (
                            <CheckCircle2 size={13} className="text-green-500" />
                          ) : (
                            <Copy size={13} />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{rc.label ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-1 w-20 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-amber-400"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs font-medium text-slate-800">
                          {rc.uses}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-slate-500">
                      {rc.maxUses ?? '∞'}
                    </td>
                    <td className="px-4 py-3 text-center">
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
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {new Date(rc.createdAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {rc.isActive && (
                        <button
                          type="button"
                          onClick={() => handleDisable(rc.code)}
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

'use client';

/**
 * /admin/panel-review — SCRUM-74 (visual refresh 2026-05-12).
 *
 * Layout chrome lives in apps/web/src/app/admin/layout.tsx.
 * Design: docs/Admin Panel Design/Jharkhand panel matrix with verdict distribution.png
 */

import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  Send,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { apiFetch } from '@/lib/apiFetch';

interface DocumentSummary {
  _id: string;
  title: string;
  docType: string;
}

interface MatrixRow {
  token: string;
  assignedTo: string;
  documentId: string;
  documentTitle: string;
  documentType: string | null;
  status: 'submitted' | 'pending' | 'expired';
  verdict: string | null;
  submittedAt: string | null;
  comments: string | null;
  checklist: Record<string, boolean> | null;
}

interface PanelData {
  matrix: MatrixRow[];
  counts: {
    total: number;
    submitted: number;
    pending: number;
    expired: number;
    verdicts: Record<string, number>;
  };
}

const VERDICT_LABEL: Record<string, string> = {
  ready_to_file: 'Ready to file',
  minor_edits: 'Minor edits',
  major_edits: 'Major edits',
  reject: 'Reject',
};

const VERDICT_BAR: Record<string, string> = {
  ready_to_file: 'bg-green-500',
  minor_edits: 'bg-blue-500',
  major_edits: 'bg-amber-500',
  reject: 'bg-red-500',
};

const VERDICT_PILL: Record<string, string> = {
  ready_to_file: 'bg-green-100 text-green-700',
  minor_edits: 'bg-blue-100 text-blue-700',
  major_edits: 'bg-amber-100 text-amber-700',
  reject: 'bg-red-100 text-red-700',
};

export default function PanelReviewPage() {
  const [data, setData] = useState<PanelData | null>(null);
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');

  const [docId, setDocId] = useState('');
  const [advocateName, setAdvocateName] = useState('');
  const [advocateEmail, setAdvocateEmail] = useState('');
  const [generating, setGenerating] = useState(false);
  const [newLink, setNewLink] = useState('');
  const [copied, setCopied] = useState(false);

  const [statusFilter, setStatusFilter] =
    useState<'all' | 'submitted' | 'pending' | 'expired'>('all');
  const [expandedToken, setExpandedToken] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setFetching(true);
    try {
      const [panelRes, docsRes] = await Promise.all([
        apiFetch('/api/drafting/admin/panel-review'),
        apiFetch('/api/drafting/'),
      ]);
      if (panelRes.ok) setData(await panelRes.json());
      if (docsRes.ok) {
        const body = await docsRes.json();
        setDocs(body.documents ?? []);
      }
    } catch {
      setError('Network error loading panel data.');
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docId || !advocateName.trim()) return;
    setGenerating(true);
    setNewLink('');
    try {
      const res = await apiFetch('/api/drafting/admin/review-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: docId,
          assignedTo: advocateName.trim(),
          assignedEmail: advocateEmail.trim() || undefined,
        }),
      });
      if (res.ok) {
        const body = await res.json();
        const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/review/${body.token}`;
        setNewLink(url);
        setAdvocateName('');
        setAdvocateEmail('');
        setDocId('');
        await fetchAll();
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleDisable = async (token: string) => {
    await apiFetch(
      `/api/drafting/admin/review-tokens/${encodeURIComponent(token)}/disable`,
      { method: 'PATCH' },
    );
    await fetchAll();
  };

  const reviewUrl = (token: string) =>
    `${typeof window !== 'undefined' ? window.location.origin : ''}/review/${token}`;

  const copyUrl = (url: string) => {
    void navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const filtered = (data?.matrix ?? []).filter(
    (r) => statusFilter === 'all' || r.status === statusFilter,
  );

  const verdictTotal =
    (data?.counts.verdicts.ready_to_file ?? 0) +
    (data?.counts.verdicts.minor_edits ?? 0) +
    (data?.counts.verdicts.major_edits ?? 0) +
    (data?.counts.verdicts.reject ?? 0);

  return (
    <div>
      <AdminPageHeader
        title="Panel review"
        eyebrow="Single-shot review links · Jharkhand panel"
      >
        <a
          href="#"
          onClick={(e) => e.preventDefault()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ExternalLink size={13} /> Export matrix
        </a>
      </AdminPageHeader>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* KPI tiles */}
      {data && (
        <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Kpi label="Total" value={data.counts.total} color="slate" />
          <Kpi label="Submitted" value={data.counts.submitted} color="green" />
          <Kpi label="Pending" value={data.counts.pending} color="amber" />
          <Kpi label="Expired" value={data.counts.expired} color="red" />
        </div>
      )}

      {/* Generate link */}
      <form
        onSubmit={handleGenerate}
        className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <p className="mb-3 text-sm font-semibold text-slate-800">Generate review link</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
          <select
            value={docId}
            onChange={(e) => setDocId(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="">Pick a document…</option>
            {docs.map((d) => (
              <option key={d._id} value={d._id}>
                {d.title.slice(0, 70)}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Advocate name (e.g. Adv. Kumar)"
            value={advocateName}
            onChange={(e) => setAdvocateName(e.target.value)}
            maxLength={100}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <input
            type="email"
            placeholder="Advocate email (optional)"
            value={advocateEmail}
            onChange={(e) => setAdvocateEmail(e.target.value)}
            maxLength={200}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <button
            type="submit"
            disabled={generating}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {generating ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            Generate link
          </button>
        </div>
        {newLink && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
            <CheckCircle2 size={14} className="text-green-600" />
            <code className="flex-1 truncate font-mono text-xs text-green-800">{newLink}</code>
            <button
              type="button"
              onClick={() => copyUrl(newLink)}
              className="text-green-700 hover:text-green-900"
            >
              {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
            </button>
          </div>
        )}
      </form>

      {/* Filter tabs */}
      <div className="mb-3 flex items-center gap-1 rounded-lg bg-slate-100 p-1 w-fit">
        {(['all', 'submitted', 'pending', 'expired'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              statusFilter === s
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Matrix table */}
      <div className="mb-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {fetching ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
            <Loader2 size={14} className="animate-spin" />
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">
            No tokens match this filter.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Advocate</th>
                <th className="px-4 py-3">Document</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3">Verdict</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <RowGroup
                  key={r.token}
                  row={r}
                  expanded={expandedToken === r.token}
                  onToggle={() =>
                    setExpandedToken((t) => (t === r.token ? null : r.token))
                  }
                  onCopy={() => copyUrl(reviewUrl(r.token))}
                  onDisable={() => handleDisable(r.token)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Verdict distribution */}
      {data && verdictTotal > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-slate-800">Verdict distribution</p>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
            {(['ready_to_file', 'minor_edits', 'major_edits', 'reject'] as const).map((k) => {
              const n = data.counts.verdicts[k] ?? 0;
              const pct = verdictTotal ? (n / verdictTotal) * 100 : 0;
              return (
                <div
                  key={k}
                  className={VERDICT_BAR[k]}
                  style={{ width: `${pct}%` }}
                  title={`${VERDICT_LABEL[k]}: ${n}`}
                />
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
            {(['ready_to_file', 'minor_edits', 'major_edits', 'reject'] as const).map((k) => {
              const n = data.counts.verdicts[k] ?? 0;
              const pct = verdictTotal ? Math.round((n / verdictTotal) * 100) : 0;
              return (
                <div key={k} className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-sm ${VERDICT_BAR[k]}`} />
                  <span className="text-slate-600">{VERDICT_LABEL[k]}</span>
                  <span className="font-mono text-slate-500">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'slate' | 'green' | 'amber' | 'red' | 'blue';
}) {
  const tint =
    color === 'green'
      ? 'text-green-600'
      : color === 'amber'
        ? 'text-amber-600'
        : color === 'red'
          ? 'text-red-500'
          : color === 'blue'
            ? 'text-blue-600'
            : 'text-slate-700';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${tint}`}>{value}</p>
    </div>
  );
}

function RowGroup({
  row,
  expanded,
  onToggle,
  onCopy,
  onDisable,
}: {
  row: MatrixRow;
  expanded: boolean;
  onToggle: () => void;
  onCopy: () => void;
  onDisable: () => void;
}) {
  return (
    <>
      <tr>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">
              {row.assignedTo
                .split(' ')
                .map((s) => s[0])
                .filter(Boolean)
                .slice(0, 2)
                .join('')
                .toUpperCase()}
            </span>
            <span className="font-medium text-slate-800">{row.assignedTo}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-slate-600">{row.documentTitle}</td>
        <td className="px-4 py-3 text-center">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              row.status === 'submitted'
                ? 'bg-green-100 text-green-700'
                : row.status === 'pending'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-slate-100 text-slate-500'
            }`}
          >
            {row.status}
          </span>
        </td>
        <td className="px-4 py-3">
          {row.verdict ? (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${VERDICT_PILL[row.verdict] ?? 'bg-slate-100'}`}>
              {VERDICT_LABEL[row.verdict] ?? row.verdict}
            </span>
          ) : (
            <span className="text-xs text-slate-300">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-xs text-slate-500">
          {row.submittedAt
            ? new Date(row.submittedAt).toLocaleString('en-IN', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })
            : '—'}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCopy}
              className="text-slate-400 hover:text-slate-700"
              title="Copy review URL"
            >
              <Copy size={13} />
            </button>
            {row.status === 'submitted' ? (
              <button
                type="button"
                onClick={onToggle}
                className="text-xs font-medium text-blue-600 hover:text-blue-800"
              >
                {expanded ? 'Hide' : 'View'}
              </button>
            ) : (
              <button
                type="button"
                onClick={onDisable}
                className="flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-700"
              >
                <XCircle size={13} /> Revoke
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && row.checklist && (
        <tr className="bg-slate-50">
          <td colSpan={6} className="px-4 py-4">
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              {Object.entries(row.checklist).map(([k, v]) => (
                <div key={k} className="flex items-center gap-1.5">
                  {v ? (
                    <CheckCircle2 size={12} className="text-green-500" />
                  ) : (
                    <XCircle size={12} className="text-red-500" />
                  )}
                  <span className="text-slate-600">{prettyKey(k)}</span>
                </div>
              ))}
            </div>
            {row.comments && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">
                <p className="mb-1 font-semibold text-slate-500">Comments:</p>
                <p className="whitespace-pre-wrap">{row.comments}</p>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function prettyKey(k: string): string {
  return k
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .replace(/\?$/, '');
}

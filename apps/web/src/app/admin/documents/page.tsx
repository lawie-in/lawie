'use client';

import { FileText, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { apiFetch } from '@/lib/apiFetch';

interface DocAnalytics {
  kpis: {
    totalDocs: number;
    totalDocsThisMonth: number;
    finalisedRate: number;
    aiCostInr: number;
    aiGenCount: number;
    avgCostPerGenInr: number;
  };
  docTypeBreakdown: Array<{ _id: string; count: number }>;
  templateUsage: Array<{
    templateId: string;
    displayName: string;
    category: string;
    planAccess: string;
    count: number;
    finalisedRate: number;
  }>;
}

interface ExportRow {
  _id: string;
  title: string;
  docType: string;
  userName: string;
  exportedAs: string[];
  exportedAt: string;
}

export default function AdminDocumentsPage() {
  const [analytics, setAnalytics] = useState<DocAnalytics | null>(null);
  const [exports, setExports] = useState<ExportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [aRes, eRes] = await Promise.all([
          apiFetch('/api/drafting/admin/documents/analytics'),
          apiFetch('/api/drafting/admin/documents/exports?limit=20'),
        ]);
        if (aRes.ok) setAnalytics(await aRes.json());
        if (eRes.ok) {
          const body = await eRes.json();
          setExports(body.exports ?? []);
        }
        if (!aRes.ok) setError('Failed to load document analytics.');
      } catch {
        setError('Network error.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const maxDocType = analytics ? Math.max(...analytics.docTypeBreakdown.map((d) => d.count), 1) : 1;

  return (
    <div>
      <AdminPageHeader
        title="Documents"
        eyebrow="Template usage · doc types · export activity · AI cost"
      >
        <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600">
          <FileText size={13} />
          Analytics
        </div>
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

      {analytics && (
        <>
          {/* KPI tiles */}
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
            <KpiTile
              label="Total documents"
              value={analytics.kpis.totalDocs.toLocaleString('en-IN')}
              sub={`+${analytics.kpis.totalDocsThisMonth} this month`}
            />
            <KpiTile
              label="Finalised rate"
              value={`${analytics.kpis.finalisedRate}%`}
              sub="of all documents finalised or exported"
            />
            <KpiTile
              label="AI cost (this month)"
              value={`₹${analytics.kpis.aiCostInr.toLocaleString('en-IN')}`}
              sub={`${analytics.kpis.aiGenCount} generations · avg ₹${analytics.kpis.avgCostPerGenInr} ea`}
            />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
            {/* Doc type breakdown */}
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-slate-800">Doc type breakdown</h2>
              <div className="space-y-2">
                {analytics.docTypeBreakdown.map((dt) => (
                  <div key={dt._id}>
                    <div className="mb-0.5 flex items-center justify-between text-xs">
                      <span className="capitalize text-slate-600">{dt._id || 'Unknown'}</span>
                      <span className="font-semibold text-slate-800">{dt.count}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-amber-400 transition-all"
                        style={{ width: `${Math.round((dt.count / maxDocType) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
                {analytics.docTypeBreakdown.length === 0 && (
                  <p className="text-xs text-slate-400">No data yet.</p>
                )}
              </div>
            </section>

            {/* Template usage */}
            <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-800">Template usage</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="px-4 py-3">Template</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3 text-right">Docs</th>
                      <th className="px-4 py-3 text-right">Finalised %</th>
                      <th className="px-4 py-3 text-center">Access</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {analytics.templateUsage.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-400">
                          No template usage data yet.
                        </td>
                      </tr>
                    )}
                    {analytics.templateUsage.map((t) => (
                      <tr key={t.templateId} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800">{t.displayName}</p>
                          <p className="font-mono text-[10px] text-slate-400">{t.templateId}</p>
                        </td>
                        <td className="px-4 py-3 text-xs capitalize text-slate-500">
                          {t.category || '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-800">
                          {t.count}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-slate-600">
                          {t.finalisedRate}%
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              t.planAccess === 'pro'
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {t.planAccess}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* Recent exports */}
          <section className="mt-5 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-800">Recent exports (last 20)</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Doc type</th>
                    <th className="px-4 py-3">Advocate</th>
                    <th className="px-4 py-3">Formats</th>
                    <th className="px-4 py-3">Exported at</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {exports.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-400">
                        No exports yet.
                      </td>
                    </tr>
                  )}
                  {exports.map((ex) => (
                    <tr key={ex._id} className="hover:bg-slate-50">
                      <td className="max-w-[220px] truncate px-4 py-3 font-medium text-slate-800">
                        {ex.title || '(Untitled)'}
                      </td>
                      <td className="px-4 py-3 text-xs capitalize text-slate-500">
                        {ex.docType || '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{ex.userName}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(ex.exportedAs ?? []).map((fmt) => (
                            <span
                              key={fmt}
                              className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600"
                            >
                              {fmt}
                            </span>
                          ))}
                          {(ex.exportedAs ?? []).length === 0 && (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {ex.exportedAt
                          ? new Date(ex.exportedAt).toLocaleString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}

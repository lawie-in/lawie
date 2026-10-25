'use client';

import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { apiFetch } from '@/lib/apiFetch';

interface AuditLogRow {
  _id: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  eventType: string;
  severity: string;
  ipAddress: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

type SeverityTab = 'all' | 'info' | 'warning' | 'critical';

const SEVERITY_COLORS: Record<string, string> = {
  info: 'bg-blue-100 text-blue-700',
  warning: 'bg-amber-100 text-amber-700',
  critical: 'bg-red-100 text-red-700',
};

const EVENT_TYPES = [
  '',
  'login',
  'logout',
  'login_failed',
  'password_reset',
  'email_verified',
  'admin_action',
  'subscription_created',
  'subscription_cancelled',
  'ink_granted',
  'user_deactivated',
  'user_reactivated',
  'referral_used',
];

const PAGE_SIZE = 50;

export default function AdminAuditLogPage() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [severityTab, setSeverityTab] = useState<SeverityTab>('all');
  const [eventType, setEventType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [skip, setSkip] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError('');

    const params = new URLSearchParams({ limit: String(PAGE_SIZE), skip: String(skip) });
    if (severityTab !== 'all') params.set('severity', severityTab);
    if (eventType) params.set('eventType', eventType);
    if (from) params.set('from', new Date(from).toISOString());
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      params.set('to', end.toISOString());
    }

    apiFetch(`/api/auth/admin/audit-log?${params.toString()}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (ctrl.signal.aborted) return;
        if (res.ok) {
          const body = await res.json();
          setLogs(body.logs ?? []);
          setTotal(body.total ?? 0);
        } else {
          setError('Failed to load audit log.');
        }
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') setError('Network error.');
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });

    return () => ctrl.abort();
  }, [severityTab, eventType, from, to, skip]);

  const handleTabChange = (t: SeverityTab) => {
    setSeverityTab(t);
    setSkip(0);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(skip / PAGE_SIZE) + 1;

  return (
    <div>
      <AdminPageHeader
        title="Audit log"
        eyebrow="Security events · DPDP Act compliance · 2-year retention"
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Severity tabs */}
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {(['all', 'info', 'warning', 'critical'] as const).map((t) => (
            <button
              key={t}
              onClick={() => handleTabChange(t)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                severityTab === t ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Event type */}
        <select
          value={eventType}
          onChange={(e) => {
            setEventType(e.target.value);
            setSkip(0);
          }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          {EVENT_TYPES.map((et) => (
            <option key={et} value={et}>
              {et || 'All event types'}
            </option>
          ))}
        </select>

        {/* Date range */}
        <input
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setSkip(0);
          }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
          title="From date"
        />
        <span className="text-xs text-slate-400">to</span>
        <input
          type="date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setSkip(0);
          }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
          title="To date"
        />

        <span className="ml-auto text-xs text-slate-400">
          {total.toLocaleString('en-IN')} events
        </span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : logs.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">
            No events match this filter.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="w-4 px-4 py-3" />
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Advocate</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3 text-center">Severity</th>
                <th className="px-4 py-3">IP address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => (
                <>
                  <tr
                    key={log._id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => setExpanded(expanded === log._id ? null : log._id)}
                  >
                    <td className="px-4 py-3 text-slate-400">
                      {expanded === log._id ? (
                        <ChevronDown size={12} />
                      ) : (
                        <ChevronRight size={12} />
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                      {new Date(log.createdAt).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      {log.userName ? (
                        <div>
                          <p className="font-medium text-slate-800">{log.userName}</p>
                          <p className="text-[11px] text-slate-400">{log.userEmail}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">
                        {log.eventType}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          SEVERITY_COLORS[log.severity] ?? 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {log.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {log.ipAddress || '—'}
                    </td>
                  </tr>
                  {expanded === log._id && log.metadata && (
                    <tr key={`${log._id}-meta`}>
                      <td colSpan={6} className="bg-slate-50 px-8 py-3">
                        <pre className="overflow-x-auto rounded-lg bg-slate-100 p-3 font-mono text-[11px] text-slate-700">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={skip === 0}
              onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={skip + PAGE_SIZE >= total}
              onClick={() => setSkip(skip + PAGE_SIZE)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

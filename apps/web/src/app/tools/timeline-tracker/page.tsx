'use client';

import {
  Clock,
  ArrowLeft,
  AlertTriangle,
  Calendar,
  Shield,
  FileText,
  ArrowRight,
  CheckCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useState, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// ── Types ────────────────────────────────────────────────────────────────────

interface TimelineMilestone {
  date: string;
  label: string;
  description: string;
  type: 'start' | 'police_custody' | 'judicial_custody' | 'chargesheet' | 'default_bail';
  critical: boolean;
}

interface TimelineResult {
  arrestDate: string;
  maxYears: number;
  isLifeOrDeath: boolean;
  policeCustodyEndDate: string;
  policeCustodyDays: number;
  judicialCustodyEndDate: string;
  judicialCustodyDays: number;
  chargesheetDeadline: string;
  defaultBailDate: string;
  bnssSection: string;
  bnssSectionTitle: string;
  remandBreakdown: {
    policeCustody: { from: string; to: string; days: number };
    judicialCustody: { from: string; to: string; days: number };
  };
  milestones: TimelineMilestone[];
  defaultBailAvailable: boolean;
  defaultBailExplanation: string;
  sectionsUsed: string[];
  sectionsNotFound: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysFromNow(iso: string): number {
  const target = new Date(iso + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// ── Milestone Colors ─────────────────────────────────────────────────────────

const MILESTONE_STYLES: Record<string, { bg: string; border: string; dot: string; text: string }> =
  {
    start: {
      bg: 'bg-slate-50',
      border: 'border-slate-300',
      dot: 'bg-slate-400',
      text: 'text-slate-700',
    },
    police_custody: {
      bg: 'bg-amber-50',
      border: 'border-amber-300',
      dot: 'bg-amber-500',
      text: 'text-amber-800',
    },
    judicial_custody: {
      bg: 'bg-orange-50',
      border: 'border-orange-300',
      dot: 'bg-orange-500',
      text: 'text-orange-800',
    },
    chargesheet: {
      bg: 'bg-red-50',
      border: 'border-red-300',
      dot: 'bg-red-500',
      text: 'text-red-800',
    },
    default_bail: {
      bg: 'bg-green-50',
      border: 'border-green-300',
      dot: 'bg-green-500',
      text: 'text-green-800',
    },
  };

// ── Component ────────────────────────────────────────────────────────────────

export default function TimelineTrackerPage() {
  const [arrestDate, setArrestDate] = useState('');
  const [sections, setSections] = useState('');
  const [result, setResult] = useState<TimelineResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCalculate = useCallback(async () => {
    if (!arrestDate || !sections.trim()) return;

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch(
        `${API_URL}/api/sections/timeline?arrestDate=${encodeURIComponent(arrestDate)}&sections=${encodeURIComponent(sections.trim())}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      const data: TimelineResult = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [arrestDate, sections]);

  const handleExample = () => {
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    const dateStr = thirtyDaysAgo.toISOString().split('T')[0];
    setArrestDate(dateStr);
    setSections('303, 311');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-6">
          <Link
            href="/tools"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft className="h-4 w-4" />
            All Free Tools
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
              <Clock className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                BNSS Investigation Timeline Tracker
              </h1>
              <p className="text-sm text-slate-500">
                Calculate custody limits, chargesheet deadlines, and default bail dates
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        {/* Input */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Date of Arrest / FIR
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={arrestDate}
                  onChange={(e) => setArrestDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                BNS Sections (comma-separated)
              </label>
              <input
                type="text"
                value={sections}
                onChange={(e) => setSections(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCalculate()}
                placeholder="e.g. 303, 311, 109"
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleCalculate}
              disabled={loading || !arrestDate || !sections.trim()}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Calculating...' : 'Calculate Timeline'}
            </button>
            <button
              onClick={handleExample}
              className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
            >
              Try Example
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex items-center gap-2 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="mt-6 space-y-4">
            {/* Summary Cards */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-600">
                  Police Custody Limit
                </div>
                <div className="text-lg font-bold text-amber-900">
                  {formatDate(result.policeCustodyEndDate)}
                </div>
                <div className="mt-1 text-xs text-amber-700">
                  {result.policeCustodyDays} days from arrest (BNSS 187)
                </div>
              </div>

              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-red-600">
                  Chargesheet Deadline
                </div>
                <div className="text-lg font-bold text-red-900">
                  {formatDate(result.chargesheetDeadline)}
                </div>
                <div className="mt-1 text-xs text-red-700">
                  {result.judicialCustodyDays} days —{' '}
                  {(() => {
                    const d = daysFromNow(result.chargesheetDeadline);
                    if (d < 0) return `${Math.abs(d)} days overdue`;
                    if (d === 0) return 'due today';
                    return `${d} days remaining`;
                  })()}
                </div>
              </div>

              <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-green-600">
                  Default Bail Date
                </div>
                <div className="text-lg font-bold text-green-900">
                  {formatDate(result.defaultBailDate)}
                </div>
                <div className="mt-1 text-xs text-green-700">
                  Day {result.judicialCustodyDays + 1} — BNSS 187(3)
                </div>
              </div>
            </div>

            {/* Sections Not Found Warning */}
            {result.sectionsNotFound.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center gap-2 text-sm text-amber-700">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Sections not found in BNS database: {result.sectionsNotFound.join(', ')}. Timeline
                  calculated using remaining sections only.
                </div>
              </div>
            )}

            {/* Visual Timeline */}
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-6 py-3">
                <h3 className="font-semibold text-slate-900">Investigation Timeline</h3>
              </div>
              <div className="px-6 py-4">
                <div className="relative space-y-0">
                  {result.milestones.map((m, i) => {
                    const style = MILESTONE_STYLES[m.type] ?? MILESTONE_STYLES.start;
                    const isLast = i === result.milestones.length - 1;
                    const isPast = daysFromNow(m.date) < 0;
                    const isToday = daysFromNow(m.date) === 0;

                    return (
                      <div key={i} className="relative flex gap-4 pb-6">
                        {/* Vertical line */}
                        {!isLast && (
                          <div className="absolute left-[11px] top-6 h-full w-0.5 bg-slate-200" />
                        )}
                        {/* Dot */}
                        <div
                          className={`relative z-10 mt-1 h-6 w-6 shrink-0 rounded-full border-2 ${
                            isPast
                              ? 'border-slate-300 bg-slate-200'
                              : isToday
                                ? `border-blue-500 bg-blue-500`
                                : `border-current ${style.dot}`
                          } flex items-center justify-center`}
                        >
                          {isPast && <CheckCircle className="h-4 w-4 text-slate-500" />}
                        </div>
                        {/* Content */}
                        <div
                          className={`flex-1 rounded-lg border p-3 ${style.bg} ${style.border} ${isPast ? 'opacity-60' : ''}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`text-sm font-semibold ${style.text}`}>{m.label}</span>
                            <span className="text-xs font-medium text-slate-500">
                              {formatDate(m.date)}
                              {isToday && (
                                <span className="ml-1.5 rounded bg-blue-100 px-1.5 py-0.5 text-blue-700">
                                  Today
                                </span>
                              )}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-600">{m.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Remand Breakdown */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-3 font-semibold text-slate-900">Staggered Remand Breakdown</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-amber-500" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">
                        Police / Physical Custody
                      </span>
                      <span className="text-sm text-slate-500">
                        {result.remandBreakdown.policeCustody.days} days
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {formatDate(result.remandBreakdown.policeCustody.from)} —{' '}
                      {formatDate(result.remandBreakdown.policeCustody.to)}
                    </div>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div className="flex h-full">
                    <div
                      className="bg-amber-400"
                      style={{
                        width: `${(result.remandBreakdown.policeCustody.days / result.judicialCustodyDays) * 100}%`,
                      }}
                    />
                    <div
                      className="bg-blue-400"
                      style={{
                        width: `${(result.remandBreakdown.judicialCustody.days / result.judicialCustodyDays) * 100}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-blue-500" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">Judicial Custody</span>
                      <span className="text-sm text-slate-500">
                        {result.remandBreakdown.judicialCustody.days} days
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {formatDate(result.remandBreakdown.judicialCustody.from)} —{' '}
                      {formatDate(result.remandBreakdown.judicialCustody.to)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Default Bail Box */}
            <div className="rounded-xl border-2 border-green-200 bg-green-50 p-6">
              <div className="mb-2 flex items-center gap-2">
                <Shield className="h-5 w-5 text-green-600" />
                <h3 className="font-semibold text-green-900">Default Bail — BNSS Section 187(3)</h3>
              </div>
              <p className="text-sm text-green-800">{result.defaultBailExplanation}</p>
              <div className="mt-3 rounded-lg bg-white/60 p-3 text-sm">
                <span className="font-medium">Applicable BNSS provision:</span>{' '}
                {result.bnssSectionTitle}
              </div>
            </div>

            {/* BNSS Reference */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                <div>
                  <h3 className="font-semibold text-slate-900">Legal Reference</h3>
                  <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
                    <li>
                      <span className="font-medium">BNSS Section 187(2):</span> Police custody shall
                      not exceed 15 days in the whole (first produced before Magistrate within 24
                      hours of arrest).
                    </li>
                    <li>
                      <span className="font-medium">BNSS Section 187(3):</span> Default bail — if
                      investigation not completed within 60/90 days, the accused shall be released
                      on bail. This right is indefeasible.
                    </li>
                    <li>
                      <span className="font-medium">BNSS Section 187(4):</span> 60 days for offences
                      punishable with imprisonment &lt; 10 years; 90 days for offences punishable
                      with death, life imprisonment, or &ge; 10 years.
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-6 text-center">
              <p className="mb-3 text-sm text-slate-700">
                Need to file a default bail application?
              </p>
              <Link
                href="/dashboard/new?type=bail_application"
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Draft with Lawie&apos;s AI
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Disclaimer */}
            <p className="text-center text-xs text-slate-400">
              This tool is for informational purposes only. Actual custody periods depend on court
              orders, remand extensions, and case-specific facts. Always verify timelines with
              applicable BNSS provisions. Lawie does not provide legal advice.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

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

import CookieSettingsButton from '@/components/CookieSettingsButton';

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
  /** null when no default-bail period can be given (T-277) */
  maxYears: number | null;
  isLifeOrDeath: boolean;
  /** T-367: last day of the police-custody window (day 40 / 60); null with no period */
  policeCustodyEndDate: string | null;
  policeCustodyDays: number;
  /** T-367 R1 line (Ajay), or the "Depends on the offence" note with no period */
  policeCustodyNote?: string;
  judicialCustodyEndDate: string | null;
  judicialCustodyDays: number | null;
  chargesheetDeadline: string | null;
  defaultBailDate: string | null;
  /** T-367 R2 line (Ajay); null with no period */
  detentionLimitNote?: string | null;
  /** T-367 R3 line (Ajay); null with no period */
  chargesheetNote?: string | null;
  /** "Depends on the offence. Check BNSS section 187." when there is no period */
  periodNote?: string | null;
  bnssSection: string;
  bnssSectionTitle: string;
  milestones: TimelineMilestone[];
  defaultBailAvailable: boolean | null;
  defaultBailExplanation: string;
  sectionsUsed: string[];
  sectionsNotFound: string[];
  sectionsWithoutPeriod?: string[];
  /** Per-section notes from the API (Ajay's texts) */
  sectionNotes?: Record<string, string>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** T-367 (Ajay): dates print as "4 April 2026". Read from the ISO parts, so no time zone shifts the day. */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
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

  // T-277: the 60/90-day parts render only when the API gives a period.
  const period =
    result &&
    result.judicialCustodyDays !== null &&
    result.chargesheetDeadline !== null &&
    result.defaultBailDate !== null
      ? {
          days: result.judicialCustodyDays,
          chargesheetDeadline: result.chargesheetDeadline,
          defaultBailDate: result.defaultBailDate,
        }
      : null;
  // T-367 Addendum 1 (4): the card uses the police milestone's label from the API.
  const policeMilestone = result?.milestones.find((m) => m.type === 'police_custody');
  const chargesheetMilestone = result?.milestones.find((m) => m.type === 'chargesheet');
  const defaultBailMilestone = result?.milestones.find((m) => m.type === 'default_bail');
  const sectionNoteList = result?.sectionNotes ? Object.values(result.sectionNotes) : [];

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
                Calculate custody limits, charge sheet deadlines, and default bail dates
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
              {/* T-367 Addendum 1 (1): Ajay's label and help text. */}
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Date of first remand
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
              <p className="mt-1 text-xs text-slate-500">
                The date the Magistrate first ordered the accused into custody. This is day 1.
              </p>
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
              {/* T-367: the window date and Ajay's R1 line come from the API. */}
              {result.policeCustodyEndDate && policeMilestone && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="mb-1 text-xs font-medium text-amber-600">
                    {policeMilestone.label}
                  </div>
                  <div className="text-lg font-bold text-amber-900">
                    {formatDate(result.policeCustodyEndDate)}
                  </div>
                  {result.policeCustodyNote && (
                    <div className="mt-1 text-xs text-amber-700">{result.policeCustodyNote}</div>
                  )}
                </div>
              )}

              {period && (
                <>
                  {/* T-367 Addendum 2 (3a, 3b): card headings are the API's milestone labels. */}
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                    <div className="mb-1 text-xs font-medium text-red-600">
                      {chargesheetMilestone?.label}
                    </div>
                    <div className="text-lg font-bold text-red-900">
                      {formatDate(period.chargesheetDeadline)}
                    </div>
                    <div className="mt-1 text-xs text-red-700">
                      {period.days} days —{' '}
                      {(() => {
                        const d = daysFromNow(period.chargesheetDeadline);
                        if (d < 0) return `${Math.abs(d)} days overdue`;
                        if (d === 0) return 'due today';
                        return `${d} days remaining`;
                      })()}
                    </div>
                  </div>

                  <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                    <div className="mb-1 text-xs font-medium text-green-600">
                      {defaultBailMilestone?.label}
                    </div>
                    <div className="text-lg font-bold text-green-900">
                      {formatDate(period.defaultBailDate)}
                    </div>
                    <div className="mt-1 text-xs text-green-700">
                      Day {period.days + 1}: default bail (BNSS 187(3))
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* No period (T-277): the API's note replaces the 60/90-day parts */}
            {!period && result.periodNote && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center gap-2 text-sm text-amber-700">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {result.periodNote}
                </div>
              </div>
            )}

            {/* Per-section notes from the API (T-277). T-278: a not-found section's
                note also comes from here; the page adds no text of its own. */}
            {sectionNoteList.length > 0 &&
              sectionNoteList.map((note, i) => (
                <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-center gap-2 text-sm text-amber-700">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {note}
                  </div>
                </div>
              ))}

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

            {/* Default Bail Box */}
            {period && (
              <div className="rounded-xl border-2 border-green-200 bg-green-50 p-6">
                <div className="mb-2 flex items-center gap-2">
                  <Shield className="h-5 w-5 text-green-600" />
                  <h3 className="font-semibold text-green-900">Default bail (BNSS 187(3))</h3>
                </div>
                <p className="text-sm text-green-800">{result.defaultBailExplanation}</p>
                <div className="mt-3 rounded-lg bg-white/60 p-3 text-sm">
                  <span className="font-medium">Applicable BNSS provision:</span>{' '}
                  {result.bnssSectionTitle}
                </div>
              </div>
            )}

            {/* BNSS Reference */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                <div>
                  <h3 className="font-semibold text-slate-900">Legal Reference</h3>
                  <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
                    {/* T-367: Ajay's R1 and R2 lines replace the old 187(2) and 187(4) items. */}
                    {result.policeCustodyNote && <li>{result.policeCustodyNote}</li>}
                    {result.detentionLimitNote && <li>{result.detentionLimitNote}</li>}
                    {/* T-367 Addendum 1 (7): Ajay's signed 187(3) line, exactly. */}
                    <li>
                      BNSS 187(3): if the investigation is not completed within 60 or 90 days, the
                      accused is to be released on bail if prepared to and does furnish bail
                      (default bail).
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

            {/* Disclaimer: Ajay's signed text (T-367 Addendum 2, 3f). */}
            <p className="text-center text-xs text-slate-400">
              This tracker counts dates from the date you enter. It is not legal advice. Check the
              remand orders and the BNSS before relying on it.
            </p>
          </div>
        )}

        {/* T-310: reopens the analytics consent notice (S9). */}
        <div className="mt-8 text-center">
          <CookieSettingsButton variant="tool" />
        </div>
      </div>
    </div>
  );
}

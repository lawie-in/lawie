'use client';

import {
  Scale,
  Search,
  ArrowLeft,
  Shield,
  ShieldAlert,
  Gavel,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import { useState, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// ── Types ────────────────────────────────────────────────────────────────────

interface OffenceInfo {
  section: string;
  title: string;
  punishment: string;
  maxYears: number;
  bailable: boolean;
  cognizable: boolean;
  compoundable: boolean;
  chapter: string;
}

interface SectionResult {
  input: string;
  bnsSection: string;
  convertedFromIpc: boolean;
  ipcSection?: string;
  offence: OffenceInfo | null;
  found: boolean;
}

interface BailCheckResult {
  sections: SectionResult[];
  summary: {
    overallBailable: boolean;
    mostSeriousSection: string;
    maxPunishment: string;
    maxYears: number;
    bnssBailSection: string;
    bnssBailSectionTitle: string;
    courtLevel: string;
    courtLevelExplanation: string;
    recommendation: string;
  };
}

// ── Example Buttons ──────────────────────────────────────────────────────────

const EXAMPLES = [
  { label: 'BNS 303 (Theft)', value: '303' },
  { label: 'BNS 103 (Murder)', value: '103' },
  { label: 'IPC 420, 406', value: '420, 406' },
  { label: 'BNS 115, 351', value: '115, 351' },
  { label: 'IPC 302, 307', value: '302, 307' },
];

// ── Component ────────────────────────────────────────────────────────────────

export default function BailCheckerPage() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<BailCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCheck = useCallback(
    async (query?: string) => {
      const q = (query ?? input).trim();
      if (!q) return;

      setLoading(true);
      setError('');
      setResult(null);

      try {
        const res = await fetch(
          `${API_URL}/api/sections/bail-check?sections=${encodeURIComponent(q)}`,
        );
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `Request failed (${res.status})`);
        }
        const data: BailCheckResult = await res.json();
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      } finally {
        setLoading(false);
      }
    },
    [input],
  );

  const handleExample = (value: string) => {
    setInput(value);
    handleCheck(value);
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
              <Scale className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Bail Eligibility Checker</h1>
              <p className="text-sm text-slate-500">
                Check if an offence is bailable or non-bailable under BNS/BNSS
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        {/* Input */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Enter BNS or IPC section numbers (comma-separated)
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
                placeholder="e.g. 303, 351 or 302-IPC, 506-IPC"
                className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={() => handleCheck()}
              disabled={loading || !input.trim()}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Checking...' : 'Check'}
            </button>
          </div>

          {/* Examples */}
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="text-xs text-slate-400">Try:</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.value}
                onClick={() => handleExample(ex.value)}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
              >
                {ex.label}
              </button>
            ))}
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
            {/* Summary Card */}
            <div
              className={`rounded-xl border-2 p-6 ${
                result.summary.overallBailable
                  ? 'border-green-200 bg-green-50'
                  : 'border-red-200 bg-red-50'
              }`}
            >
              <div className="mb-3 flex items-center gap-3">
                {result.summary.overallBailable ? (
                  <Shield className="h-8 w-8 text-green-600" />
                ) : (
                  <ShieldAlert className="h-8 w-8 text-red-600" />
                )}
                <div>
                  <h2 className="text-xl font-bold">
                    {result.summary.overallBailable ? 'Bailable' : 'Non-Bailable'}
                  </h2>
                  <p className="text-sm text-slate-600">
                    {result.summary.overallBailable
                      ? 'Bail is a matter of right'
                      : 'Bail is at the discretion of the court'}
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <Gavel className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                  <div>
                    <span className="font-medium">Court:</span> {result.summary.courtLevel}
                    <p className="mt-0.5 text-xs text-slate-500">
                      {result.summary.courtLevelExplanation}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Scale className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                  <div>
                    <span className="font-medium">BNSS Bail Section:</span>{' '}
                    {result.summary.bnssBailSectionTitle}
                  </div>
                </div>
                {result.summary.mostSeriousSection && (
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                    <div>
                      <span className="font-medium">Most serious offence:</span> BNS Section{' '}
                      {result.summary.mostSeriousSection} — {result.summary.maxPunishment}
                    </div>
                  </div>
                )}
              </div>

              <p className="mt-4 rounded-lg bg-white/60 p-3 text-sm font-medium">
                {result.summary.recommendation}
              </p>
            </div>

            {/* Per-section Details */}
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-6 py-3">
                <h3 className="font-semibold text-slate-900">Section-wise Analysis</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {result.sections.map((s, i) => (
                  <div key={i} className="px-6 py-4">
                    {s.found && s.offence ? (
                      <div>
                        <div className="mb-2 flex items-center gap-2">
                          <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-sm font-semibold">
                            BNS {s.bnsSection}
                          </span>
                          {s.convertedFromIpc && (
                            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                              Converted from IPC {s.ipcSection}
                            </span>
                          )}
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-medium ${
                              s.offence.bailable
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {s.offence.bailable ? 'Bailable' : 'Non-Bailable'}
                          </span>
                        </div>
                        <p className="mb-2 text-sm font-medium text-slate-800">{s.offence.title}</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500 sm:grid-cols-4">
                          <div>
                            <span className="font-medium text-slate-600">Punishment:</span>{' '}
                            {s.offence.punishment}
                          </div>
                          <div className="flex items-center gap-1">
                            {s.offence.cognizable ? (
                              <CheckCircle className="h-3 w-3 text-orange-500" />
                            ) : (
                              <XCircle className="h-3 w-3 text-slate-400" />
                            )}
                            {s.offence.cognizable ? 'Cognizable' : 'Non-Cognizable'}
                          </div>
                          <div className="flex items-center gap-1">
                            {s.offence.compoundable ? (
                              <CheckCircle className="h-3 w-3 text-blue-500" />
                            ) : (
                              <XCircle className="h-3 w-3 text-slate-400" />
                            )}
                            {s.offence.compoundable ? 'Compoundable' : 'Non-Compoundable'}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        Section &ldquo;{s.input}&rdquo; — not found in our BNS database.
                        {s.convertedFromIpc && (
                          <span className="text-xs text-amber-600">
                            (Tried converting from IPC {s.ipcSection})
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* CTA */}
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-6 text-center">
              <p className="mb-3 text-sm text-slate-700">Ready to draft the bail application?</p>
              <Link
                href="/dashboard/new?type=bail_application"
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Use Lawie&apos;s AI Drafter
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Disclaimer */}
            <p className="text-center text-xs text-slate-400">
              This tool is for informational purposes only. Bail eligibility depends on case facts,
              prior antecedents, and judicial discretion. Always verify with applicable law. Lawie
              does not provide legal advice.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

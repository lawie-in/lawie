'use client';

import { ArrowLeftRight, Search, FileText, ArrowLeft, Copy, Check } from 'lucide-react';
import Link from 'next/link';
import { useState, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// ── Types ────────────────────────────────────────────────────────────────────

interface MappingResult {
  old_section: string;
  old_code: string;
  old_code_full: string;
  new_section: string;
  new_code: string;
  new_code_full: string;
  title?: string;
  mapping_type?: string;
  notes?: string;
}

interface ConvertResult {
  original: string;
  converted: string;
  conversions: Array<{
    original: string;
    replacement: string;
    section: string;
    oldCode: string;
    newCode: string;
    newSection: string;
  }>;
  count: number;
}

type Tab = 'search' | 'convert';

// ── Section Converter Page ──────────────────────────────────────────────────

export default function SectionConverterPage() {
  const [activeTab, setActiveTab] = useState<Tab>('search');

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-6">
          <Link
            href="/"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Lawie
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
              <ArrowLeftRight className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                IPC / CrPC / IEA Section Converter
              </h1>
              <p className="text-sm text-slate-500">
                Instantly convert between old (IPC, CrPC, IEA) and new (BNS, BNSS, BSA) section
                numbers. Free, no login required.
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="mx-auto max-w-4xl px-6 pt-6">
        <div className="flex gap-1 rounded-lg bg-slate-200 p-1">
          <button
            onClick={() => setActiveTab('search')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'search'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Search className="h-4 w-4" />
            Section Lookup
          </button>
          <button
            onClick={() => setActiveTab('convert')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'convert'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="h-4 w-4" />
            Bulk Text Converter
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="mx-auto max-w-4xl px-6 py-6">
        {activeTab === 'search' ? <SearchTab /> : <ConvertTab />}
      </div>

      {/* SEO Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-8">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">About the New Criminal Laws</h2>
          <div className="space-y-2 text-sm text-slate-600">
            <p>
              The Indian Parliament replaced three colonial-era criminal statutes effective 1 July
              2024:
            </p>
            <ul className="list-inside list-disc space-y-1 pl-2">
              <li>
                <strong>Indian Penal Code (IPC)</strong> replaced by{' '}
                <strong>Bharatiya Nyaya Sanhita (BNS)</strong>
              </li>
              <li>
                <strong>Code of Criminal Procedure (CrPC)</strong> replaced by{' '}
                <strong>Bharatiya Nagarik Suraksha Sanhita (BNSS)</strong>
              </li>
              <li>
                <strong>Indian Evidence Act (IEA)</strong> replaced by{' '}
                <strong>Bharatiya Sakshya Adhiniyam (BSA)</strong>
              </li>
            </ul>
            <p>
              This tool covers 500+ section mappings validated by a practising advocate. For
              professional drafting with auto-conversion, try{' '}
              <Link href="/login" className="font-medium text-blue-600 hover:underline">
                Lawie&apos;s AI document generator
              </Link>
              .
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ── Search Tab ──────────────────────────────────────────────────────────────

function SearchTab() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<MappingResult | null>(null);
  const [reverseResults, setReverseResults] = useState<MappingResult[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSearch = useCallback(
    async (overrideQuery?: string) => {
      const q = (overrideQuery ?? query).trim();
      if (!q) return;

      setLoading(true);
      setError('');
      setResult(null);
      setReverseResults(null);

      try {
        // Try auto-detect format first: "302 IPC", "103 BNS", "302-IPC"
        const match = q.match(
          /^(\d+[A-Z]?(?:\([a-z0-9]+\))?)\s*[-\s]\s*(IPC|CrPC|IEA|BNS|BNSS|BSA)$/i,
        );

        let res: Response;
        if (match) {
          res = await fetch(
            `${API_URL}/api/sections/map?section=${encodeURIComponent(match[1])}&code=${encodeURIComponent(match[2])}`,
          );
        } else {
          // Try as old-format "302-IPC"
          res = await fetch(`${API_URL}/api/sections/map?old=${encodeURIComponent(q)}`);
        }

        if (!res.ok) {
          if (res.status === 404) {
            setError(`No mapping found for "${q}". Check the section number and code.`);
          } else {
            setError('Something went wrong. Please try again.');
          }
          return;
        }

        const data = await res.json();

        if (data.direction === 'old_to_new') {
          // ?old= returns singular `result`; ?section=&code= (autoLookup) returns `results` array
          setResult(data.result ?? (Array.isArray(data.results) ? data.results[0] : data.results));
        } else if (data.direction === 'new_to_old') {
          setReverseResults(Array.isArray(data.results) ? data.results : [data.results]);
        } else if (data.result) {
          setResult(data.result);
        } else if (data.results) {
          setReverseResults(Array.isArray(data.results) ? data.results : [data.results]);
        }
      } catch {
        setError('Network error. Please check your connection.');
      } finally {
        setLoading(false);
      }
    },
    [query],
  );

  return (
    <div className="space-y-6">
      {/* Search Input */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <label htmlFor="section-search" className="mb-2 block text-sm font-medium text-slate-700">
          Enter a section number
        </label>
        <div className="flex gap-3">
          <input
            id="section-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch();
            }}
            placeholder="e.g. 302 IPC, 103 BNS, 154 CrPC"
            className="flex-1 rounded-lg border border-slate-300 px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          <button
            onClick={() => handleSearch()}
            disabled={loading || !query.trim()}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            <Search className="h-4 w-4" />
            {loading ? 'Looking up...' : 'Look up'}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Supports IPC, CrPC, IEA (old) and BNS, BNSS, BSA (new). Format: &quot;302 IPC&quot; or
          &quot;103 BNS&quot;
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Forward Result (old → new) */}
      {result && <MappingCard mapping={result} />}

      {/* Reverse Results (new → old) */}
      {reverseResults && reverseResults.map((r, i) => <MappingCard key={i} mapping={r} reverse />)}

      {/* Quick Examples */}
      {!result && !reverseResults && !error && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Try these examples</h3>
          <div className="flex flex-wrap gap-2">
            {['302 IPC', '420 IPC', '154 CrPC', '482 CrPC', '45 IEA', '103 BNS', '480 BNSS'].map(
              (ex) => (
                <button
                  key={ex}
                  onClick={() => {
                    setQuery(ex);
                    handleSearch(ex);
                  }}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                >
                  {ex}
                </button>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Mapping Result Card ─────────────────────────────────────────────────────

function MappingCard({ mapping, reverse }: { mapping: MappingResult; reverse?: boolean }) {
  const [copied, setCopied] = useState(false);

  const oldLabel = `Section ${mapping.old_section} ${mapping.old_code}`;
  const newLabel = `Section ${mapping.new_section} ${mapping.new_code}`;
  const copyText = reverse ? oldLabel : newLabel;

  const handleCopy = () => {
    navigator.clipboard.writeText(copyText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="p-6">
        <div className="flex items-center gap-4">
          {/* Old */}
          <div
            className={`flex-1 rounded-lg p-4 ${reverse ? 'border border-blue-200 bg-blue-50' : 'bg-slate-100'}`}
          >
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              {mapping.old_code_full || mapping.old_code}
            </p>
            <p className="text-2xl font-bold text-slate-900">Section {mapping.old_section}</p>
          </div>

          {/* Arrow */}
          <ArrowLeftRight className="h-5 w-5 shrink-0 text-slate-400" />

          {/* New */}
          <div
            className={`flex-1 rounded-lg p-4 ${reverse ? 'bg-slate-100' : 'border border-blue-200 bg-blue-50'}`}
          >
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              {mapping.new_code_full || mapping.new_code}
            </p>
            <p className="text-2xl font-bold text-slate-900">Section {mapping.new_section}</p>
          </div>
        </div>

        {/* Title */}
        {mapping.title && (
          <p className="mt-4 text-sm text-slate-600">
            <span className="font-medium">Title:</span> {mapping.title}
          </p>
        )}

        {/* Mapping Type */}
        {mapping.mapping_type && mapping.mapping_type !== 'direct' && (
          <div className="mt-2">
            <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
              {mapping.mapping_type === 'partial'
                ? 'Partial mapping — verify scope'
                : mapping.mapping_type === 'repealed'
                  ? 'Repealed — no equivalent'
                  : mapping.mapping_type}
            </span>
          </div>
        )}

        {/* Notes */}
        {mapping.notes && (
          <p className="mt-2 text-xs text-slate-500">
            <span className="font-medium">Note:</span> {mapping.notes}
          </p>
        )}
      </div>

      {/* Copy action */}
      <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3">
        <p className="text-xs text-slate-400">
          {reverse ? 'Old law equivalent' : 'New law equivalent'}
        </p>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              Copy
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Bulk Text Converter Tab ─────────────────────────────────────────────────

function ConvertTab() {
  const [inputText, setInputText] = useState('');
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleConvert = useCallback(async () => {
    if (!inputText.trim()) return;

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch(`${API_URL}/api/sections/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText }),
      });

      if (!res.ok) {
        setError('Something went wrong. Please try again.');
        return;
      }

      const data: ConvertResult = await res.json();
      setResult(data);
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, [inputText]);

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.converted);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <label htmlFor="bulk-text" className="mb-2 block text-sm font-medium text-slate-700">
          Paste text with old law references
        </label>
        <textarea
          id="bulk-text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="e.g. The accused was charged under Section 302 IPC and Section 34 IPC. The investigation was conducted under Section 154 CrPC."
          rows={6}
          className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        <button
          onClick={handleConvert}
          disabled={loading || !inputText.trim()}
          className="mt-3 flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          <ArrowLeftRight className="h-4 w-4" />
          {loading ? 'Converting...' : 'Convert to New Law'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div>
              <h3 className="font-semibold text-slate-900">Converted Text</h3>
              <p className="text-xs text-slate-500">
                {result.count} section{result.count !== 1 ? 's' : ''} converted
              </p>
            </div>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-50"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-green-600" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy
                </>
              )}
            </button>
          </div>
          <div className="p-6">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
              {result.converted}
            </p>
          </div>

          {/* Conversion Details */}
          {result.conversions.length > 0 && (
            <div className="border-t border-slate-100 px-6 py-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Conversions Applied
              </h4>
              <div className="space-y-1">
                {result.conversions.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500 line-through">{c.original}</span>
                    <ArrowLeftRight className="h-3 w-3 text-slate-400" />
                    <span className="font-medium text-blue-700">{c.replacement}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

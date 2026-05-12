'use client';

/**
 * SectionFinderPanel — slide-out drawer wrapping the IPC/CrPC/IEA ↔ BNS/BNSS/BSA
 * lookup. Mounted globally in the dashboard layout so a lawyer can pull it open
 * from any page while drafting, look up a section, copy the new code, and get
 * back to the editor without losing context.
 *
 * Hits the public /api/sections/map endpoint (no auth required); auto-detects
 * "302 IPC", "103 BNS", or "302-IPC"-style input.
 *
 * State (open + last query) is held in localStorage so the panel persists
 * across page navigations within the dashboard.
 */
import { Check, Copy, Loader2, Scale, Search, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const STORAGE_KEY = 'lawie.sectionFinder.open';

interface MappingResult {
  old_section: string;
  old_code: string;
  old_code_full?: string;
  new_section: string;
  new_code: string;
  new_code_full?: string;
  title?: string;
  mapping_type?: string;
  notes?: string;
}

interface Props {
  /** When provided, render in-page (no floating trigger, no drawer chrome). */
  inline?: boolean;
}

export function SectionFinderPanel({ inline = false }: Props) {
  const [open, setOpen] = useState(false);

  // Restore the lawyer's last open/closed state on mount (inline mode skips this).
  useEffect(() => {
    if (inline) return;
    try {
      setOpen(window.localStorage.getItem(STORAGE_KEY) === 'true');
    } catch {
      /* localStorage unavailable */
    }
  }, [inline]);

  const toggle = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (inline) return;
      try {
        window.localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        /* localStorage unavailable */
      }
    },
    [inline],
  );

  if (inline) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <FinderBody />
      </div>
    );
  }

  return (
    <>
      {/* Floating trigger — hidden when drawer is open */}
      {!open && (
        <button
          type="button"
          onClick={() => toggle(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-lg transition-transform hover:scale-105 hover:bg-slate-800"
          aria-label="Open section finder"
        >
          <Scale size={14} />
          Section finder
        </button>
      )}

      {/* Backdrop — click-through dismiss */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/20 transition-opacity md:hidden"
          onClick={() => toggle(false)}
        />
      )}

      {/* Slide-out drawer */}
      <aside
        className={`fixed inset-y-0 right-0 z-40 flex w-full max-w-[420px] flex-col border-l border-slate-200 bg-white shadow-xl transition-transform duration-200 ${
          open ? 'translate-x-0' : 'pointer-events-none translate-x-full'
        }`}
        aria-hidden={!open}
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <Scale size={16} className="text-amber-500" />
            <h2 className="text-sm font-semibold text-slate-900">Section finder</h2>
          </div>
          <button
            type="button"
            onClick={() => toggle(false)}
            className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close section finder"
          >
            <X size={14} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          <FinderBody />
        </div>
      </aside>
    </>
  );
}

// ── Search body — used in both drawer and inline mode ───────────────────────

function FinderBody() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<MappingResult | null>(null);
  const [reverseResults, setReverseResults] = useState<MappingResult[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const runLookup = useCallback(async (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    setLoading(true);
    setError('');
    setResult(null);
    setReverseResults(null);

    try {
      // Auto-detect "302 IPC" / "103 BNS" / "302-IPC" / bare "302" (defaults to IPC)
      const match = q.match(
        /^(\d+[A-Z]?(?:\([a-z0-9]+\))?)\s*[-\s]\s*(IPC|CrPC|IEA|BNS|BNSS|BSA)$/i,
      );
      const url = match
        ? `${API_URL}/api/sections/map?section=${encodeURIComponent(match[1])}&code=${encodeURIComponent(match[2])}`
        : `${API_URL}/api/sections/map?old=${encodeURIComponent(q)}`;

      const res = await fetch(url);
      if (!res.ok) {
        setError(
          res.status === 404
            ? `No mapping for "${q}". Try "302 IPC", "103 BNS", etc.`
            : 'Lookup failed. Please try again.',
        );
        return;
      }
      const data = await res.json();
      if (data.direction === 'new_to_old') {
        setReverseResults(Array.isArray(data.results) ? data.results : [data.results]);
      } else if (data.result) {
        setResult(data.result);
      } else if (Array.isArray(data.results)) {
        setResult(data.results[0] ?? null);
      }
    } catch {
      setError('Network error. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-600">Section number</label>
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') runLookup(query);
            }}
            placeholder="e.g. 302 IPC · 103 BNS · 154 CrPC"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
          />
        </div>
        <button
          type="button"
          onClick={() => runLookup(query)}
          disabled={loading || !query.trim()}
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
          {loading ? 'Looking up…' : 'Look up'}
        </button>
        <p className="mt-2 text-[11px] text-slate-400">
          Supports IPC, CrPC, IEA → BNS, BNSS, BSA (and reverse).
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {result && <MappingCard mapping={result} />}
      {reverseResults?.map((r, i) => (
        <MappingCard key={`${r.old_section}-${i}`} mapping={r} reverse />
      ))}

      {!result && !reverseResults && !error && !loading && (
        <div>
          <p className="mb-2 text-[11px] font-medium text-slate-500">Try these</p>
          <div className="flex flex-wrap gap-1.5">
            {['302 IPC', '420 IPC', '154 CrPC', '103 BNS', '480 BNSS', '45 IEA'].map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => {
                  setQuery(ex);
                  runLookup(ex);
                }}
                className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MappingCard({ mapping, reverse }: { mapping: MappingResult; reverse?: boolean }) {
  const [copied, setCopied] = useState(false);
  const oldLabel = `Section ${mapping.old_section} ${mapping.old_code}`;
  const newLabel = `Section ${mapping.new_section} ${mapping.new_code}`;
  const copyText = reverse ? oldLabel : newLabel;

  const onCopy = () => {
    navigator.clipboard.writeText(copyText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
            {reverse ? 'New → Old' : 'Old → New'}
          </p>
          <p className="mt-0.5 text-xs font-semibold text-slate-900">
            {reverse ? newLabel : oldLabel}
          </p>
          <p className="text-[10px] text-slate-500">{mapping.old_code_full ?? mapping.old_code}</p>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="flex-shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-slate-700"
          aria-label="Copy section reference"
        >
          {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
        </button>
      </div>
      <div className="my-2 border-t border-slate-200" />
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Maps to</p>
      <p className="mt-0.5 text-xs font-semibold text-slate-900">{reverse ? oldLabel : newLabel}</p>
      <p className="text-[10px] text-slate-500">{mapping.new_code_full ?? mapping.new_code}</p>
      {mapping.title && <p className="mt-2 text-[11px] text-slate-600">{mapping.title}</p>}
      {mapping.notes && <p className="mt-1 text-[10px] italic text-slate-500">{mapping.notes}</p>}
    </div>
  );
}

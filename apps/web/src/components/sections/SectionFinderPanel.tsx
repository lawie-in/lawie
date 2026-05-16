'use client';

/**
 * SectionFinderPanel — Rajesh's 9-state design (SCRUM-83).
 *
 * Mounted globally in the dashboard layout. ⌘K from anywhere opens the
 * panel; ⌘K again (or Escape) closes it. When closed, a vertical peek rail
 * sits on the right edge so the lawyer can spot the affordance without
 * remembering the shortcut.
 *
 * Three tabs:
 *   - Lookup    — search box + common-lookups + recently-searched
 *   - Recent    — last 20 searches with timestamps + bookmark stars
 *   - Bookmarks — starred sections
 *
 * Search is debounced typeahead against /api/sections/search; selecting a
 * row (Enter or click) calls /api/sections/details for the rich card.
 * Insert-citation-at-cursor dispatches a window-level event the editor
 * picks up (see apps/web/src/app/dashboard/documents/[id]/page.tsx).
 *
 * Bookmarks + Recent are persisted via /api/users/me/* with a localStorage
 * mirror for offline read.
 */
import {
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Loader2,
  Plus,
  Search,
  Star,
  X,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { apiFetch } from '@/lib/apiFetch';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const STORAGE_OPEN = 'lawie.sectionFinder.open';
const STORAGE_BOOKMARKS = 'lawie.sectionFinder.bookmarks';
const STORAGE_RECENT = 'lawie.sectionFinder.recent';
const INSERT_CITATION_EVENT = 'lawie:insertCitation';

// Common lookups (state 02 of design). Editable in Settings later.
const COMMON_LOOKUPS: Array<{ section: string; code: string; label: string }> = [
  { section: '302', code: 'IPC', label: 'Murder' },
  { section: '420', code: 'IPC', label: 'Cheating' },
  { section: '498A', code: 'IPC', label: 'Cruelty' },
  { section: '138', code: 'NI', label: 'Cheque bounce' },
  { section: '154', code: 'CrPC', label: 'FIR' },
  { section: '438', code: 'CrPC', label: 'Anticipatory bail' },
];

// ── Types ───────────────────────────────────────────────────────────────────

interface SearchMatch {
  code: string;
  section: string;
  title: string;
  mapped_to: { code: string; section: string | null; title: string | null } | null;
  is_new_provision: boolean;
}

interface SectionDetail {
  code: string;
  section: string;
  title: string;
  statute: string;
  chapter: string | null;
  bailable: boolean | null;
  cognizable: boolean | null;
  compoundable: 'yes' | 'no' | 'with_permission' | null;
  triable_by: 'Sessions' | 'Magistrate' | 'Tribunal' | null;
  punishment: string | null;
  max_years: number | null;
  ingredients: string[];
  bare_section_text: string | null;
  related: Array<{ code: string; section: string; title: string }>;
  mapping: {
    old_code: string;
    old_section: string;
    old_title: string;
    new_code: string;
    new_section: string | null;
    new_title: string | null;
    mapping_type: string;
    notes?: string;
  } | null;
}

interface RecentEntry {
  code: string;
  section: string;
  title: string;
  searchedAt: string;
  isBookmarked?: boolean;
}

interface BookmarkEntry {
  id: string;
  code: string;
  section: string;
  title: string;
  createdAt: string;
}

type Tab = 'lookup' | 'recent' | 'bookmarks';

interface Props {
  /** When provided, render in-page (no floating rail, no drawer chrome). */
  inline?: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** "302 IPC" → {section: '302', code: 'IPC'}. Bare numbers fall through. */
function parseQuery(raw: string): { section: string; code: string } | null {
  const m = raw
    .trim()
    .match(/^(\d+[A-Z]?(?:\([a-z0-9]+\))?)\s*[-\s]\s*(IPC|CrPC|IEA|BNS|BNSS|BSA|NI)$/i);
  if (!m) return null;
  return { section: m[1], code: m[2].toUpperCase() };
}

function fmtRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const delta = Date.now() - then;
  const m = Math.floor(delta / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Yest.';
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w`;
  return new Date(iso).toLocaleDateString();
}

function citationText(detail: { code: string; section: string }): string {
  // Mirrors the design's "§303(2) BNS" format.
  return `§${detail.section} ${detail.code}`;
}

// ── Outer wrapper (rail + drawer + ⌘K) ──────────────────────────────────────

export function SectionFinderPanel({ inline = false }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Restore the lawyer's last open/closed state (inline mode skips this).
  useEffect(() => {
    if (inline) return;
    try {
      setOpen(window.localStorage.getItem(STORAGE_OPEN) === 'true');
    } catch {
      /* localStorage unavailable */
    }
  }, [inline]);

  const toggle = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (inline) return;
      try {
        window.localStorage.setItem(STORAGE_OPEN, String(next));
      } catch {
        /* ignore */
      }
    },
    [inline],
  );

  // ⌘K / Ctrl-K global shortcut.
  useEffect(() => {
    if (inline) return;
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggle(!open);
      } else if (e.key === 'Escape' && open) {
        toggle(false);
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, toggle, inline]);

  const insertEnabled = pathname?.startsWith('/dashboard/documents/') ?? false;

  if (inline) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <FinderBody insertEnabled={false} onClose={() => undefined} />
      </div>
    );
  }

  return (
    <>
      {/* Closed-state vertical peek rail (state 01 of the design) */}
      {!open && (
        <button
          type="button"
          onClick={() => toggle(true)}
          aria-label="Open section finder (⌘K)"
          className="fixed right-0 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-3 rounded-l-xl border border-r-0 border-slate-200 bg-white px-2 py-5 shadow-sm hover:bg-amber-50"
        >
          <BookOpen size={16} className="text-amber-500" />
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            Section finder · ⌘K
          </span>
        </button>
      )}

      {/* Backdrop on mobile only */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/20 transition-opacity md:hidden"
          onClick={() => toggle(false)}
        />
      )}

      {/* Drawer */}
      <aside
        className={`fixed inset-y-0 right-0 z-40 flex w-full max-w-[420px] flex-col border-l border-slate-200 bg-white shadow-xl transition-transform duration-200 ${
          open ? 'translate-x-0' : 'pointer-events-none translate-x-full'
        }`}
        aria-hidden={!open}
      >
        <header className="flex items-start justify-between gap-2 border-b border-slate-200 px-5 py-4">
          <div className="flex items-start gap-2">
            <BookOpen size={16} className="mt-0.5 text-amber-500" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Section finder</h2>
              <p className="text-[10px] uppercase tracking-wider text-slate-400">
                IPC · CrPC · IEA ↔ BNS · BNSS · BSA
              </p>
            </div>
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
        <div className="flex-1 overflow-y-auto">
          <FinderBody insertEnabled={insertEnabled} onClose={() => toggle(false)} />
        </div>
      </aside>
    </>
  );
}

// ── Body (tabs + tab content) ───────────────────────────────────────────────

function FinderBody({ insertEnabled, onClose }: { insertEnabled: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('lookup');
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>(() =>
    readLocal(STORAGE_BOOKMARKS, []),
  );
  const [recent, setRecent] = useState<RecentEntry[]>(() => readLocal(STORAGE_RECENT, []));
  const [activeDetail, setActiveDetail] = useState<SectionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Hydrate bookmarks + recent from backend once.
  useEffect(() => {
    (async () => {
      try {
        const [bm, rc] = await Promise.all([
          apiFetch('/api/users/me/bookmarks/sections'),
          apiFetch('/api/users/me/recent/sections'),
        ]);
        if (bm.ok) {
          const data = await bm.json();
          setBookmarks(data.bookmarks ?? []);
          writeLocal(STORAGE_BOOKMARKS, data.bookmarks ?? []);
        }
        if (rc.ok) {
          const data = await rc.json();
          setRecent(data.recent ?? []);
          writeLocal(STORAGE_RECENT, data.recent ?? []);
        }
      } catch {
        /* offline — localStorage values stand */
      }
    })();
  }, []);

  const bookmarkSet = useMemo(
    () => new Set(bookmarks.map((b) => `${b.code}:${b.section}`)),
    [bookmarks],
  );

  const loadDetail = useCallback(async (code: string, section: string) => {
    setDetailLoading(true);
    setActiveDetail({
      // Show a placeholder shell immediately so DetailCard mounts with the
      // loader visible. The fetched detail replaces this shape below.
      code,
      section,
      title: '',
      statute: '',
      chapter: null,
      bailable: null,
      cognizable: null,
      compoundable: null,
      triable_by: null,
      punishment: null,
      max_years: null,
      ingredients: [],
      bare_section_text: null,
      related: [],
      mapping: null,
    });
    try {
      const res = await apiFetch(
        `/api/sections/details?section=${encodeURIComponent(section)}&code=${encodeURIComponent(
          code,
        )}`,
      );
      if (!res.ok) {
        console.error('[section-finder] /sections/details failed', res.status);
        return;
      }
      const detail = (await res.json()) as SectionDetail;
      setActiveDetail(detail);
      // Log to recent (server + local).
      await apiFetch('/api/users/me/recent/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: detail.code, section: detail.section, title: detail.title }),
      }).catch((err) => console.error('[section-finder] /recent POST failed', err));
      setRecent((prev) => {
        const next = [
          {
            code: detail.code,
            section: detail.section,
            title: detail.title,
            searchedAt: new Date().toISOString(),
          },
          ...prev.filter((r) => !(r.code === detail.code && r.section === detail.section)),
        ].slice(0, 20);
        writeLocal(STORAGE_RECENT, next);
        return next;
      });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const toggleBookmark = useCallback(
    async (code: string, section: string, title: string) => {
      const key = `${code}:${section}`;
      const existing = bookmarks.find((b) => `${b.code}:${b.section}` === key);

      if (existing) {
        // Optimistic remove: drop from UI immediately, server call follows.
        setBookmarks((prev) => prev.filter((b) => b.id !== existing.id));
        try {
          const res = await apiFetch(`/api/users/me/bookmarks/sections/${existing.id}`, {
            method: 'DELETE',
          });
          if (!res.ok && res.status !== 404) {
            console.error('[section-finder] bookmark delete failed', res.status);
            // Roll back on real failure (404 is fine — it's already gone).
            setBookmarks((prev) => [existing, ...prev]);
          }
        } catch (err) {
          console.error('[section-finder] bookmark delete threw', err);
          setBookmarks((prev) => [existing, ...prev]);
        }
        return;
      }

      // Optimistic add: insert a temp row with a synthetic id so the star
      // turns yellow immediately. Swap with the server-issued row on success.
      const tempId = `tmp-${Date.now()}`;
      const optimistic: BookmarkEntry = {
        id: tempId,
        code,
        section,
        title,
        createdAt: new Date().toISOString(),
      };
      setBookmarks((prev) => [optimistic, ...prev]);
      try {
        const res = await apiFetch('/api/users/me/bookmarks/sections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, section, title }),
        });
        if (!res.ok) {
          console.error('[section-finder] bookmark create failed', res.status);
          setBookmarks((prev) => prev.filter((b) => b.id !== tempId));
          return;
        }
        const row = (await res.json()) as BookmarkEntry;
        setBookmarks((prev) => prev.map((b) => (b.id === tempId ? row : b)));
      } catch (err) {
        console.error('[section-finder] bookmark create threw', err);
        setBookmarks((prev) => prev.filter((b) => b.id !== tempId));
      }
    },
    [bookmarks],
  );

  // Sync bookmarks/recent to localStorage so an offline tab refresh keeps state.
  useEffect(() => writeLocal(STORAGE_BOOKMARKS, bookmarks), [bookmarks]);
  useEffect(() => writeLocal(STORAGE_RECENT, recent), [recent]);

  return (
    <div className="flex h-full flex-col">
      {/* Tabs */}
      <div className="flex border-b border-slate-100 px-5">
        <TabButton active={tab === 'lookup'} onClick={() => setTab('lookup')}>
          Lookup
        </TabButton>
        <TabButton active={tab === 'recent'} onClick={() => setTab('recent')} badge={recent.length}>
          Recent
        </TabButton>
        <TabButton
          active={tab === 'bookmarks'}
          onClick={() => setTab('bookmarks')}
          badge={bookmarks.length}
        >
          Bookmarks
        </TabButton>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {tab === 'lookup' && (
          <LookupTab
            activeDetail={activeDetail}
            detailLoading={detailLoading}
            onLoadDetail={loadDetail}
            onClearDetail={() => setActiveDetail(null)}
            recent={recent}
            bookmarkSet={bookmarkSet}
            onToggleBookmark={toggleBookmark}
            insertEnabled={insertEnabled}
            onClose={onClose}
          />
        )}
        {tab === 'recent' && (
          <RecentTab
            recent={recent}
            bookmarkSet={bookmarkSet}
            onSelect={(r) => {
              setTab('lookup');
              loadDetail(r.code, r.section);
            }}
            onToggleBookmark={toggleBookmark}
          />
        )}
        {tab === 'bookmarks' && (
          <BookmarksTab
            bookmarks={bookmarks}
            onSelect={(b) => {
              setTab('lookup');
              loadDetail(b.code, b.section);
            }}
            onRemove={(b) => toggleBookmark(b.code, b.section, b.title)}
          />
        )}
      </div>
    </div>
  );
}

// ── Lookup tab ──────────────────────────────────────────────────────────────

function LookupTab({
  activeDetail,
  detailLoading,
  onLoadDetail,
  onClearDetail,
  recent,
  bookmarkSet,
  onToggleBookmark,
  insertEnabled,
  onClose,
}: {
  activeDetail: SectionDetail | null;
  detailLoading: boolean;
  onLoadDetail: (code: string, section: string) => void;
  onClearDetail: () => void;
  recent: RecentEntry[];
  bookmarkSet: Set<string>;
  onToggleBookmark: (code: string, section: string, title: string) => void;
  insertEnabled: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Autofocus the search input when the lookup tab mounts.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced typeahead.
  useEffect(() => {
    const term = query.trim();
    if (term.length === 0) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    const handle = setTimeout(async () => {
      try {
        // Auto-detect: "302 IPC" → query exact mapping; bare "302" → default to BNS.
        const parsed = parseQuery(term);
        const params = parsed
          ? `q=${encodeURIComponent(parsed.section)}&code=${encodeURIComponent(parsed.code)}`
          : `q=${encodeURIComponent(term)}&code=BNS`;
        const res = await fetch(`${API_URL}/api/sections/search?${params}&limit=10`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setMatches(data.results ?? []);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  function selectTop() {
    if (matches.length === 0) return;
    const top = matches[0];
    onLoadDetail(top.code, top.section);
    setQuery('');
  }

  if (activeDetail) {
    return (
      <DetailCard
        detail={activeDetail}
        loading={detailLoading}
        isBookmarked={bookmarkSet.has(`${activeDetail.code}:${activeDetail.section}`)}
        onToggleBookmark={() =>
          onToggleBookmark(activeDetail.code, activeDetail.section, activeDetail.title)
        }
        insertEnabled={insertEnabled}
        onBack={() => {
          onClearDetail();
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') selectTop();
            }}
            placeholder="e.g. 302 IPC · 103 BNS · 154 CrPC"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-12 text-sm text-slate-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Typeahead matches (state 03) */}
      {query.length > 0 && (
        <div>
          {searchLoading && matches.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 size={12} className="animate-spin" /> Searching…
            </div>
          )}
          {!searchLoading && matches.length === 0 && (
            <div className="text-xs text-slate-400">No matches for &ldquo;{query}&rdquo;</div>
          )}
          {matches.length > 0 && (
            <>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {matches.length} match{matches.length === 1 ? '' : 'es'}
              </p>
              <div className="space-y-1">
                {matches.slice(0, 3).map((m, i) => (
                  <button
                    key={`${m.code}:${m.section}`}
                    type="button"
                    onClick={() => {
                      onLoadDetail(m.code, m.section);
                      setQuery('');
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-md border border-slate-100 px-3 py-2 text-left text-xs hover:border-amber-300 hover:bg-amber-50"
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-semibold text-slate-700">
                        {m.section} {m.code}
                      </span>
                      <span className="text-slate-500">{m.title}</span>
                    </span>
                    {m.mapped_to?.section && (
                      <span className="flex items-center gap-1 text-[10px] text-slate-400">
                        <ChevronRight size={10} />
                        {m.mapped_to.section} {m.mapped_to.code}
                        {i === 0 && (
                          <kbd className="ml-1 rounded border border-slate-200 bg-slate-50 px-1 text-[9px] text-slate-500">
                            ↵
                          </kbd>
                        )}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Empty-state: common lookups + recently searched + tip (state 02) */}
      {query.length === 0 && (
        <>
          <Section title="Common lookups">
            <div className="flex flex-wrap gap-1.5">
              {COMMON_LOOKUPS.map((c) => (
                <button
                  key={`${c.section}-${c.code}`}
                  type="button"
                  onClick={() => onLoadDetail(c.code, c.section)}
                  className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"
                >
                  <span className="font-mono font-semibold text-slate-700">
                    {c.section} {c.code}
                  </span>{' '}
                  <span className="text-slate-400">· {c.label}</span>
                </button>
              ))}
            </div>
          </Section>

          {recent.length > 0 && (
            <Section title="Recently searched">
              <ul className="space-y-1">
                {recent.slice(0, 3).map((r) => (
                  <li key={`${r.code}:${r.section}`}>
                    <button
                      type="button"
                      onClick={() => onLoadDetail(r.code, r.section)}
                      className="flex w-full items-center justify-between rounded-md border border-slate-100 px-3 py-2 text-left text-xs hover:bg-amber-50"
                    >
                      <span className="flex items-center gap-2">
                        <Search size={11} className="text-slate-300" />
                        <span className="font-mono text-[11px] font-semibold text-slate-700">
                          {r.section} {r.code}
                        </span>
                        <ChevronRight size={10} className="text-slate-300" />
                        <span className="text-slate-500">{r.title}</span>
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {fmtRelative(r.searchedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">Tip</p>
            <p className="mt-1 text-xs text-slate-600">
              Auto-detects either direction. Type the old IPC and we&rsquo;ll show the BNS
              equivalent — or vice versa. Press{' '}
              <kbd className="rounded border border-amber-300 bg-white px-1 text-[10px]">⌘K</kbd>{' '}
              from any drafting screen.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ── Recent tab ──────────────────────────────────────────────────────────────

function RecentTab({
  recent,
  bookmarkSet,
  onSelect,
  onToggleBookmark,
}: {
  recent: RecentEntry[];
  bookmarkSet: Set<string>;
  onSelect: (r: RecentEntry) => void;
  onToggleBookmark: (code: string, section: string, title: string) => void;
}) {
  if (recent.length === 0) {
    return (
      <EmptyState
        icon={<Search size={20} className="text-slate-300" />}
        text="No recent searches yet"
      />
    );
  }
  return (
    <ul className="space-y-1.5">
      {recent.map((r) => {
        const starred = bookmarkSet.has(`${r.code}:${r.section}`);
        return (
          <li
            key={`${r.code}:${r.section}`}
            className="flex items-center justify-between gap-2 rounded-md border border-slate-100 px-3 py-2"
          >
            <button
              type="button"
              onClick={() => onSelect(r)}
              className="flex flex-1 items-center gap-2 text-left hover:text-amber-700"
            >
              <Search size={11} className="text-slate-300" />
              <span className="font-mono text-[11px] font-semibold text-slate-700">
                {r.section} {r.code}
              </span>
              <ChevronRight size={10} className="text-slate-300" />
              <span className="flex-1 truncate text-xs text-slate-500">{r.title}</span>
            </button>
            <span className="text-[10px] text-slate-400">{fmtRelative(r.searchedAt)}</span>
            <button
              type="button"
              onClick={() => onToggleBookmark(r.code, r.section, r.title)}
              className="rounded p-1 text-slate-300 hover:bg-slate-50 hover:text-amber-500"
              aria-label={starred ? 'Remove bookmark' : 'Bookmark this section'}
            >
              <Star size={12} className={starred ? 'fill-amber-400 text-amber-500' : ''} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ── Bookmarks tab ───────────────────────────────────────────────────────────

function BookmarksTab({
  bookmarks,
  onSelect,
  onRemove,
}: {
  bookmarks: BookmarkEntry[];
  onSelect: (b: BookmarkEntry) => void;
  onRemove: (b: BookmarkEntry) => void;
}) {
  if (bookmarks.length === 0) {
    return (
      <EmptyState
        icon={<Star size={20} className="text-slate-300" />}
        text="Star a section to pin it here"
      />
    );
  }
  return (
    <ul className="space-y-1.5">
      {bookmarks.map((b) => (
        <li
          key={b.id}
          className="flex items-center justify-between gap-2 rounded-md border border-slate-100 px-3 py-2"
        >
          <button
            type="button"
            onClick={() => onSelect(b)}
            className="flex flex-1 items-center gap-2 text-left hover:text-amber-700"
          >
            <Star size={11} className="fill-amber-400 text-amber-500" />
            <span className="font-mono text-[11px] font-semibold text-slate-700">
              {b.section} {b.code}
            </span>
            <ChevronRight size={10} className="text-slate-300" />
            <span className="flex-1 truncate text-xs text-slate-500">{b.title}</span>
          </button>
          <button
            type="button"
            onClick={() => onRemove(b)}
            className="rounded p-1 text-slate-300 hover:bg-slate-50 hover:text-red-500"
            aria-label="Remove bookmark"
          >
            <X size={12} />
          </button>
        </li>
      ))}
    </ul>
  );
}

// ── Detail card (state 04 of the design) ────────────────────────────────────

function DetailCard({
  detail,
  loading,
  isBookmarked,
  onToggleBookmark,
  insertEnabled,
  onBack,
  onClose,
}: {
  detail: SectionDetail;
  loading: boolean;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  insertEnabled: boolean;
  onBack: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [inserted, setInserted] = useState(false);
  const [bareOpen, setBareOpen] = useState(true);

  const citation = citationText(detail);

  if (loading) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700"
        >
          ← Back to search
        </button>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-6">
          <Loader2 size={14} className="animate-spin text-amber-500" />
          <span className="text-xs text-slate-500">
            Loading {detail.section} {detail.code}…
          </span>
        </div>
        <div className="space-y-2">
          <div className="h-5 w-2/3 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
        <div className="h-16 animate-pulse rounded-lg bg-slate-200" />
      </div>
    );
  }

  function onCopy() {
    navigator.clipboard.writeText(citation);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function onInsert() {
    if (!insertEnabled) return;
    window.dispatchEvent(
      new CustomEvent(INSERT_CITATION_EVENT, {
        detail: { citation, section: detail.section, code: detail.code },
      }),
    );
    setInserted(true);
    setTimeout(() => setInserted(false), 1800);
    // Close the panel after insert so the lawyer's cursor is back in the editor.
    setTimeout(onClose, 250);
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700"
      >
        ← Back to search
      </button>

      {/* Mapping block */}
      {detail.mapping && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Old · pre-2024
              </p>
              <p className="mt-0.5 font-mono text-sm font-semibold text-slate-900">
                §{detail.mapping.old_section} {detail.mapping.old_code}
              </p>
            </div>
            <ChevronRight size={16} className="text-slate-300" />
            <div className="flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                New ·{' '}
                {detail.mapping.new_code === 'BNS' ? 'BNS 2023' : `${detail.mapping.new_code} 2023`}
              </p>
              <p className="mt-0.5 font-mono text-sm font-semibold text-slate-900">
                §{detail.mapping.new_section ?? '—'} {detail.mapping.new_code}
              </p>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Mapped · in force
          </div>
        </div>
      )}

      <div>
        <h3 className="text-lg font-bold text-slate-900">{detail.title || 'No metadata yet'}</h3>
        <p className="text-[11px] text-slate-500">
          {detail.statute}
          {detail.chapter ? ` · ${detail.chapter}` : ''}
        </p>
      </div>

      {/* 4 metadata pills */}
      <div className="grid grid-cols-2 gap-2">
        <Pill
          label="Bailable"
          value={pillLabel(detail.bailable, 'Yes', 'No')}
          positive={detail.bailable === true}
        />
        <Pill
          label="Cognizable"
          value={pillLabel(detail.cognizable, 'Yes', 'No')}
          positive={detail.cognizable === false}
          negative={detail.cognizable === true}
        />
        <Pill label="Triable by" value={detail.triable_by ?? '—'} />
        <Pill
          label="Compoundable"
          value={
            detail.compoundable === 'with_permission'
              ? 'With permission'
              : detail.compoundable === 'yes'
                ? 'Yes'
                : detail.compoundable === 'no'
                  ? 'No'
                  : '—'
          }
        />
      </div>

      {/* Punishment callout */}
      {detail.punishment && (
        <div className="rounded-lg bg-slate-900 px-3 py-3 text-white">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">
            Punishment
          </p>
          <p className="mt-1 text-xs">{detail.punishment}</p>
        </div>
      )}

      {/* Ingredients */}
      {detail.ingredients.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Ingredients (must prove)
          </p>
          <ol className="mt-1 list-decimal pl-5 text-xs text-slate-700">
            {detail.ingredients.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
        </div>
      )}

      {/* Bare section text */}
      {detail.bare_section_text && (
        <div className="rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => setBareOpen(!bareOpen)}
            className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-slate-700"
          >
            Bare section text <ChevronRight size={11} className={bareOpen ? 'rotate-90' : ''} />
          </button>
          {bareOpen && (
            <p className="px-3 pb-3 text-xs italic text-slate-600">{detail.bare_section_text}</p>
          )}
        </div>
      )}

      {/* Related sections */}
      {detail.related.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Related sections
          </p>
          <ul className="space-y-1">
            {detail.related.map((r) => (
              <li key={`${r.code}:${r.section}`}>
                <div className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-1.5 text-xs">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-semibold text-slate-700">
                      {r.section} {r.code}
                    </span>
                    <span className="text-slate-500">{r.title}</span>
                  </span>
                  <ChevronRight size={10} className="text-slate-300" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {detail.code === 'BNS' && (
        <a
          href={`https://www.indiacode.nic.in/bitstream/123456789/20062/1/a2023-45.pdf`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-amber-700 hover:underline"
        >
          Open full reference <ExternalLink size={11} />
        </a>
      )}

      {/* CTA bar */}
      <div className="sticky bottom-0 -mx-5 -mb-5 flex items-center gap-2 border-t border-slate-200 bg-white px-5 py-3">
        <button
          type="button"
          onClick={onInsert}
          disabled={!insertEnabled}
          title={insertEnabled ? '' : 'Open a document to insert at cursor'}
          className="flex-1 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {inserted ? (
            <span className="inline-flex items-center gap-1.5">
              <Check size={12} className="text-emerald-300" /> Inserted
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Plus size={12} /> Insert citation at cursor
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onCopy}
          className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
          aria-label="Copy citation"
        >
          {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
        </button>
        <button
          type="button"
          onClick={onToggleBookmark}
          className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-amber-500"
          aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark this section'}
        >
          <Star size={12} className={isBookmarked ? 'fill-amber-400 text-amber-500' : ''} />
        </button>
      </div>
    </div>
  );
}

// ── Sub-bits ────────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  badge,
  children,
}: {
  active: boolean;
  onClick: () => void;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex items-center gap-1 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
        active
          ? 'border-amber-500 text-amber-700'
          : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span
          className={`rounded-full px-1.5 text-[10px] ${
            active ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </p>
      {children}
    </div>
  );
}

function Pill({
  label,
  value,
  positive,
  negative,
}: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
}) {
  const colour = positive ? 'text-emerald-700' : negative ? 'text-red-600' : 'text-slate-900';
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold ${colour}`}>{value}</p>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      {icon}
      <p className="text-xs text-slate-400">{text}</p>
    </div>
  );
}

function pillLabel(v: boolean | null, t: string, f: string): string {
  if (v === true) return t;
  if (v === false) return f;
  return '—';
}

// ── localStorage helpers ────────────────────────────────────────────────────

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota exceeded — silently ignore */
  }
}

// Re-export the constants so the editor (stage 3) can subscribe to the
// insert-citation event without duplicating the string.
export const SECTION_FINDER_INSERT_EVENT = INSERT_CITATION_EVENT;

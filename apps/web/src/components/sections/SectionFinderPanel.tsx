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
  Maximize2,
  Minimize2,
  Plus,
  Search,
  Star,
  X,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { Button, Spinner } from '@/components/ui';
import { apiFetch } from '@/lib/apiFetch';
import { cn } from '@/lib/cn';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const STORAGE_OPEN = 'lawie.sectionFinder.open';
const STORAGE_MODE = 'lawie.sectionFinder.mode';
const STORAGE_BOOKMARKS = 'lawie.sectionFinder.bookmarks';
const STORAGE_RECENT = 'lawie.sectionFinder.recent';
const INSERT_CITATION_EVENT = 'lawie:insertCitation';
const OPEN_PANEL_EVENT = 'lawie:openSectionFinder';
/**
 * Ajay (CLO), T-289: shown when triable_by is null. Copy of drafting's
 * COURT_LEVEL_DEPENDS in apps/drafting/src/services/bail-check.service.ts; the
 * /sections/details response does not carry this text. Keep the two identical.
 */
const COURT_LEVEL_DEPENDS = 'Depends on the offence. Check the First Schedule.';

type Mode = 'panel' | 'drawer';

// Module-level typeahead cache (lifetime = page session). Repeats are free.
const typeaheadCache = new Map<string, SearchMatch[]>();

/**
 * Returns the platform-correct keyboard shortcut label.
 * Mac → "⌘K", everything else → "Ctrl+K". SSR-safe — defaults to Ctrl+K on
 * the server, replaced on the client after mount via useShortcutLabel().
 */
function detectMac(): boolean {
  if (typeof window === 'undefined') return false;
  return /Mac|iPod|iPhone|iPad/.test(window.navigator.platform);
}

function useShortcutLabel(): string {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => setIsMac(detectMac()), []);
  return isMac ? '⌘K' : 'Ctrl+K';
}

/**
 * T-525: below Tailwind's `md` (768px) the open finder is a full-screen overlay with a backdrop,
 * so it is a modal dialog there; from `md` up it is a side panel next to the page.
 */
const NARROW_QUERY = '(max-width: 767.98px)';

function matchesNarrow(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(NARROW_QUERY).matches
  );
}

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(NARROW_QUERY);
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return narrow;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Icon-only control: 44px square target, Night tokens, brass focus ring. */
const ICON_BUTTON =
  'nl-focus rounded-nl-md text-nl-soft [@media(hover:hover)_and_(pointer:fine)]:hover:bg-nl-brass-light [@media(hover:hover)_and_(pointer:fine)]:hover:text-nl-text inline-flex h-11 w-11 shrink-0 select-none items-center justify-center';

/** A row that opens a section (typeahead match, recent, bookmark). */
const ROW_BUTTON =
  'nl-focus rounded-nl-md gap-nl-2 px-nl-3 nl-body-sm [@media(hover:hover)_and_(pointer:fine)]:hover:bg-nl-brass-light flex min-h-[44px] w-full select-none items-center text-left';

/** Section number and code, e.g. "302 IPC": tabular, Mukta 500 (no monospace face). */
const SECTION_REF = 'text-nl-text font-medium tabular-nums';

/** "← Back to search": a text control with a 44px target. */
const BACK_LINK =
  'nl-focus nl-body-sm text-nl-brass-dark rounded-nl-sm -ml-nl-1 px-nl-1 inline-flex min-h-[44px] select-none items-center gap-1 [@media(hover:hover)_and_(pointer:fine)]:hover:underline underline-offset-4';

/** Keyboard hint: 2px radius (DESIGN shapes), Wood fill, 12px. */
const KBD =
  'rounded-nl-sm border-nl-line bg-nl-wood text-nl-soft inline-block border px-1.5 font-nl-body text-[12px] font-medium leading-4';

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
  triable_by: string | null;
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
const TABS: Tab[] = ['lookup', 'recent', 'bookmarks'];
const TAB_LABELS: Record<Tab, string> = {
  lookup: 'Lookup',
  recent: 'Recent',
  bookmarks: 'Bookmarks',
};

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

/**
 * T-565 W5a (Ajay, 22 Oct; section-converter Addendum 2, T-326): a new provision with no old
 * equivalent is seeded with a placeholder old-side id, `NEW-<new section>` (e.g. NEW-111). The
 * entry is shown, but that id is never shown, copied, inserted or sent in a request: the old
 * box says `No equivalent in the {OldCode}`, the new section and title show as for any other
 * row, and Copy gives `{NewCode} {n}` only (e.g. `BNS 111`).
 */
const PLACEHOLDER_SECTION = /^NEW-(.+)$/i;

function isPlaceholderSection(section: string | null | undefined): boolean {
  return typeof section === 'string' && PLACEHOLDER_SECTION.test(section.trim());
}

/** Old-code abbreviation in T-295 casing, from the old code or, failing that, the new code. */
const OLD_CODE_DISPLAY: Record<string, string> = { IPC: 'IPC', CRPC: 'CrPC', IEA: 'IEA' };
const OLD_CODE_FOR_NEW: Record<string, string> = { BNS: 'IPC', BNSS: 'CrPC', BSA: 'IEA' };
const NEW_CODE_FOR_OLD: Record<string, string> = { IPC: 'BNS', CRPC: 'BNSS', IEA: 'BSA' };

/**
 * T-565 W5a: the section to show or look up. A placeholder `NEW-n` on an old code is the new
 * provision itself (`n` in the matching new code); anything else is returned as it is.
 */
function realSection(code: string, section: string): { code: string; section: string } {
  const m = section.trim().match(PLACEHOLDER_SECTION);
  if (!m) return { code, section };
  return { code: NEW_CODE_FOR_OLD[code.toUpperCase()] ?? code, section: m[1] };
}

/**
 * T-565 W5a: a saved Recent or Bookmark entry, as shown. An entry saved with a placeholder id
 * shows the new provision instead; its stored title is the old side's, so it is not shown.
 */
function realEntry<T extends { code: string; section: string; title: string }>(entry: T): T {
  if (!isPlaceholderSection(entry.section)) return entry;
  return { ...entry, ...realSection(entry.code, entry.section), title: '' };
}

/** T-565 W5a: a typeahead match, as shown. A placeholder id never reaches the row. */
function realMatch(m: SearchMatch): SearchMatch {
  if (isPlaceholderSection(m.section)) {
    // An old-code match whose old side is a placeholder: show the new provision it stands for.
    const target =
      m.mapped_to?.section && !isPlaceholderSection(m.mapped_to.section)
        ? { code: m.mapped_to.code, section: m.mapped_to.section }
        : realSection(m.code, m.section);
    return {
      ...m,
      ...target,
      title: m.mapped_to?.title ?? '',
      mapped_to: null,
      is_new_provision: true,
    };
  }
  if (isPlaceholderSection(m.mapped_to?.section)) {
    return { ...m, mapped_to: null, is_new_provision: true };
  }
  return m;
}

/** `{OldCode}` for the `No equivalent in the {OldCode}` line (T-295 casing). */
function oldCodeDisplay(oldCode: string, newCode: string): string {
  return (
    OLD_CODE_DISPLAY[oldCode.toUpperCase()] ?? OLD_CODE_FOR_NEW[newCode.toUpperCase()] ?? oldCode
  );
}

function citationText(detail: { code: string; section: string }): string {
  // Mirrors the design's "§303(2) BNS" format.
  return `§${detail.section} ${detail.code}`;
}

// ── Outer wrapper (rail + drawer + ⌘K) ──────────────────────────────────────

export function SectionFinderPanel({ inline = false }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('panel');
  // Pending preload from an open-event payload (e.g., clicked citation pill).
  // FinderBody consumes it on mount + clears via the callback below.
  const [pendingPreload, setPendingPreload] = useState<{ code: string; section: string } | null>(
    null,
  );
  const shortcutLabel = useShortcutLabel();
  // T-525: on /dashboard the command bar owns Ctrl/Cmd+K (hotkeyExclusive), so the finder does
  // not advertise the shortcut there. Only the dashboard page has the bar.
  const advertiseShortcut = pathname !== '/dashboard';
  const narrow = useIsNarrow();
  // Below md the open finder covers the page (backdrop): a modal dialog there.
  const overlay = open && narrow;

  const asideRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const railRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  /** T-525: where focus goes back to on close (the control that opened the finder). */
  const returnFocusRef = useRef<Element | null>(null);
  /** T-525: set by a user action that opens the finder; a restored open state does not move focus. */
  const focusOnOpenRef = useRef(false);
  const wasOpenRef = useRef(false);

  // Restore mode from localStorage.
  useEffect(() => {
    if (inline) return;
    try {
      const stored = window.localStorage.getItem(STORAGE_MODE);
      if (stored === 'drawer' || stored === 'panel') setMode(stored);
    } catch {
      /* ignore */
    }
  }, [inline]);

  const toggleMode = useCallback(() => {
    setMode((prev) => {
      const next: Mode = prev === 'panel' ? 'drawer' : 'panel';
      try {
        window.localStorage.setItem(STORAGE_MODE, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // Restore the lawyer's last open/closed state (inline mode skips this).
  // T-525: not below md, where an open finder would cover the page on load.
  useEffect(() => {
    if (inline) return;
    if (matchesNarrow()) return;
    try {
      setOpen(window.localStorage.getItem(STORAGE_OPEN) === 'true');
    } catch {
      /* localStorage unavailable */
    }
  }, [inline]);

  const toggle = useCallback(
    (next: boolean) => {
      if (next) {
        // T-525: remember where the user was, and move focus in once the panel is open.
        const active = typeof document !== 'undefined' ? document.activeElement : null;
        if (!asideRef.current?.contains(active)) {
          returnFocusRef.current = active;
          focusOnOpenRef.current = true;
        }
      }
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

  // T-525: focus moves in on a user open and back out on close. Closed, the panel is inert, so
  // focus left inside it would fall to <body>.
  useEffect(() => {
    if (inline) return;
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (open && focusOnOpenRef.current) {
      focusOnOpenRef.current = false;
      const aside = asideRef.current;
      // A preload (citation pill) goes straight to the result card, so there is no search box.
      const target = pendingPreload
        ? closeRef.current
        : (aside?.querySelector<HTMLElement>('[data-finder-autofocus]') ?? closeRef.current);
      target?.focus();
      return;
    }
    if (!open && wasOpen) {
      const active = document.activeElement;
      const lost = !active || active === document.body || !!asideRef.current?.contains(active);
      if (!lost) return; // the user already moved on (e.g. the editor after Insert)
      const back = returnFocusRef.current;
      returnFocusRef.current = null;
      if (back instanceof HTMLElement && back.isConnected && back !== document.body) {
        back.focus();
      } else if (railRef.current && railRef.current.offsetParent !== null) {
        railRef.current.focus();
      } else {
        document.getElementById('dashboard-main')?.focus();
      }
    }
  }, [open, inline, pendingPreload]);

  // T-525: below md the open finder is modal: everything else on the page is inert (each
  // sibling of the aside and of its ancestors, except the finder's backdrop) and the body does
  // not scroll. Undone on close, on unmount and when the window grows to md or wider.
  useEffect(() => {
    if (!overlay || !asideRef.current) return;
    const changed: Element[] = [];
    let node: Element | null = asideRef.current;
    while (node && node !== document.body && node.parentElement) {
      for (const sib of Array.from(node.parentElement.children)) {
        if (sib === node || sib.hasAttribute('data-finder-backdrop')) continue;
        if (sib.hasAttribute('inert')) continue; // already inert: leave as it was
        sib.setAttribute('inert', '');
        changed.push(sib);
      }
      node = node.parentElement;
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      for (const el of changed) el.removeAttribute('inert');
      document.body.style.overflow = prevOverflow;
    };
  }, [overlay]);

  // ⌘K / Ctrl-K global shortcut + F11 mode toggle while open.
  useEffect(() => {
    if (inline) return;
    // T-525: a modal dialog outside the finder (e.g. the top-up dialog) owns the keyboard.
    function otherModalOpen(): boolean {
      // Radix unmounts closed content, so any dialog in the DOM is open. Radix 1.1 does not set
      // aria-modal, so match the role alone.
      return Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"]')).some(
        (d) => !asideRef.current?.contains(d),
      );
    }
    function handler(e: KeyboardEvent) {
      // T-525: Escape already handled (a Radix dialog closes itself in the capture phase).
      if (e.key === 'Escape' && e.defaultPrevented) return;
      const isHotkey = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if ((isHotkey || e.key === 'F11') && otherModalOpen()) return;
      if (isHotkey) {
        e.preventDefault();
        toggle(!open);
      } else if (e.key === 'Escape' && open) {
        toggle(false);
      } else if (e.key === 'F11' && open) {
        e.preventDefault();
        toggleMode();
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, toggle, toggleMode, inline]);

  // Sidebar "Section finder" link, inline-pill click in the editor, or any
  // other surface dispatches this event to pop the drawer open without
  // routing. Payload may carry `{ preload: { code, section } }` — when
  // present, FinderBody routes straight to the result card for that section.
  useEffect(() => {
    if (inline) return;
    function openHandler(e: Event) {
      const ce = e as CustomEvent<{ preload?: { code: string; section: string } }>;
      if (ce.detail?.preload?.code && ce.detail.preload.section) {
        setPendingPreload(ce.detail.preload);
      }
      toggle(true);
    }
    window.addEventListener(OPEN_PANEL_EVENT, openHandler);
    return () => window.removeEventListener(OPEN_PANEL_EVENT, openHandler);
  }, [toggle, inline]);

  const insertEnabled = pathname?.startsWith('/dashboard/documents/') ?? false;

  // T-525: the overlay is modal, so Tab wraps inside it.
  const trapTab = (e: React.KeyboardEvent<HTMLElement>) => {
    if (!overlay || e.key !== 'Tab' || !asideRef.current) return;
    const items = Array.from(asideRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (inline) {
    return (
      <div className="nl border-nl-line bg-nl-card text-nl-text p-nl-5 border">
        <FinderBody
          active
          advertiseShortcut={advertiseShortcut}
          insertEnabled={false}
          onClose={() => undefined}
          pendingPreload={null}
          onConsumePreload={() => undefined}
        />
      </div>
    );
  }

  return (
    <>
      {/* Closed-state vertical peek rail (state 01 of the design). T-525: only from 1280px,
          where it sits in the margin outside the 1180px content column (it covered content at
          360 and 768). Below that the account menu / sidebar opens the finder. */}
      {!open && (
        <button
          ref={railRef}
          type="button"
          onClick={() => toggle(true)}
          aria-label={
            advertiseShortcut ? `Open section finder (${shortcutLabel})` : 'Open section finder'
          }
          className="nl nl-focus rounded-l-nl-md bg-nl-card [@media(hover:hover)_and_(pointer:fine)]:hover:bg-nl-brass-light gap-nl-3 py-nl-5 fixed right-0 top-1/2 z-30 hidden w-11 -translate-y-1/2 select-none flex-col items-center border border-r-0 border-[color:var(--line-control)] xl:flex"
        >
          <BookOpen size={16} aria-hidden="true" className="text-nl-brass-dark" />
          <span
            className="nl-label text-nl-soft"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            {advertiseShortcut ? <>Section finder · {shortcutLabel}</> : 'Section finder'}
          </span>
        </button>
      )}

      {/* Backdrop on mobile only */}
      {open && (
        <div
          aria-hidden="true"
          data-finder-backdrop=""
          className="fixed inset-0 z-30 bg-black/50 transition-opacity md:hidden"
          onClick={() => toggle(false)}
        />
      )}

      {/* Drawer — panel mode (full-height right-docked) or drawer mode
          (compact floating). F11 (or the maximize button) toggles between
          them; both inherit the same open/closed translateX.
          T-525: closed, it is inert (not tabbable, not in the accessibility tree); below md,
          open, it is a modal dialog. */}
      <aside
        ref={asideRef}
        inert={!open}
        aria-hidden={!open}
        aria-labelledby={titleId}
        {...(overlay ? { role: 'dialog', 'aria-modal': true } : {})}
        onKeyDown={trapTab}
        className={cn(
          'nl border-nl-line bg-nl-card text-nl-text font-nl-body fixed z-40 flex flex-col transition-transform duration-200 motion-reduce:transition-none motion-reduce:duration-0',
          mode === 'drawer'
            ? 'rounded-nl-md bottom-4 right-4 top-16 w-[min(320px,calc(100vw-32px))] border'
            : 'inset-y-0 right-0 w-full max-w-[420px] border-l pb-[env(safe-area-inset-bottom,0px)]',
          open
            ? 'translate-x-0'
            : mode === 'drawer'
              ? 'pointer-events-none translate-x-[calc(100%+1rem)]'
              : 'pointer-events-none translate-x-full',
        )}
      >
        <header className="gap-nl-2 border-nl-line py-nl-3 pl-nl-5 pr-nl-2 flex items-start justify-between border-b">
          <div className="gap-nl-2 pt-nl-2 flex min-w-0 items-start">
            <BookOpen size={16} aria-hidden="true" className="text-nl-brass-dark mt-1 shrink-0" />
            <div className="min-w-0">
              <h2 id={titleId} className="nl-h3 text-nl-text m-0">
                Section finder
              </h2>
              <p className="nl-label text-nl-muted m-0 normal-case tracking-normal">
                IPC · CrPC · IEA ↔ BNS · BNSS · BSA
              </p>
            </div>
          </div>
          <div className="flex items-center">
            <button
              type="button"
              onClick={toggleMode}
              // T-525: below md the finder is a full-screen dialog; the drawer mode does not apply.
              className={cn(ICON_BUTTON, 'max-md:hidden')}
              aria-label={
                mode === 'drawer' ? 'Switch to full panel (F11)' : 'Switch to compact drawer (F11)'
              }
              title={mode === 'drawer' ? 'Expand to full panel (F11)' : 'Shrink to drawer (F11)'}
            >
              {mode === 'drawer' ? (
                <Maximize2 size={16} aria-hidden="true" />
              ) : (
                <Minimize2 size={16} aria-hidden="true" />
              )}
            </button>
            <button
              ref={closeRef}
              type="button"
              onClick={() => toggle(false)}
              className={ICON_BUTTON}
              aria-label="Close section finder"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <FinderBody
            active={open}
            labelledBy={titleId}
            advertiseShortcut={advertiseShortcut}
            insertEnabled={insertEnabled}
            onClose={() => toggle(false)}
            pendingPreload={pendingPreload}
            onConsumePreload={() => setPendingPreload(null)}
          />
        </div>
      </aside>
    </>
  );
}

// ── Body (tabs + tab content) ───────────────────────────────────────────────

function FinderBody({
  active,
  labelledBy,
  advertiseShortcut,
  insertEnabled,
  onClose,
  pendingPreload,
  onConsumePreload,
}: {
  /** The panel is open (T-525: nothing in it takes focus while it is closed). */
  active: boolean;
  /** Id of the "Section finder" heading, the tablist's name (absent in inline mode). */
  labelledBy?: string;
  /** False on /dashboard, where Ctrl/Cmd+K belongs to the command bar (T-525). */
  advertiseShortcut: boolean;
  insertEnabled: boolean;
  onClose: () => void;
  pendingPreload: { code: string; section: string } | null;
  onConsumePreload: () => void;
}) {
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

  // T-565 W5a: an entry saved earlier with a placeholder NEW-n id shows (and is keyed as) the
  // new provision it stands for, so the id is never shown or sent.
  const visibleBookmarks = useMemo(() => bookmarks.map(realEntry), [bookmarks]);
  const bookmarkSet = useMemo(
    () => new Set(visibleBookmarks.map((b) => `${b.code}:${b.section}`)),
    [visibleBookmarks],
  );
  const visibleRecent = useMemo(() => {
    const seen = new Set<string>();
    return recent.map(realEntry).filter((r) => {
      const key = `${r.code}:${r.section}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [recent]);

  const loadDetail = useCallback(async (rawCode: string, rawSection: string) => {
    // T-565 W5a: a placeholder NEW-n id is never looked up; the new provision is.
    const { code, section } = realSection(rawCode, rawSection);
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

  // SCRUM-83 polish: when an inline citation pill is clicked in the editor,
  // the open-event fires with { preload: { code, section } }. Route straight
  // to the Lookup tab + result card and clear the preload so the same pill
  // re-click after the panel was already open still triggers a reload.
  useEffect(() => {
    if (!pendingPreload) return;
    setTab('lookup');
    void loadDetail(pendingPreload.code, pendingPreload.section);
    onConsumePreload();
  }, [pendingPreload, loadDetail, onConsumePreload]);

  const toggleBookmark = useCallback(
    async (rawCode: string, rawSection: string, title: string) => {
      // T-565 W5a: keyed and saved as the new provision, never as a placeholder NEW-n id.
      const { code, section } = realSection(rawCode, rawSection);
      const key = `${code}:${section}`;
      const existing = bookmarks.find((b) => {
        const real = realSection(b.code, b.section);
        return `${real.code}:${real.section}` === key;
      });

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

  // T-525: tablist / tab / tabpanel with a roving tabindex (arrow keys, Home, End).
  const baseId = useId();
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({
    lookup: null,
    recent: null,
    bookmarks: null,
  });
  const onTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.indexOf(tab);
    let next: Tab | null = null;
    if (e.key === 'ArrowRight') next = TABS[(i + 1) % TABS.length];
    else if (e.key === 'ArrowLeft') next = TABS[(i - 1 + TABS.length) % TABS.length];
    else if (e.key === 'Home') next = TABS[0];
    else if (e.key === 'End') next = TABS[TABS.length - 1];
    if (!next) return;
    e.preventDefault();
    setTab(next);
    tabRefs.current[next]?.focus();
  };
  const tabId = (t: Tab) => `${baseId}-tab-${t}`;
  const panelId = `${baseId}-panel`;

  return (
    <div className="flex h-full flex-col">
      {/* Tabs */}
      <div
        role="tablist"
        aria-labelledby={labelledBy}
        onKeyDown={onTabKeyDown}
        className="px-nl-3 flex border-b border-[color:var(--line-control)]"
      >
        {TABS.map((t) => (
          <TabButton
            key={t}
            id={tabId(t)}
            controls={panelId}
            buttonRef={(el) => {
              tabRefs.current[t] = el;
            }}
            active={tab === t}
            onClick={() => setTab(t)}
            badge={
              t === 'recent'
                ? visibleRecent.length
                : t === 'bookmarks'
                  ? visibleBookmarks.length
                  : undefined
            }
          >
            {TAB_LABELS[t]}
          </TabButton>
        ))}
      </div>

      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={tabId(tab)}
        className="p-nl-5 flex-1 overflow-y-auto overscroll-contain"
      >
        {tab === 'lookup' && (
          <LookupTab
            active={active}
            advertiseShortcut={advertiseShortcut}
            activeDetail={activeDetail}
            detailLoading={detailLoading}
            onLoadDetail={loadDetail}
            onClearDetail={() => setActiveDetail(null)}
            recent={visibleRecent}
            bookmarkSet={bookmarkSet}
            onToggleBookmark={toggleBookmark}
            insertEnabled={insertEnabled}
            onClose={onClose}
          />
        )}
        {tab === 'recent' && (
          <RecentTab
            recent={visibleRecent}
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
            bookmarks={visibleBookmarks}
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
  active,
  advertiseShortcut,
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
  active: boolean;
  advertiseShortcut: boolean;
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
  const shortcutLabel = useShortcutLabel();

  // Autofocus the search input when the lookup tab mounts. T-525: only while the panel is open
  // and focus is not somewhere else (it is always mounted, so on page load it would steal focus,
  // and an arrow key on the tabs must keep focus on the tabs). Opening the panel moves focus to
  // the input from the outer component (data-finder-autofocus).
  useEffect(() => {
    if (!active) return;
    const current = document.activeElement;
    if (!current || current === document.body) inputRef.current?.focus();
    // Mount only, as before.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced typeahead.
  useEffect(() => {
    const term = query.trim();
    if (term.length === 0) {
      setMatches([]);
      return;
    }
    // SCRUM-83 polish: cache typeahead responses by (code, query) so repeat
    // keystrokes (e.g., the lawyer typing "302" then backspacing to "30" then
    // forward to "302") replay instantly with no network hop. TTL-free —
    // mappings change rarely (CLO sign-off) so a session-lived cache is fine.
    const cached = typeaheadCache.get(term);
    if (cached) {
      setMatches(cached);
      setSearchLoading(false);
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
        // T-565 W5a: a new provision shows as its new section and title; a placeholder NEW-n id
        // never reaches a row.
        const results = ((data.results ?? []) as SearchMatch[]).map(realMatch);
        typeaheadCache.set(term, results);
        if (!cancelled) setMatches(results);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 100);
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
    <div className="space-y-nl-5">
      <div>
        <div className="relative">
          <Search
            size={16}
            aria-hidden="true"
            className="text-nl-muted pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
          />
          <input
            ref={inputRef}
            data-finder-autofocus=""
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') selectTop();
            }}
            placeholder="e.g. 302 IPC · 103 BNS · 154 CrPC"
            enterKeyHint="search"
            autoCorrect="off"
            spellCheck={false}
            className={cn(
              'nl-focus rounded-nl-md bg-nl-card text-nl-text placeholder:text-nl-muted focus:border-nl-brass py-nl-2 h-11 w-full border border-[color:var(--line-control)] pl-9 text-[16px] leading-6',
              advertiseShortcut ? 'pr-16' : 'pr-nl-3',
            )}
          />
          {/* T-525: not on /dashboard, where the shortcut focuses the command bar instead. */}
          {advertiseShortcut ? (
            <kbd className={cn(KBD, 'absolute right-2 top-1/2 -translate-y-1/2')}>
              {shortcutLabel}
            </kbd>
          ) : null}
        </div>
      </div>

      {/* Typeahead matches (state 03) */}
      {query.length > 0 && (
        <div>
          {searchLoading && matches.length === 0 && (
            <div className="gap-nl-2 nl-body-sm text-nl-muted flex items-center">
              <Spinner /> Searching…
            </div>
          )}
          {!searchLoading && matches.length === 0 && (
            <div className="nl-body-sm text-nl-soft">No matches for &ldquo;{query}&rdquo;</div>
          )}
          {matches.length > 0 && (
            <>
              <p className="nl-label text-nl-muted mb-nl-2 mt-0">
                {matches.length} match{matches.length === 1 ? '' : 'es'}
              </p>
              <div className="space-y-nl-1">
                {matches.slice(0, 3).map((m, i) => (
                  <button
                    key={`${m.code}:${m.section}`}
                    type="button"
                    onClick={() => {
                      onLoadDetail(m.code, m.section);
                      setQuery('');
                    }}
                    className={cn(
                      ROW_BUTTON,
                      'justify-between border border-[color:var(--line-control)]',
                    )}
                  >
                    <span className="gap-nl-2 flex min-w-0 items-center">
                      <span className={cn(SECTION_REF, 'shrink-0')}>
                        {m.section} {m.code}
                      </span>
                      <span className="text-nl-soft truncate">{m.title}</span>
                    </span>
                    {m.mapped_to?.section && (
                      <span className="text-nl-soft flex shrink-0 items-center gap-1 tabular-nums">
                        <ChevronRight size={14} aria-hidden="true" />
                        {m.mapped_to.section} {m.mapped_to.code}
                        {i === 0 && <kbd className={cn(KBD, 'ml-1')}>↵</kbd>}
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
            <div className="gap-nl-2 flex flex-wrap">
              {COMMON_LOOKUPS.map((c) => (
                <button
                  key={`${c.section}-${c.code}`}
                  type="button"
                  onClick={() => onLoadDetail(c.code, c.section)}
                  className="nl-focus rounded-nl-pill text-nl-soft [@media(hover:hover)_and_(pointer:fine)]:hover:bg-nl-brass-light [@media(hover:hover)_and_(pointer:fine)]:hover:text-nl-text relative inline-flex h-9 select-none items-center whitespace-nowrap border border-[color:var(--line-control)] px-[12px] text-[14px] leading-5 before:absolute before:-inset-y-1 before:inset-x-0 before:content-['']"
                >
                  <span className={SECTION_REF}>
                    {c.section} {c.code}
                  </span>{' '}
                  <span>· {c.label}</span>
                </button>
              ))}
            </div>
          </Section>

          {recent.length > 0 && (
            <Section title="Recently searched">
              <ul className="space-y-nl-1 m-0 list-none p-0">
                {recent.slice(0, 3).map((r) => (
                  <li key={`${r.code}:${r.section}`}>
                    <button
                      type="button"
                      onClick={() => onLoadDetail(r.code, r.section)}
                      className={cn(
                        ROW_BUTTON,
                        'justify-between border border-[color:var(--line-control)]',
                      )}
                    >
                      <span className="gap-nl-2 flex min-w-0 items-center">
                        <Search size={14} aria-hidden="true" className="text-nl-muted shrink-0" />
                        <span className={cn(SECTION_REF, 'shrink-0')}>
                          {r.section} {r.code}
                        </span>
                        <ChevronRight
                          size={14}
                          aria-hidden="true"
                          className="text-nl-muted shrink-0"
                        />
                        <span className="text-nl-soft truncate">{r.title}</span>
                      </span>
                      <span className="text-nl-muted shrink-0 text-[12px] tabular-nums leading-4">
                        {fmtRelative(r.searchedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <div className="bg-nl-brass-light p-nl-3">
            <p className="nl-label text-nl-brass-dark m-0">Tip</p>
            {/* T-565 item 37 + T4: Ajay's signed text (section-converter copy), one sentence per line. */}
            <p className="nl-body-sm text-nl-text mt-nl-1 mb-0">
              Look up an IPC, CrPC or IEA section and see the BNS, BNSS or BSA section that replaced
              it.
            </p>
            <p className="nl-body-sm text-nl-text mt-nl-1 mb-0">
              Check the bare act before you rely on a mapping.
            </p>
            <p className="nl-body-sm text-nl-text mt-nl-1 mb-0">
              Press <kbd className={KBD}>{shortcutLabel}</kbd> from any drafting screen.
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
        icon={<Search size={20} aria-hidden="true" className="text-nl-muted" />}
        text="No recent searches yet"
      />
    );
  }
  return (
    <ul className="space-y-nl-1 m-0 list-none p-0">
      {recent.map((r) => {
        const starred = bookmarkSet.has(`${r.code}:${r.section}`);
        return (
          <li
            key={`${r.code}:${r.section}`}
            className="gap-nl-1 border-nl-line flex items-center justify-between border-b"
          >
            <button type="button" onClick={() => onSelect(r)} className={cn(ROW_BUTTON, 'flex-1')}>
              <Search size={14} aria-hidden="true" className="text-nl-muted shrink-0" />
              <span className={cn(SECTION_REF, 'shrink-0')}>
                {r.section} {r.code}
              </span>
              <ChevronRight size={14} aria-hidden="true" className="text-nl-muted shrink-0" />
              <span className="text-nl-soft flex-1 truncate">{r.title}</span>
            </button>
            <span className="text-nl-muted shrink-0 text-[12px] tabular-nums leading-4">
              {fmtRelative(r.searchedAt)}
            </span>
            <button
              type="button"
              onClick={() => onToggleBookmark(r.code, r.section, r.title)}
              className={ICON_BUTTON}
              aria-label={starred ? 'Remove bookmark' : 'Bookmark this section'}
              aria-pressed={starred}
            >
              <Star
                size={16}
                aria-hidden="true"
                className={starred ? 'fill-nl-brass text-nl-brass' : ''}
              />
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
        icon={<Star size={20} aria-hidden="true" className="text-nl-muted" />}
        text="Star a section to pin it here"
      />
    );
  }
  return (
    <ul className="space-y-nl-1 m-0 list-none p-0">
      {bookmarks.map((b) => (
        <li
          key={b.id}
          className="gap-nl-1 border-nl-line flex items-center justify-between border-b"
        >
          <button type="button" onClick={() => onSelect(b)} className={cn(ROW_BUTTON, 'flex-1')}>
            <Star size={14} aria-hidden="true" className="fill-nl-brass text-nl-brass shrink-0" />
            <span className={cn(SECTION_REF, 'shrink-0')}>
              {b.section} {b.code}
            </span>
            <ChevronRight size={14} aria-hidden="true" className="text-nl-muted shrink-0" />
            <span className="text-nl-soft flex-1 truncate">{b.title}</span>
          </button>
          <button
            type="button"
            onClick={() => onRemove(b)}
            className={ICON_BUTTON}
            aria-label="Remove bookmark"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

// ── Detail card (state 04 of the design) ────────────────────────────────────

/**
 * T-565 item 38: the merged/split badges, exact text signed by Ajay (T-296 addendum,
 * handoff/legal/section-converter-copy-signed.md). Any other mapping_type shows no badge; the
 * raw value is never shown.
 */
const DETAIL_MAPPING_TYPE_BADGES: Record<string, string | undefined> = {
  merged: 'Merged with other sections — verify scope',
  split: 'Split across several sections — check which one applies',
};

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
  // T-565 W5a (Addendum 2): a new provision with no old equivalent. The old box says
  // `No equivalent in the {OldCode}`, Copy gives `{NewCode} {n}` only, and no `Mapped` badge
  // shows (it is not a one-to-one mapping, T7).
  const mapping = detail.mapping;
  const newProvision = !!mapping && isPlaceholderSection(mapping.old_section);
  const copyText =
    newProvision && mapping
      ? `${mapping.new_code} ${mapping.new_section ?? detail.section}`
      : citation;
  const related = detail.related.map(realEntry);

  if (loading) {
    return (
      <div className="space-y-nl-4">
        <button type="button" onClick={onBack} className={BACK_LINK}>
          ← Back to search
        </button>
        <div
          role="status"
          className="gap-nl-2 border-nl-line px-nl-3 py-nl-6 text-nl-brass-dark flex items-center border"
        >
          <Spinner />
          <span className="nl-body-sm text-nl-soft tabular-nums">
            Loading {detail.section} {detail.code}…
          </span>
        </div>
        <div aria-hidden="true" className="space-y-nl-2">
          <div className="nl-skeleton h-5 w-2/3" />
          <div className="nl-skeleton h-3 w-1/2" />
        </div>
        <div aria-hidden="true" className="gap-nl-2 grid grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="nl-skeleton h-12" />
          ))}
        </div>
        <div aria-hidden="true" className="nl-skeleton h-16" />
      </div>
    );
  }

  function onCopy() {
    navigator.clipboard.writeText(copyText);
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
    <div className="space-y-nl-4">
      <button type="button" onClick={onBack} className={BACK_LINK}>
        ← Back to search
      </button>

      {/* Mapping block */}
      {detail.mapping && (
        <div className="border-nl-line p-nl-3 border">
          <div className="gap-nl-3 flex items-center justify-between">
            <div className="flex-1">
              <p className="nl-label text-nl-muted m-0">Old law · before 1 July 2024</p>
              {newProvision ? (
                <p className="nl-body text-nl-text mt-nl-1 mb-0">
                  {`No equivalent in the ${oldCodeDisplay(
                    detail.mapping.old_code,
                    detail.mapping.new_code,
                  )}`}
                </p>
              ) : (
                <p className={cn(SECTION_REF, 'nl-body mt-nl-1 mb-0')}>
                  §{detail.mapping.old_section} {detail.mapping.old_code}
                </p>
              )}
            </div>
            <ChevronRight size={16} aria-hidden="true" className="text-nl-muted" />
            <div className="flex-1">
              <p className="nl-label text-nl-brass-dark m-0">
                New ·{' '}
                {detail.mapping.new_code === 'BNS' ? 'BNS 2023' : `${detail.mapping.new_code} 2023`}
              </p>
              <p className={cn(SECTION_REF, 'nl-body mt-nl-1 mb-0')}>
                §{detail.mapping.new_section ?? '—'} {detail.mapping.new_code}
              </p>
            </div>
          </div>
          {/* T-565 T7: `Mapped` only for a direct one-to-one mapping. */}
          {detail.mapping.mapping_type === 'direct' && !newProvision && (
            <div className="mt-nl-2 nl-body-sm text-nl-ok flex items-center gap-1.5">
              <span aria-hidden="true" className="bg-nl-ok h-1.5 w-1.5 rounded-full" />
              Mapped
            </div>
          )}
          {/* T-565 item 38 + T7: the signed merged/split badges (T-296 addendum); repealed,
              unverified and any other type show no status badge. */}
          {DETAIL_MAPPING_TYPE_BADGES[detail.mapping.mapping_type] && (
            <p className="mt-nl-1 nl-body-sm text-nl-soft mb-0">
              {DETAIL_MAPPING_TYPE_BADGES[detail.mapping.mapping_type]}
            </p>
          )}
        </div>
      )}

      <div>
        <h3 className="nl-h2 text-nl-text m-0">{detail.title || 'No metadata yet'}</h3>
        <p className="nl-body-sm text-nl-soft mt-nl-1 mb-0">
          {detail.statute}
          {detail.chapter ? ` · ${detail.chapter}` : ''}
        </p>
      </div>

      {/* 4 metadata pills */}
      <div className="gap-nl-2 grid grid-cols-2">
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
        <Pill label="Triable by" value={detail.triable_by ?? COURT_LEVEL_DEPENDS} />
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
        <div className="bg-nl-brass-light p-nl-3">
          <p className="nl-label text-nl-brass-dark m-0">Punishment</p>
          <p className="nl-body-sm text-nl-text mt-nl-1 mb-0">{detail.punishment}</p>
        </div>
      )}

      {/* Ingredients */}
      {detail.ingredients.length > 0 && (
        <div>
          <p className="nl-label text-nl-muted m-0">Ingredients (must prove)</p>
          <ol className="mt-nl-1 nl-body-sm text-nl-text mb-0 list-decimal pl-5">
            {detail.ingredients.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
        </div>
      )}

      {/* Bare section text */}
      {detail.bare_section_text && (
        <div className="border-nl-line border">
          <button
            type="button"
            onClick={() => setBareOpen(!bareOpen)}
            aria-expanded={bareOpen}
            className="nl-focus px-nl-3 nl-body-sm text-nl-text flex min-h-[44px] w-full select-none items-center justify-between font-medium"
          >
            Bare section text{' '}
            <ChevronRight
              size={14}
              aria-hidden="true"
              className={cn('text-nl-muted', bareOpen && 'rotate-90')}
            />
          </button>
          {bareOpen && (
            <p className="px-nl-3 pb-nl-3 nl-body-sm text-nl-soft m-0 italic">
              {detail.bare_section_text}
            </p>
          )}
        </div>
      )}

      {/* Related sections */}
      {/* T-565 W5a: a related entry never shows a placeholder NEW-n id. */}
      {related.length > 0 && (
        <div>
          <p className="nl-label text-nl-muted mb-nl-1 mt-0">Related sections</p>
          <ul className="space-y-nl-1 m-0 list-none p-0">
            {related.map((r) => (
              <li key={`${r.code}:${r.section}`}>
                <div className="border-nl-line px-nl-3 py-nl-2 nl-body-sm flex items-center justify-between border-b">
                  <span className="gap-nl-2 flex items-center">
                    <span className={SECTION_REF}>
                      {r.section} {r.code}
                    </span>
                    <span className="text-nl-soft">{r.title}</span>
                  </span>
                  <ChevronRight size={14} aria-hidden="true" className="text-nl-muted" />
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
          className="nl-focus nl-body-sm text-nl-brass-dark inline-flex min-h-[44px] items-center gap-1 underline-offset-4 [@media(hover:hover)_and_(pointer:fine)]:hover:underline"
        >
          Open full reference <ExternalLink size={14} aria-hidden="true" />
        </a>
      )}

      {/* CTA bar */}
      <div className="-mx-nl-5 -mb-nl-5 gap-nl-2 border-nl-line bg-nl-card px-nl-5 py-nl-3 sticky bottom-0 flex items-center border-t">
        {/* Ghost, not primary: the finder sits beside a page that has its own primary. */}
        <Button
          variant="ghost"
          onClick={onInsert}
          disabled={!insertEnabled}
          title={insertEnabled ? '' : 'Open a document to insert at cursor'}
          // Wraps to two lines at 360px rather than overflowing beside the two icon buttons.
          className="!px-nl-3 min-w-0 flex-1 !whitespace-normal text-center !leading-5"
        >
          {inserted ? (
            <>
              <Check size={16} aria-hidden="true" className="text-nl-ok" /> Inserted
            </>
          ) : (
            <>
              <Plus size={16} aria-hidden="true" /> Insert citation at cursor
            </>
          )}
        </Button>
        <button
          type="button"
          onClick={onCopy}
          className={cn(ICON_BUTTON, 'border border-[color:var(--line-control)]')}
          aria-label="Copy citation"
        >
          {copied ? (
            <Check size={16} aria-hidden="true" className="text-nl-ok" />
          ) : (
            <Copy size={16} aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onClick={onToggleBookmark}
          className={cn(ICON_BUTTON, 'border border-[color:var(--line-control)]')}
          aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark this section'}
          aria-pressed={isBookmarked}
        >
          <Star
            size={16}
            aria-hidden="true"
            className={isBookmarked ? 'fill-nl-brass text-nl-brass' : ''}
          />
        </button>
      </div>
    </div>
  );
}

// ── Sub-bits ────────────────────────────────────────────────────────────────

function TabButton({
  id,
  controls,
  buttonRef,
  active,
  onClick,
  badge,
  children,
}: {
  id: string;
  controls: string;
  buttonRef: (el: HTMLButtonElement | null) => void;
  active: boolean;
  onClick: () => void;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      ref={buttonRef}
      id={id}
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className={cn(
        'nl-focus px-nl-3 nl-body-sm relative -mb-px inline-flex min-h-[44px] select-none items-center gap-1.5 border-b-2 font-medium transition-colors motion-reduce:transition-none motion-reduce:duration-0',
        active
          ? 'border-nl-brass text-nl-brass-dark forced-colors:border-[color:Highlight] forced-colors:bg-[color:Highlight] forced-colors:text-[color:HighlightText] forced-colors:[forced-color-adjust:none] forced-colors:focus-visible:[outline-color:CanvasText]'
          : 'text-nl-soft [@media(hover:hover)_and_(pointer:fine)]:hover:text-nl-text border-transparent',
      )}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span
          className={cn(
            'rounded-nl-pill px-1.5 text-[12px] tabular-nums leading-4',
            active ? 'bg-nl-brass-light text-nl-brass-dark' : 'bg-nl-wood text-nl-soft',
          )}
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
      <p className="nl-label text-nl-muted mb-nl-2 mt-0">{title}</p>
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
  const colour = positive ? 'text-nl-ok' : negative ? 'text-nl-err' : 'text-nl-text';
  return (
    <div className="border-nl-line px-nl-3 py-nl-2 border">
      <p className="nl-label text-nl-muted m-0">{label}</p>
      <p className={cn('nl-body-sm mt-nl-1 mb-0 font-medium', colour)}>{value}</p>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="gap-nl-2 py-nl-10 flex flex-col items-center justify-center text-center">
      {icon}
      <p className="nl-body-sm text-nl-soft m-0">{text}</p>
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

// Re-export the constants so other surfaces don't duplicate the string.
export const SECTION_FINDER_INSERT_EVENT = INSERT_CITATION_EVENT;
export const SECTION_FINDER_OPEN_EVENT = OPEN_PANEL_EVENT;

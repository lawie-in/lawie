'use client';

/**
 * T-525: the Settings tabs (spec 07; labels from handoff/copy/T-511-copy-v1.md §6.1).
 *
 * Hand-built ARIA tabs (Radix Tabs is not installed; no new dependency): role=tablist/tab/
 * tabpanel, roving tabindex, ArrowLeft/ArrowRight (wrapping), Home and End, automatic activation
 * (every panel is already rendered, so selecting on arrow costs nothing). Every panel stays
 * mounted and inactive ones carry the `hidden` attribute, so form state, the Plan block's pending
 * poll and its pageshow handling survive a tab switch.
 *
 * The selected tab is kept in the URL hash (#profile, #plan, #billing, #account, #appearance) with
 * history.replaceState, so there is no navigation and no new history entry. SSR renders Profile;
 * the hash is read before paint on the client.
 *
 * T-646 (Rajesh's design §5): a third tab, Billing, after Plan. Deep links
 * `?tab=billing#payments`, `#ink` and `#payment-<id>` open it: the hash names a section inside
 * the tab, so the tab comes from `?tab=` (or from the section hash itself).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { cn } from '@/lib/cn';

export type SettingsTabId = 'profile' | 'plan' | 'billing' | 'account' | 'appearance';

/** Copy §6.1 (signed). Privacy is out of scope here (T-529). */
export const SETTINGS_TABS: readonly { id: SettingsTabId; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'plan', label: 'Plan' },
  // T-646 (Rajesh's design §5).
  { id: 'billing', label: 'Billing' },
  { id: 'account', label: 'Account' },
  { id: 'appearance', label: 'Appearance' },
];

export const DEFAULT_SETTINGS_TAB: SettingsTabId = 'profile';

export const settingsTabId = (id: SettingsTabId) => `settings-tab-${id}`;
export const settingsPanelId = (id: SettingsTabId) => `settings-panel-${id}`;

/** '#plan' -> 'plan'; anything that is not a tab -> null. */
export function tabFromHash(hash: string | null | undefined): SettingsTabId | null {
  const key = (hash ?? '').replace(/^#/, '').toLowerCase();
  return SETTINGS_TABS.some((t) => t.id === key) ? (key as SettingsTabId) : null;
}

/** T-646: section hashes that live in the Billing tab (`#payments`, `#ink`, `#payment-<id>`). */
export function isBillingSectionHash(hash: string | null | undefined): boolean {
  const key = (hash ?? '').replace(/^#/, '');
  return key === 'payments' || key === 'ink' || /^payment-[A-Za-z0-9_-]{1,64}$/.test(key);
}

/**
 * T-646: the tab a location opens. A tab hash wins (`#plan`); else `?tab=` (`?tab=billing`);
 * else a Billing section hash opens Billing; else null.
 */
export function tabFromLocation(
  search: string | null | undefined,
  hash: string | null | undefined,
): SettingsTabId | null {
  const fromHash = tabFromHash(hash);
  if (fromHash) return fromHash;
  let fromQuery: SettingsTabId | null = null;
  try {
    fromQuery = tabFromHash(new URLSearchParams(search ?? '').get('tab'));
  } catch {
    fromQuery = null;
  }
  if (fromQuery) return fromQuery;
  return isBillingSectionHash(hash) ? 'billing' : null;
}

// useLayoutEffect on the client (no flash of Profile for /settings#plan); useEffect on the
// server, where neither runs.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * The selected tab, synced with location.hash. `selectTab` writes the hash with replaceState
 * (no navigation, no scroll jump: no element has the bare tab id).
 */
export function useSettingsTab(): [SettingsTabId, (next: SettingsTabId) => void] {
  const [tab, setTab] = useState<SettingsTabId>(DEFAULT_SETTINGS_TAB);

  useIsomorphicLayoutEffect(() => {
    const read = () => {
      const fromLocation = tabFromLocation(window.location.search, window.location.hash);
      if (fromLocation) setTab(fromLocation);
    };
    read();
    // A link to /dashboard/settings#plan followed while already on the page.
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  const selectTab = useCallback((next: SettingsTabId) => {
    setTab(next);
    try {
      const { pathname, search } = window.location;
      // Keep the router's state object: Next's App Router stores its own keys in it.
      window.history.replaceState(window.history.state, '', `${pathname}${search}#${next}`);
    } catch {
      // A sandboxed frame may refuse; the tab still switches.
    }
  }, []);

  return [tab, selectTab];
}

export interface SettingsTabListProps {
  active: SettingsTabId;
  onSelect: (id: SettingsTabId) => void;
  /** Id of the element that names the tablist (the page h1). */
  labelledBy: string;
}

/**
 * The tab row. At 360px it scrolls sideways inside its own container (never the page). The
 * scroller is padded so the 3px-offset focus ring is not clipped by its overflow.
 */
export function SettingsTabList({ active, onSelect, labelledBy }: SettingsTabListProps) {
  const refs = useRef<Record<SettingsTabId, HTMLButtonElement | null>>({
    profile: null,
    plan: null,
    billing: null,
    account: null,
    appearance: null,
  });

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const last = SETTINGS_TABS.length - 1;
    const i = SETTINGS_TABS.findIndex((t) => t.id === active);
    let n: number;
    switch (e.key) {
      case 'ArrowRight':
        n = i >= last ? 0 : i + 1;
        break;
      case 'ArrowLeft':
        n = i <= 0 ? last : i - 1;
        break;
      case 'Home':
        n = 0;
        break;
      case 'End':
        n = last;
        break;
      default:
        return;
    }
    e.preventDefault();
    const next = SETTINGS_TABS[n].id;
    onSelect(next);
    refs.current[next]?.focus();
  }

  return (
    <div className="-mx-nl-2 px-nl-2 py-nl-2 overflow-x-auto overscroll-x-contain">
      <div
        role="tablist"
        aria-labelledby={labelledBy}
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        // T-525: the rail is the tab underline at rest (unselected tabs are transparent over
        // it), so Control Line (3:1, WCAG 1.4.11); the selected tab's 2px brass sits on top.
        className="flex w-max min-w-full border-b border-[color:var(--line-control)]"
      >
        {SETTINGS_TABS.map(({ id, label }) => {
          const selected = id === active;
          return (
            <button
              key={id}
              ref={(el) => {
                refs.current[id] = el;
              }}
              type="button"
              role="tab"
              id={settingsTabId(id)}
              aria-selected={selected}
              aria-controls={settingsPanelId(id)}
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(id)}
              className={cn(
                'nl-focus nl-body px-nl-3 -mb-px inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center whitespace-nowrap border-b-2 font-medium',
                'touch-manipulation select-none',
                'transition-colors duration-150 ease-[ease] motion-reduce:transition-none',
                // Forced colours (Windows High Contrast) repaint every border CanvasText, so the
                // brass indicator alone is lost: the selected tab takes the system selection pair
                // (Highlight / HighlightText), opted out of the repaint on this element only.
                selected
                  ? 'border-nl-brass text-nl-text forced-colors:border-[color:Highlight] forced-colors:bg-[color:Highlight] forced-colors:text-[color:HighlightText] forced-colors:[forced-color-adjust:none] forced-colors:focus-visible:[outline-color:CanvasText]'
                  : 'text-nl-soft [@media(hover:hover)_and_(pointer:fine)]:hover:text-nl-text border-transparent',
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface SettingsTabPanelProps {
  id: SettingsTabId;
  active: SettingsTabId;
  children: React.ReactNode;
}

/**
 * Always mounted; `hidden` when not selected. No display utility on this element: a Tailwind
 * `flex` here would override the [hidden] rule and show every panel.
 */
export function SettingsTabPanel({ id, active, children }: SettingsTabPanelProps) {
  return (
    <div
      role="tabpanel"
      id={settingsPanelId(id)}
      aria-labelledby={settingsTabId(id)}
      hidden={id !== active}
      className="mt-nl-4"
    >
      <div className="gap-nl-4 flex flex-col">{children}</div>
    </div>
  );
}

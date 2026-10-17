'use client';

// T-511 part A: theme preference (spec section 1, Priya 17 Oct 2026). Default follows the system;
// Night / Daylight / System is remembered in localStorage. Sets data-theme (resolved) and
// data-theme-pref on <html>. Never adds the `dark` class: that would flip the legacy shadcn
// colours on existing pages.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  DARK_SCHEME_QUERY,
  DEFAULT_THEME_PREFERENCE,
  THEME_STORAGE_KEY,
  isThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from './theme';

import { subscribeMediaQuery } from '@/components/ui/motion';

export interface ThemeContextValue {
  /** What the user chose. */
  preference: ThemePreference;
  /** What is on screen. */
  resolved: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredPreference(): ThemePreference | null {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(value) ? value : null;
  } catch {
    return null;
  }
}

function writeStoredPreference(value: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, value);
  } catch {
    /* storage full, blocked or missing: the choice lasts for this page only */
  }
}

function darkSchemeList(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  try {
    return window.matchMedia(DARK_SCHEME_QUERY);
  } catch {
    return null;
  }
}

function readPreferenceFromDom(): ThemePreference | null {
  if (typeof document === 'undefined') return null;
  const value = document.documentElement.getAttribute('data-theme-pref');
  return isThemePreference(value) ? value : null;
}

export function ThemeProvider({
  children,
  defaultPreference = DEFAULT_THEME_PREFERENCE,
}: {
  children: React.ReactNode;
  defaultPreference?: ThemePreference;
}) {
  // The server cannot know the choice; the pre-hydration script has already painted the right
  // theme, and the effects below pick it up after mount.
  const [preference, setPreferenceState] = useState<ThemePreference>(defaultPreference);
  const [systemDark, setSystemDark] = useState(false);
  // False until the stored choice and the system setting are read, so the first commit does not
  // overwrite what the pre-hydration script set.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = readStoredPreference() ?? readPreferenceFromDom();
    if (stored) setPreferenceState(stored);
    const mql = darkSchemeList();
    if (mql) setSystemDark(mql.matches);
    setReady(true);
    if (!mql) return undefined;
    return subscribeMediaQuery(mql, () => setSystemDark(mql.matches));
  }, []);

  // Another tab changed the theme.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY) return;
      setPreferenceState(isThemePreference(e.newValue) ? e.newValue : defaultPreference);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [defaultPreference]);

  const resolved: ResolvedTheme =
    preference === 'system' ? (systemDark ? 'night' : 'daylight') : preference;

  useEffect(() => {
    if (!ready || typeof document === 'undefined') return;
    const root = document.documentElement;
    root.setAttribute('data-theme', resolved);
    root.setAttribute('data-theme-pref', preference);
  }, [ready, resolved, preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    if (!isThemePreference(next)) return;
    setPreferenceState(next);
    writeStoredPreference(next);
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Theme state. Outside a ThemeProvider it returns a read-only System / Daylight fallback. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx) return ctx;
  return FALLBACK;
}

const FALLBACK: ThemeContextValue = {
  preference: DEFAULT_THEME_PREFERENCE,
  resolved: 'daylight',
  setPreference: () => undefined,
};

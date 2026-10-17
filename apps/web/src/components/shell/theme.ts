// T-511 part A: theme constants and the pre-hydration script (spec section 1).
// No 'use client': app/layout.tsx (a server component) imports the script string.

export type ThemePreference = 'night' | 'daylight' | 'system';
export type ResolvedTheme = 'night' | 'daylight';

export const THEME_STORAGE_KEY = 'lawie-theme';
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'night' || value === 'daylight' || value === 'system';
}

/**
 * Runs inline in <head> before first paint: sets data-theme (resolved) and data-theme-pref on
 * <html> from localStorage and the system setting. Every access is guarded, so it is a no-op
 * when localStorage or matchMedia is missing or throws. Daylight when nothing can be read.
 * Keep in sync with ThemeProvider.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var d=document.documentElement,p=null;try{p=window.localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)})}catch(e){}if(p!=='night'&&p!=='daylight'&&p!=='system')p=${JSON.stringify(
  DEFAULT_THEME_PREFERENCE,
)};var r=p;if(p==='system'){r='daylight';try{if(window.matchMedia&&window.matchMedia(${JSON.stringify(
  DARK_SCHEME_QUERY,
)}).matches)r='night'}catch(e){}}d.setAttribute('data-theme',r);d.setAttribute('data-theme-pref',p)}catch(e){}})();`;

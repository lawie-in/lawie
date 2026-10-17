'use client';

// T-511 part A: shared motion gates (spec 2.4, Priya).
// - prefers-reduced-motion: reduce stops every animation and shows end states.
// - Every loop pauses while the tab is hidden (visibilitychange) and resumes on return.
// - Lamp follow and dust motes only with a fine pointer and a viewport 900px or wider. The mobile
//   cap (<= 640px or no fine pointer) is covered by that gate.
// All hooks are SSR-safe: on the server and during hydration they return the server value.

import { useCallback, useSyncExternalStore } from 'react';

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
export const FINE_POINTER_DESKTOP_QUERY = '(pointer: fine) and (min-width: 900px)';
export const MOBILE_CAP_QUERY = '(max-width: 640px), not all and (pointer: fine)';

function getMediaQueryList(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  try {
    return window.matchMedia(query);
  } catch {
    return null;
  }
}

/** Adds a change listener, with the Safari < 14 addListener fallback. Returns the cleanup. */
export function subscribeMediaQuery(mql: MediaQueryList, onChange: () => void): () => void {
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }
  if (typeof mql.addListener === 'function') {
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }
  return () => undefined;
}

/** Live media query match. `serverValue` is used on the server and when matchMedia is missing. */
export function useMediaQuery(query: string, serverValue = false): boolean {
  // Stable per query, so React does not resubscribe on every render.
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = getMediaQueryList(query);
      return mql ? subscribeMediaQuery(mql, onChange) : () => undefined;
    },
    [query],
  );
  const getSnapshot = useCallback(() => {
    const mql = getMediaQueryList(query);
    return mql ? mql.matches : serverValue;
  }, [query, serverValue]);
  const getServerSnapshot = useCallback(() => serverValue, [serverValue]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery(REDUCED_MOTION_QUERY, false);
}

/** True when motion is allowed at all (not reduced). */
export function useMotionAllowed(): boolean {
  return !usePrefersReducedMotion();
}

/** True with a fine pointer and width >= 900px (lamp follow, dust motes). */
export function useFinePointerDesktop(): boolean {
  return useMediaQuery(FINE_POINTER_DESKTOP_QUERY, false);
}

/** True for the spec's mobile cap: width <= 640px or no fine pointer. */
export function useMobileCap(): boolean {
  return useMediaQuery(MOBILE_CAP_QUERY, false);
}

// Module-level so useSyncExternalStore keeps one subscription.
function subscribeVisibility(onChange: () => void): () => void {
  if (typeof document === 'undefined') return () => undefined;
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}
function getVisibilitySnapshot(): boolean {
  return typeof document === 'undefined' ? true : document.visibilityState !== 'hidden';
}
function getVisibilityServerSnapshot(): boolean {
  return true;
}

/** True while the document is visible. Loops pause when this is false. */
export function usePageVisible(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    getVisibilitySnapshot,
    getVisibilityServerSnapshot,
  );
}

/** Ambient effects (lamp follow, motes): not reduced, fine pointer, >= 900px. */
export function useAmbientMotionAllowed(): boolean {
  const motion = useMotionAllowed();
  const desktop = useFinePointerDesktop();
  return motion && desktop;
}

/** Inline style that pauses a CSS loop while the tab is hidden. */
export function loopPlayState(visible: boolean): { animationPlayState: 'running' | 'paused' } {
  return { animationPlayState: visible ? 'running' : 'paused' };
}

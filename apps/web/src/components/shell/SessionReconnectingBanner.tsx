'use client';

/**
 * T-616: the "Reconnecting…" session banner (handoff/design/T-616-reconnecting-banner.md).
 *
 * Shown in the dashboard shell's banner slot while the session refresh keeps failing for a reason
 * that is not the session's fault (429, 5xx, offline, timeout: lib/sessionRefresh). Never a
 * modal, never an action, never focus; the client keeps retrying by itself.
 *
 * Phase machine (nextBannerState, pure; timers in useReconnectingBannerState):
 * - hidden → reconnecting: `reconnecting` (2+ consecutive transient refresh failures) while
 *   online and signed in. After the browser was offline it waits for one more failure first
 *   (the failure count must rise past the count it had while offline).
 * - reconnecting → still-trying: 30 s in the reconnecting phase (text swap only).
 * - reconnecting | still-trying → reconnected: `reconnecting` turns false while signed in (a
 *   refresh succeeded). reconnected → hidden after 3 s; → reconnecting if failing again.
 * - any → hidden at once: offline (OfflineBanner is the message then), or signed out / the
 *   session ended.
 *
 * Motion: 150 ms opacity fade in and out; prefers-reduced-motion: none, and the dots are static
 * at full opacity. The dot pulse pauses while the tab is hidden.
 *
 * Live region: the visible Banner (role=status, aria-live=polite, aria-atomic) is the only one.
 * While the bar is hidden it stays mounted, empty and visually hidden (sr-only in a zero-height
 * `relative` wrapper); when the bar shows, the same node becomes visible and its text is set
 * one frame later, so it is announced once.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { useOnline } from './OfflineBanner';
import { SESSION_RECONNECTING_COPY } from './session-reconnecting-copy';

import { Banner } from '@/components/ui/Banner';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/cn';
import { refreshFailureCount, subscribeRefreshState } from '@/lib/sessionRefresh';

export type ReconnectingBannerPhase = 'hidden' | 'reconnecting' | 'still-trying' | 'reconnected';

/** 30 s in the reconnecting phase, then the text swaps to "Still trying to reconnect." */
export const STILL_TRYING_AFTER_MS = 30_000;
/** How long "Reconnected." stays before the bar goes. */
export const RECONNECTED_SHOWN_MS = 3_000;
/** Opacity fade in and out (none under prefers-reduced-motion). */
export const BANNER_FADE_MS = 150;

export interface ReconnectingBannerInput {
  /** useAuth().reconnecting: 2+ consecutive transient refresh failures. */
  reconnecting: boolean;
  /** useOnline(). */
  online: boolean;
  /** A session is shown (useAuth().user). False hides the bar at once. */
  signedIn: boolean;
  /**
   * The tab-wide consecutive failure count (lib/sessionRefresh). Optional: without it the
   * "wait for one more failure after coming back online" rule is off.
   */
  failureCount?: number;
}

export interface ReconnectingBannerState {
  phase: ReconnectingBannerPhase;
  /** While set, the bar stays hidden until failureCount rises past it (came back online). */
  gate: number | null;
}

export const INITIAL_BANNER_STATE: ReconnectingBannerState = { phase: 'hidden', gate: null };

/** The phase machine for an input change (timers are separate events). Pure. */
export function nextBannerState(
  s: ReconnectingBannerState,
  i: ReconnectingBannerInput,
): ReconnectingBannerState {
  if (!i.signedIn) return INITIAL_BANNER_STATE;
  if (!i.online) {
    // Suppressed. Remember the failure count so coming back online waits for a new failure.
    const gate = i.reconnecting && i.failureCount !== undefined ? i.failureCount : null;
    return { phase: 'hidden', gate };
  }
  if (i.reconnecting) {
    if (s.gate !== null && i.failureCount !== undefined && i.failureCount <= s.gate) {
      return { phase: 'hidden', gate: s.gate };
    }
    const phase = s.phase === 'hidden' || s.phase === 'reconnected' ? 'reconnecting' : s.phase;
    return { phase, gate: null };
  }
  // Not reconnecting (a refresh succeeded, or nothing was failing).
  if (s.phase === 'reconnecting' || s.phase === 'still-trying') {
    return { phase: 'reconnected', gate: null };
  }
  return { phase: s.phase, gate: null };
}

/** A timer event: 30 s in reconnecting, or 3 s in reconnected. Pure. */
export function bannerTimerElapsed(s: ReconnectingBannerState): ReconnectingBannerState {
  if (s.phase === 'reconnecting') return { ...s, phase: 'still-trying' };
  if (s.phase === 'reconnected') return { ...s, phase: 'hidden' };
  return s;
}

function sameState(a: ReconnectingBannerState, b: ReconnectingBannerState): boolean {
  return a.phase === b.phase && a.gate === b.gate;
}

/**
 * The banner's phase for these inputs, with the 30 s and 3 s timers (setTimeout, so jest fake
 * timers drive them; cleared on unmount and on every phase change).
 */
export function useReconnectingBannerState(
  reconnecting: boolean,
  online: boolean,
  options: { signedIn?: boolean; failureCount?: number } = {},
): { phase: ReconnectingBannerPhase } {
  const signedIn = options.signedIn ?? true;
  const { failureCount } = options;
  const [state, setState] = useState<ReconnectingBannerState>(INITIAL_BANNER_STATE);

  useEffect(() => {
    setState((s) => {
      const next = nextBannerState(s, { reconnecting, online, signedIn, failureCount });
      return sameState(s, next) ? s : next;
    });
  }, [reconnecting, online, signedIn, failureCount]);

  useEffect(() => {
    const delay =
      state.phase === 'reconnecting'
        ? STILL_TRYING_AFTER_MS
        : state.phase === 'reconnected'
          ? RECONNECTED_SHOWN_MS
          : null;
    if (delay === null) return undefined;
    const t = setTimeout(() => setState(bannerTimerElapsed), delay);
    return () => clearTimeout(t);
  }, [state.phase]);

  return { phase: state.phase };
}

// ── Environment hooks (SSR-safe) ──────────────────────────────────────────────────────────────

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener?.('change', onChange);
  return () => mq.removeEventListener?.('change', onChange);
}
function getReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches === true;
}

function subscribeVisibility(onChange: () => void): () => void {
  if (typeof document === 'undefined') return () => {};
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}
function getTabHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

const serverFalse = () => false;
const serverZero = () => 0;

// ── View ──────────────────────────────────────────────────────────────────────────────────────

const TEXT: Record<Exclude<ReconnectingBannerPhase, 'hidden'>, string> = {
  reconnecting: SESSION_RECONNECTING_COPY.reconnecting.en,
  'still-trying': SESSION_RECONNECTING_COPY.stillTrying.en,
  reconnected: SESSION_RECONNECTING_COPY.reconnected.en,
};

// The dot pulse: 1 → .35, 1.2 s loop, one dot after another. A literal keyframe here because the
// existing nl-skeleton-pulse is 1 → .55 over 1.4 s and globals.css is not part of this change.
const DOT_CSS =
  '@keyframes lawie-session-dot{0%,100%{opacity:1}50%{opacity:.35}}' +
  '.lawie-session-dot{animation:lawie-session-dot 1.2s ease-in-out infinite}' +
  '@media (prefers-reduced-motion: reduce){.lawie-session-dot{animation:none;opacity:1}}';
const DOT_DELAYS_S = [0, 0.4, 0.8];

export interface SessionReconnectingBannerViewProps {
  phase: ReconnectingBannerPhase;
  /** Defaults to the user's prefers-reduced-motion setting. */
  reducedMotion?: boolean;
  /** Defaults to document.visibilityState === 'hidden'. */
  tabHidden?: boolean;
}

/**
 * Presentational: renders the bar for a phase, with the 150 ms fade. In flow (never sticky or
 * overlaid); nothing in it is focusable.
 */
export function SessionReconnectingBannerView({
  phase,
  reducedMotion,
  tabHidden,
}: SessionReconnectingBannerViewProps) {
  const prefersReduced = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    serverFalse,
  );
  const docHidden = useSyncExternalStore(subscribeVisibility, getTabHidden, serverFalse);
  const reduced = reducedMotion ?? prefersReduced;
  const paused = tabHidden ?? docHidden;

  const shown = phase !== 'hidden';
  // `mounted`: the bar is visible (or fading out). Not mounted, the same Banner stays in the DOM,
  // empty and visually hidden, so its live region already exists when the text arrives.
  const [mounted, setMounted] = useState(false);
  const [opaque, setOpaque] = useState(false);
  // T-616 review round 2 (should-fix 2): the text goes into the live region one frame after the
  // bar shows, so screen readers announce it once (a region that arrives holding its text is
  // often not read).
  const [textReady, setTextReady] = useState(false);
  // The text of the last visible phase, kept while the bar fades out.
  const lastText = useRef<string>(TEXT.reconnecting);
  if (shown) lastText.current = TEXT[phase];

  useEffect(() => {
    if (shown) {
      setMounted(true);
      if (reduced) setOpaque(true);
      // Next frame: the text (and, with motion, the fade in from transparent).
      const reveal = () => {
        setTextReady(true);
        setOpaque(true);
      };
      const raf =
        typeof requestAnimationFrame === 'function' ? requestAnimationFrame(reveal) : null;
      const t = raf === null ? setTimeout(reveal, 0) : null;
      return () => {
        if (raf !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
        if (t !== null) clearTimeout(t);
      };
    }
    setOpaque(false);
    const collapse = () => {
      setMounted(false);
      setTextReady(false);
    };
    if (reduced) {
      collapse();
      return undefined;
    }
    const t = setTimeout(collapse, BANNER_FADE_MS);
    return () => clearTimeout(t);
  }, [shown, reduced]);

  const text = mounted && textReady ? lastText.current : '';

  return (
    // `relative` holds the visually hidden (absolute) region in place: zero height, no layout.
    <div className="relative w-full">
      <div
        data-session-banner-phase={shown ? phase : 'hidden'}
        className={cn(
          mounted ? 'w-full' : 'sr-only',
          mounted && !reduced && 'transition-opacity duration-150 ease-out',
          mounted && (opaque ? 'opacity-100' : 'opacity-0'),
        )}
      >
        <style>{DOT_CSS}</style>
        <Banner
          kind="session-reconnecting"
          className="min-h-[44px]"
          message={
            // The same content column as OfflineBanner: Banner's own 16px gutter plus this column
            // (1180px minus the two 16px gutters, and 16px more from 900px) puts the text on the
            // same edge at every width.
            <span className="min-[900px]:px-nl-4 mx-auto flex w-full min-w-0 max-w-[1148px] items-center gap-[8px]">
              <span aria-hidden="true" className="inline-flex shrink-0 items-center gap-[4px]">
                {DOT_DELAYS_S.map((delay) => (
                  <span
                    key={delay}
                    className="lawie-session-dot bg-nl-brass inline-block h-[4px] w-[4px] rounded-full"
                    // Longhands only (never the `animation` shorthand), so React never updates
                    // a style property that conflicts with another on a rerender. Reduced
                    // motion: no animation, full opacity, no play state; otherwise the pause
                    // (tab hidden or collapsed). The per-dot delay is set either way.
                    style={
                      reduced
                        ? { animationDelay: `${delay}s`, animationName: 'none', opacity: 1 }
                        : {
                            animationDelay: `${delay}s`,
                            animationPlayState: paused || !mounted ? 'paused' : 'running',
                          }
                    }
                  />
                ))}
              </span>
              <span className="min-w-0 break-words">{text}</span>
            </span>
          }
        />
      </div>
    </div>
  );
}

/** Connected: reads the session (useAuth), the browser's online state and the failure count. */
export function SessionReconnectingBanner() {
  const { user, reconnecting } = useAuth();
  const online = useOnline();
  const failureCount = useSyncExternalStore(subscribeRefreshState, refreshFailureCount, serverZero);
  const { phase } = useReconnectingBannerState(Boolean(reconnecting), online, {
    signedIn: Boolean(user),
    failureCount,
  });
  return <SessionReconnectingBannerView phase={phase} />;
}

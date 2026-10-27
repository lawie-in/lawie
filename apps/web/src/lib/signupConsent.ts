'use client';

/**
 * T-642 — the shared state and check for the next-sign-in consent step (AJ-517-M18(c),
 * AJ-642-M2..M6). An acceptedVia 'google' account with no signup consent gets the M16 box in a
 * persistent panel (components/SignupConsentPrompt.tsx) at the top of every dashboard page.
 *
 * While consent is needed, no drafting or purchase request may START (AJ-642-M3, M6). Entry
 * points (start a draft, generate, top-up order, subscribe / upgrade checkout) call
 * `signupConsentGate()` first and return early when it is true:
 *
 *     if (await signupConsentGate()) return;
 *
 * The gate brings the panel into view and focuses its checkbox instead of sending anything.
 * Nothing else is fenced: Settings, export, delete, Privacy Policy and support stay usable.
 *
 * The state comes from GET /api/auth/me `needsSignupConsent` (computed by the server, never
 * stored). An unknown state is asked for before the gate answers; any /me error fails open
 * (no server block exists for this step: AJ-642-M3). Nothing here logs tokens or user data.
 */
import { useSyncExternalStore } from 'react';

import { REDUCED_MOTION_QUERY } from '@/components/ui/motion';
import { apiFetch } from '@/lib/apiFetch';

/** The panel's checkbox id (the gate focuses it) and the panel's id (scrolled into view). */
export const SIGNUP_CONSENT_CHECKBOX_ID = 'signup-consent-box';
export const SIGNUP_CONSENT_PANEL_ID = 'signup-consent-panel';

export interface SignupConsentState {
  /** null: not known yet (not asked, or /me failed). */
  needed: boolean | null;
  /** The M16 box (unticked by default). */
  ticked: boolean;
  /** The M3 error under the box: shown when a fenced action is tried with the box unticked. */
  showError: boolean;
  /** POST /me/signup-consent in flight. */
  pending: boolean;
}

const initial: SignupConsentState = {
  needed: null,
  ticked: false,
  showError: false,
  pending: false,
};

let state: SignupConsentState = initial;
const listeners = new Set<() => void>();
let inFlight: Promise<boolean | null> | null = null;

function setState(patch: Partial<SignupConsentState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Back to "not known" (sign-out, or a new dashboard load). */
export function resetSignupConsent(): void {
  inFlight = null;
  state = initial;
  listeners.forEach((l) => l());
}

/** GET /api/auth/me -> needsSignupConsent. Null on any error or a missing field (fail open). */
export function refreshSignupConsent(): Promise<boolean | null> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const res = await apiFetch('/api/auth/me', { cache: 'no-store' });
      if (!res.ok) return null;
      const body = (await res.json()) as { data?: Record<string, unknown> };
      const v = body?.data?.needsSignupConsent;
      if (typeof v !== 'boolean') return null;
      setState({ needed: v });
      return v;
    } catch {
      return null;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export function setSignupConsentTicked(ticked: boolean): void {
  setState({ ticked, showError: ticked ? false : state.showError });
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    return false;
  }
}

/**
 * Rajesh (T-642 4): scroll the panel into view (its scroll-margin-top is the top bar's height)
 * and focus the CHECKBOX. Smooth only without reduced motion. Run after the current task, so a
 * caller can close its own dialog first and the panel is not inert when focused.
 */
export function focusSignupConsent(): void {
  if (typeof window === 'undefined') return;
  setTimeout(() => {
    const panel = document.getElementById(SIGNUP_CONSENT_PANEL_ID);
    panel?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    const box = document.getElementById(SIGNUP_CONSENT_CHECKBOX_ID);
    box?.focus({ preventScroll: true });
  }, 0);
}

/**
 * The check every drafting and purchase entry point calls before it sends anything. True: the
 * action must not start (the panel is brought into view, focus is on its checkbox, and the M3
 * error shows if the box is unticked). False: go ahead.
 */
export async function signupConsentGate(): Promise<boolean> {
  const needed = state.needed === null ? await refreshSignupConsent() : state.needed;
  if (needed !== true) return false;
  if (!state.ticked) setState({ showError: true });
  focusSignupConsent();
  return true;
}

/** POST /api/auth/me/signup-consent. True on success (the panel then hides). */
export async function acceptSignupConsent(): Promise<boolean> {
  if (state.pending || !state.ticked) return false;
  setState({ pending: true });
  try {
    const res = await apiFetch('/api/auth/me/signup-consent', { method: 'POST' });
    if (!res.ok) {
      setState({ pending: false });
      return false;
    }
    setState({ pending: false, needed: false, showError: false });
    return true;
  } catch {
    setState({ pending: false });
    return false;
  }
}

export function useSignupConsentState(): SignupConsentState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => initial,
  );
}

/**
 * For entry points: `needed` (true while the panel shows: render the page's drafting primary
 * as ghost, Rajesh (3)) and `gate` (signupConsentGate).
 */
export function useSignupConsent(): { needed: boolean; gate: () => Promise<boolean> } {
  const s = useSignupConsentState();
  return { needed: s.needed === true, gate: signupConsentGate };
}

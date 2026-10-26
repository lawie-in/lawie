'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  ACCESS_TOKEN_KEY,
  adoptForeignSession,
  AuthUser,
  clearTokens,
  endSessionForced,
  getAccessToken,
  getRefreshToken,
  getSessionUser,
  msUntilExpiry,
  REFRESH_TOKEN_KEY,
  saveTokens,
  userFromToken,
} from '@/lib/auth';
import {
  isReconnecting,
  refreshCooldownMs,
  refreshSession,
  resetRefreshState,
  subscribeRefreshState,
} from '@/lib/sessionRefresh';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
  /**
   * T-616 (Arjun): true after 2 consecutive refresh attempts that were only delayed (429, 5xx,
   * offline, timeout, lock not obtained), counted tab-wide in lib/sessionRefresh across every
   * caller (apiFetch and this provider). False again on the next successful refresh, a sign-in,
   * or when the session ends. The user stays signed in either way. Optional so existing mocks
   * of useAuth stay valid; the provider always sets it. No UI reads it yet (Rajesh's spec).
   */
  reconnecting?: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** T-616: refresh this long before the access token's `exp`. */
export const REFRESH_MARGIN_MS = 60_000;
/** T-616: the proactive timer never fires sooner than this after it is set. */
export const MIN_TIMER_DELAY_MS = 5_000;
/**
 * T-616: at most one proactive refresh per this window after a success, so a wrong clock or a
 * very short-lived token cannot turn the timer into a refresh loop (apiFetch's 401 path still
 * refreshes when it must).
 */
export const MIN_PROACTIVE_GAP_MS = 60_000;
/**
 * T-616: after a transient outcome the next try waits for sessionRefresh's tab-wide cooldown
 * (1 s, 2 s, 4 s ... 60 s, or a 429's Retry-After), and at least this long.
 */
export const MIN_RETRY_DELAY_MS = 1_000;
/** setTimeout fires at once for delays of 2^31 ms or more. */
const MAX_TIMER_MS = 2 ** 31 - 1;

function sameUser(a: AuthUser | null, b: AuthUser | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.email === b.email &&
    a.name === b.name &&
    a.role === b.role &&
    a.plan === b.plan
  );
}

function isVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * The id of the user this tab shows: a string, null for signed out, undefined before the mount
   * decided (this tab has no memory of an earlier user then). Drives adoptForeignSession.
   */
  const shownUserId = useRef<string | null | undefined>(undefined);
  const lastSuccessAt = useRef(0);
  const active = useRef(false);
  /** Set by the mount effect; login() uses it to (re)start the proactive timer. */
  const scheduleRef = useRef<() => void>(() => {});

  // Keeps the same object when nothing changed, so consumers do not re-render on every refresh.
  const setUser = useCallback((next: AuthUser | null) => {
    shownUserId.current = next ? next.id : null;
    setUserState((prev) => (sameUser(prev, next) ? prev : next));
  }, []);

  /**
   * T-616 review (must-fix 1): show a session this tab did not save itself (another tab's, or
   * the stored one on page load). A different user than the one shown here first goes through
   * adoptForeignSession, which wipes this tab's matter text unless the forced-end marker names
   * that user.
   */
  const adoptUser = useCallback(
    (token: string | null, next: AuthUser | null) => {
      if (next && next.id !== shownUserId.current) {
        adoptForeignSession(token, shownUserId.current);
      }
      setUser(next);
    },
    [setUser],
  );

  const clearTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => {
    active.current = true;
    const unsubscribe = subscribeRefreshState(() => {
      if (active.current) setReconnecting(isReconnecting());
    });
    setReconnecting(isReconnecting());

    const setTimer = (delay: number, fn: () => void) => {
      clearTimer();
      timer.current = setTimeout(fn, Math.min(Math.max(0, delay), MAX_TIMER_MS));
    };

    // T-616 review round 2 (should-fix 3): `stale` is the access token the timer was set for, so
    // a token another tab saved since then counts as "already refreshed" (no call, and the
    // cooldown path answers ok instead of transient).
    const run = async (stale: string | null = getAccessToken()) => {
      clearTimer();
      const sentRefresh = getRefreshToken();
      const outcome = await refreshSession({ staleAccessToken: stale });
      if (!active.current) return;
      if (outcome.kind === 'ok') {
        lastSuccessAt.current = Date.now();
        adoptUser(outcome.accessToken, userFromToken(outcome.accessToken));
        setIsLoading(false);
        schedule();
        return;
      }
      if (outcome.kind === 'expired') {
        // The auth service refused the refresh token: the session is over. Keep the matter text
        // (endSessionForced); the page guard sends the user to /login?next=<this page>.
        // A sign-in in this tab (login) or another tab replaced the tokens meanwhile: keep them.
        const now = getSessionUser();
        if (getRefreshToken() !== sentRefresh && now) {
          adoptUser(getAccessToken(), now);
          setIsLoading(false);
          schedule();
          return;
        }
        endSessionForced();
        resetRefreshState();
        setUser(null);
        setIsLoading(false);
        return;
      }
      // Transient (429, 5xx, offline, timeout): never signed out. Tokens untouched; show the
      // user the stored token names (even if it has just expired) and try again later.
      const stored = getAccessToken();
      adoptUser(stored, userFromToken(stored));
      setIsLoading(false);
      retryLater();
    };

    const retryLater = () => {
      // Hidden tabs wait for the visibility/focus/online catch-up instead of polling.
      if (!isVisible()) return;
      // The tab-wide cooldown sets the pace (it grows with every failure, from any caller).
      const stale = getAccessToken();
      setTimer(Math.max(MIN_RETRY_DELAY_MS, refreshCooldownMs()), () => {
        void run(stale);
      });
    };

    /** Proactive timer from the stored access token's `exp`. */
    function schedule() {
      clearTimer();
      const token = getAccessToken();
      const left = msUntilExpiry(token);
      if (left === null) return;
      const sinceSuccess = Date.now() - lastSuccessAt.current;
      const gap = sinceSuccess < MIN_PROACTIVE_GAP_MS ? MIN_PROACTIVE_GAP_MS - sinceSuccess : 0;
      const due = left - REFRESH_MARGIN_MS;
      if (due <= 0 && gap === 0) {
        void run(token);
        return;
      }
      setTimer(Math.max(due, gap, MIN_TIMER_DELAY_MS), () => {
        void run(token);
      });
    }
    scheduleRef.current = schedule;

    /** Visible again, focused or back online: timers may have been throttled or slept through. */
    // T-616 review (should-fix 1): it never resets the failure count or the cooldown, and makes
    // no call while the cooldown runs (the retry timer is already set for its end).
    const catchUp = () => {
      if (!isVisible()) return;
      if (!getRefreshToken()) return;
      if (refreshCooldownMs() > 0) {
        if (timer.current === null) retryLater();
        return;
      }
      const left = msUntilExpiry(getAccessToken());
      const sinceSuccess = Date.now() - lastSuccessAt.current;
      if ((left === null || left <= REFRESH_MARGIN_MS) && sinceSuccess >= MIN_PROACTIVE_GAP_MS) {
        void run();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') catchUp();
    };

    /** Another tab changed the session (refresh, sign-in or sign-out). */
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea && e.storageArea !== window.localStorage) return;
      if (e.key !== null && e.key !== ACCESS_TOKEN_KEY && e.key !== REFRESH_TOKEN_KEY) return;
      const access = getAccessToken();
      const refresh = getRefreshToken();
      if (!access && !refresh) {
        clearTimer();
        resetRefreshState();
        setUser(null);
        setIsLoading(false);
        return;
      }
      const current = getSessionUser();
      if (current) {
        // T-616 review round 2 (must-fix 2): another tab's refresh or sign-in proves a fresh
        // session (getSessionUser only returns a user for an unexpired token), so this tab's
        // failures and cooldown end too; the reset notifies, so `reconnecting` and the banner
        // clear.
        resetRefreshState();
        // T-616 review (must-fix 1): another user's session wipes this tab's matter text.
        adoptUser(access, current);
        setIsLoading(false);
        schedule();
      }
      // An expired access token with a refresh token: the other tab is mid-write or this tab's
      // own timer/catch-up deals with it. Nothing to do yet.
    };

    // Mount: a valid access token signs in as before. An expired one with a refresh token is
    // refreshed first (still loading meanwhile); never "signed out" before that attempt.
    const initial = getSessionUser();
    if (initial) {
      adoptUser(getAccessToken(), initial);
      setIsLoading(false);
      schedule();
    } else if (getRefreshToken()) {
      void run();
    } else {
      // Nothing stored: this tab is signed out (shownUserId null), so a session another tab
      // starts later follows the strict rule in adoptForeignSession.
      setUser(null);
      setIsLoading(false);
    }

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', catchUp);
    window.addEventListener('online', catchUp);
    window.addEventListener('storage', onStorage);
    return () => {
      active.current = false;
      unsubscribe();
      clearTimer();
      scheduleRef.current = () => {};
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', catchUp);
      window.removeEventListener('online', catchUp);
      window.removeEventListener('storage', onStorage);
    };
  }, [clearTimer, setUser, adoptUser]);

  const login = useCallback(
    (accessToken: string, refreshToken: string) => {
      // saveTokens applies the matter-text rule for a sign-in itself.
      saveTokens(accessToken, refreshToken);
      resetRefreshState();
      setUser(getSessionUser());
      setIsLoading(false);
      scheduleRef.current();
    },
    [setUser],
  );

  const logout = useCallback(() => {
    clearTimer();
    resetRefreshState();
    clearTokens();
    setUser(null);
  }, [clearTimer, setUser, adoptUser]);

  const value = useMemo(
    () => ({ user, isLoading, login, logout, reconnecting }),
    [user, isLoading, login, logout, reconnecting],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

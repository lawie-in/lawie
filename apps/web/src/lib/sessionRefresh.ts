/**
 * T-616: the one place the web app refreshes its session (POST /api/auth/refresh).
 *
 * Refresh tokens are single-use and rotated (T-299): two refreshes with the same token give one
 * 200 and one 401. So every refresh in every tab goes through `refreshSession`:
 * - single-flight per tab (one in-flight promise shared by all callers);
 * - serialised across tabs with the Web Locks API (5 s to get the lock, else `transient`); inside
 *   the lock the stored tokens are read again, and if another tab already rotated them the new
 *   access token is used without calling the endpoint. The refresh token sent is always the one
 *   in storage at that moment, read inside the lock;
 * - without Web Locks (jsdom, very old browsers): the same re-read, then the call, no delay;
 * - a 401 is only "expired" when the refresh token we sent is still the stored one (otherwise
 *   another tab rotated it, and the new one is used);
 * - a 200 is saved only if the stored refresh token is still the one we sent (nobody signed out
 *   or signed in as someone else meanwhile).
 *
 * Cooldown (T-616 review should-fix 1), one per tab for every caller: after a transient result
 * from the endpoint, no new call is made for 1 s, 2 s, 4 s ... up to 60 s (or a 429's Retry-After,
 * up to 5 min, when longer). During the cooldown `refreshSession` answers `transient` at once
 * without a network call (it still notices tokens another tab saved). Any `ok` or `expired` ends
 * the cooldown. Once failing, a tab makes at most about one call a minute.
 *
 * Outcomes:
 * - `ok`: new tokens saved (or another tab's fresh ones found); carries the access token.
 * - `expired`: definitive. The endpoint answered 401/400 for the token we sent, or there is no
 *   refresh token. Tokens are left as they are; the caller ends the session.
 * - `transient`: 429, 5xx, any other non-ok status, a network error, a timeout, an unreadable
 *   200, the lock not obtained in time, or the cooldown. Tokens untouched; retry later.
 *
 * Never logs, and never puts a token in an error, URL or analytics event.
 */
import { getAccessToken, getRefreshToken, isTokenExpired, saveTokens } from './auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export const REFRESH_LOCK_NAME = 'lawie-session-refresh';
/** A refresh that has not answered by then counts as transient. */
export const REFRESH_TIMEOUT_MS = 15_000;
/** The cross-tab lock not obtained by then: transient, no call. */
export const LOCK_ACQUIRE_TIMEOUT_MS = 5_000;
/** Cooldown after the n-th consecutive transient result: base * 2^(n-1), capped. */
export const COOLDOWN_BASE_MS = 1_000;
export const COOLDOWN_CAP_MS = 60_000;
/** A 429's Retry-After is honoured up to this. */
export const RETRY_AFTER_CAP_MS = 5 * 60_000;
/** `reconnecting` turns on after this many consecutive transient results (Arjun, T-616). */
export const RECONNECTING_AFTER_FAILURES = 2;

export type RefreshOutcome =
  | { kind: 'ok'; accessToken: string }
  | { kind: 'expired' }
  | { kind: 'transient' };

export interface RefreshOptions {
  /**
   * The access token the caller found unusable (for apiFetch: the one that got the 401). If the
   * stored access token differs from it and is still valid, another refresh already happened and
   * that token is returned without calling the endpoint. Defaults to the token stored when the
   * refresh starts.
   */
  staleAccessToken?: string | null;
}

let inFlight: Promise<RefreshOutcome> | null = null;

// ── Module-wide failure state (per tab, in memory) ────────────────────────────────────────────
let consecutiveFailures = 0;
let nextAttemptAt = 0;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // A listener's error never breaks a refresh.
    }
  });
}

/** Consecutive transient results (endpoint or lock) since the last ok/expired/reset. */
export function refreshFailureCount(): number {
  return consecutiveFailures;
}

/** True after RECONNECTING_AFTER_FAILURES consecutive transient results. */
export function isReconnecting(): boolean {
  return consecutiveFailures >= RECONNECTING_AFTER_FAILURES;
}

/**
 * ms left in the cooldown (0 when a call may be made now). Every reader (apiFetch, AuthContext's
 * retry timer and catch-up, the early returns here) goes through this function.
 *
 * T-616 review round 3: the stored deadline heals itself. A real deadline is never more than
 * RETRY_AFTER_CAP_MS (5 min) ahead (backoff tops out at 60 s, Retry-After at 5 min), so a
 * deadline further out than that means the wall clock went backwards. It is then pulled in to
 * now + 5 min, so a backwards clock costs at most 5 more minutes of cooldown, not hours.
 */
export function refreshCooldownMs(): number {
  const now = Date.now();
  if (nextAttemptAt - now > RETRY_AFTER_CAP_MS) nextAttemptAt = now + RETRY_AFTER_CAP_MS;
  return Math.max(0, nextAttemptAt - now);
}

/** Called whenever the failure count changes. Returns the unsubscribe function. */
export function subscribeRefreshState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Forget failures and the cooldown: a success, a definitive end, or a sign-in/sign-out. */
export function resetRefreshState(): void {
  const changed = consecutiveFailures !== 0;
  consecutiveFailures = 0;
  nextAttemptAt = 0;
  if (changed) notify();
}

function noteTransient(retryAfter: number | null): void {
  consecutiveFailures += 1;
  const backoff = Math.min(COOLDOWN_CAP_MS, COOLDOWN_BASE_MS * 2 ** (consecutiveFailures - 1));
  nextAttemptAt = Date.now() + (retryAfter !== null ? Math.max(backoff, retryAfter) : backoff);
  notify();
}

/** Retry-After as ms (seconds or an HTTP date), capped; null when absent or unreadable. */
function retryAfterMs(res: Response): number | null {
  let raw: string | null = null;
  try {
    raw = res.headers?.get?.('Retry-After') ?? null;
  } catch {
    raw = null;
  }
  if (!raw) return null;
  const trimmed = raw.trim();
  let ms: number | null = null;
  if (/^\d+$/.test(trimmed)) ms = Number(trimmed) * 1000;
  else {
    const at = Date.parse(trimmed);
    if (Number.isFinite(at)) ms = Math.max(0, at - Date.now());
  }
  return ms === null ? null : Math.min(RETRY_AFTER_CAP_MS, ms);
}

/** The refresh this tab is running right now, if any (apiFetch waits for it). */
export function refreshInFlight(): Promise<RefreshOutcome> | null {
  return inFlight;
}

/** Another refresh (this tab or another) already replaced the stale token: use the new one. */
function freshStoredToken(stale: string | null): string | null {
  const current = getAccessToken();
  if (current && current !== stale && !isTokenExpired(current)) return current;
  return null;
}

type CallResult =
  | { kind: 'ok'; accessToken: string }
  | { kind: 'rejected' }
  | { kind: 'transient'; retryAfterMs: number | null };

async function callRefreshEndpoint(refreshToken: string): Promise<CallResult> {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS) : null;
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
      ...(controller ? { signal: controller.signal } : {}),
    });
    if (res.status === 401 || res.status === 400) return { kind: 'rejected' };
    if (!res.ok) {
      return { kind: 'transient', retryAfterMs: res.status === 429 ? retryAfterMs(res) : null };
    }
    const body = (await res.json()) as { data?: { accessToken?: unknown; refreshToken?: unknown } };
    const accessToken = body?.data?.accessToken;
    const newRefresh = body?.data?.refreshToken;
    if (typeof accessToken !== 'string' || !accessToken) {
      return { kind: 'transient', retryAfterMs: null };
    }
    // T-616 review (must-fix 2): save only if nothing changed while the call was in flight. A
    // sign-out (no token) or a sign-in, possibly as another user (a different token), happened
    // meanwhile: this answer belongs to a session that is no longer the stored one. Dropped;
    // refreshUnderLock then uses the stored session or reports `expired`.
    if (getRefreshToken() !== refreshToken) return { kind: 'rejected' };
    saveTokens(
      accessToken,
      typeof newRefresh === 'string' && newRefresh ? newRefresh : refreshToken,
    );
    return { kind: 'ok', accessToken };
  } catch {
    // Network error, abort (timeout) or an unreadable body.
    return { kind: 'transient', retryAfterMs: null };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Runs with the cross-tab lock held (or directly when there are no Web Locks). */
async function refreshUnderLock(stale: string | null): Promise<RefreshOutcome> {
  const already = freshStoredToken(stale);
  if (already) return { kind: 'ok', accessToken: already };
  // The cooldown may have started (in this tab) while we waited for the lock.
  if (refreshCooldownMs() > 0) return { kind: 'transient' };

  // At most two calls: the second only when another tab rotated the refresh token while ours was
  // in flight (our 401 was for a token that is no longer the stored one).
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const sent = getRefreshToken();
    if (!sent) return { kind: 'expired' };
    const result = await callRefreshEndpoint(sent);
    if (result.kind === 'ok') return result;
    if (result.kind === 'transient') {
      noteTransient(result.retryAfterMs);
      return { kind: 'transient' };
    }
    // 401/400, or a 200 dropped because the stored session changed: definitive only if nobody
    // replaced the token we sent.
    const nowStored = getRefreshToken();
    if (nowStored === sent) return { kind: 'expired' };
    const rotated = freshStoredToken(stale);
    if (rotated) return { kind: 'ok', accessToken: rotated };
    if (!nowStored) return { kind: 'expired' };
  }
  return { kind: 'transient' };
}

interface LockManagerLike {
  request<T>(
    name: string,
    options: { signal?: AbortSignal },
    callback: () => Promise<T>,
  ): Promise<T>;
}

function lockManager(): LockManagerLike | null {
  if (typeof navigator === 'undefined') return null;
  const locks = (navigator as Navigator & { locks?: LockManagerLike }).locks;
  return locks && typeof locks.request === 'function' ? locks : null;
}

async function doRefresh(stale: string | null): Promise<RefreshOutcome> {
  const locks = lockManager();
  // No Web Locks (jsdom, very old browsers): re-read, then call, no delay.
  if (!locks) return refreshUnderLock(stale);

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), LOCK_ACQUIRE_TIMEOUT_MS) : null;
  // T-616 review (should-fix 4): there is no second, lock-free attempt. Whether the lock was
  // never obtained (5 s abort, request failed) or the callback threw after it started, the
  // result is `transient` and nothing is rerun, so a spent refresh token is never sent twice.
  try {
    return await locks.request(
      REFRESH_LOCK_NAME,
      controller ? { signal: controller.signal } : {},
      async () => {
        if (timer) clearTimeout(timer);
        return refreshUnderLock(stale);
      },
    );
  } catch {
    noteTransient(null);
    return { kind: 'transient' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Refresh the session once, shared by every caller in this tab. See the file comment for the
 * outcomes. Never throws.
 */
export function refreshSession(options: RefreshOptions = {}): Promise<RefreshOutcome> {
  if (typeof window === 'undefined') return Promise.resolve({ kind: 'expired' });
  if (inFlight) return inFlight;
  const stale =
    options.staleAccessToken !== undefined ? options.staleAccessToken : getAccessToken();

  // Cooldown: no call. Tokens another tab saved meanwhile are still picked up.
  if (refreshCooldownMs() > 0) {
    const fresh = freshStoredToken(stale);
    if (fresh) {
      resetRefreshState();
      return Promise.resolve({ kind: 'ok', accessToken: fresh });
    }
    return Promise.resolve({ kind: 'transient' });
  }

  inFlight = doRefresh(stale)
    .catch((): RefreshOutcome => ({ kind: 'transient' }))
    .then((outcome) => {
      if (outcome.kind !== 'transient') resetRefreshState();
      return outcome;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

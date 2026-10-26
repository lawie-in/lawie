/**
 * Authenticated fetch wrapper with automatic token refresh.
 *
 * - Attaches the stored access token as Bearer header
 * - Waits for a refresh this tab already has in flight before sending
 * - On 401, refreshes through lib/sessionRefresh (single-flight per tab, serialised across tabs)
 *   and retries the request once with the new token
 * - T-616: a refresh that is only delayed (429, 5xx, offline, timeout) never signs out. It is
 *   retried with backoff; if it still cannot get through, the request fails the way a network
 *   failure does and the tokens are kept
 * - Only a refresh token the auth service refused ends the session: tokens removed (the matter
 *   text kept, endSessionForced) and a redirect to /login with a return path
 */
import { endSessionForced, getAccessToken, isTokenExpired, tokenSubject } from './auth';
import { buildLoginRedirect } from './safeReturnPath';
import {
  refreshCooldownMs,
  refreshInFlight,
  refreshSession,
  RefreshOutcome,
} from './sessionRefresh';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * T-616: waits before the 2nd, 3rd and 4th refresh attempt after a transient outcome. Every
 * attempt goes through sessionRefresh's tab-wide cooldown, so an attempt inside the cooldown
 * makes no call; these waits only decide when this request looks again.
 */
export const TRANSIENT_REFRESH_BACKOFF_MS = [500, 1500, 4000] as const;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Refresh the access token, sharing one in-flight refresh between all callers. Refresh tokens
 * are single-use (T-299), so every refresh in the app must go through here or refreshSession
 * (T-343: privacyFetch uses it too). Resolves to the new access token, or null when the refresh
 * failed (T-616: refused, or only delayed; either way nothing is cleared here).
 */
export async function refreshAccessToken(): Promise<string | null> {
  const outcome = await refreshSession();
  return outcome.kind === 'ok' ? outcome.accessToken : null;
}

/** A refresh, retried with backoff while it is only delayed. */
async function refreshWithBackoff(staleAccessToken: string | null): Promise<RefreshOutcome> {
  let outcome = await refreshSession({ staleAccessToken });
  for (let i = 0; i < TRANSIENT_REFRESH_BACKOFF_MS.length; i += 1) {
    if (outcome.kind !== 'transient') return outcome;
    // The cooldown outlasts every wait left: no attempt here could make a call. Fail now.
    const left = TRANSIENT_REFRESH_BACKOFF_MS.slice(i).reduce((a, b) => a + b, 0);
    if (refreshCooldownMs() > left) return outcome;
    await sleep(TRANSIENT_REFRESH_BACKOFF_MS[i]);
    outcome = await refreshSession({ staleAccessToken });
  }
  return outcome;
}

/**
 * T-616 review: a request is only ever re-sent as the user it was first sent as. When the stored
 * token now belongs to someone else (another user signed in on this computer), it is not.
 */
function sameUser(sentWith: string | null, other: string): boolean {
  const sub = tokenSubject(sentWith);
  return sub === null || sub === tokenSubject(other);
}

/**
 * The same error a failed network request gives (fetch rejects with TypeError "Failed to fetch"),
 * so callers show the error they already show when offline. No token or URL in it.
 */
function refreshUnavailableError(): TypeError {
  return new TypeError('Failed to fetch');
}

/** T-616: the session is over for good. Keep the matter text, come back here after sign-in. */
function endSessionAndRedirect(): Promise<Response> {
  endSessionForced();
  window.location.replace(buildLoginRedirect(window.location.pathname));
  // Never resolves, so no caller .then()/.catch() fires while the browser navigates away —
  // prevents stale error banners.
  return new Promise<Response>(() => {});
}

/**
 * Like `fetch`, but automatically:
 * 1. Attaches `Authorization: Bearer <token>` from localStorage
 * 2. On 401 for a token that is no longer the stored one (a refresh already replaced it) →
 *    retries once with the stored token, without refreshing (T-616)
 * 3. On 401 for the stored token → refreshes the access token and retries once
 * 4. Refresh refused → ends the session and navigates to /login?next=<this page>
 * 5. Refresh only delayed → keeps the session; the request rejects like a network failure
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  // T-616: a refresh already running in this tab will replace the token: wait for it. If it was
  // only delayed, the current token is still sent (it is good until it truly expires).
  const pending = refreshInFlight();
  if (pending) await pending;

  const token = getAccessToken();

  const makeRequest = (t: string | null) =>
    fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        ...(t ? { Authorization: `Bearer ${t}` } : {}),
      },
    });

  const res = await makeRequest(token);

  // Not a 401 — return as-is
  if (res.status !== 401) return res;

  // No window (server render): nothing to refresh or redirect; return the 401 as before.
  if (typeof window === 'undefined') return res;

  // T-616 (a): a 401 for a token that is no longer the stored one is a late answer to a request
  // sent before a refresh succeeded (this tab or another). The refresh revoked that token on the
  // server, so the 401 says nothing about the session: retry once with the stored token. No
  // refresh call, no sign-out.
  let failed = token;
  const stored = getAccessToken();
  if (stored && stored !== token) {
    // Someone else's session now: never re-send this request as them. Not a sign-out either.
    if (!sameUser(token, stored)) return res;
    const retried = await makeRequest(stored);
    if (retried.status !== 401) return retried;
    failed = stored;
  }

  // The token that just failed is the stored one: refresh (shared with every other caller; the
  // refresh token is read from storage inside the cross-tab lock), then retry once.
  const outcome = await refreshWithBackoff(failed);

  if (outcome.kind === 'ok') {
    return sameUser(token, outcome.accessToken) ? makeRequest(outcome.accessToken) : res;
  }

  if (outcome.kind === 'expired') return endSessionAndRedirect();

  // Transient: never clear tokens, never redirect. If another tab saved a different, still-valid
  // access token meanwhile, the request is worth one more try with it.
  const current = getAccessToken();
  if (current && current !== failed && !isTokenExpired(current)) {
    return sameUser(token, current) ? makeRequest(current) : res;
  }
  throw refreshUnavailableError();
}

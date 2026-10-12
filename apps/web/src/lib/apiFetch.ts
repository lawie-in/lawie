/**
 * Authenticated fetch wrapper with automatic token refresh.
 *
 * - Attaches the stored access token as Bearer header
 * - On 401, attempts one token refresh via POST /api/auth/refresh
 * - On successful refresh, saves new tokens and retries the original request
 * - On refresh failure, clears tokens and reloads to /login
 */
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from './auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

let refreshing: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const { accessToken, refreshToken: newRefresh } = data.data ?? {};
    if (!accessToken) return null;

    saveTokens(accessToken, newRefresh ?? refreshToken);
    return accessToken;
  } catch {
    return null;
  }
}

/**
 * Refresh the access token, sharing one in-flight refresh between all callers. Refresh tokens
 * are single-use (T-299), so every refresh in the app must go through here (T-343: privacyFetch
 * uses it too). Resolves to the new access token, or null when the refresh failed.
 */
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

/**
 * Like `fetch`, but automatically:
 * 1. Attaches `Authorization: Bearer <token>` from localStorage
 * 2. On 401 → refreshes the access token (once) and retries
 * 3. On second 401 → clears tokens and navigates to /login
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
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

  // 401 — try to refresh exactly once (de-duplicate concurrent refreshes)
  const newToken = await refreshAccessToken();

  if (!newToken) {
    // Refresh failed — clear session and redirect to login.
    // Return a promise that never resolves so no caller .then()/.catch() fires
    // while the browser navigates away — prevents stale error banners.
    clearTokens();
    if (typeof window !== 'undefined') {
      window.location.replace('/login');
      return new Promise<Response>(() => {});
    }
    return res;
  }

  // Retry with fresh token
  return makeRequest(newToken);
}

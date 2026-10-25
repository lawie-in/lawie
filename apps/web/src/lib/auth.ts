import { DRAFT_PREFILL_KEY } from './draftPrefill';

const ACCESS_TOKEN_KEY = 'lawie_access_token';
const REFRESH_TOKEN_KEY = 'lawie_refresh_token';
/** T-343: sessionStorage prefix of the privacy prompt's "shown this sign-in" flags. */
export const PRIVACY_PROMPT_SHOWN_PREFIX = 'lawie_privacy_prompt_shown:';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  plan: string;
}

function parseJwt(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

function isExpired(token: string): boolean {
  const payload = parseJwt(token);
  if (!payload || typeof payload.exp !== 'number') return true;
  return Date.now() / 1000 > payload.exp;
}

/** The `sub` of a token, expired or not; null when there is none or it cannot be read. */
function tokenSubject(token: string | null): string | null {
  if (!token) return null;
  const sub = parseJwt(token)?.sub;
  return typeof sub === 'string' ? sub : null;
}

/** T-565 item 40: drop the command bar's matter text from this tab. Never throws. */
function clearDraftPrefill(): void {
  try {
    sessionStorage.removeItem(DRAFT_PREFILL_KEY);
  } catch {
    // Storage unavailable: nothing to clear.
  }
}

export function saveTokens(accessToken: string, refreshToken: string): void {
  if (typeof window === 'undefined') return;
  // T-565 item 40 (review): sessionStorage is per tab, so a tab that was open when another tab
  // signed out can still hold the last user's matter text. A new session (no stored token
  // before, or a different user) drops it. A token refresh or re-issue for the same user keeps
  // it, so text on its way to the describe step is not lost mid-navigation.
  const before = tokenSubject(localStorage.getItem(ACCESS_TOKEN_KEY));
  const after = tokenSubject(accessToken);
  if (before === null || before !== after) clearDraftPrefill();
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  // T-343: signing out forgets "privacy prompt shown", so the next sign-in prompts again.
  // T-565 item 40: it also drops any matter text left for the describe step. Every sign-out
  // comes here: AuthContext logout, and apiFetch's forced sign-out when the refresh fails.
  clearDraftPrefill();
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(PRIVACY_PROMPT_SHOWN_PREFIX)) sessionStorage.removeItem(k);
    }
  } catch {
    // Storage unavailable: nothing to clear.
  }
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/** Returns the decoded user from the stored access token, or null if missing/expired. */
export function getSessionUser(): AuthUser | null {
  const token = getAccessToken();
  if (!token || isExpired(token)) return null;
  const payload = parseJwt(token);
  if (!payload) return null;
  return {
    id: payload.sub as string,
    email: payload.email as string,
    name: (payload.name as string) ?? (payload.email as string),
    role: payload.role as string,
    plan: (payload.plan as string) ?? 'free',
  };
}

/** True if there is a valid, non-expired access token in storage. */
export function isAuthenticated(): boolean {
  return getSessionUser() !== null;
}

/**
 * T-115c — the analytics consent choice (AnalyticsConsent's CONSENT_STORAGE_KEY). It is about
 * this browser, not the account (a random id, no name or email), so closing an account keeps it.
 * Copied here, not imported, so this module stays free of component imports.
 */
const KEPT_ON_ACCOUNT_CLOSE = new Set(['lawie.consent.analytics']);

/**
 * T-115c (Rajesh's spec §4) — after an account is closed, remove everything the app stored in
 * this browser: the tokens and privacy-prompt flags (clearTokens), then every other Lawie key in
 * localStorage and sessionStorage (all start with `lawie`: lawie.sectionFinder.*,
 * lawie_referral_shown, lawie.oauth.verifier, lawie_signup_utm, lawie:document-delete-outcome,
 * lawie_splash_seen). Only the analytics consent choice stays. Never throws.
 */
export function clearAllLocalState(): void {
  if (typeof window === 'undefined') return;
  clearTokens();
  for (const getStore of [() => window.localStorage, () => window.sessionStorage]) {
    try {
      const store = getStore();
      for (let i = store.length - 1; i >= 0; i -= 1) {
        const k = store.key(i);
        if (k && k.startsWith('lawie') && !KEPT_ON_ACCOUNT_CLOSE.has(k)) store.removeItem(k);
      }
    } catch {
      // Storage unavailable: nothing to clear.
    }
  }
}

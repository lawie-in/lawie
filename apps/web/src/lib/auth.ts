import { DRAFT_PREFILL_KEY } from './draftPrefill';

export const ACCESS_TOKEN_KEY = 'lawie_access_token';
export const REFRESH_TOKEN_KEY = 'lawie_refresh_token';
/**
 * T-616: per tab (sessionStorage), the `sub` of a session that ended by itself (the refresh token
 * was refused), not by the user signing out. The next sign-in of the same user in this tab keeps
 * the describe step's matter text; a different user still drops it (T-565 item 40).
 */
const FORCED_END_SUBJECT_KEY = 'lawie:forced-end-subject';
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

/**
 * T-616: this tab's estimate of (local clock - server clock) in ms, taken from the `iat` of the
 * last token this tab saved (always freshly minted: sign-in, OAuth exchange or refresh). In memory
 * only. 0 until a token is saved, so a tab starts by trusting its own clock.
 */
let clockSkewMs = 0;

/** T-616 review: the skew estimate never exceeds this, nor the token's own lifetime. */
export const MAX_CLOCK_SKEW_MS = 10 * 60_000;

function noteServerTime(token: string): void {
  const payload = parseJwt(token);
  const iat = payload?.iat;
  if (typeof iat !== 'number' || !Number.isFinite(iat)) return;
  const exp = payload?.exp;
  const lifetime =
    typeof exp === 'number' && Number.isFinite(exp) && exp > iat ? (exp - iat) * 1000 : 0;
  // A stale `iat` (far in the past) would otherwise make an expired token look valid: clamp.
  const limit = Math.min(MAX_CLOCK_SKEW_MS, lifetime);
  const raw = Date.now() - iat * 1000;
  clockSkewMs = Math.max(-limit, Math.min(limit, raw));
}

/** T-616: the `exp` claim of a JWT in ms since the epoch (not verified); null if unreadable. */
export function tokenExpiryMs(token: string | null): number | null {
  if (!token) return null;
  const exp = parseJwt(token)?.exp;
  return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : null;
}

/**
 * T-616: ms until the token expires, by the server's clock as far as this tab can tell (negative
 * once expired). Null when there is no token or no readable `exp`.
 */
export function msUntilExpiry(token: string | null): number | null {
  const exp = tokenExpiryMs(token);
  return exp === null ? null : exp - (Date.now() - clockSkewMs);
}

/** True when the token is missing an `exp`, unreadable, or past it (skew-corrected). */
export function isTokenExpired(token: string | null): boolean {
  const ms = msUntilExpiry(token);
  return ms === null || ms <= 0;
}

function isExpired(token: string): boolean {
  return isTokenExpired(token);
}

/** The `sub` of a token, expired or not; null when there is none or it cannot be read. */
export function tokenSubject(token: string | null): string | null {
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
  // T-616: after a session ended by itself (endSessionForced), the same user signing in again in
  // this tab counts as the same session for this rule, so the text survives the forced sign-in.
  // T-616 review (must-fix 1): the marker is ALWAYS read and removed. When it exists, only its
  // user keeps the text, even if another tab already stored a different user's token.
  const marker = takeForcedEndSubject();
  const before = tokenSubject(localStorage.getItem(ACCESS_TOKEN_KEY)) ?? marker;
  const after = tokenSubject(accessToken);
  if (before === null || before !== after || (marker !== null && marker !== after)) {
    clearDraftPrefill();
  }
  noteServerTime(accessToken);
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

/** T-616: reads and removes the forced-end marker. Never throws. */
function takeForcedEndSubject(): string | null {
  try {
    const sub = sessionStorage.getItem(FORCED_END_SUBJECT_KEY);
    sessionStorage.removeItem(FORCED_END_SUBJECT_KEY);
    return sub;
  } catch {
    return null;
  }
}

/**
 * T-616 review (must-fix 1): this tab takes on a session it did not save itself (another tab's
 * sign-in or refresh seen through the storage event, or the stored session on page load).
 * Decides whether this tab's describe-step matter text may stay, and removes the forced-end
 * marker.
 *
 * - `previousUserId` known (a string, or null for "signed out"): the text stays only for the
 *   marker's user when there is a marker, else only when the same user was already signed in
 *   here. Signed out with no marker: wiped.
 * - `previousUserId` undefined (page load: this tab has no memory of who used it): wiped only
 *   when a marker names a different user; with no marker nothing changes (as before T-616).
 *
 * Never throws.
 */
export function adoptForeignSession(
  accessToken: string | null,
  previousUserId: string | null | undefined,
): void {
  if (typeof window === 'undefined') return;
  const sub = tokenSubject(accessToken);
  const marker = takeForcedEndSubject();
  let keep: boolean;
  if (marker !== null) keep = sub !== null && sub === marker;
  else if (previousUserId === undefined) keep = true;
  else keep = sub !== null && sub === previousUserId;
  if (!keep) clearDraftPrefill();
}

/** The session keys every kind of session end removes (not the matter text). Never throws. */
function removeSessionKeys(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(PRIVACY_PROMPT_SHOWN_PREFIX)) sessionStorage.removeItem(k);
    }
  } catch {
    // Storage unavailable: nothing to clear.
  }
}

/**
 * T-616: the session ended by itself (the auth service refused the refresh token: expired, used
 * or revoked), not because the user signed out. Removes the tokens and the privacy-prompt flags
 * like clearTokens, but KEEPS the describe step's matter text (`lawie:draft-prefill`) in this tab,
 * so it is still there after the user signs in again. It records the user's `sub` in this tab
 * only, so saveTokens keeps the text for the same user and drops it for anyone else.
 */
export function endSessionForced(): void {
  if (typeof window === 'undefined') return;
  const sub = tokenSubject(localStorage.getItem(ACCESS_TOKEN_KEY));
  removeSessionKeys();
  // T-616 review round 2 (must-fix 1): only ever SET the marker. A second call in the same tab
  // (two requests sharing one refused refresh) finds no token and must not erase the marker the
  // first call wrote. A marker already there names the last user whose session ended by itself.
  // Explicit sign-out (clearTokens) and the next sign-in (saveTokens) remove it.
  try {
    if (sub) sessionStorage.setItem(FORCED_END_SUBJECT_KEY, sub);
  } catch {
    // Storage unavailable: the next sign-in treats the text as from another session.
  }
}

export function clearTokens(): void {
  if (typeof window === 'undefined') return;
  removeSessionKeys();
  // T-343: signing out forgets "privacy prompt shown", so the next sign-in prompts again.
  // T-565 item 40: it also drops any matter text left for the describe step. The user's own
  // sign-out comes here (AuthContext logout). T-616: a session that ended by itself goes through
  // endSessionForced instead, which keeps the text for the same user's next sign-in.
  clearDraftPrefill();
  try {
    sessionStorage.removeItem(FORCED_END_SUBJECT_KEY);
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
  return userFromToken(token);
}

/**
 * T-616: the user a token names, expired or not; null if unreadable. For a tab whose access token
 * has just expired but whose refresh is only delayed (429, 5xx, offline): it stays signed in.
 */
export function userFromToken(token: string | null): AuthUser | null {
  if (!token) return null;
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

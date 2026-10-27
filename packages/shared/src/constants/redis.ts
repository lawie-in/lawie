/** Redis key prefixes and TTL constants for session management + rate limiting */

/**
 * T-616b (Arjun) — refresh-session lifetime. These replace the auth env var
 * JWT_REFRESH_EXPIRES_IN as the source of the refresh lifetime (the access JWT stays
 * JWT_EXPIRES_IN, 15 minutes).
 *
 * - Sliding: every rotation gives the refresh token and its Redis key SESSION_TTL_HOURS more,
 *   so a user who is active at least once in that window stays signed in.
 * - Absolute: no session lives longer than SESSION_ABSOLUTE_DAYS after the sign-in that started
 *   it (originalCreatedAt), however often it refreshes. The sliding TTL is capped by it.
 */
export const SESSION_TTL_HOURS = 12;
export const SESSION_ABSOLUTE_DAYS = 7;
export const SESSION_SLIDING_TTL_SECONDS = SESSION_TTL_HOURS * 3600;
export const SESSION_ABSOLUTE_SECONDS = SESSION_ABSOLUTE_DAYS * 86_400;

/**
 * T-616b — after a refresh token is rotated, a second presentation of the SAME token inside this
 * window gets the same new refresh token back (and a fresh access token) instead of a 401. The
 * old access session key also stays valid for at most this long (or until its JWT expires, if
 * sooner), so requests already in flight with it do not 401.
 */
export const REFRESH_GRACE_SECONDS = 30;

/** T-616b — POST /api/auth/refresh, per user (auth:refresh:user:<uid>), fixed window. */
export const REFRESH_RATE_LIMIT = { max: 60, windowSeconds: 900 } as const;

export const SESSION_TTL = {
  /**
   * Access session key (session:<uid>:<hash>) — fallback only. Since T-616b the key's TTL is the
   * access JWT's real remaining life (JWT_EXPIRES_IN, 15 minutes); this value is used only when
   * that cannot be read. (It was 24 hours, so a key outlived its JWT.)
   */
  ACCESS: 900,
  /** Upper bound on any refresh key (session:refresh:<uid>:<hash>): the absolute ceiling, 7 days. */
  REFRESH: SESSION_ABSOLUTE_SECONDS,
  /** T-616b — a refresh key's TTL per sign-in or rotation (sliding), capped by the ceiling. */
  REFRESH_SLIDING: SESSION_SLIDING_TTL_SECONDS,
  /** T-616b — the rotation grace window, in seconds. */
  GRACE: REFRESH_GRACE_SECONDS,
} as const;

export const RATE_LIMITS = {
  /** Free tier: requests per minute */
  free: 60,
  /** Pro tier: requests per minute */
  pro: 300,
} as const;

/** Build Redis key for an access-token session */
export function sessionKey(userId: string, tokenHash: string): string {
  return `session:${userId}:${tokenHash}`;
}

/**
 * Build Redis key for a refresh-token reverse lookup. T-616b: once that refresh token is rotated,
 * the same key holds its grace record for REFRESH_GRACE_SECONDS, so the `session:refresh:<uid>:*`
 * scans (revoke-all, password change, account erase) cover grace records too.
 */
export function refreshSessionKey(userId: string, refreshHash: string): string {
  return `session:refresh:${userId}:${refreshHash}`;
}

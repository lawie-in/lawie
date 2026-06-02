/** Redis key prefixes and TTL constants for session management + rate limiting */

export const SESSION_TTL = {
  /** Access token session — 24 hours in seconds */
  ACCESS: 86_400,
  /** Refresh token reverse lookup — 7 days in seconds */
  REFRESH: 604_800,
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

/** Build Redis key for a refresh-token reverse lookup */
export function refreshSessionKey(userId: string, refreshHash: string): string {
  return `session:refresh:${userId}:${refreshHash}`;
}

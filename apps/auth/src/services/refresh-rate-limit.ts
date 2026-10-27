/**
 * T-616b (Arjun) — POST /api/auth/refresh limit, per user, the T-507 / T-221 Redis pattern
 * (password-change-rate-limit.ts): a fixed window, INCR then a TTL on the first hit (re-set if a
 * key is ever found without one, so a key can never lock anyone out for good).
 *
 *   auth:refresh:user:<userId>  REFRESH_RATE_LIMIT.max calls per REFRESH_RATE_LIMIT.windowSeconds
 *
 * Every call counts, a grace replay included. The user id comes from the VERIFIED refresh token,
 * so it is checked after verifyRefreshToken and before the token is consumed: a refused call
 * leaves the refresh token usable. A refused call is given back at once, so it never extends or
 * adds to the count. The web client refreshes about once per 14 minutes per browser, so 60 per
 * 15 minutes leaves plenty of room for retries and several devices.
 *
 * The key holds only the user id and a counter. Throws if Redis fails: the caller fails closed
 * (503, nothing consumed or issued).
 */
import { REFRESH_RATE_LIMIT } from '@lawie/shared';
import type Redis from 'ioredis';

export const REFRESH_WINDOW_MS = REFRESH_RATE_LIMIT.windowSeconds * 1000;
export const REFRESH_CAP = REFRESH_RATE_LIMIT.max;

export const refreshUserKey = (userId: string): string => `auth:refresh:user:${userId}`;

export type RefreshReservation = { allowed: true } | { allowed: false; retryAfterSeconds: number };

function toRetrySeconds(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
}

/** Count one refresh call. Allowed while at most REFRESH_CAP calls are counted in the window. */
export async function reserveRefreshAttempt(
  redis: Redis,
  userId: string,
): Promise<RefreshReservation> {
  const key = refreshUserKey(userId);
  const count = await redis.incr(key);
  let pttl = await redis.pttl(key);
  if (count === 1 || pttl < 0) {
    await redis.pexpire(key, REFRESH_WINDOW_MS);
    pttl = REFRESH_WINDOW_MS;
  }
  if (count > REFRESH_CAP) {
    await redis.decr(key);
    return { allowed: false, retryAfterSeconds: toRetrySeconds(pttl) };
  }
  return { allowed: true };
}

/**
 * T-567 item 24 (Ajay) — the signed limit line, copied verbatim from the gateway's
 * rateLimitMessage (apps/gateway/src/middleware/rateLimiter.ts) so a 429 from /refresh reads the
 * same as every other 429. Keep the two in step. {n} is Retry-After rounded up to whole minutes,
 * minimum 1. No upsell.
 */
export const REFRESH_RATE_LIMIT_MESSAGES = {
  minutes: 'Too many requests. Please wait {n} minutes, then try again.',
  oneMinute: 'Too many requests. Please wait 1 minute, then try again.',
  unknown: 'Too many requests. Please wait a few minutes, then try again.',
} as const;

export function refreshRateLimitMessage(retryAfterSeconds: unknown): string {
  if (retryAfterSeconds === undefined || retryAfterSeconds === null || retryAfterSeconds === '') {
    return REFRESH_RATE_LIMIT_MESSAGES.unknown;
  }
  const seconds = Number(retryAfterSeconds);
  if (!Number.isFinite(seconds) || seconds < 0) return REFRESH_RATE_LIMIT_MESSAGES.unknown;
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes === 1) return REFRESH_RATE_LIMIT_MESSAGES.oneMinute;
  return REFRESH_RATE_LIMIT_MESSAGES.minutes.replace('{n}', String(minutes));
}

/** Thrown by refreshTokens when the user is over the limit. The controller answers 429. */
export class RefreshRateLimitedError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super('refresh_rate_limited');
    this.name = 'RefreshRateLimitedError';
  }
}

/** Thrown by refreshTokens when the limiter store failed (fail closed). The controller answers 503. */
export class RefreshLimiterUnavailableError extends Error {
  constructor() {
    super('refresh_limiter_unavailable');
    this.name = 'RefreshLimiterUnavailableError';
  }
}

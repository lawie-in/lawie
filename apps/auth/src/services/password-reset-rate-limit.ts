/**
 * T-221 AC4 — forgot-password rate limit, counted in Redis BEFORE any user lookup, so the answer
 * (200 or 429) never depends on whether the account exists.
 *
 * Fixed windows, keys local to auth:
 *   auth:pwreset:email:<sha256(lower-cased, trimmed email)>  3 per 15 min
 *   auth:pwreset:ip:<ip>                                     10 per 15 min
 *
 * The email key is a hash: no address is ever written to Redis. Every request counts on both
 * keys (INCR, then a TTL is set on the first hit, or re-set if a key is ever found without one,
 * so a key can never lock anyone out for good). Over either cap: refused, with
 * retryAfterSeconds from the remaining TTL of the key(s) that block, rounded up, minimum 1.
 *
 * Throws if Redis fails; the controller fails closed (nothing is looked up or sent).
 */
import crypto from 'crypto';

import type Redis from 'ioredis';

export const PWRESET_WINDOW_MS = 15 * 60 * 1000;
export const PWRESET_EMAIL_CAP = 3;
export const PWRESET_IP_CAP = 10;

export function hashEmailForKey(email: string): string {
  return crypto.createHash('sha256').update(email.trim().toLowerCase(), 'utf8').digest('hex');
}

export const pwresetEmailKey = (email: string): string =>
  `auth:pwreset:email:${hashEmailForKey(email)}`;
export const pwresetIpKey = (ip: string): string => `auth:pwreset:ip:${ip}`;

export type PasswordResetRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/** INCR the key, make sure it has a TTL, and return [count, remaining ms]. */
async function hit(redis: Redis, key: string): Promise<[number, number]> {
  const count = await redis.incr(key);
  let pttl = await redis.pttl(key);
  if (count === 1 || pttl < 0) {
    await redis.pexpire(key, PWRESET_WINDOW_MS);
    pttl = PWRESET_WINDOW_MS;
  }
  return [count, pttl];
}

function toRetrySeconds(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
}

/**
 * Counts one forgot-password request for this email and IP. The IP may be undefined (no socket
 * address); then only the email key is counted.
 */
export async function consumePasswordResetQuota(
  redis: Redis,
  email: string,
  ip: string | undefined,
): Promise<PasswordResetRateLimitResult> {
  const [emailCount, emailTtl] = await hit(redis, pwresetEmailKey(email));
  let blockMs = emailCount > PWRESET_EMAIL_CAP ? emailTtl : 0;

  if (ip) {
    const [ipCount, ipTtl] = await hit(redis, pwresetIpKey(ip));
    if (ipCount > PWRESET_IP_CAP) blockMs = Math.max(blockMs, ipTtl);
  }

  if (blockMs > 0) return { allowed: false, retryAfterSeconds: toRetrySeconds(blockMs) };
  return { allowed: true };
}

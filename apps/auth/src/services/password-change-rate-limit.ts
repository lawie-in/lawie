/**
 * T-507 (Arjun's ruling) — POST /me/password limit, per user, the T-221 Redis pattern
 * (password-reset-rate-limit.ts): a fixed window, INCR then a TTL on the first hit (re-set if a
 * key is ever found without one, so a key can never lock anyone out for good).
 *
 *   auth:pwchange:user:<userId>  5 FAILED attempts (wrong current password) per 15 min
 *
 * Only failures count. To stay correct under parallel requests the attempt is RESERVED first
 * (INCR, before the bcrypt compare) and then settled: a wrong password keeps the hit, a successful
 * change clears the key, any other outcome (weak/Google-only/inactive/…) gives the hit back. So
 * five parallel guesses can never become more than five compares in one window.
 *
 * The key holds only the user id and a counter. Throws if Redis fails: the caller fails closed
 * (503, nothing changed).
 */
import type Redis from 'ioredis';

export const PWCHANGE_WINDOW_MS = 15 * 60 * 1000;
export const PWCHANGE_FAILURE_CAP = 5;

export const pwchangeUserKey = (userId: string): string => `auth:pwchange:user:${userId}`;

export type PasswordChangeReservation =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

function toRetrySeconds(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
}

/**
 * Reserve one attempt. Allowed while fewer than PWCHANGE_FAILURE_CAP failures are counted in the
 * window (this attempt included). A refused attempt is given back at once, so it never extends or
 * adds to the count.
 */
export async function reservePasswordChangeAttempt(
  redis: Redis,
  userId: string,
): Promise<PasswordChangeReservation> {
  const key = pwchangeUserKey(userId);
  const count = await redis.incr(key);
  let pttl = await redis.pttl(key);
  if (count === 1 || pttl < 0) {
    await redis.pexpire(key, PWCHANGE_WINDOW_MS);
    pttl = PWCHANGE_WINDOW_MS;
  }
  if (count > PWCHANGE_FAILURE_CAP) {
    await redis.decr(key);
    return { allowed: false, retryAfterSeconds: toRetrySeconds(pttl) };
  }
  return { allowed: true };
}

/** The attempt was not a failure (not a wrong password): give the reserved hit back. */
export async function releasePasswordChangeAttempt(redis: Redis, userId: string): Promise<void> {
  const key = pwchangeUserKey(userId);
  // The window may have expired meanwhile: never leave a negative, TTL-less counter behind.
  if ((await redis.decr(key)) <= 0) await redis.del(key);
}

/** The password was changed: the failure count starts again from zero. */
export async function resetPasswordChangeFailures(redis: Redis, userId: string): Promise<void> {
  await redis.del(pwchangeUserKey(userId));
}

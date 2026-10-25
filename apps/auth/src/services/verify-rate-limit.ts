/**
 * T-223 (Arjun, condition 4; promised to AWS in the SES production-access case): at most one
 * verify email per user per interval and five per 24 h, counted in Redis at the enqueue site.
 * T-522 (Arjun, 22 Oct 2026): the interval is now 2 minutes (was 60 s), still five per day. The
 * key name keeps its T-223 "min" segment, so keys already in Redis keep counting.
 *
 * Keys are local to auth and hold no PII (userId only):
 *   auth:verify-email:min:<userId>  "1", PX 120 000       (one per 2 min; SET NX claims it)
 *   auth:verify-email:day:<userId>  counter, PX 86 400 000 (fixed 24 h window from the first send)
 *
 * Order: read the day count, then claim the minute key with SET NX, then INCR the day counter.
 * Every INCR needs a won minute key, so two concurrent requests cannot both count, and the day
 * count cannot pass the cap. A day key left without a TTL is given one, so it can never lock a
 * user out for good.
 *
 * retryAfterSeconds comes from the blocking key's remaining TTL, rounded up, minimum 1.
 */
import type Redis from 'ioredis';

export const VERIFY_EMAIL_MIN_INTERVAL_MS = 2 * 60 * 1000;
export const VERIFY_EMAIL_DAY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const VERIFY_EMAIL_DAY_CAP = 5;

const minuteKey = (userId: string) => `auth:verify-email:min:${userId}`;
const dayKey = (userId: string) => `auth:verify-email:day:${userId}`;

export type VerifyRateLimitResult =
  | { allowed: true }
  | { allowed: false; reason: 'minute' | 'day'; retryAfterSeconds: number };

function toRetrySeconds(pttl: number, fallbackMs: number): number {
  const ms = pttl > 0 ? pttl : fallbackMs;
  return Math.max(1, Math.ceil(ms / 1000));
}

/**
 * Claims one verify-email send for userId, or says when the next one is allowed.
 * Throws if Redis fails; the caller decides (requestVerifyEmail fails closed: nothing is sent).
 */
export async function consumeVerifyEmailQuota(
  redis: Redis,
  userId: string,
): Promise<VerifyRateLimitResult> {
  const dKey = dayKey(userId);
  const mKey = minuteKey(userId);

  const dayCount = Number((await redis.get(dKey)) ?? '0');
  if (dayCount >= VERIFY_EMAIL_DAY_CAP) {
    const pttl = await redis.pttl(dKey);
    if (pttl < 0) await redis.pexpire(dKey, VERIFY_EMAIL_DAY_WINDOW_MS);
    return {
      allowed: false,
      reason: 'day',
      retryAfterSeconds: toRetrySeconds(pttl, VERIFY_EMAIL_DAY_WINDOW_MS),
    };
  }

  const claimed = await redis.set(mKey, '1', 'PX', VERIFY_EMAIL_MIN_INTERVAL_MS, 'NX');
  if (claimed !== 'OK') {
    const pttl = await redis.pttl(mKey);
    return {
      allowed: false,
      reason: 'minute',
      retryAfterSeconds: toRetrySeconds(pttl, VERIFY_EMAIL_MIN_INTERVAL_MS),
    };
  }

  await redis.incr(dKey);
  if ((await redis.pttl(dKey)) < 0) await redis.pexpire(dKey, VERIFY_EMAIL_DAY_WINDOW_MS);
  return { allowed: true };
}

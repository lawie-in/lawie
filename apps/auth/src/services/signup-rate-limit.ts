/**
 * T-522 (Arjun ruling 3, 22 Oct 2026) — sign-up throttle, on the T-221 pattern
 * (password-reset-rate-limit.ts). Counted in Redis BEFORE any user lookup, so a new and an
 * existing address hit the limit the same way and the 429 tells nothing about the account.
 *
 * Fixed windows, keys local to auth, no address in Redis (the email is a sha256):
 *   auth:signup:ip:<ip>                 20 per hour  -> 429 rate_limited + Retry-After
 *   auth:signup:email:<sha256(email)>   5 per hour   -> 429 rate_limited + Retry-After
 *   auth:signup-attempt:<sha256(email)> SET NX EX 3600: at most one existing-address (M5) mail
 *                                       per address per hour; over it, silent (202, no mail)
 *
 * POST /register and the public POST /verify-email/resend-by-email share the IP and email
 * buckets (Arjun ruling 5).
 *
 * consumeSignupQuota throws if Redis fails; the caller fails closed (503, nothing looked up).
 * claimSignupAttemptMail never throws: a store failure means "send nothing" (never mail-bomb).
 */
import type Redis from 'ioredis';

import { hashEmailForKey } from './password-reset-rate-limit';

export const SIGNUP_WINDOW_MS = 60 * 60 * 1000;
export const SIGNUP_IP_CAP = 20;
export const SIGNUP_EMAIL_CAP = 5;
export const SIGNUP_ATTEMPT_MAIL_WINDOW_SECONDS = 60 * 60;

export const signupIpKey = (ip: string): string => `auth:signup:ip:${ip}`;
export const signupEmailKey = (email: string): string =>
  `auth:signup:email:${hashEmailForKey(email)}`;
export const signupAttemptMailKey = (email: string): string =>
  `auth:signup-attempt:${hashEmailForKey(email)}`;

export type SignupRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/** INCR the key, make sure it has a TTL, and return [count, remaining ms]. */
async function hit(redis: Redis, key: string): Promise<[number, number]> {
  const count = await redis.incr(key);
  let pttl = await redis.pttl(key);
  if (count === 1 || pttl < 0) {
    await redis.pexpire(key, SIGNUP_WINDOW_MS);
    pttl = SIGNUP_WINDOW_MS;
  }
  return [count, pttl];
}

function toRetrySeconds(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
}

/**
 * Counts one sign-up (or signed-out resend) request for this email and IP, before any lookup.
 * The IP may be undefined (no socket address); then only the email key is counted.
 */
export async function consumeSignupQuota(
  redis: Redis,
  email: string,
  ip: string | undefined,
): Promise<SignupRateLimitResult> {
  const [emailCount, emailTtl] = await hit(redis, signupEmailKey(email));
  let blockMs = emailCount > SIGNUP_EMAIL_CAP ? emailTtl : 0;

  if (ip) {
    const [ipCount, ipTtl] = await hit(redis, signupIpKey(ip));
    if (ipCount > SIGNUP_IP_CAP) blockMs = Math.max(blockMs, ipTtl);
  }

  if (blockMs > 0) return { allowed: false, retryAfterSeconds: toRetrySeconds(blockMs) };
  return { allowed: true };
}

/**
 * Claims the one existing-address mail for this address this hour. True only when this call set
 * the key. False when it is already set, or when the store fails (then nothing is sent).
 */
export async function claimSignupAttemptMail(redis: Redis, email: string): Promise<boolean> {
  try {
    const res = await redis.set(
      signupAttemptMailKey(email),
      '1',
      'EX',
      SIGNUP_ATTEMPT_MAIL_WINDOW_SECONDS,
      'NX',
    );
    return res === 'OK';
  } catch {
    return false;
  }
}

/**
 * T-563 (Arjun's ruling, reconciled with Ajay's AJ-563, 22 Oct 2026) — the develop-only test
 * sign-up bypass. A deliberate back door in a deliberate cage:
 *
 *  - Only POST /auth/register, only when TEST_SIGNUP_BYPASS is 'true', TEST_SIGNUP_BYPASS_SECRET
 *    is configured, and the request carries `bypass-test: true`. Otherwise nothing here runs and
 *    the request is an ordinary sign-up (T-522's neutral path), with no log and no count.
 *  - The `bypass-password` header is compared with crypto.timingSafeEqual on SHA-256 digests.
 *    Wrong or missing: an ordinary sign-up (nothing distinguishes the outcome) plus exactly one
 *    warn 'test_signup_rejected' carrying an IP hash only. Over 5 rejections an hour from one IP:
 *    the ordinary 429.
 *  - Right secret: the email must be on a reserved test domain (@example.com, @example.org,
 *    *.test), otherwise an ordinary sign-up; the name must start with TEST, otherwise 400. Then
 *    20 accepted per IP per day (429) and at most 200 test accounts (409 test_accounts_cap).
 *  - The account: verified, isTestAccount, consent with acceptedVia 'test' and termsVersion
 *    TEST_CONSENT_VERSION (privacy at the current version so requireCurrentPrivacy passes), no
 *    referral, no sign-up source, 30 Ink once (grantTestInk), no mail, then a signed-in session.
 *
 * Never logs the secret, the supplied value, an email, a name or a raw IP. Redis keys hold an
 * IP hash only.
 */
import crypto from 'crypto';

import { TEST_CONSENT_VERSION, isReservedTestEmail, isTestAccountName } from '@lawie/shared';
import type Redis from 'ioredis';
import mongoose from 'mongoose';

import { env } from '../config/env';
import logger from '../config/logger';
import redisClient from '../config/redis';
import { IUser, User, privacySignupAcceptance } from '../models/User.model';

import { isDuplicateEmailError, startSignedInSession } from './auth.service';
import { grantTestInk } from './credit-bonus.service';
import type { SessionMeta } from './session.service';

export const TEST_BYPASS_FLAG_HEADER = 'bypass-test';
export const TEST_BYPASS_SECRET_HEADER = 'bypass-password';

const HOUR_MS = 60 * 60 * 1000;
export const TEST_SIGNUP_REJECT_WINDOW_MS = HOUR_MS;
export const TEST_SIGNUP_REJECT_IP_CAP = 5;
export const TEST_SIGNUP_ACCEPT_WINDOW_MS = 24 * HOUR_MS;
export const TEST_SIGNUP_ACCEPT_IP_CAP = 20;
export const TEST_ACCOUNT_LIVE_CAP = 200;
export const TEST_ACCOUNTS_CAP_ERROR = 'test_accounts_cap';
export const TEST_SIGNUP_BAD_NAME_ERROR = 'invalid_test_name';

/** IP hash for logs and Redis keys: never the raw address. */
export function hashIpForTestSignup(ip: string | undefined): string {
  return crypto
    .createHash('sha256')
    .update(ip ?? 'no-ip', 'utf8')
    .digest('hex')
    .slice(0, 16);
}

export const testSignupRejectKey = (ipHash: string): string =>
  `auth:test-signup:rejected:${ipHash}`;
export const testSignupAcceptKey = (ipHash: string): string =>
  `auth:test-signup:accepted:${ipHash}`;

/**
 * Constant-time: both sides hashed to 32 bytes with SHA-256 first, so neither the value nor its
 * length leaks. False for a missing, non-string or empty value, or no configured secret.
 */
export function testBypassSecretMatches(
  provided: unknown,
  configured: string | undefined,
): boolean {
  if (typeof provided !== 'string' || provided.length === 0) return false;
  if (typeof configured !== 'string' || configured.length === 0) return false;
  const a = crypto.createHash('sha256').update(provided, 'utf8').digest();
  const b = crypto.createHash('sha256').update(configured, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

export type TestSignupOutcome =
  /** Not a test sign-up (or refused silently): the caller runs the ordinary sign-up. */
  | { kind: 'not_applied' }
  /** The test account was made. 201 with the login-shaped body. */
  | {
      kind: 'created';
      user: IUser;
      tokens: { accessToken: string; refreshToken: string };
    }
  /** Right secret, name does not start with TEST. 400. */
  | { kind: 'bad_name' }
  /** Over a bypass rate limit. The ordinary 429 + Retry-After. */
  | { kind: 'limited'; retryAfterSeconds: number }
  /** TEST_ACCOUNT_LIVE_CAP test accounts exist. 409 test_accounts_cap. */
  | { kind: 'cap' }
  /** The rate-limit store failed on the accepted path. 503. */
  | { kind: 'unavailable' };

export interface TestSignupRequest {
  headers: Record<string, string | string[] | undefined>;
  ip: string | undefined;
  meta: SessionMeta;
}

export interface TestSignupDeps {
  redis: Redis;
  enabled: boolean;
  secret: string | undefined;
}

function defaultDeps(): TestSignupDeps {
  return {
    redis: redisClient,
    enabled: env.TEST_SIGNUP_BYPASS === true,
    secret: env.TEST_SIGNUP_BYPASS_SECRET,
  };
}

function headerValue(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** INCR with a fixed window; returns [count, remaining ms]. Throws if Redis fails. */
async function hit(redis: Redis, key: string, windowMs: number): Promise<[number, number]> {
  const count = await redis.incr(key);
  let pttl = await redis.pttl(key);
  if (count === 1 || pttl < 0) {
    await redis.pexpire(key, windowMs);
    pttl = windowMs;
  }
  return [count, pttl];
}

const toRetrySeconds = (ms: number): number => Math.max(1, Math.ceil(ms / 1000));

/** Is this user a test account? For the internal mail routes (Arjun default 6). */
export async function isTestAccountUser(userId: string): Promise<boolean> {
  if (!mongoose.Types.ObjectId.isValid(userId)) return false;
  const found = await User.exists({ _id: userId, isTestAccount: true });
  return found !== null;
}

/**
 * The bypass branch of POST /register, run after validateRegister and before registerUser.
 * Never throws for a refusal; a database error on create propagates like registerUser's.
 */
export async function tryTestSignupBypass(
  payload: { email: string; password: string; name: string },
  req: TestSignupRequest,
  overrides: Partial<TestSignupDeps> = {},
): Promise<TestSignupOutcome> {
  const deps = { ...defaultDeps(), ...overrides };
  if (!deps.enabled || !deps.secret) return { kind: 'not_applied' };
  if (headerValue(req.headers[TEST_BYPASS_FLAG_HEADER]) !== 'true') return { kind: 'not_applied' };

  const ipHash = hashIpForTestSignup(req.ip);

  if (!testBypassSecretMatches(headerValue(req.headers[TEST_BYPASS_SECRET_HEADER]), deps.secret)) {
    logger.warn({ ipHash }, 'test_signup_rejected');
    try {
      const [count, ttl] = await hit(
        deps.redis,
        testSignupRejectKey(ipHash),
        TEST_SIGNUP_REJECT_WINDOW_MS,
      );
      if (count > TEST_SIGNUP_REJECT_IP_CAP) {
        return { kind: 'limited', retryAfterSeconds: toRetrySeconds(ttl) };
      }
    } catch {
      // Store down: the ordinary sign-up's own limiter fails closed (503).
    }
    return { kind: 'not_applied' };
  }

  // Reserved test domains only (AJ-563-M2, Arjun reconciled 1): any other address is an
  // ordinary sign-up, so no verified account can sit in a real inbox.
  if (!isReservedTestEmail(payload.email)) return { kind: 'not_applied' };
  if (!isTestAccountName(payload.name)) return { kind: 'bad_name' };

  try {
    const [count, ttl] = await hit(
      deps.redis,
      testSignupAcceptKey(ipHash),
      TEST_SIGNUP_ACCEPT_WINDOW_MS,
    );
    if (count > TEST_SIGNUP_ACCEPT_IP_CAP) {
      return { kind: 'limited', retryAfterSeconds: toRetrySeconds(ttl) };
    }
  } catch {
    return { kind: 'unavailable' };
  }

  const live = await User.countDocuments({ isTestAccount: true });
  if (live >= TEST_ACCOUNT_LIVE_CAP) {
    logger.warn({ ipHash, live }, 'test_signup_cap_reached');
    return { kind: 'cap' };
  }

  const email = payload.email.toLowerCase();
  if (await User.exists({ email })) return { kind: 'not_applied' };

  const acceptedAt = new Date();
  let user: IUser;
  try {
    user = await User.create({
      email,
      password: payload.password,
      name: payload.name,
      role: 'Lawyer',
      emailVerified: true,
      isTestAccount: true,
      // AJ-563-M1a / Arjun default 1: consent is recorded, as test consent.
      termsAcceptedAt: acceptedAt,
      termsVersion: TEST_CONSENT_VERSION,
      acceptedVia: 'test',
      ...privacySignupAcceptance(acceptedAt),
    });
  } catch (err) {
    if (isDuplicateEmailError(err)) return { kind: 'not_applied' };
    throw err;
  }

  const userId = user._id.toString();
  const granted = await grantTestInk(userId);
  const fresh = (await User.findById(userId)) ?? user;
  const tokens = await startSignedInSession(fresh, req.meta);
  logger.info({ userId, ipHash, inkGranted: granted }, 'test_signup_created');
  return { kind: 'created', user: fresh, tokens };
}

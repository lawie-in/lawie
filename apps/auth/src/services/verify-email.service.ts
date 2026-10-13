/**
 * T-223 — email verification (option B). All the logic lives here so the routes and the
 * register / resend / verify handlers only need thin wiring.
 *
 * Flow:
 *  1. Sign-up or resend calls requestVerifyEmail(userId): resend cap (1/60 s, 5/24 h, Redis),
 *     then enqueue { template: 'auth.verifyEmail', userId } through @lawie/email-client. The job
 *     carries the userId only. The email client keeps at most one pending verify job per user
 *     (T-390): a resend while the user's job is still waiting (e.g. held by the worker, T-379) or
 *     being sent is dropped, so the user gets one email whose link works. Once that job has
 *     finished, a resend queues a new one. The cap below is still consumed by a dropped resend.
 *  2. The email worker calls POST /internal/verify-email/mint, which calls mintVerifyLink(userId):
 *     a fresh random token, sha256(token) + 24 h expiry stored on the user (replacing any older
 *     link, so the newest link wins, including on a BullMQ retry), and { email, name, link }
 *     returned. Refused (nothing minted) for a verified or Google account.
 *  3. Opening the link calls verifyEmailToken(token): sha256 lookup with an unexpired expiry,
 *     sets emailVerified, clears the hash and expiry (single use), then grantSignupBonus once.
 *
 * Only the hash is stored. The token and the link exist only in the mint response and the
 * email. Nothing here logs an address, a name, a token, a hash or a link: userId only.
 */
import crypto from 'crypto';

import { enqueueEmail } from '@lawie/email-client';
import type Redis from 'ioredis';
import mongoose from 'mongoose';

import { env } from '../config/env';
import logger from '../config/logger';
import redisClient from '../config/redis';
import { User } from '../models/User.model';

import { grantSignupBonus } from './credit-bonus.service';
import { consumeVerifyEmailQuota } from './verify-rate-limit';

/** Link lifetime: 24 hours (signed copy: "expires in 24 hours"). */
export const VERIFY_LINK_TTL_MS = 24 * 60 * 60 * 1000;

/** Fixed message for a resend over the cap (Arjun, condition 4). The web app adds the wait. */
export const VERIFY_RESEND_LIMIT_MESSAGE =
  'Too many verification emails. Please wait before asking for another one.';

/** Error code for a resend over the cap; the 429 body carries it with retryAfter. */
export const VERIFY_RESEND_LIMITED = 'verify_email_rate_limited';

/** Error class name only (never the message, which can echo values), for logs. */
function errorKind(err: unknown): string {
  const kind = err instanceof Error ? err.constructor?.name : undefined;
  return typeof kind === 'string' && kind ? kind : 'Error';
}

/** 32 random bytes, hex: 64 chars. Anything else cannot be one of our tokens. */
const TOKEN_RE = /^[a-f0-9]{64}$/;

export function hashVerifyToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** `${FRONTEND_URL}/verify-email?token=<token>`: the token in the query, never a path segment. */
export function buildVerifyLink(token: string): string {
  const base = env.FRONTEND_URL.replace(/\/+$/, '');
  return `${base}/verify-email?token=${encodeURIComponent(token)}`;
}

/**
 * Filter for "needs verifying": the negation of VERIFIED_FOR_BONUS in credit-bonus.service.ts
 * (T-351). An email user whose address is not verified and who has no linked Google account.
 */
const NOT_YET_VERIFIED = {
  emailVerified: { $ne: true },
  authProvider: { $ne: 'google' },
  $or: [{ googleId: { $exists: false } }, { googleId: { $in: [null, ''] } }],
};

// ── Mint (internal route, called by the email worker) ───────────────────────

export type MintVerifyLinkResult =
  | { kind: 'minted'; email: string; name: string; link: string }
  /** Already verified, a Google account, or deactivated: 409, nothing minted. */
  | { kind: 'not_eligible' }
  /** No such user (or not an ObjectId): 404, nothing minted. */
  | { kind: 'not_found' };

/**
 * Mints a fresh link for userId and stores only its hash. Replaces any earlier link in the same
 * atomic write that checks eligibility, so a user who became verified in between gets nothing.
 * The result carries PII and a live credential: callers must never log it.
 */
export async function mintVerifyLink(userId: string): Promise<MintVerifyLinkResult> {
  if (!mongoose.Types.ObjectId.isValid(userId)) return { kind: 'not_found' };
  const _id = new mongoose.Types.ObjectId(userId);

  const token = crypto.randomBytes(32).toString('hex');
  const updated = await User.findOneAndUpdate(
    { _id, isActive: { $ne: false }, ...NOT_YET_VERIFIED },
    {
      $set: {
        emailVerifyTokenHash: hashVerifyToken(token),
        emailVerifyExpires: new Date(Date.now() + VERIFY_LINK_TTL_MS),
      },
    },
    { new: true, projection: { email: 1, name: 1 } },
  ).lean();

  if (!updated) {
    const exists = await User.exists({ _id });
    const kind = exists ? 'not_eligible' : 'not_found';
    logger.info({ userId, outcome: kind }, 'Verify link not minted');
    return { kind };
  }

  logger.info({ userId }, 'Verify link minted');
  return {
    kind: 'minted',
    email: updated.email,
    name: typeof updated.name === 'string' ? updated.name : '',
    link: buildVerifyLink(token),
  };
}

// ── Verify (public POST /verify-email, phase 2) ─────────────────────────────

export type VerifyEmailTokenResult =
  | { kind: 'verified'; userId: string }
  | { kind: 'already_verified'; userId: string }
  | { kind: 'expired_or_invalid' };

/**
 * Consumes a verify token. A valid, unexpired token sets emailVerified = true, clears the hash
 * and expiry (single use) in the same write, then calls grantSignupBonus once (its
 * signupBonusGrantedAt guard makes a repeat call a no-op; it never throws).
 *
 * 'already_verified' vs 'expired_or_invalid' (T-223 AC2): a used token is cleared on use, so
 * once used it cannot be told apart from a forged one without keeping a marker of spent tokens,
 * which this deliberately does not do. A token that matches no live link is therefore always
 * 'expired_or_invalid' (the page shows "expired" plus resend). 'already_verified' is returned
 * only when a live link is found on a user who is already verified (e.g. verified some other
 * way since it was minted); that link is cleared too. A signed-in user who clicks an old link
 * after verifying sees "already verified" from /me on the web page (phase 3), not from here.
 */
export async function verifyEmailToken(token: unknown): Promise<VerifyEmailTokenResult> {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) return { kind: 'expired_or_invalid' };
  const hash = hashVerifyToken(token);
  // isActive as in mintVerifyLink: a deactivated account's old link verifies nothing and grants
  // no bonus; it reads as expired_or_invalid.
  const live = {
    emailVerifyTokenHash: hash,
    emailVerifyExpires: { $gt: new Date() },
    isActive: { $ne: false },
  };
  const clearLink = { $unset: { emailVerifyTokenHash: 1, emailVerifyExpires: 1 } };

  const verified = await User.findOneAndUpdate(
    { ...live, emailVerified: { $ne: true } },
    { $set: { emailVerified: true }, ...clearLink },
    { new: true, projection: { _id: 1 } },
  ).lean();

  if (verified) {
    const userId = verified._id.toString();
    await grantSignupBonus(userId);
    logger.info({ userId }, 'Email verified');
    return { kind: 'verified', userId };
  }

  const already = await User.findOneAndUpdate({ ...live, emailVerified: true }, clearLink, {
    new: true,
    projection: { _id: 1 },
  }).lean();
  if (already) {
    const userId = already._id.toString();
    logger.info({ userId }, 'Verify link used on an already verified account');
    return { kind: 'already_verified', userId };
  }

  return { kind: 'expired_or_invalid' };
}

// ── Request (register and resend, phase 2) ──────────────────────────────────

export type RequestVerifyEmailResult =
  | { kind: 'queued' }
  /** Over 1/60 s or 5/24 h. Nothing sent. Respond 429 with retryAfterSeconds. */
  | { kind: 'limited'; retryAfterSeconds: number }
  /** Verified email, or a Google account: nothing to send. */
  | { kind: 'already_verified' }
  | { kind: 'not_found' }
  /** The rate-limit store failed: fail closed, nothing sent. */
  | { kind: 'unavailable' };

/**
 * Applies the resend cap, then queues the verify email (userId only). Used by register and by
 * the resend route. The enqueue is fire-and-forget (email-client contract: never block the
 * request path); a failed push is logged with the userId only and the user can resend.
 * Not every call adds a job: the email client drops it when the user already has a verify job
 * pending (T-390), and this still returns 'queued' because that pending job will send.
 * A refused call (verified, Google, unknown user) does not use up the cap.
 */
export async function requestVerifyEmail(
  userId: string,
  redis: Redis = redisClient,
): Promise<RequestVerifyEmailResult> {
  if (!mongoose.Types.ObjectId.isValid(userId)) return { kind: 'not_found' };
  const _id = new mongoose.Types.ObjectId(userId);

  const user = await User.findById(_id, { emailVerified: 1, authProvider: 1, googleId: 1 }).lean();
  if (!user) return { kind: 'not_found' };
  // Same rule as NOT_YET_VERIFIED / VERIFIED_FOR_BONUS (T-351).
  const verified =
    user.emailVerified === true ||
    user.authProvider === 'google' ||
    (typeof user.googleId === 'string' && user.googleId.length > 0);
  if (verified) return { kind: 'already_verified' };

  let quota;
  try {
    quota = await consumeVerifyEmailQuota(redis, userId);
  } catch (err) {
    const errKind = errorKind(err);
    logger.warn({ userId, errKind }, 'Verify email not queued: rate-limit store unavailable');
    return { kind: 'unavailable' };
  }
  if (!quota.allowed) {
    logger.info(
      { userId, limit: quota.reason, retryAfterSeconds: quota.retryAfterSeconds },
      'Verify email not queued: resend limit',
    );
    return { kind: 'limited', retryAfterSeconds: quota.retryAfterSeconds };
  }

  void enqueueEmail({ template: 'auth.verifyEmail', userId }).catch((err: unknown) => {
    const errKind = errorKind(err);
    logger.error({ userId, errKind }, 'Verify email enqueue failed');
  });
  return { kind: 'queued' };
}

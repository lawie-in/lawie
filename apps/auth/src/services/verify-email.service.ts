/**
 * T-223 — email verification (option B). All the logic lives here so the routes and the
 * register / resend / verify handlers only need thin wiring.
 *
 * Flow:
 * T-522 (Arjun ruling 1, 22 Oct 2026): every link has a kind. 'signin' (the sign-up link and both
 * resends): 30 minutes, single use, and POST /verify-email also signs the user in. 'verify' (the
 * T-358 notice): verifies only. A missing or unknown kind is 'verify', which is also the mint
 * route's default; the worker asks for 'signin' for the verify mail. Kind, hash and expiry are
 * written in one atomic step and cleared together. Only the POST uses a token up.
 *
 *  1. Sign-up or resend calls requestVerifyEmail(userId): resend cap (1/2 min, 5/24 h, Redis),
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
import { isVerified } from '@lawie/shared';
import type Redis from 'ioredis';
import mongoose from 'mongoose';

import { env } from '../config/env';
import logger from '../config/logger';
import redisClient from '../config/redis';
import { User } from '../models/User.model';

import { grantSignupBonus } from './credit-bonus.service';
import { grantDeferredReferralInk } from './referral.service';
import { consumeVerifyEmailQuota } from './verify-rate-limit';

/**
 * Default lifetime of a 'verify'-kind link minted without its own ttlMs (T-223's 24 hours). The
 * T-358 notice passes its own 7 days. The verify MAIL no longer uses this: it asks for a
 * 'signin' link (SIGNIN_LINK_TTL_MS).
 */
export const VERIFY_LINK_TTL_MS = 24 * 60 * 60 * 1000;

/** T-522 (Arjun ruling 1; AJ-522-M1(b), M8 "expires in 30 minutes"): a 'signin' link's lifetime. */
export const SIGNIN_LINK_TTL_MS = 30 * 60 * 1000;

/** T-522: what a link does. Anything other than 'signin' is treated as 'verify'. */
export type VerifyLinkKind = 'signin' | 'verify';

/** T-522: a stored or requested kind, normalised. Missing or unknown means 'verify'. */
export function normaliseLinkKind(kind: unknown): VerifyLinkKind {
  return kind === 'signin' ? 'signin' : 'verify';
}

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
 * Exported for T-358 (the unverified sweep's definition of "unverified", Arjun ruling 5). It has
 * a top-level $or: combine it with other filters under $and, never by spreading next to another
 * $or.
 */
export const NOT_YET_VERIFIED = {
  emailVerified: { $ne: true },
  authProvider: { $ne: 'google' },
  $or: [{ googleId: { $exists: false } }, { googleId: { $in: [null, ''] } }],
};

// ── Mint (internal route, called by the email worker) ───────────────────────

export type MintVerifyLinkResult =
  | {
      kind: 'minted';
      email: string;
      name: string;
      link: string;
      /** T-522 (AJ-522-M8): the sign-up Ink was already granted (signupBonusGrantedAt set). */
      signupInkGranted: boolean;
    }
  /** Already verified, a Google account, or deactivated: 409, nothing minted. */
  | { kind: 'not_eligible' }
  /** No such user (or not an ObjectId): 404, nothing minted. */
  | { kind: 'not_found' };

export interface MintVerifyLinkOptions {
  /**
   * T-358: replaces the default `isActive: { $ne: false }` condition. The deletion notice
   * passes its own eligibility (unverified sweep filter, which includes deactivated accounts).
   * NOT_YET_VERIFIED is always applied as well.
   */
  eligibility?: Record<string, unknown>;
  /**
   * T-358 (Arjun 23:32, Ajay §9): link lifetime. Defaults to VERIFY_LINK_TTL_MS (24 h, T-223);
   * the deletion notice passes 7 days to match its promise. Ignored for a 'signin' link, which
   * always lasts SIGNIN_LINK_TTL_MS (T-522).
   */
  ttlMs?: number;
  /** T-522: 'signin' or 'verify' (the default: a missing kind is never a sign-in link). */
  linkKind?: VerifyLinkKind;
}

/**
 * Mints a fresh link for userId and stores only its hash. Replaces any earlier link in the same
 * atomic write that checks eligibility, so a user who became verified in between gets nothing.
 * The result carries PII and a live credential: callers must never log it.
 */
export async function mintVerifyLink(
  userId: string,
  opts: MintVerifyLinkOptions = {},
): Promise<MintVerifyLinkResult> {
  if (!mongoose.Types.ObjectId.isValid(userId)) return { kind: 'not_found' };
  const _id = new mongoose.Types.ObjectId(userId);
  const eligibility = opts.eligibility ?? { isActive: { $ne: false } };

  const linkKind = normaliseLinkKind(opts.linkKind);
  const ttlMs = linkKind === 'signin' ? SIGNIN_LINK_TTL_MS : (opts.ttlMs ?? VERIFY_LINK_TTL_MS);

  const token = crypto.randomBytes(32).toString('hex');
  // T-522: kind, hash and expiry in the same atomic write; the newest link (and its kind) wins.
  const updated = await User.findOneAndUpdate(
    { _id, $and: [eligibility, NOT_YET_VERIFIED] },
    {
      $set: {
        emailVerifyTokenHash: hashVerifyToken(token),
        emailVerifyExpires: new Date(Date.now() + ttlMs),
        emailVerifyKind: linkKind,
      },
    },
    { new: true, projection: { email: 1, name: 1, signupBonusGrantedAt: 1 } },
  ).lean();

  if (!updated) {
    const exists = await User.exists({ _id });
    const kind = exists ? 'not_eligible' : 'not_found';
    logger.info({ userId, outcome: kind }, 'Verify link not minted');
    return { kind };
  }

  logger.info({ userId, linkKind }, 'Verify link minted');
  return {
    kind: 'minted',
    email: updated.email,
    name: typeof updated.name === 'string' ? updated.name : '',
    link: buildVerifyLink(token),
    signupInkGranted:
      updated.signupBonusGrantedAt !== null && updated.signupBonusGrantedAt !== undefined,
  };
}

// ── Verify (public POST /verify-email, phase 2) ─────────────────────────────

export type VerifyEmailTokenResult =
  /** linkKind (T-522): 'signin' means the caller signs the user in; 'verify' means it does not. */
  | { kind: 'verified'; userId: string; linkKind: VerifyLinkKind }
  | { kind: 'already_verified'; userId: string; linkKind: VerifyLinkKind }
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
  // T-522: the kind is cleared with the hash and expiry, in the same write (single use).
  const clearLink = {
    $unset: { emailVerifyTokenHash: 1, emailVerifyExpires: 1, emailVerifyKind: 1 },
  };

  // new: false, so the returned document still carries the kind the link had before the clear.
  const verified = await User.findOneAndUpdate(
    { ...live, emailVerified: { $ne: true } },
    { $set: { emailVerified: true }, ...clearLink },
    { new: false, projection: { _id: 1, emailVerifyKind: 1 } },
  ).lean();

  if (verified) {
    const userId = verified._id.toString();
    const linkKind = normaliseLinkKind(verified.emailVerifyKind);
    await grantSignupBonus(userId);
    // T-522 (Arjun ruling 2): the referral Ink recorded at sign-up is granted now, after the
    // sign-up bonus. grantReferralInk is fenced and idempotent; this never throws.
    await grantDeferredReferralInk(userId);
    logger.info({ userId, linkKind }, 'Email verified');
    return { kind: 'verified', userId, linkKind };
  }

  const already = await User.findOneAndUpdate({ ...live, emailVerified: true }, clearLink, {
    new: false,
    projection: { _id: 1, emailVerifyKind: 1 },
  }).lean();
  if (already) {
    const userId = already._id.toString();
    const linkKind = normaliseLinkKind(already.emailVerifyKind);
    logger.info({ userId, linkKind }, 'Verify link used on an already verified account');
    return { kind: 'already_verified', userId, linkKind };
  }

  return { kind: 'expired_or_invalid' };
}

// ── Request (register and resend, phase 2) ──────────────────────────────────

export type RequestVerifyEmailResult =
  | { kind: 'queued' }
  /** Over 1/2 min or 5/24 h. Nothing sent. Respond 429 with retryAfterSeconds. */
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
  // Same rule as NOT_YET_VERIFIED / VERIFIED_FOR_BONUS (T-351); T-522: the shared check.
  if (isVerified(user)) return { kind: 'already_verified' };

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

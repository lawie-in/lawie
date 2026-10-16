/**
 * T-221 — forgot password, end to end. All the logic lives here; the controller and the
 * internal route are thin wiring. Every function takes its side-effect deps as an optional last
 * argument (defaults are the real Redis client, the email client and the session store), so tests
 * can inject fakes.
 *
 * Flow:
 *  1. POST /forgot-password { email } -> requestPasswordReset: rate limit (per email hash and per
 *     IP, before any lookup), then, only for an active account that has a password or is
 *     Google-only, enqueue { template: 'auth.passwordReset', userId }. The job carries the userId
 *     only (Priya, T-220): no address, no token. The caller answers the same 200 either way.
 *  2. The email worker calls POST /internal/password-reset/mint -> mintPasswordReset(userId):
 *     an account with a password gets a fresh random token, sha256(token) + 30 min expiry stored
 *     on the user (replacing any older one, so only the newest link works) and
 *     `${FRONTEND_URL}/reset-password/<token>`; a Google-only account gets no token, just the
 *     login URL (AC6).
 *  3. GET /reset-password/:token -> isResetTokenLive: read-only check for the page load.
 *  4. POST /reset-password/:token { password } -> completePasswordReset: the password (already
 *     validated with the sign-up rules) is bcrypt-hashed, then ONE atomic write finds the live
 *     token on an active account, sets the password and clears the token (single use: a second
 *     request with the same token matches nothing). Then every session of the user is deleted
 *     (AC3), which the gateway sees on the next request.
 *
 * Only the hash is stored. Nothing here logs an address, a token, a hash or a link (AC5):
 * userId only.
 */
import crypto from 'crypto';

import { enqueueEmail } from '@lawie/email-client';
import bcrypt from 'bcryptjs';
import type Redis from 'ioredis';
import mongoose from 'mongoose';

import { env } from '../config/env';
import logger from '../config/logger';
import redisClient from '../config/redis';
import { User } from '../models/User.model';

import { consumePasswordResetQuota } from './password-reset-rate-limit';
import { deleteAllUserSessions } from './session.service';

/** Link lifetime: 30 minutes (signed copy: "expires in 30 minutes"). */
export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

/** Same cost as the User pre-save hook, so a reset password is as strong as a sign-up one. */
const BCRYPT_COST = 12;

/** 32 random bytes, hex: 64 chars. Anything else cannot be one of our tokens. */
const TOKEN_RE = /^[a-f0-9]{64}$/;

export function isResetTokenShape(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_RE.test(token);
}

export function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function frontendBase(): string {
  return env.FRONTEND_URL.replace(/\/+$/, '');
}

/** `${FRONTEND_URL}/reset-password/<token>`: the web app's own domain (AC2). */
export function buildResetUrl(token: string): string {
  return `${frontendBase()}/reset-password/${encodeURIComponent(token)}`;
}

export function buildLoginUrl(): string {
  return `${frontendBase()}/login`;
}

/** Error class name only (never the message, which can echo values), for logs. */
function errorKind(err: unknown): string {
  const kind = err instanceof Error ? err.constructor?.name : undefined;
  return typeof kind === 'string' && kind ? kind : 'Error';
}

/** Active and not being closed (T-115c sets isActive false and `erasure` on close). */
const ELIGIBLE = { isActive: { $ne: false }, erasure: { $exists: false } };
const HAS_PASSWORD = { password: { $exists: true, $nin: [null, ''] } };

function hasGoogle(user: { authProvider?: unknown; googleId?: unknown }): boolean {
  return (
    user.authProvider === 'google' ||
    (typeof user.googleId === 'string' && user.googleId.length > 0)
  );
}

function hasPassword(user: { password?: unknown }): boolean {
  return typeof user.password === 'string' && user.password.length > 0;
}

// ── Deps (injectable) ───────────────────────────────────────────────────────

export interface PasswordResetDeps {
  redis: Redis;
  enqueue: (input: { template: 'auth.passwordReset'; userId: string }) => Promise<unknown>;
  deleteAllSessions: (userId: string) => Promise<void>;
}

const defaultDeps = (): PasswordResetDeps => ({
  redis: redisClient,
  enqueue: enqueueEmail,
  deleteAllSessions: deleteAllUserSessions,
});

// ── 1. Request (public POST /forgot-password) ───────────────────────────────

export type RequestPasswordResetResult =
  /** Same answer whether or not an email was queued (AC1). */
  | { kind: 'accepted' }
  /** Over the email or IP cap (AC4). Nothing looked up, nothing sent. */
  | { kind: 'limited'; retryAfterSeconds: number }
  /** The rate-limit store failed: fail closed, nothing looked up or sent. */
  | { kind: 'unavailable' };

/**
 * `email` must already be a validated, lower-cased address. Never logged. The lookup happens
 * only after the rate limit, and the enqueue is fire-and-forget, so the response does not wait
 * on anything that differs between a known and an unknown address.
 */
export async function requestPasswordReset(
  email: string,
  ip: string | undefined,
  deps: Partial<PasswordResetDeps> = {},
): Promise<RequestPasswordResetResult> {
  const d = { ...defaultDeps(), ...deps };

  let quota;
  try {
    quota = await consumePasswordResetQuota(d.redis, email, ip);
  } catch (err) {
    logger.warn(
      { errKind: errorKind(err) },
      'Password reset not queued: rate-limit store unavailable',
    );
    return { kind: 'unavailable' };
  }
  if (!quota.allowed) {
    logger.info(
      { retryAfterSeconds: quota.retryAfterSeconds },
      'Password reset refused: rate limit',
    );
    return { kind: 'limited', retryAfterSeconds: quota.retryAfterSeconds };
  }

  const user = await User.findOne({ email, ...ELIGIBLE })
    .select('+password +googleId authProvider')
    .lean();
  if (!user) return { kind: 'accepted' };
  if (!hasPassword(user) && !hasGoogle(user)) return { kind: 'accepted' };

  const userId = user._id.toString();
  void Promise.resolve()
    .then(() => d.enqueue({ template: 'auth.passwordReset', userId }))
    .then(() => logger.info({ userId }, 'Password reset email queued'))
    .catch((err: unknown) => {
      logger.error({ userId, errKind: errorKind(err) }, 'Password reset enqueue failed');
    });
  return { kind: 'accepted' };
}

// ── 2. Mint (internal route, called by the email worker) ────────────────────

export type MintPasswordResetResult =
  /** Account with a password: a fresh link. PII and a live credential: never log. */
  | { kind: 'link'; email: string; resetUrl: string }
  /** Google-only account (no password): no token, the login page instead (AC6). */
  | { kind: 'google'; email: string; loginUrl: string }
  /** No such user, inactive, being closed, or neither a password nor Google: nothing sent. */
  | { kind: 'not_found' };

/**
 * Mints a fresh reset token for userId and stores only its hash, in the same atomic write that
 * checks eligibility. Replaces any earlier token, so only the newest link works (including on a
 * BullMQ retry). The result carries PII and a live credential: callers must never log it.
 */
export async function mintPasswordReset(userId: string): Promise<MintPasswordResetResult> {
  if (!mongoose.Types.ObjectId.isValid(userId)) return { kind: 'not_found' };
  const _id = new mongoose.Types.ObjectId(userId);

  const token = crypto.randomBytes(32).toString('hex');
  const updated = await User.findOneAndUpdate(
    { _id, ...ELIGIBLE, ...HAS_PASSWORD },
    {
      $set: {
        passwordResetToken: hashResetToken(token),
        passwordResetExpires: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    },
    { new: true, projection: { email: 1 } },
  ).lean();

  if (updated) {
    logger.info({ userId }, 'Password reset link minted');
    return { kind: 'link', email: updated.email, resetUrl: buildResetUrl(token) };
  }

  const user = await User.findOne({ _id, ...ELIGIBLE })
    .select('+password +googleId authProvider email')
    .lean();
  if (user && !hasPassword(user) && hasGoogle(user)) {
    logger.info({ userId }, 'Password reset asked on a Google-only account');
    return { kind: 'google', email: user.email, loginUrl: buildLoginUrl() };
  }

  logger.info({ userId }, 'Password reset not minted: not eligible or no such user');
  return { kind: 'not_found' };
}

// ── 3. Check (public GET /reset-password/:token) ────────────────────────────

/** Read-only: true when the token matches a live (unexpired, unused) link on an active account. */
export async function isResetTokenLive(token: unknown): Promise<boolean> {
  if (!isResetTokenShape(token)) return false;
  const found = await User.exists({
    passwordResetToken: hashResetToken(token),
    passwordResetExpires: { $gt: new Date() },
    ...ELIGIBLE,
  });
  return found !== null;
}

// ── 4. Complete (public POST /reset-password/:token) ────────────────────────

export type CompletePasswordResetResult =
  | { kind: 'reset'; userId: string }
  /** Malformed, unknown, expired or already used, or the account is inactive: one answer. */
  | { kind: 'invalid' };

/**
 * `password` must already have passed validateResetPassword (the sign-up rules). Hashing happens
 * before the lookup, so a valid-looking token costs the same whether or not it matches.
 * If deleting the sessions fails, the error is rethrown (500): the password is already changed
 * and the token used, so the user's retry lands on the "link no longer works" screen, whose copy
 * tells them to sign in with the new password.
 */
export async function completePasswordReset(
  token: unknown,
  password: string,
  deps: Partial<PasswordResetDeps> = {},
): Promise<CompletePasswordResetResult> {
  const d = { ...defaultDeps(), ...deps };
  if (!isResetTokenShape(token)) return { kind: 'invalid' };

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const updated = await User.findOneAndUpdate(
    {
      passwordResetToken: hashResetToken(token),
      passwordResetExpires: { $gt: new Date() },
      ...ELIGIBLE,
    },
    {
      $set: { password: passwordHash },
      $unset: { passwordResetToken: 1, passwordResetExpires: 1 },
    },
    { new: true, projection: { _id: 1 } },
  ).lean();

  if (!updated) return { kind: 'invalid' };

  const userId = updated._id.toString();
  logger.info({ userId }, 'Password reset');
  try {
    await d.deleteAllSessions(userId);
  } catch (err) {
    logger.error(
      { userId, errKind: errorKind(err) },
      'Password reset: signing out other sessions failed',
    );
    throw err;
  }
  logger.info({ userId }, 'Password reset: all sessions signed out');
  return { kind: 'reset', userId };
}

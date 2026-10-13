import crypto from 'crypto';

import {
  RegisterPayload,
  LoginPayload,
  refreshSessionKey,
  sessionKey,
  getPrivacyVersionSummary,
} from '@lawie/shared';
import bcrypt from 'bcryptjs';

import logger from '../config/logger';
import { AppError } from '../middleware/errorHandler';
import { Session } from '../models/Session.model';
import {
  User,
  IUser,
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  privacySignupAcceptance,
} from '../models/User.model';
import { buildSignupSource, UtmTags } from '../validators/auth.validator';

import { tryGrantDailyLoginBonus, grantSignupBonus } from './credit-bonus.service';
import { generateTokenPair, verifyRefreshToken } from './jwt.service';
import { applyReferralCode } from './referral.service';
import { createSession, deleteSession, hashToken, SessionMeta } from './session.service';

// T-299 (Arjun ruling 2): login must not reveal whether an account exists, by status or by
// time. One 401 text for unknown email, wrong password and no password on the record; each of
// those paths runs exactly one bcrypt compare at the same cost as real passwords (12, see the
// pre-save hook in User.model.ts). The dummy hash is computed once, at module load, from random
// bytes, so no password can ever match it.
const INVALID_LOGIN_MESSAGE = 'Invalid email or password';
const DEACTIVATED_MESSAGE = 'Your account has been deactivated. Contact support.';
const INVALID_REFRESH_MESSAGE = 'Invalid or expired refresh token';
export const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 12);

export async function registerUser(
  payload: RegisterPayload & { referralCode?: string } & UtmTags,
  meta: SessionMeta = {},
): Promise<{
  user: IUser;
  tokens: { accessToken: string; refreshToken: string };
  referralApplied?: boolean;
}> {
  const existing = await User.findOne({ email: payload.email.toLowerCase() });
  if (existing) {
    throw new AppError(409, 'An account with this email already exists');
  }

  const acceptedAt = new Date();
  const user = await User.create({
    email: payload.email,
    password: payload.password,
    name: payload.name,
    // Always 'Lawyer', the same as Google sign-up (T-298, Arjun 12 Oct 2026).
    // Never read a role from the request (T-196): Admin is the only gate on admin
    // routes and bypasses enforceFreeLimit. The schema default stays 'Client' on purpose.
    role: 'Lawyer',
    // T-234 — the sign-up form shows the Terms line under the submit button.
    // Server time and server version only; nothing here comes from the request.
    termsAcceptedAt: acceptedAt,
    termsVersion: CURRENT_TERMS_VERSION,
    acceptedVia: 'password',
    // T-343 (Ajay §4) — privacyVersion, privacyAcceptedAt, via 'signup' and the first history
    // row. Sign-up never shows the re-acceptance prompt.
    ...privacySignupAcceptance(acceptedAt),
    // T-242 — campaign tags, only on account creation, with the server time. Sanitized again
    // here so a caller that skips the validator can't store a raw value. Never logged.
    signupSource: buildSignupSource({
      utmSource: payload.utmSource,
      utmMedium: payload.utmMedium,
      utmCampaign: payload.utmCampaign,
    }),
  });

  // Signup bonus — non-blocking, never fails registration
  void grantSignupBonus(user._id.toString());

  // Referral (T-234 / Ajay Addendum 1: no silent drop). Awaited so the response can
  // tell the page whether the code was applied, but it never fails registration.
  // applyReferralCode grants at most once per user (T-298 d).
  // referralApplied: true = applied, false = code no longer valid, undefined = no code
  // sent or an unexpected error (we cannot honestly say either way).
  let referralApplied: boolean | undefined;
  if (payload.referralCode) {
    try {
      const outcome = await applyReferralCode(user._id.toString(), payload.referralCode);
      referralApplied = outcome === 'applied' ? true : outcome === 'invalid' ? false : undefined;
    } catch (err) {
      logger.warn(
        { userId: user._id.toString(), err: err instanceof Error ? err.message : String(err) },
        'Referral code apply failed at registration',
      );
    }
  }

  const tokens = generateTokenPair({
    sub: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
    plan: user.plan,
    pv: user.privacyVersion,
  });

  await createSession(
    user._id.toString(),
    tokens.accessToken,
    tokens.refreshToken,
    { plan: user.plan, email: user.email, role: user.role, name: user.name },
    meta,
  );

  return { user, tokens, referralApplied };
}

export async function loginUser(
  payload: LoginPayload,
  meta: SessionMeta = {},
): Promise<{ user: IUser; tokens: { accessToken: string; refreshToken: string } }> {
  const user = await User.findOne({ email: payload.email.toLowerCase() }).select('+password');

  // (a) Unknown email, and (b) a record with no password (Google-only or erased): compare
  // against the dummy hash so the response takes as long as a real wrong password, then the
  // same 401. comparePassword is never called without a password (it would throw: 500).
  if (!user || !user.password) {
    await bcrypt.compare(payload.password, DUMMY_PASSWORD_HASH);
    throw new AppError(401, INVALID_LOGIN_MESSAGE);
  }

  // (b) Known email, wrong password: same 401, same text. isActive is not looked at yet.
  const isMatch = await user.comparePassword(payload.password);
  if (!isMatch) {
    throw new AppError(401, INVALID_LOGIN_MESSAGE);
  }

  // (c) Only a caller who has proved the password learns the account is deactivated.
  if (!user.isActive) {
    throw new AppError(403, DEACTIVATED_MESSAGE);
  }

  const tokens = generateTokenPair({
    sub: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
    plan: user.plan,
    pv: user.privacyVersion,
  });

  await createSession(
    user._id.toString(),
    tokens.accessToken,
    tokens.refreshToken,
    { plan: user.plan, email: user.email, role: user.role, name: user.name },
    meta,
  );

  // SCRUM-73 — daily login bonus, non-blocking on the login hot path.
  void tryGrantDailyLoginBonus(user._id.toString());

  return { user, tokens };
}

export async function refreshTokens(
  refreshToken: string,
  meta: SessionMeta = {},
): Promise<{ accessToken: string; refreshToken: string }> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError(401, INVALID_REFRESH_MESSAGE);
  }

  // T-299 (Arjun, must-fix): a refresh needs a live session. Take the refresh key atomically
  // (MULTI GET+DEL, not GETDEL: production's Redis version is not recorded; same as T-306's
  // takeOAuthCode). Missing (logged out, revoked, Google link, expired, or already used by a
  // parallel refresh): the same 401 as a bad JWT, and nothing is issued.
  const redis = (await import('../config/redis')).default;
  const refreshKey = refreshSessionKey(payload.sub, hashToken(refreshToken));
  const taken = await redis.multi().get(refreshKey).del(refreshKey).exec();
  const [getErr, oldRefreshData] = taken?.[0] ?? [];
  if (getErr || typeof oldRefreshData !== 'string') {
    throw new AppError(401, INVALID_REFRESH_MESSAGE);
  }
  let oldAccessTokenHash: unknown;
  try {
    oldAccessTokenHash = (JSON.parse(oldRefreshData) as { accessTokenHash?: unknown })
      .accessTokenHash;
  } catch {
    oldAccessTokenHash = undefined;
  }
  if (typeof oldAccessTokenHash !== 'string' || !oldAccessTokenHash) {
    throw new AppError(401, INVALID_REFRESH_MESSAGE);
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) {
    throw new AppError(401, 'User not found or inactive');
  }

  // Delete the old access session (rotate-on-refresh). The refresh key is already gone.
  await deleteSession(payload.sub, oldAccessTokenHash);

  const tokens = generateTokenPair({
    sub: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
    plan: user.plan,
    pv: user.privacyVersion,
  });

  await createSession(
    user._id.toString(),
    tokens.accessToken,
    tokens.refreshToken,
    { plan: user.plan, email: user.email, role: user.role, name: user.name },
    meta,
  );

  return tokens;
}

/** T-343 — what GET /me reports about the user's privacy acceptance. */
export interface PrivacyStatus {
  privacyVersion: string | null;
  currentPrivacyVersion: string;
  needsPrivacyAcceptance: boolean;
  /** Ajay's signed one-line summary (P2); present only when needsPrivacyAcceptance. */
  summary?: string;
}

/**
 * T-343 — the prompt shows when the stored privacyVersion is not equal to the current one
 * (a missing version counts as not accepted) AND the current version has a signed summary
 * (Ajay §3). Versions are compared with !== only, never as dates.
 */
export function privacyStatusFor(user: Pick<IUser, 'privacyVersion'>): PrivacyStatus {
  const privacyVersion = user.privacyVersion ?? null;
  const summary = getPrivacyVersionSummary(CURRENT_PRIVACY_VERSION);
  const needsPrivacyAcceptance =
    privacyVersion !== CURRENT_PRIVACY_VERSION && summary !== undefined;
  return {
    privacyVersion,
    currentPrivacyVersion: CURRENT_PRIVACY_VERSION,
    needsPrivacyAcceptance,
    ...(needsPrivacyAcceptance ? { summary } : {}),
  };
}

export async function getPrivacyStatus(userId: string): Promise<PrivacyStatus> {
  const user = await User.findById(userId).select('privacyVersion isActive');
  if (!user || !user.isActive) {
    throw new AppError(401, 'User not found or inactive');
  }
  return privacyStatusFor(user);
}

/**
 * T-343 — POST /me/privacy-acceptance. Records acceptance of CURRENT_PRIVACY_VERSION with
 * server values only (version, time, via 'reaccept'); nothing comes from the request body.
 * Order: (1) atomically take the caller's access session (401 and nothing written if it is
 * gone), deleting its refresh key and audit row; (2) the conditional update (only when the
 * stored version differs, so a double submit adds one history row, not two); (3) a new pair,
 * carrying the new `pv`, via createSession (rotation as /refresh, Arjun's addendum). Logs only
 * the user id, never tokens.
 *
 * T-354 — why this order is kept (Arjun, 12 Oct 2026, option A). Full order: take the access
 * session (MULTI GET+DEL; 401 if gone) → delete its refresh key and Session row → conditional
 * updateOne (version + history) → isActive check → createSession. The acceptance is a consent
 * record, so it is written only by a request whose session we have just proved live and
 * consumed. Updating first (option B) would let a revoked session record consent in a race.
 * Do not reorder without a new ruling.
 *
 * Failure mode (accepted): if anything after the take throws unexpectedly (a Mongo or Redis
 * error in the update, the user read or createSession), the request returns 500 and the web
 * shows P8. The old session is already gone, so the user's next action signs them out
 * (apiFetch 401 → /refresh 401, its refresh key was deleted → /login). No session leaks (the
 * old pair is dead, no new pair was issued) and the user is never locked out (logging in
 * again works and shows the prompt again if the update did not land). This is the same
 * trade-off as /refresh after its take: a rare sign-out after a DB failure is safe. (If the
 * refresh-key delete itself is what fails, that key may survive and /refresh can still
 * rotate it: the user stays signed in and sees the prompt again; still no extra pair.)
 */
export async function acceptPrivacy(
  userId: string,
  accessToken: string,
  meta: SessionMeta = {},
): Promise<{ accessToken: string; refreshToken: string }> {
  // Review round 1 (must-fix): take the caller's access session atomically FIRST (MULTI GET+DEL,
  // the /refresh pattern), so two concurrent accepts with one token can't both issue a pair
  // (T-299 single use). Not taken (already used, revoked, expired): 401, no DB write, nothing
  // issued. Never log the token or its hash.
  const redis = (await import('../config/redis')).default;
  const accessHash = hashToken(accessToken);
  const accessKey = sessionKey(userId, accessHash);
  const taken = await redis.multi().get(accessKey).del(accessKey).exec();
  const [getErr, oldSessionData] = taken?.[0] ?? [];
  if (getErr || typeof oldSessionData !== 'string') {
    throw new AppError(401, 'Session expired or revoked. Please log in again.');
  }
  // The taken session's refresh key and audit row go too (as deleteSession does).
  let oldRefreshHash: unknown;
  try {
    oldRefreshHash = (JSON.parse(oldSessionData) as { refreshTokenHash?: unknown })
      .refreshTokenHash;
  } catch {
    oldRefreshHash = undefined;
  }
  if (typeof oldRefreshHash === 'string' && oldRefreshHash) {
    await redis.del(refreshSessionKey(userId, oldRefreshHash));
  }
  await Session.deleteOne({ userId, jwtTokenHash: accessHash });

  const acceptedAt = new Date();
  await User.updateOne(
    { _id: userId, isActive: true, privacyVersion: { $ne: CURRENT_PRIVACY_VERSION } },
    {
      $set: {
        privacyVersion: CURRENT_PRIVACY_VERSION,
        privacyAcceptedAt: acceptedAt,
        privacyAcceptedVia: 'reaccept',
      },
      $push: {
        privacyHistory: { version: CURRENT_PRIVACY_VERSION, acceptedAt, via: 'reaccept' },
      },
    },
  );

  const user = await User.findById(userId);
  if (!user || !user.isActive) {
    throw new AppError(401, 'User not found or inactive');
  }

  const tokens = generateTokenPair({
    sub: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
    plan: user.plan,
    pv: user.privacyVersion,
  });

  await createSession(
    user._id.toString(),
    tokens.accessToken,
    tokens.refreshToken,
    { plan: user.plan, email: user.email, role: user.role, name: user.name },
    meta,
  );

  logger.info({ userId: user._id.toString() }, 'Privacy version accepted');
  return tokens;
}

export async function logoutUser(userId: string, accessToken: string): Promise<void> {
  const accessHash = hashToken(accessToken);
  await deleteSession(userId, accessHash);
}

export async function initiatePasswordReset(email: string): Promise<string> {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) return 'ok';

  const token = crypto.randomBytes(32).toString('hex');
  user.passwordResetToken = crypto.createHash('sha256').update(token).digest('hex');
  user.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000);
  await user.save({ validateBeforeSave: false });

  return token;
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const hashed = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashed,
    passwordResetExpires: { $gt: new Date() },
  }).select('+passwordResetToken +passwordResetExpires');

  if (!user) {
    throw new AppError(400, 'Password reset token is invalid or has expired');
  }

  user.password = newPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();
}

import crypto from 'crypto';

import { RegisterPayload, LoginPayload } from '@lawie/shared';
import bcrypt from 'bcryptjs';

import logger from '../config/logger';
import { AppError } from '../middleware/errorHandler';
import { User, IUser, CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from '../models/User.model';

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
  payload: RegisterPayload & { referralCode?: string },
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
    termsAcceptedAt: new Date(),
    termsVersion: CURRENT_TERMS_VERSION,
    privacyVersion: CURRENT_PRIVACY_VERSION,
    acceptedVia: 'password',
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
  const refreshKey = `session:refresh:${payload.sub}:${hashToken(refreshToken)}`;
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

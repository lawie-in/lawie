import crypto from 'crypto';

import { RegisterPayload, LoginPayload } from '@lawie/shared';

import logger from '../config/logger';
import { AppError } from '../middleware/errorHandler';
import { User, IUser, CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from '../models/User.model';

import { tryGrantDailyLoginBonus, grantSignupBonus } from './credit-bonus.service';
import { generateTokenPair, verifyRefreshToken } from './jwt.service';
import { applyReferralCode } from './referral.service';
import { createSession, deleteSession, hashToken, SessionMeta } from './session.service';

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

  if (!user) {
    throw new AppError(401, 'Invalid email or password');
  }

  if (!user.isActive) {
    throw new AppError(403, 'Your account has been deactivated. Contact support.');
  }

  // T-234 — a Google-only account has no password. comparePassword would throw
  // (500 + Sentry); answer exactly like a wrong password so the account type
  // does not leak.
  if (!user.password) {
    throw new AppError(401, 'Invalid email or password');
  }

  const isMatch = await user.comparePassword(payload.password);
  if (!isMatch) {
    throw new AppError(401, 'Invalid email or password');
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
    throw new AppError(401, 'Invalid or expired refresh token');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) {
    throw new AppError(401, 'User not found or inactive');
  }

  // Delete old session (rotate-on-refresh)
  const oldRefreshHash = hashToken(refreshToken);
  const oldRefreshData = await (
    await import('../config/redis')
  ).default.get(`session:refresh:${payload.sub}:${oldRefreshHash}`);
  if (oldRefreshData) {
    const { accessTokenHash } = JSON.parse(oldRefreshData);
    await deleteSession(payload.sub, accessTokenHash);
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

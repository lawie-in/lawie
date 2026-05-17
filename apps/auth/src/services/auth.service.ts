import crypto from 'crypto';

import { RegisterPayload, LoginPayload } from '@lawie/shared';

import { AppError } from '../middleware/errorHandler';
import { User, IUser } from '../models/User.model';

import { tryGrantDailyLoginBonus, grantSignupBonus } from './credit-bonus.service';
import { generateTokenPair, verifyRefreshToken } from './jwt.service';
import { applyReferralCode } from './referral.service';
import { createSession, deleteSession, hashToken, SessionMeta } from './session.service';

export async function registerUser(
  payload: RegisterPayload & { referralCode?: string },
  meta: SessionMeta = {},
): Promise<{ user: IUser; tokens: { accessToken: string; refreshToken: string } }> {
  const existing = await User.findOne({ email: payload.email.toLowerCase() });
  if (existing) {
    throw new AppError(409, 'An account with this email already exists');
  }

  const user = await User.create({
    email: payload.email,
    password: payload.password,
    name: payload.name,
    role: payload.role ?? 'Client',
  });

  // Signup bonus — non-blocking, never fails registration
  void grantSignupBonus(user._id.toString());

  // Apply referral code non-blocking — never fails registration
  if (payload.referralCode) {
    void applyReferralCode(user._id.toString(), payload.referralCode);
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

  return { user, tokens };
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

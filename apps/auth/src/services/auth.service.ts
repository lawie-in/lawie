import crypto from 'crypto';

import { RegisterPayload, LoginPayload } from '@lawie/shared';

import { AppError } from '../middleware/errorHandler';
import { User, IUser } from '../models/User.model';

import { generateTokenPair, verifyRefreshToken } from './jwt.service';

export async function registerUser(
  payload: RegisterPayload,
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

  const tokens = generateTokenPair({
    sub: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
    plan: user.plan,
  });

  return { user, tokens };
}

export async function loginUser(
  payload: LoginPayload,
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

  return { user, tokens };
}

export async function refreshTokens(
  refreshToken: string,
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

  return generateTokenPair({
    sub: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
    plan: user.plan,
  });
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

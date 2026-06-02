import { UserRole, UserPlan } from '@lawie/shared';
import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';

import { env } from '../config/env';

export interface TokenPayload {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
  plan: UserPlan;
  type: 'access' | 'refresh';
}

function sign(payload: Omit<TokenPayload, 'type'>, type: 'access' | 'refresh'): string {
  const secret = type === 'access' ? env.JWT_SECRET : env.JWT_REFRESH_SECRET;
  const expiresIn = type === 'access' ? env.JWT_EXPIRES_IN : env.JWT_REFRESH_EXPIRES_IN;

  return jwt.sign({ ...payload, type } as object, secret, {
    expiresIn,
    algorithm: 'HS256',
  } as SignOptions);
}

export function signAccessToken(payload: Omit<TokenPayload, 'type'>): string {
  return sign(payload, 'access');
}

export function signRefreshToken(payload: Omit<TokenPayload, 'type'>): string {
  return sign(payload, 'refresh');
}

export function generateTokenPair(payload: Omit<TokenPayload, 'type'>): {
  accessToken: string;
  refreshToken: string;
} {
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
}

export function verifyAccessToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload & TokenPayload;
  if (decoded.type !== 'access') throw new Error('Invalid token type');
  return decoded;
}

export function verifyRefreshToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload & TokenPayload;
  if (decoded.type !== 'refresh') throw new Error('Invalid token type');
  return decoded;
}

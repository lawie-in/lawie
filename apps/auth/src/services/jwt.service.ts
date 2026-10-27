import crypto from 'crypto';

import { SESSION_SLIDING_TTL_SECONDS, UserRole, UserPlan } from '@lawie/shared';
import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';

import { env } from '../config/env';

export interface TokenPayload {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
  plan: UserPlan;
  /**
   * T-343 — the user's accepted privacyVersion, read from the user record when the token is
   * issued (login, register, OAuth, refresh, privacy acceptance). Absent on tokens issued before
   * T-343 and for users with no recorded version: both count as not accepted.
   */
  pv?: string;
  type: 'access' | 'refresh';
}

/** The identity claims a token carries (everything but `type`). */
export type TokenClaims = Omit<TokenPayload, 'type'>;

function sign(payload: TokenClaims, type: 'access' | 'refresh'): string {
  const secret = type === 'access' ? env.JWT_SECRET : env.JWT_REFRESH_SECRET;
  // T-616b — a fresh refresh token (sign-in) lives the sliding TTL from @lawie/shared, not the
  // retired JWT_REFRESH_EXPIRES_IN env var. The access token stays JWT_EXPIRES_IN (15m).
  const expiresIn = type === 'access' ? env.JWT_EXPIRES_IN : SESSION_SLIDING_TTL_SECONDS;

  // jwtid gives every token a unique `jti`, so two tokens signed for the same
  // user in the same second (iat has 1s resolution) still differ and hash to
  // different session keys (T-209). Verify does not require `jti`, so tokens
  // issued before this change keep verifying until they expire.
  return jwt.sign({ ...payload, type } as object, secret, {
    expiresIn,
    algorithm: 'HS256',
    jwtid: crypto.randomUUID(),
  } as SignOptions);
}

export function signAccessToken(payload: TokenClaims): string {
  return sign(payload, 'access');
}

export function signRefreshToken(payload: TokenClaims): string {
  return sign(payload, 'refresh');
}

export function generateTokenPair(payload: TokenClaims): {
  accessToken: string;
  refreshToken: string;
} {
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
}

/**
 * T-616b — the `jti` of the refresh token a rotation issues:
 * HMAC-SHA256(JWT_REFRESH_SECRET, oldTokenHash || nonce), base64url. `nonce` is the random
 * 32 bytes (hex) kept in the grace record, so the same inputs always give the same jti, and
 * without the secret nobody can compute it from what Redis holds.
 */
export function deriveRotatedRefreshJti(oldTokenHash: string, nonceHex: string): string {
  return crypto
    .createHmac('sha256', env.JWT_REFRESH_SECRET)
    .update(oldTokenHash)
    .update(nonceHex)
    .digest('base64url');
}

/** T-616b — the deterministic inputs of a rotated refresh token (all kept in the grace record). */
export interface RotatedRefreshInputs {
  claims: TokenClaims;
  /** Issued-at, seconds since the epoch. */
  iat: number;
  /** Expiry, seconds since the epoch. */
  exp: number;
  jti: string;
}

/**
 * T-616b — sign a rotated refresh token in today's refresh-token format (HS256 JWT,
 * type 'refresh', JWT_REFRESH_SECRET, so verifyRefreshToken accepts it) but with no clock or
 * randomness inside: iat, exp and jti are given, and the payload's keys are always written in
 * the same order. HS256 is deterministic, so the same inputs give a byte-identical token. That
 * is what lets a grace replay hand back the exact token the first rotation issued, without the
 * token itself ever being stored.
 */
export function signRotatedRefreshToken(inputs: RotatedRefreshInputs): string {
  const { claims } = inputs;
  const body: Record<string, unknown> = {
    sub: claims.sub,
    email: claims.email,
    name: claims.name,
    role: claims.role,
    plan: claims.plan,
  };
  if (claims.pv !== undefined && claims.pv !== null) body.pv = claims.pv;
  body.type = 'refresh';
  body.iat = inputs.iat;
  body.exp = inputs.exp;
  body.jti = inputs.jti;
  return jwt.sign(body, env.JWT_REFRESH_SECRET, { algorithm: 'HS256' });
}

/**
 * T-616b — seconds until `token`'s `exp` (read without verifying: callers have just signed or
 * verified it). `fallback` when it has no readable exp; never below 1.
 */
export function tokenRemainingSeconds(token: string, fallback: number): number {
  const decoded = jwt.decode(token);
  const exp = decoded && typeof decoded === 'object' ? (decoded as JwtPayload).exp : undefined;
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return Math.max(1, fallback);
  return Math.max(1, exp - Math.floor(Date.now() / 1000));
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

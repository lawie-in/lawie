import crypto from 'crypto';

import { SESSION_TTL, sessionKey, refreshSessionKey } from '@lawie/shared';

import redis from '../config/redis';
import { Session } from '../models/Session.model';

export interface SessionMeta {
  ip?: string;
  userAgent?: string;
  /**
   * T-115c (Arjun ruling 2) — ISO time the user last proved who they are: a password login,
   * sign-up or a Google sign-in. Set by those paths; /refresh and the privacy re-accept carry
   * the old session's value forward, so a refresh never makes it newer. Closing a Google-only
   * account needs it to be under 15 minutes old.
   */
  authAt?: string;
}

export interface SessionData {
  refreshTokenHash: string;
  plan: string;
  email: string;
  role: string;
  name: string;
  ip?: string;
  userAgent?: string;
  createdAt: string;
  /** T-115c — see SessionMeta.authAt. Absent on sessions made before T-115c. */
  authAt?: string;
}

/** T-115c — what the refresh key holds: the access hash, and authAt to carry through /refresh. */
export interface RefreshSessionData {
  accessTokenHash: string;
  authAt?: string;
}

/** SHA-256 hash of a token — used as Redis key component */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Create a session in both Redis and MongoDB.
 * Called after login, register, OAuth, and token refresh.
 */
export async function createSession(
  userId: string,
  accessToken: string,
  refreshToken: string,
  userInfo: { plan: string; email: string; role: string; name: string },
  meta: SessionMeta = {},
): Promise<void> {
  const accessHash = hashToken(accessToken);
  const refreshHash = hashToken(refreshToken);

  const sessionData: SessionData = {
    refreshTokenHash: refreshHash,
    plan: userInfo.plan,
    email: userInfo.email,
    role: userInfo.role,
    name: userInfo.name,
    ip: meta.ip,
    userAgent: meta.userAgent,
    createdAt: new Date().toISOString(),
    ...(meta.authAt ? { authAt: meta.authAt } : {}),
  };
  const refreshData: RefreshSessionData = {
    accessTokenHash: accessHash,
    ...(meta.authAt ? { authAt: meta.authAt } : {}),
  };

  // Write both Redis keys in a pipeline for atomicity
  const pipeline = redis.pipeline();
  pipeline.set(
    sessionKey(userId, accessHash),
    JSON.stringify(sessionData),
    'EX',
    SESSION_TTL.ACCESS,
  );
  pipeline.set(
    refreshSessionKey(userId, refreshHash),
    JSON.stringify(refreshData),
    'EX',
    SESSION_TTL.REFRESH,
  );
  await pipeline.exec();

  // Persist to MongoDB for audit trail
  await Session.create({
    userId,
    jwtTokenHash: accessHash,
    refreshTokenHash: refreshHash,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
    isActive: true,
    expiresAt: new Date(Date.now() + SESSION_TTL.ACCESS * 1000),
  });
}

/** Look up a session by access token hash */
export async function validateSession(
  userId: string,
  accessTokenHash: string,
): Promise<SessionData | null> {
  const raw = await redis.get(sessionKey(userId, accessTokenHash));
  if (!raw) return null;
  return JSON.parse(raw) as SessionData;
}

/** Delete a single session (logout or refresh rotation) */
export async function deleteSession(userId: string, accessTokenHash: string): Promise<void> {
  // Look up session to find the refresh key
  const raw = await redis.get(sessionKey(userId, accessTokenHash));
  if (raw) {
    const data = JSON.parse(raw) as SessionData;
    await redis.del(refreshSessionKey(userId, data.refreshTokenHash));
  }

  await redis.del(sessionKey(userId, accessTokenHash));
  await Session.deleteOne({ userId, jwtTokenHash: accessTokenHash });
}

/** Delete all sessions for a user (e.g. password change, account compromise) */
export async function deleteAllUserSessions(userId: string): Promise<void> {
  // Scan for all session keys belonging to this user
  // Same string as `session:${userId}:*`, built from the shared helper (T-325 rider)
  const pattern = sessionKey(userId, '*');
  let cursor = '0';
  const keysToDelete: string[] = [];

  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = nextCursor;
    keysToDelete.push(...keys);
  } while (cursor !== '0');

  if (keysToDelete.length > 0) {
    await redis.del(...keysToDelete);
  }

  // Also scan for refresh keys
  // Same string as `session:refresh:${userId}:*`
  const refreshPattern = refreshSessionKey(userId, '*');
  cursor = '0';
  const refreshKeysToDelete: string[] = [];

  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', refreshPattern, 'COUNT', 100);
    cursor = nextCursor;
    refreshKeysToDelete.push(...keys);
  } while (cursor !== '0');

  if (refreshKeysToDelete.length > 0) {
    await redis.del(...refreshKeysToDelete);
  }

  await Session.deleteMany({ userId });
}

import crypto from 'crypto';

import { SESSION_TTL, sessionKey, refreshSessionKey } from '@lawie/shared';
import mongoose from 'mongoose';

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
    // T-507: the row lives as long as the session can be used, i.e. until the REFRESH key
    // expires (was the access TTL, so a session idle past 24 h vanished from the list while its
    // refresh token still worked). Refresh, logout and revoke delete the row before that.
    expiresAt: new Date(Date.now() + SESSION_TTL.REFRESH * 1000),
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

/** All Redis keys matching a pattern (SCAN, never KEYS). */
async function scanKeys(pattern: string): Promise<string[]> {
  let cursor = '0';
  const found: string[] = [];
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = nextCursor;
    found.push(...keys);
  } while (cursor !== '0');
  return found;
}

/**
 * T-507 — sign out every session of the user EXCEPT the one whose access token hash is
 * `keepAccessHash` (password change). Deletes the other access keys, every refresh key but the
 * kept session's own (so a session idle past its access TTL cannot refresh either), and the
 * other Session rows. Returns how many sessions were signed out: refresh keys deleted, plus
 * access keys whose refresh key was not among them. Never logs a key or hash.
 */
export async function deleteOtherUserSessions(
  userId: string,
  keepAccessHash: string,
): Promise<number> {
  const keepAccessKey = sessionKey(userId, keepAccessHash);
  const kept = await validateSession(userId, keepAccessHash);
  const keepRefreshKey = kept ? refreshSessionKey(userId, kept.refreshTokenHash) : undefined;

  const accessKeys = (await scanKeys(sessionKey(userId, '*'))).filter((k) => k !== keepAccessKey);
  const refreshKeys = (await scanKeys(refreshSessionKey(userId, '*'))).filter(
    (k) => k !== keepRefreshKey,
  );

  let revoked = refreshKeys.length;
  if (accessKeys.length > 0) {
    const refreshKeySet = new Set(refreshKeys);
    const raws = await redis.mget(...accessKeys);
    for (const raw of raws) {
      let refreshHash: unknown;
      try {
        refreshHash = raw ? (JSON.parse(raw) as Partial<SessionData>).refreshTokenHash : undefined;
      } catch {
        refreshHash = undefined;
      }
      const pairedKey =
        typeof refreshHash === 'string' ? refreshSessionKey(userId, refreshHash) : undefined;
      if (!pairedKey || !refreshKeySet.has(pairedKey)) revoked += 1;
    }
  }

  const toDelete = [...accessKeys, ...refreshKeys];
  if (toDelete.length > 0) await redis.del(...toDelete);
  await Session.deleteMany({ userId, jwtTokenHash: { $ne: keepAccessHash } });
  return revoked;
}

/** T-507 — one row of GET /me/sessions. No IP address and no token hash. */
export interface ActiveSessionView {
  id: string;
  userAgent: string | null;
  createdAt: Date;
  current: boolean;
}

/**
 * T-507 — every session the user can still use, newest first: Session rows that are isActive,
 * not past expiresAt, AND have a live Redis access key OR a live refresh key (matched by the
 * row's refreshTokenHash), so a session idle past the 24 h access TTL but still refreshable
 * (up to 7 days) is listed and can be signed out. Redis decides; a row whose keys are both gone
 * is not listed. `current` marks the caller's.
 *
 * Rows written before T-507 got expiresAt = access TTL, so such a row is TTL-deleted after 24 h
 * even though its refresh key may live on; it cannot be listed. That lasts at most 7 days after
 * deploy (its refresh either rotates into a new row with the longer expiry, or the key expires).
 * Password change (deleteOtherUserSessions) still revokes those by scanning Redis.
 */
export async function listActiveSessions(
  userId: string,
  currentAccessHash: string,
): Promise<ActiveSessionView[]> {
  const rows = await Session.find({ userId, isActive: true, expiresAt: { $gt: new Date() } })
    .select('_id jwtTokenHash refreshTokenHash userAgent createdAt')
    .sort({ createdAt: -1 })
    .lean();
  if (rows.length === 0) return [];

  // One EXISTS per row, counting both keys: >= 1 means the access key or the refresh key is live.
  const pipeline = redis.pipeline();
  for (const row of rows) {
    pipeline.exists(
      sessionKey(userId, row.jwtTokenHash),
      refreshSessionKey(userId, row.refreshTokenHash),
    );
  }
  const results = (await pipeline.exec()) ?? [];

  const out: ActiveSessionView[] = [];
  rows.forEach((row, i) => {
    const [err, liveKeys] = results[i] ?? [];
    if (err) throw err;
    if (typeof liveKeys !== 'number' || liveKeys < 1) return;
    out.push({
      id: row._id.toString(),
      userAgent: typeof row.userAgent === 'string' && row.userAgent ? row.userAgent : null,
      createdAt: row.createdAt,
      current: row.jwtTokenHash === currentAccessHash,
    });
  });
  return out;
}

/**
 * T-507 — sign out one of the user's sessions by its Session row id. The row is looked up by
 * { _id, userId }, so another user's id is the same as an unknown one: false (404). The row is
 * marked inactive first (so it drops out of the list even if a Redis step fails), then both
 * keys are revoked: deleteSession removes the access key (and the refresh key it names) and the
 * row, and the refresh key is also deleted by the hash on the row, which covers a session idle
 * past its access TTL (access key already expired, refresh key still live).
 */
export async function deleteUserSessionById(userId: string, sessionId: string): Promise<boolean> {
  if (!mongoose.isValidObjectId(sessionId)) return false;
  const row = await Session.findOne({ _id: sessionId, userId })
    .select('_id jwtTokenHash refreshTokenHash')
    .lean();
  if (!row) return false;
  await Session.updateOne({ _id: row._id }, { $set: { isActive: false } });
  await deleteSession(userId, row.jwtTokenHash);
  if (row.refreshTokenHash) await redis.del(refreshSessionKey(userId, row.refreshTokenHash));
  return true;
}

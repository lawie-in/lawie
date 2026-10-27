import crypto from 'crypto';

import {
  REFRESH_GRACE_SECONDS,
  SESSION_ABSOLUTE_SECONDS,
  SESSION_SLIDING_TTL_SECONDS,
  SESSION_TTL,
  sessionKey,
  refreshSessionKey,
} from '@lawie/shared';
import mongoose from 'mongoose';

import redis from '../config/redis';
import { Session } from '../models/Session.model';

import {
  deriveRotatedRefreshJti,
  signAccessToken,
  signRotatedRefreshToken,
  tokenRemainingSeconds,
  TokenClaims,
} from './jwt.service';

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
  /**
   * T-616b — ms since the epoch of the sign-in that started this session family. Carried through
   * every rotation; the absolute ceiling (SESSION_ABSOLUTE_DAYS) counts from it. Absent on
   * sessions made before T-616b (stamped at their next refresh).
   */
  originalCreatedAt?: number;
}

/** T-115c — what the refresh key holds: the access hash, and authAt to carry through /refresh. */
export interface RefreshSessionData {
  accessTokenHash: string;
  authAt?: string;
  /** T-616b — see SessionData.originalCreatedAt. */
  originalCreatedAt?: number;
  /**
   * T-616b — hash of the refresh token this one was rotated from, i.e. the key of the grace
   * record that points here, so revoking this session deletes that grace record too.
   */
  rotatedFrom?: string;
}

/**
 * T-616b — the grace record. After a rotation it REPLACES the old refresh token's record under the
 * same key (`session:refresh:<uid>:<oldTokenHash>`) for REFRESH_GRACE_SECONDS. It holds no token,
 * no hash of an access token and no secret: the nonce, the NEW refresh token's hash, the new
 * session's id, and the inputs that rebuild the identical new refresh token (iat, exp and the
 * identity claims it carries; jti is HMAC(JWT_REFRESH_SECRET, oldTokenHash || nonce)), plus
 * `p`, the hash the old token was itself rotated from (its rotatedFrom), so a revoke walk can go
 * back across several rotations inside 30 s.
 *
 * Serialized with `g: 1` as the first key, so the stored string always starts with GRACE_PREFIX:
 * that is how the Lua scripts and the revoke paths tell a grace record from a refresh record.
 * An auth instance from before T-616b reads a grace record as a refresh record without an
 * accessTokenHash and answers 401 (safe).
 */
interface GraceRecord {
  g: 1;
  /** Random 32 bytes, hex. */
  n: string;
  /** SHA-256 of the new refresh token. */
  h: string;
  /** _id of the new session's Session row. */
  s: string;
  iat: number;
  exp: number;
  /**
   * SHA-256 of the refresh token the OLD token was rotated from (the old record's rotatedFrom).
   * A hash, never a token. Absent when the old token came straight from a sign-in, and on grace
   * records written before this field existed.
   */
  p?: string;
  /** Identity claims inside the new refresh token (the same fields the access key holds). */
  c: TokenClaims;
}

const GRACE_PREFIX = '{"g":1,';

export function isGraceRecord(raw: unknown): raw is string {
  return typeof raw === 'string' && raw.startsWith(GRACE_PREFIX);
}

function serializeGrace(rec: Omit<GraceRecord, 'g'>): string {
  const out: GraceRecord = {
    g: 1,
    n: rec.n,
    h: rec.h,
    s: rec.s,
    iat: rec.iat,
    exp: rec.exp,
    // Before `c` (the only field holding user text), so the Lua pattern finds it first.
    ...(rec.p ? { p: rec.p } : {}),
    c: rec.c,
  };
  return JSON.stringify(out);
}

function parseGrace(raw: string): GraceRecord | null {
  try {
    const p = JSON.parse(raw) as Partial<GraceRecord>;
    if (
      p.g === 1 &&
      typeof p.n === 'string' &&
      typeof p.h === 'string' &&
      typeof p.s === 'string' &&
      typeof p.iat === 'number' &&
      typeof p.exp === 'number' &&
      p.c &&
      typeof p.c === 'object' &&
      typeof p.c.sub === 'string'
    ) {
      const rec = p as GraceRecord;
      if (typeof rec.p !== 'string' || !rec.p) delete rec.p;
      return rec;
    }
  } catch {
    /* corrupt: null */
  }
  return null;
}

/** A refresh record (not a grace record) with a usable accessTokenHash, or null. */
function parseRefreshRecord(raw: string): RefreshSessionData | null {
  if (isGraceRecord(raw)) return null;
  try {
    const p = JSON.parse(raw) as Partial<RefreshSessionData>;
    if (typeof p.accessTokenHash !== 'string' || !p.accessTokenHash) return null;
    return {
      accessTokenHash: p.accessTokenHash,
      ...(typeof p.authAt === 'string' ? { authAt: p.authAt } : {}),
      ...(isMs(p.originalCreatedAt) ? { originalCreatedAt: p.originalCreatedAt } : {}),
      ...(typeof p.rotatedFrom === 'string' && p.rotatedFrom ? { rotatedFrom: p.rotatedFrom } : {}),
    };
  } catch {
    return null;
  }
}

function isMs(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/** SHA-256 hash of a token — used as Redis key component */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Create a session in both Redis and MongoDB.
 * Called after login, register, OAuth and the verify-link sign-in. Token refresh and the privacy
 * re-accept rotate instead (rotateRefreshSession), they no longer come here.
 *
 * T-616b: a new sign-in starts a new session family, so originalCreatedAt is now. The access key
 * lives as long as the access JWT really does (15 minutes; it was 24 hours), the refresh key the
 * sliding TTL (12 hours), and the Session row as long as the refresh key.
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
  const now = Date.now();
  const accessTtl = tokenRemainingSeconds(accessToken, SESSION_TTL.ACCESS);
  const refreshTtl = Math.min(
    SESSION_SLIDING_TTL_SECONDS,
    tokenRemainingSeconds(refreshToken, SESSION_SLIDING_TTL_SECONDS),
  );

  const sessionData: SessionData = {
    refreshTokenHash: refreshHash,
    plan: userInfo.plan,
    email: userInfo.email,
    role: userInfo.role,
    name: userInfo.name,
    ip: meta.ip,
    userAgent: meta.userAgent,
    createdAt: new Date(now).toISOString(),
    ...(meta.authAt ? { authAt: meta.authAt } : {}),
    originalCreatedAt: now,
  };
  const refreshData: RefreshSessionData = {
    accessTokenHash: accessHash,
    ...(meta.authAt ? { authAt: meta.authAt } : {}),
    originalCreatedAt: now,
  };

  // Write both Redis keys in a pipeline for atomicity
  const pipeline = redis.pipeline();
  pipeline.set(sessionKey(userId, accessHash), JSON.stringify(sessionData), 'EX', accessTtl);
  pipeline.set(
    refreshSessionKey(userId, refreshHash),
    JSON.stringify(refreshData),
    'EX',
    refreshTtl,
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
    originalCreatedAt: new Date(now),
    // T-507: the row lives as long as the session can be used, i.e. until the REFRESH key
    // expires. T-616b: that is now the sliding TTL; each rotation writes a new row with the next
    // expiry. Refresh, logout and revoke delete the row before that.
    expiresAt: new Date(now + refreshTtl * 1000),
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

// ── T-616b: rotation with a grace window ────────────────────────────────────
//
// Deployment assumption: ROTATE_LUA and REPLAY_LUA each touch several keys (session:<uid>:… and
// session:refresh:<uid>:…) that carry no hash tag, so they need a single Redis (or a primary
// with replicas), NOT Redis Cluster, where a multi-key script across slots fails with CROSSSLOT.
// Moving to Cluster would need hash-tagged key shapes, which the gateway also reads.

/**
 * First presentation, atomically. KEYS: 1 old refresh key, 2 new refresh key, 3 new access key,
 * 4 old access key. ARGV: 1 the old refresh record exactly as read, 2 grace record, 3 grace TTL,
 * 4 new refresh record, 5 its TTL, 6 new access record, 7 its TTL.
 * Only if key 1 still holds ARGV[1] (nobody rotated or revoked it since it was read): key 1
 * becomes the grace record, both new keys are written, and the old access key's TTL is cut to
 * min(grace, what it had left) — its TTL is its JWT's remaining life, so that is
 * min(30 s, JWT exp); a key with no TTL gets the grace. Returns {1}; otherwise {0, current value}
 * ({0} if the key is gone), and writes nothing.
 */
const ROTATE_LUA = `
local v = redis.call('GET', KEYS[1])
if v == ARGV[1] then
  local grace = tonumber(ARGV[3])
  redis.call('SET', KEYS[1], ARGV[2], 'EX', grace)
  redis.call('SET', KEYS[2], ARGV[4], 'EX', tonumber(ARGV[5]))
  redis.call('SET', KEYS[3], ARGV[6], 'EX', tonumber(ARGV[7]))
  local t = redis.call('TTL', KEYS[4])
  if t == -1 or t > grace then
    redis.call('EXPIRE', KEYS[4], grace)
  end
  return {1}
end
if v then
  return {0, v}
end
return {0}
`;

/**
 * Grace replay, atomically. KEYS: 1 grace key, 2 the new (successor) refresh key, 3 the replay's
 * own new access key. ARGV: 1 grace record as read, 2 successor record as read, 3 access record,
 * 4 its TTL. Writes the access key only if both records are unchanged, i.e. the grace window is
 * still open and the session it points to is still live (not logged out, revoked or rotated
 * again). Returns 1 if written, else 0.
 */
const REPLAY_LUA = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then
  return 0
end
if redis.call('GET', KEYS[2]) ~= ARGV[2] then
  return 0
end
redis.call('SET', KEYS[3], ARGV[3], 'EX', tonumber(ARGV[4]))
return 1
`;

export interface RotationInput {
  userId: string;
  /** SHA-256 of the refresh token being rotated (presented, or named by the access session). */
  oldRefreshHash: string;
  /**
   * Identity claims for the new tokens, from the user record. On a replay they are used for the
   * fresh access token only; the refresh token is rebuilt from the grace record.
   */
  claims: TokenClaims;
  userInfo: { plan: string; email: string; role: string; name: string };
  meta?: SessionMeta;
  /** authAt to carry when the refresh record has none (the privacy re-accept passes its own). */
  fallbackAuthAt?: string;
}

export type RotationResult =
  | {
      /** First presentation: a new pair, a new Session row, the grace record written. */
      kind: 'rotated';
      accessToken: string;
      refreshToken: string;
      accessHash: string;
    }
  | {
      /** Same old token inside the grace window: the SAME refresh token, a fresh access token. */
      kind: 'replayed';
      accessToken: string;
      refreshToken: string;
      accessHash: string;
    }
  /** Unknown, spent outside the window, revoked, corrupt: nothing issued. */
  | { kind: 'invalid' }
  /** Past the absolute ceiling (SESSION_ABSOLUTE_DAYS since originalCreatedAt): nothing issued. */
  | { kind: 'expired' };

/**
 * T-616b (Arjun) — rotate a refresh session, with a 30 s grace. Used by /refresh and by the
 * privacy re-accept (same function, same grace, two callers).
 *
 * First presentation of a refresh token: a new pair is minted; in one Lua script the old record
 * is swapped for the grace record (TTL REFRESH_GRACE_SECONDS), the new keys are written and the
 * old access key is left to expire within min(30 s, its JWT's life) instead of being deleted (so
 * requests already in flight with it do not 401). The new refresh token is a deterministic
 * function of the grace record (signRotatedRefreshToken), so it is never stored.
 *
 * Presenting the same old token again while the grace record lives (a lost response, a parallel
 * tab, a retry) rebuilds the byte-identical refresh token and mints a fresh access token with its
 * own access key, pointing at the same session. It never creates a second refresh token, a
 * second Session row or a second session family. Parallel first presentations are safe: the
 * script lets exactly one of them rotate and the others become replays.
 *
 * After the window the old key is gone and the token is a 401, as T-299 had it.
 *
 * Lifetime: the sliding TTL (12 h) per rotation, capped by what is left of the absolute
 * ceiling (7 days from originalCreatedAt); the Session row's expiresAt is the same. A session
 * from before T-616b has no originalCreatedAt and is stamped with now at this rotation.
 */
export async function rotateRefreshSession(input: RotationInput): Promise<RotationResult> {
  const { userId, oldRefreshHash, claims, userInfo } = input;
  const meta = input.meta ?? {};
  const oldKey = refreshSessionKey(userId, oldRefreshHash);

  const raw = await redis.get(oldKey);
  if (typeof raw !== 'string') return { kind: 'invalid' };
  if (isGraceRecord(raw)) return replayRotation(input, raw);
  const old = parseRefreshRecord(raw);
  if (!old) return { kind: 'invalid' };

  const now = Date.now();
  const anchor = old.originalCreatedAt ?? now;
  const remainingAbsolute = Math.floor((anchor + SESSION_ABSOLUTE_SECONDS * 1000 - now) / 1000);
  if (remainingAbsolute <= 0) return { kind: 'expired' };
  const slidingTtl = Math.min(SESSION_SLIDING_TTL_SECONDS, remainingAbsolute);

  const iat = Math.floor(now / 1000);
  const exp = iat + slidingTtl;
  const nonce = crypto.randomBytes(32).toString('hex');
  const refreshToken = signRotatedRefreshToken({
    claims,
    iat,
    exp,
    jti: deriveRotatedRefreshJti(oldRefreshHash, nonce),
  });
  const newRefreshHash = hashToken(refreshToken);
  const accessToken = signAccessToken(claims);
  const accessHash = hashToken(accessToken);
  const accessTtl = tokenRemainingSeconds(accessToken, SESSION_TTL.ACCESS);
  const sessionId = new mongoose.Types.ObjectId();
  const authAt = old.authAt ?? input.fallbackAuthAt;

  const grace = serializeGrace({
    n: nonce,
    h: newRefreshHash,
    s: sessionId.toHexString(),
    iat,
    exp,
    p: old.rotatedFrom,
    c: claims,
  });
  const refreshData: RefreshSessionData = {
    accessTokenHash: accessHash,
    ...(authAt ? { authAt } : {}),
    originalCreatedAt: anchor,
    rotatedFrom: oldRefreshHash,
  };
  const sessionData: SessionData = {
    refreshTokenHash: newRefreshHash,
    plan: userInfo.plan,
    email: userInfo.email,
    role: userInfo.role,
    name: userInfo.name,
    ip: meta.ip,
    userAgent: meta.userAgent,
    createdAt: new Date(now).toISOString(),
    ...(authAt ? { authAt } : {}),
    originalCreatedAt: anchor,
  };

  const result = (await redis.eval(
    ROTATE_LUA,
    4,
    oldKey,
    refreshSessionKey(userId, newRefreshHash),
    sessionKey(userId, accessHash),
    sessionKey(userId, old.accessTokenHash),
    raw,
    grace,
    String(REFRESH_GRACE_SECONDS),
    JSON.stringify(refreshData),
    String(slidingTtl),
    JSON.stringify(sessionData),
    String(accessTtl),
  )) as [number, string?] | null;

  if (!Array.isArray(result) || Number(result[0]) !== 1) {
    // Someone else rotated (or revoked) it between our read and the script.
    const current = Array.isArray(result) ? result[1] : undefined;
    if (isGraceRecord(current)) return replayRotation(input, current);
    return { kind: 'invalid' };
  }

  // The old row goes (its access key lives at most 30 s more and needs no row); the new row
  // carries the id the grace record names. No other row is written for this family.
  try {
    await Session.deleteOne({ userId, jwtTokenHash: old.accessTokenHash });
    await Session.create({
      _id: sessionId,
      userId,
      jwtTokenHash: accessHash,
      refreshTokenHash: newRefreshHash,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      isActive: true,
      originalCreatedAt: new Date(anchor),
      // min(sliding, absolute): slidingTtl is already capped by the absolute ceiling.
      expiresAt: new Date(now + slidingTtl * 1000),
    });
  } catch (err) {
    // The script already rotated in Redis, but the caller gets a 500 and no tokens. Leaving the
    // new keys would be a session missing from /me/sessions that a retry inside 30 s could
    // replay into. Putting the old record back cannot be done safely (a parallel caller may
    // already be replaying), so the whole family is revoked instead: the new access and refresh
    // keys, the grace record, the old access key and any rows (deleteSession walks the family
    // from the new access key). Same effect as T-354: the old pair is dead, nothing leaks, the
    // user signs in again. Best effort: the original error is what the caller sees.
    try {
      await deleteSession(userId, accessHash);
    } catch {
      /* the Mongo or Redis failure is reported by rethrowing `err` */
    }
    throw err;
  }

  return { kind: 'rotated', accessToken, refreshToken, accessHash };
}

async function replayRotation(input: RotationInput, graceRaw: string): Promise<RotationResult> {
  const { userId, oldRefreshHash, claims, userInfo } = input;
  const meta = input.meta ?? {};
  const grace = parseGrace(graceRaw);
  if (!grace) return { kind: 'invalid' };
  const now = Date.now();
  if (grace.exp * 1000 <= now) return { kind: 'invalid' };

  const refreshToken = signRotatedRefreshToken({
    claims: grace.c,
    iat: grace.iat,
    exp: grace.exp,
    jti: deriveRotatedRefreshJti(oldRefreshHash, grace.n),
  });
  // Never hand out anything but the token the first rotation issued (e.g. if the secret changed).
  const rebuilt = Buffer.from(hashToken(refreshToken), 'utf8');
  const stored = Buffer.from(grace.h, 'utf8');
  if (rebuilt.length !== stored.length || !crypto.timingSafeEqual(rebuilt, stored)) {
    return { kind: 'invalid' };
  }

  const successorKey = refreshSessionKey(userId, grace.h);
  const successorRaw = await redis.get(successorKey);
  if (typeof successorRaw !== 'string') return { kind: 'invalid' };
  const successor = parseRefreshRecord(successorRaw);
  if (!successor) return { kind: 'invalid' };

  const accessToken = signAccessToken(claims);
  const accessHash = hashToken(accessToken);
  const accessTtl = tokenRemainingSeconds(accessToken, SESSION_TTL.ACCESS);
  const authAt = successor.authAt ?? input.fallbackAuthAt;
  const sessionData: SessionData = {
    refreshTokenHash: grace.h,
    plan: userInfo.plan,
    email: userInfo.email,
    role: userInfo.role,
    name: userInfo.name,
    ip: meta.ip,
    userAgent: meta.userAgent,
    createdAt: new Date(now).toISOString(),
    ...(authAt ? { authAt } : {}),
    ...(successor.originalCreatedAt ? { originalCreatedAt: successor.originalCreatedAt } : {}),
  };

  const written = await redis.eval(
    REPLAY_LUA,
    3,
    refreshSessionKey(userId, oldRefreshHash),
    successorKey,
    sessionKey(userId, accessHash),
    graceRaw,
    successorRaw,
    JSON.stringify(sessionData),
    String(accessTtl),
  );
  if (Number(written) !== 1) return { kind: 'invalid' };

  // No Session row: the family's row (grace.s) already lists this session.
  return { kind: 'replayed', accessToken, refreshToken, accessHash };
}

// ── Revocation ──────────────────────────────────────────────────────────────

/**
 * T-616b — the refresh hashes of one session family reachable from `start`: forward through a
 * grace record to the token it was rotated into (`h`), back through a refresh record's
 * rotatedFrom or a grace record's `p`. Bounded (a family has at most a couple of live links:
 * grace records last 30 s). READ ONLY: revocation uses REVOKE_FAMILIES_LUA, which walks the
 * same links and deletes as it goes.
 */
async function collectFamily(userId: string, start: string[]): Promise<Set<string>> {
  const family = new Set<string>();
  const queue = start.filter((h) => typeof h === 'string' && h.length > 0);
  let steps = 0;
  while (queue.length > 0 && steps < 16) {
    steps += 1;
    const hash = queue.shift();
    if (hash === undefined || family.has(hash)) continue;
    family.add(hash);
    const raw = await redis.get(refreshSessionKey(userId, hash));
    if (typeof raw !== 'string') continue;
    if (isGraceRecord(raw)) {
      const g = parseGrace(raw);
      if (g) queue.push(g.h);
      if (g?.p) queue.push(g.p);
    } else {
      const r = parseRefreshRecord(raw);
      if (r?.rotatedFrom) queue.push(r.rotatedFrom);
    }
  }
  return family;
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

/** refreshTokenHash of each access record (undefined if gone or unreadable), in key order. */
async function accessRefreshHashes(keys: string[]): Promise<Array<string | undefined>> {
  if (keys.length === 0) return [];
  const raws = await redis.mget(...keys);
  return raws.map((raw) => {
    try {
      const h = raw ? (JSON.parse(raw) as Partial<SessionData>).refreshTokenHash : undefined;
      return typeof h === 'string' ? h : undefined;
    } catch {
      return undefined;
    }
  });
}

/**
 * T-616b — revoke whole refresh families in ONE script, so no rotation or grace replay can slip
 * between reading a family and deleting it. ARGV: 1 the refresh key prefix
 * (`session:refresh:<uid>:`), 2 n = how many hashes to skip, 3..2+n the hashes to skip (a family
 * being kept), then the start hashes. From each start it GETs the key, DELs it, and follows the
 * links it holds — a grace record's `h` (successor) and `p` (predecessor), a refresh record's
 * `rotatedFrom` — read with string.match on the stored JSON (no cjson). Grace records keep
 * `h`/`p` ahead of `c`, and a JSON string value cannot contain an unescaped `"`, so user text in
 * `c` can never match. Returns "kind:hash" joined by "," (kind r = refresh record deleted,
 * g = grace record deleted, x = key already gone); a string, not a table, so ioredis-mock can
 * run it too.
 *
 * Why this order closes the races: a ROTATE_LUA or REPLAY_LUA that runs after this script finds
 * its CAS key gone and writes nothing; one that ran before it left a grace record whose `h` this
 * script follows. Access keys are deleted AFTER it, by a SCAN that therefore sees every access
 * key such a rotation or replay wrote. Same single-Redis assumption as ROTATE_LUA.
 */
const REVOKE_FAMILIES_LUA = `
local prefix = ARGV[1]
local nskip = tonumber(ARGV[2])
local skip = {}
for i = 3, 2 + nskip do
  skip[ARGV[i]] = true
end
local queue = {}
for i = 3 + nskip, #ARGV do
  queue[#queue + 1] = ARGV[i]
end
local maxSteps = #queue * 4 + 64
local seen = {}
local out = {}
local head = 1
local steps = 0
while head <= #queue and steps < maxSteps do
  local h = queue[head]
  head = head + 1
  steps = steps + 1
  if not seen[h] and not skip[h] then
    seen[h] = true
    local key = prefix .. h
    local v = redis.call('GET', key)
    if v then
      redis.call('DEL', key)
      if string.sub(v, 1, 7) == '{"g":1,' then
        out[#out + 1] = 'g:' .. h
        local nxt = string.match(v, '"h":"(%x+)"')
        if nxt then queue[#queue + 1] = nxt end
        local prev = string.match(v, '"p":"(%x+)"')
        if prev then queue[#queue + 1] = prev end
      else
        out[#out + 1] = 'r:' .. h
        local prev = string.match(v, '"rotatedFrom":"(%x+)"')
        if prev then queue[#queue + 1] = prev end
      end
    else
      out[#out + 1] = 'x:' .. h
    end
  end
end
return table.concat(out, ',')
`;

interface RevokedFamilies {
  /** Every hash the walk visited (deleted or already gone). */
  walked: Set<string>;
  /** Refresh records it deleted (each one a session). */
  live: Set<string>;
  /** Grace records it deleted. */
  grace: Set<string>;
}

/** Run REVOKE_FAMILIES_LUA from `starts`, never entering `skip`. */
async function revokeRefreshFamilies(
  userId: string,
  starts: string[],
  skip: Iterable<string> = [],
): Promise<RevokedFamilies> {
  const result: RevokedFamilies = { walked: new Set(), live: new Set(), grace: new Set() };
  const startList = [...new Set(starts.filter((h) => typeof h === 'string' && h.length > 0))];
  if (startList.length === 0) return result;
  const skipList = [...new Set(skip)];
  const raw = await redis.eval(
    REVOKE_FAMILIES_LUA,
    0,
    refreshSessionKey(userId, ''),
    String(skipList.length),
    ...skipList,
    ...startList,
  );
  const text = typeof raw === 'string' ? raw : '';
  for (const entry of text.split(',')) {
    const kind = entry.slice(0, 1);
    const hash = entry.slice(2);
    if (!hash || entry[1] !== ':') continue;
    result.walked.add(hash);
    if (kind === 'r') result.live.add(hash);
    else if (kind === 'g') result.grace.add(hash);
  }
  return result;
}

/** The hash part of `session:refresh:<uid>:<hash>` keys. */
function refreshHashesOf(userId: string, keys: string[]): string[] {
  const prefix = refreshSessionKey(userId, '');
  return keys.filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
}

/**
 * Delete a single session (logout, revoke one). T-616b: the whole family goes — the refresh
 * key, the grace records on either side of its rotations, every access key that names one of
 * those (the access key from before a rotation still inside its 30 s, and any grace-replay
 * access keys) and their Session rows. `alsoRefreshHash` starts the walk from a refresh hash too
 * (a session row whose access key has already expired).
 *
 * Order (T-616b review S1): the refresh side first, in one script (REVOKE_FAMILIES_LUA), THEN a
 * SCAN for the access keys. So a /refresh or grace replay racing the logout either fails its CAS
 * (ran after the script) or is followed and its access key caught by the SCAN (ran before).
 *
 * Cost: O(sessions of one user). One script call walks the family (bounded), and one SCAN + MGET
 * covers that user's access keys (`session:<uid>:*`, never other users' keys). Auth has no hard
 * per-user session cap; the count stays small because access keys live 15 minutes and
 * refresh keys 12 hours (sliding), and sign-ins are rate limited per IP by the gateway.
 */
export async function deleteSession(
  userId: string,
  accessTokenHash: string,
  alsoRefreshHash?: string,
): Promise<void> {
  // Look up session to find the refresh key
  const raw = await redis.get(sessionKey(userId, accessTokenHash));
  let refreshHash: string | undefined;
  if (raw) {
    try {
      const h = (JSON.parse(raw) as Partial<SessionData>).refreshTokenHash;
      refreshHash = typeof h === 'string' ? h : undefined;
    } catch {
      refreshHash = undefined;
    }
  }
  const { walked: family } = await revokeRefreshFamilies(
    userId,
    [refreshHash, alsoRefreshHash].filter((h): h is string => typeof h === 'string'),
  );

  const accessToDelete = new Set<string>([sessionKey(userId, accessTokenHash)]);
  if (family.size > 0) {
    const accessKeys = await scanKeys(sessionKey(userId, '*'));
    const hashes = await accessRefreshHashes(accessKeys);
    accessKeys.forEach((k, i) => {
      const h = hashes[i];
      if (h && family.has(h)) accessToDelete.add(k);
    });
  }
  await redis.del(...accessToDelete);

  if (family.size > 0) {
    await Session.deleteMany({
      userId,
      $or: [{ jwtTokenHash: accessTokenHash }, { refreshTokenHash: { $in: [...family] } }],
    });
  } else {
    await Session.deleteOne({ userId, jwtTokenHash: accessTokenHash });
  }
}

/**
 * Delete all sessions for a user (e.g. password change, account compromise). T-616b: grace
 * records live under the same `session:refresh:<uid>:*` prefix, so they go too. Order (review
 * S1): every refresh and grace key first, through REVOKE_FAMILIES_LUA from all of them (which
 * also follows any rotation that happened after the SCAN), THEN every access key, so an access
 * key written by a racing rotation or replay is still caught.
 */
export async function deleteAllUserSessions(userId: string): Promise<void> {
  // Same string as `session:refresh:${userId}:*`
  const refreshKeys = await scanKeys(refreshSessionKey(userId, '*'));
  await revokeRefreshFamilies(userId, refreshHashesOf(userId, refreshKeys));
  // Anything the script did not reach (e.g. a key it could not parse a link out of) still goes.
  const leftover = await scanKeys(refreshSessionKey(userId, '*'));
  if (leftover.length > 0) await redis.del(...leftover);

  // Same string as `session:${userId}:*`, built from the shared helper (T-325 rider)
  const accessKeys = await scanKeys(sessionKey(userId, '*'));
  if (accessKeys.length > 0) await redis.del(...accessKeys);

  await Session.deleteMany({ userId });
}

/**
 * T-507 — sign out every session of the user EXCEPT the one whose access token hash is
 * `keepAccessHash` (password change). Deletes the other access keys, every refresh key but the
 * kept session's own (so a session idle past its access TTL cannot refresh either), and the
 * other Session rows. Returns how many sessions were signed out: refresh keys deleted, plus
 * access keys whose refresh key was not among them. Never logs a key or hash.
 *
 * T-616b: "the kept session" is its whole family (collectFamily): its refresh key, the grace
 * records on either side of its rotations and the access keys naming them (e.g. the caller holds
 * the pre-rotation access token inside its 30 s, or a grace-replay one) all stay. Other families'
 * grace records are deleted but not counted, nor are access keys that name a grace record.
 * Order (review S1): the other families' refresh side in one script first (skipping the kept
 * family), then the kept family is read again (it may have rotated meanwhile), then the access
 * keys are SCANned and deleted.
 */
export async function deleteOtherUserSessions(
  userId: string,
  keepAccessHash: string,
): Promise<number> {
  const keepAccessKey = sessionKey(userId, keepAccessHash);
  const kept = await validateSession(userId, keepAccessHash);
  const keepStart = kept ? [kept.refreshTokenHash] : [];

  const refreshHashes = refreshHashesOf(userId, await scanKeys(refreshSessionKey(userId, '*')));
  const keepBefore = await collectFamily(userId, keepStart);
  const removed = await revokeRefreshFamilies(
    userId,
    refreshHashes.filter((h) => !keepBefore.has(h)),
    keepBefore,
  );
  // The kept family as it is now (a rotation of it may have run since keepBefore was read).
  const keepFamily = new Set([...keepBefore, ...(await collectFamily(userId, keepStart))]);

  const allAccessKeys = await scanKeys(sessionKey(userId, '*'));
  const allAccessHashes = await accessRefreshHashes(allAccessKeys);
  const accessKeys: string[] = [];
  let revoked = removed.live.size;
  allAccessKeys.forEach((k, i) => {
    const h = allAccessHashes[i];
    if (k === keepAccessKey || (h && keepFamily.has(h))) return;
    accessKeys.push(k);
    // Counted only if its refresh key was not among those just deleted (refresh or grace).
    if (!h || !(removed.live.has(h) || removed.grace.has(h))) revoked += 1;
  });

  if (accessKeys.length > 0) await redis.del(...accessKeys);
  await Session.deleteMany({
    userId,
    jwtTokenHash: { $ne: keepAccessHash },
    refreshTokenHash: { $nin: [...keepFamily] },
  });
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
 * row's refreshTokenHash), so a session idle past its access TTL but still refreshable is listed
 * and can be signed out. Redis decides; a row whose keys are both gone is not listed. `current`
 * marks the caller's: its access hash, or (T-616b) a row of the caller's session family (the
 * caller may hold the pre-rotation access token inside its 30 s grace, or a grace-replay one,
 * neither of which has a row of its own).
 *
 * Rows written before T-507 got expiresAt = access TTL, so such a row is TTL-deleted after 24 h
 * even though its refresh key may live on; it cannot be listed. Password change
 * (deleteOtherUserSessions) still revokes those by scanning Redis.
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

  const current = await validateSession(userId, currentAccessHash);
  const currentFamily = current
    ? await collectFamily(userId, [current.refreshTokenHash])
    : new Set<string>();

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
      current: row.jwtTokenHash === currentAccessHash || currentFamily.has(row.refreshTokenHash),
    });
  });
  return out;
}

/**
 * T-507 — sign out one of the user's sessions by its Session row id. The row is looked up by
 * { _id, userId }, so another user's id is the same as an unknown one: false (404). The row is
 * marked inactive first (so it drops out of the list even if a Redis step fails), then both
 * keys are revoked: deleteSession removes the access key, the refresh key and (T-616b) the rest
 * of the family, starting from the row's access hash AND its refresh hash, which covers a
 * session idle past its access TTL (access key already expired, refresh key still live).
 */
export async function deleteUserSessionById(userId: string, sessionId: string): Promise<boolean> {
  if (!mongoose.isValidObjectId(sessionId)) return false;
  const row = await Session.findOne({ _id: sessionId, userId })
    .select('_id jwtTokenHash refreshTokenHash')
    .lean();
  if (!row) return false;
  await Session.updateOne({ _id: row._id }, { $set: { isActive: false } });
  await deleteSession(userId, row.jwtTokenHash, row.refreshTokenHash || undefined);
  if (row.refreshTokenHash) await redis.del(refreshSessionKey(userId, row.refreshTokenHash));
  return true;
}

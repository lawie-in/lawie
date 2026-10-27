/**
 * T-616b — server half of the session-refresh fix (Arjun's design). Real app, in-memory Mongo,
 * ioredis-mock (Lua through its scripting support).
 *
 *  (a) 30 s grace rotation: same old token inside the window -> the SAME new refresh token; after
 *      it -> 401; the old access key is kept for min(30 s, JWT life); new access keys live their
 *      JWT's real 900 s
 *  (b) per-user limiter on POST /refresh: 60 per 900 s, 429 + Retry-After, 503 fail closed
 *  (c) 12 h sliding TTL, 7-day absolute ceiling via originalCreatedAt
 *  (d) the grace record dies with logout / revoke / revoke-all / password change / erase
 *  (e) privacy re-accept shares the rotation
 *
 * Time control: ioredis-mock and jsonwebtoken both read Date.now(), so t616b-helpers.advanceClock
 * moves it. No real secret is hard-coded: setupEnv's test secrets are read through the app's env.
 */

import './setupEnv';

jest.mock('ioredis', () => jest.requireActual('ioredis-mock'));

import './setupDb';

import crypto from 'crypto';

import {
  CURRENT_PRIVACY_VERSION,
  REFRESH_GRACE_SECONDS,
  REFRESH_RATE_LIMIT,
  SESSION_ABSOLUTE_DAYS,
  SESSION_TTL_HOURS,
  refreshSessionKey,
  sessionKey,
} from '@lawie/shared';
import jwt from 'jsonwebtoken';
import supertest from 'supertest';

import app from '../app';
import { env } from '../config/env';
import redis from '../config/redis';
import { Session } from '../models/Session.model';
import { User } from '../models/User.model';
import {
  deriveRotatedRefreshJti,
  generateTokenPair,
  signAccessToken,
  signRotatedRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../services/jwt.service';
import { refreshUserKey } from '../services/refresh-rate-limit';
import {
  createSession,
  deleteAllUserSessions,
  deleteOtherUserSessions,
  hashToken,
  rotateRefreshSession,
  validateSession,
} from '../services/session.service';

import {
  PASSWORD,
  advanceClock,
  bearer,
  graceKeys,
  liveRefreshKeys,
  refreshReq,
  resetClock,
  tokensOf,
  uniq,
} from './t616b-helpers';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

interface Minted {
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}

const claimsFor = (userId: string, email: string, pv?: string) => ({
  sub: userId,
  email,
  name: 'T616b Person',
  role: 'Client' as never,
  plan: 'free' as never,
  ...(pv ? { pv } : {}),
});

/** A Google-style user (no bcrypt) with a session made exactly as a sign-in does. */
async function mintFor(userId: string, email: string, pv?: string): Promise<Minted> {
  const tokens = generateTokenPair(claimsFor(userId, email, pv));
  await createSession(userId, tokens.accessToken, tokens.refreshToken, {
    plan: 'free',
    email,
    role: 'Client',
    name: 'T616b Person',
  });
  return { userId, email, ...tokens };
}

async function newUser(extra: Record<string, unknown> = {}) {
  const email = `t616b-${uniq()}@example.com`;
  const u = await User.create({
    email,
    name: 'T616b Person',
    authProvider: 'google',
    googleId: `g-${uniq()}`,
    ...extra,
  });
  return { userId: String(u._id), email };
}

async function mint(extra: Record<string, unknown> = {}): Promise<Minted> {
  const { userId, email } = await newUser(extra);
  return mintFor(userId, email);
}

/** Another independent sign-in (own family) for a user that already exists. */
async function mintMore(s: Minted): Promise<Minted> {
  return mintFor(s.userId, s.email);
}

const aKey = (uid: string, token: string) => sessionKey(uid, hashToken(token));
const rKey = (uid: string, token: string) => refreshSessionKey(uid, hashToken(token));
const sessionKeysOf = (uid: string) => redis.keys(`session:*${uid}*`);
const rows = (uid: string) => Session.find({ userId: uid }).lean();

async function refreshOk(token: string): Promise<Pick<Minted, 'accessToken' | 'refreshToken'>> {
  const res = await refreshReq(token);
  expect(res.status).toBe(200);
  return tokensOf(res.body);
}

/** Rewrite the refresh record's anchor (undefined removes it), keeping its TTL. */
async function setAnchor(s: Minted, anchorMs: number | undefined): Promise<void> {
  const key = rKey(s.userId, s.refreshToken);
  const rec = JSON.parse((await redis.get(key)) as string) as Record<string, unknown>;
  if (anchorMs === undefined) delete rec.originalCreatedAt;
  else rec.originalCreatedAt = anchorMs;
  await redis.set(key, JSON.stringify(rec), 'EX', Math.max(1, await redis.ttl(key)));
}

beforeEach(async () => {
  await redis.flushall();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
});
afterEach(() => {
  resetClock();
  jest.restoreAllMocks();
});

// ── (a) grace replay ────────────────────────────────────────────────────────────────────────
describe('T-616b (a) rotation with a 30 s grace', () => {
  it('constants are the signed values', () => {
    expect(REFRESH_GRACE_SECONDS).toBe(30);
    expect(SESSION_TTL_HOURS).toBe(12);
    expect(SESSION_ABSOLUTE_DAYS).toBe(7);
    expect(REFRESH_RATE_LIMIT).toEqual({ max: 60, windowSeconds: 900 });
  });

  it('first presentation: new pair, a grace record at the old key (TTL <= 30), old access key kept for <= 30 s', async () => {
    const s = await mint();
    const res = await refreshReq(s.refreshToken);
    expect(res.status).toBe(200);
    const next = tokensOf(res.body);
    expect(next.refreshToken).not.toBe(s.refreshToken);
    expect(next.accessToken).not.toBe(s.accessToken);

    const graceKey = rKey(s.userId, s.refreshToken);
    expect(graceKey).toBe(`session:refresh:${s.userId}:${hashToken(s.refreshToken)}`);
    const graceTtl = await redis.ttl(graceKey);
    expect(graceTtl).toBeGreaterThan(0);
    expect(graceTtl).toBeLessThanOrEqual(30);
    expect(await graceKeys(s.userId)).toEqual([graceKey]);

    // The old ACCESS key is not deleted; its TTL is min(30 s, JWT remaining)
    const oldTtl = await redis.ttl(aKey(s.userId, s.accessToken));
    expect(oldTtl).toBeGreaterThan(0);
    expect(oldTtl).toBeLessThanOrEqual(30);
    expect(await validateSession(s.userId, hashToken(s.accessToken))).not.toBeNull();

    // New keys: refresh 12 h, access the JWT's real remaining life (900 s, not 24 h)
    const newRefreshTtl = await redis.ttl(rKey(s.userId, next.refreshToken));
    expect(newRefreshTtl).toBeGreaterThan(SESSION_TTL_HOURS * 3600 - 10);
    expect(newRefreshTtl).toBeLessThanOrEqual(SESSION_TTL_HOURS * 3600);
    const newAccessTtl = await redis.ttl(aKey(s.userId, next.accessToken));
    expect(newAccessTtl).toBeGreaterThan(880);
    expect(newAccessTtl).toBeLessThanOrEqual(900);
  });

  it('the grace record holds only nonce, new refresh hash, session id, iat/exp and identity claims: no token, no secret', async () => {
    const s = await mint();
    const next = await refreshOk(s.refreshToken);
    const raw = (await redis.get(rKey(s.userId, s.refreshToken))) as string;
    const rec = JSON.parse(raw) as Record<string, unknown> & { c: Record<string, unknown> };

    // `p` (the hash the old token was itself rotated from) is optional; a sign-in's first
    // rotation has no predecessor, so it is absent here (the chain case is in t616b-revoke-races).
    expect(
      Object.keys(rec)
        .filter((k) => k !== 'p')
        .sort(),
    ).toEqual(['c', 'exp', 'g', 'h', 'iat', 'n', 's']);
    expect(rec.p).toBeUndefined();
    expect(rec.g).toBe(1);
    expect(rec.n).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.h).toBe(hashToken(next.refreshToken));
    const decoded = jwt.decode(next.refreshToken) as jwt.JwtPayload;
    expect(rec.iat).toBe(decoded.iat);
    expect(rec.exp).toBe(decoded.exp);
    const [row] = await rows(s.userId);
    expect(rec.s).toBe(String(row._id));
    const allowed = ['sub', 'email', 'name', 'role', 'plan', 'pv'];
    expect(Object.keys(rec.c).every((k) => allowed.includes(k))).toBe(true);
    expect(rec.c.sub).toBe(s.userId);

    for (const secretish of [
      s.accessToken,
      s.refreshToken,
      next.accessToken,
      next.refreshToken,
      hashToken(s.accessToken),
      hashToken(next.accessToken),
      env.JWT_SECRET,
      env.JWT_REFRESH_SECRET,
      deriveRotatedRefreshJti(hashToken(s.refreshToken), rec.n as string),
    ]) {
      expect(raw).not.toContain(secretish);
    }
  });

  it('replay inside the window: identical refresh token, a new access token, one Session row, one family', async () => {
    const s = await mint();
    const first = await refreshOk(s.refreshToken);
    advanceClock(10);
    const second = await refreshOk(s.refreshToken);

    expect(second.refreshToken).toBe(first.refreshToken);
    expect(second.accessToken).not.toBe(first.accessToken);
    expect(verifyAccessToken(second.accessToken).sub).toBe(s.userId);
    expect(verifyRefreshToken(second.refreshToken).sub).toBe(s.userId);

    // the replay's access session is live, points at the same (single) refresh token, real TTL
    const sess = await validateSession(s.userId, hashToken(second.accessToken));
    expect(sess?.refreshTokenHash).toBe(hashToken(first.refreshToken));
    const ttl = await redis.ttl(aKey(s.userId, second.accessToken));
    expect(ttl).toBeGreaterThan(880);
    expect(ttl).toBeLessThanOrEqual(900);

    expect(await liveRefreshKeys(s.userId)).toEqual([rKey(s.userId, first.refreshToken)]);
    expect(await graceKeys(s.userId)).toHaveLength(1);
    const r = await rows(s.userId);
    expect(r).toHaveLength(1);
    expect(r[0].refreshTokenHash).toBe(hashToken(first.refreshToken));
    // the pre-rotation Session row is gone
    expect(r.find((x) => x.jwtTokenHash === hashToken(s.accessToken))).toBeUndefined();
  });

  it('a replay never extends the grace record or the old access key', async () => {
    const s = await mint();
    await refreshOk(s.refreshToken);
    advanceClock(20);
    await refreshOk(s.refreshToken);
    expect(await redis.ttl(rKey(s.userId, s.refreshToken))).toBeLessThanOrEqual(10);
    expect(await redis.ttl(aKey(s.userId, s.accessToken))).toBeLessThanOrEqual(10);
  });

  it('after the window the spent token is 401 (and issues nothing), the rotated one still works', async () => {
    const s = await mint();
    const first = await refreshOk(s.refreshToken);
    advanceClock(REFRESH_GRACE_SECONDS + 1);
    const before = (await redis.keys('session:*')).sort();
    const dead = await refreshReq(s.refreshToken);
    expect(dead.status).toBe(401);
    expect(dead.body.message).toBe('Invalid or expired refresh token');
    expect(JSON.stringify(dead.body)).not.toContain(first.refreshToken);
    expect((await redis.keys('session:*')).sort()).toEqual(before);
    expect(await rows(s.userId)).toHaveLength(1);
    expect(await validateSession(s.userId, hashToken(s.accessToken))).toBeNull();
    expect((await refreshReq(first.refreshToken)).status).toBe(200);
  });

  it('N parallel refreshes with one token: one distinct refresh token, one Session row, N access tokens', async () => {
    const s = await mint();
    const N = 6;
    const results = await Promise.all(Array.from({ length: N }, () => refreshReq(s.refreshToken)));
    expect(results.map((r) => r.status)).toEqual(Array(N).fill(200));
    const toks = results.map((r) => tokensOf(r.body));
    expect(new Set(toks.map((t) => t.refreshToken)).size).toBe(1);
    expect(new Set(toks.map((t) => t.accessToken)).size).toBe(N);
    expect(toks[0].refreshToken).not.toBe(s.refreshToken);
    expect(await rows(s.userId)).toHaveLength(1);
    expect(await liveRefreshKeys(s.userId)).toHaveLength(1);
    expect(await graceKeys(s.userId)).toHaveLength(1);
    for (const t of toks) {
      expect(await validateSession(s.userId, hashToken(t.accessToken))).not.toBeNull();
    }
  });

  it('CAS: parallel first presentations through the service, exactly one rotates, the rest replay', async () => {
    const s = await mint();
    const input = () => ({
      userId: s.userId,
      oldRefreshHash: hashToken(s.refreshToken),
      claims: claimsFor(s.userId, s.email),
      userInfo: { plan: 'free', email: s.email, role: 'Client', name: 'T616b Person' },
    });
    const out = await Promise.all(Array.from({ length: 8 }, () => rotateRefreshSession(input())));
    expect(out.filter((o) => o.kind === 'rotated')).toHaveLength(1);
    expect(out.filter((o) => o.kind === 'replayed')).toHaveLength(7);
    const tokens = out.map((o) =>
      o.kind === 'rotated' || o.kind === 'replayed' ? o.refreshToken : '',
    );
    expect(new Set(tokens).size).toBe(1);
    expect(await rows(s.userId)).toHaveLength(1);
    expect(await liveRefreshKeys(s.userId)).toHaveLength(1);
  });

  it('CAS: a revoke between the read and the script is not undone by the rotation', async () => {
    const s = await mint();
    const oldKey = rKey(s.userId, s.refreshToken);
    const realGet = redis.get.bind(redis);
    let hit = false;
    jest.spyOn(redis, 'get').mockImplementation((async (k: string) => {
      const v = await realGet(k);
      if (k === oldKey && !hit) {
        hit = true;
        await redis.del(oldKey); // logout / revoke lands right after the read
      }
      return v;
    }) as never);
    const out = await rotateRefreshSession({
      userId: s.userId,
      oldRefreshHash: hashToken(s.refreshToken),
      claims: claimsFor(s.userId, s.email),
      userInfo: { plan: 'free', email: s.email, role: 'Client', name: 'T616b Person' },
    });
    expect(hit).toBe(true);
    expect(out.kind).toBe('invalid');
    expect(await redis.exists(oldKey)).toBe(0);
    // only the original access key remains: nothing was resurrected or issued
    expect(await redis.keys('session:*')).toEqual([aKey(s.userId, s.accessToken)]);
  });

  it("CAS: a logout between a replay's read and its script writes no access key", async () => {
    const s = await mint();
    const first = await refreshOk(s.refreshToken);
    const successorKey = rKey(s.userId, first.refreshToken);
    const realGet = redis.get.bind(redis);
    let hit = false;
    jest.spyOn(redis, 'get').mockImplementation((async (k: string) => {
      const v = await realGet(k);
      if (k === successorKey && !hit) {
        hit = true;
        await redis.del(successorKey);
      }
      return v;
    }) as never);
    const accessBefore = (await redis.keys(`session:${s.userId}:*`)).sort();
    const res = await refreshReq(s.refreshToken);
    expect(hit).toBe(true);
    expect(res.status).toBe(401);
    // no access key was written for the replay
    expect((await redis.keys(`session:${s.userId}:*`)).sort()).toEqual(accessBefore);
  });
});

// ── deterministic refresh token ─────────────────────────────────────────────────────────────
describe('T-616b deriveRotatedRefreshJti / signRotatedRefreshToken', () => {
  const oldHash = crypto.createHash('sha256').update('old').digest('hex');
  const nonce = crypto.randomBytes(32).toString('hex');

  it('the jti is HMAC-SHA256(JWT_REFRESH_SECRET, oldHash || nonce), base64url, and deterministic', () => {
    const expected = crypto
      .createHmac('sha256', env.JWT_REFRESH_SECRET)
      .update(oldHash + nonce)
      .digest('base64url');
    expect(deriveRotatedRefreshJti(oldHash, nonce)).toBe(expected);
    expect(deriveRotatedRefreshJti(oldHash, nonce)).toBe(deriveRotatedRefreshJti(oldHash, nonce));
    expect(deriveRotatedRefreshJti(oldHash + 'x', nonce)).not.toBe(expected);
    expect(deriveRotatedRefreshJti(oldHash, nonce + 'x')).not.toBe(expected);
  });

  it('the same inputs give a byte-identical token that verifyRefreshToken accepts', () => {
    const claims = claimsFor('507f1f77bcf86cd799439011', 'det@example.com', '2026-10-15');
    const iat = Math.floor(Date.now() / 1000);
    const inputs = { claims, iat, exp: iat + 3600, jti: deriveRotatedRefreshJti(oldHash, nonce) };
    const a = signRotatedRefreshToken(inputs);
    const b = signRotatedRefreshToken({ ...inputs, claims: { ...claims } });
    expect(a).toBe(b);
    const v = verifyRefreshToken(a);
    expect(v.type).toBe('refresh');
    expect(v.sub).toBe(claims.sub);
    expect(v.email).toBe(claims.email);
    expect(v.pv).toBe('2026-10-15');
    const d = jwt.decode(a) as jwt.JwtPayload;
    expect(d.iat).toBe(iat);
    expect(d.exp).toBe(iat + 3600);
    expect(d.jti).toBe(inputs.jti);
    // header and payload key order is fixed: a different iat or jti changes the token
    expect(signRotatedRefreshToken({ ...inputs, jti: 'other' })).not.toBe(a);
    expect(signRotatedRefreshToken({ ...inputs, iat: iat + 1 })).not.toBe(a);
  });

  it('pv is left out when the user has none; the token is not an access token', () => {
    const claims = claimsFor('507f1f77bcf86cd799439011', 'det2@example.com');
    const iat = Math.floor(Date.now() / 1000);
    const t = signRotatedRefreshToken({ claims, iat, exp: iat + 60, jti: 'j' });
    expect(jwt.decode(t)).not.toHaveProperty('pv');
    expect(() => verifyAccessToken(t)).toThrow();
  });

  it('an expired rotated token is rejected by verifyRefreshToken', () => {
    const claims = claimsFor('507f1f77bcf86cd799439011', 'det3@example.com');
    const iat = Math.floor(Date.now() / 1000) - 100;
    const t = signRotatedRefreshToken({ claims, iat, exp: iat + 10, jti: 'j' });
    expect(() => verifyRefreshToken(t)).toThrow();
  });
});

// ── (d) revocation ──────────────────────────────────────────────────────────────────────────
describe('T-616b (d) the grace record and the whole family die with the session', () => {
  const logout = (t: string) => supertest(app).post('/logout').set(bearer(t));

  async function expectFamilyDead(s: Minted, next: { refreshToken: string }) {
    expect(await sessionKeysOf(s.userId)).toEqual([]);
    expect((await refreshReq(s.refreshToken)).status).toBe(401);
    expect((await refreshReq(next.refreshToken)).status).toBe(401);
    expect(await rows(s.userId)).toHaveLength(0);
  }

  it('logout with the new access token: a replay of the old token is 401', async () => {
    const s = await mint();
    const next = await refreshOk(s.refreshToken);
    expect((await logout(next.accessToken)).status).toBe(200);
    await expectFamilyDead(s, next);
  });

  it('logout with the pre-rotation access token (still alive inside the window) kills the new refresh token too', async () => {
    const s = await mint();
    const next = await refreshOk(s.refreshToken);
    expect((await logout(s.accessToken)).status).toBe(200);
    await expectFamilyDead(s, next);
    expect(await validateSession(s.userId, hashToken(next.accessToken))).toBeNull();
  });

  it('logout with a grace-replay access token kills the whole family: first and replay access keys, grace, refresh', async () => {
    const s = await mint();
    const first = await refreshOk(s.refreshToken);
    const replay = await refreshOk(s.refreshToken);
    const replay2 = await refreshOk(s.refreshToken);
    expect(replay.refreshToken).toBe(first.refreshToken);
    expect((await logout(replay.accessToken)).status).toBe(200);
    for (const t of [s.accessToken, first.accessToken, replay.accessToken, replay2.accessToken]) {
      expect(await validateSession(s.userId, hashToken(t))).toBeNull();
      expect((await supertest(app).get('/me').set(bearer(t))).status).toBe(401);
    }
    await expectFamilyDead(s, first);
  });

  it('logout only touches its own family', async () => {
    const s = await mint();
    const other = await mintMore(s);
    const next = await refreshOk(s.refreshToken);
    expect((await logout(next.accessToken)).status).toBe(200);
    expect(await validateSession(s.userId, hashToken(other.accessToken))).not.toBeNull();
    expect((await refreshReq(other.refreshToken)).status).toBe(200);
  });

  it('DELETE /me/sessions/:id revokes the family of that row (grace, replay keys included)', async () => {
    const s = await mint();
    const other = await mintMore(s);
    const next = await refreshOk(s.refreshToken);
    const replay = await refreshOk(s.refreshToken);
    const row = await Session.findOne({
      userId: s.userId,
      refreshTokenHash: hashToken(next.refreshToken),
    }).lean();
    const del = await supertest(app)
      .delete(`/me/sessions/${String(row!._id)}`)
      .set(bearer(other.accessToken));
    expect(del.status).toBe(200);
    expect(await validateSession(s.userId, hashToken(replay.accessToken))).toBeNull();
    expect(await validateSession(s.userId, hashToken(s.accessToken))).toBeNull();
    expect((await refreshReq(s.refreshToken)).status).toBe(401);
    expect((await refreshReq(next.refreshToken)).status).toBe(401);
    expect(await graceKeys(s.userId)).toEqual([]);
    expect((await refreshReq(other.refreshToken)).status).toBe(200);
  });

  it('revoke-all (deleteAllUserSessions) clears grace records: replay is 401', async () => {
    const s = await mint();
    const second = await mintMore(s);
    const next = await refreshOk(s.refreshToken);
    const next2 = await refreshOk(second.refreshToken);
    expect(await graceKeys(s.userId)).toHaveLength(2);
    await deleteAllUserSessions(s.userId);
    expect(await sessionKeysOf(s.userId)).toEqual([]);
    expect((await refreshReq(s.refreshToken)).status).toBe(401);
    expect((await refreshReq(second.refreshToken)).status).toBe(401);
    expect((await refreshReq(next.refreshToken)).status).toBe(401);
    expect((await refreshReq(next2.refreshToken)).status).toBe(401);
  });

  it('a user who got a reset or Google-link revoke-all cannot replay inside the window', async () => {
    const s = await mint();
    await refreshOk(s.refreshToken);
    const stranger = await mint();
    await deleteAllUserSessions(s.userId);
    expect((await refreshReq(s.refreshToken)).status).toBe(401);
    // another user's sessions are untouched
    expect((await refreshReq(stranger.refreshToken)).status).toBe(200);
  });

  describe('password change (deleteOtherUserSessions)', () => {
    it("keeps the caller's whole family (new, grace, pre-rotation and replay access keys) and revokes the others", async () => {
      const s = await mint();
      const keepFirst = await refreshOk(s.refreshToken);
      const keepReplay = await refreshOk(s.refreshToken);
      const other = await mintMore(s);
      const otherNext = await refreshOk(other.refreshToken);

      const revoked = await deleteOtherUserSessions(s.userId, hashToken(keepFirst.accessToken));
      // one other sign-in; its grace record and second access key are not extra sessions
      expect(revoked).toBe(1);

      // kept: refresh record, grace record, all three access keys
      expect(await redis.exists(rKey(s.userId, keepFirst.refreshToken))).toBe(1);
      expect(await redis.exists(rKey(s.userId, s.refreshToken))).toBe(1);
      for (const t of [s.accessToken, keepFirst.accessToken, keepReplay.accessToken]) {
        expect(await validateSession(s.userId, hashToken(t))).not.toBeNull();
      }
      expect((await refreshReq(s.refreshToken)).status).toBe(200);
      expect((await refreshReq(keepFirst.refreshToken)).status).toBe(200);
      // gone: the other family completely
      expect(await validateSession(s.userId, hashToken(other.accessToken))).toBeNull();
      expect(await validateSession(s.userId, hashToken(otherNext.accessToken))).toBeNull();
      expect((await refreshReq(other.refreshToken)).status).toBe(401);
      expect((await refreshReq(otherNext.refreshToken)).status).toBe(401);
      expect(await rows(s.userId)).toHaveLength(1);
    });

    it('keeps the family when the caller holds the PRE-rotation or a replay access token', async () => {
      const s = await mint();
      const next = await refreshOk(s.refreshToken);
      const replay = await refreshOk(s.refreshToken);
      const other = await mintMore(s);
      expect(await deleteOtherUserSessions(s.userId, hashToken(s.accessToken))).toBe(1);
      expect(await redis.exists(rKey(s.userId, next.refreshToken))).toBe(1);
      expect(await validateSession(s.userId, hashToken(replay.accessToken))).not.toBeNull();
      expect(await validateSession(s.userId, hashToken(other.accessToken))).toBeNull();

      expect(await deleteOtherUserSessions(s.userId, hashToken(replay.accessToken))).toBe(0);
      expect(await redis.exists(rKey(s.userId, next.refreshToken))).toBe(1);
    });

    it('counts signed-out sessions, not grace records or extra access keys; counts an idle (access expired) one', async () => {
      const s = await mint();
      const keep = await refreshOk(s.refreshToken);
      const a = await mintMore(s); // plain
      const b = await mintMore(s); // rotated once
      await refreshOk(b.refreshToken);
      const c = await mintMore(s); // rotated and replayed
      await refreshOk(c.refreshToken);
      await refreshOk(c.refreshToken);
      const d = await mintMore(s); // idle: access key expired, refresh key alive
      await redis.del(aKey(s.userId, d.accessToken));
      expect(a.userId).toBe(s.userId);
      expect(await graceKeys(s.userId)).toHaveLength(3);

      expect(await deleteOtherUserSessions(s.userId, hashToken(keep.accessToken))).toBe(4);
      expect((await sessionKeysOf(s.userId)).sort()).toEqual(
        [
          aKey(s.userId, s.accessToken),
          aKey(s.userId, keep.accessToken),
          rKey(s.userId, s.refreshToken),
          rKey(s.userId, keep.refreshToken),
        ].sort(),
      );
    });

    it('POST /me/password: revokedSessions counts right, the caller keeps refreshing, the others are 401', async () => {
      const email = `t616b-pw-${uniq()}@example.com`;
      await User.create({ email, name: 'Pw Person', password: PASSWORD });
      const login = async () => {
        const r = await supertest(app).post('/login').send({ email, password: PASSWORD });
        expect(r.status).toBe(200);
        return tokensOf(r.body);
      };
      const cur = await login();
      const other = await login();
      const curNext = await refreshOk(cur.refreshToken);
      const otherNext = await refreshOk(other.refreshToken);

      const res = await supertest(app)
        .post('/me/password')
        .set(bearer(curNext.accessToken))
        .send({ currentPassword: PASSWORD, newPassword: 'BrandNew1pass' });
      expect(res.status).toBe(200);
      expect(res.body.data.revokedSessions).toBe(1);

      // the replay first: once curNext is rotated again the old token's successor has moved on
      const replay = await refreshOk(cur.refreshToken);
      expect(replay.refreshToken).toBe(curNext.refreshToken);
      expect((await refreshReq(curNext.refreshToken)).status).toBe(200);
      expect((await refreshReq(other.refreshToken)).status).toBe(401);
      expect((await refreshReq(otherNext.refreshToken)).status).toBe(401);
    });
  });

  it('erase (DELETE /me) removes the grace record too', async () => {
    const email = `t616b-er-${uniq()}@example.com`;
    await User.create({ email, name: 'Erase Person', password: PASSWORD });
    const login = await supertest(app).post('/login').send({ email, password: PASSWORD });
    const t = tokensOf(login.body);
    const uid = String((await User.findOne({ email }).lean())!._id);
    const next = await refreshOk(t.refreshToken);
    const bystander = await mint();
    expect(await graceKeys(uid)).toHaveLength(1);

    global.fetch = jest.fn(async (url: string) => ({
      status: 200,
      json: async () =>
        String(url).includes('subscription-status')
          ? { active: false, status: 'none' }
          : { ok: true, counts: {} },
    })) as unknown as typeof fetch;
    const res = await supertest(app)
      .delete('/me')
      .set(bearer(next.accessToken))
      .send({ password: PASSWORD });
    expect(res.status).toBe(200);

    expect(await sessionKeysOf(uid)).toEqual([]);
    expect(await redis.keys(`session:refresh:${uid}:*`)).toEqual([]);
    expect((await refreshReq(t.refreshToken)).status).toBe(401);
    expect((await refreshReq(next.refreshToken)).status).toBe(401);
    expect(await sessionKeysOf(bystander.userId)).not.toEqual([]);
  });
});

// ── (c) sliding TTL and absolute ceiling ───────────────────────────────────────────────────
describe('T-616b (c) sliding 12 h, absolute 7 days', () => {
  const NOW = 1_800_000_000_000;
  const freeze = () => jest.spyOn(Date, 'now').mockReturnValue(NOW);

  it('a sign-in stamps originalCreatedAt on both the refresh record and the Session row', async () => {
    freeze();
    const s = await mint();
    const rec = JSON.parse((await redis.get(rKey(s.userId, s.refreshToken))) as string);
    expect(rec.originalCreatedAt).toBe(NOW);
    const [row] = await rows(s.userId);
    expect(row.originalCreatedAt!.getTime()).toBe(NOW);
    expect(row.expiresAt.getTime()).toBe(NOW + SESSION_TTL_HOURS * HOUR_MS);
    expect(await redis.ttl(rKey(s.userId, s.refreshToken))).toBe(SESSION_TTL_HOURS * 3600);
  });

  it('each rotation gives 12 h again, and carries the anchor unchanged through a chain', async () => {
    freeze();
    const s = await mint();
    let token = s.refreshToken;
    for (let i = 0; i < 3; i++) {
      const next = await refreshOk(token);
      const rec = JSON.parse((await redis.get(rKey(s.userId, next.refreshToken))) as string);
      expect(rec.originalCreatedAt).toBe(NOW);
      expect(await redis.ttl(rKey(s.userId, next.refreshToken))).toBe(SESSION_TTL_HOURS * 3600);
      const row = await Session.findOne({
        userId: s.userId,
        refreshTokenHash: hashToken(next.refreshToken),
      }).lean();
      expect(row!.originalCreatedAt!.getTime()).toBe(NOW);
      expect(row!.expiresAt.getTime()).toBe(NOW + SESSION_TTL_HOURS * HOUR_MS);
      const d = jwt.decode(next.refreshToken) as jwt.JwtPayload;
      expect(d.exp! - d.iat!).toBe(SESSION_TTL_HOURS * 3600);
      token = next.refreshToken;
    }
  });

  it('sliding TTL is capped by the remaining absolute time: Session.expiresAt = min(sliding, absolute)', async () => {
    freeze();
    const s = await mint();
    const anchor = NOW - 6.9 * DAY_MS; // 0.1 day = 8640 s left
    await setAnchor(s, anchor);
    const next = await refreshOk(s.refreshToken);
    const remaining = Math.floor((anchor + SESSION_ABSOLUTE_DAYS * DAY_MS - NOW) / 1000);
    expect(remaining).toBe(8640);
    expect(await redis.ttl(rKey(s.userId, next.refreshToken))).toBe(remaining);
    const row = await Session.findOne({
      userId: s.userId,
      refreshTokenHash: hashToken(next.refreshToken),
    }).lean();
    expect(row!.expiresAt.getTime()).toBe(anchor + SESSION_ABSOLUTE_DAYS * DAY_MS);
    expect(row!.originalCreatedAt!.getTime()).toBe(anchor);
    const d = jwt.decode(next.refreshToken) as jwt.JwtPayload;
    expect(d.exp! - d.iat!).toBe(remaining);
    // the grace record carries the capped exp, so a replay returns the same capped token
    const replay = await refreshOk(s.refreshToken);
    expect(replay.refreshToken).toBe(next.refreshToken);
  });

  it('with more than 12 h of ceiling left the sliding 12 h wins', async () => {
    freeze();
    const s = await mint();
    await setAnchor(s, NOW - 6 * DAY_MS); // 24 h left
    const next = await refreshOk(s.refreshToken);
    expect(await redis.ttl(rKey(s.userId, next.refreshToken))).toBe(SESSION_TTL_HOURS * 3600);
  });

  it('401 when now - anchor >= 7 days (exactly 7 days included); nothing issued, nothing written', async () => {
    freeze();
    const s = await mint();
    await setAnchor(s, NOW - SESSION_ABSOLUTE_DAYS * DAY_MS);
    const before = (await redis.keys('session:*')).sort();
    const res = await refreshReq(s.refreshToken);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid or expired refresh token');
    expect((await redis.keys('session:*')).sort()).toEqual(before);
    expect(await rows(s.userId)).toHaveLength(1);
    expect(await graceKeys(s.userId)).toEqual([]);
  });

  it('one second inside the ceiling still refreshes, for exactly one second', async () => {
    freeze();
    const s = await mint();
    await setAnchor(s, NOW - SESSION_ABSOLUTE_DAYS * DAY_MS + 1000);
    const next = await refreshOk(s.refreshToken);
    expect(await redis.ttl(rKey(s.userId, next.refreshToken))).toBe(1);
  });

  it('over real elapsed time: rows never outlive anchor + 7 days, and the chain ends in 401', async () => {
    const s = await mint();
    const [first] = await rows(s.userId);
    const anchor = first.originalCreatedAt!.getTime();
    let token = s.refreshToken;
    let lastStatus = 200;
    for (let i = 0; i < 20 && lastStatus === 200; i++) {
      advanceClock(11 * 3600);
      const res = await refreshReq(token);
      lastStatus = res.status;
      if (res.status === 200) {
        token = tokensOf(res.body).refreshToken;
        const row = await Session.findOne({
          userId: s.userId,
          refreshTokenHash: hashToken(token),
        }).lean();
        expect(row!.expiresAt.getTime()).toBeLessThanOrEqual(
          anchor + SESSION_ABSOLUTE_DAYS * DAY_MS,
        );
        expect(row!.originalCreatedAt!.getTime()).toBe(anchor);
      }
    }
    expect(lastStatus).toBe(401);
  });

  it('legacy session without originalCreatedAt still refreshes and is stamped at that refresh, then stays stamped', async () => {
    freeze();
    const s = await mint();
    await setAnchor(s, undefined);
    const first = await refreshOk(s.refreshToken);
    const rec = JSON.parse((await redis.get(rKey(s.userId, first.refreshToken))) as string);
    expect(rec.originalCreatedAt).toBe(NOW);
    const row = await Session.findOne({
      userId: s.userId,
      refreshTokenHash: hashToken(first.refreshToken),
    }).lean();
    expect(row!.originalCreatedAt!.getTime()).toBe(NOW);
    expect(row!.expiresAt.getTime()).toBe(NOW + SESSION_TTL_HOURS * HOUR_MS);
    const second = await refreshOk(first.refreshToken);
    const rec2 = JSON.parse((await redis.get(rKey(s.userId, second.refreshToken))) as string);
    expect(rec2.originalCreatedAt).toBe(NOW);
  });

  it('mid-deploy: records written by the old code (7-day refresh JWT, bare {accessTokenHash}) still refresh', async () => {
    const { userId, email } = await newUser();
    const claims = claimsFor(userId, email);
    const accessToken = signAccessToken(claims);
    const oldRefresh = jwt.sign({ ...claims, type: 'refresh' }, env.JWT_REFRESH_SECRET, {
      expiresIn: '7d',
      jwtid: crypto.randomUUID(),
    });
    await redis.set(
      aKey(userId, accessToken),
      JSON.stringify({
        refreshTokenHash: hashToken(oldRefresh),
        plan: 'free',
        email,
        role: 'Client',
        name: 'T616b Person',
        createdAt: new Date().toISOString(),
      }),
      'EX',
      86_400,
    );
    await redis.set(
      rKey(userId, oldRefresh),
      JSON.stringify({ accessTokenHash: hashToken(accessToken) }),
      'EX',
      604_800,
    );

    const next = await refreshOk(oldRefresh);
    const d = jwt.decode(next.refreshToken) as jwt.JwtPayload;
    expect(d.exp! - d.iat!).toBe(SESSION_TTL_HOURS * 3600);
    expect((await refreshReq(oldRefresh)).status).toBe(200); // replay, same token
    expect(await redis.ttl(aKey(userId, accessToken))).toBeLessThanOrEqual(30);
    const rec = JSON.parse((await redis.get(rKey(userId, next.refreshToken))) as string);
    expect(typeof rec.originalCreatedAt).toBe('number');
    expect(rec.authAt).toBeUndefined();
    expect((await refreshReq(next.refreshToken)).status).toBe(200);
  });

  it('authAt (T-115c) is carried through a rotation and a replay, never made newer', async () => {
    const { userId, email } = await newUser();
    const tokens = generateTokenPair(claimsFor(userId, email));
    const authAt = new Date(Date.now() - 20 * 60_000).toISOString();
    await createSession(
      userId,
      tokens.accessToken,
      tokens.refreshToken,
      { plan: 'free', email, role: 'Client', name: 'T616b Person' },
      { authAt },
    );
    const next = await refreshOk(tokens.refreshToken);
    const replay = await refreshOk(tokens.refreshToken);
    const rec = JSON.parse((await redis.get(rKey(userId, next.refreshToken))) as string);
    expect(rec.authAt).toBe(authAt);
    for (const t of [next, replay]) {
      expect((await validateSession(userId, hashToken(t.accessToken)))?.authAt).toBe(authAt);
    }
  });
});

// ── (b) limiter ─────────────────────────────────────────────────────────────────────────────
describe('T-616b (b) per-user limiter on POST /refresh', () => {
  it('the key is auth:refresh:user:<uid>, a counter with a 900 s TTL', async () => {
    const s = await mint();
    expect(refreshUserKey(s.userId)).toBe(`auth:refresh:user:${s.userId}`);
    await refreshOk(s.refreshToken);
    expect(await redis.get(`auth:refresh:user:${s.userId}`)).toBe('1');
    const ttl = await redis.ttl(`auth:refresh:user:${s.userId}`);
    expect(ttl).toBeGreaterThan(890);
    expect(ttl).toBeLessThanOrEqual(900);
  });

  it('60 calls in 900 s pass (the first rotates, 59 are grace replays that count); the 61st is 429', async () => {
    const s = await mint();
    const first = await refreshOk(s.refreshToken);
    for (let i = 1; i < 60; i++) {
      const r = await refreshReq(s.refreshToken);
      expect(r.status).toBe(200);
      expect(r.body.data.refreshToken).toBe(first.refreshToken);
    }
    expect(await redis.get(`auth:refresh:user:${s.userId}`)).toBe('60');
    const r61 = await refreshReq(s.refreshToken);
    expect(r61.status).toBe(429);
    // refused calls are given back: they do not grow the counter
    expect(await redis.get(`auth:refresh:user:${s.userId}`)).toBe('60');
    expect(r61.headers['retry-after']).toBeDefined();
    const retry = Number(r61.headers['retry-after']);
    expect(retry).toBeGreaterThanOrEqual(1);
    expect(retry).toBeLessThanOrEqual(900);
    expect(r61.body).toEqual({
      status: 'error',
      error: 'rate_limited',
      message: expect.stringMatching(/^Too many requests\. Please wait .*, then try again\.$/),
      retryAfter: retry,
    });
    expect(JSON.stringify(r61.body)).not.toContain(first.refreshToken);
  });

  it('429 does not consume the token: the record is untouched and the same token rotates once the window passes', async () => {
    const s = await mint();
    const key = `auth:refresh:user:${s.userId}`;
    await redis.set(key, String(REFRESH_RATE_LIMIT.max), 'PX', 120_000);
    const before = (await redis.keys('session:*')).sort();
    const rawBefore = await redis.get(rKey(s.userId, s.refreshToken));

    const res = await refreshReq(s.refreshToken);
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBe('120');
    expect(res.body).toEqual({
      status: 'error',
      error: 'rate_limited',
      message: 'Too many requests. Please wait 2 minutes, then try again.',
      retryAfter: 120,
    });
    expect((await redis.keys('session:*')).sort()).toEqual(before);
    expect(await redis.get(rKey(s.userId, s.refreshToken))).toBe(rawBefore); // not a grace record
    expect(await graceKeys(s.userId)).toEqual([]);
    expect(await rows(s.userId)).toHaveLength(1);
    expect(await redis.get(key)).toBe(String(REFRESH_RATE_LIMIT.max));

    advanceClock(121);
    const ok = await refreshReq(s.refreshToken);
    expect(ok.status).toBe(200);
    expect(await graceKeys(s.userId)).toHaveLength(1); // this was the FIRST rotation
  });

  it('the limit is per user; another user is not affected', async () => {
    const a = await mint();
    const b = await mint();
    await redis.set(`auth:refresh:user:${a.userId}`, '60', 'PX', 60_000);
    expect((await refreshReq(a.refreshToken)).status).toBe(429);
    expect((await refreshReq(b.refreshToken)).status).toBe(200);
  });

  it('the window resets after 900 s', async () => {
    const s = await mint();
    await redis.set(`auth:refresh:user:${s.userId}`, '60', 'PX', 900_000);
    expect((await refreshReq(s.refreshToken)).status).toBe(429);
    advanceClock(901);
    expect((await refreshReq(s.refreshToken)).status).toBe(200);
  });

  it('it runs after the JWT is verified: a bad token is a 401 and touches no counter', async () => {
    const s = await mint();
    await redis.set(`auth:refresh:user:${s.userId}`, '60', 'PX', 60_000);
    const bad = await refreshReq('not.a.jwt');
    expect(bad.status).toBe(401);
    expect(bad.headers['retry-after']).toBeUndefined();
    const forged = jwt.sign({ ...claimsFor(s.userId, s.email), type: 'refresh' }, 'x'.repeat(40));
    expect((await refreshReq(forged)).status).toBe(401);
    expect(await redis.get(`auth:refresh:user:${s.userId}`)).toBe('60');
    expect(await redis.keys('auth:refresh:user:*')).toHaveLength(1);
  });

  it.each(['incr', 'pttl', 'pexpire'] as const)(
    'fails closed when the store fails (%s): 503 service_unavailable, nothing consumed or issued',
    async (method) => {
      const s = await mint();
      const before = (await redis.keys('session:*')).sort();
      const rawBefore = await redis.get(rKey(s.userId, s.refreshToken));
      jest.spyOn(redis, method).mockRejectedValueOnce(new Error('redis down') as never);

      const res = await refreshReq(s.refreshToken);
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: 'service_unavailable' });
      expect(JSON.stringify(res.body)).not.toMatch(/accessToken|refreshToken/);
      expect((await redis.keys('session:*')).sort()).toEqual(before);
      expect(await redis.get(rKey(s.userId, s.refreshToken))).toBe(rawBefore);
      expect(await rows(s.userId)).toHaveLength(1);

      // transient: the same token still works afterwards (first rotation)
      jest.restoreAllMocks();
      await redis.del(`auth:refresh:user:${s.userId}`);
      expect((await refreshReq(s.refreshToken)).status).toBe(200);
    },
  );
});

// ── (e) privacy re-accept shares the rotation ──────────────────────────────────────────────
describe('T-616b (e) privacy re-accept uses rotateRefreshSession', () => {
  const OLD_VERSION = '2026-10-11';
  const accept = (t: string) =>
    supertest(app).post('/me/privacy-acceptance').set(bearer(t)).send({});

  it('accept racing a refresh: both 200, the same refresh token, one history row, one Session row', async () => {
    const { userId, email } = await newUser({ privacyVersion: OLD_VERSION });
    const s = await mintFor(userId, email, OLD_VERSION);
    const [a, r] = await Promise.all([accept(s.accessToken), refreshReq(s.refreshToken)]);
    expect(a.status).toBe(200);
    expect(r.status).toBe(200);
    expect(a.body.data.refreshToken).toBe(r.body.data.refreshToken);
    expect(a.body.data.accessToken).not.toBe(r.body.data.accessToken);
    expect(verifyAccessToken(a.body.data.accessToken).pv).toBe(CURRENT_PRIVACY_VERSION);
    const u = await User.findById(userId).lean();
    expect(u?.privacyHistory).toHaveLength(1);
    expect(u?.privacyVersion).toBe(CURRENT_PRIVACY_VERSION);
    expect(await rows(userId)).toHaveLength(1);
    expect(await liveRefreshKeys(userId)).toHaveLength(1);
    expect(await graceKeys(userId)).toHaveLength(1);
  });

  it('a refresh first, then accept with the pre-rotation access token inside the window: same refresh token', async () => {
    const { userId, email } = await newUser({ privacyVersion: OLD_VERSION });
    const s = await mintFor(userId, email, OLD_VERSION);
    const r = await refreshOk(s.refreshToken);
    const a = await accept(s.accessToken);
    expect(a.status).toBe(200);
    expect(a.body.data.refreshToken).toBe(r.refreshToken);
    expect((await User.findById(userId).lean())?.privacyHistory).toHaveLength(1);
    expect(await rows(userId)).toHaveLength(1);
  });

  it('accept keeps the anchor and the 7-day ceiling', async () => {
    const NOW = 1_800_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    const { userId, email } = await newUser({ privacyVersion: OLD_VERSION });
    const s = await mintFor(userId, email, OLD_VERSION);
    const anchor = NOW - 6.9 * DAY_MS;
    await setAnchor(s, anchor);
    const a = await accept(s.accessToken);
    expect(a.status).toBe(200);
    const row = await Session.findOne({
      userId,
      refreshTokenHash: hashToken(a.body.data.refreshToken),
    }).lean();
    expect(row!.originalCreatedAt!.getTime()).toBe(anchor);
    expect(row!.expiresAt.getTime()).toBe(anchor + SESSION_ABSOLUTE_DAYS * DAY_MS);
  });

  it('accept past the ceiling is 401 and records nothing', async () => {
    const NOW = 1_800_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    const { userId, email } = await newUser({ privacyVersion: OLD_VERSION });
    const s = await mintFor(userId, email, OLD_VERSION);
    await setAnchor(s, NOW - 8 * DAY_MS);
    const a = await accept(s.accessToken);
    expect(a.status).toBe(401);
    const u = await User.findById(userId).lean();
    expect(u?.privacyVersion).toBe(OLD_VERSION);
    expect(u?.privacyHistory ?? []).toHaveLength(0);
  });
});

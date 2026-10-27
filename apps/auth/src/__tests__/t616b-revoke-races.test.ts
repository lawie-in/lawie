/**
 * T-616b round 2 — revocation races (reviewer S1) and the grace-chain link `p` (S2). Real app,
 * in-memory Mongo, ioredis-mock (Lua through its scripting support).
 *
 * "Logout kills everything" is a hard promise: whatever a /refresh or a grace replay does while a
 * logout / revoke-one / revoke-all / password-change is running, nothing of the revoked family
 * may be alive afterwards. The service revokes the refresh and grace side first, in ONE Lua
 * script (REVOKE_FAMILIES_LUA), and only then SCANs and deletes access keys. Real parallelism is
 * not reproducible, so each race is made deterministic by wrapping redis.eval: the wrapper runs
 * the racing request right BEFORE the revoke script (the revoke has already read its family) or
 * right AFTER it (before the access-key SCAN), then lets the script run.
 *
 * No secret is hard-coded; tokens and hashes are generated at runtime.
 */

import './setupEnv';

jest.mock('ioredis', () => jest.requireActual('ioredis-mock'));

import './setupDb';

import { refreshSessionKey, sessionKey } from '@lawie/shared';
import jwt from 'jsonwebtoken';
import supertest from 'supertest';

import app from '../app';
import redis from '../config/redis';
import { Session } from '../models/Session.model';
import { User } from '../models/User.model';
import { generateTokenPair } from '../services/jwt.service';
import {
  createSession,
  deleteAllUserSessions,
  deleteOtherUserSessions,
  hashToken,
  validateSession,
} from '../services/session.service';

import { bearer, refreshReq, resetClock, tokensOf, uniq } from './t616b-helpers';

interface Pair {
  accessToken: string;
  refreshToken: string;
}
interface Minted extends Pair {
  userId: string;
  email: string;
}

const claimsFor = (userId: string, email: string, name: string) => ({
  sub: userId,
  email,
  name,
  role: 'Client' as never,
  plan: 'free' as never,
});

async function newUser(name = 'Race Person') {
  const email = `t616b-race-${uniq()}@example.com`;
  const u = await User.create({ email, name, authProvider: 'google', googleId: `g-${uniq()}` });
  return { userId: String(u._id), email, name };
}

async function mintFor(u: { userId: string; email: string; name: string }): Promise<Minted> {
  const tokens = generateTokenPair(claimsFor(u.userId, u.email, u.name));
  await createSession(u.userId, tokens.accessToken, tokens.refreshToken, {
    plan: 'free',
    email: u.email,
    role: 'Client',
    name: u.name,
  });
  return { userId: u.userId, email: u.email, ...tokens };
}

async function mint(): Promise<Minted> {
  return mintFor(await newUser());
}

/** Another independent sign-in (own family) of the same user. */
const mintMore = (s: Minted) => mintFor({ userId: s.userId, email: s.email, name: 'Race Person' });

const aKey = (uid: string, token: string) => sessionKey(uid, hashToken(token));
const rKey = (uid: string, token: string) => refreshSessionKey(uid, hashToken(token));
const keysOf = async (uid: string) => (await redis.keys(`session:*${uid}*`)).sort();
const rows = (uid: string) => Session.find({ userId: uid }).lean();
const logout = (t: string) => supertest(app).post('/logout').set(bearer(t));

async function refreshOk(token: string): Promise<Pair> {
  const res = await refreshReq(token);
  expect(res.status).toBe(200);
  return tokensOf(res.body);
}

/** s -> p1 -> p2 ... each rotated from the previous refresh token. Returns [s, p1, p2, ...]. */
async function chain(s: Minted, hops: number): Promise<Pair[]> {
  const out: Pair[] = [s];
  for (let i = 0; i < hops; i += 1) out.push(await refreshOk(out[out.length - 1].refreshToken));
  return out;
}

async function rewrite(key: string, edit: (rec: Record<string, unknown>) => void): Promise<void> {
  const rec = JSON.parse((await redis.get(key)) as string) as Record<string, unknown>;
  edit(rec);
  await redis.set(key, JSON.stringify(rec), 'EX', Math.max(1, await redis.ttl(key)));
}

async function expectDead(uid: string, pairs: Pair[]): Promise<void> {
  expect(await keysOf(uid)).toEqual([]);
  for (const p of pairs) {
    expect(await validateSession(uid, hashToken(p.accessToken))).toBeNull();
    expect((await supertest(app).get('/me').set(bearer(p.accessToken))).status).toBe(401);
    expect((await refreshReq(p.refreshToken)).status).toBe(401);
  }
}

interface Hook {
  before?: () => Promise<void>;
  after?: () => Promise<void>;
}

/**
 * Wrap redis.eval so the FIRST call of the revoke script (numkeys 0, the only script without
 * keys) runs `before` ahead of it and `after` behind it. Rotation/replay scripts pass through.
 */
function hookRevokeScript(hook: Hook): { fired: () => boolean } {
  const real = redis.eval.bind(redis) as (...a: unknown[]) => Promise<unknown>;
  let fired = false;
  jest.spyOn(redis, 'eval').mockImplementation(((...args: unknown[]) => {
    const isRevoke = args[1] === 0 && String(args[0]).includes('maxSteps');
    if (!isRevoke || fired) return real(...args);
    fired = true;
    return (async () => {
      await hook.before?.();
      const result = await real(...args);
      await hook.after?.();
      return result;
    })();
  }) as never);
  return { fired: () => fired };
}

beforeEach(async () => {
  await redis.flushall();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
});
afterEach(() => {
  resetClock();
  jest.restoreAllMocks();
});

// ── S1: interleavings ───────────────────────────────────────────────────────────────────────
describe('T-616b S1 logout racing a rotation or a grace replay', () => {
  it('(a) logout with access_A has read A; a ROTATE of A lands before the revoke script: nothing of B survives', async () => {
    const s = await mint();
    let rotated: Pair | undefined;
    const h = hookRevokeScript({
      before: async () => {
        rotated = await refreshOk(s.refreshToken); // A -> B between the read and the script
        expect(await redis.exists(rKey(s.userId, rotated.refreshToken))).toBe(1);
        expect(await validateSession(s.userId, hashToken(rotated.accessToken))).not.toBeNull();
      },
    });
    expect((await logout(s.accessToken)).status).toBe(200);
    expect(h.fired()).toBe(true);
    expect(rotated).toBeDefined();
    expect(await redis.keys('session:*')).toEqual([]);
    expect(await rows(s.userId)).toHaveLength(0);
    await expectDead(s.userId, [s, rotated as Pair]);
  });

  it('(a) the same, with the rotation landing right AFTER the script: it fails its CAS (401), nothing is written', async () => {
    const s = await mint();
    let status = 0;
    const h = hookRevokeScript({
      after: async () => {
        status = (await refreshReq(s.refreshToken)).status;
      },
    });
    expect((await logout(s.accessToken)).status).toBe(200);
    expect(h.fired()).toBe(true);
    expect(status).toBe(401);
    expect(await redis.keys('session:*')).toEqual([]);
    expect(await rows(s.userId)).toHaveLength(0);
  });

  it('(a) logout with access_B while B is rotated to C (and C to D) before the script: the chain is gone', async () => {
    const s = await mint();
    const [, b] = await chain(s, 1);
    let more: Pair[] = [];
    hookRevokeScript({
      before: async () => {
        more = (await chain({ ...b, userId: s.userId, email: s.email }, 2)).slice(1);
      },
    });
    expect((await logout(b.accessToken)).status).toBe(200);
    expect(more).toHaveLength(2);
    expect(await redis.keys('session:*')).toEqual([]);
    await expectDead(s.userId, [s, b, ...more]);
  });

  it('(b) logout with access_B; a grace replay of A lands between the revoke reads and its deletes: the replay access key does not survive', async () => {
    const s = await mint();
    const b = await refreshOk(s.refreshToken);
    let replay: Pair | undefined;
    const h = hookRevokeScript({
      before: async () => {
        replay = await refreshOk(s.refreshToken);
        expect(replay.refreshToken).toBe(b.refreshToken);
        // the race really landed: the replay's access key is live right now
        expect(await validateSession(s.userId, hashToken(replay.accessToken))).not.toBeNull();
      },
    });
    expect((await logout(b.accessToken)).status).toBe(200);
    expect(h.fired()).toBe(true);
    expect(replay).toBeDefined();
    const r = replay as Pair;
    expect(await redis.exists(aKey(s.userId, r.accessToken))).toBe(0);
    expect(await validateSession(s.userId, hashToken(r.accessToken))).toBeNull();
    expect((await supertest(app).get('/me').set(bearer(r.accessToken))).status).toBe(401);
    expect(await keysOf(s.userId)).toEqual([]);
    expect(await rows(s.userId)).toHaveLength(0);
    await expectDead(s.userId, [s, b, r]);
  });

  it('(b) the replay lands right AFTER the script: grace key is gone, so 401 and no access key is written', async () => {
    const s = await mint();
    const b = await refreshOk(s.refreshToken);
    let status = 0;
    hookRevokeScript({
      after: async () => {
        status = (await refreshReq(s.refreshToken)).status;
      },
    });
    expect((await logout(b.accessToken)).status).toBe(200);
    expect(status).toBe(401);
    expect(await keysOf(s.userId)).toEqual([]);
  });

  it('(b) many parallel replays landing before the script: every one of their access keys is removed', async () => {
    const s = await mint();
    const b = await refreshOk(s.refreshToken);
    let replays: Pair[] = [];
    hookRevokeScript({
      before: async () => {
        replays = await Promise.all(Array.from({ length: 5 }, () => refreshOk(s.refreshToken)));
      },
    });
    expect((await logout(b.accessToken)).status).toBe(200);
    expect(replays).toHaveLength(5);
    expect(await keysOf(s.userId)).toEqual([]);
    await expectDead(s.userId, [s, b, ...replays]);
  });

  it('a racing rotation of ANOTHER family of the same user is untouched by the logout', async () => {
    const s = await mint();
    const other = await mintMore(s);
    let otherNext: Pair | undefined;
    hookRevokeScript({
      before: async () => {
        otherNext = await refreshOk(other.refreshToken);
      },
    });
    expect((await logout(s.accessToken)).status).toBe(200);
    const o = otherNext as Pair;
    expect(await validateSession(s.userId, hashToken(o.accessToken))).not.toBeNull();
    expect(await validateSession(s.userId, hashToken(other.accessToken))).not.toBeNull();
    expect(await redis.exists(rKey(s.userId, o.refreshToken))).toBe(1);
    expect((await refreshReq(o.refreshToken)).status).toBe(200);
    expect((await refreshReq(s.refreshToken)).status).toBe(401);
  });
});

describe('T-616b S1 revoke-all, password change and revoke-one racing a rotation', () => {
  it('deleteAllUserSessions: a rotation and a replay landing before the script leave nothing alive', async () => {
    const s = await mint();
    const second = await mintMore(s);
    const secondNext = await refreshOk(second.refreshToken);
    const bystander = await mint();
    const bystanderKeys = await keysOf(bystander.userId);
    let racers: Pair[] = [];
    const h = hookRevokeScript({
      before: async () => {
        const first = await refreshOk(s.refreshToken); // a rotation after the refresh SCAN
        const replay = await refreshOk(second.refreshToken); // a replay after it
        expect(replay.refreshToken).toBe(secondNext.refreshToken);
        racers = [first, replay];
      },
    });
    await deleteAllUserSessions(s.userId);
    expect(h.fired()).toBe(true);
    expect(racers).toHaveLength(2);
    expect(await keysOf(s.userId)).toEqual([]);
    expect(await rows(s.userId)).toHaveLength(0);
    await expectDead(s.userId, [s, second, secondNext, ...racers]);
    expect(await keysOf(bystander.userId)).toEqual(bystanderKeys);
  });

  it('deleteAllUserSessions: a rotation landing right after the script fails its CAS, nothing alive', async () => {
    const s = await mint();
    let status = 0;
    hookRevokeScript({
      after: async () => {
        status = (await refreshReq(s.refreshToken)).status;
      },
    });
    await deleteAllUserSessions(s.userId);
    expect(status).toBe(401);
    expect(await keysOf(s.userId)).toEqual([]);
  });

  it('deleteAllUserSessions: a rotation landing between the access-key SCAN and its DEL cannot resurrect a family', async () => {
    const s = await mint();
    let status = 0;
    const realScan = redis.scan.bind(redis) as (...a: unknown[]) => Promise<unknown>;
    let hooked = false;
    jest.spyOn(redis, 'scan').mockImplementation(((...args: unknown[]) => {
      const pattern = String(args[2]);
      if (pattern.startsWith('session:refresh:') || hooked) return realScan(...args);
      hooked = true; // the first ACCESS-key scan (refresh keys are already gone by now)
      return (async () => {
        const res = await realScan(...args);
        status = (await refreshReq(s.refreshToken)).status;
        return res;
      })();
    }) as never);
    await deleteAllUserSessions(s.userId);
    expect(hooked).toBe(true);
    expect(status).toBe(401);
    expect(await keysOf(s.userId)).toEqual([]);
  });

  it('deleteOtherUserSessions: kept family (even when it rotates mid-call) intact, others fully gone, count right', async () => {
    const s = await mint();
    const keepFirst = await refreshOk(s.refreshToken); // caller holds keepFirst.accessToken
    const o1 = await mintMore(s);
    const o2 = await mintMore(s);
    const o2Next = await refreshOk(o2.refreshToken);
    const bystander = await mint();
    const bystanderKeys = await keysOf(bystander.userId);

    let racers: Record<string, Pair> = {};
    const h = hookRevokeScript({
      before: async () => {
        racers = {
          keepNext: await refreshOk(keepFirst.refreshToken), // the kept family rotates again
          keepReplay: await refreshOk(keepFirst.refreshToken), // and a replay of the rotated token
          o1Next: await refreshOk(o1.refreshToken), // another family rotates
          o2Replay: await refreshOk(o2.refreshToken), // another family replays
        };
      },
    });
    const revoked = await deleteOtherUserSessions(s.userId, hashToken(keepFirst.accessToken));
    expect(h.fired()).toBe(true);
    // two other sign-ins (o1, o2); rotations, grace records and replay access keys are not extra
    expect(revoked).toBe(2);
    // rows (before the kept token is refreshed below): only the kept family's remain
    const left = await rows(s.userId);
    expect(left.length).toBeGreaterThan(0);
    expect(
      left.every((r) =>
        [keepFirst.refreshToken, racers.keepNext.refreshToken].some(
          (t) => r.refreshTokenHash === hashToken(t),
        ),
      ),
    ).toBe(true);

    // kept family: both refresh generations, the grace record(s) and every access key
    for (const t of [s, keepFirst, racers.keepNext, racers.keepReplay]) {
      expect(await validateSession(s.userId, hashToken(t.accessToken))).not.toBeNull();
    }
    expect(await redis.exists(rKey(s.userId, s.refreshToken))).toBe(1);
    expect(await redis.exists(rKey(s.userId, keepFirst.refreshToken))).toBe(1);
    expect(await redis.exists(rKey(s.userId, racers.keepNext.refreshToken))).toBe(1);
    expect((await refreshReq(racers.keepNext.refreshToken)).status).toBe(200);
    // others: nothing of them
    for (const t of [o1, o2, o2Next, racers.o1Next, racers.o2Replay]) {
      expect(await validateSession(s.userId, hashToken(t.accessToken))).toBeNull();
      expect(await redis.exists(rKey(s.userId, t.refreshToken))).toBe(0);
    }
    expect((await refreshReq(o1.refreshToken)).status).toBe(401);
    expect((await refreshReq(racers.o1Next.refreshToken)).status).toBe(401);
    expect((await refreshReq(o2.refreshToken)).status).toBe(401);
    expect(await keysOf(bystander.userId)).toEqual(bystanderKeys);
  });

  it('deleteOtherUserSessions: the script never walks INTO the kept family, even through a stray link from another family', async () => {
    const s = await mint();
    const keep = await refreshOk(s.refreshToken); // caller: keep.accessToken
    const other = await mintMore(s);
    // a damaged record of another family that names the kept family's first hash
    await rewrite(rKey(s.userId, other.refreshToken), (rec) => {
      rec.rotatedFrom = hashToken(s.refreshToken);
    });
    expect(await deleteOtherUserSessions(s.userId, hashToken(keep.accessToken))).toBe(1);
    expect(await redis.exists(rKey(s.userId, s.refreshToken))).toBe(1);
    expect(await redis.exists(rKey(s.userId, keep.refreshToken))).toBe(1);
    expect(await validateSession(s.userId, hashToken(keep.accessToken))).not.toBeNull();
    expect(await redis.exists(rKey(s.userId, other.refreshToken))).toBe(0);
    expect((await refreshReq(keep.refreshToken)).status).toBe(200);
  });

  it('deleteOtherUserSessions: a rotation landing right after the script on another family fails its CAS', async () => {
    const s = await mint();
    const other = await mintMore(s);
    let status = 0;
    hookRevokeScript({
      after: async () => {
        status = (await refreshReq(other.refreshToken)).status;
      },
    });
    expect(await deleteOtherUserSessions(s.userId, hashToken(s.accessToken))).toBe(1);
    expect(status).toBe(401);
    expect(await keysOf(s.userId)).toEqual(
      [aKey(s.userId, s.accessToken), rKey(s.userId, s.refreshToken)].sort(),
    );
  });

  it('revoke-one (DELETE /me/sessions/:id): a rotation of the target landing before the script leaves nothing of it alive', async () => {
    const s = await mint();
    const caller = await mintMore(s);
    const target = await mintMore(s);
    const row = await Session.findOne({
      userId: s.userId,
      refreshTokenHash: hashToken(target.refreshToken),
    }).lean();
    let racers: Pair[] = [];
    const h = hookRevokeScript({
      before: async () => {
        racers = [await refreshOk(target.refreshToken), await refreshOk(target.refreshToken)];
      },
    });
    const res = await supertest(app)
      .delete(`/me/sessions/${String(row!._id)}`)
      .set(bearer(caller.accessToken));
    expect(res.status).toBe(200);
    expect(h.fired()).toBe(true);
    expect(racers).toHaveLength(2);
    for (const t of [target, ...racers]) {
      expect(await validateSession(s.userId, hashToken(t.accessToken))).toBeNull();
      expect(await redis.exists(rKey(s.userId, t.refreshToken))).toBe(0);
    }
    expect((await refreshReq(target.refreshToken)).status).toBe(401);
    expect((await refreshReq(racers[0].refreshToken)).status).toBe(401);
    // the caller's own family and the earlier sign-in are untouched
    expect(await validateSession(s.userId, hashToken(caller.accessToken))).not.toBeNull();
    expect(await validateSession(s.userId, hashToken(s.accessToken))).not.toBeNull();
    expect(await rows(s.userId)).toHaveLength(2);
  });
});

// ── S2: chains and the `p` link ─────────────────────────────────────────────────────────────
describe('T-616b S2 grace chains (A -> B -> C within 30 s)', () => {
  it('the grace record carries p = the predecessor hash when the old token had rotatedFrom; still no raw token or secret', async () => {
    const s = await mint();
    const [a, b, c] = await chain(s, 2);
    const graceA = JSON.parse((await redis.get(rKey(s.userId, a.refreshToken))) as string);
    const graceB = JSON.parse((await redis.get(rKey(s.userId, b.refreshToken))) as string);
    expect(Object.keys(graceA).sort()).toEqual(['c', 'exp', 'g', 'h', 'iat', 'n', 's']);
    expect(Object.keys(graceB).sort()).toEqual(['c', 'exp', 'g', 'h', 'iat', 'n', 'p', 's']);
    expect(graceB.p).toBe(hashToken(a.refreshToken));
    expect(graceB.h).toBe(hashToken(c.refreshToken));
    // `p` is a hash, never a token
    expect(graceB.p).toMatch(/^[0-9a-f]{64}$/);
    const raw = JSON.stringify(graceB);
    for (const secretish of [a.refreshToken, b.refreshToken, c.refreshToken, c.accessToken]) {
      expect(raw).not.toContain(secretish);
    }
    expect(raw).not.toContain(hashToken(c.accessToken));
    expect(jwt.decode(raw)).toBeNull();
  });

  it('logout with C leaves no session:<uid>:* or session:refresh:<uid>:* keys', async () => {
    const s = await mint();
    const pairs = await chain(s, 2);
    expect(await redis.keys(`session:refresh:${s.userId}:*`)).toHaveLength(3);
    expect((await logout(pairs[2].accessToken)).status).toBe(200);
    expect(await redis.keys(`session:${s.userId}:*`)).toEqual([]);
    expect(await redis.keys(`session:refresh:${s.userId}:*`)).toEqual([]);
    expect(await rows(s.userId)).toHaveLength(0);
    await expectDead(s.userId, pairs);
  });

  it('logout with the pre-rotation access_A (grace-window key) kills B and C too', async () => {
    const s = await mint();
    const pairs = await chain(s, 2);
    expect(await validateSession(s.userId, hashToken(s.accessToken))).not.toBeNull();
    expect((await logout(s.accessToken)).status).toBe(200);
    expect(await keysOf(s.userId)).toEqual([]);
    expect(await rows(s.userId)).toHaveLength(0);
    await expectDead(s.userId, pairs);
  });

  it('logout with access_B (the middle) kills both ends', async () => {
    const s = await mint();
    const pairs = await chain(s, 2);
    expect((await logout(pairs[1].accessToken)).status).toBe(200);
    expect(await keysOf(s.userId)).toEqual([]);
    await expectDead(s.userId, pairs);
  });

  it.each([
    ['the newest', 5, 5],
    ['the oldest', 5, 0],
    ['a middle one', 5, 2],
  ])('a chain of 6 tokens (5 hops) within 30 s: logout with %s kills all', async (_n, hops, at) => {
    const s = await mint();
    const pairs = await chain(s, hops);
    expect(await redis.keys(`session:refresh:${s.userId}:*`)).toHaveLength(hops + 1);
    expect((await logout(pairs[at].accessToken)).status).toBe(200);
    expect(await keysOf(s.userId)).toEqual([]);
    expect(await rows(s.userId)).toHaveLength(0);
    await expectDead(s.userId, pairs);
  });

  it('a chain with replays on every hop: logout with a replay access key kills all of it', async () => {
    const s = await mint();
    const pairs = await chain(s, 3);
    const replayA = await refreshOk(s.refreshToken).catch(() => undefined); // A's successor B rotated: 401 path
    expect(replayA).toBeUndefined();
    const replayC = await refreshOk(pairs[2].refreshToken); // C's grace replay (C -> D exists)
    expect(replayC.refreshToken).toBe(pairs[3].refreshToken);
    expect((await logout(replayC.accessToken)).status).toBe(200);
    expect(await keysOf(s.userId)).toEqual([]);
    await expectDead(s.userId, [...pairs, replayC]);
  });

  describe('mid-deploy shapes (no p / no rotatedFrom) revoke what they can and never throw', () => {
    it('a grace record without p: logout with C removes C and B; A cannot be replayed', async () => {
      const s = await mint();
      const pairs = await chain(s, 2);
      await rewrite(rKey(s.userId, pairs[1].refreshToken), (rec) => {
        delete rec.p;
      });
      expect((await logout(pairs[2].accessToken)).status).toBe(200);
      expect(await redis.exists(rKey(s.userId, pairs[2].refreshToken))).toBe(0);
      expect(await redis.exists(rKey(s.userId, pairs[1].refreshToken))).toBe(0);
      expect(await validateSession(s.userId, hashToken(pairs[2].accessToken))).toBeNull();
      // A's grace record may still sit there (nothing links to it), but its successor is gone
      expect((await refreshReq(pairs[0].refreshToken)).status).toBe(401);
      expect((await refreshReq(pairs[1].refreshToken)).status).toBe(401);
      expect((await refreshReq(pairs[2].refreshToken)).status).toBe(401);
    });

    it('a refresh record without rotatedFrom: logout still removes it and does not throw', async () => {
      const s = await mint();
      const pairs = await chain(s, 2);
      await rewrite(rKey(s.userId, pairs[2].refreshToken), (rec) => {
        delete rec.rotatedFrom;
      });
      expect((await logout(pairs[2].accessToken)).status).toBe(200);
      expect(await redis.exists(rKey(s.userId, pairs[2].refreshToken))).toBe(0);
      expect(await validateSession(s.userId, hashToken(pairs[2].accessToken))).toBeNull();
      expect((await refreshReq(pairs[2].refreshToken)).status).toBe(401);
      expect((await refreshReq(pairs[1].refreshToken)).status).toBe(401);
      expect((await refreshReq(pairs[0].refreshToken)).status).toBe(401);
    });

    it('both missing (a family written entirely by the previous version): logout with A still walks forward through h', async () => {
      const s = await mint();
      const pairs = await chain(s, 2);
      await rewrite(rKey(s.userId, pairs[1].refreshToken), (rec) => {
        delete rec.p;
      });
      await rewrite(rKey(s.userId, pairs[2].refreshToken), (rec) => {
        delete rec.rotatedFrom;
      });
      expect((await logout(s.accessToken)).status).toBe(200);
      expect(await keysOf(s.userId)).toEqual([]);
      await expectDead(s.userId, pairs);
    });

    it('a garbage record that starts like a grace record, or is not JSON at all, is deleted without throwing', async () => {
      const s = await mint();
      const pairs = await chain(s, 1);
      await redis.set(rKey(s.userId, s.refreshToken), '{"g":1,"zzz', 'EX', 30);
      const junk = await mintMore(s);
      await redis.set(rKey(s.userId, junk.refreshToken), 'not json at all', 'EX', 60);
      expect((await logout(pairs[1].accessToken)).status).toBe(200);
      expect(await redis.exists(rKey(s.userId, pairs[1].refreshToken))).toBe(0);
      expect(await redis.exists(rKey(s.userId, s.refreshToken))).toBe(0);
      // the junk family is a different family: untouched by this logout
      expect(await redis.exists(rKey(s.userId, junk.refreshToken))).toBe(1);
      // and revoke-all clears it without throwing
      await expect(deleteAllUserSessions(s.userId)).resolves.toBeUndefined();
      expect(await keysOf(s.userId)).toEqual([]);
    });
  });

  it('password change keeps the caller WHOLE chain (A, B, C records and all access keys) and counts others as before', async () => {
    const s = await mint();
    const pairs = await chain(s, 2);
    const replay = await refreshOk(pairs[1].refreshToken); // replay of B (C exists)
    const o = await mintMore(s);
    const oNext = await refreshOk(o.refreshToken);
    const idle = await mintMore(s);
    await redis.del(aKey(s.userId, idle.accessToken));

    // caller holds the NEWEST access token; run again with the OLDEST: same outcome
    expect(await deleteOtherUserSessions(s.userId, hashToken(pairs[2].accessToken))).toBe(2);
    const kept = (await keysOf(s.userId)).sort();
    expect(kept).toEqual(
      [
        ...pairs.map((p) => aKey(s.userId, p.accessToken)),
        aKey(s.userId, replay.accessToken),
        ...pairs.map((p) => rKey(s.userId, p.refreshToken)),
      ].sort(),
    );
    expect(await deleteOtherUserSessions(s.userId, hashToken(s.accessToken))).toBe(0);
    expect((await keysOf(s.userId)).sort()).toEqual(kept);
    for (const t of [o, oNext, idle]) {
      expect(await validateSession(s.userId, hashToken(t.accessToken))).toBeNull();
      expect((await refreshReq(t.refreshToken)).status).toBe(401);
    }
    expect((await refreshReq(pairs[2].refreshToken)).status).toBe(200);
  });
});

// ── user text inside the grace record ───────────────────────────────────────────────────────
describe('T-616b user text with quotes and braces in the grace record', () => {
  it('a name that looks like JSON cannot steer the Lua string match: logout removes the family and only the family', async () => {
    const bystander = await mint();
    const bystanderRefresh = hashToken(bystander.refreshToken);
    // quotes, braces, and a real foreign hash laid out like the fields the script reads (<= 100)
    const evilName = `{"h":"${bystanderRefresh}","p":"${bystanderRefresh.slice(0, 18)}"}`;
    expect(evilName.length).toBeLessThanOrEqual(100);
    const u = await newUser(evilName);
    const s = await mintFor({ ...u, name: evilName });
    const second = await mintFor({ ...u, name: evilName });

    const pairs = await chain(s, 2);
    const rec = JSON.parse((await redis.get(rKey(u.userId, pairs[1].refreshToken))) as string);
    expect(rec.c.name).toBe(evilName); // the user text really is in the record
    expect(rec.p).toBe(hashToken(s.refreshToken));
    const second2 = await refreshOk(second.refreshToken);
    const bystanderKeys = await keysOf(bystander.userId);

    // newest: removes this family only
    expect((await logout(pairs[2].accessToken)).status).toBe(200);
    expect((await redis.keys(`session:refresh:${u.userId}:*`)).sort()).toEqual(
      [rKey(u.userId, second.refreshToken), rKey(u.userId, second2.refreshToken)].sort(),
    );
    expect(await keysOf(bystander.userId)).toEqual(bystanderKeys);
    expect(await redis.exists(rKey(bystander.userId, bystander.refreshToken))).toBe(1);
    for (const p of pairs) expect((await refreshReq(p.refreshToken)).status).toBe(401);

    // the other family, logged out with its pre-rotation token
    expect((await logout(second.accessToken)).status).toBe(200);
    expect(await keysOf(u.userId)).toEqual([]);
    await expectDead(u.userId, [second, second2]);
    // nothing leaked or resurrected for the bystander
    expect(await keysOf(bystander.userId)).toEqual(bystanderKeys);
    expect((await refreshReq(bystander.refreshToken)).status).toBe(200);
  });

  it('braces and a double-quote in claims also survive revoke-all and password-change', async () => {
    const u = await newUser('Q"uote {"h":"00"} \\"');
    const s = await mintFor(u);
    const [, b] = await chain(s, 1);
    const other = await mintFor(u);
    await refreshOk(other.refreshToken);
    expect(await deleteOtherUserSessions(u.userId, hashToken(b.accessToken))).toBe(1);
    expect(await redis.exists(rKey(u.userId, b.refreshToken))).toBe(1);
    expect(await redis.exists(rKey(u.userId, s.refreshToken))).toBe(1);
    await deleteAllUserSessions(u.userId);
    expect(await keysOf(u.userId)).toEqual([]);
  });
});

// ── bystanders ──────────────────────────────────────────────────────────────────────────────
describe('T-616b bystander safety', () => {
  it("logout leaves another user's keys and another family of the same user byte-for-byte untouched", async () => {
    const s = await mint();
    const sameUser = await mintMore(s);
    const sameUserNext = await refreshOk(sameUser.refreshToken);
    const stranger = await mint();
    const strangerNext = await refreshOk(stranger.refreshToken);

    const snapshot = async (uid: string) => {
      const out: Record<string, string | null> = {};
      for (const k of await keysOf(uid)) out[k] = await redis.get(k);
      return out;
    };
    const keepFamily = await snapshot(s.userId);
    const strangerBefore = await snapshot(stranger.userId);
    const pairs = await chain(s, 2);

    expect((await logout(pairs[2].accessToken)).status).toBe(200);

    const after = await snapshot(s.userId);
    // what is left of s is exactly what was there before its chain, minus its own first pair
    const own = [aKey(s.userId, s.accessToken), rKey(s.userId, s.refreshToken)];
    expect(Object.keys(after).sort()).toEqual(
      Object.keys(keepFamily)
        .filter((k) => !own.includes(k))
        .sort(),
    );
    for (const k of Object.keys(after)) expect(after[k]).toBe(keepFamily[k]);
    expect(await snapshot(stranger.userId)).toEqual(strangerBefore);
    expect((await refreshReq(sameUserNext.refreshToken)).status).toBe(200);
    expect((await refreshReq(strangerNext.refreshToken)).status).toBe(200);
    expect(await validateSession(s.userId, hashToken(sameUser.accessToken))).not.toBeNull();
  });
});

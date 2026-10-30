/**
 * T-343 — privacy re-acceptance in auth: GET /me, POST /me/privacy-acceptance, the `pv` claim on
 * every token path (register, login, refresh), and the sign-up history row. Real app, real Mongo
 * (in-memory), ioredis-mock. The Google paths are in t343-privacy-google.test.ts.
 *
 * Ajay (signed, 12 Oct 2026): history is append-only {version, acceptedAt, via} with no IP and no
 * user agent; no signed summary means no prompt. Arjun: accept rotates the session and the new
 * token carries the new pv; the old session is gone.
 */

import './setupEnv';

jest.mock('ioredis', () => jest.requireActual('ioredis-mock'));

import './setupDb';

import { CURRENT_PRIVACY_VERSION, PRIVACY_VERSION_SUMMARIES } from '@lawie/shared';
import * as privacyConstants from '@lawie/shared/dist/constants/privacy';
import mongoose from 'mongoose';
import supertest from 'supertest';

import app from '../app';
import redis from '../config/redis';
import { User } from '../models/User.model';
import { verifyAccessToken, verifyRefreshToken } from '../services/jwt.service';
import { hashToken, validateSession } from '../services/session.service';

import { advanceClock, graceKeys, liveRefreshKeys, resetClock } from './t616b-helpers';

const PASSWORD = 'Passw0rdOk';
const OLD_VERSION = '2026-10-11';
const SUMMARY = PRIVACY_VERSION_SUMMARIES['2026-10-15'];
const AGENT = 'T343-Test-Agent/1.0';

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

async function seedUser(email: string, extra: Record<string, unknown> = {}) {
  const user = await User.create({ email, name: 'T343 Person', password: PASSWORD, ...extra });
  return String(user._id);
}

async function loginAs(email: string): Promise<Tokens & { userId: string }> {
  const res = await supertest(app).post('/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  const data = res.body.data as Partial<Tokens> & { tokens?: Tokens };
  const tokens = data.tokens ?? { accessToken: data.accessToken, refreshToken: data.refreshToken };
  const user = await User.findOne({ email }).lean();
  return { ...(tokens as Tokens), userId: String(user?._id) };
}

function rawUser(email: string) {
  return mongoose.connection.db?.collection('users').findOne({ email });
}

beforeEach(async () => {
  await redis.flushall();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
});
afterEach(() => {
  resetClock();
  jest.restoreAllMocks();
});

describe('T-343 AC1/AC3 — GET /me for older, current and missing versions', () => {
  it('older version: needsPrivacyAcceptance true, with the signed summary', async () => {
    await seedUser('older@example.com', { privacyVersion: OLD_VERSION });
    const { accessToken } = await loginAs('older@example.com');
    const res = await supertest(app).get('/me').set(bearer(accessToken));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'success',
      data: {
        privacyVersion: OLD_VERSION,
        currentPrivacyVersion: CURRENT_PRIVACY_VERSION,
        needsPrivacyAcceptance: true,
        summary: SUMMARY,
        // T-223: /me also reports the verification state (seeded as an unverified email user).
        emailVerified: false,
        // T-642 (Arjun 3): computed, false for a non-google account.
        needsSignupConsent: false,
        // T-522: /me also reports the sign-up Ink and referral state.
        signupInkGranted: false,
        referralStatus: null,
        hasGoogle: false,
        // T-115c: the close-account dialog asks for a password only when there is one.
        hasPassword: true,
        // T-436: the GST State for tax invoices, null until the user gives one.
        gstStateCode: null,
        // T-507: the profile fields, null / [] until given.
        name: 'T343 Person',
        phone: null,
        enrollmentNumber: null,
        barCouncil: null,
        barCouncilState: null,
        practiceAreas: [],
        yearsOfExperience: null,
        courtsPractisedIn: [],
        defaultCourt: null,
      },
    });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('current version: needsPrivacyAcceptance false and no summary key', async () => {
    await seedUser('current@example.com', { privacyVersion: CURRENT_PRIVACY_VERSION });
    const { accessToken } = await loginAs('current@example.com');
    const res = await supertest(app).get('/me').set(bearer(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      privacyVersion: CURRENT_PRIVACY_VERSION,
      currentPrivacyVersion: CURRENT_PRIVACY_VERSION,
      needsPrivacyAcceptance: false,
      emailVerified: false,
      // T-642: computed, false for a non-google account.
      needsSignupConsent: false,
      signupInkGranted: false,
      referralStatus: null,
      hasGoogle: false,
      hasPassword: true,
      gstStateCode: null,
      // T-507: the profile fields.
      name: 'T343 Person',
      phone: null,
      enrollmentNumber: null,
      barCouncil: null,
      barCouncilState: null,
      practiceAreas: [],
      yearsOfExperience: null,
      courtsPractisedIn: [],
      defaultCourt: null,
    });
    expect(res.body.data).not.toHaveProperty('summary');
  });

  it('missing version: privacyVersion null, needsPrivacyAcceptance true', async () => {
    await seedUser('missing@example.com');
    const { accessToken } = await loginAs('missing@example.com');
    const res = await supertest(app).get('/me').set(bearer(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.data.privacyVersion).toBeNull();
    expect(res.body.data.needsPrivacyAcceptance).toBe(true);
    expect(res.body.data.summary).toBe(SUMMARY);
  });

  it('a later-looking version is still not the current one (opaque strings, not dates)', async () => {
    await seedUser('later@example.com', { privacyVersion: '2027-01-01' });
    const { accessToken } = await loginAs('later@example.com');
    const res = await supertest(app).get('/me').set(bearer(accessToken));
    expect(res.body.data.needsPrivacyAcceptance).toBe(true);
  });

  it('no signed summary for the current version: needsPrivacyAcceptance is false for every user', async () => {
    jest.spyOn(privacyConstants, 'getPrivacyVersionSummary').mockReturnValue(undefined);
    await seedUser('nosummary-old@example.com', { privacyVersion: OLD_VERSION });
    await seedUser('nosummary-none@example.com');
    for (const email of ['nosummary-old@example.com', 'nosummary-none@example.com']) {
      const { accessToken } = await loginAs(email);
      const res = await supertest(app).get('/me').set(bearer(accessToken));
      expect(res.status).toBe(200);
      expect(res.body.data.needsPrivacyAcceptance).toBe(false);
      expect(res.body.data).not.toHaveProperty('summary');
    }
  });

  it('is 401 with no token, a bad token and a revoked session', async () => {
    expect((await supertest(app).get('/me')).status).toBe(401);
    expect((await supertest(app).get('/me').set(bearer('not-a-jwt'))).status).toBe(401);
    await seedUser('revoked@example.com');
    const { accessToken, userId } = await loginAs('revoked@example.com');
    await redis.del(`session:${userId}:${hashToken(accessToken)}`);
    expect((await supertest(app).get('/me').set(bearer(accessToken))).status).toBe(401);
  });

  it('is 401 for a deactivated user who still holds a live session', async () => {
    await seedUser('deact@example.com');
    const { accessToken } = await loginAs('deact@example.com');
    await User.updateOne({ email: 'deact@example.com' }, { isActive: false });
    expect((await supertest(app).get('/me').set(bearer(accessToken))).status).toBe(401);
  });
});

describe('T-343 AC2 — POST /me/privacy-acceptance', () => {
  async function accept(token: string, body: unknown = {}) {
    return supertest(app)
      .post('/me/privacy-acceptance')
      .set(bearer(token))
      .set('User-Agent', AGENT)
      .send(body as object);
  }

  it('is 401 without a token, with a bad token and with a revoked session', async () => {
    expect((await supertest(app).post('/me/privacy-acceptance').send({})).status).toBe(401);
    expect((await accept('not-a-jwt')).status).toBe(401);
    await seedUser('rev2@example.com', { privacyVersion: OLD_VERSION });
    const { accessToken, userId } = await loginAs('rev2@example.com');
    await redis.del(`session:${userId}:${hashToken(accessToken)}`);
    expect((await accept(accessToken)).status).toBe(401);
    const u = await User.findOne({ email: 'rev2@example.com' }).lean();
    expect(u?.privacyVersion).toBe(OLD_VERSION);
    expect(u?.privacyHistory).toBeUndefined();
  });

  it('stores version, time and via "reaccept", and exactly one history row', async () => {
    await seedUser('acc@example.com', { privacyVersion: OLD_VERSION });
    const { accessToken } = await loginAs('acc@example.com');
    const before = Date.now();
    const res = await accept(accessToken);
    const after = Date.now();
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.headers['cache-control']).toBe('no-store');

    const u = await User.findOne({ email: 'acc@example.com' }).lean();
    expect(u?.privacyVersion).toBe(CURRENT_PRIVACY_VERSION);
    expect(u?.privacyAcceptedVia).toBe('reaccept');
    expect(u?.privacyAcceptedAt).toBeInstanceOf(Date);
    expect(u?.privacyAcceptedAt?.getTime()).toBeGreaterThanOrEqual(before);
    expect(u?.privacyAcceptedAt?.getTime()).toBeLessThanOrEqual(after);
    expect(u?.privacyHistory).toHaveLength(1);
    const row = u?.privacyHistory?.[0];
    expect(Object.keys(row ?? {}).sort()).toEqual(['acceptedAt', 'version', 'via']);
    expect(row?.version).toBe(CURRENT_PRIVACY_VERSION);
    expect(row?.via).toBe('reaccept');
    expect(row?.acceptedAt).toEqual(u?.privacyAcceptedAt);
  });

  it('works for a user with no stored version at all', async () => {
    await seedUser('acc-none@example.com');
    const { accessToken } = await loginAs('acc-none@example.com');
    expect((await accept(accessToken)).status).toBe(200);
    const u = await User.findOne({ email: 'acc-none@example.com' }).lean();
    expect(u?.privacyVersion).toBe(CURRENT_PRIVACY_VERSION);
    expect(u?.privacyHistory).toHaveLength(1);
  });

  it('then GET /me with the new token says no prompt', async () => {
    await seedUser('after@example.com', { privacyVersion: OLD_VERSION });
    const { accessToken } = await loginAs('after@example.com');
    const res = await accept(accessToken);
    const me = await supertest(app).get('/me').set(bearer(res.body.data.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.data.needsPrivacyAcceptance).toBe(false);
    expect(me.body.data.privacyVersion).toBe(CURRENT_PRIVACY_VERSION);
  });

  it('returns a rotated token pair whose access and refresh tokens carry the new pv', async () => {
    await seedUser('rot@example.com', { privacyVersion: OLD_VERSION });
    const old = await loginAs('rot@example.com');
    expect(verifyAccessToken(old.accessToken).pv).toBe(OLD_VERSION);

    const res = await accept(old.accessToken);
    const next = res.body.data as Tokens;
    expect(next.accessToken).toBeTruthy();
    expect(next.refreshToken).toBeTruthy();
    expect(next.accessToken).not.toBe(old.accessToken);
    expect(next.refreshToken).not.toBe(old.refreshToken);
    expect(verifyAccessToken(next.accessToken).pv).toBe(CURRENT_PRIVACY_VERSION);
    expect(verifyRefreshToken(next.refreshToken).pv).toBe(CURRENT_PRIVACY_VERSION);
    expect(verifyAccessToken(next.accessToken).sub).toBe(old.userId);

    // New session is live, so the user carries on with the new token.
    expect(await validateSession(old.userId, hashToken(next.accessToken))).not.toBeNull();
    expect((await supertest(app).get('/me').set(bearer(next.accessToken))).status).toBe(200);
  });

  it('the old access session dies within the 30 s grace window; the old refresh token is spent after it', async () => {
    await seedUser('gone@example.com', { privacyVersion: OLD_VERSION });
    const old = await loginAs('gone@example.com');
    expect(await validateSession(old.userId, hashToken(old.accessToken))).not.toBeNull();

    const res = await accept(old.accessToken);
    expect(res.status).toBe(200);

    // T-616b: not deleted (requests in flight with it keep working), but cut to <= 30 s
    const oldKey = `session:${old.userId}:${hashToken(old.accessToken)}`;
    const ttl = await redis.ttl(oldKey);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(30);
    expect((await supertest(app).get('/me').set(bearer(old.accessToken))).status).toBe(200);

    advanceClock(31);
    expect(await validateSession(old.userId, hashToken(old.accessToken))).toBeNull();
    expect((await supertest(app).get('/me').set(bearer(old.accessToken))).status).toBe(401);
    const refreshed = await supertest(app)
      .post('/refresh')
      .send({ refreshToken: old.refreshToken });
    expect(refreshed.status).toBe(401);
    // the new pair is the live one
    expect((await supertest(app).get('/me').set(bearer(res.body.data.accessToken))).status).toBe(
      200,
    );
  });

  it('stores no IP address and no user agent on the user or in the history', async () => {
    await seedUser('noip@example.com', { privacyVersion: OLD_VERSION });
    const { accessToken } = await loginAs('noip@example.com');
    await supertest(app)
      .post('/me/privacy-acceptance')
      .set(bearer(accessToken))
      .set('User-Agent', AGENT)
      .set('X-Forwarded-For', '203.0.113.77')
      .send({});
    const raw = JSON.stringify(await rawUser('noip@example.com'));
    expect(raw).not.toContain(AGENT);
    expect(raw).not.toContain('203.0.113.77');
    expect(raw).not.toContain('127.0.0.1');
    expect(raw).not.toMatch(/"(ip|ipAddress|userAgent)"/i);
    const u = await User.findOne({ email: 'noip@example.com' }).lean();
    const row = u?.privacyHistory?.[0] as unknown as Record<string, unknown>;
    expect(row).not.toHaveProperty('ip');
    expect(row).not.toHaveProperty('userAgent');
  });

  it('ignores the request body: version, time, via and history are server values', async () => {
    await seedUser('body@example.com', { privacyVersion: OLD_VERSION });
    const { accessToken } = await loginAs('body@example.com');
    const res = await accept(accessToken, {
      privacyVersion: '1999-01-01',
      version: '1999-01-01',
      via: 'signup',
      privacyAcceptedVia: 'signup',
      privacyAcceptedAt: '2000-01-01T00:00:00.000Z',
      acceptedAt: '2000-01-01T00:00:00.000Z',
      privacyHistory: [{ version: 'x', acceptedAt: '2000-01-01', via: 'signup' }],
      ip: '1.2.3.4',
      sub: '507f1f77bcf86cd799439011',
    });
    expect(res.status).toBe(200);
    const u = await User.findOne({ email: 'body@example.com' }).lean();
    expect(u?.privacyVersion).toBe(CURRENT_PRIVACY_VERSION);
    expect(u?.privacyAcceptedVia).toBe('reaccept');
    expect(u?.privacyAcceptedAt?.getFullYear()).toBeGreaterThanOrEqual(2026);
    expect(u?.privacyHistory).toHaveLength(1);
    expect(u?.privacyHistory?.[0]).toMatchObject({
      version: CURRENT_PRIVACY_VERSION,
      via: 'reaccept',
    });
    expect(JSON.stringify(await rawUser('body@example.com'))).not.toContain('1.2.3.4');
  });

  it('acts on the token holder, never on a user named in the body', async () => {
    await seedUser('me-a@example.com', { privacyVersion: OLD_VERSION });
    const otherId = await seedUser('other@example.com', { privacyVersion: OLD_VERSION });
    const { accessToken } = await loginAs('me-a@example.com');
    await accept(accessToken, { userId: otherId, sub: otherId });
    const other = await User.findOne({ email: 'other@example.com' }).lean();
    expect(other?.privacyVersion).toBe(OLD_VERSION);
    expect(other?.privacyHistory).toBeUndefined();
  });

  it('double submit with the same token adds one history row, not two', async () => {
    await seedUser('dbl@example.com', { privacyVersion: OLD_VERSION });
    const { accessToken } = await loginAs('dbl@example.com');
    const [a, b] = await Promise.all([accept(accessToken), accept(accessToken)]);
    // T-616b: the second is a grace replay of the first rotation, not a 401 and not a second pair.
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.body.data.refreshToken).toBe(b.body.data.refreshToken);
    expect(a.body.data.accessToken).not.toBe(b.body.data.accessToken);
    const u = await User.findOne({ email: 'dbl@example.com' }).lean();
    expect(u?.privacyHistory).toHaveLength(1);
    expect(u?.privacyVersion).toBe(CURRENT_PRIVACY_VERSION);
  });

  it('concurrent accepts on one token leave exactly one new session family (one refresh token)', async () => {
    await seedUser('conc@example.com', { privacyVersion: OLD_VERSION });
    const old = await loginAs('conc@example.com');
    const results = await Promise.all([
      accept(old.accessToken),
      accept(old.accessToken),
      accept(old.accessToken),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    const refreshTokens = new Set(results.map((r) => r.body.data.refreshToken as string));
    expect(refreshTokens.size).toBe(1);
    expect([...refreshTokens][0]).not.toBe(old.refreshToken);
    const accessTokens = results.map((r) => r.body.data.accessToken as string);
    expect(new Set(accessTokens).size).toBe(3);

    // every returned access session is live; the old one only for <= 30 s
    for (const t of accessTokens) {
      expect(await validateSession(old.userId, hashToken(t))).not.toBeNull();
    }
    const oldTtl = await redis.ttl(`session:${old.userId}:${hashToken(old.accessToken)}`);
    expect(oldTtl).toBeGreaterThan(0);
    expect(oldTtl).toBeLessThanOrEqual(30);
    expect(await liveRefreshKeys(old.userId)).toHaveLength(1);
    expect(await graceKeys(old.userId)).toHaveLength(1);

    const rows = await mongoose.connection.db
      ?.collection('sessions')
      .find({ userId: new mongoose.Types.ObjectId(old.userId) })
      .toArray();
    expect(rows).toHaveLength(1);
    const u = await User.findOne({ email: 'conc@example.com' }).lean();
    expect(u?.privacyHistory).toHaveLength(1);
  });

  it('the old refresh token is dead once the grace window has passed; inside it, it gets the same new token', async () => {
    await seedUser('oldref@example.com', { privacyVersion: OLD_VERSION });
    const old = await loginAs('oldref@example.com');
    const res = await accept(old.accessToken);
    expect(res.status).toBe(200);
    // inside the window: the replay returns the refresh token accept issued, never another one
    const inside = await supertest(app).post('/refresh').send({ refreshToken: old.refreshToken });
    expect(inside.status).toBe(200);
    expect(inside.body.data.refreshToken).toBe(res.body.data.refreshToken);
    expect(verifyAccessToken(inside.body.data.accessToken).pv).toBe(CURRENT_PRIVACY_VERSION);

    advanceClock(31);
    const dead = await supertest(app).post('/refresh').send({ refreshToken: old.refreshToken });
    expect(dead.status).toBe(401);
    const live = await supertest(app)
      .post('/refresh')
      .send({ refreshToken: res.body.data.refreshToken });
    expect(live.status).toBe(200);
  });

  it('an already-revoked session gets 401 and no DB write (version unchanged, no history row)', async () => {
    await seedUser('revoked@example.com', { privacyVersion: OLD_VERSION });
    const old = await loginAs('revoked@example.com');
    const before = await rawUser('revoked@example.com');
    await redis.flushall();
    const res = await accept(old.accessToken);
    expect(res.status).toBe(401);
    expect(res.body.data?.accessToken).toBeUndefined();
    const after = await rawUser('revoked@example.com');
    expect(after).toEqual(before);
    expect(after?.privacyVersion).toBe(OLD_VERSION);
    expect(after?.privacyHistory).toBeUndefined();
    expect(await redis.keys(`session:${old.userId}:*`)).toEqual([]);
  });

  it('an inactive user gets 401, no tokens, no new session and no acceptance recorded', async () => {
    await seedUser('inactive@example.com', { privacyVersion: OLD_VERSION });
    const old = await loginAs('inactive@example.com');
    await User.updateOne({ email: 'inactive@example.com' }, { $set: { isActive: false } });
    const res = await accept(old.accessToken);
    expect(res.status).toBe(401);
    expect(res.body.data?.accessToken).toBeUndefined();
    const u = await User.findOne({ email: 'inactive@example.com' }).lean();
    expect(u?.privacyVersion).toBe(OLD_VERSION);
    expect(u?.privacyHistory).toBeUndefined();
    expect(await redis.keys(`session:${old.userId}:*`)).toEqual([]);
  });

  it('a second accept with the new token is idempotent: 200, fresh tokens, still one row', async () => {
    await seedUser('idem@example.com', { privacyVersion: OLD_VERSION });
    const { accessToken } = await loginAs('idem@example.com');
    const first = await accept(accessToken);
    const firstAt = (await User.findOne({ email: 'idem@example.com' }).lean())?.privacyAcceptedAt;

    const second = await accept(first.body.data.accessToken);
    expect(second.status).toBe(200);
    expect(verifyAccessToken(second.body.data.accessToken).pv).toBe(CURRENT_PRIVACY_VERSION);

    const u = await User.findOne({ email: 'idem@example.com' }).lean();
    expect(u?.privacyHistory).toHaveLength(1);
    expect(u?.privacyAcceptedAt).toEqual(firstAt);
  });

  it('an already-current user gets no new row and keeps via "signup"', async () => {
    const reg = await supertest(app)
      .post('/register')
      .send({ email: 'cur-acc@example.com', password: PASSWORD, name: 'Cur' });
    expect(reg.status).toBe(202);
    const { accessToken: curToken } = await loginAs('cur-acc@example.com');
    const res = await accept(curToken);
    expect(res.status).toBe(200);
    const u = await User.findOne({ email: 'cur-acc@example.com' }).lean();
    expect(u?.privacyHistory).toHaveLength(1);
    expect(u?.privacyAcceptedVia).toBe('signup');
  });

  it('keeps earlier history rows untouched (append-only)', async () => {
    const earlier = { version: '2026-01-01', acceptedAt: new Date('2026-01-01'), via: 'signup' };
    await seedUser('append@example.com', {
      privacyVersion: '2026-01-01',
      privacyAcceptedVia: 'signup',
      privacyAcceptedAt: earlier.acceptedAt,
      privacyHistory: [earlier],
    });
    const { accessToken } = await loginAs('append@example.com');
    await accept(accessToken);
    const u = await User.findOne({ email: 'append@example.com' }).lean();
    expect(u?.privacyHistory).toHaveLength(2);
    expect(u?.privacyHistory?.[0]).toMatchObject(earlier);
    expect(u?.privacyHistory?.[1]).toMatchObject({
      version: CURRENT_PRIVACY_VERSION,
      via: 'reaccept',
    });
  });
});

describe('T-343 — the pv claim on login and refresh', () => {
  it.each([
    ['older', { privacyVersion: OLD_VERSION }, OLD_VERSION],
    ['current', { privacyVersion: CURRENT_PRIVACY_VERSION }, CURRENT_PRIVACY_VERSION],
    ['missing', {}, undefined],
  ])('login token for a %s version carries pv=%s', async (label, extra, expected) => {
    const email = `login-${label}@example.com`;
    await seedUser(email, extra);
    const { accessToken, refreshToken } = await loginAs(email);
    expect(verifyAccessToken(accessToken).pv).toBe(expected);
    expect(verifyRefreshToken(refreshToken).pv).toBe(expected);
    if (expected === undefined) expect(verifyAccessToken(accessToken)).not.toHaveProperty('pv');
  });

  it('refresh reads pv from the user record, so a stale claim does not survive a refresh', async () => {
    await seedUser('ref@example.com', { privacyVersion: OLD_VERSION });
    const { refreshToken } = await loginAs('ref@example.com');
    await User.updateOne({ email: 'ref@example.com' }, { privacyVersion: CURRENT_PRIVACY_VERSION });
    const res = await supertest(app).post('/refresh').send({ refreshToken });
    expect(res.status).toBe(200);
    const tokens = (res.body.data.tokens ?? res.body.data) as Tokens;
    expect(verifyAccessToken(tokens.accessToken).pv).toBe(CURRENT_PRIVACY_VERSION);
  });

  it('refresh for an older version carries the older pv; for a missing one, no pv', async () => {
    await seedUser('ref-old@example.com', { privacyVersion: OLD_VERSION });
    await seedUser('ref-none@example.com');
    const a = await loginAs('ref-old@example.com');
    const b = await loginAs('ref-none@example.com');
    const ra = await supertest(app).post('/refresh').send({ refreshToken: a.refreshToken });
    const rb = await supertest(app).post('/refresh').send({ refreshToken: b.refreshToken });
    expect(verifyAccessToken((ra.body.data.tokens ?? ra.body.data).accessToken).pv).toBe(
      OLD_VERSION,
    );
    expect(verifyAccessToken((rb.body.data.tokens ?? rb.body.data).accessToken).pv).toBeUndefined();
  });
});

describe('T-343 — sign-up records the acceptance and shows no prompt', () => {
  it('register: pv is current, via "signup", one history row, no IP, and /me says no prompt', async () => {
    const res = await supertest(app)
      .post('/register')
      .set('User-Agent', AGENT)
      .send({ email: 'signup@example.com', password: PASSWORD, name: 'Sign Up' });
    expect(res.status).toBe(202);
    // T-522: sign-up gives no tokens; the first login after it carries the current version.
    const { accessToken, refreshToken } = await loginAs('signup@example.com');
    expect(verifyAccessToken(accessToken).pv).toBe(CURRENT_PRIVACY_VERSION);
    expect(verifyRefreshToken(refreshToken).pv).toBe(CURRENT_PRIVACY_VERSION);

    const u = await User.findOne({ email: 'signup@example.com' }).lean();
    expect(u?.privacyVersion).toBe(CURRENT_PRIVACY_VERSION);
    expect(u?.privacyAcceptedVia).toBe('signup');
    expect(u?.privacyAcceptedAt).toBeInstanceOf(Date);
    expect(u?.privacyHistory).toHaveLength(1);
    expect(Object.keys(u?.privacyHistory?.[0] ?? {}).sort()).toEqual([
      'acceptedAt',
      'version',
      'via',
    ]);
    expect(u?.privacyHistory?.[0]).toMatchObject({
      version: CURRENT_PRIVACY_VERSION,
      via: 'signup',
    });
    const raw = JSON.stringify(await rawUser('signup@example.com'));
    expect(raw).not.toContain(AGENT);

    const me = await supertest(app).get('/me').set(bearer(accessToken));
    expect(me.body.data.needsPrivacyAcceptance).toBe(false);
  });

  it('register ignores any client-sent privacy fields', async () => {
    await supertest(app)
      .post('/register')
      .send({
        email: 'spoof@example.com',
        password: PASSWORD,
        name: 'Spoof',
        privacyVersion: '1999-01-01',
        privacyAcceptedVia: 'reaccept',
        privacyHistory: [{ version: 'x', acceptedAt: '2000-01-01', via: 'reaccept' }],
      });
    const u = await User.findOne({ email: 'spoof@example.com' }).lean();
    expect(u?.privacyVersion).toBe(CURRENT_PRIVACY_VERSION);
    expect(u?.privacyAcceptedVia).toBe('signup');
    expect(u?.privacyHistory).toHaveLength(1);
    expect(u?.privacyHistory?.[0].version).toBe(CURRENT_PRIVACY_VERSION);
  });
});

describe('T-343 — User model', () => {
  it('rejects a history row with an unknown via and a privacyAcceptedVia outside the enum', async () => {
    await expect(
      User.create({
        email: 'bad-via@example.com',
        name: 'B',
        password: PASSWORD,
        privacyHistory: [{ version: 'v', acceptedAt: new Date(), via: 'google' }],
      }),
    ).rejects.toThrow();
    await expect(
      User.create({
        email: 'bad-via2@example.com',
        name: 'B',
        password: PASSWORD,
        privacyAcceptedVia: 'password',
      }),
    ).rejects.toThrow();
  });

  it('does not default any of the new fields on an existing-style user', async () => {
    await User.create({ email: 'plain@example.com', name: 'P', password: PASSWORD });
    const u = await User.findOne({ email: 'plain@example.com' }).lean();
    expect(u?.privacyVersion).toBeUndefined();
    expect(u?.privacyAcceptedAt).toBeUndefined();
    expect(u?.privacyAcceptedVia).toBeUndefined();
    expect(u?.privacyHistory).toBeUndefined();
  });
});

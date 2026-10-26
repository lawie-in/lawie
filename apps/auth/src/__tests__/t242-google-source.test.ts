/**
 * T-242 — Google sign-up stores signupSource for NEW users only. Arjun's ruling (a): the tags live in
 * Redis under oauth:utm:<sha256hex(challenge)> (TTL 10 min), never in the state or the URL to Google.
 * Link (existing email account), returning and deactivated sign-ins never get them and the key is
 * deleted. Redis errors fail open for the tags only. No log carries the tags.
 * Same harness as t298-google-referral.test.ts (real verify callback and /google/callback).
 */

import './setupEnv';

// T-587: a Google sign-up / link queues the welcome email; stub the client so nothing reaches Redis.
jest.mock('@lawie/email-client', () => ({
  enqueueEmail: jest.fn().mockResolvedValue({ jobId: 'j' }),
}));

jest.mock('ioredis', () => require('ioredis-mock'));

jest.mock('../config/env', () => ({
  env: {
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    GOOGLE_CALLBACK_URL: 'http://localhost:4001/google/callback',
    FRONTEND_URL: 'http://localhost:3000',
    JWT_SECRET: 'test-jwt-secret-key-at-least-32-chars-long',
    JWT_REFRESH_SECRET: 'test-jwt-refresh-secret-at-least-32-chars',
    JWT_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
    REDIS_URL: 'redis://localhost:6379',
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
  },
}));

type Verify = (
  req: unknown,
  at: string,
  rt: string,
  profile: Record<string, unknown>,
  done: (err: unknown, user?: unknown) => void,
) => Promise<void>;

let verify: Verify;
let nextProfile: Record<string, unknown>;

jest.mock('passport-google-oauth20', () => ({
  Strategy: class {
    constructor(_opts: unknown, cb: Verify) {
      verify = cb;
    }
  },
}));

jest.mock('passport', () => ({
  __esModule: true,
  default: {
    use: jest.fn(),
    // Stub of passport.authenticate('google'): run the captured verify, set req.user.
    authenticate:
      (_n: string, opts: { state?: string } = {}) =>
      (req: any, res: any, next: any) => {
        if (opts.state !== undefined) {
          // /google: pretend to be the redirect to Google, carrying the state we were given.
          const g = new URL('https://accounts.google.com/o/oauth2/v2/auth');
          g.searchParams.set('state', opts.state);
          return res.redirect(g.toString());
        }
        void verify(req, 'at', 'rt', nextProfile, (err, user) => {
          if (err || !user) return res.redirect('http://localhost:3000/login?error=oauth_failed');
          req.user = user;
          return next();
        });
      },
  },
}));

import './setupDb';

import crypto from 'crypto';

import express from 'express';
import supertest from 'supertest';

import { initPassport } from '../config/passport';
import logger from '../config/logger';
import { User } from '../models/User.model';
import oauthRoutes from '../routes/oauth.routes';
import redis from '../config/redis';
import { createOAuthState, oauthUtmKey, verifyOAuthState } from '../services/oauth-state';

import { rawUsers } from './t234-helpers';

const server = express();
server.use('/', oauthRoutes);

beforeAll(() => initPassport());
beforeEach(async () => {
  await redis.flushall();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
});

const CHALLENGE = 'A'.repeat(43);
const KEY = oauthUtmKey(CHALLENGE);
const SENTINEL = 'zzgooglesentinel';
type Utm = { s?: string; m?: string; c?: string };

const tick = () => new Promise((r) => setImmediate(r));
/** discardOAuthUtm is not awaited by the strategy, so give the delete a moment to land. */
async function keyGone(key = KEY) {
  for (let i = 0; i < 20; i++) {
    if ((await redis.exists(key)) === 0) return true;
    await tick();
  }
  return false;
}
const seed = (u: Utm) => redis.set(KEY, JSON.stringify(u), 'EX', 600);

/** Sign in via the callback; `utm` is what GET /google would have stored in Redis. */
async function callback(email: string, id: string, utm?: Utm) {
  nextProfile = { id, displayName: 'G User', emails: [{ value: email }] };
  if (utm) await seed(utm);
  return supertest(server)
    .get('/google/callback')
    .query({ state: createOAuthState(CHALLENGE) })
    .redirects(0);
}

describe('T-242 Google sign-up source (Redis)', () => {
  it('the key is oauth:utm:<sha256 hex of the challenge>', () => {
    const hex = crypto.createHash('sha256').update(CHALLENGE).digest('hex');
    expect(KEY).toBe(`oauth:utm:${hex}`);
  });

  it('a NEW Google user gets signupSource with the tags and recordedAt; the key is deleted', async () => {
    const before = Date.now();
    const res = await callback('g1@example.com', 'g-1', { s: 'google', m: 'cpc', c: 'spring' });
    expect(res.status).toBe(302);
    expect(new URL(res.headers.location).pathname).toBe('/auth/callback');
    const u = await User.findOne({ email: 'g1@example.com' }).lean();
    expect(u!.signupSource).toMatchObject({
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'spring',
    });
    expect(u!.signupSource!.recordedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(u!.acceptedVia).toBe('google');
    expect(await redis.exists(KEY)).toBe(0);
  });

  it('a new user with no key has no signupSource', async () => {
    await callback('g2@example.com', 'g-2');
    const raw = await rawUsers().findOne({ email: 'g2@example.com' });
    expect(raw).not.toBeNull();
    expect(raw).not.toHaveProperty('signupSource');
  });

  it('stored values are sanitised again on take: bad ones dropped, good kept, sign-in succeeds', async () => {
    const res = await callback('g3@example.com', 'g-3', {
      s: 'a@b.co',
      m: '12345678',
      c: 'ok',
    });
    expect(res.status).toBe(302);
    expect(new URL(res.headers.location).pathname).toBe('/auth/callback');
    const u = await User.findOne({ email: 'g3@example.com' }).lean();
    expect(u!.signupSource).toMatchObject({ utmCampaign: 'ok' });
    expect(u!.signupSource).not.toHaveProperty('utmSource');
    expect(u!.signupSource).not.toHaveProperty('utmMedium');
  });

  it('a stored value over 100 characters is cut to 100 on take', async () => {
    await callback('g3b@example.com', 'g-3b', { s: 'x'.repeat(300) });
    const u = await User.findOne({ email: 'g3b@example.com' }).lean();
    expect(u!.signupSource!.utmSource).toBe('x'.repeat(100));
  });

  it('a corrupt stored value gives no signupSource and the sign-up still succeeds', async () => {
    await redis.set(KEY, 'not json', 'EX', 600);
    nextProfile = { id: 'g-bad', displayName: 'G', emails: [{ value: 'gbad@example.com' }] };
    const res = await supertest(server)
      .get('/google/callback')
      .query({ state: createOAuthState(CHALLENGE) })
      .redirects(0);
    expect(new URL(res.headers.location).pathname).toBe('/auth/callback');
    expect(await rawUsers().findOne({ email: 'gbad@example.com' })).not.toHaveProperty(
      'signupSource',
    );
    expect(await redis.exists(KEY)).toBe(0);
  });

  it('an existing email account that signs in with Google (link) is unchanged; the key is deleted', async () => {
    await User.create({ email: 'glink@example.com', name: 'L', password: 'Passw0rdOk' });
    const res = await callback('glink@example.com', 'g-link', { s: 'late' });
    expect(res.status).toBe(302);
    const raw = await rawUsers().findOne({ email: 'glink@example.com' });
    expect(raw).not.toHaveProperty('signupSource');
    expect(raw!.googleId).toBe('g-link');
    expect(await keyGone()).toBe(true);
  });

  it('a link into an account that already has a source keeps the old one; the key is deleted', async () => {
    const recordedAt = new Date('2026-01-01T00:00:00Z');
    await User.create({
      email: 'glink2@example.com',
      name: 'L',
      password: 'Passw0rdOk',
      signupSource: { utmSource: 'first', recordedAt },
    });
    await callback('glink2@example.com', 'g-link2', { s: 'second', m: 'm' });
    const u = await User.findOne({ email: 'glink2@example.com' }).lean();
    expect(u!.signupSource!.utmSource).toBe('first');
    expect(u!.signupSource).not.toHaveProperty('utmMedium');
    expect(u!.signupSource!.recordedAt.toISOString()).toBe(recordedAt.toISOString());
    expect(await keyGone()).toBe(true);
  });

  it('a returning Google user is unchanged, whatever tags are stored; the key is deleted', async () => {
    await callback('gret@example.com', 'g-ret', { s: 'first' });
    const first = await User.findOne({ email: 'gret@example.com' }).lean();
    await callback('gret@example.com', 'g-ret', { s: 'second', c: 'c' });
    const again = await User.findOne({ email: 'gret@example.com' }).lean();
    expect(again!.signupSource!.utmSource).toBe('first');
    expect(again!.signupSource).not.toHaveProperty('utmCampaign');
    expect(again!.signupSource!.recordedAt.getTime()).toBe(
      first!.signupSource!.recordedAt.getTime(),
    );
    expect(await keyGone()).toBe(true);
  });

  it('a returning Google user who had no source does not gain one; the key is deleted', async () => {
    await callback('gret2@example.com', 'g-ret2');
    await callback('gret2@example.com', 'g-ret2', { s: 'late' });
    const raw = await rawUsers().findOne({ email: 'gret2@example.com' });
    expect(raw).not.toHaveProperty('signupSource');
    expect(await keyGone()).toBe(true);
  });

  it('a deactivated account is refused, unchanged, and the key is deleted', async () => {
    await User.create({
      email: 'gdead@example.com',
      name: 'D',
      password: 'Passw0rdOk',
      googleId: 'g-dead',
      isActive: false,
    });
    const before = await rawUsers().findOne({ email: 'gdead@example.com' });
    const res = await callback('gdead@example.com', 'g-dead', { s: 'late', m: 'x' });
    expect(res.status).toBe(302);
    expect(new URL(res.headers.location).pathname).not.toBe('/auth/callback');
    const after = await rawUsers().findOne({ email: 'gdead@example.com' });
    expect(after).not.toHaveProperty('signupSource');
    expect(after).toEqual(before);
    expect(await keyGone()).toBe(true);
  });

  it('a deactivated email account (link attempt) is not linked, has no source; key deleted', async () => {
    await User.create({
      email: 'gdead2@example.com',
      name: 'D',
      password: 'Passw0rdOk',
      isActive: false,
    });
    const res = await callback('gdead2@example.com', 'g-dead2', { s: 'late' });
    expect(new URL(res.headers.location).pathname).not.toBe('/auth/callback');
    const raw = await rawUsers().findOne({ email: 'gdead2@example.com' });
    expect(raw).not.toHaveProperty('signupSource');
    expect(raw).not.toHaveProperty('googleId');
    expect(await keyGone()).toBe(true);
  });
});

describe('T-242 GET /google stores the tags in Redis, not in the URL', () => {
  const start = (q: Record<string, string>) =>
    supertest(server)
      .get('/google')
      .query({ challenge: CHALLENGE, ...q })
      .redirects(0);

  it('the redirect Location carries no tag value; the key holds the sanitised tags with TTL <= 600', async () => {
    const res = await start({
      utmSource: `${SENTINEL}src`,
      utmMedium: 'a@b.co',
      utmCampaign: 'c'.repeat(300),
    });
    expect(res.status).toBe(302);
    const loc = res.headers.location as string;
    expect(loc).toContain('accounts.google.com');
    expect(loc).not.toContain(SENTINEL);
    expect(decodeURIComponent(loc)).not.toContain(SENTINEL);
    expect(loc).not.toMatch(/utm/i);
    expect(loc).not.toContain('cccccccccc');
    const state = new URL(loc).searchParams.get('state')!;
    expect(Buffer.from(state.split('.')[0], 'base64url').toString('utf8')).not.toContain(SENTINEL);
    expect(verifyOAuthState(state)).not.toHaveProperty('u');

    expect(await redis.keys('oauth:utm:*')).toEqual([KEY]);
    expect(JSON.parse((await redis.get(KEY)) as string)).toEqual({
      s: `${SENTINEL}src`,
      c: 'c'.repeat(100),
    });
    const ttl = await redis.ttl(KEY);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(600);
  });

  it('stored JSON holds only the 3 allowlisted tags; other query params are not stored', async () => {
    await start({ utmSource: 'a', utmMedium: 'b', utmCampaign: 'c', utmTerm: 'nope', foo: 'bar' });
    expect(JSON.parse((await redis.get(KEY)) as string)).toEqual({ s: 'a', m: 'b', c: 'c' });
  });

  it('no tags: no key is set', async () => {
    const res = await start({});
    expect(res.status).toBe(302);
    expect(await redis.keys('oauth:utm:*')).toEqual([]);
  });

  it('only bad tags: no key is set', async () => {
    await start({ utmSource: 'a@b.co', utmMedium: '12345678' });
    expect(await redis.keys('oauth:utm:*')).toEqual([]);
  });

  it('start then callback: a new user gets the tags and the key is gone', async () => {
    const res = await start({ utmSource: 'start-src', utmMedium: 'a@b.co', utmCampaign: 'camp' });
    const state = new URL(res.headers.location).searchParams.get('state')!;

    nextProfile = { id: 'g-e2e', displayName: 'E', emails: [{ value: 'ge2e@example.com' }] };
    await supertest(server).get('/google/callback').query({ state }).redirects(0);
    const u = await User.findOne({ email: 'ge2e@example.com' }).lean();
    expect(u!.signupSource).toMatchObject({ utmSource: 'start-src', utmCampaign: 'camp' });
    expect(u!.signupSource).not.toHaveProperty('utmMedium');
    expect(await redis.exists(KEY)).toBe(0);
  });

  it('start then callback: an existing user is unchanged and the key is gone', async () => {
    await User.create({ email: 'ge2e2@example.com', name: 'X', password: 'Passw0rdOk' });
    const res = await start({ utmSource: 'start-src' });
    const state = new URL(res.headers.location).searchParams.get('state')!;
    nextProfile = { id: 'g-e2e2', displayName: 'E', emails: [{ value: 'ge2e2@example.com' }] };
    await supertest(server).get('/google/callback').query({ state }).redirects(0);
    expect(await rawUsers().findOne({ email: 'ge2e2@example.com' })).not.toHaveProperty(
      'signupSource',
    );
    expect(await keyGone()).toBe(true);
  });

  it('the referral code still rides in the state', async () => {
    const res = await start({ referralCode: 'abc123', utmSource: 'x' });
    const state = new URL(res.headers.location).searchParams.get('state')!;
    expect(verifyOAuthState(state)!.r).toBe('ABC123');
  });
});

describe('T-242 Redis failures fail open, for the tags only', () => {
  afterEach(() => jest.restoreAllMocks());

  it('Redis failing on store: /google still redirects, nothing stored, sign-up has no signupSource', async () => {
    jest.spyOn(redis, 'set').mockRejectedValueOnce(new Error('redis down'));
    const res = await supertest(server)
      .get('/google')
      .query({ challenge: CHALLENGE, utmSource: 'lost' })
      .redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('accounts.google.com');
    expect(await redis.keys('oauth:utm:*')).toEqual([]);

    const state = new URL(res.headers.location).searchParams.get('state')!;
    nextProfile = { id: 'g-f1', displayName: 'F', emails: [{ value: 'gf1@example.com' }] };
    const cb = await supertest(server).get('/google/callback').query({ state }).redirects(0);
    expect(new URL(cb.headers.location).pathname).toBe('/auth/callback');
    const raw = await rawUsers().findOne({ email: 'gf1@example.com' });
    expect(raw).not.toBeNull();
    expect(raw).not.toHaveProperty('signupSource');
  });

  it('Redis failing on take (multi throws): sign-up succeeds with no signupSource', async () => {
    await seed({ s: 'lost' });
    jest.spyOn(redis, 'multi').mockImplementationOnce(() => {
      throw new Error('redis down');
    });
    const res = await callback('gf2@example.com', 'g-f2');
    expect(new URL(res.headers.location).pathname).toBe('/auth/callback');
    const raw = await rawUsers().findOne({ email: 'gf2@example.com' });
    expect(raw).not.toBeNull();
    expect(raw).not.toHaveProperty('signupSource');
  });

  it('Redis failing on take (exec rejects): sign-up succeeds with no signupSource', async () => {
    await seed({ s: 'lost' });
    jest.spyOn(redis, 'multi').mockImplementationOnce(
      () =>
        ({
          get: () => ({ del: () => ({ exec: () => Promise.reject(new Error('redis down')) }) }),
        }) as never,
    );
    const res = await callback('gf3@example.com', 'g-f3');
    expect(new URL(res.headers.location).pathname).toBe('/auth/callback');
    expect(await rawUsers().findOne({ email: 'gf3@example.com' })).not.toHaveProperty(
      'signupSource',
    );
  });

  it('Redis failing on take (GET errors inside exec): sign-up succeeds with no signupSource', async () => {
    await seed({ s: 'lost' });
    jest.spyOn(redis, 'multi').mockImplementationOnce(
      () =>
        ({
          get: () => ({
            del: () => ({
              exec: () =>
                Promise.resolve([
                  [new Error('boom'), null],
                  [null, 0],
                ]),
            }),
          }),
        }) as never,
    );
    const res = await callback('gf4@example.com', 'g-f4');
    expect(new URL(res.headers.location).pathname).toBe('/auth/callback');
    expect(await rawUsers().findOne({ email: 'gf4@example.com' })).not.toHaveProperty(
      'signupSource',
    );
  });

  it('Redis failing on delete for a returning user: sign-in still succeeds, record unchanged', async () => {
    await callback('gret3@example.com', 'g-ret3');
    jest.spyOn(redis, 'del').mockRejectedValue(new Error('redis down'));
    const res = await callback('gret3@example.com', 'g-ret3', { s: 'late' });
    expect(new URL(res.headers.location).pathname).toBe('/auth/callback');
    await tick();
    expect(await rawUsers().findOne({ email: 'gret3@example.com' })).not.toHaveProperty(
      'signupSource',
    );
  });
});

describe('T-242 logging', () => {
  const spyAll = () =>
    (['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const).map((l) =>
      jest.spyOn(logger, l),
    );

  it('no logger call carries a tag value (store, new user, returning user)', async () => {
    const spies = spyAll();
    try {
      await supertest(server)
        .get('/google')
        .query({
          challenge: CHALLENGE,
          utmSource: SENTINEL,
          utmMedium: `${SENTINEL}m`,
          utmCampaign: `${SENTINEL}c`,
        })
        .redirects(0);
      await callback('glog@example.com', 'g-log');
      await callback('glog@example.com', 'g-log', {
        s: SENTINEL,
        m: `${SENTINEL}m`,
        c: `${SENTINEL}c`,
      });
      await keyGone();
      const calls = spies.flatMap((s) => s.mock.calls);
      expect(calls.length).toBeGreaterThan(0);
      expect(JSON.stringify(calls)).not.toContain(SENTINEL);
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });

  it('no logger call carries a tag value when Redis fails on store and on take', async () => {
    const spies = spyAll();
    try {
      jest.spyOn(redis, 'set').mockRejectedValueOnce(new Error(`down ${'x'}`));
      await supertest(server)
        .get('/google')
        .query({ challenge: CHALLENGE, utmSource: SENTINEL })
        .redirects(0);
      await seed({ s: SENTINEL, m: `${SENTINEL}m` });
      jest.spyOn(redis, 'multi').mockImplementationOnce(() => {
        throw new Error('redis down');
      });
      await callback('glog2@example.com', 'g-log2');
      const calls = spies.flatMap((s) => s.mock.calls);
      expect(calls.length).toBeGreaterThan(0);
      expect(JSON.stringify(calls)).not.toContain(SENTINEL);
    } finally {
      spies.forEach((s) => s.mockRestore());
      jest.restoreAllMocks();
    }
  });
});

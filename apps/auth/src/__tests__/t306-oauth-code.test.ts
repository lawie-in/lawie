/**
 * T-306: Google sign-in never puts tokens in a URL. The callback redirects with a one-time code
 * (sha256-keyed in Redis, 60 s TTL) and POST /oauth/exchange swaps it for the token pair once.
 */

import './setupEnv';

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

jest.mock('passport-google-oauth20', () => ({ Strategy: class {} }));

// The stubbed passport.authenticate puts the user named in x-test-user on req.user.
jest.mock('passport', () => ({
  __esModule: true,
  default: {
    use: jest.fn(),
    authenticate: () => (req: any, _res: any, next: any) => {
      const id = String(req.headers['x-test-user'] ?? 'user-a');
      req.user = { id, email: `${id}@example.com`, name: id, role: 'Lawyer', plan: 'free' };
      next();
    },
  },
}));

jest.mock('../services/session.service', () => ({
  createSession: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/credit-bonus.service', () => ({
  tryGrantDailyLoginBonus: jest.fn().mockResolvedValue(undefined),
}));

import crypto from 'crypto';

import express from 'express';
import supertest from 'supertest';

import logger from '../config/logger';
import redis from '../config/redis';
import oauthRoutes from '../routes/oauth.routes';
import { challengeForVerifier, createOAuthState } from '../services/oauth-state';

const server = express();
server.use(express.json());
server.use('/', oauthRoutes);

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const keyFor = (code: string) => `oauth:code:${sha(code)}`;

// T-319: every sign-in carries a signed state holding the challenge of a fresh verifier, and the
// exchange needs that verifier. The default verifier is shared by tests that sign in once.
const newVerifier = () => crypto.randomBytes(32).toString('base64url');
const VERIFIER = newVerifier();

interface Signin {
  location: string;
  code: string;
  verifier: string;
  res: supertest.Response;
}

async function signIn(user = 'user-a', verifier = VERIFIER): Promise<Signin> {
  const state = createOAuthState(challengeForVerifier(verifier));
  const res = await supertest(server)
    .get('/google/callback')
    .query({ state })
    .set('x-test-user', user)
    .redirects(0);
  const location = res.headers.location as string;
  const code = new URL(location).searchParams.get('code') ?? '';
  return { location, code, verifier, res };
}

// By default the body carries the shared verifier; pass a body with its own `verifier` to override.
const exchange = (body?: unknown) =>
  supertest(server)
    .post('/oauth/exchange')
    .send(
      body && typeof body === 'object' && !('verifier' in body)
        ? { verifier: VERIFIER, ...(body as object) }
        : (body as object),
    );

const LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
let logSpies: jest.SpyInstance[] = [];
let stdoutSpy: jest.SpyInstance;
let stderrSpy: jest.SpyInstance;

function everythingLogged(): string {
  const parts: string[] = [];
  for (const spy of logSpies) parts.push(JSON.stringify(spy.mock.calls, replacer));
  for (const spy of [stdoutSpy, stderrSpy]) parts.push(JSON.stringify(spy.mock.calls, replacer));
  return parts.join('\n');
}

function replacer(_k: string, v: unknown) {
  if (v instanceof Error) return { message: v.message, stack: v.stack };
  return v;
}

beforeEach(async () => {
  await redis.flushall();
  logSpies = LEVELS.map((l) => jest.spyOn(logger, l).mockImplementation(() => undefined));
  stdoutSpy = jest.spyOn(process.stdout, 'write');
  stderrSpy = jest.spyOn(process.stderr, 'write');
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('T-306 Google callback redirect', () => {
  it('contains code= and neither token, in query or fragment', async () => {
    const { res, location, code } = await signIn();
    expect(res.status).toBe(302);
    const url = new URL(location);
    expect(url.origin + url.pathname).toBe('http://localhost:3000/auth/callback');
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes base64url
    expect(url.hash).toBe('');
    expect(url.searchParams.has('accessToken')).toBe(false);
    expect(url.searchParams.has('refreshToken')).toBe(false);

    const { accessToken, refreshToken } = (await exchange({ code })).body;
    expect(location).not.toContain(accessToken);
    expect(location).not.toContain(refreshToken);
  });

  it('gives a different code on every sign-in', async () => {
    const a = await signIn();
    const b = await signIn();
    expect(a.code).not.toBe(b.code);
  });

  it('stores the pair under the sha256 of the code, never the raw code, with a 60 s TTL', async () => {
    const { code } = await signIn();
    const keys = await redis.keys('oauth:code:*');
    expect(keys).toEqual([keyFor(code)]);
    expect(keys[0]).not.toContain(code);
    expect(await redis.exists(`oauth:code:${code}`)).toBe(0);
    const ttl = await redis.ttl(keyFor(code));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
    const stored = JSON.parse((await redis.get(keyFor(code))) as string);
    expect(Object.keys(stored).sort()).toEqual(['accessToken', 'challenge', 'refreshToken']);
    expect(stored.challenge).toBe(challengeForVerifier(VERIFIER));
  });

  it('a Redis store failure redirects to /login?error=oauth_failed with no tokens or code', async () => {
    jest.spyOn(redis, 'set').mockRejectedValueOnce(new Error('redis down'));
    const res = await supertest(server)
      .get('/google/callback')
      .query({ state: createOAuthState(challengeForVerifier(VERIFIER)) })
      .redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:3000/login?error=oauth_failed');
    expect(res.headers.location).not.toMatch(/accessToken|refreshToken|code=/);
    expect(await redis.keys('oauth:code:*')).toEqual([]);
  });
});

describe('T-306 POST /oauth/exchange', () => {
  it('returns the pair once, then invalid_code the second time', async () => {
    const { code } = await signIn();
    const first = await exchange({ code });
    expect(first.status).toBe(200);
    expect(typeof first.body.accessToken).toBe('string');
    expect(typeof first.body.refreshToken).toBe('string');
    expect(first.body.accessToken.split('.')).toHaveLength(3);
    expect(first.headers['cache-control']).toBe('no-store');

    const second = await exchange({ code });
    expect(second.status).toBe(400);
    expect(second.body).toEqual({ error: 'invalid_code' });
    expect(second.headers['cache-control']).toBe('no-store');
    expect(await redis.exists(keyFor(code))).toBe(0);
  });

  it('two parallel exchanges of one code: exactly one wins', async () => {
    const { code } = await signIn();
    const rs = await Promise.all([exchange({ code }), exchange({ code }), exchange({ code })]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 400, 400]);
  });

  it('the pair belongs to the user who signed in', async () => {
    const { code } = await signIn('user-zed');
    const { accessToken } = (await exchange({ code })).body;
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString());
    expect(payload.sub).toBe('user-zed');
  });

  it('refuses an expired code (fake timers, 61 s)', async () => {
    jest.useFakeTimers({
      now: Date.now(),
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
    });
    const { code } = await signIn();
    expect(await redis.ttl(keyFor(code))).toBe(60);
    jest.setSystemTime(Date.now() + 61_000);
    jest.advanceTimersByTime(61_000);
    const res = await exchange({ code });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_code' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('refuses a random code', async () => {
    const res = await exchange({ code: crypto.randomBytes(32).toString('base64url') });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_code' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it("refuses a different user's already-used code and leaves the other user's code alone", async () => {
    const a = await signIn('user-a');
    const b = await signIn('user-b');
    expect((await exchange({ code: a.code })).status).toBe(200);

    const replay = await exchange({ code: a.code });
    expect(replay.status).toBe(400);
    expect(replay.body).toEqual({ error: 'invalid_code' });

    // A near-miss of B's live code is refused, and B's own code still works once.
    const tweaked = b.code.slice(0, -1) + (b.code.endsWith('A') ? 'B' : 'A');
    expect((await exchange({ code: tweaked })).status).toBe(400);
    expect((await exchange({ code: b.code })).status).toBe(200);
    expect((await exchange({ code: b.code })).status).toBe(400);
  });

  it('refuses the raw sha256 key material as a code', async () => {
    const { code } = await signIn();
    const res = await exchange({ code: sha(code) });
    expect(res.status).toBe(400);
    expect(await redis.exists(keyFor(code))).toBe(1);
  });

  it.each([
    ['missing body field', {}],
    ['null', { code: null }],
    ['number', { code: 1234567890123456 }],
    ['array', { code: ['a'.repeat(43)] }],
    ['object', { code: { $ne: '' } }],
    ['empty string', { code: '' }],
    ['too short (15)', { code: 'a'.repeat(15) }],
    ['too long (129)', { code: 'a'.repeat(129) }],
  ])('refuses a bad shape: %s', async (_label, body) => {
    const res = await exchange(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_code' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('no body at all is refused', async () => {
    const res = await supertest(server).post('/oauth/exchange');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_code' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('accepts the boundary lengths as shape (16 and 128) but refuses them as unknown codes', async () => {
    for (const len of [16, 128]) {
      const res = await exchange({ code: 'a'.repeat(len) });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'invalid_code' });
    }
  });

  it('a corrupt stored value is refused with invalid_code and the key is consumed', async () => {
    const code = crypto.randomBytes(32).toString('base64url');
    await redis.set(keyFor(code), 'not json', 'EX', 60);
    const res = await exchange({ code });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_code' });
    expect(await redis.exists(keyFor(code))).toBe(0);
  });

  it('a stored value missing a token is refused', async () => {
    const code = crypto.randomBytes(32).toString('base64url');
    await redis.set(keyFor(code), JSON.stringify({ accessToken: 'x' }), 'EX', 60);
    const res = await exchange({ code });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_code' });
  });

  it('a Redis error on exchange is a 400 invalid_code with no-store', async () => {
    jest.spyOn(redis, 'multi').mockImplementationOnce(() => {
      throw new Error('redis down');
    });
    const res = await exchange({ code: 'a'.repeat(43) });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_code' });
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('T-306 nothing sensitive is logged', () => {
  it('success, failure and Redis-error paths log neither the code nor the tokens', async () => {
    const { code } = await signIn();
    const pair = (await exchange({ code })).body;
    await exchange({ code }); // replay
    await exchange({ code: 'z'.repeat(43) }); // unknown
    await exchange({ code: 5 }); // bad shape

    // Redis errors on both routes: these do log, and must still not carry the secrets.
    const live = await signIn('user-b');
    const livePair = JSON.parse((await redis.get(keyFor(live.code))) as string);
    jest.spyOn(redis, 'multi').mockImplementationOnce(() => {
      throw new Error('redis down');
    });
    await exchange({ code: live.code });
    jest.spyOn(redis, 'set').mockRejectedValueOnce(new Error('redis down'));
    await supertest(server)
      .get('/google/callback')
      .query({ state: createOAuthState(challengeForVerifier(VERIFIER)) })
      .redirects(0);

    const logged = everythingLogged();
    const failureLogged = logSpies.some((s) => s.mock.calls.length > 0);
    expect(failureLogged).toBe(true); // the Redis error paths do log, so the spy is live
    for (const secret of [
      code,
      live.code,
      sha(code),
      pair.accessToken,
      pair.refreshToken,
      livePair.accessToken,
      livePair.refreshToken,
    ]) {
      expect(logged).not.toContain(secret);
    }
  });
});

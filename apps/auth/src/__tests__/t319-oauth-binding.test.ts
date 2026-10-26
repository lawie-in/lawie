/**
 * T-319: login CSRF. The web app keeps a random verifier in sessionStorage and sends only its
 * hash (the challenge) through Google inside an HMAC-signed state. The one-time code is bound to
 * that challenge, and POST /oauth/exchange hands out the tokens only for the matching verifier.
 *
 * Runs the real oauth routes, the real oauth-state helpers and the real passport verify callback
 * (captured from the Strategy mock). Only passport.authenticate and Google itself are stubbed.
 */

import './setupEnv';

// T-587: a Google sign-up / link queues the welcome email; stub the client so nothing reaches Redis.
jest.mock('@lawie/email-client', () => ({
  enqueueEmail: jest.fn().mockResolvedValue({ jobId: 'j' }),
}));

jest.mock('ioredis', () => require('ioredis-mock'));

const JWT_SECRET = 'test-jwt-secret-key-at-least-32-chars-long';

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
// Counts how often the callback-side passport middleware (the Google code exchange) really runs.
const callbackAuthRuns = jest.fn();

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
    authenticate:
      (_name: string, opts: { state?: string } = {}) =>
      (req: any, res: any, next: any) => {
        if (opts.state !== undefined) {
          // /google: pretend to be the redirect to Google, carrying the state we were given.
          const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
          u.searchParams.set('state', opts.state);
          return res.redirect(u.toString());
        }
        callbackAuthRuns();
        return void verify(req, 'at', 'rt', nextProfile, (err, user) => {
          if (err || !user) return res.redirect('http://localhost:3000/login?error=oauth_failed');
          req.user = user;
          return next();
        });
      },
  },
}));

jest.mock('../services/session.service', () => ({
  createSession: jest.fn().mockResolvedValue(undefined),
}));

import './setupDb';

import crypto from 'crypto';

import express from 'express';
import supertest from 'supertest';

import { initPassport } from '../config/passport';
import logger from '../config/logger';
import redis from '../config/redis';
import { ReferralCode } from '../models/ReferralCode.model';
import { User } from '../models/User.model';
import oauthRoutes from '../routes/oauth.routes';
import { createSession } from '../services/session.service';
import {
  OAUTH_VERIFIED_STATE_KEY,
  challengeForVerifier,
  createOAuthState,
  verifierMatchesChallenge,
  verifyOAuthState,
} from '../services/oauth-state';

import { makeCode, rawUsers, waitForSeed } from './t234-helpers';

const server = express();
server.use(express.json());
server.use('/', oauthRoutes);

beforeAll(() => initPassport());

const b64u = (s: string | Buffer) => Buffer.from(s).toString('base64url');
const newVerifier = () => crypto.randomBytes(32).toString('base64url');
const hmac = (key: crypto.BinaryLike, data: string) =>
  crypto.createHmac('sha256', key).update(data).digest('base64url');
const derivedKey = () => crypto.createHmac('sha256', JWT_SECRET).update('oauth-state-v1').digest();

/** A state signed by the test itself, so any payload and any key can be crafted. */
function craftState(body: Record<string, unknown>, key: crypto.BinaryLike = derivedKey()) {
  const payload = b64u(JSON.stringify(body));
  return `${payload}.${hmac(key, payload)}`;
}

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const keyFor = (code: string) => `oauth:code:${sha(code)}`;

function callback(state?: string, email = 'u319@example.com', id = 'g-319') {
  nextProfile = { id, displayName: 'G User', emails: [{ value: email }] };
  return supertest(server)
    .get('/google/callback')
    .query(state === undefined ? {} : { state })
    .redirects(0);
}

const codeOf = (res: supertest.Response) =>
  new URL(res.headers.location as string).searchParams.get('code') ?? '';

const exchange = (body?: unknown) =>
  supertest(server)
    .post('/oauth/exchange')
    .send(body as object);

/** Full good path through /google then the callback. */
async function signIn(verifier = newVerifier(), referral?: string, email = 'u319@example.com') {
  const g = await supertest(server)
    .get('/google')
    .query({
      challenge: challengeForVerifier(verifier),
      ...(referral ? { referralCode: referral } : {}),
    })
    .redirects(0);
  const state = new URL(g.headers.location as string).searchParams.get('state') as string;
  const res = await callback(state, email, `g-${email}`);
  return { verifier, state, res, code: codeOf(res) };
}

const LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
let logSpies: jest.SpyInstance[] = [];
let stdoutSpy: jest.SpyInstance;
let stderrSpy: jest.SpyInstance;

function everythingLogged(): string {
  const r = (_k: string, v: unknown) => (v instanceof Error ? { m: v.message, s: v.stack } : v);
  return [...logSpies, stdoutSpy, stderrSpy].map((s) => JSON.stringify(s.mock.calls, r)).join('\n');
}

beforeEach(async () => {
  await redis.flushall();
  callbackAuthRuns.mockClear();
  (createSession as jest.Mock).mockClear();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
  logSpies = LEVELS.map((l) => jest.spyOn(logger, l).mockImplementation(() => undefined));
  stdoutSpy = jest.spyOn(process.stdout, 'write');
  stderrSpy = jest.spyOn(process.stderr, 'write');
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

function expectRefusedCallback(res: supertest.Response) {
  expect(res.status).toBe(302);
  expect(res.headers.location).toBe('http://localhost:3000/login?error=oauth_failed');
}

async function expectNothingCreated() {
  expect(callbackAuthRuns).not.toHaveBeenCalled(); // no Google code exchange, no user lookup
  expect(createSession).not.toHaveBeenCalled();
  expect(await redis.keys('oauth:code:*')).toEqual([]);
  expect(await User.countDocuments({})).toBe(0);
}

describe('T-319 good path (AC1-AC3)', () => {
  it('the right verifier gets the pair exactly once; the code is then gone', async () => {
    const { verifier, code, res } = await signIn();
    expect(res.status).toBe(302);
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const first = await exchange({ code, verifier });
    expect(first.status).toBe(200);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.body.accessToken.split('.')).toHaveLength(3);
    expect(typeof first.body.refreshToken).toBe('string');

    const second = await exchange({ code, verifier });
    expect(second.status).toBe(400);
    expect(second.body).toEqual({ error: 'invalid_code' });
    expect(await redis.exists(keyFor(code))).toBe(0);
  });

  it('the code is stored with the challenge of the verifier, and the verifier is never stored', async () => {
    const { verifier, code } = await signIn();
    const stored = JSON.parse((await redis.get(keyFor(code))) as string);
    expect(stored.challenge).toBe(challengeForVerifier(verifier));
    expect(JSON.stringify(stored)).not.toContain(verifier);
  });

  it('two browsers: each verifier opens only its own code', async () => {
    const a = await signIn(undefined, undefined, 'a319@example.com');
    const b = await signIn(undefined, undefined, 'b319@example.com');
    expect((await exchange({ code: a.code, verifier: b.verifier })).status).toBe(400);
    expect((await exchange({ code: b.code, verifier: a.verifier })).status).toBe(400);
    // Both codes were burned by the failed tries.
    expect((await exchange({ code: a.code, verifier: a.verifier })).status).toBe(400);
    expect((await exchange({ code: b.code, verifier: b.verifier })).status).toBe(400);
  });

  it('parallel exchanges with the right verifier: exactly one wins', async () => {
    const { verifier, code } = await signIn();
    const rs = await Promise.all([1, 2, 3].map(() => exchange({ code, verifier })));
    expect(rs.map((r) => r.status).sort()).toEqual([200, 400, 400]);
  });
});

describe('T-319 exchange refusals (AC3)', () => {
  it('wrong verifier: 400 invalid_code, and the code is burned so the right verifier fails too', async () => {
    const { verifier, code } = await signIn();
    const bad = await exchange({ code, verifier: newVerifier() });
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({ error: 'invalid_code' });
    expect(bad.headers['cache-control']).toBe('no-store');
    expect(await redis.exists(keyFor(code))).toBe(0);

    const retry = await exchange({ code, verifier });
    expect(retry.status).toBe(400);
    expect(retry.body).toEqual({ error: 'invalid_code' });
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['empty', ''],
    ['number', 12345],
    ['array', [] as unknown[]],
    ['object', { $ne: '' }],
    ['42 chars', 'a'.repeat(42)],
    ['44 chars', 'a'.repeat(44)],
    ['43 chars, not base64url', 'a'.repeat(42) + '+'],
    ['43 chars with padding char', 'a'.repeat(42) + '='],
    ['43 chars with space', 'a'.repeat(42) + ' '],
  ])('verifier %s: 400 invalid_code (same body) and the code is burned', async (_l, bad) => {
    const { verifier, code } = await signIn();
    const res = await exchange({ code, verifier: bad });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_code' });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(await redis.exists(keyFor(code))).toBe(0);
    expect((await exchange({ code, verifier })).status).toBe(400);
  });

  it('a body with no verifier key at all is refused like a wrong one', async () => {
    const { code } = await signIn();
    const res = await exchange({ code });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_code' });
  });

  it('every failure looks the same to the caller (no oracle for code vs verifier)', async () => {
    const { code } = await signIn();
    const wrongVerifier = await exchange({ code, verifier: newVerifier() });
    const unknownCode = await exchange({ code: newVerifier(), verifier: newVerifier() });
    expect(wrongVerifier.status).toBe(unknownCode.status);
    expect(wrongVerifier.body).toEqual(unknownCode.body);
    expect(wrongVerifier.headers['cache-control']).toBe(unknownCode.headers['cache-control']);
  });

  it('a stored record without a challenge (pre-T-319 shape) is refused whatever the verifier', async () => {
    const code = newVerifier();
    await redis.set(
      keyFor(code),
      JSON.stringify({ accessToken: 'a', refreshToken: 'r' }),
      'EX',
      60,
    );
    const res = await exchange({ code, verifier: newVerifier() });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_code' });
  });

  it('the challenge itself is not accepted as the verifier', async () => {
    const { verifier, code } = await signIn();
    const res = await exchange({ code, verifier: challengeForVerifier(verifier) });
    expect(res.status).toBe(400);
  });
});

describe('T-319 GET /google challenge validation (AC1)', () => {
  const goodChallenge = challengeForVerifier(newVerifier());

  it('a valid challenge redirects to Google with a signed state', async () => {
    const res = await supertest(server)
      .get('/google')
      .query({ challenge: goodChallenge })
      .redirects(0);
    expect(res.status).toBe(302);
    const state = new URL(res.headers.location).searchParams.get('state') as string;
    expect(verifyOAuthState(state)).toMatchObject({ c: goodChallenge });
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['42 chars', 'a'.repeat(42)],
    ['44 chars', 'a'.repeat(44)],
    ['43 chars with +', 'a'.repeat(42) + '+'],
    ['43 chars with /', 'a'.repeat(42) + '/'],
    ['43 chars with =', 'a'.repeat(42) + '='],
    ['43 chars with a dot', 'a'.repeat(42) + '.'],
    ['43 chars with a space', 'a'.repeat(42) + ' '],
    ['43 non-ascii', 'é'.repeat(43)],
  ])('challenge %s: 400 invalid_challenge, no redirect', async (_l, challenge) => {
    const res = await supertest(server)
      .get('/google')
      .query(challenge === undefined ? {} : { challenge })
      .redirects(0);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_challenge' });
    expect(res.headers.location).toBeUndefined();
  });

  it('a repeated challenge parameter (array) is refused', async () => {
    const res = await supertest(server)
      .get(`/google?challenge=${goodChallenge}&challenge=${goodChallenge}`)
      .redirects(0);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_challenge' });
  });

  it('an object-shaped challenge (challenge[a]=b) is refused', async () => {
    const res = await supertest(server).get('/google?challenge[a]=b').redirects(0);
    expect(res.status).toBe(400);
  });
});

describe('T-319 callback state verification (AC2): refused states stop everything', () => {
  const challenge = challengeForVerifier(newVerifier());
  const good = () => createOAuthState(challenge);

  it('control: the good state is accepted', async () => {
    const res = await callback(good());
    expect(res.status).toBe(302);
    expect(new URL(res.headers.location).pathname).toBe('/auth/callback');
    expect(callbackAuthRuns).toHaveBeenCalledTimes(1);
  });

  const flip = (s: string, i: number) =>
    s.slice(0, i) + (s[i] === 'A' ? 'B' : 'A') + s.slice(i + 1);

  it.each([
    [
      'payload edited (challenge swapped, old signature)',
      () => {
        const [p, sig] = good().split('.') as [string, string];
        const body = JSON.parse(Buffer.from(p, 'base64url').toString());
        body.c = challengeForVerifier(newVerifier());
        return `${b64u(JSON.stringify(body))}.${sig}`;
      },
    ],
    [
      'payload edited (referral injected, old signature)',
      () => {
        const [p, sig] = good().split('.') as [string, string];
        const body = JSON.parse(Buffer.from(p, 'base64url').toString());
        body.r = 'EVIL';
        return `${b64u(JSON.stringify(body))}.${sig}`;
      },
    ],
    [
      'payload first character flipped',
      () => {
        const s = good();
        return flip(s, 0);
      },
    ],
    [
      'signature first character flipped',
      () => {
        const s = good();
        const i = s.indexOf('.') + 1;
        return flip(s, i);
      },
    ],
    [
      'signature last character flipped',
      () => {
        const s = good();
        return flip(s, s.length - 1);
      },
    ],
    ['signature removed', () => `${good().split('.')[0]}.`],
    ['signature truncated (length mismatch)', () => good().slice(0, -5)],
    ['signature padded (length mismatch)', () => `${good()}AAAA`],
    ['payload only, no dot', () => good().split('.')[0] as string],
    ['three segments', () => `${good()}.extra`],
    [
      'signed with a random key',
      () => craftState({ c: challenge, t: Date.now() }, crypto.randomBytes(32)),
    ],
    [
      'signed with the raw JWT_SECRET instead of the derived key',
      () => craftState({ c: challenge, t: Date.now() }, JWT_SECRET),
    ],
    [
      'signed with the refresh secret',
      () =>
        craftState({ c: challenge, t: Date.now() }, 'test-jwt-refresh-secret-at-least-32-chars'),
    ],
    ['garbage', () => 'not-a-state'],
    ['garbage with a dot', () => 'abc.def'],
    ['unicode garbage', () => 'ünï.cödé'],
    ['oversized (2000 chars)', () => `${'A'.repeat(2000)}.${'B'.repeat(43)}`],
    ['the raw challenge as state', () => challenge],
    ['a bare referral code as state (the pre-T-319 format)', () => 'GATEGOOG'],
  ])('%s -> /login?error=oauth_failed, nothing created', async (_l, make) => {
    const res = await callback(make());
    expectRefusedCallback(res);
    await expectNothingCreated();
  });

  it('missing state -> oauth_failed, nothing created', async () => {
    expectRefusedCallback(await callback(undefined));
    await expectNothingCreated();
  });

  it('empty state -> oauth_failed, nothing created', async () => {
    expectRefusedCallback(await callback(''));
    await expectNothingCreated();
  });

  it('repeated state parameter (array) -> oauth_failed, nothing created', async () => {
    const res = await supertest(server)
      .get(`/google/callback?state=${good()}&state=${good()}`)
      .redirects(0);
    expectRefusedCallback(res);
    await expectNothingCreated();
  });

  it('an error=access_denied callback with no state is refused without touching Google', async () => {
    const res = await supertest(server).get('/google/callback?error=access_denied').redirects(0);
    expectRefusedCallback(res);
    await expectNothingCreated();
  });

  describe('signed but invalid payloads', () => {
    it.each([
      ['challenge missing', { t: Date.now() }],
      ['challenge 42 chars', { c: 'a'.repeat(42), t: Date.now() }],
      ['challenge not base64url', { c: `${'a'.repeat(42)}+`, t: Date.now() }],
      ['challenge a number', { c: 5, t: Date.now() }],
      ['t missing', { c: challenge }],
      ['t a string', { c: challenge, t: String(Date.now()) }],
      ['t null', { c: challenge, t: null }],
      ['referral an empty string', { c: challenge, t: Date.now(), r: '' }],
      ['referral a number', { c: challenge, t: Date.now(), r: 7 }],
    ])('%s -> refused', async (_l, body) => {
      expectRefusedCallback(await callback(craftState(body)));
      await expectNothingCreated();
    });

    it.each([
      ['an array', '[]'],
      ['null', 'null'],
      ['a string', '"x"'],
      ['not JSON', '{nope'],
    ])('payload is %s -> refused', async (_l, raw) => {
      const payload = b64u(raw);
      expectRefusedCallback(await callback(`${payload}.${hmac(derivedKey(), payload)}`));
      await expectNothingCreated();
    });
  });

  describe('age (10 minutes, 60 s skew)', () => {
    const freeze = () =>
      jest.useFakeTimers({
        now: Date.now(),
        doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
      });

    it('a state older than 10 minutes is refused (fake timers)', async () => {
      freeze();
      const state = good();
      jest.setSystemTime(Date.now() + 10 * 60_000 + 1000);
      expectRefusedCallback(await callback(state));
      await expectNothingCreated();
    });

    it('a state just under 10 minutes is still accepted', async () => {
      freeze();
      const state = good();
      jest.setSystemTime(Date.now() + 10 * 60_000 - 5000);
      const res = await callback(state);
      expect(new URL(res.headers.location).pathname).toBe('/auth/callback');
    });

    it('a crafted properly signed state with t = 11 minutes ago is refused', async () => {
      const state = craftState({ c: challenge, t: Date.now() - 11 * 60_000 });
      expectRefusedCallback(await callback(state));
      await expectNothingCreated();
    });

    it('a state dated beyond the skew (+120 s) is refused', async () => {
      const state = craftState({ c: challenge, t: Date.now() + 120_000 });
      expectRefusedCallback(await callback(state));
      await expectNothingCreated();
    });

    it('a state far in the future is refused', async () => {
      const state = craftState({ c: challenge, t: Date.now() + 365 * 24 * 3600_000 });
      expectRefusedCallback(await callback(state));
      await expectNothingCreated();
    });

    it('a state inside the skew (+30 s) is accepted', async () => {
      const state = craftState({ c: challenge, t: Date.now() + 30_000 });
      const res = await callback(state);
      expect(new URL(res.headers.location).pathname).toBe('/auth/callback');
    });

    it('t = 0, negative and non-finite values are refused', async () => {
      for (const t of [0, -1, 1e308 * 10]) {
        expectRefusedCallback(await callback(craftState({ c: challenge, t })));
      }
      await expectNothingCreated();
    });
  });
});

describe('T-319 referral code travels in the signed state (r)', () => {
  it('a referral sent to /google is credited at sign-up through the signed state', async () => {
    await makeCode({ code: 'SIGNEDREF', bonusInk: 3 });
    const { res, code } = await signIn(undefined, 'signedref', 'ref319@example.com');
    expect(res.status).toBe(302);
    expect(code).toBeTruthy();
    const u = await User.findOne({ email: 'ref319@example.com' }).lean();
    await waitForSeed(u!._id);
    expect((await rawUsers().findOne({ _id: u!._id }))!.inkTopup).toBe(10 + 3 * 2);
    expect((await ReferralCode.findOne({ code: 'SIGNEDREF' }).lean())!.uses).toBe(1);
  });

  it('/google trims and upper-cases the referral code before signing it', async () => {
    const res = await supertest(server)
      .get('/google')
      .query({ challenge: challengeForVerifier(newVerifier()), referralCode: '  abc123 ' })
      .redirects(0);
    const state = new URL(res.headers.location).searchParams.get('state') as string;
    expect(verifyOAuthState(state)?.r).toBe('ABC123');
  });

  describe('referral code length on /google (dropped, never a 400)', () => {
    // OAUTH_STATE_MAX_LENGTH in oauth-state.ts is not exported, so its value is hard-coded here.
    const STATE_MAX_LENGTH = 1024;
    const stateFor = async (referralCode: string) => {
      const res = await supertest(server)
        .get('/google')
        .query({ challenge: challengeForVerifier(newVerifier()), referralCode })
        .redirects(0);
      expect(res.status).toBe(302);
      return new URL(res.headers.location).searchParams.get('state') as string;
    };

    it.each([
      ['17 chars', 'a'.repeat(17)],
      ['1000 chars', 'a'.repeat(1000)],
      ['17 chars after trimming', `  ${'b'.repeat(17)}  `],
    ])(
      'a %s code is dropped: verified state with no r, state within the limit',
      async (_l, code) => {
        const state = await stateFor(code);
        expect(state.length).toBeLessThanOrEqual(STATE_MAX_LENGTH);
        const verified = verifyOAuthState(state);
        expect(verified).not.toBeNull();
        expect(verified).not.toHaveProperty('r');
      },
    );

    it('a 16-char code is kept as r, upper-cased', async () => {
      const verified = verifyOAuthState(await stateFor('abcdefghij123456'));
      expect(verified?.r).toBe('ABCDEFGHIJ123456');
    });

    it('a whitespace-only code gives no r', async () => {
      const verified = verifyOAuthState(await stateFor('   '));
      expect(verified).not.toBeNull();
      expect(verified).not.toHaveProperty('r');
    });

    it('sign-in still completes with an over-long code (no referral applied)', async () => {
      await makeCode({ code: 'LONGDROP', bonusInk: 3 });
      const { res, code } = await signIn(undefined, 'x'.repeat(1000), 'long319@example.com');
      expect(res.status).toBe(302);
      expect(new URL(res.headers.location).pathname).toBe('/auth/callback');
      expect(code).toBeTruthy();
      expect((await ReferralCode.findOne({ code: 'LONGDROP' }).lean())!.uses).toBe(0);
    });
  });

  it('no referral: the state has no r', async () => {
    const res = await supertest(server)
      .get('/google')
      .query({ challenge: challengeForVerifier(newVerifier()) })
      .redirects(0);
    const state = new URL(res.headers.location).searchParams.get('state') as string;
    expect(verifyOAuthState(state)).not.toHaveProperty('r');
  });

  it('a raw unsigned state carrying a referral code is ignored: refused, no user, no Ink, uses unchanged', async () => {
    await makeCode({ code: 'RAWREF', bonusInk: 3 });
    const res = await callback('RAWREF', 'raw319@example.com');
    expectRefusedCallback(res);
    await expectNothingCreated();
    expect((await ReferralCode.findOne({ code: 'RAWREF' }).lean())!.uses).toBe(0);
  });

  it('even if the verify callback ran, the raw ?state= is never read as a referral', async () => {
    await makeCode({ code: 'RAWREF2', bonusInk: 3 });
    // Drive verify directly with a raw state on the query and NO verified state on the request.
    const req: Record<string, unknown> = { query: { state: 'RAWREF2' } };
    const flags = await new Promise<Record<string, unknown>>((resolve) => {
      void verify(
        req,
        'at',
        'rt',
        { id: 'g-raw2', displayName: 'x', emails: [{ value: 'raw2@example.com' }] },
        () => resolve(req),
      );
    });
    expect(flags['lawieReferralNotApplied']).toBeUndefined();
    const u = await User.findOne({ email: 'raw2@example.com' }).lean();
    expect(u).not.toBeNull();
    await waitForSeed(u!._id);
    expect((await rawUsers().findOne({ _id: u!._id }))!.inkTopup).toBe(10);
    expect((await ReferralCode.findOne({ code: 'RAWREF2' }).lean())!.uses).toBe(0);
  });

  it('a tampered state cannot inject a referral code (edited r, old signature)', async () => {
    await makeCode({ code: 'INJECTED', bonusInk: 3 });
    const base = createOAuthState(challengeForVerifier(newVerifier()));
    const [p, sig] = base.split('.') as [string, string];
    const body = { ...JSON.parse(Buffer.from(p, 'base64url').toString()), r: 'INJECTED' };
    expectRefusedCallback(await callback(`${b64u(JSON.stringify(body))}.${sig}`));
    expect((await ReferralCode.findOne({ code: 'INJECTED' }).lean())!.uses).toBe(0);
    await expectNothingCreated();
  });

  it('the verified state is not settable from the query string', async () => {
    const res = await supertest(server)
      .get('/google/callback')
      .query({ [OAUTH_VERIFIED_STATE_KEY]: JSON.stringify({ c: 'a'.repeat(43), t: Date.now() }) })
      .redirects(0);
    expectRefusedCallback(res);
    await expectNothingCreated();
  });
});

describe('T-319 the state holds no secret (AC2)', () => {
  const verifier = newVerifier();
  const challenge = challengeForVerifier(verifier);

  it('payload is only {c, r?, t}; no verifier, no secret, no token', () => {
    const state = createOAuthState(challenge, 'REF1');
    const [p] = state.split('.') as [string];
    const body = JSON.parse(Buffer.from(p, 'base64url').toString());
    expect(Object.keys(body).sort()).toEqual(['c', 'r', 't']);
    expect(body.c).toBe(challenge);
    expect(state).not.toContain(verifier);
    expect(Buffer.from(p, 'base64url').toString()).not.toContain(verifier);
    expect(state).not.toContain(JWT_SECRET);
    expect(state).not.toContain(b64u(JWT_SECRET));
    expect(state).not.toContain(derivedKey().toString('base64url'));
    expect(state).not.toContain(derivedKey().toString('hex'));
    expect(challengeForVerifier(verifier)).not.toBe(verifier);
  });

  it('without a referral the payload is only {c, t}', () => {
    const [p] = createOAuthState(challenge).split('.') as [string];
    expect(Object.keys(JSON.parse(Buffer.from(p, 'base64url').toString())).sort()).toEqual([
      'c',
      't',
    ]);
  });

  it('the challenge is base64url(sha256(verifier))', () => {
    expect(challenge).toBe(crypto.createHash('sha256').update(verifier).digest('base64url'));
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('the HMAC key is derived and differs from the raw JWT_SECRET', () => {
    const [p, sig] = createOAuthState(challenge).split('.') as [string, string];
    expect(sig).toBe(hmac(derivedKey(), p));
    expect(sig).not.toBe(hmac(JWT_SECRET, p));
    expect(derivedKey().toString('utf8')).not.toBe(JWT_SECRET);
  });

  it('the state returned by /google contains neither the verifier nor the secret', async () => {
    const res = await supertest(server).get('/google').query({ challenge }).redirects(0);
    const location = res.headers.location as string;
    expect(location).not.toContain(verifier);
    expect(location).not.toContain(JWT_SECRET);
  });
});

describe('T-319 constant-time comparison does not throw on length mismatch', () => {
  it('verifyOAuthState returns null for signatures of every length', () => {
    const [p, sig] = createOAuthState(challengeForVerifier(newVerifier())).split('.') as [
      string,
      string,
    ];
    for (const bad of [
      '',
      'a',
      sig.slice(1),
      sig.slice(0, 20),
      `${sig}x`,
      sig + sig,
      'é'.repeat(43),
    ]) {
      expect(() => verifyOAuthState(`${p}.${bad}`)).not.toThrow();
      expect(verifyOAuthState(`${p}.${bad}`)).toBeNull();
    }
  });

  it('verifyOAuthState returns null (no throw) for non-string and odd inputs', () => {
    for (const bad of [undefined, null, 5, {}, [], ['a.b'], '', '.', '..', 'a.b.c']) {
      expect(() => verifyOAuthState(bad)).not.toThrow();
      expect(verifyOAuthState(bad)).toBeNull();
    }
  });

  it('verifierMatchesChallenge is false (no throw) for short, long and multi-byte inputs', () => {
    const c = challengeForVerifier(newVerifier());
    for (const v of ['', 'a', 'a'.repeat(42), 'a'.repeat(44), 'é'.repeat(43), 'a'.repeat(5000)]) {
      expect(() => verifierMatchesChallenge(v, c)).not.toThrow();
      expect(verifierMatchesChallenge(v, c)).toBe(false);
    }
    expect(() => verifierMatchesChallenge('a'.repeat(43), 'short')).not.toThrow();
    expect(verifierMatchesChallenge('a'.repeat(43), 'short')).toBe(false);
  });

  it('verifierMatchesChallenge is true for the matching pair', () => {
    const v = newVerifier();
    expect(verifierMatchesChallenge(v, challengeForVerifier(v))).toBe(true);
  });

  it('the exchange endpoint answers 400, not 500, for odd verifier lengths', async () => {
    for (const verifier of ['a'.repeat(42), 'a'.repeat(44), 'é'.repeat(43), 'a'.repeat(100_000)]) {
      const { code } = await signIn();
      const res = await exchange({ code, verifier });
      expect(res.status).toBe(400);
    }
  });
});

describe('T-319 nothing sensitive is logged', () => {
  it('good, refused and Redis-error paths log no verifier, challenge, code or token', async () => {
    const { verifier, code, state } = await signIn();
    const challenge = challengeForVerifier(verifier);
    const stored = JSON.parse((await redis.get(keyFor(code))) as string);

    const wrong = newVerifier();
    const other = await signIn(undefined, undefined, 'other319@example.com');
    await exchange({ code: other.code, verifier: wrong }); // wrong verifier
    const pair = (await exchange({ code, verifier })).body; // success
    await exchange({ code, verifier }); // replay
    await exchange({ code, verifier: 5 }); // bad shape
    await callback('tampered.state'); // refused state
    await supertest(server).get('/google').query({ challenge: 'bad' }).redirects(0);

    jest.spyOn(redis, 'multi').mockImplementationOnce(() => {
      throw new Error('redis down');
    });
    const live = await signIn(undefined, undefined, 'live319@example.com');
    await exchange({ code: live.code, verifier: live.verifier });
    jest.spyOn(redis, 'set').mockRejectedValueOnce(new Error('redis down'));
    const failing = newVerifier();
    const g = await supertest(server)
      .get('/google')
      .query({ challenge: challengeForVerifier(failing) })
      .redirects(0);
    await callback(
      new URL(g.headers.location).searchParams.get('state') as string,
      'f319@example.com',
      'g-f',
    );

    expect(logSpies.some((s) => s.mock.calls.length > 0)).toBe(true); // the spies are live
    const logged = everythingLogged();
    for (const secret of [
      verifier,
      challenge,
      wrong,
      failing,
      challengeForVerifier(failing),
      code,
      sha(code),
      other.code,
      live.code,
      live.verifier,
      state,
      state.split('.')[1] as string,
      pair.accessToken,
      pair.refreshToken,
      stored.accessToken,
      stored.refreshToken,
    ]) {
      expect(logged).not.toContain(secret);
    }
  });
});

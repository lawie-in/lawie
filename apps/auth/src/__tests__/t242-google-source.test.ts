/**
 * T-242 — Google sign-up stores signupSource from the verified OAuth state, for NEW users only.
 * Link (existing email account) and returning sign-ins never touch it. No log carries the tags.
 * Same harness as t298-google-referral.test.ts (real verify callback and /google/callback).
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

import express from 'express';
import supertest from 'supertest';

import { initPassport } from '../config/passport';
import logger from '../config/logger';
import { User } from '../models/User.model';
import oauthRoutes from '../routes/oauth.routes';
import { createOAuthState, verifyOAuthState } from '../services/oauth-state';

import { rawUsers } from './t234-helpers';

const server = express();
server.use('/', oauthRoutes);

beforeAll(() => initPassport());
beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
});

const CHALLENGE = 'A'.repeat(43);
type Utm = { utmSource?: unknown; utmMedium?: unknown; utmCampaign?: unknown };
function callback(email: string, id: string, utm?: Utm) {
  nextProfile = { id, displayName: 'G User', emails: [{ value: email }] };
  return supertest(server)
    .get('/google/callback')
    .query({ state: createOAuthState(CHALLENGE, undefined, utm) })
    .redirects(0);
}

describe('T-242 Google sign-up source', () => {
  it('a NEW Google user gets signupSource with the tags and recordedAt', async () => {
    const before = Date.now();
    const res = await callback('g1@example.com', 'g-1', {
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'spring',
    });
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
  });

  it('a new user with no tags has no signupSource', async () => {
    await callback('g2@example.com', 'g-2');
    const raw = await rawUsers().findOne({ email: 'g2@example.com' });
    expect(raw).not.toBeNull();
    expect(raw).not.toHaveProperty('signupSource');
  });

  it('bad tags are dropped; good ones kept; sign-in still succeeds', async () => {
    const res = await callback('g3@example.com', 'g-3', {
      utmSource: 'a@b.co',
      utmMedium: '12345678',
      utmCampaign: 'ok',
    });
    expect(res.status).toBe(302);
    expect(new URL(res.headers.location).pathname).toBe('/auth/callback');
    const u = await User.findOne({ email: 'g3@example.com' }).lean();
    expect(u!.signupSource).toMatchObject({ utmCampaign: 'ok' });
    expect(u!.signupSource).not.toHaveProperty('utmSource');
    expect(u!.signupSource).not.toHaveProperty('utmMedium');
  });

  it('an existing email account that signs in with Google (link) is not changed', async () => {
    await User.create({ email: 'glink@example.com', name: 'L', password: 'Passw0rdOk' });
    const res = await callback('glink@example.com', 'g-link', { utmSource: 'late' });
    expect(res.status).toBe(302);
    const raw = await rawUsers().findOne({ email: 'glink@example.com' });
    expect(raw).not.toHaveProperty('signupSource');
    expect(raw!.googleId).toBe('g-link');
  });

  it('a link into an account that already has a source keeps the old one', async () => {
    const recordedAt = new Date('2026-01-01T00:00:00Z');
    await User.create({
      email: 'glink2@example.com',
      name: 'L',
      password: 'Passw0rdOk',
      signupSource: { utmSource: 'first', recordedAt },
    });
    await callback('glink2@example.com', 'g-link2', { utmSource: 'second', utmMedium: 'm' });
    const u = await User.findOne({ email: 'glink2@example.com' }).lean();
    expect(u!.signupSource!.utmSource).toBe('first');
    expect(u!.signupSource).not.toHaveProperty('utmMedium');
    expect(u!.signupSource!.recordedAt.toISOString()).toBe(recordedAt.toISOString());
  });

  it('a returning Google user is not changed, whatever tags the new state carries', async () => {
    await callback('gret@example.com', 'g-ret', { utmSource: 'first' });
    const first = await User.findOne({ email: 'gret@example.com' }).lean();
    await callback('gret@example.com', 'g-ret', { utmSource: 'second', utmCampaign: 'c' });
    const again = await User.findOne({ email: 'gret@example.com' }).lean();
    expect(again!.signupSource!.utmSource).toBe('first');
    expect(again!.signupSource).not.toHaveProperty('utmCampaign');
    expect(again!.signupSource!.recordedAt.getTime()).toBe(
      first!.signupSource!.recordedAt.getTime(),
    );
  });

  it('a returning Google user who had no source does not gain one', async () => {
    await callback('gret2@example.com', 'g-ret2');
    await callback('gret2@example.com', 'g-ret2', { utmSource: 'late' });
    const raw = await rawUsers().findOne({ email: 'gret2@example.com' });
    expect(raw).not.toHaveProperty('signupSource');
  });

  it('GET /google?utm* puts the sanitized tags in the signed state, and the callback uses them', async () => {
    const start = await supertest(server)
      .get('/google')
      .query({
        challenge: CHALLENGE,
        utmSource: 'start-src',
        utmMedium: 'a@b.co',
        utmCampaign: 'c'.repeat(300),
      })
      .redirects(0);
    expect(start.status).toBe(302);
    const state = new URL(start.headers.location).searchParams.get('state')!;
    expect(verifyOAuthState(state)!.u).toEqual({ s: 'start-src', c: 'c'.repeat(100) });

    nextProfile = { id: 'g-e2e', displayName: 'E', emails: [{ value: 'ge2e@example.com' }] };
    await supertest(server).get('/google/callback').query({ state }).redirects(0);
    const u = await User.findOne({ email: 'ge2e@example.com' }).lean();
    expect(u!.signupSource).toMatchObject({ utmSource: 'start-src', utmCampaign: 'c'.repeat(100) });
    expect(u!.signupSource).not.toHaveProperty('utmMedium');
  });

  it('GET /google without tags: state has no u', async () => {
    const start = await supertest(server)
      .get('/google')
      .query({ challenge: CHALLENGE })
      .redirects(0);
    const state = new URL(start.headers.location).searchParams.get('state')!;
    expect(verifyOAuthState(state)).not.toHaveProperty('u');
  });

  it('no logger call carries a tag value', async () => {
    const SENTINEL = 'zzgooglesentinel';
    const spies = (['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const).map((l) =>
      jest.spyOn(logger, l),
    );
    try {
      await callback('glog@example.com', 'g-log', {
        utmSource: SENTINEL,
        utmMedium: `${SENTINEL}m`,
        utmCampaign: `${SENTINEL}c`,
      });
      const calls = spies.flatMap((s) => s.mock.calls);
      expect(calls.length).toBeGreaterThan(0);
      expect(JSON.stringify(calls)).not.toContain(SENTINEL);
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });
});

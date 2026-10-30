/**
 * T-223 AC1: Google sign-up and Google linking never queue a verify email (Google counts as
 * verified; nothing is sent). Real oauth routes and the real passport verify callback, with the
 * email-client stubbed so any enqueue is seen.
 */

import './setupEnv';

jest.mock('ioredis', () => require('ioredis-mock'));

jest.mock('@lawie/email-client', () => ({ enqueueEmail: jest.fn() }));

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

type Done = (err: unknown, user?: unknown, info?: unknown) => void;
type Verify = (
  req: unknown,
  at: string,
  rt: string,
  profile: Record<string, unknown>,
  done: Done,
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
    initialize: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    authenticate:
      (
        _name: string,
        opts: { state?: string } = {},
        callback?: (err: unknown, user: unknown, info?: unknown) => void,
      ) =>
      (req: any, res: any, next: any) => {
        if (opts.state !== undefined) {
          const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
          u.searchParams.set('state', opts.state);
          return res.redirect(u.toString());
        }
        return void verify(req, 'at', 'rt', nextProfile, (err, user, info) => {
          if (callback) return callback(err, user, info);
          if (err) return next(err);
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

import { enqueueEmail } from '@lawie/email-client';

import { initPassport } from '../config/passport';
import redis from '../config/redis';
import { User } from '../models/User.model';
import oauthRoutes from '../routes/oauth.routes';
import { challengeForVerifier } from '../services/oauth-state';

import { rawUsers, waitFor } from './t234-helpers';

const enqueueMock = enqueueEmail as unknown as jest.Mock;

const server = express();
server.use(express.json());
server.use('/', oauthRoutes);

beforeAll(() => initPassport());
beforeEach(async () => {
  enqueueMock.mockReset();
  enqueueMock.mockResolvedValue({ jobId: 'j', queue: 'email-high', deduped: false });
  await redis.flushall();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
});
afterEach(() => jest.restoreAllMocks());

async function googleSignIn(email: string, id: string) {
  const v = crypto.randomBytes(32).toString('base64url');
  const g = await supertest(server)
    .get('/google')
    .query({ challenge: challengeForVerifier(v) })
    .redirects(0);
  const state = new URL(g.headers.location as string).searchParams.get('state') as string;
  nextProfile = { id, displayName: 'G User', emails: [{ value: email }] };
  return supertest(server).get('/google/callback').query({ state }).redirects(0);
}

describe('T-223 AC1 Google users never get a verify enqueue (T-587: they get one welcome)', () => {
  it('a brand-new Google user is created, gets exactly one welcome and no verify email', async () => {
    const res = await googleSignIn('t223-gnew@example.com', 'g-t223-new');
    expect(res.status).toBe(302);
    const u = await waitFor(async () => rawUsers().findOne({ email: 't223-gnew@example.com' }));
    expect(u.googleId).toBe('g-t223-new');
    await waitFor(async () => (enqueueMock.mock.calls.length > 0 ? true : undefined));
    await new Promise((r) => setTimeout(r, 300));
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock).toHaveBeenCalledWith({
      template: 'auth.welcome',
      userId: String(u._id),
    });
    expect(enqueueMock.mock.calls.some((c) => c[0].template === 'auth.verifyEmail')).toBe(false);
  });

  it('an existing email user linking Google, then signing in again: one welcome, no verify email', async () => {
    const created = await User.create({
      email: 't223-glink@example.com',
      name: 'L',
      password: 'Passw0rdOk',
    });
    expect((await googleSignIn('t223-glink@example.com', 'g-t223-glink')).status).toBe(302);
    expect((await googleSignIn('t223-glink@example.com', 'g-t223-glink')).status).toBe(302);
    await new Promise((r) => setTimeout(r, 300));
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock).toHaveBeenCalledWith({
      template: 'auth.welcome',
      userId: String(created._id),
    });
    expect(enqueueMock.mock.calls.some((c) => c[0].template === 'auth.verifyEmail')).toBe(false);
  });
});

describe('T-587 welcome on Google paths', () => {
  const welcomes = () => enqueueMock.mock.calls.filter((c) => c[0]?.template === 'auth.welcome');

  it('a brand-new Google user signing in a second time: still one welcome in total', async () => {
    expect((await googleSignIn('t587-gtwice@example.com', 'g-t587-twice')).status).toBe(302);
    await waitFor(async () => (welcomes().length > 0 ? true : undefined));
    expect((await googleSignIn('t587-gtwice@example.com', 'g-t587-twice')).status).toBe(302);
    await new Promise((r) => setTimeout(r, 300));
    expect(welcomes()).toHaveLength(1);
  });

  it('linking Google to an account that was already verified: no welcome', async () => {
    await User.create({
      email: 't587-gverified@example.com',
      name: 'V',
      password: 'Passw0rdOk',
      emailVerified: true,
    });
    expect((await googleSignIn('t587-gverified@example.com', 'g-t587-verified')).status).toBe(302);
    await new Promise((r) => setTimeout(r, 300));
    expect(welcomes()).toHaveLength(0);
  });

  it('a returning Google user (googleId already set): no welcome', async () => {
    await User.create({
      email: 't587-gret@example.com',
      name: 'R',
      googleId: 'g-t587-ret',
      authProvider: 'google',
    });
    expect((await googleSignIn('t587-gret@example.com', 'g-t587-ret')).status).toBe(302);
    await new Promise((r) => setTimeout(r, 300));
    expect(welcomes()).toHaveLength(0);
  });

  it('a failing enqueue never fails the Google sign-in', async () => {
    enqueueMock.mockRejectedValue(new Error('redis down'));
    const res = await googleSignIn('t587-gfail@example.com', 'g-t587-fail');
    expect(res.status).toBe(302);
    expect(String(res.headers.location)).not.toMatch(/error/i);
    const u = await waitFor(async () => rawUsers().findOne({ email: 't587-gfail@example.com' }));
    expect(u.googleId).toBe('g-t587-fail');
  });
});

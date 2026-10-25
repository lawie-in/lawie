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

describe('T-223 AC1 Google users never get a verify enqueue', () => {
  it('a brand-new Google user is created and nothing is enqueued', async () => {
    const res = await googleSignIn('t223-gnew@example.com', 'g-t223-new');
    expect(res.status).toBe(302);
    const u = await waitFor(async () => rawUsers().findOne({ email: 't223-gnew@example.com' }));
    expect(u.googleId).toBe('g-t223-new');
    await new Promise((r) => setTimeout(r, 300));
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('an existing email user linking Google, then signing in again: nothing is enqueued', async () => {
    await User.create({ email: 't223-glink@example.com', name: 'L', password: 'Passw0rdOk' });
    expect((await googleSignIn('t223-glink@example.com', 'g-t223-glink')).status).toBe(302);
    expect((await googleSignIn('t223-glink@example.com', 'g-t223-glink')).status).toBe(302);
    await new Promise((r) => setTimeout(r, 300));
    expect(enqueueMock).not.toHaveBeenCalled();
  });
});

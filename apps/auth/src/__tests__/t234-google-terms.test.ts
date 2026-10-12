/**
 * T-234 AC7 (Google side) — termsAcceptedAt / termsVersion / acceptedVia='google':
 * set on a new user, on an email-linked user and on a returning user only when empty;
 * never overwritten. The passport verify callback is captured from a mocked strategy.
 */

import './setupEnv';

jest.mock('ioredis', () => require('ioredis-mock'));

jest.mock('../config/env', () => ({
  env: {
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    GOOGLE_CALLBACK_URL: 'http://localhost:4001/google/callback',
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

jest.mock('passport-google-oauth20', () => ({
  Strategy: class {
    constructor(_opts: unknown, cb: Verify) {
      verify = cb;
    }
  },
}));

jest.mock('passport', () => ({ __esModule: true, default: { use: jest.fn() } }));

import './setupDb';

import { initPassport } from '../config/passport';
import { User } from '../models/User.model';

import { waitForSeed } from './t234-helpers';

function runVerify(req: unknown, profile: Record<string, unknown>) {
  return new Promise<{ err: unknown; user: Record<string, unknown> | undefined }>((resolve) => {
    void verify(req, 'at', 'rt', profile, (err, user) =>
      resolve({ err, user: user as Record<string, unknown> | undefined }),
    );
  });
}
const profile = (id: string, email: string) => ({
  id,
  displayName: 'G User',
  emails: [{ value: email }],
});

beforeAll(() => initPassport());

describe('T-234 AC7 — Google sign-in records Terms acceptance', () => {
  it('new Google user: all three fields set', async () => {
    const { err } = await runVerify({ query: {} }, profile('g-new', 'gnew@example.com'));
    expect(err).toBeNull();
    const u = await User.findOne({ email: 'gnew@example.com' }).lean();
    expect(u!.termsAcceptedAt).toBeInstanceOf(Date);
    expect(u!.termsVersion).toBe('2026-06-01');
    expect(u!.acceptedVia).toBe('google');
    await waitForSeed(u!._id);
  });

  it('client-supplied terms values in state/query/body/profile are ignored', async () => {
    await runVerify(
      {
        query: { state: 'password', termsVersion: '1999', acceptedVia: 'password' },
        body: { termsVersion: '1999', acceptedVia: 'password' },
      },
      {
        ...profile('g-spoof', 'gspoof@example.com'),
        termsVersion: '1999',
        acceptedVia: 'password',
      },
    );
    const u = await User.findOne({ email: 'gspoof@example.com' }).lean();
    expect(u!.termsVersion).toBe('2026-06-01');
    expect(u!.acceptedVia).toBe('google');
    await waitForSeed(u!._id);
  });

  it('email-linked user with no acceptance: set to google', async () => {
    await User.create({ email: 'linkempty@example.com', name: 'L', password: 'Passw0rdOk' });
    await runVerify({ query: {} }, profile('g-link-empty', 'linkempty@example.com'));
    const u = await User.findOne({ email: 'linkempty@example.com' }).lean();
    expect(u!.termsAcceptedAt).toBeInstanceOf(Date);
    expect(u!.termsVersion).toBe('2026-06-01');
    expect(u!.acceptedVia).toBe('google');
  });

  it('email-linked user who accepted at password sign-up: never overwritten', async () => {
    const at = new Date('2026-07-01T10:00:00Z');
    await User.create({
      email: 'linkset@example.com',
      name: 'L',
      password: 'Passw0rdOk',
      termsAcceptedAt: at,
      termsVersion: '2026-01-01',
      acceptedVia: 'password',
    });
    await runVerify({ query: {} }, profile('g-link-set', 'linkset@example.com'));
    const u = await User.findOne({ email: 'linkset@example.com' }).lean();
    expect(u!.termsAcceptedAt).toEqual(at);
    expect(u!.termsVersion).toBe('2026-01-01');
    expect(u!.acceptedVia).toBe('password');
  });

  it('returning Google user with empty acceptance: set at next sign-in', async () => {
    await User.create({ email: 'retempty@example.com', name: 'R', googleId: 'g-ret-empty' });
    const { err, user } = await runVerify(
      { query: {} },
      profile('g-ret-empty', 'retempty@example.com'),
    );
    expect(err).toBeNull();
    const u = await User.findOne({ email: 'retempty@example.com' }).lean();
    expect(u!.termsAcceptedAt).toBeInstanceOf(Date);
    expect(u!.termsVersion).toBe('2026-06-01');
    expect(u!.acceptedVia).toBe('google');
    // the document handed to passport reflects the write
    expect(user!.acceptedVia).toBe('google');
  });

  it('returning Google user with existing acceptance: unchanged over repeated sign-ins', async () => {
    const at = new Date('2026-08-15T09:30:00Z');
    await User.create({
      email: 'retset@example.com',
      name: 'R',
      googleId: 'g-ret-set',
      termsAcceptedAt: at,
      termsVersion: '2026-01-01',
      acceptedVia: 'google',
    });
    await runVerify({ query: {} }, profile('g-ret-set', 'retset@example.com'));
    await runVerify({ query: {} }, profile('g-ret-set', 'retset@example.com'));
    const u = await User.findOne({ email: 'retset@example.com' }).lean();
    expect(u!.termsAcceptedAt).toEqual(at);
    expect(u!.termsVersion).toBe('2026-01-01');
    expect(u!.acceptedVia).toBe('google');
  });

  it('concurrent first sign-ins on an empty returning user write once (filter on empty)', async () => {
    await User.create({ email: 'retrace@example.com', name: 'R', googleId: 'g-race' });
    await Promise.all([
      runVerify({ query: {} }, profile('g-race', 'retrace@example.com')),
      runVerify({ query: {} }, profile('g-race', 'retrace@example.com')),
    ]);
    const u = await User.findOne({ email: 'retrace@example.com' }).lean();
    expect(u!.acceptedVia).toBe('google');
    expect(u!.termsVersion).toBe('2026-06-01');
  });
});

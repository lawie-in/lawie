/**
 * T-196 AC2 — Google OAuth keeps its server-set role.
 *   - first login creates 'Lawyer', ignoring role-like values in state/profile
 *   - linking an existing account by email never changes its stored role (incl. Admin)
 *
 * The passport verify callback is captured from a mocked GoogleStrategy and invoked directly.
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

import { User } from '../models/User.model';
import { initPassport } from '../config/passport';

function runVerify(req: unknown, profile: Record<string, unknown>) {
  return new Promise<{ err: unknown; user: Record<string, unknown> | undefined }>((resolve) => {
    void verify(req, 'at', 'rt', profile, (err, user) =>
      resolve({ err, user: user as Record<string, unknown> | undefined }),
    );
  });
}

beforeAll(() => {
  initPassport();
});

describe('T-196 AC2 — Google OAuth first login', () => {
  it('creates a Lawyer', async () => {
    const { err, user } = await runVerify(
      { query: {} },
      { id: 'g-1', displayName: 'New Lawyer', emails: [{ value: 'newlawyer@example.com' }] },
    );
    expect(err).toBeNull();
    expect(user!.role).toBe('Lawyer');
    expect((await User.findOne({ email: 'newlawyer@example.com' }).lean())!.role).toBe('Lawyer');
  });

  it.each(['Admin', 'admin', 'role=Admin', '{"role":"Admin"}'])(
    'ignores role-like state value %p',
    async (state) => {
      const { err } = await runVerify(
        { query: { state, role: 'Admin' }, body: { role: 'Admin' } },
        { id: `g-${state}`, displayName: 'S', emails: [{ value: 'state@example.com' }] },
      );
      expect(err).toBeNull();
      expect((await User.findOne({ email: 'state@example.com' }).lean())!.role).toBe('Lawyer');
    },
  );

  it('ignores a role field on the Google profile', async () => {
    const { err } = await runVerify(
      { query: {} },
      {
        id: 'g-prof',
        displayName: 'P',
        role: 'Admin',
        _json: { role: 'Admin' },
        emails: [{ value: 'profile@example.com' }],
      },
    );
    expect(err).toBeNull();
    expect((await User.findOne({ email: 'profile@example.com' }).lean())!.role).toBe('Lawyer');
  });
});

describe('T-196 AC2 — Google OAuth linking an existing account', () => {
  it.each(['Admin', 'Client', 'Lawyer'] as const)(
    'keeps the stored role %s when linking by email',
    async (role) => {
      const email = `link-${role.toLowerCase()}@example.com`;
      await User.create({ email, name: 'Existing', password: 'Passw0rdOk', role });
      const { err, user } = await runVerify(
        { query: { state: 'Admin' } },
        { id: `g-link-${role}`, displayName: 'Existing', emails: [{ value: email }] },
      );
      expect(err).toBeNull();
      expect(user!.role).toBe(role);
      const stored = await User.findOne({ email }).select('+googleId').lean();
      expect(stored!.role).toBe(role);
      expect(stored!.googleId).toBe(`g-link-${role}`);
    },
  );

  it('returning Google user (found by googleId) keeps Admin', async () => {
    await User.create({
      email: 'ret-admin@example.com',
      name: 'Founder',
      googleId: 'g-ret',
      role: 'Admin',
    });
    const { err, user } = await runVerify(
      { query: {} },
      { id: 'g-ret', displayName: 'Founder', emails: [{ value: 'ret-admin@example.com' }] },
    );
    expect(err).toBeNull();
    expect(user!.role).toBe('Admin');
  });
});

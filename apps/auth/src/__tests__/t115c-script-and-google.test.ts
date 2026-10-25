/**
 * T-115c — scripts/erase-user.ts (refusals, dry run, --resume, exit codes 0/1/2/3, no PII
 * printed) and a locked account refused by Google sign-in (Ajay condition 3). The script is
 * run in-process: mongoose connect/disconnect are stubbed onto the in-memory database, and
 * drafting/billing are a mocked global.fetch.
 */

import './setupEnv';

jest.mock('ioredis', () => require('ioredis-mock'));

// CI has no Google client id/secret, so initPassport would return before building the strategy
// and the captured verify callback would be missing. Give it test values, real env otherwise.
jest.mock('../config/env', () => {
  const actual = jest.requireActual('../config/env');
  return {
    ...actual,
    env: {
      ...actual.env,
      GOOGLE_CLIENT_ID: 'test-client-id',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
    },
  };
});

jest.mock('passport-google-oauth20', () => ({
  Strategy: class {
    constructor(_opts: unknown, cb: unknown) {
      (globalThis as { __verify?: unknown }).__verify = cb;
    }
  },
}));
jest.mock('passport', () => ({ __esModule: true, default: { use: jest.fn() } }));

import './setupDb';

import mongoose, { Types } from 'mongoose';

import { initPassport } from '../config/passport';
import redis from '../config/redis';
import { AuditLog } from '../models/AuditLog.model';
import { User } from '../models/User.model';
import * as service from '../services/account-erase.service';

const EMAIL = 'script.target@example.com';
const NAME = 'Script Target';
const GOLDEN = '0000000000000000000f147e';

type Plan = { status: number; body: unknown } | 'throw';
const plan: { sub: Plan; drafting: Plan; billing: Plan } = {
  sub: { status: 200, body: { active: false, status: 'none' } },
  drafting: { status: 200, body: { ok: true, counts: {} } },
  billing: { status: 200, body: { ok: true, counts: {} } },
};
let fetchCalls: string[] = [];

beforeEach(() => {
  plan.sub = { status: 200, body: { active: false, status: 'none' } };
  plan.drafting = { status: 200, body: { ok: true, counts: { documents: 1 } } };
  plan.billing = { status: 200, body: { ok: true, counts: {} } };
  fetchCalls = [];
  global.fetch = jest.fn(async (url: string) => {
    const u = String(url);
    fetchCalls.push(u);
    const p = u.includes('subscription-status')
      ? plan.sub
      : u.startsWith('http://localhost:4002')
        ? plan.drafting
        : plan.billing;
    if (p === 'throw') throw new Error('ECONNREFUSED');
    return { status: p.status, json: async () => p.body };
  }) as unknown as typeof fetch;
});
afterEach(() => jest.restoreAllMocks());

async function runScript(...args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  jest.spyOn(console, 'log').mockImplementation((...a) => void out.push(a.join(' ')));
  jest.spyOn(console, 'error').mockImplementation((...a) => void err.push(a.join(' ')));
  jest.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);
  jest.spyOn(mongoose, 'disconnect').mockResolvedValue();
  jest.spyOn(redis, 'quit').mockResolvedValue('OK');
  const code = await new Promise<number>((resolve) => {
    let first = true;
    jest.spyOn(process, 'exit').mockImplementation(((c?: number) => {
      if (first) resolve(c ?? 0);
      first = false;
    }) as never);
    const argv = process.argv;
    process.argv = ['node', 'erase-user', ...args];
    jest.isolateModules(() => {
      jest.doMock('mongoose', () => mongoose);
      jest.doMock('dotenv', () => ({ config: jest.fn() }));
      jest.doMock('../config/redis', () => ({ __esModule: true, default: redis }));
      jest.doMock('../models/User.model', () => ({ User }));
      jest.doMock('../services/account-erase.service', () => service);
      require('../scripts/erase-user');
    });
    process.argv = argv;
  });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

async function seed(extra: Record<string, unknown> = {}) {
  const u = await User.collection.insertOne({
    email: EMAIL,
    name: NAME,
    role: 'Lawyer',
    isActive: true,
    ...extra,
  });
  return String(u.insertedId);
}
const lock = (stage = 'locked') => ({
  isActive: false,
  erasure: { requestedAt: new Date(), stage },
});
const noPii = (s: string) => {
  expect(s).not.toContain(EMAIL);
  expect(s).not.toContain(NAME);
};

describe('erase-user script — usage and refusals (exit 2, nothing changed)', () => {
  it.each([
    [[]],
    [['a', 'b']],
    [['--bogus', '507f1f77bcf86cd799439011']],
    [['--dry-run', '--resume', '507f1f77bcf86cd799439011']],
  ])('usage error for %j', async (args) => {
    expect((await runScript(...args)).code).toBe(2);
    expect(fetchCalls).toHaveLength(0);
  });

  it('refuses an invalid id', async () => {
    const r = await runScript('not-an-id');
    expect(r.code).toBe(2);
    expect(r.err).toContain('Not a valid user id');
  });

  it('refuses the golden-set fixture user', async () => {
    const r = await runScript(GOLDEN);
    expect(r.code).toBe(2);
    expect(r.err).toContain('golden-set');
    expect(fetchCalls).toHaveLength(0);
  });

  it('refuses an Admin, even for a dry run', async () => {
    const id = await seed({ role: 'Admin' });
    for (const args of [[id], [id, '--dry-run'], [id, '--resume']]) {
      const r = await runScript(...args);
      expect(r.code).toBe(2);
      expect(r.err).toContain('Admin');
    }
    expect(fetchCalls).toHaveLength(0);
    const u = await User.collection.findOne({ _id: new Types.ObjectId(id) });
    expect(u!.isActive).toBe(true);
    expect(u!.erasure).toBeUndefined();
  });

  it('refuses an unknown user', async () => {
    const r = await runScript(new Types.ObjectId().toString());
    expect(r.code).toBe(2);
    expect(r.err).toContain('no such user');
  });

  it('says "already erased" (0) for a user already gone with an account_delete row', async () => {
    const id = new Types.ObjectId();
    await AuditLog.collection.insertOne({
      userId: id,
      eventType: 'account_delete',
      createdAt: new Date(),
    });
    const r = await runScript(String(id));
    expect(r.code).toBe(0);
    expect(r.out).toContain('already erased');
  });

  it('refuses an active plan (nothing changed) and exits 1 when billing is down', async () => {
    const id = await seed();
    plan.sub = { status: 200, body: { active: true, status: 'halted' } };
    const a = await runScript(id);
    expect(a.code).toBe(2);
    expect(a.err).toContain('halted');
    plan.sub = 'throw';
    const b = await runScript(id);
    expect(b.code).toBe(1);
    const u = await User.collection.findOne({ _id: new Types.ObjectId(id) });
    expect(u!.isActive).toBe(true);
    expect(u!.erasure).toBeUndefined();
    expect(fetchCalls.filter((u2) => u2.includes('/internal/erase-user'))).toHaveLength(0);
  });

  it('without --resume refuses an account already being closed', async () => {
    const id = await seed(lock('billing_erased'));
    const r = await runScript(id);
    expect(r.code).toBe(2);
    expect(r.err).toContain('--resume');
    expect(fetchCalls).toHaveLength(0);
  });

  it('with --resume refuses an account that is not being closed', async () => {
    const id = await seed();
    const r = await runScript(id, '--resume');
    expect(r.code).toBe(2);
    expect(r.err).toContain('not being closed');
    expect(fetchCalls).toHaveLength(0);
  });
});

describe('erase-user script — runs', () => {
  it('--dry-run: exit 0, counts printed, dryRun sent, nothing changed, no email or name', async () => {
    const id = await seed();
    const r = await runScript(id, '--dry-run');
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.out);
    expect(parsed).toMatchObject({ userId: id, dryRun: true, done: true });
    expect(parsed.counts.drafting).toEqual({ documents: 1 });
    noPii(r.out + r.err);
    expect(fetchCalls.some((u) => u.includes('/internal/erase-user'))).toBe(true);
    const u = await User.collection.findOne({ _id: new Types.ObjectId(id) });
    expect(u!.isActive).toBe(true);
    expect(u!.erasure).toBeUndefined();
  });

  it('plain run: locks and erases, exit 0, user gone, checklist printed, no email or name', async () => {
    const id = await seed();
    const r = await runScript(id);
    expect(r.code).toBe(0);
    expect(await User.collection.findOne({ _id: new Types.ObjectId(id) })).toBeNull();
    expect(r.out).toContain('Manual steps still to do');
    expect(r.out).toContain('Razorpay');
    noPii(r.out + r.err);
    expect(
      await AuditLog.collection.findOne({
        userId: new Types.ObjectId(id),
        eventType: 'account_delete',
      }),
    ).not.toBeNull();
  });

  it('a failing step exits 3 with the account left locked; --resume finishes it (0)', async () => {
    const id = await seed();
    plan.billing = { status: 500, body: {} };
    const a = await runScript(id);
    expect(a.code).toBe(3);
    const u = await User.collection.findOne({ _id: new Types.ObjectId(id) });
    expect(u!.isActive).toBe(false);
    expect(u!.erasure.stage).toBe('drafting_erased');
    noPii(a.out + a.err);

    plan.billing = { status: 200, body: { ok: true, counts: {} } };
    fetchCalls = [];
    const b = await runScript(id, '--resume');
    expect(b.code).toBe(0);
    // The drafting STEP is not re-run; only the final recheck calls drafting (once).
    expect(fetchCalls.filter((x) => x.startsWith('http://localhost:4002'))).toHaveLength(1);
    expect(await User.collection.findOne({ _id: new Types.ObjectId(id) })).toBeNull();
  });

  it('--resume does not re-check the plan (the account is already locked)', async () => {
    const id = await seed(lock());
    plan.sub = { status: 200, body: { active: true, status: 'active' } };
    const r = await runScript(id, '--resume');
    expect(r.code).toBe(0);
    expect(fetchCalls.some((u) => u.includes('subscription-status'))).toBe(false);
  });
});

describe('a locked account is refused by Google sign-in', () => {
  type Verify = (
    req: unknown,
    at: string,
    rt: string,
    profile: Record<string, unknown>,
    done: (err: unknown, user?: unknown, info?: unknown) => void,
  ) => Promise<void>;
  function verify(profile: Record<string, unknown>) {
    initPassport();
    const v = (globalThis as { __verify?: Verify }).__verify!;
    return new Promise<{ err: unknown; user: unknown; info: unknown }>((resolve) => {
      void v({ query: {} }, 'at', 'rt', profile, (err, user, info) => resolve({ err, user, info }));
    });
  }

  it('by googleId', async () => {
    await seed({ googleId: 'g-locked', ...lock() });
    const r = await verify({ id: 'g-locked', displayName: NAME, emails: [{ value: EMAIL }] });
    expect(r.user).toBe(false);
    expect(r.info).toEqual({ reason: 'account_deactivated' });
  });

  it('by email: not linked, not stamped, no new account made', async () => {
    const id = await seed(lock());
    const r = await verify({ id: 'g-new', displayName: NAME, emails: [{ value: EMAIL }] });
    expect(r.user).toBe(false);
    expect(r.info).toEqual({ reason: 'account_deactivated' });
    const u = await User.collection.findOne({ _id: new Types.ObjectId(id) });
    expect(u!.googleId).toBeUndefined();
    expect(await User.collection.countDocuments({ email: EMAIL })).toBe(1);
  });
});

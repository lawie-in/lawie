/**
 * T-522 (Arjun ruling 1 + open point (c), 22 Oct 2026; AJ-522-M1(b)) - verify links have a kind.
 *
 *  - a 'signin' link (30 min) verifies AND signs in: 200 { status, user, accessToken,
 *    refreshToken } plus a session
 *  - a 'verify' link (the T-358 notice, 7 days) verifies only: 200 { status }, no tokens
 *  - a missing kind counts as 'verify'
 *  - expired, used or forged -> 400 verify_link_invalid, no session; single use, also in a race
 *  - an already-verified, active password account plus a signin link still signs in
 *  - erased, locked, inactive or Google-only -> 400, no session
 *  - kind, hash and expiry are cleared together; the newest link (and its kind) wins
 *  - only a POST uses the token up
 *  - the internal mint route takes `kind` and reports signupInkGranted
 */
import './setupEnv';

jest.mock('ioredis', () => jest.requireActual('ioredis-mock'));

jest.mock('@lawie/email-client', () => ({
  enqueueEmail: jest.fn(),
}));

import './setupDb';

import crypto from 'crypto';

import { enqueueEmail } from '@lawie/email-client';
import mongoose from 'mongoose';
import supertest from 'supertest';

import app from '../app';
import logger from '../config/logger';
import redis from '../config/redis';
import { Session } from '../models/Session.model';
import { User } from '../models/User.model';
import {
  SIGNIN_LINK_TTL_MS,
  VERIFY_LINK_TTL_MS,
  hashVerifyToken,
  mintVerifyLink,
  verifyEmailToken,
} from '../services/verify-email.service';

import { rawUsers } from './t234-helpers';

const enqueueMock = enqueueEmail as unknown as jest.Mock;
const PASSWORD = 'Passw0rdOk';
const SECRET = process.env.INTERNAL_SECRET as string;
const DAY = 24 * 60 * 60 * 1000;
const tokenOf = (link: string) => new URL(link).searchParams.get('token') as string;
const raw = async (id: unknown) =>
  (await rawUsers().findOne({ _id: id as mongoose.Types.ObjectId }))!;
const sessions = (id: unknown) => Session.countDocuments({ userId: String(id) });
const verify = (body: unknown) =>
  supertest(app)
    .post('/verify-email')
    .send(body as object);

beforeEach(async () => {
  await redis.flushall();
  enqueueMock.mockReset();
  enqueueMock.mockResolvedValue({ jobId: 'j1', queue: 'email-high', deduped: false });
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
  jest.spyOn(logger, 'info').mockImplementation(() => undefined);
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

let n = 0;
async function mk(fields: Record<string, unknown> = {}) {
  n += 1;
  return User.create({
    email: `t522-k-${n}@example.com`,
    name: 'Kind Person',
    password: PASSWORD,
    ...fields,
  });
}

async function mint(id: unknown, linkKind?: 'signin' | 'verify', ttlMs?: number) {
  const r = await mintVerifyLink(String(id), { linkKind, ttlMs });
  if (r.kind !== 'minted') throw new Error(`expected minted, got ${r.kind}`);
  return tokenOf(r.link);
}

describe('T-522 a signin link verifies and signs in', () => {
  it('is minted for 30 minutes, with its kind stored in the same write as hash and expiry', async () => {
    const u = await mk();
    const token = await mint(u._id, 'signin');
    const doc = await raw(u._id);
    expect(SIGNIN_LINK_TTL_MS).toBe(30 * 60 * 1000);
    expect(doc.emailVerifyKind).toBe('signin');
    expect(doc.emailVerifyTokenHash).toBe(hashVerifyToken(token));
    const ttl = (doc.emailVerifyExpires as Date).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(29 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(30 * 60 * 1000);
  });

  it('a signin link ignores a longer ttlMs: it is always 30 minutes', async () => {
    const u = await mk();
    await mint(u._id, 'signin', 7 * DAY);
    const ttl = ((await raw(u._id)).emailVerifyExpires as Date).getTime() - Date.now();
    expect(ttl).toBeLessThanOrEqual(30 * 60 * 1000);
  });

  it('POST /verify-email: 200 with user, accessToken and refreshToken, and a session', async () => {
    const u = await mk();
    const token = await mint(u._id, 'signin');
    const res = await verify({ token });

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.body.status).toBe('verified');
    expect(res.body.user).toEqual({
      id: String(u._id),
      email: u.email,
      name: 'Kind Person',
      role: u.role,
    });
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
    expect(res.body.accessToken.split('.')).toHaveLength(3);
    expect(await sessions(u._id)).toBe(1);
    expect((await raw(u._id)).emailVerified).toBe(true);
  });

  it('the returned access token works: GET /me says verified', async () => {
    const u = await mk();
    const res = await verify({ token: await mint(u._id, 'signin') });
    const me = await supertest(app)
      .get('/me')
      .set({ Authorization: `Bearer ${res.body.accessToken}` });
    expect(me.status).toBe(200);
    expect(me.body.data.emailVerified).toBe(true);
  });

  it('the session carries authAt, like a password login does', async () => {
    const u = await mk();
    await verify({ token: await mint(u._id, 'signin') });
    const keys = (await redis.keys(`*${String(u._id)}*`)).filter((k) => !k.startsWith('auth:'));
    expect(keys.length).toBeGreaterThan(0);
    const bodies = await Promise.all(keys.map((k) => redis.get(k)));
    expect(bodies.some((b) => typeof b === 'string' && b.includes('"authAt"'))).toBe(true);
  });

  it('grants the sign-up bonus once, on the verify', async () => {
    const u = await mk();
    await verify({ token: await mint(u._id, 'signin') });
    const doc = await raw(u._id);
    expect(doc.signupBonusGrantedAt).toBeInstanceOf(Date);
  });
});

describe('T-522 a verify link verifies and does not sign in', () => {
  it('the T-358 notice link (7 days): 200 { status } only, no tokens, no user, no session', async () => {
    const u = await mk();
    const token = await mint(u._id, 'verify', 7 * DAY);
    const doc = await raw(u._id);
    expect(doc.emailVerifyKind).toBe('verify');
    const ttl = (doc.emailVerifyExpires as Date).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(6 * DAY);
    const res = await verify({ token });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'verified' });
    expect(await sessions(u._id)).toBe(0);
    expect((await raw(u._id)).emailVerified).toBe(true);
  });

  it('a mint with no kind is a verify link, with the 24 h default', async () => {
    const u = await mk();
    const token = await mint(u._id);
    const doc = await raw(u._id);
    expect(VERIFY_LINK_TTL_MS).toBe(DAY);
    expect(doc.emailVerifyKind).toBe('verify');
    const res = await verify({ token });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'verified' });
    expect(await sessions(u._id)).toBe(0);
  });

  it('a link with NO stored kind (minted before T-522) counts as verify: no tokens, no session', async () => {
    const u = await mk();
    const token = crypto.randomBytes(32).toString('hex');
    await rawUsers().updateOne(
      { _id: u._id },
      {
        $set: {
          emailVerifyTokenHash: hashVerifyToken(token),
          emailVerifyExpires: new Date(Date.now() + 60 * 60 * 1000),
        },
        $unset: { emailVerifyKind: 1 },
      },
    );
    const res = await verify({ token });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'verified' });
    expect(await sessions(u._id)).toBe(0);
    expect(await verifyEmailToken(token)).toEqual({ kind: 'expired_or_invalid' });
  });

  it('an unknown stored kind also counts as verify', async () => {
    const u = await mk();
    const token = crypto.randomBytes(32).toString('hex');
    await rawUsers().updateOne(
      { _id: u._id },
      {
        $set: {
          emailVerifyTokenHash: hashVerifyToken(token),
          emailVerifyExpires: new Date(Date.now() + 60 * 60 * 1000),
          emailVerifyKind: 'admin',
        },
      },
    );
    const res = await verify({ token });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'verified' });
    expect(await sessions(u._id)).toBe(0);
  });

  it('the service result carries the kind: signin, verify, and verify for a missing kind', async () => {
    const a = await mk();
    const b = await mk();
    const ra = await verifyEmailToken(await mint(a._id, 'signin'));
    const rb = await verifyEmailToken(await mint(b._id, 'verify'));
    expect(ra).toEqual({ kind: 'verified', userId: String(a._id), linkKind: 'signin' });
    expect(rb).toEqual({ kind: 'verified', userId: String(b._id), linkKind: 'verify' });
  });
});

describe('T-522 expired, used or forged: 400 verify_link_invalid, no session', () => {
  it('an expired signin link', async () => {
    const u = await mk();
    const token = await mint(u._id, 'signin');
    await rawUsers().updateOne(
      { _id: u._id },
      { $set: { emailVerifyExpires: new Date(Date.now() - 1000) } },
    );
    const res = await verify({ token });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'verify_link_invalid' });
    expect(res.body.accessToken).toBeUndefined();
    expect(await sessions(u._id)).toBe(0);
    expect((await raw(u._id)).emailVerified).not.toBe(true);
  });

  it('a link just past 30 minutes is expired, one just inside still works', async () => {
    const a = await mk();
    const b = await mk();
    const ta = await mint(a._id, 'signin');
    const tb = await mint(b._id, 'signin');
    await rawUsers().updateOne(
      { _id: a._id },
      { $set: { emailVerifyExpires: new Date(Date.now() - 1) } },
    );
    await rawUsers().updateOne(
      { _id: b._id },
      { $set: { emailVerifyExpires: new Date(Date.now() + 60 * 1000) } },
    );
    expect((await verify({ token: ta })).status).toBe(400);
    expect((await verify({ token: tb })).status).toBe(200);
  });

  it('a used signin link: the second POST is 400 and creates no second session', async () => {
    const u = await mk();
    const token = await mint(u._id, 'signin');
    const first = await verify({ token });
    expect(first.status).toBe(200);
    const second = await verify({ token });
    expect(second.status).toBe(400);
    expect(second.body).toEqual({ error: 'verify_link_invalid' });
    expect(await sessions(u._id)).toBe(1);
  });

  it('forged, malformed, missing and non-string tokens: 400, no session', async () => {
    const u = await mk();
    await mint(u._id, 'signin');
    for (const body of [
      { token: crypto.randomBytes(32).toString('hex') },
      { token: 'short' },
      { token: '' },
      {},
      { token: 12345 },
      { token: { $ne: null } },
    ]) {
      const res = await verify(body);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'verify_link_invalid' });
    }
    expect(await sessions(u._id)).toBe(0);
  });

  it('two parallel POSTs of one signin link: exactly one signs in', async () => {
    const u = await mk();
    const token = await mint(u._id, 'signin');
    const results = await Promise.all([verify({ token }), verify({ token }), verify({ token })]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 400)).toHaveLength(2);
    expect(await sessions(u._id)).toBe(1);
  });
});

describe('T-522 (c) an already-verified active password account still signs in with a signin link', () => {
  it('200 { status: already_verified } with tokens and a session; the link is used up', async () => {
    const u = await mk();
    const token = await mint(u._id, 'signin');
    await rawUsers().updateOne({ _id: u._id }, { $set: { emailVerified: true } });
    const res = await verify({ token });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('already_verified');
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
    expect(res.body.user.id).toBe(String(u._id));
    expect(await sessions(u._id)).toBe(1);
    expect((await verify({ token })).status).toBe(400);
    expect(await sessions(u._id)).toBe(1);
    const doc = await raw(u._id);
    expect(doc.emailVerifyTokenHash).toBeUndefined();
  });

  it('an already-verified account with a verify-kind link: 200 already_verified, no tokens', async () => {
    const u = await mk();
    const token = await mint(u._id, 'verify');
    await rawUsers().updateOne({ _id: u._id }, { $set: { emailVerified: true } });
    const res = await verify({ token });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'already_verified' });
    expect(await sessions(u._id)).toBe(0);
  });
});

describe('T-522 (c) no session for an erased, locked, inactive or Google-only account', () => {
  const ERASURE = () => ({ requestedAt: new Date(), stage: 'locked' });

  type Setup = [string, (id: unknown) => Promise<void>];
  const CASES: Setup[] = [
    [
      'erased / being closed (erasure set)',
      (id) => rawUsers().updateOne({ _id: id as never }, { $set: { erasure: ERASURE() } }) as never,
    ],
    [
      'locked (erasure stage, with attempts)',
      (id) =>
        rawUsers().updateOne(
          { _id: id as never },
          { $set: { erasure: { ...ERASURE(), attempts: 2, lastAttemptAt: new Date() } } },
        ) as never,
    ],
    [
      'inactive (deactivated)',
      (id) => rawUsers().updateOne({ _id: id as never }, { $set: { isActive: false } }) as never,
    ],
    [
      'Google-only (password removed, linked to Google)',
      (id) =>
        rawUsers().updateOne(
          { _id: id as never },
          { $unset: { password: 1 }, $set: { googleId: 'g-link-1', authProvider: 'google' } },
        ) as never,
    ],
  ];

  describe.each(CASES)('%s', (_name, setup) => {
    it('unverified at the time of the click: 400 verify_link_invalid, no tokens, no session', async () => {
      const u = await mk();
      const token = await mint(u._id, 'signin');
      await setup(u._id);
      const res = await verify({ token });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'verify_link_invalid' });
      expect(res.body.accessToken).toBeUndefined();
      expect(await sessions(u._id)).toBe(0);
    });

    it('already verified at the time of the click: 400, no tokens, no session', async () => {
      const u = await mk();
      const token = await mint(u._id, 'signin');
      await rawUsers().updateOne({ _id: u._id }, { $set: { emailVerified: true } });
      await setup(u._id);
      const res = await verify({ token });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'verify_link_invalid' });
      expect(res.body.accessToken).toBeUndefined();
      expect(await sessions(u._id)).toBe(0);
    });
  });
});

describe('T-522 kind, hash and expiry are cleared together', () => {
  it('after a verify, none of the three fields remain', async () => {
    const u = await mk();
    const token = await mint(u._id, 'signin');
    const before = await raw(u._id);
    expect(before.emailVerifyKind).toBe('signin');
    expect(before.emailVerifyTokenHash).toBeDefined();
    expect(before.emailVerifyExpires).toBeDefined();
    await verify({ token });
    const after = await raw(u._id);
    expect(after.emailVerifyKind).toBeUndefined();
    expect(after.emailVerifyTokenHash).toBeUndefined();
    expect(after.emailVerifyExpires).toBeUndefined();
  });

  it('after the already-verified path, none of the three fields remain either', async () => {
    const u = await mk();
    const token = await mint(u._id, 'verify');
    await rawUsers().updateOne({ _id: u._id }, { $set: { emailVerified: true } });
    await verify({ token });
    const after = await raw(u._id);
    expect(after.emailVerifyKind).toBeUndefined();
    expect(after.emailVerifyTokenHash).toBeUndefined();
    expect(after.emailVerifyExpires).toBeUndefined();
  });

  it('the newest link and its kind replace the older one: an old signin link cannot sign in once a verify link was minted', async () => {
    const u = await mk();
    const oldSignin = await mint(u._id, 'signin');
    const newVerify = await mint(u._id, 'verify', 7 * DAY);
    expect((await raw(u._id)).emailVerifyKind).toBe('verify');
    expect((await verify({ token: oldSignin })).status).toBe(400);
    const res = await verify({ token: newVerify });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'verified' });
    expect(await sessions(u._id)).toBe(0);
  });

  it('a newer signin link replaces an older verify link and its kind', async () => {
    const u = await mk();
    await mint(u._id, 'verify', 7 * DAY);
    const signin = await mint(u._id, 'signin');
    expect((await raw(u._id)).emailVerifyKind).toBe('signin');
    const res = await verify({ token: signin });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });
});

describe('T-522 only a POST uses the token up', () => {
  it('GET /verify-email (a link scanner) is 404 and the signin link stays live', async () => {
    const u = await mk();
    const token = await mint(u._id, 'signin');
    const res = await supertest(app).get('/verify-email').query({ token });
    expect(res.status).toBe(404);
    expect((await raw(u._id)).emailVerifyTokenHash).toBe(hashVerifyToken(token));
    expect(await sessions(u._id)).toBe(0);
    expect((await verify({ token })).status).toBe(200);
  });
});

describe('T-522 internal mint route: kind and signupInkGranted', () => {
  const mintRoute = (body: unknown) =>
    supertest(app)
      .post('/internal/verify-email/mint')
      .set('x-internal-secret', SECRET)
      .send(body as object);

  it("kind 'signin' mints a 30-minute signin link", async () => {
    const u = await mk();
    const res = await mintRoute({ userId: String(u._id), kind: 'signin' });
    expect(res.status).toBe(200);
    const doc = await raw(u._id);
    expect(doc.emailVerifyKind).toBe('signin');
    const ttl = (doc.emailVerifyExpires as Date).getTime() - Date.now();
    expect(ttl).toBeLessThanOrEqual(30 * 60 * 1000);
    expect(doc.emailVerifyTokenHash).toBe(hashVerifyToken(tokenOf(res.body.link)));
  });

  it.each([['verify'], ['admin'], [''], [null], [7], [undefined]])(
    'kind %j is never a signin link',
    async (kind) => {
      const u = await mk();
      const res = await mintRoute({ userId: String(u._id), kind });
      expect(res.status).toBe(200);
      expect((await raw(u._id)).emailVerifyKind).toBe('verify');
    },
  );

  it('signupInkGranted is false before the bonus and true after it', async () => {
    const u = await mk();
    const before = await mintRoute({ userId: String(u._id), kind: 'signin' });
    expect(before.body.signupInkGranted).toBe(false);
    expect(Object.keys(before.body).sort()).toEqual(['email', 'link', 'name', 'signupInkGranted']);
    await rawUsers().updateOne({ _id: u._id }, { $set: { signupBonusGrantedAt: new Date() } });
    const after = await mintRoute({ userId: String(u._id), kind: 'signin' });
    expect(after.body.signupInkGranted).toBe(true);
  });
});

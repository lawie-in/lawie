/**
 * T-223 (phase 1, auth service layer):
 *  AC1  mint stores a sha256 hash and a 24 h expiry only; a second mint replaces the first
 *  AC2  verify: valid -> emailVerified + one sign-up bonus; replay, expired, forged, non-hex ->
 *       no change; concurrent double verify -> one bonus
 *  AC3  resend cap 1/2 min (T-522) and 5/24 h, refusals before the cap, Redis error fails closed
 *
 * Real Mongo (memory server), ioredis-mock for the cap, email-client stubbed at the boundary.
 */

import './setupEnv';

jest.mock('ioredis', () => jest.requireActual('ioredis-mock'));

jest.mock('@lawie/email-client', () => ({
  enqueueEmail: jest.fn(),
}));

import './setupDb';

import crypto from 'crypto';

import { enqueueEmail } from '@lawie/email-client';
import type Redis from 'ioredis';
import mongoose from 'mongoose';

import logger from '../config/logger';
import redis from '../config/redis';
import { User } from '../models/User.model';
import {
  VERIFY_LINK_TTL_MS,
  VERIFY_RESEND_LIMITED,
  VERIFY_RESEND_LIMIT_MESSAGE,
  mintVerifyLink,
  requestVerifyEmail,
  verifyEmailToken,
} from '../services/verify-email.service';

import { ledger, rawUsers } from './t234-helpers';

const enqueueMock = enqueueEmail as unknown as jest.Mock;
const PASSWORD = 'Passw0rdOk';
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

let n = 0;
async function mk(fields: Record<string, unknown> = {}) {
  n += 1;
  return User.create({
    email: `t223-svc-${n}@example.com`,
    name: 'Verify Person',
    password: PASSWORD,
    ...fields,
  });
}
const raw = async (id: unknown) =>
  (await rawUsers().findOne({ _id: id as mongoose.Types.ObjectId }))!;
const tokenOf = (link: string) => new URL(link).searchParams.get('token') as string;

async function mintFor(id: unknown) {
  const r = await mintVerifyLink(String(id));
  if (r.kind !== 'minted') throw new Error(`expected minted, got ${r.kind}`);
  return { ...r, token: tokenOf(r.link) };
}

const bonusRows = (id: unknown) => ledger().countDocuments({ userId: id, reason: 'free_seed' });

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

describe('T-223 AC1 mintVerifyLink', () => {
  it('stores only sha256(token) and a ~24 h expiry; the raw token is nowhere in the document', async () => {
    const u = await mk();
    const before = Date.now();
    const m = await mintFor(u._id);

    expect(m.token).toMatch(/^[a-f0-9]{64}$/);
    expect(m.link).toBe(`http://localhost:3000/verify-email?token=${m.token}`);
    expect(m.email).toBe(u.email);
    expect(m.name).toBe('Verify Person');

    const doc = await raw(u._id);
    expect(doc.emailVerifyTokenHash).toBe(sha256(m.token));
    const exp = (doc.emailVerifyExpires as Date).getTime();
    expect(exp).toBeGreaterThanOrEqual(before + VERIFY_LINK_TTL_MS);
    expect(exp).toBeLessThanOrEqual(Date.now() + VERIFY_LINK_TTL_MS);
    expect(VERIFY_LINK_TTL_MS).toBe(24 * 60 * 60 * 1000);
    // the raw token and the link appear in no stored value
    const stored = JSON.stringify(doc);
    expect(stored).not.toContain(m.token);
    expect(stored).not.toContain(m.link);
    // not selected by default
    const viaModel = (await User.findById(u._id).lean())!;
    expect((viaModel as Record<string, unknown>).emailVerifyTokenHash).toBeUndefined();
  });

  it('two mints give different tokens; the second replaces the first (old token no longer verifies)', async () => {
    const u = await mk();
    const a = await mintFor(u._id);
    const b = await mintFor(u._id);
    expect(b.token).not.toBe(a.token);
    expect((await raw(u._id)).emailVerifyTokenHash).toBe(sha256(b.token));

    expect(await verifyEmailToken(a.token)).toEqual({ kind: 'expired_or_invalid' });
    expect((await raw(u._id)).emailVerified).not.toBe(true);
    expect(await verifyEmailToken(b.token)).toEqual({
      kind: 'verified',
      userId: String(u._id),
      linkKind: 'verify',
    });
  });

  it.each([
    ['verified email', { emailVerified: true }],
    ['google provider', { authProvider: 'google' }],
    ['googleId set', { googleId: 'g-t223-a' }],
    ['deactivated', { isActive: false }],
  ])('%s: not_eligible and nothing is minted', async (_l, fields) => {
    const u = await mk(fields);
    expect(await mintVerifyLink(String(u._id))).toEqual({ kind: 'not_eligible' });
    const doc = await raw(u._id);
    expect(doc.emailVerifyTokenHash).toBeUndefined();
    expect(doc.emailVerifyExpires).toBeUndefined();
  });

  it('unknown user and a non-ObjectId id: not_found', async () => {
    expect(await mintVerifyLink(String(new mongoose.Types.ObjectId()))).toEqual({
      kind: 'not_found',
    });
    expect(await mintVerifyLink('not-an-id')).toEqual({ kind: 'not_found' });
    expect(await mintVerifyLink('')).toEqual({ kind: 'not_found' });
  });
});

describe('T-223 AC2 verifyEmailToken', () => {
  it('valid token: emailVerified true, link cleared, sign-up bonus granted exactly once', async () => {
    const u = await mk();
    const { token } = await mintFor(u._id);
    expect(await bonusRows(u._id)).toBe(0); // T-351: nothing before verification

    expect(await verifyEmailToken(token)).toEqual({
      kind: 'verified',
      userId: String(u._id),
      linkKind: 'verify',
    });

    const doc = await raw(u._id);
    expect(doc.emailVerified).toBe(true);
    expect(doc.emailVerifyTokenHash).toBeUndefined();
    expect(doc.emailVerifyExpires).toBeUndefined();
    expect(doc.signupBonusGrantedAt).toBeInstanceOf(Date);
    expect(doc.earnedCredits).toBe(5);
    expect(doc.inkTopup).toBe(10);
    expect(await bonusRows(u._id)).toBe(1);
  });

  it('replay of a used token: expired_or_invalid, no second bonus, nothing changes', async () => {
    const u = await mk();
    const { token } = await mintFor(u._id);
    await verifyEmailToken(token);
    const after1 = await raw(u._id);

    expect(await verifyEmailToken(token)).toEqual({ kind: 'expired_or_invalid' });
    const after2 = await raw(u._id);
    expect(after2.earnedCredits).toBe(after1.earnedCredits);
    expect(after2.inkTopup).toBe(10);
    expect(await bonusRows(u._id)).toBe(1);
  });

  it('expired token: no change at all (still unverified, no bonus)', async () => {
    const u = await mk();
    const { token } = await mintFor(u._id);
    await rawUsers().updateOne(
      { _id: u._id },
      { $set: { emailVerifyExpires: new Date(Date.now() - 1000) } },
    );
    const before = await raw(u._id);

    expect(await verifyEmailToken(token)).toEqual({ kind: 'expired_or_invalid' });
    const after = await raw(u._id);
    expect(after.emailVerified).not.toBe(true);
    expect(after.emailVerifyTokenHash).toBe(before.emailVerifyTokenHash);
    expect(after.signupBonusGrantedAt ?? null).toBeNull();
    expect(await bonusRows(u._id)).toBe(0);
  });

  it('a token exactly at its expiry instant is not accepted', async () => {
    const u = await mk();
    const { token } = await mintFor(u._id);
    await rawUsers().updateOne(
      { _id: u._id },
      { $set: { emailVerifyExpires: new Date(Date.now()) } },
    );
    expect(await verifyEmailToken(token)).toEqual({ kind: 'expired_or_invalid' });
  });

  it('forged 64-hex token: no change to anyone', async () => {
    const u = await mk();
    await mintFor(u._id);
    const before = await raw(u._id);
    const forged = crypto.randomBytes(32).toString('hex');
    expect(await verifyEmailToken(forged)).toEqual({ kind: 'expired_or_invalid' });
    expect(await raw(u._id)).toEqual(before);
    expect(await bonusRows(u._id)).toBe(0);
  });

  it('the stored hash itself is not a valid token (hash is not the credential)', async () => {
    const u = await mk();
    await mintFor(u._id);
    const hash = (await raw(u._id)).emailVerifyTokenHash as string;
    expect(await verifyEmailToken(hash)).toEqual({ kind: 'expired_or_invalid' });
    expect((await raw(u._id)).emailVerified).not.toBe(true);
  });

  it.each([
    ['empty', ''],
    ['short', 'abc123'],
    ['63 hex', 'a'.repeat(63)],
    ['65 hex', 'a'.repeat(65)],
    ['64 non-hex', 'z'.repeat(64)],
    ['64 upper-case hex', 'A'.repeat(64)],
    ['hex with a trailing newline', `${'a'.repeat(64)}\n`],
    ['undefined', undefined],
    ['null', null],
    ['number', 12345],
    ['operator object', { $ne: null }],
    ['array', ['a'.repeat(64)]],
  ])('non-token input (%s): expired_or_invalid, no user touched', async (_l, input) => {
    const u = await mk();
    await mintFor(u._id);
    const before = await raw(u._id);
    expect(await verifyEmailToken(input)).toEqual({ kind: 'expired_or_invalid' });
    expect(await raw(u._id)).toEqual(before);
  });

  it('concurrent double verify: one verified, one refused, one bonus', async () => {
    const u = await mk();
    const { token } = await mintFor(u._id);
    const results = await Promise.all([
      verifyEmailToken(token),
      verifyEmailToken(token),
      verifyEmailToken(token),
    ]);
    expect(results.filter((r) => r.kind === 'verified')).toHaveLength(1);
    expect(results.filter((r) => r.kind === 'expired_or_invalid')).toHaveLength(2);
    expect(await bonusRows(u._id)).toBe(1);
    const doc = await raw(u._id);
    expect(doc.earnedCredits).toBe(5);
    expect(doc.inkTopup).toBe(10);
  });

  it('a live link on an already verified user is cleared and reported already_verified', async () => {
    const u = await mk();
    const { token } = await mintFor(u._id);
    await rawUsers().updateOne({ _id: u._id }, { $set: { emailVerified: true } });

    expect(await verifyEmailToken(token)).toEqual({
      kind: 'already_verified',
      userId: String(u._id),
      linkKind: 'verify',
    });
    const doc = await raw(u._id);
    expect(doc.emailVerifyTokenHash).toBeUndefined();
    expect(doc.emailVerifyExpires).toBeUndefined();
    // and it is single use
    expect(await verifyEmailToken(token)).toEqual({ kind: 'expired_or_invalid' });
  });

  it("verifying one user's token does not verify or grant another", async () => {
    const a = await mk();
    const b = await mk();
    const { token } = await mintFor(a._id);
    await mintFor(b._id);
    await verifyEmailToken(token);
    expect((await raw(b._id)).emailVerified).not.toBe(true);
    expect(await bonusRows(b._id)).toBe(0);
  });
});

describe('T-223 AC3 requestVerifyEmail (resend cap)', () => {
  const minKey = (id: unknown) => `auth:verify-email:min:${String(id)}`;
  const dayKey = (id: unknown) => `auth:verify-email:day:${String(id)}`;

  it('first request is queued: enqueue gets the userId only, no address', async () => {
    const u = await mk();
    expect(await requestVerifyEmail(String(u._id))).toEqual({ kind: 'queued' });
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock).toHaveBeenCalledWith({
      template: 'auth.verifyEmail',
      userId: String(u._id),
    });
    expect(JSON.stringify(enqueueMock.mock.calls)).not.toContain('@');
  });

  it('a second request inside 2 min is limited with retryAfter in 61..120 and nothing is enqueued', async () => {
    const u = await mk();
    await requestVerifyEmail(String(u._id));
    const r = await requestVerifyEmail(String(u._id));
    expect(r.kind).toBe('limited');
    if (r.kind !== 'limited') throw new Error('unreachable');
    expect(r.retryAfterSeconds).toBeGreaterThan(60);
    expect(r.retryAfterSeconds).toBeLessThanOrEqual(120);
    expect(Number.isInteger(r.retryAfterSeconds)).toBe(true);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });

  it('the minute key has a 2 min TTL (T-522) and the day key a 24 h TTL', async () => {
    const u = await mk();
    await requestVerifyEmail(String(u._id));
    const mttl = await redis.pttl(minKey(u._id));
    expect(mttl).toBeGreaterThan(0);
    expect(mttl).toBeGreaterThan(60_000);
    expect(mttl).toBeLessThanOrEqual(120_000);
    const dttl = await redis.pttl(dayKey(u._id));
    expect(dttl).toBeGreaterThan(120_000);
    expect(dttl).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    expect(await redis.get(dayKey(u._id))).toBe('1');
  });

  it('after the minute passes the next is allowed; the sixth in a day is limited with a long wait', async () => {
    const u = await mk();
    const id = String(u._id);
    for (let i = 0; i < 5; i += 1) {
      expect(await requestVerifyEmail(id)).toEqual({ kind: 'queued' });
      await redis.del(minKey(id)); // the 60 s have passed
    }
    expect(enqueueMock).toHaveBeenCalledTimes(5);

    const sixth = await requestVerifyEmail(id);
    expect(sixth.kind).toBe('limited');
    if (sixth.kind !== 'limited') throw new Error('unreachable');
    expect(sixth.retryAfterSeconds).toBeGreaterThan(60);
    expect(sixth.retryAfterSeconds).toBeLessThanOrEqual(24 * 60 * 60);
    expect(enqueueMock).toHaveBeenCalledTimes(5);
    // and the refused sixth did not bump the counter past the cap
    expect(await redis.get(dayKey(id))).toBe('5');
  });

  it('a request refused by the minute key does not count against the day cap', async () => {
    const u = await mk();
    const id = String(u._id);
    await requestVerifyEmail(id);
    for (let i = 0; i < 4; i += 1) await requestVerifyEmail(id); // all minute-limited
    expect(await redis.get(dayKey(id))).toBe('1');
  });

  it('concurrent requests: exactly one is queued', async () => {
    const u = await mk();
    const id = String(u._id);
    const results = await Promise.all([1, 2, 3, 4].map(() => requestVerifyEmail(id)));
    expect(results.filter((r) => r.kind === 'queued')).toHaveLength(1);
    expect(results.filter((r) => r.kind === 'limited')).toHaveLength(3);
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(await redis.get(dayKey(id))).toBe('1');
  });

  it('the cap is per user', async () => {
    const a = await mk();
    const b = await mk();
    expect(await requestVerifyEmail(String(a._id))).toEqual({ kind: 'queued' });
    expect(await requestVerifyEmail(String(b._id))).toEqual({ kind: 'queued' });
  });

  it.each([
    ['verified email', { emailVerified: true }, 'already_verified'],
    ['google provider', { authProvider: 'google' }, 'already_verified'],
    ['googleId set', { googleId: 'g-t223-req' }, 'already_verified'],
  ])('%s: refused before the cap is touched', async (_l, fields, kind) => {
    const u = await mk(fields);
    expect(await requestVerifyEmail(String(u._id))).toEqual({ kind });
    expect(await redis.keys('auth:verify-email:*')).toEqual([]);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('a refused (verified) user does not use up anything: no keys even after repeated calls', async () => {
    const u = await mk({ emailVerified: true });
    for (let i = 0; i < 7; i += 1) await requestVerifyEmail(String(u._id));
    expect(await redis.keys('auth:verify-email:*')).toEqual([]);
  });

  it('unknown user and malformed id: not_found, cap untouched, nothing enqueued', async () => {
    expect(await requestVerifyEmail(String(new mongoose.Types.ObjectId()))).toEqual({
      kind: 'not_found',
    });
    expect(await requestVerifyEmail('nope')).toEqual({ kind: 'not_found' });
    expect(await redis.keys('auth:verify-email:*')).toEqual([]);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it.each(['get', 'set', 'incr', 'pttl'] as const)(
    'Redis error on %s: unavailable (fails closed), nothing enqueued',
    async (method) => {
      const u = await mk();
      const broken = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
        incr: jest.fn().mockResolvedValue(1),
        pttl: jest.fn().mockResolvedValue(1000),
        pexpire: jest.fn().mockResolvedValue(1),
      };
      broken[method] = jest.fn().mockRejectedValue(new Error('redis down: secret-host:6379'));
      expect(await requestVerifyEmail(String(u._id), broken as unknown as Redis)).toEqual({
        kind: 'unavailable',
      });
      expect(enqueueMock).not.toHaveBeenCalled();
    },
  );

  it('an enqueue failure does not throw: the request is still reported queued', async () => {
    const u = await mk();
    enqueueMock.mockRejectedValue(new Error('queue down'));
    expect(await requestVerifyEmail(String(u._id))).toEqual({ kind: 'queued' });
    await new Promise((r) => setImmediate(r));
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ userId: String(u._id) }),
      'Verify email enqueue failed',
    );
  });

  it('exports the fixed over-limit message and code', () => {
    expect(VERIFY_RESEND_LIMIT_MESSAGE).toBe(
      'Too many verification emails. Please wait before asking for another one.',
    );
    expect(VERIFY_RESEND_LIMITED).toBe('verify_email_rate_limited');
  });
});

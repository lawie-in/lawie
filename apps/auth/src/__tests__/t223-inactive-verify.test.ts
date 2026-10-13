/**
 * T-223 review round 2 (should-fix a): verifyEmailToken ignored isActive. A deactivated user's
 * valid, unexpired link must verify nothing and grant no bonus; POST /verify-email answers the
 * same 400 verify_link_invalid as any dead link.
 *
 * Current behaviour, asserted (not endorsed): the refused link is NOT consumed. The hash and
 * expiry stay on the document, so if the account is reactivated within the 24 h window the same
 * link then verifies. A reactivated user can therefore use a link minted before deactivation;
 * nobody else can, since the token is only ever delivered to the account's own address.
 *
 * Real Mongo (memory server), ioredis-mock, email-client stubbed at the boundary.
 */

import './setupEnv';

jest.mock('ioredis', () => require('ioredis-mock'));

jest.mock('@lawie/email-client', () => ({
  enqueueEmail: jest.fn(),
}));

import './setupDb';

import crypto from 'crypto';

import mongoose from 'mongoose';
import supertest from 'supertest';

import app from '../app';
import redis from '../config/redis';
import { User } from '../models/User.model';
import { mintVerifyLink, verifyEmailToken } from '../services/verify-email.service';

import { ledger, rawUsers } from './t234-helpers';

const PASSWORD = 'Passw0rdOk';
const tokenOf = (link: string) => new URL(link).searchParams.get('token') as string;
const bonusRows = (id: unknown) => ledger().countDocuments({ userId: id, reason: 'free_seed' });
const raw = async (id: unknown) =>
  (await rawUsers().findOne({ _id: id as mongoose.Types.ObjectId }))!;
const verify = (token: string) => supertest(app).post('/verify-email').send({ token });

let n = 0;
async function mk(fields: Record<string, unknown> = {}) {
  n += 1;
  return User.create({
    email: `t223-inactive-${n}@example.com`,
    name: 'Inactive Person',
    password: PASSWORD,
    ...fields,
  });
}

/** A live link minted while the account is active, then the account is deactivated. */
async function deactivatedWithLiveLink(extra: Record<string, unknown> = {}) {
  const u = await mk(extra);
  const r = await mintVerifyLink(String(u._id));
  if (r.kind !== 'minted') throw new Error(`expected minted, got ${r.kind}`);
  await rawUsers().updateOne({ _id: u._id }, { $set: { isActive: false } });
  return { u, token: tokenOf(r.link) };
}

beforeEach(async () => {
  await redis.flushall();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
});
afterEach(() => jest.restoreAllMocks());

describe('T-223 round 2: verify ignores deactivated accounts', () => {
  it('POST /verify-email: 400 verify_link_invalid; emailVerified unchanged; no bonus, no ledger row', async () => {
    const { u, token } = await deactivatedWithLiveLink();
    const before = await raw(u._id);
    expect(before.emailVerified).not.toBe(true);
    expect(before.emailVerifyExpires.getTime()).toBeGreaterThan(Date.now());

    const res = await verify(token);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'verify_link_invalid' });
    expect(res.headers['cache-control']).toBe('no-store');

    const after = await raw(u._id);
    expect(after.emailVerified).not.toBe(true);
    expect(after.signupBonusGrantedAt ?? null).toBeNull();
    expect(after.earnedCredits).toBe(before.earnedCredits);
    expect(after.inkTopup).toBe(before.inkTopup);
    expect(await bonusRows(u._id)).toBe(0);
    expect(await ledger().countDocuments({ userId: u._id })).toBe(0);
  });

  it('the answer is identical to a forged token (a caller learns nothing about the account)', async () => {
    const { token } = await deactivatedWithLiveLink();
    const dead = await verify(token);
    const forged = await verify(crypto.randomBytes(32).toString('hex'));
    expect(dead.status).toBe(forged.status);
    expect(dead.body).toEqual(forged.body);
  });

  it('service level: expired_or_invalid, not verified, not already_verified', async () => {
    const { token } = await deactivatedWithLiveLink();
    expect(await verifyEmailToken(token)).toEqual({ kind: 'expired_or_invalid' });
  });

  it('a deactivated user who is already verified: still 400, no already_verified answer', async () => {
    const { u, token } = await deactivatedWithLiveLink();
    await rawUsers().updateOne({ _id: u._id }, { $set: { emailVerified: true } });
    const res = await verify(token);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'verify_link_invalid' });
    expect(await bonusRows(u._id)).toBe(0);
  });

  it('CURRENT BEHAVIOUR: the refused link is not spent; after reactivation the same link verifies once', async () => {
    const { u, token } = await deactivatedWithLiveLink();
    const hash = (await raw(u._id)).emailVerifyTokenHash;

    expect((await verify(token)).status).toBe(400);
    expect((await verify(token)).status).toBe(400); // still refused while inactive
    const still = await raw(u._id);
    expect(still.emailVerifyTokenHash).toBe(hash); // not consumed by the refusal
    expect(still.emailVerifyExpires.getTime()).toBeGreaterThan(Date.now());

    await rawUsers().updateOne({ _id: u._id }, { $set: { isActive: true } });
    const ok = await verify(token);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ status: 'verified' });
    expect(await bonusRows(u._id)).toBe(1);
    expect((await verify(token)).status).toBe(400); // and now it is single use
    expect(await bonusRows(u._id)).toBe(1);
  });

  it('a mint is also refused for a deactivated user (no new link can be created)', async () => {
    const u = await mk({ isActive: false });
    expect(await mintVerifyLink(String(u._id))).toEqual({ kind: 'not_eligible' });
  });

  it('control: an active user with a live link still verifies (200, bonus once)', async () => {
    const u = await mk();
    const r = await mintVerifyLink(String(u._id));
    if (r.kind !== 'minted') throw new Error('expected minted');
    const res = await verify(tokenOf(r.link));
    expect(res.status).toBe(200);
    expect(await bonusRows(u._id)).toBe(1);
  });

  it('control: a legacy document with no isActive field is treated as active', async () => {
    const u = await mk();
    const r = await mintVerifyLink(String(u._id));
    if (r.kind !== 'minted') throw new Error('expected minted');
    await rawUsers().updateOne({ _id: u._id }, { $unset: { isActive: 1 } });
    expect((await raw(u._id)).isActive).toBeUndefined();
    const res = await verify(tokenOf(r.link));
    expect(res.status).toBe(200);
    expect(await bonusRows(u._id)).toBe(1);
  });
});

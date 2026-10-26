/**
 * T-587 - the welcome email after a successful email verification: exactly once, never on
 * already_verified / expired / replay / forged, never twice under concurrent verifies, and an
 * enqueue failure never breaks the verify. Real Mongo (memory), email-client stubbed.
 */
import './setupEnv';

jest.mock('ioredis', () => jest.requireActual('ioredis-mock'));
jest.mock('@lawie/email-client', () => ({ enqueueEmail: jest.fn() }));

import './setupDb';

import { enqueueEmail } from '@lawie/email-client';

import logger from '../config/logger';
import redis from '../config/redis';
import { User } from '../models/User.model';
import { mintVerifyLink, verifyEmailToken } from '../services/verify-email.service';

import { rawUsers } from './t234-helpers';

const enqueueMock = enqueueEmail as unknown as jest.Mock;
const tokenOf = (link: string) => new URL(link).searchParams.get('token') as string;
const flush = () => new Promise((r) => setTimeout(r, 80));
const welcomeCalls = () => enqueueMock.mock.calls.filter((c) => c[0]?.template === 'auth.welcome');

let n = 0;
async function mk(fields: Record<string, unknown> = {}) {
  n += 1;
  return User.create({
    email: `t587-vh-${n}@example.com`,
    name: 'Hook Person',
    password: 'Passw0rdOk',
    ...fields,
  });
}
async function tokenFor(id: unknown): Promise<string> {
  const r = await mintVerifyLink(String(id));
  if (r.kind !== 'minted') throw new Error(`expected minted, got ${r.kind}`);
  return tokenOf(r.link);
}

beforeEach(async () => {
  await redis.flushall();
  enqueueMock.mockReset();
  enqueueMock.mockResolvedValue({ jobId: 'j', queue: 'email-low', deduped: false });
  jest.spyOn(logger, 'info').mockImplementation(() => undefined);
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('T-587 welcome after verify', () => {
  it('a successful verify queues exactly one welcome with only the userId', async () => {
    const u = await mk();
    const token = await tokenFor(u._id);
    expect((await verifyEmailToken(token)).kind).toBe('verified');
    await flush();
    expect(welcomeCalls()).toHaveLength(1);
    expect(welcomeCalls()[0][0]).toEqual({ template: 'auth.welcome', userId: String(u._id) });
    expect((await rawUsers().findOne({ _id: u._id }))!.welcomeQueuedAt).toBeInstanceOf(Date);
  });

  it('the welcome is not queued when the account is only registered (no verify yet)', async () => {
    await mk();
    await flush();
    expect(welcomeCalls()).toHaveLength(0);
  });

  it('already_verified (live link on a verified account): no welcome', async () => {
    const u = await mk();
    const token = await tokenFor(u._id);
    await rawUsers().updateOne({ _id: u._id }, { $set: { emailVerified: true } });
    expect((await verifyEmailToken(token)).kind).toBe('already_verified');
    await flush();
    expect(welcomeCalls()).toHaveLength(0);
    expect((await rawUsers().findOne({ _id: u._id }))!.welcomeQueuedAt).toBeNull();
  });

  it('replay of a used token: still exactly one welcome in total', async () => {
    const u = await mk();
    const token = await tokenFor(u._id);
    await verifyEmailToken(token);
    expect((await verifyEmailToken(token)).kind).toBe('expired_or_invalid');
    await flush();
    expect(welcomeCalls()).toHaveLength(1);
  });

  it('expired, forged and non-token input: no welcome and the flag is untouched', async () => {
    const u = await mk();
    const token = await tokenFor(u._id);
    await rawUsers().updateOne({ _id: u._id }, { $set: { emailVerifyExpires: new Date(0) } });
    expect((await verifyEmailToken(token)).kind).toBe('expired_or_invalid');
    expect((await verifyEmailToken('ab'.repeat(32))).kind).toBe('expired_or_invalid');
    expect((await verifyEmailToken('nope')).kind).toBe('expired_or_invalid');
    expect((await verifyEmailToken(undefined)).kind).toBe('expired_or_invalid');
    await flush();
    expect(welcomeCalls()).toHaveLength(0);
    expect((await rawUsers().findOne({ _id: u._id }))!.welcomeQueuedAt).toBeNull();
  });

  it('concurrent double verify: exactly one welcome', async () => {
    const u = await mk();
    const token = await tokenFor(u._id);
    const results = await Promise.all([
      verifyEmailToken(token),
      verifyEmailToken(token),
      verifyEmailToken(token),
    ]);
    expect(results.filter((r) => r.kind === 'verified')).toHaveLength(1);
    await flush();
    expect(welcomeCalls()).toHaveLength(1);
  });

  it('a rejected enqueue never breaks the verify (still verified, bonus granted)', async () => {
    const u = await mk();
    const token = await tokenFor(u._id);
    enqueueMock.mockRejectedValue(new Error('redis down'));
    const r = await verifyEmailToken(token);
    expect(r).toEqual({ kind: 'verified', userId: String(u._id), linkKind: 'verify' });
    await flush();
    const doc = await rawUsers().findOne({ _id: u._id });
    expect(doc!.emailVerified).toBe(true);
    expect(doc!.signupBonusGrantedAt).toBeInstanceOf(Date);
  });

  it('a synchronous throw from the client never breaks the verify', async () => {
    const u = await mk();
    const token = await tokenFor(u._id);
    enqueueMock.mockImplementation(() => {
      throw new Error('sync');
    });
    expect((await verifyEmailToken(token)).kind).toBe('verified');
  });

  it('a test account that verifies gets no welcome', async () => {
    const u = await mk();
    await rawUsers().updateOne({ _id: u._id }, { $set: { isTestAccount: true } });
    const token = await tokenFor(u._id);
    expect((await verifyEmailToken(token)).kind).toBe('verified');
    await flush();
    expect(welcomeCalls()).toHaveLength(0);
  });
});

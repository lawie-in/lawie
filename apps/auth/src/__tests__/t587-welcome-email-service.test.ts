/**
 * T-587 - queueWelcomeEmail: an atomic once-only claim of welcomeQueuedAt on a live, non-test
 * account; only the claim winner enqueues {template:'auth.welcome', userId}. Failures are
 * swallowed and logged with the userId (+errKind) only: never an address or a name.
 */
import './setupEnv';

jest.mock('ioredis', () => jest.requireActual('ioredis-mock'));
jest.mock('@lawie/email-client', () => ({ enqueueEmail: jest.fn() }));

const logged: Array<{ level: string; obj: unknown; msg: string }> = [];
jest.mock('../config/logger', () => {
  const rec = (level: string) => (obj: unknown, msg?: string) =>
    logged.push({ level, obj, msg: msg ?? '' });
  return {
    __esModule: true,
    default: { info: rec('info'), warn: rec('warn'), error: rec('error'), debug: rec('debug') },
  };
});

import './setupDb';

import { enqueueEmail } from '@lawie/email-client';
import mongoose from 'mongoose';

import { User } from '../models/User.model';
import { queueWelcomeEmail } from '../services/welcome-email.service';

import { rawUsers } from './t234-helpers';

const enqueueMock = enqueueEmail as unknown as jest.Mock;
const EMAIL = 't587-svc@example.com';
const NAME = 'Quasimodo Svc';

const mk = (fields: Record<string, unknown> = {}) =>
  User.create({ email: EMAIL, name: NAME, password: 'Passw0rdOk', ...fields });

const flush = () => new Promise((r) => setTimeout(r, 50));
const logText = () => JSON.stringify(logged);

beforeEach(() => {
  logged.length = 0;
  enqueueMock.mockReset();
  enqueueMock.mockResolvedValue({ jobId: 'j', queue: 'email-low', deduped: false });
});

describe('T-587 queueWelcomeEmail', () => {
  it('claims the flag and enqueues exactly {template, userId}', async () => {
    const u = await mk();
    await queueWelcomeEmail(String(u._id));
    await flush();
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(enqueueMock).toHaveBeenCalledWith({ template: 'auth.welcome', userId: String(u._id) });
    const doc = await rawUsers().findOne({ _id: u._id });
    expect(doc!.welcomeQueuedAt).toBeInstanceOf(Date);
    expect(logged.find((l) => l.msg === 'Welcome email queued')?.obj).toEqual({
      userId: String(u._id),
    });
  });

  it('a second call is a no-op (once only)', async () => {
    const u = await mk();
    await queueWelcomeEmail(String(u._id));
    await queueWelcomeEmail(String(u._id));
    await flush();
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });

  it('concurrent calls: exactly one winner enqueues', async () => {
    const u = await mk();
    await Promise.all(Array.from({ length: 8 }, () => queueWelcomeEmail(String(u._id))));
    await flush();
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });

  it('claims when the flag is absent (an account from before the field existed)', async () => {
    const u = await mk();
    await rawUsers().updateOne({ _id: u._id }, { $unset: { welcomeQueuedAt: '' } });
    await queueWelcomeEmail(String(u._id));
    await flush();
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });

  it('no enqueue for a test account, an inactive account or one being erased', async () => {
    const test = await mk({ email: 't587-test@example.com' });
    await rawUsers().updateOne({ _id: test._id }, { $set: { isTestAccount: true } });
    const inactive = await mk({ email: 't587-inactive@example.com' });
    await rawUsers().updateOne({ _id: inactive._id }, { $set: { isActive: false } });
    const erased = await mk({ email: 't587-erased@example.com' });
    await rawUsers().updateOne(
      { _id: erased._id },
      { $set: { erasure: { requestedAt: new Date(), stage: 'locked' } } },
    );
    for (const u of [test, inactive, erased]) await queueWelcomeEmail(String(u._id));
    await flush();
    expect(enqueueMock).not.toHaveBeenCalled();
    for (const u of [test, inactive, erased]) {
      expect((await rawUsers().findOne({ _id: u._id }))!.welcomeQueuedAt).toBeNull();
    }
  });

  it('no enqueue for an unknown id or a malformed id, and no throw', async () => {
    await expect(queueWelcomeEmail(String(new mongoose.Types.ObjectId()))).resolves.toBeUndefined();
    await expect(queueWelcomeEmail('not-an-id')).resolves.toBeUndefined();
    await flush();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('a rejected enqueue is swallowed, the flag stays set (at most once), the log has userId and errKind only', async () => {
    const u = await mk();
    enqueueMock.mockRejectedValue(new Error(`redis down for ${EMAIL} ${NAME}`));
    await expect(queueWelcomeEmail(String(u._id))).resolves.toBeUndefined();
    await flush();
    expect((await rawUsers().findOne({ _id: u._id }))!.welcomeQueuedAt).toBeInstanceOf(Date);
    const line = logged.find((l) => l.msg === 'Welcome email enqueue failed');
    expect(line?.obj).toEqual({ userId: String(u._id), errKind: 'Error' });
    // not retried by a later call
    await queueWelcomeEmail(String(u._id));
    await flush();
    expect(enqueueMock).toHaveBeenCalledTimes(1);
  });

  it('a synchronous throw from the client is swallowed too', async () => {
    const u = await mk();
    enqueueMock.mockImplementation(() => {
      throw new TypeError(`sync boom ${EMAIL}`);
    });
    await expect(queueWelcomeEmail(String(u._id))).resolves.toBeUndefined();
    await flush();
    const line = logged.find((l) => l.msg === 'Welcome email enqueue failed');
    expect(line?.obj).toEqual({ userId: String(u._id), errKind: 'TypeError' });
  });

  it('a DB error on the claim is swallowed, logged with userId and errKind, nothing enqueued', async () => {
    const u = await mk();
    const spy = jest.spyOn(User, 'findOneAndUpdate').mockImplementation((() => {
      throw new Error(`mongo down ${EMAIL}`);
    }) as never);
    await expect(queueWelcomeEmail(String(u._id))).resolves.toBeUndefined();
    spy.mockRestore();
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(logged.find((l) => l.msg === 'Welcome email claim failed')?.obj).toEqual({
      userId: String(u._id),
      errKind: 'Error',
    });
  });

  it('no log line (success or failure) contains the address or the name', async () => {
    const ok = await mk();
    await queueWelcomeEmail(String(ok._id));
    const bad = await mk({ email: 't587-bad@example.com' });
    enqueueMock.mockRejectedValue(new Error(`x ${EMAIL} ${NAME} t587-bad@example.com`));
    await queueWelcomeEmail(String(bad._id));
    await flush();
    expect(logged.length).toBeGreaterThanOrEqual(3);
    for (const s of [EMAIL, 't587-bad@example.com', NAME, 'Quasimodo', '@example.com']) {
      expect(logText()).not.toContain(s);
    }
  });
});

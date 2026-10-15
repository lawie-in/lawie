/**
 * T-358 (Arjun ruling 2): the auth.unverifiedDeletionNotice job carries the userId only, goes to
 * the low-tier queue, uses the idempotency key as its jobId, and a second add for a kept job is
 * reported as deduped. BullMQ is stubbed; no Redis.
 */
type AddCall = { name: string; data: Record<string, unknown>; opts: Record<string, unknown> };

const calls: AddCall[] = [];
let timestampFor: (jobId: string) => number = () => Date.now();

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation((name: string) => ({
    queueName: name,
    add: jest.fn(
      async (jobName: string, data: Record<string, unknown>, opts: Record<string, unknown>) => {
        calls.push({ name: jobName, data, opts });
        const id = (opts.jobId as string | undefined) ?? `auto-${calls.length}`;
        return { id, name: jobName, timestamp: timestampFor(id) };
      },
    ),
    close: jest.fn(async () => undefined),
  })),
}));

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ quit: jest.fn(async () => undefined) })),
}));

import { enqueueEmail, disconnectEmailClient, EMAIL_QUEUE_NAMES } from '../index';

const USER_ID = '64b7f0c2a1b2c3d4e5f60718';
const KEY = `unverified-notice:${USER_ID}:first`;
const WARNING_KEY = `unverified-notice:${USER_ID}:warning`;

beforeAll(() => {
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.EMAIL_QUEUE_PREFIX = 'lawie-test';
});
beforeEach(() => {
  calls.length = 0;
  timestampFor = () => Date.now();
});
afterAll(async () => {
  await disconnectEmailClient();
});

describe('T-358 enqueue shape for auth.unverifiedDeletionNotice', () => {
  it('job data is {template, to:[], cc:[], bcc:[], data:{userId}} with no address', async () => {
    const r = await enqueueEmail({
      template: 'auth.unverifiedDeletionNotice',
      userId: USER_ID,
      idempotencyKey: KEY,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('auth.unverifiedDeletionNotice');
    expect(calls[0].data).toEqual({
      template: 'auth.unverifiedDeletionNotice',
      to: [],
      cc: [],
      bcc: [],
      data: { userId: USER_ID },
    });
    expect(JSON.stringify(calls[0])).not.toMatch(/@/);
    expect(r.queue).toBe(EMAIL_QUEUE_NAMES.low);
    expect(r.deduped).toBe(false);
  });

  it('the idempotency key is the jobId, and is returned as the jobId', async () => {
    const r = await enqueueEmail({
      template: 'auth.unverifiedDeletionNotice',
      userId: USER_ID,
      idempotencyKey: KEY,
    });
    expect(calls[0].opts.jobId).toBe(KEY);
    expect(r.jobId).toBe(KEY);
  });

  it('the first and warning notices have different jobIds, so a kept first job never swallows the warning', async () => {
    const a = await enqueueEmail({
      template: 'auth.unverifiedDeletionNotice',
      userId: USER_ID,
      idempotencyKey: KEY,
    });
    const b = await enqueueEmail({
      template: 'auth.unverifiedDeletionNotice',
      userId: USER_ID,
      idempotencyKey: WARNING_KEY,
    });
    expect(a.jobId).toBe(KEY);
    expect(b.jobId).toBe(WARNING_KEY);
    expect(calls.map((c) => c.opts.jobId)).toEqual([KEY, WARNING_KEY]);
    // both carry the userId only
    for (const c of calls) expect(c.data.data).toEqual({ userId: USER_ID });
  });

  it('is low tier: 3 attempts, exponential backoff, kept 7 days / failed 30 days', async () => {
    await enqueueEmail({
      template: 'auth.unverifiedDeletionNotice',
      userId: USER_ID,
      idempotencyKey: KEY,
    });
    expect(calls[0].opts.attempts).toBe(3);
    expect(calls[0].opts.backoff).toEqual({ type: 'exponential', delay: 5_000 });
    expect(calls[0].opts.removeOnComplete).toMatchObject({ age: 7 * 24 * 60 * 60 });
    expect(calls[0].opts.removeOnFail).toEqual({ age: 30 * 24 * 60 * 60 });
  });

  it('an explicit priority overrides the tier', async () => {
    const r = await enqueueEmail({
      template: 'auth.unverifiedDeletionNotice',
      userId: USER_ID,
      idempotencyKey: KEY,
      priority: 'high',
    });
    expect(r.queue).toBe(EMAIL_QUEUE_NAMES.high);
  });

  it('a kept job added again (older than a second) is reported as deduped', async () => {
    timestampFor = () => Date.now() - 60_000;
    const r = await enqueueEmail({
      template: 'auth.unverifiedDeletionNotice',
      userId: USER_ID,
      idempotencyKey: KEY,
    });
    expect(r.deduped).toBe(true);
    expect(r.jobId).toBe(KEY);
  });

  it('without an idempotency key there is no fixed jobId and nothing is deduped', async () => {
    const r = await enqueueEmail({ template: 'auth.unverifiedDeletionNotice', userId: USER_ID });
    expect(calls[0].opts.jobId).toBeUndefined();
    expect(r.deduped).toBe(false);
  });

  it('does not touch the other templates: auth.welcome still carries its recipient', async () => {
    await enqueueEmail({
      template: 'auth.welcome',
      to: 'success@simulator.amazonses.com',
      data: { name: 'N' },
    });
    expect(calls[0].data.to).toEqual(['success@simulator.amazonses.com']);
  });
});

describe('retention: completed notice jobs are kept 7 days by age (so their jobIds block re-queues)', () => {
  const SEVEN = 7 * 24 * 60 * 60;

  it.each([KEY, WARNING_KEY])(
    'notice job %s: removeOnComplete is { age: 7 days } with NO count limit',
    async (key) => {
      await enqueueEmail({
        template: 'auth.unverifiedDeletionNotice',
        userId: USER_ID,
        idempotencyKey: key,
      });
      expect(calls[0].opts.removeOnComplete).toEqual({ age: SEVEN });
      expect(calls[0].opts.removeOnComplete).not.toHaveProperty('count');
    },
  );

  it('failed notice jobs are still kept 30 days', async () => {
    await enqueueEmail({
      template: 'auth.unverifiedDeletionNotice',
      userId: USER_ID,
      idempotencyKey: KEY,
    });
    expect(calls[0].opts.removeOnFail).toEqual({ age: 30 * 24 * 60 * 60 });
  });

  it('with an explicit priority the retention is the same', async () => {
    await enqueueEmail({
      template: 'auth.unverifiedDeletionNotice',
      userId: USER_ID,
      idempotencyKey: KEY,
      priority: 'high',
    });
    expect(calls[0].opts.removeOnComplete).toEqual({ age: SEVEN });
  });

  it('other templates keep age 7 days AND the 1000-job count limit (unchanged)', async () => {
    await enqueueEmail({
      template: 'auth.welcome',
      to: 'success@simulator.amazonses.com',
      data: { name: 'N' },
    });
    await enqueueEmail({ template: 'auth.verifyEmail', userId: USER_ID });
    expect(calls[0].opts.removeOnComplete).toEqual({ age: SEVEN, count: 1000 });
    expect(calls[1].opts.removeOnComplete).toEqual({ age: SEVEN, count: 1000 });
    expect(calls[0].opts.removeOnFail).toEqual({ age: 30 * 24 * 60 * 60 });
  });

  it('a notice enqueue does not change the options of the next welcome enqueue (no shared state)', async () => {
    await enqueueEmail({
      template: 'auth.unverifiedDeletionNotice',
      userId: USER_ID,
      idempotencyKey: KEY,
    });
    await enqueueEmail({
      template: 'auth.welcome',
      to: 'success@simulator.amazonses.com',
      data: {},
    });
    expect(calls[1].opts.removeOnComplete).toEqual({ age: SEVEN, count: 1000 });
  });
});

describe('compile-time shape', () => {
  it('refuses `to` for this template (checked by tsc; the function is never called)', () => {
    const never = () =>
      enqueueEmail({
        template: 'auth.unverifiedDeletionNotice',
        userId: USER_ID,
        // @ts-expect-error the notice carries a userId only: no recipient
        to: 'a@b.c',
      });
    expect(typeof never).toBe('function');
  });
});

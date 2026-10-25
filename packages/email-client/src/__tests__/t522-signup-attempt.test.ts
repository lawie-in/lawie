/**
 * T-522 (AJ-522-M5): the auth.signupAttempt job carries the userId only (T-223 condition 1: no
 * address in Redis), goes to the high-tier queue, and is typed so `to` is refused at compile time.
 */
type AddCall = { name: string; data: Record<string, unknown>; opts: Record<string, unknown> };

const calls: AddCall[] = [];

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(
      async (name: string, data: Record<string, unknown>, opts: Record<string, unknown>) => {
        calls.push({ name, data, opts });
        return { id: opts.jobId ?? `auto-${calls.length}`, name };
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

beforeAll(() => {
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.EMAIL_QUEUE_PREFIX = 'lawie-test';
});
beforeEach(() => {
  calls.length = 0;
});
afterAll(async () => {
  await disconnectEmailClient();
});

describe('T-522 enqueue shape for auth.signupAttempt', () => {
  it('job data is {template, to:[], cc:[], bcc:[], data:{userId}} with no address', async () => {
    const r = await enqueueEmail({ template: 'auth.signupAttempt', userId: USER_ID });
    expect(r.queue).toBe(EMAIL_QUEUE_NAMES.high);
    expect(r.deduped).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('auth.signupAttempt');
    expect(calls[0].data).toEqual({
      template: 'auth.signupAttempt',
      to: [],
      cc: [],
      bcc: [],
      data: { userId: USER_ID },
    });
    expect(JSON.stringify(calls[0].data)).not.toMatch(/@/);
  });

  it('retries like a high-tier job (5 attempts, exponential backoff)', async () => {
    await enqueueEmail({ template: 'auth.signupAttempt', userId: USER_ID });
    expect(calls[0].opts.attempts).toBe(5);
    expect(calls[0].opts.backoff).toEqual({ type: 'exponential', delay: 5_000 });
  });

  it('honours an explicit low priority', async () => {
    const r = await enqueueEmail({
      template: 'auth.signupAttempt',
      userId: USER_ID,
      priority: 'low',
    });
    expect(r.queue).toBe(EMAIL_QUEUE_NAMES.low);
  });

  it('is not deduplicated by the client (auth limits it to one an hour with SET NX)', async () => {
    await enqueueEmail({ template: 'auth.signupAttempt', userId: USER_ID });
    await enqueueEmail({ template: 'auth.signupAttempt', userId: USER_ID });
    expect(calls).toHaveLength(2);
  });

  it('refuses an address at compile time', async () => {
    const bad: Parameters<typeof enqueueEmail>[0] = {
      template: 'auth.signupAttempt',
      userId: USER_ID,
      // @ts-expect-error `to` is not allowed on a userId-only template
      to: 'someone@example.com',
    };
    expect(bad.template).toBe('auth.signupAttempt');
  });
});

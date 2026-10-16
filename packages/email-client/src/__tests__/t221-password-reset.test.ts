/**
 * T-221 AC2: the auth.passwordReset job carries the userId only (no address, no token, no link),
 * goes to the high tier, and each request is its own job.
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

describe('T-221 enqueue shape for auth.passwordReset', () => {
  it('job data is {template, to:[], cc:[], bcc:[], data:{userId}} on the high queue', async () => {
    const r = await enqueueEmail({ template: 'auth.passwordReset', userId: USER_ID });
    expect(r.queue).toBe(EMAIL_QUEUE_NAMES.high);
    expect(r.deduped).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('auth.passwordReset');
    expect(calls[0].data).toEqual({
      template: 'auth.passwordReset',
      to: [],
      cc: [],
      bcc: [],
      data: { userId: USER_ID },
    });
    expect(JSON.stringify(calls[0].data)).not.toMatch(/@|token|http/i);
  });

  it('two requests make two jobs (no idempotency key shared between them)', async () => {
    await enqueueEmail({ template: 'auth.passwordReset', userId: USER_ID });
    await enqueueEmail({ template: 'auth.passwordReset', userId: USER_ID });
    expect(calls).toHaveLength(2);
    expect(calls[0].opts.jobId).not.toBe(USER_ID);
  });

  it('refuses a recipient at compile time', () => {
    const bad: Parameters<typeof enqueueEmail>[0] = {
      template: 'auth.passwordReset',
      userId: USER_ID,
      // @ts-expect-error `to` is not allowed on a userId-only template
      to: ['a@b.co'],
    };
    expect(bad).toBeDefined();
  });
});

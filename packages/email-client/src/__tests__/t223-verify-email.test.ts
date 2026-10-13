/**
 * T-223 AC1: the auth.verifyEmail job carries the userId only. Typed, not loosened: `to` is
 * refused at compile time for this template and still required for every other one.
 */
type AddCall = { name: string; data: Record<string, unknown>; opts: Record<string, unknown> };

const calls: AddCall[] = [];

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(
      async (name: string, data: Record<string, unknown>, opts: Record<string, unknown>) => {
        calls.push({ name, data, opts });
        return { id: `auto-${calls.length}`, name };
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

describe('T-223 AC1 enqueue shape for auth.verifyEmail', () => {
  it('job data is {template, to:[], cc:[], bcc:[], data:{userId}} with no address', async () => {
    const r = await enqueueEmail({ template: 'auth.verifyEmail', userId: USER_ID });
    expect(r.queue).toBe(EMAIL_QUEUE_NAMES.high);
    expect(r.deduped).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('auth.verifyEmail');
    expect(calls[0].data).toEqual({
      template: 'auth.verifyEmail',
      to: [],
      cc: [],
      bcc: [],
      data: { userId: USER_ID },
    });
    expect(JSON.stringify(calls[0].data)).not.toMatch(/@/);
  });

  it('every resend is its own job: no jobId (no idempotency key)', async () => {
    await enqueueEmail({ template: 'auth.verifyEmail', userId: USER_ID });
    await enqueueEmail({ template: 'auth.verifyEmail', userId: USER_ID });
    expect(calls).toHaveLength(2);
    expect(calls[0].opts.jobId).toBeUndefined();
    expect(calls[1].opts.jobId).toBeUndefined();
  });

  it('retries like a high-tier job (5 attempts, exponential backoff)', async () => {
    await enqueueEmail({ template: 'auth.verifyEmail', userId: USER_ID });
    expect(calls[0].opts.attempts).toBe(5);
    expect(calls[0].opts.backoff).toEqual({ type: 'exponential', delay: 5_000 });
  });

  it('honours an explicit low priority', async () => {
    const r = await enqueueEmail({
      template: 'auth.verifyEmail',
      userId: USER_ID,
      priority: 'low',
    });
    expect(r.queue).toBe(EMAIL_QUEUE_NAMES.low);
  });

  it('the compiler refuses an address on auth.verifyEmail, and a missing one on other templates', () => {
    // Type-level checks. If the union were loosened, each @ts-expect-error would itself be an
    // error (unused directive), which ts-jest reports as a failed suite.
    const check = (): void => {
      // @ts-expect-error auth.verifyEmail has no `to`
      void enqueueEmail({ template: 'auth.verifyEmail', userId: USER_ID, to: 'a@example.com' });
      // @ts-expect-error auth.verifyEmail needs a userId
      void enqueueEmail({ template: 'auth.verifyEmail' });
      // @ts-expect-error other templates keep `to` required
      void enqueueEmail({ template: 'auth.welcome', data: {} });
      // @ts-expect-error other templates do not take a userId in place of `to`
      void enqueueEmail({ template: 'billing.paymentFailed', userId: USER_ID, data: {} });
    };
    expect(typeof check).toBe('function');
  });

  it('other templates are unchanged: still addressed, still carry data', async () => {
    await enqueueEmail({ template: 'auth.welcome', to: 'a@example.com', data: { name: 'A' } });
    expect(calls[0].data).toMatchObject({ to: ['a@example.com'], data: { name: 'A' } });
  });
});

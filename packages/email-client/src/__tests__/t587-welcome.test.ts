/**
 * T-587 (Arjun, option A): the auth.welcome job carries the userId only (no address, no name in
 * Redis), goes to the low-tier queue, has the fixed jobId `welcome-<userId>`, and a second add for
 * a kept job is reported as deduped. BullMQ is stubbed; no Redis.
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

import { enqueueEmail, disconnectEmailClient, EMAIL_QUEUE_NAMES, welcomeJobId } from '../index';

const USER_ID = '64b7f0c2a1b2c3d4e5f60718';

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

describe('T-587 enqueue shape for auth.welcome', () => {
  it('welcomeJobId is welcome-<userId> (no colon: BullMQ rejects it)', () => {
    expect(welcomeJobId(USER_ID)).toBe(`welcome-${USER_ID}`);
    expect(welcomeJobId(USER_ID)).not.toContain(':');
  });

  it('job data is {template, to:[], cc:[], bcc:[], data:{userId}} with no address or name', async () => {
    await enqueueEmail({ template: 'auth.welcome', userId: USER_ID });
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('auth.welcome');
    expect(calls[0].data).toEqual({
      template: 'auth.welcome',
      to: [],
      cc: [],
      bcc: [],
      data: { userId: USER_ID },
    });
    expect(JSON.stringify(calls[0])).not.toMatch(/@/);
  });

  it('goes to the low-tier queue and uses the low-tier attempts', async () => {
    const r = await enqueueEmail({ template: 'auth.welcome', userId: USER_ID });
    expect(r.queue).toBe(EMAIL_QUEUE_NAMES.low);
    expect(calls[0].opts.attempts).toBe(3);
  });

  it('honours an explicit priority override', async () => {
    const r = await enqueueEmail({ template: 'auth.welcome', userId: USER_ID, priority: 'high' });
    expect(r.queue).toBe(EMAIL_QUEUE_NAMES.high);
  });

  it('the jobId is welcome-<userId> and is returned as the jobId', async () => {
    const r = await enqueueEmail({ template: 'auth.welcome', userId: USER_ID });
    expect(calls[0].opts.jobId).toBe(`welcome-${USER_ID}`);
    expect(r.jobId).toBe(`welcome-${USER_ID}`);
    expect(r.deduped).toBe(false);
  });

  it('a second add of a kept job (older timestamp) is reported as deduped', async () => {
    timestampFor = () => Date.now() - 60_000;
    const r = await enqueueEmail({ template: 'auth.welcome', userId: USER_ID });
    expect(r.deduped).toBe(true);
    expect(r.jobId).toBe(`welcome-${USER_ID}`);
  });

  it('two different users get two different jobIds', async () => {
    await enqueueEmail({ template: 'auth.welcome', userId: 'a1' });
    await enqueueEmail({ template: 'auth.welcome', userId: 'b2' });
    expect(calls[0].opts.jobId).toBe('welcome-a1');
    expect(calls[1].opts.jobId).toBe('welcome-b2');
  });

  it('the compiler rejects an address, a name or data for auth.welcome', () => {
    const check = (): void => {
      // @ts-expect-error auth.welcome has no `to` (the worker asks auth for the address)
      void enqueueEmail({ template: 'auth.welcome', userId: USER_ID, to: 'a@example.com' });
      // @ts-expect-error auth.welcome has no `data` (no name in Redis)
      void enqueueEmail({ template: 'auth.welcome', userId: USER_ID, data: { name: 'A' } });
      // @ts-expect-error auth.welcome needs a userId
      void enqueueEmail({ template: 'auth.welcome' });
      // @ts-expect-error auth.welcome takes no cc
      void enqueueEmail({ template: 'auth.welcome', userId: USER_ID, cc: ['a@example.com'] });
    };
    expect(typeof check).toBe('function');
  });

  it('even if a JS caller smuggles to/data past the types, none reaches the job', async () => {
    await enqueueEmail({
      template: 'auth.welcome',
      userId: USER_ID,
      to: 'leak@example.com',
      data: { name: 'Leaky' },
      cc: ['c@example.com'],
    } as never);
    const serialized = JSON.stringify(calls[0].data);
    expect(serialized).not.toContain('leak@example.com');
    expect(serialized).not.toContain('Leaky');
    expect(serialized).not.toContain('c@example.com');
    expect(calls[0].data.data).toEqual({ userId: USER_ID });
  });
});

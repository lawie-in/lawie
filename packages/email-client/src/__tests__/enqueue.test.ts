/**
 * Email-client producer tests. BullMQ Queue is stubbed at the module
 * boundary — these tests are about routing, idempotency, and tier mapping,
 * not Redis correctness (that's the worker's integration test in
 * apps/email-worker).
 */
type AddCall = { name: string; data: unknown; opts: Record<string, unknown> };

const calls: AddCall[] = [];
const queuesSeen = new Set<string>();

jest.mock('bullmq', () => {
  return {
    Queue: jest.fn().mockImplementation((name: string) => {
      queuesSeen.add(name);
      return {
        add: jest.fn(async (jobName: string, data: unknown, opts: Record<string, unknown>) => {
          calls.push({ name: jobName, data, opts });
          return {
            id: opts.jobId ?? `auto-${calls.length}`,
            timestamp: Date.now(),
            name: jobName,
          };
        }),
        close: jest.fn(async () => undefined),
      };
    }),
  };
});

jest.mock('ioredis', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({ quit: jest.fn(async () => undefined) })),
  };
});

import { enqueueEmail, disconnectEmailClient, EMAIL_QUEUE_NAMES } from '../index';

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

describe('enqueueEmail', () => {
  it('routes auth.welcome to the low-tier queue', async () => {
    const r = await enqueueEmail({
      template: 'auth.welcome',
      to: 'advocate@example.com',
      data: { name: 'Test' },
    });
    expect(r.queue).toBe(EMAIL_QUEUE_NAMES.low);
    expect(queuesSeen.has(EMAIL_QUEUE_NAMES.low)).toBe(true);
  });

  it('routes billing.paymentFailed to the high-tier queue', async () => {
    const r = await enqueueEmail({
      template: 'billing.paymentFailed',
      to: 'advocate@example.com',
      data: { amount: 799 },
    });
    expect(r.queue).toBe(EMAIL_QUEUE_NAMES.high);
  });

  it('honours an explicit priority override', async () => {
    const r = await enqueueEmail({
      template: 'auth.welcome',
      to: 'advocate@example.com',
      data: {},
      priority: 'high',
    });
    expect(r.queue).toBe(EMAIL_QUEUE_NAMES.high);
  });

  it('forwards the idempotencyKey as the BullMQ jobId', async () => {
    await enqueueEmail({
      template: 'auth.welcome',
      to: 'advocate@example.com',
      data: {},
      idempotencyKey: 'welcome-abc-123',
    });
    expect(calls[0].opts.jobId).toBe('welcome-abc-123');
  });

  it('wraps a single string recipient into an array', async () => {
    await enqueueEmail({
      template: 'auth.welcome',
      to: 'a@x.com',
      data: {},
    });
    const data = calls[0].data as { to: string[] };
    expect(data.to).toEqual(['a@x.com']);
  });

  it('passes cc / bcc / replyTo through to the job data', async () => {
    await enqueueEmail({
      template: 'admin.founderDailyDigest',
      to: 'founder@lawie.in',
      cc: ['vishal@lawie.in'],
      bcc: ['ops@lawie.in'],
      replyTo: 'noreply@lawie.in',
      data: { date: '2026-05-17' },
    });
    const data = calls[0].data as { cc: string[]; bcc: string[]; replyTo: string };
    expect(data.cc).toEqual(['vishal@lawie.in']);
    expect(data.bcc).toEqual(['ops@lawie.in']);
    expect(data.replyTo).toBe('noreply@lawie.in');
  });

  it('sets attempts=5 for high-tier and 3 for low-tier', async () => {
    await enqueueEmail({
      template: 'billing.paymentFailed',
      to: 't@e.com',
      data: {},
    });
    expect(calls[0].opts.attempts).toBe(5);
    await enqueueEmail({
      template: 'auth.welcome',
      to: 't@e.com',
      data: {},
    });
    expect(calls[1].opts.attempts).toBe(3);
  });
});

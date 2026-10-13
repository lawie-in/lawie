/**
 * T-390 AC1/AC3, producer unit tests (BullMQ stubbed). The stub models BullMQ's deduplication:
 * the first add for a dedup id returns the new job's id, later adds with the same dedup id
 * return the id of the job already pending. Real-Redis behaviour is in
 * apps/email-worker t390-held-verify-one-send-real-redis.test.ts.
 */
type AddCall = { name: string; data: unknown; opts: Record<string, unknown> };

const calls: AddCall[] = [];
const pending = new Map<string, string>();

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(async (name: string, data: unknown, opts: Record<string, unknown>) => {
      calls.push({ name, data, opts });
      const dedup = opts.deduplication as { id: string } | undefined;
      if (dedup) {
        const existing = pending.get(dedup.id);
        if (existing) return { id: existing, name };
        pending.set(dedup.id, String(opts.jobId));
      }
      return { id: opts.jobId ?? `auto-${calls.length}`, timestamp: Date.now(), name };
    }),
    close: jest.fn(async () => undefined),
  })),
}));

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ quit: jest.fn(async () => undefined) })),
}));

import { enqueueEmail, disconnectEmailClient } from '../index';

beforeAll(() => {
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.EMAIL_QUEUE_PREFIX = 'lawie-test';
});
beforeEach(() => {
  calls.length = 0;
  pending.clear();
});
afterAll(async () => {
  await disconnectEmailClient();
});

describe('T-390 verify-email producer dedupe', () => {
  it('sets deduplication {id: verify:<userId>} with no ttl / extend / replace / keepLastIfActive', async () => {
    await enqueueEmail({ template: 'auth.verifyEmail', userId: 'u1' });
    expect(calls[0].opts.deduplication).toEqual({ id: 'verify:u1' });
    const d = calls[0].opts.deduplication as Record<string, unknown>;
    for (const k of ['ttl', 'extend', 'replace', 'keepLastIfActive']) {
      expect(k in d).toBe(false);
    }
  });

  it('jobId is verify-<uuid> and differs on every call', async () => {
    await enqueueEmail({ template: 'auth.verifyEmail', userId: 'u1' });
    await enqueueEmail({ template: 'auth.verifyEmail', userId: 'u1' });
    const [a, b] = calls.map((c) => c.opts.jobId as string);
    expect(a).toMatch(/^verify-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(b).toMatch(/^verify-/);
    expect(a).not.toBe(b);
  });

  it('deduped is false when the returned id is the requested one', async () => {
    const r = await enqueueEmail({ template: 'auth.verifyEmail', userId: 'u1' });
    expect(r.deduped).toBe(false);
    expect(r.jobId).toBe(calls[0].opts.jobId);
  });

  it('deduped is true when BullMQ returns the pending id, and jobId is the pending one', async () => {
    const first = await enqueueEmail({ template: 'auth.verifyEmail', userId: 'u1' });
    const second = await enqueueEmail({ template: 'auth.verifyEmail', userId: 'u1' });
    const third = await enqueueEmail({ template: 'auth.verifyEmail', userId: 'u1' });
    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(true);
    expect(second.jobId).toBe(first.jobId);
    expect(second.jobId).not.toBe(calls[1].opts.jobId);
    expect(third.deduped).toBe(true);
    expect(third.jobId).toBe(first.jobId);
  });

  it('different users get different dedup ids and are not deduped against each other', async () => {
    const a = await enqueueEmail({ template: 'auth.verifyEmail', userId: 'u1' });
    const b = await enqueueEmail({ template: 'auth.verifyEmail', userId: 'u2' });
    expect((calls[0].opts.deduplication as { id: string }).id).toBe('verify:u1');
    expect((calls[1].opts.deduplication as { id: string }).id).toBe('verify:u2');
    expect(b.deduped).toBe(false);
    expect(b.jobId).not.toBe(a.jobId);
  });

  it('other templates are unchanged: idempotencyKey becomes jobId, no deduplication', async () => {
    await enqueueEmail({
      template: 'auth.welcome',
      to: 'a@example.com',
      data: { name: 'A' },
      idempotencyKey: 'welcome-1',
    });
    await enqueueEmail({ template: 'auth.welcome', to: 'a@example.com', data: { name: 'A' } });
    expect(calls[0].opts.jobId).toBe('welcome-1');
    expect(calls[0].opts.deduplication).toBeUndefined();
    expect(calls[1].opts.jobId).toBeUndefined();
    expect(calls[1].opts.deduplication).toBeUndefined();
  });
});

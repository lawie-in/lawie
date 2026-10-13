/**
 * T-390 AC1/AC3, real Redis, real BullMQ and the real @lawie/email-client producer.
 *  1. Producer: three verify resends for one user leave ONE waiting job (2nd/3rd deduped:true,
 *     the returned jobId is the pending one); another user gets its own job; once the user's job
 *     completes or is removed, a new resend queues again.
 *  2. End to end (T-379 held, live mode, footer unfilled): no worker starts, three resends for
 *     one user leave one waiting job; when the footer is stubbed filled and workers start, mint
 *     and send are each called exactly once for that user, and the logs hold no PII.
 *
 * Runs against REDIS_TEST_URL if set (loopback), else a private redis-server (never REDIS_URL).
 * The provider send and auth's mint are stubs; nothing is sent.
 */
import { disconnectEmailClient, enqueueEmail } from '@lawie/email-client';
import { Queue, Worker } from 'bullmq';

import { LEAK_ADDRESS, LEAK_NAME, SES_ENV, allLogText } from './helpers/t220-capture';
import { type TestRedis, acquireRedis, purgePrefix } from './helpers/t220-redis';

jest.mock('../config/logger', () =>
  jest.requireActual('./helpers/t220-capture').makeCapturingLogger(),
);
jest.mock('@sentry/node', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));
let mockFooterFilled = false;
jest.mock('../placeholders', () => {
  const actual = jest.requireActual('../placeholders');
  return {
    ...actual,
    anyTemplateUnfilled: () => (mockFooterFilled ? false : actual.anyTemplateUnfilled()),
    templateHasUnfilledFooter: (id: string) =>
      mockFooterFilled ? false : actual.templateHasUnfilledFooter(id),
  };
});
const mockRender = jest.fn();
jest.mock('../templates', () => ({
  renderTemplate: (...a: unknown[]) => mockRender(...a),
}));

const PREFIX = `lawie-t390-${process.pid}-${Date.now()}`;
const TOKEN = 'cd'.repeat(32);
const LINK = `https://app.lawie.in/verify-email?token=${TOKEN}`;

jest.setTimeout(60_000);

let redis: TestRedis;
let connection: { host: string; port: number; maxRetriesPerRequest: null };
let q: Queue;
const saved: Record<string, string | undefined> = {};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// obliterate() does not delete BullMQ dedup keys (<prefix>:email-high:de:verify:<userId>), so clear them too;
// otherwise a leftover key from one test would only be healed by the T-416 recovery.
const resetQueue = async () => {
  await q.obliterate({ force: true });
  const client = await q.client;
  for (const u of ['u1', 'u2', '64b7f0c2a1b2c3d4e5f60790']) {
    await client.del(`{${PREFIX}}:email-high:de:verify:${u}`);
  }
};
const verify = (userId: string) => enqueueEmail({ template: 'auth.verifyEmail', userId });

beforeAll(async () => {
  redis = await acquireRedis();
  for (const [k, v] of Object.entries({
    ...SES_ENV,
    REDIS_URL: redis.url,
    EMAIL_QUEUE_PREFIX: PREFIX,
  })) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  const u = new URL(redis.url);
  connection = { host: u.hostname, port: Number(u.port || 6379), maxRetriesPerRequest: null };
  q = new Queue('email-high', { connection, prefix: `{${PREFIX}}` });
});

afterAll(async () => {
  try {
    await (await import('../worker')).stopWorkers();
  } catch {
    /* never loaded */
  }
  await q?.close();
  await disconnectEmailClient();
  if (redis) {
    await purgePrefix(redis.url, PREFIX);
    await redis.stop();
  }
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('T-390 producer dedupe against real Redis', () => {
  beforeEach(async () => {
    await resetQueue();
  });

  it('runs on a real Redis', () => {
    expect(['REDIS_TEST_URL', 'spawned redis-server']).toContain(redis.source);
  });

  it('three resends for one user leave one waiting job; the 2nd and 3rd are deduped', async () => {
    const a = await verify('u1');
    const b = await verify('u1');
    const c = await verify('u1');
    expect(a.deduped).toBe(false);
    expect(b.deduped).toBe(true);
    expect(c.deduped).toBe(true);
    expect(b.jobId).toBe(a.jobId);
    expect(c.jobId).toBe(a.jobId);
    expect(await q.getWaitingCount()).toBe(1);
    const job = (await q.getJob(a.jobId))!;
    expect(job.data.data).toEqual({ userId: 'u1' });
  });

  it('a different user gets its own job', async () => {
    await verify('u1');
    const other = await verify('u2');
    expect(other.deduped).toBe(false);
    expect(await q.getWaitingCount()).toBe(2);
    expect((await verify('u2')).deduped).toBe(true);
    expect(await q.getWaitingCount()).toBe(2);
  });

  it('after the user job is removed, a new resend queues', async () => {
    await verify('u2');
    const pendingJob = (await verify('u1')).jobId;
    await (await q.getJob(pendingJob))!.remove();
    const again = await verify('u1');
    expect(again.deduped).toBe(false);
    expect(again.jobId).not.toBe(pendingJob);
    expect(await q.getWaitingCount()).toBe(2);
  });

  it('T-416: job hash deleted but dedup key left behind: the next resend is queued and the key moves', async () => {
    const first = await verify('u1');
    const deKey = `{${PREFIX}}:email-high:de:verify:u1`;
    const client = await q.client;
    expect(await client.get(deKey)).toBe(first.jobId);
    expect(await client.del(`{${PREFIX}}:email-high:${first.jobId}`)).toBe(1);
    expect(await q.getJob(first.jobId)).toBeUndefined();
    expect(await client.get(deKey)).toBe(first.jobId); // orphaned

    const next = await verify('u1');
    expect(next.deduped).toBe(false);
    expect(next.jobId).not.toBe(first.jobId);
    const job = await q.getJob(next.jobId);
    expect(job).toBeDefined();
    expect(await job!.getState()).toBe('waiting');
    expect(await client.get(deKey)).toBe(next.jobId);
    // and dedup works again against the new job
    const again = await verify('u1');
    expect(again).toMatchObject({ deduped: true, jobId: next.jobId });
  });

  it('after the user job completes, a new resend queues (dedup key cleared on completion)', async () => {
    const pendingId = (await verify('u1')).jobId;
    const w = new Worker('email-high', async () => 'ok', { connection, prefix: `{${PREFIX}}` });
    try {
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline && (await q.getWaitingCount()) > 0) await sleep(100);
      while (
        Date.now() < deadline &&
        (await (await q.getJob(pendingId))!.getState()) !== 'completed'
      )
        await sleep(100);
      expect(await (await q.getJob(pendingId))!.getState()).toBe('completed');
    } finally {
      await w.close();
    }
    const after = await verify('u1');
    expect(after.deduped).toBe(false);
    expect(after.jobId).not.toBe(pendingId);
    expect(await q.getWaitingCount()).toBe(1);
  });
});

describe('T-390 held verify jobs: one email per user when the footer is filled', () => {
  const USER = '64b7f0c2a1b2c3d4e5f60790';

  beforeEach(async () => {
    await resetQueue();
  });

  it('three resends while held leave one waiting job; on release, mint and send run once', async () => {
    const { startWorkers, stopWorkers, workers } = await import('../worker');
    const { isLiveSend } = await import('../placeholders');
    expect(isLiveSend()).toBe(true);
    const send = jest.fn(async () => ({ messageId: 'live-ok' }));
    const mint = jest.fn(async () => ({ email: LEAK_ADDRESS, name: LEAK_NAME, link: LINK }));
    mockRender.mockResolvedValue({ subject: 'Verify', html: '<p>filled</p>', text: 'filled' });
    mockFooterFilled = false;
    try {
      // Held: no worker starts.
      expect(startWorkers({ connection, send, mint })).toEqual([]);
      expect(workers).toHaveLength(0);

      const r1 = await verify(USER);
      const r2 = await verify(USER);
      const r3 = await verify(USER);
      expect([r1.deduped, r2.deduped, r3.deduped]).toEqual([false, true, true]);
      expect(await q.getWaitingCount()).toBe(1);
      await sleep(1000);
      expect(mint).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();

      // Footer filled: release.
      mockFooterFilled = true;
      expect(startWorkers({ connection, send, mint }).length).toBeGreaterThan(0);
      const deadline = Date.now() + 30_000;
      for (;;) {
        const j = await q.getJob(r1.jobId);
        if (j && (await j.getState()) === 'completed') break;
        if (Date.now() > deadline) throw new Error('timed out waiting for completed');
        await sleep(100);
      }
      await sleep(1000); // leave time for any (wrong) extra job to be processed
      expect(mint).toHaveBeenCalledTimes(1);
      expect(mint).toHaveBeenCalledWith(USER);
      expect(send).toHaveBeenCalledTimes(1);
      expect(await q.getWaitingCount()).toBe(0);

      const logs = allLogText();
      for (const s of [LEAK_ADDRESS, 'leak@', LEAK_NAME, 'Zainab', TOKEN, 'verify-email?token']) {
        expect(logs).not.toContain(s);
      }
    } finally {
      mockFooterFilled = false;
      await stopWorkers();
    }
  });
});

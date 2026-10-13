/**
 * T-223 phase-1 gap, real Redis: enqueueEmail({ template: 'auth.verifyEmail', userId }) goes
 * through BullMQ to a real worker, which calls the (stubbed) mint seam and sends once to the
 * minted address. The job as stored in Redis holds the userId only, and neither the stored job
 * data nor failedReason nor any log carries the address, the name, the token or the link.
 *
 * Runs against a private redis-server it starts on a free loopback port. If that cannot start it FAILS.
 * No mail is sent: send is a stub.
 */
import { disconnectEmailClient, enqueueEmail } from '@lawie/email-client';
import { Queue } from 'bullmq';

import { LEAK_ADDRESS, LEAK_NAME, allLogText, dump } from './helpers/t220-capture';
import { type TestRedis, acquireRedis, purgePrefix } from './helpers/t220-redis';

jest.mock('../config/logger', () =>
  jest.requireActual('./helpers/t220-capture').makeCapturingLogger(),
);
jest.mock('@sentry/node', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));
jest.mock('../templates', () => ({
  renderTemplate: jest.fn(async (_id: string, data: { name?: string; verifyUrl?: string }) => ({
    subject: 'Verify your Lawie email',
    html: `<a href="${data.verifyUrl}">${data.name}</a>`,
    text: `${data.name} ${data.verifyUrl}`,
  })),
}));

const PREFIX = `lawie-t223-${process.pid}-${Date.now()}`;
const USER_ID = '64b7f0c2a1b2c3d4e5f60718';
const TOKEN = 'ef'.repeat(32);
const LINK = `https://app.lawie.in/verify-email?token=${TOKEN}`;

jest.setTimeout(60_000);

let redis: TestRedis;
let connection: { host: string; port: number; maxRetriesPerRequest: null };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  // Always a private redis-server: the shared dev Redis can sit in MISCONF (RDB snapshot cannot
  // be written), which refuses writes. An unreachable REDIS_URL makes the helper spawn its own.
  process.env.REDIS_URL = 'redis://127.0.0.1:1';
  redis = await acquireRedis();
  process.env.REDIS_URL = redis.url;
  process.env.EMAIL_QUEUE_PREFIX = PREFIX;
  const u = new URL(redis.url);
  connection = { host: u.hostname, port: Number(u.port || 6379), maxRetriesPerRequest: null };
});

afterAll(async () => {
  try {
    const w = await import('../worker');
    await w.stopWorkers();
  } catch {
    /* never loaded */
  }
  await disconnectEmailClient();
  if (redis) {
    await purgePrefix(redis.url, PREFIX);
    await redis.stop();
  }
});

describe('T-223 verify email through real Redis and a real BullMQ worker', () => {
  it('sends once to the minted address; the stored job and logs hold no address, name, token or link', async () => {
    const { startWorkers, stopWorkers } = await import('../worker');
    const send = jest.fn(async () => ({ messageId: 'real-redis-1' }));
    const mint = jest.fn(async () => ({ email: LEAK_ADDRESS, name: LEAK_NAME, link: LINK }));

    const { jobId, queue } = await enqueueEmail({ template: 'auth.verifyEmail', userId: USER_ID });

    // Before any worker runs: the job as stored in Redis.
    const q = new Queue(queue, { connection, prefix: `{${PREFIX}}` });
    try {
      const queued = await q.getJob(jobId);
      expect(queued).toBeTruthy();
      expect(queued!.data.template).toBe('auth.verifyEmail');
      expect(queued!.data.data).toEqual({ userId: USER_ID });
      expect(queued!.data.to).toEqual([]);
      const storedBefore = dump(queued!.data);
      expect(storedBefore).not.toContain('@');
      expect(storedBefore).not.toContain('verify-email?token');

      startWorkers({ connection, send, mint });

      const deadline = Date.now() + 30_000;
      for (;;) {
        const j = await q.getJob(jobId);
        if (j && (await j.getState()) === 'completed') break;
        if (Date.now() > deadline) throw new Error('timed out waiting for the verify job');
        await sleep(100);
      }

      expect(mint).toHaveBeenCalledTimes(1);
      expect(mint).toHaveBeenCalledWith(USER_ID);
      expect(send).toHaveBeenCalledTimes(1);
      const arg = send.mock.calls[0] as unknown as [{ to: string[] }];
      expect(arg[0].to).toEqual([LEAK_ADDRESS]);

      // Re-read from Redis after completion.
      const done = (await q.getJob(jobId))!;
      const stored = dump([done.data, done.failedReason, done.stacktrace, done.returnvalue]);
      for (const s of [LEAK_ADDRESS, 'leak@', LEAK_NAME, 'Zainab', TOKEN, 'verify-email?token']) {
        expect(stored).not.toContain(s);
        expect(allLogText()).not.toContain(s);
      }
      expect(done.failedReason).toBeFalsy();
      await stopWorkers();
    } finally {
      await q.close();
    }
  });

  it('a mint failure keeps the job retrying with a value-free failedReason (no address or link)', async () => {
    const { startWorkers, stopWorkers } = await import('../worker');
    const send = jest.fn(async () => ({ messageId: 'never' }));
    const mint = jest.fn(async () => {
      throw Object.assign(new Error(`boom ${LEAK_ADDRESS} ${LINK}`), { name: 'VerifyMintError' });
    });
    const { jobId, queue } = await enqueueEmail({
      template: 'auth.verifyEmail',
      userId: '64b7f0c2a1b2c3d4e5f60719',
    });
    const q = new Queue(queue, { connection, prefix: `{${PREFIX}}` });
    try {
      startWorkers({ connection, send, mint });
      const deadline = Date.now() + 30_000;
      for (;;) {
        const j = await q.getJob(jobId);
        if (j && j.attemptsMade >= 1) break;
        if (Date.now() > deadline) throw new Error('timed out waiting for a failed attempt');
        await sleep(100);
      }
      await stopWorkers();
      const j = (await q.getJob(jobId))!;
      const stored = dump([j.data, j.failedReason, j.stacktrace]);
      for (const s of [LEAK_ADDRESS, 'leak@', TOKEN, 'verify-email?token']) {
        expect(stored).not.toContain(s);
        expect(allLogText()).not.toContain(s);
      }
      expect(send).not.toHaveBeenCalled();
    } finally {
      await q.close();
    }
  });
});

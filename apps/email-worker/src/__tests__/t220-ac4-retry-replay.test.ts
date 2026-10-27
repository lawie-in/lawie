/**
 * T-220 AC4 evidence, real Redis: a forced provider error makes the job retry
 * (with the client's real backoff), be kept as failed with a clean failedReason,
 * and scripts/replay.ts re-queues it so a dry-run send completes it.
 *
 * Needs Redis: REDIS_TEST_URL if set (loopback), else a redis-server it
 * starts itself. With neither, beforeAll throws and the suite FAILS (no skip).
 * No mail is sent: the failing send is a stub and the replay send is dry-run.
 *
 * Timing: enqueueEmail has no option override, so this uses the real low-tier
 * policy (3 attempts, exponential from 5 s = waits of 5 s and 10 s). The test
 * takes about 17 s.
 */
import { spawn } from 'child_process';
import path from 'path';

import { disconnectEmailClient, enqueueEmail } from '@lawie/email-client';
import { Queue } from 'bullmq';

import { LEAK_ADDRESS, LEAK_NAME, allLogText, dump, parsedLogs } from './helpers/t220-capture';
import { type TestRedis, acquireRedis, purgePrefix } from './helpers/t220-redis';

jest.mock('../config/logger', () =>
  jest.requireActual('./helpers/t220-capture').makeCapturingLogger(),
);
jest.mock('@sentry/node', () => ({ addBreadcrumb: jest.fn(), captureException: jest.fn() }));
jest.mock('../templates', () => ({
  renderTemplate: jest.fn(async (_id: string, data: { name?: string }) => ({
    subject: `Welcome ${data.name}`,
    html: `<p>${data.name}</p>`,
    text: `${data.name}`,
  })),
}));

const PREFIX = `lawie-t220-${process.pid}-${Date.now()}`;
const QUEUE = 'email-low';
const RAW_JOB = 'raw-render-error-job';
const workerRoot = path.resolve(__dirname, '..', '..');

jest.setTimeout(90_000);

let redis: TestRedis;
let connection: { host: string; port: number; maxRetriesPerRequest: null };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<T>(
  fn: () => Promise<T | undefined | false>,
  ms: number,
  what: string,
): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(200);
  }
}

// Poll until the job is in `state`, then return a FRESH copy. getJob() and getState() are two
// separate Redis reads; the job can change state between them (e.g. the last attempt fails), so
// the object read before getState() may be a stale snapshot (attemptsMade one too low). Re-reading
// after the state is confirmed makes the returned fields consistent with that terminal state.
async function untilState(q: Queue, id: string, state: string, ms: number, what: string) {
  return until(
    async () => {
      const j = await q.getJob(id);
      if (!j || (await j.getState()) !== state) return undefined;
      return (await q.getJob(id)) ?? undefined;
    },
    ms,
    what,
  );
}

beforeAll(async () => {
  redis = await acquireRedis(); // throws (suite fails) when no Redis is available
  process.env.REDIS_URL = redis.url;
  process.env.EMAIL_QUEUE_PREFIX = PREFIX; // read lazily by email-client, and at load by env.ts below
  const u = new URL(redis.url);
  connection = { host: u.hostname, port: Number(u.port || 6379), maxRetriesPerRequest: null };
});

afterAll(async () => {
  try {
    const w = await import('../worker');
    await w.stopWorkers();
  } catch {
    /* worker module never loaded */
  }
  await disconnectEmailClient();
  if (redis) {
    await purgePrefix(redis.url, PREFIX);
    await redis.stop();
  }
});

describe('T-220 AC4 retry then keep as failed, then replay (real Redis)', () => {
  it('retries with backoff, keeps the job failed with a clean reason, and replay re-sends it in dry-run', async () => {
    const { startWorkers, stopWorkers } = await import('../worker');
    const { fromSesError } = await import('../providers/safe-log');
    const { sendEmail: dryRunSend } = await import('../providers');

    // ── phase 1: provider always fails ───────────────────────────────────
    const attemptTimes: number[] = [];
    const leaky = Object.assign(new Error(`not verified: ${LEAK_ADDRESS} ${LEAK_NAME}`), {
      name: 'MessageRejected',
      $fault: 'client',
      $metadata: { httpStatusCode: 400 },
    });
    const failing = jest.fn(async (r: { meta?: { jobId?: string } }) => {
      if (r.meta?.jobId === RAW_JOB) throw leaky; // a raw, non-provider error (e.g. render-type) echoing data
      attemptTimes.push(Date.now());
      throw fromSesError(leaky);
    });

    startWorkers({ connection, send: failing });

    const { jobId, queue } = await enqueueEmail({
      template: 'billing.lowCreditWarning',
      to: LEAK_ADDRESS,
      data: { name: LEAK_NAME, userId: '507f1f77bcf86cd799439011' },
    });
    expect(queue).toBe(QUEUE);
    await enqueueEmail({
      template: 'billing.lowCreditWarning',
      to: LEAK_ADDRESS,
      data: { name: LEAK_NAME, userId: 'user-43' },
      idempotencyKey: RAW_JOB,
    });

    const q = new Queue(QUEUE, { connection, prefix: `{${PREFIX}}` });
    try {
      const failed = await untilState(q, jobId, 'failed', 60_000, 'job to exhaust its attempts');

      // the raw-error job also exhausts its attempts; its stored failedReason is the sanitised one
      const rawFailed = await untilState(q, RAW_JOB, 'failed', 30_000, 'raw-error job to fail');
      expect(rawFailed.failedReason).toBe('MessageRejected in email send'); // name only, message dropped
      const rawStored = dump([rawFailed.failedReason, rawFailed.stacktrace]);
      expect(rawStored).not.toContain('leak@');
      expect(rawStored).not.toContain('Zainab');

      expect(attemptTimes).toHaveLength(3);
      expect(failed.opts.attempts).toBe(3);
      expect(failed.attemptsMade).toBe(3);
      // exponential backoff from 5 s: ~5 s then ~10 s (allow timer slack)
      expect(attemptTimes[1] - attemptTimes[0]).toBeGreaterThanOrEqual(4500);
      expect(attemptTimes[2] - attemptTimes[1]).toBeGreaterThanOrEqual(9500);
      // kept, not removed: still in the failed set
      expect(await q.getFailedCount()).toBe(2);
      // failedReason / stacktrace stored in Redis hold no address or name
      expect(failed.failedReason).toMatch(/ses send failed/);
      const stored = dump([failed.failedReason, failed.stacktrace]);
      expect(stored).not.toContain('leak@');
      expect(stored).not.toContain('Zainab');
      // 'Job failed' log fired per failed attempt, clean, with template + job id
      const failedLogs = parsedLogs().filter((l) => l.msg === 'Job failed');
      expect(failedLogs.filter((l) => l.jobId === jobId)).toHaveLength(3);
      expect(failedLogs.find((l) => l.jobId === jobId)).toMatchObject({
        jobId,
        template: 'billing.lowCreditWarning',
      });
      expect(allLogText()).not.toContain('leak@');
      expect(allLogText()).not.toContain('Zainab');

      await stopWorkers();

      // ── phase 2: scripts/replay.ts re-queues it ─────────────────────────
      const replay = await new Promise<{ code: number | null; out: string }>((resolve, reject) => {
        const child = spawn(
          path.join(workerRoot, '..', '..', 'node_modules', '.bin', 'ts-node'),
          ['--transpile-only', 'scripts/replay.ts', QUEUE, String(jobId)],
          {
            cwd: workerRoot,
            env: {
              PATH: process.env.PATH ?? '',
              NODE_ENV: 'test',
              REDIS_URL: redis.url,
              EMAIL_QUEUE_PREFIX: PREFIX,
            },
          },
        );
        let out = '';
        child.stdout.on('data', (d) => (out += d));
        child.stderr.on('data', (d) => (out += d));
        child.once('error', reject);
        child.once('exit', (code) => resolve({ code, out }));
      });
      expect(replay.out).toContain('Retry queued');
      expect(replay.code).toBe(0);
      const requeued = await q.getJob(jobId);
      expect(await requeued?.getState()).toBe('waiting');

      // ── phase 3: a dry-run worker re-sends it ───────────────────────────
      const before = parsedLogs().length;
      startWorkers({ connection, send: dryRunSend }); // EMAIL_PROVIDER=dry-run (setupEnv): no mail
      const done = await untilState(q, jobId, 'completed', 20_000, 'replayed job to complete');
      expect(done.returnvalue).toEqual({ messageId: null });
      const dry = parsedLogs()
        .slice(before)
        .find((l) => String(l.msg).startsWith('Dry-run send'));
      expect(dry).toMatchObject({
        provider: 'dry-run',
        template: 'billing.lowCreditWarning',
        userId: '507f1f77bcf86cd799439011',
        jobId,
      });
      expect(allLogText()).not.toContain('leak@');
      expect(attemptTimes).toHaveLength(3); // the failing provider was not hit again for the replayed job
    } finally {
      await q.close();
    }
  });
});

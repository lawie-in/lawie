/**
 * T-353 AC2 (and the AC3 end to end check): real Redis, real BullMQ Worker.
 * A Worker 'error' event is logged once, safely, and does not become an
 * uncaughtException. A job that fails every attempt gives exactly one Sentry
 * capture. Redis comes from the t220 helper (fails, never skips, without one).
 */
import * as Sentry from '@sentry/node';
import { Queue } from 'bullmq';

import { LEAK_ADDRESS, allLogText, dump, parsedLogs, resetSink } from './helpers/t220-capture';
import { type TestRedis, acquireRedis, purgePrefix } from './helpers/t220-redis';

jest.mock('../config/logger', () =>
  jest.requireActual('./helpers/t220-capture').makeCapturingLogger(),
);
jest.mock('@sentry/node', () => ({ addBreadcrumb: jest.fn(), captureException: jest.fn() }));
jest.mock('../templates', () => ({
  renderTemplate: jest.fn(async () => ({ subject: 's', html: '<p>h</p>', text: 't' })),
}));

const PREFIX = `lawie-t353-${process.pid}-${Date.now()}`;
jest.setTimeout(30_000);

let redis: TestRedis;
let connection: { host: string; port: number; maxRetriesPerRequest: null };

beforeAll(async () => {
  redis = await acquireRedis();
  process.env.REDIS_URL = redis.url;
  process.env.EMAIL_QUEUE_PREFIX = PREFIX;
  const u = new URL(redis.url);
  connection = { host: u.hostname, port: Number(u.port || 6379), maxRetriesPerRequest: null };
});

afterAll(async () => {
  try {
    await (await import('../worker')).stopWorkers();
  } catch {
    /* never loaded */
  }
  if (redis) {
    await purgePrefix(redis.url, PREFIX);
    await redis.stop();
  }
});

beforeEach(() => {
  resetSink();
  jest.clearAllMocks();
});

describe('T-353 AC2 worker error listener', () => {
  it('logs a Worker error safely, once per worker, with no uncaughtException', async () => {
    const { startWorkers, stopWorkers } = await import('../worker');
    const uncaught = jest.fn();
    process.on('uncaughtException', uncaught);
    try {
      const [high] = startWorkers({ connection, send: jest.fn() });
      const err = Object.assign(new Error(`ECONNRESET talking to ${LEAK_ADDRESS}`), {
        code: 'ECONNRESET',
      });
      expect(high.listenerCount('error')).toBeGreaterThan(0);
      high.emit('error', err);
      await new Promise((r) => setImmediate(r));

      const lines = parsedLogs().filter((l) => l.msg === 'Worker error');
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({
        level: 50,
        queue: 'email-high',
        err: { name: 'Error', code: 'ECONNRESET' },
      });
      expect(allLogText()).not.toContain('leak@');
      expect(allLogText()).not.toContain('stack');
      expect(uncaught).not.toHaveBeenCalled();
    } finally {
      process.removeListener('uncaughtException', uncaught);
      await stopWorkers();
    }
  });
});

describe('T-353 AC3 real Redis', () => {
  it('a job failing all attempts gives one Sentry capture, a log and breadcrumb per attempt', async () => {
    const { startWorkers, stopWorkers } = await import('../worker');
    const send = jest.fn(async () => {
      throw new Error(`rejected ${LEAK_ADDRESS}`);
    });
    const q = new Queue('email-low', { connection, prefix: `{${PREFIX}}` });
    try {
      startWorkers({ connection, send });
      const job = await q.add(
        'send',
        { template: 'auth.welcome', to: [LEAK_ADDRESS], cc: [], bcc: [], data: {} },
        { attempts: 3, backoff: { type: 'fixed', delay: 100 } },
      );
      const end = Date.now() + 15_000;
      for (;;) {
        const j = await q.getJob(job.id!);
        if (j && (await j.getState()) === 'failed') break;
        if (Date.now() > end) throw new Error('job did not fail in time');
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(send).toHaveBeenCalledTimes(3);
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      expect(
        (Sentry.addBreadcrumb as jest.Mock).mock.calls.filter(
          (c) => c[0].category === 'email.send.failure',
        ),
      ).toHaveLength(3);
      const sendFailed = parsedLogs().filter((l) => l.msg === 'Email send failed');
      expect(sendFailed.map((l) => l.finalAttempt)).toEqual([false, false, true]);
      expect(dump((Sentry.captureException as jest.Mock).mock.calls)).not.toContain('leak@');
      expect(allLogText()).not.toContain('leak@');
    } finally {
      await stopWorkers();
      await q.close();
    }
  });
});

/**
 * T-223 review round 2 / T-379, real Redis and a real BullMQ worker in LIVE mode (EMAIL_PROVIDER=ses,
 * EMAIL_DRY_RUN=false, dummy keys; the provider send is a stub, nothing is sent).
 * While the static footer of auth.verifyEmail still has [registered address] / [PIN]:
 *  - startWorkers starts nothing (returns []), so the job stays queued ("waiting"), not failed;
 *  - mint is never called (the user's verify token is not rotated), send is never called;
 *  - no Sentry event, and the stored job and the logs hold no address, name, link or footer text.
 * With the footer check stubbed to "filled", the same live mode completes a job and sends once.
 *
 * Runs against an existing Redis if it accepts writes (CI service), else a private redis-server.
 */
import { disconnectEmailClient, enqueueEmail } from '@lawie/email-client';
import * as Sentry from '@sentry/node';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

import { LEAK_ADDRESS, LEAK_NAME, SES_ENV, allLogText, dump } from './helpers/t220-capture';
import { type TestRedis, acquireRedis, purgePrefix } from './helpers/t220-redis';
import { renderReal, type RealRendered } from './helpers/t223-real-render';

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

const PREFIX = `lawie-t223p-${process.pid}-${Date.now()}`;
const USER_ID = '64b7f0c2a1b2c3d4e5f60718';
const TOKEN = 'ef'.repeat(32);
const LINK = `https://app.lawie.in/verify-email?token=${TOKEN}`;

jest.setTimeout(60_000);

/**
 * Existing Redis first (REDIS_URL, else 127.0.0.1:6379; CI service container): it must answer PING
 * and accept a write (a probe key with a short TTL; a Redis in MISCONF answers PING but refuses
 * writes). Otherwise a private redis-server through the shared helper. If neither exists this
 * throws, so the suite FAILS rather than skips. Everything the test writes lives under its own
 * unique queue prefix, and only that prefix is purged.
 */
async function acquireUsableRedis(): Promise<TestRedis> {
  const candidate = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  const probe = new Redis(candidate, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
    connectTimeout: 1500,
  });
  probe.on('error', () => undefined);
  try {
    await probe.connect();
    const key = `${PREFIX}:probe`;
    await probe.set(key, '1', 'EX', 5);
    await probe.del(key);
    return { url: candidate, source: 'REDIS_URL', stop: async () => undefined };
  } catch {
    // not usable: fall through to a private server
  } finally {
    probe.disconnect();
  }
  process.env.REDIS_URL = 'redis://127.0.0.1:1'; // unreachable, so the helper spawns its own
  try {
    return await acquireRedis();
  } catch (e) {
    throw new Error(
      `The T-223 real Redis test needs a Redis: none is usable at ${candidate} (no PING, or writes refused, e.g. MISCONF) and redis-server could not be started (${(e as Error).message}). This test fails rather than skips.`,
    );
  }
}

let redis: TestRedis;
let connection: { host: string; port: number; maxRetriesPerRequest: null };
let real: RealRendered;
const saved: Record<string, string | undefined> = {};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  real = renderReal('auth.verifyEmail', { name: LEAK_NAME, verifyUrl: LINK, userId: USER_ID });
  redis = await acquireUsableRedis();
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
});

afterAll(async () => {
  try {
    await (await import('../worker')).stopWorkers();
  } catch {
    /* never loaded */
  }
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

async function waitFor(q: Queue, jobId: string, state: 'failed' | 'completed' | 'waiting') {
  const deadline = Date.now() + 30_000;
  for (;;) {
    const j = await q.getJob(jobId);
    if (j && (await j.getState()) === state) return j;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${state}`);
    await sleep(100);
  }
}

describe('T-223 placeholder guard through real Redis, live mode', () => {
  it('worker really runs live in this file', async () => {
    const { isLiveSend } = await import('../placeholders');
    expect(isLiveSend()).toBe(true);
  });

  it('unfilled footer: startWorkers starts nothing, the job stays waiting, mint/send never called, no Sentry, no PII', async () => {
    const { startWorkers, stopWorkers, workers } = await import('../worker');
    const send = jest.fn(async () => ({ messageId: 'never' }));
    const mint = jest.fn(async () => ({ email: LEAK_ADDRESS, name: LEAK_NAME, link: LINK }));
    mockRender.mockResolvedValue(real);
    mockFooterFilled = false;

    const { jobId, queue } = await enqueueEmail({ template: 'auth.verifyEmail', userId: USER_ID });
    const q = new Queue(queue, { connection, prefix: `{${PREFIX}}` });
    try {
      const started = startWorkers({ connection, send, mint });
      expect(started).toEqual([]);
      expect(workers).toHaveLength(0);
      // Leave time for a (wrongly) started worker to pick the job up.
      await sleep(1500);
      const after = (await q.getJob(jobId))!;

      expect(await after.getState()).toBe('waiting');
      expect(after.attemptsMade).toBe(0);
      expect(after.failedReason).toBeFalsy();
      expect(mint).toHaveBeenCalledTimes(0);
      expect(send).not.toHaveBeenCalled();
      expect(Sentry.captureException as jest.Mock).not.toHaveBeenCalled();
      expect(Sentry.captureMessage as jest.Mock).not.toHaveBeenCalled();

      const stored = dump([after.data, after.failedReason, after.stacktrace, after.returnvalue]);
      const logs = allLogText();
      expect(logs).toContain('Workers not started');
      for (const s of [
        LEAK_ADDRESS,
        'leak@',
        LEAK_NAME,
        'Zainab',
        TOKEN,
        'verify-email?token',
        '[registered address]',
        '[PIN]',
        'Patna',
      ]) {
        expect(stored).not.toContain(s);
        expect(logs).not.toContain(s);
        expect(dump((Sentry.addBreadcrumb as jest.Mock).mock.calls)).not.toContain(s);
      }
      await after.remove(); // keep it away from the next test's worker
    } finally {
      await stopWorkers();
      await q.close();
    }
  });

  it('with the footer check stubbed to filled, the same live mode completes and sends once', async () => {
    const { startWorkers, stopWorkers } = await import('../worker');
    const send = jest.fn(async () => ({ messageId: 'live-ok' }));
    const mint = jest.fn(async () => ({ email: LEAK_ADDRESS, name: LEAK_NAME, link: LINK }));
    mockRender.mockResolvedValue({ subject: 'Verify', html: '<p>filled</p>', text: 'filled' });
    mockFooterFilled = true;

    const { jobId, queue } = await enqueueEmail({
      template: 'auth.verifyEmail',
      userId: '64b7f0c2a1b2c3d4e5f60719',
    });
    const q = new Queue(queue, { connection, prefix: `{${PREFIX}}` });
    try {
      startWorkers({ connection, send, mint });
      const done = await waitFor(q, jobId, 'completed');
      expect(send).toHaveBeenCalledTimes(1);
      expect(mint).toHaveBeenCalledTimes(1);
      expect(done.returnvalue).toEqual({ messageId: 'live-ok' });
    } finally {
      mockFooterFilled = false;
      await stopWorkers();
      await q.close();
    }
  });
});

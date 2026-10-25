/**
 * Test helper (import right after ./setupEnv, before the app). Picks the Redis the real-Redis test
 * runs against, synchronously, before the app reads REDIS_URL (T-379, Arjun's rule: tests never
 * touch a hosted Redis, prefix or not):
 *  1. REDIS_TEST_URL, if set. It must be a loopback URL (localhost / 127.0.0.1 / ::1), answer PING
 *     and accept a write (a Redis in MISCONF answers PING but refuses writes). If it is set and
 *     not usable this module THROWS; it does not fall back silently.
 *  2. Otherwise a private redis-server on a loopback port with persistence off, if the binary is
 *     installed. Stopped by stopPrivateRedis() in afterAll.
 *  3. Otherwise this module throws (the suite FAILS, it never skips).
 * REDIS_URL is NEVER read to choose the server; it is only SET to the chosen URL for the code under
 * test. The test only touches per-user keys it created and deletes them; it never flushes anything.
 */
import { type ChildProcess, spawn, spawnSync } from 'child_process';
import os from 'os';

const RUN_ID = `t223-probe-${process.pid}-${Date.now()}`;

// Runs in a child node process so the check can stay synchronous.
const PROBE_SCRIPT = `
const Redis = require(process.env.T223_IOREDIS);
const r = new Redis(process.env.T223_URL, {
  lazyConnect: true, maxRetriesPerRequest: 0, retryStrategy: () => null, connectTimeout: 1500,
});
r.on('error', () => undefined);
const timer = setTimeout(() => process.exit(1), 4000);
(async () => {
  await r.connect();
  if ((await r.ping()) !== 'PONG') throw new Error('no PONG');
  await r.set(process.env.T223_KEY, '1', 'EX', 5);
  await r.del(process.env.T223_KEY);
  clearTimeout(timer);
  r.disconnect();
  process.exit(0);
})().catch(() => process.exit(1));
`;

function usableRedis(url: string): boolean {
  const res = spawnSync(process.execPath, ['-e', PROBE_SCRIPT], {
    stdio: 'ignore',
    timeout: 8000,
    env: {
      ...process.env,
      T223_IOREDIS: require.resolve('ioredis'),
      T223_URL: url,
      T223_KEY: RUN_ID,
    },
  });
  return res.status === 0;
}

export function hasRedisServer(): boolean {
  return spawnSync('redis-server', ['--version'], { stdio: 'ignore' }).status === 0;
}

export interface PickedRedis {
  url: string;
  source: 'REDIS_TEST_URL' | 'spawned redis-server';
  child?: ChildProcess;
}

function isLoopback(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]';
  } catch {
    return false;
  }
}

let spawnCount = 0;

/** Picks a Redis from `env` (only REDIS_TEST_URL is read). Synchronous; throws if none. */
export function pickRedis(env: { REDIS_TEST_URL?: string } = process.env): PickedRedis {
  const configured = env.REDIS_TEST_URL;
  if (configured) {
    if (!isLoopback(configured) || !usableRedis(configured)) {
      throw new Error(
        'REDIS_TEST_URL is set but is not a usable loopback Redis (no PING, writes refused, or not loopback). Tests never use a hosted Redis. Unset it to spawn a local redis-server.',
      );
    }
    return { url: configured, source: 'REDIS_TEST_URL' };
  }
  if (!hasRedisServer()) {
    throw new Error(
      'The real Redis test needs a Redis: REDIS_TEST_URL is unset and redis-server is not installed to start a private one. In CI the job sets REDIS_TEST_URL to its redis service.',
    );
  }
  const port = 20_000 + ((process.pid + spawnCount++ * 97) % 20_000);
  const child = spawn(
    'redis-server',
    [
      '--port',
      String(port),
      '--bind',
      '127.0.0.1',
      '--save',
      '',
      '--appendonly',
      'no',
      '--dir',
      os.tmpdir(),
    ],
    { stdio: 'ignore' },
  );
  child.on('error', () => undefined);
  return { url: `redis://127.0.0.1:${port}`, source: 'spawned redis-server', child };
}

const picked = pickRedis();
const child = picked.child;
process.env.REDIS_URL = picked.url;

export const REAL_REDIS_URL = picked.url;
export const REAL_REDIS_SOURCE = picked.source;

export function stopPrivateRedis(): void {
  if (child && child.exitCode === null) child.kill('SIGTERM');
}

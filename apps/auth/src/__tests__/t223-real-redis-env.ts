/**
 * Test helper (import right after ./setupEnv, before the app). Picks the Redis the real-Redis test
 * runs against, synchronously, before the app reads REDIS_URL:
 *  1. An existing Redis: REDIS_URL if set, else redis://127.0.0.1:6379 (CI service container, or a
 *     local one). It must answer PING and accept a write (SET of a probe key with a short TTL; a
 *     Redis in MISCONF answers PING but refuses writes, so it is not usable).
 *  2. Otherwise a private redis-server on a free loopback port with persistence off, if the binary
 *     is installed. Stopped by stopPrivateRedis() in afterAll.
 *  3. Otherwise this module throws (the suite FAILS, it never skips).
 * The test only touches per-user keys it created and deletes them; it never flushes anything.
 */
import { type ChildProcess, spawn, spawnSync } from 'child_process';
import os from 'os';

const DEFAULT_URL = 'redis://127.0.0.1:6379';
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

function hasRedisServer(): boolean {
  return spawnSync('redis-server', ['--version'], { stdio: 'ignore' }).status === 0;
}

let child: ChildProcess | undefined;
const existingUrl = process.env.REDIS_URL || DEFAULT_URL;

if (usableRedis(existingUrl)) {
  process.env.REDIS_URL = existingUrl;
} else if (hasRedisServer()) {
  const port = 20_000 + (process.pid % 20_000);
  child = spawn(
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
  process.env.REDIS_URL = `redis://127.0.0.1:${port}`;
} else {
  throw new Error(
    `The T-223 real Redis test needs a Redis: none is usable at ${existingUrl} (no PING, or writes are refused, e.g. MISCONF) and redis-server is not installed to start a private one. In CI the test-auth job provides a redis service on 6379.`,
  );
}

export const REAL_REDIS_URL = process.env.REDIS_URL;

export function stopPrivateRedis(): void {
  if (child && child.exitCode === null) child.kill('SIGTERM');
}

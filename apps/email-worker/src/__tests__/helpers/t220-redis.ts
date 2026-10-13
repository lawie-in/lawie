/**
 * Real-Redis helper for T-220 AC4. Uses the Redis at process.env.REDIS_URL if
 * it answers PING within 1.5 s (CI service container), otherwise starts its own
 * redis-server on a free loopback port. If neither works it THROWS (the suite
 * fails; it never skips).
 *
 * NB: src/__tests__/setupEnv.ts overwrites REDIS_URL with redis://localhost:6379
 * before every test file, so inside Jest a remote REDIS_URL from the shell is
 * never reached. Only a loopback Redis is used here, and every key is under a
 * unique queue prefix that is deleted afterwards.
 */
import { type ChildProcess, spawn } from 'child_process';
import net from 'net';
import os from 'os';

import Redis from 'ioredis';

export interface TestRedis {
  url: string;
  source: 'REDIS_URL' | 'spawned redis-server';
  stop: () => Promise<void>;
}

function isLoopback(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]';
  } catch {
    return false;
  }
}

async function ping(url: string, timeoutMs: number): Promise<boolean> {
  const r = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
    connectTimeout: timeoutMs,
  });
  r.on('error', () => undefined);
  try {
    await Promise.race([
      (async () => {
        await r.connect();
        return r.ping();
      })(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    r.disconnect();
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => resolve(port));
    });
  });
}

export async function acquireRedis(): Promise<TestRedis> {
  const configured = process.env.REDIS_URL;
  if (configured && isLoopback(configured) && (await ping(configured, 1500))) {
    return { url: configured, source: 'REDIS_URL', stop: async () => undefined };
  }

  const port = await freePort();
  const child: ChildProcess = spawn(
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
  let spawnError: Error | undefined;
  child.once('error', (e) => (spawnError = e));
  const url = `redis://127.0.0.1:${port}`;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (spawnError) break;
    if (await ping(url, 500)) {
      return {
        url,
        source: 'spawned redis-server',
        stop: async () => {
          child.kill('SIGTERM');
          await new Promise((r) => (child.exitCode !== null ? r(null) : child.once('exit', r)));
        },
      };
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  child.kill('SIGKILL');
  throw new Error(
    'T-220 AC4 needs a real Redis and none is available: REDIS_URL (' +
      (configured ? 'set but not reachable on loopback' : 'unset') +
      ') did not answer and redis-server could not be started' +
      (spawnError ? ` (${spawnError.message})` : '') +
      '. In CI add a redis service to test-email-worker. This test fails rather than skips.',
  );
}

/** Delete every key under the `{prefix}` BullMQ namespace. */
export async function purgePrefix(url: string, prefix: string): Promise<void> {
  const r = new Redis(url);
  try {
    const keys = await r.keys(`{${prefix}}*`);
    if (keys.length > 0) await r.del(...keys);
  } finally {
    await r.quit();
  }
}

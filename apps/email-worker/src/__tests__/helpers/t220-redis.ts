/**
 * The ONE shared real-Redis picker for the email-worker tests (T-379, Arjun's rule: tests never
 * touch a hosted Redis, prefix or not).
 *  1. REDIS_TEST_URL, if set: must be a loopback URL that answers PING within 1.5 s and accepts a
 *     write (a Redis in MISCONF answers PING but refuses writes). If it is set and unusable this
 *     THROWS; it never falls back silently.
 *  2. Otherwise a private redis-server on a free loopback port.
 *  3. If neither works it THROWS (the suite fails; it never skips).
 * REDIS_URL is never read to choose the server. Tests may still SET process.env.REDIS_URL to the
 * chosen URL for the code under test. Every key is under a unique queue prefix that is purged.
 */
import { type ChildProcess, spawn } from 'child_process';
import net from 'net';
import os from 'os';

import Redis from 'ioredis';

export interface TestRedis {
  url: string;
  source: 'REDIS_TEST_URL' | 'spawned redis-server';
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

async function ping(url: string, timeoutMs: number, writeProbe = false): Promise<boolean> {
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
        await r.ping();
        if (writeProbe) {
          const key = `t220-probe-${process.pid}-${Date.now()}`;
          await r.set(key, '1', 'EX', 5);
          await r.del(key);
        }
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

export async function acquireRedis(
  env: { REDIS_TEST_URL?: string } = process.env,
): Promise<TestRedis> {
  const configured = env.REDIS_TEST_URL;
  if (configured) {
    if (isLoopback(configured) && (await ping(configured, 1500, true))) {
      return { url: configured, source: 'REDIS_TEST_URL', stop: async () => undefined };
    }
    throw new Error(
      'REDIS_TEST_URL is set but is not a usable loopback Redis (no PING, writes refused, or not loopback). Tests never use a hosted Redis. Unset it to spawn a local redis-server.',
    );
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
    'The real Redis tests need a Redis and none is available: REDIS_TEST_URL is unset and redis-server could not be started' +
      (spawnError ? ` (${spawnError.message})` : '') +
      '. In CI set REDIS_TEST_URL to the redis service. This test fails rather than skips.',
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

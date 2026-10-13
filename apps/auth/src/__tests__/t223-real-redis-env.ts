/**
 * Test helper (import right after ./setupEnv, before the app): starts a private redis-server on a
 * loopback port with persistence off and points REDIS_URL at it. The shared dev Redis on 6379 can
 * sit in MISCONF (RDB snapshot cannot be written), which refuses every write and made the real
 * Redis cap test flaky. Call stopPrivateRedis() in afterAll.
 */
import { type ChildProcess, spawn, spawnSync } from 'child_process';
import os from 'os';

const port = 20_000 + (process.pid % 20_000);
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
child.on('error', () => undefined);
process.env.REDIS_URL = `redis://127.0.0.1:${port}`;

export const PRIVATE_REDIS_URL = process.env.REDIS_URL;

export function stopPrivateRedis(): void {
  if (child.exitCode === null) child.kill('SIGTERM');
}

// Fail loudly (not skip) if redis-server is missing.
const probe = spawnSync('redis-server', ['--version'], { stdio: 'ignore' });
if (probe.status !== 0) throw new Error('redis-server is required for the T-223 real Redis test');

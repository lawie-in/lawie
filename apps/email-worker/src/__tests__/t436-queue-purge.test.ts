/**
 * T-436 AC10 (round 2): scripts/queue-purge.ts against a private real Redis (helpers/t220-redis,
 * never REDIS_URL / a hosted Redis) and real BullMQ. Nothing is sent: workers used to put jobs in
 * `active` / `failed` run stub processors.
 *
 * main() (exit codes, printed output) is run as a child process, as the billing backfill test does.
 */
import { spawn } from 'child_process';
import net from 'net';
import os from 'os';
import { existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';

import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

import { WORKER_QUEUE_NAMES, bullPrefix } from '../queues';
import {
  PURGE_STATES,
  VERIFY_TEMPLATE,
  formatResult,
  parseArgs,
  purgeHeldVerifyJobs,
  redactRedisUrl,
} from '../../scripts/queue-purge';

import { type AuthProxy, createAuthProxy } from './helpers/t436-auth-proxy';
import { CLEAN_REDIS, fuzzCases, redisCases } from './helpers/t436-redaction-cases';
import { type TestRedis, acquireRedis, purgePrefix } from './helpers/t220-redis';

jest.setTimeout(60_000);

const VANISH = join(__dirname, 'helpers', 't436-vanish.js');
const NOISE = join(__dirname, 'helpers', 't436-console-noise.js');
const SCRIPT = join(__dirname, '..', '..', 'scripts', 'queue-purge.ts');
const USER = (n: number) => `64b7f0c2a1b2c3d4e5f6${String(n).padStart(4, '0')}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let redis: TestRedis;
let bull: { host: string; port: number; maxRetriesPerRequest: null };
let seq = 0;
let rawPrefix: string;
let prefix: string;
const opened: Array<{ close: (force?: boolean) => Promise<void> }> = [];
let admin: Redis;

const queue = (name: string): Queue => {
  const q = new Queue(name, { connection: bull, prefix });
  opened.push(q);
  return q;
};

const verifyData = (userId: string) => ({
  template: VERIFY_TEMPLATE,
  to: [] as string[],
  cc: [] as string[],
  bcc: [] as string[],
  data: { userId },
});

/** A verify job as the email client adds it: explicit id and the T-390 dedupe id. */
async function addVerify(q: Queue, userId: string, opts: Record<string, unknown> = {}) {
  return q.add(VERIFY_TEMPLATE, verifyData(userId), {
    jobId: `verify-job-${userId}`,
    deduplication: { id: `verify:${userId}` },
    attempts: 5,
    ...opts,
  });
}

const dedupeKey = (name: string, userId: string) => `${prefix}:${name}:de:verify:${userId}`;

beforeAll(async () => {
  redis = await acquireRedis();
  const u = new URL(redis.url);
  bull = { host: u.hostname, port: Number(u.port), maxRetriesPerRequest: null };
  admin = new Redis(redis.url);
});

beforeEach(() => {
  seq += 1;
  rawPrefix = `lawie-t436purge-${process.pid}-${Date.now()}-${seq}`;
  prefix = `{${rawPrefix}}`;
});

afterEach(async () => {
  for (const o of opened.splice(0)) await o.close(true).catch(() => undefined);
  await purgePrefix(redis.url, rawPrefix);
});

afterAll(async () => {
  await admin.quit();
  await redis.stop();
});

async function purge(apply: boolean, names: readonly string[] = WORKER_QUEUE_NAMES) {
  const conn = new Redis(redis.url, { maxRetriesPerRequest: null });
  try {
    return await purgeHeldVerifyJobs({
      connection: conn as never,
      prefix,
      apply,
      queueNames: names,
    });
  } finally {
    await conn.quit();
  }
}

function runScript(
  args: string[],
  envOverride: Record<string, string> = {},
  preload: string[] = [],
) {
  return new Promise<{ code: number | null; out: string; err: string }>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        ...preload.flatMap((p) => ['-r', p]),
        require.resolve('ts-node/dist/bin.js'),
        '--transpile-only',
        SCRIPT,
        ...args,
      ],
      {
        env: {
          ...process.env,
          REDIS_URL: redis.url,
          EMAIL_QUEUE_PREFIX: rawPrefix,
          ...envOverride,
        },
      },
    );
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

/** Starts a worker whose processor blocks until release(); resolves once `n` jobs are active. */
async function blockingWorker(name: string, n: number) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const w = new Worker(name, async () => gate, {
    connection: bull,
    prefix,
    concurrency: n,
    lockDuration: 60_000,
  });
  w.on('error', () => undefined);
  w.on('failed', () => undefined);
  opened.push(w);
  let active = 0;
  await new Promise<void>((resolve) => {
    w.on('active', () => {
      active += 1;
      if (active >= n) resolve();
    });
  });
  return { worker: w, release };
}

describe('purgeHeldVerifyJobs (real Redis)', () => {
  it('dry run counts every held state and removes nothing', async () => {
    const high = queue('email-high');
    await addVerify(high, USER(1));
    await addVerify(high, USER(2), { delay: 3_600_000 });
    await addVerify(high, USER(3), { priority: 5 });

    const r = await purge(false);
    const q = r.queues.find((x) => x.queue === 'email-high')!;
    expect(q.found.wait).toBe(1);
    expect(q.found.delayed).toBe(1);
    expect(q.found.prioritized).toBe(1);
    expect(r.totalFound).toBe(3);
    expect(r.totalRemoved).toBe(0);
    expect(await high.getJobCountByTypes('wait', 'delayed', 'prioritized')).toBe(3);
    expect(await admin.get(dedupeKey('email-high', USER(1)))).not.toBeNull();
  });

  it('--yes removes verify jobs in wait, delayed and prioritized, on both queues', async () => {
    const high = queue('email-high');
    const low = queue('email-low');
    await addVerify(high, USER(1));
    await addVerify(high, USER(2), { delay: 3_600_000 });
    await addVerify(high, USER(3), { priority: 5 });
    // The worker's two queues are both swept, even for a (misrouted) verify job on email-low.
    await addVerify(low, USER(4));

    const r = await purge(true);
    expect(r.totalFound).toBe(4);
    expect(r.totalRemoved).toBe(4);
    expect(r.totalLockedActive).toBe(0);
    expect(await high.getJobCountByTypes('wait', 'delayed', 'prioritized', 'paused')).toBe(0);
    expect(await low.getJobCountByTypes('wait', 'delayed', 'prioritized', 'paused')).toBe(0);
    expect(r.queues.map((x) => x.queue)).toEqual(['email-high', 'email-low']);
  });

  it('--yes removes verify jobs in the paused state', async () => {
    const high = queue('email-high');
    await high.pause();
    await addVerify(high, USER(1));
    await addVerify(high, USER(2));
    expect(await high.getJobCountByTypes('paused')).toBe(2);

    const dry = await purge(false);
    expect(dry.queues[0].found.paused).toBe(2);
    expect(await high.getJobCountByTypes('paused')).toBe(2);

    const r = await purge(true);
    expect(r.queues[0].found.paused).toBe(2);
    expect(r.totalRemoved).toBe(2);
    expect(await high.getJobCountByTypes('paused')).toBe(0);
  });

  it('removes a delayed retry-backoff job (a verify job that failed an attempt)', async () => {
    const high = queue('email-high');
    await addVerify(high, USER(1), { attempts: 3, backoff: { type: 'fixed', delay: 3_600_000 } });
    const w = new Worker(
      'email-high',
      async () => {
        throw new Error('boom');
      },
      { connection: bull, prefix },
    );
    w.on('error', () => undefined);
    w.on('failed', () => undefined);
    opened.push(w);
    for (let i = 0; i < 100 && (await high.getJobCountByTypes('delayed')) === 0; i += 1) {
      await sleep(50);
    }
    await w.close(true);
    expect(await high.getJobCountByTypes('delayed')).toBe(1);

    const r = await purge(true);
    expect(r.queues[0].found.delayed).toBe(1);
    expect(r.totalRemoved).toBe(1);
    expect(await high.getJobCountByTypes('delayed', 'wait', 'failed')).toBe(0);
  });

  it('--yes removes a stalled active job (no worker holds its lock)', async () => {
    const high = queue('email-high');
    const job = await addVerify(high, USER(1));
    const { release } = await blockingWorker('email-high', 1);
    expect(await job.getState()).toBe('active');
    // Simulate the worker having died: its lock is gone, the job is still in the active list.
    await admin.del(`${prefix}:email-high:${job.id}:lock`);

    const dry = await purge(false);
    expect(dry.queues[0].found.active).toBe(1);
    expect(await high.getJob(String(job.id))).toBeDefined();

    const r = await purge(true);
    expect(r.queues[0].found.active).toBe(1);
    expect(r.totalRemoved).toBe(1);
    expect(r.totalLockedActive).toBe(0);
    expect(await high.getJob(String(job.id))).toBeUndefined();
    release();
  });

  it('a locked active job is counted, not removed', async () => {
    const high = queue('email-high');
    const job = await addVerify(high, USER(1));
    await addVerify(high, USER(2));
    const { release } = await blockingWorker('email-high', 1);
    expect(await job.getState()).toBe('active');

    const r = await purge(true);
    expect(r.totalFound).toBe(2);
    expect(r.totalRemoved).toBe(1); // the waiting one
    expect(r.totalLockedActive).toBe(1);
    expect(await high.getJob(String(job.id))).toBeDefined();
    expect(await job.getState()).toBe('active');
    release();
  });

  it('keeps failed verify jobs and counts them as kept', async () => {
    const high = queue('email-high');
    await addVerify(high, USER(1), { attempts: 1 });
    const w = new Worker(
      'email-high',
      async () => {
        throw new Error('boom');
      },
      { connection: bull, prefix },
    );
    w.on('error', () => undefined);
    w.on('failed', () => undefined);
    opened.push(w);
    for (let i = 0; i < 100 && (await high.getJobCountByTypes('failed')) === 0; i += 1) {
      await sleep(50);
    }
    await w.close(true);
    expect(await high.getJobCountByTypes('failed')).toBe(1);

    const r = await purge(true);
    expect(r.totalFailedKept).toBe(1);
    expect(r.totalFound).toBe(0);
    expect(r.totalRemoved).toBe(0);
    expect(await high.getJobCountByTypes('failed')).toBe(1);
  });

  it('never touches other templates, or jobs that only half-match', async () => {
    const high = queue('email-high');
    const low = queue('email-low');
    await high.add('billing.subscriptionConfirmed', {
      template: 'billing.subscriptionConfirmed',
      to: ['a@example.com'],
      data: {},
    });
    await high.add(
      'billing.paymentFailed',
      {
        template: 'billing.paymentFailed',
        to: ['a@example.com'],
        data: {},
      },
      { delay: 3_600_000 },
    );
    await low.add('auth.welcome', { template: 'auth.welcome', to: ['a@example.com'], data: {} });
    // name matches, template does not / template matches, name does not
    await high.add(VERIFY_TEMPLATE, { template: 'auth.welcome', to: [], data: {} });
    await high.add('auth.welcome', verifyData(USER(9)));
    await addVerify(high, USER(1));

    const r = await purge(true);
    expect(r.totalFound).toBe(1);
    expect(r.totalRemoved).toBe(1);
    expect(await high.getJobCountByTypes('wait', 'delayed')).toBe(4);
    expect(await low.getJobCountByTypes('wait')).toBe(1);
  });

  it('clears the T-390 dedupe key so the next enqueueEmail is not deduped', async () => {
    const saved = { url: process.env.REDIS_URL, prefix: process.env.EMAIL_QUEUE_PREFIX };
    process.env.REDIS_URL = redis.url;
    process.env.EMAIL_QUEUE_PREFIX = rawPrefix;
    const { enqueueEmail, disconnectEmailClient } = await import('@lawie/email-client');
    try {
      const first = await enqueueEmail({ template: 'auth.verifyEmail', userId: USER(1) });
      expect(first.deduped).toBe(false);
      expect((await enqueueEmail({ template: 'auth.verifyEmail', userId: USER(1) })).deduped).toBe(
        true,
      );
      expect(await admin.get(dedupeKey('email-high', USER(1)))).toBe(first.jobId);

      const r = await purge(true);
      expect(r.totalRemoved).toBe(1);
      expect(await admin.get(dedupeKey('email-high', USER(1)))).toBeNull();

      const again = await enqueueEmail({ template: 'auth.verifyEmail', userId: USER(1) });
      expect(again.deduped).toBe(false);
      expect(again.jobId).not.toBe(first.jobId);
    } finally {
      await disconnectEmailClient();
      if (saved.url === undefined) delete process.env.REDIS_URL;
      else process.env.REDIS_URL = saved.url;
      if (saved.prefix === undefined) delete process.env.EMAIL_QUEUE_PREFIX;
      else process.env.EMAIL_QUEUE_PREFIX = saved.prefix;
    }
  });

  it('pages through more jobs than one page (500)', async () => {
    const high = queue('email-high');
    const bulk = Array.from({ length: 520 }, (_, i) => ({
      name: VERIFY_TEMPLATE,
      data: verifyData(USER(i)),
      opts: { jobId: `bulk-${i}` },
    }));
    await high.addBulk(bulk);
    const r = await purge(true);
    expect(r.totalFound).toBe(520);
    expect(r.totalRemoved).toBe(520);
    expect(await high.getJobCountByTypes('wait')).toBe(0);
  });
});

describe('queue-purge main() as a child process', () => {
  it('dry run (default and --dry-run): prints counts, exits 0, removes nothing, no ids', async () => {
    const high = queue('email-high');
    await addVerify(high, USER(1));
    await addVerify(high, USER(2), { delay: 3_600_000 });

    for (const args of [[], ['--dry-run']]) {
      const { code, out, err } = await runScript(args);
      expect(code).toBe(0);
      expect(out).toContain('total held verify jobs: 2');
      expect(out).toContain('Dry run: nothing removed');
      expect(out).not.toContain('total removed');
      expect(`${out}${err}`).not.toContain(USER(1));
      expect(`${out}${err}`).not.toContain(`verify-job-${USER(1)}`);
      expect(await high.getJobCountByTypes('wait', 'delayed')).toBe(2);
    }
  });

  describe('against a private Redis that requires a password', () => {
    let proxy: AuthProxy;
    let authedPort: number;
    const PW = 's3cr3t-pw-XYZ';

    beforeAll(async () => {
      // a password gate in front of the shared Redis (CI has no redis-server binary to spawn)
      proxy = await createAuthProxy(redis.url, PW);
      authedPort = proxy.port;
    });

    afterAll(async () => {
      await proxy.close();
    });

    it('--yes removes, exits 0, and prints counts only (no user id, job id, credentials)', async () => {
      const authedUrl = `redis://svc-user:${PW}@127.0.0.1:${authedPort}`;
      // requirepass sets the password of the `default` user.
      const url = authedUrl.replace('svc-user', 'default');
      const conn = {
        host: '127.0.0.1',
        port: authedPort,
        password: PW,
        maxRetriesPerRequest: null,
      };
      const q = new Queue('email-high', { connection: conn, prefix });
      opened.push(q);
      await addVerify(q, USER(1));
      await addVerify(q, USER(2), { delay: 3_600_000 });

      const { code, out, err } = await runScript(['--yes'], { REDIS_URL: url });
      const all = `${out}\n${err}`;
      expect(code).toBe(0);
      expect(out).toContain('total removed: 2');
      expect(out).toContain(`redis://127.0.0.1:${authedPort}`);
      for (const secret of ['default:', PW, USER(1), USER(2), 'verify-job-']) {
        expect(all).not.toContain(secret);
      }
      expect(await q.getJobCountByTypes('wait', 'delayed')).toBe(0);
    });

    const STOPPED = /^Purge stopped: cannot use Redis at redis:\/\/127\.0\.0\.1:\d+ \((\w+)\)$/;
    const expectFailFast = (
      r: { code: number | null; out: string; err: string },
      secrets: string[],
    ) => {
      expect(r.code).toBe(1);
      const stopped = r.err.split('\n').filter((l) => l.includes('stopped'));
      expect(stopped).toHaveLength(1);
      expect(stopped[0]).toMatch(STOPPED);
      // nothing but our own lines: no stack frames, no raw error objects
      expect(r.err.split('\n').filter((l) => l.trim() !== '')).toHaveLength(1);
      expect(`${r.out}\n${r.err}`).not.toMatch(/^\s+at /m);
      expect(`${r.out}\n${r.err}`).not.toContain('command:');
      for (const secret of secrets) expect(`${r.out}\n${r.err}`).not.toContain(secret);
      expect(r.out).not.toContain('total ');
    };

    it('wrong password: one redacted stopped line, exit 1, no password or user', async () => {
      for (const args of [[], ['--yes']]) {
        const r = await runScript(args, {
          REDIS_URL: `redis://wrong-user-QRS:wrong-pw-QRS@127.0.0.1:${authedPort}`,
        });
        expectFailFast(r, ['wrong-pw-QRS', 'wrong-user-QRS']);
        expect(r.err).toContain('(ReplyError)');
      }
    });

    it('no password: one redacted stopped line, exit 1', async () => {
      const r = await runScript([], { REDIS_URL: `redis://127.0.0.1:${authedPort}` });
      expectFailFast(r, [PW]);
      expect(r.err).toContain('(ReplyError)');
    });

    it('dead port: one redacted stopped line, exit 1, fast', async () => {
      const dead = await new Promise<number>((resolve, reject) => {
        const s = net.createServer();
        s.once('error', reject);
        s.listen(0, '127.0.0.1', () => {
          const { port } = s.address() as net.AddressInfo;
          s.close(() => resolve(port));
        });
      });
      const t0 = Date.now();
      for (const args of [[], ['--yes']]) {
        const r = await runScript(args, {
          REDIS_URL: `redis://deaduser-XYZ:deadpw-XYZ@127.0.0.1:${dead}`,
        });
        expectFailFast(r, ['deadpw-XYZ', 'deaduser-XYZ']);
      }
      expect(Date.now() - t0).toBeLessThan(30_000);
    });
  });

  it('mutes console output from inside the process (library noise never reaches the terminal)', async () => {
    const ticks = join(os.tmpdir(), `t436-ticks-${process.pid}-${Date.now()}`);
    const high = queue('email-high');
    for (let i = 0; i < 40; i += 1) await addVerify(high, USER(i));
    const r = await runScript(['--yes'], { T436_TICKS_FILE: ticks }, [NOISE]);
    const ran = existsSync(ticks) ? readFileSync(ticks, 'utf8').length : 0;
    rmSync(ticks, { force: true });
    expect(r.code).toBe(0);
    expect(ran).toBeGreaterThan(0); // the noise really ran inside the script process
    expect(`${r.out}\n${r.err}`).not.toContain('NOISE-');
    expect(r.out).toContain('total removed: 40');
  });

  it('--yes exits 1 when a locked active job could not be removed', async () => {
    const high = queue('email-high');
    const job = await addVerify(high, USER(1));
    const { release } = await blockingWorker('email-high', 1);
    const { code, out, err } = await runScript(['--yes']);
    expect(code).toBe(1);
    expect(out).toContain('total active and locked (not removed): 1');
    expect(err).toContain('being sent by a live worker');
    expect(await high.getJob(String(job.id))).toBeDefined();
    release();
  });

  it('--yes with --dry-run, or an unknown flag, prints usage and exits 2', async () => {
    for (const args of [['--yes', '--dry-run'], ['--older-than', '24h'], ['--force'], ['x']]) {
      const { code, err, out } = await runScript(args);
      expect(code).toBe(2);
      expect(err).toContain('Usage:');
      expect(out).toBe('');
    }
  });

  it('exits 2 when REDIS_URL is not set', async () => {
    const { code, err } = await runScript([], { REDIS_URL: '' });
    expect(code).toBe(2);
    expect(err).toContain('REDIS_URL is not set');
  });
});

describe('queue-purge: jobs gone before removal', () => {
  const GONE = (n: number) =>
    `${n} verify job(s) were gone before removal, most likely taken and sent by a worker. Check that no email-worker is processing, then rerun.`;

  it('in-process: a job removed in the gap is counted vanished, not removed', async () => {
    const high = queue('email-high');
    await addVerify(high, USER(1));
    await addVerify(high, USER(2));
    const removeJob = Queue.prototype.remove;
    const getJob = Queue.prototype.getJob;
    const spy = jest.spyOn(Queue.prototype, 'getJob').mockImplementation(async function (
      this: Queue,
      id: string,
    ) {
      await removeJob.call(this, id); // a worker took it between listing and the re-read
      return getJob.call(this, id);
    });
    try {
      const r = await purge(true);
      expect(r.totalFound).toBe(2);
      expect(r.totalRemoved).toBe(0);
      expect(r.totalVanished).toBe(2);
      expect(r.totalLockedActive).toBe(0);
      const text = formatResult(r, true).join('\n');
      expect(text).toContain('gone before removal 2');
      expect(text).toContain('total gone before removal: 2');
    } finally {
      spy.mockRestore();
    }
  });

  it('--yes exits 1 with the "gone before removal" line when jobs vanish between listing and removal', async () => {
    const high = queue('email-high');
    await addVerify(high, USER(1));
    await addVerify(high, USER(2));
    const r = await runScript(['--yes'], {}, [VANISH]);
    expect(r.code).toBe(1);
    expect(r.err.split('\n').filter((l) => l.trim() !== '')).toEqual([GONE(2)]);
    expect(r.out).toContain('total gone before removal: 2');
    expect(r.out).toContain('total removed: 0');
    expect(r.err).not.toContain('live worker');
  });

  it('a dry run never reports vanished jobs and exits 0 even with the patch', async () => {
    const high = queue('email-high');
    await addVerify(high, USER(1));
    const r = await runScript([], {}, [VANISH]);
    expect(r.code).toBe(0);
    expect(r.err).toBe('');
    expect(r.out).not.toContain('gone before removal');
  });

  it('--yes prints both lines (locked and gone) and exits 1 when both apply', async () => {
    const high = queue('email-high');
    const active = await addVerify(high, USER(1));
    await addVerify(high, USER(2));
    const { release } = await blockingWorker('email-high', 1);
    expect(await active.getState()).toBe('active');
    const r = await runScript(['--yes'], {}, [VANISH]);
    release();
    expect(r.code).toBe(1);
    const lines = r.err.split('\n').filter((l) => l.trim() !== '');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('being sent by a live worker');
    expect(lines[1]).toBe(GONE(1));
    expect(r.out).toContain('total active and locked (not removed): 1');
    expect(r.out).toContain('total gone before removal: 1');
  });

  it('exit 0 and an empty stderr when nothing vanished or was locked', async () => {
    const high = queue('email-high');
    await addVerify(high, USER(1));
    await addVerify(high, USER(2), { delay: 3_600_000 });
    const r = await runScript(['--yes']);
    expect(r.code).toBe(0);
    expect(r.err).toBe('');
    expect(r.out).toContain('total removed: 2');
    expect(r.out).toContain('total gone before removal: 0');
  });
});

describe('redactRedisUrl (queue-purge): the user-info rule', () => {
  it.each(redisCases().map((c) => [c.input, c] as const))('table: %s', (_i, c) => {
    const out = redactRedisUrl(c.input);
    expect(out).toBe(c.expected);
    for (const secret of c.secrets) expect(out).not.toContain(secret);
  });

  it('accepted limit: a URL with no "@" at all prints as host:port (no user info exists)', () => {
    // `default:1234` reads as host "default", port 1234; nothing to find a user in. Not a leak.
    expect(redactRedisUrl('redis://default:1234')).toBe('redis://default:1234');
  });

  it('seeded fuzz (3000 cases): no marker in any output; output is unparseable or a clean host form', () => {
    let clean = 0;
    for (const f of fuzzCases('redis', 'redis://', 3000, 436)) {
      const out = redactRedisUrl(f.input);
      if (CLEAN_REDIS.test(out)) clean += 1;
      for (const m of f.forbidden) expect([f.input, out.includes(m)]).toEqual([f.input, false]);
      expect([f.input, out === '(unparseable REDIS_URL)' || CLEAN_REDIS.test(out)]).toEqual([
        f.input,
        true,
      ]);
    }
    expect(clean).toBeGreaterThan(300);
    expect(clean).toBeLessThan(2900);
  });
});

describe('parseArgs / redactRedisUrl / formatResult / queue names', () => {
  it('parseArgs', () => {
    expect(parseArgs([])).toEqual({ apply: false });
    expect(parseArgs(['--dry-run'])).toEqual({ apply: false });
    expect(parseArgs(['--yes'])).toEqual({ apply: true });
    expect(parseArgs(['--yes', '--yes'])).toEqual({ apply: true });
    expect(parseArgs(['--yes', '--dry-run'])).toBeNull();
    expect(parseArgs(['--dry-run', '--yes'])).toBeNull();
    expect(parseArgs(['--older-than', '24h'])).toBeNull();
    expect(parseArgs(['--older-than=24h'])).toBeNull();
    expect(parseArgs(['--YES'])).toBeNull();
    expect(parseArgs(['-y'])).toBeNull();
  });

  it('redactRedisUrl drops user, password, db and query', () => {
    expect(redactRedisUrl('rediss://default:pw@redis-1.cloud.example:14900/0')).toBe(
      'rediss://redis-1.cloud.example:14900',
    );
    expect(redactRedisUrl('redis://:onlypw@10.0.0.5:6379')).toBe('redis://10.0.0.5:6379');
    expect(redactRedisUrl('redis://user@host.example')).toBe('redis://host.example');
    expect(redactRedisUrl('redis://host.example:6380/2?password=leak&x=1')).toBe(
      'redis://host.example:6380',
    );
    expect(redactRedisUrl('redis://u:p%40ss@[::1]:6379')).toBe('redis://[::1]:6379');
    for (const bad of ['', 'not a url', 'host:6379', 'redis://']) {
      const out = redactRedisUrl(bad);
      expect(out).toBe('(unparseable REDIS_URL)');
    }
    expect(redactRedisUrl('secret-pw-only')).not.toContain('secret-pw-only');
  });

  it('formatResult prints counts only and the removal lines only with apply', () => {
    const result = {
      queues: [
        {
          queue: 'email-high',
          found: { wait: 2, paused: 1, prioritized: 0, delayed: 3, active: 1 },
          removed: 6,
          lockedActive: 1,
          vanished: 0,
          failedKept: 4,
        },
      ],
      totalFound: 7,
      totalRemoved: 6,
      totalLockedActive: 1,
      totalVanished: 0,
      totalFailedKept: 4,
    };
    const dry = formatResult(result, false).join('\n');
    expect(dry).toContain(
      'email-high: held verify jobs 7 (wait 2, paused 1, prioritized 0, delayed 3, active 1)',
    );
    expect(dry).not.toContain('removed');
    const yes = formatResult(result, true).join('\n');
    expect(yes).toContain('total removed: 6');
    expect(yes).toContain('total active and locked (not removed): 1');
    expect(yes).toContain('total failed verify jobs kept: 4');
    expect(PURGE_STATES).toEqual(['wait', 'paused', 'prioritized', 'delayed', 'active']);
  });

  it('worker.ts and the script share the {lawie} prefix and both queues', () => {
    expect(bullPrefix(undefined)).toBe('{lawie}');
    expect(bullPrefix('lawie-staging')).toBe('{lawie-staging}');
    expect([...WORKER_QUEUE_NAMES]).toEqual(['email-high', 'email-low']);
    const src = readFileSync(join(__dirname, '..', 'worker.ts'), 'utf8');
    expect(src).toMatch(/from '\.\/queues'/);
    expect(src).toContain('bullPrefix(env.EMAIL_QUEUE_PREFIX)');
    expect(src).toContain('for (const queueName of WORKER_QUEUE_NAMES)');
    expect(src).not.toMatch(/prefix:\s*`\{\$\{/);
  });
});

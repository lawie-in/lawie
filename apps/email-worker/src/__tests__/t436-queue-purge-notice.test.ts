/**
 * T-436 AC10 follow-up: queue:purge also clears held auth.unverifiedDeletionNotice jobs (T-358).
 * Same setup as t436-queue-purge.test.ts: a private real Redis (helpers/t220-redis) and real
 * BullMQ, main() run as a child process. Nothing is sent: workers used to put jobs in `active` /
 * `failed` run stub processors.
 *
 * Every test here would fail if the notice template were dropped from PURGE_TEMPLATES.
 */
import { spawn } from 'child_process';
import { join } from 'path';

import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

import { WORKER_QUEUE_NAMES } from '../queues';
import {
  PURGE_TEMPLATES,
  UNVERIFIED_NOTICE_TEMPLATE,
  VERIFY_TEMPLATE,
  formatResult,
  purgeHeldVerifyJobs,
} from '../../scripts/queue-purge';

import { type AuthProxy, createAuthProxy } from './helpers/t436-auth-proxy';
import { type TestRedis, acquireRedis, purgePrefix } from './helpers/t220-redis';

jest.setTimeout(60_000);

const VANISH = join(__dirname, 'helpers', 't436-vanish.js');
const SCRIPT = join(__dirname, '..', '..', 'scripts', 'queue-purge.ts');
const USER = (n: number) => `64b7f0c2a1b2c3d4e5f6${String(n).padStart(4, '0')}`;
const SENTINEL_ADDR = (n: number) => `sentinel-notice-${n}@leak-check.example`;
const SENTINEL_VALUE = 'SENTINEL-PAYLOAD-VALUE-7Q';
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

/** A notice payload as the sweep builds it, with sentinel values that must never be printed. */
const noticeData = (n: number) => ({
  template: UNVERIFIED_NOTICE_TEMPLATE,
  to: [SENTINEL_ADDR(n)],
  cc: [] as string[],
  bcc: [] as string[],
  data: { userId: USER(n), note: SENTINEL_VALUE },
});

async function addVerify(q: Queue, n: number, opts: Record<string, unknown> = {}) {
  return q.add(VERIFY_TEMPLATE, verifyData(USER(n)), {
    jobId: `verify-job-${USER(n)}`,
    deduplication: { id: `verify:${USER(n)}` },
    attempts: 5,
    ...opts,
  });
}

async function addNotice(q: Queue, n: number, opts: Record<string, unknown> = {}) {
  return q.add(UNVERIFIED_NOTICE_TEMPLATE, noticeData(n), {
    jobId: `notice-job-${USER(n)}`,
    attempts: 5,
    ...opts,
  });
}

const otherData = (template: string, n: number) => ({
  template,
  to: [SENTINEL_ADDR(n)],
  data: { userId: USER(n) },
});

beforeAll(async () => {
  redis = await acquireRedis();
  const u = new URL(redis.url);
  bull = { host: u.hostname, port: Number(u.port), maxRetriesPerRequest: null };
  admin = new Redis(redis.url);
});

beforeEach(() => {
  seq += 1;
  rawPrefix = `lawie-t436notice-${process.pid}-${Date.now()}-${seq}`;
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

/** Runs a throwing worker on `name` until `count` jobs have failed. */
async function failJobs(name: string, count: number) {
  const q = queue(name);
  const w = new Worker(
    name,
    async () => {
      throw new Error('boom');
    },
    { connection: bull, prefix },
  );
  w.on('error', () => undefined);
  w.on('failed', () => undefined);
  opened.push(w);
  for (let i = 0; i < 200 && (await q.getJobCountByTypes('failed')) < count; i += 1) {
    await sleep(50);
  }
  await w.close(true);
  expect(await q.getJobCountByTypes('failed')).toBe(count);
}

type PurgeRes = Awaited<ReturnType<typeof purge>>;
const bt = (r: PurgeRes) => {
  expect(r.byTemplate).toBeDefined();
  return r.byTemplate as NonNullable<PurgeRes['byTemplate']>;
};
const queueOf = (r: PurgeRes, name: string) => {
  const q = r.queues.find((x) => x.queue === name);
  expect(q).toBeDefined();
  return q as PurgeRes['queues'][number];
};

const live = (q: Queue) =>
  q.getJobCountByTypes('wait', 'paused', 'prioritized', 'delayed', 'active');

describe('PURGE_TEMPLATES', () => {
  it('lists the verify and the unverified-deletion notice templates, in print order', () => {
    expect([...PURGE_TEMPLATES]).toEqual(['auth.verifyEmail', 'auth.unverifiedDeletionNotice']);
    expect(UNVERIFIED_NOTICE_TEMPLATE).toBe('auth.unverifiedDeletionNotice');
  });
});

describe('purgeHeldVerifyJobs: notice jobs (real Redis)', () => {
  it('dry run counts notice jobs in wait, delayed and prioritized and removes nothing', async () => {
    const high = queue('email-high');
    await addNotice(high, 1);
    await addNotice(high, 2, { delay: 3_600_000 });
    await addNotice(high, 3, { priority: 5 });

    const r = await purge(false);
    const q = queueOf(r, 'email-high');
    expect(q.found.wait).toBe(1);
    expect(q.found.delayed).toBe(1);
    expect(q.found.prioritized).toBe(1);
    expect(r.totalFound).toBe(3);
    expect(r.totalRemoved).toBe(0);
    expect(bt(r)[UNVERIFIED_NOTICE_TEMPLATE]).toEqual({
      found: 3,
      removed: 0,
      lockedActive: 0,
      vanished: 0,
      failedKept: 0,
    });
    expect(bt(r)[VERIFY_TEMPLATE].found).toBe(0);
    expect(await high.getJobCountByTypes('wait', 'delayed', 'prioritized')).toBe(3);
  });

  it('--yes removes notice jobs in wait, delayed and prioritized, on both queues', async () => {
    const high = queue('email-high');
    const low = queue('email-low');
    await addNotice(high, 1);
    await addNotice(high, 2, { delay: 3_600_000 });
    await addNotice(high, 3, { priority: 5 });
    await addNotice(low, 4);
    await addNotice(low, 5, { delay: 3_600_000 });
    await addNotice(low, 6, { priority: 5 });

    const r = await purge(true);
    expect(r.totalFound).toBe(6);
    expect(r.totalRemoved).toBe(6);
    expect(r.totalLockedActive).toBe(0);
    expect(r.totalVanished).toBe(0);
    expect(bt(r)[UNVERIFIED_NOTICE_TEMPLATE].found).toBe(6);
    expect(bt(r)[UNVERIFIED_NOTICE_TEMPLATE].removed).toBe(6);
    expect(bt(r)[VERIFY_TEMPLATE].removed).toBe(0);
    for (const n of ['email-high', 'email-low']) {
      const q = queueOf(r, n);
      expect(q.removed).toBe(3);
      expect(q.found.wait + q.found.delayed + q.found.prioritized).toBe(3);
    }
    expect(await live(high)).toBe(0);
    expect(await live(low)).toBe(0);
  });

  it('--yes removes notice jobs in the paused state, on both queues', async () => {
    const high = queue('email-high');
    const low = queue('email-low');
    await high.pause();
    await low.pause();
    await addNotice(high, 1);
    await addNotice(high, 2);
    await addNotice(low, 3);
    expect(await high.getJobCountByTypes('paused')).toBe(2);

    const dry = await purge(false);
    expect(dry.totalFound).toBe(3);
    expect(dry.queues[0].found.paused).toBe(2);
    expect(dry.queues[1].found.paused).toBe(1);
    expect(await high.getJobCountByTypes('paused')).toBe(2);

    const r = await purge(true);
    expect(r.totalRemoved).toBe(3);
    expect(bt(r)[UNVERIFIED_NOTICE_TEMPLATE].removed).toBe(3);
    expect(await high.getJobCountByTypes('paused')).toBe(0);
    expect(await low.getJobCountByTypes('paused')).toBe(0);
  });

  it('removes a delayed retry-backoff notice job (it failed an attempt)', async () => {
    const high = queue('email-high');
    await addNotice(high, 1, { attempts: 3, backoff: { type: 'fixed', delay: 3_600_000 } });
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
    expect(bt(r)[UNVERIFIED_NOTICE_TEMPLATE].removed).toBe(1);
    expect(await high.getJobCountByTypes('delayed', 'wait', 'failed')).toBe(0);
  });

  it('--yes removes a stalled active notice job (no worker holds its lock)', async () => {
    const high = queue('email-high');
    const job = await addNotice(high, 1);
    const { release } = await blockingWorker('email-high', 1);
    expect(await job.getState()).toBe('active');
    await admin.del(`${prefix}:email-high:${job.id}:lock`);

    const dry = await purge(false);
    expect(dry.queues[0].found.active).toBe(1);
    expect(bt(dry)[UNVERIFIED_NOTICE_TEMPLATE].found).toBe(1);
    expect(await high.getJob(String(job.id))).toBeDefined();

    const r = await purge(true);
    expect(r.queues[0].found.active).toBe(1);
    expect(r.totalRemoved).toBe(1);
    expect(r.totalLockedActive).toBe(0);
    expect(bt(r)[UNVERIFIED_NOTICE_TEMPLATE].removed).toBe(1);
    expect(await high.getJob(String(job.id))).toBeUndefined();
    release();
  });

  it('a locked active notice job is counted, not removed; the waiting one is removed', async () => {
    const high = queue('email-high');
    const job = await addNotice(high, 1);
    await addNotice(high, 2);
    const { release } = await blockingWorker('email-high', 1);
    expect(await job.getState()).toBe('active');

    const r = await purge(true);
    expect(r.totalFound).toBe(2);
    expect(r.totalRemoved).toBe(1);
    expect(r.totalLockedActive).toBe(1);
    expect(bt(r)[UNVERIFIED_NOTICE_TEMPLATE]).toEqual({
      found: 2,
      removed: 1,
      lockedActive: 1,
      vanished: 0,
      failedKept: 0,
    });
    expect(await high.getJob(String(job.id))).toBeDefined();
    expect(await job.getState()).toBe('active');
    release();
  });

  it('keeps failed notice jobs and counts them as kept, per queue and per template', async () => {
    const high = queue('email-high');
    const low = queue('email-low');
    await addNotice(high, 1, { attempts: 1 });
    await addNotice(low, 2, { attempts: 1 });
    await addNotice(low, 3, { attempts: 1 });
    await failJobs('email-high', 1);
    await failJobs('email-low', 2);

    const dry = await purge(false);
    expect(dry.totalFailedKept).toBe(3);
    const yes = await purge(true);
    expect(yes.totalFailedKept).toBe(3);
    expect(yes.totalFound).toBe(0);
    expect(yes.totalRemoved).toBe(0);
    expect(yes.queues.map((q) => q.failedKept)).toEqual([1, 2]);
    expect(bt(yes)[UNVERIFIED_NOTICE_TEMPLATE].failedKept).toBe(3);
    expect(bt(yes)[VERIFY_TEMPLATE].failedKept).toBe(0);
    expect(await high.getJobCountByTypes('failed')).toBe(1);
    expect(await low.getJobCountByTypes('failed')).toBe(2);
  });

  it('frees the notice jobId so the sweep can queue that notice again', async () => {
    const high = queue('email-high');
    await addNotice(high, 1);
    const r = await purge(true);
    expect(bt(r)[UNVERIFIED_NOTICE_TEMPLATE].removed).toBe(1);
    expect(await high.getJob(`notice-job-${USER(1)}`)).toBeUndefined();
    const again = await addNotice(high, 1);
    expect(again.id).toBe(`notice-job-${USER(1)}`);
    expect(await high.getJobCountByTypes('wait')).toBe(1);
  });
});

describe('purgeHeldVerifyJobs: jobs that must be left alone', () => {
  // [BullMQ name, data.template]
  const NON_MATCHING: Array<[string, string]> = [
    [UNVERIFIED_NOTICE_TEMPLATE, 'auth.welcome'], // notice name, other template
    ['auth.welcome', UNVERIFIED_NOTICE_TEMPLATE], // other name, notice template
    [UNVERIFIED_NOTICE_TEMPLATE, VERIFY_TEMPLATE], // two purge templates, mismatched
    [VERIFY_TEMPLATE, UNVERIFIED_NOTICE_TEMPLATE], // and the reverse
    ['auth.welcome', 'auth.welcome'], // unrelated
    ['billing.paymentFailed', 'billing.paymentFailed'],
  ];

  it('leaves them in wait, delayed and prioritized, on both queues, found nothing', async () => {
    const high = queue('email-high');
    const low = queue('email-low');
    let n = 100;
    for (const q of [high, low]) {
      for (const [name, template] of NON_MATCHING) {
        await q.add(name, otherData(template, (n += 1)));
        await q.add(name, otherData(template, (n += 1)), { delay: 3_600_000 });
        await q.add(name, otherData(template, (n += 1)), { priority: 5 });
      }
    }
    const total = NON_MATCHING.length * 3 * 2;
    expect(await live(high)).toBe(total / 2);

    for (const apply of [false, true]) {
      const r = await purge(apply);
      expect(r.totalFound).toBe(0);
      expect(r.totalRemoved).toBe(0);
      expect(r.totalVanished).toBe(0);
      expect(r.totalLockedActive).toBe(0);
      expect(r.totalFailedKept).toBe(0);
      expect(bt(r)[UNVERIFIED_NOTICE_TEMPLATE].found).toBe(0);
      expect(bt(r)[VERIFY_TEMPLATE].found).toBe(0);
    }
    expect(await live(high)).toBe(total / 2);
    expect(await live(low)).toBe(total / 2);
  });

  it('leaves them in the paused state', async () => {
    const high = queue('email-high');
    await high.pause();
    let n = 200;
    for (const [name, template] of NON_MATCHING)
      await high.add(name, otherData(template, (n += 1)));
    expect(await high.getJobCountByTypes('paused')).toBe(NON_MATCHING.length);

    const r = await purge(true);
    expect(r.totalFound).toBe(0);
    expect(r.totalRemoved).toBe(0);
    expect(await high.getJobCountByTypes('paused')).toBe(NON_MATCHING.length);
  });

  it('leaves them in the active state, even stalled (no lock)', async () => {
    const high = queue('email-high');
    let n = 300;
    const jobs = [];
    for (const [name, template] of NON_MATCHING) {
      jobs.push(await high.add(name, otherData(template, (n += 1))));
    }
    const { release } = await blockingWorker('email-high', NON_MATCHING.length);
    for (const j of jobs) {
      expect(await j.getState()).toBe('active');
      await admin.del(`${prefix}:email-high:${j.id}:lock`);
    }

    const r = await purge(true);
    expect(r.totalFound).toBe(0);
    expect(r.totalRemoved).toBe(0);
    expect(r.totalLockedActive).toBe(0);
    for (const j of jobs) expect(await high.getJob(String(j.id))).toBeDefined();
    release();
  });

  it('leaves failed non-matching jobs uncounted', async () => {
    const high = queue('email-high');
    let n = 400;
    for (const [name, template] of NON_MATCHING) {
      await high.add(name, otherData(template, (n += 1)), { attempts: 1 });
    }
    await failJobs('email-high', NON_MATCHING.length);
    const r = await purge(true);
    expect(r.totalFailedKept).toBe(0);
    expect(bt(r)[UNVERIFIED_NOTICE_TEMPLATE].failedKept).toBe(0);
    expect(bt(r)[VERIFY_TEMPLATE].failedKept).toBe(0);
    expect(await high.getJobCountByTypes('failed')).toBe(NON_MATCHING.length);
  });

  it('a job with no data.template at all is left alone', async () => {
    const high = queue('email-high');
    await high.add(UNVERIFIED_NOTICE_TEMPLATE, {});
    await high.add(UNVERIFIED_NOTICE_TEMPLATE, null as never);
    const r = await purge(true);
    expect(r.totalFound).toBe(0);
    expect(await high.getJobCountByTypes('wait')).toBe(2);
  });
});

describe('purgeHeldVerifyJobs: mixed verify, notice and other jobs', () => {
  async function seedMixed() {
    const high = queue('email-high');
    const low = queue('email-low');
    // verify: 2 on high (wait, delayed), 1 on low (prioritized)
    await addVerify(high, 1);
    await addVerify(high, 2, { delay: 3_600_000 });
    await addVerify(low, 3, { priority: 5 });
    // notice: 3 on high (wait, delayed, prioritized), 1 on low (wait)
    await addNotice(high, 11);
    await addNotice(high, 12, { delay: 3_600_000 });
    await addNotice(high, 13, { priority: 5 });
    await addNotice(low, 14);
    // others: 3
    await high.add('auth.welcome', otherData('auth.welcome', 21));
    await low.add('auth.welcome', otherData('auth.welcome', 22), { delay: 3_600_000 });
    await high.add(UNVERIFIED_NOTICE_TEMPLATE, otherData('auth.welcome', 23));
    return { high, low };
  }

  it('dry run: exact counts and byTemplate, nothing removed', async () => {
    const { high, low } = await seedMixed();
    const r = await purge(false);
    expect(r.totalFound).toBe(7);
    expect(r.totalRemoved).toBe(0);
    expect(bt(r)[VERIFY_TEMPLATE]).toEqual({
      found: 3,
      removed: 0,
      lockedActive: 0,
      vanished: 0,
      failedKept: 0,
    });
    expect(bt(r)[UNVERIFIED_NOTICE_TEMPLATE]).toEqual({
      found: 4,
      removed: 0,
      lockedActive: 0,
      vanished: 0,
      failedKept: 0,
    });
    expect(await high.getJobCountByTypes('wait', 'delayed', 'prioritized')).toBe(7);
    expect(await low.getJobCountByTypes('wait', 'delayed', 'prioritized')).toBe(3);
  });

  it('--yes: removes exactly the verify and notice jobs, keeps the other 3', async () => {
    const { high, low } = await seedMixed();
    const r = await purge(true);
    expect(r.totalFound).toBe(7);
    expect(r.totalRemoved).toBe(7);
    expect(bt(r)[VERIFY_TEMPLATE].removed).toBe(3);
    expect(bt(r)[UNVERIFIED_NOTICE_TEMPLATE].removed).toBe(4);
    const h = queueOf(r, 'email-high');
    const l = queueOf(r, 'email-low');
    expect(h.removed).toBe(5);
    expect(l.removed).toBe(2);
    expect(await high.getJobCountByTypes('wait', 'delayed', 'prioritized')).toBe(2);
    expect(await low.getJobCountByTypes('wait', 'delayed', 'prioritized')).toBe(1);
    const left = [
      ...(await high.getJobs(['wait', 'delayed', 'prioritized'])),
      ...(await low.getJobs(['wait', 'delayed', 'prioritized'])),
    ];
    expect(left.map((j) => `${j.name}|${j.data.template}`).sort()).toEqual(
      [
        'auth.welcome|auth.welcome',
        'auth.welcome|auth.welcome',
        `${UNVERIFIED_NOTICE_TEMPLATE}|auth.welcome`,
      ].sort(),
    );
  });

  it('locked + failed + removed all split per template', async () => {
    const high = queue('email-high');
    // one failed notice, one failed verify
    await addNotice(high, 1, { attempts: 1 });
    await addVerify(high, 2, { attempts: 1 });
    await failJobs('email-high', 2);
    // one locked-active notice, one waiting verify, one waiting notice
    const locked = await addNotice(high, 3);
    const { release } = await blockingWorker('email-high', 1);
    expect(await locked.getState()).toBe('active');
    await addVerify(high, 4);
    await addNotice(high, 5);

    const r = await purge(true);
    expect(bt(r)[UNVERIFIED_NOTICE_TEMPLATE]).toEqual({
      found: 2,
      removed: 1,
      lockedActive: 1,
      vanished: 0,
      failedKept: 1,
    });
    expect(bt(r)[VERIFY_TEMPLATE]).toEqual({
      found: 1,
      removed: 1,
      lockedActive: 0,
      vanished: 0,
      failedKept: 1,
    });
    expect(r.totalFound).toBe(3);
    expect(r.totalRemoved).toBe(2);
    expect(r.totalLockedActive).toBe(1);
    expect(r.totalFailedKept).toBe(2);
    release();
  });

  it('byTemplate always sums to the totals', async () => {
    await seedMixed();
    const r = await purge(true);
    expect(bt(r)[UNVERIFIED_NOTICE_TEMPLATE].removed).toBe(4);
    expect(bt(r)[VERIFY_TEMPLATE].removed).toBe(3);
    const sum = (k: 'found' | 'removed' | 'lockedActive' | 'vanished' | 'failedKept') =>
      PURGE_TEMPLATES.reduce((n, t) => n + bt(r)[t][k], 0);
    expect(sum('found')).toBe(r.totalFound);
    expect(sum('removed')).toBe(r.totalRemoved);
    expect(sum('lockedActive')).toBe(r.totalLockedActive);
    expect(sum('vanished')).toBe(r.totalVanished);
    expect(sum('failedKept')).toBe(r.totalFailedKept);
  });

  it('in-process: a notice job removed in the gap is counted vanished for the notice template', async () => {
    const high = queue('email-high');
    await addNotice(high, 1);
    await addNotice(high, 2);
    await addVerify(high, 3);
    const removeJob = Queue.prototype.remove;
    const getJob = Queue.prototype.getJob;
    const spy = jest.spyOn(Queue.prototype, 'getJob').mockImplementation(async function (
      this: Queue,
      id: string,
    ) {
      await removeJob.call(this, id);
      return getJob.call(this, id);
    });
    try {
      const r = await purge(true);
      expect(r.totalRemoved).toBe(0);
      expect(r.totalVanished).toBe(3);
      expect(bt(r)[UNVERIFIED_NOTICE_TEMPLATE].vanished).toBe(2);
      expect(bt(r)[VERIFY_TEMPLATE].vanished).toBe(1);
      expect(formatResult(r, true).join('\n')).toContain(
        `template ${UNVERIFIED_NOTICE_TEMPLATE}: held 2, removed 0, active and locked (not removed) 0, gone before removal 2, failed kept 0`,
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('in-process: a job whose id is reused by another template in the gap is not removed', async () => {
    const high = queue('email-high');
    const notice = await addNotice(high, 1);
    const id = String(notice.id);
    const removeJob = Queue.prototype.remove;
    const getJob = Queue.prototype.getJob;
    const spy = jest.spyOn(Queue.prototype, 'getJob').mockImplementation(async function (
      this: Queue,
      jobId: string,
    ) {
      await removeJob.call(this, jobId);
      await this.add('auth.welcome', otherData('auth.welcome', 1), { jobId });
      return getJob.call(this, jobId);
    });
    try {
      const r = await purge(true);
      expect(r.totalRemoved).toBe(0);
      expect(bt(r)[UNVERIFIED_NOTICE_TEMPLATE].vanished).toBe(1);
    } finally {
      spy.mockRestore();
    }
    const now = await high.getJob(id);
    expect(now?.name).toBe('auth.welcome');
  });
});

describe('formatResult with and without byTemplate', () => {
  const base = {
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
  const byTemplate = {
    [VERIFY_TEMPLATE]: { found: 3, removed: 2, lockedActive: 1, vanished: 0, failedKept: 1 },
    [UNVERIFIED_NOTICE_TEMPLATE]: {
      found: 4,
      removed: 4,
      lockedActive: 0,
      vanished: 0,
      failedKept: 3,
    },
  };

  it('without byTemplate: no template lines, existing lines unchanged', () => {
    for (const apply of [false, true]) {
      const text = formatResult(base, apply).join('\n');
      expect(text).not.toContain('template ');
      expect(text).toContain('total held verify jobs: 7');
      expect(text).toContain('total failed verify jobs kept: 4');
    }
  });

  it('dry run with byTemplate: one held/failed line per template, no removal wording on them', () => {
    const lines = formatResult({ ...base, byTemplate }, false);
    const tl = lines.filter((l) => l.startsWith('template '));
    expect(tl).toEqual([
      'template auth.verifyEmail: held 3, failed kept 1',
      'template auth.unverifiedDeletionNotice: held 4, failed kept 3',
    ]);
    expect(lines.join('\n')).not.toContain('removed');
    // template lines come after the totals
    expect(lines.indexOf(tl[0])).toBeGreaterThan(lines.indexOf('total failed verify jobs kept: 4'));
  });

  it('--yes with byTemplate: one full line per template, in PURGE_TEMPLATES order', () => {
    const lines = formatResult({ ...base, byTemplate }, true);
    const tl = lines.filter((l) => l.startsWith('template '));
    expect(tl).toEqual([
      'template auth.verifyEmail: held 3, removed 2, active and locked (not removed) 1, gone before removal 0, failed kept 1',
      'template auth.unverifiedDeletionNotice: held 4, removed 4, active and locked (not removed) 0, gone before removal 0, failed kept 3',
    ]);
    expect(lines.indexOf(tl[0])).toBeGreaterThan(lines.indexOf('total failed verify jobs kept: 4'));
  });
});

describe('queue-purge main() with notice jobs (child process)', () => {
  const GONE = (n: number) =>
    `${n} verify job(s) were gone before removal, most likely taken and sent by a worker. Check that no email-worker is processing, then rerun.`;
  const BANNER = (target: string) =>
    `--yes: REMOVING held auth.verifyEmail and auth.unverifiedDeletionNotice jobs on ${target}`;

  async function seedChild() {
    const high = queue('email-high');
    const low = queue('email-low');
    await addNotice(high, 1);
    await addNotice(high, 2, { delay: 3_600_000 });
    await addNotice(low, 3, { priority: 5 });
    await addVerify(high, 4);
    await high.add('auth.welcome', otherData('auth.welcome', 5));
    return { high, low };
  }

  const noLeaks = (text: string) => {
    for (let n = 1; n <= 5; n += 1) {
      expect(text).not.toContain(SENTINEL_ADDR(n));
      expect(text).not.toContain(USER(n));
    }
    expect(text).not.toContain(SENTINEL_VALUE);
    expect(text).not.toContain('notice-job-');
    expect(text).not.toContain('verify-job-');
    expect(text).not.toContain('@leak-check');
  };

  it('dry run: per-template held lines, no removed wording, removes nothing, exit 0', async () => {
    const { high, low } = await seedChild();
    for (const args of [[], ['--dry-run']]) {
      const { code, out, err } = await runScript(args);
      expect(code).toBe(0);
      expect(out).toContain('total held verify jobs: 4');
      expect(out).toContain('template auth.verifyEmail: held 1, failed kept 0');
      expect(out).toContain('template auth.unverifiedDeletionNotice: held 3, failed kept 0');
      expect(out).toContain('Dry run: nothing removed');
      expect(out).not.toMatch(/total removed|, removed \d|removed \d/);
      expect(out).not.toContain('REMOVING');
      expect(err).toBe('');
      noLeaks(`${out}\n${err}`);
      expect(await high.getJobCountByTypes('wait', 'delayed')).toBe(4);
      expect(await low.getJobCountByTypes('prioritized')).toBe(1);
    }
  });

  it('--yes: new banner, per-template removed counts, exit 0, other job kept', async () => {
    const { high, low } = await seedChild();
    const { code, out, err } = await runScript(['--yes']);
    expect(code).toBe(0);
    expect(err).toBe('');
    const target = `redis://127.0.0.1:${new URL(redis.url).port}, prefix ${prefix}`;
    const banner = out.split('\n').find((l) => l.includes('REMOVING'));
    expect(banner).toBe(`  ${BANNER(target)}`);
    expect(out).toContain('total held verify jobs: 4');
    expect(out).toContain('total removed: 4');
    expect(out).toContain(
      'template auth.verifyEmail: held 1, removed 1, active and locked (not removed) 0, gone before removal 0, failed kept 0',
    );
    expect(out).toContain(
      'template auth.unverifiedDeletionNotice: held 3, removed 3, active and locked (not removed) 0, gone before removal 0, failed kept 0',
    );
    noLeaks(`${out}\n${err}`);
    expect(await high.getJobCountByTypes('wait', 'delayed', 'prioritized')).toBe(1);
    expect(await low.getJobCountByTypes('wait', 'delayed', 'prioritized')).toBe(0);
  });

  it('--yes exits 1 when a locked active notice job could not be removed', async () => {
    const high = queue('email-high');
    const job = await addNotice(high, 1);
    const { release } = await blockingWorker('email-high', 1);
    const { code, out, err } = await runScript(['--yes']);
    release();
    expect(code).toBe(1);
    expect(out).toContain('total active and locked (not removed): 1');
    expect(out).toContain(
      'template auth.unverifiedDeletionNotice: held 1, removed 0, active and locked (not removed) 1, gone before removal 0, failed kept 0',
    );
    expect(err).toContain('being sent by a live worker');
    noLeaks(`${out}\n${err}`);
    expect(await high.getJob(String(job.id))).toBeDefined();
  });

  it('--yes exits 1 with the gone-before-removal line when notice jobs vanish', async () => {
    const high = queue('email-high');
    await addNotice(high, 1);
    await addNotice(high, 2);
    const r = await runScript(['--yes'], {}, [VANISH]);
    expect(r.code).toBe(1);
    expect(r.err.split('\n').filter((l) => l.trim() !== '')).toEqual([GONE(2)]);
    expect(r.out).toContain('total gone before removal: 2');
    expect(r.out).toContain('total removed: 0');
    expect(r.out).toContain(
      'template auth.unverifiedDeletionNotice: held 2, removed 0, active and locked (not removed) 0, gone before removal 2, failed kept 0',
    );
    noLeaks(`${r.out}\n${r.err}`);
  });

  it('failed notice jobs are reported as kept and the run exits 0', async () => {
    const high = queue('email-high');
    await addNotice(high, 1, { attempts: 1 });
    await failJobs('email-high', 1);
    const { code, out, err } = await runScript(['--yes']);
    expect(code).toBe(0);
    expect(err).toBe('');
    expect(out).toContain('total failed verify jobs kept: 1');
    expect(out).toContain('template auth.unverifiedDeletionNotice: held 0, removed 0');
    expect(out).toContain('failed kept 1');
    noLeaks(`${out}\n${err}`);
    expect(await high.getJobCountByTypes('failed')).toBe(1);
  });

  describe('against a private Redis that requires a password', () => {
    let proxy: AuthProxy;
    const PW = 's3cr3t-pw-NOTICE';

    beforeAll(async () => {
      proxy = await createAuthProxy(redis.url, PW);
    });

    afterAll(async () => {
      await proxy.close();
    });

    it('--yes removes notice jobs and prints counts only (no address, payload, password, user)', async () => {
      const conn = {
        host: '127.0.0.1',
        port: proxy.port,
        password: PW,
        maxRetriesPerRequest: null,
      };
      const q = new Queue('email-high', { connection: conn, prefix });
      opened.push(q);
      await addNotice(q, 1);
      await addNotice(q, 2, { delay: 3_600_000 });

      const { code, out, err } = await runScript(['--yes'], {
        REDIS_URL: `redis://default:${PW}@127.0.0.1:${proxy.port}`,
      });
      const all = `${out}\n${err}`;
      expect(code).toBe(0);
      expect(out).toContain('total removed: 2');
      expect(out).toContain('template auth.unverifiedDeletionNotice: held 2, removed 2');
      expect(out).toContain(`redis://127.0.0.1:${proxy.port}`);
      for (const secret of ['default:', PW, SENTINEL_ADDR(1), SENTINEL_ADDR(2), SENTINEL_VALUE]) {
        expect(all).not.toContain(secret);
      }
      expect(all).not.toContain(USER(1));
      expect(all).not.toContain('notice-job-');
      expect(await q.getJobCountByTypes('wait', 'delayed')).toBe(0);
    });
  });
});

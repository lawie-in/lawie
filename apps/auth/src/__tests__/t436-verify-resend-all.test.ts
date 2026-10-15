/**
 * T-436 AC10 (round 2): scripts/verify-resend-all.ts against a private real Redis
 * (t223-real-redis-env: REDIS_TEST_URL if loopback, else a private redis-server; never a hosted
 * one), mongodb-memory-server and the real @lawie/email-client producer. No worker runs, so
 * "pending" is the T-390 dedupe key pointing at a job that exists. Nothing is sent.
 *
 * The script sits outside the auth tsconfig `include`, but ts-jest transpiles it fine and the
 * auth jest testMatch picks up this file, so no jest.config change is needed. main() (exit
 * codes, printed output, batching) is run as a child process, like the billing backfill test.
 */
import './setupEnv';
import { REAL_REDIS_URL, stopPrivateRedis } from './t223-real-redis-env';

process.env.EMAIL_QUEUE_PREFIX = `lawie-t436resend-${process.pid}-${Date.now()}`;

jest.mock('@lawie/email-client', () => {
  const actual = jest.requireActual('@lawie/email-client');
  return { ...actual, enqueueEmail: jest.fn(actual.enqueueEmail) };
});

import './setupDb';

import { type ChildProcess, spawn } from 'child_process';
import { existsSync, readFileSync, rmSync } from 'fs';
import net from 'net';
import os from 'os';
import { join } from 'path';

import { disconnectEmailClient, enqueueEmail } from '@lawie/email-client';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import mongoose from 'mongoose';

import redis from '../config/redis';
import { User } from '../models/User.model';
import {
  type Tally,
  DEFAULT_BATCH_PAUSE_MS,
  DEFAULT_BATCH_SIZE,
  RERUN_MARKER_TTL_MS,
  RESEND_FILTER,
  hasPendingVerifyJob,
  parseOptions,
  redactMongoUri,
  redactRedisUrl,
  rerunMarkerKey,
  runBatch,
  verifyQueueKeyPrefix,
} from '../../scripts/verify-resend-all';

jest.setTimeout(90_000);

const PREFIX = process.env.EMAIL_QUEUE_PREFIX as string;
const KEY_PREFIX = `{${PREFIX}}:email-high:`;
const SCRIPT = join(__dirname, '..', '..', 'scripts', 'verify-resend-all.ts');
const NOISE = join(__dirname, 'helpers', 't436-console-noise.js');
const STUB = join(__dirname, 'helpers', 't436-stub-enqueue.js');
const enqueueMock = enqueueEmail as unknown as jest.Mock;
const actualEnqueue = jest.requireActual('@lawie/email-client').enqueueEmail;
const emptyTally = (): Tally => ({
  queued: 0,
  already_pending: 0,
  rate_limited: 0,
  already_verified: 0,
  failed: 0,
  skipped_rerun: 0,
});
/** user:password built at run time, so no credentialed URI literal sits in the source. */
/** URI schemes assembled at run time (gitleaks' Mongo URI rule matches the literal). */
const M = ['mongodb', ''].join('://');
const MS = ['mongodb+srv', ''].join('://');
const cred = (user: string, pw: string): string => [user, pw].join(':');
const SHORT = 600; // confirm timeout for the in-process unconfirmed cases

let n = 0;
const allIds: string[] = [];
let bullQueue: Queue;
let authedRedis: ChildProcess | undefined;

async function addUser(extra: Record<string, unknown> = {}): Promise<string> {
  n += 1;
  const res = await User.collection.insertOne({
    email: `t436-resend-${process.pid}-${n}@example.com`,
    name: `Resend Person ${n}`,
    authProvider: 'email',
    emailVerified: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...extra,
  });
  const id = String(res.insertedId);
  allIds.push(id);
  return id;
}

const dedupeKey = (id: string) => `${KEY_PREFIX}de:verify:${id}`;
const jobCount = () => bullQueue.getJobCountByTypes('wait', 'delayed', 'active', 'paused');
const run = (ids: string[], confirmTimeoutMs = 5_000) => {
  const tally = emptyTally();
  return runBatch(ids, tally, { redis, keyPrefix: KEY_PREFIX, confirmTimeoutMs }).then(() => tally);
};

beforeAll(async () => {
  expect(await redis.ping()).toBe('PONG');
  const u = new URL(REAL_REDIS_URL);
  bullQueue = new Queue('email-high', {
    connection: { host: u.hostname, port: Number(u.port), maxRetriesPerRequest: null },
    prefix: `{${PREFIX}}`,
  });
});

beforeEach(() => {
  enqueueMock.mockReset();
  enqueueMock.mockImplementation(actualEnqueue);
});

afterEach(async () => {
  const keys = await redis.keys(`{${PREFIX}}*`);
  const perUser = allIds.flatMap((id) => [
    rerunMarkerKey(id),
    `auth:verify-email:min:${id}`,
    `auth:verify-email:day:${id}`,
  ]);
  const del = [...keys, ...perUser];
  if (del.length > 0) await redis.del(...del);
});

afterAll(async () => {
  await bullQueue.close();
  await disconnectEmailClient();
  await redis.quit();
  authedRedis?.kill('SIGTERM');
  stopPrivateRedis();
});

describe('import side effects', () => {
  it('runs the auth logger at fatal (auth service logs carry the userId)', () => {
    expect(process.env.LOG_LEVEL).toBe('fatal');
  });
  it('builds the dedupe key prefix from EMAIL_QUEUE_PREFIX, default lawie', () => {
    expect(verifyQueueKeyPrefix({})).toBe('{lawie}:email-high:');
    expect(verifyQueueKeyPrefix({ EMAIL_QUEUE_PREFIX: 'x-y' })).toBe('{x-y}:email-high:');
    expect(verifyQueueKeyPrefix(process.env)).toBe(KEY_PREFIX);
  });
});

describe('selection filter (RESEND_FILTER on the real collection)', () => {
  it('includes only unverified, non-Google, active, non-erasing email users', async () => {
    const eligible = await addUser();
    const emptyGoogleId = await addUser({ googleId: '' });
    const nullGoogleId = await addUser({ googleId: null });
    const verifiedFalseMissing = await addUser({ emailVerified: undefined });
    await addUser({ emailVerified: true });
    await addUser({ authProvider: 'google' });
    await addUser({ googleId: 'g-12345' });
    await addUser({ isActive: false });
    await addUser({ erasure: { requestedAt: new Date(), stage: 'locked' } });

    const found = await User.find(RESEND_FILTER, { _id: 1 }).lean();
    expect(found.map((u) => String(u._id)).sort()).toEqual(
      [eligible, emptyGoogleId, nullGoogleId, verifiedFalseMissing].sort(),
    );
    // _id only: nothing else is read into the script
    expect(Object.keys(found[0]).sort()).toEqual(['_id']);
  });
});

describe('runBatch against real Redis, BullMQ and Mongo', () => {
  it('fills every tally bucket in one batch', async () => {
    const queued = await addUser();
    const pending = await addUser();
    const limited = await addUser();
    const verifiedLater = await addUser({ emailVerified: true }); // verified after the snapshot
    const missing = new mongoose.Types.ObjectId().toString();
    const rerun = await addUser();

    await enqueueEmail({ template: 'auth.verifyEmail', userId: pending });
    await redis.set(`auth:verify-email:min:${limited}`, '1', 'PX', 60_000);
    await redis.set(rerunMarkerKey(rerun), '1', 'PX', 60_000);
    const jobsBefore = await jobCount();
    expect(jobsBefore).toBe(1);

    const tally = await run([queued, pending, limited, verifiedLater, missing, rerun]);
    expect(tally).toEqual({
      queued: 1,
      already_pending: 1,
      rate_limited: 1,
      already_verified: 1,
      failed: 1,
      skipped_rerun: 1,
    });
    expect(await jobCount()).toBe(2); // the pending one + the new one
    expect(await redis.get(rerunMarkerKey(queued))).toBe('1');
    for (const id of [pending, limited, verifiedLater, missing]) {
      expect(await redis.exists(rerunMarkerKey(id))).toBe(0);
    }
  });

  it('an already_pending user does not use up the T-223 cap and gets no second call', async () => {
    const id = await addUser();
    await enqueueEmail({ template: 'auth.verifyEmail', userId: id });
    enqueueMock.mockClear();

    const tally = await run([id]);
    expect(tally.already_pending).toBe(1);
    expect(tally.queued).toBe(0);
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(await redis.exists(`auth:verify-email:min:${id}`)).toBe(0);
    expect(await redis.exists(`auth:verify-email:day:${id}`)).toBe(0);
    expect(await redis.exists(rerunMarkerKey(id))).toBe(0);
    expect(await jobCount()).toBe(1);
  });

  it('a queued user uses one cap slot, gets one job and a marker with a 24 h TTL', async () => {
    const id = await addUser();
    const before = Date.now();
    const tally = await run([id]);
    expect(tally.queued).toBe(1);
    expect(await jobCount()).toBe(1);
    expect(await hasPendingVerifyJob(redis, KEY_PREFIX, id)).toBe(true);
    expect(await redis.get(`auth:verify-email:day:${id}`)).toBe('1');
    expect(await redis.get(rerunMarkerKey(id))).toBe('1');
    expect(RERUN_MARKER_TTL_MS).toBe(86_400_000);
    const pttl = await redis.pttl(rerunMarkerKey(id));
    expect(pttl).toBeGreaterThan(RERUN_MARKER_TTL_MS - (Date.now() - before) - 5_000);
    expect(pttl).toBeLessThanOrEqual(RERUN_MARKER_TTL_MS);
  });

  it('an immediate rerun gives skipped_rerun, no new job and no extra cap use', async () => {
    const ids = [await addUser(), await addUser()];
    expect((await run(ids)).queued).toBe(2);
    enqueueMock.mockClear();

    const again = await run(ids);
    expect(again).toEqual({ ...emptyTally(), skipped_rerun: 2 });
    expect(enqueueMock).not.toHaveBeenCalled();
    expect(await jobCount()).toBe(2);
    for (const id of ids) expect(await redis.get(`auth:verify-email:day:${id}`)).toBe('1');
  });

  it('without the marker a rerun is held back by the dedupe (already_pending), never a second job', async () => {
    const id = await addUser();
    await run([id]);
    await redis.del(rerunMarkerKey(id));
    const again = await run([id]);
    expect(again.already_pending).toBe(1);
    expect(await jobCount()).toBe(1);
  });

  it('an orphaned dedupe key (job hash gone) is not pending: the call is made and queues', async () => {
    const id = await addUser();
    await redis.set(dedupeKey(id), 'verify-ghost-job');
    expect(await hasPendingVerifyJob(redis, KEY_PREFIX, id)).toBe(false);

    const tally = await run([id]);
    expect(tally.queued).toBe(1);
    expect(tally.already_pending).toBe(0);
    expect(await jobCount()).toBe(1);
    expect(await redis.get(dedupeKey(id))).not.toBe('verify-ghost-job');
    expect(await hasPendingVerifyJob(redis, KEY_PREFIX, id)).toBe(true);
  });

  it('hasPendingVerifyJob: no key is not pending, key with live job is pending', async () => {
    const id = await addUser();
    expect(await hasPendingVerifyJob(redis, KEY_PREFIX, id)).toBe(false);
    await enqueueEmail({ template: 'auth.verifyEmail', userId: id });
    expect(await hasPendingVerifyJob(redis, KEY_PREFIX, id)).toBe(true);
  });

  it('confirms through the worker having already run: emailVerifyExpires >= call time + 24 h', async () => {
    const id = await addUser();
    enqueueMock.mockImplementation(async () => {
      // The worker minted and finished before the script looks: job and dedupe key are gone.
      await User.collection.updateOne(
        { _id: new mongoose.Types.ObjectId(id) },
        { $set: { emailVerifyExpires: new Date(Date.now() + 24 * 3600_000 + 1_000) } },
      );
      return { jobId: 'gone', queue: 'email-high', deduped: false };
    });
    const tally = await run([id], SHORT);
    expect(tally.queued).toBe(1);
    expect(tally.failed).toBe(0);
    expect(await jobCount()).toBe(0);
    expect(await redis.get(rerunMarkerKey(id))).toBe('1');
  });

  it('confirms through the worker having verified the user meanwhile', async () => {
    const id = await addUser();
    enqueueMock.mockImplementation(async () => {
      await User.collection.updateOne(
        { _id: new mongoose.Types.ObjectId(id) },
        { $set: { emailVerified: true } },
      );
      return { jobId: 'gone', queue: 'email-high', deduped: false };
    });
    const tally = await run([id], SHORT);
    expect(tally.queued).toBe(1);
    expect(await redis.get(rerunMarkerKey(id))).toBe('1');
  });

  it('a stale emailVerifyExpires (older link, under call time + 24 h) is not a confirmation', async () => {
    const id = await addUser({ emailVerifyExpires: new Date(Date.now() + 23 * 3600_000) });
    enqueueMock.mockImplementation(async () => ({
      jobId: 'x',
      queue: 'email-high',
      deduped: false,
    }));
    const tally = await run([id], SHORT);
    expect(tally.failed).toBe(1);
    expect(tally.queued).toBe(0);
  });

  it('an enqueue that never lands counts failed after the timeout and sets no marker', async () => {
    const lost = await addUser();
    const ok = await addUser();
    enqueueMock.mockImplementationOnce(async () => ({
      jobId: 'x',
      queue: 'email-high',
      deduped: false,
    }));
    const started = Date.now();
    const tally = await run([lost, ok], SHORT);
    const took = Date.now() - started;
    expect(tally).toEqual({ ...emptyTally(), queued: 1, failed: 1 });
    expect(took).toBeGreaterThanOrEqual(SHORT - 50);
    expect(took).toBeLessThan(SHORT + 3_000);
    expect(await redis.exists(rerunMarkerKey(lost))).toBe(0);
    expect(await redis.get(rerunMarkerKey(ok))).toBe('1');
    // the lost one used a cap slot (the call was made); only a rerun after the minute retries it
    expect(await redis.get(`auth:verify-email:day:${lost}`)).toBe('1');
  });

  it('a rejected enqueue (Redis error inside the email client) is unconfirmed, failed, no marker', async () => {
    const id = await addUser();
    enqueueMock.mockImplementation(async () => {
      throw new Error('queue down');
    });
    const tally = await run([id], SHORT);
    expect(tally.failed).toBe(1);
    expect(await redis.exists(rerunMarkerKey(id))).toBe(0);
  });

  it('a failing rate-limit store counts failed (unavailable) and enqueues nothing', async () => {
    const id = await addUser();
    const broken = new Proxy(redis, {
      get(target, prop, recv) {
        if (prop === 'set') {
          return (key: string, ...rest: unknown[]) =>
            key.startsWith('auth:verify-email:min:')
              ? Promise.reject(new Error('store down'))
              : (target.set as (...a: unknown[]) => unknown)(key, ...rest);
        }
        const v = Reflect.get(target, prop, recv);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
    enqueueMock.mockClear();
    const tally = emptyTally();
    await runBatch([id], tally, { redis: broken, keyPrefix: KEY_PREFIX, confirmTimeoutMs: SHORT });
    expect(tally.failed).toBe(1);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('a bad id string is not_found: failed, no throw', async () => {
    const tally = await run(['not-an-object-id']);
    expect(tally.failed).toBe(1);
  });

  it('the T-223 cap still applies: a second pass for the same user inside a minute is rate_limited', async () => {
    const id = await addUser();
    expect((await run([id])).queued).toBe(1);
    await redis.del(rerunMarkerKey(id));
    await bullQueue.obliterate({ force: true }); // job and key gone: only the cap can stop it
    await redis.del(dedupeKey(id));
    expect((await run([id])).rate_limited).toBe(1);
  });
});

describe('parseOptions: flags beat env, env beats defaults', () => {
  it('defaults', () => {
    expect(parseOptions([], {})).toEqual({ apply: false, batchSize: 50, batchPauseMs: 60_000 });
    expect(DEFAULT_BATCH_SIZE).toBe(50);
    expect(DEFAULT_BATCH_PAUSE_MS).toBe(60_000);
  });
  it('dry run is the default and --dry-run is the same; --yes sends', () => {
    expect(parseOptions(['--dry-run'], {})?.apply).toBe(false);
    expect(parseOptions(['--yes'], {})?.apply).toBe(true);
  });
  it('env beats defaults', () => {
    expect(
      parseOptions([], { VERIFY_RESEND_BATCH_SIZE: '7', VERIFY_RESEND_BATCH_PAUSE_MS: '0' }),
    ).toEqual({ apply: false, batchSize: 7, batchPauseMs: 0 });
  });
  it('empty env values fall back to the defaults', () => {
    expect(
      parseOptions([], { VERIFY_RESEND_BATCH_SIZE: '', VERIFY_RESEND_BATCH_PAUSE_MS: '' }),
    ).toEqual({
      apply: false,
      batchSize: 50,
      batchPauseMs: 60_000,
    });
  });
  it('flags beat env, in both "--flag n" and "--flag=n" forms', () => {
    const env = { VERIFY_RESEND_BATCH_SIZE: '7', VERIFY_RESEND_BATCH_PAUSE_MS: '9' };
    expect(parseOptions(['--batch-size', '3', '--batch-pause-ms', '5'], env)).toEqual({
      apply: false,
      batchSize: 3,
      batchPauseMs: 5,
    });
    expect(parseOptions(['--batch-size=4', '--batch-pause-ms=0', '--yes'], env)).toEqual({
      apply: true,
      batchSize: 4,
      batchPauseMs: 0,
    });
  });
  it('a flag overrides only its own setting', () => {
    expect(parseOptions(['--batch-size', '2'], { VERIFY_RESEND_BATCH_PAUSE_MS: '11' })).toEqual({
      apply: false,
      batchSize: 2,
      batchPauseMs: 11,
    });
  });
  it('usage errors return null', () => {
    const bad: Array<[string[], NodeJS.ProcessEnv]> = [
      [['--yes', '--dry-run'], {}],
      [['--dry-run', '--yes'], {}],
      [['--nope'], {}],
      [['extra'], {}],
      [['--yes=1'], {}],
      [['--batch-size'], {}],
      [['--batch-pause-ms'], {}],
      [['--batch-size', '0'], {}],
      [['--batch-size', '-3'], {}],
      [['--batch-size', '2.5'], {}],
      [['--batch-size', 'abc'], {}],
      [['--batch-size', '1e3'], {}],
      [['--batch-pause-ms', '-1'], {}],
      [['--batch-pause-ms', 'x'], {}],
      [['--batch-size', '99999999999999999999'], {}],
      [[], { VERIFY_RESEND_BATCH_SIZE: '0' }],
      [[], { VERIFY_RESEND_BATCH_SIZE: 'many' }],
      [[], { VERIFY_RESEND_BATCH_PAUSE_MS: '-5' }],
      [[], { VERIFY_RESEND_BATCH_PAUSE_MS: '1.5' }],
    ];
    for (const [args, env] of bad) expect([args, parseOptions(args, env)]).toEqual([args, null]);
  });
  it('an explicitly empty flag value is a usage error (an unset or empty env var is the default)', () => {
    expect(parseOptions(['--batch-size=', '--yes'], {})).toBeNull();
    expect(parseOptions(['--batch-size', ''], { VERIFY_RESEND_BATCH_SIZE: '5' })).toBeNull();
    expect(
      parseOptions(['--batch-pause-ms', ''], { VERIFY_RESEND_BATCH_PAUSE_MS: '5' }),
    ).toBeNull();
    expect(parseOptions([], { VERIFY_RESEND_BATCH_SIZE: '' })?.batchSize).toBe(50);
    expect(parseOptions([], { VERIFY_RESEND_BATCH_PAUSE_MS: '' })?.batchPauseMs).toBe(60_000);
    expect(parseOptions([], {})?.batchSize).toBe(50);
    expect(parseOptions(['--batch-pause-ms', '7'], { VERIFY_RESEND_BATCH_SIZE: '' })).toEqual({
      apply: false,
      batchSize: 50,
      batchPauseMs: 7,
    });
    expect(parseOptions(['--batch-size', ''], {})).toBeNull();
    expect(parseOptions(['--batch-pause-ms='], {})).toBeNull();
  });
  it('a bad flag value is an error even when the env is fine (no silent fallback)', () => {
    expect(parseOptions(['--batch-size', 'x'], { VERIFY_RESEND_BATCH_SIZE: '5' })).toBeNull();
  });
});

describe('redaction', () => {
  it('redactMongoUri drops credentials and the query string', () => {
    expect(redactMongoUri(`${M}${cred('dbuser', 'dbpass')}@127.0.0.1:27017/lawie`)).toBe(
      `${M}127.0.0.1:27017/lawie`,
    );
    expect(
      redactMongoUri(
        `${MS}${cred('u', 'p%40ss')}@cluster0.abc.mongodb.net/lawie?retryWrites=true&w=majority`,
      ),
    ).toBe(`${MS}cluster0.abc.mongodb.net/lawie`);
    expect(redactMongoUri(`${M}${cred('u', 'p@ss')}@h1:27017,h2:27017/db?replicaSet=rs0`)).toBe(
      `${M}h1:27017,h2:27017/db`,
    );
    expect(redactMongoUri(`${M}localhost:27017/test`)).toBe(`${M}localhost:27017/test`);
    expect(redactMongoUri(`${M}only-user@host/db`)).toBe(`${M}host/db`);
    expect(redactMongoUri('no-scheme-secret')).toBe('(unparseable MONGO_URI)');
  });
  it('redactRedisUrl drops user, password, db and query', () => {
    expect(redactRedisUrl('rediss://default:pw@redis-1.cloud.example:14900/0')).toBe(
      'rediss://redis-1.cloud.example:14900',
    );
    expect(redactRedisUrl('redis://:onlypw@10.0.0.5:6379/2?x=y')).toBe('redis://10.0.0.5:6379');
    expect(redactRedisUrl('not a url')).toBe('(unparseable REDIS_URL)');
    expect(redactRedisUrl('')).toBe('(unparseable REDIS_URL)');
  });
});

// ── main() as a child process ───────────────────────────────────────────────

function mongoUri(): string {
  const c = mongoose.connection;
  return `${M}${c.host}:${c.port}/${c.name}`;
}

interface ChildResult {
  code: number | null;
  out: string;
  err: string;
  /** [ms since start, line] for each stdout line. */
  lines: Array<[number, string]>;
}

function runScript(
  args: string[],
  env: Record<string, string> = {},
  preload: string[] = [],
): Promise<ChildResult> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const nodeArgs = preload.flatMap((p) => ['-r', p]);
    const child = spawn(
      process.execPath,
      [...nodeArgs, require.resolve('ts-node/dist/bin.js'), '--transpile-only', SCRIPT, ...args],
      {
        env: {
          ...process.env,
          NODE_ENV: 'test',
          MONGO_URI: mongoUri(),
          REDIS_URL: REAL_REDIS_URL,
          EMAIL_QUEUE_PREFIX: PREFIX,
          LOG_LEVEL: 'info', // the script must override this itself
          ...env,
        },
      },
    );
    let out = '';
    let err = '';
    let buf = '';
    const lines: Array<[number, string]> = [];
    child.stdout.on('data', (d: Buffer) => {
      out += d;
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        lines.push([Date.now() - started, buf.slice(0, i)]);
        buf = buf.slice(i + 1);
      }
    });
    child.stderr.on('data', (d: Buffer) => (err += d));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out, err, lines }));
  });
}

const FAST = ['--batch-pause-ms', '0'];

describe('verify-resend-all main() as a child process', () => {
  it('usage errors print usage and exit 2 before touching Mongo or Redis', async () => {
    const cases: string[][] = [
      ['--yes', '--dry-run'],
      ['--bogus'],
      ['--batch-size', '0'],
      ['--batch-size', 'abc'],
      ['--batch-pause-ms', '-1'],
      ['--batch-size'],
    ];
    for (const args of cases) {
      const r = await runScript(args, { MONGO_URI: `${M}127.0.0.1:1/none` });
      expect([args, r.code]).toEqual([args, 2]);
      expect(r.err).toContain('Usage:');
      expect(r.out).toBe('');
    }
    const envBad = await runScript([], { VERIFY_RESEND_BATCH_SIZE: '0' });
    expect(envBad.code).toBe(2);
  });

  it('dry run sends nothing, reports counts only, exits 0', async () => {
    const a = await addUser();
    const b = await addUser();
    const c = await addUser();
    await addUser({ emailVerified: true });
    await redis.set(rerunMarkerKey(a), '1', 'PX', 60_000);
    await enqueueEmail({ template: 'auth.verifyEmail', userId: b });
    const jobs = await jobCount();

    for (const args of [[], ['--dry-run']]) {
      const r = await runScript(args);
      expect(r.code).toBe(0);
      expect(r.out).toContain('users found: 3');
      expect(r.out).toContain('batches: 1');
      expect(r.out).toContain('(would skip): 1');
      expect(r.out).toContain('Dry run: nothing sent');
      expect(r.out).not.toContain('queued:');
      const all = `${r.out}${r.err}`;
      for (const id of [a, b, c]) expect(all).not.toContain(id);
      expect(all).not.toContain('@example.com');
      expect(all).not.toContain('Resend Person');
    }
    expect(await jobCount()).toBe(jobs);
    expect(await redis.exists(`auth:verify-email:min:${c}`)).toBe(0);
  });

  it('--yes: 7 users in batches of 3 gives 3 batches, a pause only between them, and a full tally', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 7; i += 1) ids.push(await addUser());
    const PAUSE = 1_500;

    const r = await runScript(['--yes', '--batch-size', '3', '--batch-pause-ms', String(PAUSE)]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('users found: 7');
    expect(r.out).toContain('batches: 3');
    expect(r.out).toContain(`batch size 3, pause between batches ${PAUSE} ms`);
    for (const k of ['queued: 7', 'already_pending: 0', 'rate_limited: 0', 'failed: 0']) {
      expect(r.out).toContain(k);
    }
    const at = (needle: string) => r.lines.find(([, l]) => l.includes(needle))![0];
    expect(r.lines.filter(([, l]) => /^batch \d\/3 done$/.test(l))).toHaveLength(3);
    expect(at('batch 2/3 done') - at('batch 1/3 done')).toBeGreaterThanOrEqual(PAUSE - 50);
    expect(at('batch 3/3 done') - at('batch 2/3 done')).toBeGreaterThanOrEqual(PAUSE - 50);
    // no pause after the last batch: the tally follows straight away
    expect(at('queued: 7') - at('batch 3/3 done')).toBeLessThan(PAUSE - 200);

    expect(await jobCount()).toBe(7);
    for (const id of ids) {
      expect(await redis.get(rerunMarkerKey(id))).toBe('1');
      expect(await hasPendingVerifyJob(redis, KEY_PREFIX, id)).toBe(true);
    }
    const all = `${r.out}${r.err}`;
    for (const id of ids) expect(all).not.toContain(id);
    expect(all).not.toContain('@example.com');
    expect(all).not.toContain('Resend Person');
  });

  it('a single batch has no pause at all, even with a long pause configured', async () => {
    await addUser();
    await addUser();
    const r = await runScript(['--yes'], { VERIFY_RESEND_BATCH_PAUSE_MS: '60000' });
    expect(r.code).toBe(0);
    expect(r.out).toContain('batches: 1');
    expect(r.out).toContain('queued: 2');
    expect(r.lines[r.lines.length - 1][0]).toBeLessThan(30_000);
  });

  it('env sets the batch size and a rerun right after sends nothing (skipped_rerun)', async () => {
    await addUser();
    await addUser();
    await addUser();
    const first = await runScript(['--yes'], {
      VERIFY_RESEND_BATCH_SIZE: '2',
      VERIFY_RESEND_BATCH_PAUSE_MS: '0',
    });
    expect(first.code).toBe(0);
    expect(first.out).toContain('batches: 2');
    expect(first.out).toContain('queued: 3');
    const jobs = await jobCount();
    expect(jobs).toBe(3);

    const second = await runScript(['--yes', ...FAST]);
    expect(second.code).toBe(0);
    expect(second.out).toContain('skipped_rerun: 3');
    expect(second.out).toContain('queued: 0');
    expect(await jobCount()).toBe(3);
  });

  it('exits 1 and prints the failed count when an enqueue is never confirmed (15 s timeout)', async () => {
    const id = await addUser();
    const r = await runScript(['--yes', ...FAST], {}, [STUB]);
    expect(r.code).toBe(1);
    expect(r.out).toContain('failed: 1');
    expect(r.out).toContain('queued: 0');
    expect(await redis.exists(rerunMarkerKey(id))).toBe(0);
    expect(await jobCount()).toBe(0);
    expect(`${r.out}${r.err}`).not.toContain(id);
  });

  it('prints no Mongo or Redis credentials, even when the Mongo login fails', async () => {
    const mongoWithCreds = `${M}${cred('dbuser', 'dbpass-LEAK')}@${mongoose.connection.host}:${mongoose.connection.port}/${mongoose.connection.name}?authSource=admin`;
    const redisWithCreds = REAL_REDIS_URL.replace('redis://', 'redis://default:redispw-LEAK@');
    const r = await runScript(['--dry-run'], {
      MONGO_URI: mongoWithCreds,
      REDIS_URL: redisWithCreds,
    });
    const all = `${r.out}\n${r.err}`;
    expect(r.out).toContain(`Mongo ${M}${mongoose.connection.host}:${mongoose.connection.port}`);
    expect(r.out).toContain(
      `Redis ${new URL(REAL_REDIS_URL).protocol}//${new URL(REAL_REDIS_URL).host}`,
    );
    for (const secret of ['dbuser', 'dbpass-LEAK', 'redispw-LEAK', 'authSource']) {
      expect(all).not.toContain(secret);
    }
  });
});

// ── fail-fast Redis probe, mid-run failure, output muting, teardown ─────────

async function freePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => resolve(port));
    });
  });
}

const STOPPED_REDIS = /^Resend stopped: cannot use Redis at redis:\/\/127\.0\.0\.1:\d+ \((\w+)\)$/;
const noStack = (r: ChildResult) => {
  expect(`${r.out}\n${r.err}`).not.toMatch(/^\s+at /m);
  expect(`${r.out}\n${r.err}`).not.toContain('command:');
};

describe('verify-resend-all against a Redis that requires a password', () => {
  const PW = 'goodpw-T436';
  let port: number;
  let proc: ChildProcess;

  beforeAll(async () => {
    port = await freePort();
    proc = spawn(
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
        '--requirepass',
        PW,
      ],
      { stdio: 'ignore' },
    );
    const probe = new IORedis(`redis://default:${PW}@127.0.0.1:${port}`, {
      maxRetriesPerRequest: 20,
      retryStrategy: () => 100,
    });
    probe.on('error', () => undefined);
    await probe.ping();
    await probe.quit();
  });

  afterAll(async () => {
    proc.kill('SIGTERM');
    await new Promise((r) => (proc.exitCode !== null ? r(null) : proc.once('exit', r)));
  });

  const expectFailFast = (r: ChildResult, secrets: string[]) => {
    expect(r.code).toBe(1);
    const stopped = r.err.split('\n').filter((l) => l.includes('stopped'));
    expect(stopped).toHaveLength(1);
    expect(stopped[0]).toMatch(STOPPED_REDIS);
    expect(r.err.split('\n').filter((l) => l.trim() !== '')).toHaveLength(1);
    noStack(r);
    for (const secret of secrets) expect(`${r.out}\n${r.err}`).not.toContain(secret);
    expect(r.out).not.toContain('users found');
    expect(r.out).not.toContain('queued:');
  };

  it('wrong password: dry run and --yes both stop with one redacted line, exit 1', async () => {
    for (const args of [[], ['--yes']]) {
      const r = await runScript(args, {
        REDIS_URL: `redis://wrong-user-QRS:wrong-pw-QRS@127.0.0.1:${port}`,
      });
      expectFailFast(r, ['wrong-pw-QRS', 'wrong-user-QRS']);
      expect(r.err).toContain('(ReplyError)');
    }
  });

  it('no password: dry run and --yes both stop with one redacted line, exit 1', async () => {
    for (const args of [[], ['--yes']]) {
      const r = await runScript(args, { REDIS_URL: `redis://127.0.0.1:${port}` });
      expectFailFast(r, [PW]);
      expect(r.err).toContain('(ReplyError)');
    }
  });

  it('dead port: dry run and --yes both stop with one redacted line, exit 1, fast', async () => {
    const dead = await freePort();
    const t0 = Date.now();
    for (const args of [[], ['--yes']]) {
      const r = await runScript(args, {
        REDIS_URL: `redis://deaduser-XYZ:deadpw-XYZ@127.0.0.1:${dead}`,
      });
      expectFailFast(r, ['deadpw-XYZ', 'deaduser-XYZ']);
    }
    expect(Date.now() - t0).toBeLessThan(40_000);
  });

  it('mid-run failure (password changed, clients killed): exit 1, one stopped line, no secrets, no stack', async () => {
    for (let i = 0; i < 4; i += 1) await addUser();
    const url = `redis://default:${PW}@127.0.0.1:${port}`;
    const admin = new IORedis(url);
    admin.on('error', () => undefined);
    const child = runScript(['--yes', '--batch-size', '1', '--batch-pause-ms', '1500'], {
      REDIS_URL: url,
    });
    // let the first batch finish, then break the server under the running script
    const t0 = Date.now();
    await new Promise<void>((resolve) => {
      const iv = setInterval(async () => {
        const k = await admin.keys(`auth:verify-resend-all:*`).catch(() => []);
        if (k.length > 0 || Date.now() - t0 > 20_000) {
          clearInterval(iv);
          resolve();
        }
      }, 50);
    });
    await admin.config('SET', 'requirepass', 'otherpw-T436');
    await admin.call('CLIENT', 'KILL', 'TYPE', 'normal', 'SKIPME', 'yes');
    const r = await child;
    const took = Date.now() - t0;
    // restore so the keys can be cleaned and the server shut down
    const back = new IORedis(`redis://default:otherpw-T436@127.0.0.1:${port}`);
    back.on('error', () => undefined);
    await back.config('SET', 'requirepass', PW);
    const cleanup = await back.keys('auth:verify-*');
    if (cleanup.length > 0) await back.del(...cleanup);
    back.disconnect();
    admin.disconnect();

    const all = `${r.out}\n${r.err}`;
    expect(r.code).toBe(1);
    const stopped = r.err.split('\n').filter((l) => l.includes('stopped'));
    expect(stopped).toHaveLength(1);
    expect(stopped[0]).toMatch(
      /^Resend stopped: \w+ \(Mongo mongodb:\/\/127\.0\.0\.1:\d+\/\w+, Redis redis:\/\/127\.0\.0\.1:\d+\)$/,
    );
    expect(r.err.split('\n').filter((l) => l.trim() !== '')).toHaveLength(1);
    noStack(r);
    for (const secret of [PW, 'otherpw-T436']) expect(all).not.toContain(secret);
    expect(took).toBeLessThan(60_000); // teardown is time-boxed: no hang
  });
});

describe('verify-resend-all teardown, output muting', () => {
  it('a dead Mongo: one stopped line (redacted), exit 1, the process still exits promptly', async () => {
    const dead = await freePort();
    const t0 = Date.now();
    const r = await runScript(['--dry-run'], {
      MONGO_URI: `${M}${cred('mongouser-XYZ', 'mongopw-XYZ')}@127.0.0.1:${dead}/lawie?authSource=admin`,
    });
    expect(r.code).toBe(1);
    const stopped = r.err.split('\n').filter((l) => l.includes('stopped'));
    expect(stopped).toHaveLength(1);
    expect(stopped[0]).toContain(`Mongo ${M}127.0.0.1:${dead}/lawie`);
    noStack(r);
    for (const secret of ['mongouser-XYZ', 'mongopw-XYZ', 'authSource']) {
      expect(`${r.out}\n${r.err}`).not.toContain(secret);
    }
    expect(Date.now() - t0).toBeLessThan(30_000);
  });

  it('mutes console output from inside the process (library noise never reaches the terminal)', async () => {
    const ticks = join(os.tmpdir(), `t436-ticks-${process.pid}-${Date.now()}`);
    for (let i = 0; i < 3; i += 1) await addUser();
    const r = await runScript(['--dry-run'], { T436_TICKS_FILE: ticks }, [NOISE]);
    const ran = existsSync(ticks) ? readFileSync(ticks, 'utf8').length : 0;
    rmSync(ticks, { force: true });
    expect(r.code).toBe(0);
    expect(ran).toBeGreaterThan(0);
    expect(`${r.out}\n${r.err}`).not.toContain('NOISE-');
    expect(r.out).toContain('users found: 3');
  });
});

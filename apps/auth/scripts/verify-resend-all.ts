/**
 * T-436 AC10 — one-off: one fresh verify email for every account still waiting on one
 * (Arjun 23:45 UTC, 14 Oct 2026, aligned to Ajay 8a2b639; batched send approved by Ajay).
 *
 *   yarn workspace @lawie/auth verify:resend-all              # dry run (default)
 *   yarn workspace @lawie/auth verify:resend-all --dry-run    # same
 *   yarn workspace @lawie/auth verify:resend-all --yes        # sends
 *   ... --batch-size 50 --batch-pause-ms 60000                # override the env / defaults
 *
 * Founder's order on each env (T-403): email-worker queue:purge dry run -> --yes -> set the
 * footer env -> deploy -> this script's dry run -> --yes.
 *
 * Who: emailVerified not true, not a Google account (authProvider / googleId, as T-351's
 * NOT_YET_VERIFIED in services/verify-email.service.ts), isActive not false, and no `erasure`
 * (T-115c: closing the account has started). Read with `_id` only.
 *
 * How: for each user, the real requestVerifyEmail(userId), so the T-223 per-user cap (1 per
 * 60 s, 5 per 24 h) and the T-390 one-pending-job dedupe apply unchanged. Before the call:
 *  - a user with this script's marker `auth:verify-resend-all:<userId>` (set after a confirmed
 *    queue, 30-day TTL: Ajay, exactly one fresh email) is skipped: skipped_rerun.
 *  - a user whose verify link was minted since this run started, or within the last 24 h (the
 *    link lifetime), already got a fresh email and is skipped too: skipped_rerun. This catches
 *    an enqueue that landed after the confirm window and was sent, but was never marked.
 *  - a user who already has a pending verify job (BullMQ dedupe key `de:verify:<userId>` on the
 *    verify queue, pointing at a job that still exists) is skipped: already_pending. The call
 *    is not made, so the cap is not used up and the pending job sends the email.
 *
 * Batches: VERIFY_RESEND_BATCH_SIZE users (default 50), then VERIFY_RESEND_BATCH_PAUSE_MS
 * (default 60000) before the next batch; --batch-size / --batch-pause-ms override the env.
 * These are an SES throttle (Arjun may slow them); the T-223 cap is per user and sets no rate
 * across users.
 *
 * requestVerifyEmail enqueues fire-and-forget. After each batch the script waits (up to
 * CONFIRM_TIMEOUT_MS) for each 'queued' user's job to show up: the dedupe key points at an
 * existing job, or the worker has already minted the link (emailVerifyExpires moved past the
 * call time + 24 h) or the user is now verified. Only a confirmed user counts as queued and
 * gets the marker; an unconfirmed one counts as failed and is retried by a rerun (the T-390
 * dedupe drops the job if it did land). Every confirmed enqueue has finished its Redis writes,
 * so the email client and the DB are closed only after all of them.
 *
 * Tally (after --yes): queued, already_pending, rate_limited, already_verified, failed
 * (unavailable, not_found, or enqueue not confirmed), skipped_rerun.
 *
 * Output is counts only, with the Mongo and Redis URLs redacted (no credentials). Auth's own
 * log lines name the userId, so this script runs the auth logger at `fatal`.
 *
 * Needs the auth env of the target environment (MONGO_URI, REDIS_URL, and what auth's env
 * module validates) and EMAIL_QUEUE_PREFIX if not the default `lawie`; loads .env.<NODE_ENV>
 * (default development) or .env from the repo root when they are not already set.
 *
 * Exit codes: 0 done (or dry run read), 1 failed (or any user counted failed), 2 usage.
 */
/* eslint-disable import/order, import/first, no-console */
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';

// apps/auth/scripts -> repo root.
const repoRoot = join(__dirname, '..', '..', '..');
for (const candidate of [`.env.${process.env.NODE_ENV ?? 'development'}`, '.env']) {
  const p = join(repoRoot, candidate);
  if (existsSync(p)) {
    loadDotenv({ path: p });
    break;
  }
}
// Auth's service log lines carry the userId; this script prints counts only.
process.env.LOG_LEVEL = 'fatal';

import {
  EMAIL_QUEUE_NAMES,
  EMAIL_TIER_BY_TEMPLATE,
  disconnectEmailClient,
} from '@lawie/email-client';
import IORedis from 'ioredis';
import type Redis from 'ioredis';
import mongoose from 'mongoose';

import { env } from '../src/config/env';
import redis from '../src/config/redis';
import { User } from '../src/models/User.model';
import { VERIFY_LINK_TTL_MS, requestVerifyEmail } from '../src/services/verify-email.service';
/* eslint-enable import/order, import/first */

const USAGE =
  'Usage: yarn workspace @lawie/auth verify:resend-all [--dry-run|--yes] ' +
  '[--batch-size <n>] [--batch-pause-ms <ms>]';

export const DEFAULT_BATCH_SIZE = 50;
export const DEFAULT_BATCH_PAUSE_MS = 60_000;
/** How long to wait, per batch, for the fire-and-forget enqueues to land. */
export const CONFIRM_TIMEOUT_MS = 15_000;
const CONFIRM_POLL_MS = 250;
/** Rerun marker lifetime: 30 days (Ajay: each affected user gets exactly one fresh email). */
export const RERUN_MARKER_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Earliest `emailVerifyExpires` that means "a fresh link was already minted". A mint sets the
 * expiry to mint time + VERIFY_LINK_TTL_MS (24 h), so:
 *  - minted since the run started  <=> expiry >= runStartedAt + 24 h
 *  - minted within the last 24 h   <=> expiry >  now
 * Either counts as already sent, so the threshold is the smaller of the two.
 */
export function freshLinkThreshold(runStartedAt: number, now: number = Date.now()): number {
  return Math.min(runStartedAt + VERIFY_LINK_TTL_MS, now);
}

/** True when the user's current verify link was minted after the threshold (see above). */
export async function hasFreshLink(userId: string, threshold: number): Promise<boolean> {
  if (!mongoose.Types.ObjectId.isValid(userId)) return false;
  // Raw read, the one field only; never printed.
  const doc = await User.collection.findOne(
    { _id: new mongoose.Types.ObjectId(userId) },
    { projection: { emailVerifyExpires: 1 } },
  );
  const expires = doc?.emailVerifyExpires instanceof Date ? doc.emailVerifyExpires.getTime() : 0;
  return expires >= threshold;
}

export const rerunMarkerKey = (userId: string): string => `auth:verify-resend-all:${userId}`;

/** Users still waiting on a verify email. Same rule as NOT_YET_VERIFIED, plus active, not erasing. */
export const RESEND_FILTER = {
  emailVerified: { $ne: true },
  authProvider: { $ne: 'google' },
  $or: [{ googleId: { $exists: false } }, { googleId: { $in: [null, ''] } }],
  isActive: { $ne: false },
  erasure: { $exists: false },
};

export type TallyBucket =
  | 'queued'
  | 'already_pending'
  | 'rate_limited'
  | 'already_verified'
  | 'failed'
  | 'skipped_rerun';
export const TALLY_BUCKETS: readonly TallyBucket[] = [
  'queued',
  'already_pending',
  'rate_limited',
  'already_verified',
  'failed',
  'skipped_rerun',
];
export type Tally = Record<TallyBucket, number>;

export interface Options {
  apply: boolean;
  batchSize: number;
  batchPauseMs: number;
}

function parseInteger(raw: string | undefined, min: number): number | null {
  if (raw === undefined || !/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return Number.isSafeInteger(n) && n >= min ? n : null;
}

/** Flags beat env, env beats the defaults. Null on a usage error. */
export function parseOptions(args: string[], source: NodeJS.ProcessEnv): Options | null {
  let apply = false;
  let dryRun = false;
  let batchSizeRaw: string | undefined;
  let batchPauseRaw: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    const eq = a.indexOf('=');
    const name = eq >= 0 ? a.slice(0, eq) : a;
    const inline = eq >= 0 ? a.slice(eq + 1) : undefined;
    if (name === '--yes' && inline === undefined) apply = true;
    else if (name === '--dry-run' && inline === undefined) dryRun = true;
    else if (name === '--batch-size' || name === '--batch-pause-ms') {
      const value = inline ?? args[(i += 1)];
      if (value === undefined) return null;
      if (name === '--batch-size') batchSizeRaw = value;
      else batchPauseRaw = value;
    } else return null;
  }
  if (apply && dryRun) return null;

  // A flag given with any value, empty included, must be a valid number: no silent fallback.
  // An unset or empty env var means "use the default".
  const resolve = (
    flag: string | undefined,
    envRaw: string | undefined,
    dflt: number,
    min: number,
  ) =>
    flag !== undefined
      ? parseInteger(flag, min)
      : envRaw === undefined || envRaw === ''
        ? dflt
        : parseInteger(envRaw, min);
  const batchSize = resolve(batchSizeRaw, source.VERIFY_RESEND_BATCH_SIZE, DEFAULT_BATCH_SIZE, 1);
  const batchPauseMs = resolve(
    batchPauseRaw,
    source.VERIFY_RESEND_BATCH_PAUSE_MS,
    DEFAULT_BATCH_PAUSE_MS,
    0,
  );
  if (batchSize === null || batchPauseMs === null) return null;
  return { apply, batchSize, batchPauseMs };
}

/** Same queue and prefix the email client puts the verify job on. */
export function verifyQueueKeyPrefix(source: NodeJS.ProcessEnv): string {
  const queue = EMAIL_QUEUE_NAMES[EMAIL_TIER_BY_TEMPLATE['auth.verifyEmail']];
  return `{${source.EMAIL_QUEUE_PREFIX ?? 'lawie'}}:${queue}:`;
}

/** True when the user's T-390 dedupe key points at a job that still exists (pending). */
export async function hasPendingVerifyJob(
  client: Redis,
  keyPrefix: string,
  userId: string,
): Promise<boolean> {
  const jobId = await client.get(`${keyPrefix}de:verify:${userId}`);
  if (!jobId) return false;
  // An orphaned key (job hash gone, T-416) is not pending: the email client repairs it.
  return (await client.exists(`${keyPrefix}${jobId}`)) === 1;
}

/** Evidence that the enqueue for userId (called at callStart) has landed. */
async function enqueueLanded(
  client: Redis,
  keyPrefix: string,
  userId: string,
  callStart: number,
): Promise<boolean> {
  if (await hasPendingVerifyJob(client, keyPrefix, userId)) return true;
  // The worker may already have run the job: it mints (expiry = mint time + 24 h) or finds the
  // user verified. Read raw, the two fields only; never printed.
  const doc = await User.collection.findOne(
    { _id: new mongoose.Types.ObjectId(userId) },
    { projection: { emailVerified: 1, emailVerifyExpires: 1 } },
  );
  if (!doc) return false;
  if (doc.emailVerified === true) return true;
  const expires = doc.emailVerifyExpires instanceof Date ? doc.emailVerifyExpires.getTime() : 0;
  return expires >= callStart + VERIFY_LINK_TTL_MS;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Our own output. Library console output is muted in the CLI (see guardOutput). */
const out = (line: string): void => void process.stdout.write(`${line}\n`);
const errOut = (line: string): void => void process.stderr.write(`${line}\n`);

/** Names of errors seen from Redis, Mongo or a library; reported by name only. */
const seenErrors = new Set<string>();
const errorName = (err: unknown): string =>
  err instanceof Error && typeof err.name === 'string' && err.name ? err.name : 'UnknownError';

/**
 * CLI only: the email client's ioredis and BullMQ objects have no 'error' listener, so a Redis
 * failure is printed raw through console, and a Redis AUTH error's `command.args` holds the
 * user and password. Mute every console method and turn unhandled errors into one redacted
 * line and exit 1, so nothing but this script's own lines can reach the terminal.
 */
function guardOutput(): void {
  const mute = (...args: unknown[]): void => {
    for (const a of args) if (a instanceof Error) seenErrors.add(errorName(a));
  };
  console.log = mute;
  console.info = mute;
  console.warn = mute;
  console.error = mute;
  console.debug = mute;
  console.trace = mute;
  const die = (err: unknown): void => {
    errOut(`Resend stopped: ${errorName(err)} (${redactedTarget()})`);
    process.exit(1);
  };
  process.on('unhandledRejection', die);
  process.on('uncaughtException', die);
  // Auth's shared client: its own listener logs through pino (muted at fatal); count the name.
  redis.on('error', (err: unknown) => seenErrors.add(errorName(err)));
}

function redactedTarget(): string {
  return `Mongo ${redactMongoUri(env.MONGO_URI)}, Redis ${redactRedisUrl(env.REDIS_URL)}`;
}

/** One PING on a client that never retries, so a bad URL or password fails fast and quietly. */
async function probeRedis(url: string): Promise<void> {
  const probe = new IORedis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
    connectTimeout: 5000,
    enableOfflineQueue: false,
  });
  probe.on('error', (err: unknown) => seenErrors.add(errorName(err)));
  try {
    await probe.connect();
    await probe.ping();
  } finally {
    probe.disconnect();
  }
}

/** Resolves after `p` or `ms`, whichever is first; never rejects. */
async function within(p: Promise<unknown>, ms: number): Promise<void> {
  await Promise.race([p.catch(() => undefined), sleep(ms)]);
}

/**
 * Sends one batch and waits for its enqueues. Mutates `tally`. Prints nothing.
 */
export async function runBatch(
  ids: string[],
  tally: Tally,
  deps: { redis: Redis; keyPrefix: string; confirmTimeoutMs?: number; runStartedAt?: number },
): Promise<void> {
  const runStartedAt = deps.runStartedAt ?? Date.now();
  const toConfirm: { userId: string; callStart: number }[] = [];
  for (const userId of ids) {
    if ((await deps.redis.exists(rerunMarkerKey(userId))) === 1) {
      tally.skipped_rerun += 1;
      continue;
    }
    if (await hasFreshLink(userId, freshLinkThreshold(runStartedAt))) {
      tally.skipped_rerun += 1;
      continue;
    }
    if (await hasPendingVerifyJob(deps.redis, deps.keyPrefix, userId)) {
      tally.already_pending += 1;
      continue;
    }
    const callStart = Date.now();
    const r = await requestVerifyEmail(userId, deps.redis);
    if (r.kind === 'queued') toConfirm.push({ userId, callStart });
    else if (r.kind === 'limited') tally.rate_limited += 1;
    else if (r.kind === 'already_verified') tally.already_verified += 1;
    else tally.failed += 1;
  }

  const deadline = Date.now() + (deps.confirmTimeoutMs ?? CONFIRM_TIMEOUT_MS);
  let waiting = toConfirm;
  while (waiting.length > 0) {
    const still: typeof waiting = [];
    for (const w of waiting) {
      if (await enqueueLanded(deps.redis, deps.keyPrefix, w.userId, w.callStart)) {
        await deps.redis.set(rerunMarkerKey(w.userId), '1', 'PX', RERUN_MARKER_TTL_MS);
        tally.queued += 1;
      } else still.push(w);
    }
    waiting = still;
    if (waiting.length === 0 || Date.now() >= deadline) break;
    await sleep(CONFIRM_POLL_MS);
  }
  tally.failed += waiting.length;
}

/**
 * Where the authority starts, with any user info dropped, or null when that is ambiguous.
 * A user-info part ends at the LAST `@`, but only if no `/`, `?`, `#` or `\` comes before that
 * `@`: those end the authority, so an `@` after one of them may be in the path or the query
 * (e.g. `?password=a@b`), or may be a password with an unencoded `/` in it
 * (`default:1234/x@host`, which the WHATWG parser reads as host `default`, port 1234). Both are
 * refused rather than guessed. The returned text never contains anything before that `@`.
 */
function authorityAfterUserInfo(rest: string): string | null {
  const at = rest.lastIndexOf('@');
  if (at < 0) return rest;
  if (/[/?#\\]/.test(rest.slice(0, at))) return null;
  return rest.slice(at + 1);
}

/** One host: a DNS name or IPv4, or a bracketed IPv6, with an optional numeric port. */
const HOST_RE =
  /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?$/;

/**
 * Scheme, host(s) and database of a Mongo URI, never the credentials or the query string:
 * `mongodb+srv://user:pw@cluster.x.net/lawie?w=1` prints as `mongodb+srv://cluster.x.net/lawie`.
 * Same user-info rule as the Redis URL; anything ambiguous or malformed prints as
 * `(unparseable MONGO_URI)`, so no input can print any part of the user or password.
 * gitleaks:allow
 */
export function redactMongoUri(uri: string): string {
  const bad = '(unparseable MONGO_URI)';
  const m = /^mongodb(?:\+srv)?:\/\//i.exec(uri);
  if (!m) return bad;
  const authority = authorityAfterUserInfo(uri.slice(m[0].length));
  if (authority === null) return bad;
  const [hostsAndPath] = authority.split(/[?#]/, 1);
  const slash = hostsAndPath.indexOf('/');
  const hosts = slash < 0 ? hostsAndPath : hostsAndPath.slice(0, slash);
  const db = slash < 0 ? '' : hostsAndPath.slice(slash + 1);
  if (hosts === '' || !hosts.split(',').every((h) => HOST_RE.test(h))) return bad;
  if (!/^[A-Za-z0-9_.$-]*$/.test(db)) return bad;
  return `${m[0]}${hosts}${slash < 0 ? '' : `/${db}`}`;
}

/**
 * Scheme, host and port of a Redis URL, never the user, password, db or query:
 * `rediss://default:pw@redis-1.cloud.example:14900/0` prints as
 * `rediss://redis-1.cloud.example:14900`. Anything ambiguous or malformed prints as
 * `(unparseable REDIS_URL)`, so no input can print any part of the user or password.
 * gitleaks:allow
 */
export function redactRedisUrl(url: string): string {
  const bad = '(unparseable REDIS_URL)';
  const m = /^(rediss?):\/\//i.exec(url);
  if (!m) return bad;
  const authority = authorityAfterUserInfo(url.slice(m[0].length));
  if (authority === null) return bad;
  const host = authority.split(/[/?#]/, 1)[0];
  if (!HOST_RE.test(host)) return bad;
  return `${m[1].toLowerCase()}://${host.toLowerCase()}`;
}

async function main(): Promise<number> {
  const runStartedAt = Date.now();
  const opts = parseOptions(process.argv.slice(2), process.env);
  if (!opts) {
    errOut(USAGE);
    return 2;
  }
  const keyPrefix = verifyQueueKeyPrefix(process.env);
  const target = redactedTarget();
  if (opts.apply) {
    out('='.repeat(72));
    out(`  --yes: SENDING verify emails via ${target}`);
    out('='.repeat(72));
  } else {
    out(`Target (dry run, nothing sent): ${target}`);
  }
  out(`batch size ${opts.batchSize}, pause between batches ${opts.batchPauseMs} ms`);

  try {
    await probeRedis(env.REDIS_URL);
  } catch (err) {
    // The probe's 'error' event names the cause (e.g. ReplyError for a bad password).
    const reason = [...seenErrors][0] ?? errorName(err);
    errOut(`Resend stopped: cannot use Redis at ${redactRedisUrl(env.REDIS_URL)} (${reason})`);
    return 1;
  }

  await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 5000, autoIndex: false });
  const users = await User.find(RESEND_FILTER, { _id: 1 }).lean();
  const ids = users.map((u) => String(u._id));
  const batches = Math.ceil(ids.length / opts.batchSize);
  out(`users found: ${ids.length}`);
  out(`batches: ${batches}`);

  if (!opts.apply) {
    let marked = 0;
    let fresh = 0;
    let pending = 0;
    for (const id of ids) {
      if ((await redis.exists(rerunMarkerKey(id))) === 1) marked += 1;
      else if (await hasFreshLink(id, freshLinkThreshold(runStartedAt))) fresh += 1;
      else if (await hasPendingVerifyJob(redis, keyPrefix, id)) pending += 1;
    }
    out(`of which sent by an earlier run in the last 30 days (would skip): ${marked}`);
    out(`of which have a verify link minted in the last 24 h (would skip): ${fresh}`);
    out(`of which already have a pending verify job (would skip): ${pending}`);
    const pauseSeconds = Math.round((Math.max(0, batches - 1) * opts.batchPauseMs) / 1000);
    out(`time spent in pauses: about ${pauseSeconds} s`);
    out('Dry run: nothing sent. Run with --yes to send.');
    return 0;
  }

  const tally: Tally = {
    queued: 0,
    already_pending: 0,
    rate_limited: 0,
    already_verified: 0,
    failed: 0,
    skipped_rerun: 0,
  };
  for (let b = 0; b < batches; b += 1) {
    const slice = ids.slice(b * opts.batchSize, (b + 1) * opts.batchSize);
    await runBatch(slice, tally, { redis, keyPrefix, runStartedAt });
    out(`batch ${b + 1}/${batches} done`);
    if (b < batches - 1 && opts.batchPauseMs > 0) await sleep(opts.batchPauseMs);
  }
  for (const k of TALLY_BUCKETS) out(`${k}: ${tally[k]}`);
  return tally.failed > 0 ? 1 : 0;
}

async function teardown(): Promise<void> {
  // Every confirmed enqueue has finished; close the producer's queues, then the DB and Redis.
  // Bounded, so a dead Redis or Mongo cannot keep the process from exiting.
  await within(disconnectEmailClient(), 5000);
  await within(mongoose.disconnect(), 5000);
  await within(redis.quit(), 2000);
  redis.disconnect();
}

if (require.main === module) {
  guardOutput();
  main()
    .then(async (code) => {
      await teardown();
      process.exit(code);
    })
    .catch(async (err: unknown) => {
      errOut(`Resend stopped: ${errorName(err)} (${redactedTarget()})`);
      await teardown();
      process.exit(1);
    });
}

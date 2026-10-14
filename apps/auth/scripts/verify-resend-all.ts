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
 *    queue, 24 h TTL) is skipped: skipped_rerun. A rerun never sends a second email.
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
/** Rerun marker lifetime: 24 h, the T-223 day window. */
export const RERUN_MARKER_TTL_MS = 24 * 60 * 60 * 1000;

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

  const sizeRaw = batchSizeRaw ?? source.VERIFY_RESEND_BATCH_SIZE;
  const pauseRaw = batchPauseRaw ?? source.VERIFY_RESEND_BATCH_PAUSE_MS;
  const batchSize =
    sizeRaw === undefined || sizeRaw === '' ? DEFAULT_BATCH_SIZE : parseInteger(sizeRaw, 1);
  const batchPauseMs =
    pauseRaw === undefined || pauseRaw === '' ? DEFAULT_BATCH_PAUSE_MS : parseInteger(pauseRaw, 0);
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

/**
 * Sends one batch and waits for its enqueues. Mutates `tally`. Prints nothing.
 */
export async function runBatch(
  ids: string[],
  tally: Tally,
  deps: { redis: Redis; keyPrefix: string; confirmTimeoutMs?: number },
): Promise<void> {
  const toConfirm: { userId: string; callStart: number }[] = [];
  for (const userId of ids) {
    if ((await deps.redis.exists(rerunMarkerKey(userId))) === 1) {
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
 * Scheme, host(s) and database of a Mongo URI, never the credentials or the query string
 * (as apps/billing/scripts/backfill-yearly-drip.ts). gitleaks:allow
 */
export function redactMongoUri(uri: string): string {
  const scheme = /^[a-z+]+:\/\//i.exec(uri)?.[0];
  if (!scheme) return '(unparseable MONGO_URI)';
  const rest = uri.slice(scheme.length);
  const afterCreds = rest.slice(rest.lastIndexOf('@') + 1);
  return scheme + afterCreds.split('?')[0];
}

/** Scheme, host and port of a Redis URL, never the user, password, db or query. */
export function redactRedisUrl(url: string): string {
  try {
    const u = new URL(url);
    if (!u.protocol || !u.hostname) return '(unparseable REDIS_URL)';
    return `${u.protocol}//${u.host}`;
  } catch {
    return '(unparseable REDIS_URL)';
  }
}

async function main(): Promise<number> {
  const opts = parseOptions(process.argv.slice(2), process.env);
  if (!opts) {
    console.error(USAGE);
    return 2;
  }
  const keyPrefix = verifyQueueKeyPrefix(process.env);
  const target = `Mongo ${redactMongoUri(env.MONGO_URI)}, Redis ${redactRedisUrl(env.REDIS_URL)}`;
  if (opts.apply) {
    console.log('='.repeat(72));
    console.log(`  --yes: SENDING verify emails via ${target}`);
    console.log('='.repeat(72));
  } else {
    console.log(`Target (dry run, nothing sent): ${target}`);
  }
  console.log(`batch size ${opts.batchSize}, pause between batches ${opts.batchPauseMs} ms`);

  await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 5000, autoIndex: false });
  const users = await User.find(RESEND_FILTER, { _id: 1 }).lean();
  const ids = users.map((u) => String(u._id));
  const batches = Math.ceil(ids.length / opts.batchSize);
  console.log(`users found: ${ids.length}`);
  console.log(`batches: ${batches}`);

  if (!opts.apply) {
    let marked = 0;
    let pending = 0;
    for (const id of ids) {
      if ((await redis.exists(rerunMarkerKey(id))) === 1) marked += 1;
      else if (await hasPendingVerifyJob(redis, keyPrefix, id)) pending += 1;
    }
    console.log(`of which sent by an earlier run in the last 24 h (would skip): ${marked}`);
    console.log(`of which already have a pending verify job (would skip): ${pending}`);
    const pauseSeconds = Math.round((Math.max(0, batches - 1) * opts.batchPauseMs) / 1000);
    console.log(`time spent in pauses: about ${pauseSeconds} s`);
    console.log('Dry run: nothing sent. Run with --yes to send.');
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
    await runBatch(slice, tally, { redis, keyPrefix });
    console.log(`batch ${b + 1}/${batches} done`);
    if (b < batches - 1 && opts.batchPauseMs > 0) await sleep(opts.batchPauseMs);
  }
  for (const k of TALLY_BUCKETS) console.log(`${k}: ${tally[k]}`);
  return tally.failed > 0 ? 1 : 0;
}

async function teardown(): Promise<void> {
  // Every confirmed enqueue has finished; close the producer's queues, then the DB and Redis.
  await disconnectEmailClient().catch(() => undefined);
  await mongoose.disconnect().catch(() => undefined);
  await redis.quit().catch(() => undefined);
}

if (require.main === module) {
  main()
    .then(async (code) => {
      await teardown();
      process.exit(code);
    })
    .catch(async (err: unknown) => {
      console.error(`Resend stopped: ${err instanceof Error ? err.name : 'UnknownError'}`);
      await teardown();
      process.exit(1);
    });
}

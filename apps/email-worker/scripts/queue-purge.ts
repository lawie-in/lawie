/**
 * T-436 AC10 — one-off: purge every held auth.verifyEmail job (Arjun 23:45 UTC, 14 Oct 2026,
 * aligned to Ajay 8a2b639: purge the held queue, never send weeks-late verify emails), and every
 * held auth.unverifiedDeletionNotice job (T-358; Arjun follow-up, approved by Priya), which would
 * otherwise fire at once when email is switched on.
 *
 *   yarn workspace @lawie/email-worker queue:purge            # dry run (default)
 *   yarn workspace @lawie/email-worker queue:purge --dry-run  # same
 *   yarn workspace @lawie/email-worker queue:purge --yes      # removes
 *
 * Founder's order on each env (T-403): purge dry run -> purge --yes -> set the footer env ->
 * deploy -> verify:resend-all dry run -> verify:resend-all --yes.
 *
 * What it removes: every job named auth.verifyEmail or auth.unverifiedDeletionNotice (and
 * carrying that same template in its data; see PURGE_TEMPLATES) on both worker
 * queues, in every state from which it could still be sent: wait, paused, prioritized, delayed
 * (incl. retry backoff), and active. An active job is only removed when no worker holds its lock
 * (a stalled job, which BullMQ would otherwise move back to wait and send); a locked one is
 * being sent right now and is counted, not touched. Failed jobs are final (BullMQ never retries
 * them on its own, only scripts/replay.ts does), so they are counted and kept for replay
 * history. Removing a verify job also clears its T-390 dedupe key (verify:<userId>), so the
 * user's next resend or verify:resend-all queues normally. Removing a notice job frees its
 * jobId (the sweep's idempotency key), so a later sweep run can queue that notice again.
 * Other templates are never touched.
 *
 * Output is counts only (per queue, per state, totals, per template) and the Redis host with no
 * credentials. The "verify jobs" wording of the per-queue and total lines covers both templates.
 * Never a user id, an address, a job id or job data.
 *
 * Needs REDIS_URL of the target env (and EMAIL_QUEUE_PREFIX if not the default `lawie`); loads
 * .env.<NODE_ENV> (default development) or .env from the repo root when they are not already
 * set. It reads them directly rather than the worker env module, which also demands
 * INTERNAL_SECRET, AUTH_SERVICE_URL and provider keys this script does not use.
 *
 * Exit codes: 0 done, 1 failed (or a job was locked by a worker or gone before removal), 2 usage.
 */
/* eslint-disable import/order, import/first, no-console */
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';

// apps/email-worker/scripts -> repo root.
const repoRoot = join(__dirname, '..', '..', '..');
for (const candidate of [`.env.${process.env.NODE_ENV ?? 'development'}`, '.env']) {
  const p = join(repoRoot, candidate);
  if (existsSync(p)) {
    loadDotenv({ path: p });
    break;
  }
}

import { Queue, type ConnectionOptions, type JobType } from 'bullmq';
import Redis from 'ioredis';

import { bullPrefix, WORKER_QUEUE_NAMES } from '../src/queues';
/* eslint-enable import/order, import/first */

/** Our own output. Library console output is muted in the CLI (see guardOutput). */
const out = (line: string): void => void process.stdout.write(`${line}\n`);
const errOut = (line: string): void => void process.stderr.write(`${line}\n`);

/** Names of errors seen from Redis or a library; reported by name only. */
const seenErrors = new Set<string>();
const errorName = (err: unknown): string =>
  err instanceof Error && typeof err.name === 'string' && err.name ? err.name : 'UnknownError';

/**
 * CLI only: ioredis and BullMQ print an error with no listener (or an "Unhandled error event")
 * through console, and a Redis AUTH error's `command.args` holds the user and password. Mute
 * every console method and turn unhandled errors into one redacted line and exit 1, so nothing
 * but this script's own lines can reach the terminal.
 */
function guardOutput(target: string): void {
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
    errOut(`Purge stopped: ${errorName(err)} (Redis ${target})`);
    process.exit(1);
  };
  process.on('unhandledRejection', die);
  process.on('uncaughtException', die);
}

/** One PING on a client that never retries, so a bad URL or password fails fast and quietly. */
async function probeRedis(url: string): Promise<void> {
  const probe = new Redis(url, {
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

const USAGE = 'Usage: yarn workspace @lawie/email-worker queue:purge [--dry-run|--yes]';

export const VERIFY_TEMPLATE = 'auth.verifyEmail';
/** T-358's notice; same string as packages/email-client EmailTemplate and worker.ts. */
export const UNVERIFIED_NOTICE_TEMPLATE = 'auth.unverifiedDeletionNotice';

/**
 * The only templates this script ever removes (Arjun, T-436 AC10 follow-up). A job counts only
 * when its BullMQ name AND its data.template are the same entry of this list. Order is the print
 * order.
 */
export const PURGE_TEMPLATES = [VERIFY_TEMPLATE, UNVERIFIED_NOTICE_TEMPLATE] as const;
export type PurgeTemplate = (typeof PURGE_TEMPLATES)[number];

/** States a held job can sit in and still be sent later. Order is the print order. */
export const PURGE_STATES = ['wait', 'paused', 'prioritized', 'delayed', 'active'] as const;
export type PurgeState = (typeof PURGE_STATES)[number];

const PAGE = 500;

export interface QueuePurgeCounts {
  queue: string;
  /** Held verify jobs found, per state. */
  found: Record<PurgeState, number>;
  /** Removed (always 0 in a dry run). */
  removed: number;
  /** Active and locked by a live worker: being sent now, not removed. */
  lockedActive: number;
  /** Found but gone or moved before removal (sent or removed by someone else meanwhile). */
  vanished: number;
  /** Failed purge-template jobs: final, not retried by BullMQ, kept. */
  failedKept: number;
}

/** Counts for one template, summed over both queues. */
export interface TemplatePurgeCounts {
  found: number;
  removed: number;
  lockedActive: number;
  vanished: number;
  failedKept: number;
}

export interface PurgeResult {
  queues: QueuePurgeCounts[];
  totalFound: number;
  totalRemoved: number;
  totalLockedActive: number;
  totalVanished: number;
  totalFailedKept: number;
  /** Per-template split of the totals. Always set by purgeHeldVerifyJobs. */
  byTemplate?: Record<PurgeTemplate, TemplatePurgeCounts>;
}

function zeroStates(): Record<PurgeState, number> {
  return { wait: 0, paused: 0, prioritized: 0, delayed: 0, active: 0 };
}

function zeroTemplates(): Record<PurgeTemplate, TemplatePurgeCounts> {
  const zero = (): TemplatePurgeCounts => ({
    found: 0,
    removed: 0,
    lockedActive: 0,
    vanished: 0,
    failedKept: 0,
  });
  return { [VERIFY_TEMPLATE]: zero(), [UNVERIFIED_NOTICE_TEMPLATE]: zero() };
}

/** The purge template of a job, or null when it is any other job (never touched). */
function purgeTemplateOf(
  job: { name?: unknown; data?: unknown } | undefined,
): PurgeTemplate | null {
  if (!job) return null;
  const template = (job.data as { template?: unknown } | null | undefined)?.template;
  for (const t of PURGE_TEMPLATES) {
    if (job.name === t && template === t) return t;
  }
  return null;
}

interface HeldJob {
  id: string;
  template: PurgeTemplate;
}

/** The purge-template jobs in one state, read page by page before anything is removed. */
async function purgeJobsIn(queue: Queue, state: JobType | 'failed'): Promise<HeldJob[]> {
  const held: HeldJob[] = [];
  for (let start = 0; ; start += PAGE) {
    const jobs = await queue.getJobs([state], start, start + PAGE - 1, true);
    for (const job of jobs) {
      const template = purgeTemplateOf(job);
      if (job && job.id && template) held.push({ id: job.id, template });
    }
    if (jobs.length < PAGE) break;
  }
  return held;
}

/**
 * Finds (and with apply=true removes) every held auth.verifyEmail and
 * auth.unverifiedDeletionNotice job on the worker's queues. The caller owns `connection`.
 * Prints nothing; returns counts only.
 */
export async function purgeHeldVerifyJobs(opts: {
  /** BullMQ connection (an ioredis client; typed loosely because bullmq bundles its own ioredis). */
  connection: ConnectionOptions;
  prefix: string;
  apply: boolean;
  queueNames?: readonly string[];
}): Promise<PurgeResult> {
  const result: PurgeResult = {
    queues: [],
    totalFound: 0,
    totalRemoved: 0,
    totalLockedActive: 0,
    totalVanished: 0,
    totalFailedKept: 0,
    byTemplate: zeroTemplates(),
  };
  const byTemplate = result.byTemplate as Record<PurgeTemplate, TemplatePurgeCounts>;

  for (const name of opts.queueNames ?? WORKER_QUEUE_NAMES) {
    const queue = new Queue(name, { connection: opts.connection, prefix: opts.prefix });
    // A BullMQ object with no 'error' listener prints the raw error, and a Redis AUTH error
    // carries the user and password in `command.args`. Never print it; a failure reaches the
    // caller as the rejected command instead.
    queue.on('error', () => undefined);
    try {
      const failed = await purgeJobsIn(queue, 'failed');
      for (const j of failed) byTemplate[j.template].failedKept += 1;
      const counts: QueuePurgeCounts = {
        queue: name,
        found: zeroStates(),
        removed: 0,
        lockedActive: 0,
        vanished: 0,
        failedKept: failed.length,
      };
      const byState = new Map<PurgeState, HeldJob[]>();
      for (const state of PURGE_STATES) {
        const held = await purgeJobsIn(queue, state);
        counts.found[state] = held.length;
        for (const j of held) byTemplate[j.template].found += 1;
        byState.set(state, held);
      }

      if (opts.apply) {
        for (const state of PURGE_STATES) {
          for (const { id, template } of byState.get(state) ?? []) {
            const t = byTemplate[template];
            const job = await queue.getJob(id);
            // Re-checked against the template it was listed under: a job id reused by another
            // template in between is not ours to remove.
            if (!job || purgeTemplateOf(job) !== template) {
              counts.vanished += 1;
              t.vanished += 1;
              continue;
            }
            // 1 removed, 0 locked by a worker (being processed). Throws only on a Redis error.
            const removed = await queue.remove(id);
            if (removed === 1) {
              counts.removed += 1;
              t.removed += 1;
            } else if ((await job.getState()) === 'active') {
              counts.lockedActive += 1;
              t.lockedActive += 1;
            } else {
              counts.vanished += 1;
              t.vanished += 1;
            }
          }
        }
      }

      const found = PURGE_STATES.reduce((n, s) => n + counts.found[s], 0);
      result.totalFound += found;
      result.totalRemoved += counts.removed;
      result.totalLockedActive += counts.lockedActive;
      result.totalVanished += counts.vanished;
      result.totalFailedKept += counts.failedKept;
      result.queues.push(counts);
    } finally {
      await queue.close();
    }
  }
  return result;
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

export function parseArgs(args: string[]): { apply: boolean } | null {
  const apply = args.includes('--yes');
  const unknown = args.filter((a) => a !== '--yes' && a !== '--dry-run');
  if (unknown.length > 0 || (apply && args.includes('--dry-run'))) return null;
  return { apply };
}

export function formatResult(result: PurgeResult, apply: boolean): string[] {
  const lines: string[] = [];
  for (const q of result.queues) {
    const states = PURGE_STATES.map((s) => `${s} ${q.found[s]}`).join(', ');
    const held = PURGE_STATES.reduce((n, s) => n + q.found[s], 0);
    lines.push(`${q.queue}: held verify jobs ${held} (${states})`);
    if (apply) {
      lines.push(
        `${q.queue}: removed ${q.removed}, active and locked (not removed) ${q.lockedActive}, gone before removal ${q.vanished}`,
      );
    }
    lines.push(`${q.queue}: failed verify jobs kept (final, not retried) ${q.failedKept}`);
  }
  lines.push(`total held verify jobs: ${result.totalFound}`);
  if (apply) {
    lines.push(`total removed: ${result.totalRemoved}`);
    lines.push(`total active and locked (not removed): ${result.totalLockedActive}`);
    lines.push(`total gone before removal: ${result.totalVanished}`);
  }
  lines.push(`total failed verify jobs kept: ${result.totalFailedKept}`);
  // The totals above cover every purge template (wording kept from round 2); split them here.
  if (result.byTemplate) {
    for (const t of PURGE_TEMPLATES) {
      const c = result.byTemplate[t];
      lines.push(
        apply
          ? `template ${t}: held ${c.found}, removed ${c.removed}, active and locked (not removed) ${c.lockedActive}, gone before removal ${c.vanished}, failed kept ${c.failedKept}`
          : `template ${t}: held ${c.found}, failed kept ${c.failedKept}`,
      );
    }
  }
  return lines;
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed) {
    errOut(USAGE);
    process.exit(2);
  }
  const { apply } = parsed;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    errOut('REDIS_URL is not set.');
    process.exit(2);
  }
  const redacted = redactRedisUrl(redisUrl);
  guardOutput(redacted);
  const prefix = bullPrefix(process.env.EMAIL_QUEUE_PREFIX);
  const target = `${redacted}, prefix ${prefix}`;
  if (apply) {
    out('='.repeat(72));
    out(`  --yes: REMOVING held ${PURGE_TEMPLATES.join(' and ')} jobs on ${target}`);
    out('='.repeat(72));
  } else {
    out(`Target (dry run, nothing removed): ${target}`);
  }

  try {
    await probeRedis(redisUrl);
  } catch (err) {
    // The probe's own 'error' event names the cause (e.g. ReplyError for a bad password); the
    // rejection itself is a generic "connection closed".
    const reason = [...seenErrors][0] ?? errorName(err);
    errOut(`Purge stopped: cannot use Redis at ${redacted} (${reason})`);
    process.exit(1);
  }

  const connection = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    // A few reconnects, then give up: pending commands reject and the run ends with exit 1
    // instead of waiting forever.
    retryStrategy: (times) => (times > 3 ? null : times * 500),
  });
  // Name only: an AUTH error carries the password in `command.args`.
  connection.on('error', (err: unknown) => seenErrors.add(errorName(err)));
  let result: PurgeResult;
  try {
    result = await purgeHeldVerifyJobs({
      connection: connection as unknown as ConnectionOptions,
      prefix,
      apply,
    });
  } finally {
    await connection.quit().catch(() => connection.disconnect());
  }

  for (const line of formatResult(result, apply)) out(line);
  if (!apply) {
    out('Dry run: nothing removed. Run with --yes to remove.');
    return;
  }
  let incomplete = false;
  if (result.totalLockedActive > 0) {
    errOut(
      'Some verify jobs are being sent by a live worker and were not removed. Stop the worker or wait, then rerun.',
    );
    incomplete = true;
  }
  if (result.totalVanished > 0) {
    // Gone between listing and removal: usually a worker took the job and sent it.
    errOut(
      `${result.totalVanished} verify job(s) were gone before removal, most likely taken and sent by a worker. Check that no email-worker is processing, then rerun.`,
    );
    incomplete = true;
  }
  if (incomplete) process.exit(1);
}

if (require.main === module) {
  main().catch((err: unknown) => {
    const target = process.env.REDIS_URL ? ` (Redis ${redactRedisUrl(process.env.REDIS_URL)})` : '';
    errOut(`Purge stopped: ${errorName(err)}${target}`);
    process.exit(1);
  });
}

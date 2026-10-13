/**
 * @lawie/email-client — one-line email enqueue API used across all backend
 * services (auth, billing, drafting). Per ADR-007 (Arjun, 2026-05-10).
 *
 * Contract (HARD CONSTRAINT):
 *   - enqueueEmail() must NEVER block the request path. Callers use
 *     `void enqueueEmail({...})` and move on. The BullMQ push is sub-10ms
 *     against the Redis Cloud already wired across all 4 services.
 *   - Templates live in apps/email-worker/src/templates/<group>/<name>/.
 *     The producer only carries the template id + data; rendering happens
 *     in the worker after dequeue so producers stay lean.
 *   - Idempotency keys are optional but strongly recommended for any
 *     event triggered by a webhook (Razorpay, SES bounce, etc.) — BullMQ
 *     uses the jobId for dedupe.
 *
 * One queue per priority tier (per ADR latency budgets):
 *   email:high → verifyEmail, passwordReset, paymentReceipt, paymentFailed
 *   email:low  → digest, draftComplete, monthlyInvoice, lowCredit, referral,
 *                advocatePackInvite, welcome
 */
import { randomUUID } from 'crypto';

import { Queue, JobsOptions } from 'bullmq';
import Redis from 'ioredis';

// ── Template registry (compile-time literal union) ──────────────────────────
//
// Email and password sign-up shipped after the 2026-05-17 Google-only decision, so
// T-223 (12 Oct 2026) adds auth.verifyEmail back. auth.passwordReset is still not
// on this list (T-223 leaves password reset out of scope).
export type EmailTemplate =
  | 'auth.welcome'
  | 'auth.verifyEmail'
  | 'billing.subscriptionConfirmed'
  | 'billing.paymentFailed'
  | 'billing.monthlyInvoice'
  | 'billing.lowCreditWarning'
  | 'drafting.draftComplete'
  | 'admin.referralIssued'
  | 'admin.advocatePackInvite'
  | 'admin.founderDailyDigest';

/** Tier → BullMQ queue name. (BullMQ disallows colons in queue names — uses
 *  hyphen instead. Redis key paths still namespace via the prefix arg.) */
const QUEUE_BY_TIER = {
  high: 'email-high',
  low: 'email-low',
} as const;

/** Template → tier (latency budget). */
const TIER_BY_TEMPLATE: Record<EmailTemplate, 'high' | 'low'> = {
  'auth.welcome': 'low',
  'auth.verifyEmail': 'high',
  'billing.subscriptionConfirmed': 'high',
  'billing.paymentFailed': 'high',
  'billing.monthlyInvoice': 'low',
  'billing.lowCreditWarning': 'low',
  'drafting.draftComplete': 'low',
  'admin.referralIssued': 'low',
  'admin.advocatePackInvite': 'low',
  'admin.founderDailyDigest': 'low',
};

// ── Public API ──────────────────────────────────────────────────────────────

/** Every template except auth.verifyEmail: the producer knows and sends the address. */
export interface EnqueueAddressedEmailInput {
  template: Exclude<EmailTemplate, 'auth.verifyEmail'>;
  to: string | string[];
  data: Record<string, unknown>;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  /** Optional explicit priority; defaults to TIER_BY_TEMPLATE[template]. */
  priority?: 'high' | 'low';
  /** Sub-10ms dedupe key. Identical key → BullMQ silently skips the push. */
  idempotencyKey?: string;
}

/**
 * T-223 (Arjun, condition 1): the verify-email job carries the userId only. No address, no
 * token, no link: the worker asks auth (/internal/verify-email/mint) for all three when it
 * runs the job. No idempotencyKey: the resend cap is enforced in auth before enqueueEmail is
 * called.
 *
 * T-390: at most ONE pending verify job per user (BullMQ deduplication, id `verify:<userId>`,
 * no ttl). While the worker is held (T-379, unfilled footer), resends used to pile up N jobs,
 * which on release meant N mints and N emails with only the last link working. Now a resend
 * that finds the user's job still waiting (or delayed for a retry) is dropped and the result
 * says `deduped: true`. The token is minted at SEND time, so the one email that goes out
 * carries the newest, working link.
 *
 * The dedup key lives only while that job is waiting / delayed / active: BullMQ deletes it
 * when the job completes or finally fails (or is removed). A resend after the email has gone
 * out queues a new job as normal. If a resend arrives while the job is ACTIVE (minting /
 * sending), it is also dropped: the user gets the email being sent right now, and its link
 * is valid because nothing mints after it. That is acceptable. `replace` / `extend` /
 * `keepLastIfActive` are deliberately not used (the job data is identical, so there is
 * nothing newer to keep).
 *
 * Retry backoff counts as pending: if the send failed and the job is delayed waiting for its
 * next attempt, a resend in that window is dropped too (the retry will mint and send). This
 * costs at most about one wasted resend against the cap, in line with Arjun's T-390 AC2 ruling
 * (the resend cap stays as is).
 *
 * T-416: if the dedup key points at a job that no longer exists (its hash was deleted outside
 * BullMQ, e.g. a manual DEL / FLUSH or eviction), the orphaned key is removed and the job is
 * added once more, so a stale key cannot block a user's verify emails.
 *
 * A fixed jobId such as `verify-<userId>` is NOT used: the completed job is kept 7 days
 * (removeOnComplete), so a fixed id would silently swallow a real later resend. Each add gets
 * a random jobId instead, which is only how a dedup hit is detected (BullMQ returns the
 * EXISTING job's id on a hit).
 */
export interface EnqueueVerifyEmailInput {
  template: 'auth.verifyEmail';
  userId: string;
  /** Optional explicit priority; defaults to TIER_BY_TEMPLATE['auth.verifyEmail'] ('high'). */
  priority?: 'high' | 'low';
}

export type EnqueueEmailInput = EnqueueAddressedEmailInput | EnqueueVerifyEmailInput;

export interface EnqueueEmailResult {
  jobId: string;
  queue: 'email-high' | 'email-low';
  /**
   * True when nothing was added: an existing job with the same idempotencyKey already existed,
   * or (auth.verifyEmail, T-390) the user already had a verify job pending.
   */
  deduped: boolean;
}

/**
 * Push an email onto the appropriate BullMQ queue. Sub-10ms p95 against
 * Redis Cloud. Producer is fire-and-forget — callers use `void enqueueEmail(...)`.
 */
export async function enqueueEmail(input: EnqueueEmailInput): Promise<EnqueueEmailResult> {
  const tier = input.priority ?? TIER_BY_TEMPLATE[input.template];
  const queueName = QUEUE_BY_TIER[tier];
  const queue = getQueue(queueName);

  const jobName = input.template;
  const opts: JobsOptions = {
    removeOnComplete: { age: 7 * 24 * 60 * 60, count: 1000 }, // keep 7 days / 1000 most recent
    removeOnFail: { age: 30 * 24 * 60 * 60 }, // keep 30 days for replay
    attempts: tier === 'high' ? 5 : 3,
    backoff: { type: 'exponential', delay: 5_000 },
  };

  if (input.template === 'auth.verifyEmail') {
    // No recipient in the job: `to` stays empty and the worker resolves it through auth.
    const verifyJobData = {
      template: input.template,
      to: [] as string[],
      cc: [] as string[],
      bcc: [] as string[],
      data: { userId: input.userId },
    };
    // T-390: one pending verify job per user. No ttl: the key is cleared when the job
    // completes or finally fails, so a resend after a send queues normally.
    const deduplicationId = `verify:${input.userId}`;
    const addVerifyJob = async (): Promise<EnqueueEmailResult> => {
      const requestedJobId = `verify-${randomUUID()}`;
      const verifyJob = await queue.add(jobName, verifyJobData, {
        ...opts,
        jobId: requestedJobId,
        deduplication: { id: deduplicationId },
      });
      // On a dedup hit BullMQ adds nothing and returns the id of the job already pending.
      const verifyJobId = verifyJob.id ?? requestedJobId;
      return {
        jobId: String(verifyJobId),
        queue: queueName,
        deduped: verifyJobId !== requestedJobId,
      };
    };

    const first = await addVerifyJob();
    if (!first.deduped) return first;

    // T-416: the dedup key points at a job whose hash is gone (deleted outside BullMQ: manual
    // DEL / FLUSH, eviction). BullMQ would keep dropping every resend for this user, so drop
    // the orphaned key and add once more. One retry only, no loop.
    const pending = await queue.getJob(first.jobId);
    if (pending) return first;
    await queue.removeDeduplicationKey(deduplicationId);
    return addVerifyJob();
  }

  const jobData = {
    template: input.template,
    to: Array.isArray(input.to) ? input.to : [input.to],
    cc: input.cc ?? [],
    bcc: input.bcc ?? [],
    replyTo: input.replyTo,
    data: input.data,
  };

  if (input.idempotencyKey) {
    opts.jobId = input.idempotencyKey;
  }

  const job = await queue.add(jobName, jobData, opts);
  // BullMQ returns the EXISTING job when jobId clashes. Detect by checking
  // whether the timestamp matches the current push.
  const deduped =
    typeof input.idempotencyKey === 'string' &&
    typeof job.timestamp === 'number' &&
    Date.now() - job.timestamp > 1000;

  return { jobId: String(job.id ?? input.idempotencyKey ?? jobName), queue: queueName, deduped };
}

// ── Internals ───────────────────────────────────────────────────────────────

// Single connection shared across all queues in this process. ioredis is
// safe to share; BullMQ wraps it. Keep `maxRetriesPerRequest: null` per
// BullMQ's recommendation so blocking commands don't time out.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sharedConnection: any = null;
const queueCache = new Map<string, Queue>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getConnection(): any {
  if (sharedConnection) return sharedConnection;
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL must be set before calling enqueueEmail()');
  }
  sharedConnection = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  return sharedConnection;
}

function getQueue(name: string): Queue {
  const existing = queueCache.get(name);
  if (existing) return existing;
  const prefix = process.env.EMAIL_QUEUE_PREFIX ?? 'lawie';
  const q = new Queue(name, {
    connection: getConnection(),
    prefix: `{${prefix}}`,
  });
  queueCache.set(name, q);
  return q;
}

/**
 * Test/CLI helper — closes the producer's Redis connection cleanly. Not
 * needed for normal request-path use (workers / dynos exit and close their
 * own connections); call from scripts that exit deterministically.
 */
export async function disconnectEmailClient(): Promise<void> {
  for (const q of queueCache.values()) {
    await q.close();
  }
  queueCache.clear();
  if (sharedConnection) {
    await sharedConnection.quit();
    sharedConnection = null;
  }
}

// Re-export so the worker can subscribe to the same queue names without
// hard-coding the strings.
export const EMAIL_QUEUE_NAMES = QUEUE_BY_TIER;
export const EMAIL_TIER_BY_TEMPLATE = TIER_BY_TEMPLATE;

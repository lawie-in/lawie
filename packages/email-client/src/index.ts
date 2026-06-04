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
import { Queue, JobsOptions } from 'bullmq';
import Redis from 'ioredis';

// ── Template registry (compile-time literal union) ──────────────────────────
//
// Founder decision 2026-05-17: only Google OAuth ships in Phase 1, so
// auth.verifyEmail (Google pre-verifies) and auth.passwordReset (no password)
// are not on this list. Re-introduce them later if non-OAuth login lands.
export type EmailTemplate =
  | 'auth.welcome'
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

export interface EnqueueEmailInput {
  template: EmailTemplate;
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

export interface EnqueueEmailResult {
  jobId: string;
  queue: 'email-high' | 'email-low';
  /** True when an existing job with the same idempotencyKey already existed. */
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
  const jobData = {
    template: input.template,
    to: Array.isArray(input.to) ? input.to : [input.to],
    cc: input.cc ?? [],
    bcc: input.bcc ?? [],
    replyTo: input.replyTo,
    data: input.data,
  };

  const opts: JobsOptions = {
    removeOnComplete: { age: 7 * 24 * 60 * 60, count: 1000 }, // keep 7 days / 1000 most recent
    removeOnFail: { age: 30 * 24 * 60 * 60 }, // keep 30 days for replay
    attempts: tier === 'high' ? 5 : 3,
    backoff: { type: 'exponential', delay: 5_000 },
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
let sharedConnection: Redis | null = null;
const queueCache = new Map<string, Queue>();

function getConnection(): Redis {
  if (sharedConnection) return sharedConnection;
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL must be set before calling enqueueEmail()');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sharedConnection = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  }) as any;
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

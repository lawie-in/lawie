/**
 * Single BullMQ worker process — drains both email:high and email:low
 * queues, renders the requested template, sends via the configured provider.
 *
 * Concurrency: EMAIL_WORKER_CONCURRENCY (default 5). One Worker instance
 * per queue so the high-tier queue isn't starved by low-tier backlog.
 *
 * Failure handling:
 *  - Any thrown error fails the attempt; BullMQ retries with the producer's
 *    `attempts` / exponential `backoff` (packages/email-client), then keeps
 *    the job as failed for 30 days for scripts/replay.ts.
 *  - The processor always rethrows a sanitised error (EmailSendError from the
 *    provider, or toSentrySafeError: name, code and stack frames, no message),
 *    so BullMQ's stored failedReason holds no address or template data.
 *  - Sentry breadcrumb on every send.start / send.success / send.failure
 *
 * T-220 AC6: logs and Sentry carry template id, user id (data.userId, when
 * the producer sets it), job id and counts. Never an address or the body.
 *
 * T-223 (Arjun, condition 2): an auth.verifyEmail job carries the userId only.
 * The processor asks auth (POST AUTH_SERVICE_URL/internal/verify-email/mint,
 * INTERNAL_SECRET header) for the address, name and a freshly minted link, then
 * renders and sends. A 409 (already verified, or a Google account) or a 404 (no
 * such user) completes the job with no send and no Sentry event. The mint
 * response is never logged, never put in job data, meta, the return value,
 * failedReason or Sentry. A BullMQ retry mints again; the newest link wins.
 *
 * Test seam (T-220 AC4): createProcessor(send, mint) takes the provider send
 * function and the verify-link mint function, and startWorkers({ connection, send }) takes both the Redis
 * connection and the send function, so a test can force a provider error
 * against its own Redis without jest.mock. Importing this module opens no
 * Redis connection; startWorkers() does, unless one is passed in.
 */
import { type EmailTemplate } from '@lawie/email-client';
import { INTERNAL_HEADERS } from '@lawie/shared';
import * as Sentry from '@sentry/node';
import {
  UnrecoverableError,
  Worker,
  type ConnectionOptions,
  type Processor,
  type Job,
} from 'bullmq';
import Redis from 'ioredis';

import { env } from './config/env';
import { logger } from './config/logger';
import { anyTemplateUnfilled, isLiveSend, templateHasUnfilledFooter } from './placeholders';
import { sendEmail, type SendEmailFn } from './providers';
import { safeErrorFields, toSentrySafeError, userIdFromData } from './providers/safe-log';
import { bullPrefix, WORKER_QUEUE_NAMES } from './queues';
import { renderTemplate } from './templates';

export interface EmailJobData {
  template: EmailTemplate;
  to: string[];
  cc: string[];
  bcc: string[];
  replyTo?: string;
  data: Record<string, unknown>;
}

/**
 * True when BullMQ will NOT retry this job after the current attempt fails.
 * Mirrors Job.shouldRetryJob() in bullmq 5.x: inside the processor
 * `attemptsMade` counts the attempts that already finished (it is
 * incremented in moveToFailed, after the processor throws), so the current
 * attempt is `attemptsMade + 1`, and BullMQ retries only while
 * `attemptsMade + 1 < opts.attempts`. A missing `opts.attempts` means one
 * attempt. An UnrecoverableError is never retried either. (BullMQ also skips
 * retries for job.discard(), but `discarded` is protected and this worker
 * never calls discard().)
 */
export function isFinalAttempt(job: Job, err?: unknown): boolean {
  if ((err as { name?: unknown } | undefined)?.name === 'UnrecoverableError') return true;
  return job.attemptsMade + 1 >= (job.opts?.attempts ?? 1);
}

// ── T-223: verify-link mint (auth) ──────────────────────────────────────────

/** What auth's mint route returns. PII and a live credential: never log any of it. */
export interface MintedVerifyLink {
  email: string;
  name: string;
  link: string;
}

/**
 * Asks auth to mint a verify link for userId. Returns null when auth refuses with 409
 * (already verified, or a Google account) or 404 (no such user): the job is dropped.
 * Throws a value-free error on any other failure, so BullMQ retries.
 */
export type MintVerifyLinkFn = (userId: string) => Promise<MintedVerifyLink | null>;

/** Value-free error for a failed mint call: name + code only, no URL, no body. */
class VerifyMintError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(`verify-email mint failed: ${code}`);
    this.name = 'VerifyMintError';
    this.code = code;
  }
}

const MINT_TIMEOUT_MS = 10_000;

export const mintVerifyLinkViaAuth: MintVerifyLinkFn = async (userId) => {
  const res = await fetch(`${env.AUTH_SERVICE_URL}/internal/verify-email/mint`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [INTERNAL_HEADERS.SECRET]: env.INTERNAL_SECRET,
    },
    body: JSON.stringify({ userId }),
    signal: AbortSignal.timeout(MINT_TIMEOUT_MS),
  });
  if (res.status === 409 || res.status === 404) return null;
  if (!res.ok) throw new VerifyMintError(`HTTP_${res.status}`);
  const body = (await res.json().catch(() => null)) as Partial<MintedVerifyLink> | null;
  if (
    !body ||
    typeof body.email !== 'string' ||
    body.email.length === 0 ||
    typeof body.link !== 'string' ||
    body.link.length === 0
  ) {
    throw new VerifyMintError('BAD_RESPONSE');
  }
  return {
    email: body.email,
    name: typeof body.name === 'string' ? body.name : '',
    link: body.link,
  };
};

const UNFILLED_PLACEHOLDER_MESSAGE = 'email has unfilled footer placeholders; not sent';
/** Errors raised by the placeholder guard: rethrown as-is, without the Sentry/log path. */
const placeholderRefusals = new WeakSet<object>();

export function createProcessor(
  send: SendEmailFn = sendEmail,
  mint: MintVerifyLinkFn = mintVerifyLinkViaAuth,
): Processor<EmailJobData> {
  return async (job: Job<EmailJobData>) => {
    const { template, cc, bcc, replyTo, data } = job.data;
    const userId = userIdFromData(data);
    const jobId = job.id;
    const attempt = job.attemptsMade + 1;
    const isVerify = template === 'auth.verifyEmail';
    Sentry.addBreadcrumb({
      category: 'email.send.start',
      level: 'info',
      data: {
        jobId,
        queue: job.queueName,
        template,
        userId,
        attempt,
        recipientsCount: job.data.to.length,
      },
    });

    try {
      // T-223 review / Ajay, T-379: no live send while the template's own footer still has
      // [registered address] or [PIN]. Checked on the static footer, before auth's mint, so a
      // refused job never rotates the user's verify token. Dry run is unaffected. Fixed message,
      // ids only, no Sentry, no retry.
      if (isLiveSend() && templateHasUnfilledFooter(template)) {
        logger.error({ userId, jobId }, 'Email not sent: unfilled footer placeholders');
        const refusal = new UnrecoverableError(UNFILLED_PLACEHOLDER_MESSAGE);
        placeholderRefusals.add(refusal);
        throw refusal;
      }

      let to = job.data.to;
      let renderData = data;
      if (isVerify) {
        // T-223: the address, name and link come from auth at send time, never from the job.
        if (!userId) throw new UnrecoverableError('auth.verifyEmail job without a userId');
        const minted = await mint(userId);
        if (!minted) {
          logger.info(
            { jobId, template, userId },
            'Verify email not sent: already verified, Google account or no such user',
          );
          return { skipped: 'not_eligible' };
        }
        to = [minted.email];
        renderData = { name: minted.name, verifyUrl: minted.link, userId };
      }

      const rendered = await renderTemplate(template, renderData);
      const result = await send({
        to,
        cc: isVerify ? [] : cc,
        bcc: isVerify ? [] : bcc,
        replyTo: isVerify ? undefined : replyTo,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        meta: { template, userId, jobId },
      });
      Sentry.addBreadcrumb({
        category: 'email.send.success',
        level: 'info',
        data: { jobId, template, userId, messageId: result.messageId },
      });
      logger.info(
        { jobId, template, userId, queue: job.queueName, messageId: result.messageId },
        'Email sent',
      );
      // T-223 AC7: in dry run, one line with the userId only (no address, token or link).
      if (isVerify && !isLiveSend()) logger.info({ userId }, 'verify email sent');
      return { messageId: result.messageId };
    } catch (err) {
      // Already logged (ids only) where it was raised; no Sentry event, no retry.
      if (placeholderRefusals.has(err as object)) throw err;
      const errFields = safeErrorFields(err);
      Sentry.addBreadcrumb({
        category: 'email.send.failure',
        level: 'error',
        data: { jobId, template, userId, attempt, error: errFields },
      });
      // Name/code/status only, no original message: this is what Sentry gets
      // AND what BullMQ stores as failedReason (kept 30 days). Throwing it
      // still fails the attempt, so BullMQ retries as before.
      const safeErr = toSentrySafeError(err);
      // T-353: one Sentry event per dead job, not one per retry. The
      // breadcrumb above and the log line below still fire on every attempt.
      const finalAttempt = isFinalAttempt(job, safeErr);
      if (finalAttempt) {
        Sentry.captureException(safeErr, {
          tags: { template, queue: job.queueName },
          extra: { jobId, userId, attempt, maxAttempts: job.opts?.attempts ?? 1 },
        });
      }
      logger.error(
        { jobId, template, userId, attempt, finalAttempt, err: errFields },
        'Email send failed',
      );
      throw safeErr;
    }
  };
}

export const workers: Worker[] = [];

let ownConnection: Redis | null = null;

function defaultConnection(): Redis {
  if (!ownConnection) {
    ownConnection = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return ownConnection;
}

export interface StartWorkersOptions {
  /** Redis connection for BullMQ; defaults to one built from REDIS_URL. */
  connection?: ConnectionOptions;
  /** Provider send function; defaults to the configured provider. */
  send?: SendEmailFn;
  /** T-223 verify-link mint function; defaults to the call to auth's internal route. */
  mint?: MintVerifyLinkFn;
}

export function startWorkers(options: StartWorkersOptions = {}): Worker[] {
  // T-379: in live mode, start no processors while any template's footer still has the
  // founder's placeholders. The process stays up (no pm2 crash loop) and /health reports
  // unhealthy; jobs stay queued and go out once the footer is filled and the worker restarts.
  if (isLiveSend() && anyTemplateUnfilled()) {
    logger.warn(
      'Workers not started (live mode): email footer placeholders are not filled in yet; jobs stay queued until the footer is filled and the worker restarts',
    );
    return [];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connection = options.connection ?? (defaultConnection() as any);
  const processor = createProcessor(options.send, options.mint);
  const started: Worker[] = [];
  for (const queueName of WORKER_QUEUE_NAMES) {
    const worker = new Worker<EmailJobData>(queueName, processor, {
      connection,
      concurrency: env.EMAIL_WORKER_CONCURRENCY,
      prefix: bullPrefix(env.EMAIL_QUEUE_PREFIX),
    });
    worker.on('completed', (job, result) => {
      logger.debug({ jobId: job.id, queue: queueName, result }, 'Job completed');
    });
    // T-353: without an 'error' listener a BullMQ/Redis error is emitted
    // unhandled and reaches process-level handlers with the raw error.
    worker.on('error', (err) => {
      logger.error({ queue: queueName, err: safeErrorFields(err) }, 'Worker error');
    });
    worker.on('failed', (job, err) => {
      logger.warn(
        {
          jobId: job?.id,
          queue: queueName,
          template: job?.data.template,
          attemptsMade: job?.attemptsMade,
          err: safeErrorFields(err),
        },
        'Job failed',
      );
    });
    workers.push(worker);
    started.push(worker);
    logger.info({ queue: queueName, concurrency: env.EMAIL_WORKER_CONCURRENCY }, 'Worker started');
  }
  return started;
}

export async function stopWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close()));
  workers.length = 0;
  if (ownConnection) {
    await ownConnection.quit();
    ownConnection = null;
  }
}

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
 * Test seam (T-220 AC4): createProcessor(send) takes the provider send
 * function, and startWorkers({ connection, send }) takes both the Redis
 * connection and the send function, so a test can force a provider error
 * against its own Redis without jest.mock. Importing this module opens no
 * Redis connection; startWorkers() does, unless one is passed in.
 */
import { EMAIL_QUEUE_NAMES, type EmailTemplate } from '@lawie/email-client';
import * as Sentry from '@sentry/node';
import { Worker, type ConnectionOptions, type Processor, type Job } from 'bullmq';
import Redis from 'ioredis';

import { env } from './config/env';
import { logger } from './config/logger';
import { sendEmail, type SendEmailFn } from './providers';
import { safeErrorFields, toSentrySafeError, userIdFromData } from './providers/safe-log';
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

export function createProcessor(send: SendEmailFn = sendEmail): Processor<EmailJobData> {
  return async (job: Job<EmailJobData>) => {
    const { template, to, cc, bcc, replyTo, data } = job.data;
    const userId = userIdFromData(data);
    const jobId = job.id;
    const attempt = job.attemptsMade + 1;
    Sentry.addBreadcrumb({
      category: 'email.send.start',
      level: 'info',
      data: { jobId, queue: job.queueName, template, userId, attempt, recipientsCount: to.length },
    });

    try {
      const rendered = await renderTemplate(template, data);
      const result = await send({
        to,
        cc,
        bcc,
        replyTo,
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
      return { messageId: result.messageId };
    } catch (err) {
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
}

export function startWorkers(options: StartWorkersOptions = {}): Worker[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connection = options.connection ?? (defaultConnection() as any);
  const processor = createProcessor(options.send);
  const started: Worker[] = [];
  for (const queueName of [EMAIL_QUEUE_NAMES.high, EMAIL_QUEUE_NAMES.low]) {
    const worker = new Worker<EmailJobData>(queueName, processor, {
      connection,
      concurrency: env.EMAIL_WORKER_CONCURRENCY,
      prefix: `{${env.EMAIL_QUEUE_PREFIX}}`,
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

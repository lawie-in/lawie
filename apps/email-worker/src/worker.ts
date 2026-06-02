/**
 * Single BullMQ worker process — drains both email:high and email:low
 * queues, renders the requested template, sends via the configured provider.
 *
 * Concurrency: EMAIL_WORKER_CONCURRENCY (default 5). One Worker instance
 * per queue so the high-tier queue isn't starved by low-tier backlog.
 *
 * Failure handling:
 *  - Render error                 → permanent fail (no retry)
 *  - SES 4xx (bad recipient etc.) → permanent fail
 *  - SES 5xx / network            → retry with exponential backoff per
 *                                   producer's `attempts` setting
 *  - Sentry breadcrumb on every enqueue / send.start / send.success / send.failure
 */
import { EMAIL_QUEUE_NAMES, type EmailTemplate } from '@lawie/email-client';
import * as Sentry from '@sentry/node';
import { Worker, type Processor, type Job } from 'bullmq';
import Redis from 'ioredis';

import { env } from './config/env';
import { logger } from './config/logger';
import { sendEmail } from './providers';
import { renderTemplate } from './templates';

interface EmailJobData {
  template: EmailTemplate;
  to: string[];
  cc: string[];
  bcc: string[];
  replyTo?: string;
  data: Record<string, unknown>;
}

const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const processor: Processor<EmailJobData> = async (job: Job<EmailJobData>) => {
  const { template, to, cc, bcc, replyTo, data } = job.data;
  Sentry.addBreadcrumb({
    category: 'email.send.start',
    level: 'info',
    data: {
      jobId: job.id,
      queue: job.queueName,
      template,
      recipientsCount: to.length,
    },
  });

  try {
    const rendered = await renderTemplate(template, data);
    const result = await sendEmail({
      to,
      cc,
      bcc,
      replyTo,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    Sentry.addBreadcrumb({
      category: 'email.send.success',
      level: 'info',
      data: { jobId: job.id, template, messageId: result.messageId },
    });
    logger.info(
      { jobId: job.id, template, queue: job.queueName, messageId: result.messageId },
      'Email sent',
    );
    return { messageId: result.messageId };
  } catch (err) {
    Sentry.addBreadcrumb({
      category: 'email.send.failure',
      level: 'error',
      data: { jobId: job.id, template, error: (err as Error).message },
    });
    Sentry.captureException(err);
    logger.error({ err, jobId: job.id, template }, 'Email send failed');
    throw err;
  }
};

export const workers: Worker[] = [];

export function startWorkers(): void {
  for (const queueName of [EMAIL_QUEUE_NAMES.high, EMAIL_QUEUE_NAMES.low]) {
    const worker = new Worker<EmailJobData>(queueName, processor, {
      connection,
      concurrency: env.EMAIL_WORKER_CONCURRENCY,
      prefix: `{${env.EMAIL_QUEUE_PREFIX}}`,
    });
    worker.on('completed', (job, result) => {
      logger.debug({ jobId: job.id, queue: queueName, result }, 'Job completed');
    });
    worker.on('failed', (job, err) => {
      logger.warn({ jobId: job?.id, queue: queueName, err: err.message }, 'Job failed');
    });
    workers.push(worker);
    logger.info({ queue: queueName, concurrency: env.EMAIL_WORKER_CONCURRENCY }, 'Worker started');
  }
}

export async function stopWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close()));
  await connection.quit();
}

/**
 * Replay CLI — re-runs a single failed job by jobId.
 *
 *   yarn workspace @lawie/email-worker replay <queueName> <jobId>
 *
 * Example:
 *   yarn workspace @lawie/email-worker replay email:high 12345
 */
import path from 'path';

import { Queue } from 'bullmq';
import dotenv from 'dotenv';
import Redis from 'ioredis';

dotenv.config({
  path: path.resolve(__dirname, `../../../.env.${process.env.NODE_ENV ?? 'development'}`),
});

async function main(): Promise<void> {
  const [, , queueName, jobId] = process.argv;
  if (!queueName || !jobId) {
    console.error('Usage: yarn workspace @lawie/email-worker replay <queueName> <jobId>');
    process.exit(2);
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.error('REDIS_URL must be set');
    process.exit(1);
  }
  const prefix = process.env.EMAIL_QUEUE_PREFIX ?? 'lawie';

  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false });
  const queue = new Queue(queueName, { connection, prefix: `{${prefix}}` });

  const job = await queue.getJob(jobId);
  if (!job) {
    console.error(`Job "${jobId}" not found on queue "${queueName}"`);
    process.exit(1);
  }

  console.info(`Found job ${jobId}: ${job.name}, state=${await job.getState()}`);
  await job.retry();
  console.info(`Retry queued. Tail the worker logs to watch the new attempt.`);

  await queue.close();
  await connection.quit();
}

main().catch((err) => {
  console.error('Replay failed:', err);
  process.exit(1);
});

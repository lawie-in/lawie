/**
 * Queue names and the BullMQ key prefix, shared by the worker and the operator scripts
 * (scripts/queue-purge.ts), so a script always looks at the same Redis keys the worker drains.
 *
 * Pure: reads no env module and opens no connection, so a script can import it without the
 * worker's full env validation (INTERNAL_SECRET, AUTH_SERVICE_URL, provider keys).
 */
import { EMAIL_QUEUE_NAMES } from '@lawie/email-client';

/** Both queues the worker drains, in the order it starts them. */
export const WORKER_QUEUE_NAMES = [EMAIL_QUEUE_NAMES.high, EMAIL_QUEUE_NAMES.low] as const;

/**
 * BullMQ prefix for EMAIL_QUEUE_PREFIX: `{lawie}` by default. The braces are a Redis Cluster
 * hash tag; @lawie/email-client builds the same string on the producer side.
 */
export function bullPrefix(emailQueuePrefix: string | undefined): string {
  return `{${emailQueuePrefix ?? 'lawie'}}`;
}

/**
 * T-436 (c), Arjun #1-#2: queue the invoice / credit note email, once.
 *
 * - The job carries `userId` and `invoiceId` only (and no recipient: `to` is
 *   empty). The worker fetches the number, total, name and address at send
 *   time from GET /internal/invoices/:id/email-view. Redis never holds an
 *   amount, a number, a name or an email address (design #8).
 * - BullMQ jobId `invoice-<id>` dedupes (BullMQ rejects ":" in custom ids).
 * - Once the enqueue resolves, the row's `emailQueuedAt` is set by the one
 *   guarded, null-only update the Invoice model allows. A failed or skipped
 *   enqueue leaves it null, so the invoice sweep tries again; the jobId keeps a
 *   retry from sending twice.
 * - With INVOICE_EMAIL_ENABLED not "true" (the default) or REDIS_URL unset,
 *   nothing is queued and the marker stays null; the sweep sends the backlog
 *   once both are set.
 * - Each enqueue is bounded by INVOICE_EMAIL_ENQUEUE_TIMEOUT_MS: a stuck Redis
 *   gives 'failed' (marker null) and never holds up the issue path or the
 *   sweep. If the late push still lands, the next try is deduped by the jobId.
 * - Backfilled rows (`draft.source: 'backfill'`) are emailed once too (Ajay
 *   Addendum 7 #4b): see EMAIL_BACKFILLED_INVOICES.
 *
 * Logs ids and err.name only.
 */
import { enqueueEmail } from '@lawie/email-client';
import mongoose from 'mongoose';

import { env } from '../config/env';
import logger from '../config/logger';
import { Invoice, type IInvoice, type InvoiceKindValue } from '../models/Invoice.model';
import { User } from '../models/User.model';

/**
 * Template ids, one per document kind (pending Priya's final call; keep both
 * here and nowhere else in billing).
 */
export const INVOICE_EMAIL_TEMPLATES = {
  invoice: 'billing.taxInvoice',
  credit_note: 'billing.creditNote',
} as const satisfies Record<InvoiceKindValue, string>;

/**
 * Ajay, GST file Addendum 7 #4b: "If the backfill does produce any, email each
 * once." So backfilled rows are queued like any other (issue step and sweep),
 * once per row by the marker and the jobId. Setting this false would exclude
 * rows with `draft.source: 'backfill'` from both.
 */
export const EMAIL_BACKFILLED_INVOICES = true;

/** The BullMQ jobId for an invoice's email. */
export function invoiceEmailJobId(invoiceId: mongoose.Types.ObjectId | string): string {
  return `invoice-${String(invoiceId)}`;
}

/** Whether a row of this source gets an email at all. */
export function isEmailableSource(source: string | undefined): boolean {
  return EMAIL_BACKFILLED_INVOICES || source !== 'backfill';
}

/** The sweep's filter part for "issued, not yet queued, and emailable". */
export function unqueuedEmailFilter(): Record<string, unknown> {
  return {
    state: 'issued',
    emailQueuedAt: null,
    ...(EMAIL_BACKFILLED_INVOICES ? {} : { 'draft.source': { $ne: 'backfill' } }),
  };
}

/** Longest wait for one enqueue before it counts as failed. */
export const INVOICE_EMAIL_ENQUEUE_TIMEOUT_MS = 5_000;

export class InvoiceEmailEnqueueTimeoutError extends Error {
  constructor() {
    super('invoice email enqueue timed out');
    this.name = 'InvoiceEmailEnqueueTimeoutError';
  }
}

/** Rejects with InvoiceEmailEnqueueTimeoutError if `p` has not settled within `ms`. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new InvoiceEmailEnqueueTimeoutError()), ms);
    timer.unref();
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/** Both switches: INVOICE_EMAIL_ENABLED is "true" and REDIS_URL is set. */
export function emailQueueConfigured(): boolean {
  return env.INVOICE_EMAIL_ENABLED && env.REDIS_URL.length > 0;
}

export type QueueInvoiceEmailOutcome =
  | 'queued' // enqueued (or deduped by jobId) and marker set
  | 'already_queued' // marker was already set
  | 'not_emailed' // backfill row, or not issued
  | 'no_queue' // INVOICE_EMAIL_ENABLED off or REDIS_URL unset; marker left null
  | 'skipped_erased' // the user's account is erased: nothing queued, marker set
  | 'failed'; // enqueue failed or timed out, or a DB read/write failed; marker left null

type EmailRow = Pick<IInvoice, 'kind' | 'state' | 'userId' | 'emailQueuedAt'> & {
  _id: unknown;
  draft?: { source?: string };
};

/**
 * Sets the row's one-shot marker through the guarded, null-only update the
 * Invoice model allows. timestamps: false, or Mongoose adds updatedAt and the
 * guard refuses it.
 */
async function setEmailMarker(rowId: unknown): Promise<void> {
  await Invoice.updateOne(
    { _id: rowId },
    { $set: { emailQueuedAt: new Date() } },
    { timestamps: false },
  );
}

/**
 * Queues the email for one issued row and sets its marker. Never throws:
 * everything is logged and left for the sweep.
 *
 * Erased users (Ajay, GST file Addendum 8 #2; T-115c deletes the user
 * document): if the row's user no longer exists, nothing is queued and the
 * marker is set, so the sweep does not retry it. The invoice or credit note
 * itself stays issued and kept. The marker then means "email handled" (sent
 * to the queue, or deliberately not sent); the 'skipped_erased' log line is
 * the record of which.
 */
export async function queueInvoiceEmail(row: EmailRow): Promise<QueueInvoiceEmailOutcome> {
  const invoiceId = String(row._id);
  if (row.state !== 'issued' || !isEmailableSource(row.draft?.source)) return 'not_emailed';
  if (row.emailQueuedAt) return 'already_queued';
  if (!emailQueueConfigured()) {
    logger.warn(
      { invoiceId },
      'invoice email: INVOICE_EMAIL_ENABLED off or REDIS_URL not set; not queued, the sweep will retry',
    );
    return 'no_queue';
  }

  try {
    if ((await User.exists({ _id: row.userId })) === null) {
      await setEmailMarker(row._id);
      logger.info(
        { invoiceId, userId: String(row.userId), kind: row.kind },
        'invoice email: skipped_erased',
      );
      return 'skipped_erased';
    }
  } catch (err) {
    logger.error(
      { invoiceId, errName: err instanceof Error ? err.name : 'unknown' },
      'invoice email: user check failed; the sweep will retry',
    );
    return 'failed';
  }

  try {
    await withTimeout(
      enqueueEmail({
        template: INVOICE_EMAIL_TEMPLATES[row.kind],
        to: [],
        data: { userId: String(row.userId), invoiceId },
        idempotencyKey: invoiceEmailJobId(invoiceId),
      }),
      INVOICE_EMAIL_ENQUEUE_TIMEOUT_MS,
    );
  } catch (err) {
    logger.error(
      { invoiceId, errName: err instanceof Error ? err.name : 'unknown' },
      'invoice email: enqueue failed; the sweep will retry',
    );
    return 'failed';
  }

  try {
    await setEmailMarker(row._id);
  } catch (err) {
    // Queued but not marked: the sweep re-enqueues with the same jobId, which
    // BullMQ drops while the first job is kept (7 days after it completes).
    logger.error(
      { invoiceId, errName: err instanceof Error ? err.name : 'unknown' },
      'invoice email: queued but marker not set',
    );
    return 'failed';
  }
  logger.info({ invoiceId, kind: row.kind }, 'invoice email queued');
  return 'queued';
}

/** Fire-and-forget form for the issue path: never blocks or fails the caller. */
export function queueInvoiceEmailInBackground(row: EmailRow): void {
  void queueInvoiceEmail(row).catch((err: unknown) => {
    logger.error(
      { invoiceId: String(row._id), errName: err instanceof Error ? err.name : 'unknown' },
      'invoice email: unexpected error',
    );
  });
}

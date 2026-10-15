/**
 * T-436: finishes GST invoices and credit notes left in 'issuing' (seller
 * config missing at capture, a crash between recording and issuing, a credit
 * note waiting for its invoice) and any number allocation left pending on a
 * counter. Same pattern as drafting's startDocumentEraseSweep: one run at boot,
 * then on an unref'd interval, never two runs at once.
 *
 * Rows are taken oldest payment first, so numbers follow payment order. Rows
 * younger than INVOICE_SWEEP_MIN_AGE_MS are left to the webhook that is
 * issuing them.
 *
 * T-436 (c): each run also queues the email for issued rows whose
 * `emailQueuedAt` is still null (REDIS_URL unset at issue, an enqueue that
 * failed, or a crash before the marker), with the same jobId `invoice-<id>`.
 * Backfilled rows are included (Ajay Addendum 7 #4b). This pass needs no
 * seller config, so it runs even while issuing is blocked by it.
 *
 * Logs counts, ids and err.name only.
 */
import mongoose from 'mongoose';

import { missingSellerConfig, readEffectiveFrom } from '../config/gst';
import logger from '../config/logger';
import { Invoice } from '../models/Invoice.model';
import { InvoiceCounter } from '../models/InvoiceCounter.model';

import {
  emailQueueConfigured,
  queueInvoiceEmail,
  unqueuedEmailFilter,
} from './invoice-email.service';
import { issueInvoice } from './invoice.service';

/** How often the sweep runs (startInvoiceSweep's default). */
export const INVOICE_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
/** Rows recorded more recently than this are left to the live webhook. */
export const INVOICE_SWEEP_MIN_AGE_MS = 60 * 1000;
/** Rows handled per run. */
export const INVOICE_SWEEP_BATCH = 200;

export interface InvoiceSweepCounts {
  found: number;
  issued: number;
  waiting: number;
  dropped: number;
  failed: number;
  /** Rows left because the seller config is incomplete (nothing attempted). */
  blockedByConfig: number;
  /** T-436 (c): issued rows whose email this run queued. */
  emailsQueued: number;
  /** T-436 (c): issued rows still without a queued email after this run. */
  emailsPending: number;
}

/**
 * Queues the email for issued rows that have none queued yet, oldest issue
 * first. Rows issued within `before` are left to the issue path's own enqueue.
 */
async function sweepUnqueuedEmails(before: Date, counts: InvoiceSweepCounts): Promise<void> {
  const filter = { ...unqueuedEmailFilter(), issuedAt: { $lt: before } };
  if (!emailQueueConfigured()) {
    counts.emailsPending = await Invoice.countDocuments(filter);
    if (counts.emailsPending > 0) {
      logger.warn(
        { pending: counts.emailsPending },
        'Invoice sweep: REDIS_URL not set; invoice emails waiting',
      );
    }
    return;
  }
  const rows = await Invoice.find(filter)
    .sort({ issuedAt: 1, _id: 1 })
    .limit(INVOICE_SWEEP_BATCH)
    .select('_id kind state userId emailQueuedAt draft.source')
    .lean();
  for (const row of rows) {
    const outcome = await queueInvoiceEmail(row);
    if (outcome === 'queued') counts.emailsQueued += 1;
    else if (outcome !== 'already_queued' && outcome !== 'not_emailed') counts.emailsPending += 1;
  }
}

/** One sweep run. */
export async function runInvoiceSweep(now: Date = new Date()): Promise<InvoiceSweepCounts> {
  const counts: InvoiceSweepCounts = {
    found: 0,
    issued: 0,
    waiting: 0,
    dropped: 0,
    failed: 0,
    blockedByConfig: 0,
    emailsQueued: 0,
    emailsPending: 0,
  };
  const before = new Date(now.getTime() - INVOICE_SWEEP_MIN_AGE_MS);

  const missing = missingSellerConfig();
  if (!readEffectiveFrom()) missing.push('GST_EFFECTIVE_FROM');
  if (missing.length > 0) {
    counts.blockedByConfig = await Invoice.countDocuments({ state: 'issuing' });
    if (counts.blockedByConfig > 0) {
      logger.error(
        { pending: counts.blockedByConfig, missing },
        'Invoice sweep: GST config incomplete; invoices waiting',
      );
    }
    await sweepUnqueuedEmails(before, counts);
    return counts;
  }

  // Allocations left pending on a counter (a crash after the $inc): finish them
  // first, through the row they were made for.
  const pendingCounters = await InvoiceCounter.find({
    pendingInvoiceId: { $ne: null },
    updatedAt: { $lt: before },
  })
    .select('pendingInvoiceId')
    .lean();
  const counterRowIds = pendingCounters
    .map((c) => c.pendingInvoiceId)
    .filter((v): v is mongoose.Types.ObjectId => v instanceof mongoose.Types.ObjectId);

  const rows = await Invoice.find({ state: 'issuing', createdAt: { $lt: before } })
    .sort({ kind: -1, 'draft.paidAt': 1, _id: 1 }) // 'invoice' before 'credit_note'
    .limit(INVOICE_SWEEP_BATCH)
    .select('_id')
    .lean();

  const seen = new Set<string>();
  const ids = [...counterRowIds, ...rows.map((r) => r._id as mongoose.Types.ObjectId)].filter(
    (id) => {
      const k = String(id);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    },
  );
  counts.found = ids.length;

  for (const id of ids) {
    try {
      const outcome = await issueInvoice(id);
      if (outcome === 'issued') counts.issued += 1;
      else if (outcome === 'waiting_for_original') counts.waiting += 1;
      else if (outcome === 'dropped') counts.dropped += 1;
    } catch (err) {
      counts.failed += 1;
      logger.error(
        { invoiceId: String(id), errName: err instanceof Error ? err.name : 'unknown' },
        'Invoice sweep: issue failed; will retry',
      );
    }
  }

  await sweepUnqueuedEmails(before, counts);

  if (counts.found > 0 || counts.emailsQueued > 0) logger.info(counts, 'Invoice sweep');
  return counts;
}

let sweepTimer: NodeJS.Timeout | null = null;
let sweepRunning = false;

function sweepTick(): void {
  if (sweepRunning) return;
  sweepRunning = true;
  runInvoiceSweep()
    .catch((err: unknown) => {
      logger.error(
        { errName: err instanceof Error ? err.name : 'unknown' },
        'Invoice sweep failed',
      );
    })
    .finally(() => {
      sweepRunning = false;
    });
}

/**
 * Start the sweep: one run now (so an invoice cut off by a crash or restart is
 * finished at boot), then every `intervalMs`. Call it from index.ts, never from
 * app.ts, which the tests import. The timer is unref'd so it never holds the
 * process open.
 */
export function startInvoiceSweep(intervalMs: number = INVOICE_SWEEP_INTERVAL_MS): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(sweepTick, intervalMs);
  sweepTimer.unref();
  sweepTick();
}

/** Stop the sweep. Safe to call when it is not running. */
export function stopInvoiceSweep(): void {
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
}

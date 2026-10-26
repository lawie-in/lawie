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
 * seller config, so it runs even while issuing is blocked by it. It queues
 * nothing until INVOICE_EMAIL_ENABLED is "true" and REDIS_URL is set; each
 * enqueue is bounded by INVOICE_EMAIL_ENQUEUE_TIMEOUT_MS (in queueInvoiceEmail),
 * so a stuck Redis cannot hang a run.
 *
 * T-595 (Vikram's compliance rule): a tax invoice is due within 30 days of
 * payment, so each run also raises one Sentry event per row still 'issuing',
 * or issued with its email still unqueued, INVOICE_OVERDUE_ALERT_MS after
 * payment. It runs last on both paths, including "GST config incomplete", so
 * a row this run issued or emailed does not alert.
 *
 * Logs counts, ids and err.name only.
 */
import * as Sentry from '@sentry/node';
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
/** T-595: a row still unissued or unemailed this long after payment raises one Sentry event. */
export const INVOICE_OVERDUE_ALERT_MS = 24 * 60 * 60 * 1000;
/** T-595: the fixed Sentry message for an overdue invoice. */
export const INVOICE_OVERDUE_ALERT_MESSAGE = 'billing.invoice.overdue_24h';

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
  /** T-436 (Ajay Addendum 8 #2): rows whose user is erased; not emailed, marker set. */
  emailsSkippedErased: number;
  /** T-595: overdue rows (24 h after payment) that raised a Sentry event this run. */
  overdueAlerted: number;
}

/**
 * T-595: ids already alerted by this process. Pruned every run to the ids
 * still overdue, so it stays bounded.
 *
 * A process restart can repeat one capture per still-overdue invoice; that is
 * acceptable only because the fingerprint is per invoice id, so Sentry keeps
 * it on the same issue and the new-issue alert fires once.
 */
const alertedOverdueIds = new Set<string>();

/** T-595 test hook: forget which invoices were already alerted. */
export function resetOverdueAlertsForTests(): void {
  alertedOverdueIds.clear();
}

/**
 * T-595: one Sentry event per invoice or credit note still 'issuing', or issued
 * with its email unqueued, INVOICE_OVERDUE_ALERT_MS after payment. The event
 * carries the id, kind, reason and age in whole hours only: no email, amount,
 * name, userId or GSTIN. Rows touched within `before` are left, as in the
 * other passes. A DB or capture error is logged (err.name only) and leaves the
 * rest of the sweep to run.
 */
async function alertOverdueInvoices(
  now: Date,
  before: Date,
  counts: InvoiceSweepCounts,
): Promise<void> {
  const cutoff = new Date(now.getTime() - INVOICE_OVERDUE_ALERT_MS);
  let rows: Array<{ _id: unknown; kind: string; state: string; draft?: { paidAt?: Date } }>;
  try {
    rows = await Invoice.find({
      'draft.paidAt': { $lt: cutoff },
      // Same "recently touched" guards as the issue and email passes: a row this run
      // just issued (email enqueued in the background) or one a backfill is still
      // issuing is left alone.
      $or: [
        { state: 'issuing', createdAt: { $lt: before } },
        { ...unqueuedEmailFilter(), issuedAt: { $lt: before } },
      ],
    })
      .sort({ 'draft.paidAt': 1, _id: 1 })
      .limit(INVOICE_SWEEP_BATCH)
      .select('_id kind state draft.paidAt')
      .lean();
  } catch (err) {
    logger.error(
      { errName: err instanceof Error ? err.name : 'unknown' },
      'Invoice sweep: overdue invoice check failed',
    );
    return;
  }

  const overdue = new Set(rows.map((r) => String(r._id)));
  for (const id of alertedOverdueIds) {
    if (!overdue.has(id)) alertedOverdueIds.delete(id);
  }

  const alertedIds: string[] = [];
  for (const row of rows) {
    const invoiceId = String(row._id);
    if (alertedOverdueIds.has(invoiceId)) continue;
    const paidAt = row.draft?.paidAt ? new Date(row.draft.paidAt).getTime() : null;
    const ageHours = paidAt === null ? null : Math.round((now.getTime() - paidAt) / 3_600_000);
    const reason = row.state === 'issuing' ? 'issuing' : 'email_unqueued';
    try {
      Sentry.captureMessage(INVOICE_OVERDUE_ALERT_MESSAGE, {
        level: 'error',
        fingerprint: [INVOICE_OVERDUE_ALERT_MESSAGE, invoiceId],
        tags: { invoiceId, kind: row.kind, reason },
        extra: { ageHours },
      });
    } catch (err) {
      // Not marked as alerted, so the next run tries again.
      logger.error(
        { invoiceId, errName: err instanceof Error ? err.name : 'unknown' },
        'Invoice sweep: overdue invoice capture failed',
      );
      continue;
    }
    alertedOverdueIds.add(invoiceId);
    alertedIds.push(invoiceId);
  }
  counts.overdueAlerted = alertedIds.length;
  if (alertedIds.length > 0) {
    logger.error(
      { count: alertedIds.length, invoiceIds: alertedIds },
      'Invoice sweep: invoices unissued or unemailed 24 h after payment',
    );
  }
}

/**
 * Queues the email for issued rows that have none queued yet, oldest issue
 * first. Rows issued within `before` are left to the issue path's own enqueue.
 *
 * Stops at the first 'failed' (enqueue error or timeout, or a DB error) and
 * counts every row not yet tried as pending: a stuck Redis costs at most one
 * INVOICE_EMAIL_ENQUEUE_TIMEOUT_MS per run, and the next run tries again.
 * 'skipped_erased' is not a failure.
 */
async function sweepUnqueuedEmails(before: Date, counts: InvoiceSweepCounts): Promise<void> {
  const filter = { ...unqueuedEmailFilter(), issuedAt: { $lt: before } };
  if (!emailQueueConfigured()) {
    counts.emailsPending = await Invoice.countDocuments(filter);
    if (counts.emailsPending > 0) {
      logger.warn(
        { pending: counts.emailsPending },
        'Invoice sweep: INVOICE_EMAIL_ENABLED off or REDIS_URL not set; invoice emails waiting',
      );
    }
    return;
  }
  const rows = await Invoice.find(filter)
    .sort({ issuedAt: 1, _id: 1 })
    .limit(INVOICE_SWEEP_BATCH)
    .select('_id kind state userId emailQueuedAt draft.source')
    .lean();
  for (let i = 0; i < rows.length; i += 1) {
    const outcome = await queueInvoiceEmail(rows[i]);
    if (outcome === 'queued') counts.emailsQueued += 1;
    else if (outcome === 'skipped_erased') counts.emailsSkippedErased += 1;
    else if (outcome !== 'already_queued' && outcome !== 'not_emailed') {
      counts.emailsPending += 1;
      if (outcome === 'failed') {
        const untried = rows.length - (i + 1);
        counts.emailsPending += untried;
        if (untried > 0) {
          logger.warn(
            { untried },
            'Invoice sweep: email enqueue failed; rest of the batch left for the next run',
          );
        }
        return;
      }
    }
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
    emailsSkippedErased: 0,
    overdueAlerted: 0,
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
    // T-595: this is exactly the case the alert is for.
    await alertOverdueInvoices(now, before, counts);
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
  // T-595: after this run's issue and email passes, so only rows still stuck alert.
  await alertOverdueInvoices(now, before, counts);

  if (counts.found > 0 || counts.emailsQueued > 0 || counts.emailsSkippedErased > 0) {
    logger.info(counts, 'Invoice sweep');
  }
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

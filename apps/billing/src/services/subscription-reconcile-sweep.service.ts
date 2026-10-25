/**
 * T-527 (Arjun design (a), 21 Oct 2026, design 3): reconciles what a timed-out
 * razorpay.subscriptions.create may have left at Razorpay for users who have
 * not subscribed again. Same pattern as startInvoiceSweep: one run at boot,
 * then on an unref'd interval, never two runs at once (single-runner flag).
 *
 * Each run takes markers (SubscriptionReconcile) older than
 * RECONCILE_SWEEP_MIN_AGE_MS, oldest first, and for each one runs the same
 * reconcileRazorpaySubscriptions as the subscribe path, without a requested
 * plan: live subs with no local row are adopted as rows and reported, and
 * unadopted created/authenticated orphans are cancelled now (cancel(id,
 * false)). The marker is cleared only after a complete scan.
 *
 * Each user is handled under that user's SubscriptionCreateLock (the same lock
 * createSubscription takes), so the sweep never runs alongside a subscribe for
 * that user. A held lock skips the user until the next run.
 *
 * Logs counts, ids and err.name only.
 */
import logger from '../config/logger';
import { SubscriptionCreateLock } from '../models/SubscriptionCreateLock.model';
import { SubscriptionReconcile } from '../models/SubscriptionReconcile.model';

import { reconcileRazorpaySubscriptions } from './subscription.service';

/** How often the sweep runs (startReconcileSweep's default). */
export const RECONCILE_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
/** Markers younger than this are left to the user's own next subscribe. */
export const RECONCILE_SWEEP_MIN_AGE_MS = 5 * 60 * 1000;
/** Markers handled per run. */
export const RECONCILE_SWEEP_BATCH = 100;

export interface ReconcileSweepCounts {
  found: number;
  /** Markers whose scan completed (marker cleared). */
  reconciled: number;
  /** Of those, users with a live sub adopted (reported). */
  adoptedLive: number;
  /** Users skipped because a subscribe for them holds the create lock. */
  skippedLocked: number;
  /** Markers kept after a failure (list, timeout, cap, cancel, DB). */
  failed: number;
}

/** One sweep run. */
export async function runReconcileSweep(now: Date = new Date()): Promise<ReconcileSweepCounts> {
  const counts: ReconcileSweepCounts = {
    found: 0,
    reconciled: 0,
    adoptedLive: 0,
    skippedLocked: 0,
    failed: 0,
  };
  const before = new Date(now.getTime() - RECONCILE_SWEEP_MIN_AGE_MS);
  const markers = await SubscriptionReconcile.find({ createdAt: { $lt: before } })
    .sort({ createdAt: 1, _id: 1 })
    .limit(RECONCILE_SWEEP_BATCH)
    .select('userId')
    .lean();
  counts.found = markers.length;
  if (markers.length === 0) return counts;

  // The unique index must exist before the insert can act as a lock.
  await SubscriptionCreateLock.init();

  for (const marker of markers) {
    const userId = String(marker.userId);
    let lockId: unknown;
    const createdAt = new Date();
    try {
      const lock = await SubscriptionCreateLock.create({ userId, createdAt });
      lockId = lock._id;
    } catch (err) {
      if ((err as { code?: unknown } | null)?.code === 11000) {
        counts.skippedLocked += 1;
        continue;
      }
      counts.failed += 1;
      logger.error(
        { userId, errName: err instanceof Error ? err.name : 'unknown' },
        'Reconcile sweep: create lock failed; will retry',
      );
      continue;
    }
    try {
      const outcome = await reconcileRazorpaySubscriptions(userId, {
        lockedAt: createdAt.getTime(),
      });
      counts.reconciled += 1;
      if (outcome.kind === 'live') counts.adoptedLive += 1;
    } catch (err) {
      counts.failed += 1;
      logger.error(
        { userId, errName: err instanceof Error ? err.name : 'unknown' },
        'Reconcile sweep: reconcile failed; marker kept, will retry',
      );
    } finally {
      try {
        await SubscriptionCreateLock.deleteOne({ _id: lockId });
      } catch (releaseErr) {
        // The TTL index removes it within ~2 min.
        logger.error(
          { userId, errName: releaseErr instanceof Error ? releaseErr.name : 'unknown' },
          'Reconcile sweep: failed to release subscription create lock',
        );
      }
    }
  }

  logger.info(counts, 'Reconcile sweep');
  return counts;
}

let sweepTimer: NodeJS.Timeout | null = null;
let sweepRunning = false;

function sweepTick(): void {
  if (sweepRunning) return;
  sweepRunning = true;
  runReconcileSweep()
    .catch((err: unknown) => {
      logger.error(
        { errName: err instanceof Error ? err.name : 'unknown' },
        'Reconcile sweep failed',
      );
    })
    .finally(() => {
      sweepRunning = false;
    });
}

/**
 * Start the sweep: one run now, then every `intervalMs`. Call it from
 * index.ts, never from app.ts, which the tests import. The timer is unref'd so
 * it never holds the process open.
 */
export function startReconcileSweep(intervalMs: number = RECONCILE_SWEEP_INTERVAL_MS): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(sweepTick, intervalMs);
  sweepTimer.unref();
  sweepTick();
}

/** Stop the sweep. Safe to call when it is not running. */
export function stopReconcileSweep(): void {
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
}

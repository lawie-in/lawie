/**
 * T-536: one live subscription per user, at the database.
 *
 * A partial unique index on `subscriptions { userId }` covering the
 * non-terminal statuses only, so a user can hold any number of ended rows but
 * at most one checkout or live row. It is not declared on the schema (Arjun,
 * T-536 ruling 1): autoIndex never builds it, and it is ensured once at boot,
 * after connectDatabase(), beside ensureInkLedgerIndexes (the T-519 pattern).
 * createIndex is idempotent: Mongo no-ops when an index with the same name,
 * key and options already exists. The schema's plain `userId_1` index stays;
 * this one never replaces or drops it.
 *
 * Never throws. A failure (for instance existing duplicates: run
 * `yarn workspace @lawie/billing check:live-sub-duplicates` first) is logged,
 * reported to Sentry, and billing keeps starting (T-536 AC3).
 */
import * as Sentry from '@sentry/node';
import mongoose from 'mongoose';

import { SUBSCRIPTION_STATUSES, type SubscriptionStatus } from '../models/Subscription.model';

import logger from './logger';

export const SUBSCRIPTION_COLLECTION = 'subscriptions';
export const SUBSCRIPTION_LIVE_UNIQUE_KEY = { userId: 1 } as const;
export const SUBSCRIPTION_LIVE_UNIQUE_NAME = 'userId_1_live_unique';

/**
 * Terminal statuses: a row in one of these never blocks another row. Same
 * list as the service's TERMINAL_STATUSES; the service's CHECKOUT_STATUSES +
 * LIVE_STATUSES are exactly the rest. Derived from the model's single status
 * list rather than imported from the service, which imports this module (for
 * isLiveSubscriptionConflict): no circular import.
 */
const TERMINAL: readonly SubscriptionStatus[] = ['cancelled', 'completed', 'expired'];

/**
 * The six non-terminal statuses, in the model's order:
 * created, authenticated, active, pending, halted, paused.
 */
export const NON_TERMINAL_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] =
  SUBSCRIPTION_STATUSES.filter((s) => !TERMINAL.includes(s));

export const SUBSCRIPTION_LIVE_UNIQUE_FILTER = {
  status: { $in: [...NON_TERMINAL_SUBSCRIPTION_STATUSES] },
};

/** Sentry marker for a failed build of the index. */
export const SUBSCRIPTION_INDEX_FAILED_MARKER = 'billing.subscription.live_index_create_failed';

/**
 * True when `err` is a duplicate-key error raised by the live-subscription
 * index (userId), as opposed to the unique razorpaySubscriptionId index or
 * any other error. Decided by the index name in the driver message, else by
 * keyPattern / keyValue holding userId and not razorpaySubscriptionId. Only
 * meaningful for errors from writes to the Subscription collection.
 */
export function isLiveSubscriptionConflict(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; message?: unknown; keyPattern?: unknown; keyValue?: unknown };
  if (e.code !== 11000) return false;
  if (typeof e.message === 'string') {
    if (e.message.includes(SUBSCRIPTION_LIVE_UNIQUE_NAME)) return true;
    if (e.message.includes('razorpaySubscriptionId')) return false;
  }
  for (const k of [e.keyPattern, e.keyValue]) {
    if (k && typeof k === 'object') {
      const keys = Object.keys(k);
      if (keys.includes('razorpaySubscriptionId')) return false;
      if (keys.length === 1 && keys[0] === 'userId') return true;
    }
  }
  return false;
}

export async function ensureSubscriptionIndexes(): Promise<void> {
  try {
    const db = mongoose.connection.db;
    if (!db) {
      logger.warn('subscription: no db handle; skipping live index create');
      return;
    }
    await db.collection(SUBSCRIPTION_COLLECTION).createIndex(
      { ...SUBSCRIPTION_LIVE_UNIQUE_KEY },
      {
        name: SUBSCRIPTION_LIVE_UNIQUE_NAME,
        unique: true,
        partialFilterExpression: SUBSCRIPTION_LIVE_UNIQUE_FILTER,
      },
    );
    logger.info({ index: SUBSCRIPTION_LIVE_UNIQUE_NAME }, 'subscription: live index ensured');
  } catch (err) {
    // Error class and driver code only: no driver message (it can carry a
    // duplicate key value), no PII. Same shape as ensureInkLedgerIndexes.
    const { codeName, code } = (err ?? {}) as { codeName?: unknown; code?: unknown };
    const fields = {
      errName: err instanceof Error ? err.name : 'unknown',
      ...(typeof codeName === 'string' ? { codeName } : {}),
      ...(typeof code === 'number' ? { code } : {}),
    };
    logger.error(fields, 'subscription: live index create failed; continuing');
    try {
      Sentry.withScope((scope) => {
        scope.setTag('marker', SUBSCRIPTION_INDEX_FAILED_MARKER);
        Sentry.captureMessage(SUBSCRIPTION_INDEX_FAILED_MARKER, 'error');
      });
    } catch {
      // Reporting must never stop the boot.
    }
  }
}

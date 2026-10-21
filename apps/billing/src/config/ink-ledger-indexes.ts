/**
 * T-519: indexes for the raw `inkledger` collection.
 *
 * `inkledger` has no Mongoose model, so autoIndex never covers it. This runs
 * once at boot, after connectDatabase(). createIndex is idempotent: Mongo
 * no-ops when an index with the same key and options already exists.
 *
 * Never throws. A failure is logged and billing keeps starting (T-519 AC2).
 */
import mongoose from 'mongoose';

import logger from './logger';

export const INK_LEDGER_COLLECTION = 'inkledger';
export const INK_LEDGER_USER_CREATED_KEY = { userId: 1, createdAt: -1 } as const;
export const INK_LEDGER_USER_CREATED_NAME = 'userId_1_createdAt_-1';

export async function ensureInkLedgerIndexes(): Promise<void> {
  try {
    const db = mongoose.connection.db;
    if (!db) {
      logger.warn('ink-ledger: no db handle; skipping index create');
      return;
    }
    await db
      .collection(INK_LEDGER_COLLECTION)
      .createIndex(
        { ...INK_LEDGER_USER_CREATED_KEY },
        { background: true, name: INK_LEDGER_USER_CREATED_NAME },
      );
    logger.info({ index: INK_LEDGER_USER_CREATED_NAME }, 'ink-ledger: index ensured');
  } catch (err) {
    // Error class only: no driver message, no PII.
    logger.error(
      { errName: err instanceof Error ? err.name : 'unknown' },
      'ink-ledger: index create failed; continuing',
    );
  }
}

/**
 * T-563 (Arjun reconciled 2; AJ-563-M6) — erases test accounts within 7 days of creation.
 * Modelled on unverified-sweep: find due test accounts, check billing once, conditional lock
 * (onlyIf isTestAccount, one atomic write) then runAccountErase. An erase cut off part-way is
 * finished by the account-erase sweep. Logs ids and counts only.
 *
 * Always on: it only ever touches isTestAccount accounts, which exist only where the bypass
 * was enabled, and it must keep erasing them after the bypass is turned off.
 */
import logger from '../config/logger';
import { User } from '../models/User.model';

import { fetchSubscriptionStatus, lockAccount, runAccountErase } from './account-erase.service';

const DAY_MS = 24 * 60 * 60 * 1000;
export const TEST_ACCOUNT_MAX_AGE_DAYS = 7;
export const TEST_ACCOUNT_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
export const TEST_ACCOUNT_SWEEP_BATCH = 50;

/** Test accounts created before `cutoff` and not already being erased. */
export function testAccountsOlderThanFilter(cutoff: Date): Record<string, unknown> {
  return { isTestAccount: true, createdAt: { $lt: cutoff }, erasure: { $exists: false } };
}

export interface TestAccountSweepCounts {
  found: number;
  erased: number;
  erasePending: number;
  skippedNoLongerDue: number;
  skippedSubscriptionActive: number;
  skippedBillingUnavailable: number;
}

/** One sweep run. Never throws. */
export async function runTestAccountSweep(now: Date = new Date()): Promise<TestAccountSweepCounts> {
  const counts: TestAccountSweepCounts = {
    found: 0,
    erased: 0,
    erasePending: 0,
    skippedNoLongerDue: 0,
    skippedSubscriptionActive: 0,
    skippedBillingUnavailable: 0,
  };
  try {
    const cutoff = new Date(now.getTime() - TEST_ACCOUNT_MAX_AGE_DAYS * DAY_MS);
    const due = await User.find(testAccountsOlderThanFilter(cutoff))
      .select('_id')
      .sort({ createdAt: 1 })
      .limit(TEST_ACCOUNT_SWEEP_BATCH)
      .lean();
    counts.found = due.length;
    for (const u of due) {
      const userId = String(u._id);
      const sub = await fetchSubscriptionStatus(userId);
      if (sub.kind === 'unavailable') {
        counts.skippedBillingUnavailable += 1;
        continue;
      }
      if (sub.active) {
        counts.skippedSubscriptionActive += 1;
        logger.warn({ userId }, 'Test account erase held: active plan');
        continue;
      }
      const locked = await lockAccount(userId, { onlyIf: { isTestAccount: true } });
      if (!locked) {
        counts.skippedNoLongerDue += 1;
        continue;
      }
      const run = await runAccountErase(userId);
      if (run.done) counts.erased += 1;
      else counts.erasePending += 1;
    }
    if (counts.found > 0) logger.info({ ...counts }, 'Test account sweep');
  } catch (err) {
    const errKind = err instanceof Error ? err.constructor.name : 'UnknownError';
    logger.warn({ errKind }, 'Test account sweep failed');
  }
  return counts;
}

let sweepTimer: NodeJS.Timeout | null = null;
let sweepRunning = false;

function sweepTick(): void {
  if (sweepRunning) return;
  sweepRunning = true;
  runTestAccountSweep()
    .catch(() => undefined)
    .finally(() => {
      sweepRunning = false;
    });
}

/**
 * Start the sweep: one run now, then every `intervalMs` (hourly). Started from index.ts, never
 * from app.ts. Unref'd; a second call is a no-op; runs never overlap.
 */
export function startTestAccountSweep(intervalMs: number = TEST_ACCOUNT_SWEEP_INTERVAL_MS): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(sweepTick, intervalMs);
  sweepTimer.unref();
  sweepTick();
}

/** Stop the sweep. Safe to call when it is not running. */
export function stopTestAccountSweep(): void {
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
}

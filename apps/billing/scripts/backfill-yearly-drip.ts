/**
 * T-399 AC4 — one-off: grant yearly-plan monthly Ink that has come due.
 *
 *   yarn workspace @lawie/billing backfill:yearly-drip            # dry run (default)
 *   yarn workspace @lawie/billing backfill:yearly-drip --apply    # writes
 *
 * Lists yearly subscriptions still inside their paid year and the monthly drips
 * each one is owed now. `--apply` calls the same `settleYearlyDrip`
 * (@lawie/shared) that every balance read and hold calls, so it is idempotent:
 * a second run, or a user reading their balance at the same time, grants
 * nothing twice.
 *
 * No subscriptions have been sold (founder via Vikram, 13 Oct 2026), so this is
 * a safety net and is expected to find nothing. Yearly subscriptions created
 * before T-399 have no drip fields; they are listed as "no drip state" and are
 * never written by this script.
 *
 * Needs MONGO_URI of the target environment; loads .env.<NODE_ENV> (default
 * development) or .env from the repo root when it is not already set. Reads
 * MONGO_URI directly rather than the billing env module, which also demands the
 * Razorpay secrets this script does not use.
 *
 * Prints Razorpay subscription ids and counts only; never an email or a name.
 * Exit codes: 0 done, 1 failed, 2 usage.
 */
/* eslint-disable import/order, import/first, no-console */
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';

// apps/billing/scripts -> repo root.
const repoRoot = join(__dirname, '..', '..', '..');
for (const candidate of [`.env.${process.env.NODE_ENV ?? 'development'}`, '.env']) {
  const p = join(repoRoot, candidate);
  if (existsSync(p)) {
    loadDotenv({ path: p });
    break;
  }
}

import { YEARLY_DRIP_MAX, addOneMonth, settleYearlyDrip } from '@lawie/shared';
import mongoose from 'mongoose';
/* eslint-enable import/order, import/first */

const USAGE = 'Usage: yarn workspace @lawie/billing backfill:yearly-drip [--apply]';

/** Drips owed at `now`, by the same rule as settleYearlyDrip's loop. */
function dripsOwed(nextAt: Date, count: number, now: Date): number {
  let owed = 0;
  let at = nextAt;
  while (at <= now && count + owed < YEARLY_DRIP_MAX) {
    owed += 1;
    at = addOneMonth(at);
  }
  return owed;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const unknown = args.filter((a) => a !== '--apply' && a !== '--dry-run');
  if (unknown.length > 0 || (apply && args.includes('--dry-run'))) {
    console.error(USAGE);
    process.exit(2);
  }

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('MONGO_URI is not set.');
    process.exit(2);
  }

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000, autoIndex: false });
  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error('No database handle after connect');
    const now = new Date();
    const subs = db.collection('subscriptions');

    const yearly = await subs
      .find({
        billingCycle: 'yearly',
        status: { $in: ['active', 'cancelled'] },
        paidThrough: { $gte: now },
      })
      .toArray();

    let owedTotal = 0;
    let missingState = 0;
    for (const sub of yearly) {
      const nextAt = sub.inkDripNextAt instanceof Date ? sub.inkDripNextAt : null;
      const count = typeof sub.inkDripCount === 'number' ? sub.inkDripCount : null;
      if (!nextAt || count === null) {
        missingState += 1;
        console.log(`${String(sub.razorpaySubscriptionId)}: no drip state, skipped`);
        continue;
      }
      const owed = dripsOwed(nextAt, count, now);
      owedTotal += owed;
      console.log(
        `${String(sub.razorpaySubscriptionId)} (${String(sub.planId)}, ${String(sub.status)}): ` +
          `drips done ${count}/${YEARLY_DRIP_MAX}, owed now ${owed}`,
      );
    }

    // Pre-T-399 yearly subs carry no billingCycle on the Subscription; the
    // user row says yearly. Listed for a manual look, never written.
    const yearlyUserIds = await db
      .collection('users')
      .find({ billingCycle: 'yearly' }, { projection: { _id: 1 } })
      .toArray();
    const legacy = await subs.countDocuments({
      userId: { $in: yearlyUserIds.map((u) => u._id) },
      billingCycle: { $exists: false },
      status: { $in: ['active', 'cancelled'] },
    });

    console.log(`yearly subscriptions in their paid year: ${yearly.length}`);
    console.log(`drips owed now: ${owedTotal}`);
    console.log(`without drip state (skipped): ${missingState}`);
    console.log(`pre-T-399 subscriptions of yearly users (not touched): ${legacy}`);

    if (!apply) {
      console.log('Dry run: nothing written. Run with --apply to grant.');
      return;
    }

    let granted = 0;
    for (const sub of yearly) {
      const r = await settleYearlyDrip({ db, userId: sub.userId, now });
      granted += r.granted;
    }
    console.log(`drips granted: ${granted}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(`Backfill stopped: ${err instanceof Error ? err.name : 'UnknownError'}`);
  void mongoose.disconnect().finally(() => process.exit(1));
});

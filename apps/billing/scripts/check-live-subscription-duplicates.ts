/**
 * T-536 AC2 — read-only data check before the one-live-subscription index.
 *
 *   yarn workspace @lawie/billing check:live-sub-duplicates
 *
 * Lists users with more than one non-terminal subscription row (created,
 * authenticated, active, pending, halted, paused): the rows that would stop
 * the partial unique index `userId_1_live_unique` from building. The founder
 * fixes any duplicates by hand; this script never does.
 *
 * READ-ONLY. There is no --apply. The only database calls are
 * admin().serverInfo() and one aggregate (no $out / $merge stage). It writes
 * nothing.
 *
 * Needs MONGO_URI of the target environment; loads .env.<NODE_ENV> (default
 * development) or .env from the repo root when it is not already set. Reads
 * MONGO_URI directly rather than the billing env module, which also demands
 * the Razorpay secrets this script does not use.
 *
 * Prints user ids, subscription ids, statuses and dates only; never an email
 * or a name.
 * Exit codes: 0 no duplicates, 1 duplicates found (or the check failed),
 * 2 usage or connect error.
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

import mongoose from 'mongoose';
/* eslint-enable import/order, import/first */

const USAGE = 'Usage: yarn workspace @lawie/billing check:live-sub-duplicates';

/**
 * The non-terminal statuses the index covers. Same list as
 * NON_TERMINAL_SUBSCRIPTION_STATUSES in src/config/subscription-indexes.ts;
 * inlined so the script loads no billing module (logger, Sentry, models).
 */
const NON_TERMINAL_STATUSES = [
  'created',
  'authenticated',
  'active',
  'pending',
  'halted',
  'paused',
] as const;

/**
 * Scheme, host(s) and database of a Mongo URI, never the credentials or the
 * query string: `mongodb+srv://user:pw@cluster.x.net/lawie?w=1` prints as
 * `mongodb+srv://cluster.x.net/lawie`. Same as backfill-yearly-drip.ts.
 * gitleaks:allow
 */
function redactMongoUri(uri: string): string {
  const scheme = /^[a-z+]+:\/\//i.exec(uri)?.[0];
  if (!scheme) return '(unparseable MONGO_URI)';
  // Everything up to the last '@' is credentials (or would be, if malformed):
  // dropping too much only shortens the output, it never shows a password.
  const rest = uri.slice(scheme.length);
  const afterCreds = rest.slice(rest.lastIndexOf('@') + 1);
  return scheme + afterCreds.split('?')[0];
}

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : 'no date';
}

interface DuplicateGroup {
  _id: unknown;
  count: number;
  rows: { _id: unknown; razorpaySubscriptionId: unknown; status: unknown; createdAt: unknown }[];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length > 0) {
    console.error(USAGE);
    process.exit(2);
  }

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('MONGO_URI is not set.');
    process.exit(2);
  }

  console.log(`Target (read-only check): ${redactMongoUri(mongoUri)}`);

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000, autoIndex: false });
  } catch (err) {
    console.error(`Connect failed: ${err instanceof Error ? err.name : 'UnknownError'}`);
    process.exit(2);
  }

  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error('No database handle after connect');

    const info = (await db.admin().serverInfo()) as { version?: unknown };
    console.log(
      `MongoDB server version: ${typeof info.version === 'string' ? info.version : 'unknown'}`,
    );

    const groups = (await db
      .collection('subscriptions')
      .aggregate([
        { $match: { status: { $in: [...NON_TERMINAL_STATUSES] } } },
        {
          $group: {
            _id: '$userId',
            count: { $sum: 1 },
            rows: {
              $push: {
                _id: '$_id',
                razorpaySubscriptionId: '$razorpaySubscriptionId',
                status: '$status',
                createdAt: '$createdAt',
              },
            },
          },
        },
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1 } },
      ])
      .toArray()) as DuplicateGroup[];

    if (groups.length === 0) {
      console.log('No user has more than one non-terminal subscription. The index can build.');
      return;
    }

    console.log(`Users with more than one non-terminal subscription: ${groups.length}`);
    for (const g of groups) {
      console.log(`userId ${String(g._id)}: ${g.count} non-terminal rows`);
      for (const r of g.rows) {
        console.log(
          `  _id ${String(r._id)}  ${String(r.razorpaySubscriptionId)}  ` +
            `${String(r.status)}  created ${iso(r.createdAt)}`,
        );
      }
    }
    console.log('Fix these by hand before the index lands. Nothing was written.');
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(`Check stopped: ${err instanceof Error ? err.name : 'UnknownError'}`);
  void mongoose.disconnect().finally(() => process.exit(1));
});

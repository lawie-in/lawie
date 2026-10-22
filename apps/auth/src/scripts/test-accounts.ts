/**
 * T-563 (Arjun reconciled 2; AJ-563-M6) — the founder's tools for test accounts (isTestAccount).
 *
 *   yarn workspace @lawie/auth test-accounts:list   [--older-than 1d]            read-only
 *   yarn workspace @lawie/auth test-accounts:delete [--older-than 1d]            dry run
 *   yarn workspace @lawie/auth test-accounts:delete [--older-than 1d] --apply    erase them
 *
 * --older-than takes <n>d or <n>h (default 1d; 0d means every test account). Delete is a dry run
 * unless --apply is given: the dry run only reads and writes nothing. --apply erases each one
 * through the account-erase service (lockAccount onlyIf isTestAccount, then runAccountErase:
 * drafts, documents, ledger, everything). An account with an active plan is skipped.
 *
 * Prints user ids and counts only: never an email, a name or a value.
 *
 * Exit codes: 0 done, 1 failed or some erases not finished, 2 usage.
 */
/* eslint-disable import/order, import/first, no-console */
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';

// src/scripts (or dist/scripts) -> apps/auth -> repo root.
const repoRoot = join(__dirname, '..', '..', '..', '..');
for (const candidate of [`.env.${process.env.NODE_ENV ?? 'development'}`, '.env']) {
  const p = join(repoRoot, candidate);
  if (existsSync(p)) {
    loadDotenv({ path: p });
    break;
  }
}

import mongoose from 'mongoose';

import { env } from '../config/env';
import redis from '../config/redis';
import { User } from '../models/User.model';
import {
  GOLDEN_SET_USER_ID,
  fetchSubscriptionStatus,
  lockAccount,
  runAccountErase,
} from '../services/account-erase.service';
import { testAccountsOlderThanFilter } from '../services/test-account-sweep.service';
/* eslint-enable import/order, import/first */

const DEFAULT_OLDER_THAN = '1d';

function usage(): never {
  console.error(
    'Usage: test-accounts <list|delete> [--older-than <n>d|<n>h] [--apply (delete only)]',
  );
  process.exit(2);
}

/** "<n>d" or "<n>h" -> milliseconds; null when malformed. */
function parseOlderThan(raw: string): number | null {
  const m = /^(\d{1,4})([dh])$/.exec(raw.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n * (m[2] === 'd' ? 24 : 1) * 60 * 60 * 1000;
}

interface Args {
  command: 'list' | 'delete';
  olderThanMs: number;
  apply: boolean;
}

function parseArgs(argv: string[]): Args {
  const [command, ...rest] = argv;
  if (command !== 'list' && command !== 'delete') usage();
  let olderThan = DEFAULT_OLDER_THAN;
  let apply = false;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--apply') apply = true;
    else if (a === '--older-than') olderThan = rest[++i] ?? '';
    else if (a.startsWith('--older-than=')) olderThan = a.slice('--older-than='.length);
    else usage();
  }
  if (apply && command !== 'delete') usage();
  const olderThanMs = parseOlderThan(olderThan);
  if (olderThanMs === null) usage();
  return { command, olderThanMs, apply };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });

  const cutoff = new Date(Date.now() - args.olderThanMs);
  const rows = await User.find({
    ...testAccountsOlderThanFilter(cutoff),
    role: { $ne: 'Admin' },
    _id: { $ne: new mongoose.Types.ObjectId(GOLDEN_SET_USER_ID) },
  })
    .select('_id')
    .sort({ createdAt: 1 })
    .lean();
  const ids = rows.map((r) => String(r._id));

  if (args.command === 'list' || !args.apply) {
    const out = {
      command: args.command,
      dryRun: args.command === 'delete' ? true : undefined,
      cutoff: cutoff.toISOString(),
      count: ids.length,
      ids,
    };
    console.log(JSON.stringify(out, null, 2));
    if (args.command === 'delete') console.log('Dry run: nothing changed. Add --apply to erase.');
    return 0;
  }

  const counts = { found: ids.length, erased: 0, pending: 0, skipped: 0, failed: 0 };
  for (const userId of ids) {
    try {
      const sub = await fetchSubscriptionStatus(userId);
      if (sub.kind === 'unavailable' || sub.active) {
        counts.skipped += 1;
        console.log(
          `${userId}: skipped (${sub.kind === 'unavailable' ? 'billing unreachable' : 'active plan'})`,
        );
        continue;
      }
      const locked = await lockAccount(userId, { onlyIf: { isTestAccount: true } });
      if (!locked) {
        counts.skipped += 1;
        console.log(`${userId}: skipped (no longer a due test account)`);
        continue;
      }
      const run = await runAccountErase(userId);
      if (run.done) {
        counts.erased += 1;
        console.log(`${userId}: erased`);
      } else {
        counts.pending += 1;
        console.log(
          `${userId}: pending (failed at ${run.failedAt ?? 'unknown'}; the sweep resumes it)`,
        );
      }
    } catch (err) {
      counts.failed += 1;
      console.error(`${userId}: failed (${err instanceof Error ? err.name : 'UnknownError'})`);
    }
  }
  console.log(JSON.stringify({ command: 'delete', apply: true, ...counts }, null, 2));
  return counts.pending > 0 || counts.failed > 0 ? 1 : 0;
}

main()
  .then(async (code) => {
    await mongoose.disconnect().catch(() => undefined);
    await redis.quit().catch(() => undefined);
    process.exit(code);
  })
  .catch(async (err: unknown) => {
    console.error(`Failed: ${err instanceof Error ? err.name : 'UnknownError'}`);
    await mongoose.disconnect().catch(() => undefined);
    await redis.quit().catch(() => undefined);
    process.exit(1);
  });

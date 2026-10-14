/**
 * T-115c — erase one user from the command line (Arjun's revised design and ruling 5; the
 * repeatable erase T-235-erase-runbook.md says is missing).
 *
 *   yarn workspace @lawie/auth erase-user <userId> --dry-run   counts only, changes nothing
 *   yarn workspace @lawie/auth erase-user <userId>             lock the account, then erase it
 *   yarn workspace @lawie/auth erase-user <userId> --resume    finish an erase already started
 *
 * Runs the same code as DELETE /me (services/account-erase.service.ts) without the re-proof:
 * it is the founder's tool, run with the target environment's credentials. Drafting and billing
 * must be reachable at DRAFTING_SERVICE_URL / BILLING_SERVICE_URL with the same INTERNAL_SECRET.
 *
 * Refuses: role Admin, the golden-set fixture user, and an account with an active plan
 * (cancel it in the Razorpay dashboard first; runbook step 0d). Without --resume, an account
 * already being closed is refused (use --resume); with --resume, an account not yet locked is.
 *
 * Prints the userId and counts only: never an email, a name or a value. The manual steps that
 * stay manual (runbook step 5) are printed at the end.
 *
 * Exit codes: 0 done (or dry run read), 1 failed, 2 usage or refused, 3 pending (locked; the
 * service's sweep or another --resume finishes it).
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
/* eslint-enable import/order, import/first */

const MANUAL_CHECKLIST = [
  'Manual steps still to do (runbook step 5):',
  '  - Razorpay: cancel only; the records stay (RBI).',
  "  - Sentry: find and delete the user's issues by user id, by hand.",
  '  - pm2 / email-worker logs: grep and redact by hand until T-247.',
  '  - Wait 30 minutes for intake:cache:* to expire.',
];

function usage(): never {
  console.error('Usage: erase-user <userId> [--dry-run] [--resume]');
  process.exit(2);
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  const positional = args.filter((a) => !a.startsWith('--'));
  for (const f of flags) if (f !== '--dry-run' && f !== '--resume') usage();
  if (positional.length !== 1) usage();
  const userId = positional[0];
  const dryRun = flags.has('--dry-run');
  const resume = flags.has('--resume');
  if (dryRun && resume) usage();
  if (!mongoose.isValidObjectId(userId)) {
    console.error('Not a valid user id.');
    return 2;
  }
  if (userId.toLowerCase() === GOLDEN_SET_USER_ID) {
    console.error('Refused: the golden-set fixture user.');
    return 2;
  }

  await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });

  const user = await User.findById(userId).select('role erasure').lean();
  if (!user) {
    const run = await runAccountErase(userId, { dryRun });
    if (run.done) {
      console.log(`${userId}: already erased (no user record, account_delete recorded).`);
      return 0;
    }
    console.error(`${userId}: no such user.`);
    return 2;
  }
  if (user.role === 'Admin') {
    console.error('Refused: an Admin account.');
    return 2;
  }

  if (dryRun) {
    const run = await runAccountErase(userId, { dryRun: true });
    const out = {
      userId,
      dryRun: true,
      done: run.done,
      failedAt: run.failedAt,
      counts: run.counts,
    };
    console.log(JSON.stringify(out, null, 2));
    return run.done ? 0 : 1;
  }

  if (resume && !user.erasure) {
    console.error('Refused: this account is not being closed. Run without --resume to start.');
    return 2;
  }
  if (!resume && user.erasure) {
    console.error(
      `Refused: this account is already being closed (stage ${user.erasure.stage}). Use --resume.`,
    );
    return 2;
  }

  if (!resume) {
    const sub = await fetchSubscriptionStatus(userId);
    if (sub.kind === 'unavailable') {
      console.error('Billing could not be reached; nothing changed.');
      return 1;
    }
    if (sub.active) {
      console.error(
        `Refused: the plan is ${sub.status}. Cancel it in Razorpay first; nothing changed.`,
      );
      return 2;
    }
    await lockAccount(userId);
  }

  const run = await runAccountErase(userId);
  const out = { userId, done: run.done, failedAt: run.failedAt, counts: run.counts };
  console.log(JSON.stringify(out, null, 2));
  console.log(MANUAL_CHECKLIST.join('\n'));
  if (!run.done) {
    console.error(
      'Not finished: the account stays locked. Run --resume again, or let the sweep finish it.',
    );
    return 3;
  }
  return 0;
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

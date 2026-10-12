/**
 * T-115e — one-off: remove the matter label from stored demand-signal events.
 *
 *   npx ts-node --transpile-only apps/drafting/src/scripts/unset-event-labels.ts --dry-run
 *   npx ts-node --transpile-only apps/drafting/src/scripts/unset-event-labels.ts --yes
 *
 * Ajay (12 Oct 2026): the label is not needed; the category stays. New events
 * stopped storing `metadata.label` in T-115e; this unsets it on old rows:
 *
 *   updateMany({ 'metadata.label': { $exists: true } }, { $unset: { 'metadata.label': '' } })
 *
 * In the same run, demand.no_template / demand.no_match events whose category
 * is a string not on DEMAND_CATEGORIES get `metadata.category: 'other'` (null,
 * which a malformed model reply still writes, is left as it is):
 *
 *   updateMany({ type: { $in: DEMAND_TYPES }, 'metadata.category': { $nin: [...DEMAND_CATEGORIES, null] } },
 *              { $set: { 'metadata.category': 'other' } })
 *
 * Raw driver, so `updatedAt` hooks and run-origin plugins are not involved.
 * Idempotent: a second run finds nothing to do. Run on develop first; the
 * founder runs it on production with the other T-115 steps.
 *
 * Needs MONGO_URI of the target environment; loads .env.<NODE_ENV> (default
 * development) or .env from the repo root when it is not already set.
 *
 * Prints counts only: never a label, an id or an error message.
 * Exit codes: 0 done, 1 failed, 2 usage.
 */
/* eslint-disable import/order, import/first, no-console */
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';

// src/scripts (or dist/scripts) -> apps/drafting -> repo root.
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
import { Event } from '../models/Event.model';
/* eslint-enable import/order, import/first */

// A copy of DEMAND_CATEGORIES in services/intake.service.ts. Not imported:
// that module opens a Redis connection on load, which this one-off must not need.
const DEMAND_CATEGORIES = [
  'criminal',
  'civil',
  'family',
  'property',
  'consumer',
  'corporate',
  'labour',
  'notice',
  'affidavit',
  'agreement',
  'other',
] as const;

const USAGE =
  'Usage: npx ts-node --transpile-only apps/drafting/src/scripts/unset-event-labels.ts (--dry-run | --yes)';

const HAS_LABEL = { 'metadata.label': { $exists: true } };
const OFF_LIST_CATEGORY = {
  type: { $in: ['demand.no_template', 'demand.no_match'] },
  // $nin also matches a missing field; null (malformed reply) stays null.
  'metadata.category': { $nin: [...DEMAND_CATEGORIES, null] },
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry-run');
  const yes = args.includes('--yes');
  const unknown = args.filter((a) => a !== '--dry-run' && a !== '--yes');
  if (dry === yes || unknown.length > 0) {
    console.error(USAGE);
    process.exit(2);
  }

  await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 5000, autoIndex: false });
  try {
    const col = Event.collection;
    const pending = await col.countDocuments(HAS_LABEL);
    const offList = await col.countDocuments(OFF_LIST_CATEGORY);
    if (dry) {
      console.log(`events with metadata.label: ${pending}`);
      console.log(`demand events with a category not on the list: ${offList}`);
      console.log('Dry run: nothing written. Run with --yes to unset and fix.');
      return;
    }
    const r = await col.updateMany(HAS_LABEL, { $unset: { 'metadata.label': '' } });
    console.log(`events: matched=${r.matchedCount} unset=${r.modifiedCount}`);
    const c = await col.updateMany(OFF_LIST_CATEGORY, { $set: { 'metadata.category': 'other' } });
    console.log(`demand events: matched=${c.matchedCount} category-set-other=${c.modifiedCount}`);
    const left = await col.countDocuments(HAS_LABEL);
    const offLeft = await col.countDocuments(OFF_LIST_CATEGORY);
    console.log(`events with metadata.label left: ${left}`);
    console.log(`demand events with a category not on the list left: ${offLeft}`);
    if (left > 0 || offLeft > 0) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(`Unset stopped: ${err instanceof Error ? err.name : 'UnknownError'}`);
  void mongoose.disconnect().finally(() => process.exit(1));
});

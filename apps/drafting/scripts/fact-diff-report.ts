/**
 * T-147d — Ajay's weekly fact-diff review, written to a Markdown file.
 *
 *   yarn workspace @lawie/drafting report:fact-diffs --out <file> [--from YYYY-MM-DD] [--to YYYY-MM-DD]
 *
 * Default window: the 7 days before today (UTC). Needs MONGO_URI and
 * ENCRYPTION_KEY of the environment under review; loads .env.development or
 * .env from the repo root. Values are decrypted only to be masked; the file
 * holds no user id, no document id and no unmasked name, amount, date, case
 * number, police station or phone number. Prints only the output path.
 */
/* eslint-disable import/order, import/first, no-console */
import { config as loadDotenv } from 'dotenv';
import { existsSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

const repoRoot = join(__dirname, '..', '..', '..');
for (const candidate of ['.env.development', '.env']) {
  const p = join(repoRoot, candidate);
  if (existsSync(p)) {
    loadDotenv({ path: p });
    break;
  }
}

import mongoose from 'mongoose';

import { env } from '../src/config/env';
import {
  buildWeeklyFactDiffReport,
  loadWeeklyFactDiffData,
} from '../src/services/fact-diff-log';
/* eslint-enable import/order, import/first */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function parseDay(s: string | undefined, fallback: Date): Date {
  if (!s) return fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`not a YYYY-MM-DD date: ${s}`);
  return new Date(`${s}T00:00:00.000Z`);
}

async function main(): Promise<void> {
  const out = arg('out');
  if (!out) {
    console.error('Usage: report:fact-diffs --out <file> [--from YYYY-MM-DD] [--to YYYY-MM-DD]');
    process.exit(2);
  }
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  const to = parseDay(arg('to'), today);
  const from = parseDay(arg('from'), new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000));
  await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  try {
    const data = await loadWeeklyFactDiffData(from, to);
    const path = resolve(out);
    writeFileSync(path, buildWeeklyFactDiffReport(from, to, data), 'utf-8');
    console.log(path);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('[report:fact-diffs] failed:', err instanceof Error ? err.name : 'unknown');
  process.exit(1);
});

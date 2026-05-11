/**
 * Seed (or update) a single AppSetting from the command line.
 *
 *   yarn workspace @lawie/drafting seed:setting <key> <value> [description]
 *
 * Examples:
 *   yarn workspace @lawie/drafting seed:setting ai.drafting_model claude-sonnet-4-6
 *   yarn workspace @lawie/drafting seed:setting ai.preflight_model claude-haiku-4-5-20251001 "SCRUM-69 verifier"
 *
 * Intentional design notes:
 *   1. NO default values are baked into this script. The value comes from argv.
 *      This mirrors the founder rule "model name lives in DB only".
 *   2. No-op if the (key, value) pair already matches — safe to re-run.
 *   3. Uses the same MONGO_URI as the drafting service via env loading.
 *
 * For production, prefer the /admin/ai-config UI which records updatedBy.
 * This script is here for first-boot bootstrap and CI seeding.
 */
/* eslint-disable import/order, import/first */
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';

// Load .env.development from the repo root if present (yarn dev does the same).
// Falls back to process.env when running in production / staging.
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
import { AppSetting } from '../src/models/AppSetting.model';
/* eslint-enable import/order, import/first */

async function main(): Promise<void> {
  const [, , rawKey, rawValue, rawDescription] = process.argv;

  if (!rawKey || !rawValue) {
    console.error(
      [
        'Usage: yarn workspace @lawie/drafting seed:setting <key> <value> [description]',
        '',
        'Example:',
        '  yarn workspace @lawie/drafting seed:setting ai.drafting_model claude-sonnet-4-6',
      ].join('\n'),
    );
    process.exit(2);
  }

  const key = rawKey.trim();
  const value = rawValue.trim();
  const description = rawDescription?.trim();

  if (!/^[a-z][a-z0-9_.-]*$/i.test(key) || key.length > 120) {
    console.error(`✗ Invalid key "${key}". Must be lowercase alphanumeric with . _ - (max 120 chars).`);
    process.exit(2);
  }
  if (!value || value.length > 500) {
    console.error(`✗ Invalid value (empty or > 500 chars).`);
    process.exit(2);
  }

  console.info(`→ Connecting to MongoDB…`);
  await mongoose.connect(env.MONGO_URI);

  try {
    const existing = await AppSetting.findOne({ key }).lean();

    if (existing && existing.value === value && existing.description === description) {
      console.info(`✓ No change — "${key}" already set to "${value}".`);
      return;
    }

    const before = existing?.value ?? '(unset)';
    await AppSetting.findOneAndUpdate(
      { key },
      {
        $set: {
          value,
          ...(description !== undefined ? { description } : {}),
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );

    console.info(`✓ Set "${key}":  ${before}  →  ${value}`);
    if (description) console.info(`  description: ${description}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('✗ Seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});

/**
 * T-684 — copy the three legacy AI model AppSettings to their role keys.
 *
 *   MONGO_URI=<uri> npx ts-node --transpile-only scripts/migrate-model-settings.ts           # dry run (default)
 *   MONGO_URI=<uri> npx ts-node --transpile-only scripts/migrate-model-settings.ts --apply   # write
 *
 * (run from apps/drafting)
 *
 * MONGO_URI must be exported explicitly; this script never reads .env files.
 *
 *   ai.drafting_model  -> ai.model.drafter
 *   ai.intake_model    -> ai.model.extractor
 *   ai.preflight_model -> ai.model.fact_checker
 *
 * The read-time fallback in resolveModel (services/llm-usage.ts) already keeps
 * a deployment with only the old keys working for one release; this script is
 * the optional step that makes the role keys explicit before the fallback goes.
 *
 * Rules:
 *   1. Dry run unless `--apply` is given. A dry run reads only.
 *   2. Copies a legacy value ONLY when the role key does not exist. Never
 *      overwrites a role key (the write is an insert-only upsert), so it is
 *      safe to re-run.
 *   3. Never deletes or changes the legacy keys.
 *   4. Prints key names and counts only, never a value.
 *   5. MONGO_URI must be exported explicitly in the process environment; this
 *      script never reads .env files. Unset, empty or blank: exit 2.
 *   6. After connecting it prints the database name only (no host, credentials
 *      or query string), before any write.
 */
import mongoose from 'mongoose';

import { AppSetting } from '../src/models/AppSetting.model';
import { MODEL_ROLE_REGISTRY, MODEL_ROLES } from '../src/services/app-settings.service';

interface Pair {
  legacyKey: string;
  newKey: string;
}

function legacyPairs(): Pair[] {
  return MODEL_ROLES.flatMap((role) => {
    const s = MODEL_ROLE_REGISTRY[role];
    return s.legacyModelKey ? [{ legacyKey: s.legacyModelKey, newKey: s.modelKey }] : [];
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const unknown = args.filter((a) => a !== '--apply');
  if (unknown.length > 0) {
    console.error('Usage: migrate-model-settings.ts [--apply]   (dry run without --apply)');
    process.exit(2);
  }
  const apply = args.includes('--apply');

  const uri = process.env.MONGO_URI;
  if (!uri || uri.trim().length === 0) {
    console.error(
      '✗ MONGO_URI is not set. Export it explicitly; this script never reads .env files. Refusing to run.',
    );
    process.exit(2);
  }

  console.info(`→ ${apply ? 'APPLY' : 'Dry run (no writes; pass --apply to write)'}`);
  console.info('→ Connecting to MongoDB…');
  await mongoose.connect(uri);
  // The database name only: never the host, credentials or query string.
  console.info(`→ Database: ${mongoose.connection.name}`);

  let copied = 0;
  let keptExisting = 0;
  let noLegacy = 0;
  try {
    for (const { legacyKey, newKey } of legacyPairs()) {
      const legacy = await AppSetting.findOne({ key: legacyKey }).lean();
      if (!legacy) {
        noLegacy++;
        console.info(`  - ${legacyKey}: not set, nothing to copy`);
        continue;
      }
      const existing = await AppSetting.findOne({ key: newKey }).lean();
      if (existing) {
        keptExisting++;
        console.info(`  - ${newKey}: already set, left as it is (${legacyKey} not copied)`);
        continue;
      }
      if (apply) {
        // Insert-only: $setOnInsert never touches a row that appeared meanwhile.
        // Timestamps are set by hand inside $setOnInsert with timestamps: false, so
        // Mongoose adds no `$set: { updatedAt }` that would bump an existing row.
        const now = new Date();
        const r = await AppSetting.updateOne(
          { key: newKey },
          {
            $setOnInsert: {
              key: newKey,
              value: legacy.value,
              description: `Copied from ${legacyKey} (T-684 migration)`,
              ...(legacy.updatedBy ? { updatedBy: legacy.updatedBy } : {}),
              createdAt: now,
              updatedAt: now,
            },
          },
          { upsert: true, timestamps: false },
        );
        if (r.upsertedCount === 1) {
          copied++;
          console.info(`  + ${legacyKey} -> ${newKey}: copied`);
        } else {
          keptExisting++;
          console.info(`  - ${newKey}: appeared meanwhile, left as it is`);
        }
      } else {
        copied++;
        console.info(`  + ${legacyKey} -> ${newKey}: would copy`);
      }
    }
  } finally {
    await mongoose.disconnect();
  }

  console.info(
    `✓ ${apply ? 'Copied' : 'Would copy'} ${copied}; role key already set ${keptExisting}; legacy key not set ${noLegacy}. Legacy keys left in place.`,
  );
}

main().catch((err: unknown) => {
  // The error name only: a connection error message can carry parts of the URI.
  console.error('✗ Migration failed:', err instanceof Error ? err.name : 'unknown error');
  process.exit(1);
});

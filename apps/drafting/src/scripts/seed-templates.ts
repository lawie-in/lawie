/**
 * Seed script — sync the Template Mongo collection from the doc-rules registry.
 *
 * Pre-SCRUM-80 this script created 5 hardcoded starter templates. Post
 * ADR-018 the doc-rules directory is the single source of truth; this script
 * simply runs the same boot-time sync (`syncTemplateRegistry()`) against the
 * MONGO_URI from the env so devs can re-seed a fresh DB from the CLI without
 * starting the full service.
 *
 * Run: `yarn workspace @lawie/drafting seed:templates`
 *
 * Idempotent — running twice produces zero writes on the second pass.
 */
import path from 'path';

import dotenv from 'dotenv';
dotenv.config({
  path: path.resolve(__dirname, `../../../../.env.${process.env.NODE_ENV ?? 'development'}`),
});
import mongoose from 'mongoose';

import { getTemplateRegistry } from '../services/template-promoter';
import { syncTemplateRegistry } from '../services/template-seed.service';

async function main(): Promise<void> {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('MONGO_URI is not set — abort.');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.info(`Connected: ${mongoose.connection.host}/${mongoose.connection.name}`);

  const registry = getTemplateRegistry();
  console.info(
    `Registry: ${registry.configs.size} templates, ${registry.mismatchReport.length} mismatch line(s)`,
  );

  const result = await syncTemplateRegistry(registry);
  console.info(
    `Sync done: inserted=${result.inserted} updated=${result.updated} unchanged=${result.unchanged} deactivated=${result.deactivated}`,
  );

  await mongoose.disconnect();
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});

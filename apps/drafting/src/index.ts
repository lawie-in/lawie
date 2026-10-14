import { existsSync } from 'fs';
import path from 'path';

import * as Sentry from '@sentry/node';
import dotenv from 'dotenv';

dotenv.config({
  path: path.resolve(__dirname, `../../../.env.${process.env.NODE_ENV ?? 'development'}`),
});
// eslint-disable-next-line import/order, import/first
import './config/sentry';

import app from './app';
import { connectDatabase } from './config/database';
import { env } from './config/env';
import logger from './config/logger';
import { disconnectRedis } from './config/redis';
import { startHoldSweep, stopHoldSweep } from './services/credits.service';
import { primeToolSwitches } from './services/feature-switches';
import { listRulePackIds, loadSkeleton, SKELETONS_DIR } from './services/rule-pack.service';
import { loadSignedTables } from './services/signed-tables';
import { getTemplateRegistry } from './services/template-promoter';
import { runBootSync } from './services/template-seed.service';

/**
 * T-373 (Arjun, ADR-025 D1): every signed skeleton in `_skeletons/` is loaded once at
 * boot. `loadSkeleton` validates it against its pack and throws `RulePackError` on an
 * invalid file, so a bad skeleton stops the start (and /health) instead of failing an
 * advocate's first draft. No `_skeletons/` directory, or no file for a pack, is not an
 * error: those packs stay on today's path. Logs pack ids and a count only.
 */
function loadSkeletonsAtBoot(): string[] {
  if (!existsSync(SKELETONS_DIR)) return [];
  const loaded: string[] = [];
  for (const packId of listRulePackIds(SKELETONS_DIR)) {
    if (loadSkeleton(packId) !== null) loaded.push(packId);
  }
  return loaded;
}

async function bootstrap() {
  try {
    // T-371 (ADR-025 D2): the signed legal tables are served from memory. A missing or
    // unreadable file stops the boot here, before the service listens.
    const tables = loadSignedTables();
    logger.info({ signedTables: tables.sha256 }, 'Signed legal tables loaded');
    await connectDatabase();
    // SCRUM-78: build the doc-rules → TemplateConfig registry once at boot. Triggers
    // the disk walk, fills the in-memory map, writes mismatch report if any gaps exist.
    getTemplateRegistry();
    // T-373: an invalid signed skeleton stops the boot, as the template check does.
    const skeletons = loadSkeletonsAtBoot();
    logger.info(
      { skeletonCount: skeletons.length, skeletonPacks: skeletons },
      'Signed skeletons validated',
    );
    // SCRUM-80: reconcile the Template Mongo collection with the registry. One-way
    // sync, idempotent. Never blocks the listen call — errors fall back to the
    // in-memory registry serving the catalog.
    await runBootSync();
    // T-375: read the two tool switches once, so the first requests see their real
    // value. Never throws; a failed read leaves them off until a later refresh.
    await primeToolSwitches();
    app.listen(env.PORT, () => {
      logger.info(`📝 Drafting Service running on http://localhost:${env.PORT}`);
      logger.info(`   Environment: ${env.NODE_ENV}`);
    });
    // T-226: close expired Ink holds every 5 minutes (unref'd timer). Kept
    // out of app.ts, which the tests import.
    startHoldSweep();
  } catch (error) {
    logger.error({ error }, 'Failed to start drafting service');
    process.exit(1);
  }
}

bootstrap();

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down gracefully');
  stopHoldSweep();
  await disconnectRedis();
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled rejection');
  Sentry.captureException(reason);
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception — shutting down');
  Sentry.captureException(err);
  process.exit(1);
});

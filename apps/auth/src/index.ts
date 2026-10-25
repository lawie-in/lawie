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
import { startAccountEraseSweep, stopAccountEraseSweep } from './services/account-erase.service';
import { startTestAccountSweep, stopTestAccountSweep } from './services/test-account-sweep.service';
import { startUnverifiedSweep, stopUnverifiedSweep } from './services/unverified-sweep.service';

async function bootstrap() {
  try {
    await connectDatabase();
    // T-115c — finishes account erases cut off by a failure or a restart. Boot run, then every
    // 10 minutes; unref'd, never overlaps, never throws.
    startAccountEraseSweep();
    // T-358 — notices, then deletes, accounts never verified (30 days, 7 days' notice). Boot
    // run, then hourly; unref'd, never overlaps, never throws.
    startUnverifiedSweep();
    // T-563 — erases test accounts older than 7 days. Boot run, then hourly; unref'd, never
    // overlaps, never throws.
    startTestAccountSweep();
    app.listen(env.PORT, () => {
      logger.info(`🔐 Auth Service running on http://localhost:${env.PORT}`);
      logger.info(`   Environment: ${env.NODE_ENV}`);
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start auth service');
    process.exit(1);
  }
}

bootstrap();

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down gracefully');
  stopAccountEraseSweep();
  stopUnverifiedSweep();
  stopTestAccountSweep();
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

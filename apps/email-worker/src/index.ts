import path from 'path';

import * as Sentry from '@sentry/node';
import dotenv from 'dotenv';
import express from 'express';

dotenv.config({
  path: path.resolve(__dirname, `../../../.env.${process.env.NODE_ENV ?? 'development'}`),
});

// eslint-disable-next-line import/order, import/first
import { env } from './config/env';
// eslint-disable-next-line import/order, import/first
import { logger } from './config/logger';
// eslint-disable-next-line import/order, import/first
import { startWorkers, stopWorkers } from './worker';

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.2 : 0,
    serverName: 'email-worker',
  });
}

async function bootstrap() {
  startWorkers();

  // Minimal HTTP surface — /health for docker-compose + future liveness probes.
  const app = express();
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'email-worker',
      provider: env.EMAIL_PROVIDER,
      dryRun: env.EMAIL_DRY_RUN,
      timestamp: new Date().toISOString(),
    });
  });
  app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, provider: env.EMAIL_PROVIDER, dryRun: env.EMAIL_DRY_RUN },
      '📨 Email Worker up',
    );
  });
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Email worker failed to boot');
  Sentry.captureException(err);
  process.exit(1);
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down email worker');
  await stopWorkers();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled rejection');
  Sentry.captureException(reason);
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception — exiting');
  Sentry.captureException(err);
  process.exit(1);
});

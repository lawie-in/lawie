import path from 'path';

import * as Sentry from '@sentry/node';
import dotenv from 'dotenv';

dotenv.config({
  path: path.resolve(__dirname, `../../../.env.${process.env.NODE_ENV ?? 'development'}`),
});

// eslint-disable-next-line import/order, import/first
import { env } from './config/env';
// eslint-disable-next-line import/order, import/first
import { logger } from './config/logger';
// eslint-disable-next-line import/order, import/first
import { safeErrorFields, toSentrySafeError } from './providers/safe-log';
// eslint-disable-next-line import/order, import/first
import { startWorkers, stopWorkers } from './worker';
// eslint-disable-next-line import/order, import/first
import { createApp } from './app';
// eslint-disable-next-line import/order, import/first
import { initSentry } from './config/sentry';

// T-229: beforeSend and beforeSendTransaction run the shared scrub (config/sentry.ts).
initSentry(env);

async function bootstrap() {
  startWorkers();

  const app = createApp();
  app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, provider: env.EMAIL_PROVIDER, dryRun: env.EMAIL_DRY_RUN },
      '📨 Email Worker up',
    );
  });
}

bootstrap().catch((err) => {
  // T-353: name/code only in logs, message-free error to Sentry.
  logger.fatal({ err: safeErrorFields(err) }, 'Email worker failed to boot');
  Sentry.captureException(toSentrySafeError(err));
  // Flush so the event is sent before exit (resolves at once without a DSN).
  void Sentry.flush(2000).finally(() => process.exit(1));
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down email worker');
  await stopWorkers();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ err: safeErrorFields(reason) }, 'Unhandled rejection');
  Sentry.captureException(toSentrySafeError(reason));
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err: safeErrorFields(err) }, 'Uncaught exception — exiting');
  Sentry.captureException(toSentrySafeError(err));
  // Flush so the event is sent before exit (resolves at once without a DSN).
  void Sentry.flush(2000).finally(() => process.exit(1));
});

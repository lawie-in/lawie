import path from 'path';

import * as Sentry from '@sentry/node';
import dotenv from 'dotenv';

dotenv.config({
  path: path.resolve(__dirname, `../../../.env.${process.env.NODE_ENV ?? 'development'}`),
});
// eslint-disable-next-line import/order, import/first
import './config/sentry';

import app from './app';
import { env } from './config/env';
import logger from './config/logger';
import { disconnectRedis } from './config/redis';

app.listen(env.PORT, () => {
  logger.info(`🚀 Gateway running on http://localhost:${env.PORT}`);
  logger.info(`   → auth-service:     ${env.AUTH_SERVICE_URL}`);
  logger.info(`   → drafting-service:  ${env.DRAFTING_SERVICE_URL}`);
  logger.info(`   → billing-service:   ${env.BILLING_SERVICE_URL}`);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down gracefully');
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

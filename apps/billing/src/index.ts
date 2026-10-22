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
import { ensureInkLedgerIndexes } from './config/ink-ledger-indexes';
import logger from './config/logger';
import { ensureSubscriptionIndexes } from './config/subscription-indexes';
import { startInvoiceSweep } from './services/invoice-sweep.service';
import { startReconcileSweep } from './services/subscription-reconcile-sweep.service';

async function bootstrap() {
  try {
    await connectDatabase();
    await ensureInkLedgerIndexes(); // T-519: never throws; logs and continues on failure
    await ensureSubscriptionIndexes(); // T-536: never throws; logs, reports and continues
    app.listen(env.PORT, () => {
      logger.info(`💳 Billing Service running on http://localhost:${env.PORT}`);
      logger.info(`   Environment: ${env.NODE_ENV}`);
    });
    startInvoiceSweep(); // T-436: finish GST invoices left in 'issuing', at boot and every 5 min
    startReconcileSweep(); // T-527: adopt or cancel subs a timed-out create left at Razorpay
  } catch (error) {
    logger.error({ error }, 'Failed to start billing service');
    process.exit(1);
  }
}

bootstrap();

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled rejection');
  Sentry.captureException(reason);
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception — shutting down');
  Sentry.captureException(err);
  process.exit(1);
});

import path from 'path';

import dotenv from 'dotenv';

dotenv.config({
  path: path.resolve(__dirname, `../../../.env.${process.env.NODE_ENV ?? 'development'}`),
});
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

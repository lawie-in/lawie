import path from 'path';

import dotenv from 'dotenv';

dotenv.config({
  path: path.resolve(__dirname, `../../../.env.${process.env.NODE_ENV ?? 'development'}`),
});
import app from './app';
import { connectDatabase } from './config/database';
import { env } from './config/env';
import logger from './config/logger';

async function bootstrap() {
  try {
    await connectDatabase();
    app.listen(env.PORT, () => {
      logger.info(`📝 Drafting Service running on http://localhost:${env.PORT}`);
      logger.info(`   Environment: ${env.NODE_ENV}`);
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start drafting service');
    process.exit(1);
  }
}

bootstrap();

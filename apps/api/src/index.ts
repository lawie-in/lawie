import 'dotenv/config';
import app from './app';
import { connectDatabase } from './config/database';
import logger from './config/logger';

const PORT = process.env.PORT || 5000;

async function bootstrap() {
  try {
    await connectDatabase();
    app.listen(PORT, () => {
      logger.info(`🚀 Lawie API running on http://localhost:${PORT}`);
      logger.info(`📚 Swagger docs at http://localhost:${PORT}/api/docs`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap();

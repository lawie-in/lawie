import mongoose from 'mongoose';
import logger from './logger';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/lawie';

export async function connectDatabase(): Promise<void> {
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    logger.info(`✅ MongoDB connected: ${mongoose.connection.host}`);

    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected. Attempting to reconnect...');
    });
  } catch (error) {
    logger.error('Failed to connect to MongoDB:', error);
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected.');
}

import Redis from 'ioredis';

import { env } from './env';
import logger from './logger';

const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 2000);
    return delay;
  },
  // Keep connection alive — Redis Cloud drops idle TCP connections after ~5 min
  keepAlive: 30000,
  // Reconnect automatically after disconnect
  enableOfflineQueue: true,
  lazyConnect: false,
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error({ err }, 'Redis connection error'));

export async function disconnectRedis(): Promise<void> {
  await redis.quit();
  logger.info('Redis disconnected');
}

export default redis;

/**
 * T-646 (Arjun ruling 7): rate limits on POST /payments/:id/concerns, on the
 * auth T-522 pattern (fixed windows in Redis, INCR + PEXPIRE).
 *
 *   billing:concern:user:<userId>       5 per 24 h   (concerns created)
 *   billing:concern:ip:<sha256(ip)>     20 per hour  (every POST)
 *
 * The IP is hashed: no address in Redis. Nothing else goes in Redis (never the
 * note or the reason).
 *
 * Fail closed: any Redis error, timeout, or REDIS_URL unset throws
 * ConcernRateLimitUnavailableError and the route answers 503 with nothing
 * stored.
 *
 * The client is created lazily from REDIS_URL (ioredis, hoisted from
 * @lawie/email-client). setConcernRateLimitRedis() swaps it in tests.
 */
import crypto from 'crypto';

import type { Request } from 'express';
import Redis from 'ioredis';

import { env } from '../config/env';
import logger from '../config/logger';

export const CONCERN_USER_CAP = 5;
export const CONCERN_USER_WINDOW_MS = 24 * 60 * 60 * 1000;
export const CONCERN_IP_CAP = 20;
export const CONCERN_IP_WINDOW_MS = 60 * 60 * 1000;
/** Longest wait for Redis before failing closed. */
export const CONCERN_REDIS_TIMEOUT_MS = 2_000;

export const concernUserKey = (userId: string): string => `billing:concern:user:${userId}`;
export const concernIpKey = (ip: string): string =>
  `billing:concern:ip:${crypto.createHash('sha256').update(ip, 'utf8').digest('hex')}`;

export class ConcernRateLimitUnavailableError extends Error {
  constructor() {
    super('concern rate-limit store unavailable');
    this.name = 'ConcernRateLimitUnavailableError';
  }
}

export type ConcernRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

type RedisLike = Pick<Redis, 'incr' | 'pttl' | 'pexpire'>;

let client: RedisLike | null = null;

function getClient(): RedisLike {
  if (client) return client;
  if (!env.REDIS_URL) throw new ConcernRateLimitUnavailableError();
  const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    commandTimeout: CONCERN_REDIS_TIMEOUT_MS,
    connectTimeout: CONCERN_REDIS_TIMEOUT_MS,
    keepAlive: 30_000,
  });
  // Without a listener ioredis prints unhandled error events. Class only.
  redis.on('error', (err: unknown) => {
    logger.warn(
      { errName: err instanceof Error ? err.name : 'unknown' },
      'concern rate limit: Redis error',
    );
  });
  client = redis;
  return client;
}

/** Test seam: use this client (null restores the lazy REDIS_URL client). */
export function setConcernRateLimitRedis(next: RedisLike | null): void {
  client = next;
}

function withTimeout<T>(p: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ConcernRateLimitUnavailableError()),
      CONCERN_REDIS_TIMEOUT_MS,
    );
    timer.unref();
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

async function hit(key: string, windowMs: number): Promise<[number, number]> {
  const redis = getClient();
  const count = await redis.incr(key);
  let pttl = await redis.pttl(key);
  if (count === 1 || pttl < 0) {
    await redis.pexpire(key, windowMs);
    pttl = windowMs;
  }
  return [count, pttl];
}

async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await withTimeout(fn());
  } catch (err) {
    if (err instanceof ConcernRateLimitUnavailableError) throw err;
    logger.warn(
      { errName: err instanceof Error ? err.name : 'unknown' },
      'concern rate limit: store failed; failing closed',
    );
    throw new ConcernRateLimitUnavailableError();
  }
}

const toRetrySeconds = (ms: number): number => Math.max(1, Math.ceil(ms / 1000));

/** Counts one POST from this IP (20/h). Throws ConcernRateLimitUnavailableError on a store failure. */
export async function consumeConcernIpQuota(
  ip: string | undefined,
): Promise<ConcernRateLimitResult> {
  return guarded(async () => {
    const [count, ttl] = await hit(concernIpKey(ip ?? 'unknown'), CONCERN_IP_WINDOW_MS);
    return count > CONCERN_IP_CAP
      ? { allowed: false, retryAfterSeconds: toRetrySeconds(ttl) }
      : { allowed: true };
  });
}

/** Counts one concern for this user (5 per 24 h). Throws on a store failure. */
export async function consumeConcernUserQuota(userId: string): Promise<ConcernRateLimitResult> {
  return guarded(async () => {
    const [count, ttl] = await hit(concernUserKey(userId), CONCERN_USER_WINDOW_MS);
    return count > CONCERN_USER_CAP
      ? { allowed: false, retryAfterSeconds: toRetrySeconds(ttl) }
      : { allowed: true };
  });
}

/**
 * The caller's IP, as auth's clientIpForRateLimit: billing sits behind the
 * gateway, which forwards nginx's X-Forwarded-For; its LAST entry is the
 * address nginx saw. Without it, the socket address.
 */
export function clientIpForRateLimit(req: Request): string | undefined {
  const xff = req.headers['x-forwarded-for'];
  const raw = Array.isArray(xff) ? xff.join(',') : xff;
  if (typeof raw === 'string') {
    const parts = raw
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last.slice(0, 64);
  }
  return req.ip ?? req.socket?.remoteAddress ?? undefined;
}

import { RATE_LIMITS } from '@lawie/shared';
import { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';

import { env } from '../config/env';

/**
 * T-567 item 24 (Ajay): the signed T-221 limit line and its variants. No upsell.
 */
export const RATE_LIMIT_MESSAGES = {
  minutes: 'Too many requests. Please wait {n} minutes, then try again.',
  oneMinute: 'Too many requests. Please wait 1 minute, then try again.',
  unknown: 'Too many requests. Please wait a few minutes, then try again.',
} as const;

/**
 * {n} is the Retry-After seconds rounded up to whole minutes, minimum 1.
 * No usable Retry-After gives the generic line.
 */
export function rateLimitMessage(retryAfterSeconds: unknown): string {
  if (retryAfterSeconds === undefined || retryAfterSeconds === null || retryAfterSeconds === '') {
    return RATE_LIMIT_MESSAGES.unknown;
  }
  const seconds = Number(retryAfterSeconds);
  if (!Number.isFinite(seconds) || seconds < 0) return RATE_LIMIT_MESSAGES.unknown;
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes === 1) return RATE_LIMIT_MESSAGES.oneMinute;
  return RATE_LIMIT_MESSAGES.minutes.replace('{n}', String(minutes));
}

/**
 * express-rate-limit sets Retry-After (standardHeaders) before it builds the body,
 * so the body reads the same value the client gets in the header.
 */
function rateLimitBody(_req: Request, res: Response): { error: string } {
  return { error: rateLimitMessage(res.getHeader('Retry-After')) };
}

/**
 * Build the rate-limit store.
 * - test / development: in-memory (single instance, no Redis dependency)
 * - staging / production: Redis store (shared across instances)
 *
 * In-memory is intentional for dev — Redis store uses Lua scripts (SCRIPT LOAD)
 * which cause "unexpected reply" errors when the connection is unstable.
 */
function buildStore() {
  if (env.NODE_ENV === 'test' || env.NODE_ENV === 'development') {
    return undefined; // express-rate-limit in-memory default
  }

  // Dynamic import to avoid loading Redis store in test/dev
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const RedisStore = require('rate-limit-redis').default;
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const redis = require('../config/redis').default;
  return new RedisStore({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sendCommand: (...args: string[]) => (redis as any).call(args[0], ...args.slice(1)),
    prefix: 'rl:',
  });
}

/**
 * Per-user, plan-based rate limiter.
 * Free = 60 req/min, Pro = 300 req/min.
 */
export function createPlanRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: (req: Request) => {
      const plan = req.jwtPayload?.plan;
      return plan === 'pro' ? RATE_LIMITS.pro : RATE_LIMITS.free;
    },
    keyGenerator: (req: Request) => req.jwtPayload?.sub ?? req.ip ?? 'unknown',
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitBody,
    store: buildStore(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

/**
 * IP-based global rate limiter for public/unauthenticated routes.
 * 200 requests per 15 minutes.
 */
export const publicRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitBody,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;

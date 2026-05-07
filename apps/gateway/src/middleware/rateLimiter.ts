import { RATE_LIMITS } from '@lawie/shared';
import { Request } from 'express';
import rateLimit from 'express-rate-limit';

import { env } from '../config/env';

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
    message: { error: 'Rate limit exceeded. Upgrade to Pro for higher limits.' },
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
  message: { error: 'Too many requests, please try again later.' },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any;

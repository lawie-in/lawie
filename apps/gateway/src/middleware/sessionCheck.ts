import { sessionKey } from '@lawie/shared';
import { Request, Response, NextFunction } from 'express';

import redis from '../config/redis';

/**
 * Verify that the access token has an active session in Redis.
 * Must run AFTER the authenticate middleware (needs req.jwtPayload + req.tokenHash).
 * Fails closed: Redis errors → 503 (never bypass).
 */
export async function sessionCheck(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { jwtPayload, tokenHash } = req;

  if (!jwtPayload || !tokenHash) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  // Dev bypass — skip Redis session lookup
  if (tokenHash === 'dev-bypass-no-token-hash') {
    next();
    return;
  }

  try {
    const session = await redis.get(sessionKey(jwtPayload.sub, tokenHash));

    if (!session) {
      res.status(401).json({ error: 'Session expired or revoked. Please log in again.' });
      return;
    }

    next();
  } catch {
    // Fail closed — never allow requests through when Redis is down
    res.status(503).json({ error: 'Session service unavailable. Please try again shortly.' });
  }
}

import { UserRole } from '@lawie/shared';
import { Request, Response, NextFunction } from 'express';

import logger from '../config/logger';
import { verifyAccessToken, TokenPayload } from '../services/jwt.service';
import { hashToken, validateSession } from '../services/session.service';

import { AppError } from './errorHandler';

// req.jwtPayload holds the decoded JWT claims for authenticated routes.
// Keep this separate from req.user, which Passport uses for OAuth sessions.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      jwtPayload?: TokenPayload;
    }
  }
}

/**
 * Verify the Bearer JWT and set req.jwtPayload. Does NOT check the Redis session.
 * Returns the raw token and claims on success, or null after calling next(err).
 */
function verifyBearer(
  req: Request,
  next: NextFunction,
): { token: string; payload: TokenPayload } | null {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    next(new AppError(401, 'No token provided. Please log in.'));
    return null;
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = verifyAccessToken(token);
    req.jwtPayload = payload;
    return { token, payload };
  } catch (err) {
    if ((err as Error).name === 'TokenExpiredError') {
      next(new AppError(401, 'Your session has expired. Please log in again.'));
    } else {
      next(new AppError(401, 'Invalid token. Please log in again.'));
    }
    return null;
  }
}

/**
 * Verify the access token AND require a live session in Redis (T-325), so a token
 * revoked by logout, revoke-all or a Google link is refused. Mirrors the gateway's
 * sessionCheck: no session -> 401, Redis error -> 503 (fail closed, never bypass).
 * Async: every outcome goes through next() so Express sees errors.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const verified = verifyBearer(req, next);
  if (verified === null) return;

  let session: Awaited<ReturnType<typeof validateSession>>;
  try {
    session = await validateSession(verified.payload.sub, hashToken(verified.token));
  } catch (err) {
    // Never log the token or its hash.
    logger.warn({ err, userId: verified.payload.sub }, 'session lookup failed');
    req.jwtPayload = undefined;
    return next(new AppError(503, 'Session service unavailable. Please try again shortly.'));
  }

  if (!session) {
    req.jwtPayload = undefined;
    return next(new AppError(401, 'Session expired or revoked. Please log in again.'));
  }

  next();
}

/**
 * JWT-only check, no Redis session lookup. ONLY for POST /logout, so a second logout
 * of an already-deleted session stays an idempotent 200 (T-325 step 2). Never use
 * this on a route that reads or changes data.
 */
export function authenticateAllowRevoked(req: Request, _res: Response, next: NextFunction): void {
  if (verifyBearer(req, next) === null) return;
  next();
}

export function authorize(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.jwtPayload) {
      return next(new AppError(401, 'Unauthenticated'));
    }
    if (!roles.includes(req.jwtPayload.role)) {
      return next(
        new AppError(
          403,
          `Access denied. Required role: ${roles.join(' or ')}. Your role: ${req.jwtPayload.role}`,
        ),
      );
    }
    next();
  };
}

import { INTERNAL_HEADERS } from '@lawie/shared';
import { Request, Response, NextFunction } from 'express';

import { env } from '../config/env';

export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  role: string;
  plan: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      jwtPayload?: JwtPayload;
    }
  }
}

/**
 * Validates that the request came from the API gateway via the shared internal secret.
 * User context is read from X-User-* headers injected by the gateway.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const secret = req.headers[INTERNAL_HEADERS.SECRET] as string | undefined;

  if (!secret || secret !== env.INTERNAL_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const userId = req.headers[INTERNAL_HEADERS.USER_ID] as string | undefined;
  if (!userId) {
    res.status(401).json({ error: 'Missing user context' });
    return;
  }

  req.jwtPayload = {
    sub: userId,
    email: (req.headers[INTERNAL_HEADERS.USER_EMAIL] as string) ?? '',
    name: (req.headers[INTERNAL_HEADERS.USER_NAME] as string) ?? '',
    role: (req.headers[INTERNAL_HEADERS.USER_ROLE] as string) ?? 'Client',
    plan: (req.headers[INTERNAL_HEADERS.USER_PLAN] as string) ?? 'free',
  };

  next();
}

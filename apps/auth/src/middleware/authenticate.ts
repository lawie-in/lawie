import { UserRole } from '@lawie/shared';
import { Request, Response, NextFunction } from 'express';

import { verifyAccessToken, TokenPayload } from '../services/jwt.service';

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

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError(401, 'No token provided. Please log in.'));
  }

  const token = authHeader.split(' ')[1];

  try {
    req.jwtPayload = verifyAccessToken(token);
    next();
  } catch (err) {
    if ((err as Error).name === 'TokenExpiredError') {
      return next(new AppError(401, 'Your session has expired. Please log in again.'));
    }
    return next(new AppError(401, 'Invalid token. Please log in again.'));
  }
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

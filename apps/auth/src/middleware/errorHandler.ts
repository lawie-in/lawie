import * as Sentry from '@sentry/node';
import { Request, Response, NextFunction } from 'express';

import logger from '../config/logger';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true,
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : 500;
  const message = isAppError ? err.message : 'Internal Server Error';

  logger.error({
    err,
    req: { method: req.method, url: req.url, ip: req.ip },
    statusCode,
  });

  // Send non-operational (unexpected) errors to Sentry
  if (!isAppError || !err.isOperational) {
    Sentry.captureException(err);
  }

  res.status(statusCode).json({
    status: 'error',
    statusCode,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

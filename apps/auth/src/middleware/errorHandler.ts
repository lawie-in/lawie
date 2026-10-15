import { maskPathTokens } from '@lawie/shared';
import * as Sentry from '@sentry/node';
import { Request, Response, NextFunction } from 'express';

import logger, { maskEmails } from '../config/logger';

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

  // Logs only: err (via the PII-scrubbing `err` serializer), method, url (path only, emails
  // masked), ip, statusCode. Never req.body, headers or query objects (T-210).
  // T-242 (Ajay condition 3): the query string is cut off, so campaign tags (and any other query
  // value) never reach the logs.
  const path = (req.url ?? '').split('?')[0] ?? '';
  logger.error(
    {
      err,
      req: { method: req.method, url: maskPathTokens(maskEmails(path)), ip: req.ip },
      statusCode,
    },
    'Request failed',
  );

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

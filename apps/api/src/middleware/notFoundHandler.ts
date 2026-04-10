import { Request, Response } from 'express';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    status: 'error',
    statusCode: 404,
    message: `Route ${req.method} ${req.path} not found`,
  });
}

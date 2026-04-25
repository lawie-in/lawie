import crypto from 'crypto';

import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';

import { env } from '../config/env';

export interface TokenPayload {
  sub: string;
  email: string;
  name: string;
  role: string;
  plan: string;
  type: 'access' | 'refresh';
}

// Extend Express Request with JWT payload and token hash
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      jwtPayload?: TokenPayload;
      tokenHash?: string;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided. Please log in.' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload & TokenPayload;

    if (decoded.type !== 'access') {
      res.status(401).json({ error: 'Invalid token type.' });
      return;
    }

    req.jwtPayload = decoded;
    req.tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    next();
  } catch (err) {
    if ((err as Error).name === 'TokenExpiredError') {
      res.status(401).json({ error: 'Token expired. Please refresh or log in again.' });
      return;
    }
    res.status(401).json({ error: 'Invalid token. Please log in again.' });
  }
}

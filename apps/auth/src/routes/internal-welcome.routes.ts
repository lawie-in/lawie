/**
 * T-587 (Arjun, option A) — POST /internal/welcome/prepare { userId }. Called only by the email
 * worker for an auth.welcome job (userId only in Redis). Guarded by INTERNAL_SECRET with the
 * same constant-time compare as internal-verify.routes.ts; the gateway refuses every path
 * containing /internal/. Mints nothing.
 *
 *  200 { email, name, loginUrl }  name is '' when the account has none (or it is just the address)
 *  404 { error: 'not_found' }  no such user, deactivated, being closed, a test account, or no
 *                              welcome claimed (welcomeQueuedAt unset): nothing sent
 *  400 / 401  bad body / bad secret
 *
 * The response holds PII: never logged, marked no-store.
 */
import { INTERNAL_HEADERS } from '@lawie/shared';
import { Router, type NextFunction, type Request, type Response } from 'express';
import mongoose from 'mongoose';

import { User } from '../models/User.model';
import { buildLoginUrl } from '../services/password-reset.service';
import { WELCOME_ELIGIBLE } from '../services/welcome-email.service';

import { internalSecretMatches } from './internal-verify.routes';

const router = Router();

/** The display name for the mail: trimmed; '' when absent or when it is only the address. */
function welcomeName(name: unknown, email: string): string {
  if (typeof name !== 'string') return '';
  const trimmed = name.trim();
  if (trimmed.toLowerCase() === email.trim().toLowerCase()) return '';
  return trimmed;
}

router.post(
  '/internal/welcome/prepare',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    res.set('Cache-Control', 'no-store');
    if (!internalSecretMatches(req.headers[INTERNAL_HEADERS.SECRET])) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const userId = (req.body as { userId?: unknown } | undefined)?.userId;
    if (typeof userId !== 'string' || userId.length === 0) {
      res.status(400).json({ error: 'userId required' });
      return;
    }
    try {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      const user = await User.findOne(
        {
          _id: new mongoose.Types.ObjectId(userId),
          ...WELCOME_ELIGIBLE,
          welcomeQueuedAt: { $ne: null },
        },
        { email: 1, name: 1 },
      ).lean();
      if (!user || typeof user.email !== 'string' || user.email.length === 0) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.status(200).json({
        email: user.email,
        name: welcomeName(user.name, user.email),
        loginUrl: buildLoginUrl(),
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;

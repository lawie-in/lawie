/**
 * T-221 — POST /internal/password-reset/mint { userId }.
 *
 * Called only by the email worker, never by a browser: guarded by INTERNAL_SECRET with the same
 * constant-time compare as the verify mint, and the gateway refuses every path containing
 * /internal/.
 *
 *  200 { variant: 'link', email, resetUrl }    fresh 30-minute link; any older link stops working
 *  200 { variant: 'google', email, loginUrl }  Google-only account: no token minted (AC6)
 *  404 { error: 'not_found' }  no such user, inactive, being closed: nothing minted, no email
 *  400 / 401  bad body / bad secret
 *
 * The response holds PII and a live credential: it is never logged here (no request logger is
 * mounted in auth) and is marked no-store.
 */
import { INTERNAL_HEADERS } from '@lawie/shared';
import { Router, type NextFunction, type Request, type Response } from 'express';

import { mintPasswordReset } from '../services/password-reset.service';

import { internalSecretMatches } from './internal-verify.routes';

const router = Router();

router.post(
  '/internal/password-reset/mint',
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
      const result = await mintPasswordReset(userId);
      switch (result.kind) {
        case 'link':
          res.status(200).json({ variant: 'link', email: result.email, resetUrl: result.resetUrl });
          return;
        case 'google':
          res
            .status(200)
            .json({ variant: 'google', email: result.email, loginUrl: result.loginUrl });
          return;
        case 'not_found':
          res.status(404).json({ error: 'not_found' });
          return;
      }
    } catch (err) {
      next(err);
    }
  },
);

export default router;

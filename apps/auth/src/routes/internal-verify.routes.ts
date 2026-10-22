/**
 * T-223 (Arjun, condition 2) — POST /internal/verify-email/mint { userId }.
 *
 * Called only by the email worker, never by a browser: guarded by INTERNAL_SECRET with a
 * constant-time compare, and the gateway refuses every path containing /internal/ (condition 3).
 *
 * T-522 (Arjun 1): the body may carry kind: 'signin' | 'verify'. Anything else, or nothing, is
 * 'verify' (never a sign-in link by default). The email worker asks for 'signin' for the verify
 * mail. The response also carries signupInkGranted (plumbing for the mail's body variant).
 *
 *  200 { email, name, link, signupInkGranted }  fresh link minted; any older link no longer works
 *  409 { error: 'not_eligible' }  already verified, a Google account, or deactivated: nothing minted
 *  404 { error: 'not_found' }  no such user: nothing minted
 *  400 / 401  bad body / bad secret
 *
 * The response holds PII and a live credential: it is never logged here (no request logger is
 * mounted in auth) and is marked no-store.
 */
import crypto from 'crypto';

import { INTERNAL_HEADERS } from '@lawie/shared';
import { Router, type NextFunction, type Request, type Response } from 'express';
import mongoose from 'mongoose';

import { env } from '../config/env';
import { User } from '../models/User.model';
import { buildLoginUrl } from '../services/password-reset.service';
import { mintVerifyLink, normaliseLinkKind } from '../services/verify-email.service';

/** `${FRONTEND_URL}/forgot-password`: the M5 mail's reset link (a page, never a token). */
export function buildForgotPasswordUrl(): string {
  return `${env.FRONTEND_URL.replace(/\/+$/, '')}/forgot-password`;
}

const router = Router();

/** Constant-time: both sides hashed to 32 bytes first, so length does not leak either. */
export function internalSecretMatches(provided: unknown): boolean {
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const a = crypto.createHash('sha256').update(provided, 'utf8').digest();
  const b = crypto.createHash('sha256').update(env.INTERNAL_SECRET, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

router.post(
  '/internal/verify-email/mint',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    res.set('Cache-Control', 'no-store');
    if (!internalSecretMatches(req.headers[INTERNAL_HEADERS.SECRET])) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const body = req.body as { userId?: unknown; kind?: unknown } | undefined;
    const userId = body?.userId;
    if (typeof userId !== 'string' || userId.length === 0) {
      res.status(400).json({ error: 'userId required' });
      return;
    }
    try {
      const result = await mintVerifyLink(userId, { linkKind: normaliseLinkKind(body?.kind) });
      if (result.kind === 'not_eligible') {
        res.status(409).json({ error: 'not_eligible' });
        return;
      }
      if (result.kind === 'not_found') {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.status(200).json({
        email: result.email,
        name: result.name,
        link: result.link,
        signupInkGranted: result.signupInkGranted,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * T-522 (AJ-522-M5) — POST /internal/signup-attempt/prepare { userId }. Called only by the email
 * worker for an auth.signupAttempt job (userId only in Redis, T-223 condition 1). Mints nothing:
 * the mail links to the sign-in and forgot-password pages.
 *
 *  200 { email, signInUrl, resetUrl }
 *  404 { error: 'not_found' }  no such user, deactivated, or being closed: nothing sent
 *  400 / 401  bad body / bad secret
 *
 * The response holds PII: never logged, marked no-store.
 */
router.post(
  '/internal/signup-attempt/prepare',
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
      const user = await User.findById(userId, { email: 1, isActive: 1, erasure: 1 }).lean();
      if (!user || user.isActive === false || user.erasure) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.status(200).json({
        email: user.email,
        signInUrl: buildLoginUrl(),
        resetUrl: buildForgotPasswordUrl(),
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;

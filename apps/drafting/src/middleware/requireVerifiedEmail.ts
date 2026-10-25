/**
 * T-522 (Arjun ruling 6, 22 Oct 2026) — the drafting fence: an unverified email account makes
 * no model calls. Applied right after authenticate (and requireCurrentPrivacy where present),
 * before templateGuard and enforceCredits, so an unverified user (0 Ink) gets this 403 before
 * any 402. Not applied to export, annexures, document CRUD or /intake/answers (AJ-522-M1(a)).
 *
 * Reads the user record (not a JWT claim; none exists) and uses the shared isVerified rule:
 * emailVerified, a Google account, or a linked googleId (same as billing's T-223 guard).
 *   403 { error: 'email_verification_required' }  unverified, unknown or malformed user
 *   503 { error: 'Service unavailable' }           the read failed (fail closed)
 * Logs the userId only.
 *
 * T-522 (Arjun, 22 Oct 2026, golden-set fixture ruling (a)): the T-147e fixture user passes
 * before any DB read, with the same gateway-signed trust and the same single helper as
 * enforceCredits, feature-switches and credits.service. T-147e stands: it has no users row.
 * A non-fixture user with no row still gets the 403.
 */
import { EMAIL_VERIFICATION_REQUIRED, isVerified } from '@lawie/shared';
import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';

import logger from '../config/logger';
import { User } from '../models/User.model';
import { isFixtureUser } from '../services/run-origin';

export async function requireVerifiedEmail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.jwtPayload?.sub;
  if (isFixtureUser(userId)) {
    next();
    return;
  }
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    res.status(403).json({ error: EMAIL_VERIFICATION_REQUIRED });
    return;
  }
  let user;
  try {
    user = await User.findById(userId, { emailVerified: 1, authProvider: 1, googleId: 1 }).lean();
  } catch {
    logger.error({ userId }, 'Email verification check failed');
    res.status(503).json({ error: 'Service unavailable' });
    return;
  }
  if (!isVerified(user)) {
    res.status(403).json({ error: EMAIL_VERIFICATION_REQUIRED });
    return;
  }
  next();
}

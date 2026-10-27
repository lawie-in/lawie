/**
 * T-587 — the welcome email, sent once per user after the address is verified
 * (verifyEmailToken) or on the first Google sign-in / the Google link that verifies a password
 * account (passport.ts).
 *
 * Once only: queueWelcomeEmail atomically claims `welcomeQueuedAt` (null or absent → now) on a
 * live, non-test account, and only the winning call enqueues. The flag is never cleared, so a
 * failed enqueue is NOT retried (at most once: no duplicate mail, accepted by Priya). Accounts
 * created before go-live are never backfilled: nothing here scans for them.
 *
 * Arjun (option A, 26 Oct 2026): the job carries the userId only, like the verify mail. The
 * worker asks auth (POST /internal/welcome/prepare) for the address and name at send time. The
 * email client gives the job a fixed id per user (`welcome-<userId>`), a second fence.
 *
 * Never awaited on the enqueue, never throws into sign-up or sign-in. Logs carry the userId and
 * the error class name only.
 */
import { enqueueEmail } from '@lawie/email-client';
import mongoose from 'mongoose';

import logger from '../config/logger';
import { User } from '../models/User.model';

/**
 * Same rule as verify-email.service.ts LIVE_ACCOUNT (active, not being closed). Kept here, not
 * imported, because verify-email.service.ts imports this module.
 */
const LIVE_ACCOUNT = { isActive: { $ne: false }, erasure: { $exists: false } };

/** What makes an account eligible for the welcome claim (and for the worker's prepare). */
export const WELCOME_ELIGIBLE = {
  ...LIVE_ACCOUNT,
  // T-563 (Arjun default 6): a test account (the develop-only sign-up bypass) is never mailed.
  isTestAccount: { $ne: true },
};

/** Error class name only (never the message, which can echo values), for logs. */
function errorKind(err: unknown): string {
  const kind = err instanceof Error ? err.constructor?.name : undefined;
  return typeof kind === 'string' && kind ? kind : 'Error';
}

/**
 * The enqueue itself: the one place that talks to the email client. Fire-and-forget; a failed
 * push is logged with the userId and errKind only. Started inside a promise chain, so even a
 * synchronous throw (or a non-promise return) from the client is caught and never reaches the
 * caller (the verify request or the OAuth callback).
 */
export function enqueueWelcomeJob(userId: string): void {
  void Promise.resolve()
    .then(() => enqueueEmail({ template: 'auth.welcome', userId }))
    .catch((err: unknown) => {
      const errKind = errorKind(err);
      logger.error({ userId, errKind }, 'Welcome email enqueue failed');
    });
}

/**
 * Claims the welcome for userId and, if this call won the claim, queues it. A user already
 * welcomed, unknown, deactivated, being closed or a test account matches nothing: silent no-op.
 * Never throws (a claim error is logged and swallowed).
 */
export async function queueWelcomeEmail(userId: string): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(userId)) return;
  let claimed;
  try {
    claimed = await User.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(userId),
        ...WELCOME_ELIGIBLE,
        $or: [{ welcomeQueuedAt: { $exists: false } }, { welcomeQueuedAt: null }],
      },
      { $set: { welcomeQueuedAt: new Date() } },
      { new: true, projection: { _id: 1 } },
    ).lean();
  } catch (err) {
    const errKind = errorKind(err);
    logger.error({ userId, errKind }, 'Welcome email claim failed');
    return;
  }
  if (!claimed) return;
  enqueueWelcomeJob(userId);
  logger.info({ userId }, 'Welcome email queued');
}

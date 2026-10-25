import { Router } from 'express';

import {
  register,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPasswordHandler,
  checkResetTokenHandler,
  getMe,
  updateMeHandler,
  acceptPrivacyHandler,
  verifyEmailHandler,
  resendVerifyEmailHandler,
  resendVerifyByEmailHandler,
  closeAccountHandler,
  changePasswordHandler,
  listSessionsHandler,
  deleteSessionHandler,
  privacyHistoryHandler,
} from '../controllers/auth.controller';
import { authenticate, authenticateAllowRevoked } from '../middleware/authenticate';

const router = Router();

// T-522 — neutral sign-up: 422 first, then the IP and email buckets (signup-rate-limit.ts), then
// one padded 202 for a new and an existing address. No session.
router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', authenticateAllowRevoked, logout);
// T-221 — public. Rate limited per email and per IP inside forgotPassword (AC4), on top of the
// gateway's publicRateLimiter. GET is the reset page's read-only check on load.
router.post('/forgot-password', forgotPassword);
router.get('/reset-password/:token', checkResetTokenHandler);
router.post('/reset-password/:token', resetPasswordHandler);
// T-343 — privacy re-acceptance. Both need a live session (authenticate, not AllowRevoked).
router.get('/me', authenticate, getMe);
// T-436 / T-507 — set the GST State and the profile fields. Live session required. The privacy
// check (Ajay, GST file Addendum 7 (2)) is in updateProfile, read from the user record, not
// requireCurrentPrivacy: auth gets no gateway pv header to read.
router.patch('/me', authenticate, updateMeHandler);
router.post('/me/privacy-acceptance', authenticate, acceptPrivacyHandler);
// T-507 — account settings. Live session required. /me/password: per-user failed-attempt limit
// (password-change-rate-limit.ts), and per IP as /login is:
// by the gateway's publicRateLimiter on the whole /api/auth proxy (auth has no limiter of its
// own). No route segment is named "internal" (the gateway blocks it).
router.post('/me/password', authenticate, changePasswordHandler);
router.get('/me/sessions', authenticate, listSessionsHandler);
router.delete('/me/sessions/:id', authenticate, deleteSessionHandler);
router.get('/me/privacy-history', authenticate, privacyHistoryHandler);
// T-115c — close the account and erase it. Live session required. Rate limited with /login:
// both are reached only through the gateway's /api/auth proxy and its publicRateLimiter
// (per IP); auth has no limiter of its own.
router.delete('/me', authenticate, closeAccountHandler);
// T-223 — email verification. The link's token goes in the body, never the path. Resend needs a
// live session (authenticate, like /me); the resend cap is enforced in requestVerifyEmail.
router.post('/verify-email', verifyEmailHandler);
router.post('/verify-email/resend', authenticate, resendVerifyEmailHandler);
// T-522 (Arjun 5) — public, signed-out resend from the "Check your email" screen. Shares the
// sign-up IP and email buckets (signup-rate-limit.ts); always the neutral 202, padded.
router.post('/verify-email/resend-by-email', resendVerifyByEmailHandler);

export default router;

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
  closeAccountHandler,
} from '../controllers/auth.controller';
import { authenticate, authenticateAllowRevoked } from '../middleware/authenticate';

const router = Router();

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
// T-436 — set the GST State for tax invoices. Live session required. The privacy check
// (Ajay, GST file Addendum 7 (2)) is in setGstStateCode, read from the user record, not
// requireCurrentPrivacy: auth gets no gateway pv header to read.
router.patch('/me', authenticate, updateMeHandler);
router.post('/me/privacy-acceptance', authenticate, acceptPrivacyHandler);
// T-115c — close the account and erase it. Live session required. Rate limited with /login:
// both are reached only through the gateway's /api/auth proxy and its publicRateLimiter
// (per IP); auth has no limiter of its own.
router.delete('/me', authenticate, closeAccountHandler);
// T-223 — email verification. The link's token goes in the body, never the path. Resend needs a
// live session (authenticate, like /me); the resend cap is enforced in requestVerifyEmail.
router.post('/verify-email', verifyEmailHandler);
router.post('/verify-email/resend', authenticate, resendVerifyEmailHandler);

export default router;

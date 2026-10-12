import { Router } from 'express';

import {
  register,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPasswordHandler,
  getMe,
  acceptPrivacyHandler,
} from '../controllers/auth.controller';
import { authenticate, authenticateAllowRevoked } from '../middleware/authenticate';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', authenticateAllowRevoked, logout);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPasswordHandler);
// T-343 — privacy re-acceptance. Both need a live session (authenticate, not AllowRevoked).
router.get('/me', authenticate, getMe);
router.post('/me/privacy-acceptance', authenticate, acceptPrivacyHandler);

export default router;

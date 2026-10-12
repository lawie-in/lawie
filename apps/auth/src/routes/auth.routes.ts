import { Router } from 'express';

import {
  register,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPasswordHandler,
} from '../controllers/auth.controller';
import { authenticateAllowRevoked } from '../middleware/authenticate';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', authenticateAllowRevoked, logout);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPasswordHandler);

export default router;

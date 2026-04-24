import { Router } from 'express';

import {
  register,
  login,
  refresh,
  forgotPassword,
  resetPasswordHandler,
} from '../controllers/auth.controller';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPasswordHandler);

export default router;

import { Request, Response, NextFunction } from 'express';

import {
  registerUser,
  loginUser,
  refreshTokens,
  initiatePasswordReset,
  resetPassword,
} from '../services/auth.service';
import { validateRegister, validateLogin } from '../validators/auth.validator';

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = validateRegister(req.body);
    const { user, tokens } = await registerUser(parsed);

    res.status(201).json({
      status: 'success',
      data: {
        user: { id: user._id, email: user.email, name: user.name, role: user.role },
        ...tokens,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = validateLogin(req.body);
    const { user, tokens } = await loginUser(parsed);

    res.status(200).json({
      status: 'success',
      data: {
        user: { id: user._id, email: user.email, name: user.name, role: user.role },
        ...tokens,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ status: 'error', message: 'refreshToken is required' });
      return;
    }

    const tokens = await refreshTokens(refreshToken);
    res.status(200).json({ status: 'success', data: tokens });
  } catch (err) {
    next(err);
  }
}

export async function forgotPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ status: 'error', message: 'email is required' });
      return;
    }

    await initiatePasswordReset(email);
    res.status(200).json({
      status: 'success',
      message: 'If an account exists with that email, a reset link has been sent.',
    });
  } catch (err) {
    next(err);
  }
}

export async function resetPasswordHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password || password.length < 8) {
      res.status(400).json({ status: 'error', message: 'Password must be at least 8 characters' });
      return;
    }

    await resetPassword(token, password);
    res.status(200).json({ status: 'success', message: 'Password has been reset successfully.' });
  } catch (err) {
    next(err);
  }
}

import { Request, Response, NextFunction } from 'express';

import {
  registerUser,
  loginUser,
  refreshTokens,
  logoutUser,
  initiatePasswordReset,
  resetPassword,
  getPrivacyStatus,
  acceptPrivacy,
} from '../services/auth.service';
import {
  VERIFY_RESEND_LIMITED,
  VERIFY_RESEND_LIMIT_MESSAGE,
  requestVerifyEmail,
  verifyEmailToken,
} from '../services/verify-email.service';
import { validateRegister, validateLogin } from '../validators/auth.validator';

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = validateRegister(req.body);
    const { user, tokens, referralApplied } = await registerUser(parsed, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({
      status: 'success',
      data: {
        user: { id: user._id, email: user.email, name: user.name, role: user.role },
        ...tokens,
        // T-234: only present when a referral code was sent and the outcome is known.
        ...(referralApplied !== undefined ? { referralApplied } : {}),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = validateLogin(req.body);
    const { user, tokens } = await loginUser(parsed, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

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

    const tokens = await refreshTokens(refreshToken, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
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

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(400).json({ status: 'error', message: 'No token provided' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const userId = req.jwtPayload!.sub;

    await logoutUser(userId, token);
    res.status(200).json({ status: 'success', message: 'Logged out successfully' });
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

/** T-223 — the code the web app maps to "this link has expired" plus resend. */
export const VERIFY_LINK_INVALID = 'verify_link_invalid';

/**
 * T-223 — POST /verify-email { token } (public: the token is the credential). The token travels
 * in the body only and is never logged; neither is the body. An expired, used or forged link
 * is one answer (400), so a caller learns nothing about which it was.
 */
export async function verifyEmailHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const token = (req.body as { token?: unknown } | undefined)?.token;
    const result = await verifyEmailToken(token);
    if (result.kind === 'verified') {
      res.status(200).json({ status: 'verified' });
      return;
    }
    if (result.kind === 'already_verified') {
      res.status(200).json({ status: 'already_verified' });
      return;
    }
    res.status(400).json({ error: VERIFY_LINK_INVALID });
  } catch (err) {
    next(err);
  }
}

/** T-223 — POST /verify-email/resend (signed in). The resend cap lives in requestVerifyEmail. */
export async function resendVerifyEmailHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const result = await requestVerifyEmail(req.jwtPayload!.sub);
    switch (result.kind) {
      case 'queued':
        res.status(202).json({ status: 'queued' });
        return;
      case 'limited':
        res.setHeader('Retry-After', String(result.retryAfterSeconds));
        res.status(429).json({
          error: VERIFY_RESEND_LIMITED,
          message: VERIFY_RESEND_LIMIT_MESSAGE,
          retryAfter: result.retryAfterSeconds,
        });
        return;
      case 'already_verified':
        res.status(409).json({ status: 'already_verified' });
        return;
      case 'not_found':
        res.status(404).json({ error: 'not_found' });
        return;
      case 'unavailable':
        res.status(503).json({ error: 'service_unavailable' });
        return;
    }
  } catch (err) {
    next(err);
  }
}

/**
 * T-343 — GET /me: the caller's privacy acceptance state, read from the user record.
 * T-223 — plus emailVerified and hasGoogle (the web's verify prompt reads them).
 */
export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const status = await getPrivacyStatus(req.jwtPayload!.sub);
    res.status(200).json({ status: 'success', data: status });
  } catch (err) {
    next(err);
  }
}

/**
 * T-343 — POST /me/privacy-acceptance. The body is ignored: version, time and via are server
 * values. Responds with a new token pair carrying the new `pv` (old session deleted).
 */
export async function acceptPrivacyHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.setHeader('Cache-Control', 'no-store');
    // authenticate already verified the Bearer header and the live session.
    const token = req.headers.authorization!.split(' ')[1];
    const tokens = await acceptPrivacy(req.jwtPayload!.sub, token, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.status(200).json({ status: 'success', data: tokens });
  } catch (err) {
    next(err);
  }
}

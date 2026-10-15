import { Request, Response, NextFunction } from 'express';

import { closeAccount } from '../services/account-erase.service';
import {
  registerUser,
  loginUser,
  refreshTokens,
  logoutUser,
  initiatePasswordReset,
  resetPassword,
  getPrivacyStatus,
  acceptPrivacy,
  setGstStateCode,
  SET_GST_STATE_PRIVACY_BODY,
} from '../services/auth.service';
import {
  VERIFY_RESEND_LIMITED,
  VERIFY_RESEND_LIMIT_MESSAGE,
  requestVerifyEmail,
  verifyEmailToken,
} from '../services/verify-email.service';
import { validateRegister, validateLogin, validateUpdateMe } from '../validators/auth.validator';

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
 * T-436 — PATCH /me { gstStateCode }: the GST State/UT for the user's tax invoices.
 *   200 { status: 'success', data: { gstStateCode } }  saved
 *   422 any other field, a missing field, or a code not in GST_STATES (validateUpdateMe)
 *   403 { error: 'privacy_reaccept_required' }  the current privacy version is not accepted
 *       (Ajay, GST file Addendum 7 (2)); nothing stored. The T-343 shape, so the web's
 *       privacyFetch shows the re-accept prompt.
 *   401 user not found, inactive or being closed (as GET /me)
 * The body is never logged.
 */
export async function updateMeHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const { gstStateCode } = validateUpdateMe(req.body);
    const outcome = await setGstStateCode(req.jwtPayload!.sub, gstStateCode);
    switch (outcome.kind) {
      case 'saved':
        res.status(200).json({ status: 'success', data: { gstStateCode: outcome.gstStateCode } });
        return;
      case 'privacy_reaccept_required':
        res.status(403).json(SET_GST_STATE_PRIVACY_BODY);
        return;
      case 'not_found':
        res.status(401).json({ status: 'error', message: 'User not found or inactive' });
        return;
    }
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

/**
 * T-115c — DELETE /me { password } or { email }: close the account and erase it.
 * authenticate has already required a live session. Answers (Arjun rulings 3-5):
 *   200 { status: 'done' }     every part of the erase finished (Ajay condition 1)
 *   202 { status: 'pending' }  locked and signed out; the sweep finishes the erase
 *   403 { error: 'wrong_password' }   wrong or missing password, or the typed email differs
 *   403 { error: 'reauth_required' } Google-only account, sign-in older than 15 minutes
 *   403 { error: 'not_closable' }     an Admin account (the runbook, not this route)
 *   409 { error: 'subscription_active' }  cancel the plan first
 *   503 { error: 'billing_unavailable' }  the plan could not be checked; nothing changed
 *   401 user not found or inactive (as GET /me)
 * The body is never logged.
 */
export async function closeAccountHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.setHeader('Cache-Control', 'no-store');
    // authenticate already verified the Bearer header and the live session.
    const token = req.headers.authorization!.split(' ')[1];
    const body = (req.body ?? {}) as { password?: unknown; email?: unknown };
    const outcome = await closeAccount(req.jwtPayload!.sub, token, body);
    switch (outcome.kind) {
      case 'done':
        res.status(200).json({ status: 'done' });
        return;
      case 'pending':
        res.status(202).json({ status: 'pending' });
        return;
      case 'wrong_password':
      case 'reauth_required':
      case 'not_closable':
        res.status(403).json({ error: outcome.kind });
        return;
      case 'subscription_active':
        res.status(409).json({ error: 'subscription_active' });
        return;
      case 'billing_unavailable':
        res.status(503).json({ error: 'billing_unavailable' });
        return;
      case 'not_found':
        res.status(401).json({ status: 'error', message: 'User not found or inactive' });
        return;
    }
  } catch (err) {
    next(err);
  }
}

import { Request, Response, NextFunction } from 'express';

import { AppError } from '../middleware/errorHandler';
import { closeAccount } from '../services/account-erase.service';
import {
  registerUser,
  loginUser,
  refreshTokens,
  logoutUser,
  getPrivacyStatus,
  acceptPrivacy,
  changePassword,
  getPrivacyHistory,
  updateProfile,
  UPDATE_ME_PRIVACY_BODY,
} from '../services/auth.service';
import {
  completePasswordReset,
  isResetTokenLive,
  requestPasswordReset,
} from '../services/password-reset.service';
import { deleteUserSessionById, hashToken, listActiveSessions } from '../services/session.service';
import {
  VERIFY_RESEND_LIMITED,
  VERIFY_RESEND_LIMIT_MESSAGE,
  requestVerifyEmail,
  verifyEmailToken,
} from '../services/verify-email.service';
import {
  validateRegister,
  validateLogin,
  validateUpdateMe,
  parseForgotPasswordEmail,
  checkResetPassword,
  checkChangePassword,
  DEFAULT_COURT_NOT_IN_COURTS,
} from '../validators/auth.validator';

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

// ── T-221: forgot / reset password ──────────────────────────────────────────

/** The fixed 200 body: identical for every address, known or not (AC1). */
export const FORGOT_PASSWORD_ACCEPTED_BODY = {
  status: 'success',
  message: 'If an account exists with that email, we have sent it an email.',
} as const;
export const PASSWORD_RESET_RATE_LIMITED = 'rate_limited';
export const PASSWORD_RESET_INVALID_TOKEN = 'invalid_or_expired_token';
export const PASSWORD_RESET_WEAK = 'weak_password';

/**
 * The caller's IP for the per-IP limit. Auth sits behind the gateway, which forwards the
 * X-Forwarded-For header nginx set (the gateway trusts exactly one proxy hop): its LAST entry
 * is the address nginx saw. Without that header (a direct call, tests) the socket address.
 * Auth's own `trust proxy` is not changed, so req.ip elsewhere is unaffected.
 */
export function clientIpForRateLimit(req: Request): string | undefined {
  const xff = req.headers['x-forwarded-for'];
  const raw = Array.isArray(xff) ? xff.join(',') : xff;
  if (typeof raw === 'string') {
    const parts = raw
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last.slice(0, 64);
  }
  return req.ip ?? req.socket?.remoteAddress ?? undefined;
}

/**
 * T-221 — POST /forgot-password { email } (public).
 *   200 FORGOT_PASSWORD_ACCEPTED_BODY  always the same, whether or not an email was queued
 *   400 { error: 'invalid_email' }     missing or badly formed address (format only)
 *   429 { error: 'rate_limited', retryAfter } + Retry-After  over the email or IP cap (AC4)
 *   503 { error: 'service_unavailable' }  the rate-limit store failed; nothing looked up
 * The body is never logged.
 */
export async function forgotPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const email = parseForgotPasswordEmail(req.body);
    if (!email) {
      res.status(400).json({ error: 'invalid_email' });
      return;
    }
    const result = await requestPasswordReset(email, clientIpForRateLimit(req));
    switch (result.kind) {
      case 'accepted':
        res.status(200).json(FORGOT_PASSWORD_ACCEPTED_BODY);
        return;
      case 'limited':
        res.setHeader('Retry-After', String(result.retryAfterSeconds));
        res.status(429).json({
          error: PASSWORD_RESET_RATE_LIMITED,
          retryAfter: result.retryAfterSeconds,
        });
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
 * T-221 — GET /reset-password/:token (public, read-only): { valid } for the page's check on
 * load. No side effects; the token is never logged (errorHandler masks it in the path).
 */
export async function checkResetTokenHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const valid = await isResetTokenLive(req.params.token);
    res.status(200).json({ valid });
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

/**
 * T-221 — POST /reset-password/:token { password } (public: the token is the credential).
 *   200 { status: 'success' }  password set (sign-up rules), token used, every session deleted
 *   422 { error: 'weak_password', unmet: PasswordRule[], message }  fails a sign-up rule
 *   400 { error: 'invalid_or_expired_token' }  malformed, unknown, expired or used token, or an
 *       inactive account: one answer for all
 * The password is checked first, so a weak password never uses up the token. The body and the
 * token are never logged.
 */
export async function resetPasswordHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const check = checkResetPassword(req.body);
    if (!check.ok) {
      res.status(422).json({
        status: 'error',
        statusCode: 422,
        error: PASSWORD_RESET_WEAK,
        message: check.message,
        unmet: check.unmet,
      });
      return;
    }
    const result = await completePasswordReset(req.params.token, check.password);
    if (result.kind === 'invalid') {
      res.status(400).json({ error: PASSWORD_RESET_INVALID_TOKEN });
      return;
    }
    res.status(200).json({ status: 'success' });
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
 * T-436 / T-507 — PATCH /me: any of gstStateCode, name, phone, enrollmentNumber, barCouncil,
 * barCouncilState, practiceAreas, yearsOfExperience, courtsPractisedIn, defaultCourt (rules in
 * validateUpdateMe; null clears an optional field).
 *   200 { status: 'success', data: { <exactly the keys sent, as stored> } }  saved; so a body of
 *       only { gstStateCode } still answers { data: { gstStateCode } }
 *   422 an unknown or read-only field (email included), an empty body, a bad value, or a
 *       defaultCourt that is not one of courtsPractisedIn (sent or stored); nothing stored
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
    const input = validateUpdateMe(req.body);
    const outcome = await updateProfile(req.jwtPayload!.sub, input);
    switch (outcome.kind) {
      case 'saved':
        res.status(200).json({ status: 'success', data: outcome.data });
        return;
      case 'privacy_reaccept_required':
        res.status(403).json(UPDATE_ME_PRIVACY_BODY);
        return;
      case 'default_court_not_in_courts':
        throw new AppError(422, DEFAULT_COURT_NOT_IN_COURTS);
      case 'not_found':
        res.status(401).json({ status: 'error', message: 'User not found or inactive' });
        return;
    }
  } catch (err) {
    next(err);
  }
}

/** T-507 — the caller's access token (authenticate already verified the Bearer header). */
function bearerToken(req: Request): string {
  return req.headers.authorization!.split(' ')[1];
}

/**
 * T-507 — POST /me/password { currentPassword, newPassword } (signed in).
 *   200 { status: 'success', data: { revokedSessions } }  changed; every OTHER session signed
 *       out, the caller's kept
 *   422 { status, statusCode: 422, error: 'weak_password', message, unmet }  newPassword fails a
 *       sign-up rule (the T-221 reset shape)
 *   422 (AppError shape) currentPassword missing
 *   403 { error: 'wrong_password' }  currentPassword does not match
 *   409 { error: 'no_password' }  the account has no password (Google-only)
 *   429 { error: 'rate_limited', retryAfter } + Retry-After  5 wrong current passwords in 15 min
 *       for this user (password-change-rate-limit.ts; the T-221 reset body)
 *   503 { error: 'service_unavailable' }  the limiter store failed; nothing looked up or changed
 *   401 user not found, inactive or being closed (as GET /me)
 * Rate limits: per user (above), and per IP as /login is, by the gateway's publicRateLimiter on
 * the whole /api/auth proxy. The body is never logged.
 */
export async function changePasswordHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const check = checkChangePassword(req.body);
    if (!check.ok) {
      if (check.kind === 'invalid') throw new AppError(422, check.message);
      res.status(422).json({
        status: 'error',
        statusCode: 422,
        error: PASSWORD_RESET_WEAK,
        message: check.message,
        unmet: check.unmet,
      });
      return;
    }
    const outcome = await changePassword(
      req.jwtPayload!.sub,
      bearerToken(req),
      check.currentPassword,
      check.newPassword,
    );
    switch (outcome.kind) {
      case 'changed':
        res
          .status(200)
          .json({ status: 'success', data: { revokedSessions: outcome.revokedSessions } });
        return;
      case 'wrong_password':
        res.status(403).json({ error: 'wrong_password' });
        return;
      case 'no_password':
        res.status(409).json({ error: 'no_password' });
        return;
      case 'limited':
        res.setHeader('Retry-After', String(outcome.retryAfterSeconds));
        res.status(429).json({
          error: PASSWORD_RESET_RATE_LIMITED,
          retryAfter: outcome.retryAfterSeconds,
        });
        return;
      case 'unavailable':
        res.status(503).json({ error: 'service_unavailable' });
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
 * T-507 — GET /me/sessions (signed in).
 *   200 { status: 'success', data: { sessions: [{ id, userAgent, createdAt, current }] } }
 *       newest first; only live sessions (see listActiveSessions). No IP, no hashes.
 */
export async function listSessionsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const sessions = await listActiveSessions(req.jwtPayload!.sub, hashToken(bearerToken(req)));
    res.status(200).json({ status: 'success', data: { sessions } });
  } catch (err) {
    next(err);
  }
}

/**
 * T-507 — DELETE /me/sessions/:id (signed in): sign that session out.
 *   200 { status: 'success' }  signed out (the caller's own session too, if that is the id)
 *   404 { error: 'not_found' }  not a session of this user (or not an id at all)
 */
export async function deleteSessionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const deleted = await deleteUserSessionById(req.jwtPayload!.sub, req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.status(200).json({ status: 'success' });
  } catch (err) {
    next(err);
  }
}

/**
 * T-507 — GET /me/privacy-history (signed in).
 *   200 { status: 'success', data: { privacyHistory: [{ version, acceptedAt, via }] } }  newest
 *       first; [] when none recorded
 *   401 user not found, inactive or being closed (as GET /me)
 */
export async function privacyHistoryHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const privacyHistory = await getPrivacyHistory(req.jwtPayload!.sub);
    if (privacyHistory === null) {
      res.status(401).json({ status: 'error', message: 'User not found or inactive' });
      return;
    }
    res.status(200).json({ status: 'success', data: { privacyHistory } });
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

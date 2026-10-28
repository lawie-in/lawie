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
  recordSignupConsent,
  changePassword,
  getPrivacyHistory,
  updateProfile,
  UPDATE_ME_PRIVACY_BODY,
  resendVerifyByEmail,
  signInFromVerifyLink,
  type RegisterOutcome,
} from '../services/auth.service';
import { padToFloor } from '../services/latency-pad';
import {
  completePasswordReset,
  isResetTokenLive,
  requestPasswordReset,
} from '../services/password-reset.service';
import {
  RefreshLimiterUnavailableError,
  RefreshRateLimitedError,
  refreshRateLimitMessage,
} from '../services/refresh-rate-limit';
import { deleteUserSessionById, hashToken, listActiveSessions } from '../services/session.service';
import {
  TEST_ACCOUNTS_CAP_ERROR,
  TEST_SIGNUP_BAD_NAME_ERROR,
  tryTestSignupBypass,
} from '../services/test-signup-bypass.service';
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

/**
 * T-522 (Arjun 4, open point (a) confirmed 22 Oct 2026) — the one answer to an accepted sign-up,
 * identical for a new and an existing address (and for the signed-out resend), in auth's
 * standard wrapper: no user id, no email, no tokens, no referral flag. The web reads data.status.
 */
export const SIGNUP_ACCEPTED_BODY = { status: 'success', data: { status: 'check_email' } } as const;
export const SIGNUP_RATE_LIMITED = 'rate_limited';

/** T-522 — the shared tail of the two neutral routes: 202 padded, 429 or 503. */
async function sendNeutralOutcome(
  res: Response,
  outcome: RegisterOutcome,
  startedAt: number,
  route: string,
): Promise<void> {
  switch (outcome.kind) {
    case 'accepted':
      await padToFloor(startedAt, route);
      res.status(202).json(SIGNUP_ACCEPTED_BODY);
      return;
    case 'limited':
      res.setHeader('Retry-After', String(outcome.retryAfterSeconds));
      res.status(429).json({ error: SIGNUP_RATE_LIMITED, retryAfter: outcome.retryAfterSeconds });
      return;
    case 'unavailable':
      res.status(503).json({ error: 'service_unavailable' });
      return;
  }
}

/**
 * T-522 — POST /register (public), neutral (Arjun rulings 1, 3, 4):
 *   422  validation (checked first, before any lookup or count)
 *   202  SIGNUP_ACCEPTED_BODY, Cache-Control: no-store, padded to SIGNUP_RESPONSE_FLOOR_MS from
 *        the start of the request; the same for a new and an existing address; no session
 *   429  { error: 'rate_limited', retryAfter } + Retry-After  over the IP or email bucket
 *   503  { error: 'service_unavailable' }  the rate-limit store failed; nothing looked up
 * The body is never logged.
 *
 * T-563 (Arjun) — the develop-only test sign-up bypass runs here, after validation and before
 * the neutral path. When it does not apply (off, no `bypass-test: true`, wrong or missing
 * secret, non-reserved email) the request falls through unchanged. When it applies:
 *   201  login's success body (user + tokens) and a session
 *   400  { error: 'invalid_test_name' }  right secret, name not starting with TEST
 *   409  { error: 'test_accounts_cap' }   the live test-account cap is reached
 *   429 / 503  as the neutral path
 */
export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  const startedAt = Date.now();
  try {
    res.setHeader('Cache-Control', 'no-store');
    const parsed = validateRegister(req.body);
    const ip = clientIpForRateLimit(req);
    const test = await tryTestSignupBypass(parsed, {
      headers: req.headers,
      ip,
      meta: { ip: req.ip, userAgent: req.headers['user-agent'] },
    });
    switch (test.kind) {
      case 'created': {
        const { user, tokens } = test;
        res.status(201).json({
          status: 'success',
          data: {
            user: { id: user._id, email: user.email, name: user.name, role: user.role },
            ...tokens,
          },
        });
        return;
      }
      case 'bad_name':
        res.status(400).json({ error: TEST_SIGNUP_BAD_NAME_ERROR });
        return;
      case 'cap':
        res.status(409).json({ error: TEST_ACCOUNTS_CAP_ERROR });
        return;
      case 'limited':
      case 'unavailable':
        await sendNeutralOutcome(res, test, startedAt, 'register');
        return;
      case 'not_applied':
        break;
    }
    const outcome = await registerUser(parsed, ip);
    await sendNeutralOutcome(res, outcome, startedAt, 'register');
  } catch (err) {
    next(err);
  }
}

/**
 * T-522 (Arjun 5) — POST /verify-email/resend-by-email { email } (public). Shares the sign-up
 * IP and email buckets (429 / 503 as /register); otherwise always the same padded 202 as
 * /register, whether or not anything was sent. 400 { error: 'invalid_email' } for a missing or
 * badly formed address (format only). The body is never logged.
 */
export async function resendVerifyByEmailHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const startedAt = Date.now();
  try {
    res.setHeader('Cache-Control', 'no-store');
    const email = parseForgotPasswordEmail(req.body);
    if (!email) {
      res.status(400).json({ error: 'invalid_email' });
      return;
    }
    const outcome = await resendVerifyByEmail(email, clientIpForRateLimit(req));
    await sendNeutralOutcome(res, outcome, startedAt, 'verify-email/resend-by-email');
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

/**
 * POST /refresh. Answers:
 *   200 { status, data: { accessToken, refreshToken } }  rotated; or (T-616b) the same refresh
 *       token presented again within 30 s of its rotation: the SAME new refresh token and a
 *       fresh access token
 *   400 refreshToken missing
 *   401 bad/expired JWT, no live session, spent past the grace window, past the 7-day ceiling
 *   429 { status, error: 'rate_limited', message, retryAfter } + Retry-After  T-616b: over
 *       60 calls per 15 min for this user (refresh-rate-limit.ts; message as the gateway's)
 *   503 { error: 'service_unavailable' }  the limiter store failed; nothing consumed or issued
 * The web client never signs out on 429/5xx and honours Retry-After (capped at 5 minutes).
 */
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
    if (err instanceof RefreshRateLimitedError) {
      res.setHeader('Retry-After', String(err.retryAfterSeconds));
      res.status(429).json({
        status: 'error',
        error: REFRESH_RATE_LIMITED,
        message: refreshRateLimitMessage(err.retryAfterSeconds),
        retryAfter: err.retryAfterSeconds,
      });
      return;
    }
    if (err instanceof RefreshLimiterUnavailableError) {
      res.status(503).json({ error: 'service_unavailable' });
      return;
    }
    next(err);
  }
}

export const REFRESH_RATE_LIMITED = 'rate_limited';

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
 *
 * T-522 (Arjun 1): only this POST uses a token up. A 'signin' link (sign-up and resend) also
 * signs the user in exactly as /login does: 200 { status, user, accessToken, refreshToken }. A
 * 'verify' link (the T-358 notice, or one minted before T-522) returns { status } only. An
 * expired or used link is 400 verify_link_invalid and creates no session.
 */
export async function verifyEmailHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const token = (req.body as { token?: unknown } | undefined)?.token;
    res.setHeader('Referrer-Policy', 'no-referrer');
    const result = await verifyEmailToken(token);
    if (result.kind === 'expired_or_invalid') {
      res.status(400).json({ error: VERIFY_LINK_INVALID });
      return;
    }
    if (result.linkKind !== 'signin') {
      res.status(200).json({ status: result.kind });
      return;
    }
    const signedIn = await signInFromVerifyLink(result.userId, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!signedIn) {
      // The account was deactivated or removed between the verify and the sign-in: no session.
      res.status(400).json({ error: VERIFY_LINK_INVALID });
      return;
    }
    const { user, tokens } = signedIn;
    res.status(200).json({
      status: result.kind,
      user: { id: user._id, email: user.email, name: user.name, role: user.role },
      ...tokens,
    });
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
 * T-642 — POST /me/signup-consent (live session). The body is ignored: versions and time are
 * server values. Idempotent: a repeat answers 200 and keeps the first record.
 *   200 { status: 'success', data: { needsSignupConsent: false } }
 *   401 session gone, or user not found or inactive (as GET /me); nothing written
 */
export async function signupConsentHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    res.setHeader('Cache-Control', 'no-store');
    // authenticate already verified the Bearer header and the live session.
    const token = req.headers.authorization!.split(' ')[1];
    await recordSignupConsent(req.jwtPayload!.sub, token);
    res.status(200).json({ status: 'success', data: { needsSignupConsent: false } });
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

import crypto from 'crypto';

import { enqueueEmail } from '@lawie/email-client';
import {
  RegisterPayload,
  LoginPayload,
  refreshSessionKey,
  sessionKey,
  getPrivacyVersionSummary,
  PRIVACY_REACCEPT_REQUIRED,
  isVerified,
} from '@lawie/shared';
import bcrypt from 'bcryptjs';
import type Redis from 'ioredis';

import logger from '../config/logger';
import redisClient from '../config/redis';
import { AppError } from '../middleware/errorHandler';
import {
  User,
  IUser,
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  privacySignupAcceptance,
  PrivacyAcceptedVia,
  SIGNUP_CONSENT_TEXT_VERSION,
} from '../models/User.model';
import { buildSignupSource, UpdateMeInput, UtmTags } from '../validators/auth.validator';

import { tryGrantDailyLoginBonus } from './credit-bonus.service';
import { generateTokenPair, verifyRefreshToken } from './jwt.service';
import {
  releasePasswordChangeAttempt,
  reservePasswordChangeAttempt,
  resetPasswordChangeFailures,
} from './password-change-rate-limit';
import { applyReferralCode } from './referral.service';
import {
  RefreshLimiterUnavailableError,
  RefreshRateLimitedError,
  reserveRefreshAttempt,
} from './refresh-rate-limit';
import {
  createSession,
  deleteOtherUserSessions,
  deleteSession,
  hashToken,
  rotateRefreshSession,
  SessionMeta,
} from './session.service';
import { claimSignupAttemptMail, consumeSignupQuota } from './signup-rate-limit';
import { requestVerifyEmail } from './verify-email.service';

// T-299 (Arjun ruling 2): login must not reveal whether an account exists, by status or by
// time. One 401 text for unknown email, wrong password and no password on the record; each of
// those paths runs exactly one bcrypt compare at the same cost as real passwords (12, see the
// pre-save hook in User.model.ts). The dummy hash is computed once, at module load, from random
// bytes, so no password can ever match it.
const INVALID_LOGIN_MESSAGE = 'Invalid email or password';
const DEACTIVATED_MESSAGE = 'Your account has been deactivated. Contact support.';
const INVALID_REFRESH_MESSAGE = 'Invalid or expired refresh token';
export const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 12);

/**
 * T-522 (Arjun rulings 3 and 4, 22 Oct 2026) — the neutral sign-up outcome. 'accepted' is the
 * same for a new and an existing address; the controller answers it with one fixed 202 body.
 */
export type RegisterOutcome =
  | { kind: 'accepted' }
  /** Over the IP or email bucket (counted before any lookup). 429 + Retry-After. */
  | { kind: 'limited'; retryAfterSeconds: number }
  /** The rate-limit store failed: nothing was looked up. 503. */
  | { kind: 'unavailable' };

export interface RegisterDeps {
  redis: Redis;
  enqueue: typeof enqueueEmail;
}

const defaultRegisterDeps = (): RegisterDeps => ({ redis: redisClient, enqueue: enqueueEmail });

/** Error class name only (never the message, which can echo values), for logs. */
function errorKind(err: unknown): string {
  const kind = err instanceof Error ? err.constructor?.name : undefined;
  return typeof kind === 'string' && kind ? kind : 'Error';
}

/** T-522 (Arjun 4): a duplicate-key error on the email index is the existing-address outcome. */
export function isDuplicateEmailError(err: unknown): boolean {
  const e = err as { code?: unknown; keyPattern?: unknown; keyValue?: unknown } | null;
  if (!e || e.code !== 11000) return false;
  const pattern = e.keyPattern as Record<string, unknown> | undefined;
  const value = e.keyValue as Record<string, unknown> | undefined;
  return Boolean(
    (pattern && Object.prototype.hasOwnProperty.call(pattern, 'email')) ||
    (value && Object.prototype.hasOwnProperty.call(value, 'email')),
  );
}

/**
 * T-522 — the existing-address path (AJ-522-M5): at most one "Someone tried to create a Lawie
 * account" mail per address per hour (SET NX key), userId only in the job (T-223 condition 1).
 * Silent when the key is already set or the store fails. Never throws; logs the userId only.
 */
async function sendSignupAttemptMail(
  email: string,
  userId: string,
  deps: RegisterDeps,
): Promise<void> {
  const claimed = await claimSignupAttemptMail(deps.redis, email);
  if (!claimed) {
    logger.info({ userId }, 'Sign-up attempt mail not sent: one already sent this hour');
    return;
  }
  void Promise.resolve()
    .then(() => deps.enqueue({ template: 'auth.signupAttempt', userId }))
    .catch((err: unknown) => {
      logger.error({ userId, errKind: errorKind(err) }, 'Sign-up attempt mail enqueue failed');
    });
}

/**
 * T-522 — neutral sign-up. The payload must already be validated (422 first, in the controller,
 * before any lookup). Then, in this order:
 *  1. The IP and email-hash buckets are counted (before the lookup), 429 / 503 as T-221.
 *  2. New address: the account is created unverified; the verify mail is queued (the worker
 *     mints a 30-minute 'signin' link at send time); no tokens, no session. A referral code is
 *     recorded with no Ink (granted on verification).
 *  3. Existing address (or E11000 on email, a concurrent create): nothing is created; the same
 *     bcrypt cost-12 hash is run on the submitted password, and the M5 mail is sent at most once
 *     an hour.
 * Both paths answer 'accepted'. The controller pads the response to the floor.
 */
export async function registerUser(
  payload: RegisterPayload & { referralCode?: string } & UtmTags,
  ip: string | undefined,
  overrides: Partial<RegisterDeps> = {},
): Promise<RegisterOutcome> {
  const deps = { ...defaultRegisterDeps(), ...overrides };
  const email = payload.email.toLowerCase();

  let quota;
  try {
    quota = await consumeSignupQuota(deps.redis, email, ip);
  } catch (err) {
    logger.warn({ errKind: errorKind(err) }, 'Sign-up refused: rate-limit store unavailable');
    return { kind: 'unavailable' };
  }
  if (!quota.allowed) {
    logger.info({ retryAfterSeconds: quota.retryAfterSeconds }, 'Sign-up refused: rate limit');
    return { kind: 'limited', retryAfterSeconds: quota.retryAfterSeconds };
  }

  const existing = await User.findOne({ email }, { _id: 1 }).lean();
  if (existing) {
    // Same operation as the new path's pre-save hash (bcrypt, cost 12), not a compare.
    await bcrypt.hash(payload.password, 12);
    await sendSignupAttemptMail(email, existing._id.toString(), deps);
    return { kind: 'accepted' };
  }

  const acceptedAt = new Date();
  let user: IUser;
  try {
    user = await User.create({
      email: payload.email,
      password: payload.password,
      name: payload.name,
      // Always 'Lawyer', the same as Google sign-up (T-298, Arjun 12 Oct 2026).
      // Never read a role from the request (T-196): Admin is the only gate on admin
      // routes and bypasses enforceFreeLimit. The schema default stays 'Client' on purpose.
      role: 'Lawyer',
      // T-234 — the sign-up form shows the Terms line under the submit button.
      // Server time and server version only; nothing here comes from the request.
      termsAcceptedAt: acceptedAt,
      termsVersion: CURRENT_TERMS_VERSION,
      acceptedVia: 'password',
      // T-343 (Ajay §4) — privacyVersion, privacyAcceptedAt, via 'signup' and the first history
      // row. Sign-up never shows the re-acceptance prompt.
      ...privacySignupAcceptance(acceptedAt),
      // T-242 — campaign tags, only on account creation, with the server time. Sanitized again
      // here so a caller that skips the validator can't store a raw value. Never logged.
      signupSource: buildSignupSource({
        utmSource: payload.utmSource,
        utmMedium: payload.utmMedium,
        utmCampaign: payload.utmCampaign,
      }),
    });
  } catch (err) {
    // T-522 (Arjun 4): a concurrent sign-up for the same address won the create. That is the
    // existing-address outcome, not an error: no Sentry. Any other E11000 still throws.
    if (!isDuplicateEmailError(err)) throw err;
    const raced = await User.findOne({ email }, { _id: 1 }).lean();
    if (raced) await sendSignupAttemptMail(email, raced._id.toString(), deps);
    return { kind: 'accepted' };
  }

  const newUserId = user._id.toString();
  // No sign-up bonus here (T-351: none until verified); verifyEmailToken grants it.

  // T-223 AC1 / T-522 — queue the verify mail (userId only; the resend cap applies; the worker
  // mints a 'signin' link). Fire-and-forget: it never fails or slows registration.
  void requestVerifyEmail(newUserId)
    .then((outcome) => {
      logger.info(
        { userId: newUserId, outcome: outcome.kind },
        'Verify email requested at sign-up',
      );
    })
    .catch(() => {
      logger.warn({ userId: newUserId }, 'Verify email request failed at sign-up');
    });

  // T-522 (Arjun 2): record the referral code with no Ink (deferInk); the Ink follows
  // verification. The outcome goes to GET /me as referralStatus, never into this response.
  // Not awaited, so the response does not wait on it; it never fails registration.
  if (payload.referralCode) {
    const code = payload.referralCode;
    void applyReferralCode(newUserId, code, { deferInk: true }).catch((err: unknown) => {
      logger.warn(
        { userId: newUserId, errKind: errorKind(err) },
        'Referral code apply failed at registration',
      );
    });
  }

  return { kind: 'accepted' };
}

/**
 * T-522 — what loginUser does once the password is proved, shared so that a 'signin' verify
 * link signs in exactly the same way: token pair, session with authAt, then the daily bonus.
 * T-563: exported so the test sign-up bypass signs in the same way (the daily bonus itself
 * skips test accounts).
 */
export async function startSignedInSession(
  user: IUser,
  meta: SessionMeta,
): Promise<{ accessToken: string; refreshToken: string }> {
  const tokens = generateTokenPair({
    sub: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
    plan: user.plan,
    pv: user.privacyVersion,
  });

  await createSession(
    user._id.toString(),
    tokens.accessToken,
    tokens.refreshToken,
    { plan: user.plan, email: user.email, role: user.role, name: user.name },
    // T-115c — the credential (password, or the single-use emailed link) was just proved.
    { ...meta, authAt: new Date().toISOString() },
  );

  // SCRUM-73 — daily login bonus, non-blocking on the login hot path.
  void tryGrantDailyLoginBonus(user._id.toString());

  return tokens;
}

/**
 * T-522 (Arjun 1, open point (c) confirmed 22 Oct 2026) — signs in the user whose 'signin' link
 * POST /verify-email just used, whether it verified the account now or the account was already
 * verified. Null, and no session, for an account that is gone, deactivated, being closed
 * (erasure: locked, T-115c) or Google-only (no password, e.g. linked to Google since the link
 * was sent): the caller answers 400 verify_link_invalid.
 */
export async function signInFromVerifyLink(
  userId: string,
  meta: SessionMeta = {},
): Promise<{ user: IUser; tokens: { accessToken: string; refreshToken: string } } | null> {
  const user = await User.findById(userId).select('+password');
  if (!user || !user.isActive || user.erasure) return null;
  if (typeof user.password !== 'string' || user.password.length === 0) return null;
  const tokens = await startSignedInSession(user, meta);
  return { user, tokens };
}

/**
 * T-522 (Arjun 5) — public POST /verify-email/resend-by-email. Shares the sign-up IP and email
 * buckets (429 / 503, counted before the lookup). Otherwise always 'accepted': an unknown,
 * verified, Google or password-less address gets nothing; an unverified password account gets
 * a 'signin' link, under the per-user cap (1 per 2 min, 5 per day), and when that cap is hit
 * nothing is sent and the answer is the same.
 */
export async function resendVerifyByEmail(
  email: string,
  ip: string | undefined,
  overrides: Partial<RegisterDeps> = {},
): Promise<RegisterOutcome> {
  const deps = { ...defaultRegisterDeps(), ...overrides };
  let quota;
  try {
    quota = await consumeSignupQuota(deps.redis, email, ip);
  } catch (err) {
    logger.warn({ errKind: errorKind(err) }, 'Signed-out resend refused: store unavailable');
    return { kind: 'unavailable' };
  }
  if (!quota.allowed) {
    logger.info(
      { retryAfterSeconds: quota.retryAfterSeconds },
      'Signed-out resend refused: rate limit',
    );
    return { kind: 'limited', retryAfterSeconds: quota.retryAfterSeconds };
  }

  const user = await User.findOne({ email: email.toLowerCase() })
    .select('emailVerified authProvider isActive erasure +googleId +password')
    .lean();
  if (!user || user.isActive === false || user.erasure) return { kind: 'accepted' };
  if (isVerified(user)) return { kind: 'accepted' };
  if (typeof user.password !== 'string' || user.password.length === 0) return { kind: 'accepted' };

  const userId = user._id.toString();
  try {
    const outcome = await requestVerifyEmail(userId, deps.redis);
    logger.info({ userId, outcome: outcome.kind }, 'Signed-out verify resend');
  } catch (err) {
    logger.warn({ userId, errKind: errorKind(err) }, 'Signed-out verify resend failed');
  }
  return { kind: 'accepted' };
}

export async function loginUser(
  payload: LoginPayload,
  meta: SessionMeta = {},
): Promise<{ user: IUser; tokens: { accessToken: string; refreshToken: string } }> {
  const user = await User.findOne({ email: payload.email.toLowerCase() }).select('+password');

  // (a) Unknown email, and (b) a record with no password (Google-only or erased): compare
  // against the dummy hash so the response takes as long as a real wrong password, then the
  // same 401. comparePassword is never called without a password (it would throw: 500).
  if (!user || !user.password) {
    await bcrypt.compare(payload.password, DUMMY_PASSWORD_HASH);
    throw new AppError(401, INVALID_LOGIN_MESSAGE);
  }

  // (b) Known email, wrong password: same 401, same text. isActive is not looked at yet.
  const isMatch = await user.comparePassword(payload.password);
  if (!isMatch) {
    throw new AppError(401, INVALID_LOGIN_MESSAGE);
  }

  // (c) Only a caller who has proved the password learns the account is deactivated.
  if (!user.isActive) {
    throw new AppError(403, DEACTIVATED_MESSAGE);
  }

  // T-522: token pair, session with authAt (the password was just proved), daily bonus.
  const tokens = await startSignedInSession(user, meta);

  return { user, tokens };
}

export async function refreshTokens(
  refreshToken: string,
  meta: SessionMeta = {},
): Promise<{ accessToken: string; refreshToken: string }> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError(401, INVALID_REFRESH_MESSAGE);
  }

  // T-616b (Arjun) — per-user limit, keyed by the uid of the VERIFIED token, before anything is
  // consumed (a refused call leaves the token usable). A grace replay counts too. Redis failing
  // fails closed: 503, nothing consumed or issued.
  let reservation: Awaited<ReturnType<typeof reserveRefreshAttempt>>;
  try {
    reservation = await reserveRefreshAttempt(redisClient, payload.sub);
  } catch {
    throw new RefreshLimiterUnavailableError();
  }
  if (!reservation.allowed) throw new RefreshRateLimitedError(reservation.retryAfterSeconds);

  // T-299 (Arjun, must-fix): a refresh needs a live session. Missing (logged out, revoked,
  // Google link, expired, or spent and past its grace window): the same 401 as a bad JWT, and
  // nothing is issued. This peek only keeps that answer ahead of the user lookup; the
  // single-use guarantee is rotateRefreshSession's atomic script.
  const oldRefreshHash = hashToken(refreshToken);
  if ((await redisClient.exists(refreshSessionKey(payload.sub, oldRefreshHash))) !== 1) {
    throw new AppError(401, INVALID_REFRESH_MESSAGE);
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) {
    throw new AppError(401, 'User not found or inactive');
  }

  // T-616b — rotate with a 30 s grace (session.service rotateRefreshSession): the first
  // presentation gets a new pair; the same token again inside the window gets the SAME new
  // refresh token and a fresh access token; after the window, or past the 7-day ceiling, 401.
  // The old access key is no longer deleted here (that 401'd requests in flight); it expires
  // within min(30 s, its JWT's life). authAt (T-115c) and originalCreatedAt are carried.
  const rotation = await rotateRefreshSession({
    userId: user._id.toString(),
    oldRefreshHash,
    claims: {
      sub: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      plan: user.plan,
      pv: user.privacyVersion,
    },
    userInfo: { plan: user.plan, email: user.email, role: user.role, name: user.name },
    meta: { ip: meta.ip, userAgent: meta.userAgent },
  });
  if (rotation.kind === 'invalid' || rotation.kind === 'expired') {
    throw new AppError(401, INVALID_REFRESH_MESSAGE);
  }

  return { accessToken: rotation.accessToken, refreshToken: rotation.refreshToken };
}

/** T-343 — what GET /me reports about the user's privacy acceptance. */
export interface PrivacyStatus {
  privacyVersion: string | null;
  currentPrivacyVersion: string;
  needsPrivacyAcceptance: boolean;
  /** Ajay's signed one-line summary (P2); present only when needsPrivacyAcceptance. */
  summary?: string;
}

/**
 * T-343 — the prompt shows when the stored privacyVersion is not equal to the current one
 * (a missing version counts as not accepted) AND the current version has a signed summary
 * (Ajay §3). Versions are compared with !== only, never as dates.
 */
export function privacyStatusFor(user: Pick<IUser, 'privacyVersion'>): PrivacyStatus {
  const privacyVersion = user.privacyVersion ?? null;
  const summary = getPrivacyVersionSummary(CURRENT_PRIVACY_VERSION);
  const needsPrivacyAcceptance =
    privacyVersion !== CURRENT_PRIVACY_VERSION && summary !== undefined;
  return {
    privacyVersion,
    currentPrivacyVersion: CURRENT_PRIVACY_VERSION,
    needsPrivacyAcceptance,
    ...(needsPrivacyAcceptance ? { summary } : {}),
  };
}

/**
 * T-642 (AJ-517-M18(c), AJ-642-M4; Arjun condition 3) — computed on every GET /me, never stored.
 * True only for an acceptedVia 'google' account with no signupConsentAt. Any other acceptedVia
 * (password, test, missing) is always false, whatever the other fields hold. A test account is
 * never 'google' (AJ-563-M1a), so no test acceptance stands in for this one.
 */
export function needsSignupConsentFor(
  user: Pick<IUser, 'acceptedVia' | 'signupConsentAt'>,
): boolean {
  if (user.acceptedVia !== 'google') return false;
  return !(user.signupConsentAt instanceof Date);
}

/**
 * T-507 — the profile fields GET /me reports, under their API names (barCouncil is stored as
 * User.barCouncilId, barCouncilState as User.state). A value never given is null; a list is [].
 * barCouncilState is returned as stored: records from before T-507 may hold free text there.
 */
export interface MeProfile {
  name: string | null;
  phone: string | null;
  enrollmentNumber: string | null;
  barCouncil: string | null;
  barCouncilState: string | null;
  practiceAreas: string[];
  yearsOfExperience: number | null;
  courtsPractisedIn: string[];
  defaultCourt: string | null;
}

/** GET /me: the T-343 privacy state plus the T-223 verification state and the T-507 profile. */
export type MeStatus = PrivacyStatus &
  MeProfile & {
    /** T-223: the address has been verified through the emailed link. */
    emailVerified: boolean;
    /** T-223: a Google account or a linked googleId (counts as verified, T-351). */
    hasGoogle: boolean;
    /**
     * T-115c: the account has a password, so closing it asks for the password; without one
     * (Google-only) it asks the user to type their email. Read from +password, not authProvider.
     */
    hasPassword: boolean;
    /** T-436: the GST State/UT code for tax invoices (2-digit string), or null when not given. */
    gstStateCode: string | null;
    /** T-522 (Arjun 7): the sign-up Ink has been granted (signupBonusGrantedAt is set). */
    signupInkGranted: boolean;
    /** T-522 (Arjun 2): a sign-up referral code's outcome; null when none was sent or unknown. */
    referralStatus: 'applied' | 'not_applied' | null;
    /** T-642: the next-sign-in M16 box must show (needsSignupConsentFor). */
    needsSignupConsent: boolean;
  };

function stringOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export async function getPrivacyStatus(userId: string): Promise<MeStatus> {
  // googleId is select:false on the schema, so it is asked for explicitly (+googleId).
  const user = await User.findById(userId).select(
    'privacyVersion isActive emailVerified authProvider gstStateCode +googleId +password ' +
      'signupBonusGrantedAt referralStatus acceptedVia signupConsentAt ' +
      'name phone enrollmentNumber barCouncilId state practiceAreas yearsOfExperience ' +
      'courtsPractisedIn defaultCourt',
  );
  if (!user || !user.isActive) {
    throw new AppError(401, 'User not found or inactive');
  }
  const hasGoogle =
    user.authProvider === 'google' ||
    (typeof user.googleId === 'string' && user.googleId.length > 0);
  return {
    ...privacyStatusFor(user),
    needsSignupConsent: needsSignupConsentFor(user),
    emailVerified: user.emailVerified === true,
    hasGoogle,
    hasPassword: typeof user.password === 'string' && user.password.length > 0,
    gstStateCode: typeof user.gstStateCode === 'string' ? user.gstStateCode : null,
    signupInkGranted: user.signupBonusGrantedAt !== null && user.signupBonusGrantedAt !== undefined,
    referralStatus:
      user.referralStatus === 'applied' || user.referralStatus === 'not_applied'
        ? user.referralStatus
        : null,
    name: stringOrNull(user.name),
    phone: stringOrNull(user.phone),
    enrollmentNumber: stringOrNull(user.enrollmentNumber),
    barCouncil: stringOrNull(user.barCouncilId),
    barCouncilState: stringOrNull(user.state),
    practiceAreas: stringList(user.practiceAreas),
    yearsOfExperience: typeof user.yearsOfExperience === 'number' ? user.yearsOfExperience : null,
    courtsPractisedIn: stringList(user.courtsPractisedIn),
    defaultCourt: stringOrNull(user.defaultCourt),
  };
}

/** T-507 — what a saved PATCH /me echoes: exactly the keys sent, as stored (null = cleared). */
export type UpdateMeEcho = {
  [K in keyof UpdateMeInput]?: Exclude<UpdateMeInput[K], undefined>;
};

/** T-436 / T-507 — the PATCH /me outcome; the controller maps each kind to a status. */
export type UpdateProfileOutcome =
  | { kind: 'saved'; data: UpdateMeEcho }
  | { kind: 'privacy_reaccept_required' }
  /** T-507: defaultCourt would not be one of the (stored or sent) courtsPractisedIn. 422. */
  | { kind: 'default_court_not_in_courts' }
  | { kind: 'not_found' };

/** T-436 — the 403 body for a PATCH /me refused for privacy (the T-343 shape the web knows). */
export const UPDATE_ME_PRIVACY_BODY = { error: PRIVACY_REACCEPT_REQUIRED } as const;
/** T-436 name, kept for existing imports. */
export const SET_GST_STATE_PRIVACY_BODY = UPDATE_ME_PRIVACY_BODY;

/** T-507 — API name -> User field. Fields not listed keep their name. */
const STORED_FIELD: Partial<Record<keyof UpdateMeInput, keyof IUser>> = {
  barCouncil: 'barCouncilId',
  barCouncilState: 'state',
};

/**
 * T-436 / T-507 — PATCH /me (already validated by validateUpdateMe): one update of every field
 * sent. `null` unsets an optional field; anything else is $set under the stored name.
 *
 * Consent order (Ajay, GST file Addendum 7 (2), must-fix): the fields are personal data under the
 * bumped privacy version, so they are stored only for a user whose stored privacyVersion is
 * CURRENT_PRIVACY_VERSION. The check reads the user record, not the token's `pv` claim (auth is
 * the source of truth for acceptance, and a stale token cannot slip through), and is part of the
 * update filter itself, so there is no gap between the check and the write.
 *
 * As requireCurrentPrivacy (Arjun, T-343 Addendum 2.1): when the current version has no signed
 * summary no prompt can show, so the version is not required.
 *
 * T-507 defaultCourt rule, also in the filter (atomic): defaultCourt sent without
 * courtsPractisedIn must be in the STORED list; courtsPractisedIn sent without defaultCourt must
 * still contain the STORED defaultCourt (or there is none). Otherwise nothing is written and the
 * answer is 'default_court_not_in_courts' (422). Both sent: checked by the validator.
 *
 * An account being closed (erasure present) or inactive is 'not_found' (401, as GET /me).
 * Never logs a field value.
 */
export async function updateProfile(
  userId: string,
  input: UpdateMeInput,
): Promise<UpdateProfileOutcome> {
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, 1> = {};
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input) as [keyof UpdateMeInput, unknown][]) {
    if (value === undefined) continue;
    const stored = STORED_FIELD[key] ?? key;
    if (value === null) $unset[stored] = 1;
    else $set[stored] = value;
    data[key] = value;
  }

  let courtFilter: Record<string, unknown> = {};
  if (typeof input.defaultCourt === 'string' && input.courtsPractisedIn === undefined) {
    courtFilter = { courtsPractisedIn: input.defaultCourt };
  } else if (input.courtsPractisedIn !== undefined && input.defaultCourt === undefined) {
    courtFilter = {
      $or: [
        { defaultCourt: { $exists: false } },
        { defaultCourt: null },
        { defaultCourt: { $in: input.courtsPractisedIn } },
      ],
    };
  }
  const courtChecked = Object.keys(courtFilter).length > 0;

  const update: Record<string, unknown> = {};
  if (Object.keys($set).length > 0) update['$set'] = $set;
  if (Object.keys($unset).length > 0) update['$unset'] = $unset;

  const privacyGated = getPrivacyVersionSummary(CURRENT_PRIVACY_VERSION) !== undefined;
  const result = await User.updateOne(
    {
      _id: userId,
      isActive: true,
      erasure: { $exists: false },
      ...(privacyGated ? { privacyVersion: CURRENT_PRIVACY_VERSION } : {}),
      ...courtFilter,
    },
    update,
    { runValidators: true },
  );
  if (result.matchedCount === 1) return { kind: 'saved', data: data as UpdateMeEcho };

  // Nothing matched: say why, without writing anything.
  const user = await User.findById(userId).select('isActive erasure privacyVersion').lean();
  if (!user || !user.isActive || user.erasure) return { kind: 'not_found' };
  if (privacyGated && user.privacyVersion !== CURRENT_PRIVACY_VERSION) {
    return { kind: 'privacy_reaccept_required' };
  }
  return courtChecked
    ? { kind: 'default_court_not_in_courts' }
    : { kind: 'privacy_reaccept_required' };
}

/** T-507 — the POST /me/password outcome; the controller maps each kind to a status. */
export type ChangePasswordOutcome =
  | { kind: 'changed'; revokedSessions: number }
  /** No password on the record (Google-only): 409 no_password. */
  | { kind: 'no_password' }
  /** currentPassword does not match (or it changed meanwhile): 403 wrong_password. */
  | { kind: 'wrong_password' }
  /** Over 5 failed attempts in 15 min (password-change-rate-limit.ts): 429 + Retry-After. */
  | { kind: 'limited'; retryAfterSeconds: number }
  /** The limiter store (Redis) failed: 503, fail closed, nothing looked up or changed. */
  | { kind: 'unavailable' }
  | { kind: 'not_found' };

/** Same cost as the User pre-save hook and the T-221 reset. */
const PASSWORD_BCRYPT_COST = 12;

/**
 * T-507 — POST /me/password. `newPassword` has already passed the sign-up rules. Requires the
 * current password (bcrypt compare). The write is conditional on the hash just compared, so two
 * concurrent changes cannot both succeed. Any outstanding reset link is cleared. Then every OTHER
 * session is signed out; the caller's (`accessToken`) is kept. One log line, ids and a count only.
 */
export async function changePassword(
  userId: string,
  accessToken: string,
  currentPassword: string,
  newPassword: string,
): Promise<ChangePasswordOutcome> {
  const redis = (await import('../config/redis')).default;

  // Arjun's ruling: per-user limit on FAILED attempts, checked before any lookup or compare.
  // Redis down: fail closed (503), nothing looked up or changed.
  try {
    const reservation = await reservePasswordChangeAttempt(redis, userId);
    if (!reservation.allowed) {
      logger.info(
        { userId, retryAfterSeconds: reservation.retryAfterSeconds },
        'Password change refused: rate limit',
      );
      return { kind: 'limited', retryAfterSeconds: reservation.retryAfterSeconds };
    }
  } catch (err) {
    logger.warn(
      { userId, errKind: errorKindOf(err) },
      'Password change refused: rate-limit store unavailable',
    );
    return { kind: 'unavailable' };
  }

  const outcome = await checkAndSetPassword(userId, currentPassword, newPassword);

  // Settle the reserved attempt: a wrong password keeps it (a failure); a change clears the
  // count; anything else gives it back. A settle failure never undoes the outcome.
  try {
    if (outcome.kind === 'changed') await resetPasswordChangeFailures(redis, userId);
    else if (outcome.kind !== 'wrong_password') await releasePasswordChangeAttempt(redis, userId);
  } catch (err) {
    logger.warn({ userId, errKind: errorKindOf(err) }, 'Password change: rate-limit settle failed');
  }
  if (outcome.kind !== 'changed') return outcome;

  const revokedSessions = await deleteOtherUserSessions(userId, hashToken(accessToken));
  logger.info({ userId, event: 'password_changed', revokedSessions }, 'Password changed');
  return { kind: 'changed', revokedSessions };
}

/** Error class only, for logs (never the message: it may carry a value). */
function errorKindOf(err: unknown): string {
  return err instanceof Error ? err.name : typeof err;
}

/** The compare and the conditional write of changePassword; no sessions, no limiter. */
async function checkAndSetPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ kind: 'changed' } | { kind: 'no_password' | 'wrong_password' | 'not_found' }> {
  const user = await User.findById(userId).select('+password isActive erasure');
  if (!user || !user.isActive || user.erasure) return { kind: 'not_found' };
  const oldHash = user.password;
  if (typeof oldHash !== 'string' || oldHash.length === 0) return { kind: 'no_password' };
  if (!(await bcrypt.compare(currentPassword, oldHash))) return { kind: 'wrong_password' };

  const newHash = await bcrypt.hash(newPassword, PASSWORD_BCRYPT_COST);
  const result = await User.updateOne(
    { _id: userId, isActive: true, erasure: { $exists: false }, password: oldHash },
    {
      $set: { password: newHash },
      $unset: { passwordResetToken: 1, passwordResetExpires: 1 },
    },
  );
  return result.matchedCount === 1 ? { kind: 'changed' } : { kind: 'wrong_password' };
}

/** T-507 — one row of GET /me/privacy-history. */
export interface PrivacyHistoryRow {
  version: string;
  acceptedAt: Date;
  via: PrivacyAcceptedVia;
}

/** T-507 — GET /me/privacy-history: User.privacyHistory, newest first. null: 401 (as GET /me). */
export async function getPrivacyHistory(userId: string): Promise<PrivacyHistoryRow[] | null> {
  const user = await User.findById(userId).select('isActive erasure privacyHistory').lean();
  if (!user || !user.isActive || user.erasure) return null;
  return (user.privacyHistory ?? [])
    .map((r) => ({ version: r.version, acceptedAt: r.acceptedAt, via: r.via }))
    .sort((a, b) => new Date(b.acceptedAt).getTime() - new Date(a.acceptedAt).getTime());
}

/**
 * T-343 — POST /me/privacy-acceptance. Records acceptance of CURRENT_PRIVACY_VERSION with
 * server values only (version, time, via 'reaccept'); nothing comes from the request body.
 * Order: (1) take the caller's session (401 and nothing written if it is gone); (2) the
 * conditional update (only when the stored version differs, so a double submit adds one history
 * row, not two); (3) the new pair, carrying the new `pv` (rotation as /refresh, Arjun's
 * addendum). Logs only the user id, never tokens.
 *
 * T-354 — why this order is kept (Arjun, 12 Oct 2026, option A): take first, then the update,
 * then the isActive check. The acceptance is a consent record, so it is written only by a
 * request whose session we have just proved live and consumed. Updating first (option B) would
 * let a revoked session record consent in a race. Do not reorder without a new ruling.
 *
 * T-616b — the "take" is now the same rotation /refresh uses (rotateRefreshSession, same 30 s
 * grace), applied to the refresh token the caller's access session names. It consumes that
 * refresh token atomically and writes the new pair at once, so the new tokens are minted with
 * pv = CURRENT_PRIVACY_VERSION, the value the update below makes true. The caller's access key is
 * not deleted; it expires within min(30 s, its JWT's life). Two accepts with one token, or an
 * accept racing a /refresh of the same session, get the same new refresh token (grace replay)
 * and each its own access token: never a second refresh token or session family.
 *
 * Failure mode (accepted, unchanged in effect): if the update or the user read throws after the
 * take, the request returns 500 and the web shows P8. A first rotation is then undone: its
 * whole family is revoked (new pair, grace record, the old access key), so the old pair is dead,
 * no session leaks, the user's next action signs them out (apiFetch 401 → /refresh 401 →
 * /login) and logging in again works and shows the prompt again if the update did not land. A
 * grace replay only drops its own access key (the first caller's session stands).
 */
export async function acceptPrivacy(
  userId: string,
  accessToken: string,
  meta: SessionMeta = {},
): Promise<{ accessToken: string; refreshToken: string }> {
  // (1) The caller's access session must be live; it names the refresh token to rotate. Never
  // log the token or its hash.
  const accessHash = hashToken(accessToken);
  const oldSessionData = await redisClient.get(sessionKey(userId, accessHash));
  if (typeof oldSessionData !== 'string') {
    throw new AppError(401, 'Session expired or revoked. Please log in again.');
  }
  let oldRefreshHash: unknown;
  let oldAuthAt: unknown;
  try {
    const parsed = JSON.parse(oldSessionData) as { refreshTokenHash?: unknown; authAt?: unknown };
    oldRefreshHash = parsed.refreshTokenHash;
    oldAuthAt = parsed.authAt;
  } catch {
    oldRefreshHash = undefined;
  }
  if (typeof oldRefreshHash !== 'string' || !oldRefreshHash) {
    throw new AppError(401, 'Session expired or revoked. Please log in again.');
  }

  const before = await User.findById(userId);
  if (!before || !before.isActive) {
    // As before T-616b: the caller's session does not survive (nothing issued, nothing recorded).
    await deleteSession(userId, accessHash);
    throw new AppError(401, 'User not found or inactive');
  }

  const rotation = await rotateRefreshSession({
    userId,
    oldRefreshHash,
    claims: {
      sub: before._id.toString(),
      email: before.email,
      name: before.name,
      role: before.role,
      plan: before.plan,
      // What the update below makes true (it only ever sets this version).
      pv: CURRENT_PRIVACY_VERSION,
    },
    userInfo: { plan: before.plan, email: before.email, role: before.role, name: before.name },
    meta: { ip: meta.ip, userAgent: meta.userAgent },
    // T-115c — carried from the session that was taken, like /refresh.
    fallbackAuthAt: typeof oldAuthAt === 'string' ? oldAuthAt : undefined,
  });
  if (rotation.kind === 'invalid' || rotation.kind === 'expired') {
    throw new AppError(401, 'Session expired or revoked. Please log in again.');
  }

  try {
    // (2) The consent record.
    const acceptedAt = new Date();
    await User.updateOne(
      { _id: userId, isActive: true, privacyVersion: { $ne: CURRENT_PRIVACY_VERSION } },
      {
        $set: {
          privacyVersion: CURRENT_PRIVACY_VERSION,
          privacyAcceptedAt: acceptedAt,
          privacyAcceptedVia: 'reaccept',
        },
        $push: {
          privacyHistory: { version: CURRENT_PRIVACY_VERSION, acceptedAt, via: 'reaccept' },
        },
      },
    );

    // (3) Still active (deactivated meanwhile: no pair).
    const user = await User.findById(userId);
    if (!user || !user.isActive) {
      throw new AppError(401, 'User not found or inactive');
    }
  } catch (err) {
    await undoAcceptRotation(userId, rotation);
    throw err;
  }

  logger.info({ userId }, 'Privacy version accepted');
  return { accessToken: rotation.accessToken, refreshToken: rotation.refreshToken };
}

/**
 * T-642 — POST /me/signup-consent: the AJ-517-M16 box accepted on the next-sign-in step for an
 * acceptedVia 'google' account (AJ-642-M2..M5). Server values only, nothing from the body: the
 * versions are CURRENT_TERMS_VERSION and CURRENT_PRIVACY_VERSION, the same constants the email
 * Create-account path stores (Arjun condition 1), and the time is server time.
 *
 * Order (as acceptPrivacy, T-354): (1) the caller's access session must still be live, else 401
 * and nothing written; (2) one atomic conditional update, only on an active 'google' account with
 * no signupConsentAt, which sets the three signupConsent fields, termsVersion and privacyVersion
 * (AJ-642-M6), privacyAcceptedAt (the same time) and privacyAcceptedVia 'google_confirm', and
 * pushes one 'google_confirm' privacyHistory row. acceptedVia, termsAcceptedAt
 * and the earlier rows are untouched (M18(b)).
 * Idempotent (Arjun condition 2): a repeat, or a racing second call, matches nothing, so the first
 * timestamp and a single row stand, and it still succeeds. A non-'google' account is a no-op
 * success too (nothing to confirm; needsSignupConsent is false for it).
 *
 * No token rotation, unlike acceptPrivacy. The token's `pv` claim comes from privacyVersion,
 * which this update may change, so a token minted before it can carry a stale `pv`. Such a token
 * gets one 403 privacy_reaccept_required on a gated call; the web's privacyFetch then sees /me
 * not behind, refreshes (the new pair carries the current `pv`) and retries once. Logs only the
 * user id, never tokens.
 */
export async function recordSignupConsent(userId: string, accessToken: string): Promise<void> {
  const accessHash = hashToken(accessToken);
  const session = await redisClient.get(sessionKey(userId, accessHash));
  if (typeof session !== 'string') {
    throw new AppError(401, 'Session expired or revoked. Please log in again.');
  }

  const user = await User.findById(userId).select('isActive').lean();
  if (!user || !user.isActive) {
    throw new AppError(401, 'User not found or inactive');
  }

  const acceptedAt = new Date();
  const res = await User.updateOne(
    { _id: userId, isActive: true, acceptedVia: 'google', signupConsentAt: null },
    {
      $set: {
        signupConsentAt: acceptedAt,
        signupConsentTermsVersion: CURRENT_TERMS_VERSION,
        signupConsentPrivacyVersion: CURRENT_PRIVACY_VERSION,
        // AJ-642-M6 (no double prompt): the versions shown become the accepted versions, so the
        // T-343 prompt fires only if what was shown was stale. acceptedVia and termsAcceptedAt
        // stay as they are.
        termsVersion: CURRENT_TERMS_VERSION,
        privacyVersion: CURRENT_PRIVACY_VERSION,
        // Ajay (via Priya): the privacy acceptance is this one, at the same time as
        // signupConsentAt.
        privacyAcceptedAt: acceptedAt,
        privacyAcceptedVia: 'google_confirm',
      },
      $push: {
        privacyHistory: {
          version: CURRENT_PRIVACY_VERSION,
          acceptedAt,
          via: 'google_confirm',
          termsVersion: CURRENT_TERMS_VERSION,
          consentTextVersion: SIGNUP_CONSENT_TEXT_VERSION,
        },
      },
    },
  );
  if (res.modifiedCount > 0) logger.info({ userId }, 'Google sign-up consent recorded');
}

/** T-616b — see acceptPrivacy's failure mode. Best effort: never masks the original error. */
async function undoAcceptRotation(
  userId: string,
  rotation: { kind: 'rotated' | 'replayed'; accessHash: string },
): Promise<void> {
  try {
    if (rotation.kind === 'rotated') {
      await deleteSession(userId, rotation.accessHash);
    } else {
      await redisClient.del(sessionKey(userId, rotation.accessHash));
    }
  } catch (undoErr) {
    logger.warn(
      { userId, errKind: errorKind(undoErr) },
      'Privacy accept: undoing the rotation failed',
    );
  }
}

export async function logoutUser(userId: string, accessToken: string): Promise<void> {
  const accessHash = hashToken(accessToken);
  await deleteSession(userId, accessHash);
}

// T-221: password reset moved to password-reset.service.ts (sign-up rules, single use,
// sessions signed out).

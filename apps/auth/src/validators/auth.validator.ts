import {
  RegisterPayload,
  LoginPayload,
  isGstStateCode,
  PASSWORD_MIN_LENGTH,
  PASSWORD_UPPERCASE_RE,
  PASSWORD_LOWERCASE_RE,
  PASSWORD_DIGIT_RE,
  type PasswordRuleId,
} from '@lawie/shared';
import { z, ZodError } from 'zod';

import { AppError } from '../middleware/errorHandler';
import type { ISignupSource } from '../models/User.model';

import {
  BAR_COUNCIL_MAX,
  COURTS_PRACTISED_IN_MAX,
  COURT_ID_RE,
  ENROLLMENT_NUMBER_MAX,
  HTML_CHARS_RE,
  NAME_MAX,
  PHONE_RE,
  PRACTICE_AREAS,
  PRACTICE_AREAS_MAX,
  YEARS_OF_EXPERIENCE_MAX,
} from './profile-lists';

// ── T-242: sign-up source (UTM) ──────────────────────────────────────────────────────────────
// Ajay, T-242 signed, condition 2: keep only utm_source, utm_medium and utm_campaign, each cut to
// 100 characters; drop any value with an "@" or a run of 7 or more digits (it may be an email
// address or a phone number). Bad values are dropped, never refused, so a tag can't block sign-up.
// Condition 3: these values are never logged. Do not pass them to logger.* or Sentry.
export const UTM_VALUE_MAX_LENGTH = 100;
const UTM_PII_PATTERN = /@|\d{7,}/;

export interface UtmTags {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

/** One tag value, capped and filtered. Returns undefined for anything that must not be kept. */
export function sanitizeUtmValue(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  // Checked on the whole value, before the cut, so a digit run across the 100th character is
  // still caught.
  if (!trimmed || UTM_PII_PATTERN.test(trimmed)) return undefined;
  const capped = trimmed.slice(0, UTM_VALUE_MAX_LENGTH).trim();
  return capped || undefined;
}

/** The three tags, each sanitized; keys with no usable value are left out. */
export function sanitizeUtm(raw: {
  utmSource?: unknown;
  utmMedium?: unknown;
  utmCampaign?: unknown;
}): UtmTags {
  const utmSource = sanitizeUtmValue(raw.utmSource);
  const utmMedium = sanitizeUtmValue(raw.utmMedium);
  const utmCampaign = sanitizeUtmValue(raw.utmCampaign);
  return {
    ...(utmSource ? { utmSource } : {}),
    ...(utmMedium ? { utmMedium } : {}),
    ...(utmCampaign ? { utmCampaign } : {}),
  };
}

/**
 * The value stored on a NEW user (condition 4): the sanitized tags plus the server time, or
 * undefined when no tag survives. Call only where an account is created.
 */
export function buildSignupSource(raw: UtmTags | undefined): ISignupSource | undefined {
  if (!raw) return undefined;
  const tags = sanitizeUtm(raw);
  if (!tags.utmSource && !tags.utmMedium && !tags.utmCampaign) return undefined;
  return { ...tags, recordedAt: new Date() };
}

// z.unknown + transform: a missing, non-string, too long or PII-like tag becomes undefined
// instead of a 422.
const utmField = z.unknown().transform(sanitizeUtmValue);

/**
 * The four sign-up password rules. T-221: shared by sign-up and password reset, so a reset can
 * never set a weaker password than sign-up allows (T-208 follow-up 3). Same messages as before.
 */
/**
 * T-522 (AJ-522-S7, scope AJ-522-S10, Ajay 22 Oct 2026): the one user-facing weak-password line,
 * for every path that uses passwordSchema. It must state the real rule (constants/password.ts in
 * @lawie/shared). The PASSWORD_MESSAGES below are no longer shown to users: they only mark which
 * rule failed, so RULE_BY_MESSAGE can turn it into an `unmet` code.
 */
export const PASSWORD_WEAK_MESSAGE =
  'Use at least 8 characters, with an upper-case letter, a lower-case letter and a digit.';

const PASSWORD_MESSAGES = {
  required: 'Password is required',
  min_length: 'Password must be at least 8 characters',
  uppercase: 'Must contain at least one uppercase letter',
  lowercase: 'Must contain at least one lowercase letter',
  number: 'Must contain at least one number',
} as const;

// T-522 (Arjun 3): the rule comes from @lawie/shared (constants/password.ts), the same constant
// the web hint reads, so the two cannot drift.
export const passwordSchema = z
  .string({ required_error: PASSWORD_MESSAGES.required })
  .min(PASSWORD_MIN_LENGTH, PASSWORD_MESSAGES.min_length)
  .regex(PASSWORD_UPPERCASE_RE, PASSWORD_MESSAGES.uppercase)
  .regex(PASSWORD_LOWERCASE_RE, PASSWORD_MESSAGES.lowercase)
  .regex(PASSWORD_DIGIT_RE, PASSWORD_MESSAGES.number);

/** T-221: the rule ids the reset page maps to its own checklist lines (never the raw text). */
export type PasswordRule = PasswordRuleId;
const RULE_BY_MESSAGE: Record<string, PasswordRule> = {
  [PASSWORD_MESSAGES.min_length]: 'min_length',
  [PASSWORD_MESSAGES.uppercase]: 'uppercase',
  [PASSWORD_MESSAGES.lowercase]: 'lowercase',
  [PASSWORD_MESSAGES.number]: 'number',
};

const registerSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email format')
    .toLowerCase(),
  password: passwordSchema,
  name: z.string({ required_error: 'Name is required' }).min(1, 'Name is required').max(100).trim(),
  // No `role` here (T-196): self-registration can never choose a role. z.object
  // strips unknown keys, so a client-sent `role` is silently dropped.
  referralCode: z.string().max(16).optional(), // SCRUM-71 — optional referral code at signup
  // T-242 — landing-link tags, sanitized; dropped (not refused) when unusable.
  utmSource: utmField,
  utmMedium: utmField,
  utmCampaign: utmField,
});

const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email format')
    .toLowerCase(),
  password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required'),
});

// T-208: validation failures are operational AppErrors, so errorHandler answers
// 422 with the message(s) and does not report them to Sentry.
function validationError(error: ZodError): AppError {
  // T-522 (AJ-522-S10): a failed password rule (sign-up, reset, change: passwordSchema) shows the
  // one signed S7 line, once, however many rules failed. The per-rule detail stays as codes
  // (`unmet` on reset and change); every other message is unchanged.
  let weakShown = false;
  const parts: string[] = [];
  for (const e of error.errors) {
    if (RULE_BY_MESSAGE[e.message] !== undefined) {
      if (!weakShown) parts.push(PASSWORD_WEAK_MESSAGE);
      weakShown = true;
    } else {
      parts.push(e.message);
    }
  }
  return new AppError(422, parts.join('; '));
}

export type RegisterInput = RegisterPayload & { referralCode?: string } & UtmTags;

export function validateRegister(data: unknown): RegisterInput {
  const result = registerSchema.safeParse(data);
  if (!result.success) {
    throw validationError(result.error);
  }
  return result.data as RegisterInput;
}

export function validateLogin(data: unknown): LoginPayload {
  const result = loginSchema.safeParse(data);
  if (!result.success) {
    throw validationError(result.error);
  }
  return result.data;
}

// ── T-221: forgot / reset password ────────────────────────────────────────────────────────────
const forgotPasswordSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .max(254, 'Invalid email format')
    .email('Invalid email format')
    .toLowerCase(),
});

/**
 * POST /forgot-password { email }: the lower-cased address, or null for a missing or badly
 * formed one (the controller answers 400). The value is never put in an error or a log.
 */
export function parseForgotPasswordEmail(data: unknown): string | null {
  const result = forgotPasswordSchema.safeParse(data ?? {});
  return result.success ? result.data.email : null;
}

const resetPasswordSchema = z.object({ password: passwordSchema });

export type ResetPasswordCheck =
  | { ok: true; password: string }
  /** 422: `message` is the sign-up validator text; `unmet` lists every rule not met. */
  | { ok: false; message: string; unmet: PasswordRule[] };

/**
 * POST /reset-password/:token { password }: the same four rules as sign-up (passwordSchema). A
 * missing or non-string password fails every rule. The password is never put in a log.
 */
export function checkResetPassword(data: unknown): ResetPasswordCheck {
  const result = resetPasswordSchema.safeParse(data ?? {});
  if (result.success) return { ok: true, password: result.data.password };
  const rules = result.error.errors
    .map((e) => RULE_BY_MESSAGE[e.message])
    .filter((r): r is PasswordRule => r !== undefined);
  const unmet: PasswordRule[] =
    rules.length > 0 ? rules : ['min_length', 'uppercase', 'lowercase', 'number'];
  return { ok: false, message: validationError(result.error).message, unmet };
}

// ── T-436 / T-507: PATCH /me ────────────────────────────────────────────────────────────────
// T-436: gstStateCode, a 2-digit string that is one of the 36 GST State/UT codes (GST_STATES in
// @lawie/shared). T-507 (Arjun's rulings, 17 Oct 2026): plus the profile fields, under their API
// names (barCouncil is stored as User.barCouncilId, barCouncilState as User.state). Every field is
// optional, but the body must carry at least one. .strict(): any other field, `email` included,
// is a 422, never silently dropped, so this route can never be used to write another user field.
//
// Clearing: `null` clears an optional single value (phone, enrollmentNumber, barCouncil,
// barCouncilState, yearsOfExperience, defaultCourt); [] clears a list. name and gstStateCode
// cannot be cleared. Free text is trimmed and refused if it holds "<" or ">" (no HTML).
//
// defaultCourt must be one of courtsPractisedIn. When both are sent this is checked here; when
// only one is sent it is checked against the STORED list/default inside the update itself
// (updateProfile): a change that would leave the stored defaultCourt outside the list is a 422
// (DEFAULT_COURT_NOT_IN_COURTS), nothing stored. Send defaultCourt (a new one, or null) with it.
//
// Error messages never carry the submitted value (they are returned and may be logged).
const NO_HTML_MESSAGE = 'must not contain < or >';

function freeText(field: string, max: number) {
  return z
    .string({ invalid_type_error: `${field} must be a string` })
    .trim()
    .min(1, `${field} must not be empty`)
    .max(max, `${field} must be at most ${max} characters`)
    .refine((v) => !HTML_CHARS_RE.test(v), `${field} ${NO_HTML_MESSAGE}`);
}

function courtId(field: string) {
  return z
    .string({ invalid_type_error: `${field} must be a string` })
    .regex(COURT_ID_RE, `${field} must be a court id`);
}

function dedupe<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export const DEFAULT_COURT_NOT_IN_COURTS = 'defaultCourt must be one of courtsPractisedIn';

const updateMeSchema = z
  .object({
    gstStateCode: z
      .string({ invalid_type_error: 'gstStateCode must be a string' })
      .refine((v) => isGstStateCode(v), 'Invalid GST State code')
      .optional(),
    name: freeText('name', NAME_MAX).optional(),
    phone: z
      .string({ invalid_type_error: 'phone must be a string' })
      .trim()
      .regex(PHONE_RE, 'phone must be +91 followed by 10 digits')
      .nullable()
      .optional(),
    enrollmentNumber: freeText('enrollmentNumber', ENROLLMENT_NUMBER_MAX).nullable().optional(),
    barCouncil: freeText('barCouncil', BAR_COUNCIL_MAX).nullable().optional(),
    barCouncilState: z
      .string({ invalid_type_error: 'barCouncilState must be a string' })
      .refine((v) => isGstStateCode(v), 'Invalid barCouncilState code')
      .nullable()
      .optional(),
    practiceAreas: z
      .array(z.enum(PRACTICE_AREAS, { errorMap: () => ({ message: 'Invalid practice area' }) }), {
        invalid_type_error: 'practiceAreas must be a list',
      })
      .max(PRACTICE_AREAS_MAX, `practiceAreas allows at most ${PRACTICE_AREAS_MAX} entries`)
      .transform(dedupe)
      .optional(),
    yearsOfExperience: z
      .number({ invalid_type_error: 'yearsOfExperience must be a number' })
      .int('yearsOfExperience must be a whole number')
      .min(0, 'yearsOfExperience must be 0 or more')
      .max(YEARS_OF_EXPERIENCE_MAX, `yearsOfExperience must be at most ${YEARS_OF_EXPERIENCE_MAX}`)
      .nullable()
      .optional(),
    courtsPractisedIn: z
      .array(courtId('courtsPractisedIn'), {
        invalid_type_error: 'courtsPractisedIn must be a list',
      })
      .max(
        COURTS_PRACTISED_IN_MAX,
        `courtsPractisedIn allows at most ${COURTS_PRACTISED_IN_MAX} entries`,
      )
      .transform(dedupe)
      .optional(),
    defaultCourt: courtId('defaultCourt').nullable().optional(),
  })
  .strict('Unknown or read-only field')
  .superRefine((v, ctx) => {
    if (Object.keys(v).length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Nothing to change' });
    }
    if (
      typeof v.defaultCourt === 'string' &&
      v.courtsPractisedIn !== undefined &&
      !v.courtsPractisedIn.includes(v.defaultCourt)
    ) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: DEFAULT_COURT_NOT_IN_COURTS });
    }
  });

/** The validated PATCH /me body: only the keys that were sent, normalised (trimmed, de-duplicated). */
export type UpdateMeInput = z.infer<typeof updateMeSchema>;

export function validateUpdateMe(data: unknown): UpdateMeInput {
  const result = updateMeSchema.safeParse(data ?? {});
  if (!result.success) {
    throw validationError(result.error);
  }
  return result.data;
}

// ── T-507: POST /me/password ────────────────────────────────────────────────────────────────
export type ChangePasswordCheck =
  | { ok: true; currentPassword: string; newPassword: string }
  /** 422 in the reset shape (error 'weak_password', message, unmet): newPassword fails a rule. */
  | { ok: false; kind: 'weak'; message: string; unmet: PasswordRule[] }
  /** 422 (AppError shape): currentPassword missing or not a string. */
  | { ok: false; kind: 'invalid'; message: string };

/**
 * POST /me/password { currentPassword, newPassword }: newPassword must meet the sign-up rules
 * (passwordSchema, via checkResetPassword, so the 422 is the reset one). Checked first, so a
 * weak new password never costs a bcrypt compare. Neither value is ever put in a log or error.
 */
export function checkChangePassword(data: unknown): ChangePasswordCheck {
  const body = (data && typeof data === 'object' ? data : {}) as {
    currentPassword?: unknown;
    newPassword?: unknown;
  };
  const next = checkResetPassword({ password: body.newPassword });
  if (!next.ok) return { ok: false, kind: 'weak', message: next.message, unmet: next.unmet };
  if (typeof body.currentPassword !== 'string' || body.currentPassword.length === 0) {
    return { ok: false, kind: 'invalid', message: 'currentPassword is required' };
  }
  return { ok: true, currentPassword: body.currentPassword, newPassword: next.password };
}

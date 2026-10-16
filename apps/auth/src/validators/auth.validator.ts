import { RegisterPayload, LoginPayload, isGstStateCode } from '@lawie/shared';
import { z, ZodError } from 'zod';

import { AppError } from '../middleware/errorHandler';
import type { ISignupSource } from '../models/User.model';

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
const PASSWORD_MESSAGES = {
  required: 'Password is required',
  min_length: 'Password must be at least 8 characters',
  uppercase: 'Must contain at least one uppercase letter',
  lowercase: 'Must contain at least one lowercase letter',
  number: 'Must contain at least one number',
} as const;

export const passwordSchema = z
  .string({ required_error: PASSWORD_MESSAGES.required })
  .min(8, PASSWORD_MESSAGES.min_length)
  .regex(/[A-Z]/, PASSWORD_MESSAGES.uppercase)
  .regex(/[a-z]/, PASSWORD_MESSAGES.lowercase)
  .regex(/\d/, PASSWORD_MESSAGES.number);

/** T-221: the rule ids the reset page maps to its own checklist lines (never the raw text). */
export type PasswordRule = 'min_length' | 'uppercase' | 'lowercase' | 'number';
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
  const messages = error.errors.map((e) => e.message).join('; ');
  return new AppError(422, messages);
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

// ── T-436: PATCH /me ─────────────────────────────────────────────────────────────────────────
// Only { gstStateCode }: a 2-digit string that is one of the 36 GST State/UT codes (Vikram's
// list, GST_STATES in @lawie/shared). .strict(): any other field is a 422, never silently
// dropped, so this route can never be used to write another user field.
const updateMeSchema = z
  .object({
    gstStateCode: z
      .string({
        required_error: 'gstStateCode is required',
        invalid_type_error: 'gstStateCode must be a string',
      })
      .refine((v) => isGstStateCode(v), 'Invalid GST State code'),
  })
  .strict('Only gstStateCode can be changed');

export interface UpdateMeInput {
  gstStateCode: string;
}

export function validateUpdateMe(data: unknown): UpdateMeInput {
  const result = updateMeSchema.safeParse(data ?? {});
  if (!result.success) {
    throw validationError(result.error);
  }
  return result.data;
}

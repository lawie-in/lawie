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

const registerSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email format')
    .toLowerCase(),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Must contain at least one lowercase letter')
    .regex(/\d/, 'Must contain at least one number'),
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

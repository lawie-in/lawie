import { RegisterPayload, LoginPayload } from '@lawie/shared';
import { z, ZodError } from 'zod';

import { AppError } from '../middleware/errorHandler';

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

export function validateRegister(data: unknown): RegisterPayload {
  const result = registerSchema.safeParse(data);
  if (!result.success) {
    throw validationError(result.error);
  }
  return result.data as RegisterPayload;
}

export function validateLogin(data: unknown): LoginPayload {
  const result = loginSchema.safeParse(data);
  if (!result.success) {
    throw validationError(result.error);
  }
  return result.data;
}

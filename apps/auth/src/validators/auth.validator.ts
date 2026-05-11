import { RegisterPayload, LoginPayload } from '@lawie/shared';
import { z } from 'zod';

const registerSchema = z.object({
  email: z.string().email('Invalid email format').toLowerCase(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Must contain at least one lowercase letter')
    .regex(/\d/, 'Must contain at least one number'),
  name: z.string().min(1, 'Name is required').max(100).trim(),
  role: z.enum(['Admin', 'Lawyer', 'Client']).default('Client'),
  referralCode: z.string().max(16).optional(), // SCRUM-71 — optional referral code at signup
});

const loginSchema = z.object({
  email: z.string().email('Invalid email format').toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

export function validateRegister(data: unknown): RegisterPayload {
  const result = registerSchema.safeParse(data);
  if (!result.success) {
    const messages = result.error.errors.map((e) => e.message).join(', ');
    const err = new Error(messages) as Error & { statusCode: number };
    err.statusCode = 422;
    throw err;
  }
  return result.data as RegisterPayload;
}

export function validateLogin(data: unknown): LoginPayload {
  const result = loginSchema.safeParse(data);
  if (!result.success) {
    const messages = result.error.errors.map((e) => e.message).join(', ');
    const err = new Error(messages) as Error & { statusCode: number };
    err.statusCode = 422;
    throw err;
  }
  return result.data;
}

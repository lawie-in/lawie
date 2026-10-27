import { isProductionBox } from '@lawie/shared';
import { z } from 'zod';

/** T-563 — the bypass secret's required prefix (so the gitleaks rule can match it). */
export const TEST_SIGNUP_SECRET_PREFIX = 'lts_';
export const TEST_SIGNUP_SECRET_MIN_LENGTH = 32;

/** T-563 — unset and '' both mean "absent" (an empty value can turn nothing on). */
const emptyToUndefined = (v: unknown): unknown =>
  typeof v === 'string' && v.trim() === '' ? undefined : v;

const envObject = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4001),

  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  JWT_EXPIRES_IN: z.string().default('15m'),

  // Google OAuth — optional so the service starts without creds in dev
  // Set both to enable the /google OAuth route
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_CALLBACK_URL: z.string().default('http://localhost:4001/google/callback'),

  // Where to redirect the browser after successful OAuth
  FRONTEND_URL: z.string().default('http://localhost:3000'),

  // Shared secret — downstream services validate this header from the gateway
  INTERNAL_SECRET: z.string().min(16, 'INTERNAL_SECRET must be at least 16 chars'),

  // T-115c — auth calls these services' /internal/* routes (account close and erase).
  // Same defaults as the gateway and credit-bonus.service.
  DRAFTING_SERVICE_URL: z.string().default('http://localhost:4002'),
  BILLING_SERVICE_URL: z.string().default('http://localhost:4003'),

  // T-358 (Arjun) — the unverified-account sweep may enqueue notices and delete accounts only
  // when this is exactly 'true'. Fails closed: unset, '', '1', 'TRUE' or anything else is off,
  // and an odd value never stops the service from starting. While off the sweep only logs
  // counts. The founder turns it on after purge -> footer env -> deploy -> resend-all (T-403).
  UNVERIFIED_SWEEP_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true'),

  // T-563 (Arjun) — develop-only test sign-up bypass. Both optional and off by default; both
  // must be absent in production (refused at boot below). The flag is on only for the exact
  // string 'true'. The secret's value is never logged or echoed in an error message.
  TEST_SIGNUP_BYPASS: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  TEST_SIGNUP_BYPASS_SECRET: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .min(
        TEST_SIGNUP_SECRET_MIN_LENGTH,
        `TEST_SIGNUP_BYPASS_SECRET must be at least ${TEST_SIGNUP_SECRET_MIN_LENGTH} chars`,
      )
      .refine((v) => v.startsWith(TEST_SIGNUP_SECRET_PREFIX), {
        message: `TEST_SIGNUP_BYPASS_SECRET must start with ${TEST_SIGNUP_SECRET_PREFIX}`,
      })
      .optional(),
  ),

  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  SENTRY_DSN: z.string().default(''),
});

export type Env = z.infer<typeof envObject>;

/**
 * T-563 (Arjun) — boot refusal: on a production box (shared isProductionBox: RAZORPAY_KEY_GUARD
 * =strict, SECRETS_ENV=prod or an rzp_live_ key) neither bypass variable may be set. The
 * markers are read from the raw environment (auth needs none of them otherwise). Pure; returns
 * the offending variable names, never a value.
 */
export function testSignupBypassBootRefusal(raw: NodeJS.ProcessEnv): string[] {
  const production = isProductionBox({
    RAZORPAY_KEY_GUARD: raw['RAZORPAY_KEY_GUARD'],
    SECRETS_ENV: raw['SECRETS_ENV'],
    RAZORPAY_KEY_ID: raw['RAZORPAY_KEY_ID'],
  });
  if (!production) return [];
  return (['TEST_SIGNUP_BYPASS', 'TEST_SIGNUP_BYPASS_SECRET'] as const).filter(
    (name) => emptyToUndefined(raw[name]) !== undefined,
  );
}

function buildEnvSchema(raw: NodeJS.ProcessEnv) {
  return envObject.superRefine((_v, ctx) => {
    for (const name of testSignupBypassBootRefusal(raw)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [name],
        message: `${name} must be absent on a production box (T-563)`,
      });
    }
  });
}

function loadEnv(): Env {
  const parsed = buildEnvSchema(process.env).safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    console.error(`\n❌ Auth Service — invalid env:\n${issues}\n`);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();

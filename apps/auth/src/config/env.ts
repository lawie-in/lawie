import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4001),

  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

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

  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  SENTRY_DSN: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
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

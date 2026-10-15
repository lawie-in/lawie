import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4003),

  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),

  INTERNAL_SECRET: z.string().min(16, 'INTERNAL_SECRET must be at least 16 chars'),

  RAZORPAY_KEY_ID: z.string().min(1, 'RAZORPAY_KEY_ID is required'),
  RAZORPAY_KEY_SECRET: z.string().min(1, 'RAZORPAY_KEY_SECRET is required'),
  RAZORPAY_PLAN_ID: z.string().min(1, 'RAZORPAY_PLAN_ID is required'),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1, 'RAZORPAY_WEBHOOK_SECRET is required'),

  FRONTEND_URL: z.string().default('http://localhost:3000'),

  // T-436 (c): the email queue (@lawie/email-client reads process.env.REDIS_URL
  // itself). Optional: with it unset, invoice emails are not queued (a warning
  // is logged), `emailQueuedAt` stays null and the invoice sweep retries later.
  REDIS_URL: z.string().default(''),

  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  SENTRY_DSN: z.string().default(''),

  // T-436: GST tax invoice seller details, set by the founder per environment.
  // Never hard-coded. Empty defaults keep billing bootable without them; the
  // invoice service refuses to issue (and the sweep retries) while any is empty.
  GST_GSTIN: z.string().default(''),
  GST_LEGAL_NAME: z.string().default(''),
  GST_TRADE_NAME: z.string().default(''),
  GST_ADDRESS: z.string().default(''),
  GST_STATE_CODE: z.string().default(''),
  // ISO date (YYYY-MM-DD, read as midnight IST) or ISO date-time: the GST
  // registration's effective date. Payments before it get no invoice.
  GST_EFFECTIVE_FROM: z.string().default(''),
  // Optional path to a scanned signature image for the invoice PDF.
  GST_SIGNATURE_PATH: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    console.error(`\n❌ Billing Service — invalid env:\n${issues}\n`);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();

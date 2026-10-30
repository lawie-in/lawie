import { z } from 'zod';

/**
 * T-527 (AC5, Arjun; round 4 ruling): which Razorpay key modes may boot in
 * which NODE_ENV. Pure, so it can be tested without a process exit. Messages
 * name the rule, never the key value.
 * - rzp_live_ outside production: always refused.
 * - rzp_live_ in production, or any key outside production (tests and dev may
 *   use dummy keys): ok.
 * - rzp_test_, or neither prefix, in production:
 *   - allowTestKeys (RAZORPAY_ALLOW_TEST_KEYS=true, e.g. the demo stack): ok,
 *     level 'warn' (logged at boot, no Sentry);
 *   - else strictGuard (RAZORPAY_KEY_GUARD=strict): refused;
 *   - else (the default; develop runs NODE_ENV=production with test keys): ok,
 *     level 'error' (one error log and one Sentry event at boot).
 */
export type RazorpayKeyMode =
  | { ok: true }
  | { ok: true; level: 'warn' | 'error'; message: string }
  | { ok: false; reason: string };

export function checkRazorpayKeyMode(
  nodeEnv: string,
  keyId: string,
  allowTestKeys: boolean,
  strictGuard = false,
): RazorpayKeyMode {
  const production = nodeEnv === 'production';
  if (keyId.startsWith('rzp_live_')) {
    if (production) return { ok: true };
    return { ok: false, reason: 'a live Razorpay key (rzp_live_) is refused outside production' };
  }
  if (!production) return { ok: true };
  const kind = keyId.startsWith('rzp_test_')
    ? 'a test Razorpay key (rzp_test_)'
    : 'a Razorpay key with neither rzp_live_ nor rzp_test_ prefix';
  if (allowTestKeys) {
    const message = `${kind} in production, allowed by RAZORPAY_ALLOW_TEST_KEYS=true`;
    return { ok: true, level: 'warn', message };
  }
  if (strictGuard) {
    return {
      ok: false,
      reason:
        `${kind} is refused in production (RAZORPAY_KEY_GUARD=strict)` +
        ' unless RAZORPAY_ALLOW_TEST_KEYS=true',
    };
  }
  return {
    ok: true,
    level: 'error',
    message: `${kind} in production; booting anyway (set RAZORPAY_KEY_GUARD=strict to refuse)`,
  };
}

const envObject = z.object({
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
  // T-436 (c): invoice / credit note emails are queued only when this is
  // "true" (and REDIS_URL is set). Default false until the email-worker can
  // render billing.taxInvoice / billing.creditNote: while false nothing is
  // queued, `emailQueuedAt` stays null, and the sweep sends the backlog once
  // it is switched on. Only the exact string "true" enables it.
  INVOICE_EMAIL_ENABLED: z
    .union([z.literal('true'), z.literal('false'), z.literal('')])
    .default('false')
    .transform((v) => v === 'true'),

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

  // T-527 (AC5): explicit opt-in to boot production with an rzp_test_ key
  // (see checkRazorpayKeyMode). Only the exact string "true" counts.
  // T-558 (Arjun): unset, empty or "true"; any other value fails loadEnv
  // (refuses to boot in every NODE_ENV).
  RAZORPAY_ALLOW_TEST_KEYS: z.enum(['true', '']).optional(),
  // T-527 round 4 (Arjun): "strict" makes a non-live key in production refuse
  // to boot (unless RAZORPAY_ALLOW_TEST_KEYS=true); unset or empty only logs an
  // error and a Sentry event. T-558 (Arjun): any other value fails loadEnv
  // (refuses to boot in every NODE_ENV).
  RAZORPAY_KEY_GUARD: z.enum(['strict', '']).optional(),

  // T-540: fallback for the AppSettings key `feature.coupon_free_grant`, used
  // only when the key is missing (the database value always wins; a DB error is
  // always off). Default off; only the exact string "true" turns it on.
  FEATURE_DEFAULT_COUPON_FREE_GRANT: z.string().optional(),

  // T-646 (Arjun ruling 4; AJ-646-M6): where the "new payment concern" notice goes.
  // One address (contact@lawie.in) unless the founder sets another. Blank counts as unset.
  SUPPORT_NOTIFY_EMAIL: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().email('SUPPORT_NOTIFY_EMAIL must be an email address').default('contact@lawie.in'),
  ),
});

// T-527 (AC5): a refused key mode fails the parse, so it goes through loadEnv's
// exit(1) like any other invalid env.
const envSchema = envObject.superRefine((v, ctx) => {
  const mode = checkRazorpayKeyMode(
    v.NODE_ENV,
    v.RAZORPAY_KEY_ID,
    v.RAZORPAY_ALLOW_TEST_KEYS === 'true',
    v.RAZORPAY_KEY_GUARD === 'strict',
  );
  if (!mode.ok) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['RAZORPAY_KEY_ID'], message: mode.reason });
  }
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

/**
 * T-527 (AC5, round 4): the boot notice for a key mode that boots but is not
 * clean (level 'warn' or 'error', see checkRazorpayKeyMode); undefined when
 * there is nothing to say. Logged (and, for 'error', sent to Sentry) by
 * config/razorpay.ts.
 */
export const razorpayKeyModeNotice: { level: 'warn' | 'error'; message: string } | undefined =
  (() => {
    const mode = checkRazorpayKeyMode(
      env.NODE_ENV,
      env.RAZORPAY_KEY_ID,
      env.RAZORPAY_ALLOW_TEST_KEYS === 'true',
      env.RAZORPAY_KEY_GUARD === 'strict',
    );
    return mode.ok && 'level' in mode ? { level: mode.level, message: mode.message } : undefined;
  })();

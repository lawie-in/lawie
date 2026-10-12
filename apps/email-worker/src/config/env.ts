/**
 * Worker env validation — HARD-FAIL on missing required keys (T-220 AC8).
 * Optional keys default to sensible Phase-1 values.
 *
 * On failure the process prints ONE line to stderr naming every missing or
 * invalid setting (names only, never a value) and exits 1, so a pm2 crash
 * loop shows the cause in `pm2 logs lawie-email-worker`.
 */
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(9100),

  // Connection
  REDIS_URL: z.string().min(1, 'REDIS_URL required for BullMQ'),

  // Provider
  EMAIL_PROVIDER: z.enum(['ses', 'smtp', 'dry-run']).default('ses'),
  EMAIL_DRY_RUN: z
    .union([z.literal('true'), z.literal('false'), z.literal('')])
    .default('false')
    .transform((v) => v === 'true'),

  // AWS SES (required when EMAIL_PROVIDER === 'ses' AND EMAIL_DRY_RUN is false —
  // enforced by validateEnv() below via REQUIRED_BY_PROVIDER).
  AWS_REGION: z.string().default('ap-south-1'),
  AWS_SES_ACCESS_KEY_ID: z.string().optional(),
  AWS_SES_SECRET_ACCESS_KEY: z.string().optional(),

  // SMTP (required when EMAIL_PROVIDER === 'smtp' AND EMAIL_DRY_RUN is false —
  // enforced by validateEnv() below via REQUIRED_BY_PROVIDER)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  // Sender identity — lawie.in domain is verified at the domain level in SES,
  // so any sub-address (noreply@, contact@, admin@, …) is auto-authorised.
  // Madhuri's brief specifies:
  //   FROM:     noreply@lawie.in  (advocates don't reply to this — bounces ok)
  //   REPLY_TO: contact@lawie.in  (real humans land here — must be a Google
  //                                Workspace alias on the founder's mailbox)
  EMAIL_FROM_NAME: z.string().default('Lawie'),
  EMAIL_FROM_ADDRESS: z.string().email().default('noreply@lawie.in'),
  EMAIL_REPLY_TO: z.string().email().default('contact@lawie.in'),
  EMAIL_FOUNDER: z.string().email().default('founder@lawie.in'),

  // Internal service trust
  INTERNAL_SECRET: z.string().min(16, 'INTERNAL_SECRET must be at least 16 chars'),

  // BullMQ
  EMAIL_QUEUE_PREFIX: z.string().default('lawie'),
  EMAIL_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),

  // Dev convenience — when set, every outgoing email is rewritten to this
  // address so testers don't spam real inboxes. Useful in staging too.
  EMAIL_DEV_REDIRECT_TO: z.string().email().optional(),

  // Observability
  SENTRY_DSN: z.string().default(''),
});

export type Env = z.infer<typeof schema>;
export type EmailProvider = Env['EMAIL_PROVIDER'];

/**
 * Settings each provider needs on top of the common ones (REDIS_URL,
 * INTERNAL_SECRET), when it actually sends. Dry-run (EMAIL_PROVIDER=dry-run
 * or EMAIL_DRY_RUN=true) needs nothing extra.
 */
export const REQUIRED_BY_PROVIDER: Record<EmailProvider, readonly string[]> = {
  ses: ['AWS_SES_ACCESS_KEY_ID', 'AWS_SES_SECRET_ACCESS_KEY'],
  smtp: ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'],
  'dry-run': [],
};

export type EnvValidation = { ok: true; env: Env } | { ok: false; message: string };

const isBlank = (v: string | undefined): boolean => v === undefined || v.trim() === '';

/** Reason for an invalid (present but unusable) setting. Never includes the value. */
function describeIssue(issue: z.ZodIssue): string {
  switch (issue.code) {
    case z.ZodIssueCode.too_small:
      return `must be at least ${String(issue.minimum)} chars`;
    case z.ZodIssueCode.invalid_enum_value:
      return `must be one of ${issue.options.join('|')}`;
    case z.ZodIssueCode.invalid_string:
      return issue.validation === 'email' ? 'must be an email address' : 'invalid format';
    case z.ZodIssueCode.invalid_union:
    case z.ZodIssueCode.invalid_literal:
      return 'invalid value';
    case z.ZodIssueCode.invalid_type:
      return `must be a ${issue.expected}`;
    default:
      return 'invalid value';
  }
}

/**
 * Pure validation — no exit, no output — so it can be unit-tested with any
 * env object. Returns the parsed env, or a single-line message that names the
 * missing/invalid settings without printing any value.
 */
export function validateEnv(source: NodeJS.ProcessEnv): EnvValidation {
  const parsed = schema.safeParse(source);
  const missing: string[] = [];
  const invalid: string[] = [];
  const addMissing = (name: string) => {
    if (!missing.includes(name)) missing.push(name);
  };

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const name = issue.path.join('.') || '(root)';
      if (isBlank(source[name])) addMissing(name);
      else if (!invalid.some((i) => i.startsWith(`${name} `))) {
        invalid.push(`${name} (${describeIssue(issue)})`);
      }
    }
  }

  // Provider-specific requirements. If the schema failed, fall back to the
  // individual fields so a bad REDIS_URL doesn't hide a missing SES key.
  const providerResult = parsed.success
    ? { success: true as const, data: parsed.data.EMAIL_PROVIDER }
    : schema.shape.EMAIL_PROVIDER.safeParse(source.EMAIL_PROVIDER);
  const dryRunResult = parsed.success
    ? { success: true as const, data: parsed.data.EMAIL_DRY_RUN }
    : schema.shape.EMAIL_DRY_RUN.safeParse(source.EMAIL_DRY_RUN);
  const provider = providerResult.success ? providerResult.data : undefined;
  const dryRun = dryRunResult.success ? dryRunResult.data : false;

  if (provider && !dryRun) {
    for (const name of REQUIRED_BY_PROVIDER[provider]) {
      if (isBlank(source[name])) addMissing(name);
    }
  }

  if (parsed.success && missing.length === 0) return { ok: true, env: parsed.data };

  const mode = provider ? `EMAIL_PROVIDER=${provider}${dryRun ? ', EMAIL_DRY_RUN=true' : ''}` : '';
  const parts: string[] = [];
  if (missing.length > 0) parts.push(`missing required setting(s): ${missing.join(', ')}`);
  if (invalid.length > 0) parts.push(`invalid setting(s): ${invalid.join(', ')}`);
  return {
    ok: false,
    message:
      `[email-worker] FATAL: cannot start${mode ? ` (${mode})` : ''}; ${parts.join('; ')}. ` +
      'Set them in the env file and restart. No email will be sent until this is fixed.',
  };
}

const result = validateEnv(process.env);

if (!result.ok) {
  // One line on stderr, names only. The logger is not usable yet (it reads env).
  console.error(result.message);
  process.exit(1);
}

export const env: Env = result.env;

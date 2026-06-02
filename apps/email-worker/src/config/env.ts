/**
 * Worker env validation — HARD-FAIL on missing required keys per ADR-007 §6.
 * Optional keys default to sensible Phase-1 values.
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
  // we don't enforce that here; the SES adapter throws if creds are missing).
  AWS_REGION: z.string().default('ap-south-1'),
  AWS_SES_ACCESS_KEY_ID: z.string().optional(),
  AWS_SES_SECRET_ACCESS_KEY: z.string().optional(),

  // SMTP (required when EMAIL_PROVIDER === 'smtp' AND EMAIL_DRY_RUN is false)
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

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Email Worker — invalid env:');
  for (const issue of parsed.error.issues) {
    console.error(`  • ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;

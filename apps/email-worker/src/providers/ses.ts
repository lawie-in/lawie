/**
 * AWS SES v2 adapter. One client per process. Stage A defaults to dry-run
 * mode (no live send) so the pipe can be exercised without provisioned SES
 * creds. Stage C wires real creds via .env.production / AWS Secrets Manager.
 *
 * Email content is multipart (HTML + text fallback). SES Configuration Set
 * (for bounce/complaint webhooks) is set when EMAIL_CONFIGURATION_SET is
 * exported — left out of env.ts for now since SCRUM-77 §7 (suppression list)
 * is Stage D work.
 */
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';

import { env } from '../config/env';
import { logger } from '../config/logger';

import { type EmailSendMeta, fromSesError, safeMeta, safeSendFields } from './safe-log';

export type { EmailSendMeta };

export interface RenderedEmail {
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  /** Override sender address; defaults to EMAIL_FROM_ADDRESS env var. */
  from?: string;
  subject: string;
  html: string;
  text: string;
  /** Non-PII context for logs (template id, user id, job id). Never sent. */
  meta?: EmailSendMeta;
}

let cachedClient: SESv2Client | null = null;

function getClient(): SESv2Client {
  if (cachedClient) return cachedClient;
  cachedClient = new SESv2Client({
    region: env.AWS_REGION,
    credentials:
      env.AWS_SES_ACCESS_KEY_ID && env.AWS_SES_SECRET_ACCESS_KEY
        ? {
            accessKeyId: env.AWS_SES_ACCESS_KEY_ID,
            secretAccessKey: env.AWS_SES_SECRET_ACCESS_KEY,
          }
        : undefined, // fall back to default chain (IAM role / shared creds)
  });
  return cachedClient;
}

export async function sendEmail(rendered: RenderedEmail): Promise<{ messageId: string | null }> {
  // EMAIL_DEV_REDIRECT_TO replaces all recipients with a single test address —
  // useful in dev/staging to avoid spamming real users while the pipe is
  // being tuned. Drops cc/bcc to make the redirect unambiguous.
  const to = env.EMAIL_DEV_REDIRECT_TO ? [env.EMAIL_DEV_REDIRECT_TO] : rendered.to;
  const cc = env.EMAIL_DEV_REDIRECT_TO ? undefined : rendered.cc;
  const bcc = env.EMAIL_DEV_REDIRECT_TO ? undefined : rendered.bcc;

  // Dry-run path — short-circuit before the SES client is touched. T-220
  // AC6: log only template id, user id and counts/flags; never an address,
  // the subject (it can carry a name) or any of the body. Check template
  // output with the template tests instead.
  if (env.EMAIL_DRY_RUN || env.EMAIL_PROVIDER === 'dry-run') {
    logger.info(
      {
        provider: 'dry-run',
        ...safeMeta(rendered.meta),
        ...safeSendFields({ ...rendered, to, cc, bcc }, Boolean(env.EMAIL_DEV_REDIRECT_TO)),
      },
      'Dry-run send — no SES call made',
    );
    return { messageId: null };
  }

  const cmd = new SendEmailCommand({
    FromEmailAddress: `${env.EMAIL_FROM_NAME} <${rendered.from ?? env.EMAIL_FROM_ADDRESS}>`,
    Destination: {
      ToAddresses: to,
      ...(cc && cc.length > 0 ? { CcAddresses: cc } : {}),
      ...(bcc && bcc.length > 0 ? { BccAddresses: bcc } : {}),
    },
    ReplyToAddresses: [rendered.replyTo ?? env.EMAIL_REPLY_TO],
    Content: {
      Simple: {
        Subject: { Data: rendered.subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: rendered.html, Charset: 'UTF-8' },
          Text: { Data: rendered.text, Charset: 'UTF-8' },
        },
      },
    },
  });

  let result;
  try {
    result = await getClient().send(cmd);
  } catch (err) {
    // SES messages can echo the rejected address (e.g. MessageRejected), so
    // only the error name, code and HTTP status leave this function.
    const safe = fromSesError(err);
    logger.warn(
      {
        provider: 'ses',
        ...safeMeta(rendered.meta),
        errorName: safe.errorName,
        code: safe.code,
        statusCode: safe.statusCode,
        fault: safe.fault,
      },
      'SES send failed',
    );
    throw safe;
  }
  return { messageId: result.MessageId ?? null };
}

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

export interface RenderedEmail {
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
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

  // Dry-run path — short-circuit before the SES client is touched. The
  // worker logs the rendered HTML so a developer can verify the template
  // without provisioning SES. Stage C flips EMAIL_DRY_RUN=false.
  if (env.EMAIL_DRY_RUN || env.EMAIL_PROVIDER === 'dry-run') {
    logger.info(
      {
        provider: 'dry-run',
        to,
        cc,
        bcc,
        subject: rendered.subject,
        htmlPreview: rendered.html.slice(0, 200),
      },
      'Dry-run send — no SMTP call made',
    );
    return { messageId: null };
  }

  const cmd = new SendEmailCommand({
    FromEmailAddress: `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM_ADDRESS}>`,
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

  const result = await getClient().send(cmd);
  return { messageId: result.MessageId ?? null };
}

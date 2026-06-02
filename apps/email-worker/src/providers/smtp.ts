import nodemailer from 'nodemailer';

import { env } from '../config/env';
import { logger } from '../config/logger';

import type { RenderedEmail } from './ses';

export type { RenderedEmail };

let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: false, // STARTTLS on 587
    requireTLS: true,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });
  return cachedTransporter;
}

export async function sendEmail(rendered: RenderedEmail): Promise<{ messageId: string | null }> {
  const to = env.EMAIL_DEV_REDIRECT_TO ? [env.EMAIL_DEV_REDIRECT_TO] : rendered.to;
  const cc = env.EMAIL_DEV_REDIRECT_TO ? undefined : rendered.cc;
  const bcc = env.EMAIL_DEV_REDIRECT_TO ? undefined : rendered.bcc;

  if (env.EMAIL_DRY_RUN) {
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

  const result = await getTransporter().sendMail({
    from: `${env.EMAIL_FROM_NAME} <${rendered.from ?? env.EMAIL_FROM_ADDRESS}>`,
    to,
    ...(cc && cc.length > 0 ? { cc } : {}),
    ...(bcc && bcc.length > 0 ? { bcc } : {}),
    replyTo: rendered.replyTo ?? env.EMAIL_REPLY_TO,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  return { messageId: result.messageId ?? null };
}

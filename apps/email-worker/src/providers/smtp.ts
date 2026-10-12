import nodemailer from 'nodemailer';

import { env } from '../config/env';
import { logger } from '../config/logger';

import { fromSmtpError, safeMeta, safeSendFields } from './safe-log';
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
    // T-220 AC6: template id, user id, counts and flags only.
    logger.info(
      {
        provider: 'dry-run',
        ...safeMeta(rendered.meta),
        ...safeSendFields({ ...rendered, to, cc, bcc }, Boolean(env.EMAIL_DEV_REDIRECT_TO)),
      },
      'Dry-run send — no SMTP call made',
    );
    return { messageId: null };
  }

  let result;
  try {
    result = await getTransporter().sendMail({
      from: `${env.EMAIL_FROM_NAME} <${rendered.from ?? env.EMAIL_FROM_ADDRESS}>`,
      to,
      ...(cc && cc.length > 0 ? { cc } : {}),
      ...(bcc && bcc.length > 0 ? { bcc } : {}),
      replyTo: rendered.replyTo ?? env.EMAIL_REPLY_TO,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
  } catch (err) {
    // nodemailer's message / `response` echo the rejected address
    // (e.g. "550 5.1.1 <x@y>: Recipient address rejected"). Name, code and
    // SMTP status only.
    const safe = fromSmtpError(err);
    logger.warn(
      {
        provider: 'smtp',
        ...safeMeta(rendered.meta),
        errorName: safe.errorName,
        code: safe.code,
        statusCode: safe.statusCode,
      },
      'SMTP send failed',
    );
    throw safe;
  }

  return { messageId: result.messageId ?? null };
}

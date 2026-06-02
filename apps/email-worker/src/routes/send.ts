import { type EmailTemplate } from '@lawie/email-client';
import { INTERNAL_HEADERS } from '@lawie/shared';
import { type Request, type Response } from 'express';
import { z } from 'zod';

import { env } from '../config/env';
import { logger } from '../config/logger';
import { sendEmail } from '../providers';
import { renderTemplate } from '../templates';

const bodySchema = z.object({
  template: z.string() as z.ZodType<EmailTemplate>,
  to: z.union([z.string().email(), z.array(z.string().email()).min(1)]),
  from: z.string().email().optional(),
  data: z.record(z.unknown()).default({}),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  replyTo: z.string().email().optional(),
});

export async function sendHandler(req: Request, res: Response): Promise<void> {
  const secret = req.headers[INTERNAL_HEADERS.SECRET] as string | undefined;
  if (!secret || secret !== env.INTERNAL_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }

  const { template, to, from, data, cc, bcc, replyTo } = parsed.data;
  const toArray = Array.isArray(to) ? to : [to];

  try {
    const rendered = await renderTemplate(template, data);
    const result = await sendEmail({
      to: toArray,
      from,
      cc,
      bcc,
      replyTo,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    logger.info(
      { template, to: toArray, from, messageId: result.messageId },
      'Email sent via /send',
    );
    res.status(202).json({ messageId: result.messageId });
  } catch (err) {
    logger.error({ err, template, to: toArray }, 'Email send failed via /send');
    res.status(500).json({ error: 'Failed to send email' });
  }
}

import { type EmailTemplate } from '@lawie/email-client';
import { INTERNAL_HEADERS } from '@lawie/shared';
import { type Request, type Response } from 'express';
import { z } from 'zod';

import { env } from '../config/env';
import { logger } from '../config/logger';
import { isLiveSend, templateHasUnfilledFooter } from '../placeholders';
import { sendEmail } from '../providers';
import { safeErrorFields, userIdFromData } from '../providers/safe-log';
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
  const userId = userIdFromData(data);

  try {
    // T-223 review, T-379: no live send while the template's own footer still has
    // [registered address] or [PIN]. Static check, before rendering, never on user data.
    if (isLiveSend() && templateHasUnfilledFooter(template)) {
      logger.error({ template, userId }, 'Email not sent via /send: unfilled footer placeholders');
      res.status(422).json({ error: 'unfilled_placeholders' });
      return;
    }
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
      meta: { template, userId },
    });

    // T-220 AC6: template id, user id and counts only — never an address.
    logger.info(
      { template, userId, recipientsCount: toArray.length, messageId: result.messageId },
      'Email sent via /send',
    );
    res.status(202).json({ messageId: result.messageId });
  } catch (err) {
    logger.error(
      { template, userId, recipientsCount: toArray.length, err: safeErrorFields(err) },
      'Email send failed via /send',
    );
    res.status(500).json({ error: 'Failed to send email' });
  }
}

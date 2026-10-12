import { env } from '../config/env';

import { sendEmail as sesSend, type RenderedEmail } from './ses';
import { sendEmail as smtpSend } from './smtp';

export type { RenderedEmail, EmailSendMeta } from './ses';
export { EmailSendError } from './safe-log';

/** Provider send signature — the seam the worker processor takes (see worker.ts). */
export type SendEmailFn = (rendered: RenderedEmail) => Promise<{ messageId: string | null }>;

export function sendEmail(rendered: RenderedEmail): Promise<{ messageId: string | null }> {
  if (env.EMAIL_PROVIDER === 'smtp') return smtpSend(rendered);
  return sesSend(rendered); // handles 'ses' and 'dry-run' modes
}

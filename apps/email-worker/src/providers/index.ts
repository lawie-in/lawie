import { env } from '../config/env';

import { sendEmail as sesSend } from './ses';
import { sendEmail as smtpSend } from './smtp';

export type { RenderedEmail } from './ses';

export function sendEmail(
  rendered: import('./ses').RenderedEmail,
): Promise<{ messageId: string | null }> {
  if (env.EMAIL_PROVIDER === 'smtp') return smtpSend(rendered);
  return sesSend(rendered); // handles 'ses' and 'dry-run' modes
}

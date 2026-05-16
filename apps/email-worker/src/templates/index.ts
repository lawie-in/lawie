/**
 * Template registry — maps EmailTemplate id → { subject(data), Body(data) }.
 *
 * Stage A ships only the `auth.welcome` stub so the pipe can be tested
 * end-to-end. Madhuri authors the remaining 8 contents in email-templates.md
 * and they get folded into this directory one file each:
 *   templates/auth/welcome.tsx
 *   templates/billing/subscriptionConfirmed.tsx
 *   templates/billing/paymentFailed.tsx
 *   templates/billing/monthlyInvoice.tsx
 *   templates/billing/lowCreditWarning.tsx
 *   templates/drafting/draftComplete.tsx
 *   templates/admin/referralIssued.tsx
 *   templates/admin/advocatePackInvite.tsx
 *   templates/admin/founderDailyDigest.tsx
 *
 * The render() helper resolves the template id, invokes Body(data) to
 * produce a React tree, runs @react-email/render to HTML + text. Any
 * missing template throws — the worker turns that into a job failure.
 */
import type { EmailTemplate } from '@lawie/email-client';
import { render } from '@react-email/render';
import type { ReactElement } from 'react';

import { authWelcomeTemplate } from './auth/welcome';

export interface TemplateDef<Data = Record<string, unknown>> {
  subject: (data: Data) => string;
  Body: (data: Data) => ReactElement;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REGISTRY: Partial<Record<EmailTemplate, TemplateDef<any>>> = {
  'auth.welcome': authWelcomeTemplate,
  // Madhuri's 8 templates land here as they ship.
};

export interface Rendered {
  subject: string;
  html: string;
  text: string;
}

export async function renderTemplate(
  templateId: EmailTemplate,
  data: Record<string, unknown>,
): Promise<Rendered> {
  const def = REGISTRY[templateId];
  if (!def) {
    throw new Error(
      `Template "${templateId}" is not registered. Available: ${Object.keys(REGISTRY).join(', ')}`,
    );
  }
  const element = def.Body(data);
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return {
    subject: def.subject(data),
    html,
    text,
  };
}

export function listTemplates(): EmailTemplate[] {
  return Object.keys(REGISTRY) as EmailTemplate[];
}

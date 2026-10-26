/**
 * T-223 review (Ajay, T-225 AC1c): no email is sent while a template footer carries an
 * unfilled placeholder. T-436 filled the auth.verifyEmail footer (Ranchi, Jharkhand; Addendum 4
 * point 3), so today nothing is refused; the guard stays to catch a placeholder that comes back
 * or a new template that ships with one. Dry run (EMAIL_DRY_RUN=true or EMAIL_PROVIDER=dry-run)
 * is unaffected: it sends nothing.
 *
 * T-379: the check is STATIC. It looks at each template's own footer strings, never at the
 * rendered email, so user data that happens to contain "[PIN]" (a name, say) is not refused.
 * Because it needs no job data, the worker runs it before minting a verify link (a refused job
 * never rotates the user's token), startWorkers() runs it once at boot, and /health reports it.
 *
 * Kept out of templates/index.ts so rendering stays free of env (template tests render without
 * a worker env).
 */
import type { EmailTemplate } from '@lawie/email-client';

import { env } from './config/env';
import { PASSWORD_RESET_STRINGS } from './templates/auth/passwordReset';
import { SIGNUP_ATTEMPT_STRINGS } from './templates/auth/signupAttempt';
import {
  UNVERIFIED_DELETION_NOTICE_B_STRINGS,
  UNVERIFIED_DELETION_NOTICE_STRINGS,
} from './templates/auth/unverifiedDeletionNotice';
import { VERIFY_EMAIL_STRINGS } from './templates/auth/verifyEmail';
import { WELCOME_STRINGS } from './templates/auth/welcome';
import { CREDIT_NOTE_STRINGS } from './templates/billing/creditNote';
import { TAX_INVOICE_STRINGS } from './templates/billing/taxInvoice';

export const UNFILLED_PLACEHOLDERS = ['[registered address]', '[PIN]'] as const;

/** The footer lines (`footer1`, `footer2`, ...) of a template's signed strings. */
function footerLines(strings: Record<string, string>): readonly string[] {
  return Object.entries(strings)
    .filter(([key]) => /^footer\d+$/.test(key))
    .map(([, value]) => value);
}

/**
 * Each template's static footer. A template with no footer has no entry. Add a template here
 * when it has a footer, so a placeholder in it is caught.
 */
const TEMPLATE_FOOTERS: Partial<Record<EmailTemplate, readonly string[]>> = {
  'auth.verifyEmail': footerLines(VERIFY_EMAIL_STRINGS),
  // T-221: Ajay's signed Ranchi footer (T-221-forgot-password-signed.md condition 1), shared by
  // both variants. Listed so a placeholder that comes back blocks live sends.
  'auth.passwordReset': footerLines(PASSWORD_RESET_STRINGS),
  // T-358: signed with the Ranchi footer (no placeholders), listed so the guard keeps checking it.
  // Both variants (A with a link, B without) are checked.
  'auth.unverifiedDeletionNotice': [
    ...footerLines(UNVERIFIED_DELETION_NOTICE_STRINGS),
    ...footerLines(UNVERIFIED_DELETION_NOTICE_B_STRINGS),
  ],
  // T-522: signed footer lines reused from the verify and reset mails (no placeholders).
  'auth.signupAttempt': footerLines(SIGNUP_ATTEMPT_STRINGS),
  // T-587 (AJ-587-M1, review item 25): the reset-mail footer set (no placeholders).
  'auth.welcome': footerLines(WELCOME_STRINGS),
  // T-436 (b/c): Ajay Addendum 5 #1, the Ranchi footer (no placeholders).
  'billing.taxInvoice': footerLines(TAX_INVOICE_STRINGS),
  // Addendum 9 #5 (footer line 2); lines 1, 3 and 4 as in the invoice email.
  'billing.creditNote': footerLines(CREDIT_NOTE_STRINGS),
};

/** True when the template's own footer still has [registered address] or [PIN]. */
export function templateHasUnfilledFooter(templateId: EmailTemplate): boolean {
  const lines = TEMPLATE_FOOTERS[templateId] ?? [];
  return lines.some((line) => UNFILLED_PLACEHOLDERS.some((p) => line.includes(p)));
}

/** True when any template's footer still has an unfilled placeholder. */
export function anyTemplateUnfilled(): boolean {
  return (Object.keys(TEMPLATE_FOOTERS) as EmailTemplate[]).some(templateHasUnfilledFooter);
}

/**
 * T-221 (Ajay, T-221-forgot-password-signed.md condition 1): auth.passwordReset's footer carries
 * the supplier's registered address, read from the environment at send time and never written
 * in copy. Arjun: reuse GST_ADDRESS, the seller address billing already prints on tax invoices
 * (apps/billing/src/config/gst.ts SELLER_KEYS). The two services are coupled on this name: if
 * billing renames it, rename it here too. Read from process.env directly (not config/env.ts) so
 * a worker without it still boots and sends every other email. Unset or blank → undefined;
 * whitespace runs are collapsed.
 *
 * This is a passwordReset-only guard, enforced in the worker before the mint. It is deliberately
 * NOT part of TEMPLATE_FOOTERS / UNFILLED_PLACEHOLDERS: anyTemplateUnfilled() gates boot and
 * /health, and would hold the verify and invoice emails too.
 */
export const SUPPLIER_ADDRESS_ENV = 'GST_ADDRESS';

export function supplierStreetAddress(): string | undefined {
  const raw = process.env[SUPPLIER_ADDRESS_ENV];
  if (typeof raw !== 'string') return undefined;
  const value = raw.replace(/\s+/g, ' ').trim();
  return value.length > 0 ? value : undefined;
}

/** True when a send would reach a real provider (not dry run). */
export function isLiveSend(): boolean {
  return !(env.EMAIL_DRY_RUN || env.EMAIL_PROVIDER === 'dry-run');
}

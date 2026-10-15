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
import { VERIFY_EMAIL_STRINGS } from './templates/auth/verifyEmail';

export const UNFILLED_PLACEHOLDERS = ['[registered address]', '[PIN]'] as const;

/** The footer lines (`footer1`, `footer2`, ...) of a template's signed strings. */
function footerLines(strings: Record<string, string>): readonly string[] {
  return Object.entries(strings)
    .filter(([key]) => /^footer\d+$/.test(key))
    .map(([, value]) => value);
}

/**
 * Each template's static footer. A template with no footer (auth.welcome) has no entry. Add a
 * template here when it has a footer, so a placeholder in it is caught.
 */
const TEMPLATE_FOOTERS: Partial<Record<EmailTemplate, readonly string[]>> = {
  'auth.verifyEmail': footerLines(VERIFY_EMAIL_STRINGS),
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

/** True when a send would reach a real provider (not dry run). */
export function isLiveSend(): boolean {
  return !(env.EMAIL_DRY_RUN || env.EMAIL_PROVIDER === 'dry-run');
}

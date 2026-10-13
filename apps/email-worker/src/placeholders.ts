/**
 * T-223 review (Ajay, T-225 AC1c): the footer placeholders are the founder's to fill, and no
 * email is sent until they are. Checked on every live send path (queue worker and /send), for
 * every template. Dry run (EMAIL_DRY_RUN=true or EMAIL_PROVIDER=dry-run) is unaffected: it sends
 * nothing and is how the copy is checked before the founder fills it.
 *
 * Kept out of templates/index.ts so rendering stays free of env (template tests render without
 * a worker env).
 */
import { env } from './config/env';

export const UNFILLED_PLACEHOLDERS = ['[registered address]', '[PIN]'] as const;

export function hasUnfilledPlaceholder(rendered: { html: string; text: string }): boolean {
  return UNFILLED_PLACEHOLDERS.some((p) => rendered.html.includes(p) || rendered.text.includes(p));
}

/** True when a send would reach a real provider (not dry run). */
export function isLiveSend(): boolean {
  return !(env.EMAIL_DRY_RUN || env.EMAIL_PROVIDER === 'dry-run');
}

import { getTemplateRegistry } from '../services/template-promoter';
import type { PromotedTemplateConfig } from '../services/template-promoter';

/**
 * T-365 AC6: the one line a template card, the brief picker and "Browse
 * document types" may show for a pack.
 *
 * Returns the pack's signed `card_description` (Ajay,
 * handoff/legal/T-365-card-descriptions-signed.md) from the doc-rules registry.
 * Returns '' when the pack has none, and the card then shows no description
 * line. It never falls back to `description` or `_meta.description` (internal
 * notes, unsigned), and it ignores the docs/templates overrides, which only
 * replace the internal `description`.
 *
 * `presentDescription` is not used for cards; it stays for the intake match
 * prompt only.
 */
export function cardDescriptionFor(templateId: string): string {
  if (typeof templateId !== 'string' || templateId.length === 0) return '';
  const config = getTemplateRegistry().configs.get(templateId) as
    | PromotedTemplateConfig
    | undefined;
  const line = config?.card_description;
  return typeof line === 'string' ? line : '';
}

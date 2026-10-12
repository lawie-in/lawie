/**
 * Legacy docTypes that are another name for a rule file (T-227, Vikram
 * 12 Oct 2026; one map since T-240 AC5). The ONLY copy: credits.service
 * prices an alias at its target's price, and prompt-assembler resolves an
 * alias to its target's rule file. An alias has no price of its own.
 */
export const DOC_TYPE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  bail_application: 'bail_regular',
  complaint: 'consumer_complaint',
  legal_notice: 'legal_notice_s80',
});

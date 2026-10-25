/**
 * T-147c: a draft written from the fact ledger marks a missing fact as
 * `{{MISSING: label}}`. Wherever a draft leaves the app (PDF export, the
 * public review link) it prints as today's blank, `[To be confirmed: label]`.
 * Text substitution only; the web DOCX and PDF exports do the same in
 * `apps/web/src/components/editor/exportUtils.ts`.
 * T-273: any case (`{{missing: x}}` too), as the web export and the shared
 * blank marker read it, so the server PDF and the counts agree.
 */
export const MISSING_TOKEN = /\{\{\s*MISSING\s*:\s*([^}]*?)\s*\}\}/gi;

export function missingAsBlanks(text: string): string {
  return text.replace(MISSING_TOKEN, '[To be confirmed: $1]');
}

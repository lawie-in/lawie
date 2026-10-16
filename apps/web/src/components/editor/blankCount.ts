/**
 * T-483: the blank count of a draft, apart from the export code (no docx, no
 * file-saver), so the intake result page can count blanks exactly as the
 * export warning does without loading the export. Moved from exportUtils.ts,
 * which re-exports these; Ajay's blank set itself is in @lawie/shared.
 */
import { blankText, findBlanks, type Blank, type FindBlanks } from '@lawie/shared';

/**
 * T-147c: a draft written from the fact ledger marks a missing fact as
 * `{{MISSING: label}}`. In an export it prints as today's blank,
 * `[To be confirmed: label]`, as the server PDF does. Text substitution only.
 * Any case, as the shared blank marker (Ajay's T-194 follow-up).
 */
export function missingAsBlanks(text: string): string {
  return text.replace(/\{\{\s*MISSING\s*:\s*([^}]*?)\s*\}\}/gi, '[To be confirmed: $1]');
}

// T-274 review: CRLF/CR line ends become LF on the raw content, before
// missingAsBlanks and markBlanks, in the count (blanksInContent) and in both
// exports alike, so a blank whose label spans a line end is found and marked the
// same as with LF, and the warning's count equals the header's N. In HTML a CR
// is whitespace the parser already folds into LF, so this changes nothing there.
export function normaliseLineEnds(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/**
 * The blanks of a saved draft, as the export prints it (after `missingAsBlanks`).
 * T-194: the warning's count and list, the header's N and the highlighting all
 * come from this one call over the same content.
 */
export function blanksInContent(content: string, find: FindBlanks = findBlanks): Blank[] {
  return find(blankText(missingAsBlanks(normaliseLineEnds(content))));
}

/**
 * T-499 (Ajay acbec79f, re-stated 088fc4f7): every `{{MISSING: …}}` marker
 * becomes `[To be confirmed: …]` before the user sees the draft, in every part
 * (body, prayer, title, verification). Applied once per generation path, to
 * the parts as they are assembled in ai.service.ts, so the streamed
 * `template_sections`, the saved `fullText` and everything read from them
 * (editor, result page, export, blank count) carry the same blank.
 *
 * The substitution is T-147c's `missingAsBlanks` (utils/missingAsBlanks.ts),
 * the same one the PDF export and the review link already use.
 */
import { MISSING_TOKEN, missingAsBlanks } from '../utils/missingAsBlanks';

/** The number of `{{MISSING: …}}` markers in a text (any case, as `MISSING_TOKEN` reads them). */
export function countMissingMarkers(text: string): number {
  return (text.match(new RegExp(MISSING_TOKEN.source, MISSING_TOKEN.flags)) ?? []).length;
}

/**
 * Converts the markers of every part in place and returns how many there were,
 * counted before the conversion (T-147d's placeholder rate reads that count).
 */
export function convertMissingMarkers<T extends { content: string }>(sections: T[]): number {
  let count = 0;
  sections.forEach((s, i) => {
    if (typeof s.content !== 'string' || s.content === '') return;
    const n = countMissingMarkers(s.content);
    if (n === 0) return;
    count += n;
    // A new object per converted part: a part object is never changed in place.
    sections[i] = { ...s, content: missingAsBlanks(s.content) };
  });
  return count;
}

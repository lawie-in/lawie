/**
 * Case numbers (T-147a criterion 5). `value` is a comparison key: Devanagari
 * digits read as Arabic, upper case, each run of punctuation or space read as
 * one space, so `Cr. Case No. १२३/२०२६` and `CR CASE NO 123/2026` compare
 * equal while `12/32026` and `123/2026` do not. `display` is the input as
 * written; the number is never corrected.
 */
import { asText, compareWith, devanagariToArabic, Normalized, Comparison, unresolved } from './common';

export function normalizeCaseNumber(input: unknown): Normalized<string> {
  const t = asText(input);
  if (!t.ok) return t;
  const ws = devanagariToArabic(t.text)
    .normalize('NFKC')
    .toUpperCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((w) => w !== '');
  if (ws.length === 0) return unresolved('empty', 'There are no letters or digits in the case number.');
  if (!ws.some((w) => /\d/.test(w))) return unresolved('unrecognised', 'The case number has no digits.');
  return { ok: true, value: ws.join(' '), display: t.text };
}

export function compareCaseNumbers(a: unknown, b: unknown): Comparison {
  return compareWith(normalizeCaseNumber, (v) => v, a, b);
}

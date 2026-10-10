/**
 * Shared pieces of the Fact Ledger normalizer (T-147a). Pure: no I/O, no
 * clock, no throw.
 */
import type { UnresolvedReason } from '../../types/fact-ledger';

/** A value normalised, or the reason it could not be without guessing. */
export type Normalized<T> =
  | { ok: true; value: T; display: string }
  | { ok: false; reason: UnresolvedReason; detail: string };

/** The outcome of comparing two raw values of one fact type. */
export type Comparison =
  | { ok: true; equal: boolean }
  | { ok: false; reason: UnresolvedReason; detail: string; side: 'a' | 'b' };

export function unresolved<T>(reason: UnresolvedReason, detail: string): Normalized<T> {
  return { ok: false, reason, detail };
}

/** Devanagari digits ०-९ become 0-9, wherever they appear. Everything else is left alone. */
export function devanagariToArabic(text: string): string {
  return text.replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966));
}

/**
 * Reads a raw input as text, or says why it cannot. Total: any JS value is
 * accepted, so a junk call from untyped code still gets a reason back.
 */
export function asText(input: unknown): { ok: true; text: string } | { ok: false; reason: UnresolvedReason; detail: string } {
  if (typeof input !== 'string') return { ok: false, reason: 'not_a_string', detail: 'The value is not text.' };
  if (input.trim() === '') return { ok: false, reason: 'empty', detail: 'The value is empty.' };
  return { ok: true, text: input };
}

/** Compares two raw values through a normalizer and a key. Never throws. */
export function compareWith<T>(
  normalize: (input: unknown) => Normalized<T>,
  key: (value: T) => string,
  a: unknown,
  b: unknown,
): Comparison {
  const na = normalize(a);
  if (!na.ok) return { ok: false, reason: na.reason, detail: na.detail, side: 'a' };
  const nb = normalize(b);
  if (!nb.ok) return { ok: false, reason: nb.reason, detail: nb.detail, side: 'b' };
  return { ok: true, equal: key(na.value) === key(nb.value) };
}

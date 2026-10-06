/**
 * Text helpers for intake: no I/O, no model, no database.
 *
 * Moved out of intake.service.ts in T-105 so that the brief (intake-brief.ts)
 * can use them without loading the service. intake.service.ts re-exports
 * `normalise`, `datesInText` and `parseModelJson`.
 */
import dateMeanings from '../config/intake/date-meanings.json';

// ── Text matching helpers ───────────────────────────────────────────────────

export function normalise(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function digitsOnly(s: string): string {
  return s.replace(/[^0-9.]/g, '');
}

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

/** Hindi month names, from Ajay's list in `config/intake/date-meanings.json`. */
const HINDI_MONTHS: Record<string, number> = Object.fromEntries(
  Object.entries(dateMeanings.hindi_months).map(([name, n]) => [name.normalize('NFC'), n]),
);

export function iso(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return dt.toISOString().slice(0, 10);
}

/**
 * Dates a piece of text states, read by code (not by the model), in the
 * formats Indian users write: 15/03/2026, 15-03-2026, 15.03.2026 (day first),
 * 2026-03-15, 15 March 2026, 15th March, 2026, March 15, 2026.
 */
export function datesInText(text: string): string[] {
  return [...new Set(datesAsWritten(text).map((d) => d.value))];
}

/**
 * The same dates, each with the words it was written in ("12th Sept 2026"),
 * so a date can be shown back to the user as they wrote it. One entry for
 * each date, the first place it is written.
 */
export function datesAsWritten(text: string): Array<{ value: string; words: string }> {
  const found: Array<{ value: string; at: number; length: number }> = [];
  const add = (value: string | null, m: RegExpMatchArray): void => {
    if (value) found.push({ value, at: m.index ?? 0, length: m[0].length });
  };
  // Devanagari digits are read as the digits they are.
  const t = text.toLowerCase().replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966));
  for (const m of t.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) {
    add(iso(+m[1], +m[2], +m[3]), m);
  }
  for (const m of t.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/g)) {
    add(iso(+m[3], +m[2], +m[1]), m);
  }
  for (const m of t.matchAll(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]{3,9})[,]?\s+(\d{4})\b/g,
  )) {
    const mon = MONTHS[m[2]];
    if (mon) add(iso(+m[3], mon, +m[1]), m);
  }
  for (const m of t.matchAll(/\b([a-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{4})\b/g)) {
    const mon = MONTHS[m[1]];
    if (mon) add(iso(+m[3], mon, +m[2]), m);
  }
  // Hindi month names (T-127, section 6.6): 15 मार्च 2026. `\b` does not see
  // Devanagari letters as word characters, so digits are bounded by lookarounds.
  for (const m of t.matchAll(/(?<![0-9])(\d{1,2})\s+([\u0900-\u097F]+)[,]?\s+(\d{4})(?![0-9])/g)) {
    const mon = HINDI_MONTHS[m[2].normalize('NFC')];
    if (mon) add(iso(+m[3], mon, +m[1]), m);
  }
  // Lower-casing keeps the length for the text users write here. If it ever
  // does not, the words are taken from the lower-cased text.
  const source = t.length === text.length ? text : t;
  const out = new Map<string, string>();
  for (const f of found.sort((a, b) => a.at - b.at)) {
    if (!out.has(f.value)) out.set(f.value, source.slice(f.at, f.at + f.length));
  }
  return [...out.entries()].map(([value, words]) => ({ value, words }));
}

/** True when `value` (allowing "…" / "..." cuts) is the user's own words, in order. */
export function isOwnWords(value: string, normDescription: string): boolean {
  const parts = normalise(value)
    .split(/\s*(?:…|\.\.\.)\s*/)
    .filter((p) => p.length > 0);
  if (parts.length === 0) return false;
  let from = 0;
  for (const p of parts) {
    const at = normDescription.indexOf(p, from);
    if (at < 0) return false;
    from = at + p.length;
  }
  return true;
}

// ── JSON from the model ─────────────────────────────────────────────────────

export function parseModelJson(text: string): Record<string, unknown> | null {
  const stripped = text.replace(/```(?:json)?/gi, '');
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(stripped.slice(start, end + 1));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

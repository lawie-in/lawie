/**
 * T-477: the `related_acts` strings of a promoted template.
 *
 * The promoted (template-engine) path used to keep only each entry's act name,
 * so the model printed section numbers from memory. Each string now carries the
 * pack's own references. buildAISystemPrompt joins the entries with ', ', and
 * ai.service's NI Act filter matches the act name anywhere in the string, so
 * the act name stays first and no description text goes in.
 *
 * Each formatting choice sits in one small function or const below so a ruling
 * from Ajay or Arjun changes one place.
 */

import { readActList, type RulePackAct } from './rule-pack.service';

/** The prefix a bare section number gets (Ajay f9415fe8). */
const SECTION_PREFIX = 'S.';

/**
 * Point 1 (Ajay f9415fe8): how one reference is printed. The pack's own text,
 * verbatim ("Order XIX Rule 3", "Article 226", "S.151"), except that a ref
 * starting with a digit is a section and gets "S." ("138" -> "S.138",
 * "13(1)(i)" -> "S.13(1)(i)").
 */
function formatRef(number: string): string {
  return /^\d/.test(number) ? `${SECTION_PREFIX}${number}` : number;
}

/**
 * Point 2 (Arjun): the separator between references inside one entry. "; "
 * keeps it apart from the ', ' between entries and from commas in act names
 * ("Code of Civil Procedure, 1908").
 */
const REF_SEPARATOR = '; ';

/** How the reference list attaches to the act name. */
function withRefs(act: string, refs: string[]): string {
  return `${act} (${refs.join(REF_SEPARATOR)})`;
}

/** Point 3 (Ajay): the condition on an entry that only applies sometimes. */
function withCondition(text: string, appliesWhen: string | null): string {
  return appliesWhen ? `${text} [only when: ${appliesWhen}]` : text;
}

/**
 * A pack "reference" that names no provision at all: empty, or only dashes
 * ("—", "-", "–"). Dropped, so the entry falls back to the bare act name.
 */
function isPlaceholderRef(ref: string): boolean {
  return /^[\s\-–—]*$/.test(ref);
}

/** The pack's references for one entry, formatted, duplicates dropped, order kept. */
function refsOf(entry: RulePackAct): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of entry.sections) {
    const ref = formatRef(s.number);
    if (!isPlaceholderRef(ref) && !seen.has(ref)) {
      seen.add(ref);
      out.push(ref);
    }
  }
  return out;
}

/** One `related_acts` string. An entry with no references is the bare act name. */
export function renderRelatedAct(entry: RulePackAct): string {
  const refs = refsOf(entry);
  const text = refs.length > 0 ? withRefs(entry.act, refs) : entry.act;
  return withCondition(text, entry.appliesWhen);
}

/**
 * Ajay b101b4eb: a pack's `applicableWhen` is a key, never model text. Each key
 * maps to the plain words printed in the "[only when: ...]" marker. A key not
 * in this table never prints raw (see resolveApplicableWhen).
 */
export const APPLICABLE_WHEN_WORDS: Readonly<Record<string, string>> = Object.freeze({
  dv_dowry: 'the offence arises from domestic violence or a dowry demand',
});

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Swaps an entry's `applicableWhen` key for its plain words (as `applies_when`).
 * Plain-words `applies_when` on the same entry wins, as readActList reads it. A
 * key missing from APPLICABLE_WHEN_WORDS is dropped (no marker) and reported in
 * `notes`.
 */
function resolveApplicableWhen(item: unknown, where: string, notes: string[]): unknown {
  if (!isObj(item) || !('applicableWhen' in item)) return item;
  const { applicableWhen, ...rest } = item;
  if (typeof rest.applies_when === 'string' && rest.applies_when.trim().length > 0) return rest;
  const key = typeof applicableWhen === 'string' ? applicableWhen.trim() : '';
  if (Object.prototype.hasOwnProperty.call(APPLICABLE_WHEN_WORDS, key)) {
    return { ...rest, applies_when: APPLICABLE_WHEN_WORDS[key] };
  }
  notes.push(
    `${where}: applicableWhen ${JSON.stringify(applicableWhen)} is not in APPLICABLE_WHEN_WORDS, condition dropped`,
  );
  return rest;
}

/**
 * `related_acts` for a raw list of act entries (any of the pack shapes), one
 * string per entry, in order. Unknown `applicableWhen` keys go to `notes`.
 */
export function renderRelatedActs(raw: unknown, notes: string[] = []): string[] {
  if (!Array.isArray(raw)) return [];
  const resolved = raw.map((item, idx) =>
    resolveApplicableWhen(item, `related acts[${idx}]`, notes),
  );
  return readActList(resolved).map(renderRelatedAct);
}

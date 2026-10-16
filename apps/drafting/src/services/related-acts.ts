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

/**
 * Point 1 (Ajay): how one reference is printed. Today: the pack's own text,
 * verbatim ("Order XIX Rule 3", "Article 226", "S.151", "13(1)(i)").
 */
function formatRef(number: string): string {
  return number;
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

/** `related_acts` for a rule file's raw `relevantActs` (any of the pack shapes). */
export function renderRelatedActs(raw: unknown): string[] {
  return readActList(raw).map(renderRelatedAct);
}

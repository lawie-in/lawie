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

/**
 * Point 3: the plain words inside the "[only when: ...]" marker, keyed by the
 * pack's own condition text (`applies_when`, or the `applicableWhen` key). The
 * pack text itself never reaches the model: a condition not in this table
 * prints no marker (renderRelatedActs reports it). dv_dowry: Ajay b101b4eb.
 * 2-12: Ajay's signed wording, generated from
 * handoff/legal/T-245-old-new-law-switch-signed.md, "Byte check T-477" (8766fbf1).
 */
export const APPLICABLE_WHEN_WORDS: Readonly<Record<string, string>> = Object.freeze({
  // 1: bail_regular, Protection of Women from Domestic Violence Act (PWDVA), 2005
  dv_dowry: 'the offence arises from domestic violence or a dowry demand',
  // 2: distribution_agreement, FEMA 1999
  'Cross-border distributor': 'the distributor is outside India',
  // 3: distribution_agreement, Customs Act 1962
  'Imported goods': 'the goods are imported',
  // 4: employment_agreement, Industrial Employment (Standing Orders) Act 1946
  'Industrial establishments >= 100 (or 50 in some states)':
    'the employer is an industrial establishment covered by the Act',
  // 5: employment_agreement, Industrial Disputes Act 1947
  Workmen: 'the employee is a workman',
  // 6: franchise_agreement, FEMA 1999 + FEMA (Current Account Transactions) Rules 2000
  'Cross-border': 'the franchisor or the franchisee is outside India',
  // 7: franchise_agreement, Food Safety and Standards Act 2006
  'Food/F&B franchise': 'the franchise sells food or beverages',
  // 8: loan_agreement, SARFAESI Act 2002
  'Lender is Bank/NBFC': 'the lender is a bank or an NBFC',
  // 9: loan_agreement, State Money-Lenders Acts
  'Private money-lending business': 'the lender carries on a money-lending business',
  // 10: loan_agreement, FEMA 1999 + ECB Master Direction
  'Foreign lender': 'the lender is outside India',
  // 11: shareholders_agreement, FEMA 1999 + FEMA (NDI) Rules 2019
  'Foreign investor': 'an investor is outside India',
  // 12: shareholders_agreement, SEBI ICDR Regulations 2018
  'Pre-IPO': 'the company plans a public issue',
});

/** The signed words for an entry's condition, or null when there are none. */
function conditionWords(appliesWhen: string | null): string | null {
  if (appliesWhen === null) return null;
  return Object.prototype.hasOwnProperty.call(APPLICABLE_WHEN_WORDS, appliesWhen)
    ? APPLICABLE_WHEN_WORDS[appliesWhen]
    : null;
}

/** How the condition attaches to an entry. */
function withCondition(text: string, words: string | null): string {
  return words ? `${text} [only when: ${words}]` : text;
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

/**
 * One `related_acts` string. An entry with no references is the bare act name.
 * A condition prints only as its words from APPLICABLE_WHEN_WORDS.
 */
export function renderRelatedAct(entry: RulePackAct): string {
  const refs = refsOf(entry);
  const text = refs.length > 0 ? withRefs(entry.act, refs) : entry.act;
  return withCondition(text, conditionWords(entry.appliesWhen));
}

/**
 * `related_acts` for a raw list of act entries (any of the pack shapes), one
 * string per entry, in order. A condition missing from APPLICABLE_WHEN_WORDS
 * prints no marker and goes to `notes`.
 */
export function renderRelatedActs(raw: unknown, notes: string[] = []): string[] {
  const entries = readActList(raw);
  for (const e of entries) {
    if (e.appliesWhen !== null && conditionWords(e.appliesWhen) === null) {
      notes.push(
        `related acts (${e.act}): condition ${JSON.stringify(e.appliesWhen)} is not in APPLICABLE_WHEN_WORDS, no marker printed`,
      );
    }
  }
  return entries.map(renderRelatedAct);
}

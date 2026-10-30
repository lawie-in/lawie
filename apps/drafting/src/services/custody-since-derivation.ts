/**
 * T-638 Part B (Ajay R1, T-611 policy; T-638 rulings B1-B5, 28 Oct 2026):
 * "in custody since" derived from the date of arrest on a regular bail.
 *
 * LEGAL CONTENT. The rule and the word list are Ajay's, signed in
 * `handoff/legal/T-611-fact-checker-policy-signed.md` (R1) and
 * `handoff/legal/T-612-bail-grounds-wording-signed.md` ((5) and B1-B5). Do not
 * change the words or the rule without his sign-off.
 *
 * - R1: on `bail_regular` with the applicant in custody (judicial or police),
 *   when the date of arrest is held and no custody date (`custody_since`) and
 *   no remand date is: custody_since is the date of arrest, a derived fact.
 * - B1: not derived, and asked instead, when the description or the facts
 *   say any signed surrender / remand / re-arrest word, or hold a date whose
 *   meaning is custody or remand (date-meanings.json kinds `custody`, `remand`).
 * - B3 / B5: a value the advocate gives (or edits) is a given custody_since,
 *   never derived, even when it equals the date of arrest.
 *
 * Leaf module: no service imports, so the brief (intake-brief.ts) and the
 * generation path (ai.service.ts) read the same rule without an import cycle.
 * A derived fact is worked out per request and never stored, as T-611 P5's
 * amount_in_words is.
 */
import type { LedgerFact, LedgerUnresolvedFact } from '@lawie/shared';

import bailRegularPack from '../config/document-rules/bail_regular.json';
import dateMeanings from '../config/intake/date-meanings.json';

/** The one pack R1 is ruled for (regular bail only). */
export const CUSTODY_SINCE_PACK_ID = 'bail_regular';

export const CUSTODY_SINCE_KEY = 'custody_since';
export const ARREST_DATE_KEY = 'arrest_date';
export const CUSTODY_CHOICE_KEY = 'currently_in_custody';

/**
 * The computed marker the skeleton tests with `present` (clause
 * `custody_status_derived`): held only when custody_since was derived.
 * Machine key, never printed by the skeleton.
 */
export const CUSTODY_SINCE_DERIVED_KEY = 'custody_since_derived';

/** R1 / B3, signed: the brief shows the derived date as `<date> (date of arrest)`. */
export const DATE_OF_ARREST_CAPTION = '(date of arrest)';

/** The custody option ids that mean "in custody" (the skeleton's custody_status `when`). */
const IN_CUSTODY_IDS = ['yes_judicial', 'yes_police'] as const;

function fold(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

interface PackField {
  field_id?: string;
  label?: string;
  options?: Array<{ id?: string; label?: string }>;
}

function packField(id: string): PackField | undefined {
  const steps = (bailRegularPack as { form_schema?: { steps?: Array<{ fields?: PackField[] }> } })
    .form_schema?.steps;
  for (const step of steps ?? []) {
    for (const field of step.fields ?? []) if (field.field_id === id) return field;
  }
  return undefined;
}

/** The pack's option ids and labels for "in custody", folded: a value may be either. */
const IN_CUSTODY_VALUES: ReadonlySet<string> = new Set([
  ...IN_CUSTODY_IDS.map(fold),
  ...(packField(CUSTODY_CHOICE_KEY)?.options ?? [])
    .filter((o) => o.id && (IN_CUSTODY_IDS as readonly string[]).includes(o.id) && o.label)
    .map((o) => fold(o.label as string)),
]);

/** The pack's signed label of custody_since, for the computed fact. */
const CUSTODY_SINCE_LABEL: string = packField(CUSTODY_SINCE_KEY)?.label ?? CUSTODY_SINCE_KEY;

/** True when a custody answer (option id or label) is "in custody", judicial or police. */
export function isInCustodyAnswer(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((v) => isInCustodyAnswer(v));
  return typeof value === 'string' && IN_CUSTODY_VALUES.has(fold(value));
}

/**
 * B1: the fact keys whose date means custody or remand (date-meanings.json
 * kinds `custody` and `remand`): `custody_since`, `remand_date`.
 */
export const CUSTODY_OR_REMAND_DATE_KEYS: ReadonlySet<string> = new Set(
  (dateMeanings.kinds as Array<{ id: string; facts: string[] }>)
    .filter((k) => k.id === 'custody' || k.id === 'remand')
    .flatMap((k) => k.facts),
);

/** The date-meaning kinds of B1 (a stated date of one of these kinds is "another custody date"). */
export const CUSTODY_OR_REMAND_KINDS: ReadonlySet<string> = new Set(['custody', 'remand']);

/**
 * B1, signed word list: surrender, surrendered, आत्मसमर्पण, remand, remanded,
 * रिमांड, re-arrest, re-arrested. Case-insensitive; re-arrest with a hyphen, a
 * space or neither. Latin words are whole words; the Devanagari ones are
 * matched wherever they stand (a suffix or postposition may follow).
 */
const LATIN_B1 = /(?<![a-z])(?:surrender(?:ed)?|remand(?:ed)?|re[-\s]?arrest(?:ed)?)(?![a-z])/i;
const DEVANAGARI_B1 = ['आत्मसमर्पण', 'रिमांड'];

/** True when the text says one of the signed B1 words. */
export function mentionsSurrenderOrRemand(text: string): boolean {
  const t = fold(text);
  if (t === '') return false;
  return LATIN_B1.test(t) || DEVANAGARI_B1.some((w) => t.includes(w));
}

/** An ISO date as the draft writes it: "12 June 2026" (no leading zero). Null when not ISO. */
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
export function draftDateOf(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export interface CustodySinceInput {
  /** The document kind. Only `bail_regular` derives. */
  packId: string | null;
  /** The custody answer (option id or label), or null. */
  custody: unknown;
  /** The held date(s) of arrest: ISO values. Exactly one is derived from. */
  arrestDates: readonly string[];
  /** A custody_since is held (given by the advocate or read). */
  custodySinceHeld: boolean;
  /** A date whose meaning is custody or remand is held or stated, other than the arrest date (B1). */
  otherCustodyDate: boolean;
  /** The words scanned for the B1 list: the description, and the facts' own words. */
  texts: readonly string[];
}

export type CustodySinceDerivation =
  /** custody_since is the date of arrest (R1). `display` is the draft format. */
  | { derived: { value: string; display: string } }
  /** In custody with no custody_since, and not derivable: ask (B2). */
  | { ask: true }
  /** Not this rule's case (not regular bail, not in custody, or custody_since given). */
  | { none: true };

/** The R1 / B1 rule, pure. */
export function deriveCustodySince(input: CustodySinceInput): CustodySinceDerivation {
  if (input.packId !== CUSTODY_SINCE_PACK_ID) return { none: true };
  if (!isInCustodyAnswer(input.custody)) return { none: true };
  // B5: a given custody_since is never replaced, even when equal to the arrest date.
  if (input.custodySinceHeld) return { none: true };
  if (input.otherCustodyDate) return { ask: true };
  if (input.texts.some((t) => mentionsSurrenderOrRemand(t))) return { ask: true };
  const arrest = [...new Set(input.arrestDates.map((d) => d.trim()).filter((d) => d !== ''))];
  if (arrest.length !== 1) return { ask: true };
  const display = draftDateOf(arrest[0]);
  if (display === null) return { ask: true };
  return { derived: { value: arrest[0], display } };
}

function lastSegment(key: string): string {
  const at = key.lastIndexOf('.');
  return at < 0 ? key : key.slice(at + 1);
}

function isComputedHere(f: LedgerFact): boolean {
  const name = lastSegment(f.key);
  return (
    name === CUSTODY_SINCE_DERIVED_KEY || (name === CUSTODY_SINCE_KEY && f.source === 'computed')
  );
}

/** The arrest_date facts generation derives from: type date, string value. */
function arrestDateFacts(facts: readonly LedgerFact[]): LedgerFact[] {
  return facts.filter(
    (f) =>
      lastSegment(f.key) === ARREST_DATE_KEY && f.type === 'date' && typeof f.value === 'string',
  );
}

/** What the ledger tells the R1 / B1 rule, read the same way by the brief and by generation (T-660). */
export interface LedgerCustodyInputs {
  /** Every stored fact's raw_span and display, and every unresolved entry's raw_span (B1 scan). */
  texts: string[];
  /** A custody or remand date (other than custody_since) is held, or unresolved (B1). */
  otherCustodyDate: boolean;
  /** A custody_since fact is held (B5), whatever its display. */
  custodySinceHeld: boolean;
  /** T-665: the held dates of arrest: arrest_date facts of type date with a string value. */
  arrestDates: string[];
  /** T-665: the custody answer: every currently_in_custody fact's value and display. */
  custodyAnswer: unknown[];
  /**
   * T-665 (Ajay, 309b4377): the ledger holds an arrest_date fact of any type or
   * value, or an unresolved arrest_date entry. The brief then reads only the
   * usable ledger dates (`arrestDates`). Generation does not read this.
   */
  arrestDateHeld: boolean;
}

/**
 * T-660: the ledger's part of the rule, pure. Computed facts this module makes
 * (the marker, a computed custody_since) are left out, so a request's own
 * derivation never counts as held. `withCustodySinceDerived` reads the ledger
 * through this, and the brief (intake-brief.ts) is given the same result.
 */
export function ledgerCustodyInputs(
  facts: readonly LedgerFact[],
  unresolved: ReadonlyArray<Pick<LedgerUnresolvedFact, 'key' | 'raw_span'>> = [],
): LedgerCustodyInputs {
  const stored = facts.filter((f) => !isComputedHere(f));
  return {
    texts: [
      ...stored.flatMap((f) => [f.raw_span ?? '', typeof f.display === 'string' ? f.display : '']),
      ...unresolved.map((u) => u.raw_span ?? ''),
    ],
    otherCustodyDate:
      stored.some(
        (f) =>
          lastSegment(f.key) !== CUSTODY_SINCE_KEY &&
          CUSTODY_OR_REMAND_DATE_KEYS.has(lastSegment(f.key)),
      ) || unresolved.some((u) => CUSTODY_OR_REMAND_DATE_KEYS.has(lastSegment(u.key))),
    custodySinceHeld: stored.some((f) => lastSegment(f.key) === CUSTODY_SINCE_KEY),
    arrestDates: arrestDateFacts(stored).map((f) => String(f.value)),
    arrestDateHeld:
      stored.some((f) => lastSegment(f.key) === ARREST_DATE_KEY) ||
      unresolved.some((u) => lastSegment(u.key) === ARREST_DATE_KEY),
    custodyAnswer: stored
      .filter((f) => lastSegment(f.key) === CUSTODY_CHOICE_KEY)
      .flatMap((f) => [f.value, f.display]),
  };
}

/**
 * The generation path (ai.service.ts, beside T-611 P5): the ledger's facts for
 * this request, with custody_since computed from arrest_date when R1 holds,
 * plus the marker `custody_since_derived`. Any stored marker or computed
 * custody_since is dropped first (only this function makes them). An
 * unresolved custody or remand date counts as one stated (B1: ask). For any
 * other pack the facts are returned as given.
 */
export function withCustodySinceDerived(
  facts: readonly LedgerFact[],
  packId: string,
  described: string | null | undefined,
  unresolved: ReadonlyArray<Pick<LedgerUnresolvedFact, 'key' | 'raw_span'>> = [],
): LedgerFact[] {
  if (packId !== CUSTODY_SINCE_PACK_ID) return [...facts];
  const stored = facts.filter((f) => !isComputedHere(f));
  // The first arrest fact gives the display text only; the rule reads ledgerCustodyInputs.
  const arrestFacts = arrestDateFacts(stored);
  const ledger = ledgerCustodyInputs(stored, unresolved);
  const result = deriveCustodySince({
    packId,
    custody: ledger.custodyAnswer,
    arrestDates: ledger.arrestDates,
    custodySinceHeld: ledger.custodySinceHeld,
    otherCustodyDate: ledger.otherCustodyDate,
    texts: [described ?? '', ...ledger.texts],
  });
  if (!('derived' in result)) return stored;
  const arrest = arrestFacts[0];
  return [
    ...stored,
    {
      id: `computed:${CUSTODY_SINCE_KEY}`,
      key: CUSTODY_SINCE_KEY,
      label: CUSTODY_SINCE_LABEL,
      type: 'date',
      value: result.derived.value,
      // The date of arrest as the ledger prints it, so both lines print it alike.
      display: arrest.display.trim() !== '' ? arrest.display : result.derived.display,
      raw_span: '',
      source: 'computed',
      confidence: 1,
      required_in_draft: false,
    },
    {
      id: `computed:${CUSTODY_SINCE_DERIVED_KEY}`,
      key: CUSTODY_SINCE_DERIVED_KEY,
      label: CUSTODY_SINCE_DERIVED_KEY,
      type: 'boolean',
      value: true,
      display: ARREST_DATE_KEY,
      raw_span: '',
      source: 'computed',
      confidence: 1,
      required_in_draft: false,
    },
  ];
}

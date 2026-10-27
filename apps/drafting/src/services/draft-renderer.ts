/**
 * The D1 renderer (ADR-025 D1, "Renderer"; T-373).
 *
 * The Drafter returns structured output, `paragraphs[]{ clauseId, factRefs[],
 * text, items[] }`, against a signed pack skeleton (`types/skeleton.ts`). This
 * file turns that output into the body of the document. Pure: no model, no
 * I/O, no logging.
 *
 * Every string it renders comes from a skeleton clause, a ledger fact, or the
 * signed `{{MISSING: label}}` marker (`missingPlaceholder`). It holds no
 * sentence, connective or heading of its own (Arjun's ruling, T-373): the only
 * literals it writes are whitespace, paragraph numbers, sub-item letters and
 * the comma that joins the entries of one fact.
 *
 * Rules, in the ADR's numbering:
 * 1. Order by the skeleton's `order`. A paragraph whose clauseId is missing or
 *    not in the skeleton is dropped.
 * 2. `source: fixed`: the model's text and refs are ignored. The signed text
 *    (or the first variant whose `when` holds) prints, each slot filled from
 *    the ledger by slot key, whether or not the model returned the clause. An
 *    undertaking with no slots always prints. A slot prints
 *    `{{MISSING: label}}` only when the ledger does not hold its fact; an
 *    optional clause with none of its slot facts is left out.
 * 3. `source: advocate`: with the fact held the clause always prints. The
 *    model's text is kept only if the fact verifier, run against the fact
 *    alone, finds no value it does not back; when it fails, or the model gave
 *    none, the fact's `raw_span` prints verbatim (status `fallback`, with a
 *    reason the caller logs). Before the verifier, the text also falls back
 *    when it alters a date, number, name or place of the `raw_span`, or adds
 *    a content word the `raw_span` does not hold (Arjun, bcdf5b7; stop list
 *    `OWN_WORDS_STOP_LIST`). It also falls back when a word of
 *    `OWN_WORDS_KEPT` is added or dropped, or the content words are not in
 *    the `raw_span`'s order, dates and amounts kept in that order by value
 *    (Ajay's renderer review, 13 Oct 2026). MISSING
 *    only when the ledger does not hold it.
 *    A key with several entries prints one lettered item per entry.
 *
 * Ajay's rulings for T-373: never MISSING when the fact exists; a ground with
 * `use_clause: X` prints X once, inside the grounds list, and the standalone X
 * is left out (with the ground not ticked, X prints standalone as usual).
 * 4. Sections: the entries of a sections slot are deduped on (code, number)
 *    via `readSectionsCharged`, so a section entered twice prints once.
 * 5. Output: the body plus `rendered[]`, one entry per printed clause. The
 *    checks panel reads this list only.
 * 6. Title, prayer, verification and the advocate block are not rendered here
 *    (ADR-021): they stay code-assembled by the template engine.
 *
 * Grounds (Ajay's re-sign 0204a7e, stricter than rule 3): the list clause
 * renders one signed sentence per ticked option of its `from` fact, from the
 * ledger, whatever the model's items say. An option with no signed sentence,
 * or whose `requires` fails, renders its MISSING form, so no ground the
 * advocate gave is dropped silently and none the advocate did not give can print.
 */
import type { LedgerFact } from '@lawie/shared';

import type {
  Skeleton,
  SkeletonClause,
  SkeletonCondition,
  SkeletonDerivedSlot,
  SkeletonValue,
  SkeletonValueSet,
} from '../types/skeleton';

import type { AvermentCondition, AvermentLists } from './averments';
import { factEntriesByKey } from './averments';
import { readSectionsCharged } from './bns-offence-resolver';
import { missingPlaceholder, notKnownDateKeys } from './brief-drafter';
import { FactViolation, verifyDraft, VerifierInput } from './fact-verifier';
import { blankLabel, dateMeaningOf } from './intake-brief';
import type { Brief, ChecklistItem } from './intake-brief';
import { dateMatchesInText, datesAsWritten, datesInText, normalise } from './intake-text';
import type { RulePackFact } from './rule-pack.service';

// ── The model's structured output ───────────────────────────────────────────

export interface DraftItem {
  /** `<key>[<n>]`: the n-th entry (from 0) of a list fact. */
  factRef: string;
  text: string;
}

export interface DraftParagraph {
  clauseId: string;
  factRefs: string[];
  text: string;
  items: DraftItem[];
}

export interface DraftParagraphsOutput {
  paragraphs: DraftParagraph[];
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
}

/**
 * The model's answer read defensively. Null when it is not an object with a
 * `paragraphs` list. A paragraph with no string `clauseId` is kept here with
 * an empty id, and dropped by the renderer (rule 1).
 */
export function readDraftParagraphs(raw: unknown): DraftParagraphsOutput | null {
  if (!isObject(raw) || !Array.isArray(raw.paragraphs)) return null;
  return {
    paragraphs: raw.paragraphs.filter(isObject).map((p) => ({
      clauseId: typeof p.clauseId === 'string' ? p.clauseId : '',
      factRefs: strings(p.factRefs),
      text: typeof p.text === 'string' ? p.text : '',
      items: Array.isArray(p.items)
        ? p.items.filter(isObject).map((i) => ({
            factRef: typeof i.factRef === 'string' ? i.factRef : '',
            text: typeof i.text === 'string' ? i.text : '',
          }))
        : [],
    })),
  };
}

// ── What the model is given and the schema it answers in ─────────────────────

/** One ref per entry of a list clause's key, or of an own-words key with several entries: `grounds_for_bail[0]` ... */
function listRefs(skeleton: Skeleton, facts: readonly LedgerFact[]): string[] {
  const held = factEntriesByKey(facts);
  const out: string[] = [];
  for (const c of skeleton.clauses) {
    // An option list, or an own-words clause whose key holds several entries.
    const key =
      c.list && c.from ? c.from : c.source === 'advocate' ? (c.slot ?? c.from) : undefined;
    if (!key) continue;
    const entries = held.get(key) ?? [];
    if (!c.list && entries.length < 2) continue;
    entries.forEach((_f, i) => out.push(`${key}[${i}]`));
  }
  return [...new Set(out)];
}

/** Every fact ref the model may name: each held ledger key, then each list entry. */
export function draftFactRefs(skeleton: Skeleton, facts: readonly LedgerFact[]): string[] {
  return [...new Set([...factEntriesByKey(facts).keys(), ...listRefs(skeleton, facts)])];
}

/** A string field restricted to `values`, or any string when there are none to name. */
function enumOf(values: readonly string[]): Record<string, unknown> {
  return values.length > 0 ? { type: 'string', enum: [...values] } : { type: 'string' };
}

/**
 * The structured-output JSON schema for one request (Arjun's D1 call shape):
 * `clauseId` is an enum of the skeleton's ids and every fact ref an enum of
 * `factRefs` (from `draftFactRefs`), so the API rejects anything else before
 * our code runs. Every field is required; the model gives `[]` or `""`.
 */
export function buildDraftParagraphsSchema(
  skeleton: Skeleton,
  factRefs: readonly string[],
): { type: 'object'; [k: string]: unknown } {
  const ref = enumOf(factRefs);
  return {
    type: 'object',
    additionalProperties: false,
    required: ['paragraphs'],
    properties: {
      paragraphs: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['clauseId', 'factRefs', 'text', 'items'],
          properties: {
            clauseId: enumOf(skeleton.clauses.map((c) => c.id)),
            factRefs: { type: 'array', items: ref },
            text: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['factRef', 'text'],
                properties: { factRef: ref, text: { type: 'string' } },
              },
            },
          },
        },
      },
    },
  };
}

/** The ledger keys whose own words an advocate clause carries. */
export function advocateKeys(skeleton: Skeleton): Set<string> {
  return new Set(
    skeleton.clauses
      .filter((c) => c.source === 'advocate' && typeof c.slot === 'string')
      .map((c) => c.slot as string),
  );
}

export interface D1DrafterFact {
  key: string;
  label: string;
  type: string;
  display: string;
  /** Only for a key an advocate clause carries (ADR-025 "Drafter contract"). */
  raw_span?: string;
}

/**
 * The facts given to the model: every held entry with its key, label, type
 * and display, and `raw_span` for the keys an advocate clause carries. Unlike
 * `ledgerDrafterFacts` it keeps the advocate's words for those keys, because
 * the model's only free text is a grammar fix of them.
 */
export function d1DrafterFacts(skeleton: Skeleton, facts: readonly LedgerFact[]): D1DrafterFact[] {
  const own = advocateKeys(skeleton);
  return [...factEntriesByKey(facts).values()].flat().map((f) => ({
    key: f.key,
    label: f.label,
    type: f.type,
    display: f.display.trim(),
    ...(own.has(f.key) ? { raw_span: (f.raw_span ?? '').trim() } : {}),
  }));
}

/** Every signed string of the skeleton, for checks that treat the skeleton as a source. */
export function skeletonTexts(skeleton: Skeleton): string[] {
  const out: string[] = [];
  for (const c of skeleton.clauses) {
    if (c.text) out.push(c.text);
    if (c.intro) out.push(c.intro);
    for (const v of c.variants ?? []) out.push(v.text);
    for (const i of Object.values(c.items ?? {})) if (i.text) out.push(i.text);
    for (const d of Object.values(c.derived ?? {})) out.push(...Object.values(d.map));
  }
  return out;
}

// ── Inputs the renderer reads besides the model's output ────────────────────

/** Ledger key to (folded option label to option id), from the pack's facts. */
export type OptionIdMap = Readonly<Record<string, Readonly<Record<string, string>>>>;

/** A named signed list (`none_values`, `no_recovery.equals`) to its values. */
export type ValueLists = Readonly<Record<string, readonly SkeletonValue[]>>;

/** Case, spacing and punctuation folded, as averment conditions compare. */
function folded(v: unknown): string {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string')
    return normalise(v)
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  return '';
}

/**
 * A ledger choice fact holds the option's label; the skeleton names options by
 * id. This maps each pack fact's labels to its ids (`option_ids`, T-153).
 */
export function packOptionIds(facts: readonly RulePackFact[]): OptionIdMap {
  const out: Record<string, Record<string, string>> = {};
  for (const f of facts) {
    if (!f.option_ids || f.option_ids.length !== f.options.length) continue;
    const map: Record<string, string> = {};
    f.options.forEach((label, i) => {
      map[folded(label)] = f.option_ids![i];
    });
    // T-473: an answer saved before labels were humanised holds the pack's raw
    // option text (`yes_flag_title_warning`), whose fold is its id's fold. Labels win.
    f.option_ids.forEach((id) => {
      const k = folded(id);
      if (k !== '' && map[k] === undefined) map[k] = id;
    });
    out[f.key] = map;
  }
  return out;
}

function conditionSets(c: SkeletonCondition | undefined, out: Set<string>): void {
  if (!c) return;
  if ('all_of' in c) {
    for (const x of c.all_of) conditionSets(x, out);
    return;
  }
  if (typeof c.in === 'string') out.add(c.in);
  if (typeof c.not_in === 'string') out.add(c.not_in);
}

/** The equals list of the averment `id`: its allowed entry's `requires`, else its ban's `unlocked_by`. */
function avermentEquals(
  lists: Pick<AvermentLists, 'banned' | 'allowed'>,
  id: string,
): SkeletonValue[] | null {
  const pick = (c: AvermentCondition | null | undefined): SkeletonValue[] | null => {
    if (!c || 'all_of' in c || c.equals === undefined) return null;
    return Array.isArray(c.equals) ? [...c.equals] : [c.equals];
  };
  return (
    pick(lists.allowed.find((a) => a.id === id)?.requires) ??
    pick(lists.banned.find((b) => b.id === id)?.unlocked_by)
  );
}

/** A skeleton top-level list name the loader accepts (T-374 validation). */
const SKELETON_LIST_NAME = /^(?:[a-z0-9]+_)*none_values$/;

/**
 * A top-level array of the skeleton itself named `name` (Ajay's re-sign
 * d87355a: e.g. `antecedents_none_values`), or null. Only scalar entries count;
 * an array holding anything else is not a value list.
 */
function skeletonOwnList(skeleton: Skeleton, name: string): SkeletonValue[] | null {
  const key = name.trim();
  // Tanvi (T-374): only a `<prefix>_none_values` name, as her loader validates.
  if (!SKELETON_LIST_NAME.test(key)) return null;
  const v = (skeleton as unknown as Record<string, unknown>)[key];
  if (!Array.isArray(v)) return null;
  const ok = v.every(
    (x) => typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean',
  );
  return ok ? (v as SkeletonValue[]) : null;
}

/**
 * Resolves every list name the skeleton's conditions use. In order (Ajay's
 * re-sign d87355a): a top-level array of the skeleton itself with that name;
 * then the pack's signed averment lists as before. `none_values` reads the
 * skeleton's own reference: an array, the name of a top-level array of the
 * skeleton (`antecedents_none_values`), or an averment reference
 * (`first_bail_application.equals (T-334)`); `<id>.equals` reads that
 * averment. A name that resolves in neither is left out, and a condition on it
 * then fails closed.
 */
export function skeletonValueLists(
  skeleton: Skeleton,
  lists: Pick<AvermentLists, 'banned' | 'allowed'>,
): ValueLists {
  const names = new Set<string>();
  for (const c of skeleton.clauses) {
    conditionSets(c.when, names);
    for (const v of c.variants ?? []) conditionSets(v.when, names);
    for (const i of Object.values(c.items ?? {})) conditionSets(i.requires, names);
  }
  const out: Record<string, SkeletonValue[]> = {};
  for (const name of names) {
    let values: SkeletonValue[] | null = null;
    if (name === 'none_values') {
      const ref: unknown = (skeleton as unknown as Record<string, unknown>).none_values;
      if (Array.isArray(ref)) {
        values = skeletonOwnList(skeleton, 'none_values');
      } else if (typeof ref === 'string') {
        values = skeletonOwnList(skeleton, ref);
        if (!values) {
          const m = /^\s*([a-z0-9_]+)\.equals\b/.exec(ref);
          values = m ? avermentEquals(lists, m[1]) : null;
        }
      }
    } else {
      values = skeletonOwnList(skeleton, name);
      if (!values) {
        const m = /^\s*([a-z0-9_]+)\.equals\b/.exec(name);
        values = m ? avermentEquals(lists, m[1]) : null;
      }
    }
    if (values) out[name] = values;
  }
  return out;
}

// ── The own-words check (Arjun's rulings 1 and 2 on bcdf5b7) ─────────────────

/**
 * Grammar words a rephrase of the advocate's words may add or drop:
 * connectives, articles, auxiliaries, pronouns and prepositions. A word that
 * adds meaning is not here (round 3): no causal word ("because", "therefore",
 * "so", "hence", "thus", "if"), no temporal word ("after", "before", "since",
 * "until", "till", "during", "while", "when", "then", "yet") and no negating
 * one ("not", "no", "nor", "neither", "without", "against"), so adding one
 * falls back. Ajay's renderer review (13 Oct 2026): no modal ("will",
 * "would", "shall", "can"), which turns a fact into an undertaking or a
 * hypothesis, and none of `OWN_WORDS_KEPT` (third-person pronouns, "or",
 * "either"), which are kept as written. Data, not
 * wording: nothing here is ever printed. Any other word in the model's text
 * that is not in the advocate's `raw_span` (compared on simple stems) sends
 * the clause back to the advocate's words. Arjun: tune this list if the
 * fallback rate shows it firing too often, not the rule.
 */
export const OWN_WORDS_STOP_LIST: readonly string[] = [
  // articles and determiners
  'a',
  'an',
  'the',
  'this',
  'that',
  'these',
  'those',
  'some',
  'each',
  'such',
  // connectives
  'and',
  'but',
  'although',
  'though',
  'however',
  'also',
  'which',
  'who',
  'whom',
  'whose',
  'where',
  'whether',
  'than',
  'both',
  'further',
  'furthermore',
  'moreover',
  // auxiliaries
  'be',
  'am',
  'is',
  'are',
  'was',
  'were',
  'been',
  'being',
  'has',
  'have',
  'had',
  'having',
  'do',
  'does',
  'did',
  // pronouns
  'i',
  'me',
  'my',
  'mine',
  'we',
  'us',
  'our',
  'ours',
  'you',
  'your',
  'yours',
  'it',
  'its',
  'theirs',
  'itself',
  'there',
  'here',
  // prepositions
  'of',
  'in',
  'on',
  'at',
  'to',
  'from',
  'by',
  'with',
  'for',
  'about',
  'into',
  'onto',
  'over',
  'under',
  'among',
  'between',
  'through',
  'upon',
  'within',
  'per',
  'via',
  'off',
  'out',
  'up',
  'down',
  // what splitting on apostrophes leaves ("applicant's", "didn't")
  's',
  't',
];

const STOP_WORDS: ReadonlySet<string> = new Set(OWN_WORDS_STOP_LIST);

/** Words of a text, lower case, split on anything not a letter or digit. An ordinal is its number. */
function wordsOf(text: string): string[] {
  return normalise(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w !== '')
    .map((w) => /^(\d+)(?:st|nd|rd|th)$/.exec(w)?.[1] ?? w);
}

/** A simple stem, so "arrest", "arrested" and "arresting" compare equal (-s, -es, -ed, -ing, -ies). */
export function ownWordsStem(word: string): string {
  let s = word.toLowerCase();
  if (/^\d+$/.test(s)) return s;
  if (s.length > 4 && s.endsWith('ies')) s = `${s.slice(0, -3)}y`;
  else if (s.length > 4 && s.endsWith('ied')) s = `${s.slice(0, -3)}y`;
  else if (s.length > 4 && s.endsWith('ing')) s = s.slice(0, -3);
  else if (s.length > 3 && s.endsWith('ed')) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith('es')) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
  if (s.length > 3 && s.endsWith('e')) s = s.slice(0, -1);
  if (s.length > 3 && /([b-df-hj-np-tv-z])\1$/.test(s)) s = s.slice(0, -1);
  return s;
}

/** The text with every date it states taken out (lower case), so a month word is not read as a word. */
function withoutDates(text: string): string {
  let out = normalise(text);
  for (const d of datesAsWritten(text)) {
    const words = normalise(d.words);
    if (words !== '') out = out.split(words).join(' ');
  }
  return out;
}

/**
 * The text with every date it states blanked out, case kept, so the month of
 * a date ("5 May 2026") is not read as a capitalised name. Dates are compared
 * by value, separately.
 */
function withoutDatesKeepCase(text: string): string {
  let out = text;
  for (const d of datesAsWritten(text)) {
    const words = d.words.toLowerCase();
    if (words.trim() === '') continue;
    // Every place the date is written, found case-insensitively and blanked to the same length.
    for (let at = out.toLowerCase().indexOf(words); at >= 0; ) {
      out = out.slice(0, at) + ' '.repeat(words.length) + out.slice(at + words.length);
      at = out.toLowerCase().indexOf(words, at + words.length);
    }
  }
  return out;
}

/**
 * Ruling 1: a date, number, name or place in the model's text that the
 * advocate's `raw_span` does not state. Dates compare by value (so "2 Mar
 * 2025" is "2 March 2025"); numbers by digits; a capitalised word inside a
 * sentence (a name or a place) by its stem. No exemption applies.
 */
export function ownWordsAlteredEntity(text: string, rawSpan: string): boolean {
  const rawDates = new Set(datesInText(rawSpan));
  if (datesInText(text).some((d) => !rawDates.has(d))) return true;
  const rawWords = wordsOf(withoutDates(rawSpan));
  const rawStems = new Set(rawWords.map(ownWordsStem));
  const rawNumbers = new Set(rawWords.filter((w) => /^\d+$/.test(w)));
  if (wordsOf(withoutDates(text)).some((w) => /^\d+$/.test(w) && !rawNumbers.has(w))) return true;
  // A capitalised word that does not start a sentence: a name or a place.
  const scanned = withoutDatesKeepCase(text);
  for (const m of scanned.matchAll(/(?<![.!?:;]\s|^)(?<=\s|\()(\p{Lu}[\p{L}'-]*)/gu)) {
    const words = wordsOf(m[1]);
    if (words.length === 0 || (words.length === 1 && words[0] === 'i')) continue;
    if (words.some((w) => !rawStems.has(ownWordsStem(w)))) return true;
  }
  return false;
}

/**
 * Ruling 2 (advocate clauses only): a content word of the model's text, one
 * not on `OWN_WORDS_STOP_LIST`, whose stem the advocate's `raw_span` does not
 * hold. Case-insensitive.
 */
export function ownWordsAddedWord(text: string, rawSpan: string): boolean {
  const rawStems = new Set(wordsOf(withoutDates(rawSpan)).map(ownWordsStem));
  return wordsOf(withoutDates(text)).some(
    (w) => !STOP_WORDS.has(w) && !rawStems.has(ownWordsStem(w)),
  );
}

/**
 * Ajay (T-334 Addendum 2): the prefixes one of which is stripped from the
 * front of a `police_station` value before it fills a slot, because the
 * signed text already says "Police Station {police_station}". Matching data
 * only, never printed. The ledger keeps the advocate's words.
 */
export const POLICE_STATION_PREFIXES: ReadonlyArray<readonly string[]> = [
  ['police', 'station'],
  ['p', 's'],
  ['ps'],
  ['thana'],
];

/**
 * One leading police-station prefix removed (case-insensitive), then trimmed:
 * "PS Kadamkuan", "P.S. Kadamkuan", "Police Station Kadamkuan" and
 * "Thana-Kotwali" lose it; "Psalm Nagar" does not (whole words only).
 */
export function stripPoliceStationPrefix(value: string): string {
  const v = value.trim();
  // T-612 (6): a ledger saved before the bare-name store may hold a trailing
  // marker ("Kotwali P.S.") or a leading थाना; one is removed so one prefix prints.
  const tail = v.replace(/[\s.:,-]+(?:p\.?\s*s\.?|police\s+station|थाना)\s*$/iu, '').trim();
  if (tail !== v && tail !== '') return tail;
  const lead = v.replace(/^थाना[\s.:,-]+/u, '').trim();
  if (lead !== v && lead !== '') return lead;
  for (const words of POLICE_STATION_PREFIXES) {
    let rest = v;
    let matched = true;
    for (const w of words) {
      const m = rest.match(/^(\p{L}+)[\s.:,-]*/u);
      if (!m || m[1].toLowerCase() !== w) {
        matched = false;
        break;
      }
      rest = rest.slice(m[0].length);
    }
    // A prefix glued to the name ("PSKadamkuan") is not a prefix.
    if (matched && rest.trim() !== '' && rest.length < v.length) {
      const consumed = v.slice(0, v.length - rest.length);
      if (/[\s.:,-]$/.test(consumed)) return rest.trim();
    }
  }
  return v;
}

/** A currency amount as the verifier reads one: a marker (₹, Rs, INR) and a figure. */
const AMOUNT_RE = /(?:₹|\b(?:rs|inr)\b\.?)\s*(\d[\d,]*(?:\.\d+)?)/giu;

/**
 * The sums of money a text states, by value: "Rs 8,00,000", "Rs. 800000" and
 * "₹8,00,000" are all 800000 (Indian or international digit grouping). Only
 * figures written with a currency marker count, as the verifier reads them.
 */
export function amountsInText(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(AMOUNT_RE)) {
    const n = Number(m[1].replace(/,/g, ''));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/**
 * The model's text is the advocate's own `raw_span`, after folding case,
 * whitespace and punctuation: it is printed as given, status `ok`.
 */
export function sameAsRawSpan(text: string, rawSpan: string): boolean {
  const f = (t: string) =>
    t
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  return f(text) !== '' && f(text) === f(rawSpan);
}

/**
 * The one rule (T-373) for a verifier `unsupported` date or amount finding
 * inside the advocate's own words: the verifier does not read dates or
 * amounts inside a narrative fact, so a finding whose every date or amount
 * the given raw_spans state, by value ("2 Mar 2025" is "2 March 2025",
 * "Rs 8,00,000" is "Rs 800000"), is the advocate's own statement, not an
 * invented value. A changed value is not in the raw_span and still counts.
 * Used by the renderer (rule 3) and by the read-only D1 fact check.
 */
export function statedByValueIn(
  rawSpans: readonly string[],
): (v: Pick<FactViolation, 'check' | 'entityType' | 'draftValue'>) => boolean {
  const dates = new Set(rawSpans.flatMap((r) => datesInText(r)));
  const amounts = new Set(rawSpans.flatMap((r) => amountsInText(r)));
  return (v) => {
    if (v.check !== 'unsupported' || !v.draftValue) return false;
    if (v.entityType === 'date') {
      const said = datesInText(v.draftValue);
      return said.length > 0 && said.every((d) => dates.has(d));
    }
    if (v.entityType === 'amount') {
      const said = amountsInText(v.draftValue);
      return said.length > 0 && said.every((a) => amounts.has(a));
    }
    return false;
  };
}

/**
 * The negating words of the advocate's own words (English and Hinglish).
 * Matching data only, never printed: one dropped from the model's text
 * reverses the meaning, so it falls back.
 */
export const OWN_WORDS_NEGATORS: readonly string[] = [
  'not',
  'no',
  'nor',
  'never',
  'neither',
  'without',
  'nahi',
  'nahin',
];

/**
 * Ajay's renderer review (13 Oct 2026), change 3: words kept as written, like
 * the negators. Third-person pronouns, which say who did what, and "or" /
 * "either", which turn a stated fact into an alternative. Matching data only,
 * never printed: one in the model's text that the `raw_span` lacks, or one in
 * the `raw_span` that the text lacks, falls back. None is on
 * `OWN_WORDS_STOP_LIST`.
 */
export const OWN_WORDS_KEPT: readonly string[] = [
  'he',
  'him',
  'his',
  'himself',
  'she',
  'her',
  'hers',
  'herself',
  'they',
  'them',
  'their',
  'themselves',
  'or',
  'either',
];

/**
 * Change 3 of Ajay's renderer review: a word of `OWN_WORDS_KEPT` in the
 * model's text that the advocate's `raw_span` does not hold as written, or
 * one in the `raw_span` the text does not hold, in either direction.
 */
export function ownWordsKeptWordChanged(text: string, rawSpan: string): boolean {
  const kept = (t: string) =>
    new Set(wordsOf(withoutDates(t)).filter((w) => OWN_WORDS_KEPT.includes(w)));
  const inText = kept(text);
  const inRaw = kept(rawSpan);
  for (const w of inText) if (!inRaw.has(w)) return true;
  for (const w of inRaw) if (!inText.has(w)) return true;
  return false;
}

/** A placeholder for the n-th date or amount of a text: letters and digits only, so `wordsOf` keeps it whole. */
const VALUE_MARK = (n: number): string => [' ', 'xlawievalue', String(n), 'x', ' '].join('');
const VALUE_MARK_RE = /^xlawievalue(\d+)x$/;

/**
 * The content words of a text in the order written: every word not on
 * `OWN_WORDS_STOP_LIST`, as its stem, numbers without digit grouping. Ajay's
 * ruling on the order check: each date and each currency amount stays in the
 * sequence at the place it is written, as its value ("date_2025-03-02",
 * "amount_800000"), so "2 Mar 2025" is "2 March 2025" and "Rs 8,00,000" is
 * "₹800000", but two swapped dates or amounts change the sequence.
 */
function contentWordSequence(text: string): string[] {
  const values: string[] = [];
  const mark = (value: string): string => {
    values.push(value);
    return VALUE_MARK(values.length - 1);
  };
  // Amounts first, by value (the same reading as `amountsInText`).
  let marked = normalise(text).replace(AMOUNT_RE, (whole) => {
    const [n] = amountsInText(whole);
    return n === undefined ? ' ' : mark('amount_' + String(n));
  });
  // Then dates, by value (the same reading as `datesInText`), every place each
  // is written, by match position (T-414): "2 March 2025" does not cut into
  // "12 March 2025", and a second written form of a date is marked too. Where
  // two matches overlap, the earlier (then the longer) one is kept.
  const spans: Array<{ value: string; at: number; end: number }> = [];
  const matches = dateMatchesInText(marked)
    .filter((d) => d.length > 0)
    .sort((a, b) => a.at - b.at || b.length - a.length);
  for (const d of matches) {
    const last = spans[spans.length - 1];
    if (last && d.at < last.end) continue;
    spans.push({ value: d.value, at: d.at, end: d.at + d.length });
  }
  // Marks are numbered in reading order, then spliced in from the end so
  // earlier positions stay valid.
  const dateMarks = spans.map((s) => mark('date_' + s.value));
  for (let i = spans.length - 1; i >= 0; i--) {
    marked = marked.slice(0, spans[i].at) + dateMarks[i] + marked.slice(spans[i].end);
  }
  return wordsOf(marked.replace(/(?<=\d),(?=\d)/g, () => '')).flatMap((w) => {
    const v = VALUE_MARK_RE.exec(w);
    if (v) return [values[Number(v[1])]];
    return STOP_WORDS.has(w) ? [] : [ownWordsStem(w)];
  });
}

/**
 * Change 1 of Ajay's renderer review: the content words of the model's text
 * (compared on stems) are not the `raw_span`'s content words in the same
 * order. A rephrase that moves, adds or drops only stop-list words keeps the
 * sequence and passes; one that swaps who did what to whom, a passive
 * rewrite, or one that swaps two dates or amounts or moves one past a
 * content word, changes it and falls back. A date or amount written another
 * way at the same place ("2 Mar 2025" for "2 March 2025") passes.
 */
export function ownWordsReordered(text: string, rawSpan: string): boolean {
  const a = contentWordSequence(text);
  const b = contentWordSequence(rawSpan);
  return a.length !== b.length || a.some((w, i) => w !== b[i]);
}

/** The text with every currency amount ("Rs 8,00,000", "₹800000") blanked out. */
function withoutAmounts(text: string): string {
  return text.replace(AMOUNT_RE, ' ');
}

/**
 * The other direction of ruling 2 (T-373 review round 2): something the
 * advocate's `raw_span` states that the model's text leaves out. True when
 * (a) a raw_span content word (not on `OWN_WORDS_STOP_LIST`) has no stem
 * match in the text, (b) a raw_span date (by value), amount (by value) or
 * other number is missing from the text, or (c) a raw_span negating word is
 * missing. A grammar-only rephrase keeps every content word and passes.
 */
export function ownWordsDroppedWord(text: string, rawSpan: string): boolean {
  // (b) dates and amounts by value: "2 March 2025" keeps "2 Mar 2025", "Rs 800000" keeps "Rs 8,00,000".
  const textDates = new Set(datesInText(text));
  if (datesInText(rawSpan).some((d) => !textDates.has(d))) return true;
  const textAmounts = new Set(amountsInText(text));
  if (amountsInText(rawSpan).some((a) => !textAmounts.has(a))) return true;
  // Amounts are compared by value above, so their currency marker and figure leave the word check.
  const words = (t: string) => wordsOf(withoutDates(withoutAmounts(t)));
  const textWords = words(text);
  const textSet = new Set(textWords);
  const textStems = new Set(textWords.map(ownWordsStem));
  // A figure is compared without its digit grouping, so "800000" keeps "8,00,000".
  const digits = (t: string) => words(t.replace(/(?<=\d),(?=\d)/g, () => ''));
  const textNumbers = new Set(digits(text).filter((w) => /^\d+$/.test(w)));
  for (const w of digits(rawSpan)) {
    if (/^\d+$/.test(w)) {
      if (!textNumbers.has(w)) return true;
    }
  }
  for (const w of words(rawSpan)) {
    if (/^\d+$/.test(w)) continue;
    // (c) a negating word must be kept as written.
    if (OWN_WORDS_NEGATORS.includes(w)) {
      if (!textSet.has(w)) return true;
      continue;
    }
    // (a) a content word must be kept, compared on its stem.
    if (!STOP_WORDS.has(w) && !textStems.has(ownWordsStem(w))) return true;
  }
  return false;
}

// ── The renderer ────────────────────────────────────────────────────────────

export type ClauseStatus = 'ok' | 'missing' | 'fallback';

/**
 * Why an own-words clause printed the advocate's words verbatim: the model gave
 * no text for it, or its text failed the fact verifier.
 */
export type FallbackReason = 'not_returned' | 'unverified';

export interface RenderedClause {
  clauseId: string;
  status: ClauseStatus;
  /** The labels of the `{{MISSING: label}}` blanks this clause printed. */
  missing?: string[];
  /** Status `fallback` only. */
  reason?: FallbackReason;
}

export interface RenderedParagraph {
  clauseId: string;
  order: number;
  /** The paragraph without its number. */
  text: string;
  status: ClauseStatus;
}

/** One own-words fallback, for the caller's log: ids and a reason, never text. */
export interface RenderFallback {
  clauseId: string;
  reason: FallbackReason;
}

export interface DraftRenderResult {
  /** The body, numbered `1.`, `2.` ... and separated by blank lines. */
  body: string;
  paragraphs: RenderedParagraph[];
  rendered: RenderedClause[];
  /** Model paragraphs dropped for a missing or unknown clauseId. */
  dropped: number;
  /** Each printed own-words clause that fell back to the advocate's words. */
  fallbacks: RenderFallback[];
}

export interface DraftRenderInput {
  skeleton: Skeleton;
  /** The model's output. Null: every own-words clause falls back to the advocate's words. */
  output: DraftParagraphsOutput | null;
  /** The ledger's current facts. */
  facts: readonly LedgerFact[];
  /** Label per ledger key, for a blank whose key the ledger does not hold (the pack checklist). */
  labels?: Readonly<Record<string, string>>;
  /** Title per clause id, for a clause's MISSING form with no `missing_label` (the pack's clauses). */
  clauseLabels?: Readonly<Record<string, string>>;
  /**
   * T-440 (Ajay, a9bc957 Q2, 4b46053 item 3): the pack checklist. A date slot
   * the ledger does not hold prints `{{MISSING: <what it is the date of, lower
   * case>}}` (intake-brief `dateMeaningOf`, `blankLabel`), as on the brief and
   * ledger paths. Without it, a date slot's blank uses `labels` as before.
   */
  checklist?: ReadonlyArray<
    Pick<ChecklistItem, 'key' | 'label' | 'kind'> & Partial<Pick<ChecklistItem, 'dateKind'>>
  >;
  /**
   * T-440 (Ajay, 69ac17a (b)): the dates answered "Not known": the brief (its
   * `notKnownDateKeys`) or those keys. For whether an optional clause prints,
   * such a slot counts as given, with its blank, so the line prints with the
   * blank; a date merely left empty still leaves the clause out (Q4).
   */
  notKnownDates?: Pick<Brief, 'items'> | readonly string[];
  optionIds?: OptionIdMap;
  valueLists?: ValueLists;
  /** What the fact verifier reads besides the paragraph and its facts (rule 3). */
  verifier: Omit<VerifierInput, 'body' | 'facts'>;
}

/** Keys whose entries are section lists, deduped on (code, number) (rule 4). */
const SECTION_KEYS: ReadonlySet<string> = new Set(['sections_charged', 'offences_alleged']);

/** The checks that make the model's own-words text unusable (rule 3). */
const REJECTING_CHECKS: ReadonlySet<string> = new Set(['unsupported', 'mutation', 'banned']);

/** `{slot}` in signed text. */
const SLOT_RE = /\{([A-Za-z0-9_.]+)\}/g;

interface ClauseOutcome {
  clause: SkeletonClause;
  index: number;
  text: string;
  status: ClauseStatus;
  missing: string[];
  /** `<clauseId>.<option id>` of list items printed. */
  printedItems: string[];
  /** Clause ids a printed list item printed in place (`use_clause`). */
  usedClauses: string[];
  reason?: FallbackReason;
}

interface ModelClause {
  text: string;
  /** Item text by fact ref (`<key>[<n>]`). */
  items: Map<string, string>;
}

function conditionKeys(c: SkeletonCondition | undefined): string[] {
  if (!c) return [];
  if ('all_of' in c) return c.all_of.flatMap(conditionKeys);
  return [c.key];
}

function sectionKeys(segment: string): string[] {
  return readSectionsCharged(segment).map((s) => `${s.code ?? ''}|${s.number}`);
}

/** Letters a list's items: `(a) ...`, `(b) ...`. */
function lettered(lines: readonly string[]): string[] {
  return lines.map((l, i) => `(${i < 26 ? String.fromCharCode(97 + i) : String(i + 1)}) ${l}`);
}

/**
 * T-577 (AJ-577-M7): what a skeleton condition is read against: the ledger's
 * entries by key (`factEntriesByKey`), the pack's option ids (`packOptionIds`)
 * and the skeleton's value lists (`skeletonValueLists`).
 */
export interface SkeletonWhenContext {
  held: ReadonlyMap<string, readonly LedgerFact[]>;
  optionIds: OptionIdMap;
  valueLists: ValueLists;
}

/** The option id of a choice fact's entry (by its display, else its value), when the pack maps it. */
export function skeletonOptionIdOf(
  ctx: SkeletonWhenContext,
  key: string,
  f: LedgerFact,
): string | undefined {
  const map = ctx.optionIds[key];
  if (!map) return undefined;
  return map[folded(f.display)] ?? (typeof f.value === 'string' ? map[folded(f.value)] : undefined);
}

function skeletonSeenOf(ctx: SkeletonWhenContext, key: string, f: LedgerFact): Set<string> {
  return new Set(
    [folded(f.value), folded(f.display), folded(skeletonOptionIdOf(ctx, key, f))].filter(
      (s) => s !== '',
    ),
  );
}

function skeletonValuesOf(ctx: SkeletonWhenContext, set: SkeletonValueSet): string[] | null {
  const list = Array.isArray(set) ? set : ctx.valueLists[set];
  return list ? list.map(folded) : null;
}

/**
 * Does a skeleton condition (`when`, `requires`) hold? The renderer's own
 * rule, moved here unchanged (T-577, AJ-577-M7) so the paragraph count's
 * mandatory clauses are read the same way.
 */
export function skeletonWhenHolds(c: SkeletonCondition, ctx: SkeletonWhenContext): boolean {
  if ('all_of' in c) return c.all_of.length > 0 && c.all_of.every((x) => skeletonWhenHolds(x, ctx));
  const entries = ctx.held.get(c.key) ?? [];
  // A key the ledger does not hold never satisfies a condition (Ajay, 10 Oct 2026).
  if (entries.length === 0) return false;
  if (c.present === true) return entries.some((f) => skeletonSeenOf(ctx, c.key, f).size > 0);
  if (c.in !== undefined) {
    const wanted = skeletonValuesOf(ctx, c.in);
    if (!wanted) return false;
    return entries.some((f) => {
      const seen = skeletonSeenOf(ctx, c.key, f);
      return wanted.some((w) => seen.has(w));
    });
  }
  if (c.not_in !== undefined) {
    const barred = skeletonValuesOf(ctx, c.not_in);
    if (!barred) return false;
    return entries.every((f) => {
      const seen = skeletonSeenOf(ctx, c.key, f);
      return seen.size > 0 && !barred.some((w) => seen.has(w));
    });
  }
  return false;
}

export function renderDraft(input: DraftRenderInput): DraftRenderResult {
  const { skeleton } = input;
  const held = factEntriesByKey(input.facts);
  const labels = input.labels ?? {};
  const clauseLabels = input.clauseLabels ?? {};
  const optionIds = input.optionIds ?? {};
  const valueLists = input.valueLists ?? {};
  const known = new Set(skeleton.clauses.map((c) => c.id));

  // Rule 1: a paragraph with no clauseId, or one the skeleton does not hold, is dropped.
  // Two paragraphs for one clause are read as one: first non-empty text, items joined.
  let dropped = 0;
  const byClause = new Map<string, ModelClause>();
  for (const p of input.output?.paragraphs ?? []) {
    if (!known.has(p.clauseId)) {
      dropped += 1;
      continue;
    }
    const seen = byClause.get(p.clauseId) ?? { text: '', items: new Map<string, string>() };
    if (seen.text.trim() === '' && p.text.trim() !== '') seen.text = p.text;
    for (const item of p.items) {
      if (item.text.trim() !== '' && !seen.items.has(item.factRef)) {
        seen.items.set(item.factRef, item.text);
      }
    }
    byClause.set(p.clauseId, seen);
  }

  const labelOf = (key: string): string => held.get(key)?.[0]?.label ?? labels[key] ?? key;
  // T-440 (Q2): a date's blank names its meaning, in lower case. Whether a
  // line prints is unchanged: an optional clause with none of its facts is
  // still left out (Q4), "Not known" or merely empty alike.
  const dateMeanings = new Map<string, string>();
  for (const item of input.checklist ?? []) {
    const meaning = dateMeaningOf(item);
    if (meaning !== null) dateMeanings.set(item.key, blankLabel(meaning));
  }
  const blankLabelOf = (key: string): string => dateMeanings.get(key) ?? labelOf(key);
  const notKnownInput = input.notKnownDates ?? [];
  const notKnown = new Set(
    'items' in notKnownInput ? notKnownDateKeys(notKnownInput) : notKnownInput,
  );
  /** Held, or a date answered "Not known" (printed as its blank): a clause reading it prints. */
  const given = (key: string): boolean => held.has(key) || notKnown.has(key);
  // T-577 (AJ-577-M7): the condition helpers live at module level
  // (skeletonWhenHolds), unchanged; renderDraft calls them with its own context.
  const whenContext: SkeletonWhenContext = { held, optionIds, valueLists };
  const optionIdOf = (key: string, f: LedgerFact): string | undefined =>
    skeletonOptionIdOf(whenContext, key, f);
  const holds = (c: SkeletonCondition): boolean => skeletonWhenHolds(c, whenContext);
  /** True when no key the condition reads is held: the clause's facts were not given. */
  const unheld = (c: SkeletonCondition | undefined): boolean =>
    conditionKeys(c).every((k) => !held.has(k));

  // Rule 4: one fact's entries, deduped; a sections slot on (code, number).
  const displayOf = (key: string, entries: readonly LedgerFact[]): string => {
    const out: string[] = [];
    const seen = new Set<string>();
    const segments = SECTION_KEYS.has(key)
      ? entries.flatMap((f) => f.display.split(/[,;]/))
      : entries.map((f) => f.display);
    for (const raw of segments) {
      // Ajay (T-334 Addendum 2): "Police Station {police_station}" never prints "Police Station PS ...".
      const s = key === 'police_station' ? stripPoliceStationPrefix(raw) : raw.trim();
      if (s === '') continue;
      const keys = SECTION_KEYS.has(key) ? sectionKeys(s) : [];
      const ids = keys.length > 0 ? keys : [folded(s)];
      if (ids.every((k) => seen.has(k))) continue;
      for (const k of ids) seen.add(k);
      out.push(s);
    }
    return out.join(', ');
  };

  const derivedValue = (d: SkeletonDerivedSlot): string | null => {
    for (const f of held.get(d.from) ?? []) {
      const id = optionIdOf(d.from, f);
      const v =
        (id !== undefined ? d.map[id] : undefined) ??
        (typeof f.value === 'string' ? d.map[f.value] : undefined) ??
        d.map[f.display];
      if (v) return v;
    }
    return null;
  };

  /** The ledger key each `{slot}` of a text reads (a derived slot reads its `from`). */
  const slotKeysOf = (text: string, derived: SkeletonClause['derived']): string[] =>
    [...text.matchAll(SLOT_RE)].map((m) => derived?.[m[1]]?.from ?? m[1]);

  /**
   * Fills `{slot}` in signed text from the ledger by slot key (rule 2, as
   * Ajay ruled for T-373): a slot prints `{{MISSING: label}}` only when the
   * ledger truly does not hold its fact.
   */
  const fill = (
    text: string,
    derived: SkeletonClause['derived'],
  ): { text: string; missing: string[] } => {
    const missing: string[] = [];
    const out = text.replace(SLOT_RE, (_m, slot: string) => {
      const d = derived?.[slot];
      const source = d ? d.from : slot;
      const value = d ? derivedValue(d) : held.has(slot) ? displayOf(slot, held.get(slot)!) : null;
      if (value) return value;
      const label = blankLabelOf(source);
      missing.push(label);
      return missingPlaceholder(label);
    });
    return { text: out, missing };
  };

  const clauseLabel = (c: SkeletonClause): string =>
    c.missing_label ??
    clauseLabels[c.id] ??
    (c.slot ? blankLabelOf(c.slot) : c.from ? blankLabelOf(c.from) : undefined) ??
    c.id;

  const outcome = (
    c: SkeletonClause,
    index: number,
    o: Partial<ClauseOutcome> & Pick<ClauseOutcome, 'text' | 'status'>,
  ): ClauseOutcome => ({
    clause: c,
    index,
    missing: [],
    printedItems: [],
    usedClauses: [],
    ...o,
  });

  const missingForm = (c: SkeletonClause, index: number): ClauseOutcome => {
    const label = clauseLabel(c);
    return outcome(c, index, {
      text: missingPlaceholder(label),
      status: 'missing',
      missing: [label],
    });
  };

  /** Rule 3: the model's own-words text passes the verifier against the referenced fact alone. */
  const keepsToFact = (text: string, entries: readonly LedgerFact[]): boolean => {
    const spans = entries.map((f) => folded(f.raw_span ?? ''));
    const statedInSpans = statedByValueIn(entries.map((f) => f.raw_span ?? ''));
    const violations = verifyDraft({ ...input.verifier, body: text, facts: entries });
    return !violations.some((v) => {
      if (!REJECTING_CHECKS.has(v.check)) return false;
      // A date or amount the advocate's raw_span states, by value (one shared rule).
      if (statedInSpans(v)) return false;
      // A banned phrase the advocate wrote is the advocate's own words, stated as that fact.
      if (
        v.check === 'banned' &&
        v.draftValue &&
        spans.some((s) => s.includes(folded(v.draftValue)))
      ) {
        return false;
      }
      return true;
    });
  };

  /**
   * `source: fixed` (rule 2): the signed text with its slots filled from the
   * ledger, whether or not the model returned a paragraph for it. A clause
   * with no slots (an undertaking) always prints. An optional clause none of
   * whose slot facts the ledger holds is left out.
   */
  const renderFixed = (c: SkeletonClause, index: number): ClauseOutcome | null => {
    let text = c.text;
    if (c.variants && c.variants.length > 0) {
      const v = c.variants.find((x) => holds(x.when));
      if (!v) return c.required ? missingForm(c, index) : null;
      text = v.text;
    }
    if (c.render_if_any_slot && !given(c.render_if_any_slot)) {
      return c.required ? missingForm(c, index) : null;
    }
    if (text === undefined) return c.required ? missingForm(c, index) : null;
    const keys = slotKeysOf(text, c.derived);
    if (!c.required && keys.length > 0 && keys.every((k) => !given(k))) return null;
    const filled = fill(text, c.derived);
    return outcome(c, index, {
      text: filled.text,
      status: filled.missing.length > 0 ? 'missing' : 'ok',
      missing: filled.missing,
    });
  };

  /**
   * One entry's own words: the model's text if it keeps to the entry, else
   * the advocate's words verbatim. Arjun's rulings (bcdf5b7): an altered date,
   * number, name or place, or a content word the advocate's `raw_span` does
   * not hold, falls back before the verifier runs, so its banned-phrase
   * exemption never rescues it.
   */
  const ownWords = (
    own: string | undefined,
    entry: LedgerFact,
  ): { words: string; reason?: FallbackReason } => {
    const text = (own ?? '').trim();
    const raw = (entry.raw_span ?? '').trim() || entry.display.trim();
    // The advocate's own words, as given (folding case, spacing and punctuation): never a fallback.
    if (sameAsRawSpan(text, raw)) return { words: text };
    if (
      text !== '' &&
      !ownWordsAlteredEntity(text, raw) &&
      !ownWordsAddedWord(text, raw) &&
      !ownWordsDroppedWord(text, raw) &&
      !ownWordsKeptWordChanged(text, raw) &&
      !ownWordsReordered(text, raw) &&
      keepsToFact(text, [entry])
    ) {
      return { words: text };
    }
    return {
      words: raw,
      reason: text === '' ? 'not_returned' : 'unverified',
    };
  };

  /**
   * `source: advocate` (rule 3), as Ajay ruled for T-373: with the fact held
   * the clause always prints, the model's text when it keeps to the fact,
   * else the advocate's words verbatim (status `fallback`). MISSING only when
   * the ledger does not hold the fact. A key with several entries (an own-words
   * list, e.g. the Magistrate grounds) prints one lettered item per entry,
   * each checked on its own against its entry.
   */
  const renderAdvocate = (
    c: SkeletonClause,
    index: number,
    model: ModelClause | undefined,
  ): ClauseOutcome | null => {
    const key = c.slot ?? c.from;
    const entries = key ? (held.get(key) ?? []) : [];
    if (!key || entries.length === 0) return c.required ? missingForm(c, index) : null;
    const results = entries.map((f, i) => {
      const own =
        entries.length === 1
          ? model?.text.trim() || model?.items.get(`${key}[0]`)
          : model?.items.get(`${key}[${i}]`);
      return ownWords(own, f);
    });
    const reasons = results.map((r) => r.reason).filter((r): r is FallbackReason => !!r);
    const reason: FallbackReason | undefined = reasons.includes('unverified')
      ? 'unverified'
      : reasons[0];
    const text =
      results.length === 1
        ? c.intro
          ? `${c.intro} ${results[0].words}`
          : results[0].words
        : [...(c.intro ? [c.intro] : []), ...lettered(results.map((r) => r.words))].join('\n');
    return outcome(c, index, {
      text,
      status: reason ? 'fallback' : 'ok',
      ...(reason ? { reason } : {}),
    });
  };

  /**
   * A list clause with signed sentences per option (the grounds): one item
   * per ticked option of `from`, from the ledger, whatever the model's items
   * say. An item with `use_clause` prints that clause's text in place, and
   * the standalone clause is then left out (Ajay, T-373).
   */
  const renderList = (
    c: SkeletonClause,
    index: number,
    firstPass: ReadonlyMap<string, ClauseOutcome>,
  ): ClauseOutcome | null => {
    const entries = c.from ? (held.get(c.from) ?? []) : [];
    if (!c.from || entries.length === 0) return c.required ? missingForm(c, index) : null;
    const lines: string[] = [];
    const missing: string[] = [];
    const printedItems: string[] = [];
    const usedClauses: string[] = [];
    const done = new Set<string>();
    for (const f of entries) {
      const id = optionIdOf(c.from, f) ?? folded(f.display);
      if (done.has(id)) continue;
      done.add(id);
      const item = c.items?.[id];
      let line: string;
      let blanks: string[] = [];
      if (!item) {
        blanks = [f.display.trim()];
        line = missingPlaceholder(blanks[0]);
      } else if (item.requires && !holds(item.requires)) {
        blanks = [item.missing_label ?? blankLabelOf(conditionKeys(item.requires)[0] ?? c.from)];
        line = missingPlaceholder(blanks[0]);
      } else if (item.use_clause) {
        const used = firstPass.get(item.use_clause);
        if (used) {
          line = used.text;
          blanks = used.missing;
          usedClauses.push(item.use_clause);
        } else {
          blanks = [item.missing_label ?? clauseLabels[item.use_clause] ?? item.use_clause];
          line = missingPlaceholder(blanks[0]);
        }
      } else if (item.text) {
        const filled = fill(item.text, c.derived);
        line = filled.text;
        blanks = filled.missing;
      } else {
        blanks = [item.missing_label ?? f.display.trim()];
        line = missingPlaceholder(blanks[0]);
      }
      missing.push(...blanks);
      lines.push(line);
      printedItems.push(`${c.id}.${id}`);
    }
    return outcome(c, index, {
      text: [...(c.intro ? [c.intro] : []), ...lettered(lines)].join('\n'),
      status: missing.length > 0 ? 'missing' : 'ok',
      missing,
      printedItems,
      usedClauses,
    });
  };

  /** A list with signed sentences per option; an own-words list has none and renders as an advocate clause. */
  const isOptionList = (c: SkeletonClause): boolean =>
    Boolean(c.list && c.from && c.items && Object.keys(c.items).length > 0);

  // First pass: every clause but the option lists (an item may print another clause's text).
  const firstPass = new Map<string, ClauseOutcome>();
  const outcomes: ClauseOutcome[] = [];
  const add = (o: ClauseOutcome | null): void => {
    if (!o) return;
    outcomes.push(o);
    firstPass.set(o.clause.id, o);
  };
  skeleton.clauses.forEach((c, index) => {
    if (isOptionList(c)) return;
    if (c.when && !holds(c.when)) {
      // Not applicable. A required clause whose facts were not given at all is a blank.
      if (c.required && unheld(c.when)) add(missingForm(c, index));
      return;
    }
    add(
      c.source === 'advocate'
        ? renderAdvocate(c, index, byClause.get(c.id))
        : renderFixed(c, index),
    );
  });
  skeleton.clauses.forEach((c, index) => {
    if (!isOptionList(c)) return;
    if (c.when && !holds(c.when)) {
      if (c.required && unheld(c.when)) outcomes.push(missingForm(c, index));
      return;
    }
    const o = renderList(c, index, firstPass);
    if (o) outcomes.push(o);
  });

  // A clause a list item printed in place prints once, there (use_clause).
  const usedInPlace = new Set(outcomes.flatMap((o) => o.usedClauses));
  const printed = new Set<string>(
    outcomes
      .filter((o) => !usedInPlace.has(o.clause.id))
      .flatMap((o) => [o.clause.id, ...o.printedItems]),
  );
  const kept = outcomes
    .filter((o) => !usedInPlace.has(o.clause.id))
    .filter((o) => !(o.clause.skip_if_rendered && printed.has(o.clause.skip_if_rendered)))
    .sort((a, b) => a.clause.order - b.clause.order || a.index - b.index);

  const paragraphs: RenderedParagraph[] = kept.map((o) => ({
    clauseId: o.clause.id,
    order: o.clause.order,
    text: o.text,
    status: o.status,
  }));
  return {
    body: paragraphs.map((p, i) => `${i + 1}. ${p.text}`).join('\n\n'),
    paragraphs,
    rendered: kept.map((o) => ({
      clauseId: o.clause.id,
      status: o.status,
      ...(o.missing.length > 0 ? { missing: o.missing } : {}),
      ...(o.reason ? { reason: o.reason } : {}),
    })),
    dropped,
    fallbacks: kept
      .filter((o) => o.reason)
      .map((o) => ({ clauseId: o.clause.id, reason: o.reason as FallbackReason })),
  };
}

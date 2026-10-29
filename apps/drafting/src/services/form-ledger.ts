/**
 * T-637: an in-memory fact ledger for one draft request.
 *
 * The T-611 delivery gate (fill, one repair, withhold; Ajay P1-P7) reads a
 * ledger. A request that has no persisted ledger (the Templates form route, and
 * the brief route with no ledger_id or with `feature.fact_ledger` off; Arjun,
 * 27 Oct 2026) gets one built here from what the advocate gave, for this
 * request only. It is never persisted: nothing here writes a FactLedger
 * document or needs an intake id.
 *
 * Every value goes through the ledger's own edit rule (fact-ledger.service.ts
 * applyEdit / applyMultiEdit): the same normalisers, the same "Not known" /
 * "none" no-fact answers, and an unreadable answer becomes `unresolved`.
 * This file holds no legal rule and no user-facing text. It never logs.
 */
import type { LedgerFact, LedgerUnresolvedFact } from '@lawie/shared';

import { O39_REQUIRED_FIELDS, requiredFieldBlockers } from '../config/intake/o39-confirm-messages';

import {
  applyEdit,
  factTypeFor,
  isLedgerItem,
  isMultiItem,
  referenceYear,
} from './fact-ledger.service';
import { buildChecklist } from './intake-brief';
import type { Brief, ChecklistItem } from './intake-brief';
import { normalise } from './intake-text';
import type { RulePack } from './rule-pack.service';

/**
 * Where a value came from, as the ledger records it. `user`: read from the
 * advocate's description. `asked`: typed, picked or edited by the advocate
 * (a form answer, a brief edit). Ajay FR-3: both are user-given and the
 * verifier treats them the same.
 */
export type LedgerValueSource = 'user' | 'asked';

/** One value for the ledger, keyed by the pack fact key (`<group>.<name>` or `<name>`). */
export interface LedgerValueInput {
  key: string;
  /** As sent: a string, a list, a boolean, a number. Anything else is unreadable. */
  value: unknown;
  source: LedgerValueSource;
}

export interface InMemoryLedgerState {
  facts: LedgerFact[];
  unresolved: LedgerUnresolvedFact[];
}

/**
 * Ajay FR-9 (4813ba79): answers that give no fact. The blank stays and P6
 * asks. Matched on the whole answer, trimmed, case-insensitive, nukta-
 * insensitive (`foldNonAnswer`), on any item; also the `not_known` option id
 * and an option whose label folds to "Not known".
 */
export const NO_FACT_ANSWERS: readonly string[] = [
  'not known',
  'unknown',
  'नहीं पता',
  'पता नहीं',
  '?',
  '-',
];

/**
 * Ajay FR-9 (4813ba79): answers that stay facts (they drive the signed none
 * variants) but are never printed into a blank (`withoutNeverFilledFacts`).
 */
export const NEVER_FILLED_ANSWERS: readonly string[] = ['none', 'nil', 'NA', 'N/A', 'no'];

/** The option id of a "Not known" choice. */
const NOT_KNOWN_OPTION_ID = 'not_known';

/**
 * An answer as FR-9 compares it: trimmed, inner spaces collapsed, lower case,
 * with the Devanagari nukta (U+093C) taken out. Unlike foldAnswer it keeps
 * `-` and `?`, which are whole answers here.
 */
export function foldNonAnswer(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\u093C/g, '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

const NO_FACT_FOLDED: ReadonlySet<string> = new Set(NO_FACT_ANSWERS.map(foldNonAnswer));
const NEVER_FILLED_FOLDED: ReadonlySet<string> = new Set(NEVER_FILLED_ANSWERS.map(foldNonAnswer));

/** FR-9: true when the whole answer is one that gives no fact. */
export function isNoFactNonAnswer(text: string): boolean {
  const raw = text.trim();
  if (raw === '') return false;
  return raw.toLowerCase() === NOT_KNOWN_OPTION_ID || NO_FACT_FOLDED.has(foldNonAnswer(raw));
}

/**
 * FR-9: the facts the gate may print into a blank: every fact but one whose
 * display folds to a NEVER_FILLED_ANSWERS answer. Those stay in the ledger;
 * only the gate's fill, repair and held-blank count read this list.
 */
export function withoutNeverFilledFacts(facts: readonly LedgerFact[]): LedgerFact[] {
  return facts.filter(
    (f) => !(typeof f.display === 'string' && NEVER_FILLED_FOLDED.has(foldNonAnswer(f.display))),
  );
}

/** A value already showing a placeholder blank is not an answer. */
const BLANK_VALUE = /\[To be confirmed:|\{\{\s*MISSING\s*:|^_{3,}$/i;

/** The option label for a choice value sent as its option id (the form sends ids). */
function optionLabel(item: ChecklistItem, value: string): string {
  const v = value.trim();
  if (item.options.length === 0) return v;
  const nv = normalise(v);
  // Already a label (the brief sends labels): kept.
  if (item.options.some((o) => normalise(o) === nv)) return v;
  const ids = item.optionIds ?? [];
  const at = ids.findIndex((id) => normalise(id) === nv);
  return at >= 0 && at < item.options.length ? item.options[at] : v;
}

/** A boolean as the Yes / No choice the checklist gives a boolean fact. */
function booleanText(item: ChecklistItem, value: boolean): string {
  return optionLabel(item, value ? 'Yes' : 'No');
}

/**
 * The value as the edit text applyEdit reads: a string for one value, a list
 * for a list or several choices. Undefined: nothing was given (no fact).
 * Null: something was given that cannot be read as text (unresolved).
 */
function editText(item: ChecklistItem, value: unknown): string | string[] | undefined | null {
  if (value === undefined || value === null) return undefined;
  const one = (v: unknown): string | undefined | null => {
    if (typeof v === 'string') {
      const t = v.trim();
      if (t === '' || BLANK_VALUE.test(t)) return undefined;
      // FR-9: a non-answer (typed, the `not_known` id, or its option label) is no fact.
      if (isNoFactNonAnswer(t)) return undefined;
      const text = item.options.length > 0 ? optionLabel(item, t) : t;
      return isNoFactNonAnswer(text) ? undefined : text;
    }
    if (typeof v === 'boolean') return booleanText(item, v);
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null;
    return null;
  };
  if (Array.isArray(value)) {
    const read = value.map(one);
    if (read.some((r) => r === null)) return null;
    const texts = read.filter((r): r is string => typeof r === 'string');
    if (texts.length === 0) return undefined;
    if (isMultiItem(item)) return texts;
    // A checkbox array on a one-value fact: one entry is that value; several
    // are read as one text, which a choice does not accept (unresolved).
    return texts.length === 1 ? texts[0] : texts.join(', ');
  }
  const text = one(value);
  if (text === undefined || text === null) return text;
  return isMultiItem(item) ? [text] : text;
}

/** An unresolved entry for a value that is not text at all (never its contents). */
function notAString(item: ChecklistItem, source: LedgerValueSource): LedgerUnresolvedFact {
  return {
    id: `request:${item.key}`,
    key: item.key,
    label: item.label,
    type: factTypeFor(item),
    raw_span: '',
    source,
    reason: 'not_a_string',
    detail: 'The value is not text.',
  };
}

/**
 * The ledger for one request, from the pack's checklist (buildChecklist: on a
 * court document the court / forum facts are left out, as on the brief path)
 * and the values given. A key the checklist does not hold is skipped. A later
 * value for the same key replaces an earlier one. Facts carry the value's
 * source (`user` or `asked`).
 */
export function buildInMemoryLedger(
  pack: RulePack,
  values: readonly LedgerValueInput[],
  now: Date = new Date(),
): InMemoryLedgerState {
  const byKey = new Map(
    buildChecklist(pack)
      .filter(isLedgerItem)
      .map((i) => [i.key, i] as const),
  );
  const refYear = referenceYear(now);
  const last = new Map<string, LedgerValueInput>();
  for (const v of values) if (byKey.has(v.key)) last.set(v.key, v);

  let state: InMemoryLedgerState = { facts: [], unresolved: [] };
  for (const [key, given] of last) {
    const item = byKey.get(key) as ChecklistItem;
    const text = editText(item, given.value);
    if (text === undefined) continue;
    if (text === null) {
      state = {
        facts: state.facts,
        unresolved: [...state.unresolved, notAString(item, given.source)],
      };
      continue;
    }
    // fromQuestion: an answer that cannot be read stays outstanding (unresolved).
    const { next } = applyEdit(state, item, { key, text, fromQuestion: true }, refYear);
    if (!next) continue;
    state = next;
    if (given.source === 'user') {
      // applyEdit writes an advocate edit as `asked`; a value read from the
      // description keeps `user`, as the extraction pass writes it.
      state = {
        facts: state.facts.map((f) => (f.key === key ? { ...f, source: 'user' } : f)),
        unresolved: state.unresolved.map((u) => (u.key === key ? { ...u, source: 'user' } : u)),
      };
    }
  }
  return state;
}

/** Ajay FR-3: every form answer enters the ledger as `asked`. Keys are the form field ids. */
export function formLedgerValues(formData: Readonly<Record<string, unknown>>): LedgerValueInput[] {
  return Object.entries(formData).map(([key, value]) => ({ key, value, source: 'asked' }));
}

/**
 * The confirmed brief's values, as the persisted ledger would hold them
 * (overlayBrief): a value read from the description is `user`; one the
 * advocate typed or edited is `asked`. "Not known" (asked_empty) and a
 * description "none" not yet confirmed (unconfirmed) are no fact.
 */
export function briefLedgerValues(brief: Pick<Brief, 'items'>): LedgerValueInput[] {
  const out: LedgerValueInput[] = [];
  for (const item of brief.items) {
    if (item.asked_empty === true || item.unconfirmed === true) continue;
    if (item.value === null || item.source === null) continue;
    out.push({
      key: item.key,
      value: item.value,
      source: item.source === 'description' ? 'user' : 'asked',
    });
  }
  return out;
}

/** The pack whose form route runs the T-629 required-field pre-check. */
const O39_TEMPLATE_ID = 'temporary_injunction_o39';

/**
 * The form route's 400 body when a required O.39 field is empty or a non-
 * answer. Same shape as generate-from-brief's `brief_not_confirmed` (error,
 * message, blockers), with the blocking field ids added.
 */
export interface FormRequiredFieldBlock {
  error: 'brief_not_confirmed';
  /** The signed §(g) EN lines, one per line, in §(j)2 order. */
  message: string;
  blockers: ['required_fields'];
  /** The blocking field ids, in the same order as the lines. */
  confirm_blocking_keys: string[];
}

/**
 * The O.39 required fields as the §(j)3 check reads them. form_data is
 * unchecked JSON: a string, null, undefined or a list of strings is kept; any
 * other value (an object, a boolean, a number, a list holding a non-string)
 * is no answer and becomes '', so it blocks rather than passing as answered.
 */
function requiredFieldView(formData: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const view: Record<string, unknown> = {};
  for (const key of O39_REQUIRED_FIELDS) {
    const v = Object.prototype.hasOwnProperty.call(formData, key) ? formData[key] : undefined;
    const readable =
      v === null ||
      v === undefined ||
      typeof v === 'string' ||
      (Array.isArray(v) && v.every((e) => typeof e === 'string'));
    view[key] = readable ? v : '';
  }
  return view;
}

/**
 * T-629 blocks_confirm / Ajay FR-1(b), FR-5, FR-5a; T-613 §(g), §(j)2, §(j)3:
 * the form route's required-field and non-answer pre-check (plaintiff_name,
 * defendant_name (T-644, AJ-644-M1), main_suit_relief, restraint_sought on
 * temporary_injunction_o39), run right after
 * the plan check, before validateFormData (FR-5: an empty answer gets the
 * signed lines too) and before any Ink hold. The form field ids are the pack
 * keys (the promoted O.39 form keeps them; no alias renames them). The text
 * comes only from o39-confirm-messages.ts. Every other template: null.
 */
export function formRequiredFieldBlock(
  templateId: string,
  formData: Readonly<Record<string, unknown>>,
): FormRequiredFieldBlock | null {
  if (templateId !== O39_TEMPLATE_ID) return null;
  const missing = requiredFieldBlockers(requiredFieldView(formData));
  if (missing.length === 0) return null;
  return {
    error: 'brief_not_confirmed',
    message: missing.map((b) => b.en).join('\n'),
    blockers: ['required_fields'],
    confirm_blocking_keys: missing.map((b) => b.key),
  };
}

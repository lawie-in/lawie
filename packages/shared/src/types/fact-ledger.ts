/**
 * The Fact Ledger (ADR-022 section 2A, T-147a).
 *
 * The canonical record of every fact the advocate gave for a matter. Each fact
 * carries a machine `value` (what checks compare) and a `display` (what the
 * draft prints). A fact the normalizer could not resolve without guessing goes
 * to `unresolved` with a reason, never into `facts` with a default.
 *
 * Types only. Producing a ledger is T-147b; checking a draft against it is T-147d.
 */

/** The closed set of fact types (ADR-022 section 2A). */
export type FactType =
  | 'amount'
  | 'date'
  | 'person_name'
  | 'place_name'
  | 'police_station'
  | 'court'
  | 'section_ref'
  | 'case_number'
  | 'text'
  | 'enum'
  | 'boolean';

export const FACT_TYPES: readonly FactType[] = [
  'amount',
  'date',
  'person_name',
  'place_name',
  'police_station',
  'court',
  'section_ref',
  'case_number',
  'text',
  'enum',
  'boolean',
] as const;

/** Whether the ledger came from a real advocate's matter or a test fixture. */
export type FactLedgerRunType = 'user' | 'fixture';

/**
 * Where a fact came from. First-pass set: the advocate's free description, an
 * answer to a Reception question, or a fixture file. T-147b may extend it.
 */
export type FactSource = 'description' | 'answer' | 'fixture';

/** A statute section, normalised: `S.483 BNSS` and `Section 483 of the BNSS, 2023` are both `{ act: 'BNSS', section: '483' }`. */
export interface SectionRef {
  /** Canonical act id, e.g. `BNSS`, `BNS`, `IPC`. */
  act: string;
  /** Section number with any letter suffix and sub-clauses: `483`, `498A`, `480(1)(a)`. */
  section: string;
}

interface FactBase {
  id: string;
  label: string;
  /** What the draft prints, in Indian format or the advocate's own spelling. */
  display: string;
  /** The advocate's words the fact was read from, exactly as written. */
  raw_span: string;
  source: FactSource;
  /** 0 to 1. See the per-type floors in `utils/normalize/confidence`. */
  confidence: number;
  required_in_draft: boolean;
}

/** Rupees. `3 lakh` is 300000. May carry paise (two decimals at most). */
export interface AmountFact extends FactBase {
  type: 'amount';
  value: number;
}

/** ISO calendar date, `YYYY-MM-DD`. */
export interface DateFact extends FactBase {
  type: 'date';
  value: string;
}

/**
 * For names, places, stations and courts `value` is the comparison key
 * (case-, space- and punctuation-folded). `display` keeps the advocate's
 * spelling; the key is never printed.
 */
export interface PersonNameFact extends FactBase {
  type: 'person_name';
  value: string;
}

export interface PlaceNameFact extends FactBase {
  type: 'place_name';
  value: string;
}

export interface PoliceStationFact extends FactBase {
  type: 'police_station';
  value: string;
}

export interface CourtFact extends FactBase {
  type: 'court';
  value: string;
}

export interface SectionRefFact extends FactBase {
  type: 'section_ref';
  value: SectionRef;
}

/** Comparison key of the case number: Arabic digits, upper case, letters and digits only. */
export interface CaseNumberFact extends FactBase {
  type: 'case_number';
  value: string;
}

export interface TextFact extends FactBase {
  type: 'text';
  value: string;
}

export interface EnumFact extends FactBase {
  type: 'enum';
  value: string;
}

export interface BooleanFact extends FactBase {
  type: 'boolean';
  value: boolean;
}

/** One fact. Discriminated on `type`, so `value` is typed per kind. */
export type Fact =
  | AmountFact
  | DateFact
  | PersonNameFact
  | PlaceNameFact
  | PoliceStationFact
  | CourtFact
  | SectionRefFact
  | CaseNumberFact
  | TextFact
  | EnumFact
  | BooleanFact;

/** The `value` type for a given fact type: `FactValue<'amount'>` is `number`. */
export type FactValue<T extends FactType> = Extract<Fact, { type: T }>['value'];

/** Why a value could not be normalised without guessing. */
export type UnresolvedReason =
  | 'not_a_string'
  | 'empty'
  | 'unrecognised'
  | 'negative_amount'
  | 'bad_digit_grouping'
  | 'fractional_paise'
  | 'amount_too_large'
  | 'two_digit_year_needs_reference'
  | 'two_digit_year_ambiguous'
  | 'day_month_out_of_range'
  | 'unknown_month'
  | 'missing_year'
  | 'missing_act'
  | 'missing_section'
  | 'unknown_act'
  | 'act_year_mismatch'
  | 'multiple_sections';

/** A fact the advocate gave that Reception must ask about rather than guess. */
export interface UnresolvedFact {
  id: string;
  label: string;
  type: FactType;
  raw_span: string;
  source: FactSource;
  reason: UnresolvedReason;
  /** One plain sentence on what is ambiguous. */
  detail: string;
}

export interface FactLedger {
  matterId: string;
  rulePackId: string;
  runType: FactLedgerRunType;
  facts: Fact[];
  unresolved: UnresolvedFact[];
}

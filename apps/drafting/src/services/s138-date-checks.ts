/**
 * T-192: the two s.138 NI Act date checks, worked out by code.
 *
 * LEGAL CONTENT. The logic, the labels and every line below are Ajay's, signed
 * in `handoff/legal/T-192-s138-date-checks-signed.md` (with Addendum 1). Do not
 * reword a label or a line without his sign-off.
 *
 * - Proviso (a): the cheque was presented within its validity: the earlier of
 *   the date on the cheque plus 3 calendar months (month-end clamped) and the
 *   last date of validity printed on it, if any.
 * - Proviso (b): the notice is sent within 30 days of receiving the return memo.
 * - Counting is General Clauses Act 1897, s.9: the first day is excluded and the
 *   last day included. A month is a calendar month.
 *
 * Arjun's convention (T-192, 12 Oct 2026):
 * - Inputs are ledger facts with source `user` or `asked` only: never a
 *   computed fact, never model text.
 * - A computed fact is derived on every request and never stored. One is
 *   added only when its check passes (A1 or B1), with `source: 'computed'` and
 *   `required_in_draft: false`. A fail or a missing input adds nothing, so the
 *   banned entry stays banned.
 *
 * Pure: no I/O, no clock, no logging. All date arithmetic is in UTC.
 *
 * Applies to `legal_notice_s138` only. `ni_complaint_s138` will inherit the
 * averment file later and overrides both entries back to banned (Addendum 1);
 * extending these checks to the complaint needs a separate ticket and sign-off.
 */
import { formatIndianDate } from '@lawie/shared';
import type { LedgerFact } from '@lawie/shared';

export const S138_PACK_ID = 'legal_notice_s138';

/** The ledger key of each input (L1 and L3 are the pack's existing fields). */
export const S138_INPUT_KEYS = {
  L1: 'cheque_date',
  L2: 'cheque_validity_date',
  L3: 'presentation_date',
  L4: 'memo_received_date',
  L5: 'notice_sent_date',
} as const;

export type S138Input = keyof typeof S138_INPUT_KEYS;

/** Ajay's exact labels. Used in every `[To be confirmed: label]`. */
export const S138_INPUT_LABELS: Record<S138Input, string> = {
  L1: 'Date on the cheque',
  L2: 'Last date of validity printed on the cheque, if any',
  L3: 'Date the cheque was presented to the bank',
  L4: 'Date the return memo was received',
  L5: 'Date the notice is sent',
};

/** The keys of the computed facts. The averment file unlocks on these. */
export const S138_COMPUTED_KEYS = {
  a: 's138_presented_within_validity',
  b: 's138_notice_within_thirty_days',
} as const;

/** Labels of the computed facts: never shown as the advocate's own fact. */
export const S138_COMPUTED_LABELS = {
  a: 'Presented in time (worked out from your dates)',
  b: 'Notice in time (worked out from your dates)',
} as const;

/**
 * The computed facts' displays in the Drafter's FACTS (Ajay, Addendum 2).
 * Neutral on purpose: the A1/B1 lines are for the advocate's brief only, and
 * the notice may say only the signed twin texts.
 */
export const S138_COMPUTED_DISPLAYS = {
  a: 'Presented in time: yes (checked by Lawie from the dates given)',
  b: 'Notice in time: yes (checked by Lawie from the dates given)',
} as const;

export type S138LineA = 'A1' | 'A2' | 'A3' | 'A4';
export type S138LineB = 'B1' | 'B2' | 'B3' | 'B4' | 'B5';
export type S138Line = S138LineA | S138LineB;

/**
 * The result lines, exactly as signed. `{L1}`, `{L3}`, `{L4}`, `{L5}` and
 * `{end}` are dates in the `10 January 2026` form. A4, B4 and B5 are followed
 * by one `S138_BLANK` per missing input.
 */
export const S138_LINE_TEXTS: Record<S138Line, string> = {
  A1: 'Presented in time: the cheque dated {L1} was presented on {L3}, within its validity, which ended on {end}.',
  A2: 'Not presented in time: the cheque dated {L1} was presented on {L3}, after its validity ended on {end}. Check the dates before sending the notice.',
  A3: 'Check the dates: the cheque was presented on {L3}, before the date on the cheque, {L1}.',
  A4: 'Presentation in time not checked.',
  B1: 'Notice in time: the return memo was received on {L4} and the notice is sent on {L5}, within 30 days (last day {end}).',
  B2: 'Notice not in time: the notice is sent on {L5}, after {end}, the last of the 30 days from receipt of the return memo on {L4}. Check the dates before sending.',
  B3: 'Check the dates: the notice is sent on {L5}, before the return memo was received on {L4}.',
  B4: 'Send the notice on or before {end} (30 days from receipt of the return memo on {L4}).',
  B5: 'Notice in time not checked.',
};

/** The visible blank for a missing input. */
export const S138_BLANK = '[To be confirmed: {label}]';

/** Months added to the date on the cheque (RBI validity, as signed). */
export const S138_VALIDITY_MONTHS = 3;
/** Days after receipt of the return memo within which the notice is sent. */
export const S138_NOTICE_DAYS = 30;

export interface S138ResultA {
  line: S138LineA;
  /** The line as the advocate reads it, blanks included. */
  text: string;
  /** ISO inputs; null when not given (or not usable, see `missing`). */
  inputs: { L1: string | null; L2: string | null; L3: string | null };
  /** ISO end of validity; null when it could not be worked out. */
  end: string | null;
  /** The inputs that are missing, in order. Empty unless the line is A4. */
  missing: S138Input[];
}

export interface S138ResultB {
  line: S138LineB;
  text: string;
  inputs: { L4: string | null; L5: string | null };
  /** ISO last day for the notice; null when L4 is missing. */
  end: string | null;
  /** The inputs that are missing, in order. Empty unless the line is B4 or B5. */
  missing: S138Input[];
}

export interface S138DateChecks {
  a: S138ResultA;
  b: S138ResultB;
  /**
   * Only the facts of the checks that passed (A1, B1), with the neutral
   * displays of `S138_COMPUTED_DISPLAYS`. Never stored.
   */
  computedFacts: LedgerFact[];
}

// ── Dates (UTC, ISO YYYY-MM-DD) ─────────────────────────────────────────────

interface Ymd {
  y: number;
  m: number;
  d: number;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date in ISO form, or null. */
function parseIso(value: unknown): Ymd | null {
  if (typeof value !== 'string') return null;
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return { y, m, d };
}

function toIso({ y, m, d }: Ymd): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function daysInMonthUtc(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * The same date number `months` calendar months later, or the last day of
 * that month when the number does not exist (30 Nov + 3 -> 28/29 Feb).
 */
export function addCalendarMonths(iso: string, months: number): string {
  const p = parseIso(iso);
  if (!p) throw new Error('addCalendarMonths: not an ISO date');
  const index = p.y * 12 + (p.m - 1) + months;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return toIso({ y, m, d: Math.min(p.d, daysInMonthUtc(y, m)) });
}

/** `days` days later. With s.9 counting, L4 + 30 is the last of the 30 days. */
export function addDays(iso: string, days: number): string {
  const p = parseIso(iso);
  if (!p) throw new Error('addDays: not an ISO date');
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  return toIso({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() });
}

/** `2026-01-10` -> `10 January 2026`. */
export function s138DateText(iso: string): string {
  const p = parseIso(iso);
  if (!p) throw new Error('s138DateText: not an ISO date');
  return formatIndianDate(p.y, p.m, p.d);
}

// ── Lines ───────────────────────────────────────────────────────────────────

/** A signed line with its dates filled in (ISO in, `10 January 2026` out). */
export function formatS138Line(
  line: S138Line,
  dates: Partial<Record<'L1' | 'L3' | 'L4' | 'L5' | 'end', string>>,
  missing: readonly S138Input[] = [],
): string {
  const text = S138_LINE_TEXTS[line].replace(
    /\{(L1|L3|L4|L5|end)\}/g,
    (match, name: 'L1' | 'L3' | 'L4' | 'L5' | 'end') => {
      const iso = dates[name];
      return iso ? s138DateText(iso) : match;
    },
  );
  const blanks = missing.map((k) => S138_BLANK.replace('{label}', S138_INPUT_LABELS[k]));
  return [text, ...blanks].join(' ');
}

// ── Inputs ──────────────────────────────────────────────────────────────────

type Read = { state: 'none' } | { state: 'ok'; iso: string } | { state: 'unusable' };

/**
 * One input, from `user`/`asked` facts only. Fails closed: a key that is
 * unresolved in the ledger (Ajay, Addendum 2), an entry that is not a real
 * ISO date, or two entries with different dates make the input unusable,
 * which counts as missing.
 */
function readInput(
  facts: readonly LedgerFact[],
  key: string,
  unresolved: ReadonlySet<string>,
): Read {
  if (unresolved.has(key)) return { state: 'unusable' };
  const entries = facts.filter(
    (f) => f.key === key && (f.source === 'user' || f.source === 'asked'),
  );
  if (entries.length === 0) return { state: 'none' };
  const seen = new Set<string>();
  for (const f of entries) {
    if (f.type !== 'date' || !parseIso(f.value)) return { state: 'unusable' };
    seen.add(f.value);
  }
  if (seen.size !== 1) return { state: 'unusable' };
  return { state: 'ok', iso: [...seen][0] };
}

const isoOf = (r: Read): string | null => (r.state === 'ok' ? r.iso : null);

// ── The checks ──────────────────────────────────────────────────────────────

function checkA(facts: readonly LedgerFact[], unresolved: ReadonlySet<string>): S138ResultA {
  const r1 = readInput(facts, S138_INPUT_KEYS.L1, unresolved);
  const r2 = readInput(facts, S138_INPUT_KEYS.L2, unresolved);
  const r3 = readInput(facts, S138_INPUT_KEYS.L3, unresolved);
  const inputs = { L1: isoOf(r1), L2: isoOf(r2), L3: isoOf(r3) };
  const missing: S138Input[] = [];
  if (r1.state !== 'ok') missing.push('L1');
  // A truly absent L2 is not a missing input (the check uses 3 months). An L2
  // that was given but is unresolved or cannot be read is (Ajay, Addendum 2):
  // no fallback to 3 months.
  if (r2.state === 'unusable') missing.push('L2');
  if (r3.state !== 'ok') missing.push('L3');
  if (missing.length > 0 || !inputs.L1 || !inputs.L3) {
    return { line: 'A4', text: formatS138Line('A4', {}, missing), inputs, end: null, missing };
  }
  const L1 = inputs.L1;
  const L3 = inputs.L3;
  const threeMonths = addCalendarMonths(L1, S138_VALIDITY_MONTHS);
  // ISO strings compare as dates.
  const end = inputs.L2 && inputs.L2 < threeMonths ? inputs.L2 : threeMonths;
  if (L3 < L1) {
    return { line: 'A3', text: formatS138Line('A3', { L1, L3 }), inputs, end, missing };
  }
  if (L3 > end) {
    return { line: 'A2', text: formatS138Line('A2', { L1, L3, end }), inputs, end, missing };
  }
  return { line: 'A1', text: formatS138Line('A1', { L1, L3, end }), inputs, end, missing };
}

function checkB(facts: readonly LedgerFact[], unresolved: ReadonlySet<string>): S138ResultB {
  const r4 = readInput(facts, S138_INPUT_KEYS.L4, unresolved);
  const r5 = readInput(facts, S138_INPUT_KEYS.L5, unresolved);
  const inputs = { L4: isoOf(r4), L5: isoOf(r5) };
  if (!inputs.L4) {
    const missing: S138Input[] = inputs.L5 ? ['L4'] : ['L4', 'L5'];
    return { line: 'B5', text: formatS138Line('B5', {}, missing), inputs, end: null, missing };
  }
  const L4 = inputs.L4;
  const end = addDays(L4, S138_NOTICE_DAYS);
  if (!inputs.L5) {
    const missing: S138Input[] = ['L5'];
    return { line: 'B4', text: formatS138Line('B4', { L4, end }, missing), inputs, end, missing };
  }
  const L5 = inputs.L5;
  if (L5 < L4) {
    return { line: 'B3', text: formatS138Line('B3', { L4, L5 }), inputs, end, missing: [] };
  }
  if (L5 > end) {
    return { line: 'B2', text: formatS138Line('B2', { L4, L5, end }), inputs, end, missing: [] };
  }
  return { line: 'B1', text: formatS138Line('B1', { L4, L5, end }), inputs, end, missing: [] };
}

function computedFact(which: 'a' | 'b'): LedgerFact {
  return {
    id: `computed:${S138_COMPUTED_KEYS[which]}`,
    key: S138_COMPUTED_KEYS[which],
    label: S138_COMPUTED_LABELS[which],
    type: 'boolean',
    value: true,
    display: S138_COMPUTED_DISPLAYS[which],
    raw_span: '',
    source: 'computed',
    confidence: 1,
    required_in_draft: false,
  };
}

/**
 * Both checks for one request. `unresolvedKeys` are the keys of the ledger's
 * unresolved items: an input among them counts as missing. For any pack but
 * `legal_notice_s138` the results are still worked out (for tests) but no
 * computed fact is returned.
 */
export function s138DateChecks(
  facts: readonly LedgerFact[],
  packId: string,
  unresolvedKeys: Iterable<string> = [],
): S138DateChecks {
  const unresolved = new Set(unresolvedKeys);
  const a = checkA(facts, unresolved);
  const b = checkB(facts, unresolved);
  const computedFacts: LedgerFact[] = [];
  if (packId === S138_PACK_ID) {
    if (a.line === 'A1') computedFacts.push(computedFact('a'));
    if (b.line === 'B1') computedFacts.push(computedFact('b'));
  }
  return { a, b, computedFacts };
}

const COMPUTED_KEY_SET: ReadonlySet<string> = new Set(Object.values(S138_COMPUTED_KEYS));

/**
 * The facts the Drafter and every check read for this request: the stored
 * facts, without any fact under a computed key or with source `computed`
 * (only this module makes those, per request), plus the computed facts of
 * the checks that passed. An input whose key is in `unresolvedKeys` counts as
 * missing. For any other pack the facts are returned as given.
 */
export function withS138DateChecks(
  facts: readonly LedgerFact[],
  packId: string,
  unresolvedKeys: Iterable<string> = [],
): LedgerFact[] {
  if (packId !== S138_PACK_ID) return [...facts];
  const stored = facts.filter((f) => f.source !== 'computed' && !COMPUTED_KEY_SET.has(f.key));
  return [...stored, ...s138DateChecks(stored, packId, unresolvedKeys).computedFacts];
}

/**
 * T-472: limitation, computed by code from signed dates (pure, no I/O).
 *
 * LEGAL CONTENT. Every printed text below is Ajay's, byte for byte, from
 * handoff/legal/T-245-old-new-law-switch-signed.md: section "Anushka run 4
 * (16 Oct 2026)", item "T-472 (v1 blocker)", and "T-472 follow-up: copy time,
 * missing copy dates, article wording, numbering (Ajay, 16 Oct 2026)"
 * (441ef1e8). Any other wording goes back to him.
 *
 * The rule (Ajay): the model never states that a filing is within limitation.
 * Limitation is computed by code from signed dates, or it is a blank. No
 * yes/no "within limitation" field decides the paragraph.
 *
 * Counting:
 * - The period runs from the date of the impugned order. The day of the order
 *   is excluded (s.12(1) Limitation Act, 1963); the filing day counts. So the
 *   days counted are the days after the order up to and including the filing day.
 * - Whether a certified copy was applied for is asked (Ajay, follow-up (2)).
 *   "No": nothing is excluded. Not answered: unknown.
 * - "Yes": s.12(2) excludes the days from the date the copy was applied for to
 *   the date it was ready for delivery (both included), as far as they fall
 *   inside that span. The ready date is the end; there is no fallback to the
 *   date it was received (Ajay, follow-up (1)). "Yes" with the applied date or
 *   the ready date missing: unknown.
 * - The exclusion is given only when the copy was applied for on or before the
 *   last day of the period (counted without any exclusion). An application
 *   made after the period ran out excludes nothing (`verify`).
 * - Within: days counted (after exclusion) <= the period. Otherwise the days
 *   of delay are the days counted beyond the period.
 * - Unknown (the blank, no day count, no ledger fact): the order date or the
 *   filing date not given or not readable; the copy question not answered;
 *   "Yes" with a copy date missing or not readable; or dates that cannot all be
 *   true (filing before the order, copy applied for before the order, copy
 *   ready before it was applied for). A value the ledger holds as unresolved,
 *   or two different values for one input, is unknown.
 * - Not computed: s.4 (court closed on the last day), s.5 sufficiency, or any
 *   other ground. Lawie never decides those.
 */
import type { LedgerFact } from '@lawie/shared';

import { parseLawDate } from './law-switch';

// ── Ajay's signed text (T-472), byte for byte ───────────────────────────────

/** Within the period (computed). `{article/section}` is the pack's provision. */
export const LIMITATION_WITHIN_TEXT =
  'The present petition is filed within the period of limitation prescribed under {article/section}.';

/**
 * Beyond the period (computed). The day-count blank is replaced only by a
 * count the code computed.
 */
export const LIMITATION_BEYOND_TEXT =
  'The present petition is filed after the period of limitation prescribed under {article/section}, with a delay of [To be confirmed: number of days of delay]. The petitioner has filed a separate application under Section 5 of the Limitation Act, 1963 for condonation of the delay, which may be read as part of this petition.';

/** Any input unknown. Nothing is computed. */
export const LIMITATION_UNKNOWN_TEXT =
  '[To be confirmed: whether the petition is within limitation]';

/** The token in the two computed texts that takes the pack's provision. */
const PROVISION_TOKEN = '{article/section}';
/** The day-count blank in the beyond text. */
const DELAY_DAYS_BLANK = '[To be confirmed: number of days of delay]';

/** The signed filing-checklist line, only when the delay paragraph is printed (follow-up). */
export const LIMITATION_S5_CHECKLIST_ITEM =
  'Application under Section 5 of the Limitation Act, 1963 for condonation of delay, supported by an affidavit stating the cause of the delay.';

// ── Per-pack rules ──────────────────────────────────────────────────────────

/** The case values a pack's limitation is read from. */
export interface LimitationInputKeys {
  orderDate: string;
  filingDate: string;
  /** Yes/no: was a certified copy applied for. */
  copyAppliedFor: string;
  copyApplied: string;
  copyReady: string;
}

export interface LimitationRule {
  packId: string;
  /** The period, in days. */
  periodDays: number;
  /** What `{article/section}` prints. */
  provision: string;
  inputKeys: LimitationInputKeys;
}

/**
 * The packs whose limitation is computed. T-472: criminal_revision only; the
 * other packs Ajay lists come in T-474, each with its own signed provision.
 * criminal_revision's provision and period are Ajay's follow-up (3):
 * "Article 131 of the Schedule to the Limitation Act, 1963" (revision: 90
 * days from the order).
 */
export const LIMITATION_RULES: Readonly<Record<string, LimitationRule>> = {
  criminal_revision: {
    packId: 'criminal_revision',
    periodDays: 90,
    provision: 'Article 131 of the Schedule to the Limitation Act, 1963',
    inputKeys: {
      orderDate: 'impugned_order_date',
      filingDate: 'filing_date',
      copyAppliedFor: 'certified_copy_applied_for',
      copyApplied: 'certified_copy_applied',
      copyReady: 'certified_copy_ready',
    },
  },
};

/** The pack's limitation rule, or null for a pack whose limitation is not computed. */
export function limitationRuleFor(packId: string): LimitationRule | null {
  return Object.prototype.hasOwnProperty.call(LIMITATION_RULES, packId)
    ? LIMITATION_RULES[packId]
    : null;
}

// ── Dates ───────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days from one ISO date to another (b - a). */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** `days` days after an ISO date. */
function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

// ── The computation ─────────────────────────────────────────────────────────

/** One date input: not given, a readable date, or given but not usable. */
export type LimitationDate =
  | { state: 'none' }
  | { state: 'ok'; iso: string }
  | { state: 'unusable' };

/** One yes/no input: not answered, an answer, or given but not readable. */
export type LimitationAnswer =
  | { state: 'none' }
  | { state: 'ok'; value: boolean }
  | { state: 'unusable' };

export interface LimitationInput {
  orderDate: LimitationDate;
  filingDate: LimitationDate;
  copyAppliedFor: LimitationAnswer;
  copyApplied: LimitationDate;
  copyReady: LimitationDate;
}

export type LimitationStatus = 'within' | 'beyond' | 'unknown';

export interface LimitationResult {
  packId: string;
  status: LimitationStatus;
  /** Days counted after exclusions. Null when unknown. */
  daysCounted: number | null;
  /** Days excluded under s.12(2). Null when unknown. */
  daysExcluded: number | null;
  /** Days beyond the period. Null unless beyond. */
  daysOfDelay: number | null;
  /** The signed text the draft prints, filled. */
  text: string;
  /** The filing-checklist items this result adds (the s.5 application when beyond). */
  checklistItems: string[];
}

/** `41 days`, `1 day`. `verify`: the form the count prints in. */
export function delayDaysText(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

function unknown(rule: LimitationRule): LimitationResult {
  return {
    packId: rule.packId,
    status: 'unknown',
    daysCounted: null,
    daysExcluded: null,
    daysOfDelay: null,
    text: LIMITATION_UNKNOWN_TEXT,
    checklistItems: [],
  };
}

const isoOf = (d: LimitationDate): string | null => (d.state === 'ok' ? d.iso : null);

/** The limitation for one case. See the file comment for every rule. */
export function computeLimitation(rule: LimitationRule, input: LimitationInput): LimitationResult {
  const order = isoOf(input.orderDate);
  const filing = isoOf(input.filingDate);
  if (order === null || filing === null) return unknown(rule);
  if (filing < order) return unknown(rule);

  // Follow-up (2): was a certified copy applied for? Not answered: unknown.
  if (input.copyAppliedFor.state !== 'ok') return unknown(rule);
  const lastDay = addDays(order, rule.periodDays);
  let excluded = 0;
  if (input.copyAppliedFor.value) {
    // "Yes": both the applied date and the ready date are needed (follow-up (1), (2)).
    const applied = isoOf(input.copyApplied);
    const ready = isoOf(input.copyReady);
    if (applied === null || ready === null) return unknown(rule);
    if (applied < order || ready < applied) return unknown(rule);
    if (applied <= lastDay) {
      // The days of [applied, ready] inside (order, filing].
      const from = applied > order ? applied : addDays(order, 1);
      const to = ready < filing ? ready : filing;
      if (to >= from) excluded = daysBetween(from, to) + 1;
    }
  }
  // "No": nothing is excluded; any copy date given is not read.

  const counted = daysBetween(order, filing) - excluded;
  if (counted <= rule.periodDays) {
    return {
      packId: rule.packId,
      status: 'within',
      daysCounted: counted,
      daysExcluded: excluded,
      daysOfDelay: null,
      text: LIMITATION_WITHIN_TEXT.replace(PROVISION_TOKEN, rule.provision),
      checklistItems: [],
    };
  }
  const delay = counted - rule.periodDays;
  return {
    packId: rule.packId,
    status: 'beyond',
    daysCounted: counted,
    daysExcluded: excluded,
    daysOfDelay: delay,
    text: LIMITATION_BEYOND_TEXT.replace(PROVISION_TOKEN, rule.provision).replace(
      DELAY_DAYS_BLANK,
      delayDaysText(delay),
    ),
    checklistItems: [LIMITATION_S5_CHECKLIST_ITEM],
  };
}

// ── Reading the case ────────────────────────────────────────────────────────

/** One value as a date input: absent/empty is none; unreadable is unusable. */
export function limitationDateOf(value: unknown): LimitationDate {
  if (value === undefined || value === null) return { state: 'none' };
  if (typeof value === 'string' && value.trim() === '') return { state: 'none' };
  const iso = parseLawDate(value);
  return iso === null ? { state: 'unusable' } : { state: 'ok', iso };
}

/**
 * One value as a yes/no answer: a boolean, or `yes`/`no`/`true`/`false` in
 * any case. Absent/empty is none; anything else (e.g. "Not known") is unusable.
 */
export function limitationAnswerOf(value: unknown): LimitationAnswer {
  if (value === undefined || value === null) return { state: 'none' };
  if (typeof value === 'boolean') return { state: 'ok', value };
  if (typeof value !== 'string') return { state: 'unusable' };
  const v = value.trim().toLowerCase();
  if (v === '') return { state: 'none' };
  if (v === 'yes' || v === 'true') return { state: 'ok', value: true };
  if (v === 'no' || v === 'false') return { state: 'ok', value: false };
  return { state: 'unusable' };
}

/** A key's last segment (`<group>.<name>` or `<name>`). */
const lastKeySegment = (key: string): string => key.slice(key.lastIndexOf('.') + 1);

const DATE_INPUTS = ['orderDate', 'filingDate', 'copyApplied', 'copyReady'] as const;

/** The case values the rule reads. */
export function limitationInputKeys(rule: LimitationRule): string[] {
  return [...DATE_INPUTS.map((n) => rule.inputKeys[n]), rule.inputKeys.copyAppliedFor];
}

/** The input from form values keyed by field id (the form path, or the brief's items). */
export function limitationInputFromValues(
  rule: LimitationRule,
  values: Readonly<Record<string, unknown>>,
): LimitationInput {
  return {
    orderDate: limitationDateOf(values[rule.inputKeys.orderDate]),
    filingDate: limitationDateOf(values[rule.inputKeys.filingDate]),
    copyAppliedFor: limitationAnswerOf(values[rule.inputKeys.copyAppliedFor]),
    copyApplied: limitationDateOf(values[rule.inputKeys.copyApplied]),
    copyReady: limitationDateOf(values[rule.inputKeys.copyReady]),
  };
}

/**
 * The input from ledger facts (source `user` or `asked` only: a computed fact
 * is never an input), matched on the key's last segment. A key the ledger
 * holds as unresolved is unusable; so are two facts with different values, or
 * a fact that cannot be read (a date fact that is not a date; a yes/no that is
 * neither). With no fact, `fallback` (keyed by field id) is read.
 */
export function limitationInputFromLedger(
  rule: LimitationRule,
  facts: readonly LedgerFact[],
  unresolvedKeys: Iterable<string> = [],
  fallback: Readonly<Record<string, unknown>> = {},
): LimitationInput {
  const unresolved = new Set([...unresolvedKeys].map(lastKeySegment));
  const entriesOf = (key: string): LedgerFact[] =>
    facts.filter(
      (f) => (f.source === 'user' || f.source === 'asked') && lastKeySegment(f.key) === key,
    );

  const readDate = (key: string): LimitationDate => {
    if (unresolved.has(key)) return { state: 'unusable' };
    const entries = entriesOf(key);
    if (entries.length === 0) return limitationDateOf(fallback[key]);
    const seen = new Set<string>();
    for (const f of entries) {
      const iso = f.type === 'date' ? parseLawDate(f.value) : null;
      if (iso === null) return { state: 'unusable' };
      seen.add(iso);
    }
    return seen.size === 1 ? { state: 'ok', iso: [...seen][0] } : { state: 'unusable' };
  };

  const readAnswer = (key: string): LimitationAnswer => {
    if (unresolved.has(key)) return { state: 'unusable' };
    const entries = entriesOf(key);
    if (entries.length === 0) return limitationAnswerOf(fallback[key]);
    const seen = new Set<boolean>();
    for (const f of entries) {
      const a = limitationAnswerOf(f.value);
      if (a.state !== 'ok') return { state: 'unusable' };
      seen.add(a.value);
    }
    return seen.size === 1 ? { state: 'ok', value: [...seen][0] } : { state: 'unusable' };
  };

  return {
    orderDate: readDate(rule.inputKeys.orderDate),
    filingDate: readDate(rule.inputKeys.filingDate),
    copyAppliedFor: readAnswer(rule.inputKeys.copyAppliedFor),
    copyApplied: readDate(rule.inputKeys.copyApplied),
    copyReady: readDate(rule.inputKeys.copyReady),
  };
}

// ── The computed fact ───────────────────────────────────────────────────────

/** The ledger key of the one computed limitation fact. */
export const LIMITATION_FACT_KEY = 'limitation';

/** Its label (a plain functional label, not printed in the draft). */
export const LIMITATION_FACT_LABEL = 'Limitation (worked out by Lawie from the dates given)';

/**
 * The facts with the computed limitation fact: any stored fact under the key
 * is dropped (only this module sets it). Within or beyond adds one fact with
 * `source: 'computed'` and `required_in_draft: false`: `value` is
 * `<within|beyond>:<days counted>`, `display` the signed text the draft
 * prints. Unknown adds nothing (nothing is computed).
 */
export function withLimitationFact(
  facts: readonly LedgerFact[],
  result: LimitationResult,
): LedgerFact[] {
  const stored = facts.filter((f) => lastKeySegment(f.key) !== LIMITATION_FACT_KEY);
  if (result.status === 'unknown' || result.daysCounted === null) return stored;
  return [
    ...stored,
    {
      id: `computed:${LIMITATION_FACT_KEY}`,
      key: LIMITATION_FACT_KEY,
      label: LIMITATION_FACT_LABEL,
      type: 'text',
      value: `${result.status}:${result.daysCounted}`,
      display: result.text,
      raw_span: '',
      source: 'computed',
      confidence: 1,
      required_in_draft: false,
    },
  ];
}

/**
 * The Drafter's case-details line for the limitation paragraph. Plain
 * functional instruction (`verify`): the printed text after it is Ajay's.
 */
export function limitationInstruction(result: LimitationResult): string {
  return `LIMITATION: write the limitation paragraph as exactly this text, word for word, and state nothing else about whether this petition is within limitation or needs condonation: ${result.text}`;
}

// ── Keeping the model's own limitation statements out of the draft ─────────
//
// T-472 review: only the model's statements about THIS petition's own
// limitation are replaced. Limitation as a ground of revision (cognizance
// barred under s.468 CrPC / s.514 BNSS, delay in lodging the FIR, the limits
// of the court's powers) is the advocate's case and stays byte for byte.

/**
 * Step 1, always protected: limitation as a ground of revision. Sections 468,
 * 469, 470, 473 CrPC or 513 to 519 BNSS, or "limitation(s) of/on …
 * power(s)/jurisdiction".
 */
const GROUND_ANCHOR =
  /\b(?:sections?|secs?\.?|ss?\.|u\/ss?\.?)\s*(?:46[89]|47[03]|51[3-9])\b|\blimitations? (?:of|on|upon)\b[^.]*\b(?:powers?|jurisdiction)\b/i;

/**
 * Step 2, always replaced: this petition "is / has been / is being filed
 * (preferred, presented, instituted, moved)" in time or late, even if the
 * sentence also names the cognizance order or the FIR. Present or present
 * perfect only, and no comma, full stop or semicolon between the subject and
 * the verb, so "In this revision, the complaint was filed beyond time." is
 * not this.
 */
const FILED_CLAIM =
  /\b(?:petition|revision|revisional application|present application|instant application|this application|the same)\b[^.;,]*?\b(?:is|are|has been|is being)\s+(?:so\s+)?(?:filed|preferred|presented|instituted|moved)\b[^.;]*?\b(?:within (?:the )?(?:period of )?(?:limitation|(?:prescribed |stipulated |statutory )?(?:period|time))|in time|within (?:\w+ )?\(?\d+\)? (?:days|months?)|within (?:ninety|three months)|without (?:any )?delay|after (?:the )?(?:period|expiry)|beyond (?:the )?(?:prescribed |stipulated |statutory )?(?:period|time|limitation))\b/i;

/**
 * Step 3, otherwise protected: the sentence is about the case below.
 * Cognizance, FIR, complaint, charge sheet / final report.
 */
const NOT_THIS_PETITION =
  /\bcognizance\b|\bcognisance\b|\bF\.?I\.?R\b|\bfirst information\b|\bcomplaint\b|\bcharge[- ]?sheet\b|\bfinal report\b/i;

/** The subject that makes a sentence about this petition's own filing. */
const THIS_PETITION =
  /\b(?:petition|revision|revisional application|present application|instant application|this application|present proceedings?|instant proceedings?)\b/i;

/**
 * With that subject: a statement on limitation, time, delay of filing or
 * condonation. No bare "delay": a delay of the trial court is a ground.
 */
const PETITION_TIME_CUE =
  /\blimitation\b|\bwithin (?:the )?(?:prescribed |stipulated |statutory |limitation )?(?:period|time)\b|\bwithin (?:\w+ )?\(?\d+\)? (?:days|months?)\b|\bwithin (?:ninety days|three months)\b|\bbarred by (?:time|limitation)\b|\btime[- ]barred\b|\bin time\b|\bwithout (?:any )?delay\b|\bno delay\b|\bdelay of (?:\w+ )?\(?\d+\)? days?\b|\bdelay in (?:filing|preferring|presenting|approaching|instituting|moving)\b|\bbeyond (?:the )?(?:prescribed |stipulated |statutory )?(?:period|time)\b|\bcondon(?:e|ed|ing|ation)\b/i;

/**
 * Claims that are about this petition without naming it: "no delay in
 * approaching / filing / preferring …", a sentence with no subject that opens
 * "Within / Beyond limitation (time, the period …)", and any condonation statement (in
 * this pack, condonation is only ever of this petition's delay; s.473 CrPC
 * and the case below are excluded above).
 */
const SELF_ANCHORED_CUE =
  /\bno delay in (?:approaching|filing|preferring|presenting|moving|instituting)\b|\bno delay on the part of the petitioner\b|\bcondon(?:e|ed|ing|ation)\b|^\W*(?:within|beyond) (?:the )?(?:period of |prescribed |stipulated |statutory )?(?:limitation|time|period)\b/i;

/** True for the model's own statement on whether this petition is in time. */
export function isPetitionLimitationClaim(sentence: string): boolean {
  if (GROUND_ANCHOR.test(sentence)) return false;
  if (FILED_CLAIM.test(sentence)) return true;
  if (NOT_THIS_PETITION.test(sentence)) return false;
  if (SELF_ANCHORED_CUE.test(sentence)) return true;
  return THIS_PETITION.test(sentence) && PETITION_TIME_CUE.test(sentence);
}

/** Abbreviations whose full stop does not end a sentence. */
const ABBREVIATION =
  /(?:^|[\s(])(?:Art|Arts|S|Ss|Sec|Secs|No|Nos|Hon|Mr|Mrs|Ms|Dr|Smt|Shri|Sh|v|vs|Cr|r|O|cl|Cl|para|Para|paras|viz|i\.e|e\.g|etc|St|Govt|Ltd|Pvt|Co)$/;

/** The placeholder's marker character (NUL): it never occurs in a draft. */
const SENTINEL_MARK = String.fromCharCode(0);
const SENTINEL = `${SENTINEL_MARK}LIMITATION${SENTINEL_MARK}.`;

/** Splits after `.`, `!` or `?` before a capital, a bracket, a quote or the placeholder. */
const SENTENCE_END = new RegExp(`[.!?](?=\\s+["'“(\\[${SENTINEL_MARK}A-Z])`, 'g');

/** A paragraph's sentences, split after `.`, `!` or `?` before a capital, a bracket or a quote. */
function sentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  const re = new RegExp(SENTENCE_END.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const upto = text.slice(start, m.index);
    if (ABBREVIATION.test(upto)) continue;
    out.push(text.slice(start, m.index + 1).trim());
    start = m.index + 1;
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

/** A heading line: short, with no full stop or other sentence end (a closing colon is a heading). */
function isHeading(text: string): boolean {
  const t = text.trim();
  return t.split(/\s+/).length <= 8 && !/[.!?;]$/.test(t);
}

const NUMBER_PREFIX = /^(\s*\d{1,3}\.\s+)/;

/** A numbered paragraph's number at the start of a line. */
const PARAGRAPH_NUMBER = /^(\s*)(\d{1,3})(\.\s)/gm;

/**
 * Ajay's follow-up (4): the numbered paragraphs of one body, numbered
 * consecutively from the body's first number, with no gap and no repeat.
 * Headings and un-numbered text are untouched. `map` takes each old number to
 * its new one (a repeated old number maps to its first occurrence's new one).
 */
export function renumberParagraphs(body: string): { text: string; map: Map<number, number> } {
  const map = new Map<number, number>();
  let next: number | null = null;
  const text = body.replace(PARAGRAPH_NUMBER, (_m, lead: string, num: string, tail: string) => {
    const old = Number(num);
    if (next === null) next = old;
    const n: number = next;
    next = n + 1;
    if (!map.has(old)) map.set(old, n);
    return `${lead}${n}${tail}`;
  });
  return { text, map };
}

export interface LimitationEnforcement {
  /** The bodies after the replacement, before renumbering (old numbers, maybe a gap). */
  edited: string[];
  /** The bodies as they print: renumbered consecutively. */
  bodies: string[];
  /** Per body: old paragraph number -> new one. */
  renumber: Array<Map<number, number>>;
}

/**
 * The bodies with the computed text in place of the model's own statements on
 * this petition's limitation (one or more bodies, in document order; the form
 * path has one per AI section). Each exact copy of `text` is kept. Every
 * sentence that `isPetitionLimitationClaim` marks is removed; the first is
 * replaced by `text` when no exact copy is there, so exactly one copy is
 * placed. With no such sentence and no copy, `text` is added as a new last
 * paragraph of the last non-empty body (numbered after the highest paragraph
 * number, if any). A numbered paragraph left with nothing but its number is
 * removed. Then each non-empty body's numbered paragraphs are renumbered
 * consecutively (Ajay's follow-up (4)). Empty bodies are left empty.
 */
export function enforceLimitationTextDetailed(
  bodies: readonly string[],
  text: string,
): LimitationEnforcement {
  const identity = (): LimitationEnforcement => ({
    edited: [...bodies],
    bodies: [...bodies],
    renumber: bodies.map(() => new Map<number, number>()),
  });
  if (!text) return identity();
  const hasExact = bodies.some((b) => b.includes(text));
  let placed = false;
  const edited = bodies.map((body) => {
    if (!body.trim()) return body;
    const guarded = body.split(text).join(SENTINEL);
    const lines = guarded.split('\n').map((line) => {
      const prefix = NUMBER_PREFIX.exec(line)?.[1] ?? '';
      const rest = line.slice(prefix.length);
      if (!rest.trim() || (isHeading(rest) && !rest.includes(SENTINEL))) return line;
      let changed = false;
      const kept: string[] = [];
      for (const s of sentences(rest)) {
        if (s.includes(SENTINEL) && s.split(SENTINEL).join('').trim() === '') {
          kept.push(s);
        } else if (isPetitionLimitationClaim(s.split(SENTINEL).join(''))) {
          changed = true;
          // Any exact copy inside the sentence stays.
          const copies = s.split(SENTINEL).length - 1;
          for (let i = 0; i < copies; i++) kept.push(SENTINEL);
          if (!hasExact && !placed) {
            kept.push(SENTINEL);
            placed = true;
          }
        } else {
          kept.push(s);
        }
      }
      if (!changed) return line;
      if (kept.length === 0) return prefix ? null : '';
      return `${prefix}${kept.join(' ')}`;
    });
    return lines
      .filter((l): l is string => l !== null)
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .split(SENTINEL)
      .join(text);
  });
  if (!hasExact && !placed) {
    let last = -1;
    edited.forEach((b, i) => {
      if (b.trim()) last = i;
    });
    if (last >= 0) {
      const body = edited[last].replace(/\s+$/, '');
      const numbers = [...body.matchAll(/^\s*(\d{1,3})\.\s/gm)].map((m) => Number(m[1]));
      const next = numbers.length > 0 ? `${Math.max(...numbers) + 1}. ` : '';
      edited[last] = `${body}\n\n${next}${text}`;
    }
  }
  const renumbered = edited.map((b) =>
    b.trim() ? renumberParagraphs(b) : { text: b, map: new Map<number, number>() },
  );
  return {
    edited,
    bodies: renumbered.map((r) => r.text),
    renumber: renumbered.map((r) => r.map),
  };
}

/** The bodies as they print (see `enforceLimitationTextDetailed`). */
export function enforceLimitationTextIn(bodies: readonly string[], text: string): string[] {
  return enforceLimitationTextDetailed(bodies, text).bodies;
}

/** `enforceLimitationTextIn` for one body. */
export function enforceLimitationText(body: string, text: string): string {
  return enforceLimitationTextIn([body], text)[0];
}

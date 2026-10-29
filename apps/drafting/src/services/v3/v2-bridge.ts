/**
 * T-683 phase 2: the v3 Extractor's result on today's v2 paths, behind
 * feature.drafting_v3_stage ≥ 1, until T-685's orchestrator writes T-682's
 * ledger (Arjun, T-683 answers §1: "wired to the current buildBrief path
 * behind the flag").
 *
 * Pure: no I/O. Fed only with values code has already validated
 * (validate.ts). Arjun §9 / §9a (3573af05, cd426386): a value is written
 * into the v2 ledger only when validate produced it verbatim from the quote or
 * by a signed rule (bridgeable). Model-rendered prose stays on v2's ask path
 * until T-682 stores typed values.
 *
 * - `briefReadsFromV3`: the description's bridged candidates as brief reads
 *   (they take the place of Reception's reading for the same key). A key with
 *   a non-answer, a conflict, no readable value, or a value not bridged gets
 *   no v3 read and is asked again.
 * - `v2ExtractionFromV3`: the description's bridged candidates in the v2
 *   extraction pass's JSON shape, so the v2 ledger (readExtraction) is written
 *   from them with no second model call; `notBridged` lists the rest.
 * - `editsFromV3`: on /intake/brief/update, a non-answer is sent as an empty
 *   edit (no fact, as v2 does for its own); a bridged value is sent as the
 *   user's words or the signed-rule value; model prose is held back.
 * - `countNonVerbatim`: `bridge_skipped_non_verbatim` for the llm_call line.
 */
import { locateSpan, normalizeForItem } from '../fact-ledger.service';
import type { LedgerEdit } from '../fact-ledger.service';
import { isNoFactAnswer } from '../intake-brief';
import type { ChecklistItem, ReadValue } from '../intake-brief';

import type { ExtractResult, LedgerCandidate } from './types';
import { derivationOf, fieldSpecs, findQuote, isNonAnswerFor } from './validate';

function asBriefValue(c: LedgerCandidate): string | string[] {
  if (Array.isArray(c.value)) return c.value;
  return typeof c.value === 'number' ? String(c.value) : c.value;
}

// ── Arjun §9 / §9a (3573af05, cd426386): what reaches the v2 ledger ──────────
//
// A value is bridged into the v2 ledger if and only if validate.ts produced it
// (1) by a signed rule from the quote, or (2) verbatim from the quote
// (derivationOf). Model-rendered prose ('model_text', e.g. "Koi recovery nahi
// hui" rendered as English) is never written: the key stays on v2's ask path
// until T-682 stores typed values. How each kind is written:
//
// - verbatim: the user's own words (the value as found in the text);
// - a date or an amount: the shortest run of the quote, an exact substring of
//   the text, that the v2 normalizer reads to the same value (none: not bridged);
// - a choice (yes/no included): the option label, read by v2 as the option;
// - a police station by T-612 (6a): written as the value on an answer, where v2
//   reads the edit's text. On the description, v2 reads only the user's words
//   (readExtraction), so a station whose value differs from them (e.g. a
//   kept थाना read as "Thana") is not bridged there.

/** The value as it stands in `text` (NFC; whitespace and case folded), in the text's own characters. */
function findInText(text: string, value: string): string | null {
  const words = value.normalize('NFC').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const esc = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const m = new RegExp(
    `(?<![\\p{L}\\p{M}\\p{N}])${esc.join('\\s+')}(?![\\p{L}\\p{M}\\p{N}])`,
    'iu',
  ).exec(text.normalize('NFC'));
  return m && text.includes(m[0]) ? m[0] : null;
}

/** Same value, as the v2 normalizer reads the words. */
function v2ReadsSame(
  item: ChecklistItem,
  c: LedgerCandidate,
  words: string,
  refYear: number,
): boolean {
  const n = normalizeForItem(item, words, refYear);
  if (!n.ok) return false;
  if (c.type === 'money') {
    return (
      typeof n.value === 'number' &&
      typeof c.value === 'number' &&
      Math.round(n.value * 100) === Math.round(c.value * 100)
    );
  }
  if (c.type === 'date' || c.type === 'choice') return n.value === c.value;
  // Text and names: v2 holds the words it was given; a successful read is enough.
  return true;
}

/** Date or amount: the shortest exact run of the quote's words in `text` that v2 reads the same. */
function readSpan(
  c: LedgerCandidate,
  text: string,
  item: ChecklistItem,
  refYear: number,
): string | null {
  const words = c.source.quote.split(/\s+/).filter(Boolean);
  for (let len = 1; len <= Math.min(words.length, 8); len += 1) {
    for (let i = 0; i + len <= words.length; i += 1) {
      const span = locateSpan(text, words.slice(i, i + len).join(' '));
      if (span !== null && text.includes(span) && v2ReadsSame(item, c, span, refYear)) return span;
    }
  }
  return null;
}

/**
 * The bridge test (§9a) for one single-value candidate against the text v2
 * will read: the words to write, or null when the candidate is held.
 * `answer`: an edit's text, which v2 normalizes as typed, so a signed-rule
 * value (a choice label, a station by (6a)) may be written as the value.
 */
export function bridgeable(
  c: LedgerCandidate,
  text: string,
  item: ChecklistItem,
  refYear: number,
  answer: boolean,
): string | null {
  if (Array.isArray(c.value)) return null;
  const d = derivationOf(c);
  if (d === 'model_text') return null;
  // Review round 1, finding 1: on an answer the candidate must come from THIS
  // edit's words (its quote is in the edit), so a stale or reused reading can
  // never overwrite a new answer (an earlier "No" over a new "haan").
  if (answer && findQuote(text, c.source.quote) === null) return null;
  if (c.type === 'date' || c.type === 'money') return readSpan(c, text, item, refYear);
  if (c.type === 'choice') {
    if (!v2ReadsSame(item, c, String(c.value), refYear)) return null;
    // The description: v2 reads the option; the span is the user's words that gave it.
    return answer ? String(c.value) : c.source.quote;
  }
  const own = findInText(text, String(c.value));
  if (own !== null && v2ReadsSame(item, c, own, refYear)) return own;
  if (d === 'signed_rule' && answer && v2ReadsSame(item, c, String(c.value), refYear)) {
    return String(c.value);
  }
  return null;
}

/** A list on the description: every item verbatim (or a choice label) in the text, else held. */
function bridgeList(
  c: LedgerCandidate,
  text: string,
  item: ChecklistItem,
): Array<{ span: string; option: string }> | null {
  if (!Array.isArray(c.value) || derivationOf(c) === 'model_text') return null;
  const out: Array<{ span: string; option: string }> = [];
  for (const v of c.value) {
    if (item.kind === 'choices') {
      out.push({ span: c.source.quote, option: v });
      continue;
    }
    const span = findInText(text, v);
    if (span === null) return null;
    out.push({ span, option: v });
  }
  return out;
}

/** The source text a candidate's quote was found in. */
function sourceText(
  c: LedgerCandidate,
  description: string,
  answers: readonly { turn: number; text: string }[],
): string | null {
  if (c.source.kind === 'description') return description;
  return answers.find((a) => a.turn === c.source.turn)?.text ?? null;
}

/**
 * `bridge_skipped_non_verbatim` for the llm_call line: the candidates the
 * bridge test holds (§9a). A count only, never text.
 */
export function countNonVerbatim(
  result: ExtractResult,
  checklist: readonly ChecklistItem[],
  description: string,
  answers: readonly { turn: number; text: string }[],
  refYear: number,
): number {
  const items = new Map(checklist.map((i) => [i.key, i]));
  let n = 0;
  for (const c of result.candidates) {
    const item = items.get(c.key);
    const text = sourceText(c, description, answers);
    const answer = c.source.kind === 'answer';
    const ok =
      item !== undefined &&
      text !== null &&
      (Array.isArray(c.value)
        ? !answer && bridgeList(c, text, item) !== null
        : bridgeable(c, text, item, refYear, answer) !== null);
    if (!ok) n += 1;
  }
  return n;
}

export interface BriefReads {
  /** Key → the candidate's value and quote, for the description's candidates. */
  values: Map<string, ReadValue>;
  /** Keys that must hold no read: non-answers, conflicts, unresolved. */
  noRead: Set<string>;
  /** Keys asked again: conflicts, unresolved, and candidates not bridged (§9). */
  ask: Set<string>;
}

/**
 * `notBridged`: the keys v2ExtractionFromV3 left out (§9). Their v3 value is
 * not put on the brief either, so brief and ledger agree (T-335): Reception's
 * own read, if any, stays, and the key is asked as on v2.
 */
export function briefReadsFromV3(
  result: ExtractResult,
  notBridged: ReadonlySet<string> = new Set(),
  /** Review round 1, finding 7: the bridged words per key (v2ExtractionFromV3 `spans`). */
  spans: ReadonlyMap<string, string> = new Map(),
): BriefReads {
  const values = new Map<string, ReadValue>();
  for (const c of result.candidates) {
    if (c.source.kind !== 'description' || notBridged.has(c.key)) continue;
    // Text and names: the user's own characters as the ledger holds them (T-335).
    const span = c.type === 'text' || c.type === 'name' ? spans.get(c.key) : undefined;
    values.set(c.key, { value: span ?? asBriefValue(c), quote: c.source.quote });
  }
  const ask = new Set<string>([
    ...result.conflicts.map((c) => c.key),
    ...result.unresolved,
    ...notBridged,
  ]);
  const noRead = new Set<string>([
    ...result.conflicts.map((c) => c.key),
    ...result.unresolved,
    ...result.nonAnswers.map((n) => n.key),
  ]);
  for (const k of noRead) values.delete(k);
  return { values, noRead, ask };
}

/** One entry of the v2 extraction pass's reply (EXTRACT_SYSTEM_PROMPT's shape). */
interface V2Entry {
  key: string;
  span: string;
  option?: string;
  confidence: number;
}

/**
 * The description's candidates in the v2 extraction shape, bridged per §9.
 * `notBridged`: the keys left out (a non-verbatim value). Counted, never logged as text.
 */
export function v2ExtractionFromV3(
  result: ExtractResult,
  description: string,
  checklist: readonly ChecklistItem[],
  refYear: number,
): { facts: V2Entry[]; notBridged: Set<string>; spans: Map<string, string> } {
  const items = new Map(checklist.map((i) => [i.key, i]));
  const facts: V2Entry[] = [];
  const notBridged = new Set<string>();
  const spans = new Map<string, string>();
  for (const c of result.candidates) {
    if (c.source.kind !== 'description') continue;
    const item = items.get(c.key);
    if (!item) {
      notBridged.add(c.key);
      continue;
    }
    if (Array.isArray(c.value)) {
      const entries = bridgeList(c, description, item);
      if (entries === null) notBridged.add(c.key);
      else for (const e of entries) facts.push({ key: c.key, ...e, confidence: c.confidence });
      continue;
    }
    const span = bridgeable(c, description, item, refYear, false);
    if (span === null) {
      notBridged.add(c.key);
      continue;
    }
    spans.set(c.key, span);
    facts.push({
      key: c.key,
      span,
      ...(c.type === 'choice' && typeof c.value === 'string' ? { option: c.value } : {}),
      confidence: c.confidence,
    });
  }
  return { facts, notBridged, spans };
}

/**
 * The advocate's edits with the Extractor's reading laid over. The caller
 * sends edit i (a non-empty text) as answer turn i + 1, asked for that edit's
 * key only. In order:
 *
 * 1. An edit v2 already reads as no fact (isNoFactAnswer: T-190 "Not known",
 *    "none" on a fact used only when present) is left exactly as sent, so v2's
 *    own treatment applies.
 * 2. An edit whose key the Extractor returned under `nonAnswers` for words of
 *    this edit (Ajay rule 4, AJ-655-M1) is sent as an empty edit: v2 then does
 *    for it what it does for its own non-answers (applyEdit: no fact; any held
 *    fact or doubt for the key goes), so the draft prints the
 *    [To be confirmed] blank and "पता नहीं" never becomes a value.
 * 3. A single-value candidate from that answer for that key: when it passes
 *    the bridge test (§9a, bridgeable: verbatim, or a signed rule such as
 *    नहीं → No or थाना X → the station), the edit is sent as those words or
 *    that value. When it does not (Hinglish prose rendered into English), the
 *    edit is held back (`held`, its index): nothing is written for the key,
 *    so neither the raw words nor an English value the user did not write
 *    reach the ledger, and the key stays asked (§9) until T-682.
 * 4. No candidate, but a non-answer for the key inside the edit (Arjun §10):
 *    held, so the raw words never go through as typed.
 * 5. Anything else (no candidate and no non-answer, a list, a cleared value):
 *    the advocate's own text, the v2 path. A candidate for any other key is
 *    not written (T-685).
 */
export function editsFromV3(
  edits: readonly LedgerEdit[],
  result: ExtractResult,
  checklist: readonly ChecklistItem[],
  refYear: number,
): { edits: LedgerEdit[]; held: number[]; replaced: number; nonAnswers: number } {
  const items = new Map(checklist.map((i) => [i.key, i]));
  const specs = fieldSpecs([...checklist]);
  const fold = (v: string): string => v.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
  let replaced = 0;
  let nonAnswers = 0;
  /** Indexes into `edits` of the edits held back. */
  const held: number[] = [];
  const out: LedgerEdit[] = [];
  edits.forEach((e, i) => {
    if (typeof e.text !== 'string' || e.text.trim() === '') {
      out.push(e);
      return;
    }
    const item = items.get(e.key);
    if (!item || isNoFactAnswer(item, e.text)) {
      out.push(e);
      return;
    }
    // Review round 1, finding 4: the edit is emptied only when the WHOLE edit
    // is the non-answer (its words are the quote, or the whole edit is one by
    // the v2/signed rules). A non-answer inside a longer answer ("पिता का नाम
    // पता नहीं, नाम Ramesh") does not wipe the rest: with a candidate, only the
    // bridged value is written; with none, the edit is held (Arjun §10).
    const spec = specs.get(e.key);
    const editText = fold(e.text);
    const whole =
      result.nonAnswers.some((n) => n.key === e.key && fold(n.quote) === editText) ||
      (spec !== undefined &&
        result.nonAnswers.some((n) => n.key === e.key) &&
        isNonAnswerFor(spec, e.text));
    if (whole) {
      nonAnswers += 1;
      out.push({ ...e, text: '' });
      return;
    }
    // Arjun §10 (b767383c): a non-answer inside the edit, not the whole of it.
    const partialNonAnswer = result.nonAnswers.some((n) => n.key === e.key);
    const c = result.candidates.find(
      (x) =>
        x.key === e.key &&
        x.source.kind === 'answer' &&
        x.source.turn === i + 1 &&
        !Array.isArray(x.value),
    );
    if (!c) {
      if (partialNonAnswer) {
        // Ask again; write nothing: the raw words never go through as typed.
        held.push(i);
        return;
      }
      // No non-answer: v2 behaviour unchanged.
      out.push(e);
      return;
    }
    const span = bridgeable(c, e.text, item, refYear, true);
    if (span === null) {
      held.push(i);
      return;
    }
    replaced += 1;
    // The bridged words ("Ramesh" exactly), never the raw edit.
    out.push({ ...e, text: span });
  });
  return { edits: out, held, replaced, nonAnswers };
}

/**
 * T-683 phase 2: the v3 Extractor's result on today's v2 paths, behind
 * feature.drafting_v3_stage ≥ 1, until T-685's orchestrator writes T-682's
 * ledger (Arjun, T-683 answers §1: "wired to the current buildBrief path
 * behind the flag").
 *
 * Pure: no I/O. Fed only with values code has already validated
 * (validate.ts). Arjun §9 (3573af05), option (b): only a value that stands
 * verbatim in the user's text, and that the v2 normalizer reads the same, is
 * ever written into the v2 ledger (bridgeSpan). Everything else stays on v2's
 * ask path until T-682 stores typed values.
 *
 * - `briefReadsFromV3`: the description's bridged candidates as brief reads
 *   (they take the place of Reception's reading for the same key). A key with
 *   a non-answer, a conflict, no readable value, or a value not bridged gets
 *   no v3 read and is asked again.
 * - `v2ExtractionFromV3`: the description's bridged candidates in the v2
 *   extraction pass's JSON shape, so the v2 ledger (readExtraction) is written
 *   from them with no second model call; `notBridged` lists the rest.
 * - `editsFromV3`: on /intake/brief/update, a non-answer is sent as an empty
 *   edit (no fact, as v2 does for its own); a read value is sent as the user's
 *   own words when verbatim, and held back when not (nothing written).
 * - `countNonVerbatim`: `bridge_skipped_non_verbatim` for the llm_call line.
 */
import { locateSpan, normalizeForItem } from '../fact-ledger.service';
import type { LedgerEdit } from '../fact-ledger.service';
import { isNoFactAnswer } from '../intake-brief';
import type { ChecklistItem, ReadValue } from '../intake-brief';

import type { ExtractResult, LedgerCandidate } from './types';

function asBriefValue(c: LedgerCandidate): string | string[] {
  if (Array.isArray(c.value)) return c.value;
  return typeof c.value === 'number' ? String(c.value) : c.value;
}

// ── Arjun §9 (3573af05), option (b): only verbatim values reach the v2 ledger ──
//
// At stage 1 the v2 ledger holds the user's own words, read by the v2
// normalizer. A candidate goes into it only when its value stands verbatim in
// the user's text AND the v2 normalizer reads those words to the same value.
// For a date or an amount (whose value is ISO / a figure, never the user's
// spelling) the words kept are the shortest run of the quote that is an exact
// substring of the text and that the v2 normalizer reads to the same value.
// Anything else is not bridged: the key stays on v2's normal ask path until
// T-682 stores typed values. Never the whole quote, never an English value the
// user did not write (T-676).

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
  // Text and names: the words are the user's own, so the value v2 holds is theirs.
  return true;
}

/**
 * The exact words of `text` the v2 ledger may read this candidate from, or
 * null when the candidate is not bridged. Lists are not handled here.
 */
export function bridgeSpan(
  c: LedgerCandidate,
  text: string,
  item: ChecklistItem,
  refYear: number,
): string | null {
  if (Array.isArray(c.value)) return null;
  const own = locateSpan(text, String(c.value));
  if (own !== null && text.includes(own) && v2ReadsSame(item, c, own, refYear)) return own;
  if (c.type !== 'date' && c.type !== 'money') return null;
  const words = c.source.quote.split(/\s+/).filter(Boolean);
  for (let len = 1; len <= Math.min(words.length, 8); len += 1) {
    for (let i = 0; i + len <= words.length; i += 1) {
      const span = locateSpan(text, words.slice(i, i + len).join(' '));
      if (span !== null && text.includes(span) && v2ReadsSame(item, c, span, refYear)) return span;
    }
  }
  return null;
}

/** A list candidate is bridged only when every item is verbatim and reads as itself. */
function bridgeListSpans(
  c: LedgerCandidate,
  text: string,
  item: ChecklistItem,
  refYear: number,
): string[] | null {
  if (!Array.isArray(c.value)) return null;
  const spans: string[] = [];
  for (const v of c.value) {
    const span = bridgeSpan(
      { ...c, value: v, type: c.type === 'list' ? 'text' : c.type },
      text,
      item,
      refYear,
    );
    if (span === null) return null;
    spans.push(span);
  }
  return spans;
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
 * The candidates the v2 ledger would not take (Arjun §9's
 * `bridge_skipped_non_verbatim`). A count only, for the llm_call line.
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
    const ok =
      item !== undefined &&
      text !== null &&
      (Array.isArray(c.value)
        ? bridgeListSpans(c, text, item, refYear) !== null
        : bridgeSpan(c, text, item, refYear) !== null);
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
): BriefReads {
  const values = new Map<string, ReadValue>();
  for (const c of result.candidates) {
    if (c.source.kind !== 'description' || notBridged.has(c.key)) continue;
    values.set(c.key, { value: asBriefValue(c), quote: c.source.quote });
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
): { facts: V2Entry[]; notBridged: Set<string> } {
  const items = new Map(checklist.map((i) => [i.key, i]));
  const facts: V2Entry[] = [];
  const notBridged = new Set<string>();
  for (const c of result.candidates) {
    if (c.source.kind !== 'description') continue;
    const item = items.get(c.key);
    if (!item) {
      notBridged.add(c.key);
      continue;
    }
    if (Array.isArray(c.value)) {
      const spans = bridgeListSpans(c, description, item, refYear);
      if (spans === null) notBridged.add(c.key);
      else
        spans.forEach((span, n) =>
          facts.push({
            key: c.key,
            span,
            option: (c.value as string[])[n],
            confidence: c.confidence,
          }),
        );
      continue;
    }
    const span = bridgeSpan(c, description, item, refYear);
    if (span === null) {
      notBridged.add(c.key);
      continue;
    }
    facts.push({
      key: c.key,
      span,
      ...(c.type === 'choice' && typeof c.value === 'string' ? { option: c.value } : {}),
      confidence: c.confidence,
    });
  }
  return { facts, notBridged };
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
 * 3. A single-value candidate from that answer for that key: when its value
 *    is verbatim in the answer and v2 reads it the same (§9, bridgeSpan), the
 *    edit is sent as those words. When it is not (a Hinglish answer read into
 *    English), the edit is held back (`held`, its index): nothing is written for the key,
 *    so neither the raw words nor an English value the user did not write
 *    reach the ledger, and the key stays asked (§9) until T-682.
 * 4. Anything else (no candidate, a list, a cleared value): the advocate's own
 *    text, the v2 path. A candidate for any other key is not written (T-685).
 */
export function editsFromV3(
  edits: readonly LedgerEdit[],
  result: ExtractResult,
  checklist: readonly ChecklistItem[],
  refYear: number,
): { edits: LedgerEdit[]; held: number[]; replaced: number; nonAnswers: number } {
  const items = new Map(checklist.map((i) => [i.key, i]));
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
    const text = fold(e.text);
    if (result.nonAnswers.some((n) => n.key === e.key && text.includes(fold(n.quote)))) {
      nonAnswers += 1;
      out.push({ ...e, text: '' });
      return;
    }
    const c = result.candidates.find(
      (x) =>
        x.key === e.key &&
        x.source.kind === 'answer' &&
        x.source.turn === i + 1 &&
        !Array.isArray(x.value),
    );
    if (!c) {
      out.push(e);
      return;
    }
    const span = bridgeSpan(c, e.text, item, refYear);
    if (span === null) {
      held.push(i);
      return;
    }
    replaced += 1;
    out.push({ ...e, text: span });
  });
  return { edits: out, held, replaced, nonAnswers };
}

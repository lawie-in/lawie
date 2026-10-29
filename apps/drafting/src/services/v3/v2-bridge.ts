/**
 * T-683 phase 2: the v3 Extractor's result on today's v2 paths, behind
 * feature.drafting_v3_stage ≥ 1, until T-685's orchestrator writes T-682's
 * ledger (Arjun, T-683 answers §1: "wired to the current buildBrief path
 * behind the flag").
 *
 * Pure: no I/O. Three conversions, each fed only with values code has
 * already validated (validate.ts):
 *
 * - `briefReadsFromV3`: the description's candidates as brief reads (they
 *   take the place of Reception's reading for the same key). A key with a
 *   non-answer, a conflict or no readable value gets no read and is asked again.
 * - `v2ExtractionFromV3`: the description's candidates in the v2 extraction
 *   pass's JSON shape, so the v2 ledger (readExtraction) is written from them
 *   with no second model call. readExtraction re-reads every value from the
 *   quote with the v2 normalizer, so the v2 ledger's own rules still hold.
 * - `editsFromV3`: on /intake/brief/update, an answer the Extractor read is
 *   written as its English value (T-676: नहीं → No), only for the keys the
 *   advocate answered in this turn. Anything else keeps the advocate's text.
 */
import { normalizeAmount, normalizeDate } from '@lawie/shared';

import { locateSpan } from '../fact-ledger.service';
import type { LedgerEdit } from '../fact-ledger.service';
import type { ReadValue } from '../intake-brief';

import type { ExtractResult, LedgerCandidate } from './types';

function asBriefValue(c: LedgerCandidate): string | string[] {
  if (Array.isArray(c.value)) return c.value;
  return typeof c.value === 'number' ? String(c.value) : c.value;
}

export interface BriefReads {
  /** Key → the candidate's value and quote, for the description's candidates. */
  values: Map<string, ReadValue>;
  /** Keys that must hold no read: non-answers, conflicts, unresolved. */
  noRead: Set<string>;
  /** Keys asked again: conflicts and unresolved (never a guess). */
  ask: Set<string>;
}

export function briefReadsFromV3(result: ExtractResult): BriefReads {
  const values = new Map<string, ReadValue>();
  for (const c of result.candidates) {
    if (c.source.kind !== 'description') continue;
    values.set(c.key, { value: asBriefValue(c), quote: c.source.quote });
  }
  const ask = new Set<string>([...result.conflicts.map((c) => c.key), ...result.unresolved]);
  const noRead = new Set<string>([...ask, ...result.nonAnswers.map((n) => n.key)]);
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
 * The words v2 reads the value from: the value itself when it stands verbatim
 * in the description (an English name, number or phrase); for a date or an
 * amount, the shortest run of the quote's words that reads to the same value;
 * else the whole quote. Always verbatim in the description (locateSpan).
 */
/** True when these words read, by the shared normalizers, to the candidate's date or amount. */
function readsTo(c: LedgerCandidate, words: string): boolean {
  if (c.type === 'date') {
    const n = normalizeDate(words);
    return n.ok && n.value === c.value;
  }
  const n = normalizeAmount(words);
  return (
    n.ok && typeof c.value === 'number' && Math.round(n.value * 100) === Math.round(c.value * 100)
  );
}

function spanFor(c: LedgerCandidate, description: string): string {
  if (typeof c.value === 'string' || typeof c.value === 'number') {
    const own = locateSpan(description, String(c.value));
    if (own !== null && (c.type === 'text' || c.type === 'name' || c.type === 'money')) return own;
  }
  if (c.type === 'date' || c.type === 'money') {
    const words = c.source.quote.split(/\s+/).filter(Boolean);
    for (let len = 1; len <= Math.min(words.length, 8); len += 1) {
      for (let i = 0; i + len <= words.length; i += 1) {
        const w = words.slice(i, i + len).join(' ');
        if (readsTo(c, w)) {
          const found = locateSpan(description, w);
          if (found !== null) return found;
        }
      }
    }
  }
  return c.source.quote;
}

export function v2ExtractionFromV3(
  result: ExtractResult,
  description: string,
): { facts: V2Entry[] } {
  const facts: V2Entry[] = [];
  for (const c of result.candidates) {
    if (c.source.kind !== 'description') continue;
    const base = { key: c.key, span: spanFor(c, description), confidence: c.confidence };
    if (c.type === 'choice' && typeof c.value === 'string') {
      facts.push({ ...base, option: c.value });
    } else if (c.type === 'list' && Array.isArray(c.value)) {
      // One entry per item, as v2 lists are; each carries the item as the option
      // (read for choices, ignored by the normalizer for free-text lists).
      for (const v of c.value) facts.push({ ...base, option: v });
    } else {
      facts.push(base);
    }
  }
  return { facts };
}

/**
 * The advocate's edits with the Extractor's reading laid over. The caller
 * sends edit i (a non-empty text) as answer turn i + 1, asked for that edit's
 * key only. A single-value candidate from that answer for that key replaces
 * the edit's text with the candidate's value. Lists, cleared values,
 * non-answers, conflicts and unresolved keys keep the advocate's own text (the
 * v2 path), and a candidate for any other key is not written here (T-685).
 */
export function editsFromV3(
  edits: readonly LedgerEdit[],
  result: ExtractResult,
): { edits: LedgerEdit[]; replaced: number } {
  let replaced = 0;
  const out = edits.map((e, i) => {
    if (typeof e.text !== 'string' || e.text.trim() === '') return e;
    const c = result.candidates.find(
      (x) =>
        x.key === e.key &&
        x.source.kind === 'answer' &&
        x.source.turn === i + 1 &&
        !Array.isArray(x.value),
    );
    if (!c) return e;
    replaced += 1;
    return { ...e, text: String(c.value) };
  });
  return { edits: out, replaced };
}

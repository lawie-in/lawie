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
 *    reason the caller logs). MISSING only when the ledger does not hold it.
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
import { missingPlaceholder } from './brief-drafter';
import { verifyDraft, VerifierInput } from './fact-verifier';
import { normalise } from './intake-text';
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

/**
 * Resolves every list name the skeleton's conditions use, from the pack's
 * signed averment lists. `none_values` reads the skeleton's own reference
 * (`first_bail_application.equals (T-334)`); `<id>.equals` reads that
 * averment. A name that does not resolve is left out, and a condition on it
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
    const ref = name === 'none_values' ? (skeleton.none_values ?? '') : name;
    const m = /^\s*([a-z0-9_]+)\.equals\b/.exec(ref);
    const values = m ? avermentEquals(lists, m[1]) : null;
    if (values) out[name] = values;
  }
  return out;
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
  const optionIdOf = (key: string, f: LedgerFact): string | undefined => {
    const map = optionIds[key];
    if (!map) return undefined;
    return (
      map[folded(f.display)] ?? (typeof f.value === 'string' ? map[folded(f.value)] : undefined)
    );
  };
  const seenOf = (key: string, f: LedgerFact): Set<string> =>
    new Set(
      [folded(f.value), folded(f.display), folded(optionIdOf(key, f))].filter((s) => s !== ''),
    );
  const valuesOf = (set: SkeletonValueSet): string[] | null => {
    const list = Array.isArray(set) ? set : valueLists[set];
    return list ? list.map(folded) : null;
  };
  const holds = (c: SkeletonCondition): boolean => {
    if ('all_of' in c) return c.all_of.length > 0 && c.all_of.every(holds);
    const entries = held.get(c.key) ?? [];
    // A key the ledger does not hold never satisfies a condition (Ajay, 10 Oct 2026).
    if (entries.length === 0) return false;
    if (c.present === true) return entries.some((f) => seenOf(c.key, f).size > 0);
    if (c.in !== undefined) {
      const wanted = valuesOf(c.in);
      if (!wanted) return false;
      return entries.some((f) => {
        const seen = seenOf(c.key, f);
        return wanted.some((w) => seen.has(w));
      });
    }
    if (c.not_in !== undefined) {
      const barred = valuesOf(c.not_in);
      if (!barred) return false;
      return entries.every((f) => {
        const seen = seenOf(c.key, f);
        return seen.size > 0 && !barred.some((w) => seen.has(w));
      });
    }
    return false;
  };
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
      const s = raw.trim();
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
      const label = labelOf(source);
      missing.push(label);
      return missingPlaceholder(label);
    });
    return { text: out, missing };
  };

  const clauseLabel = (c: SkeletonClause): string =>
    c.missing_label ??
    clauseLabels[c.id] ??
    (c.slot ? labelOf(c.slot) : c.from ? labelOf(c.from) : undefined) ??
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
    const violations = verifyDraft({ ...input.verifier, body: text, facts: entries });
    return !violations.some((v) => {
      if (!REJECTING_CHECKS.has(v.check)) return false;
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
    if (c.render_if_any_slot && !held.has(c.render_if_any_slot)) {
      return c.required ? missingForm(c, index) : null;
    }
    if (text === undefined) return c.required ? missingForm(c, index) : null;
    const keys = slotKeysOf(text, c.derived);
    if (!c.required && keys.length > 0 && keys.every((k) => !held.has(k))) return null;
    const filled = fill(text, c.derived);
    return outcome(c, index, {
      text: filled.text,
      status: filled.missing.length > 0 ? 'missing' : 'ok',
      missing: filled.missing,
    });
  };

  /** One entry's own words: the model's text if it keeps to the entry, else the advocate's words verbatim. */
  const ownWords = (
    own: string | undefined,
    entry: LedgerFact,
  ): { words: string; reason?: FallbackReason } => {
    const text = (own ?? '').trim();
    if (text !== '' && keepsToFact(text, [entry])) return { words: text };
    return {
      words: (entry.raw_span ?? '').trim() || entry.display.trim(),
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
        blanks = [item.missing_label ?? labelOf(conditionKeys(item.requires)[0] ?? c.from)];
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

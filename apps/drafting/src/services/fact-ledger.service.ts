/**
 * The Fact Ledger, written by Reception (T-147b, ADR-022 section 2A rules 1, 5
 * and 6).
 *
 * The extraction pass returns, for each fact, the advocate's own words (a
 * span). This file does the rest, with no model:
 *
 * - every span must stand verbatim in the advocate's text, or the fact is
 *   dropped (counted, never stored with an invented span);
 * - every value is read from its span by the T-147a normalizer;
 * - anything the normalizer cannot read without guessing, anything below the
 *   type's confidence floor, and two values for one fact go to `unresolved`
 *   with a reason, never into `facts`;
 * - an answer or an edit writes a new version; earlier versions are never
 *   changed.
 *
 * The ledger is written and shown. It is not the Drafter's input (T-147c).
 *
 * Privacy: nothing here logs a value, a span or any of the advocate's text.
 * Callers log ids and counts only.
 */
import crypto from 'crypto';

import {
  CONFIDENCE_FLOORS,
  FactLedgerRunType,
  FactLedgerVersionReason,
  FactSource,
  FactType,
  LedgerFact,
  LedgerUnresolvedFact,
  Normalized,
  normalizeAmount,
  normalizeCaseNumber,
  normalizeCourt,
  normalizeDate,
  normalizePersonName,
  normalizePlaceName,
  normalizePoliceStation,
  normalizeSectionRef,
  UnresolvedReason,
} from '@lawie/shared';
import mongoose from 'mongoose';

import { FactLedgerModel, IFactLedger, IFactLedgerVersion } from '../models/FactLedger.model';

import { ChecklistItem, dateKindLabel } from './intake-brief';
import { normalise } from './intake-text';
import type { ExtractLine } from './intake.prompts';

// ── The switch ──────────────────────────────────────────────────────────────

export const FACT_LEDGER_SETTING = 'feature.fact_ledger';

// ── Which brief items have a ledger fact, and of which type ─────────────────

/** The longest span kept: a narrative fact's words. */
const SPAN_MAX = 6000;

function lastSegment(key: string): string {
  const at = key.lastIndexOf('.');
  return at < 0 ? key : key.slice(at + 1);
}

/**
 * True for a brief item the ledger holds. Lists and multiple choices hold
 * several values and are left out of this first pass.
 */
export function isLedgerItem(item: ChecklistItem): boolean {
  return item.kind !== 'list' && item.kind !== 'choices';
}

/** A number fact that is a sum of money by its name, as `partOf` in intake-brief.ts reads names. */
const MONEY_NAME =
  /(amount|value|fee|fees|rent|deposit|price|consideration|ctc|salary|capital|compensation|arrears|income|expenses|charges)$/;

/** The ledger fact type of a brief item. */
export function factTypeFor(item: ChecklistItem): FactType {
  const name = lastSegment(item.key);
  switch (item.kind) {
    case 'date':
      return 'date';
    case 'amount':
      return 'amount';
    case 'choice':
      return 'enum';
    case 'number':
      return MONEY_NAME.test(name) ? 'amount' : 'text';
    case 'narrative':
      return 'text';
    default:
      break;
  }
  if (/(^|_)(police_station|ps_name|thana)(_|$)/.test(name)) return 'police_station';
  if (/(^|_)(fir|case|crime)_?(number|no)$/.test(name)) return 'case_number';
  if (/(^|_)(court)(_|$)/.test(name)) return 'court';
  if (item.partyName || /(^|_)name$/.test(name)) return 'person_name';
  if (/(^|_)(place|city|village|town)(_|$)/.test(name)) return 'place_name';
  return 'text';
}

const KIND_WORDS: Record<FactType, string> = {
  amount: 'amount',
  date: 'date',
  person_name: 'person name',
  place_name: 'place',
  police_station: 'police station',
  court: 'court',
  section_ref: 'section',
  case_number: 'case number',
  text: 'text',
  enum: 'choice',
  boolean: 'choice',
};

/**
 * The lines given to the extraction pass. Only items the model may read, as
 * for Reception: the court and the always-asked dates are never on it.
 */
export function extractLines(checklist: ChecklistItem[]): ExtractLine[] {
  return checklist
    .filter((i) => i.modelReadable && isLedgerItem(i))
    .map((i) => ({
      key: i.key,
      what: (i.kind === 'date' && i.dateKind ? dateKindLabel(i.dateKind) : null) ?? i.label,
      kind: KIND_WORDS[factTypeFor(i)],
      options: i.kind === 'choice' ? i.options : [],
    }));
}

// ── Reading one value ───────────────────────────────────────────────────────

/** The detail sentences T-147b adds. User-facing; signed by Ajay on 10 Oct 2026. Do not reword. */
export const LEDGER_DETAILS = {
  low_confidence: 'We are not sure these words give this detail.',
  conflicting_values: 'You gave two different values for this.',
  not_an_option: 'This is not one of the choices for this detail.',
} as const;

function unresolvedOf(reason: UnresolvedReason, detail: string): Normalized<never> {
  return { ok: false, reason, detail };
}

/** The year two-digit years are read against: this year in India. */
export function referenceYear(now: Date): number {
  return new Date(now.getTime() + 330 * 60_000).getUTCFullYear();
}

type LedgerValue = LedgerFact['value'];

/** Read one value of a fact type from the advocate's words. Never guesses. */
export function normalizeForItem(
  item: ChecklistItem,
  text: string,
  refYear: number,
): Normalized<LedgerValue> {
  const type = factTypeFor(item);
  switch (type) {
    case 'amount':
      return normalizeAmount(text);
    case 'date':
      return normalizeDate(text, { referenceYear: refYear });
    case 'person_name':
      return normalizePersonName(text);
    case 'place_name':
      return normalizePlaceName(text);
    case 'police_station':
      return normalizePoliceStation(text);
    case 'court':
      return normalizeCourt(text);
    case 'case_number':
      return normalizeCaseNumber(text);
    case 'section_ref':
      return normalizeSectionRef(text);
    case 'enum': {
      const nv = normalise(text);
      const option = item.options.find((o) => normalise(o) === nv);
      return option === undefined
        ? unresolvedOf('not_an_option', LEDGER_DETAILS.not_an_option)
        : { ok: true, value: option, display: option };
    }
    default: {
      const v = text.trim();
      if (v === '') return unresolvedOf('empty', 'The value is empty.');
      return { ok: true, value: v, display: v };
    }
  }
}

function newId(): string {
  return crypto.randomUUID();
}

function makeFact(
  item: ChecklistItem,
  value: LedgerValue,
  display: string,
  rawSpan: string,
  source: FactSource,
  confidence: number,
): LedgerFact {
  return {
    id: newId(),
    key: item.key,
    label: item.label,
    type: factTypeFor(item),
    value,
    display,
    raw_span: rawSpan,
    source,
    confidence,
    required_in_draft: item.required,
  } as LedgerFact;
}

function makeUnresolved(
  item: ChecklistItem,
  rawSpan: string,
  source: FactSource,
  reason: UnresolvedReason,
  detail: string,
): LedgerUnresolvedFact {
  return {
    id: newId(),
    key: item.key,
    label: item.label,
    type: factTypeFor(item),
    raw_span: rawSpan,
    source,
    reason,
    detail,
  };
}

// ── The span must be the advocate's own words ───────────────────────────────

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The span exactly as it stands in the text, or null. A model that changed
 * only the spacing gets the text's own characters back, so what is stored is
 * always verbatim in the advocate's words.
 */
export function locateSpan(text: string, span: string): string | null {
  const s = span.trim();
  if (s === '' || s.length > SPAN_MAX) return null;
  if (text.includes(s)) return s;
  const words = s.normalize('NFC').split(/\s+/).filter((w) => w !== '');
  if (words.length === 0) return null;
  const re = new RegExp(words.map(escapeRegExp).join('\\s+'), 'u');
  const m = re.exec(text.normalize('NFC'));
  if (!m) return null;
  // Only a match that is still verbatim in the text as sent is kept.
  return text.includes(m[0]) ? m[0] : null;
}

// ── The extraction pass's answer ────────────────────────────────────────────

export interface ExtractionResult {
  facts: LedgerFact[];
  unresolved: LedgerUnresolvedFact[];
  /** Why an entry was not kept. Reasons and counts only: no key the model wrote, no text. */
  dropped: Array<{ reason: 'not_on_list' | 'no_span' | 'span_not_found' }>;
}

/**
 * Turn the extraction pass's JSON into facts and unresolved facts. `text` is
 * the description. Every value is read by code from a span found in it.
 */
export function readExtraction(
  checklist: ChecklistItem[],
  text: string,
  parsed: Record<string, unknown> | null,
  refYear: number,
): ExtractionResult {
  const result: ExtractionResult = { facts: [], unresolved: [], dropped: [] };
  const allowed = new Map(
    checklist.filter((i) => i.modelReadable && isLedgerItem(i)).map((i) => [i.key, i]),
  );
  const raw = parsed && Array.isArray(parsed.facts) ? parsed.facts : [];

  // Each key's located entries, in order.
  const byKey = new Map<string, Array<{ span: string; option?: string; confidence: number }>>();
  for (const entry of raw) {
    const e = (entry ?? {}) as { key?: unknown; span?: unknown; option?: unknown; confidence?: unknown };
    if (typeof e.key !== 'string' || !allowed.has(e.key)) {
      result.dropped.push({ reason: 'not_on_list' });
      continue;
    }
    if (typeof e.span !== 'string' || e.span.trim() === '' || e.span.length > SPAN_MAX) {
      result.dropped.push({ reason: 'no_span' });
      continue;
    }
    const span = locateSpan(text, e.span);
    if (span === null) {
      result.dropped.push({ reason: 'span_not_found' });
      continue;
    }
    const confidence =
      typeof e.confidence === 'number' && Number.isFinite(e.confidence)
        ? Math.min(1, Math.max(0, e.confidence))
        : 0;
    const list = byKey.get(e.key) ?? [];
    list.push({ span, ...(typeof e.option === 'string' ? { option: e.option } : {}), confidence });
    byKey.set(e.key, list);
  }

  for (const [key, entries] of byKey) {
    const item = allowed.get(key) as ChecklistItem;
    const type = factTypeFor(item);
    const read = entries.map((en) => ({
      en,
      n: normalizeForItem(item, type === 'enum' ? (en.option ?? en.span) : en.span, refYear),
    }));
    const first = read[0];
    // Two entries that read to different values: neither is kept (ADR-019 rule 4.1.5).
    const values = new Set(read.filter((r) => r.n.ok).map((r) => JSON.stringify((r.n as { value: unknown }).value)));
    if (values.size > 1) {
      result.unresolved.push(
        makeUnresolved(item, first.en.span, 'user', 'conflicting_values', LEDGER_DETAILS.conflicting_values),
      );
      continue;
    }
    const good = read.find((r) => r.n.ok);
    if (!good) {
      const n = first.n as { ok: false; reason: UnresolvedReason; detail: string };
      result.unresolved.push(makeUnresolved(item, first.en.span, 'user', n.reason, n.detail));
      continue;
    }
    const best = Math.max(...read.filter((r) => r.n.ok).map((r) => r.en.confidence));
    if (best < CONFIDENCE_FLOORS[type]) {
      result.unresolved.push(
        makeUnresolved(item, good.en.span, 'user', 'low_confidence', LEDGER_DETAILS.low_confidence),
      );
      continue;
    }
    const n = good.n as { ok: true; value: LedgerValue; display: string };
    result.facts.push(makeFact(item, n.value, n.display, good.en.span, 'user', best));
  }
  return result;
}

// ── Answers and edits ───────────────────────────────────────────────────────

export interface LedgerEdit {
  key: string;
  /** What the advocate typed or picked, exactly. Empty clears the fact. */
  text: string;
  /** True when the value was given on the questions step. */
  fromQuestion?: boolean;
}

export type LedgerEditResult =
  | { key: string; status: 'saved'; display: string | null }
  | { key: string; status: 'unreadable'; reason: UnresolvedReason; detail: string }
  | { key: string; status: 'skipped' };

interface LedgerState {
  facts: LedgerFact[];
  unresolved: LedgerUnresolvedFact[];
}

/**
 * One answer or edit, applied to the current state. Returns the next state
 * (or null when nothing changes) and the version reason.
 *
 * The rule for the reason: `answer` when the key is in `unresolved`, or the
 * value came from the questions step, or the key has no fact yet; `edit` when
 * an existing fact is changed on the brief.
 */
export function applyEdit(
  state: LedgerState,
  item: ChecklistItem | undefined,
  edit: LedgerEdit,
  refYear: number,
): { next: LedgerState | null; reason: FactLedgerVersionReason; result: LedgerEditResult } {
  const key = edit.key;
  if (!item || !isLedgerItem(item)) {
    return { next: null, reason: 'edit', result: { key, status: 'skipped' } };
  }
  const existing = state.facts.find((f) => f.key === key);
  const wasUnresolved = state.unresolved.some((u) => u.key === key);
  const reason: FactLedgerVersionReason =
    wasUnresolved || edit.fromQuestion === true || !existing ? 'answer' : 'edit';
  const otherFacts = state.facts.filter((f) => f.key !== key);
  const otherUnresolved = state.unresolved.filter((u) => u.key !== key);
  const text = edit.text.trim();

  if (text === '') {
    // Emptying a field is a valid edit: the fact and any doubt about it go.
    if (!existing && !wasUnresolved) return { next: null, reason, result: { key, status: 'saved', display: null } };
    return {
      next: { facts: otherFacts, unresolved: otherUnresolved },
      reason,
      result: { key, status: 'saved', display: null },
    };
  }

  const n = normalizeForItem(item, text, refYear);
  if (!n.ok) {
    const result: LedgerEditResult = { key, status: 'unreadable', reason: n.reason, detail: n.detail };
    // An existing fact keeps its value. An answer that cannot be read is still
    // outstanding (it has a question, so it stays asked). A value typed into an
    // empty field on the brief that cannot be read writes nothing: the row shows why.
    if (existing || (!wasUnresolved && edit.fromQuestion !== true)) return { next: null, reason, result };
    return {
      next: {
        facts: otherFacts,
        unresolved: [...otherUnresolved, makeUnresolved(item, text, 'asked', n.reason, n.detail)],
      },
      reason,
      result,
    };
  }
  if (existing && existing.raw_span === text && existing.source === 'asked') {
    return { next: null, reason, result: { key, status: 'saved', display: existing.display } };
  }
  const fact = makeFact(item, n.value, n.display, text, 'asked', 1);
  return {
    next: { facts: [...otherFacts, fact], unresolved: otherUnresolved },
    reason,
    result: { key, status: 'saved', display: n.display },
  };
}

// ── What the API returns ────────────────────────────────────────────────────

export interface LedgerView {
  ledger_id: string;
  version: number;
  run_type: FactLedgerRunType;
  document_kind: string;
  facts: Array<LedgerFact & { previous_display?: string }>;
  unresolved: LedgerUnresolvedFact[];
  /** The fact type of every brief item the ledger holds, by key: which rows send edits here. */
  fields: Record<string, FactType>;
}

function sameFact(a: LedgerFact | undefined, b: LedgerFact | undefined): boolean {
  if (!a || !b) return a === b;
  return a.raw_span === b.raw_span && a.display === b.display && a.source === b.source;
}

/**
 * The current version, with `previous_display` on a fact whose last change was
 * an edit of an earlier value.
 */
export function ledgerView(
  doc: Pick<IFactLedger, 'id' | 'runType' | 'documentKind' | 'versions'>,
  checklist: ChecklistItem[],
): LedgerView {
  const versions = doc.versions;
  const current = versions[versions.length - 1];
  const facts = (current?.facts ?? []).map((fact) => {
    for (let i = versions.length - 1; i > 0; i -= 1) {
      const now = versions[i].facts.find((f) => f.key === fact.key);
      const before = versions[i - 1].facts.find((f) => f.key === fact.key);
      if (sameFact(now, before)) continue;
      if (versions[i].reason === 'edit' && before && now) {
        return { ...fact, previous_display: before.display };
      }
      break;
    }
    return { ...fact };
  });
  return {
    ledger_id: String(doc.id),
    version: current?.version ?? 0,
    run_type: doc.runType,
    document_kind: doc.documentKind,
    facts,
    unresolved: [...(current?.unresolved ?? [])],
    fields: Object.fromEntries(
      checklist.filter(isLedgerItem).map((i) => [i.key, factTypeFor(i)]),
    ),
  };
}

// ── Storage ─────────────────────────────────────────────────────────────────

export class LedgerConflictError extends Error {
  constructor() {
    super('ledger changed while this write was made');
    this.name = 'LedgerConflictError';
  }
}

function version(n: number, state: LedgerState, reason: FactLedgerVersionReason): IFactLedgerVersion {
  return { version: n, facts: state.facts, unresolved: state.unresolved, createdAt: new Date(), reason };
}

export async function createLedger(args: {
  userId: string;
  documentKind: string;
  intakeId: string;
  state: LedgerState;
  runType?: FactLedgerRunType;
}): Promise<IFactLedger> {
  return FactLedgerModel.create({
    userId: args.userId,
    documentKind: args.documentKind,
    runType: args.runType ?? 'user',
    intakeId: args.intakeId,
    currentVersion: 1,
    versions: [version(1, args.state, 'extract')],
  });
}

/** The ledger, when it exists and belongs to this user. Anything else is null. */
export async function loadOwnLedger(ledgerId: string, userId: string): Promise<IFactLedger | null> {
  if (!mongoose.isValidObjectId(ledgerId) || !mongoose.isValidObjectId(userId)) return null;
  return FactLedgerModel.findOne({ _id: ledgerId, userId });
}

export function currentState(doc: IFactLedger): LedgerState {
  const v = doc.versions[doc.versions.length - 1];
  return { facts: [...(v?.facts ?? [])], unresolved: [...(v?.unresolved ?? [])] };
}

/**
 * Append one version. Earlier versions are never touched: the write is a
 * `$push`, and only when no other write came first.
 */
export class LedgerFullError extends Error {
  constructor() {
    super('ledger holds its most versions');
    this.name = 'LedgerFullError';
  }
}

export async function appendVersion(
  doc: IFactLedger,
  state: LedgerState,
  reason: FactLedgerVersionReason,
  maxVersions: number,
): Promise<IFactLedger> {
  if (doc.currentVersion >= maxVersions) throw new LedgerFullError();
  const next = doc.currentVersion + 1;
  const updated = await FactLedgerModel.findOneAndUpdate(
    { _id: doc._id, userId: doc.userId, currentVersion: doc.currentVersion },
    { $push: { versions: version(next, state, reason) }, $set: { currentVersion: next } },
    { new: true },
  );
  if (!updated) throw new LedgerConflictError();
  return updated;
}

/**
 * Apply the answers and edits of one request, in order, as one version.
 *
 * The version's reason: `edit` when any of them changed an existing fact on
 * the brief, else `answer`. Nothing is written when nothing changed. Throws
 * LedgerFullError when the ledger already holds `maxVersions`.
 *
 * Returns the ledger
 * after them and one result per edit.
 */
export async function applyEdits(
  doc: IFactLedger,
  checklist: ChecklistItem[],
  edits: LedgerEdit[],
  maxVersions: number,
  now = new Date(),
): Promise<{ doc: IFactLedger; results: LedgerEditResult[] }> {
  const byKey = new Map(checklist.map((i) => [i.key, i]));
  const refYear = referenceYear(now);
  const results: LedgerEditResult[] = [];
  let state = currentState(doc);
  let changed = false;
  let anyEdit = false;
  for (const edit of edits) {
    const { next, reason, result } = applyEdit(state, byKey.get(edit.key), edit, refYear);
    results.push(result);
    if (next) {
      state = next;
      changed = true;
      if (reason === 'edit') anyEdit = true;
    }
  }
  if (!changed) return { doc, results };
  const after = await appendVersion(doc, state, anyEdit ? 'edit' : 'answer', maxVersions);
  return { doc: after, results };
}

/**
 * The facts the advocate gave on an earlier ledger (answers and edits) that
 * the new checklist also has, laid over a new reading. Used on a change of
 * document, as `keep` is for the brief: what the advocate typed wins.
 */
export function carryOver(
  fresh: LedgerState,
  earlier: LedgerState | null,
  checklist: ChecklistItem[],
): LedgerState {
  if (!earlier) return fresh;
  const byKey = new Map(checklist.filter(isLedgerItem).map((i) => [i.key, i]));
  const asked = earlier.facts.filter((f) => f.source === 'asked' && byKey.has(f.key));
  const keys = new Set(asked.map((f) => f.key));
  return {
    facts: [
      ...fresh.facts.filter((f) => !keys.has(f.key)),
      ...asked.map((f) => {
        const item = byKey.get(f.key) as ChecklistItem;
        return { ...f, label: item.label, required_in_draft: item.required };
      }),
    ],
    unresolved: fresh.unresolved.filter((u) => !keys.has(u.key)),
  };
}

export type { LedgerState };

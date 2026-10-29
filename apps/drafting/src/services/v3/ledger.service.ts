/**
 * T-682 — the v3 typed fact ledger: the one ledger API (schema §3-§4, approved
 * by Arjun with conditions 1-8; handoff/design/T-682-ledger-schema-review-arjun.md).
 *
 * Only this module reads or writes `factledgers_v3`. It is called by the v3
 * orchestrator (T-685) behind `feature.drafting_v3_stage` ≥ 1; with the stage
 * off nothing calls it and v2 runs unchanged. Nothing here changes v2: the v2
 * rules (normalizer, confidence floors, non-answers, verbatim spans, the
 * computed facts, custody-since R1) are IMPORTED from their v2 modules and
 * applied through v2's own functions, never copied (condition 3).
 *
 * Invariants (§3), each enforced here:
 *  1. one ledger per run (`runId` unique; a second create returns the first);
 *  2. append-only: a write `$push`es one version only when `currentVersion` is
 *     still the one the caller read, else `LedgerVersionRaceError`;
 *  3. every user/asked entry has a quote verbatim in that turn's text, both
 *     sides NFC (condition 2); a candidate without one is dropped and counted;
 *  4. a non-answer is a `NonAnswer`, never an entry (AJ-655-M1);
 *  5. two values for one single-value key become a `conflict` entry, never a
 *     silent pick; it closes only on the advocate's answer;
 *  6. derived entries are computed by code at read, never stored, never
 *     supplied by the model, and never over a held user/asked entry;
 *  7. unresolved and conflict entries are never read as held.
 *
 * Privacy: logs carry ids, counts and reason codes only; never a key's value,
 * a quote or the turn text. The turn text and `described` are never stored.
 */
import crypto from 'crypto';

import {
  CONFIDENCE_FLOORS,
  type LedgerFact,
  type LedgerUnresolvedFact,
  type UnresolvedReason,
} from '@lawie/shared';
import mongoose from 'mongoose';

import logger from '../../config/logger';
import { FactLedgerModel } from '../../models/FactLedger.model';
import {
  FactLedgerV3Model,
  type IFactLedgerV3,
  type IFactLedgerV3Version,
} from '../../models/FactLedgerV3.model';
import { decrypt, encrypt } from '../../utils/encryption';
import { AppSettingMissingError, getAppSetting } from '../app-settings.service';
import {
  ARREST_DATE_KEY,
  CUSTODY_CHOICE_KEY,
  CUSTODY_SINCE_DERIVED_KEY,
  CUSTODY_SINCE_KEY,
  withCustodySinceDerived,
} from '../custody-since-derivation';
import {
  applyEdit,
  factTypeFor,
  isLedgerItem,
  isMultiItem,
  LEDGER_DETAILS,
  normalizeForItem,
  type LedgerEdit,
  type LedgerEditResult,
  LedgerFullError,
  type LedgerView,
  locateSpan,
  readExtraction,
  referenceYear,
  withAmountInWordsFact,
} from '../fact-ledger.service';
import { buildChecklist, type ChecklistItem, isNoFactAnswer } from '../intake-brief';
import { loadRulePack } from '../rule-pack.service';

import { fromV2, fromV2Fact, fromV2Unresolved, toV2Fact, toV2Unresolved } from './from-v2';
import type {
  ConflictCandidate,
  DropCount,
  DropReason,
  ExtractResult,
  GenerationFacts,
  LedgerCandidate,
  LedgerEntry,
  LedgerSealedState,
  LedgerSnapshot,
  LedgerVersionReason,
  NonAnswer,
} from './ledger.types';

// ── The switch ──────────────────────────────────────────────────────────────

export const DRAFTING_V3_STAGE_SETTING = 'feature.drafting_v3_stage';

/**
 * The v3 stage (0 = off). A missing setting, a value that is not a whole
 * number ≥ 0, or a read error is 0: fail closed, v2 runs. Never throws.
 */
export async function draftingV3Stage(): Promise<number> {
  try {
    const raw = (await getAppSetting(DRAFTING_V3_STAGE_SETTING)).trim();
    return /^\d+$/.test(raw) ? Number(raw) : 0;
  } catch (err) {
    if (!(err instanceof AppSettingMissingError)) {
      logger.warn({ setting: DRAFTING_V3_STAGE_SETTING }, 'T-682: v3 stage unreadable; off');
    }
    return 0;
  }
}

/** True when the v3 ledger is on (stage ≥ 1). */
export async function isLedgerV3On(): Promise<boolean> {
  return (await draftingV3Stage()) >= 1;
}

// ── Limits and errors ───────────────────────────────────────────────────────

/** Versions per ledger (v2's cap, schema §2). */
export const LEDGER_V3_MAX_VERSIONS = 100;
/** The largest sealed version accepted (Arjun Q9): never a silent Mongo 16 MB failure. */
export const LEDGER_V3_MAX_SEALED_BYTES = 2 * 1024 * 1024;
/** The sealed versions of one ledger together (Mongo's document limit is 16 MB). */
export const LEDGER_V3_MAX_DOC_SEALED_BYTES = 12 * 1024 * 1024;
/** A quote's longest length (T-683). A narrative item's words are its value, so its quote may be longer (v2 SPAN_MAX). */
export const QUOTE_MAX = 200;

/** Invariant 2: another write came first; re-read and try again. */
export class LedgerVersionRaceError extends Error {
  constructor() {
    super('ledger changed while this write was made');
    this.name = 'LedgerVersionRaceError';
  }
}

/** Q9: a version whose sealed state exceeds LEDGER_V3_MAX_SEALED_BYTES is refused. */
export class LedgerVersionTooLargeError extends Error {
  constructor() {
    super('ledger version is too large');
    this.name = 'LedgerVersionTooLargeError';
  }
}

/** createLedger's `initial` was not made by importV2State / carryOverState. Fixed message. */
export class LedgerInitialStateError extends Error {
  constructor() {
    super('ledger initial state must come from importV2State or carryOverState');
    this.name = 'LedgerInitialStateError';
  }
}

/** A sealed version that does not decrypt to a ledger state. Fixed message, no content. */
export class LedgerSealedUnreadableError extends Error {
  constructor() {
    super('sealed ledger version is unreadable');
    this.name = 'LedgerSealedUnreadableError';
  }
}

/** The run already has a ledger that belongs to another user. */
export class LedgerRunTakenError extends Error {
  constructor() {
    super('the run has a ledger of another user');
    this.name = 'LedgerRunTakenError';
  }
}

/** A write to a ledger that is not a v3 ledger of this user. */
export class LedgerNotFoundV3Error extends Error {
  constructor() {
    super('v3 ledger not found');
    this.name = 'LedgerNotFoundV3Error';
  }
}

export { LedgerFullError };

// ── Small helpers ───────────────────────────────────────────────────────────

function lastSegment(key: string): string {
  const at = key.lastIndexOf('.');
  return at < 0 ? key : key.slice(at + 1);
}

/** v2 readExtraction's rule: a non-number or non-finite confidence is 0; then clamped to [0, 1]. */
function clampConfidence(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

function nfc(s: string): string {
  return s.normalize('NFC');
}

/**
 * Keys only code may give (invariant 6): a model candidate for one is dropped.
 * The s.138 computed keys are on no checklist, so a candidate for one drops
 * as `not_on_list` (T-363: they are computed on generate-from-brief only).
 */
const DERIVED_ONLY_KEYS: ReadonlySet<string> = new Set([
  'amount_in_words',
  CUSTODY_SINCE_DERIVED_KEY,
]);

function seal(state: LedgerSealedState): string {
  const sealed = encrypt(JSON.stringify(state));
  if (Buffer.byteLength(sealed, 'utf8') > LEDGER_V3_MAX_SEALED_BYTES) {
    throw new LedgerVersionTooLargeError();
  }
  return sealed;
}

function unseal(v: Pick<IFactLedgerV3Version, 'sealed'> | undefined): LedgerSealedState {
  if (!v) return { entries: [], nonAnswers: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(decrypt(v.sealed));
  } catch {
    // Fixed text only: a parse error message could carry a snippet of the plaintext.
    throw new LedgerSealedUnreadableError();
  }
  const ok =
    typeof parsed === 'object' &&
    parsed !== null &&
    Array.isArray((parsed as LedgerSealedState).entries) &&
    Array.isArray((parsed as LedgerSealedState).nonAnswers);
  if (!ok) throw new LedgerSealedUnreadableError();
  const s = parsed as LedgerSealedState;
  return { entries: [...s.entries], nonAnswers: [...s.nonAnswers] };
}

function entriesOfKey(entries: readonly LedgerEntry[], key: string): LedgerEntry[] {
  return entries.filter((e) => e.key === key);
}

function sameEntries(a: readonly LedgerEntry[], b: readonly LedgerEntry[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Keys whose entries or non-answer differ between two states. */
function changedKeys(before: LedgerSealedState, after: LedgerSealedState): string[] {
  const keys = new Set<string>([
    ...before.entries.map((e) => e.key),
    ...after.entries.map((e) => e.key),
    ...before.nonAnswers.map((n) => n.key),
    ...after.nonAnswers.map((n) => n.key),
  ]);
  return [...keys].filter((k) => {
    const na = JSON.stringify(before.nonAnswers.filter((n) => n.key === k));
    const nb = JSON.stringify(after.nonAnswers.filter((n) => n.key === k));
    return (
      !sameEntries(entriesOfKey(before.entries, k), entriesOfKey(after.entries, k)) || na !== nb
    );
  });
}

/** Stored (non-derived) entries as the v2 state v2's functions read. Conflicts are left out. */
function toV2State(entries: readonly LedgerEntry[]): {
  facts: LedgerFact[];
  unresolved: LedgerUnresolvedFact[];
} {
  return {
    facts: entries
      .filter((e) => e.status === 'held' && e.origin.source !== 'derived')
      .map(toV2Fact),
    unresolved: entries.filter((e) => e.status === 'unresolved').map(toV2Unresolved),
  };
}

/** Number the held entries of a multi key 0..n-1; leave single keys without an index. */
function withIndexes(entries: LedgerEntry[], checklist: readonly ChecklistItem[]): LedgerEntry[] {
  const multi = new Set(checklist.filter(isMultiItem).map((i) => i.key));
  const seen = new Map<string, number>();
  return entries.map((e) => {
    if (e.status !== 'held' || !multi.has(e.key)) return e;
    const i = seen.get(e.key) ?? 0;
    seen.set(e.key, i + 1);
    return { ...e, index: i };
  });
}

function snapshotOf(doc: IFactLedgerV3, state: LedgerSealedState): LedgerSnapshot {
  const previousDisplays = previousDisplaysOf(doc, state);
  return {
    ledgerId: String(doc._id),
    runId: doc.runId,
    packId: doc.packId,
    runType: doc.runType,
    store: 'v3',
    version: doc.currentVersion,
    entries: state.entries,
    nonAnswers: state.nonAnswers,
    ...(Object.keys(previousDisplays).length > 0 ? { previousDisplays } : {}),
  };
}

/**
 * v2's `previous_display` rule: walking back from the newest version, the
 * first version that changed a key's held entries; when that version is an
 * edit with entries before and after, the earlier displays, comma-joined.
 */
function previousDisplaysOf(
  doc: IFactLedgerV3,
  current: LedgerSealedState,
): Record<string, string> {
  const out: Record<string, string> = {};
  const versions = doc.versions;
  if (versions.length < 2) return out;
  const opened = versions.map((v, i) => (i === versions.length - 1 ? current : unseal(v)));
  const held = (s: LedgerSealedState, key: string) =>
    s.entries.filter((e) => e.key === key && e.status === 'held');
  const keys = new Set(current.entries.filter((e) => e.status === 'held').map((e) => e.key));
  for (const key of keys) {
    for (let i = versions.length - 1; i > 0; i -= 1) {
      const now = held(opened[i], key);
      const before = held(opened[i - 1], key);
      if (sameEntries(now, before)) continue;
      if (versions[i].reason === 'edit' && before.length > 0 && now.length > 0) {
        out[key] = before.map((e) => e.display ?? '').join(', ');
      }
      break;
    }
  }
  return out;
}

async function loadV3(ledgerId: string, userId: string): Promise<IFactLedgerV3 | null> {
  if (!mongoose.isValidObjectId(ledgerId) || !mongoose.isValidObjectId(userId)) return null;
  return FactLedgerV3Model.findOne({ _id: ledgerId, userId });
}

/** Append one version, only when `currentVersion` is still `expected` (invariant 2). */
async function append(
  doc: IFactLedgerV3,
  expected: number,
  before: LedgerSealedState,
  after: LedgerSealedState,
  reason: LedgerVersionReason,
): Promise<IFactLedgerV3> {
  if (doc.currentVersion !== expected) throw new LedgerVersionRaceError();
  if (doc.currentVersion >= LEDGER_V3_MAX_VERSIONS) throw new LedgerFullError();
  const next = expected + 1;
  const version: IFactLedgerV3Version = {
    version: next,
    reason,
    createdAt: new Date(),
    changedKeys: changedKeys(before, after),
    sealed: seal(after),
  };
  // Q9 / review: the whole document's sealed size, checked before the write (typed, nothing stored).
  const total =
    doc.versions.reduce((n, v) => n + Buffer.byteLength(v.sealed, 'utf8'), 0) +
    Buffer.byteLength(version.sealed, 'utf8');
  if (total > LEDGER_V3_MAX_DOC_SEALED_BYTES) throw new LedgerVersionTooLargeError();
  const updated = await FactLedgerV3Model.findOneAndUpdate(
    { _id: doc._id, userId: doc.userId, currentVersion: expected },
    { $push: { versions: version }, $set: { currentVersion: next } },
    { new: true },
  );
  if (!updated) throw new LedgerVersionRaceError();
  return updated;
}

// ── Derive (invariant 6) ────────────────────────────────────────────────────

/** The rule, its version and the keys it reads, per derived key. */
const DERIVE_RULES: ReadonlyArray<{ key: string; rule: string; inputs: readonly string[] }> = [
  { key: 'amount_in_words', rule: 'amount_in_words.p5', inputs: ['cheque_amount'] },
  {
    key: CUSTODY_SINCE_KEY,
    rule: 'custody_since.r1',
    inputs: [ARREST_DATE_KEY, CUSTODY_CHOICE_KEY],
  },
  {
    key: CUSTODY_SINCE_DERIVED_KEY,
    rule: 'custody_since.r1',
    inputs: [ARREST_DATE_KEY, CUSTODY_CHOICE_KEY],
  },
];

/**
 * The derived entries for a state, computed now by v2's own functions in
 * generation's order (amount in words, custody-since R1). Deferred to T-685 /
 * T-680, applied by generation on top as today: the s.138 date checks (T-363:
 * computed on the generate-from-brief route only), the law switch and
 * limitation.
 * Pure. A conflict counts as unresolved for the rules, so a conflicting input
 * or target derives nothing. A derived entry is never added over a key a
 * user/asked entry holds. `described` is the request's description when the
 * caller has it (it is never stored); without it, custody-since scans the
 * entries' own words only (the T-665b known limit).
 */
export function derive(
  s: Pick<LedgerSnapshot, 'packId' | 'entries'>,
  checklist: ReadonlyArray<{ key: string; label: string }>,
  ctx: { described?: string | null } = {},
): LedgerEntry[] {
  const stored = s.entries.filter((e) => e.origin.source !== 'derived');
  const { facts, unresolved } = toV2State(stored);
  const open = [
    ...unresolved,
    ...stored.filter((e) => e.status === 'conflict').map(conflictAsUnresolved),
  ];
  let out = withAmountInWordsFact(facts, checklist);
  out = withCustodySinceDerived(out, s.packId, ctx.described ?? null, open);
  const givenKeys = new Set(
    stored
      .filter(
        (e) => e.status === 'held' && (e.origin.source === 'user' || e.origin.source === 'asked'),
      )
      .map((e) => lastSegment(e.key)),
  );
  const heldByName = (name: string) =>
    stored.filter((e) => e.status === 'held' && lastSegment(e.key) === name).map((e) => e.id);
  return out
    .filter((f) => f.source === 'computed' && !givenKeys.has(lastSegment(f.key)))
    .map((f) => {
      const r = DERIVE_RULES.find((d) => d.key === lastSegment(f.key));
      return {
        ...fromV2Fact(f),
        origin: { source: 'derived' as const, quote: '', confidence: 1 },
        derivation: {
          rule: r?.rule ?? 'unknown',
          ruleVersion: 1,
          inputs: (r?.inputs ?? []).flatMap(heldByName),
        },
      };
    });
}

function conflictAsUnresolved(e: LedgerEntry): LedgerUnresolvedFact {
  return toV2Unresolved({
    ...e,
    status: 'unresolved',
    origin: { ...e.origin, quote: e.candidates?.[0]?.source.quote ?? e.origin.quote },
    reason: 'conflicting_values',
    detail: LEDGER_DETAILS.conflicting_values,
  });
}

function checklistOf(packId: string): ChecklistItem[] {
  const pack = loadRulePack(packId);
  return pack ? buildChecklist(pack) : [];
}

/** The snapshot with the derived entries computed now, after the stored ones. */
function withDerived(s: LedgerSnapshot, described?: string | null): LedgerSnapshot {
  const stored = s.entries.filter((e) => e.origin.source !== 'derived');
  return { ...s, entries: [...stored, ...derive(s, checklistOf(s.packId), { described })] };
}

// ── Read ────────────────────────────────────────────────────────────────────

export interface OpenOptions {
  /** The request's description, when it has one (never stored). */
  described?: string | null;
}

/** A v3 ledger of this user; else a v2 ledger of this user, adapted. Derived entries added. */
export async function openLedger(
  ledgerId: string,
  userId: string,
  opts: OpenOptions = {},
): Promise<LedgerSnapshot | null> {
  const v3 = await loadV3(ledgerId, userId);
  if (v3)
    return withDerived(snapshotOf(v3, unseal(v3.versions[v3.versions.length - 1])), opts.described);
  if (!mongoose.isValidObjectId(ledgerId) || !mongoose.isValidObjectId(userId)) return null;
  const v2 = await FactLedgerModel.findOne({ _id: ledgerId, userId });
  return v2 ? withDerived(fromV2(v2), opts.described) : null;
}

/**
 * Condition 7: the run's v3 ledger when there is one, else its v2 ledger
 * (until T-685 the run id is the v2 intake id; the newest one), never both
 * merged. Derived entries added.
 */
export async function openLedgerForRun(
  runId: string,
  userId: string,
  opts: OpenOptions = {},
): Promise<LedgerSnapshot | null> {
  if (typeof runId !== 'string' || runId === '' || !mongoose.isValidObjectId(userId)) return null;
  const v3 = await FactLedgerV3Model.findOne({ runId, userId });
  if (v3)
    return withDerived(snapshotOf(v3, unseal(v3.versions[v3.versions.length - 1])), opts.described);
  const v2 = await FactLedgerModel.findOne({ intakeId: runId, userId }).sort({ createdAt: -1 });
  return v2 ? withDerived(fromV2(v2), opts.described) : null;
}

/** Held entries (invariant 7), with the derived ones unless `derived: false`. */
export function held(s: LedgerSnapshot, opts: { derived?: boolean } = {}): LedgerEntry[] {
  return s.entries.filter(
    (e) => e.status === 'held' && (opts.derived !== false || e.origin.source !== 'derived'),
  );
}

export function heldByKey(s: LedgerSnapshot): ReadonlyMap<string, LedgerEntry[]> {
  const out = new Map<string, LedgerEntry[]>();
  for (const e of held(s)) out.set(e.key, [...(out.get(e.key) ?? []), e]);
  return out;
}

export function openItems(s: LedgerSnapshot): {
  unresolved: LedgerEntry[];
  conflicts: LedgerEntry[];
  nonAnswers: NonAnswer[];
} {
  return {
    unresolved: s.entries.filter((e) => e.status === 'unresolved'),
    conflicts: s.entries.filter((e) => e.status === 'conflict'),
    nonAnswers: [...s.nonAnswers],
  };
}

// ── Views (v2 shapes) ───────────────────────────────────────────────────────

/**
 * What generation reads, in v2 shape: the held facts in stored order, then the
 * derived ones (unless `derived: false`); unresolved items, then each conflict
 * as an unresolved `conflicting_values` item (v2's own reason and line), so it
 * shows its blank and is asked, never picked. On a v2 ledger with
 * `derived: false` this is `currentState(doc)` byte for byte (condition 6).
 */
export function factsForGeneration(
  s: LedgerSnapshot,
  opts: { derived?: boolean } = {},
): GenerationFacts {
  return {
    facts: held(s, opts).map(toV2Fact),
    unresolved: [
      ...s.entries.filter((e) => e.status === 'unresolved').map(toV2Unresolved),
      ...s.entries.filter((e) => e.status === 'conflict').map(conflictAsUnresolved),
    ],
  };
}

/** The verifier reads the same held set as generation. */
export function factsForVerifier(s: LedgerSnapshot): LedgerFact[] {
  return factsForGeneration(s).facts;
}

/**
 * The brief's ledger, in v2's `LedgerView` shape (the web app is unchanged):
 * stored held facts (no derived ones, as v2), unresolved items and conflicts
 * (as unresolved, so the row asks), the fact types of the checklist's ledger
 * items. `conflicts` is extra and names the conflicting keys only.
 */
export function viewForBrief(
  s: LedgerSnapshot,
  checklist: ChecklistItem[],
): LedgerView & { conflicts: string[] } {
  const { facts, unresolved } = factsForGeneration(s, { derived: false });
  const prev = s.previousDisplays ?? {};
  return {
    ledger_id: s.ledgerId,
    version: s.version,
    run_type: s.runType,
    document_kind: s.packId,
    facts: facts.map((f) =>
      prev[f.key] !== undefined ? { ...f, previous_display: prev[f.key] } : { ...f },
    ),
    unresolved,
    fields: Object.fromEntries(checklist.filter(isLedgerItem).map((i) => [i.key, factTypeFor(i)])),
    conflicts: [...new Set(s.entries.filter((e) => e.status === 'conflict').map((e) => e.key))],
  };
}

// ── Write ───────────────────────────────────────────────────────────────────

/**
 * Invariant 1: the run's ledger, created once. A second call for the same run
 * and user returns the existing ledger; a run held by another user throws
 * `LedgerRunTakenError`. `initial` is version 1's state (empty, an `import_v2`
 * or a `kind_change` carry-over, see `importV2State` / `carryOverState`).
 */
// T-685: the orchestrator must always pass `intakeId` (document erase reaches v3 ledgers through it).
export async function createLedger(args: {
  runId: string;
  userId: string;
  packId: string;
  intakeId?: string;
  runType?: 'user' | 'fixture';
  initial?: LedgerSealedState;
  reason?: Extract<LedgerVersionReason, 'extract' | 'import_v2' | 'kind_change'>;
  importedFrom?: string;
}): Promise<LedgerSnapshot> {
  if (
    typeof args.runId !== 'string' ||
    args.runId === '' ||
    !mongoose.isValidObjectId(args.userId)
  ) {
    throw new LedgerNotFoundV3Error();
  }
  // Checked first, so a hand-built `initial` is refused even for a run that already has a ledger.
  if (args.initial !== undefined && !BUILT_INITIAL_STATES.has(args.initial)) {
    throw new LedgerInitialStateError();
  }
  const existing = await FactLedgerV3Model.findOne({ runId: args.runId, userId: args.userId });
  if (existing)
    return snapshotOf(existing, unseal(existing.versions[existing.versions.length - 1]));
  const initial = args.initial ?? { entries: [], nonAnswers: [] };
  try {
    const doc = await FactLedgerV3Model.create({
      runId: args.runId,
      userId: args.userId,
      packId: args.packId,
      runType: args.runType ?? 'user',
      ...(args.intakeId ? { intakeId: args.intakeId } : {}),
      ...(args.importedFrom ? { importedFrom: args.importedFrom } : {}),
      currentVersion: 1,
      versions: [
        {
          version: 1,
          reason: args.reason ?? 'extract',
          createdAt: new Date(),
          changedKeys: changedKeys({ entries: [], nonAnswers: [] }, initial),
          sealed: seal(initial),
        },
      ],
    });
    return snapshotOf(doc, initial);
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
    // Two creates for one run at once: the other one won; return it.
    const won = await FactLedgerV3Model.findOne({ runId: args.runId, userId: args.userId });
    if (!won) throw new LedgerRunTakenError();
    return snapshotOf(won, unseal(won.versions[won.versions.length - 1]));
  }
}

/** The only states `createLedger` accepts as `initial`: made by importV2State / carryOverState. */
const BUILT_INITIAL_STATES = new WeakSet<LedgerSealedState>();

function builtInitial(state: LedgerSealedState): LedgerSealedState {
  BUILT_INITIAL_STATES.add(state);
  return state;
}

/** A v2 ledger's current state as version 1 of a v3 ledger (`reason: 'import_v2'`). */
export function importV2State(s: LedgerSnapshot): LedgerSealedState {
  return builtInitial({
    entries: s.entries.filter((e) => e.origin.source !== 'derived'),
    nonAnswers: [...s.nonAnswers],
  });
}

/**
 * A change of kind (v2 `carryOver`): the advocate's own entries (`asked`) and
 * non-answers for keys the new checklist also has, with the new pack's labels.
 */
export function carryOverState(
  earlier: LedgerSnapshot,
  checklist: readonly ChecklistItem[],
): LedgerSealedState {
  const byKey = new Map(checklist.filter(isLedgerItem).map((i) => [i.key, i]));
  return builtInitial({
    entries: earlier.entries
      .filter((e) => e.status === 'held' && e.origin.source === 'asked' && byKey.has(e.key))
      .map((e) => {
        const item = byKey.get(e.key) as ChecklistItem;
        return {
          ...e,
          label: item.label,
          requiredInDraft: item.required && item.notInDraft !== true,
        };
      }),
    nonAnswers: earlier.nonAnswers.filter((n) => byKey.has(n.key)),
  });
}

/** A non-answer's kind, by v2's own `isNoFactAnswer` (the "Not known" list is not copied here). */
function nonAnswerKind(text: string): NonAnswer['kind'] {
  const probe = { key: '__not_known_probe__', askWhenEmpty: true as const };
  return isNoFactAnswer(probe, text) ? 'not_known' : 'none';
}

function withNonAnswer(state: LedgerSealedState, n: NonAnswer): LedgerSealedState {
  return {
    entries: state.entries.filter((e) => e.key !== n.key),
    nonAnswers: [...state.nonAnswers.filter((x) => x.key !== n.key), n],
  };
}

/**
 * The Extractor's result for one turn, appended as one version (schema §4).
 * Every value is read by v2's code (`readExtraction`: verbatim span, the
 * normalizer, confidence floors, v2 non-answers, lists) from the candidate's
 * quote in `turnText`, both NFC; the model's `value` is used only as the
 * option of a choice. Then each key is merged with what the ledger holds:
 *  - a non-answer replaces the key with a `NonAnswer`;
 *  - a new reading equal to a held value changes nothing;
 *  - a description reading never replaces the advocate's own (`asked`) value
 *    or non-answer; a different description reading over a description
 *    reading is a conflict (invariant 5);
 *  - an answer replaces a reading and closes a conflict (`conflict_resolved`);
 *  - an unresolved reading never downgrades a held value;
 *  - two values in one turn (or `ExtractResult.conflicts`) are a conflict.
 * Nothing is written when nothing changes. Dropped counts are logged by reason.
 */
export async function appendCandidates(
  ledgerId: string,
  userId: string,
  expectedVersion: number,
  result: ExtractResult,
  checklist: ChecklistItem[],
  turnText: string,
  opts: { turn: number; kind: 'description' | 'answer'; now?: Date },
): Promise<{ s: LedgerSnapshot; dropped: DropCount }> {
  const doc = await loadV3(ledgerId, userId);
  if (!doc) throw new LedgerNotFoundV3Error();
  if (doc.currentVersion !== expectedVersion) throw new LedgerVersionRaceError();
  const before = unseal(doc.versions[doc.versions.length - 1]);
  const now = opts.now ?? new Date();
  const text = nfc(turnText);
  const dropped: DropCount = {};
  const drop = (r: DropReason): void => {
    dropped[r] = (dropped[r] ?? 0) + 1;
  };
  const answer = opts.kind === 'answer';
  // An answer may be to any ledger item; a description reading keeps v2's model-readable rule.
  const items = checklist.map((i) => (answer ? { ...i, modelReadable: true } : i));
  const byKey = new Map(items.filter(isLedgerItem).map((i) => [i.key, i]));

  const fresh: LedgerSealedState = { entries: [], nonAnswers: [] };
  type Row = { key: string; span: string; option?: string; confidence: number };
  const raw: Row[] = [];
  /** The candidate each raw row came from (its source kind and turn). */
  const rowSource = new Map<Row, LedgerCandidate['source']>();
  // Review round 1: a conflict's readings go through the same pipeline as any
  // candidate (on-list, model-readable, quote length, verbatim span, v2
  // non-answers), so a conflict never seals the model's quote or value.
  const conflictKeys = new Set<string>();
  const all: LedgerCandidate[] = [...result.candidates];
  for (const c of result.conflicts) {
    if (c.values.length > 0) conflictKeys.add(c.key);
    for (const v of c.values) all.push({ ...v, key: c.key });
  }
  for (const c of all) {
    if (DERIVED_ONLY_KEYS.has(lastSegment(c.key))) {
      drop('derived_key');
      continue;
    }
    const item = byKey.get(c.key);
    // A description reading keeps v2's model-readable rule (readExtraction's), here too.
    if (!item || (!answer && !item.modelReadable)) {
      drop('not_on_list');
      continue;
    }
    const quote = nfc(c.source.quote ?? '');
    const max = item.kind === 'narrative' ? Infinity : QUOTE_MAX;
    if (quote.trim() === '' || quote.length > max) {
      drop('no_span');
      continue;
    }
    const span = locateSpan(text, quote);
    if (span === null) {
      drop('span_not_found');
      continue;
    }
    // AJ-655-M1 by v2's rule: the option of a choice, else the user's words.
    const said = item.kind === 'choice' && typeof c.value === 'string' ? c.value : span;
    if (isNoFactAnswer(item, said)) {
      fresh.nonAnswers.push({ key: item.key, kind: nonAnswerKind(said), turn: opts.turn });
      drop('no_fact_answer');
      continue;
    }
    // Round 3 (Arjun): confidence clamped once, by v2 readExtraction's rule; everything after trusts it.
    const confidence = clampConfidence(c.confidence);
    const rows: Row[] = [];
    if (isMultiItem(item) && Array.isArray(c.value)) {
      for (const v of c.value) {
        const t = String(v);
        // A list item is its own words; a choice is its option, on the candidate's quote.
        rows.push(
          item.kind === 'choices'
            ? { key: item.key, span, option: t, confidence }
            : { key: item.key, span: nfc(t), confidence },
        );
      }
    } else {
      rows.push({
        key: item.key,
        span,
        ...(typeof c.value === 'string' && (item.kind === 'choice' || item.kind === 'choices')
          ? { option: c.value }
          : {}),
        confidence,
      });
    }
    for (const r of rows) {
      raw.push(r);
      rowSource.set(r, c.source);
    }
  }
  const read = readExtraction(items, text, { facts: raw }, referenceYear(now), now);
  for (const d of read.dropped) drop(d.reason);
  const origin = (quote: string, confidence: number) => ({
    source: answer ? ('asked' as const) : ('user' as const),
    turn: opts.turn,
    quote,
    confidence,
    ...(answer ? { askedAt: now.toISOString() } : {}),
  });
  for (const f of read.facts) {
    fresh.entries.push({ ...fromV2Fact(f), origin: origin(f.raw_span, f.confidence) });
  }
  // readExtraction's own date context (T-469), so a conflict reading is read the same way.
  const allowed = items.filter((i) => i.modelReadable && isLedgerItem(i));
  const dates = {
    asked: allowed.filter((i) => factTypeFor(i) === 'date').map((i) => i.key),
    pack: items.filter((i) => factTypeFor(i) === 'date').map((i) => i.key),
    now,
  };
  /**
   * The verified, distinct readings of one key: rows that passed the pipeline
   * above, re-read by the v2 normalizer from the located span (the option for
   * a choice). Only a reading the normalizer cannot read is dropped
   * (`unverified`); every other is kept whatever its confidence (Arjun, round
   * 3), so two real differing readings are a conflict. One value read twice
   * keeps its higher confidence.
   */
  const verified = (key: string): ConflictCandidate[] => {
    const item = byKey.get(key) as ChecklistItem;
    const type = factTypeFor(item);
    const out = new Map<string, ConflictCandidate>();
    for (const r of raw.filter((x) => x.key === key)) {
      const n = normalizeForItem(
        item,
        type === 'enum' ? (r.option ?? r.span) : r.span,
        referenceYear(now),
        dates,
      );
      if (!n.ok) {
        drop('unverified');
        continue;
      }
      const k = JSON.stringify(n.value);
      const src = rowSource.get(r) as LedgerCandidate['source'];
      const had = out.get(k);
      if (!had || r.confidence > had.confidence) {
        out.set(k, {
          value: n.value,
          display: n.display,
          source: { kind: src.kind, turn: src.turn, quote: r.span },
          confidence: r.confidence,
        });
      }
    }
    return [...out.values()];
  };
  const conflictOf = (key: string, cs: ConflictCandidate[]): LedgerEntry => {
    const item = byKey.get(key) as ChecklistItem;
    return {
      ...fromV2Unresolved({
        id: crypto.randomUUID(),
        key,
        label: item.label,
        type: factTypeFor(item),
        raw_span: cs[0].source.quote,
        source: answer ? 'asked' : 'user',
        reason: 'conflicting_values',
        detail: LEDGER_DETAILS.conflicting_values,
      }),
      status: 'conflict',
      origin: origin(cs[0].source.quote, cs[0].confidence),
      candidates: cs,
    };
  };
  // Keys with two values (readExtraction) or a reported conflict: two or more
  // distinct verified readings are a conflict; one is held at or above its
  // type's floor, else unresolved `low_confidence` (never held); none leaves
  // what v2 `read` produced.
  const twoValues = new Set(
    read.unresolved.filter((u) => u.reason === 'conflicting_values').map((u) => u.key),
  );
  for (const u of read.unresolved) {
    if (u.reason === 'conflicting_values') continue;
    fresh.entries.push({ ...fromV2Unresolved(u), origin: origin(u.raw_span, 0) });
  }
  for (const key of new Set([...twoValues, ...conflictKeys])) {
    const item = byKey.get(key);
    if (!item || isMultiItem(item) || !raw.some((r) => r.key === key)) continue;
    const cs = verified(key);
    const others = fresh.entries.filter((e) => e.key !== key);
    if (cs.length >= 2) {
      fresh.entries = [...others, conflictOf(key, cs)];
    } else if (cs.length === 1 && cs[0].confidence < CONFIDENCE_FLOORS[factTypeFor(item)]) {
      const v = cs[0];
      fresh.entries = [
        ...others,
        {
          ...fromV2Unresolved({
            id: crypto.randomUUID(),
            key,
            label: item.label,
            type: factTypeFor(item),
            raw_span: v.source.quote,
            source: answer ? 'asked' : 'user',
            reason: 'low_confidence',
            detail: LEDGER_DETAILS.low_confidence,
          }),
          origin: origin(v.source.quote, v.confidence),
        },
      ];
    } else if (cs.length === 1) {
      const v = cs[0];
      fresh.entries = [
        ...others,
        {
          id: crypto.randomUUID(),
          key,
          label: item.label,
          type: factTypeFor(item),
          status: 'held',
          value: v.value,
          display: v.display ?? '',
          origin: origin(v.source.quote, v.confidence),
          requiredInDraft: item.required && item.notInDraft !== true,
        },
      ];
    } else if (twoValues.has(key)) {
      // None verified: v2's own unresolved item, unchanged.
      const u = read.unresolved.find((x) => x.key === key && x.reason === 'conflicting_values');
      if (u) fresh.entries = [...others, { ...fromV2Unresolved(u), origin: origin(u.raw_span, 0) }];
    }
  }
  for (const key of result.nonAnswers) {
    const item = byKey.get(key);
    if (!item || (!answer && !item.modelReadable)) {
      drop('not_on_list');
      continue;
    }
    if (!fresh.nonAnswers.some((n) => n.key === key)) {
      fresh.nonAnswers.push({ key, kind: 'not_known', turn: opts.turn });
    }
    fresh.entries = fresh.entries.filter((e) => e.key !== key);
  }

  const { state: after, resolved } = merge(before, fresh, answer, items);
  logger.info(
    { ledgerId, version: doc.currentVersion, kind: opts.kind, dropped },
    'T-682: candidates read',
  );
  if (changedKeys(before, after).length === 0) {
    return { s: snapshotOf(doc, before), dropped };
  }
  const updated = await append(
    doc,
    expectedVersion,
    before,
    after,
    answer ? (resolved ? 'conflict_resolved' : 'answer') : 'extract',
  );
  return { s: snapshotOf(updated, after), dropped };
}

/** Invariant 5's merge of one turn's fresh state into what the ledger holds. */
function merge(
  before: LedgerSealedState,
  fresh: LedgerSealedState,
  answer: boolean,
  checklist: readonly ChecklistItem[],
): { state: LedgerSealedState; resolved: boolean } {
  let state: LedgerSealedState = {
    entries: [...before.entries],
    nonAnswers: [...before.nonAnswers],
  };
  let resolved = false;
  const multi = new Set(checklist.filter(isMultiItem).map((i) => i.key));
  const keys = new Set([...fresh.entries.map((e) => e.key), ...fresh.nonAnswers.map((n) => n.key)]);
  for (const key of keys) {
    const was = entriesOfKey(state.entries, key);
    const wasAsked = was.some((e) => e.status === 'held' && e.origin.source === 'asked');
    const wasNonAnswer = state.nonAnswers.some((n) => n.key === key);
    const wasConflict = was.some((e) => e.status === 'conflict');
    const now = entriesOfKey(fresh.entries, key);
    const nonAnswer = fresh.nonAnswers.find((n) => n.key === key);
    const replace = (entries: LedgerEntry[]): void => {
      state = {
        entries: [...state.entries.filter((e) => e.key !== key), ...entries],
        nonAnswers: answer ? state.nonAnswers.filter((n) => n.key !== key) : state.nonAnswers,
      };
      // Resolved only when a held value actually replaces the conflict.
      if (wasConflict && answer && entries.some((e) => e.status === 'held')) resolved = true;
    };
    // The advocate's own value or non-answer is never replaced by a description reading.
    if (!answer && (wasAsked || wasNonAnswer)) continue;
    if (nonAnswer) {
      state = withNonAnswer(state, nonAnswer);
      if (wasConflict && answer) resolved = true;
      continue;
    }
    const wasHeld = was.filter((e) => e.status === 'held');
    const nowHeld = now.filter((e) => e.status === 'held');
    if (nowHeld.length === 0) {
      // Unresolved or conflict in this turn. A held value is not downgraded by an unresolved reading.
      if (now.every((e) => e.status === 'unresolved') && wasHeld.length > 0) continue;
      if (!answer && wasConflict) continue;
      // An unreadable or below-floor answer leaves a conflict open (as applyUserEdit does).
      if (answer && wasConflict && now.every((e) => e.status === 'unresolved')) continue;
      replace(now);
      continue;
    }
    const sameValues = (a: LedgerEntry[], b: LedgerEntry[]): boolean =>
      JSON.stringify(a.map((e) => e.value).sort()) === JSON.stringify(b.map((e) => e.value).sort());
    if (wasHeld.length > 0 && sameValues(wasHeld, nowHeld) && !answer) continue;
    if (answer || multi.has(key) || wasHeld.length === 0) {
      if (!answer && wasConflict) continue;
      replace(nowHeld);
      continue;
    }
    // A different description reading over a description reading: a question (invariant 5).
    const first = wasHeld[0];
    const second = nowHeld[0];
    replace([
      {
        ...first,
        id: crypto.randomUUID(),
        status: 'conflict',
        value: undefined,
        display: undefined,
        requiredInDraft: undefined,
        reason: 'conflicting_values' satisfies UnresolvedReason,
        detail: LEDGER_DETAILS.conflicting_values,
        candidates: [first, second].map((e) => ({
          value: e.value as ConflictCandidate['value'],
          display: e.display,
          source: {
            kind: e.origin.source === 'asked' ? 'answer' : 'description',
            turn: e.origin.turn ?? 0,
            quote: e.origin.quote,
          },
          confidence: e.origin.confidence,
        })),
      },
    ]);
  }
  return {
    state: {
      entries: withIndexes(
        state.entries.map((e) => JSON.parse(JSON.stringify(e)) as LedgerEntry),
        checklist,
      ),
      nonAnswers: state.nonAnswers,
    },
    resolved,
  };
}

/**
 * The advocate's answer or edit on the brief, appended as one version, by
 * v2's own `applyEdit` (normalizer, non-answers, lists, unreadable values).
 * An answer to a conflict closes it (`conflict_resolved`); an unreadable one
 * leaves it open. A non-answer is recorded as a `NonAnswer` (AJ-655-M1).
 * T-685: an empty text clears the key and closes its conflict, deliberately
 * (as a v2 empty edit clears the fact and any doubt about it).
 */
export async function applyUserEdit(
  ledgerId: string,
  userId: string,
  expectedVersion: number,
  edit: LedgerEdit,
  checklist: ChecklistItem[],
  now: Date = new Date(),
): Promise<{ s: LedgerSnapshot; result: LedgerEditResult }> {
  const doc = await loadV3(ledgerId, userId);
  if (!doc) throw new LedgerNotFoundV3Error();
  if (doc.currentVersion !== expectedVersion) throw new LedgerVersionRaceError();
  const before = unseal(doc.versions[doc.versions.length - 1]);
  const item = checklist.find((i) => i.key === edit.key);
  const v2 = toV2State(before.entries);
  const { next, reason, result } = applyEdit(v2, item, edit, referenceYear(now));
  const wasConflict = before.entries.some((e) => e.key === edit.key && e.status === 'conflict');
  const text = typeof edit.text === 'string' ? edit.text.trim() : '';
  const nonAnswer =
    item && typeof edit.text === 'string' && text !== '' && isNoFactAnswer(item, text)
      ? { key: edit.key, kind: nonAnswerKind(text) }
      : null;
  if (!next && !nonAnswer) return { s: snapshotOf(doc, before), result };
  if (result.status === 'unreadable' && wasConflict) {
    return { s: snapshotOf(doc, before), result };
  }
  let after: LedgerSealedState;
  if (nonAnswer) {
    after = withNonAnswer(before, nonAnswer);
  } else {
    const nextState = next as { facts: LedgerFact[]; unresolved: LedgerUnresolvedFact[] };
    const keepIds = new Map(before.entries.map((e) => [e.id, e]));
    const asEntry = (e: LedgerEntry): LedgerEntry => {
      const old = keepIds.get(e.id);
      if (old && old.key !== edit.key) return old;
      return {
        ...e,
        origin: {
          ...e.origin,
          ...(e.origin.source === 'asked' ? { askedAt: now.toISOString(), confidence: 1 } : {}),
        },
      };
    };
    after = {
      entries: [
        ...nextState.facts.map((f) => asEntry(fromV2Fact(f))),
        ...nextState.unresolved.map((u) => asEntry(fromV2Unresolved(u))),
        // Conflicts of other keys stay; this key's conflict closes with a saved answer.
        ...before.entries.filter(
          (e) => e.status === 'conflict' && !(e.key === edit.key && result.status === 'saved'),
        ),
      ],
      nonAnswers:
        result.status === 'saved'
          ? before.nonAnswers.filter((n) => n.key !== edit.key)
          : before.nonAnswers,
    };
    after = { ...after, entries: withIndexes(after.entries, checklist) };
  }
  if (changedKeys(before, after).length === 0) return { s: snapshotOf(doc, before), result };
  const updated = await append(
    doc,
    expectedVersion,
    before,
    after,
    wasConflict && result.status === 'saved' ? 'conflict_resolved' : reason,
  );
  return { s: snapshotOf(updated, after), result };
}

/** A non-answer, recorded (AJ-655-M1): the key's entries go; a `NonAnswer` is kept. */
export async function recordNonAnswer(
  ledgerId: string,
  userId: string,
  expectedVersion: number,
  n: NonAnswer,
  /** Narrows the ledger's own pack checklist (never widens it): the key must be on both. */
  checklist?: readonly ChecklistItem[],
): Promise<LedgerSnapshot> {
  const doc = await loadV3(ledgerId, userId);
  if (!doc) throw new LedgerNotFoundV3Error();
  if (doc.currentVersion !== expectedVersion) throw new LedgerVersionRaceError();
  const before = unseal(doc.versions[doc.versions.length - 1]);
  // A non-answer is only for a key of this pack's checklist; else dropped, nothing written.
  // Narrow only: the key must be on the ledger's pack checklist and, when a
  // checklist is passed, on that one too. A passed list never widens the pack.
  const onList = (list: readonly ChecklistItem[]): boolean =>
    list.some((i) => isLedgerItem(i) && i.key === n.key);
  if (!onList(checklistOf(doc.packId)) || (checklist !== undefined && !onList(checklist))) {
    const dropped: DropCount = { not_on_list: 1 };
    logger.info({ ledgerId, version: doc.currentVersion, dropped }, 'T-682: non-answer dropped');
    return snapshotOf(doc, before);
  }
  const after = withNonAnswer(before, n);
  if (changedKeys(before, after).length === 0) return snapshotOf(doc, before);
  const updated = await append(doc, expectedVersion, before, after, 'answer');
  return snapshotOf(updated, after);
}

/** The confidence floor of a type (v2's table, imported): below it a reading is asked. */
export function confidenceFloor(type: LedgerFact['type']): number {
  return CONFIDENCE_FLOORS[type];
}

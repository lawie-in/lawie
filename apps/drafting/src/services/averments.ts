/**
 * The averment allowlist and the banned-assertion list of a rule pack (T-147c,
 * ADR-022 section 2B).
 *
 * LEGAL CONTENT. The lists are Ajay's, in
 * `src/config/document-rules/_averments/` (see the README there). This file
 * only reads them and decides, from the ledger's facts alone, which banned
 * assertions stay banned and which allowed averments may be made. It never
 * reads the advocate's prose, a prior draft or a model's output.
 *
 * - A pack with its own file uses it. A file may `inherit` one other pack's
 *   file (one level only), with a `key_map` for keys the child names
 *   differently. Every pack also takes `_default.json`; an entry of the pack
 *   with the same id replaces the default's.
 * - A banned entry that can be unlocked must have an allowed entry with the
 *   same id (`checkUnlockPairs`); while a banned entry stays banned, its
 *   allowed twin is not offered.
 * - A pack with no file of its own is default-deny: `_default.json` only.
 *   The 87 unseeded packs need no code change.
 * - A condition is read against the ledger's facts only. A key that is not a
 *   fact (missing, or still unresolved) never unlocks anything. Nothing is
 *   unlocked by an averment that was itself unlocked: a condition can only
 *   name a ledger key.
 *
 * No I/O beyond reading the list files. No logging of any fact value.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import type { LedgerFact } from '@lawie/shared';

import { normalise } from './intake-text';
import { RULE_PACKS_DIR } from './rule-pack.service';

export const AVERMENTS_DIR = join(RULE_PACKS_DIR, '_averments');
export const DEFAULT_AVERMENTS_ID = '_default';

// ── Shape of a file ─────────────────────────────────────────────────────────

/** One fact the condition reads. Exactly one of `equals`, `not_in` or `present`. */
export interface KeyCondition {
  key: string;
  /** The ledger label of the fact, for the reader. Matching is by `key` only. */
  label?: string;
  /** The fact's value or display must be one of these (case, spacing and punctuation folded). */
  equals?: Array<string | number | boolean> | string | number | boolean;
  /** The fact must be present and its value and display must be none of these. */
  not_in?: Array<string | number | boolean>;
  /** The fact must be present with a non-empty display. */
  present?: true;
}

export interface AllOfCondition {
  all_of: AvermentCondition[];
}

export type AvermentCondition = KeyCondition | AllOfCondition;

export type AvermentKind = 'averment' | 'submission';

export interface BannedEntry {
  id: string;
  kind: AvermentKind;
  /** What the assertion is, in a few words. */
  what?: string;
  phrases: string[];
  /** Null: nothing in the ledger unlocks it. */
  unlocked_by: AvermentCondition | null;
}

export interface AllowedEntry {
  id: string;
  kind: AvermentKind;
  /** The text, with `{{<key>}}` where the fact's display goes. */
  averment: string;
  requires: AvermentCondition;
}

export interface AvermentFile {
  pack: string;
  inherits?: string | null;
  key_map?: Record<string, string>;
  signed_by: string | null;
  signed_on: string | null;
  banned: BannedEntry[];
  allowed: AllowedEntry[];
}

export interface AvermentLists {
  /** The file the pack's own list came from, or `_default` for default-deny. */
  source: string;
  /** The file the pack's list inherits, when it does. */
  inherits: string | null;
  signedBy: string | null;
  signedOn: string | null;
  banned: BannedEntry[];
  allowed: AllowedEntry[];
}

export class AvermentFileError extends Error {
  constructor(id: string, problem: string) {
    super(`averment list ${id} ${problem}`);
    this.name = 'AvermentFileError';
  }
}

// ── Reading the files ───────────────────────────────────────────────────────

const FILE_ID = /^_?[a-z0-9_]+$/;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function checkCondition(id: string, c: unknown): void {
  if (!isObject(c)) throw new AvermentFileError(id, 'has a condition that is not an object');
  if ('all_of' in c) {
    if (!Array.isArray(c.all_of) || c.all_of.length === 0) {
      throw new AvermentFileError(id, 'has an empty all_of');
    }
    for (const inner of c.all_of) checkCondition(id, inner);
    return;
  }
  if (typeof c.key !== 'string' || c.key === '') {
    throw new AvermentFileError(id, 'has a condition with no key');
  }
  const tests = ['equals', 'not_in', 'present'].filter((t) => t in c);
  if (tests.length !== 1) {
    throw new AvermentFileError(id, `has a condition on ${c.key} without exactly one test`);
  }
  if ('not_in' in c && !Array.isArray(c.not_in)) {
    throw new AvermentFileError(id, `has a not_in on ${c.key} that is not a list`);
  }
  if ('present' in c && c.present !== true) {
    throw new AvermentFileError(id, `has a present on ${c.key} that is not true`);
  }
}

/** Reads and checks one file. Null when there is no such file. */
export function readAvermentFile(id: string, dir: string = AVERMENTS_DIR): AvermentFile | null {
  if (!FILE_ID.test(id)) return null;
  let text: string;
  try {
    text = readFileSync(join(dir, `${id}.json`), 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new AvermentFileError(id, `could not be read (${(err as Error).message})`);
  }
  let source: unknown;
  try {
    source = JSON.parse(text);
  } catch (err) {
    throw new AvermentFileError(id, `is not valid JSON (${(err as Error).message})`);
  }
  if (!isObject(source)) throw new AvermentFileError(id, 'is not an object');
  const banned = Array.isArray(source.banned) ? source.banned : [];
  const allowed = Array.isArray(source.allowed) ? source.allowed : [];
  for (const b of banned) {
    if (!isObject(b) || typeof b.id !== 'string' || !Array.isArray(b.phrases)) {
      throw new AvermentFileError(id, 'has a banned entry with no id or phrases');
    }
    if (b.unlocked_by !== null) checkCondition(id, b.unlocked_by);
  }
  for (const a of allowed) {
    if (!isObject(a) || typeof a.id !== 'string' || typeof a.averment !== 'string') {
      throw new AvermentFileError(id, 'has an allowed entry with no id or averment');
    }
    checkCondition(id, a.requires);
  }
  return {
    pack: typeof source.pack === 'string' ? source.pack : id,
    inherits: typeof source.inherits === 'string' ? source.inherits : null,
    key_map: isObject(source.key_map) ? (source.key_map as Record<string, string>) : {},
    signed_by: typeof source.signed_by === 'string' ? source.signed_by : null,
    signed_on: typeof source.signed_on === 'string' ? source.signed_on : null,
    banned: banned.map((b) => ({ kind: 'averment', ...(b as object) }) as BannedEntry),
    allowed: allowed.map((a) => ({ kind: 'averment', ...(a as object) }) as AllowedEntry),
  };
}

function mapCondition(c: AvermentCondition, map: Record<string, string>): AvermentCondition {
  if ('all_of' in c) return { all_of: c.all_of.map((x) => mapCondition(x, map)) };
  return { ...c, key: map[c.key] ?? c.key };
}

function mapTemplate(text: string, map: Record<string, string>): string {
  return text.replace(/\{\{([a-z0-9_.]+)\}\}/g, (_m, key: string) => `{{${map[key] ?? key}}}`);
}

/** Later lists replace an earlier entry with the same id, in place; new ids go at the end. */
function mergeById<T extends { id: string }>(...lists: T[][]): T[] {
  const out: T[] = [];
  const at = new Map<string, number>();
  for (const list of lists) {
    for (const entry of list) {
      const i = at.get(entry.id);
      if (i === undefined) {
        at.set(entry.id, out.length);
        out.push(entry);
      } else {
        out[i] = entry;
      }
    }
  }
  return out;
}

/**
 * Ajay's rule (T-147c review): a banned entry that something can unlock must
 * have an allowed entry with the same id, so an unlocked assertion is always
 * made in signed words. Throws, naming the pack and the id.
 */
export function checkUnlockPairs(packId: string, lists: Pick<AvermentLists, 'banned' | 'allowed'>): void {
  const allowedById = new Map(lists.allowed.map((a) => [a.id, a]));
  for (const b of lists.banned) {
    if (b.unlocked_by === null) continue;
    const twin = allowedById.get(b.id);
    if (!twin) {
      throw new AvermentFileError(
        packId,
        `has banned entry "${b.id}" that can be unlocked but no allowed entry with the same id`,
      );
    }
    // The ban lifts exactly when the averment may be made (Ajay, T-147c review 2).
    if (canonical(b.unlocked_by) !== canonical(twin.requires)) {
      throw new AvermentFileError(
        packId,
        `has banned entry "${b.id}" whose unlocked_by is not the same as its allowed entry's requires`,
      );
    }
  }
  // Every fact an allowed text prints must be one its condition requires (Ajay, T-147c review 2).
  for (const a of lists.allowed) {
    const required = new Set(conditionKeys(a.requires));
    for (const m of a.averment.matchAll(/\{\{([a-z0-9_.]+)\}\}/g)) {
      if (!required.has(m[1])) {
        throw new AvermentFileError(
          packId,
          `has allowed entry "${a.id}" that prints {{${m[1]}}}, which its requires does not require`,
        );
      }
    }
  }
}

/** JSON with object keys in order, for comparing two conditions. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (isObject(v)) {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

/**
 * The lists for one pack. Its own file if it has one (with what it inherits),
 * laid over `_default.json`; else `_default.json` alone.
 */
export function loadAvermentLists(packId: string, dir: string = AVERMENTS_DIR): AvermentLists {
  const generic = readAvermentFile(DEFAULT_AVERMENTS_ID, dir);
  const base = { banned: generic?.banned ?? [], allowed: generic?.allowed ?? [] };
  const own = packId.startsWith('_') ? null : readAvermentFile(packId, dir);
  if (!own) {
    checkUnlockPairs(packId, base);
    return {
      source: DEFAULT_AVERMENTS_ID,
      inherits: null,
      signedBy: generic?.signed_by ?? null,
      signedOn: generic?.signed_on ?? null,
      ...base,
    };
  }
  let parentBanned: BannedEntry[] = [];
  let parentAllowed: AllowedEntry[] = [];
  if (own.inherits) {
    const parent = readAvermentFile(own.inherits, dir);
    if (!parent) throw new AvermentFileError(packId, `inherits ${own.inherits}, which has no file`);
    if (parent.inherits) {
      throw new AvermentFileError(packId, `inherits ${own.inherits}, which inherits again`);
    }
    const map = own.key_map ?? {};
    parentBanned = parent.banned.map((b) => ({
      ...b,
      unlocked_by: b.unlocked_by === null ? null : mapCondition(b.unlocked_by, map),
    }));
    parentAllowed = parent.allowed.map((a) => ({
      ...a,
      averment: mapTemplate(a.averment, map),
      requires: mapCondition(a.requires, map),
    }));
  }
  const lists: AvermentLists = {
    source: packId,
    inherits: own.inherits ?? null,
    signedBy: own.signed_by,
    signedOn: own.signed_on,
    banned: mergeById(base.banned, parentBanned, own.banned),
    allowed: mergeById(base.allowed, parentAllowed, own.allowed),
  };
  checkUnlockPairs(packId, lists);
  return lists;
}

// ── Reading a condition against the ledger ──────────────────────────────────

function folded(v: unknown): string {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return normalise(v).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return '';
}

/** The ledger's facts by key. Only `facts`: an unresolved item is not a fact. */
export function factsByKey(facts: readonly LedgerFact[]): Map<string, LedgerFact> {
  const out = new Map<string, LedgerFact>();
  for (const f of facts) {
    if (typeof f.display === 'string' && f.display.trim() !== '') out.set(f.key, f);
  }
  return out;
}

export function conditionHolds(
  c: AvermentCondition | null,
  facts: ReadonlyMap<string, LedgerFact>,
): boolean {
  if (c === null) return false;
  if ('all_of' in c) return c.all_of.every((x) => conditionHolds(x, facts));
  const fact = facts.get(c.key);
  // A missing key never unlocks anything (Ajay, 10 Oct 2026).
  if (!fact) return false;
  const seen = new Set([folded(fact.value), folded(fact.display)].filter((s) => s !== ''));
  if (c.present === true) return seen.size > 0;
  if (c.equals !== undefined) {
    const wanted = (Array.isArray(c.equals) ? c.equals : [c.equals]).map(folded);
    return wanted.some((w) => seen.has(w));
  }
  if (c.not_in !== undefined) {
    if (seen.size === 0) return false;
    return !c.not_in.map(folded).some((w) => seen.has(w));
  }
  return false;
}

/** Every key a condition reads. */
export function conditionKeys(c: AvermentCondition | null): string[] {
  if (c === null) return [];
  if ('all_of' in c) return c.all_of.flatMap(conditionKeys);
  return [c.key];
}

// ── What the Drafter is told ────────────────────────────────────────────────

export interface ResolvedAverment {
  id: string;
  kind: AvermentKind;
  /** The averment with every `{{key}}` replaced by that fact's display. */
  text: string;
}

export interface ResolvedBan {
  id: string;
  kind: AvermentKind;
  phrases: string[];
}

export interface ResolvedAverments {
  allowed: ResolvedAverment[];
  banned: ResolvedBan[];
}

/**
 * Which averments the Drafter may make and which assertions it may not, for
 * this ledger. An allowed averment whose text names a fact the ledger does not
 * hold is not offered. A banned entry stays banned unless its condition holds.
 */
export function resolveAverments(
  lists: Pick<AvermentLists, 'banned' | 'allowed'>,
  facts: readonly LedgerFact[],
): ResolvedAverments {
  const byKey = factsByKey(facts);
  const stillBanned = new Set(
    lists.banned.filter((b) => !conditionHolds(b.unlocked_by, byKey)).map((b) => b.id),
  );
  const allowed: ResolvedAverment[] = [];
  for (const a of lists.allowed) {
    // An allowed entry is never offered while its banned twin stays banned.
    if (stillBanned.has(a.id)) continue;
    if (!conditionHolds(a.requires, byKey)) continue;
    let complete = true;
    const text = a.averment.replace(/\{\{([a-z0-9_.]+)\}\}/g, (_m, key: string) => {
      const fact = byKey.get(key);
      if (!fact) {
        complete = false;
        return '';
      }
      return fact.display.trim();
    });
    if (complete) allowed.push({ id: a.id, kind: a.kind, text });
  }
  const banned = lists.banned
    .filter((b) => stillBanned.has(b.id))
    .map((b) => ({ id: b.id, kind: b.kind, phrases: [...b.phrases] }));
  return { allowed, banned };
}

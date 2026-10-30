/**
 * T-682 — the v2 read adapter (schema §5; Arjun Q8, condition 6).
 *
 * A v2 `factledgers` row is read, never migrated: its current version is opened
 * with v2's own `openVersion` (the T-115a helper and key) and mapped to v3
 * entries. The reverse mapping (`toV2Fact`, `toV2Unresolved`) gives back the v2
 * objects byte for byte (same fields, same order), so `factsForGeneration` on
 * an adapted v2 ledger equals today's `currentState(doc).facts`.
 *
 * Pure: no write, no log. v2 `computed` facts are never stored, but one would
 * read as `derived`.
 */
import type { FactSource, LedgerFact, LedgerUnresolvedFact } from '@lawie/shared';

import type { IFactLedger } from '../../models/FactLedger.model';
import { currentState, ledgerView } from '../fact-ledger.service';

import type { EntrySource, LedgerEntry, LedgerSnapshot } from './ledger.types';

function toEntrySource(s: FactSource): EntrySource {
  return s === 'computed' ? 'derived' : s;
}

function toFactSource(s: EntrySource): FactSource {
  // 'template' has no v2 source; it is code-given, as `computed` is.
  return s === 'derived' || s === 'template' ? 'computed' : s;
}

/** A v2 fact as a held entry. `index` numbers the entries of one key in order. */
export function fromV2Fact(f: LedgerFact, index?: number): LedgerEntry {
  return {
    id: f.id,
    key: f.key,
    label: f.label,
    type: f.type,
    status: 'held',
    value: f.value,
    display: f.display,
    ...(index !== undefined ? { index } : {}),
    origin: {
      source: toEntrySource(f.source),
      quote: f.raw_span,
      confidence: f.confidence,
    },
    requiredInDraft: f.required_in_draft,
  };
}

/** A v2 unresolved item as an unresolved entry. */
export function fromV2Unresolved(u: LedgerUnresolvedFact): LedgerEntry {
  return {
    id: u.id,
    key: u.key,
    label: u.label,
    type: u.type,
    status: 'unresolved',
    origin: { source: toEntrySource(u.source), quote: u.raw_span, confidence: 0 },
    reason: u.reason,
    detail: u.detail,
  };
}

/** A held entry as the v2 fact generation, the renderer and the verifier read. Same field order as v2. */
export function toV2Fact(e: LedgerEntry): LedgerFact {
  return {
    id: e.id,
    key: e.key,
    label: e.label,
    type: e.type,
    value: e.value,
    display: e.display ?? '',
    raw_span: e.origin.quote,
    source: toFactSource(e.origin.source),
    confidence: e.origin.confidence,
    required_in_draft: e.requiredInDraft === true,
  } as LedgerFact;
}

/** An unresolved entry as the v2 unresolved item. Same field order as v2. */
export function toV2Unresolved(e: LedgerEntry): LedgerUnresolvedFact {
  return {
    id: e.id,
    key: e.key,
    label: e.label,
    type: e.type,
    raw_span: e.origin.quote,
    source: toFactSource(e.origin.source),
    reason: (e.reason ?? 'unrecognised') as LedgerUnresolvedFact['reason'],
    detail: e.detail ?? '',
  };
}

/** Held entries numbered per key only where a key has more than one (a list or several choices). */
function heldEntries(facts: readonly LedgerFact[]): LedgerEntry[] {
  const perKey = new Map<string, number>();
  for (const f of facts) perKey.set(f.key, (perKey.get(f.key) ?? 0) + 1);
  const seen = new Map<string, number>();
  return facts.map((f) => {
    if ((perKey.get(f.key) ?? 0) < 2) return fromV2Fact(f);
    const i = seen.get(f.key) ?? 0;
    seen.set(f.key, i + 1);
    return fromV2Fact(f, i);
  });
}

/**
 * A v2 ledger as a v3 snapshot (store 'v2', no derived entries: `openLedger`
 * adds those). Entries keep v2's order: facts, then unresolved. v2 has no
 * conflict status (two values went to unresolved) and stores no non-answers.
 */
export function fromV2(
  doc: Pick<IFactLedger, 'id' | 'runType' | 'documentKind' | 'versions' | 'currentVersion'> & {
    intakeId?: string;
  },
): LedgerSnapshot {
  const state = currentState(doc);
  // v2's own `previous_display` rule (ledgerView), so the brief reads the same.
  const previousDisplays: Record<string, string> = {};
  for (const f of ledgerView(doc, []).facts) {
    if (f.previous_display !== undefined) previousDisplays[f.key] = f.previous_display;
  }
  return {
    ledgerId: String(doc.id),
    runId: doc.intakeId ?? '',
    packId: doc.documentKind,
    runType: doc.runType,
    store: 'v2',
    version: doc.currentVersion,
    entries: [...heldEntries(state.facts), ...state.unresolved.map(fromV2Unresolved)],
    nonAnswers: [],
    ...(Object.keys(previousDisplays).length > 0 ? { previousDisplays } : {}),
  };
}

/**
 * T-682 test helpers (no tests here). Fictional parties and facts only.
 */
import mongoose from 'mongoose';

import { FactLedgerV3Model } from '../../models/FactLedgerV3.model';
import { buildChecklist, type ChecklistItem } from '../../services/intake-brief';
import { loadRulePack } from '../../services/rule-pack.service';
import * as L from '../../services/v3/ledger.service';
import type { ExtractResult, LedgerCandidate } from '../../services/v3/ledger.types';

export const USER_A = '507f1f77bcf86cd799439682';
export const USER_B = '507f1f77bcf86cd799439683';
export const PACK = 'bail_regular';
export const CHECKLIST: ChecklistItem[] = buildChecklist(loadRulePack(PACK)!);

let runCounter = 0;
export const newRun = (): string => `t682-run-${Date.now()}-${(runCounter += 1)}`;

export const cand = (
  key: string,
  value: LedgerCandidate['value'],
  quote: string,
  over: Partial<LedgerCandidate> & { kind?: 'description' | 'answer'; turn?: number } = {},
): LedgerCandidate => ({
  key,
  value,
  type: 'text',
  source: { kind: over.kind ?? 'description', turn: over.turn ?? 0, quote },
  confidence: over.confidence ?? 0.99,
});

export const extractOf = (
  candidates: LedgerCandidate[],
  conflicts: ExtractResult['conflicts'] = [],
  nonAnswers: string[] = [],
): ExtractResult => ({ candidates, conflicts, nonAnswers });

/** A fresh empty ledger for a fresh run. */
export async function freshLedger(userId = USER_A, runId = newRun(), packId = PACK) {
  return L.createLedger({ runId, userId, packId, intakeId: `intake-${runId}` });
}

/** Read the description (turn 0). */
export async function readDescription(
  s: { ledgerId: string; version: number },
  description: string,
  candidates: LedgerCandidate[],
  userId = USER_A,
  extra: Partial<ExtractResult> = {},
) {
  return L.appendCandidates(
    s.ledgerId,
    userId,
    s.version,
    { candidates, conflicts: extra.conflicts ?? [], nonAnswers: extra.nonAnswers ?? [] },
    CHECKLIST,
    description,
    { turn: 0, kind: 'description' },
  );
}

/** Read an answer (turn n). */
export async function readAnswer(
  s: { ledgerId: string; version: number },
  text: string,
  candidates: LedgerCandidate[],
  turn = 1,
  userId = USER_A,
) {
  return L.appendCandidates(
    s.ledgerId,
    userId,
    s.version,
    { candidates, conflicts: [], nonAnswers: [] },
    CHECKLIST,
    text,
    { turn, kind: 'answer' },
  );
}

/** The raw stored document (lean), for storage-level assertions. */
export async function storedDoc(ledgerId: string) {
  return FactLedgerV3Model.findById(ledgerId).lean();
}

export const objectId = () => new mongoose.Types.ObjectId();

export const DESC_CALM = 'Test Applicant A was arrested on 10.10.2026 and is in judicial custody.';
export const ARREST = (over: Partial<LedgerCandidate> = {}) =>
  cand('arrest_date', '2026-10-10', '10.10.2026', over);
export const CUSTODY = () =>
  cand('currently_in_custody', 'Yes — Judicial custody', 'in judicial custody');

/**
 * T-373 round 3 (commit 91a179b), the parts that write to the database:
 *  - applyEdits on bail_regular still writes facts_narrative (the Magistrate copy was removed)
 *  - FactDiff `path` (default 'legacy', only 'legacy' | 'd1') and writeFactCheckLog writing it on every row
 * The documents route does not log result.factDiff yet (deferred, not tested here).
 */
import './setupDb';
import mongoose from 'mongoose';

import { FACT_DIFF_PATHS, FactDiff } from '../models/FactDiff.model';
import { writeFactCheckLog } from '../services/fact-diff-log';
import { applyEdits, createLedger, currentState } from '../services/fact-ledger.service';
import type { FactCheckOutcome, FactDiffDraft } from '../services/fact-verifier';
import { buildChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { regularBase } from './fixtures/t373';

const USER_ID = '507f1f77bcf86cd7994393a5';

// ── applyEdits and the facts_narrative copy ─────────────────────────────────

describe('round 3: applyEdits on bail_regular', () => {
  const FIRST = 'she was at home all day, the complaint is a property fight';
  const FACTS_NARRATIVE_KEY = 'facts_narrative';

  it('bail_regular is unchanged: an edit of facts_narrative writes no copy and no fixed.facts', async () => {
    const checklist = buildChecklist(loadRulePack('bail_regular')!);
    const doc = await createLedger({
      userId: USER_ID,
      documentKind: 'bail_regular',
      intakeId: 'i1',
      state: { facts: regularBase(), unresolved: [] },
    });
    const { doc: after } = await applyEdits(
      doc,
      checklist,
      [{ key: 'facts_narrative', text: FIRST }],
      10,
    );
    const s = currentState(after);
    expect(s.facts.filter((f) => f.key === FACTS_NARRATIVE_KEY)).toHaveLength(1);
    expect(s.facts.find((f) => f.key === FACTS_NARRATIVE_KEY)?.raw_span).toBe(FIRST);
    expect(s.facts.some((f) => f.key === 'fixed.facts')).toBe(false);
  });
});

// ── FactDiff path ───────────────────────────────────────────────────────────

const record = (over: Partial<FactDiffDraft> = {}): FactDiffDraft => ({
  check: 'unsupported',
  entityType: 'date',
  bannedEntryId: null,
  ledgerKey: 'fir_date',
  label: 'FIR date',
  paragraphIndex: 1,
  charOffset: 4,
  ledgerValue: '2 June 2026',
  draftValue: '3 June 2026',
  resolution: 'flagged',
  phase: 'initial',
  ...over,
});

const outcomeOf = (records: FactDiffDraft[]): FactCheckOutcome => ({
  body: 'body',
  passed: records.length === 0,
  repairRan: false,
  repairFixed: false,
  initial: [],
  afterRepair: null,
  records,
  banner: null,
  placeholdersAdded: 0,
});

const logInput = (records: FactDiffDraft[], path?: 'legacy' | 'd1') => ({
  outcome: outcomeOf(records),
  runId: 'run-p',
  documentId: null,
  userId: USER_ID,
  ledgerId: null,
  rulePack: 'bail_regular',
  rulePackVersion: 'v',
  runType: 'real' as const,
  requiredFactCount: 5,
  deliveredText: 'body',
  ...(path ? { path } : {}),
});

describe('round 3: FactDiff.path', () => {
  const base = () => ({
    runId: 'r',
    userId: new mongoose.Types.ObjectId(),
    userRef: 'u',
    rulePack: 'bail_regular',
    rulePackVersion: 'v',
    verifierVersion: 'v',
    repairPromptVersion: 'v',
    runType: 'real',
    check: 'unsupported',
    entityType: 'date',
    label: 'l',
    paragraphIndex: 0,
    charOffset: 0,
    resolution: 'flagged',
    phase: 'initial',
  });

  it('the allowed paths are legacy and d1', () => {
    expect([...FACT_DIFF_PATHS]).toEqual(['legacy', 'd1']);
  });

  it('a row written with no path reads back as legacy, in the database too', async () => {
    const row = await FactDiff.create(base());
    expect(row.path).toBe('legacy');
    const raw = await mongoose.connection.collection('factdiffs').findOne({ _id: row._id });
    expect(raw!.path).toBe('legacy');
  });

  it('d1 is stored', async () => {
    const row = await FactDiff.create({ ...base(), path: 'd1' });
    expect((await FactDiff.findById(row._id).lean())!.path).toBe('d1');
  });

  it('any other path is rejected', async () => {
    await expect(FactDiff.create({ ...base(), path: 'new' })).rejects.toThrow(/path/);
  });
});

describe('round 3: writeFactCheckLog writes the path on every row', () => {
  const records = [
    record(),
    record({ check: 'dropped', entityType: 'name', phase: 'initial', ledgerKey: 'applicant_name' }),
    record({ phase: 'after_repair', resolution: 'placeholdered' }),
  ];

  it('d1 is written on every row', async () => {
    await writeFactCheckLog(logInput(records, 'd1'));
    const rows = await FactDiff.find({}).lean();
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.path === 'd1')).toBe(true);
  });

  it('no path given: legacy on every row', async () => {
    await writeFactCheckLog(logInput(records));
    const rows = await FactDiff.find({}).lean();
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.path === 'legacy')).toBe(true);
  });

  it('legacy given explicitly: legacy on every row', async () => {
    await writeFactCheckLog(logInput(records, 'legacy'));
    expect((await FactDiff.find({}).lean()).every((r) => r.path === 'legacy')).toBe(true);
  });

  it('two runs of different paths keep their own path', async () => {
    await writeFactCheckLog({ ...logInput(records, 'd1'), runId: 'a' });
    await writeFactCheckLog({ ...logInput(records), runId: 'b' });
    expect(await FactDiff.countDocuments({ runId: 'a', path: 'd1' })).toBe(3);
    expect(await FactDiff.countDocuments({ runId: 'b', path: 'legacy' })).toBe(3);
  });

  it('a clean draft writes no FactDiff row for either path (the rate row only)', async () => {
    await writeFactCheckLog(logInput([], 'd1'));
    expect(await FactDiff.countDocuments({})).toBe(0);
  });
});

/**
 * T-682 (Arjun conditions 6 and 7): v2 ledgers read compatibly through `fromV2` (byte for byte against
 * today's `currentState`), and `openLedgerForRun` prefers v3, falls back to v2, and never merges the two.
 * The v2 documents are built the way the v2 tests build them (real `createLedger`, real `readExtraction`,
 * real `applyEdits`). Fictional parties and facts only.
 */
import '../setupDb';
import { FactLedgerModel } from '../../models/FactLedger.model';
import { FactLedgerV3Model } from '../../models/FactLedgerV3.model';
import {
  applyEdits,
  createLedger as createV2,
  currentState,
  ledgerView,
  readExtraction,
  referenceYear,
} from '../../services/fact-ledger.service';
import { fromV2 } from '../../services/v3/from-v2';
import * as L from '../../services/v3/ledger.service';
import {
  CHECKLIST,
  DESC_CALM,
  freshLedger,
  newRun,
  PACK,
  readDescription,
  ARREST,
  CUSTODY,
  USER_A,
  USER_B,
} from './t682-helpers';

beforeAll(async () => {
  await FactLedgerV3Model.init();
});

const NOW = new Date('2026-10-20T08:00:00Z');
type Spans = Array<{ key: string; span: string; confidence?: number; option?: string }>;

/** A v2 state as today's reception builds it: v2's own readExtraction over a description. */
function v2StateOf(text: string, spans: Spans) {
  const r = readExtraction(
    CHECKLIST,
    text,
    { facts: spans.map((s) => ({ confidence: 0.99, ...s })) },
    referenceYear(NOW),
    NOW,
  );
  return { facts: r.facts, unresolved: r.unresolved };
}

const FIXTURES: Array<[string, () => { text: string; spans: Spans }]> = [
  [
    'held facts (dates, a name, a choice)',
    () => ({
      text: 'Test Applicant A was arrested on 10.10.2026 and is in judicial custody.',
      spans: [
        { key: 'arrest_date', span: '10.10.2026' },
        {
          key: 'currently_in_custody',
          span: 'in judicial custody',
          option: 'Yes — Judicial custody',
        },
        { key: 'applicant_name', span: 'Test Applicant A' },
      ],
    }),
  ],
  [
    'unresolved items (low confidence and unreadable)',
    () => ({
      text: 'Arrested on 10.10.2026 for FIR 12/2026 at Civil Lines.',
      spans: [
        { key: 'arrest_date', span: '10.10.2026', confidence: 0.05 },
        { key: 'fir_number', span: '12/2026' },
        { key: 'police_station', span: 'Civil Lines', confidence: 0.1 },
      ],
    }),
  ],
  [
    'a list (several entries under one key)',
    () => ({
      text: 'Sections 318(4) BNS, 319(2) BNS and 61(2) BNS are charged.',
      spans: [
        { key: 'sections_charged', span: '318(4) BNS' },
        { key: 'sections_charged', span: '319(2) BNS' },
        { key: 'sections_charged', span: '61(2) BNS' },
      ],
    }),
  ],
  [
    'a narrative (long, verbatim words)',
    () => {
      const n =
        'The applicant, a shopkeeper in Fictional Nagar, is accused after a rent dispute with a neighbour. '
          .repeat(4)
          .trim();
      return { text: n, spans: [{ key: 'facts_narrative', span: n }] };
    },
  ],
  [
    'conflict-ish (two values for one key: v2 puts them in unresolved)',
    () => ({
      text: 'FIR 12/2026 was registered, or maybe FIR 13/2026.',
      spans: [
        { key: 'fir_number', span: 'FIR 12/2026' },
        { key: 'fir_number', span: 'FIR 13/2026' },
      ],
    }),
  ],
  ['an empty ledger', () => ({ text: 'Nothing readable here.', spans: [] })],
];

describe('condition 6: fromV2 -> factsForGeneration equals currentState, byte for byte', () => {
  it.each(FIXTURES)('%s', async (_n, make) => {
    const { text, spans } = make();
    const state = v2StateOf(text, spans);
    const doc = await createV2({ userId: USER_A, documentKind: PACK, intakeId: newRun(), state });
    const snap = fromV2(doc);
    const gen = L.factsForGeneration(snap, { derived: false });
    const today = currentState(doc);
    expect(JSON.stringify(gen.facts)).toBe(JSON.stringify(today.facts));
    expect(JSON.stringify(gen.unresolved)).toBe(JSON.stringify(today.unresolved));
    expect(snap.store).toBe('v2');
  });

  it('the fixtures are not all empty (the comparison means something)', () => {
    const sizes = FIXTURES.map(([, m]) => {
      const { text, spans } = m();
      const s = v2StateOf(text, spans);
      return s.facts.length + s.unresolved.length;
    });
    expect(sizes.filter((n) => n > 0).length).toBeGreaterThanOrEqual(5);
    // a list fixture holds three entries of one key; the conflict-ish one is unresolved
    const list = v2StateOf(FIXTURES[2][1]().text, FIXTURES[2][1]().spans);
    expect(list.facts.filter((f) => f.key === 'sections_charged')).toHaveLength(3);
    const conflict = v2StateOf(FIXTURES[4][1]().text, FIXTURES[4][1]().spans);
    expect(conflict.unresolved.map((u) => u.reason)).toContain('conflicting_values');
  });

  it('through openLedger and openLedgerForRun (the stored v2 row, read back) it is the same', async () => {
    const runId = newRun();
    const { text, spans } = FIXTURES[0][1]();
    const state = v2StateOf(text, spans);
    const doc = await createV2({ userId: USER_A, documentKind: PACK, intakeId: runId, state });
    const reread = (await FactLedgerModel.findById(doc._id))!;
    for (const snap of [
      (await L.openLedger(String(doc._id), USER_A))!,
      (await L.openLedgerForRun(runId, USER_A))!,
    ]) {
      const gen = L.factsForGeneration(snap, { derived: false });
      expect(JSON.stringify(gen.facts)).toBe(JSON.stringify(currentState(reread).facts));
      expect(JSON.stringify(gen.unresolved)).toBe(JSON.stringify(currentState(reread).unresolved));
    }
  });

  it('after v2 edits (several versions) it still equals the current state, and previous_display matches v2', async () => {
    const { text, spans } = FIXTURES[0][1]();
    const doc0 = await createV2({
      userId: USER_A,
      documentKind: PACK,
      intakeId: newRun(),
      state: v2StateOf(text, spans),
    });
    const { doc } = await applyEdits(
      doc0,
      CHECKLIST,
      [{ key: 'arrest_date', text: '12.10.2026' }],
      100,
      NOW,
    );
    const snap = fromV2(doc);
    const gen = L.factsForGeneration(snap, { derived: false });
    expect(JSON.stringify(gen.facts)).toBe(JSON.stringify(currentState(doc).facts));
    const v2View = ledgerView(doc, CHECKLIST);
    const v3View = L.viewForBrief(snap, CHECKLIST);
    expect(JSON.stringify(v3View.facts)).toBe(JSON.stringify(v2View.facts));
    expect(v3View.facts.find((f) => f.key === 'arrest_date')?.previous_display).toBe(
      '10 October 2026',
    );
  });

  it("the adapted ledger keeps v2's entry order (facts, then unresolved) and says it came from v2", async () => {
    const { text, spans } = FIXTURES[1][1]();
    const doc = await createV2({
      userId: USER_A,
      documentKind: PACK,
      intakeId: newRun(),
      state: v2StateOf(text, spans),
    });
    const snap = fromV2(doc);
    const order = snap.entries.map((e) => e.status);
    expect(order).toEqual(
      [...order].sort((a, b) => (a === 'held' ? -1 : 1) - (b === 'held' ? -1 : 1)),
    );
    expect(snap.nonAnswers).toEqual([]);
    expect(snap.store).toBe('v2');
  });

  it('a v2 list is numbered 0..n-1 on the entries; a single fact has no index', async () => {
    const list = FIXTURES[2][1]();
    const doc = await createV2({
      userId: USER_A,
      documentKind: PACK,
      intakeId: newRun(),
      state: v2StateOf(list.text, list.spans),
    });
    expect(fromV2(doc).entries.map((e) => e.index)).toEqual([0, 1, 2]);
    const single = FIXTURES[0][1]();
    const doc2 = await createV2({
      userId: USER_A,
      documentKind: PACK,
      intakeId: newRun(),
      state: v2StateOf(single.text, single.spans),
    });
    expect(fromV2(doc2).entries.every((e) => e.index === undefined)).toBe(true);
  });
});

describe('condition 7: openLedgerForRun prefers v3, falls back to v2, never merges', () => {
  const v2Facts = () =>
    v2StateOf('Arrested on 10.10.2026 at Civil Lines.', [
      { key: 'arrest_date', span: '10.10.2026' },
      { key: 'police_station', span: 'Civil Lines' },
    ]);

  it('v3 only: the v3 ledger', async () => {
    const s = await freshLedger();
    await readDescription(s, DESC_CALM, [ARREST(), CUSTODY()]);
    const open = (await L.openLedgerForRun(s.runId, USER_A))!;
    expect(open.store).toBe('v3');
    expect(open.ledgerId).toBe(s.ledgerId);
  });

  it('v2 only: falls back to the v2 ledger (its intake id is the run id until T-685)', async () => {
    const runId = newRun();
    const doc = await createV2({
      userId: USER_A,
      documentKind: PACK,
      intakeId: runId,
      state: v2Facts(),
    });
    const open = (await L.openLedgerForRun(runId, USER_A))!;
    expect(open.store).toBe('v2');
    expect(open.ledgerId).toBe(String(doc._id));
    expect(open.entries.map((e) => e.key)).toEqual(
      expect.arrayContaining(['arrest_date', 'police_station']),
    );
  });

  it('v2 only, several ledgers on the intake: the newest', async () => {
    const runId = newRun();
    await createV2({
      userId: USER_A,
      documentKind: PACK,
      intakeId: runId,
      state: v2StateOf('Arrested on 10.10.2026.', [{ key: 'arrest_date', span: '10.10.2026' }]),
    });
    await new Promise((r) => setTimeout(r, 15));
    const newer = await createV2({
      userId: USER_A,
      documentKind: 'bail_anticipatory',
      intakeId: runId,
      state: v2StateOf('Civil Lines.', [{ key: 'police_station', span: 'Civil Lines' }]),
    });
    const open = (await L.openLedgerForRun(runId, USER_A))!;
    expect(open.ledgerId).toBe(String(newer._id));
  });

  it('BOTH present for one run: the v3 ledger only, none of the v2 facts merged in', async () => {
    const runId = newRun();
    await createV2({ userId: USER_A, documentKind: PACK, intakeId: runId, state: v2Facts() });
    const s = await L.createLedger({ runId, userId: USER_A, packId: PACK });
    await readDescription(s, 'Registered as FIR 12/2026.', [
      {
        key: 'fir_number',
        value: '12/2026',
        type: 'text',
        source: { kind: 'description', turn: 0, quote: 'FIR 12/2026' },
        confidence: 0.99,
      },
    ]);
    const open = (await L.openLedgerForRun(runId, USER_A))!;
    expect(open.store).toBe('v3');
    expect(open.ledgerId).toBe(s.ledgerId);
    const keys = open.entries.map((e) => e.key);
    expect(keys).toContain('fir_number');
    expect(keys).not.toContain('arrest_date');
    expect(keys).not.toContain('police_station');
    const gen = L.factsForGeneration(open);
    expect(gen.facts.map((f) => f.key)).not.toContain('police_station');
  });

  it('the v3 ledger wins even when the v2 ledger is newer', async () => {
    const runId = newRun();
    const s = await L.createLedger({ runId, userId: USER_A, packId: PACK });
    await new Promise((r) => setTimeout(r, 15));
    await createV2({ userId: USER_A, documentKind: PACK, intakeId: runId, state: v2Facts() });
    expect((await L.openLedgerForRun(runId, USER_A))!.ledgerId).toBe(s.ledgerId);
  });

  it("another user's ledger of either store is never opened", async () => {
    const runId = newRun();
    await createV2({ userId: USER_B, documentKind: PACK, intakeId: runId, state: v2Facts() });
    expect(await L.openLedgerForRun(runId, USER_A)).toBeNull();
    const s = await L.createLedger({ runId: newRun(), userId: USER_B, packId: PACK });
    expect(await L.openLedger(s.ledgerId, USER_A)).toBeNull();
    expect(await L.openLedgerForRun(s.runId, USER_A)).toBeNull();
  });

  it('openLedger by id reads a v3 id as v3 and a v2 id as v2, each alone', async () => {
    const v2 = await createV2({
      userId: USER_A,
      documentKind: PACK,
      intakeId: newRun(),
      state: v2Facts(),
    });
    const v3 = await freshLedger();
    expect((await L.openLedger(String(v2._id), USER_A))!.store).toBe('v2');
    expect((await L.openLedger(v3.ledgerId, USER_A))!.store).toBe('v3');
  });

  it('reading a v2 ledger writes nothing to either store', async () => {
    const runId = newRun();
    const doc = await createV2({
      userId: USER_A,
      documentKind: PACK,
      intakeId: runId,
      state: v2Facts(),
    });
    const before = JSON.stringify(await FactLedgerModel.findById(doc._id).lean());
    const v3Before = await FactLedgerV3Model.countDocuments({});
    await L.openLedgerForRun(runId, USER_A);
    await L.openLedger(String(doc._id), USER_A, { described: DESC_CALM });
    expect(JSON.stringify(await FactLedgerModel.findById(doc._id).lean())).toBe(before);
    expect(await FactLedgerV3Model.countDocuments({})).toBe(v3Before);
  });

  it('a v2 ledger imported into v3 (import_v2): version 1 is the v2 state, the v2 row is untouched, importedFrom is an id only', async () => {
    const runId = newRun();
    const v2 = await createV2({
      userId: USER_A,
      documentKind: PACK,
      intakeId: runId,
      state: v2Facts(),
    });
    const v2Row = JSON.stringify(await FactLedgerModel.findById(v2._id).lean());
    const snap = (await L.openLedger(String(v2._id), USER_A))!;
    const s = await L.createLedger({
      runId: `${runId}-v3`,
      userId: USER_A,
      packId: PACK,
      initial: L.importV2State(snap),
      reason: 'import_v2',
      importedFrom: String(v2._id),
    });
    const doc = (await FactLedgerV3Model.findById(s.ledgerId).lean())!;
    expect(doc.versions[0].reason).toBe('import_v2');
    expect(String(doc.importedFrom)).toBe(String(v2._id));
    expect(s.entries.map((e) => e.key)).toEqual(
      expect.arrayContaining(['arrest_date', 'police_station']),
    );
    expect(JSON.stringify(await FactLedgerModel.findById(v2._id).lean())).toBe(v2Row);
    const gen = L.factsForGeneration(s, { derived: false });
    expect(JSON.stringify(gen.facts)).toBe(JSON.stringify(currentState(v2).facts));
  });
});

/**
 * T-682 round 3 (Arjun two-strike fix note): a below-floor reading still counts as a reading;
 * one below-floor reading is asked, never held; confidence clamped once; NonAnswer.key on the
 * checklist; createLedger initial only from importV2State / carryOverState. Fictional data only.
 */
import '../setupDb';
import logger from '../../config/logger';
import { FactLedgerV3Model } from '../../models/FactLedgerV3.model';
import { LEDGER_DETAILS } from '../../services/fact-ledger.service';
import * as L from '../../services/v3/ledger.service';
import type { LedgerCandidate, LedgerEntry, LedgerSnapshot } from '../../services/v3/ledger.types';
import {
  CHECKLIST,
  cand,
  extractOf,
  freshLedger,
  newRun,
  PACK,
  readDescription,
  USER_A,
} from './t682-helpers';

beforeAll(async () => {
  await FactLedgerV3Model.init();
});
afterEach(() => jest.restoreAllMocks());

const TEXT = 'Test Applicant A was arrested on 10.10.2026, or was it 11.10.2026, said the family.';
const D = (v: string, q: string, confidence: unknown): LedgerCandidate => ({
  ...cand('arrest_date', v, q),
  confidence: confidence as number,
});
const arrest = (s: LedgerSnapshot) => s.entries.filter((e) => e.key === 'arrest_date');

async function viaConflicts(values: LedgerCandidate[], text = TEXT) {
  const s = await freshLedger();
  return L.appendCandidates(
    s.ledgerId,
    USER_A,
    s.version,
    extractOf([], [{ key: 'arrest_date', values }]),
    CHECKLIST,
    text,
    { turn: 0, kind: 'description' },
  );
}
async function viaCandidates(values: LedgerCandidate[], text = TEXT) {
  const s = await freshLedger();
  return readDescription(s, text, values);
}

describe.each([
  ['result.conflicts', viaConflicts],
  ['result.candidates', viaCandidates],
] as const)('via %s', (_name, run) => {
  it('invariant-5-two-readings-one-below-floor-conflict: 0.99 + 0.3, different values, both verbatim -> conflict', async () => {
    const r = await run([D('2026-10-10', '10.10.2026', 0.99), D('2026-10-11', '11.10.2026', 0.3)]);
    const e = arrest(r.s);
    expect(e).toHaveLength(1);
    expect(e[0].status).toBe('conflict');
    expect(e[0].candidates).toHaveLength(2);
    const byValue = Object.fromEntries(e[0].candidates!.map((c) => [String(c.value), c]));
    expect(byValue['2026-10-10'].confidence).toBe(0.99);
    expect(byValue['2026-10-11'].confidence).toBe(0.3);
    expect(byValue['2026-10-11'].source.quote).toBe('11.10.2026');
    expect(L.held(r.s).some((x) => x.key === 'arrest_date')).toBe(false);
    expect(L.factsForGeneration(r.s).unresolved.find((u) => u.key === 'arrest_date')?.reason).toBe(
      'conflicting_values',
    );
  });

  it('one-reading-below-floor-unresolved: 0.3 alone -> unresolved low_confidence, quote kept, not held', async () => {
    const r = await run([D('2026-10-10', '10.10.2026', 0.3)]);
    const e = arrest(r.s);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ status: 'unresolved', reason: 'low_confidence' });
    expect(e[0].detail).toBe(LEDGER_DETAILS.low_confidence);
    expect(e[0].origin.quote).toBe('10.10.2026');
    expect(L.held(r.s).some((x) => x.key === 'arrest_date')).toBe(false);
    expect(L.factsForGeneration(r.s).facts.some((f) => f.key === 'arrest_date')).toBe(false);
  });

  it('two-readings-same-value-held-once: 0.9 + 0.4 same value -> one held, confidence 0.9 (either order)', async () => {
    for (const order of [
      [D('2026-10-10', '10.10.2026', 0.9), D('2026-10-10', '10.10.2026', 0.4)],
      [D('2026-10-10', '10.10.2026', 0.4), D('2026-10-10', '10.10.2026', 0.9)],
    ]) {
      const r = await run(order);
      const e = arrest(r.s);
      expect(e).toHaveLength(1);
      expect(e[0]).toMatchObject({ status: 'held', value: '2026-10-10' });
      expect(e[0].origin.confidence).toBe(0.9);
    }
  });

  it('a single reading at the floor or above is held', async () => {
    const r = await run([D('2026-10-10', '10.10.2026', 0.99)]);
    expect(arrest(r.s)[0]).toMatchObject({ status: 'held', value: '2026-10-10' });
  });

  it('a reading the normaliser fails is dropped unverified; an invented quote is still dropped', async () => {
    const r = await run(
      [
        D('2026-10-10', '10.10.2026', 0.99),
        D('2026-10-12', 'some day last month', 0.99),
        D('2026-10-13', '13.10.2026 never said', 0.99),
      ],
      `${TEXT} Arrested some day last month.`,
    );
    expect(arrest(r.s).map((e) => e.status)).toEqual(['held']);
    // on the candidates path v2's own read drops the unreadable one before verified() (no count); on conflicts it is 'unverified'
    if (_name === 'result.conflicts') expect(r.dropped.unverified).toBe(1);
    expect(r.dropped.span_not_found).toBe(1);
  });
});

describe('row-confidence-clamped', () => {
  const pairs: Array<[string, unknown, unknown, number, number]> = [
    ['NaN -> 0 and 1.7 -> 1', NaN, 1.7, 0, 1],
    ['string -> 0 and undefined -> 0', '0.9', undefined, 0, 0],
    ['-3 -> 0 and Infinity -> 0', -3, Infinity, 0, 0],
    ['0.5 stays and 1 stays', 0.5, 1, 0.5, 1],
  ];
  it.each(pairs)('%s', async (_n, c1, c2, e1, e2) => {
    const r = await viaConflicts([
      D('2026-10-10', '10.10.2026', c1),
      D('2026-10-11', '11.10.2026', c2),
    ]);
    const e = arrest(r.s)[0];
    expect(e.status).toBe('conflict');
    const conf = (v: string) => e.candidates!.find((c) => c.value === v)!.confidence;
    expect(conf('2026-10-10')).toBe(e1);
    expect(conf('2026-10-11')).toBe(e2);
  });

  it('a single held reading with 1.7 is stored as 1; a single NaN is asked (0 < floor), never held', async () => {
    const hi = await viaCandidates([D('2026-10-10', '10.10.2026', 1.7)]);
    expect(arrest(hi.s)[0]).toMatchObject({ status: 'held' });
    expect(arrest(hi.s)[0].origin.confidence).toBe(1);
    const nan = await viaCandidates([D('2026-10-10', '10.10.2026', NaN)]);
    expect(arrest(nan.s)[0].status).not.toBe('held');
    const neg = await viaCandidates([D('2026-10-10', '10.10.2026', -3)]);
    expect(arrest(neg.s)[0].status).not.toBe('held');
  });
});

describe('recordNonAnswer: the key must be on the checklist', () => {
  it('an off-list key writes nothing, counts not_on_list and logs no value', async () => {
    const info = jest.spyOn(logger, 'info').mockImplementation(() => logger);
    const s = await freshLedger();
    const r = await L.recordNonAnswer(s.ledgerId, USER_A, s.version, {
      key: 'zorblax_not_a_key',
      kind: 'not_known',
      turn: 1,
    });
    expect(r.version).toBe(s.version);
    expect(r.nonAnswers).toHaveLength(0);
    const doc = (await FactLedgerV3Model.findById(s.ledgerId).lean())!;
    expect(doc.versions).toHaveLength(1);
    const line = info.mock.calls.find((c) => JSON.stringify(c[0]).includes('not_on_list'))!;
    expect((line[0] as { dropped: Record<string, number> }).dropped).toEqual({ not_on_list: 1 });
    expect(JSON.stringify(info.mock.calls)).not.toContain('zorblax');
  });

  it('a key of the pack checklist is recorded; a derived-only key is not on it', async () => {
    const s = await freshLedger();
    const r = await L.recordNonAnswer(s.ledgerId, USER_A, s.version, {
      key: 'antecedents',
      kind: 'not_known',
      turn: 1,
    });
    expect(r.nonAnswers.map((n) => n.key)).toEqual(['antecedents']);
    const r2 = await L.recordNonAnswer(r.ledgerId, USER_A, r.version, {
      key: 'amount_in_words',
      kind: 'not_known',
      turn: 1,
    });
    expect(r2.version).toBe(r.version);
    expect(r2.nonAnswers.map((n) => n.key)).toEqual(['antecedents']);
  });

  it('an explicit checklist argument is the one checked', async () => {
    const s = await freshLedger();
    const only = CHECKLIST.filter((i) => i.key === 'fir_number');
    const r = await L.recordNonAnswer(
      s.ledgerId,
      USER_A,
      s.version,
      { key: 'antecedents', kind: 'not_known', turn: 1 },
      only,
    );
    expect(r.version).toBe(s.version);
    expect(r.nonAnswers).toHaveLength(0);
  });
});

describe('createLedger: initial only from importV2State / carryOverState', () => {
  const SECRET = 'Zorblax-secret-5521';
  const entry = (): LedgerEntry => ({
    id: 'e1',
    key: 'applicant_name',
    label: 'Name',
    type: 'text',
    status: 'held',
    value: SECRET,
    display: SECRET,
    origin: { source: 'asked', quote: SECRET, confidence: 1 },
    requiredInDraft: true,
  });
  const snap = (): LedgerSnapshot =>
    ({ entries: [entry()], nonAnswers: [] }) as unknown as LedgerSnapshot;

  it('a hand-built initial is rejected with a fixed message and nothing is stored', async () => {
    const runId = newRun();
    const err = await L.createLedger({
      runId,
      userId: USER_A,
      packId: PACK,
      initial: { entries: [entry()], nonAnswers: [] },
    }).then(
      () => null,
      (e: unknown) => e as Error,
    );
    expect(err).toBeInstanceOf(L.LedgerInitialStateError);
    expect(err!.message).not.toContain('Zorblax');
    expect(JSON.stringify(err)).not.toContain('Zorblax');
    expect(await FactLedgerV3Model.countDocuments({ runId })).toBe(0);
  });

  it('a copy of an accepted state is a hand-built one and is rejected', async () => {
    const st = L.importV2State(snap());
    await expect(
      L.createLedger({ runId: newRun(), userId: USER_A, packId: PACK, initial: { ...st } }),
    ).rejects.toBeInstanceOf(L.LedgerInitialStateError);
  });

  it('importV2State and carryOverState results are accepted', async () => {
    const a = await L.createLedger({
      runId: newRun(),
      userId: USER_A,
      packId: PACK,
      initial: L.importV2State(snap()),
      reason: 'import_v2',
    });
    expect(a.entries.map((e) => e.key)).toEqual(['applicant_name']);
    const b = await L.createLedger({
      runId: newRun(),
      userId: USER_A,
      packId: PACK,
      initial: L.carryOverState(snap(), CHECKLIST),
      reason: 'kind_change',
    });
    expect(b.entries.map((e) => e.key)).toEqual(['applicant_name']);
  });

  it('no initial (an empty ledger) still works', async () => {
    const s = await freshLedger();
    expect(s.entries).toEqual([]);
  });
});

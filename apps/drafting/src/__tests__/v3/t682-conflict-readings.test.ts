/**
 * T-682 review round 2: a conflict's readings are ordinary candidates (same pipeline as held values);
 * an answer of unresolved readings leaves a conflict open; the whole-document sealed budget;
 * createLedger input checks; description-mode model-readable rule; fixed-text unseal error.
 * Fictional parties and facts only.
 */
import '../setupDb';
import { FactLedgerV3Model } from '../../models/FactLedgerV3.model';
import * as L from '../../services/v3/ledger.service';
import type { LedgerCandidate, LedgerEntry, LedgerSnapshot } from '../../services/v3/ledger.types';
import { encrypt } from '../../utils/encryption';
import {
  ARREST,
  CHECKLIST,
  cand,
  extractOf,
  freshLedger,
  newRun,
  PACK,
  readDescription,
  storedDoc,
  USER_A,
} from './t682-helpers';

beforeAll(async () => {
  await FactLedgerV3Model.init();
});
afterEach(() => jest.restoreAllMocks());

const TEXT = 'Test Applicant A was arrested on 10.10.2026, or was it 11.10.2026, said the family.';
const D10 = (over: Partial<LedgerCandidate> = {}) =>
  cand('arrest_date', '2026-10-10', '10.10.2026', over);
const D11 = (over: Partial<LedgerCandidate> = {}) =>
  cand('arrest_date', '2026-10-11', '11.10.2026', over);

async function viaConflicts(
  text: string,
  values: LedgerCandidate[],
  opts: { kind?: 'description' | 'answer'; turn?: number; key?: string } = {},
) {
  const s = await freshLedger();
  const r = await L.appendCandidates(
    s.ledgerId,
    USER_A,
    s.version,
    extractOf([], [{ key: opts.key ?? 'arrest_date', values }]),
    CHECKLIST,
    text,
    { turn: opts.turn ?? 0, kind: opts.kind ?? 'description' },
  );
  return { s, r };
}
const of = (entries: LedgerEntry[], key: string) => entries.filter((e) => e.key === key);

describe('MUST-FIX 1: conflict readings go through the same pipeline as held values', () => {
  it('an invented reading is dropped as span_not_found, the real one is held, and there is no conflict', async () => {
    const { r } = await viaConflicts('He was arrested on 10.10.2026.', [
      D10(),
      D11({ source: { kind: 'description', turn: 0, quote: 'on the 11th of October, invented' } }),
    ]);
    const e = of(r.s.entries, 'arrest_date');
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ status: 'held', value: '2026-10-10' });
    expect(e.some((x) => x.status === 'conflict')).toBe(false);
    expect(r.dropped.span_not_found).toBe(1);
  });

  it('the same through result.candidates (two readings for one key, one invented)', async () => {
    const s = await freshLedger();
    const r = await readDescription(s, 'He was arrested on 10.10.2026.', [
      D10(),
      cand('arrest_date', '2026-10-11', '11.10.2026 never said'),
    ]);
    const e = of(r.s.entries, 'arrest_date');
    expect(e.map((x) => x.status)).toEqual(['held']);
    expect(r.dropped.span_not_found).toBe(1);
  });

  it('dropped candidates (span_not_found, no_span, over 200 chars, below floor) never reappear in a conflict; a below-floor real reading is kept (round 3)', async () => {
    const long = `11.10.2026 ${'x'.repeat(200)}`;
    const text = `Arrested 10.10.2026 or 11.10.2026 or 12.10.2026 ${'x'.repeat(200)}`;
    const { r } = await viaConflicts(text, [
      D10(),
      D11(),
      cand('arrest_date', '2026-10-13', '13.10.2026 invented'),
      cand('arrest_date', '2026-10-14', ''),
      cand('arrest_date', '2026-10-11', long),
      cand('arrest_date', '2026-10-12', '12.10.2026', { confidence: 0.05 }),
    ]);
    const e = of(r.s.entries, 'arrest_date');
    expect(e).toHaveLength(1);
    expect(e[0].status).toBe('conflict');
    // round 3: the 0.05 reading of a text-present value is a real third reading, kept with its own confidence
    expect(e[0].candidates).toHaveLength(3);
    expect(e[0].candidates!.map((c) => c.value).sort()).toEqual([
      '2026-10-10',
      '2026-10-11',
      '2026-10-12',
    ]);
    expect(e[0].candidates!.find((c) => c.value === '2026-10-12')!.confidence).toBe(0.05);
    expect(r.dropped.span_not_found).toBe(1);
    expect(r.dropped.no_span).toBe(2);
    expect(r.dropped.unverified).toBeUndefined();
    expect(JSON.stringify(e[0])).not.toContain('2026-10-13');
    expect(JSON.stringify(e[0])).not.toContain('2026-10-14');
    expect(JSON.stringify(e[0])).not.toContain('invented');
  });

  it("each candidate's quote is the located span: verbatim in the turn text, <= 200, and the model's value is not stored", async () => {
    const { r } = await viaConflicts(TEXT, [
      cand('arrest_date', '1999-01-01', '10.10.2026'),
      cand('arrest_date', '1998-02-02', '11.10.2026'),
    ]);
    const c = of(r.s.entries, 'arrest_date')[0];
    expect(c.status).toBe('conflict');
    expect(c.candidates!.map((x) => x.value).sort()).toEqual(['2026-10-10', '2026-10-11']);
    for (const x of c.candidates!) {
      expect(TEXT.includes(x.source.quote)).toBe(true);
      expect(x.source.quote.length).toBeLessThanOrEqual(200);
      expect(x.display).toBeTruthy();
      expect(x.confidence).toBeGreaterThan(0);
      expect(x.source).toMatchObject({ kind: 'description', turn: 0 });
    }
    const stored = JSON.stringify(c);
    expect(stored).not.toContain('1999-01-01');
    expect(stored).not.toContain('1998-02-02');
  });

  it('the stored quotes are exactly the two located spans', async () => {
    const { r } = await viaConflicts('Arrested 10.10.2026 or 11.10.2026.', [
      D10(),
      D11({ source: { kind: 'description', turn: 0, quote: '11.10.2026' } }),
    ]);
    const c = of(r.s.entries, 'arrest_date')[0];
    expect(c.candidates!.map((x) => x.source.quote).sort()).toEqual(['10.10.2026', '11.10.2026']);
  });

  it('two verified readings are a conflict with code values (path: result.conflicts)', async () => {
    const { r } = await viaConflicts(TEXT, [D10(), D11()]);
    const c = of(r.s.entries, 'arrest_date');
    expect(c.map((x) => x.status)).toEqual(['conflict']);
    expect(c[0].candidates).toHaveLength(2);
  });

  it('two verified readings are a conflict (path: readExtraction conflicting_values from result.candidates)', async () => {
    const s = await freshLedger();
    const r = await readDescription(s, TEXT, [D10(), D11()]);
    const c = of(r.s.entries, 'arrest_date');
    expect(c.map((x) => x.status)).toEqual(['conflict']);
    expect(c[0].candidates!.map((x) => x.value).sort()).toEqual(['2026-10-10', '2026-10-11']);
  });

  it('the same value read twice is one reading: held, not a conflict', async () => {
    const { r } = await viaConflicts('Arrested 10.10.2026, yes 10.10.2026.', [D10(), D10()]);
    expect(of(r.s.entries, 'arrest_date').map((x) => x.status)).toEqual(['held']);
  });

  it('two real differing readings, both below the floor, are a conflict now (round 3), not unresolved', async () => {
    const { r } = await viaConflicts(TEXT, [D10({ confidence: 0.05 }), D11({ confidence: 0.05 })]);
    const e = of(r.s.entries, 'arrest_date');
    expect(e).toHaveLength(1);
    expect(e[0].status).toBe('conflict');
    expect(e[0].candidates).toHaveLength(2);
    expect(e[0].candidates!.every((c) => c.confidence === 0.05)).toBe(true);
    expect(r.dropped.unverified).toBeUndefined();
  });

  it('no reading the normaliser can read: nothing held, no conflict, both counted unverified', async () => {
    const { r } = await viaConflicts('Arrested some day last month or maybe a week ago.', [
      cand('arrest_date', '2026-10-10', 'some day last month'),
      cand('arrest_date', '2026-10-11', 'a week ago'),
    ]);
    const e = of(r.s.entries, 'arrest_date');
    expect(e.some((x) => x.status === 'held' || x.status === 'conflict')).toBe(false);
    expect(r.dropped.unverified).toBe(2);
  });

  it('unreadable readings (a date that is not a date) are dropped as unverified', async () => {
    const { r } = await viaConflicts('Arrested on 10.10.2026 or some day last month.', [
      D10(),
      cand('arrest_date', '2026-10-11', 'some day last month'),
    ]);
    expect(of(r.s.entries, 'arrest_date').map((x) => x.status)).toEqual(['held']);
    expect(r.dropped.unverified).toBe(1);
  });

  it('a derived key in a conflict is dropped as derived_key', async () => {
    const { r } = await viaConflicts(
      'amount ten thousand or twenty thousand',
      [
        cand('amount_in_words', 'x', 'ten thousand'),
        cand('amount_in_words', 'y', 'twenty thousand'),
      ],
      { key: 'amount_in_words' },
    );
    expect(r.s.entries.some((e) => e.key === 'amount_in_words')).toBe(false);
    expect(r.dropped.derived_key).toBe(2);
  });

  it('a choice conflict re-reads the option by code and keeps the located spans', async () => {
    const text = 'He is in judicial custody, no, police custody.';
    const { r } = await viaConflicts(
      text,
      [
        cand('currently_in_custody', 'Yes — Judicial custody', 'judicial custody'),
        cand('currently_in_custody', 'Yes — Police custody', 'police custody'),
      ],
      { key: 'currently_in_custody' },
    );
    const c = of(r.s.entries, 'currently_in_custody')[0];
    expect(c.status).toBe('conflict');
    expect(c.candidates!.map((x) => x.value).sort()).toEqual([
      'Yes — Judicial custody',
      'Yes — Police custody',
    ]);
    for (const x of c.candidates!) expect(text.includes(x.source.quote)).toBe(true);
  });

  describe('Devanagari NFC/NFD in a conflict', () => {
    const A = 'ऩीरज'; // precomposed U+0929
    const B = 'सुनील';
    it('NFD quotes against an NFC text are located and stored as the NFC span', async () => {
      const text = `आवेदक का नाम ${A} या ${B} है।`.normalize('NFC');
      const { r } = await viaConflicts(
        text,
        [
          cand('applicant_name', A, A.normalize('NFD')),
          cand('applicant_name', B, B.normalize('NFD')),
        ],
        { key: 'applicant_name' },
      );
      const c = of(r.s.entries, 'applicant_name')[0];
      expect(c.status).toBe('conflict');
      expect(r.dropped.span_not_found).toBeUndefined();
      for (const x of c.candidates!) {
        expect(text.includes(x.source.quote)).toBe(true);
        expect(x.source.quote).toBe(x.source.quote.normalize('NFC'));
      }
    });
    it('NFC quotes against an NFD text are still located', async () => {
      const text = `आवेदक का नाम ${A} या ${B} है।`.normalize('NFD');
      const { r } = await viaConflicts(
        text,
        [cand('applicant_name', A, A), cand('applicant_name', B, B)],
        { key: 'applicant_name' },
      );
      expect(of(r.s.entries, 'applicant_name')[0].status).toBe('conflict');
      expect(r.dropped.span_not_found).toBeUndefined();
    });
  });

  it("the conflict's generation exposure has raw_span = the located span", async () => {
    const { r } = await viaConflicts(TEXT, [
      D10({ source: { kind: 'description', turn: 0, quote: '10.10.2026' } }),
      D11(),
    ]);
    const gen = L.factsForGeneration(r.s);
    const u = gen.unresolved.find((x) => x.key === 'arrest_date')!;
    expect(u.reason).toBe('conflicting_values');
    expect(TEXT.includes(u.raw_span)).toBe(true);
    expect(['10.10.2026', '11.10.2026']).toContain(u.raw_span);
    expect(gen.facts.some((f) => f.key === 'arrest_date')).toBe(false);
  });

  it('an answer-turn conflict reading is source asked / kind answer', async () => {
    const { r } = await viaConflicts(
      '10.10.2026 or 11.10.2026',
      [
        cand('arrest_date', '2026-10-10', '10.10.2026', { kind: 'answer', turn: 2 }),
        cand('arrest_date', '2026-10-11', '11.10.2026', { kind: 'answer', turn: 2 }),
      ],
      { kind: 'answer', turn: 2 },
    );
    const c = of(r.s.entries, 'arrest_date')[0];
    expect(c.status).toBe('conflict');
    expect(c.candidates!.every((x) => x.source.kind === 'answer' && x.source.turn === 2)).toBe(
      true,
    );
  });
});

describe('SHOULD-FIX 1: an answer of only unresolved readings leaves a conflict open', () => {
  async function conflicted() {
    const s = await freshLedger();
    const r = await readDescription(s, TEXT, [D10(), D11()]);
    expect(of(r.s.entries, 'arrest_date')[0].status).toBe('conflict');
    return r;
  }
  const answer = (
    r: { s: { ledgerId: string; version: number } },
    text: string,
    c: LedgerCandidate[],
    nonAnswers: string[] = [],
  ) =>
    L.appendCandidates(
      r.s.ledgerId,
      USER_A,
      r.s.version,
      extractOf(c, [], nonAnswers),
      CHECKLIST,
      text,
      {
        turn: 1,
        kind: 'answer',
      },
    );
  const lastReason = async (id: string) => {
    const d = (await storedDoc(id))!;
    return d.versions[d.versions.length - 1].reason;
  };

  it('an unreadable answer: conflict stays, no conflict_resolved, no new version', async () => {
    const r1 = await conflicted();
    const before = await lastReason(r1.s.ledgerId);
    const r2 = await answer(r1, 'some day last month, maybe', [
      cand('arrest_date', '2026-10-12', 'some day last month', { kind: 'answer', turn: 1 }),
    ]);
    expect(of(r2.s.entries, 'arrest_date').map((e) => e.status)).toEqual(['conflict']);
    expect(r2.s.version).toBe(r1.s.version);
    expect(await lastReason(r1.s.ledgerId)).toBe(before);
    expect(before).not.toBe('conflict_resolved');
  });

  it('a below-floor answer: conflict stays, no conflict_resolved', async () => {
    const r1 = await conflicted();
    const before = await lastReason(r1.s.ledgerId);
    const r2 = await answer(r1, 'It was 12.10.2026', [
      cand('arrest_date', '2026-10-12', '12.10.2026', {
        kind: 'answer',
        turn: 1,
        confidence: 0.05,
      }),
    ]);
    expect(of(r2.s.entries, 'arrest_date').map((e) => e.status)).toEqual(['conflict']);
    expect(await lastReason(r1.s.ledgerId)).toBe(before);
    expect(r2.s.version).toBe(r1.s.version);
  });

  it('a held answer replaces it: conflict_resolved', async () => {
    const r1 = await conflicted();
    const r2 = await answer(r1, 'It was 12.10.2026', [
      cand('arrest_date', '2026-10-12', '12.10.2026', { kind: 'answer', turn: 1 }),
    ]);
    expect(of(r2.s.entries, 'arrest_date')[0]).toMatchObject({
      status: 'held',
      value: '2026-10-12',
    });
    expect(await lastReason(r1.s.ledgerId)).toBe('conflict_resolved');
  });

  it('a non-answer replaces it', async () => {
    const r1 = await conflicted();
    const r2 = await answer(r1, 'Not known', [], ['arrest_date']);
    expect(of(r2.s.entries, 'arrest_date').some((e) => e.status === 'conflict')).toBe(false);
    expect(r2.s.nonAnswers.map((n) => n.key)).toContain('arrest_date');
  });
});

/** A big initial state, built the only accepted way: importV2State. */
const bigInitial = (big: LedgerEntry) =>
  L.importV2State({ entries: [big], nonAnswers: [] } as unknown as LedgerSnapshot);

describe('SHOULD-FIX 2: the whole-document sealed budget', () => {
  it('is 12 MB and the per-version guard stays 2 MB', () => {
    expect(L.LEDGER_V3_MAX_DOC_SEALED_BYTES).toBe(12 * 1024 * 1024);
    expect(L.LEDGER_V3_MAX_SEALED_BYTES).toBe(2 * 1024 * 1024);
  });

  it('the write that would pass 12 MB total throws LedgerVersionTooLargeError and stores nothing', async () => {
    const big: LedgerEntry = {
      id: 'big-1',
      key: 'facts_narrative',
      label: 'Brief facts',
      type: 'text',
      status: 'held',
      value: 'a'.repeat(1_400_000),
      display: 'a',
      origin: { source: 'user', quote: 'a', confidence: 1 },
      requiredInDraft: false,
    };
    const s = await L.createLedger({
      runId: newRun(),
      userId: USER_A,
      packId: PACK,
      initial: bigInitial(big),
    });
    const keys = [
      'antecedents',
      'dependants',
      'local_ties',
      'medical_condition',
      'recovery_status',
      'address',
    ];
    let cur = s;
    let thrown: unknown = null;
    let written = 1;
    for (const key of keys) {
      try {
        cur = await L.recordNonAnswer(cur.ledgerId, USER_A, cur.version, {
          key,
          kind: 'not_known',
          turn: 1,
        });
        written += 1;
      } catch (e) {
        thrown = e;
        break;
      }
    }
    const doc = (await storedDoc(s.ledgerId))!;
    const total = doc.versions.reduce((n, v) => n + Buffer.byteLength(v.sealed, 'utf8'), 0);
    // each version is within 2 MB, the total within 12 MB, and the refusal happened before the write
    expect(
      doc.versions.every(
        (v) => Buffer.byteLength(v.sealed, 'utf8') <= L.LEDGER_V3_MAX_SEALED_BYTES,
      ),
    ).toBe(true);
    expect(total).toBeLessThanOrEqual(L.LEDGER_V3_MAX_DOC_SEALED_BYTES);
    expect(thrown).toBeInstanceOf(L.LedgerVersionTooLargeError);
    expect(doc.versions).toHaveLength(written);
    expect(doc.currentVersion).toBe(written);
    // and a further small write is refused too, still nothing stored
    await expect(
      L.recordNonAnswer(cur.ledgerId, USER_A, cur.version, {
        key: 'applicant_occupation',
        kind: 'not_known',
        turn: 2,
      }),
    ).rejects.toBeInstanceOf(L.LedgerVersionTooLargeError);
    expect((await storedDoc(s.ledgerId))!.versions).toHaveLength(written);
  });
});

describe('SHOULD-FIX 3: createLedger checks its ids before any Mongo call', () => {
  const bad: Array<[string, unknown, unknown]> = [
    ['empty runId', '', USER_A],
    ['non-string runId (number)', 42, USER_A],
    ['non-string runId (object)', { $ne: null }, USER_A],
    ['undefined runId', undefined, USER_A],
    ['invalid userId', 'run-1', 'not-an-object-id'],
    ['empty userId', 'run-1', ''],
    ['object userId', 'run-1', { $ne: null }],
  ];
  it.each(bad)(
    '%s is LedgerNotFoundV3Error and the model is not touched',
    async (_n, runId, userId) => {
      const find = jest.spyOn(FactLedgerV3Model, 'findOne');
      const create = jest.spyOn(FactLedgerV3Model, 'create');
      await expect(
        L.createLedger({ runId: runId as string, userId: userId as string, packId: PACK }),
      ).rejects.toBeInstanceOf(L.LedgerNotFoundV3Error);
      expect(find).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    },
  );
});

describe('SHOULD-FIX 4: description mode keeps the model-readable rule', () => {
  // offence_date, co_accused_bail_court and co_accused_bail_date are on the list but not model-readable
  it('a conflict on a key that is not model-readable cannot open (description)', async () => {
    const { r } = await viaConflicts(
      'Offence on 10.10.2026 or 11.10.2026',
      [
        cand('offence_date', '2026-10-10', '10.10.2026'),
        cand('offence_date', '2026-10-11', '11.10.2026'),
      ],
      { key: 'offence_date' },
    );
    expect(r.s.entries.some((e) => e.key === 'offence_date')).toBe(false);
    expect(r.dropped.not_on_list).toBe(2);
  });

  it('a non-answer for a key that is not model-readable is dropped as not_on_list (description)', async () => {
    const s = await freshLedger();
    const r = await L.appendCandidates(
      s.ledgerId,
      USER_A,
      s.version,
      extractOf([], [], ['offence_date', 'co_accused_bail_court']),
      CHECKLIST,
      'Not known',
      { turn: 0, kind: 'description' },
    );
    expect(r.s.nonAnswers).toHaveLength(0);
    expect(r.dropped.not_on_list).toBe(2);
  });

  it('a model-readable non-answer is still recorded (description)', async () => {
    const s = await freshLedger();
    const r = await L.appendCandidates(
      s.ledgerId,
      USER_A,
      s.version,
      extractOf([], [], ['antecedents']),
      CHECKLIST,
      'Not known',
      { turn: 0, kind: 'description' },
    );
    expect(r.s.nonAnswers.map((n) => n.key)).toEqual(['antecedents']);
  });

  it('on an answer turn the same key is allowed (the advocate is asked it)', async () => {
    const s = await freshLedger();
    const r = await L.appendCandidates(
      s.ledgerId,
      USER_A,
      s.version,
      extractOf([], [], ['offence_date']),
      CHECKLIST,
      'Not known',
      { turn: 1, kind: 'answer' },
    );
    expect(r.s.nonAnswers.map((n) => n.key)).toEqual(['offence_date']);
  });
});

describe('LedgerSealedUnreadableError holds no part of the payload', () => {
  const SECRET = 'Zorblax-secret-4417 {not json';
  async function ledgerWithSealed(plain: string) {
    const s = await freshLedger();
    const doc = (await storedDoc(s.ledgerId))!;
    const last = doc.versions.length - 1;
    await FactLedgerV3Model.updateOne(
      { _id: s.ledgerId },
      { $set: { [`versions.${last}.sealed`]: encrypt(plain) } },
    );
    return s;
  }
  it.each([
    ['valid-encrypted non-JSON', SECRET],
    [
      'valid JSON, not a ledger state',
      JSON.stringify({ secret: 'Zorblax-secret-4417', entries: 'x' }),
    ],
    ['JSON null', 'null'],
  ])('%s -> fixed message, no snippet', async (_n, plain) => {
    const s = await ledgerWithSealed(plain);
    const err = (await L.openLedger(s.ledgerId, USER_A).then(
      () => null,
      (e: unknown) => e,
    )) as Error | null;
    expect(err).toBeInstanceOf(L.LedgerSealedUnreadableError);
    expect(err!.message).toBe('sealed ledger version is unreadable');
    expect(err!.message).not.toContain('Zorblax');
    expect(err!.message).not.toContain('secret');
    expect(JSON.stringify(err)).not.toContain('Zorblax');
    expect(String(err!.stack)).not.toContain('Zorblax');
  });
  it('garbage that does not decrypt is the same error', async () => {
    const s = await freshLedger();
    await FactLedgerV3Model.updateOne(
      { _id: s.ledgerId },
      { $set: { 'versions.0.sealed': 'zz:zz:zz' } },
    );
    await expect(L.openLedger(s.ledgerId, USER_A)).rejects.toBeInstanceOf(
      L.LedgerSealedUnreadableError,
    );
  });
});

void ARREST;

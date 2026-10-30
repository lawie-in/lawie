/**
 * T-682 (Arjun conditions 2 and 3): the read path (NFC quotes, dropped counts by reason only), legal
 * lists IMPORTED never copied, the merge rules of one turn, lists, long quotes, previous_display and
 * the views. Fictional parties and facts only.
 */
import '../setupDb';
import { readFileSync } from 'fs';
import { join } from 'path';

import { CONFIDENCE_FLOORS } from '@lawie/shared';

import logger from '../../config/logger';
import { FactLedgerV3Model } from '../../models/FactLedgerV3.model';
import { S138_COMPUTED_KEYS, S138_INPUT_KEYS } from '../../services/s138-date-checks';
import * as L from '../../services/v3/ledger.service';
import type { LedgerEntry } from '../../services/v3/ledger.types';
import {
  ARREST,
  CHECKLIST,
  cand,
  CUSTODY,
  DESC_CALM,
  freshLedger,
  readAnswer,
  readDescription,
  USER_A,
} from './t682-helpers';

beforeAll(async () => {
  await FactLedgerV3Model.init();
});
afterEach(() => jest.restoreAllMocks());

// U+0929 (precomposed NA with nukta): its NFD form is U+0928 U+093C, so the two spellings differ in code points
const NAME_NFC = 'ऩीरज';
const NAME_NFD = NAME_NFC.normalize('NFD');

describe('condition 2: quotes are checked NFC on both sides; drops are logged by reason only', () => {
  it('the fixture really differs between NFC and NFD', () => {
    expect(NAME_NFC).not.toBe(NAME_NFD);
    expect(NAME_NFC.normalize('NFD')).toBe(NAME_NFD);
  });

  it('a Devanagari quote in NFD form against an NFC description is still held, not span_not_found', async () => {
    const s = await freshLedger();
    const desc = `आवेदक का नाम ${NAME_NFC} है।`.normalize('NFC');
    expect(desc.includes(NAME_NFD)).toBe(false);
    const r = await readDescription(s, desc, [cand('applicant_name', NAME_NFC, NAME_NFD)]);
    expect(r.dropped.span_not_found).toBeUndefined();
    const e = r.s.entries.find((x) => x.key === 'applicant_name')!;
    expect(e.status).toBe('held');
    // the stored quote is the NFC one and is verbatim in the description
    expect(e.origin.quote).toBe(NAME_NFC);
    expect(desc.includes(e.origin.quote)).toBe(true);
  });

  it('and the other way: an NFC quote against an NFD description', async () => {
    const s = await freshLedger();
    const desc = `आवेदक का नाम ${NAME_NFC} है।`.normalize('NFD');
    const r = await readDescription(s, desc, [cand('applicant_name', NAME_NFC, NAME_NFC)]);
    expect(r.dropped.span_not_found).toBeUndefined();
    expect(r.s.entries.find((x) => x.key === 'applicant_name')?.status).toBe('held');
  });

  it('a quote that is not there at all is still dropped in any normalisation', async () => {
    const s = await freshLedger();
    const r = await readDescription(s, 'आवेदक का नाम राम है।', [
      cand('applicant_name', NAME_NFC, NAME_NFD),
    ]);
    expect(r.dropped.span_not_found).toBe(1);
  });

  it('the log line carries reason codes and counts only: no value, quote or turn text', async () => {
    const info = jest.spyOn(logger, 'info').mockImplementation(() => logger);
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    const err = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    const s = await freshLedger();
    const desc = `Test Applicant Zorblax ${NAME_NFC} arrested on 10.10.2026 near Fictional Chowk.`;
    await readDescription(s, desc, [
      cand('applicant_name', NAME_NFC, NAME_NFC),
      cand('arrest_date', '2026-10-10', 'a quote Zorblax never said'),
      cand('amount_in_words', 'secret value', NAME_NFC),
      cand('not_a_pack_key', 'zz', 'Fictional Chowk'),
    ]);
    const all = JSON.stringify([...info.mock.calls, ...warn.mock.calls, ...err.mock.calls]);
    for (const secret of [
      'Zorblax',
      NAME_NFC,
      'Fictional Chowk',
      '10.10.2026',
      'secret value',
      'never said',
    ]) {
      expect(all.includes(secret)).toBe(false);
    }
    const line = info.mock.calls.find((c) => String(c[1]).includes('candidates read'))!;
    const fields = line[0] as { dropped: Record<string, number> };
    expect(fields.dropped).toEqual({ span_not_found: 1, derived_key: 1, not_on_list: 1 });
    expect(Object.values(fields.dropped).every((n) => Number.isInteger(n))).toBe(true);
  });
});

describe('condition 3: the legal lists are imported from v2, never copied', () => {
  const dir = join(__dirname, '..', '..', 'services');
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const code = {
    'v3/ledger.service.ts': strip(readFileSync(join(dir, 'v3', 'ledger.service.ts'), 'utf8')),
    'v3/from-v2.ts': strip(readFileSync(join(dir, 'v3', 'from-v2.ts'), 'utf8')),
  };

  it('confidenceFloor is the v2 table, value for value', () => {
    for (const type of Object.keys(CONFIDENCE_FLOORS) as Array<keyof typeof CONFIDENCE_FLOORS>) {
      expect(L.confidenceFloor(type)).toBe(CONFIDENCE_FLOORS[type]);
    }
  });

  it.each(Object.entries(code))(
    '%s imports from the v2 modules and defines no word list',
    (_f, src) => {
      // the closed lists and keys live in these v2 modules; the v3 files only import them
      expect(
        /NONE_ANSWERS\s*=|NOT_KNOWN_ANSWERS\s*=|NONE_IS_EMPTY_KEYS\s*=|CONFIDENCE_FLOORS\s*=/.test(
          src,
        ),
      ).toBe(false);
      expect(/CUSTODY_SINCE_BACK_REFERENCES\s*=|NONE_ANSWERS_DEVANAGARI/.test(src)).toBe(false);
      // no copied words from the signed lists
      const words = [
        'not known',
        'not given',
        'koi nahi',
        'kuch nahi',
        'nahi',
        'नहीं',
        'कोई नहीं',
        'आत्मसमर्पण',
        'रिमांड',
        'surrender',
        'remand',
        're-arrest',
        // the T-665b back-reference words
        'since then',
        'since that date',
        'since the arrest',
        'usi din se',
        'तब से',
      ];
      const lower = src.toLowerCase();
      for (const w of words) {
        expect(`${w} :: ${lower.includes(w.toLowerCase())}`).toBe(`${w} :: false`);
      }
      // no date-meanings table is read here either
      expect(/date-meanings|dateMeaning/.test(src)).toBe(false);
    },
  );

  it('the service reaches the v2 rules through their v2 modules', () => {
    const src = code['v3/ledger.service.ts'];
    expect(src).toMatch(/from '\.\.\/custody-since-derivation'/);
    expect(src).toMatch(/from '\.\.\/fact-ledger\.service'/);
    expect(src).toMatch(/from '\.\.\/intake-brief'/);
    expect(src).toMatch(/CONFIDENCE_FLOORS[\s\S]*from '@lawie\/shared'/);
  });

  it("a non-answer is judged by v2's own list: a word from it is a NonAnswer here, a near word is not", async () => {
    const s = await freshLedger();
    const a = await L.applyUserEdit(
      s.ledgerId,
      USER_A,
      s.version,
      { key: 'antecedents', text: 'NOT GIVEN', fromQuestion: true },
      CHECKLIST,
    );
    expect(a.s.nonAnswers.map((n) => n.key)).toEqual(['antecedents']);
    const b = await L.applyUserEdit(
      a.s.ledgerId,
      USER_A,
      a.s.version,
      { key: 'applicant_occupation', text: 'Not known to the police', fromQuestion: true },
      CHECKLIST,
    );
    expect(b.s.nonAnswers.map((n) => n.key)).toEqual(['antecedents']);
    expect(b.s.entries.some((e) => e.key === 'applicant_occupation')).toBe(true);
  });

  it('a "none" is a non-answer only on the keys v2 lists (NONE_IS_EMPTY_KEYS)', async () => {
    const s = await freshLedger();
    const a = await L.applyUserEdit(
      s.ledgerId,
      USER_A,
      s.version,
      { key: 'medical_condition', text: 'None', fromQuestion: true },
      CHECKLIST,
    );
    expect(a.s.nonAnswers).toEqual([
      expect.objectContaining({ key: 'medical_condition', kind: 'none' }),
    ]);
    const b = await L.applyUserEdit(
      a.s.ledgerId,
      USER_A,
      a.s.version,
      { key: 'applicant_occupation', text: 'None', fromQuestion: true },
      CHECKLIST,
    );
    expect(b.s.nonAnswers.map((n) => n.key)).toEqual(['medical_condition']);
  });

  it("an unresolved custody_since entry is read as another custody date by v2's rule, through the v3 read", async () => {
    // (T-665b's back-reference list is not on this branch yet: when it merges, "since then" will derive
    // through the same imported function and this ledger needs no change.)
    const text = `${DESC_CALM} In custody since that time.`;
    const s = await freshLedger();
    const q = await readDescription(s, text, [
      ARREST(),
      CUSTODY(),
      cand('custody_since', 'since that time', 'since that time'),
    ]);
    const open = (await L.openLedger(s.ledgerId, USER_A, { described: text }))!;
    expect(q.s.entries.some((e) => e.key === 'custody_since')).toBe(true);
    expect(
      open.entries.some((e) => e.origin.source === 'derived' && e.key === 'custody_since'),
    ).toBe(false);
  });
});

describe('merge rules for one turn', () => {
  it('a description reading never replaces an asked value', async () => {
    const s = await freshLedger();
    const a = await L.applyUserEdit(
      s.ledgerId,
      USER_A,
      s.version,
      { key: 'arrest_date', text: '12.10.2026', fromQuestion: true },
      CHECKLIST,
    );
    const r = await readDescription(a.s, DESC_CALM, [ARREST()]);
    expect(r.s.version).toBe(a.s.version);
    const e = r.s.entries.filter((x) => x.key === 'arrest_date');
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ value: '2026-10-12' });
    expect(e[0].origin.source).toBe('asked');
  });

  it('a description reading never replaces an asked non-answer', async () => {
    const s = await freshLedger();
    const a = await L.applyUserEdit(
      s.ledgerId,
      USER_A,
      s.version,
      { key: 'antecedents', text: 'Not known', fromQuestion: true },
      CHECKLIST,
    );
    const r = await readDescription(a.s, 'No criminal antecedents are known: none.', [
      cand('antecedents', 'None', 'none'),
    ]);
    expect(r.s.nonAnswers.map((n) => n.key)).toEqual(['antecedents']);
    expect(r.s.entries.some((e) => e.key === 'antecedents')).toBe(false);
  });

  it('the same reading again changes nothing', async () => {
    const s = await freshLedger();
    const r1 = await readDescription(s, DESC_CALM, [ARREST()]);
    const r2 = await readDescription(r1.s, DESC_CALM, [ARREST()]);
    expect(r2.s.version).toBe(r1.s.version);
  });

  it('an answer replaces a reading, as a new version with reason answer', async () => {
    const s = await freshLedger();
    const r1 = await readDescription(s, DESC_CALM, [ARREST()]);
    const a = await readAnswer(r1.s, 'The arrest was on 12.10.2026', [
      cand('arrest_date', '2026-10-12', '12.10.2026', { kind: 'answer', turn: 1 }),
    ]);
    expect(a.s.version).toBe(3);
    const doc = (await FactLedgerV3Model.findById(s.ledgerId).lean())!;
    expect(doc.versions[2].reason).toBe('answer');
    expect(doc.versions[2].changedKeys).toEqual(['arrest_date']);
  });

  it('a list is replaced by a later list, not turned into a conflict', async () => {
    const s = await freshLedger();
    const t1 = 'Sections BNS 318(4) and BNS 316(2) are charged.';
    const r1 = await readDescription(s, t1, [
      cand('sections_charged', ['BNS 318(4)', 'BNS 316(2)'], 'BNS 318(4) and BNS 316(2)'),
    ]);
    expect(
      r1.s.entries
        .filter((e) => e.key === 'sections_charged')
        .map((e) => [e.status, e.index, e.display]),
    ).toEqual([
      ['held', 0, 'BNS 318(4)'],
      ['held', 1, 'BNS 316(2)'],
    ]);
    const t2 = 'The sections are BNS 61(2) only.';
    const r2 = await readDescription(r1.s, t2, [
      cand('sections_charged', ['BNS 61(2)'], 'BNS 61(2)'),
    ]);
    const sc = r2.s.entries.filter((e) => e.key === 'sections_charged');
    expect(sc.map((e) => e.status)).toEqual(['held']);
    expect(sc.map((e) => e.display)).toEqual(['BNS 61(2)']);
  });

  it('two values for one single-value key in one turn are a conflict, with both quotes', async () => {
    const s = await freshLedger();
    const text = 'FIR 12/2026 was registered, or maybe FIR 13/2026.';
    const r = await readDescription(s, text, [
      cand('fir_number', '12/2026', 'FIR 12/2026'),
      cand('fir_number', '13/2026', 'FIR 13/2026'),
    ]);
    const e = r.s.entries.filter((x) => x.key === 'fir_number');
    expect(e.map((x) => x.status)).toEqual(['conflict']);
    expect(e[0].candidates!.map((c) => c.source.quote).sort()).toEqual([
      'FIR 12/2026',
      'FIR 13/2026',
    ]);
  });

  it('a conflict is not re-opened or replaced by a later description reading; only an answer closes it', async () => {
    const s = await freshLedger();
    const text = 'FIR 12/2026 was registered, or maybe FIR 13/2026.';
    const r = await readDescription(s, text, [
      cand('fir_number', '12/2026', 'FIR 12/2026'),
      cand('fir_number', '13/2026', 'FIR 13/2026'),
    ]);
    const again = await readDescription(r.s, 'FIR 14/2026 it is.', [
      cand('fir_number', '14/2026', 'FIR 14/2026'),
    ]);
    expect(again.s.entries.filter((x) => x.key === 'fir_number').map((x) => x.status)).toEqual([
      'conflict',
    ]);
    const closed = await readAnswer(again.s, 'It is 14/2026', [
      cand('fir_number', '14/2026', '14/2026', { kind: 'answer', turn: 2 }),
    ]);
    const held = closed.s.entries.filter((x) => x.key === 'fir_number');
    expect(held.map((x) => [x.status, x.origin.source])).toEqual([['held', 'asked']]);
    expect(held[0].origin.quote).toBe('14/2026');
  });

  it('a candidate for a key not on the pack list is dropped (not_on_list)', async () => {
    const s = await freshLedger();
    const r = await readDescription(s, DESC_CALM, [cand('not_a_key', 'x', 'arrested')]);
    expect(r.dropped.not_on_list).toBe(1);
    expect(r.s.entries).toEqual([]);
  });
});

describe('quote length', () => {
  it('a quote over 200 characters is dropped (no_span), whatever the field', async () => {
    const s = await freshLedger();
    const long = 'FIR 12/2026 ' + 'y'.repeat(260);
    const r = await readDescription(s, long, [cand('fir_number', '12/2026', long)]);
    expect(r.dropped.no_span).toBe(1);
    expect(r.s.entries).toEqual([]);
  });

  it('exactly 200 characters is kept', async () => {
    const s = await freshLedger();
    const quote = 'FIR 12/2026' + ' '.repeat(0) + 'z'.repeat(189);
    expect(quote).toHaveLength(200);
    const r = await readDescription(s, quote, [
      cand('police_station', 'Civil Lines', quote.slice(0, 11)),
    ]);
    expect(r.dropped.no_span).toBeUndefined();
  });

  it('a narrative item is exempt: its own words are its value', async () => {
    const s = await freshLedger();
    const narrative = 'The applicant, a shopkeeper, is accused of a dispute over rent. '
      .repeat(6)
      .trim();
    expect(narrative.length).toBeGreaterThan(300);
    const r = await readDescription(s, narrative, [cand('facts_narrative', narrative, narrative)]);
    expect(r.dropped.no_span).toBeUndefined();
    const e = r.s.entries.find((x) => x.key === 'facts_narrative')!;
    expect(e.status).toBe('held');
    expect(e.origin.quote.length).toBeGreaterThan(200);
  });
});

describe('previous_display, the views and the verifier set', () => {
  it('an edit of a held value shows the earlier display (v2 previous_display)', async () => {
    const s = await freshLedger();
    const r1 = await readDescription(s, DESC_CALM, [ARREST()]);
    const e = await L.applyUserEdit(
      r1.s.ledgerId,
      USER_A,
      r1.s.version,
      { key: 'arrest_date', text: '12.10.2026' },
      CHECKLIST,
    );
    const open = (await L.openLedger(s.ledgerId, USER_A))!;
    expect(open.previousDisplays).toEqual({ arrest_date: '10 October 2026' });
    const view = L.viewForBrief(open, CHECKLIST);
    expect(view.facts.find((f) => f.key === 'arrest_date')).toMatchObject({
      display: '12 October 2026',
      previous_display: '10 October 2026',
    });
    expect(e.result.status).toBe('saved');
  });

  it('a first reading has no previous_display', async () => {
    const s = await freshLedger();
    await readDescription(s, DESC_CALM, [ARREST()]);
    const view = L.viewForBrief((await L.openLedger(s.ledgerId, USER_A))!, CHECKLIST);
    expect(view.facts.find((f) => f.key === 'arrest_date')).not.toHaveProperty('previous_display');
  });

  it('viewForBrief is the v2 LedgerView: stored facts without derived ones, unresolved, conflicts, field types', async () => {
    const s = await freshLedger();
    const r = await readDescription(s, `${DESC_CALM} FIR 12/2026 or FIR 13/2026.`, [
      ARREST(),
      CUSTODY(),
      cand('fir_number', '12/2026', 'FIR 12/2026'),
      cand('fir_number', '13/2026', 'FIR 13/2026'),
    ]);
    const open = (await L.openLedger(s.ledgerId, USER_A, { described: DESC_CALM }))!;
    const view = L.viewForBrief(open, CHECKLIST);
    expect(view.ledger_id).toBe(r.s.ledgerId);
    expect(view.document_kind).toBe('bail_regular');
    expect(view.facts.map((f) => f.key)).toEqual(['arrest_date', 'currently_in_custody']);
    expect(view.facts.some((f) => f.source === 'computed')).toBe(false);
    expect(view.unresolved.map((u) => [u.key, u.reason])).toEqual([
      ['fir_number', 'conflicting_values'],
    ]);
    expect(view.conflicts).toEqual(['fir_number']);
    expect(view.fields.arrest_date).toBe('date');
  });

  it('factsForVerifier is the same held set as generation, derived included', async () => {
    const s = await freshLedger();
    await readDescription(s, DESC_CALM, [ARREST(), CUSTODY()]);
    const open = (await L.openLedger(s.ledgerId, USER_A, { described: DESC_CALM }))!;
    expect(JSON.stringify(L.factsForVerifier(open))).toBe(
      JSON.stringify(L.factsForGeneration(open).facts),
    );
    expect(L.factsForVerifier(open).map((f) => f.key)).toEqual(
      expect.arrayContaining(['arrest_date', 'currently_in_custody', 'custody_since']),
    );
  });

  it('heldByKey groups the held entries, derived included', async () => {
    const s = await freshLedger();
    await readDescription(s, DESC_CALM, [ARREST(), CUSTODY()]);
    const open = (await L.openLedger(s.ledgerId, USER_A, { described: DESC_CALM }))!;
    expect([...L.heldByKey(open).keys()].sort()).toEqual(
      ['arrest_date', 'currently_in_custody', 'custody_since', 'custody_since_derived'].sort(),
    );
  });

  it('derive is pure: the same snapshot gives the same entries, and it adds none to the input', async () => {
    const s = await freshLedger();
    const r = await readDescription(s, DESC_CALM, [ARREST(), CUSTODY()]);
    const before = JSON.stringify(r.s.entries);
    const a = L.derive(r.s, CHECKLIST, { described: DESC_CALM });
    const b = L.derive(r.s, CHECKLIST, { described: DESC_CALM });
    expect(JSON.stringify(a.map((e) => [e.key, e.value]))).toBe(
      JSON.stringify(b.map((e) => [e.key, e.value])),
    );
    expect(JSON.stringify(r.s.entries)).toBe(before);
  });
});

describe('derive() does not add the s.138 computed keys (deferred to T-685 / T-680)', () => {
  it('with every s.138 input held, no computed s.138 key is derived; generation applies them on top', () => {
    const iso = [
      '2026-01-10',
      '2026-02-10',
      '2026-03-10',
      '2026-04-10',
      '2026-05-10',
      '2026-06-10',
    ];
    const inputs = Object.values(S138_INPUT_KEYS);
    const entries: LedgerEntry[] = inputs.map((key, i) => ({
      id: `e-${key}`,
      key,
      label: key,
      type: 'date',
      status: 'held',
      value: iso[i % iso.length],
      display: iso[i % iso.length],
      origin: { source: 'user', quote: iso[i % iso.length], confidence: 0.99 },
      requiredInDraft: false,
    }));
    const derived = L.derive({ packId: 'legal_notice_s138', entries }, [], {});
    const computedKeys = new Set<string>(Object.values(S138_COMPUTED_KEYS));
    expect(derived.filter((e) => computedKeys.has(e.key))).toEqual([]);
    expect(inputs.length).toBeGreaterThan(0);
  });
});

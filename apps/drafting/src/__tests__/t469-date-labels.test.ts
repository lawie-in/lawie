/**
 * T-469: a date after a neutral label is read (LEGAL CONTENT rulings: Ajay
 * 604af4bd and b37ed330). packages/shared has no test runner, so normalizeDate
 * is tested from here, as t363-normalize-date.test.ts does.
 *
 * Every row of section 2 of the before/after table ("Rule cases") is a case
 * below. The clock is fixed: today is 2026-10-16 (India), reference year 2026.
 *
 * AC1 a label naming this field (remand, FIR, arrest, ...) is read
 * AC2 fillers only (on, dated, of, the) are read only when exactly one date is asked
 * AC3 "order" is read only when the pack has exactly one order-date field
 * AC4 cheque / presented / deposited / memo + received map to their one field
 * AC5 a past-event field with a date after today is blank; exempt fields are not
 * AC6 qualifiers, filed/first/pehli, since, two labels, another field's label: blank
 * AC7 no options / no fieldKey: the reading is as before
 * AC8 normalizeForItem and readExtraction pass the context through
 */
import { normalizeDate } from '@lawie/shared';

import { normalizeForItem, readExtraction } from '../services/fact-ledger.service';
import type { ChecklistItem } from '../services/intake-brief';

const TODAY = '2026-10-16';
const REF = 2026;

type Ctx = readonly string[] | undefined;
const two = (f: string): string[] => [f, 'other_date'];
const one = (f: string): string[] => [f];

function read(span: string, field: string, asked: Ctx, pack: Ctx) {
  return normalizeDate(span, {
    referenceYear: REF,
    fieldKey: field,
    askedDateFields: asked,
    packDateFields: pack,
    today: TODAY,
  });
}

// [span, field, asked, pack, expected ISO date or the reason it stays blank]
type Row = [string, string, Ctx, Ctx, string];
const U = 'unrecognised';

describe('T-469 reads: a label naming this field (AC1)', () => {
  const rows: Row[] = [
    ['remand 4 June 2026', 'remand_date', two('remand_date'), two('remand_date'), '2026-06-04'],
    ['FIR dated 12.03.2026', 'fir_date', two('fir_date'), two('fir_date'), '2026-03-12'],
    ['arrested on 13/9/26', 'arrest_date', two('arrest_date'), two('arrest_date'), '2026-09-13'],
    [
      'next 4 June 2026',
      'next_hearing_date',
      two('next_hearing_date'),
      two('next_hearing_date'),
      '2026-06-04',
    ],
    [
      'next hearing on 4 June 2026',
      'next_hearing_date',
      two('next_hearing_date'),
      two('next_hearing_date'),
      '2026-06-04',
    ],
    [
      'cheque dated 1 Sept 2026',
      'cheque_date',
      two('cheque_date'),
      two('cheque_date'),
      '2026-09-01',
    ],
  ];
  it.each(rows)('%p for %s', (span, field, asked, pack, expected) => {
    expect(read(span, field, asked, pack)).toMatchObject({ ok: true, value: expected });
  });

  it('a plain date is unchanged', () => {
    expect(
      read('13 Sept 2026', 'custody_since', two('custody_since'), two('custody_since')),
    ).toMatchObject({
      ok: true,
      value: '2026-09-13',
    });
  });

  it('a two-digit year in the past is read', () => {
    expect(read('13/9/26', 'arrest_date', two('arrest_date'), two('arrest_date'))).toMatchObject({
      ok: true,
      value: '2026-09-13',
    });
  });
});

describe('T-469 stays blank: the label names another field (AC1)', () => {
  const rows: Row[] = [
    ['remand 4 June 2026', 'fir_date', two('fir_date'), two('fir_date'), U],
    ['FIR dated 12.03.2026', 'remand_date', two('remand_date'), two('remand_date'), U],
    [
      'cheque dated 1 Sept 2026',
      'presentation_date',
      two('presentation_date'),
      two('presentation_date'),
      U,
    ],
    ['next 4 June 2026', 'arrest_date', one('arrest_date'), one('arrest_date'), U],
  ];
  it.each(rows)('%p for %s', (span, field, asked, pack, reason) => {
    expect(read(span, field, asked, pack)).toMatchObject({ ok: false, reason });
  });
});

describe('T-469 fillers only: read only when exactly one date is asked (AC2)', () => {
  it.each([
    ['on 4th June, 2026', 'arrest_date', '2026-06-04'],
    ['Dated: 12.03.2026', 'cheque_date', '2026-03-12'],
    ['on the fifteenth of September 2026', 'arrest_date', '2026-09-15'],
    ['on 15 Sept 2026', 'memo_received_date', '2026-09-15'],
  ])('%p for %s, one date asked', (span, field, expected) => {
    expect(read(span, field, one(field), one(field))).toMatchObject({ ok: true, value: expected });
  });

  it.each([
    ['on 4th June, 2026', 'arrest_date'],
    ['Dated: 12.03.2026', 'cheque_date'],
  ])('%p for %s, two dates asked: blank', (span, field) => {
    expect(read(span, field, two(field), two(field))).toMatchObject({ ok: false, reason: U });
  });

  it('the set the caller knows is not given: blank (an edit)', () => {
    expect(read('on 4th June, 2026', 'arrest_date', undefined, undefined)).toMatchObject({
      ok: false,
      reason: U,
    });
  });

  it('"dated June 2026" with one date asked stays blank, as before', () => {
    expect(read('dated June 2026', 'fir_date', one('fir_date'), one('fir_date'))).toMatchObject({
      ok: false,
      reason: U,
    });
  });

  it('"June 2026" alone is blank (T-496: a date with no day is never exact)', () => {
    expect(read('June 2026', 'fir_date', two('fir_date'), two('fir_date'))).toMatchObject({
      ok: false,
      reason: U,
    });
  });

  it.each([['w.e.f. 1 July 2026'], ['wef 1/7/2026']])(
    '%p is not a filler: blank even with one date asked',
    (span) => {
      expect(
        read(span, 'lease_start_date', one('lease_start_date'), one('lease_start_date')),
      ).toMatchObject({
        ok: false,
        reason: U,
      });
    },
  );
});

describe('T-469 "order": only the pack\'s single order-date field (AC3)', () => {
  const span = 'order dated 4 June 2026';
  it('one order field on the pack: read', () => {
    expect(
      read(
        span,
        'impugned_order_date',
        ['impugned_order_date', 'x_date'],
        ['impugned_order_date', 'judgment_date'],
      ),
    ).toMatchObject({ ok: true, value: '2026-06-04' });
  });
  it('two order fields on the pack: blank', () => {
    expect(
      read(span, 'impugned_order_date', one('impugned_order_date'), [
        'impugned_order_date',
        'original_order_date',
      ]),
    ).toMatchObject({ ok: false, reason: U });
  });
  it('pack not known: blank', () => {
    expect(read(span, 'impugned_order_date', undefined, undefined)).toMatchObject({
      ok: false,
      reason: U,
    });
  });
  it('never judgment_date', () => {
    expect(read(span, 'judgment_date', one('judgment_date'), one('judgment_date'))).toMatchObject({
      ok: false,
      reason: U,
    });
  });
});

describe('T-469 s.138 labels (AC4)', () => {
  const p = 'presentation_date';
  const m = 'memo_received_date';
  it.each([
    ['presented on 15 Sept 2026', p, '2026-09-15'],
    ['deposited on 15 Sept 2026', p, '2026-09-15'],
    ['return memo received on 15 Sept 2026', m, '2026-09-15'],
    ['memo received 15 Sept 2026', m, '2026-09-15'],
    ['dishonour memo received on 15 Sept 2026', m, '2026-09-15'],
  ])('%p reads for %s', (span, field, expected) => {
    expect(read(span, field, two(field), two(field))).toMatchObject({ ok: true, value: expected });
  });

  it.each([
    ['received on 15 Sept 2026', m],
    ['received on 15 Sept 2026', 'legal_notice_date'],
    ['memo 15 Sept 2026', m],
    ['dishonour memo received on 15 Sept 2026', 'dishonour_date'],
    ['return memo received on 15 Sept 2026', p],
    ['memo was received on 15 Sept 2026', m],
  ])('%p stays blank for %s', (span, field) => {
    expect(read(span, field, two(field), two(field))).toMatchObject({ ok: false, reason: U });
  });
});

describe('T-469 future date for a past-event field (AC5)', () => {
  it.each([
    ['20/12/26', 'arrest_date'],
    ['20/12/2026', 'arrest_date'],
    ['FIR dated 20.12.2026', 'fir_date'],
    ['20 December 2026', 'impugned_order_date'],
  ])('%p for %s is blank', (span, field) => {
    expect(read(span, field, two(field), two(field))).toMatchObject({ ok: false, reason: U });
  });

  it.each([
    ['20/12/26', 'next_hearing_date', '2026-12-20'],
    ['20/12/2026', 'next_hearing_date', '2026-12-20'],
    ['20/12/2026', 'lease_end_date', '2026-12-20'],
    ['20/12/2026', 'promised_possession_date', '2026-12-20'],
    ['thirtieth October 2026', 'notice_sent_date', '2026-10-30'],
    ['20/12/2026', 'filing_date', '2026-12-20'],
  ])('%p for %s is read (exempt or not on the list)', (span, field, expected) => {
    expect(read(span, field, two(field), two(field))).toMatchObject({ ok: true, value: expected });
  });

  it('no fieldKey and no today: unchanged', () => {
    expect(normalizeDate('20/12/2026', { referenceYear: REF })).toMatchObject({
      ok: true,
      value: '2026-12-20',
    });
  });

  it('a fieldKey without today: unchanged', () => {
    expect(
      normalizeDate('20/12/2026', { referenceYear: REF, fieldKey: 'arrest_date' }),
    ).toMatchObject({ ok: true, value: '2026-12-20' });
  });

  it('today itself is not after today', () => {
    expect(read('16/10/2026', 'arrest_date', two('arrest_date'), two('arrest_date'))).toMatchObject(
      {
        ok: true,
        value: '2026-10-16',
      },
    );
  });
});

describe('T-469 stays blank: qualifiers and words not on the list (AC6)', () => {
  it.each([
    ['before 4 June 2026', 'arrest_date'],
    ['after 4 June 2026', 'arrest_date'],
    ['by 4 June 2026', 'arrest_date'],
    ['not later than 4 June 2026', 'legal_notice_date'],
    ['around 4 June 2026', 'arrest_date'],
    ['till 4 June 2026', 'custody_since'],
    ['on or about 4 June 2026', 'incident_date'],
    ['since 4 June 2026', 'custody_since'],
    ['in custody since 13 Sept 2026', 'custody_since'],
    ['filed 4 June 2026', 'impugned_order_date'],
    ['filed on 4 June 2026', 'filing_date'],
    ['first 4 June 2026', 'remand_date'],
    ['pehli 4 June 2026', 'remand_date'],
    ['FIR remand 4 June 2026', 'remand_date'],
    ['remand on remand 4 June 2026', 'remand_date'],
    ['dated 4 June 2026 ke baad', 'arrest_date'],
  ])('%p for %s', (span, field) => {
    expect(read(span, field, one(field), one(field))).toMatchObject({ ok: false, reason: U });
  });

  it.each([
    'before',
    'after',
    'by',
    'till',
    'until',
    'upto',
    'up',
    'around',
    'about',
    'approx',
    'approximately',
    'circa',
    'nearly',
    'roughly',
    'within',
    'later',
    'earlier',
    'than',
    'prior',
    'from',
    'between',
    'latest',
    'earliest',
  ])('qualifier "%s" before a date with the field word is blank', (q) => {
    expect(
      read(`remand ${q} 4 June 2026`, 'remand_date', two('remand_date'), two('remand_date')),
    ).toMatchObject({
      ok: false,
    });
  });

  it('a label with no year is blank with missing_year', () => {
    expect(
      read('remand 4 June', 'remand_date', two('remand_date'), two('remand_date')),
    ).toMatchObject({
      ok: false,
      reason: 'missing_year',
    });
  });
});

describe('T-469 without options the reading is as before (AC7)', () => {
  it.each([
    ['13 Sept 2026', '2026-09-13'],
    ['20/12/2026', '2026-12-20'],
    ['fifteenth September 2026', '2026-09-15'],
    ['12.03.2026', '2026-03-12'],
  ])('a whole-span date %p', (span, expected) => {
    expect(normalizeDate(span, { referenceYear: REF })).toMatchObject({
      ok: true,
      value: expected,
    });
    expect(normalizeDate(span)).toMatchObject({ ok: expect.any(Boolean) });
  });

  it.each(['remand 4 June 2026', 'FIR dated 12.03.2026', 'on 4th June, 2026'])(
    'a labelled span %p with no fieldKey is not read',
    (span) => {
      expect(normalizeDate(span, { referenceYear: REF, today: TODAY })).toMatchObject({
        ok: false,
        reason: U,
      });
    },
  );
});

// ── normalizeForItem and readExtraction ─────────────────────────────────────

const dateItem = (key: string): ChecklistItem => ({
  key,
  label: key,
  part: 'facts' as ChecklistItem['part'],
  kind: 'date',
  required: false,
  options: [],
  modelReadable: true,
  partyName: false,
  dateKind: null,
});

describe('T-469 normalizeForItem and readExtraction pass the context (AC8)', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-16T06:00:00Z'));
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('reads "remand 4 June 2026" for remand_date', () => {
    expect(
      normalizeForItem(dateItem('remand_date'), 'remand 4 June 2026', REF, {
        asked: two('remand_date'),
        pack: two('remand_date'),
      }),
    ).toMatchObject({ ok: true, value: '2026-06-04' });
  });

  it('fillers only: read with one asked date, blank with two, blank with no context', () => {
    const it_ = dateItem('arrest_date');
    const s = 'on 4th June, 2026';
    expect(normalizeForItem(it_, s, REF, { asked: one('arrest_date') })).toMatchObject({
      ok: true,
      value: '2026-06-04',
    });
    expect(normalizeForItem(it_, s, REF, { asked: two('arrest_date') })).toMatchObject({
      ok: false,
    });
    expect(normalizeForItem(it_, s, REF)).toMatchObject({ ok: false });
  });

  it('the clock is today in India: a future FIR date is blank, a next hearing is read', () => {
    expect(normalizeForItem(dateItem('fir_date'), '20/12/2026', REF)).toMatchObject({ ok: false });
    expect(normalizeForItem(dateItem('fir_date'), '16/10/2026', REF)).toMatchObject({ ok: true });
    expect(normalizeForItem(dateItem('next_hearing_date'), '20/12/2026', REF)).toMatchObject({
      ok: true,
      value: '2026-12-20',
    });
  });

  it('India day: 18:45 UTC on 16 Oct is already 17 Oct, so 17/10/2026 is not in the future', () => {
    jest.setSystemTime(new Date('2026-10-16T18:45:00Z'));
    try {
      expect(normalizeForItem(dateItem('arrest_date'), '17/10/2026', REF)).toMatchObject({
        ok: true,
        value: '2026-10-17',
      });
    } finally {
      jest.setSystemTime(new Date('2026-10-16T06:00:00Z'));
    }
  });

  describe('readExtraction', () => {
    const checklist = [
      dateItem('cheque_date'),
      dateItem('memo_received_date'),
      dateItem('presentation_date'),
    ];
    const run = (text: string, facts: Array<{ key: string; span: string }>) =>
      readExtraction(
        checklist,
        text,
        { facts: facts.map((f) => ({ ...f, confidence: 0.95 })) },
        REF,
      );

    it('reads a labelled date with the field word', () => {
      const text = 'The memo was handed over: return memo received on 15 Sept 2026.';
      const r = run(text, [
        { key: 'memo_received_date', span: 'return memo received on 15 Sept 2026' },
      ]);
      expect(r.facts.map((f) => [f.key, f.value])).toEqual([['memo_received_date', '2026-09-15']]);
    });

    it('a filler-only span is read when it is the only date in the extraction', () => {
      const text = 'The cheque was presented on 15 Sept 2026.';
      const r = readExtraction(
        [dateItem('presentation_date')],
        text,
        { facts: [{ key: 'presentation_date', span: 'on 15 Sept 2026', confidence: 0.95 }] },
        REF,
      );
      expect(r.facts.map((f) => [f.key, f.value])).toEqual([['presentation_date', '2026-09-15']]);
    });

    it('a filler-only span is not read when two dates are asked', () => {
      const text = 'The cheque was presented on 15 Sept 2026.';
      const r = readExtraction(
        [dateItem('presentation_date'), dateItem('cheque_date')],
        text,
        { facts: [{ key: 'presentation_date', span: 'on 15 Sept 2026', confidence: 0.95 }] },
        REF,
      );
      expect(r.facts).toEqual([]);
      expect(r.unresolved.map((u) => u.key)).toContain('presentation_date');
    });
  });
});

describe('T-469 round 4: "hearing" alone is not "next hearing"', () => {
  it.each(['hearing on 4 June 2026', 'hearing 4 June 2026'])(
    '%p is blank for next_hearing_date',
    (span) => {
      expect(
        read(span, 'next_hearing_date', two('next_hearing_date'), two('next_hearing_date')),
      ).toMatchObject({ ok: false, reason: U });
    },
  );

  it.each(['next 4 June 2026', 'next hearing on 4 June 2026', 'next date 4 June 2026'])(
    '%p still reads for next_hearing_date',
    (span) => {
      expect(
        read(span, 'next_hearing_date', two('next_hearing_date'), two('next_hearing_date')),
      ).toMatchObject({ ok: true, value: '2026-06-04' });
    },
  );
});

describe('T-469 round 4: the caller passes the clock (no fake timers)', () => {
  const NOW = new Date('2026-03-10T06:00:00Z'); // 10 March 2026 in India
  const ctx = { now: NOW };

  it('normalizeForItem: a past-event date a day after now is blank, a day before reads', () => {
    const arrest = dateItem('arrest_date');
    expect(normalizeForItem(arrest, '11/03/2026', REF, ctx)).toMatchObject({ ok: false });
    expect(normalizeForItem(arrest, '09/03/2026', REF, ctx)).toMatchObject({
      ok: true,
      value: '2026-03-09',
    });
    expect(normalizeForItem(arrest, '10/03/2026', REF, ctx)).toMatchObject({ ok: true });
  });

  it('normalizeForItem: now is read as India time', () => {
    const late = { now: new Date('2026-03-10T19:00:00Z') }; // already 11 March in India
    expect(normalizeForItem(dateItem('arrest_date'), '11/03/2026', REF, late)).toMatchObject({
      ok: true,
      value: '2026-03-11',
    });
  });

  it('normalizeForItem: an exempt field after now is read', () => {
    expect(normalizeForItem(dateItem('next_hearing_date'), '11/03/2026', REF, ctx)).toMatchObject({
      ok: true,
      value: '2026-03-11',
    });
  });

  it('readExtraction: now is passed through', () => {
    const items = [dateItem('arrest_date')];
    const run = (text: string, span: string) =>
      readExtraction(
        items,
        text,
        { facts: [{ key: 'arrest_date', span, confidence: 0.95 }] },
        REF,
        NOW,
      );
    expect(run('He was arrested on 11/03/2026.', '11/03/2026').facts).toEqual([]);
    expect(
      run('He was arrested on 09/03/2026.', '09/03/2026').facts.map((f) => [f.key, f.value]),
    ).toEqual([['arrest_date', '2026-03-09']]);
  });
});

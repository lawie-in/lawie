/**
 * T-453 round 2 — the golden harness's date-confidence table: bucket
 * boundaries, rows judged against the fixture, the histogram counts, the
 * rendered shape. Pure: no model, no database.
 */
import {
  DATE_CONFIDENCE_BUCKETS,
  dateConfidenceBucket,
  dateConfidenceHistogram,
  dateConfidenceRows,
  DateConfidenceRow,
  renderDateConfidence,
} from '../lib/calibrate';
import { ExtractionRead, Fixture } from '../lib/types';

const ISO: Record<string, string> = {
  '4 June 2026': '2026-06-04',
  '04.06.2026': '2026-06-04',
  '5 June 2026': '2026-06-05',
};
const readDate = (t: string): string | null => ISO[t] ?? null;

const fixture = {
  id: 'fx-1',
  expect: {
    ledger: [
      { key: 'remand_date', display: '4 June 2026', why: 'w' },
      { key: 'order_date', unresolved: true, why: 'w' },
    ],
  },
} as unknown as Fixture;

const read = (key: string, span: string, confidence: number, type = 'date'): ExtractionRead => ({
  key,
  span,
  type,
  confidence,
});

describe('dateConfidenceBucket', () => {
  it.each([
    [0, '<0.80'],
    [0.79, '<0.80'],
    [0.7999, '<0.80'],
    [0.8, '0.80'],
    [0.84, '0.80'],
    [0.85, '0.85'],
    [0.89, '0.85'],
    [0.9, '0.90'],
    [0.94, '0.90'],
    [0.95, '0.95'],
    [0.99, '0.95'],
    [1, '1.00'],
    [1.2, '1.00'],
    [Number.NaN, '<0.80'],
  ])('%p -> %s', (c, b) => {
    expect(dateConfidenceBucket(c)).toBe(b);
  });
});

describe('dateConfidenceRows', () => {
  it('judges right, wrong, unresolved and not-stated keys; skips non-date reads', () => {
    const rows = dateConfidenceRows(
      fixture,
      [
        read('remand_date', '04.06.2026', 0.95), // right
        read('remand_date', '5 June 2026', 0.85), // wrong
        read('remand_date', 'garbage', 0.9), // does not normalise: wrong
        read('order_date', 'garbage', 0.9), // expected unresolved, read unresolved: right
        read('order_date', '5 June 2026', 0.9), // expected unresolved, read a date: wrong
        read('other_date', '4 June 2026', 0.8), // not stated: not judged
        read('amount', '4 June 2026', 0.99, 'amount'), // not a date
      ],
      readDate,
    );
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.correct)).toEqual([true, false, false, true, false, null]);
    expect(rows[0]).toEqual({
      fixtureId: 'fx-1',
      key: 'remand_date',
      read: '2026-06-04',
      expected: '2026-06-04',
      confidence: 0.95,
      correct: true,
    });
    expect(rows[2].read).toBeNull();
    expect(rows[3].expected).toBe('unresolved');
    expect(rows[5].expected).toBeNull();
  });

  it('no ledger expectations: nothing is judged', () => {
    const f = { id: 'f', expect: {} } as unknown as Fixture;
    const rows = dateConfidenceRows(f, [read('k', '4 June 2026', 0.9)], readDate);
    expect(rows.map((r) => r.correct)).toEqual([null]);
  });
});

const row = (confidence: number, correct: boolean | null): DateConfidenceRow => ({
  fixtureId: 'f',
  key: 'k',
  read: '2026-06-04',
  expected: '2026-06-04',
  confidence,
  correct,
});

describe('dateConfidenceHistogram', () => {
  it('one entry per bucket, in order, with right / wrong / unjudged counts', () => {
    const h = dateConfidenceHistogram([
      row(0.5, false),
      row(0.85, true),
      row(0.85, false),
      row(0.85, false),
      row(0.9, true),
      row(0.9, null),
      row(1, true),
      row(0.95, null),
    ]);
    expect(h.map((b) => b.bucket)).toEqual([...DATE_CONFIDENCE_BUCKETS]);
    expect(h).toEqual([
      { bucket: '<0.80', right: 0, wrong: 1, unjudged: 0 },
      { bucket: '0.80', right: 0, wrong: 0, unjudged: 0 },
      { bucket: '0.85', right: 1, wrong: 2, unjudged: 0 },
      { bucket: '0.90', right: 1, wrong: 0, unjudged: 1 },
      { bucket: '0.95', right: 0, wrong: 0, unjudged: 1 },
      { bucket: '1.00', right: 1, wrong: 0, unjudged: 0 },
    ]);
  });
  it('empty rows: all zero', () => {
    const h = dateConfidenceHistogram([]);
    expect(h).toHaveLength(6);
    expect(h.every((b) => b.right + b.wrong + b.unjudged === 0)).toBe(true);
  });
});

describe('renderDateConfidence', () => {
  it('no reads: a header and "no date reads"', () => {
    const t = renderDateConfidence([]).join('\n');
    expect(t).toContain('Date reads by model confidence');
    expect(t).toContain('The 0.9 floor is NOT changed');
    expect(t).toContain('no date reads');
  });
  it('lists every read with its verdict, then the histogram', () => {
    const lines = renderDateConfidence([row(0.85, false), row(0.95, true), row(0.9, null)]);
    const t = lines.join('\n');
    expect(t).toContain('fixture');
    expect(t).toContain('WRONG');
    expect(t).toContain('right');
    expect(t).toMatch(/0\.85 {2}WRONG/);
    expect(t).toMatch(/0\.95 {2}right/);
    expect(t).toMatch(/0\.90 {2}-/);
    expect(t).toContain('histogram (bucket: right / wrong / not judged):');
    expect(t).toMatch(/0\.85 +0 \/ 1 \/ 0/);
    expect(t).toMatch(/0\.95 +1 \/ 0 \/ 0/);
    expect(t).toMatch(/1\.00 +0 \/ 0 \/ 0/);
  });
  it('prints ids, keys and dates only: no span text field', () => {
    const t = renderDateConfidence([
      { ...row(0.9, true), span: 'SECRET SPAN' } as DateConfidenceRow,
    ]).join('\n');
    expect(t).not.toContain('SECRET SPAN');
  });
});

/**
 * T-496 (Ajay 604af4bd, 8f0d980a): a partial date (month and year, year only,
 * "mid-June") gives NO date. normalizeDate never supplies a day.
 */
import { normalizeDate } from '@lawie/shared';

import { normalizeForItem } from '../services/fact-ledger.service';
import type { ChecklistItem } from '../services/intake-brief';

const REF = { referenceYear: 2026 };

const PARTIAL = [
  'June 2026',
  'Jun 2026',
  'JUNE 2026',
  'Sept 2025',
  'March 2010',
  'June 2031',
  'June 1999',
  'June',
  '2026',
  'June, 2026',
  '06/2026',
  '2026-06',
  'mid-June 2026',
  'early July 2026',
  'end of June',
  'first week of June 2026',
];

describe('T-496 AC: a partial date gives no date', () => {
  it.each(PARTIAL)('%j is unresolved, with no value', (input) => {
    const r = normalizeDate(input, REF);
    expect(r.ok).toBe(false);
    expect(r).not.toHaveProperty('value');
  });

  it.each(['March 122026', 'March 1226'])(
    '%j (digits run on after the month) gives no date',
    (input) => {
      const r = normalizeDate(input, REF);
      expect(r.ok).toBe(false);
      expect(r).not.toHaveProperty('value');
    },
  );
});

describe('T-496: full dates read exactly as before', () => {
  it.each([
    ['March 12, 2026', '2026-03-12'],
    ['June 1st, 2026', '2026-06-01'],
    ['June 20 26', '2026-06-20'],
    ['12/3/26', '2026-03-12'],
    ['03/12/2026', '2026-12-03'],
    ['2026-03-12', '2026-03-12'],
    ['4 June 2026', '2026-06-04'],
    ['fourth June 2026', '2026-06-04'],
  ])('%j -> %s', (input, iso) => {
    expect(normalizeDate(input, REF)).toMatchObject({ ok: true, value: iso });
  });
});

describe('T-496: the ledger path', () => {
  const dateItem: ChecklistItem = {
    key: 'incident.date',
    label: 'Date of incident',
    part: 'facts',
    kind: 'date',
    required: true,
    options: [],
    modelReadable: true,
    partyName: false,
    dateKind: null,
  } as unknown as ChecklistItem;

  it('a date item with the span "June 2026" yields no date value, so the draft prints a blank', () => {
    const r = normalizeForItem(dateItem, 'June 2026', 2026);
    expect(r.ok).toBe(false);
    expect(r).not.toHaveProperty('value');
  });

  it('a full date on the same item still reads', () => {
    expect(normalizeForItem(dateItem, '20 June 2026', 2026)).toMatchObject({
      ok: true,
      value: '2026-06-20',
    });
  });
});

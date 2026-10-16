/**
 * T-496 (Ajay 604af4bd, 8f0d980a): a partial date (month and year, year only,
 * "mid-June") gives NO date. normalizeDate never supplies a day.
 */
import './setupEnv';
import './setupDb';
import { normalizeDate } from '@lawie/shared';
import request from 'supertest';

import app from '../app';
import {
  _resetToolSwitches,
  primeToolSwitches,
  TOOL_TIMELINE_SETTING,
} from '../services/feature-switches';
import { getAppSetting } from '../services/app-settings.service';
import { calculateTimeline } from '../services/timeline.service';

jest.mock('../services/app-settings.service', () => {
  const actual = jest.requireActual('../services/app-settings.service');
  return { ...actual, getAppSetting: jest.fn(actual.getAppSetting) };
});

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

describe('T-496 part 2: the timeline reads no partial date', () => {
  const BAD = 'Invalid date format. Use YYYY-MM-DD.';

  // The timeline tool is switched off until its setting reads 'on' (T-375).
  beforeAll(async () => {
    (getAppSetting as unknown as jest.Mock).mockImplementation((key: string) =>
      key === TOOL_TIMELINE_SETTING
        ? Promise.resolve('on')
        : jest.requireActual('../services/app-settings.service').getAppSetting(key),
    );
    _resetToolSwitches();
    await primeToolSwitches();
  });
  afterAll(() => _resetToolSwitches());

  it.each(['June 2026', '2026-06', '2026'])(
    'GET /sections/timeline?arrestDate=%s is a 400 with no timeline',
    async (d) => {
      const res = await request(app)
        .get('/sections/timeline')
        .query({ arrestDate: d, sections: '303' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: BAD });
    },
  );

  it('a full ISO date computes as before', async () => {
    const res = await request(app)
      .get('/sections/timeline')
      .query({ arrestDate: '2026-03-01', sections: '303' });
    expect(res.status).toBe(200);
    const body = res.body.result ?? res.body;
    expect(body.arrestDate).toBe('2026-03-01');
    expect(body.defaultBailDate).toBe('2026-04-30');
  });

  it('"12 March 2026" reads as 2026-03-12', async () => {
    const res = await request(app)
      .get('/sections/timeline')
      .query({ arrestDate: '12 March 2026', sections: '303' });
    expect(res.status).toBe(200);
    expect((res.body.result ?? res.body).arrestDate).toBe('2026-03-12');
  });

  it('a missing arrestDate keeps its own 400', async () => {
    const res = await request(app).get('/sections/timeline').query({ sections: '303' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing "arrestDate" query parameter');
  });

  it('calculateTimeline throws for "June 2026" and for "2026-06"', () => {
    expect(() => calculateTimeline({ arrestDate: 'June 2026', sections: ['303'] })).toThrow(
      'Invalid date: June 2026',
    );
    expect(() => calculateTimeline({ arrestDate: '2026-06', sections: ['303'] })).toThrow(
      /Invalid date/,
    );
  });
});

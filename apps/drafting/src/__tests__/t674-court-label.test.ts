/**
 * T-674 AC3 / Ajay R4 — no internal court id on screen. Unit tests for the
 * court label service: the pure rules, every court in indian-courts.json, and
 * resolveCourtLabels with a mocked Court model (one query, no per-doc lookups).
 */
import courtsJson from '../config/courts/indian-courts.json';
import { Court } from '../models/Court.model';
import {
  courtLabelFor,
  displayTitle,
  looksLikeCourtId,
  resolveCourtLabel,
  resolveCourtLabels,
} from '../services/court-label.service';

jest.mock('../models/Court.model', () => ({ Court: { find: jest.fn() } }));

interface JsonCourt {
  courtId: string;
  name: string;
  city: string;
}
const ALL = (courtsJson as unknown as { courts: JsonCourt[] }).courts;
const byId = (id: string) => {
  const c = ALL.find((x) => x.courtId === id);
  if (!c) throw new Error(`fixture court missing: ${id}`);
  return c;
};

/** Mocks Court.find(...).select().maxTimeMS().lean() and records the filter. */
function mockFind(rows: Array<{ courtId: string; name: string; city: string }> | Error) {
  const lean = jest.fn(() =>
    rows instanceof Error ? Promise.reject(rows) : Promise.resolve(rows),
  );
  const chain = { select: jest.fn(), maxTimeMS: jest.fn(), lean };
  chain.select.mockReturnValue(chain);
  chain.maxTimeMS.mockReturnValue(chain);
  (Court.find as jest.Mock).mockReturnValue(chain);
  return chain;
}

describe('looksLikeCourtId', () => {
  it('accepts snake_case ids and rejects typed names', () => {
    expect(looksLikeCourtId('up_district_lucknow')).toBe(true);
    expect(looksLikeCourtId('patna_dccdrc')).toBe(true);
    expect(looksLikeCourtId('drt_patna')).toBe(true);
    expect(looksLikeCourtId('Civil Judge (Senior Division), Sitapur')).toBe(false);
    expect(looksLikeCourtId('Delhi High Court')).toBe(false);
    expect(looksLikeCourtId('Patna')).toBe(false); // one word, no underscore
    expect(looksLikeCourtId('Up_District_Lucknow')).toBe(false); // upper case
  });

  it('KEY RISK: every courtId in indian-courts.json is id-shaped (no allowlist needed)', () => {
    const exceptions = ALL.filter((c) => !looksLikeCourtId(c.courtId)).map((c) => c.courtId);
    expect(exceptions).toEqual([]);
    expect(new Set(ALL.map((c) => c.courtId)).size).toBe(ALL.length);
  });
});

describe('courtLabelFor — with a Court row', () => {
  it.each([
    ['up_district_lucknow', 'District Court, Lucknow'],
    ['mp_sessions_bhopal', 'District & Sessions Court, Bhopal'],
    ['kl_sessions_ernakulam_kochi', 'District & Sessions Court, Ernakulam (Kochi)'],
    ['bihar_civil_patna', 'Civil Court (Senior Division), Patna'],
    ['rj_district_jaipur_rural', 'District Court, Jaipur Rural'],
    ['supreme_court_india', 'Supreme Court of India, New Delhi'],
    ['ap_district_machilipatnam', 'District Court, Krishna, Machilipatnam'],
  ])('%s -> %s', (id, expected) => {
    expect(courtLabelFor(id, byId(id))).toBe(expected);
  });

  it('does not repeat the city when the name already carries it (case-insensitive)', () => {
    expect(courtLabelFor('x_y', { name: 'District & Sessions Court, Patna', city: 'Patna' })).toBe(
      'District & Sessions Court, Patna',
    );
    expect(courtLabelFor('x_y', { name: 'DISTRICT COURT PATNA', city: 'patna' })).toBe(
      'DISTRICT COURT PATNA',
    );
  });

  it('whole-word match: a city that is only part of another word is still appended', () => {
    expect(courtLabelFor('x_y', { name: 'Patnagarh Court', city: 'Patna' })).toBe(
      'Patnagarh Court, Patna',
    );
    expect(courtLabelFor('x_y', { name: 'Court of Ranchi Rural', city: 'Ranchi' })).toBe(
      'Court of Ranchi Rural',
    );
  });

  it('multi-word / bracketed place names match as whole words', () => {
    expect(courtLabelFor('x_y', { name: 'Court, Ernakulam (Kochi)', city: 'Kochi' })).toBe(
      'Court, Ernakulam (Kochi)',
    );
    expect(courtLabelFor('x_y', { name: 'High Court at New Delhi', city: 'New Delhi' })).toBe(
      'High Court at New Delhi',
    );
  });

  it('a blank city adds nothing; a nameless row falls back to the stored-value rules', () => {
    expect(courtLabelFor('x_y', { name: 'Some Court', city: '' })).toBe('Some Court');
    expect(courtLabelFor('x_y', { name: 'Some Court', city: null })).toBe('Some Court');
    expect(courtLabelFor('up_district_lucknow', { name: '', city: 'Lucknow' })).toBe('');
    expect(courtLabelFor('Typed Court', { name: '  ', city: 'Lucknow' })).toBe('Typed Court');
  });
});

describe('courtLabelFor — no Court row', () => {
  it('returns a typed name exactly as typed', () => {
    expect(courtLabelFor('Civil Judge (Senior Division), Sitapur')).toBe(
      'Civil Judge (Senior Division), Sitapur',
    );
    expect(courtLabelFor('DELHI HIGH COURT')).toBe('DELHI HIGH COURT');
    expect(courtLabelFor('  Court of the Munsif  ')).toBe('Court of the Munsif');
  });

  it('an unknown id-shaped value gives an empty label, never the id', () => {
    expect(courtLabelFor('up_district_nowhere')).toBe('');
    expect(courtLabelFor('up_district_nowhere', null)).toBe('');
  });

  it.each([[''], ['   '], [undefined], [null]])('empty input %p -> empty', (v) => {
    expect(courtLabelFor(v as string | undefined | null)).toBe('');
  });
});

describe('courtLabelFor — all courts in indian-courts.json', () => {
  it(`labels all ${ALL.length} courts: non-empty, no raw id, no undefined/null`, () => {
    expect(ALL.length).toBeGreaterThan(1700);
    const bad: string[] = [];
    for (const c of ALL) {
      const label = courtLabelFor(c.courtId, c);
      if (
        label === '' ||
        label === c.courtId ||
        label.includes(c.courtId) ||
        /undefined|null/i.test(label) ||
        /\b[a-z0-9]+(?:_[a-z0-9]+)+\b/.test(label)
      ) {
        bad.push(`${c.courtId} -> ${label}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('with the row missing, every real id gives an empty label (no leak)', () => {
    const leaked = ALL.filter((c) => courtLabelFor(c.courtId) !== '').map((c) => c.courtId);
    expect(leaked).toEqual([]);
  });
});

describe('resolveCourtLabels — mocked Court model', () => {
  let errSpy: jest.SpyInstance;
  beforeEach(() => {
    (Court.find as jest.Mock).mockReset();
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => errSpy.mockRestore());

  it('runs ONE find for many values, dedupes ids, never queries empty values', async () => {
    const chain = mockFind([byId('up_district_lucknow'), byId('mp_sessions_bhopal')]);
    const values = [
      'up_district_lucknow',
      'mp_sessions_bhopal',
      'up_district_lucknow',
      'up_district_nowhere',
      'Civil Judge (Senior Division), Sitapur',
      '',
      undefined,
      null,
      '  mp_sessions_bhopal ',
    ];
    const labels = await resolveCourtLabels(values);

    expect(Court.find).toHaveBeenCalledTimes(1);
    const filter = (Court.find as jest.Mock).mock.calls[0][0] as {
      courtId: { $in: string[] };
    };
    const ids = filter.courtId.$in;
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(['up_district_lucknow', 'mp_sessions_bhopal']));
    // FINDING: the service queries every non-empty trimmed value, typed names
    // included (harmless: no courtId equals a typed name). The handoff said
    // typed names are not queried; the source does not do that, so not asserted.
    expect(ids).not.toContain('');
    expect(ids).not.toContain('  mp_sessions_bhopal '); // trimmed and deduped
    expect(chain.maxTimeMS).toHaveBeenCalledWith(5000);

    expect(labels.get('up_district_lucknow')).toBe('District Court, Lucknow');
    expect(labels.get('mp_sessions_bhopal')).toBe('District & Sessions Court, Bhopal');
    expect(labels.get('up_district_nowhere')).toBe('');
    expect(labels.get('Civil Judge (Senior Division), Sitapur')).toBe(
      'Civil Judge (Senior Division), Sitapur',
    );
    expect(labels.get('')).toBe('');
  });

  it('does not query at all when there is nothing to look up', async () => {
    const labels = await resolveCourtLabels(['', undefined, null]);
    expect(Court.find).not.toHaveBeenCalled();
    expect(labels.get('')).toBe('');
  });

  it('a failed lookup does not throw: ids become empty, typed names stay', async () => {
    mockFind(new Error('db down'));
    const labels = await resolveCourtLabels(['up_district_lucknow', 'Typed Court Name']);
    expect(labels.get('up_district_lucknow')).toBe('');
    expect(labels.get('Typed Court Name')).toBe('Typed Court Name');
    expect(Court.find).toHaveBeenCalledTimes(1);
    // logs the error name only, not the message
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain('db down');
  });

  it('resolveCourtLabel wraps a single value (and survives a failed lookup)', async () => {
    mockFind([byId('bihar_civil_patna')]);
    expect(await resolveCourtLabel('bihar_civil_patna')).toBe(
      'Civil Court (Senior Division), Patna',
    );
    mockFind(new Error('boom'));
    expect(await resolveCourtLabel('bihar_civil_patna')).toBe('');
    expect(await resolveCourtLabel(undefined)).toBe('');
  });
});

describe('displayTitle', () => {
  const T = 'Bail Application u/s 480 BNSS';
  const LUCK = 'District Court, Lucknow';
  const KOCHI = 'District & Sessions Court, Ernakulam (Kochi)';

  it('replaces an id suffix (em dash) with the label', () => {
    expect(displayTitle(`${T} — up_district_lucknow`, 'up_district_lucknow', LUCK)).toBe(
      `${T} — ${LUCK}`,
    );
  });

  it('accepts a hyphen and trailing spaces, and writes an em dash', () => {
    expect(
      displayTitle(`${T} - kl_sessions_ernakulam_kochi  `, 'kl_sessions_ernakulam_kochi', KOCHI),
    ).toBe(`${T} — ${KOCHI}`);
    expect(displayTitle(`${T}   —   up_district_lucknow `, 'up_district_lucknow', LUCK)).toBe(
      `${T} — ${LUCK}`,
    );
  });

  it('drops the suffix when the label is empty (unknown id)', () => {
    expect(displayTitle(`${T} — up_district_nowhere`, 'up_district_nowhere', '')).toBe(T);
    expect(displayTitle(`${T} - up_district_nowhere`, 'up_district_nowhere', undefined)).toBe(T);
    expect(displayTitle(`${T} - up_district_nowhere`, 'up_district_nowhere', null)).toBe(T);
  });

  it('leaves other titles unchanged', () => {
    const typed = 'Bail Application — Civil Judge (Senior Division), Sitapur';
    expect(displayTitle(typed, 'Civil Judge (Senior Division), Sitapur', typed)).toBe(typed);
    expect(displayTitle('My own title', 'up_district_lucknow', LUCK)).toBe('My own title');
    expect(
      displayTitle(
        'Guided brief — District & Sessions Court, Bhopal',
        'mp_sessions_bhopal',
        'District & Sessions Court, Bhopal',
      ),
    ).toBe('Guided brief — District & Sessions Court, Bhopal');
  });

  it('courtName not id-shaped, empty or missing -> unchanged', () => {
    const t = `${T} — up_district_lucknow`;
    expect(displayTitle(t, 'Some Typed Court', LUCK)).toBe(t);
    expect(displayTitle(t, '', LUCK)).toBe(t);
    expect(displayTitle(t, undefined, LUCK)).toBe(t);
    expect(displayTitle(t, null, LUCK)).toBe(t);
  });

  it('title not ending with this id -> unchanged (other id, mid-title, no separator)', () => {
    expect(displayTitle(`${T} — mp_sessions_bhopal`, 'up_district_lucknow', LUCK)).toBe(
      `${T} — mp_sessions_bhopal`,
    );
    const mid = `${T} — up_district_lucknow (copy)`;
    expect(displayTitle(mid, 'up_district_lucknow', LUCK)).toBe(mid);
    const mid2 = 'up_district_lucknow — Bail';
    expect(displayTitle(mid2, 'up_district_lucknow', LUCK)).toBe(mid2);
    const nosep = `${T}up_district_lucknow`;
    expect(displayTitle(nosep, 'up_district_lucknow', LUCK)).toBe(nosep);
    // a longer id that merely ends with this id
    const longer = `${T} — x_up_district_lucknow`;
    expect(displayTitle(longer, 'up_district_lucknow', LUCK)).toBe(longer);
  });

  it('a label with regex-special characters is inserted literally', () => {
    const odd = 'Court $1 (A|B) [C] \\d+ $& .* ^x';
    expect(displayTitle(`${T} — up_district_lucknow`, 'up_district_lucknow', odd)).toBe(
      `${T} — ${odd}`,
    );
  });

  it('empty and undefined inputs do not throw', () => {
    expect(displayTitle('', 'up_district_lucknow', LUCK)).toBe('');
    expect(displayTitle(undefined, 'up_district_lucknow', LUCK)).toBe('');
    expect(displayTitle(null, null, null)).toBe('');
    expect(displayTitle(undefined, undefined, undefined)).toBe('');
  });

  it('the id alone as the whole title is not a suffix pattern (no separator)', () => {
    expect(displayTitle('up_district_lucknow', 'up_district_lucknow', LUCK)).toBe(
      'up_district_lucknow',
    );
  });

  it('for every real court: "<name> — <id>" never keeps the id', () => {
    const leaked: string[] = [];
    for (const c of ALL) {
      const label = courtLabelFor(c.courtId, c);
      const out = displayTitle(`Bail — ${c.courtId}`, c.courtId, label);
      if (out.includes(c.courtId) || out !== `Bail — ${label}`) leaked.push(c.courtId);
    }
    expect(leaked).toEqual([]);
  });
});

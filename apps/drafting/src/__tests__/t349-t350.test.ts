/**
 * T-349 (dates in the brief path and the annexures print as "D Month YYYY")
 * and T-350 (a broken template override fails loudly; template ids are plain).
 *
 * Ajay's rulings (T-349): an impossible ISO-shaped date prints exactly as
 * entered; Annexure C's user dates (event, FIR, arrest) print as "D Month YYYY".
 *
 * No database, no model call. Puppeteer is mocked and the HTML it is handed is read.
 */
import * as fs from 'fs';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// `fs` is wrapped (not replaced) so a test can watch or fail one read. Real by default.
jest.mock('fs', () => {
  const actual = jest.requireActual<typeof import('fs')>('fs');
  return { ...actual, readFileSync: jest.fn(actual.readFileSync) };
});

const mockSetContent = jest.fn();
jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      setContent: (...args: unknown[]) => mockSetContent(...args),
      pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF')),
    }),
    close: jest.fn().mockResolvedValue(undefined),
  }),
}));

/* eslint-disable import/order */
import logger from '../config/logger';
import { TEMPLATE_CATALOGUE } from '../config/catalogue';
import { buildAnnexuresPack } from '../services/annexures.service';
import { drafterBrief } from '../services/brief-drafter';
import { buildBrief, buildChecklist, GivenValue } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { clearTemplateRegistryCache } from '../services/template-promoter';
import {
  assertOverridesCatalogued,
  buildAISystemPrompt,
  clearConfigCache,
  loadTemplateConfig,
} from '../services/template-engine.service';
/* eslint-enable import/order */

const OVERRIDE_IDS = [
  'bail_anticipatory',
  'bail_regular',
  'consumer_complaint',
  'legal_notice_s138',
  'legal_notice_s80',
  'rent_agreement',
];

const realReadFileSync = jest.requireActual<typeof import('fs')>('fs').readFileSync;

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  (fs.readFileSync as unknown as jest.Mock).mockReset().mockImplementation(realReadFileSync);
  mockSetContent.mockReset();
  clearConfigCache();
  clearTemplateRegistryCache();
});

// ── T-349: the brief path ───────────────────────────────────────────────────

describe('T-349: the brief the Drafter is given (brief-drafter filingDate)', () => {
  const pack = loadRulePack('bail_regular');
  if (!pack) throw new Error('no pack bail_regular');
  const user = (key: string, value: string): GivenValue => ({ key, value, source: 'user' });

  // `converted` is the path that can carry a value buildBrief itself would not
  // accept as a date (it keeps only real ISO dates), so it is how a non-ISO or
  // impossible date reaches the Drafter brief.
  function firDateGiven(value: string, viaConverted = false): string {
    const brief = buildBrief({
      kind: { id: pack!.id, name: pack!.name, court_document: true },
      checklist: buildChecklist(pack!),
      values: [user('fir_date', viaConverted ? '2026-03-10' : value)],
      court: { state: 'bihar', court_type: 'sessions', court: 'district_sessions_patna' },
    });
    const given = drafterBrief(
      brief,
      'SESSIONS JUDGE, PATNA',
      viaConverted ? { fir_date: value } : undefined,
    ).dates.find((d) => d.key === 'fir_date');
    if (!given) throw new Error('fir_date missing from the Drafter brief');
    return given.date;
  }

  it('a single-digit day has no leading zero', () => {
    expect(firDateGiven('2026-04-04')).toBe('4 April 2026');
  });

  it('a two-digit day is printed as it is, with the full month name', () => {
    expect(firDateGiven('2026-03-15')).toBe('15 March 2026');
  });

  it('a value that is not ISO is left unchanged', () => {
    expect(firDateGiven('04.04.2026', true)).toBe('04.04.2026');
  });

  it('an impossible ISO-shaped date is left exactly as entered', () => {
    expect(firDateGiven('2026-02-30', true)).toBe('2026-02-30');
  });
});

// ── T-349: the annexures ────────────────────────────────────────────────────

describe('T-349: annexures.service', () => {
  const TODAY = new Date(2026, 3, 4, 12, 0, 0);

  async function htmlFor(extra: Record<string, unknown>): Promise<string> {
    // Only Date is faked, so the mocked browser's promises run as normal.
    jest.useFakeTimers({
      now: TODAY,
      doNotFake: [
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
    });
    await buildAnnexuresPack({
      formData: {
        template_id: 'bail_anticipatory',
        court_id: 'bihar_district',
        court_type: 'district_court',
        state: 'Bihar',
        applicant_name: 'Ramesh Kumar',
        father_name: 'Suresh Kumar',
        fir_number: '091/2024',
        police_station: 'Kotwali PS',
        ...extra,
      },
      bodyParaCount: 8,
      advocateName: 'Adv. Ravi Shankar',
    });
    expect(mockSetContent).toHaveBeenCalledTimes(1);
    return String(mockSetContent.mock.calls[0][0]);
  }

  it('the filing date and the affidavit date are "4 April 2026", with no leading zero', async () => {
    const html = await htmlFor({});
    // Annexure C's filing row and the affidavit's "today": two places.
    expect((html.match(/4 April 2026/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(html).not.toContain('04 April');
  });

  it('Annexure C: ISO event, FIR and arrest dates print as "D Month YYYY", single-digit day included', async () => {
    const html = await htmlFor({
      incident_date: '2024-06-05',
      fir_date: '2024-06-15',
      date_of_arrest: '2024-07-01',
    });
    expect(html).toContain('5 June 2024');
    expect(html).toContain('15 June 2024');
    expect(html).toContain('1 July 2024');
    expect(html).not.toContain('2024-06-05');
    expect(html).not.toContain('2024-06-15');
    expect(html).not.toContain('2024-07-01');
    expect(html).not.toContain('05 June');
    expect(html).not.toContain('01 July');
  });

  it('Annexure C: the other keys the row reads are formatted too', async () => {
    const html = await htmlFor({
      date_of_incident: '2024-08-09',
      date_of_fir: '2024-08-10',
      arrest_date: '2024-08-02',
    });
    expect(html).toContain('9 August 2024');
    expect(html).toContain('10 August 2024');
    expect(html).toContain('2 August 2024');
  });

  it('Annexure C: an impossible or non-ISO date prints as entered', async () => {
    const html = await htmlFor({
      incident_date: '2026-02-30',
      fir_date: '15.06.2024',
      date_of_arrest: 'on the night of 3rd July',
    });
    expect(html).toContain('2026-02-30');
    expect(html).toContain('15.06.2024');
    expect(html).toContain('on the night of 3rd July');
    expect(html).not.toContain('30 February');
  });

  it('Annexure C: HTML in a date value is still escaped', async () => {
    const html = await htmlFor({ fir_date: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('Annexure C: a blank date still shows the blank line', async () => {
    const html = await htmlFor({});
    expect(html).toContain('___________');
  });
});

// ── T-349: the prompt ───────────────────────────────────────────────────────

describe('T-349: the system prompt date line (Ajay’s text)', () => {
  const config = loadTemplateConfig('bail_regular');
  if (!config) throw new Error('no template bail_regular');

  it('is exactly Ajay’s wording', () => {
    expect(buildAISystemPrompt(config)).toContain(
      '7. Write any date as D Month YYYY, for example 4 April 2026. Never work out, add or change a date that is not given.',
    );
  });

  it('no longer asks for DD/MM/YYYY', () => {
    expect(buildAISystemPrompt(config)).not.toContain('DD/MM/YYYY');
  });
});

// ── T-350: the boot check ───────────────────────────────────────────────────

describe('T-350: assertOverridesCatalogued', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 't350-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('passes for a catalogued, valid override', () => {
    writeFileSync(join(dir, 'bail_regular.json'), JSON.stringify({ template_id: 'bail_regular' }));
    expect(() => assertOverridesCatalogued(dir)).not.toThrow();
  });

  it('lists an override that is not valid JSON, catalogued or not', () => {
    writeFileSync(join(dir, 'nda.json'), '{ not json');
    expect(() => assertOverridesCatalogued(dir)).toThrow(/not valid JSON: nda/);
    writeFileSync(join(dir, 'zz_unknown.json'), '{ not json');
    expect(() => assertOverridesCatalogued(dir)).toThrow(/not valid JSON: nda, zz_unknown/);
  });

  it('logs an error with the template id only, never the file content', () => {
    const secret = 'PRIVILEGED-CLAUSE-TEXT-DO-NOT-LOG';
    writeFileSync(join(dir, 'nda.json'), `{ "clause": "${secret}" `);
    const error = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    expect(() => assertOverridesCatalogued(dir)).toThrow();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).toEqual({ templateId: 'nda' });
    expect(JSON.stringify(error.mock.calls)).not.toContain(secret);
  });

  it('does not put the file content in the thrown error either', () => {
    const secret = 'PRIVILEGED-CLAUSE-TEXT-DO-NOT-LOG';
    writeFileSync(join(dir, 'nda.json'), `{ "clause": "${secret}" `);
    jest.spyOn(logger, 'error').mockImplementation(() => logger);
    let message = '';
    try {
      assertOverridesCatalogued(dir);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).not.toBe('');
    expect(message).not.toContain(secret);
  });

  it('reports invalid and uncatalogued ids together in one error', () => {
    writeFileSync(
      join(dir, 'zz_uncatalogued.json'),
      JSON.stringify({ template_id: 'zz_uncatalogued' }),
    );
    writeFileSync(join(dir, 'nda.json'), '{ not json');
    jest.spyOn(logger, 'error').mockImplementation(() => logger);
    let message = '';
    try {
      assertOverridesCatalogued(dir);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/zz_uncatalogued/);
    expect(message).toMatch(/not valid JSON: nda/);
    // The T-345 text comes first.
    expect(message.indexOf('zz_uncatalogued')).toBeLessThan(message.indexOf('not valid JSON'));
  });

  it('a missing directory only warns', () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    const error = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    expect(() => assertOverridesCatalogued(join(dir, 'does-not-exist'))).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });
});

// ── T-350: loadTemplateConfig ───────────────────────────────────────────────

/** Make reads of one override file behave as `behave` says; every other read is real. */
function overrideRead(id: string, behave: () => string): jest.Mock {
  const read = fs.readFileSync as unknown as jest.Mock;
  read.mockImplementation((p: unknown, ...rest: unknown[]) => {
    if (typeof p === 'string' && p.endsWith(join('docs', 'templates', `${id}.json`)))
      return behave();
    return (realReadFileSync as (...a: unknown[]) => unknown)(p, ...rest);
  });
  return read;
}

/** Back to the real read (a fixed file). */
function restoreRead(): void {
  (fs.readFileSync as unknown as jest.Mock).mockImplementation(realReadFileSync);
}

function errno(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

describe('T-350: loadTemplateConfig and a broken override', () => {
  beforeEach(() => {
    clearConfigCache();
    jest.spyOn(logger, 'error').mockImplementation(() => logger);
  });

  it('invalid JSON throws, logging the id only', () => {
    overrideRead('bail_regular', () => '{ SECRET-CONTENT not json');
    expect(() => loadTemplateConfig('bail_regular')).toThrow(/bail_regular is not valid JSON/);
    expect(logger.error).toHaveBeenCalledWith(
      { templateId: 'bail_regular' },
      expect.stringContaining('not valid JSON'),
    );
    expect(JSON.stringify((logger.error as jest.Mock).mock.calls)).not.toContain('SECRET-CONTENT');
  });

  it('invalid JSON is not cached: the next call, once the file is fixed, loads it', () => {
    overrideRead('bail_regular', () => '{ not json');
    expect(() => loadTemplateConfig('bail_regular')).toThrow();
    expect(() => loadTemplateConfig('bail_regular')).toThrow();
    restoreRead();
    const config = loadTemplateConfig('bail_regular');
    expect(config?.template_id).toBe('bail_regular');
  });

  it('an unreadable override (not "missing") throws and is not silently replaced', () => {
    overrideRead('bail_regular', () => {
      throw errno('EACCES');
    });
    expect(() => loadTemplateConfig('bail_regular')).toThrow(/bail_regular is unreadable/);
  });

  it('a missing override (ENOENT) falls back to the registry', () => {
    overrideRead('nda', () => {
      throw errno('ENOENT');
    });
    const config = loadTemplateConfig('nda');
    expect(config?.template_id).toBe('nda');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('a missing override (ENOTDIR) falls back to the registry', () => {
    overrideRead('nda', () => {
      throw errno('ENOTDIR');
    });
    expect(loadTemplateConfig('nda')?.template_id).toBe('nda');
  });

  it('an id with no override file on disk loads from the registry', () => {
    expect(OVERRIDE_IDS).not.toContain('nda');
    expect(loadTemplateConfig('nda')?.template_id).toBe('nda');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('a valid override loads, and is cached', () => {
    const first = loadTemplateConfig('bail_regular');
    expect(first?.template_id).toBe('bail_regular');
    expect(loadTemplateConfig('bail_regular')).toBe(first);
    expect(logger.error).not.toHaveBeenCalled();
  });
});

// ── T-350 AC4: only plain template ids ──────────────────────────────────────

describe('T-350 AC4: loadTemplateConfig accepts only /^[a-z0-9_-]+$/', () => {
  beforeEach(() => {
    clearConfigCache();
  });

  it.each([
    ['a parent-directory path', '../package'],
    ['a "%2F" decoded to "/"', decodeURIComponent('..%2Fpackage')],
    ['a deeper traversal', '../../../../etc/passwd'],
    ['an absolute path', '/etc/passwd'],
    ['a nested path', 'a/b'],
    ['a backslash path', '..\\package'],
    ['upper case', 'Bail_Regular'],
    ['a dot', 'bail.regular'],
    ['a trailing newline', 'bail_regular\n'],
    ['a NUL byte', 'bail_regular\0'],
    ['a space', 'bail regular'],
    ['an empty string', ''],
  ])('%s returns null and reads no file', (_label, id) => {
    const read = fs.readFileSync as unknown as jest.Mock;
    read.mockClear();
    expect(loadTemplateConfig(id)).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it.each([[undefined], [null], [42], [{}], [['bail_regular']]])(
    'a non-string (%p) returns null and reads no file',
    (id) => {
      const read = fs.readFileSync as unknown as jest.Mock;
      read.mockClear();
      expect(loadTemplateConfig(id as unknown as string)).toBeNull();
      expect(read).not.toHaveBeenCalled();
    },
  );

  it('the decoded "%2F" really is a slash (the test input is what the route would pass)', () => {
    expect(decodeURIComponent('..%2Fpackage')).toBe('../package');
  });

  it('every real override id still loads', () => {
    for (const id of OVERRIDE_IDS) {
      expect({ id, loaded: loadTemplateConfig(id)?.template_id }).toEqual({ id, loaded: id });
    }
  });

  it('every catalogue id has the plain shape and still loads', () => {
    const ids = Object.keys(TEMPLATE_CATALOGUE);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect({ id, plain: /^[a-z0-9_-]+$/.test(id) }).toEqual({ id, plain: true });
      expect({ id, loaded: loadTemplateConfig(id) !== null }).toEqual({ id, loaded: true });
    }
  });
});

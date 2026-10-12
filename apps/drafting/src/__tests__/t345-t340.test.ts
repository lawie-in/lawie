/**
 * T-345 (T-240 reviewer's should-fixes) and T-340 (one date format).
 *
 * T-340: `current_date` and every ISO date in a "*date*" key print as
 *   "D Month YYYY" ("4 April 2026"), in every template.
 * T-345 1: docs/templates overrides are checked against config/catalogue at
 *   boot; listTemplateConfigs no longer swallows what loadTemplateConfig throws.
 * T-345 2: the promoter's catalogue check is reachable (it sat behind the price
 *   check) and both lists are reported in one error.
 * T-345 4 (web label) is in apps/web/src/components/__tests__/CategoryLabel.test.tsx.
 *
 * No database, no model call.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import * as catalogue from '../config/catalogue';
import { NON_TEMPLATE_PRICES } from '../config/catalogue';
import * as promoter from '../services/template-promoter';
import {
  assertOverridesCatalogued,
  buildPlaceholderContext,
  clearConfigCache,
  formatDraftDate,
  formatIsoDraftDate,
  listTemplateConfigs,
  loadTemplateConfig,
  renderTemplateSection,
} from '../services/template-engine.service';
import type { TemplateConfig } from '../services/template-engine.service';

const OVERRIDE_IDS = [
  'bail_anticipatory',
  'bail_regular',
  'consumer_complaint',
  'legal_notice_s138',
  'legal_notice_s80',
  'rent_agreement',
];
const DAY_FIRST_OLD_FORMAT = /\b\d{2}\.\d{2}\.\d{4}\b/;

function config(id: string): TemplateConfig {
  const c = loadTemplateConfig(id);
  if (!c) throw new Error(`no template ${id}`);
  return c;
}

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  clearConfigCache();
  promoter.clearTemplateRegistryCache();
});

// ── T-340 ───────────────────────────────────────────────────────────────────

describe('T-340: formatDraftDate', () => {
  it('prints a single-digit day with no leading zero', () => {
    expect(formatDraftDate(new Date(2026, 3, 4))).toBe('4 April 2026');
    expect(formatDraftDate(new Date(2026, 0, 1))).toBe('1 January 2026');
    expect(formatDraftDate(new Date(2026, 8, 9))).toBe('9 September 2026');
  });
  it('prints a two-digit day as it is', () => {
    expect(formatDraftDate(new Date(2026, 3, 14))).toBe('14 April 2026');
    expect(formatDraftDate(new Date(2026, 11, 31))).toBe('31 December 2026');
  });
  it('uses the full English month name for all twelve months', () => {
    const names = Array.from({ length: 12 }, (_v, m) => formatDraftDate(new Date(2026, m, 15)));
    expect(names.map((n) => n.split(' ')[1])).toEqual([
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ]);
  });
});

describe('T-340: formatIsoDraftDate', () => {
  it.each([
    ['2026-04-04', '4 April 2026'],
    ['2026-04-14', '14 April 2026'],
    ['2026-01-09', '9 January 2026'],
    ['2026-12-31', '31 December 2026'],
    ['2024-02-29', '29 February 2024'], // leap day
    ['2000-02-29', '29 February 2000'], // leap: divisible by 400
  ])('%s gives %s', (iso, out) => {
    expect(formatIsoDraftDate(iso)).toBe(out);
  });

  it.each([
    '2026-02-30',
    '2026-02-29', // 2026 is not a leap year
    '1900-02-29', // divisible by 100 and not 400
    '2026-13-01',
    '2026-00-10',
    '2026-04-31',
    '2026-04-00',
    '2026-4-4',
    '04.04.2026',
    '4 April 2026',
    '2026-04-04T10:00:00Z',
    '',
  ])('returns null for %p (left unchanged by the caller)', (s) => {
    expect(formatIsoDraftDate(s)).toBeNull();
  });
});

describe('T-340: current_date in the placeholder context', () => {
  it('prints a single-digit day with no leading zero (fake timers)', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 3, 4, 12, 0, 0));
    expect(buildPlaceholderContext(config('legal_notice_s138'), {}).current_date).toBe(
      '4 April 2026',
    );
  });
  it('prints a two-digit day as it is (fake timers)', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 12, 12, 0, 0));
    expect(buildPlaceholderContext(config('legal_notice_s138'), {}).current_date).toBe(
      '12 October 2026',
    );
  });
  it('keeps current_year as before', () => {
    jest.useFakeTimers().setSystemTime(new Date(2027, 2, 3, 12, 0, 0));
    const ctx = buildPlaceholderContext(config('legal_notice_s138'), {});
    expect(ctx.current_date).toBe('3 March 2027');
    expect(ctx.current_year).toBe('2027');
  });
});

describe('T-340: ISO dates in the placeholder context', () => {
  const ctxFor = (data: Record<string, unknown>) =>
    buildPlaceholderContext(config('legal_notice_s138'), data);

  it('an ISO date in a "*date*" key prints as D Month YYYY', () => {
    const ctx = ctxFor({
      cheque_date: '2026-08-01',
      presentation_date: '2026-08-05',
      dishonour_date: '2026-08-17',
    });
    expect(ctx.cheque_date).toBe('1 August 2026');
    expect(ctx.presentation_date).toBe('5 August 2026');
    expect(ctx.dishonour_date).toBe('17 August 2026');
  });
  it('a leap day prints', () => {
    expect(ctxFor({ cheque_date: '2024-02-29' }).cheque_date).toBe('29 February 2024');
  });
  it.each(['2026-02-30', '2026-13-01', '2026-02-29'])(
    'an impossible date %s is left unchanged',
    (bad) => {
      expect(ctxFor({ cheque_date: bad }).cheque_date).toBe(bad);
    },
  );
  it('a value that is not ISO is left unchanged', () => {
    expect(ctxFor({ cheque_date: '01.08.2026' }).cheque_date).toBe('01.08.2026');
  });
  it('an ISO value in a key without "date" is left untouched', () => {
    const ctx = ctxFor({ respondent_name: '2026-08-01', cheque_number: '2026-08-02' });
    expect(ctx.respondent_name).toBe('2026-08-01');
    expect(ctx.cheque_number).toBe('2026-08-02');
  });
});

describe('T-340: actual output, every template (AC2)', () => {
  const NOW = new Date(2026, 3, 4, 12, 0, 0);

  function renderedWithCurrentDate(c: TemplateConfig): string[] {
    const ctx = buildPlaceholderContext(c, {});
    return c.document_structure.sections
      .filter((s) => s.type === 'template' && s.template?.includes('{current_date}'))
      .map((s) => renderTemplateSection(s, ctx).content);
  }

  // T-192: the s138 header prints `Date: {notice_date}`, a computed field that is
  // '{current_date}' when notice_sent_date is blank and '{notice_sent_date}' otherwise.
  function s138Header(data: Record<string, unknown>): string {
    const c = config('legal_notice_s138');
    const section = c.document_structure.sections.find(
      (s) => s.type === 'template' && s.template?.includes('Date: {notice_date}'),
    );
    if (!section) throw new Error('no s138 section prints Date: {notice_date}');
    return renderTemplateSection(section, buildPlaceholderContext(c, data)).content;
  }

  it('the legal_notice_s138 header prints "Date: 4 April 2026" when notice_sent_date is blank', () => {
    jest.useFakeTimers().setSystemTime(NOW);
    const t = s138Header({});
    expect(t).toContain('Date: 4 April 2026');
    expect(t).not.toMatch(/04 April/);
  });

  it('the legal_notice_s138 header prints an ISO notice_sent_date as "Date: 7 March 2026"', () => {
    jest.useFakeTimers().setSystemTime(NOW);
    const t = s138Header({ notice_sent_date: '2026-03-07' });
    expect(t).toContain('Date: 7 March 2026');
    expect(t).not.toMatch(/07 March/);
    expect(t).not.toContain('4 April 2026');
  });

  it('a registry template (not an override) prints current_date in the new format', () => {
    jest.useFakeTimers().setSystemTime(NOW);
    const overrides = new Set(OVERRIDE_IDS);
    const registry = [...promoter.getTemplateRegistry().configs.values()].filter(
      (c) => !overrides.has(c.template_id),
    );
    const withDate = registry.filter((c) => renderedWithCurrentDate(c).length > 0);
    expect(withDate.length).toBeGreaterThan(0);
    for (const c of withDate) {
      for (const t of renderedWithCurrentDate(c)) {
        expect(t).toContain('4 April 2026');
        expect(t).not.toMatch(/04 April 2026/);
      }
    }
  });

  it('every override and every registry template has current_date in the new format', () => {
    jest.useFakeTimers().setSystemTime(NOW);
    const all = [...OVERRIDE_IDS.map(config), ...promoter.getTemplateRegistry().configs.values()];
    expect(all.length).toBeGreaterThan(OVERRIDE_IDS.length);
    for (const c of all) {
      const ctx = buildPlaceholderContext(c, {});
      expect({ id: c.template_id, d: ctx.current_date }).toEqual({
        id: c.template_id,
        d: '4 April 2026',
      });
    }
  });

  it('no template section renders a day-first dotted date from an ISO input or current_date', () => {
    jest.useFakeTimers().setSystemTime(NOW);
    const c = config('legal_notice_s138');
    const ctx = buildPlaceholderContext(c, {
      cheque_date: '2026-08-01',
      presentation_date: '2026-08-05',
      dishonour_date: '2026-08-07',
    });
    const text = c.document_structure.sections
      .filter((s) => s.type === 'template')
      .map((s) => renderTemplateSection(s, ctx).content)
      .join('\n');
    expect(text).toContain('Cheque No.');
    expect(text).toContain('1 August 2026');
    expect(text).toContain('7 August 2026');
    expect(text).not.toMatch(DAY_FIRST_OLD_FORMAT);
  });
});

// ── T-345 1 ─────────────────────────────────────────────────────────────────

describe('T-345 1: assertOverridesCatalogued', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 't345-overrides-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('passes for the real docs/templates directory', () => {
    expect(() => assertOverridesCatalogued()).not.toThrow();
  });

  it('passes for catalogued ids', () => {
    writeFileSync(join(dir, 'nda.json'), JSON.stringify({ template_id: 'nda' }));
    expect(() => assertOverridesCatalogued(dir)).not.toThrow();
  });

  it('one unknown id throws, naming it', () => {
    writeFileSync(join(dir, 'zz_unknown.json'), JSON.stringify({ template_id: 'zz_unknown' }));
    expect(() => assertOverridesCatalogued(dir)).toThrow(
      /no catalogue category in config\/catalogue for docs\/templates override\(s\): zz_unknown$/,
    );
  });

  it('throws ONE error listing every missing id, sorted, and not the catalogued one', () => {
    writeFileSync(join(dir, 'nda.json'), JSON.stringify({ template_id: 'nda' }));
    writeFileSync(join(dir, 'b.json'), JSON.stringify({ template_id: 'zz_b' }));
    writeFileSync(join(dir, 'a.json'), JSON.stringify({ template_id: 'zz_a' }));
    let message = '';
    try {
      assertOverridesCatalogued(dir);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('docs/templates override(s): zz_a, zz_b');
    expect(message).not.toContain('nda');
  });

  it('checks the template_id inside the file, not the file name', () => {
    // File name is unknown, but the id inside is catalogued: this is the id loadTemplateConfig uses.
    writeFileSync(join(dir, 'zz_file_name.json'), JSON.stringify({ template_id: 'nda' }));
    expect(() => assertOverridesCatalogued(dir)).not.toThrow();
    // And the other way round: a catalogued file name, an unknown id inside.
    writeFileSync(join(dir, 'bail_regular.json'), JSON.stringify({ template_id: 'zz_inside' }));
    expect(() => assertOverridesCatalogued(dir)).toThrow(/zz_inside/);
  });

  it('uses the file name when there is no template_id', () => {
    writeFileSync(join(dir, 'zz_no_id.json'), JSON.stringify({ title: 'x' }));
    expect(() => assertOverridesCatalogued(dir)).toThrow(/zz_no_id/);
  });

  it('T-350: lists the file name id as invalid JSON, whether or not it is catalogued', () => {
    writeFileSync(join(dir, 'zz_broken.json'), '{ not json');
    expect(() => assertOverridesCatalogued(dir)).toThrow(/not valid JSON: zz_broken/);
    rmSync(join(dir, 'zz_broken.json'));
    writeFileSync(join(dir, 'nda.json'), '{ not json');
    expect(() => assertOverridesCatalogued(dir)).toThrow(/not valid JSON: nda/);
  });

  it('ignores files that are not .json', () => {
    writeFileSync(join(dir, 'zz_notes.txt'), 'x');
    expect(() => assertOverridesCatalogued(dir)).not.toThrow();
  });

  it('a missing directory does not throw', () => {
    expect(() => assertOverridesCatalogued(join(dir, 'does-not-exist'))).not.toThrow();
  });

  it('every real override id is catalogued', () => {
    for (const id of OVERRIDE_IDS) {
      expect({ id, c: catalogue.catalogueCategoryFor(id) !== undefined }).toEqual({
        id,
        c: true,
      });
    }
  });
});

describe('T-345 1: listTemplateConfigs does not swallow errors', () => {
  it('lists the overrides and the registry when nothing is wrong', () => {
    const ids = listTemplateConfigs().map((t) => t.template_id);
    for (const id of OVERRIDE_IDS) expect(ids).toContain(id);
    expect(ids.length).toBeGreaterThan(OVERRIDE_IDS.length);
  });

  it('a per-file catalogue error from an override is thrown, not ignored', () => {
    clearConfigCache();
    jest.spyOn(catalogue, 'requireCatalogueCategory').mockImplementation((id: string) => {
      throw new Error(`no catalogue category in config/catalogue for ${id}`);
    });
    expect(() => listTemplateConfigs()).toThrow(/no catalogue category/);
  });

  it('a registry build error (missing price or catalogue entry) is thrown, not ignored', () => {
    clearConfigCache();
    jest.spyOn(promoter, 'getTemplateRegistry').mockImplementation(() => {
      throw new Error('Template promoter: no price in TEMPLATE_PRICES (config/catalogue) for: zz');
    });
    expect(() => listTemplateConfigs()).toThrow(/no price in TEMPLATE_PRICES/);
  });
});

// ── T-345 2 ─────────────────────────────────────────────────────────────────

describe('T-345 2: the promoter reaches the catalogue check', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 't345-rules-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const rule = (id: string) => JSON.stringify({ template_id: id, category: 'civil', title: id });

  // A priced id that is not a template has a price (NON_TEMPLATE_PRICES) and no catalogue entry:
  // before T-345 the price check passed it and the catalogue check was never the one that spoke.
  const pricedUncatalogued = Object.keys(NON_TEMPLATE_PRICES).find(
    (id) => catalogue.catalogueCategoryFor(id) === undefined,
  );

  it('has a priced, uncatalogued id to test with', () => {
    expect(pricedUncatalogued).toBeDefined();
  });

  it('a priced but uncatalogued rule reaches the "no catalogue category" message', () => {
    writeFileSync(join(dir, 'x.json'), rule(pricedUncatalogued as string));
    expect(() => promoter.loadAllDocRules(dir)).toThrow(
      new RegExp(`no catalogue category in config/catalogue for: ${pricedUncatalogued}`),
    );
    expect(() => promoter.loadAllDocRules(dir)).not.toThrow(/no price in TEMPLATE_PRICES/);
  });

  it('an unpriced rule alone still gets the price message (and an unpriced id is also uncatalogued)', () => {
    writeFileSync(join(dir, 'a.json'), rule('zz_a'));
    expect(() => promoter.loadAllDocRules(dir)).toThrow(/no price in TEMPLATE_PRICES.*zz_a/);
  });

  it('both lists appear in ONE error when both are missing', () => {
    writeFileSync(join(dir, 'a.json'), rule('zz_b'));
    writeFileSync(join(dir, 'b.json'), rule('zz_a'));
    writeFileSync(join(dir, 'c.json'), rule(pricedUncatalogued as string));
    let message = '';
    try {
      promoter.loadAllDocRules(dir);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toBe(
      'Template promoter: no price in TEMPLATE_PRICES (config/catalogue) for: zz_a, zz_b; ' +
        `no catalogue category in config/catalogue for: ${[pricedUncatalogued, 'zz_a', 'zz_b']
          .sort()
          .join(', ')}`,
    );
  });

  it('a catalogued, priced rule does not throw', () => {
    writeFileSync(join(dir, 'nda.json'), rule('nda'));
    expect(() => promoter.loadAllDocRules(dir)).not.toThrow();
  });
});

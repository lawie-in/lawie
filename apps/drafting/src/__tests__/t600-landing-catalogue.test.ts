/**
 * T-600 - landing catalogue exporter: drift gate, names, serialiser, import guard.
 *
 * config/env, the logger and mongoose are mocked to throw on load, so every
 * import below doubles as the AC5 guard: if landing-catalogue, template-switches
 * or the export script pulled one in, this whole file would fail to load.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  DOC_TYPE_ALIASES,
  CATALOGUE_CATEGORIES,
  NON_TEMPLATE_PRICES,
  TEMPLATE_CATALOGUE,
} from '../config/catalogue';
import { CIVIL_PLAINT_CATEGORY } from '../config/catalogue/template-switches';
import { OUTPUT_PATH } from '../scripts/export-landing-catalogue';
import {
  buildLandingCatalogue,
  humaniseId,
  serialiseLandingCatalogue,
  templateName,
} from '../services/landing-catalogue';

jest.mock('../config/env', () => {
  throw new Error('landing catalogue must not load config/env');
});
jest.mock('../config/logger', () => {
  throw new Error('landing catalogue must not load the logger');
});
jest.mock('mongoose', () => {
  throw new Error('landing catalogue must not load mongoose');
});

const committed = JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8')) as {
  generatedAt: string;
  categories: {
    id: string;
    name: string;
    order: number;
    templates: { id: string; name: string }[];
  }[];
  total: number;
};
const allIds = committed.categories.flatMap((c) => c.templates.map((t) => t.id));

describe('T-600 committed landing-catalogue.json', () => {
  it('matches buildLandingCatalogue() (drift gate, AC3)', () => {
    const { generatedAt: _ignored, ...onDisk } = committed;
    void _ignored;
    try {
      expect(buildLandingCatalogue()).toEqual(onDisk);
    } catch (err) {
      throw new Error(
        `apps/web/src/data/landing-catalogue.json is stale: run export:catalogue ` +
          `(yarn workspace @lawie/drafting export:catalogue) and commit it.\n${(err as Error).message}`,
      );
    }
  });

  it('has an ISO generatedAt', () => {
    expect(new Date(committed.generatedAt).toISOString()).toBe(committed.generatedAt);
  });

  it('total equals the sum of template counts', () => {
    expect(committed.total).toBe(committed.categories.reduce((n, c) => n + c.templates.length, 0));
    expect(committed.total).toBe(allIds.length);
  });

  it('has no duplicate ids', () => {
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});

describe('T-600 buildLandingCatalogue membership and order', () => {
  const built = buildLandingCatalogue();
  const ids = built.categories.flatMap((c) => c.templates.map((t) => t.id));

  it('excludes aliases, non-template prices and civil_plaints_suits ids', () => {
    for (const id of ids) {
      expect(Object.keys(DOC_TYPE_ALIASES)).not.toContain(id);
      expect(Object.keys(NON_TEMPLATE_PRICES)).not.toContain(id);
      expect(TEMPLATE_CATALOGUE[id].category).not.toBe(CIVIL_PLAINT_CATEGORY);
    }
    expect(built.categories.map((c) => c.id)).not.toContain(CIVIL_PLAINT_CATEGORY);
  });

  it('includes every other catalogue template', () => {
    const expected = Object.keys(TEMPLATE_CATALOGUE).filter(
      (id) =>
        !(id in DOC_TYPE_ALIASES) &&
        !(id in NON_TEMPLATE_PRICES) &&
        TEMPLATE_CATALOGUE[id].category !== CIVIL_PLAINT_CATEGORY,
    );
    expect([...ids].sort()).toEqual([...expected].sort());
    expect(built.total).toBe(expected.length);
  });

  it('lists categories in ascending order, none empty', () => {
    const orders = built.categories.map((c) => c.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(orders).toEqual(
      CATALOGUE_CATEGORIES.filter((c) => orders.includes(c.order)).map((c) => c.order),
    );
    for (const c of built.categories) expect(c.templates.length).toBeGreaterThan(0);
  });

  it('keeps templates in catalogue key order within a category', () => {
    const keys = Object.keys(TEMPLATE_CATALOGUE);
    for (const c of built.categories) {
      const idx = c.templates.map((t) => keys.indexOf(t.id));
      expect(idx).toEqual([...idx].sort((a, b) => a - b));
    }
  });
});

describe('T-600 template names', () => {
  let rulesDir: string;
  let overridesDir: string;
  const dirs = () => ({ rulesDir, overridesDir });
  const put = (dir: string, id: string, body: unknown) =>
    writeFileSync(join(dir, `${id}.json`), typeof body === 'string' ? body : JSON.stringify(body));

  beforeEach(() => {
    rulesDir = mkdtempSync(join(tmpdir(), 't600-rules-'));
    overridesDir = mkdtempSync(join(tmpdir(), 't600-ovr-'));
  });
  afterEach(() => {
    rmSync(rulesDir, { recursive: true, force: true });
    rmSync(overridesDir, { recursive: true, force: true });
  });

  it('active override display_name wins', () => {
    put(rulesDir, 'x_doc', { displayName: 'Rule Name', title: 'Rule Title' });
    put(overridesDir, 'x_doc', { display_name: 'Override Name', metadata: { status: 'active' } });
    expect(templateName('x_doc', dirs())).toBe('Override Name');
  });

  it('then rule displayName, then title, then humanised id', () => {
    put(rulesDir, 'x_doc', { displayName: 'Rule Name', title: 'Rule Title' });
    expect(templateName('x_doc', dirs())).toBe('Rule Name');
    put(rulesDir, 'x_doc', { title: 'Rule Title' });
    expect(templateName('x_doc', dirs())).toBe('Rule Title');
    put(rulesDir, 'x_doc', {});
    expect(templateName('x_doc', dirs())).toBe('X Doc');
    expect(templateName('no_such_file-here', dirs())).toBe('No Such File Here');
  });

  it('ignores a non-active override', () => {
    put(rulesDir, 'x_doc', { displayName: 'Rule Name' });
    put(overridesDir, 'x_doc', { display_name: 'Draft Name', metadata: { status: 'draft' } });
    expect(templateName('x_doc', dirs())).toBe('Rule Name');
    put(overridesDir, 'x_doc', { display_name: 'No Status' });
    expect(templateName('x_doc', dirs())).toBe('Rule Name');
  });

  it('a non-active override never hides a template from the catalogue', () => {
    const id = Object.keys(buildLandingCatalogue().categories[0].templates)[0];
    void id;
    const first = buildLandingCatalogue().categories[0].templates[0].id;
    put(overridesDir, first, { display_name: 'Draft', metadata: { status: 'archived' } });
    const built = buildLandingCatalogue({ overridesDir });
    expect(built.categories[0].templates.map((t) => t.id)).toContain(first);
    expect(built.total).toBe(buildLandingCatalogue().total);
  });

  it('throws on invalid JSON, naming the id only', () => {
    put(rulesDir, 'bad_one', '{ not json SECRET-CONTENT');
    let message = '';
    try {
      templateName('bad_one', dirs());
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain('bad_one');
    expect(message).not.toContain('SECRET-CONTENT');
    expect(message).not.toContain(rulesDir);
  });

  it('throws on invalid override JSON and on a non-object', () => {
    put(overridesDir, 'bad_one', 'nope');
    expect(() => templateName('bad_one', dirs())).toThrow(/bad_one/);
    put(overridesDir, 'arr_one', '[]');
    expect(() => templateName('arr_one', dirs())).toThrow(/arr_one/);
  });

  it('humaniseId title-cases separators', () => {
    expect(humaniseId('bail_application-s480')).toBe('Bail Application S480');
  });
});

describe('T-600 serialiseLandingCatalogue', () => {
  const cat = {
    categories: [{ id: 'c', name: 'C', order: 1, templates: [{ id: 'a', name: 'A' }] }],
    total: 1,
  };
  const T1 = new Date('2026-01-01T00:00:00.000Z');
  const T2 = new Date('2026-02-02T00:00:00.000Z');
  const first = serialiseLandingCatalogue(cat, null, () => T1);

  it('uses now when there is no previous', () => {
    expect(JSON.parse(first).generatedAt).toBe(T1.toISOString());
    expect(serialiseLandingCatalogue(cat, undefined, () => T2)).toContain(T2.toISOString());
  });

  it('keeps generatedAt when unchanged (byte-identical)', () => {
    expect(serialiseLandingCatalogue(cat, first, () => T2)).toBe(first);
  });

  it('uses now when the catalogue changed', () => {
    const changed = { ...cat, total: 2 };
    expect(JSON.parse(serialiseLandingCatalogue(changed, first, () => T2)).generatedAt).toBe(
      T2.toISOString(),
    );
  });

  it('uses now when previous is invalid or lacks generatedAt', () => {
    for (const prev of ['not json', '[]', '', JSON.stringify(cat)]) {
      expect(JSON.parse(serialiseLandingCatalogue(cat, prev, () => T2)).generatedAt).toBe(
        T2.toISOString(),
      );
    }
  });

  it('writes keys in fixed order with a trailing newline, whatever the input key order', () => {
    const shuffled = {
      total: 1,
      categories: [{ templates: [{ name: 'A', id: 'a' }], order: 1, name: 'C', id: 'c' }],
    };
    const out = serialiseLandingCatalogue(shuffled, null, () => T1);
    expect(out.endsWith('}\n')).toBe(true);
    expect(out.endsWith('\n\n')).toBe(false);
    const parsed = JSON.parse(out);
    expect(Object.keys(parsed)).toEqual(['generatedAt', 'categories', 'total']);
    expect(Object.keys(parsed.categories[0])).toEqual(['id', 'name', 'order', 'templates']);
    expect(Object.keys(parsed.categories[0].templates[0])).toEqual(['id', 'name']);
    expect(out).toBe(serialiseLandingCatalogue(cat, null, () => T1));
  });

  it('round-trips the committed file byte for byte', () => {
    const text = readFileSync(OUTPUT_PATH, 'utf-8');
    expect(serialiseLandingCatalogue(buildLandingCatalogue(), text, () => T2)).toBe(text);
  });
});

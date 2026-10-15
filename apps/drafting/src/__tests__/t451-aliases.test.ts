/**
 * T-451 - judgment names out of form labels and clause names (10 signed strings), and the
 * renamed quashing form key and option ids (Ajay). A draft or brief saved with the old
 * `bhajan_lal_categories_invoked` key reads as `quashing_categories_invoked`, and the old key
 * is removed (unlike T-382, which keeps its old key). Old `grounds_for_quashing` option ids
 * read as the new ids. Modelled on t382-enrollment-rename.test.ts.
 *
 * PHASE A: the packs fir_quashing.json and quashing_528_bnss.json are not yet renamed
 * (waiting on T-447); the static pin below lists them as the only pending files.
 */
import './setupEnv';
import './setupDb';

/* eslint-disable import/order */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

import { formDataFromBrief } from '../services/brief-drafter';
import { Brief, buildBrief, buildChecklist } from '../services/intake-brief';
import {
  applyFieldAliases,
  FIELD_ALIASES,
  loadRulePack,
  OPTION_VALUE_ALIASES,
} from '../services/rule-pack.service';
import { loadTemplateConfig } from '../services/template-engine.service';
import { readFormInputs } from '../utils/case-details';
import { encrypt } from '../utils/encryption';
/* eslint-enable import/order */

jest.setTimeout(60_000);

const OLD = 'bhajan_lal_categories_invoked';
const NEW = 'quashing_categories_invoked';
const CATS = ['bhajan_lal_cat_1', 'bhajan_lal_cat_3'];
/** The one place to change if Arjun keys the option-id map on another field. */
const OPTION_FIELD = 'grounds_for_quashing';
/** The pack the option-id map is scoped to (Arjun, 15 Oct 2026); fir_quashing is not touched. */
const OPTION_PACK = 'quashing_528_bnss';

const SRC = join(__dirname, '..');
const RULES = join(SRC, 'config', 'document-rules');
const SERVICE = join(SRC, 'services', 'rule-pack.service.ts');
const ALIAS_COMMENT = '// T-451 alias, remove in the post-v1 cleanup';

// ── The real load paths with an old saved form ───────────────────────────────

describe('T-451 readFormInputs reads an old saved quashing form', () => {
  const enc = (o: unknown) => ({ formInputsEnc: encrypt(JSON.stringify(o)) });
  const plain = (o: unknown) => ({ formInputs: o });
  const shapes: Array<[string, (o: unknown) => Parameters<typeof readFormInputs>[0]]> = [
    ['encrypted', enc],
    ['plain', plain],
  ];

  describe.each(shapes)('%s row', (_n, mk) => {
    it('old saved form: new key present with the same value, old key gone', () => {
      const saved = { applicant_name: 'R', [OLD]: [...CATS] };
      const out = readFormInputs(mk(saved))!;
      expect(out[NEW]).toEqual(CATS);
      expect(OLD in out).toBe(false);
      expect(out.applicant_name).toBe('R');
    });
    it('both keys: the new one wins and the old one is removed', () => {
      const out = readFormInputs(mk({ [OLD]: ['old'], [NEW]: ['new'] }))!;
      expect(out[NEW]).toEqual(['new']);
      expect(OLD in out).toBe(false);
    });
    it('only the new key: untouched', () => {
      expect(readFormInputs(mk({ [NEW]: CATS }))).toEqual({ [NEW]: CATS });
    });
    it('old grounds_for_quashing option ids read as the new ids', () => {
      const out = readFormInputs({
        ...mk({ [OPTION_FIELD]: ['no_offence_disclosed_bhajan_lal_cat_1', 'compromise_x'] }),
        rulePackId: OPTION_PACK,
      })!;
      expect(out[OPTION_FIELD]).toEqual(['no_offence_disclosed', 'compromise_x']);
    });
    it('advocate_enrolment still keeps both keys (T-382 unchanged)', () => {
      const out = readFormInputs(mk({ advocate_enrolment: 'OLD/1' }))!;
      expect(out.advocate_enrollment).toBe('OLD/1');
      expect(out.advocate_enrolment).toBe('OLD/1');
    });
  });

  it('option ids: pack from the stored template_id when rulePackId is absent', () => {
    const out = readFormInputs(
      plain({ template_id: OPTION_PACK, [OPTION_FIELD]: ['express_legal_bar_bhajan_lal_cat_4'] }),
    )!;
    expect(out[OPTION_FIELD]).toEqual(['express_legal_bar']);
  });

  it('option ids: no pack known, or fir_quashing, leaves them alone', () => {
    const ids = ['express_legal_bar_bhajan_lal_cat_4'];
    expect(readFormInputs(plain({ [OPTION_FIELD]: ids }))![OPTION_FIELD]).toEqual(ids);
    const fir = readFormInputs({ ...plain({ [OPTION_FIELD]: ids }), rulePackId: 'fir_quashing' })!;
    expect(fir[OPTION_FIELD]).toEqual(ids);
  });

  it('the stored plain object is not mutated', () => {
    const stored = { [OLD]: [...CATS] };
    readFormInputs({ formInputs: stored });
    expect(stored).toEqual({ [OLD]: CATS });
  });
});

describe('T-451 formDataFromBrief option ids use the config template_id', () => {
  const ids = ['no_offence_disclosed_bhajan_lal_cat_1', 'compromise_x'];
  const briefOf = (key: string, value: unknown): Brief => {
    const b = buildBrief({
      kind: { id: 'default_bail', name: 'default_bail', court_document: true },
      checklist: buildChecklist(loadRulePack('default_bail')!),
      values: [],
    }) as Brief;
    return {
      ...b,
      items: [{ ...b.items[0], key, value, unconfirmed: false }],
    } as unknown as Brief;
  };
  it('quashing_528_bnss config: old ids read as new', () => {
    const cfg = { ...loadTemplateConfig('default_bail')!, template_id: OPTION_PACK };
    const fd = formDataFromBrief(briefOf(OPTION_FIELD, ids), cfg, 'en');
    expect(fd[OPTION_FIELD]).toEqual(['no_offence_disclosed', 'compromise_x']);
  });
  it('another pack config: ids are left alone', () => {
    const cfg = loadTemplateConfig('default_bail')!;
    expect(formDataFromBrief(briefOf(OPTION_FIELD, ids), cfg, 'en')[OPTION_FIELD]).toEqual(ids);
  });
});

describe('T-451 formDataFromBrief with a brief item under the old key', () => {
  const cfg = loadTemplateConfig('default_bail')!;
  const briefWith = (key: string, value: unknown): Brief => {
    const b = buildBrief({
      kind: { id: 'default_bail', name: 'default_bail', court_document: true },
      checklist: buildChecklist(loadRulePack('default_bail')!),
      values: [],
    }) as Brief;
    const item = b.items[0];
    return { ...b, items: [{ ...item, key, value, unconfirmed: false }] } as unknown as Brief;
  };

  it('old key becomes the new key and is removed', () => {
    const fd = formDataFromBrief(briefWith(OLD, ['x', 'y']), cfg, 'en');
    expect(fd[NEW]).toEqual(['x', 'y']);
    expect(OLD in fd).toBe(false);
  });
  it('new key is kept as typed', () => {
    const fd = formDataFromBrief(briefWith(NEW, ['x']), cfg, 'en');
    expect(fd[NEW]).toEqual(['x']);
    expect(OLD in fd).toBe(false);
  });
});

// ── applyFieldAliases on the key ─────────────────────────────────────────────

describe('T-451 applyFieldAliases, key rename', () => {
  it('copies old to new, deletes old', () => {
    const out = applyFieldAliases({ [OLD]: CATS });
    expect(out).toEqual({ [NEW]: CATS });
  });
  it('deletes old even when new is already present (new wins)', () => {
    expect(applyFieldAliases({ [OLD]: 'o', [NEW]: 'n' })).toEqual({ [NEW]: 'n' });
  });
  it('an explicit null/undefined new counts as present', () => {
    expect(applyFieldAliases({ [OLD]: 'o', [NEW]: null })).toEqual({ [NEW]: null });
    const out = applyFieldAliases({ [OLD]: 'o', [NEW]: undefined });
    expect(out[NEW]).toBeUndefined();
    expect(OLD in out).toBe(false);
  });
  it('new only: untouched', () => {
    expect(applyFieldAliases({ [NEW]: 'n' })).toEqual({ [NEW]: 'n' });
  });
  it('does not mutate the input, frozen input works', () => {
    const input = Object.freeze({ [OLD]: CATS, other: 1 });
    const out = applyFieldAliases(input);
    expect(input).toEqual({ [OLD]: CATS, other: 1 });
    expect(out).toEqual({ [NEW]: CATS, other: 1 });
  });
  it('an inherited old key is not treated as present', () => {
    const input = Object.create({ [OLD]: 'x' }) as Record<string, unknown>;
    expect(NEW in applyFieldAliases(input)).toBe(false);
  });
  it('advocate_enrolment keeps both keys (T-382)', () => {
    expect(applyFieldAliases({ advocate_enrolment: 'a' })).toEqual({
      advocate_enrolment: 'a',
      advocate_enrollment: 'a',
    });
  });
  it('both renames at once', () => {
    expect(applyFieldAliases({ advocate_enrolment: 'a', [OLD]: 'b' })).toEqual({
      advocate_enrolment: 'a',
      advocate_enrollment: 'a',
      [NEW]: 'b',
    });
  });
});

// ── Option ids ───────────────────────────────────────────────────────────────

const RENAMED: Array<[string, string]> = [
  ['no_offence_disclosed_bhajan_lal_cat_1', 'no_offence_disclosed'],
  ['ingredients_not_made_out_bhajan_lal_cat_2', 'ingredients_not_made_out'],
  ['facts_absurd_inherently_improbable_bhajan_lal_cat_3', 'facts_absurd_inherently_improbable'],
  ['express_legal_bar_bhajan_lal_cat_4', 'express_legal_bar'],
  ['civil_dispute_criminal_colour_bhajan_lal_cat_5', 'civil_dispute_criminal_colour'],
  ['mala_fide_personal_vendetta_bhajan_lal_cat_6', 'mala_fide_personal_vendetta'],
  ['procedural_illegality_bhajan_lal_cat_7', 'procedural_illegality'],
];

describe('T-451 option-id aliases', () => {
  const run = (v: unknown) => applyFieldAliases({ [OPTION_FIELD]: v }, OPTION_PACK)[OPTION_FIELD];

  it('the map holds exactly the seven renames for the field', () => {
    expect(Object.keys(OPTION_VALUE_ALIASES)).toEqual([OPTION_PACK]);
    expect(Object.keys(OPTION_VALUE_ALIASES[OPTION_PACK])).toEqual([OPTION_FIELD]);
    expect(Object.entries(OPTION_VALUE_ALIASES[OPTION_PACK][OPTION_FIELD])).toEqual(RENAMED);
  });
  it('the map is frozen', () => {
    expect(Object.isFrozen(OPTION_VALUE_ALIASES)).toBe(true);
    expect(Object.isFrozen(OPTION_VALUE_ALIASES[OPTION_PACK])).toBe(true);
    expect(Object.isFrozen(OPTION_VALUE_ALIASES[OPTION_PACK][OPTION_FIELD])).toBe(true);
  });
  it.each(RENAMED)('array: %s -> %s', (o, n) => {
    expect(run([o])).toEqual([n]);
  });
  it.each(RENAMED)('string: %s -> %s', (o, n) => {
    expect(run(o)).toBe(n);
  });
  it.each(RENAMED)('object keyed by option id: %s -> %s', (o, n) => {
    expect(run({ [o]: true })).toEqual({ [n]: true });
  });
  it('arrays map item by item, order kept, mixed with unmapped and non-strings', () => {
    expect(
      run(['compromise_a', 'express_legal_bar_bhajan_lal_cat_4', 'no_offence_disclosed', 7, null]),
    ).toEqual(['compromise_a', 'express_legal_bar', 'no_offence_disclosed', 7, null]);
  });
  it('old values are replaced, not kept', () => {
    const arr = run(RENAMED.map(([o]) => o)) as string[];
    expect(arr).toEqual(RENAMED.map(([, n]) => n));
    expect(JSON.stringify(arr)).not.toContain('bhajan_lal');
    const obj = run(Object.fromEntries(RENAMED.map(([o]) => [o, true])));
    expect(JSON.stringify(obj)).not.toContain('bhajan_lal');
  });
  it('compromise ids and new ids pass through unchanged', () => {
    const ids = ['compromise_settled', 'compromise_x', ...RENAMED.map(([, n]) => n)];
    expect(run(ids)).toEqual(ids);
    expect(run('compromise_settled')).toBe('compromise_settled');
    expect(run({ compromise_x: true })).toEqual({ compromise_x: true });
  });
  it('in an object, an existing new key wins over a renamed old one', () => {
    expect(
      run({ no_offence_disclosed_bhajan_lal_cat_1: 'old', no_offence_disclosed: 'new' }),
    ).toEqual({ no_offence_disclosed: 'new' });
  });
  it('pack scoping: packId wins over template_id; other packs and no pack do not map', () => {
    const ids = [RENAMED[0][0]];
    const data = { template_id: 'fir_quashing', [OPTION_FIELD]: ids };
    expect(applyFieldAliases(data, OPTION_PACK)[OPTION_FIELD]).toEqual([RENAMED[0][1]]);
    expect(
      applyFieldAliases({ ...data, template_id: OPTION_PACK }, 'fir_quashing')[OPTION_FIELD],
    ).toEqual(ids);
    expect(applyFieldAliases(data)[OPTION_FIELD]).toEqual(ids);
    expect(applyFieldAliases(data, null)[OPTION_FIELD]).toEqual(ids);
    expect(applyFieldAliases(data, '')[OPTION_FIELD]).toEqual(ids);
    expect(applyFieldAliases(data, 'default_bail')[OPTION_FIELD]).toEqual(ids);
    expect(
      applyFieldAliases({ template_id: OPTION_PACK, [OPTION_FIELD]: ids })[OPTION_FIELD],
    ).toEqual([RENAMED[0][1]]);
    expect(
      applyFieldAliases({ template_id: ' ' + OPTION_PACK + ' ', [OPTION_FIELD]: ids })[
        OPTION_FIELD
      ],
    ).toEqual([RENAMED[0][1]]);
    expect(applyFieldAliases(data, 'constructor')[OPTION_FIELD]).toEqual(ids);
  });
  it('other values pass through; other fields are not mapped', () => {
    expect(run(null)).toBeNull();
    expect(run(5)).toBe(5);
    expect(run('')).toBe('');
    expect(run([])).toEqual([]);
    const other = applyFieldAliases({ some_other_field: [RENAMED[0][0]] }, OPTION_PACK);
    expect(other.some_other_field).toEqual([RENAMED[0][0]]);
  });
  it('does not mutate the stored answer', () => {
    const arr = [RENAMED[0][0]];
    const obj = { [RENAMED[1][0]]: true };
    run(arr);
    run(obj);
    expect(arr).toEqual([RENAMED[0][0]]);
    expect(obj).toEqual({ [RENAMED[1][0]]: true });
  });
  it('prototype-ish strings are not treated as ids', () => {
    expect(run('constructor')).toBe('constructor');
    expect(run(['__proto__', 'toString'])).toEqual(['__proto__', 'toString']);
  });
});

// ── Static pins ──────────────────────────────────────────────────────────────

describe('T-451 static pins', () => {
  const service = readFileSync(SERVICE, 'utf8');

  it('the alias map keys', () => {
    expect(FIELD_ALIASES[OLD]).toBe(NEW);
  });

  it('every alias block carries the removal comment (map, deletion set, option map)', () => {
    const lines = service.split('\n');
    const at = (needle: string) => lines.findIndex((l) => l.includes(needle));
    for (const needle of [
      `${OLD}: '${NEW}'`,
      'const REPLACED_FIELD_ALIAS_KEYS',
      'export const OPTION_VALUE_ALIASES',
    ]) {
      const i = at(needle);
      expect(i).toBeGreaterThan(0);
      expect(lines[i - 1].trim()).toBe(ALIAS_COMMENT);
    }
    expect(service.split(ALIAS_COMMENT).length - 1).toBe(3);
  });

  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (name === '__tests__' || name === 'node_modules') continue;
      if (statSync(p).isDirectory()) walk(p, out);
      else if (!/\.test\.tsx?$/.test(name)) out.push(p);
    }
    return out;
  }

  it('no non-test source outside the alias map holds the old key, paragraph key or option suffix', () => {
    const re = /bhajan_lal_categories_invoked|bhajan_lal_paragraph|_bhajan_lal_cat_/;
    const hits = walk(SRC)
      .filter((p) => p !== SERVICE && re.test(readFileSync(p, 'utf8')))
      .map((p) => p.slice(SRC.length + 1))
      .sort();
    // PHASE B flips this to [] once the T-447 merge lets the two packs be renamed.
    expect(hits).toEqual([
      'config/document-rules/fir_quashing.json',
      'config/document-rules/quashing_528_bnss.json',
    ]);
  });

  it('inside rule-pack.service.ts the old names appear only in the alias block', () => {
    const lines = service.split('\n');
    const first = lines.findIndex((l) => l.includes('Field aliases (T-382)'));
    lines.forEach((l, i) => {
      if (/bhajan_lal/.test(l)) expect(i).toBeGreaterThan(first);
    });
  });
});

// ── The ten signed strings ───────────────────────────────────────────────────

describe('T-451 signed strings', () => {
  const rows: Array<[string, string, string[]]> = [
    ['curative_petition', 'Curative ground', ['Curative Ground (Rupa Ashok Hurra)']],
    [
      'divorce_mutual_consent',
      'Whether waiver of the 6-month cooling period is sought',
      ['(Amardeep Singh v. Harveen Kaur grounds)'],
    ],
    [
      'dv_act_complaint',
      'Additional respondents (in-laws, family members)',
      ['Hiral Harsora applies'],
    ],
    [
      'gpa',
      'Title disclaimer (if power to sell included)',
      ['Suraj Lamp Disclaimer (if power to sell included)'],
    ],
    ['spa', 'Title disclaimer (if power to sell)', ['Suraj Lamp Disclaimer (if power to sell)']],
    [
      'ibc_application',
      'Any pre-existing dispute disclosed by CD (S.9 — dispute raised before the demand notice) — details',
      ['(S.9 — Mobilox test)'],
    ],
    [
      'plaint_partition',
      'Female coparceners: daughters with an equal share after the Hindu Succession (Amendment) Act, 2005',
      ['(Vineeta Sharma)'],
    ],
    [
      'plaint_recovery',
      'Pre-institution mediation completed under Section 12A of the Commercial Courts Act, 2015 (if commercial and no urgent interim relief)',
      ['Patil Automation v. Rakheja Engineers (2022)'],
    ],
    [
      'rera_complaint',
      'Any previous Consumer / Civil proceedings on same cause? (the consumer remedy is concurrent)',
      ['(Pioneer Urban — concurrent remedy)'],
    ],
    [
      'service_agreement',
      'The Service Provider is engaged as an independent contractor and not as an employee, agent, partner, or joint venturer of the Client. No employer-employee relationship is created. The Service Provider is responsible for own income tax, social security, and all statutory dues."',
      ['Reference: Dharangadhara Chemical Works v. Workmen AIR 1957 SC 264 (control test).'],
    ],
  ];

  it.each(rows)('%s: new text once, old judgment text absent', (pack, text, oldNames) => {
    const raw = readFileSync(join(RULES, `${pack}.json`), 'utf8');
    expect(raw.split(text).length - 1).toBe(1);
    for (const n of oldNames) expect(raw).not.toContain(n); // the old label text only: key_citations may still name the case
  });

  it('the two clause names changed from "Suraj Lamp Disclaimer"', () => {
    for (const pack of ['gpa', 'spa']) {
      const raw = readFileSync(join(RULES, `${pack}.json`), 'utf8');
      expect(raw).not.toContain('Suraj Lamp Disclaimer');
      expect(raw).toContain('"name": "Title disclaimer (if power to sell');
    }
  });

  it('every changed pack still parses as JSON', () => {
    for (const [pack] of rows) {
      expect(() => JSON.parse(readFileSync(join(RULES, `${pack}.json`), 'utf8'))).not.toThrow();
    }
  });
});

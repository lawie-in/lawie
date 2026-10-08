/**
 * T-153 - custody status and jail on a bail application before a Magistrate.
 * Legal sign-off: AJ-2026-10-08-T153 (field block, Rule B on this kind, jail
 * asked only for judicial custody). Values are option labels, as the web sends them.
 */
import './setupEnv';
import fs from 'fs';
import path from 'path';

import {
  REGULAR_BAIL_NOT_IN_CUSTODY_WARNING,
  needsNotInCustodyWarning,
} from '../services/bail-guard';
import {
  buildBrief,
  buildChecklist,
  buildQuestions,
  checkRead,
  GivenValue,
  valuesAfterEditedDescription,
} from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { loadAllDocRules, normaliseOption } from '../services/template-promoter';
import {
  buildPlaceholderContext,
  CourtLookupData,
  loadCourtRule,
  renderTemplateSection,
  TemplateConfig,
} from '../services/template-engine.service';

const WARNING =
  'A regular bail application is usually for a client who is in custody or who will surrender before the court. If your client has not been arrested and will not surrender, you may need anticipatory bail.';
const JUDICIAL = 'Yes — Judicial custody';
const POLICE = 'Yes — Police custody';
const NO = 'No — anticipating arrest';

const MAG = buildChecklist(loadRulePack('bail_before_magistrate')!);
const REG = buildChecklist(loadRulePack('bail_regular')!);

const typed = (key: string, value: string): GivenValue => ({ key, value, source: 'user' });
function brief(values: GivenValue[] = [], kind = 'bail_before_magistrate', checklist = MAG) {
  return buildBrief({ kind: { id: kind, name: kind, court_document: true }, checklist, values });
}
const unknown = (b: ReturnType<typeof brief>) => b.still_unknown.map((u) => u.key);
const item = (b: ReturnType<typeof brief>, key: string) => b.items.find((i) => i.key === key);

describe('T-153 (1) the jail is on the brief only for judicial custody', () => {
  it('pack carries the custody choice with ids and the jail show_if', () => {
    const custody = MAG.find((i) => i.key === 'currently_in_custody')!;
    expect(custody.options).toEqual([JUDICIAL, POLICE, NO]);
    expect(custody.optionIds).toEqual(['yes_judicial', 'yes_police', 'no']);
    expect(MAG.find((i) => i.key === 'jail')!.showIf).toBe('currently_in_custody === yes_judicial');
  });

  it('judicial custody: jail is on the brief, in still_unknown, and asked', () => {
    const b = brief([typed('currently_in_custody', JUDICIAL)]);
    expect(item(b, 'jail')).toBeDefined();
    expect(unknown(b)).toContain('jail');
    expect(buildQuestions(b, new Map()).map((q) => q.key)).toContain('jail');
  });

  it.each([
    ['police custody', [typed('currently_in_custody', POLICE)]],
    ['anticipating arrest', [typed('currently_in_custody', NO)]],
    ['no answer', [] as GivenValue[]],
  ])('%s: jail is not on the brief, not in still_unknown, not asked', (_l, values) => {
    const b = brief(values);
    expect(item(b, 'jail')).toBeUndefined();
    expect(unknown(b)).not.toContain('jail');
    expect(buildQuestions(b, new Map()).map((q) => q.key)).not.toContain('jail');
  });
});

describe('T-153 (2) Rule B on bail_before_magistrate (AJ-2026-10-08-T153 condition 3)', () => {
  it('the text is Ajay\'s, word for word', () => {
    expect(REGULAR_BAIL_NOT_IN_CUSTODY_WARNING).toBe(WARNING);
  });

  it.each([
    ['anticipating arrest', [typed('currently_in_custody', NO)]],
    ['no answer', [] as GivenValue[]],
  ])('%s: the custody item carries the exact text', (_l, values) => {
    const c = item(brief(values), 'currently_in_custody')!;
    expect(c.please_check).toBe(true);
    expect(c.note).toBe(WARNING);
  });

  it('Confirm stays allowed: the warning changes neither can_confirm nor still_unknown', () => {
    const values = [typed('currently_in_custody', NO)];
    const warned = brief(values);
    const plain = brief(values, 'some_other_kind');
    expect(item(plain, 'currently_in_custody')!.note).toBeUndefined();
    expect(warned.can_confirm).toBe(plain.can_confirm);
    expect(warned.still_unknown).toEqual(plain.still_unknown);
  });

  it.each([POLICE, JUDICIAL])('%s: no warning', (v) => {
    const b = brief([typed('currently_in_custody', v)]);
    const c = item(b, 'currently_in_custody')!;
    expect(c.note).toBeUndefined();
    expect(c.please_check).toBe(false);
    expect(JSON.stringify(b)).not.toContain('you may need anticipatory bail');
    expect(needsNotInCustodyWarning('bail_before_magistrate', v)).toBe(false);
  });
});

const { configs, byFile } = loadAllDocRules();
const bail = configs.get(byFile.get('bail_before_magistrate.json')!.template_id) as TemplateConfig;
const court: CourtLookupData = {
  designation: 'IN THE COURT OF CHIEF JUDICIAL MAGISTRATE, PATNA',
  city: 'Patna',
  caseNomenclature: 'Criminal Case No. _____ of {current_year}',
  formattingRulesRef: 'cjm_generic',
  courtType: 'cjm',
  courtRule: loadCourtRule('cjm_generic') ?? undefined,
};

function verificationFor(extra: Record<string, unknown>): string {
  const ctx = buildPlaceholderContext(
    bail,
    {
      applicant_name: 'Ramesh Kumar',
      applicant_parentage: 'Suresh Kumar',
      applicant_age: '34',
      state: 'bihar',
      court_name: 'bihar_cjm_patna',
      fir_number: '12/2026',
      fir_date: '2026-09-01',
      police_station: 'Kotwali',
      ...extra,
    },
    { advocateName: 'Adv. A' },
    court,
  );
  const s = bail.document_structure.sections.find((x) => x.section_id === 'verification')!;
  return renderTemplateSection(s, ctx).content;
}

const verification = verificationFor;

describe('T-153 (3) the verification prints the custody clause only for judicial custody', () => {
  it('judicial custody and "Beur Jail, Patna"', () => {
    expect(verification({ currently_in_custody: JUDICIAL, jail: 'Beur Jail, Patna' })).toContain(
      ', currently in judicial custody at Beur Jail, Patna, do hereby verify',
    );
  });

  it.each([
    ['police custody', { currently_in_custody: POLICE }],
    ['anticipating arrest', { currently_in_custody: NO }],
    ['no answer', {}],
  ])('%s: no custody clause and no jail blank', (_l, extra) => {
    const text = verification({ ...extra, jail: 'Beur Jail, Patna' });
    expect(text).not.toMatch(/custody/i);
    expect(text).not.toContain('[To be confirmed: name of jail]');
    expect(text).not.toContain('Beur Jail');
    expect(text).toContain('aged about 34 years, do hereby verify');
  });

  it('police custody with no jail at all: no blank either', () => {
    const text = verification({ currently_in_custody: POLICE });
    expect(text).not.toContain('[To be confirmed: name of jail]');
  });
});

describe('T-153 (4) a jail read from the description fills jail only', () => {
  const desc = 'My client Ram Kumar is lodged in Beur Jail, Patna in FIR No. 124/2026.';

  it('checkRead keeps the jail and sets nothing for custody', () => {
    const r = checkRead(MAG, desc, {
      read: [{ id: 'jail', value: 'Beur Jail, Patna', quote: 'Beur Jail, Patna' }],
      conflicts: [],
      questions: [],
    });
    expect(r.values.get('jail')?.value).toBe('Beur Jail, Patna');
    expect(r.values.has('currently_in_custody')).toBe(false);
  });

  it('on the brief the jail is filled and custody stays empty, still marked by Rule B', () => {
    const r = checkRead(MAG, desc, {
      read: [{ id: 'jail', value: 'Beur Jail, Patna', quote: 'Beur Jail, Patna' }],
      conflicts: [],
      questions: [],
    });
    const edited = valuesAfterEditedDescription(MAG, r.values, r.dropped, []);
    const b = brief(edited.values);
    expect(item(b, 'jail')).toMatchObject({ value: 'Beur Jail, Patna', source: 'description' });
    expect(item(b, 'currently_in_custody')).toMatchObject({ value: null, note: WARNING });
    expect(unknown(b)).toContain('currently_in_custody');
  });
});

describe('T-153 (5) bail_regular custody_since drops off when not in custody and empty', () => {
  it('"No — anticipating arrest" and empty: not on the brief, not asked', () => {
    const b = brief([typed('currently_in_custody', NO)], 'bail_regular', REG);
    expect(item(b, 'custody_since')).toBeUndefined();
    expect(unknown(b)).not.toContain('custody_since');
    expect(buildQuestions(b, new Map()).map((q) => q.key)).not.toContain('custody_since');
  });

  it('judicial custody: custody_since is on the brief', () => {
    const b = brief([typed('currently_in_custody', JUDICIAL)], 'bail_regular', REG);
    expect(item(b, 'custody_since')).toBeDefined();
  });

  it('a custody_since the advocate gave is kept even if custody is "No"', () => {
    const b = brief(
      [typed('currently_in_custody', NO), typed('custody_since', '2026-09-13')],
      'bail_regular',
      REG,
    );
    expect(item(b, 'custody_since')?.value).toBe('2026-09-13');
  });
});

describe('T-153 Ajay conditions on the diff', () => {
  it('(1) judicial custody answered after the jail was hidden: the jail comes onto the brief and is asked', () => {
    const before = brief([typed('currently_in_custody', NO)]);
    expect(item(before, 'jail')).toBeUndefined();
    const after = brief([typed('currently_in_custody', JUDICIAL)]);
    expect(item(after, 'jail')).toMatchObject({ value: null, required: true });
    expect(unknown(after)).toContain('jail');
    expect(buildQuestions(after, new Map()).map((q) => q.key)).toContain('jail');
    expect(after.can_confirm).toBe(false);
  });

  it('(1) with no rounds left the verification prints the visible blank, never nothing', () => {
    expect(verificationFor({ currently_in_custody: JUDICIAL })).toContain(
      'currently in judicial custody at [To be confirmed: name of jail]',
    );
  });

  it('(a) a jail alone never prints "judicial custody"', () => {
    const text = verificationFor({ jail: 'Beur Jail, Patna' });
    expect(text).not.toMatch(/custody/i);
    expect(text).not.toContain('Beur Jail');
  });

  describe('(2) sweep: every show_if / depends_on in config/document-rules', () => {
    const dir = path.join(__dirname, '..', 'config', 'document-rules');
    type Obj = Record<string, unknown>;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));

    function walk(node: unknown, fields: Obj[], conds: Obj[]): void {
      if (Array.isArray(node)) return node.forEach((n) => walk(n, fields, conds));
      if (node && typeof node === 'object') {
        const o = node as Obj;
        if (typeof o.name === 'string' || typeof o.field_id === 'string') fields.push(o);
        if (typeof o.show_if === 'string' || typeof o.depends_on === 'string') conds.push(o);
        Object.values(o).forEach((v) => walk(v, fields, conds));
      }
    }

    it('finds the conditions it should', () => {
      let n = 0;
      for (const f of files) {
        const conds: Obj[] = [];
        walk(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), [], conds);
        n += conds.length;
      }
      expect(n).toBeGreaterThanOrEqual(2);
    });

    // Ids come from the code's own `normaliseOption`, never re-derived here.
    // An option with no derivable id (null) is reported, so the check fails.
    function problems(expr: string, fields: Obj[]): Obj[] {
      const m = expr.match(/^(\w+)\s*(?:!==?|===?)\s*(\w+)$/);
      if (!m) return [{ expr, parsed: false }];
      const [, field, value] = m;
      const target = fields.find((x) => (x.name ?? x.field_id ?? x.id) === field);
      if (!target) return [{ expr, found: false }];
      const opts = (target.options ?? target.enum ?? target.values) as unknown;
      if (!Array.isArray(opts) || opts.length === 0) return [];
      const ids = opts.map((o, i) => normaliseOption(o, i)?.id ?? null);
      if (ids.includes(null)) return [{ expr, ids, noDerivableId: true }];
      return ids.includes(value) ? [] : [{ expr, ids, valueNotAnOption: value }];
    }

    it.each(files)('%s: each condition names a field in the same pack, and a choice is compared with an option id', (f) => {
      const fields: Obj[] = [];
      const conds: Obj[] = [];
      walk(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), fields, conds);
      for (const c of conds) {
        expect(problems(String(c.show_if ?? c.depends_on), fields)).toEqual([]);
      }
    });

    it('the sweep passes for good ids and fails when an option has no derivable id', () => {
      const good = [{ name: 'status', options: [{ id: 'yes', label: 'Yes' }, 'No way'] }];
      expect(problems('status === yes', good)).toEqual([]);
      expect(problems('status === no_way', good)).toEqual([]);
      expect(problems('status === maybe', good)).toHaveLength(1);
      const bad = [{ name: 'status', options: ['Yes', 5] }];
      expect(problems('status === yes', bad)).toEqual([
        { expr: 'status === yes', ids: ['yes', null], noDerivableId: true },
      ]);
    });
  });
});

describe('T-153 review round 2: option ids stored as the value', () => {
  // Pinned current behaviour (reported as a finding): buildBrief places only
  // values that pass checkUserValue, which takes option LABELS. A stored id
  // (even yes_judicial) goes to `unplaced`, so the custody answer is not seen
  // and the jail stays hidden. hiddenByShowIf's id branch is not reached from here.
  it.each(['yes_judicial', 'yes_police', 'no'])('stored custody id %s: jail stays hidden', (id) => {
    const b = brief([typed('currently_in_custody', id)]);
    expect(item(b, 'jail')).toBeUndefined();
    expect(unknown(b)).not.toContain('jail');
  });
});

describe('T-153 review round 2: normaliseOption edge cases', () => {
  it('a number is unsupported: null (the form then uses opt_<idx>)', () => {
    expect(normaliseOption(5, 3)).toBeNull();
  });
  it('a string whose slug is empty gets opt_<idx>', () => {
    expect(normaliseOption('!!!', 2)).toEqual({ id: 'opt_2', label: '!!!' });
  });
  it('an object whose label slugs to nothing gets opt_<idx>', () => {
    expect(normaliseOption({ label: '???' }, 4)).toEqual({ id: 'opt_4', label: '???' });
  });
  it('{ name: "X" } has no label or id: label "Option <n>", id option_<n>', () => {
    expect(normaliseOption({ name: 'X' }, 0)).toEqual({ id: 'option_1', label: 'Option 1' });
    expect(normaliseOption({ name: 'X' }, 2)).toEqual({ id: 'option_3', label: 'Option 3' });
  });
  it('null and undefined are unsupported', () => {
    expect(normaliseOption(null, 0)).toBeNull();
    expect(normaliseOption(undefined, 0)).toBeNull();
  });
  it('an explicit id wins over the label', () => {
    expect(normaliseOption({ id: 'yes_judicial', label: 'Yes — Judicial custody' }, 0)).toEqual({
      id: 'yes_judicial',
      label: 'Yes — Judicial custody',
    });
  });
});

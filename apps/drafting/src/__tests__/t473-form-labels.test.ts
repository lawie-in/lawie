/**
 * T-473: forms showed raw internal snake_case names ("known_state_custody") as labels.
 *
 * Rules (Ajay): option and field ids stay unchanged; no judgment name in any label;
 * the internal words flag / warning / cat / type are dropped from humanised option
 * labels; two options with the same rendered text in one field, or a bare Yes / No,
 * are ambiguous.
 *
 * Covers: every promoted pack (loadAllDocRules) and the source pack JSON as shipped.
 * Does not edit packs; the allow-list below pins what the packs lack today.
 */
import './setupEnv';
import fs from 'fs';
import path from 'path';

import {
  DROPPED_OPTION_TOKENS,
  humaniseOptionLabel,
  isSnakeCaseName,
  loadAllDocRules,
  normaliseOption,
  promoteDocRuleToTemplateConfig,
} from '../services/template-promoter';
import type { FormField, TemplateConfig } from '../services/template-engine.service';

const DIR = path.join(__dirname, '..', 'config', 'document-rules');

// ── Checks (also exercised on synthetic input below, so we know they can fail) ──

/** An internal name inside text: `known_state_custody`, even inside a longer sentence. */
const SNAKE_INSIDE_RE = /[a-z0-9]+(_[a-z0-9]+)+/;

/** Judgment names and citations. Same names as t447 / t450 plus a citation shape. */
const JUDGMENT_NAMES = [
  'Suraj Lamp',
  'Bhajan Lal',
  'Dharangadhara',
  'Ponnuswamy',
  'Sharad Birdhichand',
  'Sujit Biswas',
  'Chandrappa',
  'Bachan Singh',
  'Machhi Singh',
  'Rupa Ashok Hurra',
  'Indian Oil Corp',
  'Neeharika',
  'Lily Thomas',
  'Kunhayammed',
  'Niranjan Shankar',
  'Roshan Singh',
  'Venkatachala',
  'Arunachala',
];
const JUDGMENT_RE = new RegExp(
  `${JUDGMENT_NAMES.join('|')}|\\b(?!Petitioner|Respondent|Appellant|Complainant|Accused|Plaintiff|Defendant|Licensor|Licensee)[A-Z][a-z]+ v\\.? [A-Z][a-z]+|\\(\\d{4}\\) \\d+ SCC|AIR \\d{4}`,
);

interface Rendered {
  pack: string;
  fieldId: string;
  where: string; // 'label' | 'help' | 'placeholder' | 'option <id>'
  text: string;
}

function renderedTexts(pack: string, fields: FormField[]): Rendered[] {
  const out: Rendered[] = [];
  for (const f of fields) {
    out.push({ pack, fieldId: f.field_id, where: 'label', text: f.label });
    if (f.help !== undefined) out.push({ pack, fieldId: f.field_id, where: 'help', text: f.help });
    if (f.placeholder !== undefined) {
      out.push({ pack, fieldId: f.field_id, where: 'placeholder', text: f.placeholder });
    }
    for (const o of f.options ?? []) {
      const label = typeof o === 'string' ? o : o.label;
      out.push({
        pack,
        fieldId: f.field_id,
        where: `option ${typeof o === 'string' ? o : o.id}`,
        text: label,
      });
    }
  }
  return out;
}

const describe_ = (r: Rendered): string =>
  `${r.pack}#${r.fieldId} ${r.where}: ${JSON.stringify(r.text)}`;

/** Rendered text that is an internal name. A label of '' or whitespace counts too. */
function snakeOrEmptyProblems(rendered: Rendered[]): string[] {
  return rendered
    .filter((r) => (r.where === 'label' && r.text.trim() === '') || SNAKE_INSIDE_RE.test(r.text))
    .map(describe_);
}

/** Two options of one field with the same rendered text (case and space insensitive). */
function duplicateLabelProblems(pack: string, fields: FormField[]): string[] {
  const out: string[] = [];
  for (const f of fields) {
    const seen = new Map<string, string>();
    for (const o of f.options ?? []) {
      const id = typeof o === 'string' ? o : o.id;
      const label = typeof o === 'string' ? o : o.label;
      const key = label.trim().replace(/\s+/g, ' ').toLowerCase();
      const first = seen.get(key);
      if (first !== undefined)
        out.push(`${pack}#${f.field_id}: ${first} and ${id} both read ${JSON.stringify(label)}`);
      else seen.set(key, id);
    }
  }
  return out;
}

const BARE_YES_NO_RE = /^\s*(yes|no|y|n)\s*[.!]?\s*$/i;
function bareYesNoOptions(pack: string, fields: FormField[]): string[] {
  const out: string[] = [];
  for (const f of fields) {
    for (const o of f.options ?? []) {
      const label = typeof o === 'string' ? o : o.label;
      if (BARE_YES_NO_RE.test(label)) {
        out.push(`${pack}#${f.field_id}:${typeof o === 'string' ? o : o.id}`);
      }
    }
  }
  return out.sort();
}

// ── Source pack field walker (mirrors the promoter's five shapes) ────────────────

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

interface SrcField {
  id: string;
  raw: Obj;
}

function flatFields(arr: unknown[]): SrcField[] {
  const out: SrcField[] = [];
  for (const f of arr) {
    if (!isObj(f)) continue;
    const id = [f.name, f.field_id, f.id].find((v): v is string => typeof v === 'string');
    if (id) out.push({ id, raw: f });
  }
  return out;
}

function schemaFields(schema: Obj, prefix = ''): SrcField[] {
  const out: SrcField[] = [];
  const props = isObj(schema.properties) ? schema.properties : {};
  for (const [key, val] of Object.entries(props)) {
    if (!isObj(val)) continue;
    if (val.type === 'object' && isObj(val.properties)) {
      out.push(...schemaFields(val, `${prefix}${key}.`));
      continue;
    }
    out.push({ id: `${prefix}${key}`, raw: val });
  }
  return out;
}

function sourceFields(fs_: unknown): SrcField[] {
  if (fs_ === undefined || fs_ === null) return [];
  if (Array.isArray(fs_)) return flatFields(fs_);
  if (!isObj(fs_)) return [];
  if (Array.isArray(fs_.fields)) return flatFields(fs_.fields);
  if (Array.isArray(fs_.steps)) {
    return fs_.steps.flatMap((s) =>
      isObj(s) && Array.isArray(s.fields) ? flatFields(s.fields) : [],
    );
  }
  if (fs_.type === 'object' && isObj(fs_.properties)) return schemaFields(fs_);
  const out: SrcField[] = [];
  for (const [key, sub] of Object.entries(fs_)) {
    if (!isObj(sub)) continue;
    if (typeof sub.type === 'string' && sub.type !== 'object') {
      out.push({ id: key, raw: sub });
    } else if (sub.type === 'object' && isObj(sub.properties)) {
      out.push(...schemaFields(sub, `${key}.`));
    } else if (sub.type !== 'object') {
      for (const [fk, def] of Object.entries(sub))
        if (isObj(def)) out.push({ id: `${key}.${fk}`, raw: def });
    }
  }
  return out;
}

/** "No label" = the source field has no string label, title or name (a name must not be snake_case). */
function hasUsableLabel(raw: Obj): boolean {
  if (typeof raw.label === 'string' && raw.label.trim()) return true;
  if (typeof raw.title === 'string' && raw.title.trim()) return true;
  return typeof raw.name === 'string' && raw.name.trim() !== '' && !isSnakeCaseName(raw.name);
}

function labelLessIds(fs_: unknown): string[] {
  return sourceFields(fs_)
    .filter((f) => !hasUsableLabel(f.raw))
    .map((f) => f.id);
}

// ── Real data ────────────────────────────────────────────────────────────────────

const registry = loadAllDocRules();
const packs: [string, TemplateConfig][] = [...registry.configs.entries()].sort(([a], [b]) =>
  a < b ? -1 : 1,
);
const fieldsOf = (c: TemplateConfig): FormField[] => c.form_schema.steps.flatMap((s) => s.fields);

const sourceFiles = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();
const sourceOf = (file: string): Obj =>
  JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf-8')) as Obj;

/**
 * Source fields that carry no label, title or usable name today. They render through
 * the promoter's humaniseId fallback ("Receiving Party.name"), never as snake_case.
 * Pinned so a NEW label-less field in any pack fails; shrink this list as Ajay's
 * team writes labels (pack file -> count). Do not raise a number without a reason.
 */
const LABEL_LESS_ALLOWED: Record<string, number> = {
  'aoa.json': 16,
  'distribution_agreement.json': 22,
  'employment_agreement.json': 30,
  'founders_agreement.json': 17,
  'franchise_agreement.json': 22,
  'legal_notice_consumer_deficiency.json': 1,
  'legal_notice_defamation.json': 1,
  'legal_notice_eviction.json': 2,
  'loan_agreement.json': 22,
  'moa.json': 3,
  'nda.json': 16,
  'service_agreement.json': 21,
  'shareholders_agreement.json': 20,
};

/**
 * Bare Yes / No option labels (pack#field:option_id) that exist today, listed for Ajay to
 * hand-write (34, source text "Yes"/"No"/"yes"/"no"). A NEW bare Yes / No fails the test;
 * remove an entry when its label is hand-written.
 */
const BARE_YES_NO_ALLOWED: string[] = [
  'bail_anticipatory#cooperated_with_investigation:no',
  'bail_anticipatory#cooperated_with_investigation:yes',
  'bail_anticipatory#named_in_fir:no',
  'bail_anticipatory#named_in_fir:yes',
  'bail_anticipatory#sole_earning_member:no',
  'bail_anticipatory#sole_earning_member:yes',
  'bail_before_magistrate#cooperated_with_investigation:no',
  'bail_before_magistrate#cooperated_with_investigation:yes',
  'bail_before_magistrate#named_in_fir:no',
  'bail_before_magistrate#named_in_fir:yes',
  'bail_before_magistrate#sole_earning_member:no',
  'bail_before_magistrate#sole_earning_member:yes',
  'bail_before_magistrate#sureties_available:no',
  'bail_before_magistrate#sureties_available:yes',
  'bail_regular#cooperated_with_investigation:no',
  'bail_regular#cooperated_with_investigation:yes',
  'bail_regular#named_in_fir:no',
  'bail_regular#named_in_fir:yes',
  'bail_regular#sole_earning_member:no',
  'bail_regular#sole_earning_member:yes',
  'interim_bail#cooperated_with_investigation:no',
  'interim_bail#cooperated_with_investigation:yes',
  'interim_bail#named_in_fir:no',
  'interim_bail#named_in_fir:yes',
  'interim_bail#sole_earning_member:no',
  'interim_bail#sole_earning_member:yes',
  'itat_appeal#stay_petition_filed:no',
  'itat_appeal#stay_petition_filed:yes',
  'mact_claim#insurance_validity:no',
  'mact_claim#insurance_validity:yes',
  'sale_deed#is_agricultural_land:no',
  'sale_deed#is_agricultural_land:yes',
  'surrender_application#cooperation_with_investigation:yes',
  'will#video_recording_of_execution:no',
];

describe('T-473 acceptance 2: a field with no label fails the test', () => {
  it('the check flags a field with no label, title or name, and a snake_case-only name', () => {
    const synthetic = [
      { name: 'party_one' },
      { field_id: 'receiving_party', type: 'text' },
      { id: 'a', label: '   ' },
      { name: 'Party name' },
      { field_id: 'b', label: 'Fine' },
      { field_id: 'c', title: 'Titled' },
    ];
    expect(labelLessIds(synthetic)).toEqual(['party_one', 'receiving_party', 'a']);
  });

  it('the check sees label-less fields in every source shape', () => {
    expect(labelLessIds({ fields: [{ name: 'x_y' }] })).toEqual(['x_y']);
    expect(labelLessIds({ steps: [{ fields: [{ id: 'x_y' }] }] })).toEqual(['x_y']);
    expect(labelLessIds({ type: 'object', properties: { x_y: { type: 'string' } } })).toEqual([
      'x_y',
    ]);
    expect(
      labelLessIds({
        type: 'object',
        properties: { p: { type: 'object', properties: { q: {} } } },
      }),
    ).toEqual(['p.q']);
    expect(labelLessIds({ sec: { sub_field: { type: 'string' } } })).toEqual(['sec.sub_field']);
    expect(labelLessIds({ x_y: { type: 'string', label: 'Ok' } })).toEqual([]);
  });

  it('the promoter never renders a missing label as an internal name', () => {
    const { config } = promoteDocRuleToTemplateConfig(
      {
        template_id: 't473_synthetic',
        form_schema: [
          { name: 'known_state_custody', type: 'text' },
          { field_id: 'place_of_detention', type: 'text' },
          { id: 'human', name: 'Plain Name', type: 'text' },
        ],
      },
      't473_synthetic.json',
    );
    const labels = fieldsOf(config).map((f) => f.label);
    expect(labels).toEqual(['Known State Custody', 'Place Of Detention', 'Plain Name']);
    expect(snakeOrEmptyProblems(renderedTexts('t473_synthetic', fieldsOf(config)))).toEqual([]);
  });

  it('the rendered-text check fails on a snake_case label, help, placeholder and option', () => {
    const bad: FormField[] = [
      {
        field_id: 'f',
        label: 'known_state_custody',
        type: 'dropdown',
        required: false,
        help: 'see place_of_detention',
        placeholder: 'enter_value',
        options: [{ id: 'x', label: 'known_state_custody' }],
      },
      { field_id: 'g', label: '', type: 'text', required: false },
    ];
    expect(snakeOrEmptyProblems(renderedTexts('p', bad))).toHaveLength(5);
  });

  it.each(sourceFiles)('%s: label-less source fields match the pinned allow-list', (file) => {
    const ids = labelLessIds(sourceOf(file).form_schema);
    expect({ file, count: ids.length }).toEqual({ file, count: LABEL_LESS_ALLOWED[file] ?? 0 });
  });

  it('the allow-list names only packs that exist and still have label-less fields', () => {
    for (const file of Object.keys(LABEL_LESS_ALLOWED)) expect(sourceFiles).toContain(file);
    expect(Object.values(LABEL_LESS_ALLOWED).reduce((a, b) => a + b, 0)).toBe(193);
  });

  it('the source walker finds the same fields as the promoter (guards drift)', () => {
    for (const file of sourceFiles) {
      const src = sourceOf(file);
      const promoted = registry.configs.get(
        (src.template_id as string) || (src.docType as string) || file.replace(/\.json$/, ''),
      );
      expect(promoted).toBeDefined();
      expect({ file, ids: sourceFields(src.form_schema).map((f) => f.id) }).toEqual({
        file,
        ids: fieldsOf(promoted!).map((f) => f.field_id),
      });
    }
  });
});

describe('T-473 acceptance 1: no snake_case in any rendered label, hint or option', () => {
  it('builds every shipped pack', () => {
    expect(packs.length).toBe(sourceFiles.length);
    expect(registry.mismatchReport.filter((m) => m.includes('parse/promote failed'))).toEqual([]);
  });

  it('every field of every pack has a non-empty label that is not an internal name', () => {
    const problems: string[] = [];
    for (const [id, c] of packs) {
      for (const f of fieldsOf(c)) {
        if (typeof f.label !== 'string' || f.label.trim() === '') {
          problems.push(`${id}#${f.field_id}: label ${JSON.stringify(f.label)}`);
        }
        if (isSnakeCaseName(f.label)) problems.push(`${id}#${f.field_id}: snake label ${f.label}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('no label, help, placeholder or option label in any pack is snake_case', () => {
    const problems = packs.flatMap(([id, c]) =>
      snakeOrEmptyProblems(renderedTexts(id, fieldsOf(c))),
    );
    expect(problems).toEqual([]);
  });
});

describe('T-473 ambiguity: duplicates within a field, bare Yes / No', () => {
  it('no field offers two options that read the same', () => {
    const problems = packs.flatMap(([id, c]) => duplicateLabelProblems(id, fieldsOf(c)));
    expect(problems).toEqual([]);
  });

  it('the duplicate check fails when two options read the same', () => {
    const f: FormField = {
      field_id: 'f',
      label: 'F',
      type: 'dropdown',
      required: false,
      options: [
        { id: 'a_flag_x', label: 'A x' },
        { id: 'a_x', label: 'a  X' },
      ],
    };
    expect(duplicateLabelProblems('p', [f])).toHaveLength(1);
  });

  it('humanising can create a duplicate, and the check sees it', () => {
    // flag is dropped, so these two collide: Ajay must give one of them a hand-written label.
    const a = normaliseOption('yes_flag_title', 0)!;
    const b = normaliseOption('yes_title', 1)!;
    expect(a.label).toBe(b.label);
    const f: FormField = {
      field_id: 'f',
      label: 'F',
      type: 'dropdown',
      required: false,
      options: [a, b],
    };
    expect(duplicateLabelProblems('p', [f])).toHaveLength(1);
  });

  it('bare Yes / No options are exactly the pinned list', () => {
    const found = packs.flatMap(([id, c]) => bareYesNoOptions(id, fieldsOf(c)));
    expect(found).toEqual([...BARE_YES_NO_ALLOWED].sort());
  });

  it('the bare Yes / No check catches Yes, no, Y and a humanised bare yes_flag', () => {
    const f: FormField = {
      field_id: 'f',
      label: 'F',
      type: 'dropdown',
      required: false,
      options: [
        { id: 'a', label: 'Yes' },
        { id: 'b', label: ' no ' },
        { id: 'c', label: 'Y' },
        normaliseOption('yes_flag', 3)!,
        { id: 'd', label: 'Yes, with title' },
      ],
    };
    expect(bareYesNoOptions('p', [f])).toEqual(['p#f:a', 'p#f:b', 'p#f:c', 'p#f:yes_flag']);
  });
});

describe('T-473 judgment names in rendered labels', () => {
  it('no rendered label, help, placeholder or option label names a judgment', () => {
    const problems = packs.flatMap(([id, c]) =>
      renderedTexts(id, fieldsOf(c))
        .filter((r) => JUDGMENT_RE.test(r.text))
        .map(describe_),
    );
    expect(problems).toEqual([]);
  });

  it('the judgment check fires on a name and on a citation', () => {
    for (const t of [
      'Suraj Lamp disclaimer',
      'Smith v. Jones',
      'AIR 1959 SC 443',
      '(2012) 1 SCC 656',
    ]) {
      expect(JUDGMENT_RE.test(t)).toBe(true);
    }
    expect(JUDGMENT_RE.test('Known state custody')).toBe(false);
  });
});

describe('T-473 ids are unchanged', () => {
  const optionIds = (pack: string, field: string): string[] => {
    const f = fieldsOf(registry.configs.get(pack)!).find((x) => x.field_id === field)!;
    return (f.options ?? []).map((o) => (typeof o === 'string' ? o : o.id));
  };

  it('habeas_corpus place_of_detention_known keeps its raw ids', () => {
    expect(optionIds('habeas_corpus', 'place_of_detention_known')).toEqual([
      'known_state_custody',
      'known_private_custody',
      'unknown_likely_state',
      'unknown_likely_private',
      'unknown_completely',
    ]);
  });

  it('gpa includes_power_to_sell keeps its raw ids', () => {
    expect(optionIds('gpa', 'includes_power_to_sell')).toEqual([
      'yes_flag_title_warning',
      'no_only_management',
    ]);
  });

  it('the headline example reads "Known state custody"', () => {
    const f = fieldsOf(registry.configs.get('habeas_corpus')!).find(
      (x) => x.field_id === 'place_of_detention_known',
    )!;
    expect((f.options as { id: string; label: string }[])[0]).toEqual({
      id: 'known_state_custody',
      label: 'Known state custody',
    });
  });

  it('for every pack, every string option keeps the id it had before (slug of the raw text)', () => {
    const slug = (s: string): string =>
      s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 60);
    const problems: string[] = [];
    for (const file of sourceFiles) {
      const src = sourceOf(file);
      const promoted = registry.configs.get(
        (src.template_id as string) || (src.docType as string) || file.replace(/\.json$/, ''),
      )!;
      const byId = new Map(fieldsOf(promoted).map((f) => [f.field_id, f]));
      for (const sf of sourceFields(src.form_schema)) {
        const raw = Array.isArray(sf.raw.options)
          ? sf.raw.options
          : Array.isArray(sf.raw.enum)
            ? sf.raw.enum
            : [];
        const got = (byId.get(sf.id)?.options ?? []).map((o) => (typeof o === 'string' ? o : o.id));
        const want = raw.map((o, i) =>
          typeof o === 'string'
            ? slug(o) || `opt_${i}`
            : isObj(o) && typeof o.id === 'string' && o.id
              ? o.id
              : isObj(o)
                ? slug(typeof o.label === 'string' ? o.label : String(o.id ?? `Option ${i + 1}`)) ||
                  `opt_${i}`
                : `opt_${i}`,
        );
        if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${file}#${sf.id}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('an authored human label is kept verbatim and its id is not touched', () => {
    expect(normaliseOption({ id: 'known_state_custody', label: 'Held by the State' }, 0)).toEqual({
      id: 'known_state_custody',
      label: 'Held by the State',
    });
  });

  it('an object option whose label is missing or equals its id is humanised; the id stays', () => {
    expect(normaliseOption({ id: 'known_state_custody' }, 0)).toEqual({
      id: 'known_state_custody',
      label: 'Known state custody',
    });
    expect(normaliseOption({ id: 'known_state_custody', label: 'known_state_custody' }, 0)).toEqual(
      {
        id: 'known_state_custody',
        label: 'Known state custody',
      },
    );
  });

  it('a string option gets a humanised label and the slug of the raw text as id', () => {
    expect(normaliseOption('known_state_custody', 0)).toEqual({
      id: 'known_state_custody',
      label: 'Known state custody',
    });
    expect(normaliseOption('Held by State', 0)).toEqual({
      id: 'held_by_state',
      label: 'Held by State',
    });
    expect(normaliseOption(42, 3)).toBeNull();
  });
});

describe('T-473 humaniseOptionLabel', () => {
  it('turns a snake_case name into sentence case', () => {
    expect(humaniseOptionLabel('known_state_custody')).toBe('Known state custody');
    expect(humaniseOptionLabel('unknown_completely')).toBe('Unknown completely');
  });

  it('drops the whole tokens flag, warning, cat and type', () => {
    expect([...DROPPED_OPTION_TOKENS].sort()).toEqual(['cat', 'flag', 'type', 'warning']);
    expect(humaniseOptionLabel('yes_flag_title_warning')).toBe('Yes title');
    expect(humaniseOptionLabel('mortgage_type_simple')).toBe('Mortgage simple');
    expect(humaniseOptionLabel('flag_unclear_title')).toBe('Unclear title');
  });

  it('drops cat together with the number that follows it, but keeps category and typed', () => {
    expect(humaniseOptionLabel('cat_1_urgent_matter')).toBe('Urgent matter');
    expect(humaniseOptionLabel('category_1_no_offence_disclosed')).toBe(
      'Category 1 no offence disclosed',
    );
    expect(humaniseOptionLabel('typed_name_only')).toBe('Typed name only');
    expect(humaniseOptionLabel('subtype_a')).toBe('Subtype a');
  });

  it('drops nothing when every token would be dropped', () => {
    expect(humaniseOptionLabel('flag_warning')).toBe('Flag warning');
    expect(humaniseOptionLabel('cat_type')).toBe('Cat type');
  });

  it('upper-cases known abbreviations and section / order tokens, once, without adding words', () => {
    expect(humaniseOptionLabel('fir_registered_bnss')).toBe('FIR registered BNSS');
    expect(humaniseOptionLabel('hc_slp_pending')).toBe('HC SLP pending');
    expect(humaniseOptionLabel('under_s419_cpc')).toBe('Under S419 CPC');
    expect(humaniseOptionLabel('o11_rule_application')).toBe('O11 rule application');
    expect(humaniseOptionLabel('sec_48a_notice')).toBe('Sec 48A notice');
    expect(humaniseOptionLabel('bnss_first')).toBe('BNSS first');
  });

  it('keeps digit tokens as they are', () => {
    expect(humaniseOptionLabel('option_2_chosen')).toBe('Option 2 chosen');
    expect(humaniseOptionLabel('year_2024')).toBe('Year 2024');
  });

  it('returns anything that is not bare snake_case unchanged', () => {
    for (const t of [
      'Known State Custody',
      'known state custody',
      'known-state-custody',
      'Held by the State',
      'S.100 BNSS',
      'single',
      'flag',
      '',
      '_leading',
      'trailing_',
      'double__underscore',
      'with_ünïcode',
    ]) {
      expect(humaniseOptionLabel(t)).toBe(t);
    }
  });

  it('is pure and idempotent on its own output', () => {
    const once = humaniseOptionLabel('yes_flag_title_warning');
    expect(humaniseOptionLabel(once)).toBe(once);
    expect(humaniseOptionLabel('known_state_custody')).toBe(
      humaniseOptionLabel('known_state_custody'),
    );
  });

  it('isSnakeCaseName needs two or more letter/digit tokens joined by single underscores', () => {
    expect(isSnakeCaseName('known_state_custody')).toBe(true);
    expect(isSnakeCaseName('a_1')).toBe(true);
    expect(isSnakeCaseName('Known_state')).toBe(true);
    expect(isSnakeCaseName('wife_rape_sodomy_27_1A_i')).toBe(true);
    expect(isSnakeCaseName('known')).toBe(false);
    expect(isSnakeCaseName('known state')).toBe(false);
    expect(isSnakeCaseName('double__underscore')).toBe(false);
  });

  it('humanises mixed-case ids, keeping authored capitals (the 22 formerly missed options)', () => {
    const cases: [string, string][] = [
      ['wife_rape_sodomy_27_1A_i', 'Wife rape sodomy 27 1A i'],
      ['wife_decree_maintenance_27_1A_ii', 'Wife decree maintenance 27 1A II'], // roman 'ii' is in the acronym list,
      ['yes_194_IB', 'Yes 194 IB'],
      ['yes_194_I', 'Yes 194 I'],
      ['GWA_1890_secular', 'GWA 1890 secular'],
      ['HMGA_1956_hindu', 'HMGA 1956 hindu'],
      ['revocable_per_S126_grounds', 'Revocable per S126 grounds'],
      ['uttar_pradesh_RERA_UPRERA', 'Uttar pradesh RERA UPRERA'],
      ['action_under_indian_penal_law_BNS', 'Action under indian penal law BNS'],
    ];
    for (const [id, label] of cases) expect(humaniseOptionLabel(id)).toBe(label);
    expect(humaniseOptionLabel('Known_state')).toBe('Known state');
    // ids stay exactly as authored
    expect(normaliseOption('GWA_1890_secular', 0)).toEqual({
      id: 'gwa_1890_secular',
      label: 'GWA 1890 secular',
    });
  });
});

describe('T-473 field label fallback in the promoter', () => {
  const labelOf = (field: Obj): string => {
    const { config } = promoteDocRuleToTemplateConfig(
      { template_id: 't473_fallback', form_schema: [field] },
      't473_fallback.json',
    );
    return fieldsOf(config)[0].label;
  };

  it('label wins, then title, then a human name, then the humanised id', () => {
    expect(labelOf({ name: 'x_y', label: 'L', title: 'T' })).toBe('L');
    expect(labelOf({ name: 'x_y', title: 'T' })).toBe('T');
    expect(labelOf({ name: 'Claimant name', type: 'text' })).toBe('Claimant name');
    expect(labelOf({ name: 'claimant_name', type: 'text' })).toBe('Claimant Name');
  });
});

/**
 * T-393 — a bail draft never prints "S/o" for a woman, or for anyone whose
 * relation was not given. Legal source: handoff/legal/T-359-no-added-facts-signed.md
 * (dff323f), AC6 and its Addendum.
 *
 * Criterion 1: the relation word comes from the party's data (S/o, D/o, W/o, H/o).
 * Criterion 2: when it is not given, the signed blanks print, never S/o, and the
 *   relation is never inferred from the applicant's sex.
 * Criterion 3: both paths: the engine (verification and cause title) and the
 *   legacy post-processor.
 * Criterion 4: a woman-applicant case in each pack, and the Magistrate
 *   verification for a woman applicant has no "S/o" (the equivalent of the
 *   it.failing on the T-373 branch, which is not edited here).
 *
 * The seven packs render their verification from the document-rules registry.
 * bail_regular and bail_anticipatory also have a docs/templates override whose
 * cause title carries the relation; its verification is `{verification_text}`
 * (the court rule's format), which prints no relation, so only the cause title
 * is checked on that side.
 */
import './setupEnv';

import { generateVerificationClause } from '../services/post-processor';
import { resolveDocRule } from '../services/prompt-assembler';
import { loadAllDocRules } from '../services/template-promoter';
import {
  buildPlaceholderContext,
  CourtLookupData,
  loadCourtRule,
  loadTemplateConfig,
  normaliseRelation,
  PARENT_NAME_BLANK,
  RELATION_BLANK,
  RELATION_ONLY_BLANK,
  relationLine,
  relationLineFor,
  renderTemplateSection,
  sectionContext,
  TemplateConfig,
} from '../services/template-engine.service';

jest.mock('../services/sections.service', () => ({
  convertOldReferencesInText: jest.fn(async (text) => ({ converted: text, conversions: [] })),
}));

const NAME = 'Ramesh Prasad';
const WOMAN = 'Sunita Devi';

// The signed text, written out here so a change to the constants fails a test.
const SIGNED_NEITHER = '[To be confirmed: relation and name of parent or spouse]';
const SIGNED_NAME_ONLY = (n: string) => `[To be confirmed: relation] ${n}`;
const SIGNED_REL_ONLY = (r: string) => `${r} [To be confirmed: name of parent or spouse]`;

describe('T-393 signed constants', () => {
  it('are the text Ajay signed', () => {
    expect(RELATION_BLANK).toBe(SIGNED_NEITHER);
    expect(RELATION_ONLY_BLANK).toBe('[To be confirmed: relation]');
    expect(PARENT_NAME_BLANK).toBe('[To be confirmed: name of parent or spouse]');
  });
});

describe('T-393 normaliseRelation', () => {
  it.each([
    ['S/o', 'S/o'],
    ['s/o', 'S/o'],
    ['S.o', 'S/o'],
    ['SO', 'S/o'],
    ['Son of', 'S/o'],
    ['son_of', 'S/o'],
    ['Son of (S/o)', 'S/o'],
    ['  son of  ', 'S/o'],
    ['D/o', 'D/o'],
    ['d/o', 'D/o'],
    ['Daughter of', 'D/o'],
    ['daughter_of', 'D/o'],
    ['Daughter of (D/o)', 'D/o'],
    ['W/o', 'W/o'],
    ['w/o', 'W/o'],
    ['Wife of', 'W/o'],
    ['wife_of', 'W/o'],
    ['Wife of (W/o)', 'W/o'],
    ['H/o', 'H/o'],
    ['h/o', 'H/o'],
    ['Husband of', 'H/o'],
    ['husband_of', 'H/o'],
    ['Husband of (H/o)', 'H/o'],
  ])('%p is %p', (given, expected) => {
    expect(normaliseRelation(given)).toBe(expected);
  });

  it.each([
    [undefined],
    [null],
    [''],
    ['   '],
    ['Female'],
    ['female'],
    ['Male'],
    ['father'],
    ['Mother of'],
    ['son/daughter/wife of'],
    ['[To be confirmed: relation]'],
    [42],
    [{}],
  ])('%p is not a relation', (given) => {
    expect(normaliseRelation(given)).toBeUndefined();
  });
});

describe('T-393 relationLine: the four outcomes', () => {
  it('both given: the relation and the name', () => {
    expect(relationLine('S/o', NAME)).toBe(`S/o ${NAME}`);
    expect(relationLine('D/o', NAME)).toBe(`D/o ${NAME}`);
    expect(relationLine('W/o', NAME)).toBe(`W/o ${NAME}`);
    expect(relationLine('H/o', NAME)).toBe(`H/o ${NAME}`);
    expect(relationLine('daughter_of', `  ${NAME} `)).toBe(`D/o ${NAME}`);
  });

  it('name only: the relation blank, then the name', () => {
    expect(relationLine(undefined, NAME)).toBe(SIGNED_NAME_ONLY(NAME));
    expect(relationLine('', NAME)).toBe(SIGNED_NAME_ONLY(NAME));
    expect(relationLine('Female', NAME)).toBe(SIGNED_NAME_ONLY(NAME));
  });

  it('relation only: the relation, then the name blank', () => {
    expect(relationLine('W/o', undefined)).toBe(SIGNED_REL_ONLY('W/o'));
    expect(relationLine('D/o', '')).toBe(SIGNED_REL_ONLY('D/o'));
    expect(relationLine('H/o', '   ')).toBe(SIGNED_REL_ONLY('H/o'));
  });

  it('neither: the full blank', () => {
    expect(relationLine(undefined, undefined)).toBe(SIGNED_NEITHER);
    expect(relationLine('', '')).toBe(SIGNED_NEITHER);
    expect(relationLine(null, null)).toBe(SIGNED_NEITHER);
  });

  it('a "[To be confirmed: ...]" name counts as not given', () => {
    expect(relationLine('W/o', '[To be confirmed: name of parent or spouse]')).toBe(
      SIGNED_REL_ONLY('W/o'),
    );
    expect(relationLine(undefined, '[To be confirmed: father name]')).toBe(SIGNED_NEITHER);
  });

  it('never prints S/o unless S/o was given', () => {
    for (const rel of [undefined, '', 'D/o', 'W/o', 'H/o', 'Female']) {
      for (const name of [undefined, '', NAME]) {
        expect(relationLine(rel, name)).not.toContain('S/o');
      }
    }
  });
});

describe('T-393 relationLineFor: reads the party data, never the sex', () => {
  it.each([['Female'], ['female'], ['Male'], ['Other'], ['Transgender']])(
    'applicant_sex %p alone gives the full blank',
    (sex) => {
      expect(relationLineFor({ applicant_sex: sex })).toBe(SIGNED_NEITHER);
    },
  );

  it.each([['Female'], ['Male']])(
    'applicant_sex %p with a name gives the name-only blank',
    (sex) => {
      expect(relationLineFor({ applicant_sex: sex, father_name: NAME })).toBe(
        SIGNED_NAME_ONLY(NAME),
      );
    },
  );

  it('a woman with S/o given keeps S/o (as given)', () => {
    expect(
      relationLineFor({ applicant_sex: 'Female', applicant_relation: 'S/o', father_name: NAME }),
    ).toBe(`S/o ${NAME}`);
  });

  it.each(['applicant_relation', 'relation_type', 'relation'])(
    'reads the relation from %s',
    (key) => {
      expect(relationLineFor({ [key]: 'W/o', father_name: NAME })).toBe(`W/o ${NAME}`);
    },
  );

  it.each([
    'father_name',
    'applicant_parentage',
    'applicant_father_name',
    'appellant_parentage',
    'parentName',
  ])('reads the name from %s', (key) => {
    expect(relationLineFor({ applicant_relation: 'D/o', [key]: NAME })).toBe(`D/o ${NAME}`);
  });

  it('skips an unusable relation source and uses the next one that is a relation', () => {
    expect(
      relationLineFor({ applicant_relation: 'Female', relation_type: 'H/o', father_name: NAME }),
    ).toBe(`H/o ${NAME}`);
  });
});

// ── Engine path: seven packs ────────────────────────────────────────────────

const { configs, byFile } = loadAllDocRules();

interface Pack {
  file: string;
  nameKey: string;
  parentKey: string;
  hasCauseTitle: boolean;
  extra: Record<string, unknown>;
}

const PACKS: Pack[] = [
  {
    file: 'bail_before_magistrate',
    nameKey: 'applicant_name',
    parentKey: 'applicant_parentage',
    hasCauseTitle: false,
    extra: {},
  },
  {
    file: 'default_bail',
    nameKey: 'applicant_name',
    parentKey: 'applicant_parentage',
    hasCauseTitle: false,
    extra: {},
  },
  {
    file: 'bail_regular',
    nameKey: 'applicant_name',
    parentKey: 'father_name',
    hasCauseTitle: true,
    extra: {},
  },
  {
    file: 'bail_anticipatory',
    nameKey: 'applicant_name',
    parentKey: 'father_name',
    hasCauseTitle: true,
    extra: {},
  },
  {
    file: 'interim_bail',
    nameKey: 'applicant_name',
    parentKey: 'applicant_parentage',
    hasCauseTitle: false,
    extra: {},
  },
  {
    file: 'surrender_application',
    nameKey: 'applicant_name',
    parentKey: 'applicant_parentage',
    hasCauseTitle: false,
    extra: {},
  },
  {
    file: 'suspension_of_sentence',
    nameKey: 'appellant_name',
    parentKey: 'appellant_parentage',
    hasCauseTitle: false,
    extra: {},
  },
];

function registryConfig(file: string): TemplateConfig {
  return configs.get(byFile.get(`${file}.json`)!.template_id) as TemplateConfig;
}

const COURT_DATA: CourtLookupData = {
  designation: 'DISTRICT & SESSIONS JUDGE, PATNA',
  city: 'Patna',
  caseNomenclature: 'Criminal Miscellaneous Case No. _____ of {current_year}',
  formattingRulesRef: 'bihar_district',
  courtType: 'sessions',
  courtRule: loadCourtRule('bihar_district') ?? undefined,
};

function section(config: TemplateConfig, id: string): string {
  const sec = config.document_structure.sections.find((s) => s.section_id === id);
  expect(sec).toBeDefined();
  const ctx = buildPlaceholderContext(config, currentForm, { advocateName: 'Adv. A' }, COURT_DATA);
  return renderTemplateSection(sec!, sectionContext(sec!, ctx)).content;
}

let currentForm: Record<string, unknown> = {};

function render(
  file: string,
  sectionId: 'verification' | 'cause_title',
  form: Record<string, unknown>,
): string {
  currentForm = {
    applicant_age: '34',
    address: 'Village Rampur, Ranchi',
    state: 'bihar',
    fir_number: '12/2026',
    fir_date: '2026-09-01',
    police_station: 'Kotwali',
    ...form,
  };
  const config =
    sectionId === 'cause_title'
      ? (loadTemplateConfig(file) as TemplateConfig)
      : registryConfig(file);
  return section(config, sectionId);
}

function formFor(p: Pack, rel?: string, parent?: string): Record<string, unknown> {
  const f: Record<string, unknown> = {
    [p.nameKey]: WOMAN,
    applicant_sex: 'Female',
    court_name: 'bihar_sessions_patna',
  };
  if (rel !== undefined) f.applicant_relation = rel;
  if (parent !== undefined) f[p.parentKey] = parent;
  return f;
}

describe.each(PACKS)('T-393 engine: $file, a woman applicant', (p) => {
  const targets: Array<'verification' | 'cause_title'> = p.hasCauseTitle
    ? ['verification', 'cause_title']
    : ['verification'];

  describe.each(targets)('%s', (target) => {
    const out = (rel?: string, parent?: string) => render(p.file, target, formFor(p, rel, parent));
    const verifyHas = (text: string, rel?: string, parent?: string) => {
      const t = out(rel, parent);
      expect(t).toContain(text);
      return t;
    };

    it('(a) no relation, no name: the full blank, no S/o', () => {
      const t = verifyHas(SIGNED_NEITHER);
      expect(t).not.toContain('S/o');
      // suspension_of_sentence prints "I, _____," for the name: {appellant} has no
      // alias to appellant_name (not T-393; reported to the lead as a finding).
      if (p.file !== 'suspension_of_sentence') expect(t).toContain(WOMAN);
    });

    it('(b) name only: "[To be confirmed: relation] {name}", no S/o', () => {
      const t = verifyHas(SIGNED_NAME_ONLY(NAME), undefined, NAME);
      expect(t).not.toContain('S/o');
      expect(t).not.toContain(SIGNED_NEITHER);
    });

    it('(c) D/o + name: "D/o {name}"', () => {
      const t = verifyHas(`D/o ${NAME}`, 'D/o', NAME);
      expect(t).not.toContain('S/o');
      expect(t).not.toContain('[To be confirmed: relation');
    });

    it('(d) W/o + name: "W/o {name}"', () => {
      const t = verifyHas(`W/o ${NAME}`, 'W/o', NAME);
      expect(t).not.toContain('S/o');
      expect(t).not.toContain('[To be confirmed: relation');
    });

    it('(e) H/o + name: "H/o {name}"', () => {
      const t = verifyHas(`H/o ${NAME}`, 'H/o', NAME);
      expect(t).not.toContain('S/o');
      expect(t).not.toContain('[To be confirmed: relation');
    });

    it('relation only: "W/o [To be confirmed: name of parent or spouse]"', () => {
      const t = verifyHas(SIGNED_REL_ONLY('W/o'), 'W/o');
      expect(t).not.toContain('S/o');
    });

    it('S/o is printed when S/o was given, even for a woman (as given, not inferred)', () => {
      verifyHas(`S/o ${NAME}`, 'S/o', NAME);
    });

    it('a man with no relation given also gets the blank, not S/o (never inferred from sex)', () => {
      const t = render(p.file, target, { ...formFor(p, undefined, NAME), applicant_sex: 'Male' });
      expect(t).toContain(SIGNED_NAME_ONLY(NAME));
      expect(t).not.toContain('S/o');
    });

    it('accepts the dropdown ids of the form (son_of, daughter_of, wife_of, husband_of)', () => {
      expect(out('daughter_of', NAME)).toContain(`D/o ${NAME}`);
      expect(out('wife_of', NAME)).toContain(`W/o ${NAME}`);
      expect(out('husband_of', NAME)).toContain(`H/o ${NAME}`);
      expect(out('son_of', NAME)).toContain(`S/o ${NAME}`);
    });
  });
});

describe('T-393 engine: the packs offer the relation and name the field for mother or spouse', () => {
  it.each(PACKS.map((p) => [p.file, p] as const))(
    '%s has an optional applicant_relation field',
    (file) => {
      const fields = registryConfig(file).form_schema.steps.flatMap((s) => s.fields);
      const rel = fields.find((f) => f.field_id === 'applicant_relation');
      expect(rel).toBeDefined();
      expect(rel!.required).not.toBe(true);
    },
  );

  it.each(['bail_regular', 'bail_anticipatory'])(
    'docs/templates %s has the relation dropdown before father_name',
    (id) => {
      const ids = (loadTemplateConfig(id) as TemplateConfig).form_schema.steps
        .flatMap((s) => s.fields)
        .map((f) => f.field_id);
      expect(ids).toContain('applicant_relation');
      expect(ids.indexOf('applicant_relation')).toBeLessThan(ids.indexOf('father_name'));
    },
  );
});

// ── The T-373 equivalent ────────────────────────────────────────────────────

describe('T-393 Magistrate verification for a woman applicant (equivalent of the T-373 it.failing)', () => {
  const magistrate = PACKS[0];

  it('has no "S/o" when she gave a name and no relation', () => {
    const v = render(magistrate.file, 'verification', formFor(magistrate, undefined, NAME));
    expect(v).not.toContain('S/o');
    expect(v).toContain(`I, ${WOMAN}, ${SIGNED_NAME_ONLY(NAME)}, aged about 34 years`);
  });

  it('has no "S/o" when she gave nothing about the relation', () => {
    const v = render(magistrate.file, 'verification', formFor(magistrate));
    expect(v).not.toContain('S/o');
    expect(v).toContain(`I, ${WOMAN}, ${SIGNED_NEITHER}, aged about 34 years`);
  });

  it('prints W/o when she gave W/o', () => {
    const v = render(magistrate.file, 'verification', formFor(magistrate, 'W/o', NAME));
    expect(v).not.toContain('S/o');
    expect(v).toContain(`I, ${WOMAN}, W/o ${NAME}, aged about 34 years`);
  });
});

// ── The AI identity guard ───────────────────────────────────────────────────

describe('T-393 engine: ctx.parent_relation is the server value', () => {
  const cfg = () => loadTemplateConfig('bail_regular') as TemplateConfig;

  it('ignores a client-sent parent_relation / parentRelation', () => {
    const ctx = buildPlaceholderContext(
      cfg(),
      {
        applicant_name: WOMAN,
        applicant_sex: 'Female',
        parent_relation: 'S/o Evil',
        parentRelation: 'S/o Evil',
      },
      {},
      COURT_DATA,
    );
    expect(ctx.parent_relation).toBe(SIGNED_NEITHER);
    expect(String(ctx.parentRelation ?? SIGNED_NEITHER)).not.toContain('S/o');
  });
});

// ── Legacy post-processor path ──────────────────────────────────────────────

describe('T-393 legacy path: generateVerificationClause', () => {
  const bail = () => resolveDocRule('bail_regular');
  const base = { applicant: WOMAN, age: '34', address: 'Village Rampur, Ranchi' };

  it('prints W/o as given', () => {
    const out = generateVerificationClause(
      bail(),
      { ...base, applicant_relation: 'W/o', fatherName: NAME },
      'Court',
    );
    expect(out).toContain(`I, ${WOMAN}, W/o ${NAME}, aged about 34 years`);
    expect(out).not.toContain('S/o');
  });

  it('prints the full blank when nothing is given, never S/o', () => {
    const out = generateVerificationClause(bail(), {}, 'Court');
    expect(out).toContain(SIGNED_NEITHER);
    expect(out).not.toContain('S/o');
    expect(out).not.toContain('[PARENT NAME]');
  });

  it('prints the name-only blank when the relation is not given', () => {
    const out = generateVerificationClause(bail(), { ...base, fatherName: NAME }, 'Court');
    expect(out).toContain(SIGNED_NAME_ONLY(NAME));
    expect(out).not.toContain('S/o');
  });

  it('prints the relation-only blank when the name is not given', () => {
    const out = generateVerificationClause(bail(), { ...base, applicant_relation: 'D/o' }, 'Court');
    expect(out).toContain(SIGNED_REL_ONLY('D/o'));
  });

  it.each(['relation_type', 'relation'])('reads the relation from %s too', (key) => {
    const out = generateVerificationClause(
      bail(),
      { ...base, [key]: 'H/o', parentName: NAME },
      'Court',
    );
    expect(out).toContain(`H/o ${NAME}`);
  });

  it.each(PACKS.map((p) => p.file))(
    '%s: W/o is printed, and nothing given prints no S/o',
    (file) => {
      const rule = resolveDocRule(file);
      expect(rule).not.toBeNull();
      const given = generateVerificationClause(
        rule,
        { ...base, applicant_relation: 'W/o', fatherName: NAME },
        'Court',
      );
      expect(given).toContain(`W/o ${NAME}`);
      expect(given).not.toContain('S/o');
      const none = generateVerificationClause(rule, base, 'Court');
      expect(none).toContain(SIGNED_NEITHER);
      expect(none).not.toContain('S/o');
    },
  );
});

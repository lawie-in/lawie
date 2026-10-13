/**
 * T-395 — the suspension-of-sentence verification prints the appellant's name.
 * Legal content: Ajay checks the printed text.
 *
 * Criterion 1: the verification prints the appellant's name as given in the form.
 * Criterion 2: with no name given it stays the blank, `I, _____,`.
 * Criterion 3: this file pins 1 and 2 (and the cause titles that use `{appellant}`).
 * Criterion 4 (Ajay checks the text) is a human step, not a unit test.
 */
import './setupEnv';

import { generateVerificationClause } from '../services/post-processor';
import { resolveDocRule } from '../services/prompt-assembler';
import { loadAllDocRules } from '../services/template-promoter';
import {
  buildPlaceholderContext,
  clientFormData,
  CourtLookupData,
  loadCourtRule,
  PLACEHOLDER_ALIASES,
  renderTemplateSection,
  sectionContext,
  TemplateConfig,
} from '../services/template-engine.service';

jest.mock('../services/sections.service', () => ({
  convertOldReferencesInText: jest.fn(async (text) => ({ converted: text, conversions: [] })),
}));

const { configs, byFile } = loadAllDocRules();

const NAME = 'Sunita Devi';
const OTHER = 'Mallory Impostor';

const COURT_DATA: CourtLookupData = {
  designation: 'DISTRICT & SESSIONS JUDGE, PATNA',
  city: 'Patna',
  caseNomenclature: 'Criminal Miscellaneous Case No. _____ of {current_year}',
  formattingRulesRef: 'bihar_district',
  courtType: 'sessions',
  courtRule: loadCourtRule('bihar_district') ?? undefined,
};

function config(file: string): TemplateConfig {
  return configs.get(byFile.get(`${file}.json`)!.template_id) as TemplateConfig;
}

function render(
  file: string,
  sectionId: 'verification' | 'cause_title',
  form: Record<string, unknown>,
): string {
  const cfg = config(file);
  const sec = cfg.document_structure.sections.find((s) => s.section_id === sectionId);
  expect(sec).toBeDefined();
  const data = { state: 'bihar', ...form };
  const ctx = buildPlaceholderContext(cfg, data, { advocateName: 'Adv. A' }, COURT_DATA);
  return renderTemplateSection(sec!, sectionContext(sec!, ctx)).content;
}

describe('T-395 suspension_of_sentence verification', () => {
  it('prints the appellant name as given', () => {
    const t = render('suspension_of_sentence', 'verification', { appellant_name: NAME });
    expect(t).toContain(`I, ${NAME},`);
    expect(t).not.toContain('I, _____,');
  });

  it('prints the name as given, not altered', () => {
    const t = render('suspension_of_sentence', 'verification', {
      appellant_name: 'Ravi Shankar Prasad Singh',
    });
    expect(t).toContain('I, Ravi Shankar Prasad Singh,');
  });

  it('keeps the blank when no name is given', () => {
    const t = render('suspension_of_sentence', 'verification', {});
    expect(t).toContain('I, _____,');
  });

  it.each([[''], [undefined], [null]])('keeps the blank when the name is %p', (v) => {
    const t = render('suspension_of_sentence', 'verification', { appellant_name: v });
    expect(t).toContain('I, _____,');
  });
});

describe('T-395 suspension_of_sentence verification age', () => {
  it('prints the age from appellant_age', () => {
    const t = render('suspension_of_sentence', 'verification', {
      appellant_name: NAME,
      appellant_age: '52',
    });
    expect(t).toContain('aged about 52 years');
  });
});

describe('T-395 legacy path: generateVerificationClause', () => {
  const rule = () => resolveDocRule('suspension_of_sentence');

  it('prints the appellant name, not a literal {appellant}', () => {
    const out = generateVerificationClause(rule(), { appellant_name: NAME }, 'Court');
    expect(out).toContain(`I, ${NAME},`);
    expect(out).not.toContain('{appellant}');
  });

  it('prefers partyDetails.appellant when given', () => {
    const out = generateVerificationClause(rule(), { appellant: NAME }, 'Court');
    expect(out).toContain(`I, ${NAME},`);
    expect(out).not.toContain('{appellant}');
  });

  it('never leaves a literal {appellant} when no name is given', () => {
    const out = generateVerificationClause(rule(), {}, 'Court');
    expect(out).not.toContain('{appellant}');
  });
});

describe('T-395 cause titles use the appellant name', () => {
  it.each(['suspension_of_sentence', 'criminal_appeal', 'itat_appeal'])(
    '%s cause title prints the name when given',
    (file) => {
      const t = render(file, 'cause_title', { appellant_name: NAME });
      expect(t).toContain(NAME);
    },
  );
});

describe('T-395 a client-sent `appellant` cannot override the alias', () => {
  it('appellant is a server-only alias key', () => {
    expect(PLACEHOLDER_ALIASES.some(([alias]) => alias === 'appellant')).toBe(true);
    const { kept, dropped } = clientFormData(config('suspension_of_sentence'), {
      appellant: OTHER,
      appellant_name: NAME,
    });
    expect(dropped).toContain('appellant');
    expect(kept.appellant).toBeUndefined();
    expect(kept.appellant_name).toBe(NAME);
  });

  it('a name sent only as `appellant` leaves the verification blank', () => {
    const { kept } = clientFormData(config('suspension_of_sentence'), { appellant: OTHER });
    const t = render('suspension_of_sentence', 'verification', kept);
    expect(t).toContain('I, _____,');
    expect(t).not.toContain(OTHER);
  });

  it('with both sent, the verification prints appellant_name only', () => {
    const { kept } = clientFormData(config('suspension_of_sentence'), {
      appellant: OTHER,
      appellant_name: NAME,
    });
    const t = render('suspension_of_sentence', 'verification', kept);
    expect(t).toContain(`I, ${NAME},`);
    expect(t).not.toContain(OTHER);
  });
});

/**
 * T-477: the promoted (template-engine) path keeps the pack's act sections.
 *
 * Before: promoted `related_acts` held the Act name only, so the model printed
 * section numbers from memory. Now each entry is `Act (ref; ref)` with the
 * pack's own reference text, verbatim (Ajay), joined by ', ' in the prompt.
 *
 * A  renderRelatedActs / renderRelatedAct, unit
 * B  all 92 packs through the real promoter
 * C  the NI Act filter (templateForCharge) with the sectioned entry
 * D  buildAISystemPrompt RELATED ACTS line
 * E  the draft: "[only when: ...]" and related_acts never reach the produced draft
 * F  default_bail template path (Addendum 4 #1) carries its CrPC sections
 * G  the public template config still excludes related_acts
 *
 * No database, no real model call.
 */
import './setupEnv';

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { Response } from 'express';

import { streamGenerateFromTemplate, templateForCharge } from '../services/ai.service';
import { renderRelatedAct, renderRelatedActs } from '../services/related-acts';
import { readActList } from '../services/rule-pack.service';
import { buildAISystemPrompt, loadTemplateConfig } from '../services/template-engine.service';
import { clearTemplateRegistryCache, loadAllDocRules } from '../services/template-promoter';
import { publicTemplateConfig } from '../utils/publicTemplateConfig';
import { SdkStreamParams, sdkAnswer } from './sdkStream';

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);
jest.mock('../services/app-settings.service', () => ({
  ...jest.requireActual('../services/app-settings.service'),
  getAppSetting: jest.fn(async () => 'claude-sonnet-4-5-20250929'),
}));
jest.mock('../services/sections.service', () => ({
  convertOldReferencesInText: jest.fn(async (text: string) => ({
    converted: text,
    conversions: [],
  })),
  lookupOldToNew: jest.fn(async () => null),
}));

const RULES_DIR = join(__dirname, '..', 'config', 'document-rules');
const PACK_FILES = readdirSync(RULES_DIR).filter((f) => f.endsWith('.json'));

type Obj = Record<string, unknown>;
const rawPack = (file: string): Obj =>
  JSON.parse(readFileSync(join(RULES_DIR, file), 'utf8')) as Obj;

// ── A ────────────────────────────────────────────────────────────────────
describe('T-477 A: renderRelatedActs (unit)', () => {
  const one = (entry: Obj): string => renderRelatedActs([entry])[0];

  it('an act with sections prints Act (a; b)', () => {
    expect(
      one({ act: 'Code of Civil Procedure, 1908', sections: ['S.151', 'Order XIX Rule 3'] }),
    ).toBe('Code of Civil Procedure, 1908 (S.151; Order XIX Rule 3)');
  });

  it('an act with no sections prints the bare name (existing promoter contract)', () => {
    expect(one({ act: 'Notaries Act, 1952', sections: [] })).toBe('Notaries Act, 1952');
    expect(one({ act: 'BNS' })).toBe('BNS');
  });

  it.each([
    ['S.151'],
    ['138'],
    ['13(1)(i)'],
    ['Order XIX Rule 3'],
    ['Article 226'],
    ['S.126-147 (guarantee)'],
    ['Order XXXIX Rules 1 & 2'],
  ])('reference %j is printed verbatim', (ref) => {
    expect(one({ act: 'Some Act, 2000', sections: [ref] })).toBe(`Some Act, 2000 (${ref})`);
  });

  it('keeps pack order and drops duplicates', () => {
    expect(one({ act: 'A Act', sections: ['S.9', 'S.3', 'S.9', 'S.1', 'S.3'] })).toBe(
      'A Act (S.9; S.3; S.1)',
    );
  });

  it('does not print the description of a section', () => {
    expect(
      one({ act: 'A Act', sections: [{ number: 'S.4', description: 'Some long description' }] }),
    ).toBe('A Act (S.4)');
  });

  it('reads the name/articles/sections shape (mandamus) and the provisions shape', () => {
    expect(
      renderRelatedActs([
        { name: 'Constitution of India', articles: ['32', '226'] },
        { name: 'Specific Relief Act, 1963', sections: ['38', '39'] },
      ]),
    ).toEqual([
      'Constitution of India (Article 32; Article 226)',
      'Specific Relief Act, 1963 (38; 39)',
    ]);
    const viaProvisions = renderRelatedActs([{ act: 'P Act', provisions: ['S.2', 'S.5'] }]);
    expect(viaProvisions).toEqual(
      readActList([{ act: 'P Act', provisions: ['S.2', 'S.5'] }]).map(renderRelatedAct),
    );
  });

  it('a bare-string entry is unchanged', () => {
    expect(renderRelatedActs(['Indian Evidence Act, 1872', 'BNS'])).toEqual([
      'Indian Evidence Act, 1872',
      'BNS',
    ]);
  });

  it.each([['—'], ['-'], ['–'], [''], ['  ']])('placeholder reference %j is dropped', (ref) => {
    expect(one({ act: 'A Act', sections: [ref] })).toBe('A Act');
    expect(one({ act: 'A Act', sections: [ref, 'S.2'] })).toBe('A Act (S.2)');
  });

  it.each([['Various'], ['As applicable']])('%j is kept verbatim', (ref) => {
    expect(one({ act: 'A Act', sections: [ref] })).toBe(`A Act (${ref})`);
  });

  it('applies_when becomes " [only when: ...]" after the references', () => {
    expect(one({ act: 'SARFAESI Act 2002', applies_when: 'Lender is Bank/NBFC' })).toBe(
      'SARFAESI Act 2002 [only when: Lender is Bank/NBFC]',
    );
    expect(one({ act: 'B Act', sections: ['S.1'], applies_when: 'Foreign lender' })).toBe(
      'B Act (S.1) [only when: Foreign lender]',
    );
  });

  it('a reference never prints outside its parentheses after the act name', () => {
    const cases: Obj[] = [
      { act: 'A Act', sections: ['138'] },
      { act: 'A Act', sections: ['138', '141'], applies_when: 'x' },
      { act: 'A Act, 1881', sections: ['4', '6', '80'] },
      { name: 'Constitution of India', articles: ['32'] },
    ];
    for (const c of cases) {
      const out = one(c);
      const act = readActList([c])[0].act;
      expect(out.startsWith(`${act} (`)).toBe(true);
      expect(out.replace(/ \[only when: .*\]$/, '').endsWith(')')).toBe(true);
      expect(out).not.toMatch(/^[\s\d.()]*$/);
    }
  });

  it('a non-array input gives an empty list', () => {
    expect(renderRelatedActs(undefined)).toEqual([]);
    expect(renderRelatedActs('x')).toEqual([]);
  });
});

// ── B ────────────────────────────────────────────────────────────────────
describe('T-477 B: all packs through the real promoter', () => {
  let configs: ReturnType<typeof loadAllDocRules>['configs'];
  let byFile: ReturnType<typeof loadAllDocRules>['byFile'];
  beforeAll(() => {
    clearTemplateRegistryCache();
    ({ configs, byFile } = loadAllDocRules());
  });
  afterAll(() => clearTemplateRegistryCache());

  it('premise: 92 packs', () => {
    expect(PACK_FILES).toHaveLength(92);
    expect(configs.size).toBe(92);
  });

  it('every entry with references renders each reference verbatim inside its own act parentheses', () => {
    let packsWithRefs = 0;
    for (const file of PACK_FILES) {
      const id = byFile.get(file)!.template_id;
      const acts = readActList(rawPack(file).relevantActs);
      const rendered = configs.get(id)!.related_acts;
      expect({ file, n: rendered.length }).toEqual({ file, n: acts.length });
      let anyRef = false;
      acts.forEach((a, i) => {
        const s = rendered[i];
        expect({ file, ok: s.startsWith(a.act) }).toEqual({ file, ok: true });
        const refs = a.sections.map((x) => x.number).filter((n) => !/^[\s\-–—]*$/.test(n));
        if (refs.length === 0) {
          // no references: the bare name (plus the condition, if any)
          expect(s.startsWith(a.act)).toBe(true);
          expect(s.slice(a.act.length).startsWith(' (')).toBe(false);
          return;
        }
        anyRef = true;
        const open = s.indexOf(`${a.act} (`);
        expect({ file, act: a.act, open }).toEqual({ file, act: a.act, open: 0 });
        const inner = s.slice(a.act.length + 2).replace(/ \[only when: .*\]$/, '');
        expect(inner.endsWith(')')).toBe(true);
        const parts = inner.slice(0, -1).split('; ');
        // every distinct pack reference is there, verbatim, in pack order
        const distinct = [...new Set(refs)];
        expect({ file, act: a.act, parts }).toEqual({ file, act: a.act, parts: distinct });
      });
      if (anyRef) packsWithRefs += 1;
    }
    expect(packsWithRefs).toBeGreaterThanOrEqual(80);
  });

  it('the applies_when of a pack entry survives as [only when: ...] and nowhere else', () => {
    for (const file of PACK_FILES) {
      const id = byFile.get(file)!.template_id;
      const acts = readActList(rawPack(file).relevantActs);
      const rendered = configs.get(id)!.related_acts;
      acts.forEach((a, i) => {
        if (a.appliesWhen)
          expect(rendered[i].endsWith(` [only when: ${a.appliesWhen}]`)).toBe(true);
        else expect(rendered[i]).not.toContain('[only when');
      });
    }
  });

  it('no related_acts string holds a brace, is empty, or is purely a number', () => {
    for (const c of configs.values()) {
      for (const s of c.related_acts) {
        expect({ id: c.template_id, s, brace: /[{}]/.test(s) }).toEqual({
          id: c.template_id,
          s,
          brace: false,
        });
        expect(s.trim().length).toBeGreaterThan(0);
        expect(s).not.toMatch(/^[\s\d.()]*$/);
      }
    }
  });

  it('affidavit_in_support keeps Order XIX Rule 3 under the Code of Civil Procedure', () => {
    const acts = configs.get('affidavit_in_support')!.related_acts;
    const cpc = acts.find((a) => a.startsWith('Code of Civil Procedure, 1908'));
    expect(cpc).toBeDefined();
    expect(cpc).toContain('Order XIX Rule 3');
    expect(cpc).toMatch(/^Code of Civil Procedure, 1908 \(.*Order XIX Rule 3.*\)$/);
    expect(acts).toEqual([
      'Code of Civil Procedure, 1908 (Order XIX; Order XIX Rule 3)',
      'Notaries Act, 1952 (8)',
      'Bharatiya Sakshya Adhiniyam (BSA), 2023 (Schedule)',
    ]);
  });

  it('mandamus (name/articles shape) renders its articles', () => {
    expect(configs.get('mandamus')!.related_acts).toEqual([
      'Constitution of India (Article 32; Article 226)',
      'Specific Relief Act, 1963 (38; 39)',
    ]);
  });

  it('a pack with a bare act and no references is unchanged', () => {
    expect(configs.get('loan_agreement')!.related_acts).toContain('Registration Act 1908');
  });

  it('loan_agreement carries its applies_when as a marker on the entry', () => {
    const acts = configs.get('loan_agreement')!.related_acts;
    expect(acts).toContain('SARFAESI Act 2002 [only when: Lender is Bank/NBFC]');
    expect(acts).toContain('FEMA 1999 + ECB Master Direction [only when: Foreign lender]');
  });
});

// ── C ────────────────────────────────────────────────────────────────────
describe('T-477 C: the NI Act filter still matches the sectioned entry', () => {
  const NI = /negotiable\s+instruments/i;
  const BNS_ONLY = 'BNS s.318 (cheating)';

  it('discharge_application: the NI entry has its sections and is dropped when s.138 is not charged', () => {
    const c = loadTemplateConfig('discharge_application')!;
    const ni = c.related_acts.filter((a) => NI.test(a));
    expect(ni).toEqual(['Negotiable Instruments Act, 1881 (S.138; S.141)']);
    const out = templateForCharge(c, { offences_charged: BNS_ONLY });
    expect(out).not.toBe(c);
    expect(out.related_acts.some((a) => NI.test(a))).toBe(false);
    expect(out.related_acts).toHaveLength(c.related_acts.length - 1);
    // s.138 charged: untouched, sections still there
    expect(templateForCharge(c, { offences_charged: 'S.138 NI Act' })).toBe(c);
  });

  it('plaint_recovery: the NI entry carries its sections and still matches', () => {
    const c = loadTemplateConfig('plaint_recovery')!;
    const ni = c.related_acts.filter((a) => NI.test(a));
    expect(ni).toEqual(['Negotiable Instruments Act, 1881 (S.4; S.6; S.80; S.138)']);
  });

  it('a non-NI entry never matches, even if its sections say 138', () => {
    for (const s of renderRelatedActs([
      { act: 'Indian Penal Code, 1860', sections: ['138'] },
      { act: 'Code of Civil Procedure, 1908', sections: ['Order XXXIX Rule 3'] },
    ])) {
      expect(NI.test(s)).toBe(false);
    }
  });

  it('templateForCharge keeps non-NI sectioned entries when it drops the NI entry', () => {
    const c = loadTemplateConfig('discharge_application')!;
    const out = templateForCharge(c, { offences_charged: BNS_ONLY });
    for (const a of c.related_acts.filter((x) => !NI.test(x)))
      expect(out.related_acts).toContain(a);
  });
});

// ── D ────────────────────────────────────────────────────────────────────
describe('T-477 D: buildAISystemPrompt shows the sections', () => {
  it('affidavit_in_support RELATED ACTS line', () => {
    const prompt = buildAISystemPrompt(loadTemplateConfig('affidavit_in_support')!);
    const line = prompt.split('\n').find((l) => l.startsWith('RELATED ACTS: '));
    expect(line).toBe(
      'RELATED ACTS: Code of Civil Procedure, 1908 (Order XIX; Order XIX Rule 3), Notaries Act, 1952 (8), Bharatiya Sakshya Adhiniyam (BSA), 2023 (Schedule)',
    );
  });
});

// ── helpers for the draft tests ──────────────────────────────────────────
function resStub() {
  return { setHeader: jest.fn(), write: jest.fn(), end: jest.fn(), headersSent: false };
}
const systemPrompts = (): string[] =>
  mockMessagesStream.mock.calls.map((c) => (c[0] as SdkStreamParams).system);
const relatedActsLine = (system: string): string =>
  system.split('\n').find((l) => l.startsWith('RELATED ACTS: ')) ?? '';

async function runTemplate(
  id: string,
  formData: Record<string, unknown>,
  modelText = '1. That the parties agreed.',
) {
  mockMessagesStream.mockReset().mockImplementation(async () => sdkAnswer(modelText, 4000, 800));
  const res = resStub();
  await streamGenerateFromTemplate(
    {
      templateConfig: loadTemplateConfig(id)!,
      formData,
      userId: 'u1',
      runId: 'r1',
      runSequence: 1,
      runType: 'initial',
    } as unknown as Parameters<typeof streamGenerateFromTemplate>[0],
    res as unknown as Response,
  );
  const written = res.write.mock.calls.map((c) => String(c[0])).join('');
  return { written, system: systemPrompts(), res };
}

// ── E ────────────────────────────────────────────────────────────────────
describe('T-477 E (Ajay): [only when: ...] and related_acts never reach the draft', () => {
  const FORM = { applicant_name: 'Suresh Gupta', advocate_name: 'A. Advocate' };

  it('premise: the model sees the marker and the sections', async () => {
    const { system } = await runTemplate('loan_agreement', FORM);
    expect(system.length).toBeGreaterThan(0);
    const line = relatedActsLine(system[0]);
    expect(line).toContain('SARFAESI Act 2002 [only when: Lender is Bank/NBFC]');
    expect(line).toContain('Transfer of Property Act 1882 (S.58-104 (mortgage);');
  });

  it('a model answer without the marker: the produced draft has no marker and no related_acts text', async () => {
    const { written } = await runTemplate('loan_agreement', FORM);
    expect(written).not.toMatch(/only when/i);
    const config = loadTemplateConfig('loan_agreement')!;
    for (const a of config.related_acts) expect(written).not.toContain(a);
    expect(written).not.toContain('RELATED ACTS');
  });

  it('the produced draft of a sectioned pack does not copy the related_acts line', async () => {
    const { written } = await runTemplate('affidavit_in_support', {
      ...FORM,
      deponent_name: 'Suresh Gupta',
    });
    expect(written).not.toContain('RELATED ACTS');
    expect(written).not.toContain('Order XIX; Order XIX Rule 3');
    expect(written).not.toMatch(/only when/i);
  });

  // The code has no step that strips a marker the model itself echoes
  // (sanitiseAIBody removes only cause-title and disclaimer paragraphs;
  // checkDraftCitations only warns). This test states the wish and is expected
  // to fail until a guard exists; `it.failing` flips red the day one is added.
  it.failing(
    'GAP: a marker the model echoes into its answer is removed from the draft',
    async () => {
      const { written } = await runTemplate(
        'loan_agreement',
        FORM,
        '1. That the lender, SARFAESI Act 2002 [only when: Lender is Bank/NBFC], lends the sum.',
      );
      expect(written).not.toContain('[only when');
    },
  );
});

// ── F ────────────────────────────────────────────────────────────────────
describe('T-477 F: default_bail template path carries the CrPC sections', () => {
  const OLD = {
    fir_date: '2023-06-02',
    applicant_name: 'Deepak Ravidas',
    advocate_name: 'A. Advocate',
  };
  const CRPC = 'Code of Criminal Procedure, 1973 (167(2))';
  const BNSS = 'Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023 (187(3); 187; 480)';

  it('a CrPC choice: RELATED ACTS is the CrPC entry with 167(2)', async () => {
    const { system } = await runTemplate('default_bail', {
      ...OLD,
      procedure_code: 'CrPC and Evidence Act',
    });
    expect(relatedActsLine(system[0])).toBe(`RELATED ACTS: ${CRPC}`);
  });

  it('a BNSS choice: the pack own entry only', async () => {
    const { system } = await runTemplate('default_bail', {
      ...OLD,
      procedure_code: 'BNSS and BSA',
    });
    expect(relatedActsLine(system[0])).toBe(`RELATED ACTS: ${BNSS}`);
  });

  it('no choice: both, BNSS first, joined by ", "', async () => {
    const { system } = await runTemplate('default_bail', OLD);
    expect(relatedActsLine(system[0])).toBe(`RELATED ACTS: ${BNSS}, ${CRPC}`);
  });
});

// ── G ────────────────────────────────────────────────────────────────────
describe('T-477 G: public template config still excludes related_acts', () => {
  it.each(['affidavit_in_support', 'discharge_application', 'mandamus', 'loan_agreement'])(
    '%s',
    (id) => {
      const projected = publicTemplateConfig(loadTemplateConfig(id)!);
      expect(projected).not.toHaveProperty('related_acts');
      const json = JSON.stringify(projected);
      expect(json).not.toContain('Order XIX Rule 3');
      expect(json).not.toContain('[only when');
      expect(json).not.toContain('S.138; S.141');
    },
  );
});

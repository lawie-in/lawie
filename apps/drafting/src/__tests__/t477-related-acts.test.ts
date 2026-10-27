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

import { execFileSync } from 'child_process';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { Response } from 'express';

import { streamGenerateFromTemplate, templateForCharge } from '../services/ai.service';
import {
  APPLICABLE_WHEN_WORDS,
  renderRelatedAct,
  renderRelatedActs,
} from '../services/related-acts';
import { readActList } from '../services/rule-pack.service';
import {
  buildAISystemPrompt,
  loadTemplateConfig,
  sanitiseAIBody,
  stripOnlyWhenMarkers,
} from '../services/template-engine.service';
import {
  clearTemplateRegistryCache,
  loadAllDocRules,
  promoteDocRuleToTemplateConfig,
} from '../services/template-promoter';
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
/** Ajay f9415fe8: a digit-led reference is a section and prints with "S."; the rest is verbatim. */
const printedRef = (ref: string): string => (/^\d/.test(ref) ? `S.${ref}` : ref);
const rawPack = (file: string): Obj =>
  JSON.parse(readFileSync(join(RULES_DIR, file), 'utf8')) as Obj;

/** A pack's acts as the promoter reads them: relevantActs, then relatedActs; applicableWhen keys in plain words. */
const packActs = (file: string) => {
  const raw = rawPack(file);
  const list = [
    ...(Array.isArray(raw.relevantActs) ? raw.relevantActs : []),
    ...(Array.isArray(raw.relatedActs) ? raw.relatedActs : []),
  ];
  return readActList(list).map((a) => ({
    ...a,
    appliesWhen:
      a.appliesWhen !== null && a.appliesWhen in APPLICABLE_WHEN_WORDS
        ? APPLICABLE_WHEN_WORDS[a.appliesWhen]
        : a.appliesWhen,
  }));
};

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
    ['Order XIX Rule 3'],
    ['Article 226'],
    ['S.126-147 (guarantee)'],
    ['Order XXXIX Rules 1 & 2'],
  ])('reference %j is printed verbatim', (ref) => {
    expect(one({ act: 'Some Act, 2000', sections: [ref] })).toBe(`Some Act, 2000 (${ref})`);
  });

  it.each([
    ['138', 'S.138'],
    ['13(1)(i)', 'S.13(1)(i)'],
    ['167(2)', 'S.167(2)'],
  ])('a digit-led reference %j prints as %j (Ajay f9415fe8)', (ref, printed) => {
    expect(one({ act: 'Some Act, 2000', sections: [ref] })).toBe(`Some Act, 2000 (${printed})`);
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
      'Specific Relief Act, 1963 (S.38; S.39)',
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
      'SARFAESI Act 2002 [only when: the lender is a bank or an NBFC]',
    );
    expect(one({ act: 'B Act', sections: ['S.1'], applies_when: 'Foreign lender' })).toBe(
      'B Act (S.1) [only when: the lender is outside India]',
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
      const acts = packActs(file);
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
        // every distinct pack reference is there in pack order: verbatim, or "S." + a digit-led one
        const distinct = [...new Set(refs.map(printedRef))];
        expect({ file, act: a.act, parts }).toEqual({ file, act: a.act, parts: distinct });
      });
      if (anyRef) packsWithRefs += 1;
    }
    expect(packsWithRefs).toBeGreaterThanOrEqual(80);
  });

  it('the applies_when of a pack entry survives as [only when: ...] and nowhere else', () => {
    for (const file of PACK_FILES) {
      const id = byFile.get(file)!.template_id;
      const acts = packActs(file);
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
      'Notaries Act, 1952 (S.8)',
      'Bharatiya Sakshya Adhiniyam (BSA), 2023 (Schedule)',
    ]);
  });

  it('mandamus (name/articles shape) renders its articles', () => {
    expect(configs.get('mandamus')!.related_acts).toEqual([
      'Constitution of India (Article 32; Article 226)',
      'Specific Relief Act, 1963 (S.38; S.39)',
    ]);
  });

  it('a pack with a bare act and no references is unchanged', () => {
    expect(configs.get('loan_agreement')!.related_acts).toContain('Registration Act 1908');
  });

  it('loan_agreement carries its applies_when as a marker on the entry', () => {
    const acts = configs.get('loan_agreement')!.related_acts;
    expect(acts).toContain('SARFAESI Act 2002 [only when: the lender is a bank or an NBFC]');
    expect(acts).toContain(
      'FEMA 1999 + ECB Master Direction [only when: the lender is outside India]',
    );
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
      'RELATED ACTS: Code of Civil Procedure, 1908 (Order XIX; Order XIX Rule 3), Notaries Act, 1952 (S.8), Bharatiya Sakshya Adhiniyam (BSA), 2023 (Schedule)',
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
    expect(line).toContain('SARFAESI Act 2002 [only when: the lender is a bank or an NBFC]');
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

  // Arjun: sanitiseAIBody strips a marker the model echoes into its answer.
  it('a marker the model echoes into its answer is removed from the draft', async () => {
    const { written } = await runTemplate(
      'loan_agreement',
      FORM,
      '1. That the lender, SARFAESI Act 2002 [only when: Lender is Bank/NBFC], lends the sum.',
    );
    // The final document is the template_sections event (the SSE text chunks are the raw stream).
    const ev = written.split('\n\n').find((e) => e.startsWith('event: template_sections'))!;
    expect(ev).toBeDefined();
    expect(ev).not.toContain('only when');
    expect(ev).toContain('SARFAESI Act 2002, lends the sum.');
  });

  // T-637 / Arjun option B: the form route no longer streams text chunks, so an echoed marker
  // never reaches the browser raw; the delivered body (template_sections) has it stripped.
  it('no text chunk streams, and the echoed marker is stripped from the delivered body', async () => {
    const { written } = await runTemplate(
      'loan_agreement',
      FORM,
      '1. That the lender [only when: Foreign lender] lends.',
    );
    expect(written).not.toMatch(/data: \{"text"/);
    expect(written).not.toContain('[only when: Foreign lender]');
    expect(written).toContain('event: template_sections');
    expect(written).toContain('the lender');
  });
});

// ── F ────────────────────────────────────────────────────────────────────
describe('T-477 F: default_bail template path carries the CrPC sections', () => {
  const OLD = {
    fir_date: '2023-06-02',
    applicant_name: 'Deepak Ravidas',
    advocate_name: 'A. Advocate',
  };
  const CRPC = 'Code of Criminal Procedure, 1973 (S.167(2))';
  const BNSS = 'Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023 (S.187(3); S.187; S.480)';

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

// ── H: round 2 ───────────────────────────────────────────────────────────
describe('T-477 H: applicableWhen keys (Ajay b101b4eb)', () => {
  it('unit: a known key prints its plain words as the marker', () => {
    const notes: string[] = [];
    expect(
      renderRelatedActs(
        [{ act: 'X Act, 2005', sections: ['12'], applicableWhen: 'dv_dowry' }],
        notes,
      ),
    ).toEqual([
      'X Act, 2005 (S.12) [only when: the offence arises from domestic violence or a dowry demand]',
    ]);
    expect(notes).toEqual([]);
  });

  it('unit: an unknown key prints no marker, no raw key, and adds a note', () => {
    const notes: string[] = [];
    const out = renderRelatedActs(
      [{ act: 'X Act, 2005', sections: ['12'], applicableWhen: 'made_up_key' }],
      notes,
    );
    expect(out).toEqual(['X Act, 2005 (S.12)']);
    expect(out[0]).not.toContain('made_up_key');
    expect(out[0]).not.toContain('[only when');
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('made_up_key');
  });

  it('pack level: every applicableWhen key in any pack is in the table; no rendered string holds a raw snake_case key', () => {
    const { configs, byFile } = loadAllDocRules();
    const keys = new Set<string>();
    for (const file of PACK_FILES) {
      const raw = rawPack(file);
      for (const k of ['relevantActs', 'relatedActs']) {
        const list = raw[k];
        if (Array.isArray(list))
          for (const e of list)
            if (e && typeof e === 'object' && 'applicableWhen' in e)
              keys.add(String((e as Obj).applicableWhen));
      }
    }
    expect(keys.size).toBeGreaterThan(0);
    for (const k of keys) expect(Object.keys(APPLICABLE_WHEN_WORDS)).toContain(k);
    for (const c of configs.values())
      for (const a of c.related_acts) {
        for (const k of keys) expect(a).not.toContain(k);
        expect(a).not.toMatch(/\b[a-z]+_[a-z_]+\b/);
      }
    // and no pack added an unknown-key note
    for (const f of PACK_FILES) {
      expect(byFile.get(f)!.mismatches.filter((m) => m.includes('APPLICABLE_WHEN_WORDS'))).toEqual(
        [],
      );
    }
  });

  it('bail_regular: the PWDVA line exactly, rendered after the relevantActs entries', () => {
    const { configs } = loadAllDocRules();
    const acts = configs.get('bail_regular')!.related_acts;
    const pwdva =
      'Protection of Women from Domestic Violence Act (PWDVA), 2005 (S.12; S.18; S.19; S.20; S.22) [only when: the offence arises from domestic violence or a dowry demand]';
    expect(acts).toContain(pwdva);
    expect(acts[acts.length - 1]).toBe(pwdva);
    expect(acts).toHaveLength(3);
    expect(acts[0]).toBe(
      'Bharatiya Nagarik Suraksha Sanhita (BNSS), 2023 (S.478; S.480; S.483; S.484)',
    );
    expect(acts[1]).toBe('Bharatiya Nyaya Sanhita (BNS), 2023 (S.85; S.80; S.103(1))');
  });

  it('promoter: relevantActs then relatedActs, no merging across the keys', () => {
    const { config } = promoteDocRuleToTemplateConfig(
      {
        template_id: 't',
        category: 'c',
        relatedActs: [{ act: 'Same Act', sections: ['2'] }],
        relevantActs: [{ act: 'Same Act', sections: ['1'] }],
      },
      't.json',
    );
    expect(config.related_acts).toEqual(['Same Act (S.1)', 'Same Act (S.2)']);
  });

  it('promoter: an unknown applicableWhen key lands in the mismatches report', () => {
    const { config, mismatches } = promoteDocRuleToTemplateConfig(
      { template_id: 't', category: 'c', relatedActs: [{ act: 'A', applicableWhen: 'nope_key' }] },
      't.json',
    );
    expect(config.related_acts).toEqual(['A']);
    expect(mismatches.some((m) => m.includes('nope_key'))).toBe(true);
  });
});

describe('T-477 H: S. prefix, pack level (Ajay f9415fe8)', () => {
  it('every printed ref in every pack starts with a letter, or is "S." + a digit-led ref', () => {
    const { configs, byFile } = loadAllDocRules();
    let digitLed = 0;
    for (const file of PACK_FILES) {
      const rendered = configs.get(byFile.get(file)!.template_id)!.related_acts;
      const acts = packActs(file);
      acts.forEach((a, i) => {
        const inner = rendered[i].slice(a.act.length).replace(/ \[only when: .*\]$/, '');
        if (!inner.startsWith(' (')) return;
        for (const raw of a.sections.map((x) => x.number)) {
          if (/^[\s\-–—]*$/.test(raw)) continue;
          if (/^\d/.test(raw)) {
            digitLed += 1;
            expect(inner).toContain(`S.${raw}`);
          } else expect(inner).toContain(raw);
        }
        // splitting on '; ' only at top level is not needed: every part-initial char is a letter
        for (const part of inner.slice(2, -1).split('; ')) {
          if (/^\d/.test(part)) throw new Error(`${file}: bare digit-led ref ${part}`);
        }
      });
    }
    expect(digitLed).toBeGreaterThan(50);
  });
});

describe('T-477 H: stripOnlyWhenMarkers / sanitiseAIBody (Arjun)', () => {
  it('mid-sentence marker (and its leading space) is removed', () => {
    const r = stripOnlyWhenMarkers('That the lender [only when: Lender is Bank/NBFC] shall pay.');
    expect(r).toEqual({ text: 'That the lender shall pay.', count: 1 });
  });

  it('a marker on its own line leaves no marker text', () => {
    const r = stripOnlyWhenMarkers('Line one.\n[only when: Foreign lender]\nLine two.');
    expect(r.count).toBe(1);
    expect(r.text).not.toContain('only when');
    expect(r.text).toContain('Line one.');
    expect(r.text).toContain('Line two.');
  });

  it('text with no marker is returned unchanged with count 0', () => {
    const t = 'That the applicant is innocent. [Authority — add if relied upon]';
    expect(stripOnlyWhenMarkers(t)).toEqual({ text: t, count: 0 });
  });

  it('several markers are all removed and counted', () => {
    const r = stripOnlyWhenMarkers(
      'A [only when: x] B [only when: y z] C\n[only when: w]\nD [ONLY WHEN: q] E',
    );
    expect(r.count).toBe(4);
    expect(r.text).not.toMatch(/only when/i);
    expect(r.text).toContain('A B C');
  });

  it('a marker whose closing bracket is on a later line is NOT stripped', () => {
    const t = 'Para [only when: Lender is\nBank/NBFC] rest.';
    expect(stripOnlyWhenMarkers(t)).toEqual({ text: t, count: 0 });
  });

  it('generic brackets are untouched', () => {
    const t = '[To be confirmed: date] [Authority — add if relied upon] [only] [when: x]';
    expect(stripOnlyWhenMarkers(t)).toEqual({ text: t, count: 0 });
  });

  it('is case-insensitive', () => {
    expect(stripOnlyWhenMarkers('x [Only When: a] y').count).toBe(1);
    expect(stripOnlyWhenMarkers('x [only WHEN: a] y').text).toBe('x y');
  });

  it('sanitiseAIBody removes an echoed marker and keeps the paragraph', () => {
    const out = sanitiseAIBody(
      '1. That the lender, SARFAESI Act 2002 [only when: Lender is Bank/NBFC], lends.\n\n2. That it is so.',
    );
    expect(out).toBe('1. That the lender, SARFAESI Act 2002, lends.\n\n2. That it is so.');
  });
});

// ── I: round 3, signed marker wording (Ajay 8766fbf1) ────────────────────
const SIGNED_FILE = 'handoff/legal/T-245-old-new-law-switch-signed.md';
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

/** The signed T-477 marker table (rows 2 to 12), read from the T-245 file; null if the section is missing. */
function signedMarkerRows(): Array<{
  n: number;
  pack: string;
  act: string;
  marker: string;
}> | null {
  let text = '';
  const tryRead = (): string => {
    try {
      return readFileSync(join(REPO_ROOT, SIGNED_FILE), 'utf8');
    } catch {
      return '';
    }
  };
  text = tryRead();
  if (!text.includes('Byte check T-477')) {
    try {
      text = execFileSync(
        'git',
        ['-C', REPO_ROOT, 'show', `origin/develop_staging:${SIGNED_FILE}`],
        {
          encoding: 'utf8',
          maxBuffer: 20 * 1024 * 1024,
        },
      );
    } catch {
      text = '';
    }
  }
  const at = text.indexOf('Byte check T-477');
  if (at < 0) return null;
  const rows: Array<{ n: number; pack: string; act: string; marker: string }> = [];
  for (const line of text.slice(at).split('\n')) {
    const m = /^\|\s*(\d+)\s*\|\s*([a-z_]+),\s*([^|]+?)\s*\|\s*`(\[only when: [^`]+\])`\s*\|/.exec(
      line,
    );
    if (m) rows.push({ n: Number(m[1]), pack: m[2], act: m[3], marker: m[4] });
    if (rows.length && /^Follow-up/.test(line)) break;
  }
  return rows;
}

describe('T-477 I: the markers are the signed words, never the pack text', () => {
  const { configs, byFile } = (() => {
    clearTemplateRegistryCache();
    return loadAllDocRules();
  })();
  const RAW_CONDITIONS = [
    'Workmen',
    'Pre-IPO',
    'Foreign lender',
    'Cross-border',
    'Cross-border distributor',
    'Imported goods',
    'Foreign investor',
    'Lender is Bank/NBFC',
    'Private money-lending business',
    'Food/F&B franchise',
    'Industrial establishments',
  ];

  it('every pack entry with a condition renders exactly "[only when: <signed words>]"', () => {
    let withCondition = 0;
    for (const file of PACK_FILES) {
      const rendered = configs.get(byFile.get(file)!.template_id)!.related_acts;
      const raw = rawPack(file);
      const list = [
        ...(Array.isArray(raw.relevantActs) ? raw.relevantActs : []),
        ...(Array.isArray(raw.relatedActs) ? raw.relatedActs : []),
      ];
      readActList(list).forEach((a, i) => {
        if (a.appliesWhen === null) {
          expect(rendered[i]).not.toContain('[only when');
          return;
        }
        withCondition += 1;
        expect(Object.keys(APPLICABLE_WHEN_WORDS)).toContain(a.appliesWhen);
        expect(rendered[i].endsWith(` [only when: ${APPLICABLE_WHEN_WORDS[a.appliesWhen]}]`)).toBe(
          true,
        );
        expect(rendered[i].match(/\[only when:/g)).toHaveLength(1);
      });
    }
    expect(withCondition).toBe(12);
    expect(Object.keys(APPLICABLE_WHEN_WORDS)).toHaveLength(12);
  });

  it('no raw pack condition text reaches any rendered related_acts string', () => {
    for (const c of configs.values())
      for (const a of c.related_acts)
        for (const raw of RAW_CONDITIONS) {
          expect({ id: c.template_id, a, raw, hit: a.includes(raw) }).toEqual({
            id: c.template_id,
            a,
            raw,
            hit: false,
          });
        }
  });

  it('the signed table in the T-245 file: each row byte for byte what the code renders', () => {
    const rows = signedMarkerRows();
    if (rows === null) {
      // eslint-disable-next-line no-console
      console.warn(
        `T-477 signed-table check SKIPPED: "Byte check T-477" not found in ${SIGNED_FILE} (worktree copy or origin/develop_staging).`,
      );
      return;
    }
    expect(rows.map((r) => r.n)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const r of rows) {
      // the file names the act short ("FEMA / ECB"): every part must be in the entry, which has a marker
      const parts = r.act.split(' / ');
      const acts = configs
        .get(r.pack)!
        .related_acts.filter((a) => a.includes('[only when') && parts.every((x) => a.includes(x)));
      expect({ row: r.n, found: acts.length }).toEqual({ row: r.n, found: 1 });
      expect(acts[0].endsWith(` ${r.marker}`)).toBe(true);
    }
  });

  it('an unknown condition prints no marker and adds a mismatch note', () => {
    const notes: string[] = [];
    expect(
      renderRelatedActs(
        [{ act: 'Z Act, 1', sections: ['5'], applies_when: 'Some new pack note' }],
        notes,
      ),
    ).toEqual(['Z Act, 1 (S.5)']);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('Some new pack note');
    const { config, mismatches } = promoteDocRuleToTemplateConfig(
      { template_id: 't', category: 'c', relevantActs: [{ act: 'Z', applies_when: 'Workmen x' }] },
      't.json',
    );
    expect(config.related_acts).toEqual(['Z']);
    expect(mismatches.some((m) => m.includes('Workmen x'))).toBe(true);
  });

  it('no wording in the table and no rendered marker holds "[" or "]"', () => {
    for (const w of Object.values(APPLICABLE_WHEN_WORDS)) expect(w).not.toMatch(/[[\]]/);
    for (const c of configs.values())
      for (const a of c.related_acts) {
        const marker = /\[only when: (.*)\]$/.exec(a);
        if (marker) expect(marker[1]).not.toMatch(/[[\]]/);
      }
  });

  it('the nested-bracket case, pinned as it is today (reviewer note)', () => {
    // The marker ends at the first "]", so a "[" or "]" inside the wording would leave a tail
    // behind: "c]" stays. This cannot happen while the table has no brackets (test above).
    expect(stripOnlyWhenMarkers('[only when: a [b] c]')).toEqual({ text: ' c]', count: 1 });
  });
});

describe('T-477 I: strip count on the template result (several AI sections)', () => {
  it('sums stripOnlyWhenMarkers across AI sections', async () => {
    const base = loadTemplateConfig('loan_agreement')!;
    const ai = base.document_structure.sections.filter((x) => x.type === 'ai_generated');
    expect(ai.length).toBeGreaterThanOrEqual(1);
    const cfg = {
      ...base,
      document_structure: {
        ...base.document_structure,
        sections: [...base.document_structure.sections, { ...ai[0], section_id: 'ai_second' }],
      },
    };
    const answers = ['1. A [only when: x] b [only when: y].', '2. C [only when: z] d.'];
    let call = 0;
    mockMessagesStream
      .mockReset()
      .mockImplementation(async () => sdkAnswer(answers[Math.min(call++, 1)], 4000, 800));
    const out = await streamGenerateFromTemplate(
      {
        templateConfig: cfg,
        formData: { applicant_name: 'S', advocate_name: 'A' },
        userId: 'u1',
        runId: 'r1',
        runSequence: 1,
        runType: 'initial',
      } as unknown as Parameters<typeof streamGenerateFromTemplate>[0],
      resStub() as unknown as Response,
    );
    expect(out.onlyWhenStrips).toBe(3);
  });

  it.each([
    ['no marker', '1. That it is so.', 0],
    ['two markers', '1. A [only when: x] b [only when: y].', 2],
  ])('one section, %s', async (_n, answer, count) => {
    mockMessagesStream.mockReset().mockImplementation(async () => sdkAnswer(answer, 4000, 800));
    const out = await streamGenerateFromTemplate(
      {
        templateConfig: loadTemplateConfig('loan_agreement')!,
        formData: { applicant_name: 'S', advocate_name: 'A' },
        userId: 'u1',
        runId: 'r1',
        runSequence: 1,
        runType: 'initial',
      } as unknown as Parameters<typeof streamGenerateFromTemplate>[0],
      resStub() as unknown as Response,
    );
    expect(out.onlyWhenStrips).toBe(count);
  });
});

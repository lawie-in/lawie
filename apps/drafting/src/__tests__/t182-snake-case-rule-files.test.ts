import './setupEnv';

import { createHash } from 'crypto';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { assemblePrompt, PromptInput } from '../services/prompt-assembler';
import { postProcess } from '../services/post-processor';
import { validate } from '../services/validator';
import {
  readActList,
  readDraftingInstructionList,
  readFilingChecklist,
  readMandatoryClauses,
} from '../services/rule-pack.service';

// No Redis/Mongo: old-law lookups are stubbed out
jest.mock('../services/sections.service', () => ({
  convertOldReferencesInText: jest.fn(async (text: string) => ({
    converted: text,
    conversions: [],
  })),
  lookupOldToNew: jest.fn(async () => null),
}));

const RULES_DIR = join(__dirname, '..', 'config', 'document-rules');
const ALL_DOC_TYPES = readdirSync(RULES_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''))
  .sort();

const FAMILY_DOC_TYPES = [
  'divorce_hma',
  'divorce_mutual_consent',
  'divorce_sma',
  'judicial_separation',
  'rcr_petition',
  'guardianship_petition',
  'maintenance_bnss_144',
];

function minimalInput(docType: string): PromptInput {
  return {
    docType,
    courtName: 'Family Court, Saket',
    courtType: 'family_court',
    partyDetails: { petitioner: 'A Kumar', respondent: 'B Kumar' },
    keyFacts: 'The parties married on 01/01/2020.',
    reliefPrayer: 'Grant the relief sought.',
    advocateName: 'X',
  } as unknown as PromptInput;
}

function readRule(docType: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(RULES_DIR, `${docType}.json`), 'utf8'));
}

const STUB_LLM_TEXT =
  '1. The petitioner and respondent were married under the Hindu Marriage Act.\n' +
  '2. The respondent treated the petitioner with cruelty. Section 13 of the Act applies.\n' +
  '3. This court has jurisdiction.';

describe('T-182 — snake_case rule files', () => {
  it('finds all 92 document-rule files', () => {
    expect(ALL_DOC_TYPES).toHaveLength(92);
  });

  describe('AC1: assemblePrompt does not throw for any document-rule file', () => {
    it.each(ALL_DOC_TYPES)('%s', async (docType) => {
      const p = await assemblePrompt(minimalInput(docType));
      expect(p.systemPrompt.length).toBeGreaterThan(0);
      expect(p.userPrompt.length).toBeGreaterThan(0);
    });
  });

  describe('AC2: family prompts carry every required mandatory clause title', () => {
    it.each(FAMILY_DOC_TYPES)('%s', async (docType) => {
      const rule = readRule(docType);
      const clauses = (rule.mandatory_clauses ?? rule.mandatoryClauses) as Array<{
        id: string;
        name: string;
        required?: boolean;
      }>;
      const required = clauses.filter(
        (c) => c.required && c.id !== 'verification' && c.id !== 'advocate_details',
      );
      expect(required.length).toBeGreaterThan(0);

      const p = await assemblePrompt(minimalInput(docType));
      const prompt = `${p.systemPrompt}\n${p.userPrompt}`;
      for (const c of required) {
        expect(prompt).toContain(c.name);
      }
    });
  });

  describe('AC3: acts given as plain strings print as their name', () => {
    it.each(['nda', 'aoa'])('%s builds and prints string acts', async (docType) => {
      const rule = readRule(docType);
      const acts = rule.relevantActs as Array<string | { act?: string; name?: string }>;
      const names = acts
        .map((a) => (typeof a === 'string' ? a : (a.act ?? a.name)))
        .filter((n): n is string => typeof n === 'string');
      expect(names.length).toBeGreaterThan(0);

      const p = await assemblePrompt(minimalInput(docType));
      const prompt = `${p.systemPrompt}\n${p.userPrompt}`;
      for (const n of names) {
        expect(prompt).toContain(n);
      }
    });

    it('nda prints a name-only act as a bare line', async () => {
      const p = await assemblePrompt(minimalInput('nda'));
      const prompt = `${p.systemPrompt}\n${p.userPrompt}`;
      expect(prompt).toContain('Indian Contract Act 1872');
    });
  });

  describe('AC4: assemble -> postProcess -> validate with stub LLM text', () => {
    it.each(['divorce_hma', 'nda'])('%s does not throw; checklist from filing_checklist', async (docType) => {
      const input = minimalInput(docType);
      const p = await assemblePrompt(input);

      const pp = postProcess({
        rawText: STUB_LLM_TEXT,
        docRule: p.docRule,
        courtRule: p.courtRule,
        partyDetails: { petitioner: 'A Kumar', respondent: 'B Kumar' },
        advocateName: 'X',
        courtName: 'Family Court, Saket',
        isDvCase: false,
      } as unknown as Parameters<typeof postProcess>[0]);

      const expected = (readRule(docType).filing_checklist as string[]) ?? [];
      expect(expected.length).toBeGreaterThan(0);
      expect(pp.filingChecklist).toEqual(expected);

      const v = await validate(pp.formattedText, p.docRule);
      expect(Array.isArray(v.warnings)).toBe(true);
      expect(typeof v.mandatoryClausesComplete).toBe('boolean');
    });
  });

  describe('AC5: camelCase prompts are unchanged (bail_regular)', () => {
    it('keeps its key lines', async () => {
      const rule = readRule('bail_regular');
      const p = await assemblePrompt(minimalInput('bail_regular'));
      const prompt = `${p.systemPrompt}\n${p.userPrompt}`;
      expect(prompt).toContain(`--- DOCUMENT TYPE: ${rule.displayName} ---`);
      expect(prompt).toContain('Mandatory sections to include in the draft:');
      expect(prompt).toContain('Specific instructions:');
      expect(prompt).toContain('--- RELEVANT STATUTORY PROVISIONS ---');
      const clauses = rule.mandatoryClauses as Array<{
        id: string;
        name: string;
        required?: boolean;
      }>;
      for (const c of clauses.filter(
        (x) => x.required && x.id !== 'verification' && x.id !== 'advocate_details',
      )) {
        expect(prompt).toContain(`  - ${c.name}`);
      }
      const instructions = rule.promptInstructions as string[];
      instructions.forEach((inst, i) => expect(prompt).toContain(`${i + 1}. ${inst}`));
    });

    // Value recorded by the developer from develop (HEAD) with this exact input:
    // sha256 of `${systemPrompt}\n=====USER=====\n${userPrompt}\n` starts 08984e74, ends 912d.
    // Fails if the bail_regular rule JSON or the assembler's output changes on purpose;
    // then re-record it, do not loosen it.
    it('matches the sha256 recorded from develop', async () => {
      const p = await assemblePrompt(minimalInput('bail_regular'));
      const digest = createHash('sha256')
        .update(`${p.systemPrompt}\n=====USER=====\n${p.userPrompt}\n`)
        .digest('hex');
      expect(digest.startsWith('08984e74')).toBe(true);
      expect(digest.endsWith('912d')).toBe(true);
    });
  });

  describe('AC6: readers', () => {
    const clause = (name: string) => ({ id: name, name, required: true, description: 'd' });

    it('readMandatoryClauses: camel wins when both keys exist', () => {
      const out = readMandatoryClauses({
        mandatoryClauses: [clause('Camel')],
        mandatory_clauses: [clause('Snake')],
      });
      expect(out.map((c) => c.title)).toEqual(['Camel']);
    });

    it('readMandatoryClauses: snake is used when it is the only key', () => {
      const out = readMandatoryClauses({ mandatory_clauses: [clause('Snake')] });
      expect(out.map((c) => c.title)).toEqual(['Snake']);
    });

    it('readMandatoryClauses: falls back to snake when camel is empty', () => {
      const out = readMandatoryClauses({
        mandatoryClauses: [],
        mandatory_clauses: [clause('Snake')],
      });
      expect(out.map((c) => c.title)).toEqual(['Snake']);
    });

    it('readMandatoryClauses: missing, non-array and non-object give []', () => {
      expect(readMandatoryClauses({})).toEqual([]);
      expect(readMandatoryClauses({ mandatory_clauses: 'nope' })).toEqual([]);
      expect(readMandatoryClauses(null)).toEqual([]);
      expect(readMandatoryClauses(undefined)).toEqual([]);
    });

    it('readFilingChecklist: camel wins, snake used alone, missing gives []', () => {
      expect(readFilingChecklist({ filingChecklist: ['c'], filing_checklist: ['s'] })).toEqual([
        'c',
      ]);
      expect(readFilingChecklist({ filing_checklist: ['s'] })).toEqual(['s']);
      expect(readFilingChecklist({})).toEqual([]);
      expect(readFilingChecklist(null)).toEqual([]);
    });

    it('readActList: string acts keep their name; non-array gives []', () => {
      const out = readActList(['Indian Contract Act 1872', { act: 'X Act', sections: [] }]);
      expect(out.map((a) => a.act)).toEqual(['Indian Contract Act 1872', 'X Act']);
      expect(out[0].sections).toEqual([]);
      expect(readActList(undefined)).toEqual([]);
      expect(readActList('nope')).toEqual([]);
    });

    it('readDraftingInstructionList: reads prompt_context; missing gives []', () => {
      expect(readDraftingInstructionList({ prompt_context: 'Be precise.' })).toEqual(
        expect.arrayContaining([expect.stringContaining('Be precise.')]),
      );
      expect(readDraftingInstructionList({})).toEqual([]);
      expect(readDraftingInstructionList(null)).toEqual([]);
    });
  });
});

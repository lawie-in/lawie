/**
 * T-248 - three wrong BNSS citations in shipped packs (review_petition,
 * habeas_corpus, discharge_application). Legal sign-off: Ajay (CLO), 12 Oct 2026,
 * handoff/legal/T-248-pack-citations-signed.md. Old-code references (S.362 CrPC,
 * S.97 CrPC, S.245 CrPC) are correct and must stay.
 */
import './setupEnv';
import fs from 'fs';
import path from 'path';

import { loadAllDocRules } from '../services/template-promoter';
import type { TemplateConfig } from '../services/template-engine.service';

const DIR = path.join(__dirname, '..', 'config', 'document-rules');

interface Section {
  number: string;
  description: string;
}
interface Pack {
  displayName: string;
  _meta: { description: string };
  form_schema: unknown;
  prompt_context: { promptInstructions: string[] };
  relevantActs: { act: string; sections: Section[] }[];
}

const rawText = (id: string): string => fs.readFileSync(path.join(DIR, `${id}.json`), 'utf-8');
const pack = (id: string): Pack => JSON.parse(rawText(id)) as Pack;
const sections = (id: string): Section[] => pack(id).relevantActs.flatMap((a) => a.sections);
const numbers = (id: string): string[] => sections(id).map((s) => s.number);
const instructions = (id: string): string => pack(id).prompt_context.promptInstructions.join('\n');

const registry = loadAllDocRules();
const promoted = (id: string): TemplateConfig => {
  const c = registry.configs.get(id);
  if (!c) throw new Error(`pack ${id} did not build`);
  return c;
};
const promotedText = (id: string): string => JSON.stringify(promoted(id));

describe('T-248 review_petition cites S.403 BNSS, not S.413', () => {
  const id = 'review_petition';

  it('no S.413 BNSS / BNSS S.413 anywhere in the file', () => {
    const raw = rawText(id);
    expect(raw).not.toContain('S.413 BNSS');
    expect(raw).not.toContain('BNSS S.413');
    expect(numbers(id)).not.toContain('S.413');
  });

  it('S.403 BNSS is in the meta description and the prompt instructions', () => {
    expect(pack(id)._meta.description).toContain('S.403 BNSS (criminal HC)');
    expect(instructions(id)).toContain('S.403 BNSS');
  });

  it('provisions list carries S.403 with the unchanged description', () => {
    expect(numbers(id)).toContain('S.403');
    expect(sections(id).find((s) => s.number === 'S.403')!.description).toBe(
      'Bar on alteration of criminal judgment (was S.362 CrPC) — narrow review for clerical/arithmetical errors only',
    );
  });

  it('keeps the old-code S.362 CrPC reference and drops "proviso" next to S.403', () => {
    expect(instructions(id)).toContain('S.362 CrPC');
    expect(rawText(id)).not.toMatch(/S\.403 BNSS\s+proviso/);
    expect(instructions(id)).not.toMatch(/proviso/i);
  });

  it("Ajay's exact strings appear verbatim", () => {
    const i = instructions(id);
    expect(i).toContain('S.403 BNSS [S.362 CrPC bar on review');
    expect(i).toContain('NOTE: BNSS S.403 retains the bar on criminal review');
    expect(i).toContain('only clerical/arithmetical errors under S.403 BNSS (S.362 CrPC).');
  });

  it('the pack still promotes to a template config', () => {
    expect(promoted(id).template_id).toBe(id);
    expect(promotedText(id)).not.toContain('S.413');
  });
});

describe('T-248 habeas_corpus cites S.100 BNSS, not S.97 BNSS', () => {
  const id = 'habeas_corpus';

  it('no S.97 BNSS anywhere; provisions number is S.100, none S.97', () => {
    expect(rawText(id)).not.toContain('S.97 BNSS');
    expect(numbers(id)).toContain('S.100');
    expect(numbers(id)).not.toContain('S.97');
  });

  it('S.100 BNSS is in the field label and the prompt instructions (verbatim)', () => {
    expect(rawText(id)).toContain(
      'Representations made (police complaint, Magistrate u/S.100 BNSS, Advisory Board, etc.)',
    );
    expect(instructions(id)).toContain(
      'Magistrate u/S.100 BNSS [S.97 CrPC search warrant for unlawfully confined person]',
    );
  });

  it("provisions description equals Ajay's exact text", () => {
    expect(sections(id).find((s) => s.number === 'S.100')!.description).toBe(
      'Search for persons wrongfully confined (replaces S.97 CrPC)',
    );
  });

  it('keeps the old-code S.97 CrPC reference', () => {
    expect(rawText(id)).toContain('S.97 CrPC');
  });

  it('the promoted form carries the S.100 BNSS label', () => {
    const text = promotedText(id);
    expect(text).toContain('Magistrate u/S.100 BNSS');
    expect(text).not.toContain('S.97 BNSS');
  });
});

describe('T-248 discharge_application: S.268 BNSS warrant case on a complaint, no summons case', () => {
  const id = 'discharge_application';
  const OLD_CASE = 'summons_case_by_magistrate_s272';
  const NEW_CASE = 'warrant_case_by_magistrate_complaint_s268';
  const OLD_SECTION = 's_272_bnss_summons_magistrate';
  const NEW_SECTION = 's_268_bnss_warrant_magistrate_complaint';

  it('no "272" and no "summons" (any case) anywhere in the file', () => {
    const raw = rawText(id);
    expect(raw).not.toContain('272');
    expect(raw.toLowerCase()).not.toContain('summons');
  });

  it('displayName is exactly "Discharge Application"', () => {
    expect(pack(id).displayName).toBe('Discharge Application');
    expect(promoted(id).display_name).toBe('Discharge Application');
  });

  it('the raw case_type and applicable_section options are swapped', () => {
    const raw = rawText(id);
    expect(raw).toContain(`"${NEW_CASE}"`);
    expect(raw).not.toContain(OLD_CASE);
    expect(raw).toContain(`"${NEW_SECTION}"`);
    expect(raw).not.toContain(OLD_SECTION);
  });

  it('the promoted form offers the new option values and not the old ones', () => {
    const fields = promoted(id).form_schema.steps.flatMap((s) => s.fields);
    const labels = (fid: string): string[] =>
      (fields.find((f) => f.field_id === fid)?.options ?? []).map((o) =>
        typeof o === 'string' ? o : o.label,
      );
    expect(labels('case_type')).toContain(NEW_CASE);
    expect(labels('case_type')).not.toContain(OLD_CASE);
    expect(labels('applicable_section')).toContain(NEW_SECTION);
    expect(labels('applicable_section')).not.toContain(OLD_SECTION);
  });

  it('provisions list carries S.250, S.262, S.268 and the exact S.268 description', () => {
    expect(numbers(id)).toEqual(expect.arrayContaining(['S.250', 'S.262', 'S.268']));
    expect(numbers(id)).not.toContain('S.272');
    expect(sections(id).find((s) => s.number === 'S.268')!.description).toBe(
      'Discharge in a warrant case instituted on a complaint (replaces S.245 CrPC)',
    );
  });

  it("Ajay's exact strings appear verbatim", () => {
    const raw = rawText(id);
    expect(raw).toContain(
      'Application for discharge u/S.250 BNSS (Sessions) / S.262 BNSS (warrant case before Magistrate on a police report) / S.268 BNSS (warrant case before Magistrate on a complaint)',
    );
    expect(raw).toContain('S.250 / S.262 / S.268 BNSS');
    expect(raw).toContain(
      '(c) Warrant Case by Magistrate on a complaint — S.268 BNSS (was S.245 CrPC).',
    );
    expect(raw).toContain('reference S.250/S.262/S.268 BNSS as applicable.');
    expect(raw).toContain('s_268 with warrant magistrate on complaint');
  });

  it('keeps the old-code S.245 CrPC reference', () => {
    expect(rawText(id)).toContain('S.245 CrPC');
  });
});

describe('T-248 the real loader builds all three packs', () => {
  it('registry has no parse/promote failure for these files', () => {
    const bad = registry.mismatchReport.filter(
      (m) =>
        /parse\/promote failed/.test(m) &&
        /review_petition|habeas_corpus|discharge_application/.test(m),
    );
    expect(bad).toEqual([]);
    for (const id of ['review_petition', 'habeas_corpus', 'discharge_application']) {
      expect(registry.configs.has(id)).toBe(true);
    }
  });
});

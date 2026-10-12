/**
 * T-295 - the old-law block becomes a soft warning carrying Ajay's signed line
 * (handoff/legal/T-295-old-law-block-signed.md, 455559c).
 *
 * Expected values are literals from the signed text, never built from the code under test
 * (except the one explicit "one source, two uses" check).
 */
import './setupEnv';
import './setupDb';

import { createHash } from 'crypto';

import { preflightCheck } from '../services/preflight.service';
import {
  buildAIUserPrompt,
  buildPlaceholderContext,
  classifySectionsBailability,
  loadTemplateConfig,
  oldLawLine,
} from '../services/template-engine.service';

const SIGNED_TEMPLATE =
  '{Code} {n} is an old-law section. For an offence committed on or after 1 July 2024, use the section converter to find the {NewCode} section. For an earlier offence, the old section may still apply.\n';
const SIGNED_SHA = 'ae7b7e4e8b713f6acf660424f986cce5798b76d4e265ebfd2886422cb54a6535';

const signed = (code: string, n: string, newCode: string): string =>
  `${code} ${n} is an old-law section. For an offence committed on or after 1 July 2024, use the section converter to find the ${newCode} section. For an earlier offence, the old section may still apply.`;

const BNS_BEFORE_OLD = /BNS (Section )?\d+[A-Z]?\s*\(?(IPC|CrPC|IEA)/;

const BASE = {
  court_name: 'patna_hc',
  applicant_name: 'Ramesh Kumar',
  father_name: 'Suresh Kumar',
  respondent_name: 'State of Bihar',
  applicant_age: 35,
  fir_number: '091/2024',
  fir_date: '15.06.2024',
  incident_date: '10.06.2024',
  facts_narrative:
    'The petitioner was falsely implicated in the FIR. At the time of the alleged incident, the petitioner was at his residence in Patna. The victim was injured but received timely medical treatment and is now recovering.',
};

async function run(sections: unknown) {
  const r = await preflightCheck('bail_anticipatory', { ...BASE, sections_charged: sections });
  const hits = r._meta?.rule_hits ?? [];
  return { r, hits };
}

describe('T-295 signed line (SHA pin)', () => {
  it('the signed template hashes to the SHA in the legal file', () => {
    expect(createHash('sha256').update(SIGNED_TEMPLATE).digest('hex')).toBe(SIGNED_SHA);
  });

  it('the template rebuilt from oldLawLine() with placeholders matches the signed bytes', () => {
    // Substitute the placeholders back out of the three real outputs.
    const rebuilt = (code: string, newCode: string): string =>
      (oldLawLine(code as never, '{n}') as string)
        .replace(code === 'CRPC' ? 'CrPC' : code, '{Code}')
        .replace(newCode, '{NewCode}');
    for (const [code, newCode] of [
      ['IPC', 'BNS'],
      ['CRPC', 'BNSS'],
      ['IEA', 'BSA'],
    ]) {
      const tpl = rebuilt(code, newCode) + '\n';
      expect(tpl).toBe(SIGNED_TEMPLATE);
      expect(createHash('sha256').update(tpl).digest('hex')).toBe(SIGNED_SHA);
    }
  });

  it('oldLawLine gives null for BNS, BNSS, BSA, OTHER and no code', () => {
    expect(oldLawLine('BNS', '103')).toBeNull();
    expect(oldLawLine('BNSS', '480')).toBeNull();
    expect(oldLawLine('BSA', '63')).toBeNull();
    expect(oldLawLine('OTHER', '20')).toBeNull();
    expect(oldLawLine(null, '302')).toBeNull();
  });
});

describe('T-295 AC3: old-law entries are a soft warning with the signed line', () => {
  it.each([
    ['302 IPC', 'IPC', '302', 'BNS'],
    ['420-IPC', 'IPC', '420', 'BNS'],
    ['CrPC 438', 'CrPC', '438', 'BNSS'],
    ['IEA 65B', 'IEA', '65B', 'BSA'],
    ['IPC 302', 'IPC', '302', 'BNS'],
  ])(
    '"%s" gives exactly the signed line, code first, soft, no block',
    async (typed, code, n, newCode) => {
      const { r, hits } = await run(typed);
      expect(r.verdict).toBe('soft');
      expect(r.hardBlockReason).toBeUndefined();
      expect(hits.filter((h) => h === 'old_law_section')).toHaveLength(1);
      expect(hits).not.toContain('section_whitelist');
      expect(r.questions).toEqual([signed(code, n, newCode)]);
      expect(r.questions.join('\n')).not.toMatch(BNS_BEFORE_OLD);
      expect(r.questions.join('\n')).not.toContain('is not in the First Schedule');
    },
  );

  it('array entries from the picker, ["302 IPC"], also give the signed line', async () => {
    const { r } = await run(['302 IPC']);
    expect(r.verdict).toBe('soft');
    expect(r.questions).toEqual([signed('IPC', '302', 'BNS')]);
  });
});

describe('T-295: BNS and other codes are unchanged', () => {
  it('"BNS 999(1)" still hard-blocks under section_whitelist', async () => {
    const { r, hits } = await run('BNS 999(1)');
    expect(r.verdict).toBe('hard');
    expect(hits).toContain('section_whitelist');
    expect(hits).not.toContain('old_law_section');
    expect(r.hardBlockReason).toContain('is not in the First Schedule');
  });

  it('mixed list "BNS 103, IPC 302" gives one soft finding and no block', async () => {
    const { r, hits } = await run('BNS 103, IPC 302');
    expect(r.verdict).toBe('soft');
    expect(r.hardBlockReason).toBeUndefined();
    expect(hits).not.toContain('section_whitelist');
    expect(hits.filter((h) => h === 'old_law_section')).toHaveLength(1);
    expect(r.questions).toEqual([signed('IPC', '302', 'BNS')]);
    expect(r.questions.join('\n')).not.toMatch(BNS_BEFORE_OLD);
  });

  it('dedupe: "IPC 302, 302 IPC" gives one finding', async () => {
    const { r, hits } = await run('IPC 302, 302 IPC');
    expect(hits.filter((h) => h === 'old_law_section')).toHaveLength(1);
    expect(r.questions).toEqual([signed('IPC', '302', 'BNS')]);
    expect(r.verdict).toBe('soft');
  });

  it('distinct sections are separate findings: "IPC 302, CrPC 438"', async () => {
    const { r, hits } = await run('IPC 302, CrPC 438');
    expect(hits.filter((h) => h === 'old_law_section')).toHaveLength(2);
    expect(r.questions).toEqual(
      expect.arrayContaining([signed('IPC', '302', 'BNS'), signed('CrPC', '438', 'BNSS')]),
    );
  });

  // Arjun ruling (ticket 11e9ebb): old-law findings come from the whole-string reader.
  it('"302 IPC, 420" gives two soft old_law_section findings (IPC 302, IPC 420)', async () => {
    const { r, hits } = await run('302 IPC, 420');
    expect(r.verdict).toBe('soft');
    expect(r.hardBlockReason).toBeUndefined();
    expect(hits.filter((h) => h === 'old_law_section')).toHaveLength(2);
    expect(r.questions).toEqual(
      expect.arrayContaining([signed('IPC', '302', 'BNS'), signed('IPC', '420', 'BNS')]),
    );
    expect(hits).not.toContain('section_no_code');
  });

  it('"302, 34 IPC" gives two findings (IPC 302, IPC 34)', async () => {
    const { r, hits } = await run('302, 34 IPC');
    expect(r.verdict).toBe('soft');
    expect(hits.filter((h) => h === 'old_law_section')).toHaveLength(2);
    expect(r.questions).toEqual(
      expect.arrayContaining([signed('IPC', '302', 'BNS'), signed('IPC', '34', 'BNS')]),
    );
  });

  it('"IPC 302/34" gives one old-law finding (IPC 302) and the bare-number no-code warning for 34', async () => {
    const { r, hits } = await run('IPC 302/34');
    expect(r.verdict).toBe('soft');
    expect(hits.filter((h) => h === 'old_law_section')).toHaveLength(1);
    expect(r.questions).toContain(signed('IPC', '302', 'BNS'));
    expect(r.questions).not.toContain(signed('IPC', '34', 'BNS'));
    expect(hits.filter((h) => h === 'section_no_code')).toHaveLength(1);
    expect(r.questions).toContain(
      'Section 34 has no code (BNS, IPC …). Add the code so it can be checked.',
    );
  });

  it('a bare number never gets an old-law finding', async () => {
    const { r, hits } = await run('103, 105');
    expect(hits).not.toContain('old_law_section');
    expect(r.questions.join('\n')).not.toContain('old-law section');
  });

  it.each(['BNSS 480', 'BSA 63', 'NDPS Act 20'])('"%s" gives no old-law finding', async (typed) => {
    const { r, hits } = await run(typed);
    expect(hits).not.toContain('old_law_section');
    expect(hits).not.toContain('section_whitelist');
    expect(r.questions.join('\n')).not.toContain('old-law section');
  });
});

describe('T-295: one source, two uses (prompt block carries the same line)', () => {
  it.each([
    ['IPC 302', signed('IPC', '302', 'BNS')],
    ['420 IPC', signed('IPC', '420', 'BNS')],
    ['CrPC 438', signed('CrPC', '438', 'BNSS')],
    ['IEA 65B', signed('IEA', '65B', 'BSA')],
  ])('classifySectionsBailability("%s") is exactly the signed line', (typed, line) => {
    const out = classifySectionsBailability(typed);
    expect(out).toBe(line);
    expect(out).not.toMatch(BNS_BEFORE_OLD);
  });

  it('mixed "BNS 103, IPC 302": BNS classified, IPC line signed, no BNS 302', () => {
    const out = classifySectionsBailability('BNS 103, IPC 302');
    expect(out).toContain('BNS 103 (NON-BAILABLE)');
    expect(out).toContain(signed('IPC', '302', 'BNS'));
    expect(out).not.toContain('BNS 302');
    expect(out).not.toMatch(BNS_BEFORE_OLD);
  });

  it('classify output equals the preflight question for the same entry', async () => {
    const { r } = await run('IPC 302');
    expect(classifySectionsBailability('IPC 302')).toBe(r.questions[0]);
    expect(classifySectionsBailability('IPC 302')).toBe(oldLawLine('IPC', '302'));
  });

  it('the assembled body prompt carries the signed line and no "BNS 302"', () => {
    const config = loadTemplateConfig('bail_regular')!;
    const body = config.document_structure.sections.find((s) => s.section_id === 'body')!;
    const ctx = buildPlaceholderContext(
      config,
      { sections_charged: 'IPC 302', facts_narrative: 'Facts.' },
      {},
    );
    const prompt = buildAIUserPrompt(body, ctx);
    expect(prompt).toContain(signed('IPC', '302', 'BNS'));
    expect(prompt).not.toContain('is not classified here');
    expect(prompt).not.toMatch(BNS_BEFORE_OLD);
    expect(prompt).not.toContain('BNS 302');
  });
});

/**
 * T-277 round 4 (FINAL) - Arjun's rule for reading sections_charged, his correction to
 * step 7, Ajay's signed bail titles, and the readers built on them.
 *
 * Fixtures are written as `code number` lists exactly as Arjun's table gives them
 * ("bare" = code not stated). Expected values are literals from the ticket, never
 * computed with the code under test.
 */
import './setupEnv';
import './setupDb';

import { SectionMapping } from '../models/SectionMapping.model';
import { checkBailEligibility } from '../services/bail-check.service';
import {
  ChargedSection,
  readChargedField,
  readSectionsCharged,
} from '../services/bns-offence-resolver';
import { preflightCheck } from '../services/preflight.service';
import { invalidateCache } from '../services/sections.service';
import {
  buildAIUserPrompt,
  buildPlaceholderContext,
  classifySectionsBailability,
  loadTemplateConfig,
} from '../services/template-engine.service';
import { extractBNSSectionNumbers, validateBNSWhitelist } from '../services/validator';

const show = (list: ChargedSection[]): string[] =>
  list.map((e) => `${e.code ?? 'bare'} ${e.number}`);

// ── Arjun's 16 round-4 fixtures (plus the null / empty pair) ─────────────────

const ROUND4: Array<[string, string[]]> = [
  ['BNS 64, 115(2) (IPC 376, 323)', ['BNS 64', 'BNS 115(2)', 'IPC 376', 'IPC 323']],
  ['BNS 64 (IPC 376), 115(2)', ['BNS 64', 'IPC 376', 'BNS 115(2)']],
  ['BNS 318(4) (IPC 420)', ['BNS 318(4)', 'IPC 420']],
  ['302 IPC r/w 34 IPC', ['IPC 302', 'IPC 34']],
  ['302, 34 IPC', ['IPC 302', 'IPC 34']],
  ['IPC 302/34', ['IPC 302', 'bare 34']],
  ['Section 103 of the Bharatiya Nyaya Sanhita, 2023', ['BNS 103']],
  ['BNS 103(1), 2023', ['BNS 103(1)']],
  ['103, 105', ['bare 103', 'bare 105']],
  ['BNS 103 (non-bailable), 351', ['BNS 103', 'BNS 351']],
  ['BNSS 480, BSA 63', ['BNSS 480', 'BSA 63']],
  ['BNS 303, BNSS 187 and 479', ['BNS 303', 'BNSS 187', 'BNSS 479']],
  ['FIR No. 123/2024 u/s BNS 303', ['BNS 303']],
  ['NDPS Act 20, BNS 303', ['OTHER 20', 'BNS 303']],
  ['BNS 103, BNS 103', ['BNS 103']],
];

describe('readSectionsCharged: Arjun round-4 fixtures', () => {
  it.each(ROUND4)('%s', (input, expected) => {
    expect(show(readSectionsCharged(input))).toEqual(expected);
  });

  it('empty string and null give an empty list and do not throw', () => {
    expect(readSectionsCharged('')).toEqual([]);
    expect(readSectionsCharged(null)).toEqual([]);
    expect(readSectionsCharged(undefined)).toEqual([]);
  });

  it('"BNS 64, 115(2) (IPC 376, 323)": 323 is never BNS (the round-3 failure)', () => {
    const out = readSectionsCharged('BNS 64, 115(2) (IPC 376, 323)');
    expect(out.find((e) => e.number === '323')?.code).toBe('IPC');
    expect(show(out)).not.toContain('BNS 323');
    // Arjun's added check: 323 is IPC 323, never a bare 323.
    expect(show(out)).toContain('IPC 323');
    expect(show(out)).not.toContain('bare 323');
    expect(out.some((e) => e.code === null)).toBe(false);
  });

  it('alias handling: only alias-bracket entries carry alias, the outer list is untouched', () => {
    expect(readSectionsCharged('BNS 64, 115(2) (IPC 376, 323)')).toEqual([
      { code: 'BNS', number: '64' },
      { code: 'BNS', number: '115(2)' },
      { code: 'IPC', number: '376', alias: true },
      { code: 'IPC', number: '323', alias: true },
    ]);
    expect(readSectionsCharged('BNS 64 (IPC 376), 115(2)')).toEqual([
      { code: 'BNS', number: '64' },
      { code: 'IPC', number: '376', alias: true },
      { code: 'BNS', number: '115(2)' },
    ]);
  });

  it('a comment bracket ("(non-bailable)") is ignored, numbers inside it included', () => {
    expect(show(readSectionsCharged('BNS 103 (main accused 77), 351'))).toEqual([
      'BNS 103',
      'BNS 351',
    ]);
  });

  it('a run of 4+ digits is never a section (2023, 1860, 2024)', () => {
    expect(show(readSectionsCharged('IPC 302 of 1860, BNS 103 2023'))).toEqual([
      'IPC 302',
      'BNS 103',
    ]);
  });

  it('is pure: the default code is a parameter, not state', () => {
    expect(show(readSectionsCharged('303'))).toEqual(['bare 303']);
    expect(show(readSectionsCharged('303', 'BNS'))).toEqual(['BNS 303']);
    expect(show(readSectionsCharged('303'))).toEqual(['bare 303']);
    expect(show(readSectionsCharged('302 IPC', 'BNS'))).toEqual(['IPC 302']);
  });
});

// ── Arjun's correction to step 7: the 3 correction fixtures ──────────────────

describe('readChargedField: correction to step 7', () => {
  it('"103, 105" as a free-text string -> two bare numbers', () => {
    expect(show(readChargedField('103, 105', 'bns_mapping'))).toEqual(['bare 103', 'bare 105']);
    expect(show(readChargedField('103, 105', undefined))).toEqual(['bare 103', 'bare 105']);
  });

  it('["303","351"] from a bns_mapping field -> BNS 303, BNS 351', () => {
    expect(show(readChargedField(['303', '351'], 'bns_mapping'))).toEqual(['BNS 303', 'BNS 351']);
  });

  it('["303","302 IPC"] from a bns_mapping field -> BNS 303, IPC 302 (explicit code wins)', () => {
    expect(show(readChargedField(['303', '302 IPC'], 'bns_mapping'))).toEqual([
      'BNS 303',
      'IPC 302',
    ]);
  });

  it('an array on any other field keeps bare numbers bare', () => {
    expect(show(readChargedField(['303', '351'], undefined))).toEqual(['bare 303', 'bare 351']);
    expect(show(readChargedField(['303', '351'], 'text'))).toEqual(['bare 303', 'bare 351']);
  });

  it('entries are deduped across the array', () => {
    expect(show(readChargedField(['303', '303', 'BNS 303'], 'bns_mapping'))).toEqual(['BNS 303']);
  });

  it('ACCEPTED RESIDUAL (Arjun, step 7 correction 2): a bare "302" in a bns_mapping array reads as BNS 302', () => {
    // Known and accepted: the field and its search are BNS, so a bare old-law number
    // typed into the picker is read as BNS. The same text as a plain string stays bare.
    expect(show(readChargedField(['302'], 'bns_mapping'))).toEqual(['BNS 302']);
    expect(show(readChargedField('302', 'bns_mapping'))).toEqual(['bare 302']);
  });

  it('null / undefined / empty array give an empty list', () => {
    expect(readChargedField(null, 'bns_mapping')).toEqual([]);
    expect(readChargedField(undefined, 'bns_mapping')).toEqual([]);
    expect(readChargedField([], 'bns_mapping')).toEqual([]);
  });
});

// ── Property: the "use EXACTLY" block ────────────────────────────────────────

describe('prompt block property (the round-3 failure)', () => {
  const config = loadTemplateConfig('bail_regular');
  const MARK = 'use EXACTLY as given, do NOT contradict):\n';
  const END = '\nA section in neither list';

  function blockFor(value: unknown): string | null {
    const body = config!.document_structure.sections.find((s) => s.section_id === 'body')!;
    const ctx = buildPlaceholderContext(
      config!,
      { sections_charged: value, facts_narrative: 'Facts.' },
      {},
    );
    const prompt = buildAIUserPrompt(body, ctx);
    const at = prompt.indexOf(MARK);
    if (at === -1) return null;
    const from = at + MARK.length;
    return prompt.slice(from, prompt.indexOf(END, from));
  }

  /** The piece of the block (a ", "- or newline-separated item) that mentions `n`. */
  function piecesWith(block: string, n: string): string[] {
    const esc = n.replace(/[()]/g, '\\$&');
    const re = new RegExp(`(?<![0-9A-Za-z(])${esc}(?![0-9A-Za-z(])`);
    return block.split(/\n|, /).filter((p) => re.test(p));
  }

  const fixtures: Array<[string, string]> = ROUND4.map(([i]) => [i, i]);

  it.each(fixtures)('%s: no non-BNS entry carries a BNS label or a BAILABLE word', (input) => {
    const entries = readSectionsCharged(input);
    const block = blockFor(input);
    // No block at all (e.g. only BNSS / BSA entries) means nothing is labelled: property holds.
    if (block === null) return;
    const bnsNumbers = new Set(entries.filter((e) => e.code === 'BNS').map((e) => e.number));
    for (const e of entries.filter((x) => x.code !== 'BNS')) {
      if (bnsNumbers.has(e.number)) continue; // same digits legitimately BNS elsewhere
      expect(block).not.toContain(`BNS ${e.number}`);
      for (const piece of piecesWith(block!, e.number)) {
        expect(piece).not.toMatch(/BAILABLE/);
        expect(piece).not.toMatch(/\bBNS \d/);
      }
    }
  });

  it('the headline case: IPC 323 and IPC 376 never appear as BNS or as (BAILABLE)', () => {
    const block = blockFor('BNS 64, 115(2) (IPC 376, 323)')!;
    expect(block).not.toContain('BNS 323');
    expect(block).not.toContain('BNS 376');
    expect(block).not.toMatch(/323 \((?:NON-)?BAILABLE\)/);
    expect(block).not.toMatch(/376 \((?:NON-)?BAILABLE\)/);
    expect(block).toContain('IPC 323 is an old-law section');
  });

  it('bare "103, 105": no BNS label, no BAILABLE word, existing "verify" wording', () => {
    const block = blockFor('103, 105')!;
    expect(block).toBe(
      '103 (classification: verify from First Schedule), 105 (classification: verify from First Schedule)',
    );
  });

  it('BNSS / BSA / OTHER entries get no label and no line', () => {
    expect(classifySectionsBailability('BNSS 480, BSA 63')).toBe('');
    expect(classifySectionsBailability('NDPS Act 20, BNS 303')).toBe(
      'BNS 303 (classification: verify from First Schedule)',
    );
  });

  it('call site: a bns_mapping array ["303","302 IPC"] gives BNS 303 and the IPC 302 line, never BNS 302', () => {
    const block = blockFor(['303', '302 IPC'])!;
    expect(block).toContain('BNS 303 (classification: verify from First Schedule)');
    expect(block).toContain('IPC 302 is an old-law section');
    expect(block).not.toContain('BNS 302');
  });

  it('call site: ["303","351"] is labelled as BNS', () => {
    const block = blockFor(['303', '351'])!;
    expect(block).toContain('BNS 303 (classification: verify from First Schedule)');
    expect(block).toContain('BNS 351');
  });

  it('call site residual: ["302"] from the picker is labelled BNS 302', () => {
    expect(blockFor(['302'])).toContain('BNS 302');
  });
});

// ── Preflight ────────────────────────────────────────────────────────────────

describe('preflight reads sections_charged with the shared reader', () => {
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
  const NO_CODE = (n: string): string =>
    `Section ${n} has no code (BNS, IPC …). Add the code so it can be checked.`;

  async function run(sections: unknown, template = 'bail_anticipatory') {
    const r = await preflightCheck(template, { ...BASE, sections_charged: sections });
    return { r, hits: r._meta?.rule_hits ?? [] };
  }

  it('"103, 105" free text -> two section_no_code soft findings, exact text, no block', async () => {
    const { r, hits } = await run('103, 105');
    expect(r.verdict).toBe('soft');
    expect(hits.filter((h) => h === 'section_no_code')).toHaveLength(2);
    expect(hits).not.toContain('section_whitelist');
    expect(r.questions).toContain(NO_CODE('103'));
    expect(r.questions).toContain(NO_CODE('105'));
    expect(r.hardBlockReason).toBeUndefined();
    expect(r.questions.join('\n')).not.toContain('not in the First Schedule');
  });

  it('["303","351"] from the bns_mapping field passes', async () => {
    const { r, hits } = await run(['303', '351']);
    expect(r.verdict).toBe('pass');
    expect(hits).toEqual([]);
  });

  it('"BNS 999(1)" is a hard block (explicit BNS code, unknown parent)', async () => {
    const { r, hits } = await run('BNS 999(1)');
    expect(r.verdict).toBe('hard');
    expect(hits).toContain('section_whitelist');
    expect(r.hardBlockReason).toContain('is not in the First Schedule');
  });

  it('E1 still fires (soft) for ["115","351"]', async () => {
    const { r, hits } = await run(['115', '351']);
    expect(hits).toContain('E1');
    expect(r.verdict).toBe('soft');
  });

  // T-295 (Priya soft decision, Arjun build, Ajay signed line): explicit IPC / CrPC / IEA
  // entries are a SOFT warning, rule old_law_section, carrying the signed line (code first).
  describe('explicit old-law codes give a soft old_law_section warning (T-295)', () => {
    const SIGNED = (code: string, n: string, newCode: string): string =>
      `${code} ${n} is an old-law section. For an offence committed on or after 1 July 2024, use the section converter to find the ${newCode} section. For an earlier offence, the old section may still apply.`;

    it.each([
      ['IPC 302', 'IPC', '302', 'BNS'],
      ['CrPC 41', 'CrPC', '41', 'BNSS'],
      ['IEA 65B', 'IEA', '65B', 'BSA'],
    ])('"%s" is soft with the signed line', async (typed, code, n, newCode) => {
      const { r, hits } = await run(typed);
      expect(r.verdict).toBe('soft');
      expect(hits).toContain('old_law_section');
      expect(hits).not.toContain('section_whitelist');
      expect(r.hardBlockReason).toBeUndefined();
      expect(r.questions).toContain(SIGNED(code, n, newCode));
    });

    it('E1 is as before: an old-law entry among bailable BNS sections is not "all bailable"', async () => {
      const { hits } = await run(['115', 'IPC 302']);
      expect(hits).not.toContain('E1');
    });

    it('fixture 1 "BNS 64, 115(2) (IPC 376, 323)": soft old-law findings for IPC 376 and 323, no section_no_code', async () => {
      const { r, hits } = await run('BNS 64, 115(2) (IPC 376, 323)');
      expect(r.verdict).toBe('soft');
      expect(hits).toContain('old_law_section');
      expect(hits).not.toContain('section_whitelist');
      expect(hits).not.toContain('section_no_code');
      expect(r.questions.join('\n')).not.toContain('Section 323 has no code');
    });

    it('"BNS 303 (IPC 379)" (alias form) is soft with the IPC 379 line', async () => {
      const { r, hits } = await run('BNS 303 (IPC 379)');
      expect(r.verdict).toBe('soft');
      expect(hits).toContain('old_law_section');
      expect(r.questions).toContain(SIGNED('IPC', '379', 'BNS'));
    });

    it('["303","302 IPC"] is soft on IPC 302 (code first)', async () => {
      const { r, hits } = await run(['303', '302 IPC']);
      expect(r.verdict).toBe('soft');
      expect(hits).toContain('old_law_section');
      expect(r.questions).toContain(SIGNED('IPC', '302', 'BNS'));
    });
  });

  describe('BNSS, BSA and other Acts no longer block and get no label', () => {
    it.each(['BNSS 480', 'BSA 63', 'NDPS Act 20'])('"%s" does not block', async (typed) => {
      const { r, hits } = await run(typed);
      expect(r.verdict).not.toBe('hard');
      expect(hits).not.toContain('section_whitelist');
      expect(hits).not.toContain('section_no_code');
    });
  });
});

// ── Validator ────────────────────────────────────────────────────────────────

describe('validator reads draft text through readSectionsCharged', () => {
  const flagged = (text: string): string[] =>
    validateBNSWhitelist(extractBNSSectionNumbers(text)).map((w) => String(w.details?.section));

  it('does not flag "BNS 61(2)(a)"', () => {
    expect(extractBNSSectionNumbers('charged under BNS 61(2)(a)')).toEqual(['61(2)(a)']);
    expect(flagged('charged under BNS 61(2)(a)')).toEqual([]);
  });

  it('does not flag "BNS 2023" (4 digits are never a section)', () => {
    expect(extractBNSSectionNumbers('the Bharatiya Nyaya Sanhita, BNS 2023')).toEqual([]);
    expect(flagged('under BNS 2023')).toEqual([]);
  });

  it('flags "BNS 999(1)"', () => {
    expect(flagged('under BNS 999(1)')).toEqual(['999(1)']);
  });

  it('counts BNS only: an IPC citation in the draft is not a BNS number', () => {
    expect(extractBNSSectionNumbers('IPC 999 and BNS 103')).toEqual(['103']);
  });
});

// ── bail-check: Ajay's signed 483 / 480 titles ───────────────────────────────

describe('bail-check: Ajay signed bail titles (BNSS 483 / 480)', () => {
  const T483 =
    'Bail in non-bailable offence (BNSS Section 483), discretionary: apply to the Sessions Court or the High Court';
  const T480 =
    'Bail in non-bailable offence (BNSS Section 480), discretionary: apply to the Magistrate; if refused, to the Sessions Court or the High Court under BNSS Section 483';

  afterEach(() => invalidateCache());

  it.each([
    ['103', ['103']],
    ["['103','316(2)']", ['103', '316(2)']],
    ['103(1)', ['103(1)']],
  ])('%s -> 483, exact title, High Court wording, recommendation embeds 483', async (_l, input) => {
    const { summary } = await checkBailEligibility(input);
    expect(summary.overallBailable).toBe(false);
    expect(summary.bnssBailSection).toBe('483');
    expect(summary.bnssBailSectionTitle).toBe(T483);
    // T-289: no term-based court explanation any more
    expect(summary.courtLevelExplanation).toBe('');
    expect(summary.recommendation).toContain('filed under BNSS Section 483');
    expect(summary.recommendation).not.toContain('Section 480');
  });

  it('74 (non-bailable, up to 7 years) -> 480, exact title, recommendation embeds 480', async () => {
    const { summary } = await checkBailEligibility(['74']);
    expect(summary.bnssBailSection).toBe('480');
    expect(summary.bnssBailSectionTitle).toBe(T480);
    expect(summary.recommendation).toContain('filed under BNSS Section 480');
    expect(summary.recommendation).not.toContain('filed under BNSS Section 483');
  });

  it("'420-IPC' -> 318(4) (non-bailable, 7 years) -> 480, exact title", async () => {
    await SectionMapping.insertMany([
      {
        oldCode: 'IPC',
        oldCodeFull: 'Indian Penal Code, 1860',
        newCode: 'BNS',
        newCodeFull: 'Bharatiya Nyaya Sanhita, 2023',
        oldSection: '420',
        newSection: '318(4)',
        oldTitle: 'Cheating',
        newTitle: 'Cheating',
        mappingType: 'direct',
        effectiveDate: new Date('2024-07-01'),
      },
    ]);
    invalidateCache();
    const { sections, summary } = await checkBailEligibility(['420-IPC']);
    expect(sections[0].bnsSection).toBe('318(4)');
    expect(summary.bnssBailSection).toBe('480');
    expect(summary.bnssBailSectionTitle).toBe(T480);
    expect(summary.recommendation).toContain('filed under BNSS Section 480');
  });

  it('\'420-IPC\' with no mapping reads "IPC 420" in the Section line, never "420-IPC"', async () => {
    const { summary } = await checkBailEligibility(['420-IPC']);
    expect(summary.undeterminedSections).toEqual(['IPC 420']);
    expect(summary.recommendation).toContain('Section IPC 420: ');
    expect(summary.recommendation).not.toContain('420-IPC');
  });

  it('\'420-IPC\' mapped to a non-offence reads "IPC 420" in the left-out line', async () => {
    await SectionMapping.insertMany([
      {
        oldCode: 'IPC',
        oldCodeFull: 'Indian Penal Code, 1860',
        newCode: 'BNS',
        newCodeFull: 'Bharatiya Nyaya Sanhita, 2023',
        oldSection: '420',
        newSection: '330(1)',
        oldTitle: 'Cheating',
        newTitle: 'Definition',
        mappingType: 'direct',
        effectiveDate: new Date('2024-07-01'),
      },
    ]);
    invalidateCache();
    const { summary } = await checkBailEligibility(['420-IPC', '115-BNS']);
    expect(summary.recommendation).toContain(
      'Section IPC 420 does not create an offence, so it was left out.',
    );
    expect(summary.recommendation).not.toContain('420-IPC');
  });
});

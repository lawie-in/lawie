/**
 * T-566: Ajay's section D legal fixes to the draft prompts and rule packs
 * (pre-Anushka legal review, 22 Oct 2026; rulings 54a-72, S1-S11a, 63a, 65g).
 *
 * Every expected string below is copied byte for byte from the signed review file and written
 * inline. This file reads no file under handoff/ (the rule packs and prompts under src/ are the
 * code under test). No database, no network, no model call.
 */
import './setupEnv';

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { withoutDisclaimers, withoutDisclaimerText } from '../services/brief-drafter';
import { P_TEXT, S_TEXT, LAW_SWITCH_PACKS } from '../services/law-switch';
import { assemblePrompt, _testing, PromptInput } from '../services/prompt-assembler';
import { readRulePack } from '../services/rule-pack.service';
import {
  buildAISystemPrompt,
  getsOffenceDateLawRule,
  isCriminalCategory,
  loadTemplateConfig,
  OFFENCE_DATE_LAW_RULE,
  sanitiseAIBody,
} from '../services/template-engine.service';
import { detectOldLawReferences } from '../services/validator';

// No Redis/Mongo: the old-law lookup is stubbed. IPC 302 has a mapping; any other section has none,
// so both branches of detectOldLawReferences are reached.
jest.mock('../services/sections.service', () => ({
  convertOldReferencesInText: jest.fn(async (text: string) => ({
    converted: text,
    conversions: [],
  })),
  lookupOldToNew: jest.fn(async (section: string, code: string) =>
    section === '302' && code === 'IPC'
      ? {
          old_code: 'IPC',
          old_code_full: 'Indian Penal Code',
          old_section: '302',
          old_title: 'Punishment for murder',
          new_code: 'BNS',
          new_code_full: 'Bharatiya Nyaya Sanhita',
          new_section: '103(1)',
          new_title: 'Punishment for murder',
          mapping_type: 'direct',
        }
      : null,
  ),
}));

// ── Signed strings (Ajay, 22 Oct 2026) ──────────────────────────────────────

const PERSONA =
  'You are a senior Indian advocate with 20+ years of practice, drafting a legal document for an advocate to review and file.';

const ITEM_54 =
  'Use BNS section numbers for an offence committed on or after 1 July 2024, and IPC section numbers for an offence committed before that date. For procedure and evidence, use BNSS and BSA, except in a matter that was pending before 1 July 2024, where CrPC and the Evidence Act continue to apply. If the date of the offence is not given, write [To be confirmed: section and code].';

const WHITELIST_LEAD_IN =
  'When you cite a BNS section, cite only one from this verified First Schedule list:';

const SENTENCE_S =
  'Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].';

const ipcWarning = (x: string): string =>
  `This draft cites Section ${x} IPC. Confirm the offence date: BNS applies to offences on or after 1 July 2024, IPC to offences before that date.`;

// ── Pack helpers ────────────────────────────────────────────────────────────

const RULES_DIR = join(__dirname, '..', 'config', 'document-rules');
const PACK_FILES = readdirSync(RULES_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();
const PACK_IDS = PACK_FILES.map((f) => f.replace(/\.json$/, ''));
// T-573 brought criminal_revision.json under the item-65 scans; every pack is now covered.
const T566_PACK_FILES = PACK_FILES;

type Json = unknown;
type Pack = Record<string, Json>;

const readPack = (id: string): Pack =>
  JSON.parse(readFileSync(join(RULES_DIR, `${id}.json`), 'utf-8')) as Pack;

function strings(o: Json, out: string[] = []): string[] {
  if (typeof o === 'string') out.push(o);
  else if (Array.isArray(o)) o.forEach((x) => strings(x, out));
  else if (o && typeof o === 'object') Object.values(o).forEach((x) => strings(x, out));
  return out;
}
function objects(o: Json, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(o)) o.forEach((x) => objects(x, out));
  else if (o && typeof o === 'object') {
    out.push(o as Record<string, unknown>);
    Object.values(o).forEach((x) => objects(x, out));
  }
  return out;
}
const packStrings = (id: string): string[] => strings(readPack(id));
const hasString = (id: string, text: string): boolean => packStrings(id).includes(text);
const anyContains = (id: string, text: string): boolean =>
  packStrings(id).some((s) => s.includes(text));
const instructions = (id: string): string[] => {
  const p = readPack(id);
  const pc = p.prompt_context as Record<string, unknown> | string | undefined;
  const list =
    (pc && typeof pc === 'object' ? pc.promptInstructions : undefined) ?? p.promptInstructions;
  return list as string[];
};

/** The pack with its top-level disclaimer keys (kept, ruling 65d) removed. */
function withoutTopLevelDisclaimers(id: string): Pack {
  const p = readPack(id);
  delete p.disclaimer;
  delete p.advocate_disclaimer;
  return p;
}

function promptInput(docType: string): PromptInput {
  return {
    docType,
    courtName: 'High Court of Judicature at Patna',
    courtType: 'high_court',
    partyDetails: { petitioner: 'A Kumar', respondent: 'B Kumar' },
    keyFacts: 'The parties married on 01/01/2020.',
    reliefPrayer: 'Grant the relief sought.',
    advocateName: 'X',
  } as unknown as PromptInput;
}

// ── 1. Item 55: persona ─────────────────────────────────────────────────────

describe('T-566 item 55: the persona line', () => {
  it('buildAISystemPrompt opens with the signed persona and never says court-ready', () => {
    for (const id of ['fir_quashing', 'rent_agreement', 'bail_regular', 'legal_notice_s138']) {
      const prompt = buildAISystemPrompt(loadTemplateConfig(id)!);
      expect(prompt.startsWith(`${PERSONA}\n\nDOCUMENT TYPE:`)).toBe(true);
      expect(prompt).not.toContain('court-ready');
    }
  });

  it('the prompt-assembler base prompt opens with the signed persona and never says court-ready', () => {
    for (const [category, docType] of [
      [undefined, undefined],
      ['criminal_petition', 'fir_quashing'],
      ['civil', 'rent_agreement'],
    ] as const) {
      const prompt = _testing.buildBasePrompt(category, docType);
      expect(prompt.startsWith(`${PERSONA}\n\nCRITICAL RULES:\n`)).toBe(true);
      expect(prompt).not.toContain('court-ready');
    }
  });

  it('the assembled prompt for a real pack has no court-ready either', async () => {
    const p = await assemblePrompt(promptInput('fir_quashing'));
    expect(p.systemPrompt).not.toContain('court-ready');
    expect(p.systemPrompt.startsWith(PERSONA)).toBe(true);
  });

  it('no court-ready in any rule pack or in the post-processor comment', () => {
    for (const f of PACK_FILES) {
      expect(readFileSync(join(RULES_DIR, f), 'utf-8')).not.toMatch(/court-ready/i);
    }
    const post = readFileSync(join(__dirname, '..', 'services', 'post-processor.ts'), 'utf-8');
    expect(post).not.toMatch(/court-ready/i);
    expect(post).toContain(
      'Post-process AI-generated text into a document for an advocate to review and file.',
    );
  });
});

// ── 2. Item 54 / ruling S1 ──────────────────────────────────────────────────

describe('T-566 item 54 (rulings 54a, 54b, S1): the offence-date law line', () => {
  it('OFFENCE_DATE_LAW_RULE is the signed text byte for byte', () => {
    expect(OFFENCE_DATE_LAW_RULE).toBe(ITEM_54);
  });

  it('isCriminalCategory: criminal and criminal_* only', () => {
    for (const c of [
      'criminal',
      'criminal_bail',
      'criminal_petition',
      'criminal_procedural',
      'criminal_appellate',
    ]) {
      expect(isCriminalCategory(c)).toBe(true);
    }
    for (const c of [
      'civil',
      'writ',
      'family',
      'tribunal',
      'notice',
      'corporate',
      'transactional_deed',
      'procedural',
      'criminalx',
      'non_criminal',
      '',
      undefined,
      null,
    ]) {
      expect(isCriminalCategory(c as string | undefined | null)).toBe(false);
    }
  });

  it('getsOffenceDateLawRule: criminal category, or writ_petition_criminal by id (S1)', () => {
    expect(getsOffenceDateLawRule('fir_quashing', 'criminal_petition')).toBe(true);
    expect(getsOffenceDateLawRule('writ_petition_criminal', 'writ')).toBe(true);
    expect(getsOffenceDateLawRule('writ_petition_civil', 'writ')).toBe(false);
    expect(getsOffenceDateLawRule('rent_agreement', 'civil')).toBe(false);
    expect(getsOffenceDateLawRule(undefined, undefined)).toBe(false);
  });

  // The 14 criminal-category packs (6 are the law-switch packs) plus writ_petition_criminal.
  const SWITCH = [...LAW_SWITCH_PACKS] as string[];
  const CRIMINAL_NON_SWITCH = [
    'legal_notice_s138',
    'criminal_appeal',
    'criminal_revision',
    'discharge_application',
    'fir_quashing',
    'quashing_528_bnss',
    'surrender_application',
    'suspension_of_sentence',
  ];
  // S1: these four get no item 54 line; their own lines (69, 57, 63, 62) govern.
  const OWN_LINE_PACKS = [
    'maintenance_bnss_144',
    'mact_claim',
    'legal_notice_defamation',
    'affidavit_identity',
  ];

  it('the 14 criminal-category packs are exactly the switch packs plus the 8 others', () => {
    const criminal = PACK_IDS.filter((id) => isCriminalCategory(readPack(id).category as string));
    expect(criminal.sort()).toEqual([...SWITCH, ...CRIMINAL_NON_SWITCH].sort());
    expect(criminal).toHaveLength(14);
  });

  it.each([...CRIMINAL_NON_SWITCH, 'writ_petition_criminal'])(
    '%s: the form prompt has the item 54 line as rule 1, exactly once, and no switch text',
    (id) => {
      const prompt = buildAISystemPrompt(loadTemplateConfig(id)!);
      expect(prompt).toContain(
        `CRITICAL RULES:\n1. ${ITEM_54}\n2. Format with numbered paragraphs`,
      );
      expect(prompt.split(ITEM_54)).toHaveLength(2);
      expect(prompt).not.toContain(S_TEXT);
      expect(prompt).not.toContain(P_TEXT);
    },
  );

  it.each(SWITCH)('%s (law-switch pack): S_TEXT + P_TEXT unchanged, no item 54 line', (id) => {
    const prompt = buildAISystemPrompt(loadTemplateConfig(id)!);
    expect(prompt).toContain(
      `CRITICAL RULES:\n1. ${S_TEXT} ${P_TEXT}\n2. Format with numbered paragraphs`,
    );
    expect(prompt).not.toContain(ITEM_54);
  });

  it.each([
    'rent_agreement',
    'nda',
    'mou',
    'writ_petition_civil',
    'consumer_complaint',
    'plaint_recovery',
    'divorce_hma',
    ...OWN_LINE_PACKS,
  ])('%s: no law line at all (54b/S1); rules start with the numbered-paragraph rule', (id) => {
    const prompt = buildAISystemPrompt(loadTemplateConfig(id)!);
    expect(prompt).not.toContain(ITEM_54);
    expect(prompt).not.toContain(S_TEXT);
    expect(prompt).not.toContain('Bharatiya Nyaya Sanhita (BNS) 2023, Bharatiya Nagarik');
    expect(prompt).toContain(
      'CRITICAL RULES:\n1. Format with numbered paragraphs (1, 2, 3...) for the body.',
    );
  });

  it('rent_agreement renumbers: the contracts anti-invention rule becomes rule 7', () => {
    const prompt = buildAISystemPrompt(loadTemplateConfig('rent_agreement')!);
    expect(prompt).toContain('\n7. CONTRACTS — ANTI-INVENTION RULE:');
    expect(prompt).not.toContain('\n8. CONTRACTS');
  });

  it('a criminal pack keeps the anti-invention rule off and numbers rules 1..7', () => {
    const prompt = buildAISystemPrompt(loadTemplateConfig('fir_quashing')!);
    expect(prompt).toContain('\n7. Write any date as D Month YYYY');
    expect(prompt).not.toContain('CONTRACTS — ANTI-INVENTION');
  });

  it('the old "NEVER reference old IPC" rule is gone from the whole drafting source and packs', () => {
    const srcRoot = join(__dirname, '..');
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = join(dir, e.name);
        if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(p);
        return /\.(ts|json)$/.test(e.name) ? [p] : [];
      });
    for (const file of walk(srcRoot)) {
      const text = readFileSync(file, 'utf-8');
      expect(`${file}: ${/NEVER reference old IPC/i.test(text)}`).toBe(`${file}: false`);
    }
  });

  it('prompt-assembler.assemblePrompt uses the same test (criminal pack yes, civil pack no)', async () => {
    const crim = await assemblePrompt(promptInput('fir_quashing'));
    expect(crim.systemPrompt).toContain(`CRITICAL RULES:\n1. ${ITEM_54}\n2. Format with numbered`);
    const wpc = await assemblePrompt(promptInput('writ_petition_criminal'));
    expect(wpc.systemPrompt).toContain(`CRITICAL RULES:\n1. ${ITEM_54}\n2. Format with numbered`);
    const civil = await assemblePrompt(promptInput('rent_agreement'));
    expect(civil.systemPrompt).not.toContain(ITEM_54);
    expect(civil.systemPrompt).toContain('CRITICAL RULES:\n1. Format with numbered');
    // Rule 9 ("Use today's date format...") is deleted (ruling 66); seven rules without the law line.
    expect(civil.systemPrompt).not.toContain("Use today's date format");
    expect(civil.systemPrompt).toContain('\n7. NEVER alter, embellish');
    expect(civil.systemPrompt.split('--- DOCUMENT TYPE')[0]).not.toContain('\n8. ');
  });
});

// ── 3. 54c whitelist lead-in ────────────────────────────────────────────────

describe('T-566 ruling 54c: the BNS whitelist lead-in', () => {
  it('criminal-category "criminal" packs get the re-signed lead-in and the unchanged tail', () => {
    for (const id of ['legal_notice_s138', 'bail_regular']) {
      const config = loadTemplateConfig(id)!;
      expect(config.category).toBe('criminal');
      const prompt = buildAISystemPrompt(config);
      expect(prompt).toContain(
        `BNS SECTION WHITELIST (MANDATORY — SCRUM-64): ${WHITELIST_LEAD_IN} `,
      );
      expect(prompt).not.toContain('You MUST ONLY cite BNS sections');
      // S2: the heading and the "does not exist" sentence are kept.
      expect(prompt).toContain(
        'Any BNS section number NOT in this list does not exist in the Bharatiya Nyaya Sanhita — do NOT use it under any circumstances.',
      );
      expect(prompt).toContain(
        'A sub-section of a listed section may be cited, for example 103(1) or 316(2).',
      );
    }
  });

  it('packs whose category is not exactly "criminal" get no whitelist', () => {
    for (const id of [
      'fir_quashing',
      'criminal_appeal',
      'rent_agreement',
      'writ_petition_criminal',
    ]) {
      expect(buildAISystemPrompt(loadTemplateConfig(id)!)).not.toContain('BNS SECTION WHITELIST');
    }
  });
});

// ── 4. S11a validator message ───────────────────────────────────────────────

describe('T-566 rulings S5a and S8a', () => {
  it('S5a: habeas_corpus opens with the sentence once; the quoted repeat is gone', () => {
    expect(instructions('habeas_corpus')[0]).toBe(
      'Draft a petition for writ of HABEAS CORPUS — the great writ of liberty.',
    );
    expect(packStrings('habeas_corpus').join('\n')).not.toContain(
      "'habeas corpus is the great writ of liberty.'",
    );
  });

  it('S8a: "title clause paragraph" appears nowhere; jda keeps "— title clause required"', () => {
    for (const id of PACK_IDS) {
      expect(`${id}: ${packStrings(id).join('\n').includes('title clause paragraph')}`).toBe(
        `${id}: false`,
      );
    }
    expect(
      hasString(
        'joint_development_agreement',
        "gpa_to_developer must be specified; if 'yes_general_gpa_with_title_flag' — title clause required",
      ),
    ).toBe(true);
  });
});

describe('T-566 ruling S11b: CrPC and IEA warnings, both branches', () => {
  const crpc = (x: string): string =>
    `This draft cites Section ${x} CrPC. Confirm the date: BNSS applies to proceedings from 1 July 2024; CrPC continues for matters pending before that date.`;
  const iea = (x: string): string =>
    `This draft cites Section ${x} of the Evidence Act. Confirm the date: BSA applies from 1 July 2024; check whether the Evidence Act still governs this matter.`;

  it('CrPC with no mapping (the stub has none): the signed line, x filled', async () => {
    const [w, ...rest] = await detectOldLawReferences('The bail plea is under Section 438 CrPC.');
    expect(rest).toEqual([]);
    expect(w.type).toBe('old_law_reference');
    expect(w.message).toBe(crpc('438'));
    expect(w.details).toMatchObject({ section: '438', code: 'CrPC' });
  });

  it('IEA with no mapping: the signed line, x filled', async () => {
    const [w, ...rest] = await detectOldLawReferences(
      'Proof under Section 65B of the Indian Evidence Act.',
    );
    expect(rest).toEqual([]);
    expect(w.message).toBe(iea('65B'));
    expect(w.details).toMatchObject({ section: '65B', code: 'IEA' });
  });

  it('mapped branch: CrPC and IEA give the signed line and keep the suggestion in details', async () => {
    const sections = jest.requireMock('../services/sections.service') as {
      lookupOldToNew: jest.Mock;
    };
    const map = (
      old_code: string,
      new_code: string,
      new_code_full: string,
      new_section: string,
    ) => ({
      old_code,
      old_code_full: old_code,
      old_section: '0',
      old_title: 't',
      new_code,
      new_code_full,
      new_section,
      new_title: 't',
      mapping_type: 'direct',
    });
    sections.lookupOldToNew
      .mockResolvedValueOnce(map('CrPC', 'BNSS', 'Bharatiya Nagarik Suraksha Sanhita', '482'))
      .mockResolvedValueOnce(map('IEA', 'BSA', 'Bharatiya Sakshya Adhiniyam', '63'));
    const [a] = await detectOldLawReferences('Section 438 CrPC is invoked.');
    expect(a.message).toBe(crpc('438'));
    expect(a.details).toMatchObject({
      section: '438',
      code: 'CrPC',
      suggestedReplacement: 'Section 482 BNSS',
    });
    const [b] = await detectOldLawReferences('Section 65B of the Indian Evidence Act is invoked.');
    expect(b.message).toBe(iea('65B'));
    expect(b.details).toMatchObject({
      section: '65B',
      code: 'IEA',
      suggestedReplacement: 'Section 63 BSA',
    });
  });

  it('no old-law warning says "Use Section", "instead" or "Please verify"', async () => {
    const warnings = await detectOldLawReferences(
      'Section 302 IPC, Section 506 IPC, Section 438 CrPC, Section 154 CrPC, Section 65B of the Indian Evidence Act.',
    );
    expect(warnings.length).toBeGreaterThanOrEqual(5);
    for (const w of warnings) {
      expect(w.message).not.toContain('Use Section');
      expect(w.message).not.toContain('Please verify');
      expect(w.message).not.toMatch(/instead/i);
      expect(w.message).not.toContain('Old law reference detected');
    }
  });
});

describe('T-566 ruling S11a: the validator warning on an IPC citation', () => {
  it('mapped branch (IPC 302 has a BNS target): the neutral signed line, x filled', async () => {
    const [w, ...rest] = await detectOldLawReferences(
      'The accused is charged under Section 302 IPC.',
    );
    expect(rest).toEqual([]);
    expect(w.type).toBe('old_law_reference');
    expect(w.message).toBe(ipcWarning('302'));
    expect(w.message).not.toMatch(/instead/i);
    expect(w.message).not.toContain('Use Section');
    // detection and details are unchanged, including the suggestion carried in details.
    expect(w.details).toMatchObject({
      section: '302',
      code: 'IPC',
      suggestedReplacement: 'Section 103(1) BNS',
    });
  });

  it('unmapped branch (no BNS target found): the same signed line', async () => {
    const [w, ...rest] = await detectOldLawReferences('Section 506 IPC is also invoked.');
    expect(rest).toEqual([]);
    expect(w.message).toBe(ipcWarning('506'));
    expect(w.message).not.toContain('Please verify');
    expect(w.details).toMatchObject({ section: '506', code: 'IPC' });
  });

  it('fires on any IPC citation whatever the date, once per section', async () => {
    const text =
      'Offence on 5 March 2023 under Section 420 IPC; Section 420 IPC again; Section 302 IPC.';
    const warnings = await detectOldLawReferences(text);
    expect(warnings.map((w) => w.message).sort()).toEqual(
      [ipcWarning('302'), ipcWarning('420')].sort(),
    );
  });

  it('no IPC warning ever says "Use Section ... BNS instead"', async () => {
    const warnings = await detectOldLawReferences(
      'Sections 302 IPC, 420 IPC, 498A IPC, 506 IPC and 34 IPC.',
    );
    expect(warnings.length).toBeGreaterThan(0);
    for (const w of warnings) {
      expect(w.message).toMatch(/^This draft cites Section \S+ IPC\. Confirm the offence date: /);
      expect(w.message).not.toMatch(/Use Section .* BNS .*instead/);
    }
  });

  it('a BNS citation raises nothing', async () => {
    expect(await detectOldLawReferences('Section 103 BNS applies.')).toEqual([]);
  });
});

// ── 5. Item 65: disclaimers out of the pleading ─────────────────────────────

describe('T-566 item 65 (rulings 65a, 65b, 65c, 65g): no Lawie disclaimer inside any pack', () => {
  it('scans the real pack directory (92 files)', () => {
    expect(PACK_FILES).toHaveLength(92);
    expect(T566_PACK_FILES).toHaveLength(92);
    expect(T566_PACK_FILES).toContain('criminal_revision.json');
  });

  it.each(T566_PACK_FILES)(
    '%s: no disclaimer instruction, clause, string or checklist line',
    (file) => {
      const id = file.replace(/\.json$/, '');
      const p = withoutTopLevelDisclaimers(id);
      const all = strings(p).join('\n');
      expect(all).not.toMatch(/Append Lawie disclaimer/i);
      expect(all).not.toMatch(/Lawie is a drafting assistant/i);
      expect(all).not.toMatch(/Lawie is not legal counsel/i);
      expect(all).not.toMatch(/Disclaimer: Lawie/i);
      expect(all).not.toMatch(/Lawie disclaimer/i);
      expect(all).not.toMatch(/Lawie Drafting Assistant Disclaimer/i);
      expect(all).not.toMatch(/Advocate Responsibility Disclaimer/i);
      const badClauses = objects(p).filter(
        (o) => o.id === 'disclaimer' || o.id === 'lawie_disclaimer',
      );
      expect(badClauses).toEqual([]);
    },
  );

  it('the mandatory clauses of every pack are still valid arrays with a required flag intact', () => {
    // Removing a clause object must not leave a comma or a hole behind.
    for (const f of T566_PACK_FILES) {
      const p = readPack(f.replace(/\.json$/, ''));
      const clauses = (p.mandatoryClauses ?? p.mandatory_clauses ?? []) as Array<
        Record<string, unknown>
      >;
      expect(Array.isArray(clauses)).toBe(true);
      for (const c of clauses) expect(c).toBeTruthy();
    }
  });

  it('65g: mandamus lost only the disclaimer rule; its other validation rule stays', () => {
    const rules = (readPack('mandamus').validation_rules ?? []) as Array<Record<string, unknown>>;
    expect(JSON.stringify(rules)).not.toMatch(/Disclaimer/);
    expect(rules).toContainEqual({
      rule: 'Respondent MUST be public authority/officer',
      severity: 'blocker',
    });
  });

  it('65a: gift_deed structure no longer ends with "(14) Lawie disclaimer."', () => {
    const all = packStrings('gift_deed').join('\n');
    expect(all).not.toContain('(14)');
    expect(all).toContain('(13) Witness attestation (TWO witnesses — mandatory per S.123).');
  });

  it('65b: the 12 deed packs lost "Lawie disclaimer included" from the filing checklist', () => {
    for (const id of [
      'gift_deed',
      'gpa',
      'joint_development_agreement',
      'lease_deed',
      'license_agreement',
      'mortgage_deed',
      'mou',
      'partition_deed',
      'release_deed',
      'sale_deed',
      'spa',
      'will',
    ]) {
      const checklist = (readPack(id).filing_checklist ?? []) as string[];
      expect(checklist.length).toBeGreaterThan(0);
      expect(checklist.join('\n')).not.toMatch(/disclaimer/i);
    }
  });

  it('65d: the top-level disclaimer / advocate_disclaimer keys are kept in the files', () => {
    const withKey = PACK_IDS.filter(
      (id) => 'disclaimer' in readPack(id) || 'advocate_disclaimer' in readPack(id),
    );
    expect(withKey.length).toBeGreaterThanOrEqual(40);
    expect(withKey).toContain('fir_quashing');
    expect(withKey).toContain('certiorari');
  });

  describe('65d: the loader never sends the top-level disclaimer keys to the model', () => {
    const KEY_PACKS = PACK_IDS.filter(
      (id) => 'disclaimer' in readPack(id) || 'advocate_disclaimer' in readPack(id),
    );

    it.each(KEY_PACKS)('%s: not in the loaded rule pack, listed as an unread key', (id) => {
      const raw = readPack(id);
      const keys = ['disclaimer', 'advocate_disclaimer'].filter((k) => k in raw);
      const loaded = readRulePack(id, raw);
      const loadedJson = JSON.stringify({ ...loaded, unreadKeys: [] });
      for (const k of keys) {
        expect(loaded.unreadKeys).toContain(k);
        expect(loadedJson).not.toContain(String(raw[k]));
      }
      expect(loadedJson).not.toMatch(/Lawie is a drafting assistant/i);
    });

    it.each(KEY_PACKS)('%s: not in the assembled prompt or the form prompt', async (id) => {
      const raw = readPack(id);
      const p = await assemblePrompt(promptInput(id));
      const assembled = `${p.systemPrompt}\n${p.userPrompt}`;
      expect(assembled).not.toMatch(/Lawie is a drafting assistant/i);
      expect(assembled).not.toMatch(/Lawie is not legal counsel/i);
      for (const k of ['disclaimer', 'advocate_disclaimer']) {
        if (k in raw) expect(assembled).not.toContain(String(raw[k]));
      }
      const config = loadTemplateConfig(id);
      if (config) {
        const form = buildAISystemPrompt(config);
        expect(form).not.toMatch(/Lawie is a drafting assistant/i);
        for (const k of ['disclaimer', 'advocate_disclaimer']) {
          if (k in raw) expect(form).not.toContain(String(raw[k]));
        }
      }
    });
  });
});

// ── 6. Filters ──────────────────────────────────────────────────────────────

describe('T-566 item 65 / ruling 65e: the strip filters catch both phrases', () => {
  const A =
    'Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.';
  const B = 'Lawie is not legal counsel.';

  describe('sanitiseAIBody (by line)', () => {
    it.each([A, B])(
      'drops the line that carries "%s" and keeps the rest of its paragraph',
      (phrase) => {
        const body = `1. The facts are as follows.\n${phrase}\n2. The prayer follows.\n\n3. Another paragraph.`;
        const out = sanitiseAIBody(body);
        expect(out).toBe(
          '1. The facts are as follows.\n2. The prayer follows.\n\n3. Another paragraph.',
        );
      },
    );

    it('is case-insensitive and catches the phrase in the middle of a line', () => {
      const out = sanitiseAIBody(
        'Para one.\nNote: LAWIE IS A DRAFTING ASSISTANT and more.\nPara two.',
      );
      expect(out).toBe('Para one.\nPara two.');
      expect(
        sanitiseAIBody('Para one.\nSee that lawie is not legal counsel here.\nPara two.'),
      ).toBe('Para one.\nPara two.');
    });

    it('a paragraph that is only the disclaimer line is dropped whole', () => {
      expect(sanitiseAIBody(`1. Facts.\n\n${A}\n\n2. Prayer.`)).toBe('1. Facts.\n\n2. Prayer.');
      expect(sanitiseAIBody(`1. Facts.\n\n${B}\n\n2. Prayer.`)).toBe('1. Facts.\n\n2. Prayer.');
    });

    it('a "DISCLAIMER:" paragraph is still dropped whole by the older rule', () => {
      expect(sanitiseAIBody(`1. Facts.\n\nDISCLAIMER: ${A}\nExtra line.\n\n2. Prayer.`)).toBe(
        '1. Facts.\n\n2. Prayer.',
      );
    });

    it('the older SCRUM-62 paragraph rules still apply', () => {
      expect(
        sanitiseAIBody('1. Facts.\n\nLawie does not provide legal advice.\n\n2. Prayer.'),
      ).toBe('1. Facts.\n\n2. Prayer.');
      expect(sanitiseAIBody('IN THE HIGH COURT OF PATNA\n\n1. Facts.')).toBe('1. Facts.');
    });

    it('text with neither phrase is untouched', () => {
      const t =
        '1. The petitioner is a drafting assistant to the firm.\n2. He is not legal counsel.';
      // Neither signed phrase is present ("Lawie is ...").
      expect(sanitiseAIBody(t)).toBe(t);
    });
  });

  describe('withoutDisclaimers (brief drafter, by paragraph)', () => {
    it.each([A, B])('drops a paragraph carrying "%s"', (phrase) => {
      expect(withoutDisclaimers(`1. Facts.\n\n${phrase}\n\n2. Prayer.`)).toBe(
        '1. Facts.\n\n2. Prayer.',
      );
    });

    it('is case-insensitive', () => {
      expect(withoutDisclaimers('1. Facts.\n\nlawie IS NOT LEGAL COUNSEL.\n\n2. Prayer.')).toBe(
        '1. Facts.\n\n2. Prayer.',
      );
    });

    it('keeps the existing DISCLAIMER / NOTE / AI-assisted rules', () => {
      expect(
        withoutDisclaimers('1. Facts.\n\nNOTE: check this.\n\nAI-assisted draft.\n\n2. Prayer.'),
      ).toBe('1. Facts.\n\n2. Prayer.');
    });
  });

  describe('withoutDisclaimerText / isDisclaimer (brief drafter, by line)', () => {
    it.each([A, B])('drops an unnumbered line carrying "%s" and keeps its neighbours', (phrase) => {
      const out = withoutDisclaimerText(`Place: Patna\n${phrase}\nDate: 4 April 2026`);
      expect(out).toBe('Place: Patna\nDate: 4 April 2026');
    });

    it.each([A, B])('drops a paragraph that is only "%s"', (phrase) => {
      expect(withoutDisclaimerText(`1. Facts.\n\n${phrase}\n\n2. Prayer.`)).toBe(
        '1. Facts.\n\n2. Prayer.',
      );
    });

    it('a "DISCLAIMER:" block with no numbered line goes whole', () => {
      expect(withoutDisclaimerText(`1. Facts.\n\nDISCLAIMER: ${A}\nMore.\n\n2. Prayer.`)).toBe(
        '1. Facts.\n\n2. Prayer.',
      );
    });

    it('existing behaviour: a numbered paragraph is kept whatever it says', () => {
      const numbered = `3. ${B}`;
      expect(withoutDisclaimerText(`1. Facts.\n\n${numbered}`)).toBe(`1. Facts.\n\n${numbered}`);
    });
  });
});

// ── 7. Item 64 / S4-S7 ──────────────────────────────────────────────────────

describe('T-566 item 64 (rulings 64a-64d, S4-S7): no judgment names in discharge, habeas, slp', () => {
  const PACKS = ['discharge_application', 'habeas_corpus', 'slp', 'criminal_revision'];

  it.each(PACKS)('%s: sentence S is the last promptInstructions element, exactly once', (id) => {
    const list = instructions(id);
    expect(list[list.length - 1]).toBe(SENTENCE_S);
    expect(list.filter((x) => x === SENTENCE_S)).toHaveLength(1);
    expect(
      strings(readPack(id)).filter((x) => x.includes('Do not name any judgment')),
    ).toHaveLength(1);
  });

  it.each(PACKS)(
    '%s: no "Cite <case> v." instruction and no " v. " in promptInstructions',
    (id) => {
      for (const line of instructions(id)) {
        expect(line).not.toMatch(/\bCite [A-Z][^.;]*? v\.? /);
        expect(line).not.toMatch(/ v\. /);
        expect(line).not.toMatch(/\b(?:AIR|SCC|SCR)\b/);
      }
    },
  );

  it.each(PACKS)(
    '%s: none of the removed judgment names is left in the model-visible text',
    (id) => {
      const p = readPack(id);
      delete p.key_citations; // key_citations is untouched (not sent as instruction text)
      delete p.disclaimer;
      const all = strings(p).join('\n');
      for (const name of [
        'Prafulla Kumar Samal',
        'Ramesh Singh',
        'Niranjan Singh',
        'Sajjan Kumar',
        'Asim Shariff',
        'Soma Chakravarty',
        'Geeta Mehrotra',
        'Preeti Gupta',
        'Pepsi Foods',
        'Maksud Saiyed',
        'Sunil Bharti Mittal',
        'S.M.S. Pharmaceuticals',
        'Indian Oil Corp',
        'Debendra Nath Padhi',
        'Debendra Padhi',
        'Nitya Dharmananda',
        'Sunil Batra',
        'Sheela Barse',
        'Ranjit Kumar Chakraborty',
        'A.K. Roy',
        'Rekha v.',
        'Mohd Ikram Hussain',
        'Gohar Begum',
        'Lata Singh',
        'Tejaswini Gaud',
        'Bhim Singh',
        'Hadibandhu Das',
        'Lakshman Khatik',
        'Pritam Singh',
        'Suriyakala',
        'Mathai',
        'Kunhayammed',
        'Chunilal',
        'Hari Singh',
        'Dalbir Kaur',
        'Arunachalam',
      ]) {
        expect(`${id}: ${all.includes(name)}`).toBe(`${id}: false`);
      }
    },
  );

  it('key_citations is untouched in all three packs (still present and non-empty)', () => {
    for (const id of PACKS) {
      const kc = readPack(id).key_citations as unknown[];
      expect(Array.isArray(kc)).toBe(true);
      expect(kc.length).toBeGreaterThan(0);
    }
  });

  it('R1: propositions are kept word for word, names and connectors removed (discharge)', () => {
    const d = instructions('discharge_application');
    expect(d).toContain(
      'at framing stage, court not to embark on prolonged scrutiny; grave suspicion is sufficient to frame charge.',
    );
    expect(d).toContain(
      'at discharge stage, court has limited power to examine if a strong suspicion is made out.',
    );
    expect(d).toContain(
      'material against accused must be examined; broad probabilities to be considered.',
    );
    expect(d).toContain(
      'Para 8: Vicarious liability issues — for matrimonial cases (BNS 85, 86) where in-laws are charged without specific role: caution against omnibus implication of relatives.',
    );
    expect(d).toContain(
      'Para 9: Corporate cases — for accused officers without specific role: vicarious liability under criminal law requires specific statutory provision.',
    );
    expect(d).toContain(
      'Para 11: Where civil dispute given criminal colour — caution against criminalising contractual disputes.',
    );
    expect(d).toContain(
      'Burden — at discharge stage, defence cannot adduce evidence; only chargesheet material is examined. Accused may produce documents only if material in chargesheet itself supports defence.',
    );
    expect(d).toContain(
      'IMPORTANT — at framing/discharge stage, court cannot consider documents produced by defence; only chargesheet material relied. EXCEPT: documents of unimpeachable character (court orders, statutory documents).',
    );
  });

  it('R2 / S4 / S5: cite-only lines and bare topic labels are deleted (discharge, slp)', () => {
    const d = instructions('discharge_application').join('\n');
    expect(d).not.toContain('meaning of');
    expect(d).not.toContain('recent reiteration');
    expect(d).not.toContain('relaxed Debendra');
    expect(d).not.toContain('where prosecution itself relied on certain documents');
    const s = instructions('slp').join('\n');
    expect(s).not.toContain('substantial question of law definition');
    expect(s).not.toContain('criminal SLP grounds');
    expect(s).toContain(
      'Article 136 not regular appeal; merger doctrine — once SC dismisses by speaking order, the HC order merges.',
    );
  });

  it('S6: habeas item (f) ends after "state action suspected."', () => {
    expect(instructions('habeas_corpus')).toContain(
      '   (f) Missing person with state action suspected.',
    );
    expect(packStrings('habeas_corpus').join('\n')).not.toContain('compensation awarded');
  });

  it('64c / S7: change_protocol lines for habeas_corpus and slp', () => {
    const meta = (id: string) => (readPack(id)._meta as Record<string, string>).change_protocol;
    expect(meta('habeas_corpus')).toBe(
      'All edits require CLO sign-off. Do not name judgments in model-visible text (Ajay, T-441).',
    );
    expect(meta('slp')).toBe(
      'Format STRICTLY per Supreme Court Rules 2013. All edits require CLO sign-off. Do not name judgments in model-visible text (Ajay, T-441).',
    );
  });

  it('64d: the T-429 Para 10 NI Act line still has the NI Act Para 10 shape the gate looks for', () => {
    const p10 = instructions('discharge_application').filter((l) => /^Para 10:/.test(l));
    expect(p10).toEqual([
      "Para 10: NI Act S.138 prosecutions of company directors — director must be 'in charge of and responsible to' company at time of offence.",
    ]);
  });
});

// ── 8. Pinned signed strings (items 56-63a, 67-70, 72, S3, S8, S10) ─────────

describe('T-566 pinned signed pack strings (Ajay, 22 Oct 2026)', () => {
  it('56: the FIR section labels in fir_quashing and quashing_528_bnss', () => {
    for (const id of ['fir_quashing', 'quashing_528_bnss']) {
      const labels = objects(readPack(id))
        .map((o) => o.label)
        .filter(
          (l): l is string => typeof l === 'string' && /Sections invoked|sections invoked/.test(l),
        );
      expect(labels).toEqual([
        'Sections invoked in the FIR (BNS, IPC or Special Act, as registered)',
      ]);
      expect(packStrings(id).join('\n')).not.toMatch(/NOT IPC/);
    }
  });

  it('57: mact_claim para 6', () => {
    expect(
      hasString(
        'mact_claim',
        'Para 6: FIR details — number, date, PS, and the sections as registered in the FIR (BNS for an offence on or after 1 July 2024, IPC for an offence before that date). Annex certified copy.',
      ),
    ).toBe(true);
    expect(anyContains('mact_claim', 'S.281 BNS rash driving')).toBe(false);
  });

  it('58: surrender_application', () => {
    expect(
      hasString(
        'surrender_application',
        'Cite the sections of the underlying offence as registered (BNS for an offence on or after 1 July 2024, IPC for an offence before that date).',
      ),
    ).toBe(true);
    expect(anyContains('surrender_application', 'never IPC')).toBe(false);
  });

  it('59: suspension_of_sentence', () => {
    expect(
      hasString(
        'suspension_of_sentence',
        'Cite the sections of conviction as they stand in the judgment.',
      ),
    ).toBe(true);
    expect(anyContains('suspension_of_sentence', 'never IPC')).toBe(false);
  });

  it('60: memo_of_parties', () => {
    expect(hasString('memo_of_parties', 'Do not cite any statute in the memo of parties.')).toBe(
      true,
    );
    expect(anyContains('memo_of_parties', 'NEVER include any IPC')).toBe(false);
  });

  it('61: vakalatnama', () => {
    expect(
      hasString('vakalatnama', 'Do not cite any section of substantive law in the vakalatnama.'),
    ).toBe(true);
    expect(anyContains('vakalatnama', 'IPC / CrPC / IEA')).toBe(false);
  });

  it('62 / S3: affidavit_identity has the signed line at both places and no penal provision text', () => {
    const line = 'Do not cite any penal provision in the affidavit.';
    expect(hasString('affidavit_identity', line)).toBe(true);
    const ctx = (readPack('affidavit_identity').prompt_context as string) ?? '';
    expect(ctx.endsWith(line)).toBe(true);
    const all = packStrings('affidavit_identity').join('\n');
    expect(all).not.toContain('False statements in affidavits attract');
    expect(all).not.toContain('same as IPC 191/192');
    expect(all).not.toContain('Do NOT include any IPC reference');
    expect(all).not.toContain('use BNS Section 229');
  });

  it('63 / 63a: legal_notice_defamation, with the "criminal route" condition kept', () => {
    expect(
      hasString(
        'legal_notice_defamation',
        'If the criminal route is taken, cite BNS Section 356 for defamation on or after 1 July 2024, and IPC Sections 499 and 500 for defamation before that date.',
      ),
    ).toBe(true);
    expect(anyContains('legal_notice_defamation', 'IPC stands repealed')).toBe(false);
  });

  it('67: criminal_appeal and quashing_528_bnss relevantActs descriptions (whole description, R5)', () => {
    for (const id of ['criminal_appeal', 'quashing_528_bnss']) {
      const descs = objects(readPack(id))
        .map((o) => o.description)
        .filter(
          (d): d is string => typeof d === 'string' && d.startsWith('Substantive offence sections'),
        );
      expect(descs).toEqual([
        'Substantive offence sections: BNS for an offence on or after 1 July 2024, IPC for an offence before that date.',
      ]);
    }
    expect(anyContains('quashing_528_bnss', 'Common: S.85')).toBe(false);
  });

  it('68: list_of_dates addendum (7) and sanhita_citations; synopsis sanhita_citations', () => {
    const addendum = objects(readPack('list_of_dates'))
      .map((o) => o.system_prompt_addendum)
      .find((v): v is string => typeof v === 'string') as string;
    expect(addendum).toContain(
      '(7) For each section cited, use the code in force on the date of the offence: BNS for an offence on or after 1 July 2024, IPC for an offence before that date. For procedure, use BNSS, except in a matter pending before 1 July 2024, where CrPC continues to apply. (8) ',
    );
    expect(addendum).not.toContain('events post 01.07.2024 should cite BNS');
    for (const id of ['list_of_dates', 'synopsis']) {
      expect(
        objects(readPack(id)).some(
          (o) =>
            o.sanhita_citations ===
            'INFO — check that each section cited matches the code in force on the date of the offence (BNS on or after 1 July 2024, IPC before).',
        ),
      ).toBe(true);
    }
  });

  it('69: maintenance_bnss_144 change_protocol and instruction line', () => {
    const p = readPack('maintenance_bnss_144');
    expect((p._meta as Record<string, string>).change_protocol).toBe(
      'All edits require CLO sign-off. Use Section 144 BNSS for a petition filed on or after 1 July 2024; refer to Section 125 CrPC only for an earlier order or a proceeding pending before that date.',
    );
    expect(
      hasString(
        'maintenance_bnss_144',
        'Use Section 144 BNSS for a petition filed on or after 1 July 2024. Refer to Section 125 CrPC only for an earlier order, or for a proceeding pending before that date.',
      ),
    ).toBe(true);
    expect(anyContains('maintenance_bnss_144', 'never refer to Section 125 CrPC')).toBe(false);
    expect(anyContains('maintenance_bnss_144', 'never use 125 CrPC')).toBe(false);
  });

  it('70: discharge Para 6, Para 13 and the S10 checklist line', () => {
    const d = instructions('discharge_application');
    expect(d).toContain(
      'Para 6: Contradictions in chargesheet material — between FIR and S.180/181 statements, between different witnesses, between statements and documents, between documents inter se. Refer to a chargesheet page only where the advocate gives it; otherwise write [To be confirmed: page].',
    );
    expect(d).toContain(
      'Para 13: Discharge under S.250 distinct from acquittal — discharge does NOT bar fresh trial if new evidence emerges (the bar on a second trial does not apply).',
    );
    expect(packStrings('discharge_application').join('\n')).not.toContain('S.300 CrPC');
    expect(packStrings('discharge_application').join('\n')).not.toContain('Pin-point page numbers');
    // S10
    const checklist = readPack('discharge_application').filing_checklist as string[];
    expect(checklist).toContain('Court orders / judgments relied on');
    expect(checklist.join('\n')).not.toContain('Prafulla');
  });

  it('72 / S8 / S10: gpa, spa and joint_development_agreement carry no case name or Suraj Lamp label', () => {
    expect(
      hasString(
        'gpa',
        'WARNING — GPA does NOT transfer title to immovable property. Any sale must be by registered Sale Deed.',
      ),
    ).toBe(true);
    // S8a: no "paragraph".
    expect(
      hasString(
        'gpa',
        "if includes_power_to_sell == 'yes_flag_title_warning' — title clause must be inserted",
      ),
    ).toBe(true);
    expect((readPack('gpa')._meta as Record<string, string>).change_protocol).toBe(
      'All edits require CLO sign-off. The title clause must appear prominently when GPA includes power to sell. Authentication / notarisation / registration requirements differ for property powers vs general powers.',
    );
    expect(
      hasString(
        'spa',
        'NOTARISATION standard; REGISTRATION required where SPA authorises sale of immovable property per state directives',
      ),
    ).toBe(true);
    expect(
      hasString(
        'spa',
        'Where SPA includes power to sell — title clause (sale only by registered sale deed) prominently inserted',
      ),
    ).toBe(true);
    expect(
      hasString(
        'spa',
        "if specific_transaction_type contains 'sale' — title clause must be inserted",
      ),
    ).toBe(true);
    expect(
      hasString(
        'joint_development_agreement',
        "gpa_to_developer must be specified; if 'yes_general_gpa_with_title_flag' — title clause required",
      ),
    ).toBe(true);
    for (const id of ['gpa', 'spa', 'joint_development_agreement']) {
      const p = readPack(id);
      delete p._meta; // ruling S12: _meta.description is not model-visible and was left alone
      const all = strings(p).join('\n');
      expect(all).not.toMatch(/Suraj Lamp/i);
      expect(all).not.toContain('(2012) 1 SCC 656');
    }
  });
});

// ── 9. No IPC-forbidding phrases left ───────────────────────────────────────

describe('T-566 items 54-63: no pack forbids IPC any more', () => {
  const FORBIDDING =
    /\bNOT IPC\b|\bnever IPC\b|\(never IPC\)|NEVER include any IPC|NEVER reference old IPC|not IPC 499|never use 125 CrPC|never refer to Section 125|Do NOT include any IPC|use BNS numbers, not IPC|\(use BNS, NOT IPC\)/i;

  it.each(PACK_FILES)('%s: no phrase that forbids IPC', (file) => {
    const text = strings(withoutTopLevelDisclaimers(file.replace(/\.json$/, ''))).join('\n');
    expect(`${file}: ${FORBIDDING.exec(text)?.[0] ?? ''}`).toBe(`${file}: `);
  });
});

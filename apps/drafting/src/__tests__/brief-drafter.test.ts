/**
 * T-106 — from a confirmed brief to the Drafter and back (ADR-021 sections
 * 3.5 and 3.6; rules signed by Ajay in T-127, sections 4 and 7.3).
 *
 * No model call and no database: what the Drafter is given, the clause
 * report, which clauses are missing, the repair guard, the checks against the
 * brief, and the label.
 */
import {
  actLines,
  buildDrafterUserPrompt,
  buildGuidedDrafterUserPrompt,
  buildRepairUserPrompt,
  checkAgainstBrief,
  clampTarget,
  clauseLines,
  CLAUSES_MARKER,
  coveredBySystemPart,
  drafterBrief,
  findMissingClauses,
  formDataFromBrief,
  guidedDrafterBrief,
  hasFixedWording,
  keepsEveryParagraph,
  labelReason,
  needsStartingDraftLabel,
  paragraphNumbers,
  sectionsGiven,
  splitDrafterOutput,
  systemParts,
  TrailerFilter,
  withoutDisclaimers,
} from '../services/brief-drafter';
import {
  DRAFTER_GUIDED_SYSTEM_PROMPT,
  DRAFTER_PACK_SYSTEM_PROMPT,
  DRAFTER_REPAIR_SYSTEM_PROMPT,
} from '../services/drafter.prompts';
import {
  buildBrief,
  buildChecklist,
  fixedChecklist,
  FIXED_KEYS,
  GivenValue,
  guidedDateItem,
} from '../services/intake-brief';
import { contentToHtml } from '../services/pdf-export.service';
import { loadRulePack, RulePack, RulePackClause } from '../services/rule-pack.service';
import { loadTemplateConfig, TemplateConfig } from '../services/template-engine.service';

function pack(id: string): RulePack {
  const p = loadRulePack(id);
  if (!p) throw new Error(`no pack ${id}`);
  return p;
}

function config(id: string): TemplateConfig {
  const c = loadTemplateConfig(id);
  if (!c) throw new Error(`no template ${id}`);
  return c;
}

const BAIL = pack('bail_regular');
const BAIL_CONFIG = config('bail_regular');
const PARTS = systemParts(BAIL_CONFIG);
const court = { state: 'bihar', court_type: 'sessions', court: 'district_sessions_patna' };

function briefWith(values: GivenValue[], p = BAIL) {
  return buildBrief({
    kind: { id: p.id, name: p.name, court_document: true },
    checklist: buildChecklist(p),
    values,
    court,
  });
}

const user = (key: string, value: string | string[]): GivenValue => ({
  key,
  value,
  source: 'user',
});

const VALUES: GivenValue[] = [
  user('applicant_name', 'Ram Kumar'),
  user('father_name', 'Shri Hari Kumar'),
  user('fir_number', '124/2026'),
  user('fir_date', '2026-03-10'),
  user('sections_charged', ['103']),
  user('currently_in_custody', 'Yes — Judicial custody'),
  user('facts_narrative', 'He was arrested on 15/03/2026 and falsely implicated.'),
];

/** A clause list a test controls, so a change to a real pack does not break it. */
function clause(id: string, title: string, extra: Partial<RulePackClause> = {}): RulePackClause {
  return {
    id,
    title,
    detail: null,
    fixedText: null,
    required: true,
    appliesWhen: null,
    statutoryBasis: null,
    parts: [],
    extra: {},
    ...extra,
  };
}

function packWith(clauses: RulePackClause[]): RulePack {
  return { ...BAIL, mandatoryClauses: clauses };
}

const BODY = [
  '1. That the applicant is a law-abiding citizen and has been falsely implicated in the present case.',
  '2. That the FIR No. 124/2026 was registered on 10.03.2026 under Section 103 of BNS.',
  '3. That the applicant undertakes to abide by every condition this Court may impose.',
].join('\n\n');

describe('the Drafter prompts are Ajay’s text', () => {
  it('carry the rules that matter and the marker the server cuts on', () => {
    expect(DRAFTER_PACK_SYSTEM_PROMPT).toContain(
      'Use no fact, name, date, amount, address or event that is not in the BRIEF',
    );
    expect(DRAFTER_PACK_SYSTEM_PROMPT).toContain(
      'Never state a section number from your own knowledge',
    );
    expect(DRAFTER_PACK_SYSTEM_PROMPT).toContain(CLAUSES_MARKER);
    expect(DRAFTER_REPAIR_SYSTEM_PROMPT).toContain('Change nothing else');
  });
});

describe('the parts the system adds', () => {
  it('are the template sections of the document, in order', () => {
    expect(PARTS.map((p) => p.sectionId)).toEqual([
      'cause_title',
      'application_heading',
      'addressing_clause',
      'prayer',
      'verification',
      'advocate_block',
    ]);
    expect(PARTS[0].label).toBe('cause title');
  });

  it('exist for every rule pack that has a template', () => {
    expect(systemParts(config('nda')).every((p) => p.label.length > 0)).toBe(true);
  });
});

describe('form values for the system parts', () => {
  const data = formDataFromBrief(briefWith(VALUES), BAIL_CONFIG, 'en');

  it('turn a choice back into the id the template compares', () => {
    expect(data.currently_in_custody).toBe('yes_judicial');
  });

  it('carry the court the user chose, and the language', () => {
    expect(data).toMatchObject({
      state: 'bihar',
      court_type: 'sessions',
      court_name: 'district_sessions_patna',
      language: 'en',
    });
  });

  it('put the visible blank where a fact is not given, never a guess', () => {
    expect(data.police_station).toBe('[To be confirmed: police station]');
    expect(data.applicant_age).toMatch(/^\[To be confirmed: /);
    expect(data.applicant_name).toBe('Ram Kumar');
    expect(data.sections_charged).toEqual(['103']);
  });
});

describe('what the Drafter is given', () => {
  const brief = drafterBrief(briefWith(VALUES), 'SESSIONS JUDGE, PATNA');

  it('sorts the brief into its parts, with each date and what it is the date of', () => {
    expect(brief.document).toBe(BAIL.name);
    expect(brief.court).toBe('SESSIONS JUDGE, PATNA');
    expect(brief.parties.map((p) => p.key)).toEqual(['applicant_name', 'father_name']);
    expect(brief.dates).toEqual([{ key: 'fir_date', date_of: 'Date of FIR', date: '10.03.2026' }]);
    expect(brief.numbers.map((n) => n.key)).toEqual(['fir_number', 'sections_charged']);
    expect(brief.facts.map((f) => f.key)).toEqual(['currently_in_custody', 'facts_narrative']);
  });

  it('lists what is unknown with the blank to use, and never a value for it', () => {
    const unknown = new Map(brief.unknown.map((u) => [u.what, u.blank]));
    expect(unknown.get('Police Station')).toBe('[To be confirmed: police station]');
    expect(JSON.stringify(brief.parties)).not.toContain('To be confirmed');
  });

  it('says the court is to be confirmed when it is not known, and has none on a non-court document', () => {
    expect(drafterBrief(briefWith(VALUES), null).court).toBe('[To be confirmed: court]');
    const nda = pack('nda');
    const ndaBrief = buildBrief({
      kind: { id: 'nda', name: nda.name, court_document: false },
      checklist: buildChecklist(nda),
      values: [],
    });
    expect(drafterBrief(ndaBrief, null).court).toBeNull();
  });

  it('uses the converted text where old-law sections were converted', () => {
    const converted = drafterBrief(briefWith(VALUES), null, {
      facts_narrative: 'He was arrested on 15/03/2026 under Section 103 BNS.',
    });
    expect(converted.facts.find((f) => f.key === 'facts_narrative')?.value).toContain('103 BNS');
  });

  it('gives one line per mandatory clause, and the acts with their sections', () => {
    const lines = clauseLines(BAIL);
    expect(lines).toHaveLength(BAIL.mandatoryClauses.filter((c) => c.required).length);
    for (const line of lines) expect(line.split(' | ')).toHaveLength(4);
    expect(lines.every((l) => !l.includes('\n'))).toBe(true);
    expect(actLines(BAIL)[0]).toMatch(/^Bharatiya Nagarik Suraksha Sanhita \(BNSS\), 2023: 480 \(/);
  });

  it('builds the two user prompts with every block the system prompt names', () => {
    const input = {
      pack: BAIL,
      brief,
      systemParts: PARTS,
      courtRules: ['Use A4 paper.'],
      target: 12,
      language: 'en',
    };
    const prompt = buildDrafterUserPrompt(input);
    for (const name of [
      'DOCUMENT:',
      'BRIEF:',
      'CLAUSES',
      'INSTRUCTIONS:',
      'ACTS:',
      'COURT RULE:',
      'SYSTEM PARTS:',
      'TARGET: 12',
      'LANGUAGE: en',
    ]) {
      expect(prompt).toContain(name);
    }
    expect(prompt).toContain('- cause title');
    expect(prompt).toContain('- Use A4 paper.');
    const repair = buildRepairUserPrompt(input, BODY, ['grounds', 'undertaking']);
    expect(repair).toContain('MISSING: grounds, undertaking');
    expect(repair).toContain('<document>\n1. That the applicant');
    expect(repair).not.toContain('TARGET:');
  });

  it('says "none" for a block with nothing in it', () => {
    const prompt = buildDrafterUserPrompt({
      pack: BAIL,
      brief,
      systemParts: [],
      courtRules: [],
      target: 10,
      language: 'hi',
    });
    expect(prompt).toContain('COURT RULE:\nnone');
    expect(prompt).toContain('SYSTEM PARTS:\nnone');
  });

  it.each([
    [undefined, 15],
    [3, 5],
    [12.4, 12],
    [90, 40],
    [Number.NaN, 15],
  ])('keeps the target between 5 and 40: %p -> %p', (given, expected) => {
    expect(clampTarget(given)).toBe(expected);
  });
});

describe('the clause report never reaches the user', () => {
  function stream(chunks: string[]): string {
    const filter = new TrailerFilter();
    return chunks.map((c) => filter.push(c)).join('') + filter.end();
  }
  const full = `${BODY}\n${CLAUSES_MARKER}\ngrounds: 1\nundertaking: MISSING`;

  it('whatever way the text is cut into chunks', () => {
    for (const size of [1, 2, 3, 5, 7, 13, 50, 1000]) {
      const chunks: string[] = [];
      for (let i = 0; i < full.length; i += size) chunks.push(full.slice(i, i + size));
      const out = stream(chunks);
      expect(out).toBe(`${BODY}\n`);
      expect(out).not.toContain('=');
    }
  });

  it('passes everything through when there is no report', () => {
    expect(stream(['1. One.', ' 2. Two === three', '.'])).toBe('1. One. 2. Two === three.');
  });

  it('releases text that only looked like the start of the marker', () => {
    expect(stream(['a ===CLAU', 'SE is not the marker'])).toBe('a ===CLAUSE is not the marker');
  });

  it('gives nothing after the marker, even when more arrives', () => {
    const filter = new TrailerFilter();
    expect(filter.push(`body\n${CLAUSES_MARKER}\n`)).toBe('body\n');
    expect(filter.push('grounds: 1\n')).toBe('');
    expect(filter.end()).toBe('');
  });
});

describe('reading the clause report', () => {
  it('cuts the document at the marker and reads one status per clause', () => {
    const out = splitDrafterOutput(
      `${BODY}\n\n${CLAUSES_MARKER}\ngrounds: 1, 2\nfir_details: 2\nprayer: SYSTEM\nundertaking: MISSING\n- parity: paras 4-6\nnot a line\ngrounds: 9`,
    );
    expect(out.body).toBe(BODY);
    expect(out.report?.get('grounds')).toEqual({ kind: 'paragraphs', numbers: [1, 2] });
    expect(out.report?.get('fir_details')).toEqual({ kind: 'paragraphs', numbers: [2] });
    expect(out.report?.get('prayer')).toEqual({ kind: 'system' });
    expect(out.report?.get('undertaking')).toEqual({ kind: 'missing' });
    expect(out.report?.get('parity')).toEqual({ kind: 'paragraphs', numbers: [4, 5, 6] });
    expect(out.report?.size).toBe(5);
  });

  it('has no report when the Drafter wrote none', () => {
    expect(splitDrafterOutput(BODY)).toEqual({ body: BODY, report: null });
  });

  it('finds the numbered paragraphs of the body', () => {
    expect([...paragraphNumbers(BODY)]).toEqual([1, 2, 3]);
    expect([...paragraphNumbers('Intro\n(a) one\n10. Ten\n  11. Eleven')]).toEqual([10, 11]);
  });
});

describe('which mandatory clauses are missing (T-127, section 4)', () => {
  const clauses = [
    clause('grounds', 'Grounds for Bail'),
    clause('fir_details', 'FIR Details'),
    clause('undertaking', 'Undertaking'),
    clause('prayer', 'Prayer for bail'),
    clause('verification', 'Verification on oath'),
  ];
  const p = packWith(clauses);
  const report = (lines: string) => splitDrafterOutput(`${BODY}\n${CLAUSES_MARKER}\n${lines}`);

  it('none, when every clause has paragraphs that exist or is a part the system added', () => {
    const out = report(
      'grounds: 1\nfir_details: 2\nundertaking: 3\nprayer: SYSTEM\nverification: SYSTEM',
    );
    expect(findMissingClauses(p, out, PARTS)).toEqual([]);
  });

  it.each([
    ['the Drafter says so', 'undertaking: MISSING', 'reported_missing'],
    ['it has no line', '', 'no_report'],
    ['a paragraph on its line is not in the body', 'undertaking: 3, 7', 'paragraph_not_found'],
    ['its line names no paragraph', 'undertaking: see above', 'paragraph_not_found'],
  ])('a clause is missing when %s', (_name, line, reason) => {
    const out = report(`grounds: 1\nfir_details: 2\nprayer: SYSTEM\nverification: SYSTEM\n${line}`);
    expect(findMissingClauses(p, out, PARTS)).toEqual([
      { id: 'undertaking', title: 'Undertaking', reason },
    ]);
  });

  it('"SYSTEM" counts only when the system did add that part', () => {
    const out = report(
      'grounds: SYSTEM\nfir_details: 2\nundertaking: 3\nprayer: SYSTEM\nverification: SYSTEM',
    );
    expect(findMissingClauses(p, out, PARTS)).toEqual([
      { id: 'grounds', title: 'Grounds for Bail', reason: 'not_a_system_part' },
    ]);
    // With no prayer part in the document, a prayer reported as SYSTEM is missing.
    const noPrayer = PARTS.filter((x) => x.sectionId !== 'prayer');
    expect(findMissingClauses(p, out, noPrayer).map((m) => m.id)).toEqual(['grounds', 'prayer']);
  });

  it('with no report at all, only the parts the system added count as present', () => {
    const missing = findMissingClauses(p, splitDrafterOutput(BODY), PARTS);
    expect(missing.map((m) => [m.id, m.reason])).toEqual([
      ['grounds', 'no_report'],
      ['fir_details', 'no_report'],
      ['undertaking', 'no_report'],
    ]);
  });

  it('fixed wording must be in the body, between its blanks', () => {
    const fixed = packWith([
      clause('recital', 'Recital', {
        fixedText:
          'WHEREAS the parties wish to explore {{purpose}} (the "Purpose"); NOW THIS AGREEMENT WITNESSETH:',
      }),
    ]);
    const has = splitDrafterOutput(
      `1. WHEREAS the parties wish to explore a joint venture (the "Purpose"); NOW THIS AGREEMENT WITNESSETH:\n${CLAUSES_MARKER}\nrecital: 1`,
    );
    expect(findMissingClauses(fixed, has, [])).toEqual([]);
    const hasNot = splitDrafterOutput(
      `1. The parties want to work together.\n${CLAUSES_MARKER}\nrecital: 1`,
    );
    expect(findMissingClauses(fixed, hasNot, [])).toEqual([
      { id: 'recital', title: 'Recital', reason: 'wording_not_found' },
    ]);
    expect(hasFixedWording('anything', '{{a}} {{b}}')).toBe(true);
  });

  it('an optional clause, and one that applies only in some cases, are not checked', () => {
    const some = packWith([
      clause('optional_one', 'Optional', { required: false }),
      clause('dpdp', 'Data Protection', { appliesWhen: 'Personal data is disclosed' }),
    ]);
    expect(findMissingClauses(some, splitDrafterOutput(BODY), [])).toEqual([]);
  });

  it('knows which system part a clause belongs to', () => {
    expect(coveredBySystemPart(clause('cause_title', 'Cause Title'), PARTS)).toBe(true);
    expect(coveredBySystemPart(clause('x', 'Verification on oath'), PARTS)).toBe(true);
    expect(coveredBySystemPart(clause('grounds', 'Grounds for Bail'), PARTS)).toBe(false);
    expect(coveredBySystemPart(clause('prayer', 'Prayer'), [])).toBe(false);
  });

  it('works on every real pack: with a full report nothing is missing', () => {
    for (const id of [
      'bail_regular',
      'plaint_recovery',
      'nda',
      'legal_notice_eviction',
      'vakalatnama',
    ]) {
      const real = pack(id);
      const lines = real.mandatoryClauses.map((c) => `${c.id}: 1`).join('\n');
      const out = splitDrafterOutput(
        `1. Everything, in one paragraph.\n${CLAUSES_MARKER}\n${lines}`,
      );
      const missing = findMissingClauses(real, out, []).filter(
        (m) => m.reason !== 'wording_not_found',
      );
      expect([id, missing]).toEqual([id, []]);
    }
  });
});

describe('the repair pass may add and nothing else', () => {
  it('accepts a body that keeps every paragraph, renumbered or not', () => {
    const after = `${BODY}\n\n4. That the applicant has deep roots in society.`;
    expect(keepsEveryParagraph(BODY, after)).toBe(true);
    const renumbered = after
      .replace('3. That the applicant undertakes', '4. That the applicant undertakes')
      .replace('4. That the applicant has', '3. That the applicant has');
    expect(keepsEveryParagraph(BODY, renumbered)).toBe(true);
  });

  it('refuses a body that dropped or reworded a paragraph', () => {
    expect(keepsEveryParagraph(BODY, BODY.split('\n\n').slice(0, 2).join('\n\n'))).toBe(false);
    expect(keepsEveryParagraph(BODY, BODY.replace('falsely implicated', 'wrongly named'))).toBe(
      false,
    );
  });
});

describe('nothing in the body that the brief and the pack do not give', () => {
  const brief = briefWith(VALUES);

  it('passes a body that uses only the brief’s dates and the sections of the brief and the pack', () => {
    const body =
      '1. That the FIR was registered on 10.03.2026 under Section 103 of BNS.\n\n' +
      '2. That he was arrested on 15/03/2026.\n\n' +
      '3. That this application is under Section 483 of BNSS.';
    expect(checkAgainstBrief(body, brief, BAIL)).toEqual([]);
  });

  it('flags a date that is not in the brief', () => {
    const w = checkAgainstBrief('1. That the chargesheet was filed on 20.04.2026.', brief, BAIL);
    expect(w).toEqual([
      {
        type: 'fact_alteration',
        message: 'The draft has a date that is not in your brief: 20.04.2026. Check it before use.',
        details: { field: 'date', expected: '20.04.2026' },
      },
    ]);
  });

  it('flags a section that is in neither the brief nor the pack, once', () => {
    const w = checkAgainstBrief(
      '1. That the offence under Section 309 of BNS is not made out. Section 309 BNS does not apply.',
      brief,
      BAIL,
    );
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ type: 'invalid_section', details: { section: '309' } });
    expect(w[0].message).toContain('not in your brief or in the rules for this document');
  });

  it('does not flag a sub-section of a section the pack gives', () => {
    expect(checkAgainstBrief('1. Under Section 483(3) of BNSS.', brief, BAIL)).toEqual([]);
  });
});

describe('the label (ADR-021, rule 6)', () => {
  const missing = [
    { id: 'undertaking', title: 'Undertaking', reason: 'reported_missing' as const },
  ];
  const warning = { type: 'old_law_reference' as const, message: 'IPC 302' };

  it('comes off only when every clause is present and every check passed', () => {
    expect(needsStartingDraftLabel([], [])).toBe(false);
    expect(needsStartingDraftLabel(missing, [])).toBe(true);
    expect(needsStartingDraftLabel([], [warning])).toBe(true);
  });

  it('says why, in the words Ajay wrote', () => {
    expect(labelReason([], [])).toBeNull();
    expect(labelReason(missing, [warning])).toBe(
      'This draft does not cover: Undertaking. Add them before use.',
    );
    expect(labelReason([], [warning])).toBe('1 check did not pass. See the findings.');
    expect(labelReason([], [warning, warning])).toBe('2 checks did not pass. See the findings.');
  });
});

describe('the PDF of a starting draft', () => {
  it('carries the footer from T-107, and an unlabelled draft does not', () => {
    const footer = 'Starting draft prepared with AI assistance from the details you gave.';
    expect(contentToHtml('<p>1. Body</p>', false, true)).toContain(footer);
    expect(contentToHtml('<p>1. Body</p>', false)).not.toContain(footer);
    // The standard disclaimer stays on every draft.
    for (const html of [contentToHtml('x', false, true), contentToHtml('x', false)]) {
      expect(html).toContain('Lawie does not provide legal advice');
    }
  });
});

// ── A request with no rule pack (T-106 part 2; T-107, sections 4 and 6) ──────

function guidedBrief(values: GivenValue[], courtDocument = false, dates: string[] = []) {
  return buildBrief({
    kind: { id: null, name: 'consent letter for use of premises', court_document: courtDocument },
    checklist: [...fixedChecklist(courtDocument), ...dates.map((d) => guidedDateItem(d))],
    values,
    court: courtDocument ? court : undefined,
  });
}

const LETTER: GivenValue[] = [
  { key: FIXED_KEYS.firstParty, value: 'Sunita Devi', source: 'user' },
  { key: FIXED_KEYS.otherParty, value: 'Patna Municipal Corporation', source: 'user' },
  {
    key: FIXED_KEYS.facts,
    value:
      'She owns shop no. 12 at Boring Road. She let it to Anil Kumar on 01/04/2026. The notice was under Section 138 of the Negotiable Instruments Act, 1881.',
    source: 'description',
  },
  { key: FIXED_KEYS.relief, value: 'Consent to use the shop as a clinic.', source: 'user' },
];

describe('no rule pack: the Drafter prompt is Ajay’s text (T-107, section 6)', () => {
  it('is the signed prompt, with the rules that matter', () => {
    expect(DRAFTER_GUIDED_SYSTEM_PROMPT.startsWith('You are a senior Indian advocate')).toBe(true);
    expect(DRAFTER_GUIDED_SYSTEM_PROMPT).toContain('- MODE: "light" or "strict".');
    expect(DRAFTER_GUIDED_SYSTEM_PROMPT).toContain(
      'Cite a section number only if it is in "sections_given", and exactly as given.',
    );
    expect(DRAFTER_GUIDED_SYSTEM_PROMPT).toContain('[To be confirmed: what is missing]');
    expect(DRAFTER_GUIDED_SYSTEM_PROMPT).toContain('[Section — verify before filing]');
    expect(DRAFTER_GUIDED_SYSTEM_PROMPT).toContain('[Authority — add if relied upon]');
    expect(
      DRAFTER_GUIDED_SYSTEM_PROMPT.endsWith('The label and footer are added by the system.'),
    ).toBe(true);
    // It is not the prompt for a rule pack: it asks for no clause report.
    expect(DRAFTER_GUIDED_SYSTEM_PROMPT).not.toContain(CLAUSES_MARKER);
  });
});

describe('no rule pack: the sections the advocate wrote', () => {
  it.each([
    [
      'under Section 138 of the Negotiable Instruments Act, 1881 a notice',
      ['Section 138 of the Negotiable Instruments Act, 1881'],
    ],
    ['FIR u/s 420 IPC was lodged', ['u/s 420 IPC']],
    ['offence under sections 318 and 336 of BNS', ['sections 318 and 336 of BNS']],
    ['bail under Section 483 BNSS and Sec. 35(3) BNSS', ['Section 483 BNSS', 'Sec. 35(3) BNSS']],
    [
      'Section 13(1)(ia) of the Hindu Marriage Act 1955.',
      ['Section 13(1)(ia) of the Hindu Marriage Act 1955'],
    ],
    ['धारा 302 के तहत मामला', ['धारा 302']],
    ['read Section 5 Ram Kumar said so', ['Section 5']],
    ['Section 9. Then he left', ['Section 9']],
    ['He lives in sector 12 and paid 138 rupees', []],
  ])('%s', (text, expected) => {
    expect(sectionsGiven([text])).toEqual(expected);
  });

  it('lists each one once, across every text of the brief', () => {
    expect(sectionsGiven(['u/s 420 IPC', 'again u/s 420 IPC and Section 34 IPC'])).toEqual([
      'u/s 420 IPC',
      'Section 34 IPC',
    ]);
  });
});

describe('no rule pack: what the Drafter is given', () => {
  const brief = guidedBrief(LETTER);

  it('gives the brief with the sections the advocate wrote, and nothing from a rule pack', () => {
    const given = guidedDrafterBrief(brief, null);
    expect(given.document).toBe('consent letter for use of premises');
    expect(given.court).toBeNull();
    expect(given.sections_given).toEqual(['Section 138 of the Negotiable Instruments Act, 1881']);
    expect(given.parties.map((p) => p.value)).toEqual([
      'Sunita Devi',
      'Patna Municipal Corporation',
    ]);
    expect(given.asked_for[0].value).toBe('Consent to use the shop as a clinic.');
  });

  it('the mode is always strict, with the target and the language', () => {
    const prompt = buildGuidedDrafterUserPrompt({
      brief: guidedDrafterBrief(brief, null),
      target: 8,
      language: 'en',
    });
    expect(prompt.startsWith('MODE: strict\n\nTARGET: 8\n\nLANGUAGE: en\n\nBRIEF:\n{')).toBe(true);
    expect(prompt).toContain('"sections_given": [');
    expect(prompt).not.toContain('CLAUSES');
    expect(prompt).not.toContain('SYSTEM PARTS');
  });

  it('a court document names the court from the courts data, or a blank', () => {
    const courtBrief = guidedBrief(LETTER, true);
    expect(guidedDrafterBrief(courtBrief, 'DISTRICT & SESSIONS JUDGE, PATNA').court).toBe(
      'DISTRICT & SESSIONS JUDGE, PATNA',
    );
    expect(guidedDrafterBrief(courtBrief, null).court).toBe('[To be confirmed: court]');
  });

  it('an unknown is given as a blank, and a date with what it is the date of', () => {
    const b = guidedBrief(
      [
        { key: FIXED_KEYS.firstParty, value: 'Sunita Devi', source: 'user' },
        { key: 'date.arrest', value: '2026-03-15', source: 'user' },
      ],
      false,
      ['arrest'],
    );
    const given = guidedDrafterBrief(b, null);
    expect(given.dates).toEqual([
      { key: 'date.arrest', date_of: 'Date of arrest', date: '15.03.2026' },
    ]);
    expect(given.unknown.map((u) => u.blank)).toContain(
      '[To be confirmed: what happened, in order]',
    );
    expect(given.sections_given).toEqual([]);
  });
});

describe('no rule pack: nothing in the draft that the brief does not give', () => {
  const brief = guidedBrief(LETTER);

  it('passes a draft that uses only the brief’s date and section', () => {
    const text =
      '1. That she let the shop on 01.04.2026.\n\n2. That a notice under Section 138 of the Negotiable Instruments Act was sent.';
    expect(checkAgainstBrief(text, brief, null)).toEqual([]);
  });

  it('flags a section and a date the brief does not give, in words that name no rule pack', () => {
    const w = checkAgainstBrief(
      '1. That the lease ended on 30.06.2026.\n\n2. That Section 106 of the Transfer of Property Act applies.',
      brief,
      null,
    );
    expect(w.map((x) => x.type)).toEqual(['fact_alteration', 'invalid_section']);
    expect(w[1].message).toContain('is in the draft but not in your brief. Verify before filing.');
    expect(w[1].message).not.toContain('rules for this document');
  });
});

describe('no rule pack: a disclaimer the Drafter was told not to write', () => {
  it('is taken out, and the court’s name and the parties are left alone', () => {
    const text = [
      'IN THE COURT OF THE DISTRICT & SESSIONS JUDGE, PATNA',
      'Sunita Devi ... Applicant',
      '1. That the applicant owns the shop.',
      'Disclaimer: this is an AI-assisted draft.',
      'Note: please verify all facts.',
      'Lawie does not provide legal advice.',
    ].join('\n\n');
    expect(withoutDisclaimers(text)).toBe(
      [
        'IN THE COURT OF THE DISTRICT & SESSIONS JUDGE, PATNA',
        'Sunita Devi ... Applicant',
        '1. That the applicant owns the shop.',
      ].join('\n\n'),
    );
  });

  it('leaves a clean document as it is', () => {
    const text = 'To,\nThe Commissioner\n\n1. That consent is given.';
    expect(withoutDisclaimers(`\n${text}\n`)).toBe(text);
  });
});

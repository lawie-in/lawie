/**
 * T-241 — bail pack instructions that made the Drafter assert facts not in the brief.
 * Text, cue ruling and conditions signed by Ajay (CLO), 12 Oct 2026 IST
 * (handoff/legal/T-241-bail-instructions-signed.md).
 *
 * Part A pins every signed string against the raw pack JSON, word for word. The
 * signed strings are EXTRACTED from the signed markdown at test time (as
 * t136-signed-text does), so no legal wording is retyped here.
 * Part B is Ajay's AC2 conditions. What the code can enforce is tested as such;
 * what is prompt-only (the model's own words) is tested as "the Drafter is
 * given this", and each such test says so.
 * Part C is the cues (AC3 and the 12 Oct additions).
 *
 * No database, no real model call.
 */
import './setupEnv';

import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

import { Response } from 'express';

import { streamGenerateFromBrief } from '../services/ai.service';
import {
  CLAUSES_MARKER,
  checkAgainstBrief,
  findMissingClauses,
  splitDrafterOutput,
} from '../services/brief-drafter';
import { buildBrief, buildChecklist, GivenValue, isCourtDocument } from '../services/intake-brief';
import { loadRulePack, RulePack } from '../services/rule-pack.service';
import { loadTemplateConfig } from '../services/template-engine.service';
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

beforeEach(() => {
  mockMessagesStream.mockReset();
});

// ── The signed file ─────────────────────────────────────────────────────────

const REPO = join(__dirname, '..', '..', '..', '..');
const SIGNED_PATH = 'handoff/legal/T-241-bail-instructions-signed.md';
const SIGNED_LOCAL = readFileSync(join(REPO, SIGNED_PATH), 'utf8');
// Ajay's Addendum 1 may not be in this branch's copy yet; fall back to origin/develop_staging.
const SIGNED = SIGNED_LOCAL.includes('## Addendum 1')
  ? SIGNED_LOCAL
  : execFileSync('git', ['-C', REPO, 'show', `origin/develop_staging:${SIGNED_PATH}`], {
      encoding: 'utf8',
    });
const RULES = join(__dirname, '..', 'config', 'document-rules');
type RawPack = {
  promptInstructions: string[];
  prompt_context: string;
  mandatoryClauses: Array<Record<string, unknown>>;
};
const raw = (id: string): RawPack =>
  JSON.parse(readFileSync(join(RULES, `${id}.json`), 'utf8')) as RawPack;

/** The signed replacement in the table row whose first cell starts with `firstCell`. */
function signedRow(section: 'bail_anticipatory' | 'bail_before_magistrate', firstCell: string) {
  const from = SIGNED.indexOf(`## \`${section}.json\``);
  expect(from).toBeGreaterThan(-1);
  const rest = SIGNED.slice(from + 5);
  const next = rest.search(/\n## /);
  const part = next === -1 ? rest : rest.slice(0, next);
  const rows = part.split('\n').filter((l) => l.startsWith('|') && l.includes(firstCell));
  expect(rows).toHaveLength(1);
  const start = rows[0].indexOf('| `', 1) + 3;
  const last = rows[0].slice(start, rows[0].indexOf('`', start));
  expect(last.length).toBeGreaterThan(0);
  return last;
}

const SIGNED_ANT_1 = signedRow('bail_anticipatory', '1 "Begin with facts');
const SIGNED_ANT_2 = signedRow('bail_anticipatory', '2 "State grounds');
const SIGNED_MAG_3 = signedRow('bail_before_magistrate', '`promptInstructions` 3');
const SIGNED_MAG_4 = signedRow('bail_before_magistrate', '`promptInstructions` 4');
const SIGNED_MAG_6 = signedRow('bail_before_magistrate', '`promptInstructions` 6');
const SIGNED_CONTEXT_NEW = signedRow('bail_before_magistrate', 'the words `(4) show clean');
const SIGNED_TRIPLE_TEST = JSON.parse(
  (SIGNED.match(/```json\n([\s\S]*?)\n```/) as RegExpMatchArray)[1],
) as Record<string, unknown>;

describe('the signed file can be read', () => {
  it('yields five non-trivial instruction strings, the context phrase and the triple_test object', () => {
    for (const s of [SIGNED_ANT_1, SIGNED_ANT_2, SIGNED_MAG_3, SIGNED_MAG_4, SIGNED_MAG_6]) {
      expect(s.length).toBeGreaterThan(80);
      expect(s).not.toContain('`');
    }
    expect(SIGNED_CONTEXT_NEW).toBe(
      "(4) state the applicant's antecedents only as the BRIEF gives them, with a blank where it does not;",
    );
    expect(SIGNED_TRIPLE_TEST).toMatchObject({ id: 'triple_test', required: true });
  });
});

// ── Part A: word for word ───────────────────────────────────────────────────

describe('T-241 AC1: the signed text is in the packs, word for word', () => {
  const ant = raw('bail_anticipatory');
  const mag = raw('bail_before_magistrate');

  it.each([
    ['bail_anticipatory', 1, SIGNED_ANT_1],
    ['bail_anticipatory', 2, SIGNED_ANT_2],
    ['bail_before_magistrate', 3, SIGNED_MAG_3],
    ['bail_before_magistrate', 4, SIGNED_MAG_4],
    ['bail_before_magistrate', 6, SIGNED_MAG_6],
  ] as const)('%s promptInstructions[%i] is the signed string, exactly once', (id, i, text) => {
    const ins = raw(id).promptInstructions;
    expect(ins[i]).toBe(text);
    expect(ins.filter((x) => x === text)).toHaveLength(1);
  });

  it('the old instruction texts are gone', () => {
    const all = [...ant.promptInstructions, ...mag.promptInstructions].join('\n');
    for (const old of [
      'Begin with facts establishing the applicant',
      'State grounds for anticipatory bail: no prima facie case',
      'Set out FIR particulars and circumstances of arrest.',
      'Apply the triple-test',
      'If charge sheet has been filed, mention that custody',
    ]) {
      expect(all).not.toContain(old);
    }
  });

  it('bail_before_magistrate prompt_context: the signed phrase is in, once; the old phrase is gone', () => {
    expect(mag.prompt_context.split(SIGNED_CONTEXT_NEW)).toHaveLength(2);
    expect(mag.prompt_context).not.toContain('show clean antecedents or contextualise');
    expect(mag.prompt_context).not.toContain('clean antecedents');
    // The words around the replaced phrase are unchanged.
    expect(mag.prompt_context).toContain(`(3) address flight risk`);
    expect(mag.prompt_context).toContain(`${SIGNED_CONTEXT_NEW} (5) furnish undertakings.`);
  });

  it('bail_before_magistrate: triple_test is exactly the signed object, with no cue key', () => {
    const t = mag.mandatoryClauses.find((c) => c.id === 'triple_test');
    expect(t).toEqual(SIGNED_TRIPLE_TEST);
    expect(Object.keys(t!).sort()).toEqual(['description', 'id', 'name', 'required']);
  });

  it('entry counts are unchanged: anticipatory 9 instructions / 8 clauses; magistrate 11 / 9', () => {
    expect(ant.promptInstructions).toHaveLength(9);
    expect(ant.mandatoryClauses).toHaveLength(8);
    expect(mag.promptInstructions).toHaveLength(11);
    expect(mag.mandatoryClauses).toHaveLength(9);
  });

  it('the T-237 entries still sit second from last, before the verification line', () => {
    for (const p of [ant, mag]) {
      const ins = p.promptInstructions;
      expect(ins[ins.length - 2]).toMatch(/^State every earlier /);
      expect(ins[ins.length - 1]).toMatch(/^Do NOT generate the verification clause/);
    }
  });
});

// ── Addendum 1 (round 2): three descriptions outside the table ──────────────

/** The signed replacement in an Addendum 1 table row whose first cell contains `firstCell`. */
function addendumRow(firstCell: string): string {
  const from = SIGNED.indexOf('## Addendum 1');
  expect(from).toBeGreaterThan(-1);
  const rows = SIGNED.slice(from)
    .split('\n')
    .filter((l) => l.startsWith('|') && l.includes(firstCell));
  expect(rows).toHaveLength(1);
  const start = rows[0].lastIndexOf('| `') + 3;
  const text = rows[0].slice(start, rows[0].lastIndexOf('`'));
  expect(text.length).toBeGreaterThan(40);
  return text;
}

describe('T-241 Addendum 1: grounds and false_implication descriptions', () => {
  const SIGNED_GROUNDS = addendumRow('clause `grounds`');
  const SIGNED_FALSE_IMPL = addendumRow('clause `false_implication`');
  const ant = raw('bail_anticipatory');
  const mag = raw('bail_before_magistrate');
  const clause = (p: RawPack, id: string) => p.mandatoryClauses.find((c) => c.id === id);

  it('magistrate grounds description is the signed text, word for word', () => {
    expect(clause(mag, 'grounds')!.description).toBe(SIGNED_GROUNDS);
  });

  it('anticipatory false_implication description is the signed text, word for word', () => {
    expect(clause(ant, 'false_implication')!.description).toBe(SIGNED_FALSE_IMPL);
  });

  it('the old texts are gone', () => {
    const grounds = String(clause(mag, 'grounds')!.description);
    expect(grounds).not.toContain(
      'No prima facie case, no need for custody, clean antecedents, false implication',
    );
    expect(grounds.toLowerCase()).not.toContain('clean antecedents');
    const fi = String(clause(ant, 'false_implication')!.description);
    expect(fi).not.toContain('if applicable');
    expect(fi).not.toContain('Allegation of false implication');
  });

  it('the rest of both clauses is unchanged (id, name, required)', () => {
    expect(clause(mag, 'grounds')).toMatchObject({
      id: 'grounds',
      name: 'Grounds for Bail',
      required: true,
    });
    expect(clause(ant, 'false_implication')).toMatchObject({
      id: 'false_implication',
      name: 'False Implication / Malafide',
      required: false,
    });
  });

  // PENDING Ajay's decision: the signed addendum says to delete the legacy item, but only if
  // that moves nothing. It moves the loader note and the rulePackVersionOf hash, so the item
  // was left in place. If Ajay rules to delete it, update this pin to 8 items without it.
  it('legacy mandatory_clauses still holds "clean antecedents or explanation thereof" (9 items)', () => {
    const legacy = (
      JSON.parse(readFileSync(join(RULES, 'bail_before_magistrate.json'), 'utf8')) as {
        mandatory_clauses: string[];
      }
    ).mandatory_clauses;
    expect(legacy).toHaveLength(9);
    expect(legacy).toContain('clean antecedents or explanation thereof');
  });
});

// ── Part B: Ajay's AC2 conditions, through the real Drafter path ────────────

type Given = Record<string, string | string[]>;

const ANT_GIVEN: Given = {
  fir_number: '215/2026',
  fir_date: '2026-07-01',
  police_station: 'Kotwali',
  sections_charged: ['Section 318(4) BNS'],
  currently_in_custody: 'no',
  applicant_name: 'Deepak Ravidas',
  father_name: 'Shri Hari Ravidas',
  applicant_age: '28',
  address: 'Village Kotwali, Patna',
  language: 'English',
  // No ground stated, no apprehension detail beyond the bare narrative.
  facts_narrative: 'An FIR was registered against the applicant.',
  grounds_for_bail: [],
  advocate_name: 'Test Advocate',
  advocate_enrolment: 'D/123/2015',
};

const MAG_GIVEN: Given = {
  applicant_name: 'Deepak Ravidas',
  applicant_parentage: 'Shri Hari Ravidas',
  applicant_age: '28',
  applicant_occupation: 'Not stated',
  applicant_address: 'Village Kotwali, Patna',
  court_designation: 'Chief Judicial Magistrate, Patna',
  state: 'Bihar',
  fir_number: '143/2026',
  fir_date: '2026-06-02',
  police_station: 'Kotwali',
  offences_alleged: 'Section 318(4) BNS',
  offence_classification: 'Bailable',
  arrest_date: '2026-06-03',
  days_in_custody: '40',
  currently_in_custody: 'yes_judicial',
  jail: 'Beur Jail',
  investigation_status: 'Under investigation',
  grounds_for_bail: 'The applicant seeks bail.',
  sureties_available: 'Yes',
  advocate_name: 'Test Advocate',
  advocate_enrolment: 'D/123/2015',
  // No antecedents, no residence detail beyond the address, nothing on a charge sheet.
};

const FLIGHT_BLANK = '[To be confirmed: facts relied on to show no risk of flight]';

async function draft(packId: string, given: Given, body: string) {
  const pack = loadRulePack(packId) as RulePack;
  const u = (key: string, value: string | string[]): GivenValue => ({ source: 'user', key, value });
  const brief = buildBrief({
    kind: { id: pack.id, name: pack.name, court_document: isCourtDocument(pack.id) },
    checklist: buildChecklist(pack),
    values: Object.entries(given).map(([k, v]) => u(k, v)),
    court: { state: 'bihar', court_type: 'cjm', court: 'bihar_cjm_patna' },
  });
  const clauses = pack.mandatoryClauses.map((c) => `${c.id}: 1`).join('\n');
  mockMessagesStream
    .mockReset()
    .mockImplementation(async () =>
      sdkAnswer(`${body}\n\n${CLAUSES_MARKER}\n${clauses}`, 4000, 800),
    );
  const res = { setHeader: jest.fn(), write: jest.fn(), end: jest.fn(), headersSent: false };
  const result = await streamGenerateFromBrief(
    {
      pack,
      templateConfig: loadTemplateConfig(packId)!,
      brief,
      described: null,
      language: 'en',
      targetParagraphs: 12,
      advocateName: 'Test Advocate',
      userId: 'u1',
      runId: 'r1',
      runSequence: 1,
      runType: 'initial',
    },
    res as unknown as Response,
  );
  const first = mockMessagesStream.mock.calls[0][0] as SdkStreamParams;
  const user = first.messages[0].content;
  const between = (from: string, to: string) =>
    user.slice(user.indexOf(from) + from.length, user.indexOf(to));
  const sections = result.sections as Array<{ section_id: string; content: string }>;
  return {
    brief,
    pack,
    system: first.system,
    user,
    instructions: between('INSTRUCTIONS:\n', '\n\nACTS:'),
    briefJson: between('BRIEF:\n', '\n\nCLAUSES'),
    fullText: sections.map((s) => s.content).join('\n'),
    warnings: result.warnings as Array<{ type: string; message: string }>,
  };
}

describe('T-241 AC2 (Ajay condition): anticipatory brief with no ground stated', () => {
  const BODY = [
    '1. That an FIR bearing No. 215/2026 was registered at PS Kotwali against the applicant.',
    '2. [To be confirmed: the facts on which the applicant apprehends arrest]',
    '3. That the applicant undertakes to join the investigation.',
    '4. That no earlier application for bail: [To be confirmed: whether any earlier application for anticipatory bail or bail was made in this matter, to which court, and with what result]',
  ].join('\n\n');

  it('the brief the Drafter reads states none of the grounds the old instruction named', async () => {
    const d = await draft('bail_anticipatory', ANT_GIVEN, BODY);
    for (const g of [
      'prima facie',
      'false implication',
      'malafide',
      'antecedent',
      'cooperat',
      'roots',
    ]) {
      expect(d.briefJson.toLowerCase()).not.toContain(g);
    }
  });

  // PROMPT-ONLY: whether the model obeys is not decidable by code. What is tested
  // is that the Drafter is given the signed instructions, and the old ones are not.
  it('PROMPT-ONLY: the instructions the Drafter receives carry both signed texts and forbid asserting a ground', async () => {
    const d = await draft('bail_anticipatory', ANT_GIVEN, BODY);
    expect(d.instructions).toContain(`- ${SIGNED_ANT_1}`);
    expect(d.instructions).toContain(`- ${SIGNED_ANT_2}`);
    expect(d.instructions).toContain('Do not assert a ground');
    expect(d.instructions).toContain('unless the BRIEF states it');
    expect(d.instructions).toContain(
      '[To be confirmed: the facts on which the applicant apprehends arrest]',
    );
    expect(d.instructions).not.toContain('Begin with facts establishing');
    expect(d.instructions).not.toContain('State grounds for anticipatory bail: no prima facie');
  });

  it('ENFORCED: a draft that carries the blank for the apprehension and states no ground is kept as drafted (blank survives, nothing added)', async () => {
    const d = await draft('bail_anticipatory', ANT_GIVEN, BODY);
    expect(d.fullText).toContain(
      '[To be confirmed: the facts on which the applicant apprehends arrest]',
    );
    for (const g of ['prima facie', 'false implication', 'malafide', 'no criminal antecedent']) {
      expect(d.fullText.toLowerCase()).not.toContain(g);
    }
  });
});

describe('T-241 AC2 (Ajay condition): magistrate brief with no residence or antecedents', () => {
  const BODY = [
    '1. That FIR No. 143/2026 was registered at PS Kotwali against Deepak Ravidas.',
    '2. That the applicant was arrested on 03.06.2026 and is in judicial custody.',
    `3. It is submitted that there is no risk of flight: ${FLIGHT_BLANK}.`,
    '4. It is submitted that there is no risk of tampering with the evidence: [To be confirmed: facts relied on to show no risk of tampering with the evidence].',
    '5. It is submitted that the applicant will not influence witnesses: [To be confirmed: facts relied on to show no risk of influencing witnesses].',
    '6. That the applicant undertakes to attend court on every date.',
    '7. [To be confirmed: whether any earlier bail application was made in this matter, to which court, and with what result]',
  ].join('\n\n');

  it('the brief carries no antecedents and no residence beyond the address', async () => {
    const d = await draft('bail_before_magistrate', MAG_GIVEN, BODY);
    expect(d.briefJson).not.toMatch(/"key": "antecedents"/);
    expect(d.briefJson.toLowerCase()).not.toContain('family');
    expect(d.briefJson.toLowerCase()).not.toContain('resident of');
  });

  it('PROMPT-ONLY: the Drafter is given the signed triple-test instruction, the flight blank, and a context with no "clean antecedents"', async () => {
    const d = await draft('bail_before_magistrate', MAG_GIVEN, BODY);
    expect(d.instructions).toContain(`- ${SIGNED_MAG_4}`);
    expect(d.instructions).toContain(
      '[To be confirmed: facts relied on to show no risk of <flight / tampering with the evidence / influencing witnesses>]',
    );
    expect(d.instructions).toContain('Do not state any such fact the BRIEF does not give.');
    expect(d.instructions).toContain(`- ${SIGNED_MAG_3}`);
    expect(d.instructions).not.toContain('Apply the triple-test');
    expect(d.instructions).not.toContain('give antecedents and roots');
    // prompt_context reaches the Drafter through the system text or the pack; it must not carry the old phrase anywhere.
    expect(d.system + d.user).not.toContain('show clean antecedents');
    // The triple_test clause line the Drafter sees is the signed one.
    expect(d.user).toContain('triple_test | Flight, Evidence and Witnesses');
    expect(d.user).toContain('Never a statement of fact the brief does not give.');
  });

  it('ENFORCED: the flight blank is kept in the draft, and it is a recognised blank', async () => {
    const d = await draft('bail_before_magistrate', MAG_GIVEN, BODY);
    expect(d.fullText).toContain(FLIGHT_BLANK);
    // Nothing in the draft states a residence, family or antecedent fact the brief lacks.
    for (const f of [
      'clean antecedents',
      'no criminal antecedents',
      'permanent resident',
      'family',
    ]) {
      expect(d.fullText.toLowerCase()).not.toContain(f);
    }
  });

  it('ENFORCED (partial): a draft that invents a dated fact the brief lacks is flagged by checkAgainstBrief; an undated fact is not', async () => {
    const d = await draft('bail_before_magistrate', MAG_GIVEN, BODY);
    const invented = checkAgainstBrief(
      'That the applicant was acquitted in a case on 12.03.2019.',
      d.brief,
      d.pack,
    );
    expect(invented.map((w) => w.type)).toContain('fact_alteration');
    // The limit, stated plainly: an invented undated fact is not caught by any code check.
    const undated = checkAgainstBrief(
      'That the applicant has deep roots, a large family and no criminal antecedents.',
      d.brief,
      d.pack,
    );
    expect(undated).toEqual([]);
  });

  it('ENFORCED: triple_test reported MISSING is raised for repair (the clause is required)', () => {
    const pack = loadRulePack('bail_before_magistrate') as RulePack;
    const lines = pack.mandatoryClauses
      .filter((c) => c.required)
      .map((c) => `${c.id}: ${c.id === 'triple_test' ? 'MISSING' : 1}`)
      .join('\n');
    const out = splitDrafterOutput(`1. That FIR No. 143/2026.\n\n${CLAUSES_MARKER}\n${lines}`);
    expect(findMissingClauses(pack, out, []).map((m) => m.id)).toContain('triple_test');
  });
});

describe('T-241 AC2 (Ajay condition): magistrate brief silent on the charge sheet', () => {
  const BODY = [
    '1. That FIR No. 143/2026 was registered at PS Kotwali against Deepak Ravidas.',
    '2. That the applicant was arrested on 03.06.2026 and is in judicial custody; the investigation is under way.',
    '3. It is submitted that there is no risk of flight: [To be confirmed: facts relied on to show no risk of flight].',
    '4. [To be confirmed: whether any earlier bail application was made in this matter, to which court, and with what result]',
  ].join('\n\n');

  it('the brief does not mention a charge sheet', async () => {
    const d = await draft('bail_before_magistrate', MAG_GIVEN, BODY);
    expect(d.briefJson.toLowerCase()).not.toMatch(/charge[ -]?sheet|police report|challan/);
  });

  it('PROMPT-ONLY: the Drafter is given the signed charge-sheet instruction, conditional on the BRIEF', async () => {
    const d = await draft('bail_before_magistrate', MAG_GIVEN, BODY);
    expect(d.instructions).toContain(`- ${SIGNED_MAG_6}`);
    expect(d.instructions).toContain(
      'Only if the BRIEF states that the charge sheet has been filed',
    );
    expect(d.instructions).toContain(
      'Do not say that the charge sheet has been filed, or that investigation is complete, unless the BRIEF states it.',
    );
    expect(d.instructions).not.toContain('If charge sheet has been filed');
  });

  it('ENFORCED on the mock output only: a draft that does not say it passes through without "charge sheet filed"', async () => {
    const d = await draft('bail_before_magistrate', MAG_GIVEN, BODY);
    expect(d.fullText.toLowerCase()).not.toMatch(
      /charge[ -]?sheet (has been|was|is) (filed|submitted)|investigation (is|has been) complete/,
    );
  });
});

// ── Part C: cues ────────────────────────────────────────────────────────────

describe('T-241 cues', () => {
  /** Only the named clause, reported at paragraph 1, against `text`. */
  function reason(packId: string, clauseId: string, text: string) {
    const p = loadRulePack(packId) as RulePack;
    const only = { ...p, mandatoryClauses: p.mandatoryClauses.filter((c) => c.id === clauseId) };
    expect(only.mandatoryClauses).toHaveLength(1);
    const out = splitDrafterOutput(`1. ${text}\n\n${CLAUSES_MARKER}\n${clauseId}: 1`);
    return findMissingClauses(only, out, []).map((m) => m.reason);
  }

  describe('bail_regular earlier_applications is EA-standard (AC3: "before" tightened out)', () => {
    it('"before" alone -> clause_not_in_paragraph', () => {
      expect(
        reason(
          'bail_regular',
          'earlier_applications',
          "The bail application is filed before this Hon'ble Court.",
        ),
      ).toEqual(['clause_not_in_paragraph']);
    });

    it.each([
      'That the earlier bail application was rejected.',
      'That a previous application for bail was dismissed.',
      'That a bail application is pending before the High Court.',
      'जमानत अर्जी पहले खारिज हुई।',
      '[To be confirmed: whether any earlier application for bail was made in this matter, to which court, and with what result]',
    ])('still passes: %s', (t) => {
      expect(reason('bail_regular', 'earlier_applications', t)).toEqual([]);
    });
  });

  describe('default_bail earlier_applications is cued (R2a), the rest stay R2b', () => {
    it.each([
      'That the earlier bail application of the applicant was rejected.',
      'That a previous application for bail was dismissed as withdrawn.',
      '[To be confirmed: whether any earlier bail application was made in this matter, to which court, and with what result]',
    ])('a paragraph with an EA cue passes: %s', (t) => {
      expect(reason('default_bail', 'earlier_applications', t)).toEqual([]);
    });

    it.each([
      'That FIR No. 143/2026 was registered and the applicant is in custody.',
      "That the applicant files this bail application before this Hon'ble Court.",
      'That an earlier matter was rejected by the court.',
    ])('a paragraph without one fails: %s', (t) => {
      expect(reason('default_bail', 'earlier_applications', t)).toEqual([
        'clause_not_in_paragraph',
      ]);
    });

    it('reported MISSING is still missing', () => {
      const p = loadRulePack('default_bail') as RulePack;
      const only = {
        ...p,
        mandatoryClauses: p.mandatoryClauses.filter((c) => c.id === 'earlier_applications'),
      };
      const out = splitDrafterOutput(`1. x\n\n${CLAUSES_MARKER}\nearlier_applications: MISSING`);
      expect(findMissingClauses(only, out, []).map((m) => m.id)).toEqual(['earlier_applications']);
    });

    it('every other default_bail clause is R2b: a reported paragraph with arbitrary text passes', () => {
      const p = loadRulePack('default_bail') as RulePack;
      const others = p.mandatoryClauses.filter(
        (c) => c.required && c.id !== 'earlier_applications',
      );
      expect(others.length).toBeGreaterThan(0);
      for (const c of others) {
        expect({
          id: c.id,
          got: reason('default_bail', c.id, 'Lorem ipsum, no cue word.'),
        }).toEqual({ id: c.id, got: [] });
      }
    });
  });

  it('bail_before_magistrate triple_test has no cue (R2b): any reported paragraph passes', () => {
    expect(reason('bail_before_magistrate', 'triple_test', 'Lorem ipsum, no cue word.')).toEqual(
      [],
    );
    expect(reason('bail_before_magistrate', 'triple_test', 'flight')).toEqual([]);
  });
});

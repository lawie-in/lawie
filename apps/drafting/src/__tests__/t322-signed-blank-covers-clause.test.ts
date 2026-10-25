/**
 * T-322 — a signed blank covers its clause (no repair call). Rule by Ajay (CLO),
 * 12 Oct 2026: a paragraph holding the exact signed blank for a clause covers
 * that clause under R2b.5; only the exact signed blank counts.
 *
 * The signed blanks are EXTRACTED from the signed markdown at test time
 * (T-241-bail-instructions-signed.md, T-251-default-bail-text-signed.md), so no
 * legal wording is retyped here and a change to the signed text breaks the test.
 *
 * Part A: findMissingClauses on the real packs, pure.
 * Part B: the real Drafter path, model stubbed; the model stream is called once.
 *
 * No database, no real model call.
 */
import './setupEnv';

import { readFileSync } from 'fs';
import { join } from 'path';

import { Response } from 'express';

import { streamGenerateFromBrief } from '../services/ai.service';
import {
  CLAUSES_MARKER,
  findMissingClauses,
  SIGNED_BLANKS,
  splitDrafterOutput,
} from '../services/brief-drafter';
import { buildBrief, buildChecklist, GivenValue, isCourtDocument } from '../services/intake-brief';
import { loadRulePack, RulePack } from '../services/rule-pack.service';
import { loadTemplateConfig } from '../services/template-engine.service';
import { sdkAnswer } from './sdkStream';

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

// ── The signed blanks, extracted from the signed files ──────────────────────

const REPO = join(__dirname, '..', '..', '..', '..');
const read = (f: string): string => readFileSync(join(REPO, 'handoff', 'legal', f), 'utf8');
const T241 = read('T-241-bail-instructions-signed.md');
const T251 = read('T-251-default-bail-text-signed.md');

/** The one line of `md` that starts with `start`. */
function lineStarting(md: string, start: string): string {
  const hits = md.split('\n').filter((l) => l.startsWith(start));
  expect({ start, hits: hits.length }).toEqual({ start, hits: 1 });
  return hits[0];
}
const BLANKS = /\[To be confirmed: [^\]]*\]/g;
const blanksIn = (line: string): string[] => line.match(BLANKS) ?? [];

const apprehensionLine = lineStarting(T241, '| 1 "Begin with facts establishing');
const tripleLine = lineStarting(T241, '| `promptInstructions` 4 "Apply the triple-test');
const windowLine = lineStarting(T251, '5. `State the period the BRIEF says applies');
const nonFilingLine = lineStarting(T251, '6. `State whether a police report has been filed');

const APPREHENSION = blanksIn(apprehensionLine);
// The signed triple-test blank carries "<flight / tampering with the evidence / influencing witnesses>": one blank per word.
const TRIPLE_TEMPLATE = blanksIn(tripleLine);
const TRIPLE = TRIPLE_TEMPLATE.flatMap((t) => {
  const m = /<([^>]*)>/.exec(t);
  if (!m) return [t];
  return m[1].split(' / ').map((w) => t.replace(m[0], w));
});
const WINDOW = blanksIn(windowLine);
const NON_FILING = blanksIn(nonFilingLine);

/** The map the code must hold: pack -> clause -> blanks. */
const MAP: Array<[string, string, string[]]> = [
  ['bail_anticipatory', 'apprehension', APPREHENSION],
  ['bail_before_magistrate', 'triple_test', TRIPLE],
  ['default_bail', 'applicable_window', WINDOW],
  ['default_bail', 'non_filing', NON_FILING],
];
const CASES: Array<[string, string, string]> = MAP.flatMap(([p, c, bs]) =>
  bs.map((b): [string, string, string] => [p, c, b]),
);

describe('T-322 extraction from the signed files', () => {
  it('finds the expected number of signed blanks', () => {
    expect(APPREHENSION).toHaveLength(1);
    expect(TRIPLE_TEMPLATE).toHaveLength(1);
    expect(TRIPLE).toHaveLength(3);
    expect(WINDOW).toHaveLength(2);
    expect(NON_FILING).toHaveLength(1);
    expect(CASES).toHaveLength(7);
  });

  it('the blanks in the code are exactly the signed ones (no extra, none missing)', () => {
    const inCode = Object.values(SIGNED_BLANKS)
      .flatMap((clauses) => Object.values(clauses).flat())
      .sort();
    expect(inCode).toEqual(CASES.map((c) => c[2]).sort());
    // And per pack and clause, not only as a flat set.
    for (const [p, c, bs] of MAP) {
      expect({ p, c, blanks: [...(SIGNED_BLANKS[p]?.[c] ?? [])].sort() }).toEqual({
        p,
        c,
        blanks: [...bs].sort(),
      });
    }
  });
});

// ── Part A: findMissingClauses, pure ────────────────────────────────────────

const pack = (id: string): RulePack => loadRulePack(id) as RulePack;

/** Only the named clause, reported at paragraph 1, against `text`. Returns the reasons. */
function reasons(packId: string, clauseId: string, text: string): string[] {
  const p = pack(packId);
  const only = { ...p, mandatoryClauses: p.mandatoryClauses.filter((c) => c.id === clauseId) };
  expect(only.mandatoryClauses).toHaveLength(1);
  const out = splitDrafterOutput(`1. ${text}\n\n${CLAUSES_MARKER}\n${clauseId}: 1`);
  return findMissingClauses(only, out, []).map((m) => m.reason);
}

describe('T-322 AC1: a paragraph holding only the exact signed blank covers its clause', () => {
  it.each(CASES)('%s / %s: %s', (packId, clauseId, blank) => {
    expect(reasons(packId, clauseId, blank)).toEqual([]);
  });

  it.each(CASES)('%s / %s: the blank with text around it also covers', (packId, clauseId, b) => {
    expect(reasons(packId, clauseId, `It is submitted that ${b} as of now.`)).toEqual([]);
  });

  it('the real signed blanks are present in the real packs (the clauses exist and are required)', () => {
    for (const [p, c] of MAP) {
      const clause = pack(p).mandatoryClauses.find((x) => x.id === c);
      expect({ p, c, required: clause?.required }).toEqual({ p, c, required: true });
    }
  });

  it('a blank-only paragraph is also recorded, and a later unchanged check still passes', () => {
    const p = pack('bail_anticipatory');
    const only = {
      ...p,
      mandatoryClauses: p.mandatoryClauses.filter((c) => c.id === 'apprehension'),
    };
    const out = splitDrafterOutput(`1. ${APPREHENSION[0]}\n\n${CLAUSES_MARKER}\napprehension: 1`);
    const recorded = new Map<string, string>();
    expect(findMissingClauses(only, out, [], { recorded })).toEqual([]);
    expect(recorded.get('apprehension')).toContain('[to be confirmed');
    expect(findMissingClauses(only, out, [], { recorded })).toEqual([]);
    const changed = splitDrafterOutput(
      `1. Something else entirely.\n\n${CLAUSES_MARKER}\napprehension: 1`,
    );
    expect(findMissingClauses(only, changed, [], { recorded }).map((m) => m.reason)).toEqual([
      'clause_not_in_paragraph',
    ]);
  });
});

describe('T-322 AC2, AC3: only the exact signed blank counts; near-misses still fail', () => {
  const NOT = ['clause_not_in_paragraph'];

  it.each(CASES)('%s / %s: generic "[To be confirmed: facts]" fails (%s)', (p, c) => {
    expect(reasons(p, c, '[To be confirmed: facts]')).toEqual(NOT);
  });

  it.each(CASES)('%s / %s: an extra word inside the brackets fails', (p, c, blank) => {
    expect(reasons(p, c, blank.replace(/\]$/, ' soon]'))).toEqual(NOT);
    expect(reasons(p, c, blank.replace('[To be confirmed: ', '[To be confirmed: the '))).toEqual(
      NOT,
    );
  });

  it.each(CASES)('%s / %s: a truncated blank fails', (p, c, blank) => {
    expect(reasons(p, c, blank.slice(0, -6) + ']')).toEqual(NOT);
  });

  it("another clause's blank in this clause's paragraph fails", () => {
    expect(reasons('bail_before_magistrate', 'triple_test', APPREHENSION[0])).toEqual(NOT);
    expect(reasons('bail_anticipatory', 'apprehension', TRIPLE[0])).toEqual(NOT);
    expect(reasons('default_bail', 'applicable_window', NON_FILING[0])).toEqual(NOT);
    expect(reasons('default_bail', 'non_filing', WINDOW[0])).toEqual(NOT);
    expect(reasons('default_bail', 'non_filing', WINDOW[1])).toEqual(NOT);
  });

  it('the same blank in another pack fails (no fallback by clause id, none by blank)', () => {
    // bail_regular and interim_bail are not in the map; so apprehension's blank in a pack that has the clause id but is not keyed.
    const anticipatoryIds = pack('bail_anticipatory').mandatoryClauses.map((c) => c.id);
    expect(anticipatoryIds).toContain('apprehension');
    expect(reasons('bail_before_magistrate', 'triple_test', APPREHENSION[0])).toEqual(NOT);
    // Same clause id in another pack, where the pack has it and is not in the map.
    for (const other of [
      'bail_regular',
      'interim_bail',
      'default_bail',
      'bail_before_magistrate',
    ]) {
      const ids = pack(other)
        .mandatoryClauses.filter((c) => c.required)
        .map((c) => c.id);
      for (const [p, c, blank] of CASES) {
        if (p === other || !ids.includes(c)) continue;
        expect({ other, c, got: reasons(other, c, blank) }).toEqual({ other, c, got: NOT });
      }
    }
  });

  it.each(CASES)(
    '%s / %s: a blank of another pack, for each other mapped pack, fails',
    (p, c, blank) => {
      for (const [p2, c2] of MAP) {
        if (p2 === p) continue;
        expect({ p2, c2, got: reasons(p2, c2, blank) }).toEqual({ p2, c2, got: NOT });
      }
    },
  );

  it('the magistrate template form with "<flight / tampering ...>" fails', () => {
    expect(TRIPLE_TEMPLATE[0]).toContain(
      '<flight / tampering with the evidence / influencing witnesses>',
    );
    expect(reasons('bail_before_magistrate', 'triple_test', TRIPLE_TEMPLATE[0])).toEqual(NOT);
  });

  it('a blank-only paragraph for a clause not in the map fails as before (R2b.5)', () => {
    const p = pack('bail_before_magistrate');
    const other = p.mandatoryClauses.find(
      (c) =>
        c.required &&
        c.appliesWhen === null &&
        c.id !== 'triple_test' &&
        !['fir_particulars', 'custody', 'grounds', 'undertakings', 'earlier_applications'].includes(
          c.id,
        ),
    );
    expect(other).toBeDefined();
    expect(reasons('bail_before_magistrate', other!.id, TRIPLE[0])).toEqual(NOT);
  });

  it('a blank-only paragraph with no signed blank (only a brief-style blank) fails', () => {
    expect(
      reasons(
        'bail_anticipatory',
        'apprehension',
        '[To be confirmed: the facts on which the applicant apprehends arrest soon]',
      ),
    ).toEqual(NOT);
    expect(reasons('bail_anticipatory', 'apprehension', '{{apprehension_facts}}')).toEqual(NOT);
  });

  it('a later check that no longer includes the recorded text fails, even if it is now the signed blank', () => {
    // No code edit runs here; this is a second findMissingClauses call. The first check records the text.
    // The later check holds only the signed blank, which does not include the recorded text
    // (the later-check rule, `text.includes(before)`), so it is reported missing.
    const p = pack('bail_anticipatory');
    const only = {
      ...p,
      mandatoryClauses: p.mandatoryClauses.filter((c) => c.id === 'apprehension'),
    };
    const recorded = new Map<string, string>();
    const first = splitDrafterOutput(
      `1. The applicant apprehends arrest on a complaint of 1 June.\n\n${CLAUSES_MARKER}\napprehension: 1`,
    );
    expect(findMissingClauses(only, first, [], { recorded })).toEqual([]);
    const blankOnly = splitDrafterOutput(
      `1. ${APPREHENSION[0]}\n\n${CLAUSES_MARKER}\napprehension: 1`,
    );
    // Pinned as today's behaviour: a later paragraph that drops the recorded text is reported missing.
    expect(findMissingClauses(only, blankOnly, [], { recorded }).map((m) => m.reason)).toEqual([
      'clause_not_in_paragraph',
    ]);
  });
});

describe('T-322: normalisation', () => {
  it.each(CASES)(
    '%s / %s: case, spaces and curly quotes around the blank still match',
    (p, c, blank) => {
      expect(reasons(p, c, blank.toUpperCase())).toEqual([]);
      expect(reasons(p, c, `  ${blank.replace(/ /g, '   ')}  `)).toEqual([]);
      expect(reasons(p, c, `“${blank}”`)).toEqual([]);
      expect(reasons(p, c, `‘${blank}’`)).toEqual([]);
      expect(reasons(p, c, blank.replace(/ /g, ' '))).toEqual([]);
    },
  );
});

// ── Part B: the real Drafter path, model stubbed ────────────────────────────

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
  facts_narrative: 'An FIR was registered against the applicant.',
  grounds_for_bail: [],
  advocate_name: 'Test Advocate',
  advocate_enrollment: 'D/123/2015',
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
  advocate_enrollment: 'D/123/2015',
};
const DB_GIVEN: Given = {
  applicant_name: 'Deepak Ravidas',
  applicant_parentage: 'Shri Hari Ravidas',
  applicant_age: '28',
  applicant_address: 'Village Kotwali, Patna',
  fir_number: '143/2026',
  fir_date: '2026-06-02',
  police_station: 'Kotwali',
  offences_alleged: 'Section 318(4) BNS',
  arrest_date: '2026-06-03',
  remand_date: '2026-06-04',
  charge_sheet_status: 'Not filed',
  application_date: '2026-08-10',
  advocate_name: 'Test Advocate',
  advocate_enrollment: 'D/123/2015',
};

const EA =
  '[To be confirmed: whether any earlier bail application was made in this matter, to which court, and with what result]';

/**
 * Per pack: the givens, a body whose paragraphs 1 to 5 carry every cued clause,
 * and where the cued clauses sit. The paragraph under test is appended as the
 * last paragraph (6), and the clause under test is reported there.
 */
const SETUP: Record<string, { given: Given; body: string[]; at: Record<string, number> }> = {
  bail_anticipatory: {
    given: ANT_GIVEN,
    body: [
      'That an FIR bearing No. 215/2026 was registered at PS Kotwali against the applicant.',
      'That the applicant is not in custody.',
      'That the applicant undertakes to join the investigation.',
      `That no earlier application for bail: ${EA}`,
      'That the matter is listed.',
    ],
    at: { fir_details: 1, no_flight_risk: 3, earlier_applications: 4 },
  },
  bail_before_magistrate: {
    given: MAG_GIVEN,
    body: [
      'That FIR No. 143/2026 was registered at PS Kotwali against Deepak Ravidas.',
      'That the applicant was arrested on 03.06.2026 and is in judicial custody; the investigation is under way.',
      'It is submitted that the applicant seeks bail.',
      'That the applicant undertakes to attend court on every date.',
      `That no earlier bail application: ${EA}`,
    ],
    at: { fir_particulars: 1, custody: 2, grounds: 3, undertakings: 4, earlier_applications: 5 },
  },
  default_bail: {
    given: DB_GIVEN,
    body: [
      'That FIR No. 143/2026 was registered at PS Kotwali against Deepak Ravidas.',
      `That the applicant was arrested on 03.06.2026 and first remanded to custody on 04.06.2026. ${EA}`,
      'That the matter is listed.',
      'That the applicant is a resident of Patna.',
      'That the applicant prays for bail.',
    ],
    at: { earlier_applications: 2 },
  },
};

/** One Drafter run. The last paragraph is `target`, reported for `clauseId`. Returns the model calls. */
async function run(packId: string, clauseId: string, target: string) {
  const s = SETUP[packId];
  const p = loadRulePack(packId)!;
  const u = (key: string, value: string | string[]): GivenValue => ({ source: 'user', key, value });
  const brief = buildBrief({
    kind: { id: p.id, name: p.name, court_document: isCourtDocument(p.id) },
    checklist: buildChecklist(p),
    values: Object.entries(s.given).map(([k, v]) => u(k, v)),
    court: { state: 'bihar', court_type: 'cjm', court: 'bihar_cjm_patna' },
  });
  const paras = [...s.body, target];
  const body = paras.map((t, i) => `${i + 1}. ${t}`).join('\n\n');
  const at: Record<string, number> = { ...s.at, [clauseId]: paras.length };
  const unknown = Object.keys(at).filter((id) => !p.mandatoryClauses.some((c) => c.id === id));
  expect(unknown).toEqual([]);
  const clauses = p.mandatoryClauses.map((c) => `${c.id}: ${at[c.id] ?? 1}`).join('\n');
  mockMessagesStream
    .mockReset()
    .mockImplementation(async () =>
      sdkAnswer(`${body}\n\n${CLAUSES_MARKER}\n${clauses}`, 4000, 800),
    );
  const res = { setHeader: jest.fn(), write: jest.fn(), end: jest.fn(), headersSent: false };
  await streamGenerateFromBrief(
    {
      pack: p,
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
  return mockMessagesStream.mock.calls.length;
}

describe('T-322 AC3 (Drafter path): a blank-only paragraph triggers no repair; a near-miss does', () => {
  it('control: the setups are clean (a normal text paragraph for the clause makes one call)', async () => {
    for (const [p, c] of MAP) {
      expect({
        p,
        c,
        calls: await run(p, c, 'That the applicant states the facts as given.'),
      }).toEqual({
        p,
        c,
        calls: 1,
      });
    }
  });

  it.each(CASES)(
    '%s / %s: blank-only paragraph -> one model call, no repair (%s)',
    async (p, c, blank) => {
      expect(await run(p, c, blank)).toBe(1);
    },
  );

  it.each(MAP.map(([p, c, bs]): [string, string, string] => [p, c, bs[0]]))(
    '%s / %s: near-miss "[To be confirmed: facts]" -> repair call runs',
    async (p, c) => {
      expect(await run(p, c, '[To be confirmed: facts]')).toBeGreaterThanOrEqual(2);
    },
  );

  it.each(MAP.map(([p, c, bs]): [string, string, string] => [p, c, bs[0]]))(
    '%s / %s: the right blank with an extra word -> repair call runs',
    async (p, c, blank) => {
      expect(await run(p, c, blank.replace(/\]$/, ' soon]'))).toBeGreaterThanOrEqual(2);
    },
  );

  it("another clause's blank (apprehension's for triple_test) -> repair call runs", async () => {
    expect(
      await run('bail_before_magistrate', 'triple_test', APPREHENSION[0]),
    ).toBeGreaterThanOrEqual(2);
  });

  it("the same blank in another pack (apprehension's for bail_before_magistrate) -> repair call runs", async () => {
    expect(
      await run('bail_before_magistrate', 'triple_test', APPREHENSION[0]),
    ).toBeGreaterThanOrEqual(2);
    expect(await run('default_bail', 'non_filing', APPREHENSION[0])).toBeGreaterThanOrEqual(2);
  });

  it('the magistrate template form with "<flight / tampering ...>" -> repair call runs', async () => {
    expect(
      await run('bail_before_magistrate', 'triple_test', TRIPLE_TEMPLATE[0]),
    ).toBeGreaterThanOrEqual(2);
  });
});

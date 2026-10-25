/**
 * T-148: no case law on its own (Ajay's sign-off AJ-2026-10-07-T148).
 *
 * Pure checks of services/citation-check.ts, the wiring in streamGenerateFromBrief
 * with a stubbed model (criteria 3 and 4), and file checks on the rule packs
 * (criteria 1 and 6). No database, no real model call.
 */
import './setupEnv';

import { readFileSync } from 'fs';
import { join } from 'path';

import { Response } from 'express';

import { streamGenerateFromBrief, streamGenerateGuided } from '../services/ai.service';
import {
  AUTHORITY_BLANK,
  CITATION_REMOVED_MESSAGE,
  citationWarnings,
  removeUngivenCitations,
} from '../services/citation-check';
import { CLAUSES_MARKER } from '../services/brief-drafter';
import { buildBrief, buildChecklist, GivenValue, isCourtDocument } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { loadTemplateConfig } from '../services/template-engine.service';
import { sdkAnswer } from './sdkStream';

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

// Every test sets its own model answer; nothing carries over from the one before.
beforeEach(() => {
  mockMessagesStream.mockReset();
});

jest.mock('../services/app-settings.service', () => ({
  ...jest.requireActual('../services/app-settings.service'),
  getAppSetting: jest.fn(async () => 'claude-sonnet-4-5-20250929'),
}));
jest.mock('../services/sections.service', () => ({
  convertOldReferencesInText: jest.fn(async (text: string) => ({ converted: text, conversions: [] })),
  lookupOldToNew: jest.fn(async () => null),
}));

const BLANK = '[Authority — add if relied upon]';
const MESSAGE =
  'We removed a case citation you did not give. Add your own authority if you rely on one.';

describe('constants are Ajay’s wording', () => {
  it('blank and message', () => {
    expect(AUTHORITY_BLANK).toBe(BLANK);
    expect(CITATION_REMOVED_MESSAGE).toBe(MESSAGE);
  });
});

describe('removeUngivenCitations: nothing given', () => {
  const cases: Array<[string, string]> = [
    ['SCC', 'Sushila Aggarwal v. State (NCT of Delhi) (2020) 5 SCC 1'],
    ['AIR', 'Sushila Devi v. Mohan Lal AIR 1955 SC 481'],
    ['Cri LJ', 'Ram Kumar v. State of Bihar 2014 Cri LJ 3870'],
    ['SCC OnLine', 'Ram Kumar v. Mohan Singh 2021 SCC OnLine SC 123'],
    ['[YYYY] SCR', 'Ram Kumar v. Mohan Singh [2020] 3 SCR 12'],
    ['Supp SCC', 'Ram Kumar v. Mohan Singh 1990 (Supp) SCC 727'],
  ];
  it.each(cases)('%s citation is blanked, name and reporter both', (_n, cite) => {
    const r = removeUngivenCitations(`1. That, as held in ${cite}, the applicant is entitled.`, []);
    expect(r.text).toBe(`1. That, as held in ${BLANK}, the applicant is entitled.`);
    expect(r.removed).toBe(1);
  });

  it('a reporter with no case name before it is blanked too', () => {
    const r = removeUngivenCitations('See (2020) 5 SCC 1 on this.', []);
    expect(r.text).toBe(`See ${BLANK} on this.`);
    expect(r.removed).toBe(1);
  });

  it('text with no citation is unchanged and has no warning', () => {
    const text = '1. That the applicant was arrested on 12.09.2026 under Section 303 of BNS.\n\n2. Para.';
    const r = removeUngivenCitations(text, ['anything']);
    expect(r).toEqual({ text, removed: 0 });
    expect(citationWarnings(r.removed)).toEqual([]);
  });

  it('Anushka’s case: both judgments blanked, one warning', () => {
    const text =
      '3. That the Hon’ble Supreme Court in Sushila Aggarwal v. State (NCT of Delhi) (2020) 5 SCC 1 and P. Chidambaram v. Directorate of Enforcement (2019) 9 SCC 24 laid down the triple test.';
    const r = removeUngivenCitations(text, ['Ramesh Mahto, arrested 12.09.2026, FIR 214/2026']);
    expect(r.removed).toBe(2);
    expect(r.text).not.toMatch(/Sushila|Chidambaram|SCC/);
    expect(r.text).toBe(
      `3. That the Hon’ble Supreme Court in ${BLANK} and ${BLANK} laid down the triple test.`,
    );
    expect(citationWarnings(r.removed)).toEqual([{ type: 'case_citation', message: MESSAGE }]);
  });
});

describe('removeUngivenCitations: given by the advocate', () => {
  it('a given citation is kept, exactly as the advocate wrote it', () => {
    const given = ['Please rely on Arnesh Kumar v. State of Bihar (2014) 8 SCC 273.'];
    const r = removeUngivenCitations(
      'That in Arnesh Kumar v. State of Bihar (2014) 8 SCC 273 the Court held so.',
      given,
    );
    expect(r.text).toBe('That in Arnesh Kumar v. State of Bihar (2014) 8 SCC 273 the Court held so.');
    expect(r.removed).toBe(0);
  });

  it('the advocate’s own form is printed even if the model wrote it differently', () => {
    const r = removeUngivenCitations('Arnesh Kumar v. State of Bihar (2014) 8 S.C.C. 273 held', [
      'Arnesh Kumar v. State of Bihar (2014) 8 SCC 273',
    ]);
    expect(r.text).toBe('Arnesh Kumar v. State of Bihar (2014) 8 SCC 273 held');
    expect(r.removed).toBe(0);
  });

  it('a given citation that looks wrong is not corrected', () => {
    const wrong = 'Arnesh Kumar v. State of Bihar (2015) 99 SCC 1';
    const r = removeUngivenCitations(`As in ${wrong}.`, [wrong]);
    expect(r.text).toBe(`As in ${wrong}.`);
  });

  it('given and ungiven together: only the ungiven one is blanked', () => {
    const r = removeUngivenCitations(
      'Arnesh Kumar v. State of Bihar (2014) 8 SCC 273; Ram Kumar v. Mohan Singh (2019) 1 SCC 5.',
      ['Arnesh Kumar v. State of Bihar (2014) 8 SCC 273'],
    );
    expect(r.text).toBe(`Arnesh Kumar v. State of Bihar (2014) 8 SCC 273; ${BLANK}.`);
    expect(r.removed).toBe(1);
  });

  it('name only given (T148-2 b): only the advocate’s words are printed, model’s second party and reporter stripped', () => {
    const r = removeUngivenCitations('As held in Arnesh Kumar v. Mohan Singh (2014) 8 SCC 273, bail.', [
      'Rely on Arnesh Kumar',
    ]);
    expect(r.text).toBe(`As held in Arnesh Kumar ${BLANK}, bail.`);
    expect(r.text).not.toContain('SCC');
    expect(r.text).not.toContain('Mohan Singh');
    expect(r.removed).toBe(1);
  });

  it('name only given (T148-2 b): a model-added public second party is stripped too', () => {
    const r = removeUngivenCitations(
      'In Arnesh Kumar v. State of Bihar (2014) 8 SCC 273 the Court held.',
      ['Rely on Arnesh Kumar'],
    );
    expect(r.text).toBe(`In Arnesh Kumar ${BLANK} the Court held.`);
    expect(r.text).not.toContain('State of Bihar');
    expect(r.removed).toBe(1);
  });

  it('reporter given without a second party: prints "<party> <advocate’s reporter>", counted as a removal', () => {
    const r = removeUngivenCitations(
      'In Arnesh Kumar v. State of Bihar (2014) 8 S.C.C. 273 the Court held.',
      ['Please rely on Arnesh Kumar (2014) 8 SCC 273'],
    );
    expect(r.text).toBe('In Arnesh Kumar (2014) 8 SCC 273 the Court held.');
    expect(r.text).not.toContain('State of Bihar');
    expect(r.removed).toBe(1);
  });

  it('full given citation is unchanged and not counted', () => {
    const full = 'Arnesh Kumar v. State of Bihar (2014) 8 SCC 273';
    const r = removeUngivenCitations(`In ${full} the Court held.`, [`Rely on ${full}`]);
    expect(r).toEqual({ text: `In ${full} the Court held.`, removed: 0 });
  });

  it('a public party alone in the brief (State of Bihar) does not make a case "named"', () => {
    const r = removeUngivenCitations('Ram Kumar v. State of Bihar (2014) 8 SCC 273', [
      'FIR against State of Bihar',
    ]);
    expect(r.text).toBe(BLANK);
  });

  it('a citation in rule-pack text is not a source: only `given` counts', () => {
    const r = removeUngivenCitations('Sushila Aggarwal v. State (NCT of Delhi) (2020) 5 SCC 1', []);
    expect(r.text).toBe(BLANK);
  });
});

describe('removeUngivenCitations: openers, list markers and name edges (review round 1)', () => {
  const AK = 'Arnesh Kumar v. State of Bihar (2014) 8 SCC 273';
  const SA = 'Sushila Aggarwal v. State (NCT of Delhi) (2020) 5 SCC 1';
  const run = (text: string, given: string[]) => removeUngivenCitations(text, given);

  it.each(['(a)', '(A)', '(i)'])('(1) list marker %s is not part of party 1 for a given citation', (mark) => {
    const text = `${mark} ${AK}`;
    const r = run(text, [AK]);
    expect(r).toEqual({ text, removed: 0 });
    expect(citationWarnings(r.removed)).toEqual([]);
  });

  it('(2) list marker kept, ungiven citation blanked', () => {
    const r = run(`(b) ${SA}`, [AK]);
    expect(r.text).toBe(`(b) ${BLANK}`);
    expect(r.removed).toBe(1);
  });

  it.each(['Accordingly', 'Therefore', 'Moreover'])('(3) opener %s before a given citation is unchanged', (w) => {
    const text = `${w} ${AK} held so.`;
    expect(run(text, [AK])).toEqual({ text, removed: 0 });
  });

  it.each(['Accordingly', 'Therefore', 'Moreover'])(
    '(3) opener %s kept when name given and reporter differs; reporter blanked',
    (w) => {
      const r = run(`${w} Arnesh Kumar v. State of Bihar (2015) 9 SCC 9 held.`, ['Arnesh Kumar v. State of Bihar (2014) 8 SCC 273']);
      expect(r.text.startsWith(`${w} `)).toBe(true);
      expect(r.text).toContain(BLANK);
      expect(r.text).not.toContain('(2015) 9 SCC 9');
      expect(r.removed).toBe(1);
    },
  );

  it('(4) opener before an ungiven citation is kept; the citation is blanked', () => {
    const r = run(`Accordingly ${SA}`, []);
    expect(r.text).toBe(`Accordingly ${BLANK}`);
    expect(r.removed).toBe(1);
  });

  it('(5) a model-added first word is kept outside the advocate’s name', () => {
    const r = run('Zorba Arnesh Kumar v. State of Bihar (2014) 8 SCC 273', ['Arnesh Kumar']);
    expect(r.text).toBe(`Zorba Arnesh Kumar ${BLANK}`);
    expect(r.removed).toBe(1);
  });

  it('(6) a bare common surname given does not make the case named', () => {
    const r = run('Zorba Ravi Kumar v. State of Bihar (2015) 1 SCC 9', ['Kumar']);
    expect(r.text).toBe(BLANK);
    expect(r.removed).toBe(1);
  });

  it('(7) a bracketed party name given in full is unchanged', () => {
    const r = run(SA, [SA]);
    expect(r).toEqual({ text: SA, removed: 0 });
  });

  it.each(['(2019) 5 Bigha 3 Katha', '(2024) 3 Acres 10'])('(8) %s with no case name is not a citation', (t) => {
    const text = `The land is ${t} in all.`;
    expect(run(text, [])).toEqual({ text, removed: 0 });
  });

  it.each(['(2010) 2 Mad LJ 45', '(2012) 3 DLT 77', '(2011) 4 BLJR 12'])(
    '(8) known reporter %s with no case name is blanked',
    (t) => {
      const r = run(`See ${t} here.`, []);
      expect(r.text).toBe(`See ${BLANK} here.`);
      expect(r.removed).toBe(1);
    },
  );

  it('(8) unknown reporter after a "v." case name is blanked', () => {
    const r = run('Ram v. Shyam (2019) 5 Foo 3', []);
    expect(r.text).toBe(BLANK);
    expect(r.removed).toBe(1);
  });

  it.each(['Sections', 'Para', 'No'])('(9) "(2019) 5 %s 3" is not a citation', (w) => {
    const text = `Refer (2019) 5 ${w} 3 of the paper.`;
    expect(run(text, [])).toEqual({ text, removed: 0 });
  });
});

// ── Wiring, with a stubbed model ────────────────────────────────────────────

function sse(content: string) {
  return sdkAnswer(content, 4000, 800);
}

async function draftWith(body: string, described: string | null, extra: GivenValue[] = []) {
  const pack = loadRulePack('bail_regular')!;
  const grounds = buildChecklist(pack).find((i) => i.key === 'grounds_for_bail')!.options![2];
  const u = (key: string, value: string | string[]): GivenValue => ({ source: 'user', key, value });
  const brief = buildBrief({
    kind: { id: pack.id, name: pack.name, court_document: isCourtDocument(pack.id) },
    checklist: buildChecklist(pack),
    values: [
      u('applicant_name', 'Ramesh Mahto'),
      u('father_name', 'Shri Suresh Mahto'),
      u('applicant_age', '34'),
      u('address', 'Village Karmatand, PS Saraidhela, Dhanbad'),
      u('fir_number', '214/2026'),
      u('fir_date', '2026-09-10'),
      u('police_station', 'Saraidhela'),
      u('sections_charged', ['303']),
      u('currently_in_custody', 'Yes — Judicial custody'),
      u('custody_since', '2026-09-13'),
      u('facts_narrative', 'He is the only earning member of his family.'),
      u('grounds_for_bail', [grounds]),
      ...extra,
    ],
    court: { state: 'bihar', court_type: 'sessions', court: 'district_sessions_patna' },
  });
  if (!brief.can_confirm) throw new Error('brief cannot be confirmed');
  const clauses = pack.mandatoryClauses.map((c) => `${c.id}: 1`).join('\n');
  const answer = `${body}\n\n${CLAUSES_MARKER}\n${clauses}`;
  mockMessagesStream.mockReset().mockImplementation(async () => sse(answer));
  const res = { setHeader: jest.fn(), write: jest.fn(), end: jest.fn(), headersSent: false };
  const result = await streamGenerateFromBrief(
    {
      pack,
      templateConfig: loadTemplateConfig('bail_regular')!,
      brief,
      described,
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
  const text = result.sections.map((s: { content: string }) => s.content).join('\n');
  return { text, messages: result.warnings.map((w: { message: string }) => w.message), result };
}

const BASE =
  '1. That FIR No. 214/2026 was registered at PS Saraidhela under Section 303 of BNS against Ramesh Mahto.\n\n2. That the applicant is the only earning member of his family.';

describe('wiring: streamGenerateFromBrief with a stubbed model (criteria 3 and 4)', () => {
  it('criterion 3: citations nobody gave are blanked and the page message is added', async () => {
    const out = await draftWith(
      `${BASE}\n\n3. That in Sushila Aggarwal v. State (NCT of Delhi) (2020) 5 SCC 1 and P. Chidambaram v. Directorate of Enforcement (2019) 9 SCC 24 the test was laid down.`,
      'My client Ramesh Mahto was arrested in FIR 214/2026 and needs regular bail.',
    );
    expect(out.text).not.toMatch(/Sushila|Chidambaram|\bSCC\b/);
    expect(out.text).toContain(BLANK);
    expect(out.messages.filter((m) => m === MESSAGE)).toHaveLength(1);
  });

  it('criterion 4: a citation the advocate gave in the description is kept as given, no warning', async () => {
    const out = await draftWith(
      `${BASE}\n\n3. That in Arnesh Kumar v. State of Bihar (2014) 8 SCC 273 the Court held so.`,
      'Ramesh Mahto, FIR 214/2026. Please rely on Arnesh Kumar v. State of Bihar (2014) 8 SCC 273.',
    );
    expect(out.text).toContain('Arnesh Kumar v. State of Bihar (2014) 8 SCC 273');
    expect(out.messages).not.toContain(MESSAGE);
  });

  it('criterion 4: name only given -> name kept, model’s reporter blanked, message shown', async () => {
    const out = await draftWith(
      `${BASE}\n\n3. That in Arnesh Kumar v. Mohan Singh (2014) 8 SCC 273 the Court held so.`,
      'Ramesh Mahto, FIR 214/2026. Please rely on Arnesh Kumar.',
    );
    expect(out.text).toContain('Arnesh Kumar');
    expect(out.text).not.toContain('v. Mohan Singh');
    expect(out.text).not.toContain('SCC');
    expect(out.text).toContain(BLANK);
    expect(out.messages).toContain(MESSAGE);
  });

  it('no citation in the draft -> no message', async () => {
    const out = await draftWith(BASE, null);
    expect(out.messages).not.toContain(MESSAGE);
  });
});

describe('wiring: streamGenerateGuided (no rule pack) with a stubbed model', () => {
  async function guidedWith(body: string, extra: GivenValue[] = []) {
    const pack = loadRulePack('bail_regular')!;
    const u = (key: string, value: string | string[]): GivenValue => ({ source: 'user', key, value });
    const brief = buildBrief({
      kind: { id: pack.id, name: pack.name, court_document: true },
      checklist: buildChecklist(pack),
      values: [
        u('applicant_name', 'Ramesh Mahto'),
        u('fir_number', '214/2026'),
        u('facts_narrative', 'He is the only earning member of his family.'),
        ...extra,
      ],
      court: { state: 'bihar', court_type: 'sessions', court: 'district_sessions_patna' },
    });
    brief.kind = { ...brief.kind, id: null };
    mockMessagesStream.mockReset().mockImplementation(async () => sse(body));
    const res = { setHeader: jest.fn(), write: jest.fn(), end: jest.fn(), headersSent: false };
    const result = await streamGenerateGuided(
      { brief, language: 'en', targetParagraphs: 6, userId: 'u1', runId: 'r1', runSequence: 1, runType: 'initial' },
      res as unknown as Response,
    );
    return { result, messages: result.warnings.map((w: { message: string }) => w.message) };
  }

  it('an ungiven citation is blanked and the page message is added', async () => {
    const { result, messages } = await guidedWith(
      `${BASE}\n\n3. That in Sushila Aggarwal v. State (NCT of Delhi) (2020) 5 SCC 1 the test was laid down.`,
    );
    expect(result.fullText).not.toMatch(/Sushila|\bSCC\b/);
    expect(result.fullText).toContain(BLANK);
    expect(messages.filter((m) => m === MESSAGE)).toHaveLength(1);
  });

  it('a draft with no citation has no message', async () => {
    const { messages } = await guidedWith(BASE);
    expect(messages).not.toContain(MESSAGE);
  });
});

// ── The packs (criteria 1 and 6) ────────────────────────────────────────────

describe('rule packs name no judgment', () => {
  const dir = join(__dirname, '..', 'config', 'document-rules');
  const read = (id: string) => readFileSync(join(dir, `${id}.json`), 'utf8');
  const JUDGMENT = /Sushila|Chidambaram|Morgan Stanley|Anand Prasad|Faqir Chand|Mohan Lal|\d+\s+SCC\s+\d+|AIR\s+\d{4}\s+SC/;

  it.each(['bail_before_magistrate', 'bail_anticipatory'])('%s: no judgment named', (id) => {
    expect(read(id)).not.toMatch(JUDGMENT);
  });

  it.each([
    'bail_before_magistrate',
    'bail_anticipatory',
    'plaint_injunction',
    'temporary_injunction_o39',
  ])('%s: is valid JSON and tells the model to write the blank', (id) => {
    JSON.parse(read(id));
    expect(read(id)).toContain(BLANK);
  });

  it('joint_development_agreement: no judgment named in instructions or description', () => {
    const p = JSON.parse(read('joint_development_agreement'));
    expect(JSON.stringify({ i: p.promptInstructions, d: p.description, c: p.prompt_context })).not.toMatch(
      JUDGMENT,
    );
  });

  it('joint_development_agreement: no Faqir Chand / Gulati anywhere; consumer description is Ajay’s T148-2 (a)', () => {
    const raw = read('joint_development_agreement');
    expect(raw).not.toMatch(/Faqir|Gulati/);
    expect(raw).toContain('"description": "Definition of \\"consumer\\""');
  });

  it.each(['plaint_injunction', 'temporary_injunction_o39'])(
    '%s: no judgment named outside key_citations (never wired into a prompt)',
    (id) => {
      const p = JSON.parse(read(id));
      delete p.key_citations;
      expect(JSON.stringify(p)).not.toMatch(JUDGMENT);
    },
  );
});

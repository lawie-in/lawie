/**
 * T-472 option (d) (Arjun/Ajay, AJ-472-M1): the model's text is NEVER edited for
 * limitation. Every earlier R3/R4 sentence, grounds and claims alike, survives
 * byte for byte on the brief path (no ledger / ledger) and the form path. A
 * sentence that states this petition's limitation position is only FLAGGED in
 * the checks panel; the computed paragraph is printed once, as a system section.
 * Every sentence and expected string is typed by hand.
 *
 * A  the finder (sentences flagged / not flagged)   B  the real paths
 * C  the contradiction case                         D  the Drafter prompt
 */
import './setupEnv';

import type { LedgerFact } from '@lawie/shared';
import { Response } from 'express';

import { streamGenerateFromBrief, streamGenerateFromTemplate } from '../services/ai.service';
import { CLAUSES_MARKER } from '../services/brief-drafter';
import * as factVerifier from '../services/fact-verifier';
import { loadAvermentLists } from '../services/averments';
import { buildBrief, buildChecklist, type GivenValue } from '../services/intake-brief';
import { findLimitationClaims } from '../services/limitation.service';
import { loadRulePack } from '../services/rule-pack.service';
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

const PACK_ID = 'criminal_revision';
const PROVISION = 'Article 131 of the Schedule to the Limitation Act, 1963';
const WITHIN = `The present petition is filed within the period of limitation prescribed under ${PROVISION}.`;
const BEYOND_41 = `The present petition is filed after the period of limitation prescribed under ${PROVISION}, with a delay of 41 days. The petitioner has filed a separate application under Section 5 of the Limitation Act, 1963 for condonation of the delay, which may be read as part of this petition.`;
const ORDER = '2026-01-01';
const LATE = '2026-05-12'; // day 131
const IN_TIME = '2026-03-15'; // day 73

const count = (hay: string, needle: string) => hay.split(needle).length - 1;

/** A numbered paragraph as the ledger and form paths deliver it (HTML). */
const P = (x: string) => `<p style="text-align:left">${x}</p>`;

/** The model's own in-time statements: each must be flagged. Typed by hand. */
const MUST_FLAG = [
  'This revision against the order taking cognizance is within limitation.',
  'The petition is well within time, the cognizance order being dated 5 January 2026.',
  "The petitioner has approached this Hon'ble Court within the period of limitation.",
  "The petition is filed before this Hon'ble Court within limitation.",
  'The application is within time.',
  'This petition is filed within limitation, and cognizance was barred under Section 468 CrPC.',
  'The petition is within limitation as Section 473 CrPC does not apply.',
];

/** Grounds about the case below: never flagged, never altered. */
const MUST_NOT_FLAG = [
  'The present petition is filed against the order taking cognizance beyond the period of limitation under Section 468 CrPC.',
  'The present revision is preferred against the summoning order on a complaint filed beyond the period of limitation.',
  'The petitioner has filed the complaint within time.',
];

/**
 * Limitation in OTHER proceedings (Ajay: stays as the advocate gave it). The
 * finder may flag these; the tests only require that they survive.
 */
const OTHER_PROCEEDINGS = [
  'The impugned order passed on the application under Section 473 CrPC holding that the complaint is within limitation is perverse.',
  "The learned Magistrate dismissed the petitioner's application for discharge holding that the charge sheet is within time.",
  'The petitioner had preferred an appeal before the learned Sessions Judge within the period of limitation which was dismissed on 5 January 2026.',
  'The petitioner moved an application for discharge within 30 days of framing of charge.',
  'The present revision is preferred as the prosecution was launched beyond the prescribed period under Section 468 CrPC.',
];

/** Earlier grounds (round 2/4) that were never claims. */
const OLDER_GROUNDS = [
  'The cognizance taken is barred by limitation under Section 468 CrPC.',
  'The cognizance is barred under s.514 BNSS.',
  'There is an unexplained delay of 12 days in lodging the FIR.',
  "This is a limitation of the court's revisional powers.",
  'The complaint was filed beyond the period of limitation.',
  'There is a delay of 12 days in filing.',
  'Limitation is not an issue here.',
];

/** All of them, in a fixed order: paragraphs 2 to N-1 of the model's draft. */
const ALL = [...MUST_FLAG, ...MUST_NOT_FLAG, ...OTHER_PROCEEDINGS, ...OLDER_GROUNDS];

/** The model's draft: intro, every sentence as its own paragraph, a closing paragraph. */
function fullDraft(): string {
  return [
    '1. That the petitioner Ramesh Kumar is a resident of Patna.',
    ...ALL.map((s, i) => `${i + 2}. ${s}`),
    `${ALL.length + 2}. That the order is illegal and perverse.`,
  ].join('\n\n');
}
/** Paragraphs in fullDraft, so the computed paragraph is the next number. */
const FULL_N = ALL.length + 2 + 1;

// ── A: the finder ───────────────────────────────────────────────────────────

describe('T-472 A: which sentences are flagged', () => {
  it.each(MUST_FLAG)('flagged: "%s"', (s) => {
    expect(findLimitationClaims([`1. That the order is illegal.\n\n2. ${s}`])).toEqual([s]);
  });
  it.each([...MUST_NOT_FLAG, ...OLDER_GROUNDS])('not flagged: "%s"', (s) => {
    expect(findLimitationClaims([`1. That the order is illegal.\n\n2. ${s}`])).toEqual([]);
  });
  it.each(OTHER_PROCEEDINGS)(
    'other proceedings, may be flagged but only returned as written: "%s"',
    (s) => {
      const found = findLimitationClaims([`2. ${s}`]);
      expect(found.length === 0 || (found.length === 1 && found[0] === s)).toBe(true);
    },
  );
});

// ── B and C: the real paths ─────────────────────────────────────────────────

// ── B and C: the real paths ─────────────────────────────────────────────────

function resStub() {
  const write = jest.fn();
  const res = { setHeader: jest.fn(), write, end: jest.fn(), headersSent: false };
  return Object.assign(res, {
    written: () => write.mock.calls.map((c) => String(c[0])).join(''),
  }) as unknown as Response & { written: () => string };
}

const BASE: Record<string, string> = {
  petitioner_name: 'Ramesh Kumar',
  respondent_name: 'State of Bihar',
  impugned_order_court: 'Sessions Court, Patna',
  advocate_name: 'A. Advocate',
};

function answerOf(body: string): string {
  const pack = loadRulePack(PACK_ID)!;
  const report = pack.mandatoryClauses.map((c) => `${c.id}: 1`).join('\n');
  return `${body}\n\n${CLAUSES_MARKER}\n${report}`;
}

function factsOf(values: Record<string, string>): LedgerFact[] {
  return Object.entries(values).map(
    ([k, v]) =>
      ({
        id: `f_${k}`,
        key: k,
        label: k,
        type:
          k === 'certified_copy_applied_for'
            ? 'boolean'
            : /date|copy_applied|copy_ready/.test(k)
              ? 'date'
              : 'text',
        value: k === 'certified_copy_applied_for' ? v.toLowerCase() === 'yes' : v,
        display: v,
        raw_span: v,
        source: 'user',
        confidence: 0.99,
        required_in_draft: false,
      }) as LedgerFact,
  );
}

/**
 * The fact verifier is a separate layer: it blanks any section number or period the
 * ledger does not hold (a real run turns "Section 468 CrPC" into {{MISSING: section}}).
 * Here it is passed through, so that only the limitation layer decides what stays.
 */
const verifierInputs: Array<Parameters<typeof factVerifier.verifyAndRepair>[0]> = [];

async function runBrief(
  filing: string,
  body: string,
  ledger: boolean,
  verifierBody: (before: string) => string = (b) => b,
) {
  verifierInputs.length = 0;
  const spy = jest.spyOn(factVerifier, 'verifyAndRepair').mockImplementation(async (input) => {
    verifierInputs.push(input);
    return {
      body: verifierBody(input.body),
      passed: true,
      repairRan: false,
      repairFixed: false,
      initial: [],
      afterRepair: null,
      records: [],
      banner: null,
      placeholdersAdded: 0,
    };
  });
  try {
    return await runBriefInner(filing, body, ledger);
  } finally {
    spy.mockRestore();
  }
}

async function runBriefInner(filing: string, body: string, ledger: boolean) {
  const values = {
    ...BASE,
    impugned_order_date: ORDER,
    filing_date: filing,
    certified_copy_applied_for: 'No',
  };
  const pack = loadRulePack(PACK_ID)!;
  const given: GivenValue[] = Object.entries(values).map(([k, v]) => ({
    key: k,
    value: v,
    source: 'user',
  }));
  const brief = buildBrief({
    kind: { id: pack.id, name: pack.name, court_document: true },
    checklist: buildChecklist(pack),
    values: given,
  });
  mockMessagesStream
    .mockReset()
    .mockImplementation(async () => sdkAnswer(answerOf(body), 4000, 800));
  const res = resStub();
  const out = await streamGenerateFromBrief(
    {
      pack,
      templateConfig: loadTemplateConfig(PACK_ID)!,
      brief,
      described: null,
      language: 'en',
      targetParagraphs: 10,
      advocateName: 'Test Advocate',
      userId: 'u1',
      runId: 'r1',
      runSequence: 1,
      runType: 'initial',
      loadSkeleton: () => null,
      ...(ledger
        ? { ledger: { facts: factsOf(values), unresolved: [], lists: loadAvermentLists(PACK_ID) } }
        : {}),
    } as unknown as Parameters<typeof streamGenerateFromBrief>[0],
    res as unknown as Response,
  );
  return { ...out, sse: res.written() };
}

const FORM_BASE: Record<string, unknown> = {
  revisional_forum: 'high_court',
  petitioner_name: 'Ramesh Kumar',
  petitioner_status: 'Accused',
  respondent_name: 'State of Bihar',
  state_party: false,
  impugned_order_court: 'Sessions Court, Patna',
  impugned_order_date: ORDER,
  certified_copy_applied_for: false,
  impugned_order_nature: 'Final',
  fir_or_case_details: 'FIR 12/2025, PS Kotwali',
  grounds_of_revision: 'Illegality and perversity.',
  specific_errors: 'The court ignored the defence evidence.',
  no_appeal_available: 'No appeal lies.',
  documents_relied_on: 'Certified copy of the order.',
  advocate_name: 'A. Advocate',
  advocate_enrollment: 'BR/1234/2015',
};

async function runForm(filing: string, answer: string) {
  const base = loadTemplateConfig(PACK_ID)!;
  mockMessagesStream.mockReset().mockImplementation(async () => sdkAnswer(answer, 4000, 800));
  const res = resStub();
  const out = await streamGenerateFromTemplate(
    {
      templateConfig: {
        ...base,
        validation_rules: { ...base.validation_rules, auto_convert_old_to_new: false },
      },
      formData: { ...FORM_BASE, filing_date: filing },
      userId: 'u1',
      runId: 'r1',
      runSequence: 1,
      runType: 'initial',
    } as unknown as Parameters<typeof streamGenerateFromTemplate>[0],
    res as unknown as Response,
  );
  return { ...out, sse: res.written() };
}

/** The brief path result (raw), the fact verifier passed through so only the limitation layer decides. */
async function briefRaw(filing: string, body: string, ledger: boolean) {
  return runBrief(filing, body, ledger);
}

async function briefRun(filing: string, body: string, ledger: boolean): Promise<Run> {
  const out = await runBrief(filing, body, ledger);
  return out as unknown as Run;
}

async function formRun(filing: string, body: string): Promise<Run> {
  return (await runForm(filing, body)) as unknown as Run;
}

beforeEach(() => mockMessagesStream.mockReset());

type Run = { fullText: string; limitationFlags?: number; bodyParaCount: number; sse: string };

function eventsOf(text: string, name: string): Array<Record<string, any>> {
  return text
    .split('\n\n')
    .filter((b) => b.startsWith(`event: ${name}\n`))
    .map((b) => JSON.parse(b.split('\ndata: ')[1]));
}

/** The limitation warnings the advocate's checks panel was sent. */
const limitationWarningsOf = (sse: string) =>
  eventsOf(sse, 'warning')
    .flatMap((e) => e.warnings as Array<Record<string, any>>)
    .filter((w) => w.type === 'limitation');

const PATHS: Array<
  [string, (filing: string, body: string) => Promise<Run>, (x: string) => string]
> = [
  ['brief, no ledger', (f, b) => briefRun(f, b, false), (x) => x],
  ['brief, ledger', (f, b) => briefRun(f, b, true), P],
  ['form', (f, b) => formRun(f, b), P],
];

describe.each([
  ['within the period', IN_TIME, WITHIN],
  ['131 days (beyond)', LATE, BEYOND_41],
])('T-472 B real paths, %s', (_n, filing, text) => {
  describe.each(PATHS)('%s', (_p, run, wrap) => {
    it.each([...MUST_FLAG, ...MUST_NOT_FLAG, ...OTHER_PROCEEDINGS, ...OLDER_GROUNDS])(
      'survives byte for byte: "%s"',
      async (s) => {
        const out = await run(
          filing,
          `1. That the petitioner is a resident of Patna.\n\n2. ${s}\n\n3. That the order is illegal.`,
        );
        expect(out.fullText).toContain(wrap(`2. ${s}`));
        expect(count(out.fullText, s)).toBe(1);
        // the computed paragraph is the next number, once
        expect(count(out.fullText, text)).toBe(1);
        expect(out.fullText).toContain(`4. ${text}`);
        expect(out.bodyParaCount).toBe(4);
      },
    );

    it('every R3/R4 sentence in one draft: all survive byte for byte, the computed paragraph once, last', async () => {
      const out = await run(filing, fullDraft());
      ALL.forEach((s, i) => {
        expect(out.fullText).toContain(wrap(`${i + 2}. ${s}`));
        expect(count(out.fullText, s)).toBe(1);
      });
      expect(out.fullText).toContain(
        wrap('1. That the petitioner Ramesh Kumar is a resident of Patna.'),
      );
      expect(out.fullText).toContain(
        wrap(`${ALL.length + 2}. That the order is illegal and perverse.`),
      );
      expect(count(out.fullText, text)).toBe(1);
      expect(out.fullText).toContain(`${FULL_N}. ${text}`);
      expect(out.fullText.indexOf(`${FULL_N}. ${text}`)).toBeGreaterThan(
        out.fullText.indexOf(`${ALL.length + 2}. That the order is illegal and perverse.`),
      );
      expect(out.bodyParaCount).toBe(FULL_N);
      // the verification counts the computed paragraph
      expect(out.fullText).toMatch(new RegExp(`paragraphs 1 to ${FULL_N}\\b`));
    });

    it('flags: every MUST_FLAG sentence has a warning naming the computed paragraph; no ground has one', async () => {
      const out = await run(filing, fullDraft());
      const warnings = limitationWarningsOf(out.sse);
      const expected = warnings.map((w) => w.details.expected as string);
      for (const s of MUST_FLAG) expect(expected).toContain(s);
      for (const s of [...MUST_NOT_FLAG, ...OLDER_GROUNDS]) expect(expected).not.toContain(s);
      // a warning is for a sentence of the model's text, one each
      for (const e of expected) expect(ALL).toContain(e);
      expect(new Set(expected).size).toBe(expected.length);
      const para = `The limitation paragraph (para ${FULL_N}) is computed from your dates.`;
      for (const w of warnings) {
        expect(w.type).toBe('limitation');
        expect(w.details.rule).toBe('limitation_claim');
        expect(w.message).toBe(`Check this sentence: it states a limitation position. ${para}`);
      }
      expect(warnings.length).toBeGreaterThanOrEqual(MUST_FLAG.length);
      expect(out.limitationFlags).toBe(warnings.length);
    });

    it('no claim at all: no warning, limitationFlags is 0, the computed paragraph is still printed once', async () => {
      const out = await run(
        filing,
        '1. That the petitioner is a resident of Patna.\n\n2. That the order is illegal.',
      );
      expect(limitationWarningsOf(out.sse)).toEqual([]);
      expect(out.limitationFlags).toBe(0);
      expect(count(out.fullText, text)).toBe(1);
      expect(out.fullText).toContain(`3. ${text}`);
    });

    it('the model copying the computed text word for word: printed as written, FLAGGED once per copy with the signed text, ours still printed', async () => {
      const first = text.split('. ')[0] + (text.includes('. ') ? '.' : '');
      const one = await run(
        filing,
        `1. That the petitioner is a resident of Patna.\n\n2. ${text}\n\n3. That the order is illegal.`,
      );
      expect(one.fullText).toContain(wrap(`2. ${text}`));
      expect(one.fullText).toContain(`4. ${text}`);
      expect(count(one.fullText, text)).toBe(2);
      const w1 = limitationWarningsOf(one.sse);
      expect(w1.filter((w) => w.details.expected === first)).toHaveLength(1);
      for (const w of w1) {
        expect(w.message).toBe(
          'Check this sentence: it states a limitation position. The limitation paragraph (para 4) is computed from your dates.',
        );
      }
      expect(one.limitationFlags).toBe(w1.length);

      const two = await run(
        filing,
        `1. A.\n\n2. ${text}\n\n3. ${text}\n\n4. That the order is illegal.`,
      );
      const w2 = limitationWarningsOf(two.sse);
      expect(w2.filter((w) => w.details.expected === first)).toHaveLength(2);
      expect(count(two.fullText, text)).toBe(3);
      expect(two.fullText).toContain(`5. ${text}`);
      expect(two.limitationFlags).toBe(w2.length);
    });
  });
});

// ── C: the contradiction case ───────────────────────────────────────────────

describe('T-472 C: late filing and the model says it is in time', () => {
  const CLAIM = 'The petition is filed within the period of limitation, no condonation is needed.';
  const body = `1. That the petitioner is a resident of Patna.\n\n2. That the impugned order was passed on 01.01.2026. ${CLAIM}\n\n3. That the order is illegal.`;

  describe.each(PATHS)('%s', (_p, run, wrap) => {
    it('the paragraph says late (41 days); the model sentence is still there, byte for byte, with a warning naming para 4', async () => {
      const out = await run(LATE, body);
      expect(count(out.fullText, BEYOND_41)).toBe(1);
      expect(out.fullText).toContain(`4. ${BEYOND_41}`);
      expect(out.fullText).toContain(
        wrap(`2. That the impugned order was passed on 01.01.2026. ${CLAIM}`),
      );
      const warnings = limitationWarningsOf(out.sse);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatchObject({
        type: 'limitation',
        message:
          'Check this sentence: it states a limitation position. The limitation paragraph (para 4) is computed from your dates.',
        details: { rule: 'limitation_claim', expected: CLAIM },
      });
      expect(out.limitationFlags).toBe(1);
    });
  });

  it('the brief path: a flagged sentence also makes the draft a starting draft', async () => {
    const r = await briefRaw(LATE, body, false);
    expect(r.startingDraft).toBe(true);
  });
});

// ── D: the Drafter prompt ───────────────────────────────────────────────────

describe('T-472 D: the Drafter prompt', () => {
  const LINE =
    'Do not state whether the present petition is within or beyond limitation, or whether condonation of delay is needed; that paragraph is supplied. Grounds about limitation in other proceedings stay as the advocate gave them.';
  const sent = () => mockMessagesStream.mock.calls.map((c) => JSON.stringify(c[0])).join('\n');

  it.each([
    ['no ledger', false],
    ['ledger', true],
  ])(
    '%s: the signed line is in the prompt verbatim; the old LIMITATION stated line is gone',
    async (_n, ledger) => {
      await briefRun(LATE, fullDraft(), ledger);
      expect(sent()).toContain(JSON.stringify(LINE).slice(1, -1));
      expect(sent()).not.toContain(
        'LIMITATION: write the limitation paragraph as exactly this text',
      );
    },
  );
});

// ── E: the number of the computed paragraph (AJ-472-M2) ─────────────────────

describe.each(PATHS)('T-472 E numbering, %s', (_p, run, wrap) => {
  const para = (n: number) =>
    `Check this sentence: it states a limitation position. The limitation paragraph (para ${n}) is computed from your dates.`;
  const CLAIM = 'The petition is within limitation.';

  it('the model skips a number (1-4, 6-12): ours is 13, no duplicate, no gap added by us', async () => {
    const nums = [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12];
    const body = nums
      .map((n) => `${n}. ${n === 7 ? CLAIM : `That ground ${n} is made out.`}`)
      .join('\n\n');
    const out = await run(LATE, body);
    expect(out.fullText).toContain(`13. ${BEYOND_41}`);
    expect(count(out.fullText, BEYOND_41)).toBe(1);
    expect(out.fullText).not.toContain(`12. ${BEYOND_41}`);
    expect(out.fullText).not.toContain(`5. ${BEYOND_41}`);
    expect(out.bodyParaCount).toBe(13);
    expect(out.fullText).toMatch(/paragraphs 1 to 13\b/);
    const w = limitationWarningsOf(out.sse);
    expect(w).toHaveLength(1);
    expect(w[0].message).toBe(para(13));
    expect(out.limitationFlags).toBe(1);
    expect(out.fullText).toContain(wrap(`7. ${CLAIM}`));
  });

  it('sub-numbers (8.1, 8.2) do not inflate the number', async () => {
    const body = [
      ...[1, 2, 3, 4, 5, 6, 7].map((n) => `${n}. That ground ${n} is made out.`),
      '8. That the order is illegal, for these reasons:',
      '8.1 That the evidence was ignored.',
      '8.2 That the finding is perverse.',
    ].join('\n\n');
    const out = await run(IN_TIME, body);
    expect(out.fullText).toContain(`9. ${WITHIN}`);
    expect(out.fullText).not.toContain(`10. ${WITHIN}`);
    expect(out.bodyParaCount).toBe(9);
    expect(out.fullText).toMatch(/paragraphs 1 to 9\b/);
  });

  it('the model writes 1..N continuously: ours is N+1, the warning names the printed number', async () => {
    for (const n of [2, 5, 10]) {
      const body = Array.from(
        { length: n },
        (_x, i) => `${i + 1}. ${i === 0 ? CLAIM : `That ground ${i + 1}.`}`,
      ).join('\n\n');
      const out = await run(IN_TIME, body);
      expect(out.fullText).toContain(`${n + 1}. ${WITHIN}`);
      expect(count(out.fullText, WITHIN)).toBe(1);
      expect(out.bodyParaCount).toBe(n + 1);
      expect(out.fullText).toMatch(new RegExp(`paragraphs 1 to ${n + 1}\\b`));
      const w = limitationWarningsOf(out.sse);
      expect(w).toHaveLength(1);
      expect(w[0].message).toBe(para(n + 1));
    }
  });
});

// ── F: the ledger path, the Drafter's facts and the verifier ────────────────

describe('T-472 F: ledger path', () => {
  const CLAIM = 'The petition is filed within the period of limitation.';
  const body = `1. That the petitioner is a resident of Patna.\n\n2. ${CLAIM}\n\n3. That the order is illegal.`;
  const sent = () => mockMessagesStream.mock.calls.map((c) => JSON.stringify(c[0])).join('\n');

  it("the Drafter's facts hold no limitation text; the verifier's ledger still holds the fact", async () => {
    await briefRun(LATE, body, true);
    // the FACTS block of the user message (the system part AFTER YOUR TEXT prints the paragraph by design)
    const prompt = sent();
    const facts = prompt.slice(prompt.indexOf('FACTS:\\n{'), prompt.indexOf('CLAUSES (id'));
    expect(facts.length).toBeGreaterThan(100);
    expect(facts).not.toContain('delay of 41 days');
    expect(facts).not.toContain('\\"key\\": \\"limitation\\"');
    expect(facts).not.toContain('Worked out by Lawie');
    expect(verifierInputs).toHaveLength(1);
    const fact = verifierInputs[0].facts.find((f) => f.key === 'limitation');
    expect(fact).toBeDefined();
    expect(fact!.source).toBe('computed');
    expect(fact!.display).toBe(BEYOND_41);
  });

  it('a model in-time sentence the verifier blanks: a warning with blanked true and the original sentence, signed text', async () => {
    const out = await runBrief(LATE, body, true, (b) =>
      b.replace(CLAIM, '{{MISSING: Within limitation}}'),
    );
    expect(out.fullText).toContain('{{MISSING: Within limitation}}');
    expect(out.fullText).not.toContain(CLAIM);
    const w = limitationWarningsOf(out.sse);
    expect(w).toHaveLength(1);
    expect(w[0].details.blanked).toBe(true);
    expect(w[0].details.expected).toBe(CLAIM);
    expect(w[0].details.rule).toBe('limitation_claim');
    expect(w[0].message).toBe(
      'Check this sentence: it states a limitation position. The limitation paragraph (para 4) is computed from your dates.',
    );
    expect(out.limitationFlags).toBe(1);
    expect(count(out.fullText, BEYOND_41)).toBe(1);
  });

  it('a model claim that survives is flagged as printed, blanked false or absent, same signed text', async () => {
    const out = await runBrief(LATE, body, true);
    const w = limitationWarningsOf(out.sse);
    expect(w).toHaveLength(1);
    expect(w[0].details.blanked ?? false).toBe(false);
    expect(w[0].details.expected).toBe(CLAIM);
    expect(w[0].message).toBe(
      'Check this sentence: it states a limitation position. The limitation paragraph (para 4) is computed from your dates.',
    );
  });
});

// ── G: one warning per model claim sentence, partial verifier edits (AJ-472-M1) ──

describe('T-472 G: a claim the verifier edits only partly is flagged once', () => {
  const CLAIM =
    'The present revision petition is filed within 90 days from the impugned order dated 12.03.2025.';
  const body = `1. That the petitioner is a resident of Patna.\n\n2. ${CLAIM}\n\n3. That the order is illegal.`;
  const SIGNED =
    'Check this sentence: it states a limitation position. The limitation paragraph (para 4) is computed from your dates.';
  const BLANKED_CLAIM =
    'The present revision petition is filed within 90 days from the impugned order dated {{MISSING: date of order}}.';

  it('only the date blanked: exactly one warning, limitationFlags 1, blanked true', async () => {
    const out = await runBrief(LATE, body, true, (b) =>
      b.replace('dated 12.03.2025', 'dated {{MISSING: date of order}}'),
    );
    expect(out.fullText).toContain(BLANKED_CLAIM);
    const w = limitationWarningsOf(out.sse);
    expect(w).toHaveLength(1);
    expect(w[0].details.blanked).toBe(true);
    expect(w[0].details.rule).toBe('limitation_claim');
    expect(w[0].message).toBe(SIGNED);
    expect(out.limitationFlags).toBe(1);
  });

  it('only the date repaired (no blank): one warning, blanked false or absent', async () => {
    const out = await runBrief(LATE, body, true, (b) =>
      b.replace('dated 12.03.2025', 'dated 01.01.2026'),
    );
    expect(out.fullText).toContain('impugned order dated 01.01.2026.');
    const w = limitationWarningsOf(out.sse);
    expect(w).toHaveLength(1);
    expect(w[0].details.blanked ?? false).toBe(false);
    expect(w[0].message).toBe(SIGNED);
    expect(out.limitationFlags).toBe(1);
  });

  it('the claim removed outright: one warning in the model words, blanked true', async () => {
    const out = await runBrief(LATE, body, true, (b) => b.replace(`2. ${CLAIM}\n\n`, ''));
    expect(out.fullText).not.toContain(CLAIM);
    const w = limitationWarningsOf(out.sse);
    expect(w).toHaveLength(1);
    expect(w[0].details.blanked).toBe(true);
    expect(w[0].details.expected).toBe(CLAIM);
    expect(out.limitationFlags).toBe(1);
  });

  it('the whole paragraph emptied (counts equal): one warning, blanked true', async () => {
    const out = await runBrief(LATE, body, true, (b) => b.replace(`2. ${CLAIM}`, '2. '));
    const w = limitationWarningsOf(out.sse);
    expect(w).toHaveLength(1);
    expect(w[0].details.blanked).toBe(true);
    expect(out.limitationFlags).toBe(1);
  });

  it('paragraph counts differ (verifier adds a paragraph) and date blanked: still one', async () => {
    const out = await runBrief(LATE, body, true, (b) =>
      `${b.replace('dated 12.03.2025', 'dated {{MISSING: date of order}}')}\n\n4. That the prayer is just.`,
    );
    const w = limitationWarningsOf(out.sse);
    expect(w).toHaveLength(1);
    expect(w[0].details.blanked).toBe(true);
    expect(out.limitationFlags).toBe(1);
  });

  it('unchanged claim: one warning, not blanked', async () => {
    const out = await runBrief(LATE, body, true);
    const w = limitationWarningsOf(out.sse);
    expect(w).toHaveLength(1);
    expect(w[0].details.blanked ?? false).toBe(false);
    expect(out.limitationFlags).toBe(1);
  });

  it('two distinct claims in two paragraphs, one partly blanked: two warnings', async () => {
    const two = `1. That the petitioner is a resident of Patna.\n\n2. ${CLAIM}\n\n3. The petition is within limitation.\n\n4. That the order is illegal.`;
    const out = await runBrief(LATE, two, true, (b) =>
      b.replace('dated 12.03.2025', 'dated {{MISSING: date of order}}'),
    );
    const w = limitationWarningsOf(out.sse);
    expect(w).toHaveLength(2);
    expect(w.filter((x) => x.details.blanked === true)).toHaveLength(1);
    expect(out.limitationFlags).toBe(2);
    expect(w[0].message).toContain('(para 5)');
  });

  it('the citation strip removes a citation from the claim sentence: one warning', async () => {
    const cited = `1. That the petitioner is a resident of Patna.\n\n2. ${CLAIM.slice(0, -1)}, as held in Arnesh Kumar v. State of Bihar (2014) 8 SCC 273.\n\n3. That the order is illegal.`;
    for (const ledger of [false, true]) {
      const out = await runBrief(LATE, cited, ledger);
      expect(out.fullText).not.toContain('(2014) 8 SCC 273');
      const w = limitationWarningsOf(out.sse);
      expect(w).toHaveLength(1);
      expect(w[0].details.blanked ?? false).toBe(false);
      expect(out.limitationFlags).toBe(1);
    }
  });
});

// ── H: a body numbered "1) ... 7)" (AJ-472-M2) ──────────────────────────────

describe.each(PATHS)('T-472 H numbering with ")" , %s', (_p, run, wrap) => {
  const CLAIM = 'The petition is within limitation.';
  const para8 =
    'Check this sentence: it states a limitation position. The limitation paragraph (para 8) is computed from your dates.';

  it('"1) ... 7)": ours is "8.", bodyParaCount 8, warning para 8', async () => {
    const body = [1, 2, 3, 4, 5, 6, 7]
      .map((n) => `${n}) ${n === 3 ? CLAIM : `That ground ${n} is made out.`}`)
      .join('\n\n');
    const out = await run(IN_TIME, body);
    expect(out.fullText).toContain(`8. ${WITHIN}`);
    expect(out.fullText).not.toContain(`7. ${WITHIN}`);
    expect(out.fullText).not.toContain(`9. ${WITHIN}`);
    expect(count(out.fullText, WITHIN)).toBe(1);
    expect(out.bodyParaCount).toBe(8);
    expect(out.fullText).toMatch(/paragraphs 1 to 8\b/);
    const w = limitationWarningsOf(out.sse);
    expect(w).toHaveLength(1);
    expect(w[0].message).toBe(para8);
    expect(out.limitationFlags).toBe(1);
  });

  it('mixed "8.1/8.2" lines after "7)" do not count', async () => {
    const body = [
      ...[1, 2, 3, 4, 5, 6, 7].map((n) => `${n}) That ground ${n} is made out.`),
      '8.1 That the evidence was ignored.',
      '8.2 That the finding is perverse.',
    ].join('\n\n');
    const out = await run(IN_TIME, body);
    expect(out.fullText).toContain(`8. ${WITHIN}`);
    expect(out.bodyParaCount).toBe(8);
  });
});

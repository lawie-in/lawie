/**
 * T-472 review round 2: the model's claim about THIS petition's limitation is
 * replaced; real grounds of revision that mention limitation, delay, the FIR or
 * cognizance stay byte for byte. Every sentence and expected string is typed by
 * hand (Ajay's texts from handoff/legal/T-245-old-new-law-switch-signed.md,
 * "Anushka run 4", T-472). Nothing is read from the service to build an expectation.
 *
 * A  service level            B  the brief path (no ledger / ledger)
 * C  the form path            D  mutation check (in-memory)
 * E  the LIMITATION prompt line    F  more shapes a model plausibly writes (replaced / survives)
 */
import './setupEnv';

import type { LedgerFact } from '@lawie/shared';
import { Response } from 'express';

import {
  enforceLimitationText,
  enforceLimitationTextIn,
  isPetitionLimitationClaim,
} from '../services/limitation.service';
import { streamGenerateFromBrief, streamGenerateFromTemplate } from '../services/ai.service';
import { CLAUSES_MARKER } from '../services/brief-drafter';
import * as factVerifier from '../services/fact-verifier';
import { loadAvermentLists } from '../services/averments';
import { buildBrief, buildChecklist, type GivenValue } from '../services/intake-brief';
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

/** Real grounds of revision. None of these is a claim about this petition's own limitation. */
const SURVIVE = [
  'The cognizance taken is barred by limitation under Section 468 CrPC.',
  'The cognizance is barred under s.514 BNSS.',
  'There is an unexplained delay of 12 days in lodging the FIR.',
  "This is a limitation of the court's revisional powers.",
  'The complaint was filed beyond the period of limitation.',
  'There is a delay of 12 days in filing.',
  'Limitation is not an issue here.',
];

/**
 * More real grounds and neutral sentences that survive (Ajay's rulings, 441ef1e8):
 * cognizance / complaint sentences, a trial-court delay, a sentence that names no
 * petition. Service and predicate level.
 */
const SURVIVE_MORE = [
  'The complaint was filed beyond the period of limitation under Section 468 CrPC.',
  'Cognizance was taken beyond the period of limitation.',
  'In this revision, the complaint was filed beyond time.',
  'The application is within time.',
  'The revision is also against the unexplained delay of the trial court in framing charges.',
  'The Trial Court delayed the proceedings, which is a ground for this revision.',
];

/** The model's own claim about this petition. */
const CLAIM = 'The petition is filed within the period of limitation, no condonation is needed.';

/** Sentences that are the model's own claim and must be replaced. */
const REPLACED = [
  'The revision is within 90 days.',
  'There is no delay in approaching this Court.',
  'The petition is within the prescribed period.',
  'No condonation is required.',
  'This revision is filed in time.',
  'The petition is not time-barred.',
  'The petition is filed within the period of limitation, and no condonation is needed.',
  'The petitioner prays for condonation of delay, if any.',
  'The same is filed within the period of limitation.',
  'The same is filed within limitation.',
  'There is no delay on the part of the petitioner.',
  'The revision petition is filed within 3 months of the order.',
  'The petitioner has filed this revision within ninety (90) days.',
  'The revision petition arising from the FIR is filed within limitation.',
  'The present revision against the order taking cognizance is filed within the period of limitation.',
  'Within limitation.',
];

const count = (hay: string, needle: string) => hay.split(needle).length - 1;

/** The draft the model writes: the grounds are numbered paragraphs 3 to 9, the claim is paragraph 2. */
function modelDraft(): string {
  return [
    '1. That the petitioner Ramesh Kumar is a resident of Patna.',
    `2. That the impugned order was passed by the Sessions Court, Patna on 01.01.2026. ${CLAIM}`,
    ...SURVIVE.map((s, i) => `${i + 3}. ${s}`),
    '10. That the order is illegal and perverse.',
  ].join('\n\n');
}

/** A numbered paragraph as the form path delivers it (HTML). */
const P = (x: string) => `<p style="text-align:left">${x}</p>`;

function expectGroundsIntact(text: string, wrap: (x: string) => string = (x) => x) {
  SURVIVE.forEach((s, i) => {
    expect(text).toContain(wrap(`${i + 3}. ${s}`));
    expect(count(text, s)).toBe(1);
  });
  expect(text).toContain(wrap('1. That the petitioner Ramesh Kumar is a resident of Patna.'));
  expect(text).toContain(wrap('10. That the order is illegal and perverse.'));
}

// ── A: service level ────────────────────────────────────────────────────────

describe.each([
  ['within the period', WITHIN],
  ['131 days (beyond)', BEYOND_41],
])('T-472 A service level, %s', (_n, text) => {
  it.each([...SURVIVE, ...SURVIVE_MORE])(
    '"%s" stays byte for byte; the computed text is appended once',
    (sentence) => {
      const body = `1. That the order is illegal.\n\n2. ${sentence}\n\n3. Prayer.`;
      expect(enforceLimitationText(body, text)).toBe(`${body}\n\n4. ${text}`);
    },
  );

  it('a full draft: every ground stays byte for byte, the claim becomes the computed text, once', () => {
    const out = enforceLimitationText(modelDraft(), text);
    expect(out).toBe(
      [
        '1. That the petitioner Ramesh Kumar is a resident of Patna.',
        `2. That the impugned order was passed by the Sessions Court, Patna on 01.01.2026. ${text}`,
        '3. The cognizance taken is barred by limitation under Section 468 CrPC.',
        '4. The cognizance is barred under s.514 BNSS.',
        '5. There is an unexplained delay of 12 days in lodging the FIR.',
        "6. This is a limitation of the court's revisional powers.",
        '7. The complaint was filed beyond the period of limitation.',
        '8. There is a delay of 12 days in filing.',
        '9. Limitation is not an issue here.',
        '10. That the order is illegal and perverse.',
      ].join('\n\n'),
    );
    expect(count(out, text)).toBe(1);
  });

  it('the bodies form (the form path): grounds in one body, claim in another', () => {
    const out = enforceLimitationTextIn(
      ['1. Intro.', `2. ${SURVIVE[0]}\n\n3. ${SURVIVE[2]}`, `4. ${CLAIM} Prayer follows.`],
      text,
    );
    expect(out).toEqual([
      '1. Intro.',
      `2. ${SURVIVE[0]}\n\n3. ${SURVIVE[2]}`,
      `4. ${text} Prayer follows.`,
    ]);
  });

  it('a cognizance/s.468 ground right next to the claim (same paragraph): the ground survives, the claim is replaced', () => {
    const ground = 'The cognizance taken is barred by limitation under Section 468 CrPC.';
    expect(enforceLimitationText(`3. ${ground} The petition is within limitation.`, text)).toBe(
      `3. ${ground} ${text}`,
    );
    expect(enforceLimitationText(`3. The petition is within limitation. ${ground}`, text)).toBe(
      `3. ${text} ${ground}`,
    );
  });

  it('a ground in the paragraph before and after the claim paragraph', () => {
    const body = `3. ${SURVIVE[0]}\n\n4. The revision is within 90 days.\n\n5. ${SURVIVE[2]}`;
    expect(enforceLimitationText(body, text)).toBe(
      `3. ${SURVIVE[0]}\n\n4. ${text}\n\n5. ${SURVIVE[2]}`,
    );
  });

  it('idempotent over a draft with grounds', () => {
    const once = enforceLimitationText(modelDraft(), text);
    expect(enforceLimitationText(once, text)).toBe(once);
  });

  it.each(REPLACED)(
    'claim "%s" is replaced by the computed text; the ground beside it stays',
    (claim) => {
      const body = `1. ${SURVIVE[0]}\n\n2. ${claim}\n\n3. That the order is illegal.`;
      expect(enforceLimitationText(body, text)).toBe(
        `1. ${SURVIVE[0]}\n\n2. ${text}\n\n3. That the order is illegal.`,
      );
    },
  );
});

describe('T-472 A predicate', () => {
  it.each([...SURVIVE, ...SURVIVE_MORE])('survives: "%s"', (s) =>
    expect(isPetitionLimitationClaim(s)).toBe(false),
  );
  it.each(REPLACED)('claim: "%s"', (s) => expect(isPetitionLimitationClaim(s)).toBe(true));
  it.each([
    'Within limitation.',
    'The revision is filed within time.',
    'The petition is time-barred.',
  ])('claim, other shapes: "%s"', (s) => expect(isPetitionLimitationClaim(s)).toBe(true));
});

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
async function runBrief(filing: string, body: string, ledger: boolean) {
  const spy = jest.spyOn(factVerifier, 'verifyAndRepair').mockImplementation(async (input) => ({
    body: input.body,
    passed: true,
    repairRan: false,
    repairFixed: false,
    initial: [],
    afterRepair: null,
    records: [],
    banner: null,
    placeholdersAdded: 0,
  }));
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
  return streamGenerateFromBrief(
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
    resStub() as unknown as Response,
  );
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
  return streamGenerateFromTemplate(
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
    resStub() as unknown as Response,
  );
}

beforeEach(() => mockMessagesStream.mockReset());

describe.each([
  ['within the period', IN_TIME, WITHIN],
  ['131 days (beyond)', LATE, BEYOND_41],
])('T-472 B/C real paths, %s', (_n, filing, text) => {
  it.each([
    ['the brief path, no ledger', false],
    ['the brief path, with a ledger', true],
  ])(
    '%s: every ground survives byte for byte, the claim is gone, the computed text once',
    async (_p, ledger) => {
      const out = await runBrief(filing, modelDraft(), ledger);
      // with a ledger the draft is delivered as HTML paragraphs
      expectGroundsIntact(out.fullText, ledger ? P : (x) => x);
      expect(count(out.fullText, text)).toBe(1);
      expect(out.fullText).not.toMatch(/no condonation is needed/i);
      expect(out.fullText).not.toContain(CLAIM);
    },
  );

  it('the brief path (ledger): a ground beside the claim survives, the claim is replaced', async () => {
    const body = `1. That the petitioner is a resident of Patna.\n\n2. The cognizance taken is barred by limitation under Section 468 CrPC. The petition is within limitation.\n\n3. That the order is illegal.`;
    const out = await runBrief(filing, body, true);
    expect(out.fullText).toContain(
      P(`2. The cognizance taken is barred by limitation under Section 468 CrPC. ${text}`),
    );
    expect(count(out.fullText, text)).toBe(1);
    expect(out.fullText).not.toContain('The petition is within limitation.');
  });

  it.each([
    'The revision is within 90 days.',
    'No condonation is required.',
    'This revision is filed in time.',
    'The present revision against the order taking cognizance is filed within the period of limitation.',
    'The same is filed within the period of limitation.',
    'There is no delay on the part of the petitioner.',
  ])('the brief path: claim "%s" is replaced', async (claim) => {
    const body = `1. That the petitioner is a resident of Patna.\n\n2. ${claim}\n\n3. That the order is illegal.`;
    const out = await runBrief(filing, body, true);
    expect(out.fullText).toContain(`${P(`2. ${text}`)}\n${P('3. That the order is illegal.')}`);
    expect(count(out.fullText, text)).toBe(1);
    expect(out.fullText).not.toContain(claim);
  });

  it('the form path: every ground survives byte for byte, the claim is gone, the computed text once', async () => {
    const out = await runForm(filing, modelDraft());
    expectGroundsIntact(out.fullText, P);
    expect(count(out.fullText, text)).toBe(1);
    expect(out.fullText).not.toContain(CLAIM);
  });

  it.each(['The petition is within the prescribed period.', 'The petition is not time-barred.'])(
    'the form path: claim "%s" is replaced',
    async (claim) => {
      const out = await runForm(
        filing,
        `1. That the petitioner is a resident of Patna.\n\n2. ${claim}\n\n3. That the order is illegal.`,
      );
      expect(out.fullText).toContain(`${P(`2. ${text}`)}\n${P('3. That the order is illegal.')}`);
      expect(count(out.fullText, text)).toBe(1);
      expect(out.fullText).not.toContain(claim);
    },
  );

  it('the form path: the real grounds with no claim at all still get the computed paragraph once', async () => {
    const out = await runForm(filing, SURVIVE.map((s, i) => `${i + 1}. ${s}`).join('\n\n'));
    SURVIVE.forEach((s, i) => expect(out.fullText).toContain(P(`${i + 1}. ${s}`)));
    expect(count(out.fullText, text)).toBe(1);
    expect(out.fullText).toContain(P(`8. ${text}`));
  });
});

// ── D: mutation check ───────────────────────────────────────────────────────

describe('T-472 D: a cue that matches any sentence with "limitation" is caught', () => {
  const broadCue = (s: string) => /limitation/i.test(s);
  /** A mutant enforce: the broad cue decides which sentences are replaced. */
  function mutantEnforce(body: string, text: string): string {
    let placed = false;
    return body
      .split('\n\n')
      .map((para) => {
        const m = /^(\d+\. )(.*)$/.exec(para)!;
        const kept = m[2].split(/(?<=\.)\s+/).flatMap((s) => {
          if (!broadCue(s)) return [s];
          if (placed) return [];
          placed = true;
          return [text];
        });
        return `${m[1]}${kept.join(' ')}`;
      })
      .join('\n\n');
  }

  it('the broad cue flags real grounds that the real predicate leaves alone', () => {
    const flaggedByMutant = SURVIVE.filter(broadCue);
    expect(flaggedByMutant).toEqual([
      'The cognizance taken is barred by limitation under Section 468 CrPC.',
      "This is a limitation of the court's revisional powers.",
      'The complaint was filed beyond the period of limitation.',
      'Limitation is not an issue here.',
    ]);
    for (const s of flaggedByMutant) expect(isPetitionLimitationClaim(s)).toBe(false);
  });

  it('the mutant deletes grounds from the draft (so the survive tests would fail); the real enforce does not', () => {
    const mutated = mutantEnforce(modelDraft(), WITHIN);
    expect(mutated).not.toContain(SURVIVE[0]);
    expect(mutated).not.toContain(SURVIVE[3]);
    expect(mutated).not.toContain(SURVIVE[4]);
    expect(mutated).not.toContain(SURVIVE[6]);
    const real = enforceLimitationText(modelDraft(), WITHIN);
    for (const s of SURVIVE) expect(real).toContain(s);
  });
});

// ── E: the LIMITATION prompt line ───────────────────────────────────────────

describe('T-472 E: the Drafter prompt line', () => {
  it.each([
    ['beyond', LATE, BEYOND_41],
    ['within', IN_TIME, WITHIN],
  ])(
    '%s: the line reads exactly the new wording, then the computed text',
    async (_n, filing, text) => {
      await runBrief(filing, modelDraft(), true);
      const line = `LIMITATION: write the limitation paragraph as exactly this text, word for word, and state nothing else about whether this petition is within limitation or needs condonation: ${text}`;
      const calls = mockMessagesStream.mock.calls.map((c) => JSON.stringify(c[0]));
      expect(calls.some((c) => c.includes(JSON.stringify(line).slice(1, -1)))).toBe(true);
    },
  );

  it('the line starts with the LIMITATION label', async () => {
    await runBrief(LATE, modelDraft(), true);
    const calls = mockMessagesStream.mock.calls.map((c) => JSON.stringify(c[0])).join('\n');
    expect(calls).toContain('LIMITATION: write the limitation paragraph as exactly this text');
  });
});

// ── F: documented rule behaviour, and known gaps ────────────────────────────

describe('T-472 F: shapes a model plausibly writes', () => {
  it.each([
    'The revision is being filed well within the statutory time.',
    'No condonation of delay is necessary',
    'The petition is maintainable on the ground of limitation',
    'It is submitted that the present revision is within the period prescribed by law.',
    'The petition has been preferred within the time allowed by law.',
    'The revision is not hit by limitation.',
    'The revision is filed within the limitation period.',
  ])('replaced, as the rule says: "%s"', (s) => {
    expect(isPetitionLimitationClaim(s)).toBe(true);
  });

  // Replaced by Ajay's follow-up rulings (441ef1e8): a "filed within ..." claim is the
  // petition's own even when the sentence also names the cognizance order or the FIR.
  it.each([
    'The same is filed within the period of limitation.',
    'The same is filed within limitation.',
    'There is no delay on the part of the petitioner.',
    'The revision petition is filed within 3 months of the order.',
    'The petitioner has filed this revision within ninety (90) days.',
    'The revision petition arising from the FIR is filed within limitation.',
    'The present revision against the order taking cognizance is filed within the period of limitation.',
  ])('replaced: "%s"', (s) => {
    expect(isPetitionLimitationClaim(s)).toBe(true);
    expect(enforceLimitationText(`1. ${s}`, WITHIN)).toBe(`1. ${WITHIN}`);
    expect(enforceLimitationText(`1. That the order is illegal.\n\n2. ${s}`, WITHIN)).toBe(
      `1. That the order is illegal.\n\n2. ${WITHIN}`,
    );
  });

  // Survive: a sentence that does not say the petition is in time or late, or a ground
  // about the case below. The computed paragraph is added after it.
  it.each([
    'The application is within time.',
    'The revision is also against the unexplained delay of the trial court in framing charges.',
    'The Trial Court delayed the proceedings, which is a ground for this revision.',
  ])('survives: "%s"', (s) => {
    expect(isPetitionLimitationClaim(s)).toBe(false);
    expect(enforceLimitationText(`1. ${s}`, WITHIN)).toBe(`1. ${s}\n\n2. ${WITHIN}`);
  });

  it('a Section 468 CrPC ground that also says "filed beyond the period" survives with or without the section named', () => {
    for (const g of [
      'The complaint was filed beyond the period of limitation under Section 468 CrPC.',
      'The complaint was filed beyond the period of limitation.',
    ]) {
      expect(isPetitionLimitationClaim(g)).toBe(false);
    }
  });
});

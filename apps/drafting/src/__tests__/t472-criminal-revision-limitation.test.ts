/**
 * T-472 integration: criminal_revision limitation, through the real brief path
 * (with and without a ledger) and the template/form path, the model mocked.
 * Expected strings are typed by hand from Ajay's signed file
 * (handoff/legal/T-245-old-new-law-switch-signed.md, "Anushka run 4", T-472).
 *
 * A  the brief path, no ledger        B  the brief path, with a ledger
 * C  the template (form) path         D  criminal_revision.json
 * N  numbering and the Drafter's clause report
 */
import './setupEnv';

import { readFileSync } from 'fs';
import { join } from 'path';

import { Response } from 'express';
import type { LedgerFact } from '@lawie/shared';

import { streamGenerateFromBrief, streamGenerateFromTemplate } from '../services/ai.service';
import {
  CLAUSES_MARKER,
  coveredBySystemPart,
  findMissingClauses,
  type DrafterOutput,
} from '../services/brief-drafter';
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
const UNKNOWN = '[To be confirmed: whether the petition is within limitation]';
const S5_ITEM =
  'Application under Section 5 of the Limitation Act, 1963 for condonation of delay, supported by an affidavit stating the cause of the delay.';
const STATIC_ITEM = 'Condonation application if filed beyond 90 days';
// AJ-472-M1 (Ajay): the checklist line when the limitation paragraph is the blank.
const UNKNOWN_ITEM =
  'Check limitation from the dates; if the petition is late, file an application under Section 5 of the Limitation Act, 1963.';
const PROMPT_LINE =
  'Do not state whether the present petition is within or beyond limitation, or whether condonation of delay is needed; that paragraph is supplied. Grounds about limitation in other proceedings stay as the advocate gave them.';
const FLAG = (n: number) =>
  `Check this sentence: it states a limitation position. The limitation paragraph (para ${n}) is computed from your dates.`;

// The case: order 2026-01-01.
const ORDER = '2026-01-01';
const LATE = '2026-05-12'; // day 131
const IN_TIME = '2026-03-15'; // day 73

/** The model's own claim. Option (d): it stays in the draft, byte for byte, and is flagged. */
const MODEL_CLAIM =
  'The petition is filed within the period of limitation, no condonation is needed.';

const BASE: Record<string, string> = {
  petitioner_name: 'Ramesh Kumar',
  respondent_name: 'State of Bihar',
  impugned_order_court: 'Sessions Court, Patna',
  advocate_name: 'A. Advocate',
};

/**
 * The case's dates. The copy question is always answered (default "No", nothing
 * excluded); `extra` overrides it, or removes it with `certified_copy_applied_for: ''`.
 */
function dates(filing: string | null, extra: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {
    impugned_order_date: ORDER,
    ...(filing !== null ? { filing_date: filing } : {}),
    certified_copy_applied_for: 'No',
    ...extra,
  };
  if (out.certified_copy_applied_for === '') delete out.certified_copy_applied_for;
  return out;
}

/** "Yes", with the dates of a copy applied for 01-02 and ready 02-15 (45 days excluded). */
const YES_ENOUGH = {
  certified_copy_applied_for: 'Yes',
  certified_copy_applied: '2026-01-02',
  certified_copy_ready: '2026-02-15',
};

function resStub() {
  const write = jest.fn();
  const res = { setHeader: jest.fn(), write, end: jest.fn(), headersSent: false };
  return Object.assign(res, {
    written: () => write.mock.calls.map((c) => String(c[0])).join(''),
  }) as unknown as Response & { written: () => string };
}

function eventsOf(text: string, name: string): Array<Record<string, any>> {
  return text
    .split('\n\n')
    .filter((b) => b.startsWith(`event: ${name}\n`))
    .map((b) => JSON.parse(b.split('\ndata: ')[1]));
}

const count = (hay: string, needle: string) => hay.split(needle).length - 1;

/** The limitation warnings the checks panel was sent. */
function limitationWarnings(sse: string) {
  return eventsOf(sse, 'warning')
    .flatMap((e) => e.warnings as Array<Record<string, any>>)
    .filter((w) => w.type === 'limitation');
}

beforeEach(() => {
  mockMessagesStream.mockReset();
});

// ── A and B: the brief path ─────────────────────────────────────────────────

function modelBody(): string {
  return [
    '1. That the petitioner Ramesh Kumar is a resident of Patna.',
    `2. That the impugned order was passed by the Sessions Court, Patna on 01.01.2026. ${MODEL_CLAIM}`,
    '3. That the order is illegal and perverse.',
  ].join('\n\n');
}

function modelAnswer(body = modelBody()): string {
  const pack = loadRulePack(PACK_ID)!;
  const report = pack.mandatoryClauses.map((c) => `${c.id}: 1`).join('\n');
  return `${body}\n\n${CLAUSES_MARKER}\n${report}`;
}

function factsOf(values: Record<string, string>, source: 'user' | 'asked' = 'user'): LedgerFact[] {
  return Object.entries(values).map(
    ([k, v]) =>
      ({
        id: `f_${k}`,
        key: k,
        label: k,
        type:
          k === 'certified_copy_applied_for'
            ? 'boolean'
            : /date|copy_applied|copy_ready|copy_received/.test(k)
              ? 'date'
              : 'text',
        value:
          k === 'certified_copy_applied_for' && /^(yes|no)$/i.test(v)
            ? v.toLowerCase() === 'yes'
            : v,
        display: v,
        raw_span: v,
        source,
        confidence: 0.99,
        required_in_draft: false,
      }) as LedgerFact,
  );
}

/**
 * On the ledger path the real fact verifier (T-147d, a separate layer) masks a
 * figure or period the ledger does not hold, e.g. "within limitation" in the
 * model's sentence. `passthrough` lets the verifier through unchanged, so that
 * only the limitation layer decides what stays.
 */
async function runBrief(
  values: Record<string, string>,
  opts: { ledger?: boolean; unresolved?: string[]; body?: string; passthrough?: boolean } = {},
) {
  if (opts.ledger && opts.passthrough) {
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
      return await runBriefReal(values, opts);
    } finally {
      spy.mockRestore();
    }
  }
  return runBriefReal(values, opts);
}

async function runBriefReal(
  values: Record<string, string>,
  opts: { ledger?: boolean; unresolved?: string[]; body?: string } = {},
) {
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
    .mockImplementation(async () => sdkAnswer(modelAnswer(opts.body), 4000, 800));
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
      ...(opts.ledger
        ? {
            ledger: {
              facts: factsOf(values),
              unresolved: (opts.unresolved ?? []).map((key) => ({ key })),
              lists: loadAvermentLists(PACK_ID),
            },
          }
        : {}),
    } as unknown as Parameters<typeof streamGenerateFromBrief>[0],
    res as unknown as Response,
  );
  return { out, res, sse: res.written() };
}

const checklistOf = (r: { out: { filingChecklist: string[] } }) => r.out.filingChecklist;

describe.each([
  ['the brief path, no ledger', false],
  ['the brief path, with a ledger', true],
])('T-472 %s', (_name, ledger) => {
  it('131 days after the order: the delay paragraph with "41 days" once, the model sentence kept and flagged, the s.5 item on the checklist', async () => {
    const r = await runBrief({ ...BASE, ...dates(LATE) }, { ledger, passthrough: true });
    const text = r.out.fullText;
    expect(text).toContain(BEYOND_41);
    expect(count(text, BEYOND_41)).toBe(1);
    expect(text).toContain('with a delay of 41 days.');
    // option (d): the model's sentence is not edited (the paragraph says late, the warning says check)
    expect(text).toContain(MODEL_CLAIM);
    expect(text).not.toContain(WITHIN);
    expect(text).toContain(`4. ${BEYOND_41}`);
    const w = limitationWarnings(r.sse);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({
      type: 'limitation',
      message: FLAG(4),
      details: { rule: 'limitation_claim', expected: MODEL_CLAIM },
    });
    expect(r.out.limitationFlags).toBe(1);
    // the neighbours of the sentence are kept
    expect(text).toContain(
      'That the impugned order was passed by the Sessions Court, Patna on 01.01.2026.',
    );
    expect(text).toContain('That the order is illegal and perverse.');
    expect(checklistOf(r)).toContain(S5_ITEM);
    expect(checklistOf(r).filter((i) => i === S5_ITEM)).toHaveLength(1);
    // the checklist event carries it too
    expect(eventsOf(r.sse, 'checklist')[0].items).toContain(S5_ITEM);
  });

  it('the model repeating its claim in a second paragraph: both stay, one computed paragraph (para 5), a warning each', async () => {
    const body = `${modelBody()}\n\n4. That the petitioner has no delay to explain. No condonation is required.`;
    const r = await runBrief({ ...BASE, ...dates(LATE) }, { ledger, body, passthrough: true });
    expect(count(r.out.fullText, BEYOND_41)).toBe(1);
    expect(r.out.fullText).toContain(`5. ${BEYOND_41}`);
    expect(r.out.fullText).toContain('No condonation is required.');
    expect(r.out.fullText).toContain(MODEL_CLAIM);
    const w = limitationWarnings(r.sse);
    expect(w.map((x) => x.details.expected)).toEqual([MODEL_CLAIM, 'No condonation is required.']);
    for (const x of w) expect(x.message).toBe(FLAG(5));
    expect(r.out.limitationFlags).toBe(2);
  });

  it('within the period: the signed within sentence once, no limitation checklist item, the model text unchanged', async () => {
    const r = await runBrief({ ...BASE, ...dates(IN_TIME) }, { ledger, passthrough: true });
    const text = r.out.fullText;
    expect(count(text, WITHIN)).toBe(1);
    expect(text).toContain(`4. ${WITHIN}`);
    expect(text).toContain(MODEL_CLAIM);
    expect(text).not.toContain('Section 5 of the Limitation Act');
    expect(text).not.toContain('with a delay of');
    expect(text).toContain('That the order is illegal and perverse.');
    expect(checklistOf(r)).not.toContain(S5_ITEM);
    expect(checklistOf(r)).not.toContain(UNKNOWN_ITEM);
    expect(eventsOf(r.sse, 'checklist')[0].items).not.toContain(S5_ITEM);
    expect(limitationWarnings(r.sse)).toHaveLength(1);
  });

  it('the static "Condonation ... 90 days" item is gone in both cases; the s.5 line is only on the delay path', async () => {
    const late = await runBrief({ ...BASE, ...dates(LATE) }, { ledger });
    const ok = await runBrief({ ...BASE, ...dates(IN_TIME) }, { ledger });
    expect(checklistOf(ok)).not.toContain(STATIC_ITEM);
    expect(checklistOf(late)).not.toContain(STATIC_ITEM);
    expect(checklistOf(ok)).not.toContain(S5_ITEM);
    expect(checklistOf(ok)).not.toContain(UNKNOWN_ITEM);
    expect(checklistOf(late)).toEqual([...checklistOf(ok), S5_ITEM]);
    expect(checklistOf(ok)).toContain('Disclaimer slip — Lawie drafting assistance acknowledged');
  });

  // (The R3/R4 sentences with section numbers are pinned on every path in
  // t472-limitation-grounds-survive; here the fact verifier is the real one, so
  // sentences with no section number or period are used.)
  it.each([
    'The application is within time.',
    "The petitioner has approached this Hon'ble Court within the period of limitation.",
    'This revision against the order taking cognizance is within limitation.',
  ])(
    'model claim "%s" in a real run survives byte for byte, is flagged, and the computed paragraph is para 4',
    async (claim) => {
      const body = `1. That the petitioner is a resident of Patna.\n\n2. ${claim}\n\n3. That the order is illegal.`;
      const r = await runBrief({ ...BASE, ...dates(LATE) }, { ledger, body, passthrough: true });
      expect(r.out.fullText).toContain(`2. ${claim}`);
      expect(r.out.fullText).toContain(`3. That the order is illegal.`);
      expect(r.out.fullText).toContain(`4. ${BEYOND_41}`);
      expect(count(r.out.fullText, BEYOND_41)).toBe(1);
      const w = limitationWarnings(r.sse);
      expect(w).toHaveLength(1);
      expect(w[0].details.expected).toBe(claim);
      expect(w[0].message).toBe(FLAG(4));
    },
  );

  it.each([
    'Cognizance was taken beyond the period of limitation.',
    'The complaint was filed beyond the period of limitation.',
  ])('plain ground "%s" in a real run stays untouched and is not flagged', async (ground) => {
    const body = `1. That the petitioner is a resident of Patna.\n\n2. ${ground}\n\n3. That the order is illegal.`;
    const r = await runBrief({ ...BASE, ...dates(LATE) }, { ledger, body });
    expect(r.out.fullText).toContain(`2. ${ground}`);
    expect(r.out.fullText).toContain(`3. That the order is illegal.`);
    expect(r.out.fullText).toContain(`4. ${BEYOND_41}`);
    expect(count(r.out.fullText, BEYOND_41)).toBe(1);
    expect(limitationWarnings(r.sse)).toEqual([]);
    expect(r.out.limitationFlags).toBe(0);
  });

  it('unknown filing date: the signed blank, no number, no s.5 item', async () => {
    const r = await runBrief({ ...BASE, ...dates(null) }, { ledger });
    const text = r.out.fullText;
    expect(count(text, UNKNOWN)).toBe(1);
    expect(text).not.toContain(WITHIN);
    expect(text).not.toContain('with a delay of');
    expect(text).not.toMatch(/\d+ days? /);
    expect(checklistOf(r)).not.toContain(S5_ITEM);
    expect(checklistOf(r)).toContain(UNKNOWN_ITEM);
    expect(checklistOf(r).filter((i) => i === UNKNOWN_ITEM)).toHaveLength(1);
  });

  it('unknown order date: the blank', async () => {
    const r = await runBrief(
      { ...BASE, filing_date: LATE, certified_copy_applied_for: 'No' },
      { ledger },
    );
    expect(count(r.out.fullText, UNKNOWN)).toBe(1);
    expect(checklistOf(r)).not.toContain(S5_ITEM);
    expect(checklistOf(r)).toContain(UNKNOWN_ITEM);
    expect(checklistOf(r).filter((i) => i === UNKNOWN_ITEM)).toHaveLength(1);
  });

  it('"Yes", applied but no ready date: the blank, nothing computed', async () => {
    const r = await runBrief(
      {
        ...BASE,
        ...dates(LATE, { certified_copy_applied_for: 'Yes', certified_copy_applied: '2026-01-02' }),
      },
      { ledger },
    );
    expect(count(r.out.fullText, UNKNOWN)).toBe(1);
    expect(r.out.fullText).not.toContain('with a delay of');
    expect(r.out.fullText).not.toContain(WITHIN);
    expect(checklistOf(r)).not.toContain(S5_ITEM);
    expect(checklistOf(r)).toContain(UNKNOWN_ITEM);
    expect(checklistOf(r).filter((i) => i === UNKNOWN_ITEM)).toHaveLength(1);
  });

  it('"Yes", applied and a received date but no ready date: still the blank (no fallback to received)', async () => {
    const r = await runBrief(
      {
        ...BASE,
        ...dates(LATE, {
          certified_copy_applied_for: 'Yes',
          certified_copy_applied: '2026-01-02',
          certified_copy_received: '2026-02-15',
        }),
      },
      { ledger },
    );
    expect(count(r.out.fullText, UNKNOWN)).toBe(1);
    expect(r.out.fullText).not.toContain(WITHIN);
    expect(r.out.fullText).not.toContain('with a delay of');
    expect(checklistOf(r)).not.toContain(S5_ITEM);
    expect(checklistOf(r)).toContain(UNKNOWN_ITEM);
    expect(checklistOf(r).filter((i) => i === UNKNOWN_ITEM)).toHaveLength(1);
  });

  it('"Yes" with neither copy date: the blank', async () => {
    const r = await runBrief(
      { ...BASE, ...dates(LATE, { certified_copy_applied_for: 'Yes' }) },
      { ledger },
    );
    expect(count(r.out.fullText, UNKNOWN)).toBe(1);
    expect(checklistOf(r)).not.toContain(S5_ITEM);
    expect(checklistOf(r)).toContain(UNKNOWN_ITEM);
    expect(checklistOf(r).filter((i) => i === UNKNOWN_ITEM)).toHaveLength(1);
  });

  it('the copy question not answered: the blank, even with both copy dates given', async () => {
    const r = await runBrief(
      {
        ...BASE,
        ...dates(LATE, { ...YES_ENOUGH, certified_copy_applied_for: '' }),
      },
      { ledger },
    );
    expect(count(r.out.fullText, UNKNOWN)).toBe(1);
    expect(r.out.fullText).not.toContain(WITHIN);
    expect(r.out.fullText).not.toContain('with a delay of');
    expect(checklistOf(r)).not.toContain(S5_ITEM);
    expect(checklistOf(r)).toContain(UNKNOWN_ITEM);
    expect(checklistOf(r).filter((i) => i === UNKNOWN_ITEM)).toHaveLength(1);
  });

  it('the copy question answered "Not known": the blank, no number', async () => {
    const r = await runBrief(
      { ...BASE, ...dates(LATE, { certified_copy_applied_for: 'Not known' }) },
      { ledger },
    );
    expect(count(r.out.fullText, UNKNOWN)).toBe(1);
    expect(r.out.fullText).not.toMatch(/\d+ days? /);
    expect(checklistOf(r)).not.toContain(S5_ITEM);
    expect(checklistOf(r)).toContain(UNKNOWN_ITEM);
    expect(checklistOf(r).filter((i) => i === UNKNOWN_ITEM)).toHaveLength(1);
  });

  it('"No": nothing is excluded, even if copy dates are also given (41 days)', async () => {
    const r = await runBrief(
      {
        ...BASE,
        ...dates(LATE, {
          certified_copy_applied_for: 'No',
          certified_copy_applied: '2026-01-02',
          certified_copy_ready: '2026-02-15',
        }),
      },
      { ledger },
    );
    expect(count(r.out.fullText, BEYOND_41)).toBe(1);
    expect(checklistOf(r)).toContain(S5_ITEM);
  });

  it('the copy time (s.12(2)) is used: "Yes", applied 01-02, ready 02-15 (45 days excluded) gives the within sentence', async () => {
    const r = await runBrief({ ...BASE, ...dates(LATE, YES_ENOUGH) }, { ledger });
    expect(count(r.out.fullText, WITHIN)).toBe(1);
    expect(r.out.fullText).not.toContain('with a delay of');
    expect(checklistOf(r)).not.toContain(S5_ITEM);
  });

  it('"Yes", applied 01-05, ready 02-20: 47 excluded, 84 counted, within', async () => {
    const values = {
      ...BASE,
      ...dates(LATE, {
        certified_copy_applied_for: 'Yes',
        certified_copy_applied: '2026-01-05',
        certified_copy_ready: '2026-02-20',
      }),
    };
    const r = await runBrief(values, { ledger });
    expect(count(r.out.fullText, WITHIN)).toBe(1);
    expect(checklistOf(r)).not.toContain(S5_ITEM);
  });

  it('the copy time reduces the delay: 100 days counted gives "10 days"', async () => {
    const r = await runBrief(
      {
        ...BASE,
        ...dates(LATE, {
          certified_copy_applied_for: 'Yes',
          certified_copy_applied: '2026-01-05',
          certified_copy_ready: '2026-02-04',
        }),
      },
      { ledger },
    );
    expect(r.out.fullText).toContain('with a delay of 10 days.');
    expect(checklistOf(r)).toContain(S5_ITEM);
  });

  it('a draft with no limitation sentence from the model still gets the computed paragraph, last', async () => {
    const body =
      '1. That the petitioner Ramesh Kumar is a resident of Patna.\n\n2. That the order is illegal.';
    const r = await runBrief({ ...BASE, ...dates(LATE) }, { ledger, body });
    expect(count(r.out.fullText, BEYOND_41)).toBe(1);
    expect(r.out.fullText).toContain(`3. ${BEYOND_41}`);
  });

  it('the Drafter is given the signed prompt line verbatim, and no longer a "LIMITATION: write ... exactly this text" line', async () => {
    await runBrief({ ...BASE, ...dates(LATE) }, { ledger });
    const calls = mockMessagesStream.mock.calls.map((c) => JSON.stringify(c[0])).join('\n');
    expect(calls).toContain(JSON.stringify(PROMPT_LINE).slice(1, -1));
    expect(calls).not.toContain('LIMITATION: write the limitation paragraph as exactly this text');
  });

  it('the clause report need not list limitation_paragraph: the system section covers it (nothing missing, no repair call)', async () => {
    const pack = loadRulePack(PACK_ID)!;
    const report = pack.mandatoryClauses
      .filter((c) => c.id !== 'limitation_paragraph')
      .map((c) => `${c.id}: 1`)
      .join('\n');
    const custom = `${modelBody()}\n\n${CLAUSES_MARKER}\n${report}`;
    const values = { ...BASE, ...dates(LATE) };
    const brief = buildBrief({
      kind: { id: pack.id, name: pack.name, court_document: true },
      checklist: buildChecklist(pack),
      values: Object.entries(values).map(([k, v]) => ({
        key: k,
        value: v,
        source: 'user' as const,
      })),
    });
    mockMessagesStream.mockReset().mockImplementation(async () => sdkAnswer(custom, 4000, 800));
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
          ? {
              ledger: { facts: factsOf(values), unresolved: [], lists: loadAvermentLists(PACK_ID) },
            }
          : {}),
      } as unknown as Parameters<typeof streamGenerateFromBrief>[0],
      resStub() as unknown as Response,
    );
    expect(out.missingClauses.map((m) => m.id)).not.toContain('limitation_paragraph');
    expect(out.missingClauses).toEqual([]);
  });

  it('no limitation_compliance question is in the brief', async () => {
    const r = await runBrief({ ...BASE, ...dates(LATE) }, { ledger });
    const calls = mockMessagesStream.mock.calls.map((c) => JSON.stringify(c[0])).join('\n');
    expect(calls).not.toContain('limitation_compliance');
    expect(r.out.fullText).not.toContain('limitation_compliance');
  });
});

describe('T-472 B: the ledger carries the computed fact', () => {
  /** The facts the fact verifier was given for the draft (verifyAndRepair's input). */
  async function factsSeen(values: Record<string, string>, unresolved: string[] = []) {
    const spy = jest.spyOn(factVerifier, 'verifyAndRepair');
    try {
      await runBrief({ ...BASE, ...values }, { ledger: true, unresolved });
      return spy.mock.calls.flatMap((c) => [...c[0].facts]) as LedgerFact[];
    } finally {
      spy.mockRestore();
    }
  }
  const limitationFacts = (facts: LedgerFact[]) => facts.filter((f) => f.key === 'limitation');

  it('beyond: the verifier is given one limitation fact, source computed, value beyond:131, display the signed text', async () => {
    const seen = limitationFacts(await factsSeen(dates(LATE)));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      source: 'computed',
      value: 'beyond:131',
      display: BEYOND_41,
      required_in_draft: false,
    });
  });

  it('"Yes" 01-05 to 02-20: value within:84 (47 days excluded)', async () => {
    const seen = limitationFacts(
      await factsSeen(
        dates(LATE, {
          certified_copy_applied_for: 'Yes',
          certified_copy_applied: '2026-01-05',
          certified_copy_ready: '2026-02-20',
        }),
      ),
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ source: 'computed', value: 'within:84', display: WITHIN });
  });

  it('copy question not answered, or "Yes" without a ready date: no limitation fact', async () => {
    expect(
      limitationFacts(await factsSeen(dates(LATE, { certified_copy_applied_for: '' }))),
    ).toEqual([]);
    expect(
      limitationFacts(
        await factsSeen(
          dates(LATE, { certified_copy_applied_for: 'Yes', certified_copy_applied: '2026-01-02' }),
        ),
      ),
    ).toEqual([]);
  });

  it('within: value within:73, display the within sentence', async () => {
    const seen = limitationFacts(await factsSeen(dates(IN_TIME)));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ source: 'computed', value: 'within:73', display: WITHIN });
  });

  it('a stored fact under the limitation key is dropped; the computed one is the only one the verifier holds', async () => {
    const spy = jest.spyOn(factVerifier, 'verifyAndRepair');
    try {
      const values = { ...BASE, ...dates(LATE), limitation: 'Within limitation, no condonation' };
      await runBrief(values, { ledger: true });
      const seen = limitationFacts(spy.mock.calls.flatMap((c) => [...c[0].facts]) as LedgerFact[]);
      expect(seen).toHaveLength(1);
      expect(seen[0].source).toBe('computed');
    } finally {
      spy.mockRestore();
    }
  });

  it('unknown: no limitation fact at all', async () => {
    expect(limitationFacts(await factsSeen(dates(null)))).toEqual([]);
  });

  it('a date the ledger holds as unresolved is unknown: no fact, the blank, even if the brief holds a value', async () => {
    const seen = limitationFacts(await factsSeen(dates(LATE), ['filing_date']));
    expect(seen).toEqual([]);
    const r = await runBrief(
      { ...BASE, ...dates(LATE) },
      { ledger: true, unresolved: ['filing_date'] },
    );
    expect(count(r.out.fullText, UNKNOWN)).toBe(1);
    expect(r.out.fullText).not.toContain('with a delay of');
    expect(checklistOf(r)).not.toContain(S5_ITEM);
    expect(checklistOf(r)).toContain(UNKNOWN_ITEM);
    expect(checklistOf(r).filter((i) => i === UNKNOWN_ITEM)).toHaveLength(1);
  });
});

describe('T-472 other packs are unaffected', () => {
  it('a pack with no rule gets no limitation text, no s.5 item, and its draft is not touched', async () => {
    const pack = loadRulePack('bail_regular')!;
    const brief = buildBrief({
      kind: { id: pack.id, name: pack.name, court_document: true },
      checklist: buildChecklist(pack),
      values: [{ key: 'applicant_name', value: 'Ram Kumar', source: 'user' }],
    });
    const body = '1. That the applicant is in custody. The application is within limitation.';
    const report = pack.mandatoryClauses.map((c) => `${c.id}: 1`).join('\n');
    mockMessagesStream
      .mockReset()
      .mockImplementation(async () =>
        sdkAnswer(`${body}\n\n${CLAUSES_MARKER}\n${report}`, 4000, 800),
      );
    const out = await streamGenerateFromBrief(
      {
        pack,
        templateConfig: loadTemplateConfig('bail_regular')!,
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
      } as unknown as Parameters<typeof streamGenerateFromBrief>[0],
      resStub() as unknown as Response,
    );
    expect(out.fullText).toContain('The application is within limitation.');
    expect(out.fullText).not.toContain('Section 5 of the Limitation Act');
    expect(out.filingChecklist).not.toContain(S5_ITEM);
    expect(out.filingChecklist).not.toContain(UNKNOWN_ITEM);
    // no rule, no flags: the field is absent and no limitation warning is raised
    expect('limitationFlags' in out).toBe(false);
    expect(out.warnings.filter((w) => w.type === 'limitation')).toEqual([]);
  });
});

// ── C: the template (form) path ─────────────────────────────────────────────

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

async function runForm(form: Record<string, unknown>, answer: string) {
  const base = loadTemplateConfig(PACK_ID)!;
  mockMessagesStream.mockReset().mockImplementation(async () => sdkAnswer(answer, 4000, 800));
  const res = resStub();
  const out = await streamGenerateFromTemplate(
    {
      templateConfig: {
        ...base,
        validation_rules: { ...base.validation_rules, auto_convert_old_to_new: false },
      },
      formData: { ...FORM_BASE, ...form },
      userId: 'u1',
      runId: 'r1',
      runSequence: 1,
      runType: 'initial',
    } as unknown as Parameters<typeof streamGenerateFromTemplate>[0],
    res as unknown as Response,
  );
  return { out, sse: res.written() };
}

const FORM_ANSWER = `1. That the petitioner is a resident of Patna.\n\n2. That the impugned order was passed on 01.01.2026. ${MODEL_CLAIM}\n\n3. That the order is illegal.`;

describe('T-472 C: the template (form) path', () => {
  it('131 days: the delay paragraph with "41 days" once (para 4), the model sentence kept and flagged, s.5 item on the checklist', async () => {
    const r = await runForm({ filing_date: LATE }, FORM_ANSWER);
    expect(count(r.out.fullText, BEYOND_41)).toBe(1);
    expect(r.out.fullText).toContain(`4. ${BEYOND_41}`);
    expect(r.out.fullText).toContain(MODEL_CLAIM);
    expect(r.out.bodyParaCount).toBe(4);
    expect(r.out.fullText).toMatch(/paragraphs 1 to 4\b/);
    const w = limitationWarnings(r.sse);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({
      type: 'limitation',
      message: FLAG(4),
      details: { rule: 'limitation_claim', expected: MODEL_CLAIM },
    });
    expect(r.out.limitationFlags).toBe(1);
    expect(r.out.filingChecklist).toContain(S5_ITEM);
    expect(eventsOf(r.sse, 'checklist')[0].items).toContain(S5_ITEM);
  });

  it('within the period: the signed within sentence once, no s.5 item', async () => {
    const r = await runForm({ filing_date: IN_TIME }, FORM_ANSWER);
    expect(count(r.out.fullText, WITHIN)).toBe(1);
    expect(r.out.fullText).toContain(MODEL_CLAIM);
    expect(r.out.fullText).not.toContain('with a delay of');
    expect(r.out.filingChecklist).not.toContain(S5_ITEM);
    expect(r.out.filingChecklist).not.toContain(UNKNOWN_ITEM);
    expect(r.out.filingChecklist).not.toContain(STATIC_ITEM);
  });

  it.each([
    'This petition is filed within limitation, and cognizance was barred under Section 468 CrPC.',
    'The petition is within limitation as Section 473 CrPC does not apply.',
  ])(
    'form path: model claim "%s" survives byte for byte and is flagged (para 4)',
    async (claim) => {
      const answer = `1. That the petitioner is a resident of Patna.\n\n2. ${claim}\n\n3. That the order is illegal.`;
      const r = await runForm({ filing_date: LATE }, answer);
      expect(r.out.fullText).toContain(`<p style="text-align:left">2. ${claim}</p>`);
      expect(count(r.out.fullText, BEYOND_41)).toBe(1);
      expect(r.out.fullText).toContain(`4. ${BEYOND_41}`);
      const w = limitationWarnings(r.sse);
      expect(w.map((x) => x.details.expected)).toEqual([claim]);
      expect(w[0].message).toBe(FLAG(4));
    },
  );

  it.each([
    'The cognizance taken is barred by limitation under Section 468 CrPC.',
    'Section 473 CrPC does not save the prosecution.',
  ])('form path: plain ground "%s" is untouched', async (ground) => {
    const answer = `1. That the petitioner is a resident of Patna.\n\n2. ${ground}\n\n3. That the order is illegal.`;
    const r = await runForm({ filing_date: LATE }, answer);
    expect(r.out.fullText).toContain(ground);
    expect(count(r.out.fullText, BEYOND_41)).toBe(1);
    expect(limitationWarnings(r.sse)).toEqual([]);
    expect(r.out.limitationFlags).toBe(0);
  });

  it('unknown filing date: the blank, no number, no s.5 item', async () => {
    const r = await runForm({}, FORM_ANSWER);
    expect(count(r.out.fullText, UNKNOWN)).toBe(1);
    expect(r.out.fullText).not.toContain('with a delay of');
    expect(r.out.filingChecklist).not.toContain(S5_ITEM);
    expect(r.out.filingChecklist).toContain(UNKNOWN_ITEM);
    expect(r.out.filingChecklist.filter((i) => i === UNKNOWN_ITEM)).toHaveLength(1);
  });

  it('"Yes" with the copy dates from the form: applied 01-02, ready 02-15 gives within', async () => {
    const r = await runForm(
      {
        filing_date: LATE,
        certified_copy_applied_for: true,
        certified_copy_applied: '2026-01-02',
        certified_copy_ready: '2026-02-15',
      },
      FORM_ANSWER,
    );
    expect(count(r.out.fullText, WITHIN)).toBe(1);
    expect(r.out.filingChecklist).not.toContain(S5_ITEM);
  });

  it('"Yes", applied 01-05, ready 02-20 (47 excluded, 84 counted) gives within', async () => {
    const r = await runForm(
      {
        filing_date: LATE,
        certified_copy_applied_for: 'Yes',
        certified_copy_applied: '2026-01-05',
        certified_copy_ready: '2026-02-20',
      },
      FORM_ANSWER,
    );
    expect(count(r.out.fullText, WITHIN)).toBe(1);
  });

  it('"No" (boolean false): nothing excluded, 41 days, even with copy dates also sent', async () => {
    const r = await runForm(
      {
        filing_date: LATE,
        certified_copy_applied_for: false,
        certified_copy_applied: '2026-01-02',
        certified_copy_ready: '2026-02-15',
      },
      FORM_ANSWER,
    );
    expect(count(r.out.fullText, BEYOND_41)).toBe(1);
    expect(r.out.filingChecklist).toContain(S5_ITEM);
  });

  it('the copy question not answered: the blank, even with both copy dates', async () => {
    const r = await runForm(
      {
        filing_date: LATE,
        certified_copy_applied_for: undefined,
        certified_copy_applied: '2026-01-02',
        certified_copy_ready: '2026-02-15',
      },
      FORM_ANSWER,
    );
    expect(count(r.out.fullText, UNKNOWN)).toBe(1);
    expect(r.out.fullText).not.toContain(WITHIN);
    expect(r.out.filingChecklist).not.toContain(S5_ITEM);
    expect(r.out.filingChecklist).toContain(UNKNOWN_ITEM);
    expect(r.out.filingChecklist.filter((i) => i === UNKNOWN_ITEM)).toHaveLength(1);
  });

  it('"Not known": the blank', async () => {
    const r = await runForm(
      { filing_date: LATE, certified_copy_applied_for: 'Not known' },
      FORM_ANSWER,
    );
    expect(count(r.out.fullText, UNKNOWN)).toBe(1);
    expect(r.out.filingChecklist).not.toContain(S5_ITEM);
    expect(r.out.filingChecklist).toContain(UNKNOWN_ITEM);
    expect(r.out.filingChecklist.filter((i) => i === UNKNOWN_ITEM)).toHaveLength(1);
  });

  it('"Yes" without a ready date: the blank', async () => {
    const r = await runForm(
      { filing_date: LATE, certified_copy_applied_for: true, certified_copy_applied: '2026-01-02' },
      FORM_ANSWER,
    );
    expect(count(r.out.fullText, UNKNOWN)).toBe(1);
    expect(r.out.filingChecklist).not.toContain(S5_ITEM);
    expect(r.out.filingChecklist).toContain(UNKNOWN_ITEM);
    expect(r.out.filingChecklist.filter((i) => i === UNKNOWN_ITEM)).toHaveLength(1);
  });

  it('"Yes", applied and received only (no ready date): the blank, received is not a fallback', async () => {
    const r = await runForm(
      {
        filing_date: LATE,
        certified_copy_applied_for: true,
        certified_copy_applied: '2026-01-02',
        certified_copy_received: '2026-02-15',
      },
      FORM_ANSWER,
    );
    expect(count(r.out.fullText, UNKNOWN)).toBe(1);
    expect(r.out.fullText).not.toContain(WITHIN);
    expect(r.out.filingChecklist).not.toContain(S5_ITEM);
    expect(r.out.filingChecklist).toContain(UNKNOWN_ITEM);
    expect(r.out.filingChecklist.filter((i) => i === UNKNOWN_ITEM)).toHaveLength(1);
  });

  it('two AI sections: neither is edited; one computed paragraph; a warning for the claim in the second', async () => {
    const base = loadTemplateConfig(PACK_ID)!;
    const sections = base.document_structure.sections;
    const bodyAt = sections.findIndex((x) => x.type === 'ai_generated');
    const second = { ...sections[bodyAt], section_id: 'body_two' };
    const twoSections = [...sections.slice(0, bodyAt + 1), second, ...sections.slice(bodyAt + 1)];
    const answers = [
      '1. That the petitioner is a resident of Patna.\n\n2. That the order is illegal.',
      '3. The petition is within the period of limitation.\n\n4. No condonation is required.\n\n5. That the grounds are made out.',
    ];
    let call = 0;
    mockMessagesStream
      .mockReset()
      .mockImplementation(async () => sdkAnswer(answers[call++] ?? answers[1], 4000, 800));
    const res = resStub();
    const out = await streamGenerateFromTemplate(
      {
        templateConfig: {
          ...base,
          document_structure: { ...base.document_structure, sections: twoSections },
          validation_rules: { ...base.validation_rules, auto_convert_old_to_new: false },
        },
        formData: { ...FORM_BASE, filing_date: LATE },
        userId: 'u1',
        runId: 'r1',
        runSequence: 1,
        runType: 'initial',
      } as unknown as Parameters<typeof streamGenerateFromTemplate>[0],
      res as unknown as Response,
    );
    expect(call).toBe(2);
    for (const line of [
      '2. That the order is illegal.',
      '3. The petition is within the period of limitation.',
      '4. No condonation is required.',
      '5. That the grounds are made out.',
    ])
      expect(out.fullText).toContain(line);
    expect(count(out.fullText, BEYOND_41)).toBe(1);
    const expected = limitationWarnings(res.written()).map((w) => w.details.expected);
    expect(expected).toEqual([
      'The petition is within the period of limitation.',
      'No condonation is required.',
    ]);
  });

  it('a stale limitation_compliance value sent by an old client decides nothing', async () => {
    const r = await runForm(
      { filing_date: LATE, limitation_compliance: 'Yes, within limitation' },
      FORM_ANSWER,
    );
    expect(count(r.out.fullText, BEYOND_41)).toBe(1);
    // the stale value decides nothing; the model's sentence is neither used nor edited
    expect(r.out.fullText).toContain(MODEL_CLAIM);
    expect(r.out.fullText).not.toContain(WITHIN);
  });

  it('another pack on the form path gets nothing added', async () => {
    const base = loadTemplateConfig('bail_regular')!;
    mockMessagesStream
      .mockReset()
      .mockImplementation(async () =>
        sdkAnswer(
          '1. That the applicant is in custody. The application is within limitation.',
          10,
          5,
        ),
      );
    const out = await streamGenerateFromTemplate(
      {
        templateConfig: {
          ...base,
          validation_rules: { ...base.validation_rules, auto_convert_old_to_new: false },
        },
        formData: { applicant_name: 'Ram Kumar' },
        userId: 'u1',
        runId: 'r1',
        runSequence: 1,
        runType: 'initial',
      } as unknown as Parameters<typeof streamGenerateFromTemplate>[0],
      resStub() as unknown as Response,
    );
    expect(out.fullText).not.toContain('Section 5 of the Limitation Act');
    expect(out.filingChecklist).not.toContain(S5_ITEM);
    expect(out.filingChecklist).not.toContain(UNKNOWN_ITEM);
    expect('limitationFlags' in out).toBe(false);
    expect(out.fullText).toContain('The application is within limitation.');
  });
});

// ── D: the pack JSON ────────────────────────────────────────────────────────

type Field = { id: string; label: string; type: string; required?: boolean };
const RULES = join(__dirname, '..', 'config', 'document-rules', 'criminal_revision.json');
const raw = JSON.parse(readFileSync(RULES, 'utf8')) as {
  form_schema: { fields: Field[] };
  validation_rules: string[];
  filing_checklist: string[];
  prompt_context: { promptInstructions: string[] };
};

describe('T-472 D: criminal_revision.json', () => {
  const fields = raw.form_schema.fields;
  const byId = (id: string) => fields.find((f) => f.id === id);

  it('limitation_compliance is gone: no field, no validation rule, no mention anywhere in the file', () => {
    expect(byId('limitation_compliance')).toBeUndefined();
    expect(raw.validation_rules.some((r) => r.includes('limitation_compliance'))).toBe(false);
    expect(readFileSync(RULES, 'utf8')).not.toContain('limitation_compliance');
  });

  it('AJ-472-M2: the limitation line is exactly once, with no paragraph number, and is not a Para line', () => {
    const lines = raw.prompt_context.promptInstructions;
    const M2 =
      'Limitation — Lawie adds this as the last numbered paragraph, from the dates given. Do not write it, and do not leave a gap in your numbering for it.';
    expect(lines.filter((l) => l === M2)).toHaveLength(1);
    expect(M2.startsWith('Para')).toBe(false);
    expect(lines.filter((l) => /^Limitation —/.test(l))).toEqual([M2]);
    expect(lines.join('\n')).not.toContain('Art. 131');
    expect(lines.join('\n')).not.toContain('prints this paragraph');
    // neighbours unchanged
    const at = lines.indexOf(M2);
    expect(lines[at - 1].startsWith('Para 4:')).toBe(true);
  });

  it('the signed Drafter line is in promptInstructions verbatim, exactly once, right after the limitation line', () => {
    const lines = raw.prompt_context.promptInstructions;
    expect(lines.filter((l) => l === PROMPT_LINE)).toHaveLength(1);
    const at = lines.indexOf(PROMPT_LINE);
    expect(lines[at - 1].startsWith('Limitation — Lawie adds this')).toBe(true);
    expect(lines[at + 1].startsWith('Para 5:')).toBe(true);
  });

  it('the Para N guide lines are consecutive from Para 1 to Para 14, no gap, no repeat, none beyond', () => {
    const lines = raw.prompt_context.promptInstructions;
    const nums = lines
      .map((l) => /^Para (\d+):/.exec(l))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => Number(m[1]));
    expect(nums).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(lines.some((l) => l.startsWith('Para 15:'))).toBe(false);
    const M2 = lines.find((l) => /^Limitation — Lawie adds this/.test(l))!;
    const at = lines.indexOf(M2);
    expect(lines[at - 1].startsWith('Para 4:')).toBe(true);
    expect(
      lines
        .slice(at + 1)
        .find((l) => l.startsWith('Para '))!
        .startsWith('Para 5:'),
    ).toBe(true);
    expect(/\d/.test(M2)).toBe(false);
  });

  it('limitation_paragraph description is the new wording', () => {
    const clause = (raw as unknown as { mandatory_clauses: { id: string; description?: string }[] })
      .mandatory_clauses;
    const f = byId('limitation_paragraph') ?? clause.find((c) => c.id === 'limitation_paragraph');
    expect(f).toBeDefined();
    expect((f as { description?: string }).description).toBe(
      'Limitation (printed by Lawie from the dates given)',
    );
  });

  it('filing checklist: no "Condonation ... 90 days" item, Disclaimer slip stays', () => {
    expect(raw.filing_checklist).not.toContain(STATIC_ITEM);
    expect(raw.filing_checklist.some((i) => /condonation/i.test(i))).toBe(false);
    expect(raw.filing_checklist).toContain(
      'Disclaimer slip — Lawie drafting assistance acknowledged',
    );
  });

  it('TIME-BAR CHECK rule has the new text', () => {
    const rule = raw.validation_rules.filter((r) => r.startsWith('TIME-BAR CHECK'));
    expect(rule).toEqual([
      'TIME-BAR CHECK: Lawie computes limitation from the dates given (impugned_order_date, filing_date, certified copy dates)',
    ]);
  });

  it('there is no yes/no field about limitation (text, boolean or select)', () => {
    const limitationFields = fields.filter((f) => /limitation/i.test(f.id + ' ' + f.label));
    for (const f of limitationFields) expect(f.type).toBe('date');
  });

  it('certified_copy_applied_for is a required boolean question about the copy', () => {
    const f = byId('certified_copy_applied_for');
    expect(f).toBeDefined();
    expect(f!.type).toBe('boolean');
    expect(f!.required).toBe(true);
    expect(f!.label).toBe('Was a certified copy of the impugned order applied for?');
  });

  it('certified_copy_received is gone: no field, no mention anywhere in the file', () => {
    expect(byId('certified_copy_received')).toBeUndefined();
    expect(readFileSync(RULES, 'utf8')).not.toContain('certified_copy_received');
  });

  it('filing_date is a required date; the two copy dates are optional dates', () => {
    expect(byId('filing_date')).toMatchObject({ type: 'date', required: true });
    expect(byId('certified_copy_applied')).toMatchObject({ type: 'date', required: false });
    expect(byId('certified_copy_ready')).toMatchObject({ type: 'date', required: false });
    for (const id of ['filing_date', 'certified_copy_applied', 'certified_copy_ready']) {
      expect(byId(id)!.label.length).toBeGreaterThan(0);
    }
  });

  it('no limitation yes/no field remains: the only boolean about limitation is the copy question', () => {
    const booleans = fields.filter((f) => f.type === 'boolean').map((f) => f.id);
    expect(booleans).toContain('certified_copy_applied_for');
    expect(booleans).not.toContain('limitation_compliance');
  });

  it('impugned_order_date is still a required date', () => {
    expect(byId('impugned_order_date')).toMatchObject({ type: 'date', required: true });
  });

  it('field ids stay unique', () => {
    const ids = fields.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the loaded template config carries the same fields', () => {
    const cfg = loadTemplateConfig(PACK_ID)!;
    const loaded = cfg.form_schema.steps.flatMap((s) => s.fields);
    const ids = loaded.map((f) => f.field_id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'filing_date',
        'certified_copy_applied_for',
        'certified_copy_applied',
        'certified_copy_ready',
      ]),
    );
    expect(ids).not.toContain('certified_copy_received');
    expect(loaded.find((f) => f.field_id === 'filing_date')).toMatchObject({ type: 'date' });
    // (the loader presents a boolean as a checkbox group; the pack JSON test above pins `boolean`)
    expect(loaded.find((f) => f.field_id === 'certified_copy_applied_for')).toBeDefined();
    expect(ids).not.toContain('limitation_compliance');
  });
});

// ── N: numbering, and the Drafter's clause report ───────────────────────────

describe('T-472 N: numbering with the model text left alone', () => {
  describe.each([
    ['the brief path, no ledger', false],
    ['the brief path, with a ledger', true],
  ])('%s', (_name, ledger) => {
    const BODY5 = [
      '1. That the petitioner Ramesh Kumar is a resident of Patna.',
      '2. The petition is within the period of limitation.',
      '3. No condonation is required.',
      '4. That the order is illegal and perverse.',
      '5. That the grounds are made out.',
    ].join('\n\n');

    it('no paragraph is dropped or renumbered; the computed paragraph is the next number (6), bodyParaCount 6, verification "1 to 6"', async () => {
      const r = await runBrief(
        { ...BASE, ...dates(LATE) },
        { ledger, body: BODY5, passthrough: true },
      );
      const text = r.out.fullText;
      for (const line of [
        '2. The petition is within the period of limitation.',
        '3. No condonation is required.',
        '4. That the order is illegal and perverse.',
        '5. That the grounds are made out.',
      ])
        expect(text).toContain(line);
      expect(text).toContain(`6. ${BEYOND_41}`);
      expect(count(text, BEYOND_41)).toBe(1);
      expect(r.out.bodyParaCount).toBe(6);
      expect(text).toMatch(/paragraphs 1 to 6\b/);
      // both model statements are flagged, naming para 6
      const w = limitationWarnings(r.sse);
      expect(w.map((x) => x.details.expected)).toEqual([
        'The petition is within the period of limitation.',
        'No condonation is required.',
      ]);
      for (const x of w) expect(x.message).toBe(FLAG(6));
    });

    it('a computed paragraph after a body of 3 takes number 4 and is the last numbered paragraph before the prayer', async () => {
      const body =
        '1. That the petitioner is a resident of Patna.\n\n2. That the order is illegal.\n\n3. Prayer follows.';
      const r = await runBrief({ ...BASE, ...dates(LATE) }, { ledger, body });
      expect(r.out.fullText).toContain(`4. ${BEYOND_41}`);
      expect(r.out.fullText).not.toMatch(/\b5\. /);
      expect(count(r.out.fullText, BEYOND_41)).toBe(1);
      expect(r.out.bodyParaCount).toBe(4);
    });

    it('the unknown blank is numbered too (4), once', async () => {
      const body =
        '1. That the petitioner is a resident of Patna.\n\n2. That the order is illegal.\n\n3. Prayer follows.';
      const r = await runBrief({ ...BASE, ...dates(null) }, { ledger, body });
      expect(r.out.fullText).toContain(`4. ${UNKNOWN}`);
      expect(count(r.out.fullText, UNKNOWN)).toBe(1);
    });

    it("the Drafter's clause report is read on the model's own numbers: a clause reported on paragraph 5 is found (nothing missing)", async () => {
      const pack = loadRulePack(PACK_ID)!;
      const report = pack.mandatoryClauses
        .map((c) => `${c.id}: ${c.id === 'grounds_paragraph' ? 5 : 1}`)
        .join('\n');
      const custom = `${BODY5}\n\n${CLAUSES_MARKER}\n${report}`;
      const values = { ...BASE, ...dates(LATE) };
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
      mockMessagesStream.mockReset().mockImplementation(async () => sdkAnswer(custom, 4000, 800));
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
            ? {
                ledger: {
                  facts: factsOf(values),
                  unresolved: [],
                  lists: loadAvermentLists(PACK_ID),
                },
              }
            : {}),
        } as unknown as Parameters<typeof streamGenerateFromBrief>[0],
        resStub() as unknown as Response,
      );
      expect(out.fullText).toContain('5. That the grounds are made out.');
      expect(out.missingClauses).toEqual([]);
      expect(out.mandatoryClausesComplete).toBe(true);
    });
  });

  it('CLAUSE_TO_PART: the limitation_paragraph clause is covered by the limitation_paragraph system part, and by no other part', () => {
    const pack = loadRulePack(PACK_ID)!;
    const clause = pack.mandatoryClauses.find((c) => c.id === 'limitation_paragraph')!;
    expect(clause).toBeDefined();
    expect(
      coveredBySystemPart(clause, [
        { sectionId: 'limitation_paragraph', label: 'limitation paragraph' },
      ]),
    ).toBe(true);
    expect(coveredBySystemPart(clause, [])).toBe(false);
    expect(coveredBySystemPart(clause, [{ sectionId: 'recitals', label: 'recitals' }])).toBe(false);
    const grounds = pack.mandatoryClauses.find((c) => c.id === 'grounds_paragraph')!;
    expect(
      coveredBySystemPart(grounds, [
        { sectionId: 'limitation_paragraph', label: 'limitation paragraph' },
      ]),
    ).toBe(false);
  });

  it('the premise: a clause reported on paragraph 5 of a 4-paragraph body is missing (so the remap is what keeps it found)', () => {
    const pack = loadRulePack(PACK_ID)!;
    const output = {
      body: '1. A.\n\n2. B.\n\n3. C.\n\n4. D.',
      report: new Map([['grounds_paragraph', { kind: 'paragraphs', numbers: [5] }]]),
    } as unknown as DrafterOutput;
    const missing = findMissingClauses(pack, output, []);
    expect(missing.find((m) => m.id === 'grounds_paragraph')?.reason).toBe('paragraph_not_found');
  });
});

/**
 * T-327 — the brief's own period blank covers default_bail / applicable_window.
 * Rule by Ajay (CLO), 12 Oct 2026: a paragraph covers applicable_window if it
 * holds exactly the period blank this brief gives, read from the brief at check
 * time. Other "[To be confirmed" text does not count.
 *
 * Part A: findMissingClauses with a real default_bail brief, pure.
 * Part B: the real Drafter path, model stubbed; model-call count.
 *
 * The brief's blank is read from the built brief, not retyped, except where a
 * test pins the signed T-251 wording on purpose.
 *
 * No database, no real model call.
 */
import './setupEnv';

import { Response } from 'express';

import { streamGenerateFromBrief } from '../services/ai.service';
import {
  CLAUSES_MARKER,
  findMissingClauses,
  SIGNED_BLANKS,
  splitDrafterOutput,
} from '../services/brief-drafter';
import {
  Brief,
  buildBrief,
  buildChecklist,
  GivenValue,
  isCourtDocument,
} from '../services/intake-brief';
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

const NOT = ['clause_not_in_paragraph'];
// The signed T-251 wording of the period blank (handoff/legal/T-251-default-bail-text-signed.md, instruction 5).
const SIGNED_PERIOD_BLANK = '[To be confirmed: default-bail period that applies]';

type Given = Record<string, string | string[]>;

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

const pack = (id: string): RulePack => loadRulePack(id) as RulePack;

/** The real default_bail brief. `extra` adds user values; period_claimed is left unanswered unless given. */
function realBrief(extra: Given = {}): Brief {
  const p = pack('default_bail');
  const u = (key: string, value: string | string[]): GivenValue => ({ source: 'user', key, value });
  return buildBrief({
    kind: { id: p.id, name: p.name, court_document: isCourtDocument(p.id) },
    checklist: buildChecklist(p),
    values: Object.entries({ ...DB_GIVEN, ...extra }).map(([k, v]) => u(k, v)),
    court: { state: 'bihar', court_type: 'cjm', court: 'bihar_cjm_patna' },
  });
}

/** A real brief whose period_claimed item reads `blank` (unanswered, so the blank is its placeholder). */
function briefWithBlank(blank: string, key = 'period_claimed'): Brief {
  const b = realBrief();
  const item = b.items.find((i) => i.key === key);
  expect(item).toBeDefined();
  item!.placeholder = blank;
  const unk = b.still_unknown.find((u) => u.key === key);
  if (unk) unk.placeholder = blank;
  return b;
}

/** A real brief whose period_claimed item has the user value `value`. */
function briefWithValue(value: string, key = 'period_claimed'): Brief {
  const b = realBrief();
  const item = b.items.find((i) => i.key === key)!;
  item.value = value;
  b.still_unknown = b.still_unknown.filter((u) => u.key !== key);
  return b;
}

/** Only the named clause, reported at paragraph 1, against `text`. Returns the reasons. */
function reasons(packId: string, clauseId: string, text: string, brief?: Brief): string[] {
  const p = pack(packId);
  const only = { ...p, mandatoryClauses: p.mandatoryClauses.filter((c) => c.id === clauseId) };
  expect(only.mandatoryClauses).toHaveLength(1);
  const out = splitDrafterOutput(`1. ${text}\n\n${CLAUSES_MARKER}\n${clauseId}: 1`);
  return findMissingClauses(only, out, [], { brief }).map((m) => m.reason);
}
const window_ = (text: string, brief?: Brief): string[] =>
  reasons('default_bail', 'applicable_window', text, brief);

describe('T-327 the brief used here', () => {
  it('the real unanswered default_bail brief carries the signed T-251 period blank', () => {
    const item = realBrief().items.find((i) => i.key === 'period_claimed');
    expect(item?.placeholder).toBe(SIGNED_PERIOD_BLANK);
  });

  it('that blank is not one of SIGNED_BLANKS for applicable_window (so the new branch is what covers it)', () => {
    expect(SIGNED_BLANKS.default_bail.applicable_window).not.toContain(SIGNED_PERIOD_BLANK);
  });

  it('without a brief the period blank does not cover (nothing to read)', () => {
    expect(window_(SIGNED_PERIOD_BLANK)).toEqual(NOT);
  });
});

// ── Part A ──────────────────────────────────────────────────────────────────

describe("T-327 AC4 (pure): the brief's own blank covers", () => {
  it('the brief blank alone in the paragraph covers', () => {
    const b = realBrief();
    const blank = b.items.find((i) => i.key === 'period_claimed')!.placeholder;
    expect(window_(blank, b)).toEqual([]);
  });

  it('control: text around the blank is recorded by the existing rule (not the new branch)', () => {
    const b = realBrief();
    expect(
      window_(`It is submitted that the period is ${SIGNED_PERIOD_BLANK} as of now.`, b),
    ).toEqual([]);
  });

  it('case, spacing and curly quotes around the blank still match (normalised)', () => {
    const b = realBrief();
    expect(window_(SIGNED_PERIOD_BLANK.toUpperCase(), b)).toEqual([]);
    expect(window_(`  ${SIGNED_PERIOD_BLANK.replace(/ /g, '   ')}  `, b)).toEqual([]);
    expect(window_(`“${SIGNED_PERIOD_BLANK}”`, b)).toEqual([]);
  });

  it('a {{MISSING: ...}} style brief blank covers the same way', () => {
    const blank = '{{MISSING: default-bail period that applies}}';
    expect(window_(blank, briefWithBlank(blank))).toEqual([]);
    expect(window_(`The period is ${blank}.`, briefWithBlank(blank))).toEqual([]);
  });

  it('a blank-only paragraph is recorded, and a later unchanged check still passes', () => {
    const b = realBrief();
    const p = pack('default_bail');
    const only = {
      ...p,
      mandatoryClauses: p.mandatoryClauses.filter((c) => c.id === 'applicable_window'),
    };
    const out = splitDrafterOutput(
      `1. ${SIGNED_PERIOD_BLANK}\n\n${CLAUSES_MARKER}\napplicable_window: 1`,
    );
    const recorded = new Map<string, string>();
    expect(findMissingClauses(only, out, [], { recorded, brief: b })).toEqual([]);
    expect(recorded.has('applicable_window')).toBe(true);
    expect(findMissingClauses(only, out, [], { recorded, brief: b })).toEqual([]);
  });
});

describe('T-327 AC4 (pure): a different blank does not cover', () => {
  const b = (): Brief => realBrief();

  it('control: the clause is a real required clause, and a plain paragraph does not trip the blank rule', () => {
    const clause = pack('default_bail').mandatoryClauses.find((c) => c.id === 'applicable_window');
    expect(clause?.required).toBe(true);
    expect(clause?.appliesWhen).toBeNull();
  });

  it.each([
    ['a near-miss: extra word inside', SIGNED_PERIOD_BLANK.replace(/\]$/, ' soon]')],
    [
      'a near-miss: extra leading word',
      SIGNED_PERIOD_BLANK.replace('default-bail', 'the default-bail'),
    ],
    ['a near-miss: truncated', SIGNED_PERIOD_BLANK.slice(0, -6) + ']'],
    ['a generic blank', '[To be confirmed: period]'],
    ['a generic blank, facts', '[To be confirmed: facts]'],
    ['non_filing signed blank', SIGNED_BLANKS.default_bail.non_filing[0]],
    ['another brief item blank', '[To be confirmed: date of the first remand]'],
  ])('%s fails', (_n, text) => {
    expect(window_(text, b())).toEqual(NOT);
  });

  it('a {{MISSING}} paragraph that differs from a {{MISSING}} brief blank fails', () => {
    const blank = '{{MISSING: default-bail period that applies}}';
    expect(window_('{{MISSING: default-bail period}}', briefWithBlank(blank))).toEqual(NOT);
    expect(window_(SIGNED_PERIOD_BLANK, briefWithBlank(blank))).toEqual(NOT);
  });

  it('read at check time: a brief with a different period blank makes the first blank stop covering', () => {
    const other = '[To be confirmed: the period for this offence]';
    expect(window_(SIGNED_PERIOD_BLANK, b())).toEqual([]);
    expect(window_(SIGNED_PERIOD_BLANK, briefWithBlank(other))).toEqual(NOT);
    expect(window_(other, briefWithBlank(other))).toEqual([]);
    expect(window_(other, b())).toEqual(NOT);
  });

  it('read at check time: the same brief object edited between two checks changes the outcome', () => {
    const brief = b();
    expect(window_(SIGNED_PERIOD_BLANK, brief)).toEqual([]);
    brief.items.find((i) => i.key === 'period_claimed')!.placeholder = '[To be confirmed: other]';
    expect(window_(SIGNED_PERIOD_BLANK, brief)).toEqual(NOT);
  });

  it('a real value in period_claimed: the blank no longer covers', () => {
    expect(window_(SIGNED_PERIOD_BLANK, briefWithValue('180 days'))).toEqual(NOT);
    expect(window_(SIGNED_PERIOD_BLANK, realBrief({ period_claimed: '90 days' }))).toEqual(NOT);
  });

  it.each(['___', '____', '[]', '[ ]', '{}', '{{}}', '[...]', '[  ]'])(
    'a brief value of %j is not a usable blank and covers nothing',
    (v) => {
      expect(window_(v, briefWithBlank(v))).toEqual(NOT);
    },
  );

  it('a brief value that holds a blank plus other text is not "exactly the blank" and does not cover', () => {
    const v = `${SIGNED_PERIOD_BLANK} and more`;
    expect(window_(SIGNED_PERIOD_BLANK, briefWithValue(v))).toEqual(NOT);
  });

  it('two blanks in the brief value: not a single blank, covers nothing', () => {
    const v = `${SIGNED_PERIOD_BLANK} ${SIGNED_PERIOD_BLANK}`;
    expect(window_(SIGNED_PERIOD_BLANK, briefWithBlank(v))).toEqual(NOT);
  });

  it('an empty brief period (no item, no placeholder) covers nothing', () => {
    expect(window_(SIGNED_PERIOD_BLANK, briefWithBlank(''))).toEqual(NOT);
    const noItem = realBrief();
    noItem.items = noItem.items.filter((i) => i.key !== 'period_claimed');
    noItem.still_unknown = noItem.still_unknown.filter((u) => u.key !== 'period_claimed');
    expect(window_(SIGNED_PERIOD_BLANK, noItem)).toEqual(NOT);
  });
});

describe('T-327 AC4 (pure): only default_bail / applicable_window', () => {
  it('default_bail non_filing holding the brief period blank does not cover', () => {
    expect(reasons('default_bail', 'non_filing', SIGNED_PERIOD_BLANK, realBrief())).toEqual(NOT);
  });

  it('no other required clause of default_bail is covered by the brief period blank', () => {
    const ids = pack('default_bail')
      .mandatoryClauses.filter(
        (c) => c.required && c.appliesWhen === null && c.id !== 'applicable_window',
      )
      .map((c) => c.id);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const got = reasons('default_bail', id, SIGNED_PERIOD_BLANK, realBrief());
      // A clause with its own signed blank still covers its own blank only; the period blank is not that.
      expect({ id, got }).toEqual({ id, got: NOT });
    }
  });

  it('other packs (bail_regular and every other pack with required clauses) are not covered', () => {
    for (const other of [
      'bail_regular',
      'interim_bail',
      'bail_anticipatory',
      'bail_before_magistrate',
    ]) {
      const ids = pack(other)
        .mandatoryClauses.filter((c) => c.required && c.appliesWhen === null)
        .map((c) => c.id);
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) {
        expect({ other, id, got: reasons(other, id, SIGNED_PERIOD_BLANK, realBrief()) }).toEqual({
          other,
          id,
          got: NOT,
        });
      }
    }
  });

  it('a clause named applicable_window in another pack would not be covered (pack id is checked)', () => {
    const p = pack('bail_regular');
    const clone = {
      ...p,
      mandatoryClauses: [
        { ...pack('default_bail').mandatoryClauses.find((c) => c.id === 'applicable_window')! },
      ],
    };
    const out = splitDrafterOutput(
      `1. ${SIGNED_PERIOD_BLANK}\n\n${CLAUSES_MARKER}\napplicable_window: 1`,
    );
    expect(findMissingClauses(clone, out, [], { brief: realBrief() }).map((m) => m.reason)).toEqual(
      NOT,
    );
  });
});

describe('T-327: T-322 signed blanks still cover (no regression)', () => {
  const cases = Object.entries(SIGNED_BLANKS).flatMap(([p, clauses]) =>
    Object.entries(clauses).flatMap(([c, bs]) =>
      bs.map((b): [string, string, string] => [p, c, b]),
    ),
  );

  it('there are signed blanks to check', () => {
    expect(cases).toHaveLength(7);
  });

  it.each(cases)('%s / %s: %s covers, with or without a brief', (p, c, blank) => {
    expect(reasons(p, c, blank)).toEqual([]);
    expect(reasons(p, c, blank, realBrief())).toEqual([]);
    expect(reasons(p, c, blank, briefWithValue('180 days'))).toEqual([]);
  });

  it('the applicable_window signed blanks still cover when the brief holds a different period blank', () => {
    for (const blank of SIGNED_BLANKS.default_bail.applicable_window) {
      expect(window_(blank, briefWithBlank('[To be confirmed: something else]'))).toEqual([]);
    }
  });
});

// ── Part B: the real Drafter path ───────────────────────────────────────────

const EA =
  '[To be confirmed: whether any earlier bail application was made in this matter, to which court, and with what result]';

const BODY = [
  'That FIR No. 143/2026 was registered at PS Kotwali against Deepak Ravidas.',
  `That the applicant was arrested on 03.06.2026 and first remanded to custody on 04.06.2026. ${EA}`,
  'That the matter is listed.',
  'That the applicant is a resident of Patna.',
  'That the applicant prays for bail.',
];

/** One Drafter run for `brief`. The last paragraph is `target`, reported for `clauseId`. Returns the model-call count. */
async function run(
  brief: Brief,
  target: string,
  clauseId = 'applicable_window',
  packId = 'default_bail',
) {
  const p = loadRulePack(packId)!;
  const paras = [...BODY, target];
  const body = paras.map((t, i) => `${i + 1}. ${t}`).join('\n\n');
  const at: Record<string, number> = { earlier_applications: 2, [clauseId]: paras.length };
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

describe('T-327 (Drafter path): the brief blank triggers no repair; a different blank does', () => {
  it('control: a normal text paragraph for the clause makes one call', async () => {
    expect(await run(realBrief(), 'That the applicant states the facts as given.')).toBe(1);
  });

  it("the brief's own blank alone in the applicable_window paragraph -> 1 call, no repair", async () => {
    expect(await run(realBrief(), SIGNED_PERIOD_BLANK)).toBe(1);
  });

  it('a {{MISSING}} brief blank alone -> 1 call', async () => {
    const blank = '{{MISSING: default-bail period that applies}}';
    expect(await run(briefWithBlank(blank), blank)).toBe(1);
  });

  it.each([
    ['near-miss of the brief blank', SIGNED_PERIOD_BLANK.replace(/\]$/, ' soon]')],
    ['another clause blank (non_filing)', SIGNED_BLANKS.default_bail.non_filing[0]],
    ['generic blank', '[To be confirmed: period]'],
  ])('%s -> repair runs (2 or more calls)', async (_n, text) => {
    expect(await run(realBrief(), text)).toBeGreaterThanOrEqual(2);
  });

  it('read at check time: the first blank with a brief holding another period blank -> repair runs', async () => {
    expect(
      await run(
        briefWithBlank('[To be confirmed: the period for this offence]'),
        SIGNED_PERIOD_BLANK,
      ),
    ).toBeGreaterThanOrEqual(2);
  });

  it('a real period_claimed value and only the blank in the paragraph -> repair runs', async () => {
    expect(await run(briefWithValue('180 days'), SIGNED_PERIOD_BLANK)).toBeGreaterThanOrEqual(2);
  });

  it.each(['___', '[]'])(
    'a brief value of %j and that as the paragraph -> repair runs',
    async (v) => {
      expect(await run(briefWithValue(v), v)).toBeGreaterThanOrEqual(2);
    },
  );

  it('the brief period blank in non_filing -> repair runs', async () => {
    expect(await run(realBrief(), SIGNED_PERIOD_BLANK, 'non_filing')).toBeGreaterThanOrEqual(2);
  });

  it('the T-322 signed blanks still cover on this path -> 1 call', async () => {
    for (const b of SIGNED_BLANKS.default_bail.applicable_window) {
      expect({ b, calls: await run(realBrief(), b) }).toEqual({ b, calls: 1 });
    }
    expect(await run(realBrief(), SIGNED_BLANKS.default_bail.non_filing[0], 'non_filing')).toBe(1);
  });
});

// ── Round 2: the brief's period_expiry_date blank (Ajay, 12 Oct 2026) ───────

const EXPIRY_BLANK = '[To be confirmed: date the period expired]';
const OTHER_EXPIRY = '[To be confirmed: the day the period ran out]';

/** period_claimed holds a real value (so only the expiry blank can cover); expiry is `blank` or a value. */
function expiryBrief(expiry: { blank?: string; value?: string } = {}): Brief {
  const b = briefWithValue('180 days');
  if (expiry.value !== undefined) return withBoth(expiry.value);
  if (expiry.blank !== undefined) {
    const item = b.items.find((i) => i.key === 'period_expiry_date')!;
    item.placeholder = expiry.blank;
  }
  return b;
}
function withBoth(expiryValue: string): Brief {
  const b = briefWithValue('180 days');
  b.items.find((i) => i.key === 'period_expiry_date')!.value = expiryValue;
  return b;
}

describe('T-327 round 2: the brief expiry blank (pure)', () => {
  it('the real brief carries the expected expiry placeholder, and it is not a signed blank', () => {
    const item = realBrief().items.find((i) => i.key === 'period_expiry_date');
    expect(item?.placeholder).toBe(EXPIRY_BLANK);
    const all = Object.values(SIGNED_BLANKS).flatMap((c) => Object.values(c).flat());
    expect(all).not.toContain(EXPIRY_BLANK);
  });

  it('without a brief the expiry blank does not cover', () => {
    expect(window_(EXPIRY_BLANK)).toEqual(NOT);
  });

  it('the brief expiry blank alone covers (period holds a real value)', () => {
    expect(window_(EXPIRY_BLANK, expiryBrief())).toEqual([]);
  });

  it('it covers on the unmodified brief too, normalised', () => {
    expect(window_(EXPIRY_BLANK, realBrief())).toEqual([]);
    expect(window_(EXPIRY_BLANK.toUpperCase(), expiryBrief())).toEqual([]);
    expect(window_(`“${EXPIRY_BLANK}”`, expiryBrief())).toEqual([]);
  });

  it('a {{MISSING}} expiry blank covers', () => {
    const blank = '{{MISSING: date the period expired}}';
    expect(window_(blank, briefWithBlank(blank, 'period_expiry_date'))).toEqual([]);
  });

  it('the period blank still covers when expiry is a real date', () => {
    const b = briefWithValue('2026-08-01', 'period_expiry_date');
    expect(window_(SIGNED_PERIOD_BLANK, b)).toEqual([]);
  });

  it.each([
    ['a near-miss: extra word', EXPIRY_BLANK.replace(/\]$/, ' soon]')],
    ['a near-miss: truncated', EXPIRY_BLANK.slice(0, -6) + ']'],
    ['a generic blank', '[To be confirmed: date]'],
    ['the period blank, when period holds a real value', SIGNED_PERIOD_BLANK],
    ['the non_filing signed blank', SIGNED_BLANKS.default_bail.non_filing[0]],
  ])('%s does not cover', (_n, text) => {
    expect(window_(text, expiryBrief())).toEqual(NOT);
  });

  it('a real expiry date: the blank no longer covers', () => {
    expect(window_(EXPIRY_BLANK, withBoth('2026-08-01'))).toEqual(NOT);
  });

  it.each(['___', '[]', '[ ]', '{}', '{{}}'])('an expiry value of %j covers nothing', (v) => {
    expect(window_(v, briefWithBlank(v, 'period_expiry_date'))).toEqual(NOT);
    expect(window_(v, withBoth(v))).toEqual(NOT);
  });

  it('read at check time: a brief with a different expiry blank stops the first blank covering', () => {
    expect(window_(EXPIRY_BLANK, expiryBrief())).toEqual([]);
    expect(window_(EXPIRY_BLANK, expiryBrief({ blank: OTHER_EXPIRY }))).toEqual(NOT);
    expect(window_(OTHER_EXPIRY, expiryBrief({ blank: OTHER_EXPIRY }))).toEqual([]);
  });

  it('read at check time: editing the same brief between two checks changes the outcome', () => {
    const brief = expiryBrief();
    expect(window_(EXPIRY_BLANK, brief)).toEqual([]);
    brief.items.find((i) => i.key === 'period_expiry_date')!.placeholder = OTHER_EXPIRY;
    expect(window_(EXPIRY_BLANK, brief)).toEqual(NOT);
  });

  it('the expiry blank in another clause or pack does not cover', () => {
    expect(reasons('default_bail', 'non_filing', EXPIRY_BLANK, expiryBrief())).toEqual(NOT);
    for (const other of [
      'bail_regular',
      'interim_bail',
      'bail_anticipatory',
      'bail_before_magistrate',
    ]) {
      const ids = pack(other)
        .mandatoryClauses.filter((c) => c.required && c.appliesWhen === null)
        .map((c) => c.id);
      for (const id of ids) {
        expect({ other, id, got: reasons(other, id, EXPIRY_BLANK, expiryBrief()) }).toEqual({
          other,
          id,
          got: NOT,
        });
      }
    }
  });
});

describe('T-327 round 2: the brief expiry blank (Drafter path)', () => {
  it('the brief expiry blank alone -> 1 call, no repair', async () => {
    expect(await run(expiryBrief(), EXPIRY_BLANK)).toBe(1);
  });

  it.each([
    ['near-miss', EXPIRY_BLANK.replace(/\]$/, ' soon]')],
    ['generic blank', '[To be confirmed: date]'],
    ['non_filing blank', SIGNED_BLANKS.default_bail.non_filing[0]],
  ])('%s -> repair runs', async (_n, text) => {
    expect(await run(expiryBrief(), text)).toBeGreaterThanOrEqual(2);
  });

  it('read at check time: a brief with another expiry blank -> repair runs', async () => {
    expect(await run(expiryBrief({ blank: OTHER_EXPIRY }), EXPIRY_BLANK)).toBeGreaterThanOrEqual(2);
  });

  it('a real expiry date in the brief -> repair runs', async () => {
    expect(await run(withBoth('2026-08-01'), EXPIRY_BLANK)).toBeGreaterThanOrEqual(2);
  });

  it('the expiry blank in non_filing -> repair runs', async () => {
    expect(await run(expiryBrief(), EXPIRY_BLANK, 'non_filing')).toBeGreaterThanOrEqual(2);
  });
});

/**
 * T-340 round 2 (Ajay's binding conditions) - the fact-alteration check reads
 * dates the way the template prints them.
 *
 * checkFactAlteration / getDateVariants are not exported. They are reached
 * through streamGenerateFromBrief (the call site that reads the brief's
 * facts_narrative), with the Anthropic SDK stubbed and every model answer a
 * fixture. fact_alteration_check is forced on for the template so that the
 * test does not depend on the shipped flag. Only the "Fact-alteration warning"
 * message is looked at.
 *
 * Conditions proved here:
 *  1. numeric dates are day first only: "03.10.2026" is 3 October, never 10 March.
 *  2. "D Month YYYY" and "DD Month YYYY" (full month name) are accepted for the
 *     same day, month and year only.
 *  3. a different day, month, year, or a swapped day and month is still flagged.
 */
import './setupEnv';

import { Response } from 'express';

import { streamGenerateFromBrief } from '../services/ai.service';
import { CLAUSES_MARKER } from '../services/brief-drafter';
import { buildBrief, buildChecklist, GivenValue, isCourtDocument } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { loadTemplateConfig } from '../services/template-engine.service';
import { SdkStreamParams, sdkStreamOf } from './sdkStream';

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

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

jest.setTimeout(30_000);

const KIND = 'bail_regular';
const GROUND = buildChecklist(loadRulePack(KIND)!).find((i) => i.key === 'grounds_for_bail')!
  .options![2];

const base = (facts: string): GivenValue[] =>
  [
    { key: 'applicant_name', value: 'Ramesh Mahto' },
    { key: 'father_name', value: 'Shri Suresh Mahto' },
    { key: 'applicant_age', value: '34' },
    { key: 'address', value: 'Village Karmatand, PS Saraidhela, Dhanbad' },
    { key: 'fir_number', value: '214/2026' },
    { key: 'fir_date', value: '2026-09-10' },
    { key: 'police_station', value: 'Saraidhela' },
    { key: 'sections_charged', value: ['303'] },
    { key: 'currently_in_custody', value: 'Yes — Judicial custody' },
    { key: 'custody_since', value: '2026-09-13' },
    { key: 'facts_narrative', value: facts },
    { key: 'grounds_for_bail', value: [GROUND] },
  ].map((v) => ({ source: 'user' as const, ...v })) as GivenValue[];

/**
 * Runs the brief pipeline with the given facts and a model body holding `bodyText`.
 * Returns the "Fact-alteration warning" messages only.
 */
async function factWarnings(facts: string, bodyText: string): Promise<string[]> {
  const pack = loadRulePack(KIND)!;
  const brief = buildBrief({
    kind: { id: pack.id, name: pack.name, court_document: isCourtDocument(pack.id) },
    checklist: buildChecklist(pack),
    values: base(facts),
    court: { state: 'bihar', court_type: 'sessions', court: 'district_sessions_patna' },
  });
  if (!brief.can_confirm) throw new Error(`brief cannot be confirmed: ${brief.confirm_message}`);

  const body = `1. That the applicant Ramesh Mahto was arrested. ${bodyText}\n\n2. That the applicant is the only earning member of his family.`;
  const lines = pack.mandatoryClauses.map((c) => `${c.id}: 1`).join('\n');
  const answer = `${body}\n\n${CLAUSES_MARKER}\n${lines}`;
  mockMessagesStream.mockReset();
  mockMessagesStream.mockImplementation(async (_p: SdkStreamParams) => sdkStreamOf(answer));

  const templateConfig = loadTemplateConfig(KIND)!;
  templateConfig.validation_rules = {
    ...templateConfig.validation_rules,
    fact_alteration_check: true,
  };

  const res = {
    setHeader: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
    headersSent: false,
  } as unknown as Response;
  const result = await streamGenerateFromBrief(
    {
      pack,
      templateConfig,
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
    res,
  );
  return result.warnings
    .map((w) => w.message)
    .filter((m) => m.startsWith('Fact-alteration warning'));
}

const flagged = (date: string) => expect.stringContaining(`Date ${date}`);

describe('T-340 fact-alteration: reachable and sensitive (control)', () => {
  it('a date absent from the body is flagged, so the check is live', async () => {
    const w = await factWarnings('He was arrested on 10.03.2026.', 'Nothing else is said.');
    expect(w).toEqual([flagged('10.03.2026')]);
  });

  it('a date present in its own numeric form passes', async () => {
    expect(
      await factWarnings('He was arrested on 10.03.2026.', 'On 10.03.2026 he was held.'),
    ).toEqual([]);
  });
});

describe('Ajay condition 2 and the false-warning fix: month-name forms of the same date pass', () => {
  it.each([
    ['10.03.2026', 'He was arrested on 10 March 2026 at night.'],
    ['10.03.2026', 'He was arrested on 10 March 2026.'], // trailing punctuation
    ['10.03.2026', 'He was arrested on 10 March 2026, at night.'],
    ['10/03/2026', 'He was arrested on 10 March 2026.'],
    ['10-03-2026', 'He was arrested on 10 March 2026.'],
    ['03.10.2026', 'He was arrested on 3 October 2026.'], // condition 1, passes
    ['03.10.2026', 'He was arrested on 03 October 2026.'], // DD Month YYYY
    ['3.10.2026', 'He was arrested on 3 October 2026.'],
    ['1.3.2026', 'He was arrested on 1 March 2026.'],
    ['01.03.2026', 'He was arrested on 1 March 2026.'],
    ['01.03.2026', 'He was arrested on 01 March 2026.'],
    ['15/03/26', 'He was arrested on 15 March 2026.'], // two-digit year
    ['31.12.2026', 'He was arrested on 31 December 2026.'],
  ])('facts %s vs body %j -> no warning', async (date, text) => {
    expect(await factWarnings(`He was arrested on ${date}.`, text)).toEqual([]);
  });
});

describe('Ajay condition 1: numeric dates are day first only', () => {
  it('"03.10.2026" against "10 March 2026" is flagged (never read as month first)', async () => {
    const w = await factWarnings(
      'He was arrested on 03.10.2026.',
      'He was arrested on 10 March 2026.',
    );
    expect(w).toEqual([flagged('03.10.2026')]);
  });

  it('"03.10.2026" against "3 October 2026" passes', async () => {
    expect(
      await factWarnings('He was arrested on 03.10.2026.', 'He was arrested on 3 October 2026.'),
    ).toEqual([]);
  });

  it('"10.03.2026" against "3 October 2026" is flagged (swapped day and month)', async () => {
    const w = await factWarnings(
      'He was arrested on 10.03.2026.',
      'He was arrested on 3 October 2026.',
    );
    expect(w).toEqual([flagged('10.03.2026')]);
  });
});

describe('Ajay condition 3: a different day, month, year or a swap is flagged', () => {
  it.each([
    ['different day', '10.03.2026', '11 March 2026'],
    ['different month', '10.03.2026', '10 April 2026'],
    ['different year', '10.03.2026', '10 March 2025'],
    ['different year (later)', '10.03.2026', '10 March 2027'],
    ['swapped day and month', '10.03.2026', '3 October 2026'],
    ['swapped, DD form', '10.03.2026', '03 October 2026'],
    ['month name in another month', '10/03/2026', '10 May 2026'],
    ['different day, DD form', '05.03.2026', '15 March 2026'],
  ])('%s: facts %s vs body %s -> flagged', async (_label, date, printed) => {
    const w = await factWarnings(`He was arrested on ${date}.`, `He was arrested on ${printed}.`);
    expect(w).toEqual([flagged(date)]);
  });

  it('Ajay/Priya: "1.3.2026" against "11.3.2026" is flagged', async () => {
    const w = await factWarnings('He was arrested on 1.3.2026.', 'He was arrested on 11.3.2026.');
    expect(w).toEqual([flagged('1.3.2026')]);
  });

  it('Ajay/Priya: "01.03.2026" against "11 March 2026" is flagged', async () => {
    const w = await factWarnings(
      'He was arrested on 01.03.2026.',
      'He was arrested on 11 March 2026.',
    );
    expect(w).toEqual([flagged('01.03.2026')]);
  });

  it('Ajay/Priya: "1 March" against "11 March" is flagged (a day inside a longer day)', async () => {
    // "1 March 2026" must not be satisfied by "11 March 2026".
    const w = await factWarnings(
      'He was arrested on 1.3.2026.',
      'He was arrested on 11 March 2026.',
    );
    expect(w).toEqual([flagged('1.3.2026')]);
    const w2 = await factWarnings(
      'He was arrested on 01.03.2026.',
      'He was arrested on 11 March 2026.',
    );
    expect(w2).toEqual([flagged('01.03.2026')]);
  });

  it('the digit boundary: "10.03.2026" is not found inside "110.03.2026" or "10.03.20261"', async () => {
    expect(
      await factWarnings('He was arrested on 10.03.2026.', 'He was arrested on 110.03.2026.'),
    ).toEqual([flagged('10.03.2026')]);
    expect(
      await factWarnings('He was arrested on 10.03.2026.', 'He was arrested on 10.03.20261.'),
    ).toEqual([flagged('10.03.2026')]);
  });
});

describe('invalid month or day adds no month-name variant', () => {
  it('"10.13.2026" (month 13) cannot match any month name; it is flagged', async () => {
    const w = await factWarnings(
      'He was arrested on 10.13.2026.',
      'He was arrested on 10 March 2026.',
    );
    expect(w).toEqual([flagged('10.13.2026')]);
  });

  it('"32.03.2026" (day 32) is flagged against "32 March 2026"', async () => {
    const w = await factWarnings(
      'He was arrested on 32.03.2026.',
      'He was arrested on 32 March 2026.',
    );
    expect(w).toEqual([flagged('32.03.2026')]);
  });
});

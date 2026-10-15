/**
 * T-404 Addendum 3 (Ajay, 13 Oct 2026): with no court given, the Drafter is told no court name,
 * and no court name or "HON'BLE COURT" is made up anywhere in the draft. The signed blanks
 * print instead. Model stubbed (as t251-default-bail does), no database.
 */
import './setupEnv';

import { Response } from 'express';

import { streamGenerateFromBrief } from '../services/ai.service';
import { CLAUSES_MARKER, drafterBrief, ledgerDrafterFacts } from '../services/brief-drafter';
import { buildBrief, buildChecklist, GivenValue, isCourtDocument } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
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

const COURT_BLANK = '[To be confirmed: court]';
const CASE_BLANK = '[To be confirmed: case type and number]';
const PLACE_BLANK = '[To be confirmed: place]';
const BODY = '1. That the applicant is innocent.\n\n2. That the applicant seeks bail.';

const GIVEN: Record<string, string> = {
  applicant_name: 'Deepak Ravidas',
  fir_number: '143/2026',
  police_station: 'Kotwali',
};

async function draftNoCourt(packId: string) {
  const pack = loadRulePack(packId)!;
  const values = Object.entries(GIVEN).map(
    ([key, value]): GivenValue => ({ source: 'user', key, value }),
  );
  // No `court` on the brief and no courtData on the request: the advocate chose none.
  const brief = buildBrief({
    kind: { id: pack.id, name: pack.name, court_document: isCourtDocument(pack.id) },
    checklist: buildChecklist(pack),
    values,
  });
  const clauses = pack.mandatoryClauses.map((c) => `${c.id}: 1`).join('\n');
  mockMessagesStream
    .mockReset()
    .mockImplementation(async () =>
      sdkAnswer(`${BODY}\n\n${CLAUSES_MARKER}\n${clauses}`, 4000, 800),
    );
  const res = { setHeader: jest.fn(), write: jest.fn(), end: jest.fn(), headersSent: false };
  const result = await streamGenerateFromBrief(
    {
      pack,
      templateConfig: loadTemplateConfig(packId)!,
      brief,
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
  const call = mockMessagesStream.mock.calls[0][0] as SdkStreamParams;
  const user = call.messages[0].content;
  const briefJson = JSON.parse(
    user.slice(user.indexOf('BRIEF:\n') + 'BRIEF:\n'.length, user.indexOf('\n\nCLAUSES')),
  ) as { court: string | null };
  const sections = result.sections as Array<{ section_id: string; content: string }>;
  return {
    brief,
    briefJson,
    prompt: `${call.system}\n${user}`,
    fullText: sections.map((s) => s.content).join('\n'),
  };
}

beforeEach(() => mockMessagesStream.mockReset());

describe.each(['bail_regular', 'bail_anticipatory'])('T-404 no court given: %s', (packId) => {
  it('the court line passed to the Drafter is the signed blank', async () => {
    const d = await draftNoCourt(packId);
    expect(d.briefJson.court).toBe(COURT_BLANK);
  });

  it('no real court name and no "HON\'BLE COURT" in what the Drafter is given or in the body', async () => {
    const d = await draftNoCourt(packId);
    for (const text of [d.prompt, d.fullText]) {
      expect(text).not.toMatch(/HON'BLE COURT/);
      expect(text).not.toMatch(/THE HON.BLE COURT/i);
      expect(text).not.toMatch(/IN THE COURT OF THE/);
      expect(text).not.toMatch(/PATNA|DELHI|MUMBAI|BOMBAY|CHENNAI|KOLKATA/i);
    }
  });

  it('the rendered draft prints the signed blanks: header, addressing, case line, place', async () => {
    const d = await draftNoCourt(packId);
    expect(d.fullText).toContain(`THE HONOURABLE ${COURT_BLANK},`);
    expect(d.fullText).toContain(COURT_BLANK);
    expect(d.fullText).toContain(CASE_BLANK);
    expect(d.fullText).toContain(`Verified at ${PLACE_BLANK} on this`);
    expect(d.fullText).toContain(`Place: ${PLACE_BLANK}`);
    expect(d.fullText).not.toMatch(/Place: *\n|Place: _|Verified at +on|Verified at _/);
  });
});

describe('T-404 no court: the Drafter helpers on both paths', () => {
  it('a null court line reads as the signed blank for a court document (brief and ledger)', () => {
    const pack = loadRulePack('bail_regular')!;
    const brief = buildBrief({
      kind: { id: pack.id, name: pack.name, court_document: true },
      checklist: buildChecklist(pack),
      values: [],
    });
    expect(drafterBrief(brief, null).court).toBe(COURT_BLANK);
    expect(ledgerDrafterFacts([], buildChecklist(pack), null, true).court).toMatch(
      /^\{\{MISSING: court\}\}$|^\[To be confirmed: court\]$/,
    );
  });
});

describe('T-404 no court given: a promoted pack with no twin (bail_before_magistrate)', () => {
  it('the Drafter is told the blank; the place prints the blank; no made-up court', async () => {
    const d = await draftNoCourt('bail_before_magistrate');
    expect(d.briefJson.court).toBe(COURT_BLANK);
    expect(d.fullText).toContain(`Place: ${PLACE_BLANK}`);
    expect(d.fullText).toContain(COURT_BLANK);
    expect(d.fullText).not.toMatch(/Place: *\n|Place: _/);
    for (const text of [d.prompt, d.fullText]) {
      expect(text).not.toMatch(/HON'BLE COURT/);
      expect(text).not.toMatch(/PATNA|DELHI|MUMBAI|BOMBAY|CHENNAI|KOLKATA/i);
    }
  });
});

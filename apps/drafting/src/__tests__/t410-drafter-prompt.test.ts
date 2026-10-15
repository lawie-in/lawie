/**
 * T-410 part 2 (Ajay 2a8b722): the text the Drafter is given for a
 * consumer_complaint, through streamGenerateFromBrief with a stubbed model.
 * No database, no real model call.
 */
import './setupEnv';

import fs from 'fs';
import path from 'path';

import { Response } from 'express';

import { streamGenerateFromBrief } from '../services/ai.service';
import { CLAUSES_MARKER } from '../services/brief-drafter';
import { buildBrief, buildChecklist, GivenValue, isCourtDocument } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import {
  CourtLookupData,
  loadCourtRule,
  loadTemplateConfig,
} from '../services/template-engine.service';
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

interface CourtEntry {
  courtId: string;
  designation: string;
  city: string;
  courtType?: string;
  caseNomenclature?: string;
  state?: string;
  stateId?: string;
  formattingRulesRef: string;
}
const COURTS: CourtEntry[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'config', 'courts', 'indian-courts.json'), 'utf8'),
).courts;

function courtData(id: string): { entry: CourtEntry; data: CourtLookupData } {
  const entry = COURTS.find((c) => c.courtId === id)!;
  return {
    entry,
    data: {
      designation: entry.designation,
      city: entry.city,
      caseNomenclature: entry.caseNomenclature ?? '',
      state: entry.state,
      courtType: entry.courtType,
      formattingRulesRef: entry.formattingRulesRef,
      courtRule: loadCourtRule(entry.formattingRulesRef) ?? undefined,
    },
  };
}

const GIVEN: Record<string, string> = {
  applicant_name: 'Asha Verma',
  father_name: 'Ravi Verma',
  relation_type: 'S/o',
  applicant_age: '41',
  address: 'Patna',
  respondent_name: 'Acme Appliances Pvt Ltd',
  deficiency_details: 'Refrigerator stopped cooling within a month; no repair after three visits.',
  consideration_amount: '45000',
  purchase_date: '2026-03-02',
  invoice_number: 'INV-77',
  payment_mode: 'UPI',
  compensation_claimed: '20000',
  litigation_cost: '5000',
  territorial_basis: 'Purchased and used at Patna.',
  pecuniary_basis: 'Consideration paid was Rs. 45,000.',
  limitation_basis: 'Within two years of the cause of action.',
};

async function drafterText(courtId?: string): Promise<string> {
  const pack = loadRulePack('consumer_complaint')!;
  const u = (key: string, value: string): GivenValue => ({ source: 'user', key, value });
  const picked = courtId ? courtData(courtId) : undefined;
  const brief = buildBrief({
    kind: { id: pack.id, name: pack.name, court_document: isCourtDocument(pack.id) },
    checklist: buildChecklist(pack),
    values: Object.entries(GIVEN).map(([k, v]) => u(k, v)),
    court: picked
      ? {
          state: picked.entry.stateId ?? 'bihar',
          court_type: picked.entry.courtType ?? 'consumer_commission',
          court: courtId!,
        }
      : undefined,
  } as Parameters<typeof buildBrief>[0]);
  const clauses = pack.mandatoryClauses.map((c) => `${c.id}: 1`).join('\n');
  mockMessagesStream
    .mockReset()
    .mockImplementation(async () =>
      sdkAnswer(
        `1. That the complainant is a consumer.\n\n${CLAUSES_MARKER}\n${clauses}`,
        4000,
        800,
      ),
    );
  const res = { setHeader: jest.fn(), write: jest.fn(), end: jest.fn(), headersSent: false };
  await streamGenerateFromBrief(
    {
      pack,
      templateConfig: loadTemplateConfig('consumer_complaint')!,
      brief,
      described: null,
      language: 'en',
      targetParagraphs: 10,
      advocateName: 'Test Advocate',
      courtData: picked?.data,
      userId: 'u1',
      runId: 'r1',
      runSequence: 1,
      runType: 'initial',
    } as Parameters<typeof streamGenerateFromBrief>[0],
    res as unknown as Response,
  );
  const first = mockMessagesStream.mock.calls[0][0] as SdkStreamParams;
  return `${first.system}\n${first.messages.map((m) => m.content).join('\n')}`;
}

describe('T-410 part 2: the Drafter prompt for consumer_complaint', () => {
  it.each(['patna_hc', 'mh_sessions_mumbai_city', 'bihar_state_consumer_patna', 'none'])(
    '%s: no State of, no S.H.O., Complainant / Opposite Party, no District lines',
    async (id) => {
      const text = await drafterText(id === 'none' ? undefined : id);
      expect(text).not.toContain('State of');
      expect(text).not.toContain('S.H.O.');
      expect(text).toContain('Party designation, petitioner: "Complainant"');
      expect(text).toContain('Party designation, respondent: "Opposite Party"');
      expect(text).not.toContain('Court fee as per state Consumer Commission rules');
    },
  );

  it('patna_dccdrc: keeps the District lines', async () => {
    const text = await drafterText('patna_dccdrc');
    expect(text).toContain('Court fee as per state Consumer Commission rules');
    expect(text).toContain('Party designation, petitioner: "Complainant"');
    expect(text).not.toContain('S.H.O.');
  });
});

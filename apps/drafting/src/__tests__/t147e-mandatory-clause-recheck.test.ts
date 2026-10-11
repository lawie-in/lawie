/**
 * T-147e (T-147d review follow-up) — the mandatory clauses are checked again
 * after the fact verifier, on the body as it is delivered. A repair or a
 * strip that takes a clause's paragraph out must show in `missingClauses`.
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { FactLedgerModel } from '../models/FactLedger.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { CLAUSES_MARKER } from '../services/brief-drafter';
import { buildChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { sdkAnswer } from './sdkStream';

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const USER_ID = '507f1f77bcf86cd7994390c1';
const MODEL = 'claude-sonnet-4-5-20250929';
const PACK = loadRulePack('bail_regular')!;
const CHECKLIST = buildChecklist(PACK);
const FIRST_GROUND = CHECKLIST.find((i) => i.key === 'grounds_for_bail')!.options[0];
const headers = () => ({
  'x-internal-secret': process.env.INTERNAL_SECRET!,
  'x-user-id': USER_ID,
  'x-user-email': 'a@test.com',
  'x-user-name': 'A',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
});
const VALUES = [
  { key: 'applicant_name', value: 'Ram Kumar' },
  { key: 'father_name', value: 'Shri Hari Kumar' },
  { key: 'applicant_age', value: '32' },
  { key: 'address', value: '123 Main St, Patna' },
  { key: 'fir_number', value: '124/2026' },
  { key: 'fir_date', value: '2026-03-10' },
  { key: 'police_station', value: 'Kotwali' },
  { key: 'sections_charged', value: ['318'] },
  { key: 'currently_in_custody', value: 'Yes — Judicial custody' },
  { key: 'facts_narrative', value: 'The applicant was wrongly named in the FIR.' },
  { key: 'grounds_for_bail', value: [FIRST_GROUND] },
];
const fact = (key: string, display: string, extra: Record<string, unknown> = {}) => ({
  id: `f_${key}`, key, label: CHECKLIST.find((i) => i.key === key)?.label ?? key, type: 'text',
  value: display, display, raw_span: display, source: 'user', confidence: 0.99, required_in_draft: true, ...extra,
});
const FACTS = [
  fact('applicant_name', 'Ram Kumar', { type: 'person_name' }),
  fact('father_name', 'Shri Hari Kumar', { type: 'person_name' }),
  fact('applicant_age', '32'),
  fact('address', '123 Main St, Patna', { type: 'place_name', value: 'x' }),
  fact('fir_number', '124/2026', { type: 'case_number' }),
  fact('fir_date', '10 March 2026', { type: 'date', value: '2026-03-10' }),
  fact('police_station', 'Kotwali', { type: 'police_station' }),
  fact('currently_in_custody', 'Judicial custody'),
  fact('facts_narrative', 'He was wrongly named in the FIR.'),
];
// every clause reported in paragraph 1
const report = () => PACK.mandatoryClauses.map((c) => `${c.id}: 1`).join('\n');
const answer = (body: string) => `${body}\n\n${CLAUSES_MARKER}\n${report()}`;
const BAD = [
  '1. That the applicant Ram Kumar is a law-abiding citizen.',
  '2. That FIR No. 124/2026 was registered at PS Kotwali.',
  '3. That the applicant is in judicial custody.',
].join('\n\n');

async function draft(repairReply: string) {
  mockMessagesStream.mockReset();
  mockMessagesStream.mockResolvedValueOnce(sdkAnswer(answer(BAD), 4000, 800));
  mockMessagesStream.mockResolvedValueOnce(sdkAnswer(repairReply, 400, 80));
  const l = await FactLedgerModel.create({
    userId: USER_ID, documentKind: 'bail_regular', runType: 'user', currentVersion: 1,
    versions: [{ version: 1, facts: FACTS, unresolved: [], createdAt: new Date(), reason: 'extract' }],
  });
  const res = await request(app).post('/generate-from-brief').set(headers()).send({
    kind: 'bail_regular', values: VALUES, ledger_id: String(l._id),
    court: { state: 'bihar', court_type: 'sessions', court: 'district_sessions_patna' },
  });
  const blocks = res.text.split('\n\n').filter((b) => b.startsWith('event: done\n'));
  return { res, done: JSON.parse(blocks[blocks.length - 1].split('\ndata: ')[1]) };
}

beforeEach(async () => {
  _clearAppSettingsCache();
  await AppSetting.create({ key: 'ai.drafting_model', value: MODEL });
  await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
  await AppSetting.create({ key: 'feature.fact_ledger', value: 'on' });
  await Court.create({
    courtId: 'district_sessions_patna', name: 'District & Sessions Court, Patna',
    designation: 'DISTRICT & SESSIONS JUDGE, PATNA', courtType: 'sessions', state: 'Bihar',
    stateId: 'bihar', city: 'Patna', formattingRulesRef: 'bihar_district',
  });
  await User.create({ _id: USER_ID, plan: 'free', planTier: 'free', inkSub: 0, inkAnnualCarry: 0, inkTopup: 2000 });
});

describe('T-147e: mandatory clauses re-checked after the fact verifier', () => {
  it('control: a repair that keeps the paragraph number leaves no clause missing', async () => {
    const { done } = await draft("[[P0]]\n1. That the applicant Ram Kumar has approached this Hon'ble Court for regular bail.");
    expect(done.missingClauses).toEqual([]);
  });

  it('a repair that returns paragraph 1 without its number reports the clauses reported there as missing', async () => {
    const { done } = await draft("[[P0]]\nThat the applicant Ram Kumar has approached this Hon'ble Court for regular bail.");
    const ids = (done.missingClauses as Array<{ id: string }>).map((m) => m.id);
    expect(ids.sort()).toEqual(PACK.mandatoryClauses.filter((c) => c.required && c.appliesWhen === null).map((c) => c.id).sort());
    expect(done.mandatoryClausesComplete).toBe(false);
  });
});

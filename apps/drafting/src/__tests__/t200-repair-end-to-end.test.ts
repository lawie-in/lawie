/**
 * T-200 AC4 — a renumbered body where the clause moved from paragraph 5 to 6
 * and the report says 5: the check calls it missing (no re-pointing), the
 * repair pass fixes it. End to end through POST /generate-from-brief with a
 * mocked model, as t147e-mandatory-clause-recheck does. Also R1.7 through the
 * route: the finding the advocate sees when the draft is not in English.
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { CLAUSES_MARKER } from '../services/brief-drafter';
import { loadRulePack } from '../services/rule-pack.service';
import { SdkStreamParams, sdkAnswer } from './sdkStream';

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const USER_ID = '507f1f77bcf86cd7994390d2';
const MODEL = 'claude-sonnet-4-5-20250929';
const PACK = loadRulePack('bail_regular')!;
const court = { state: 'bihar', court_type: 'sessions', court: 'district_sessions_patna' };
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
];

/** Report: every clause at paragraph 1, with overrides. */
const report = (over: Record<string, string> = {}) =>
  PACK.mandatoryClauses.map((c) => `${c.id}: ${over[c.id] ?? '1'}`).join('\n');
const answer = (body: string, over: Record<string, string> = {}) =>
  `${body}\n\n${CLAUSES_MARKER}\n${report(over)}`;

const P1 =
  '1. That the applicant Ram Kumar is in custody in FIR No. 124/2026, the grounds are submitted below, and he gives an undertaking.';
const P2 = '2. That the applicant has deep roots in society.';
const P3 = '3. That the applicant is the only earning member of his family.';
const P4 = '4. That the applicant will cooperate with the investigation.';
// The Drafter first put the earlier-applications paragraph at 5. A paragraph was
// then inserted at 5, so the clause moved to 6 and the report still says 5.
const NEW5 = '5. That the applicant has no criminal antecedents.';
const MOVED6 = '6. That no earlier bail application has been filed by the applicant.';
const RENUMBERED = [P1, P2, P3, P4, NEW5, MOVED6].join('\n\n');

function post(body: Record<string, unknown>) {
  return request(app).post('/generate-from-brief').set(headers()).send(body);
}
function event(text: string, name: string): Record<string, any> | null {
  const blocks = text.split('\n\n').filter((b) => b.startsWith(`event: ${name}\n`));
  if (blocks.length === 0) return null;
  return JSON.parse(blocks[blocks.length - 1].split('\ndata: ')[1]);
}

beforeEach(async () => {
  mockMessagesStream.mockReset();
  _clearAppSettingsCache();
  await AppSetting.create({ key: 'ai.drafting_model', value: MODEL });
  await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
  await Court.create({
    courtId: 'district_sessions_patna',
    name: 'District & Sessions Court, Patna',
    designation: 'DISTRICT & SESSIONS JUDGE, PATNA',
    courtType: 'sessions',
    state: 'Bihar',
    stateId: 'bihar',
    city: 'Patna',
    formattingRulesRef: 'bihar_district',
  });
  await User.create({
    _id: USER_ID,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: 2000,
  });
});

describe('T-200 AC4: earlier_applications moved from paragraph 5 to 6, the report says 5', () => {
  it('is missing (paragraph 5 exists but is another paragraph), then the repair pass fixes it', async () => {
    mockMessagesStream.mockResolvedValueOnce(
      sdkAnswer(answer(RENUMBERED, { earlier_applications: '5' }), 4000, 800),
    );
    // the repair keeps every paragraph and reports the clause where it is
    mockMessagesStream.mockResolvedValueOnce(
      sdkAnswer(answer(RENUMBERED, { earlier_applications: '6' }), 400, 80),
    );
    const res = await post({ kind: 'bail_regular', values: VALUES, court });

    expect(res.status).toBe(200);
    // the first check named exactly this clause as missing, not re-pointed to paragraph 6
    expect(event(res.text, 'repair')).toEqual({ missing: 1 });
    expect(mockMessagesStream).toHaveBeenCalledTimes(2);
    const repairCall = mockMessagesStream.mock.calls[1][0] as SdkStreamParams;
    expect(repairCall.messages[0].content).toContain('earlier_applications');

    const done = event(res.text, 'done')!;
    expect(done.repaired).toBe(true);
    expect(done.missingClauses).toEqual([]);
    expect(done.mandatoryClausesComplete).toBe(true);
  });

  it('with the repair also pointing at 5, it stays missing and the draft is labelled', async () => {
    mockMessagesStream.mockResolvedValueOnce(
      sdkAnswer(answer(RENUMBERED, { earlier_applications: '5' }), 4000, 800),
    );
    mockMessagesStream.mockResolvedValueOnce(
      sdkAnswer(answer(RENUMBERED, { earlier_applications: '5' }), 400, 80),
    );
    const res = await post({ kind: 'bail_regular', values: VALUES, court });
    const done = event(res.text, 'done')!;
    expect(done.missingClauses).toEqual([
      { id: 'earlier_applications', title: 'Earlier Bail Applications' },
    ]);
    expect(done.repaired).toBe(false);
    expect(done.mandatoryClausesComplete).toBe(false);
  });

  it('control: the clause reported where it really is needs no repair', async () => {
    mockMessagesStream.mockResolvedValueOnce(
      sdkAnswer(answer(RENUMBERED, { earlier_applications: '6' }), 4000, 800),
    );
    const res = await post({ kind: 'bail_regular', values: VALUES, court });
    expect(event(res.text, 'repair')).toBeNull();
    expect(mockMessagesStream).toHaveBeenCalledTimes(1);
    expect(event(res.text, 'done')!.missingClauses).toEqual([]);
  });
});

describe('T-200 R1.7: a draft that is not in English', () => {
  const nda = loadRulePack('nda')!;
  const ndaAnswer = `1. पक्षकार गोपनीयता बनाए रखेंगे।\n\n${CLAUSES_MARKER}\n${nda.mandatoryClauses
    .map((c) => `${c.id}: 1`)
    .join('\n')}`;
  const recitals = nda.mandatoryClauses.find((c) => c.fixedText !== null)!;

  it('the fixed wording is not tested, no clause is missing for it, and the advocate is told', async () => {
    mockMessagesStream.mockResolvedValueOnce(sdkAnswer(ndaAnswer, 4000, 800));
    const res = await post({ kind: 'nda', values: [], language: 'hi' });
    expect(res.status).toBe(200);
    expect(event(res.text, 'repair')).toBeNull();
    const warnings = event(res.text, 'warning')!.warnings as Array<{
      type: string;
      message: string;
      details: { clauseId: string };
    }>;
    const found = warnings.find(
      (w) => w.type === 'missing_clause' && w.details.clauseId === recitals.id,
    );
    expect(found?.message).toBe(
      `Fixed wording of ${recitals.title} not checked: the draft is not in English.`,
    );
    expect(event(res.text, 'done')!.missingClauses).toEqual([]);
  });

  it('control: the same draft in English is missing that wording', async () => {
    mockMessagesStream.mockResolvedValue(sdkAnswer(ndaAnswer, 4000, 800));
    const res = await post({ kind: 'nda', values: [], language: 'en' });
    const ids = (event(res.text, 'done')!.missingClauses as Array<{ id: string }>).map((m) => m.id);
    expect(ids).toContain(recitals.id);
  });
});

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

// T-373: these tests drive the legacy (text-stream) path. The signed skeletons are on by default, so the
// loader is pinned to null here; every lookup is counted so the last test can show the mock was reached.
const mockSkeletonLookups: string[] = [];
jest.mock('../services/rule-pack.service', () => ({
  ...jest.requireActual('../services/rule-pack.service'),
  loadSkeleton: (packId: string) => {
    mockSkeletonLookups.push(packId);
    return null;
  },
}));
const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
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
  id: `f_${key}`,
  key,
  label: CHECKLIST.find((i) => i.key === key)?.label ?? key,
  type: 'text',
  value: display,
  display,
  raw_span: display,
  source: 'user',
  confidence: 0.99,
  required_in_draft: true,
  ...extra,
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
// every clause is reported in paragraph 1 (see draft)
// T-200: paragraph 1 carries the cue words of every clause reported there
const CUES =
  ' He is in custody in FIR No. 124/2026, the grounds are submitted below, he gives an undertaking, and the details of any earlier bail application are as the brief gives them.';
const BAD = [
  `1. That the applicant Ram Kumar is a law-abiding citizen.${CUES}`,
  '2. That FIR No. 124/2026 was registered at PS Kotwali.',
  '3. That the applicant is in judicial custody.',
].join('\n\n');

// T-200 (Ajay, 12 Oct 2026): the clauses of a system part are never checked in the
// paragraphs, so the test that a lost paragraph 1 reports its clauses as missing
// needs an ordinary clause without cues there. bail_regular has none; bail_anticipatory
// has one (apprehension), next to the cued fir_details, no_flight_risk (T-237: undertaking)
// and earlier_applications (T-237: EA-standard).
const ANTI_PACK = loadRulePack('bail_anticipatory')!;
const ANTI_CHECKLIST = buildChecklist(ANTI_PACK);
const ANTI_FACTS = [
  ...FACTS.filter((f) => !['currently_in_custody', 'facts_narrative'].includes(f.key)),
  {
    ...fact('facts_narrative', 'apprehends arrest and will not flee'),
    label: ANTI_CHECKLIST.find((i) => i.key === 'facts_narrative')?.label ?? 'facts_narrative',
  },
];
const ANTI_VALUES = [
  ...VALUES.filter(
    (v) =>
      !['currently_in_custody', 'facts_narrative', 'grounds_for_bail', 'sections_charged'].includes(
        v.key,
      ),
  ),
  { key: 'facts_narrative', value: 'apprehends arrest and will not flee' },
];
// T-237: paragraph 1 carries the undertaking and earlier-application cues, so check 1 passes
// and the only repair that runs is the fact repair (as for the bail_regular CUES above).
const ANTI_BAD = [
  'That the applicant Ram Kumar, son of Shri Hari Kumar, apprehends arrest and will not flee. He is a law-abiding citizen. FIR No. 124/2026 is the case. He gives an undertaking, and the details of any earlier bail application are as the brief gives them.',
]
  .map((p) => `1. ${p}`)
  .concat('2. That FIR No. 124/2026 was registered at PS Kotwali.')
  .join('\n\n');
const REGULAR = { kind: 'bail_regular', pack: PACK, values: VALUES, facts: FACTS, body: BAD };
const ANTI = {
  kind: 'bail_anticipatory',
  pack: ANTI_PACK,
  values: ANTI_VALUES,
  facts: ANTI_FACTS,
  body: ANTI_BAD,
};

async function draft(repairReply: string, setup = REGULAR) {
  const report = () => setup.pack.mandatoryClauses.map((c) => `${c.id}: 1`).join('\n');
  const answer = (body: string) => `${body}\n\n${CLAUSES_MARKER}\n${report()}`;
  mockMessagesStream.mockReset();
  mockMessagesStream.mockResolvedValueOnce(sdkAnswer(answer(setup.body), 4000, 800));
  mockMessagesStream.mockResolvedValueOnce(sdkAnswer(repairReply, 400, 80));
  const l = await FactLedgerModel.create({
    userId: USER_ID,
    documentKind: setup.kind,
    runType: 'user',
    currentVersion: 1,
    versions: [
      { version: 1, facts: setup.facts, unresolved: [], createdAt: new Date(), reason: 'extract' },
    ],
  });
  const res = await request(app)
    .post('/generate-from-brief')
    .set(headers())
    .send({
      kind: setup.kind,
      values: setup.values,
      ledger_id: String(l._id),
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

describe('T-147e: mandatory clauses re-checked after the fact verifier', () => {
  it('control: a repair that keeps the paragraph number leaves no clause missing', async () => {
    const { done } = await draft(
      `[[P0]]\n1. That the applicant Ram Kumar has approached this Hon'ble Court for regular bail.${CUES}`,
    );
    expect(done.missingClauses).toEqual([]);
  });

  it('a repair that returns paragraph 1 without its number reports the non-system clauses reported there as missing, and never a system part', async () => {
    const { done } = await draft(
      '[[P0]]\nThat the applicant Ram Kumar, son of Shri Hari Kumar, apprehends arrest and will not flee.',
      ANTI,
    );
    const ids = (done.missingClauses as Array<{ id: string }>).map((m) => m.id);
    const SYSTEM = ['prayer', 'verification', 'advocate_details'];
    expect(ids.sort()).toEqual(
      ANTI_PACK.mandatoryClauses
        .filter((c) => c.required && c.appliesWhen === null && !SYSTEM.includes(c.id))
        .map((c) => c.id)
        .sort(),
    );
    expect(ids).toEqual(
      expect.arrayContaining(['apprehension', 'no_flight_risk', 'earlier_applications']),
    );
    for (const id of SYSTEM) expect(ids).not.toContain(id);
    expect(done.mandatoryClausesComplete).toBe(false);
  });
});

describe('T-373: this suite ran the legacy path', () => {
  it('the skeleton loader was consulted and returned null, so d1SkeletonFor gave null and the drafts above took the legacy text stream', () => {
    // If the loader mock were removed, bail packs would take D1 (messages.parse) and this stays 0 or the
    // tests above fail; either way the mock is not silently load-bearing.
    expect(mockSkeletonLookups.length).toBeGreaterThan(0);
  });
});

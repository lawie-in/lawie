/**
 * T-690c (reopened T-690b, Anushka run 5f, strike 1): the written statement 90-day
 * warning never reached the guided brief, because that flow never calls preflight.
 * The fix: a pure shared module (ws-limitation-warning), used by preflight and by
 * buildBrief, which now returns `soft_findings` on the brief.
 *
 * Part 1  the shared module (boundaries, no imports, the signed text, 316 bytes)
 * Part 2  buildBrief directly (present / absent, never an empty array, never blocks)
 * Part 3  real routes: Anushka's steps through POST /intake/brief/update and
 *         POST /intake/brief, then POST /generate-from-brief (the warning never blocks)
 * Part 4  the old form path (preflightCheck) is unchanged
 *
 * The model is the Anthropic SDK stub; every answer is a fixture. The signed text is
 * typed here (Ajay, commit 4020a9a9), never read from the source.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import './setupDb';
import request from 'supertest';

import app from '../app';
import redis from '../config/redis';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { Generation } from '../models/Generation.model';
import { createVerifiedUser } from './verifiedUser';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { CLAUSES_MARKER } from '../services/brief-drafter';
import { buildBrief, buildChecklist, GivenValue } from '../services/intake-brief';
import { preflightCheck } from '../services/preflight.service';
import { loadRulePack } from '../services/rule-pack.service';
import {
  WS_OVER_90_DAYS_WARNING,
  wsOver90DaysWarningApplies,
} from '../services/ws-limitation-warning';
import { sdkAnswer } from './sdkStream';

jest.setTimeout(60_000);

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const SIGNED =
  'This written statement is more than 90 days after service of summons. In an ordinary suit the court allows that only in exceptional cases; in a commercial suit it can be allowed up to 120 days, for reasons recorded in writing and on payment of costs, and not after that. Set out the reasons in the delay application.';
const FINDING = [{ rule_id: 'ws_over_90_days', text: SIGNED }];

const WS_PACK = loadRulePack('written_statement')!;
const WS_CHECKLIST = buildChecklist(WS_PACK);

// AJ-690c: a service date alone now warns when it is over 90 IST calendar days back, so the
// days-only cases use a RECENT date, worked out from today's IST calendar date (UTC+05:30).
const istDaysAgo = (n: number): string => {
  const d = new Date(Date.now() + (5 * 60 + 30) * 60 * 1000);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const RECENT = istDaysAgo(10);

const typed = (key: string, value: string): GivenValue => ({ key, value, source: 'user' });
const wsValues = (days?: string): GivenValue[] => [
  typed('summons_service_date', RECENT),
  ...(days === undefined ? [] : [typed('days_from_service', days)]),
];

// ── Part 1: the module ───────────────────────────────────────────────────────

describe('T-690c part 1: ws-limitation-warning', () => {
  it('the constant is the signed text, 316 bytes of ASCII', () => {
    expect(WS_OVER_90_DAYS_WARNING).toBe(SIGNED);
    expect(Buffer.byteLength(WS_OVER_90_DAYS_WARNING, 'utf8')).toBe(316);
    expect(/^[\x20-\x7e]+$/.test(WS_OVER_90_DAYS_WARNING)).toBe(true);
  });

  it('the module has no import and no require statement (pure)', () => {
    const src = readFileSync(join(__dirname, '..', 'services', 'ws-limitation-warning.ts'), 'utf8');
    expect(src).not.toMatch(/^\s*import\s/m);
    expect(src).not.toMatch(/\brequire\s*\(/);
    expect(src).not.toMatch(/\bfrom\s+['"]/);
    expect(src).not.toMatch(/\bimport\s*\(/);
  });

  const applies = (v: unknown, id = 'written_statement') =>
    wsOver90DaysWarningApplies(id, { days_from_service: v });

  it.each([
    [90, false],
    [91, true],
    [90.5, true],
    [90.0001, true],
    [89.99, false],
    [0, false],
    [-5, false],
    [120, true],
    [121, true],
    [1000, true],
    ['90', false],
    ['91', true],
    [' 120 ', true],
    ['121', true],
    ['90.5', true],
    ['1e3', true],
    ['0x5B', true], // Number('0x5B') is 91; documented, not endorsed
    [NaN, false],
    [Infinity, false],
    [-Infinity, false],
    ['Infinity', false],
    ['', false],
    ['   ', false],
    [null, false],
    [undefined, false],
    [true, false],
    [false, false],
    [[], false],
    [[121], false],
    [{}, false],
    ['abc', false],
    ['91abc', false],
    ['NaN', false],
  ])('days_from_service %j -> %s', (v, expected) => {
    expect(applies(v)).toBe(expected);
  });

  it('a missing days_from_service key is false', () => {
    expect(wsOver90DaysWarningApplies('written_statement', {})).toBe(false);
    expect(wsOver90DaysWarningApplies('written_statement', { other: 200 })).toBe(false);
  });

  it.each([
    'WRITTEN_STATEMENT',
    'written_statement ',
    ' written_statement',
    'replication',
    '',
    'legal_notice_s138',
  ])('template id %j -> false even with 121', (id) => {
    expect(applies(121, id)).toBe(false);
    expect(applies('121', id)).toBe(false);
  });
});

// ── Part 2: buildBrief ───────────────────────────────────────────────────────

describe('T-690c part 2: buildBrief soft_findings', () => {
  const brief = (kindId: string | null, values: GivenValue[], checklist = WS_CHECKLIST) =>
    buildBrief({
      kind: { id: kindId, name: kindId ?? 'Document', court_document: true },
      checklist,
      values,
    });

  it('the days_from_service item exists on the written statement checklist', () => {
    expect(WS_CHECKLIST.some((i) => i.key === 'days_from_service')).toBe(true);
  });

  it('121 days -> exactly the one signed finding', () => {
    expect(brief('written_statement', wsValues('121')).soft_findings).toEqual(FINDING);
  });

  it.each(['91', ' 121 ', '1e3', '90.5', '120'])('%j -> present', (d) => {
    expect(brief('written_statement', wsValues(d)).soft_findings).toEqual(FINDING);
  });

  it.each(['90', '30', '0', 'abc', '', '91abc', '   '])(
    '%j -> the property is absent (not an empty array)',
    (d) => {
      const b = brief('written_statement', wsValues(d));
      expect(b).not.toHaveProperty('soft_findings');
      expect(Object.keys(b)).not.toContain('soft_findings');
    },
  );

  it('days_from_service missing -> absent', () => {
    expect(brief('written_statement', wsValues())).not.toHaveProperty('soft_findings');
    expect(brief('written_statement', [])).not.toHaveProperty('soft_findings');
  });

  it('a list value for days_from_service is ignored', () => {
    const b = brief('written_statement', [
      { key: 'days_from_service', value: ['121'], source: 'user' } as GivenValue,
    ]);
    expect(b).not.toHaveProperty('soft_findings');
  });

  it('any other kind (even carrying a days_from_service item) -> absent', () => {
    for (const id of [
      'replication',
      'legal_notice_s138',
      'WRITTEN_STATEMENT',
      'bail_regular',
      null,
    ]) {
      expect(brief(id, wsValues('121'))).not.toHaveProperty('soft_findings');
    }
  });

  it('re-evaluated on every build: 121 then 30 from the same inputs object shape', () => {
    expect(brief('written_statement', wsValues('121')).soft_findings).toEqual(FINDING);
    expect(brief('written_statement', wsValues('30'))).not.toHaveProperty('soft_findings');
    expect(brief('written_statement', wsValues('121')).soft_findings).toEqual(FINDING);
  });

  it('never blocks: gate fields are identical with and without the warning', () => {
    const warned = brief('written_statement', wsValues('121'));
    const plain = brief('written_statement', wsValues('30'));
    expect(warned.can_confirm).toBe(plain.can_confirm);
    expect(warned.confirm_blockers).toEqual(plain.confirm_blockers);
    expect(warned.confirm_message).toEqual(plain.confirm_message);
    expect(warned.still_unknown).toEqual(plain.still_unknown);
  });

  it('the warning does not change the days_from_service item itself', () => {
    const warned = brief('written_statement', wsValues('121'));
    const item = warned.items.find((i) => i.key === 'days_from_service')!;
    expect(item.value).toBe('121');
    expect(item.note).toBeUndefined();
  });
});

// ── Part 3: real routes ──────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439690';
const MODEL = 'claude-sonnet-4-5-20250929';
const headers = {
  'x-internal-secret': process.env.INTERNAL_SECRET!,
  'x-user-id': USER_ID,
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test Advocate',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
};

const update = (body: Record<string, unknown>) =>
  request(app).post('/intake/brief/update').set(headers).send(body);
const wsUpdate = (days?: string, extra: Record<string, unknown> = {}) =>
  update({
    kind: 'written_statement',
    values: [
      { key: 'summons_service_date', value: RECENT, source: 'user' },
      ...(days === undefined ? [] : [{ key: 'days_from_service', value: days, source: 'user' }]),
    ],
    ...extra,
  });

beforeEach(async () => {
  mockMessagesStream.mockReset();
  _clearAppSettingsCache();
  await redis.flushall();
  await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
  await AppSetting.create({ key: 'ai.drafting_model', value: MODEL });
  await AppSetting.create({
    key: `ai.rates.${MODEL}`,
    value: JSON.stringify({ input_usd_per_mtok: 3, output_usd_per_mtok: 15 }),
  });
  await createVerifiedUser({
    _id: USER_ID,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: 2000,
  });
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('T-690c part 3a: POST /intake/brief/update (Anushka run 5f)', () => {
  it("Anushka's steps: a recent service date, 121 days typed -> 200 and the one signed finding", async () => {
    const res = await wsUpdate('121');
    expect(res.status).toBe(200);
    expect(res.body.brief.soft_findings).toEqual(FINDING);
    expect(res.body.brief.soft_findings).toHaveLength(1);
  });

  it('90 -> no soft_findings property at all', async () => {
    const res = await wsUpdate('90');
    expect(res.status).toBe(200);
    expect(res.body.brief).not.toHaveProperty('soft_findings');
  });

  it('91 -> present', async () => {
    const res = await wsUpdate('91');
    expect(res.body.brief.soft_findings).toEqual(FINDING);
  });

  it('30 -> absent', async () => {
    const res = await wsUpdate('30');
    expect(res.body.brief).not.toHaveProperty('soft_findings');
  });

  it.each([' 121 ', '1e3'])('numeric string %j -> present', async (d) => {
    const res = await wsUpdate(d);
    expect(res.status).toBe(200);
    expect(res.body.brief.soft_findings).toEqual(FINDING);
  });

  it.each(['abc', '91abc'])('non-numeric %j -> absent', async (d) => {
    const res = await wsUpdate(d);
    expect(res.status).toBe(200);
    expect(res.body.brief).not.toHaveProperty('soft_findings');
  });

  it('an empty days string -> absent', async () => {
    const res = await wsUpdate('');
    expect(res.status).toBe(200);
    expect(res.body.brief).not.toHaveProperty('soft_findings');
  });

  it('days_from_service missing -> absent', async () => {
    const res = await wsUpdate();
    expect(res.status).toBe(200);
    expect(res.body.brief).not.toHaveProperty('soft_findings');
  });

  it('the edit: the same brief re-posted after 121 -> 30 clears the warning (and back)', async () => {
    const first = await wsUpdate('121');
    expect(first.body.brief.soft_findings).toEqual(FINDING);
    const edited = await wsUpdate('30');
    expect(edited.status).toBe(200);
    expect(edited.body.brief).not.toHaveProperty('soft_findings');
    const again = await wsUpdate('121');
    expect(again.body.brief.soft_findings).toEqual(FINDING);
  });

  it('a different pack (legal notice) with days_from_service 121 -> absent', async () => {
    const res = await update({
      kind: 'legal_notice_s138',
      values: [{ key: 'days_from_service', value: '121', source: 'user' }],
    });
    expect(res.status).toBe(200);
    expect(res.body.brief).not.toHaveProperty('soft_findings');
  });

  it('a replication with days_from_service 121 -> absent', async () => {
    const res = await update({
      kind: 'replication',
      values: [{ key: 'days_from_service', value: '121', source: 'user' }],
    });
    expect(res.status).toBe(200);
    expect(res.body.brief).not.toHaveProperty('soft_findings');
  });

  it('guided kind none with days_from_service 121 -> absent', async () => {
    const res = await update({
      kind: 'none',
      kind_name: 'Written statement',
      court_document: true,
      values: [
        { key: 'summons_service_date', value: RECENT, source: 'user' },
        { key: 'days_from_service', value: '121', source: 'user' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.brief).not.toHaveProperty('soft_findings');
  });

  it('never blocks: can_confirm, confirm_blockers and confirm_message are identical for 121 and 30', async () => {
    const warned = (await wsUpdate('121')).body.brief;
    const plain = (await wsUpdate('30')).body.brief;
    expect(warned.soft_findings).toEqual(FINDING);
    expect(plain).not.toHaveProperty('soft_findings');
    expect(warned.can_confirm).toBe(plain.can_confirm);
    expect(warned.confirm_blockers).toEqual(plain.confirm_blockers);
    expect(warned.confirm_message).toEqual(plain.confirm_message);
    expect(warned.still_unknown).toEqual(plain.still_unknown);
  });

  it('the response carries the warning once and nowhere else (not in any item note)', async () => {
    const res = await wsUpdate('121');
    const text = JSON.stringify(res.body);
    expect(text.split(SIGNED).length - 1).toBe(1);
  });
});

describe('T-690c part 3b: POST /intake/brief (keep carries the values)', () => {
  const MODEL_INTAKE = 'claude-haiku-4-5-20251001';
  beforeEach(async () => {
    await AppSetting.create({ key: 'ai.intake_model', value: MODEL_INTAKE });
    await AppSetting.create({
      key: `ai.rates.${MODEL_INTAKE}`,
      value: JSON.stringify({ input_usd_per_mtok: 1, output_usd_per_mtok: 5 }),
    });
  });
  const post = (days: string) => {
    mockMessagesStream.mockResolvedValueOnce(
      sdkAnswer(
        JSON.stringify({ outcome: 'read', read: [], conflicts: [], questions: [] }),
        900,
        120,
      ),
    );
    return request(app)
      .post('/intake/brief')
      .set(headers)
      .send({
        description: 'I act for the defendant in a money suit; summons were served a few days ago.',
        kind: 'written_statement',
        keep: [
          { key: 'summons_service_date', value: RECENT, source: 'user' },
          { key: 'days_from_service', value: days, source: 'user' },
        ],
      });
  };

  it('121 kept -> the brief carries the signed finding', async () => {
    const res = await post('121');
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('brief');
    expect(res.body.brief.soft_findings).toEqual(FINDING);
  });

  it('30 kept -> absent', async () => {
    const res = await post('30');
    expect(res.body.outcome).toBe('brief');
    expect(res.body.brief).not.toHaveProperty('soft_findings');
  });
});

// ── Part 3c: /generate-from-brief ────────────────────────────────────────────

describe('T-690c part 3c: POST /generate-from-brief is not blocked by the warning', () => {
  const COURT_ID = 'district_judge_patna';
  const court = { state: 'bihar', court_type: 'district_court', court: COURT_ID };
  const CLAUSE_IDS = WS_PACK.mandatoryClauses.map((c) => c.id);
  const report = () => CLAUSE_IDS.map((id) => `${id}: 1`).join('\n');

  beforeEach(async () => {
    await Court.create({
      courtId: COURT_ID,
      name: 'District Court, Patna',
      designation: 'DISTRICT JUDGE, PATNA',
      courtType: 'district_court',
      state: 'Bihar',
      stateId: 'bihar',
      city: 'Patna',
      formattingRulesRef: 'bihar_district',
    });
  });

  const values = (days: string) => [
    { key: 'plaintiff_name', value: 'Sample Person 2' },
    { key: 'defendant_name', value: 'Sample Person 1' },
    { key: 'summons_service_date', value: RECENT },
    { key: 'days_from_service', value: days },
    { key: 'additional_pleas', value: 'The loan was repaid in full before the suit was filed.' },
  ];

  it('on a brief that CAN be confirmed, the gate is the same for 30, 90, 91, 121 and 500 days', async () => {
    const out: Array<Record<string, unknown>> = [];
    for (const d of ['30', '90', '91', '121', '500']) {
      const b = (await update({ kind: 'written_statement', values: values(d), court })).body.brief;
      out.push({
        d,
        can_confirm: b.can_confirm,
        confirm_blockers: b.confirm_blockers,
        confirm_message: b.confirm_message,
        has_warning: 'soft_findings' in b,
      });
    }
    for (const o of out) {
      expect(o.can_confirm).toBe(true);
      expect(o.confirm_blockers).toEqual(out[0].confirm_blockers);
      expect(o.confirm_message).toEqual(out[0].confirm_message);
    }
    expect(out.map((o) => o.has_warning)).toEqual([false, false, true, true, true]);
  });

  it('a 121-day brief generates: 200, a done event, and the rebuild did not block it', async () => {
    // What the route's rebuild says about this exact brief.
    const rebuilt = (await update({ kind: 'written_statement', values: values('121'), court })).body
      .brief;
    expect(rebuilt.soft_findings).toEqual(FINDING);
    expect(rebuilt.can_confirm).toBe(true);
    expect(rebuilt.confirm_blockers ?? []).toEqual([]);
    const rebuilt30 = (await update({ kind: 'written_statement', values: values('30'), court }))
      .body.brief;
    expect(rebuilt30.can_confirm).toBe(true);
    expect(rebuilt30).not.toHaveProperty('soft_findings');

    mockMessagesStream.mockResolvedValueOnce(
      sdkAnswer(
        `1. That the Defendant files this written statement.\n\n2. That the loan was repaid.\n\n${CLAUSES_MARKER}\n${report()}`,
        4000,
        800,
      ),
    );
    const res = await request(app)
      .post('/generate-from-brief')
      .set(headers)
      .send({ kind: 'written_statement', values: values('121'), court });
    expect(res.status).not.toBe(402);
    expect(res.status).not.toBe(422);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('event: error');
    expect(res.text).toContain('event: done');
    expect(await Generation.countDocuments({})).toBeGreaterThan(0);
  });

  // ── the SSE done event carries the soft findings of the brief rebuilt from the sent values
  const draft = () =>
    sdkAnswer(
      `1. That the Defendant files this written statement.\n\n2. That the loan was repaid.\n\n${CLAUSES_MARKER}\n${report()}`,
      4000,
      800,
    );
  const doneOf = (text: string): Record<string, unknown>[] =>
    text
      .split('\n\n')
      .filter((b) => b.startsWith('event: done\n'))
      .map((b) => JSON.parse(b.split('\ndata: ')[1]));
  const generate = async (days: string) => {
    mockMessagesStream.mockResolvedValueOnce(draft());
    return request(app)
      .post('/generate-from-brief')
      .set(headers)
      .send({ kind: 'written_statement', values: values(days), court });
  };

  it('days 121: the done payload carries the single signed finding, once', async () => {
    const res = await generate('121');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('event: error');
    const done = doneOf(res.text);
    expect(done).toHaveLength(1);
    expect(done[0].soft_findings).toEqual(FINDING);
    expect(res.text.split(SIGNED).length - 1).toBe(1);
  });

  it.each([
    ['30', false],
    ['90', false],
    ['91', true],
  ])('days %s: done soft_findings present = %s', async (d, present) => {
    const res = await generate(d);
    expect(res.status).toBe(200);
    const done = doneOf(res.text);
    expect(done).toHaveLength(1);
    expect('soft_findings' in done[0]).toBe(present);
    if (present) expect(done[0].soft_findings).toEqual(FINDING);
    else expect(res.text).not.toContain('soft_findings');
  });

  it('stale client: update with 30 then generate with 121 -> done carries it (values sent win)', async () => {
    const upd = await update({ kind: 'written_statement', values: values('30'), court });
    expect(upd.body.brief).not.toHaveProperty('soft_findings');
    const res = await generate('121');
    expect(doneOf(res.text)[0].soft_findings).toEqual(FINDING);
  });

  it('reverse: update with 121 then generate with 30 -> done has none', async () => {
    const upd = await update({ kind: 'written_statement', values: values('121'), court });
    expect(upd.body.brief.soft_findings).toEqual(FINDING);
    const res = await generate('30');
    const done = doneOf(res.text);
    expect(done).toHaveLength(1);
    expect(done[0]).not.toHaveProperty('soft_findings');
    expect(res.text).not.toContain('soft_findings');
  });

  it('another kind (regular bail) with a days_from_service value -> no warning anywhere', async () => {
    const bailPack = loadRulePack('bail_regular')!;
    const ground = buildChecklist(bailPack).find((i) => i.key === 'grounds_for_bail')!.options[0];
    const bailClauses = bailPack.mandatoryClauses.map((c) => `${c.id}: 1`).join('\n');
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
    const cues =
      ' He is in custody in FIR No. 412/2026, the grounds are submitted below, he gives an undertaking, and the details of any earlier bail application are as the brief gives them.';
    const body = [
      `1. That the applicant Ramesh Kumar Yadav has approached this Hon'ble Court for regular bail.${cues}`,
      '2. That FIR No. 412/2026 was registered at PS Kotwali.',
      '3. That the applicant is in judicial custody.',
    ].join('\n\n');
    mockMessagesStream.mockResolvedValueOnce(
      sdkAnswer(`${body}\n\n${CLAUSES_MARKER}\n${bailClauses}`, 4000, 800),
    );
    const res = await request(app)
      .post('/generate-from-brief')
      .set(headers)
      .send({
        kind: 'bail_regular',
        court: { state: 'bihar', court_type: 'sessions', court: 'district_sessions_patna' },
        values: [
          { key: 'applicant_name', value: 'Ramesh Kumar Yadav' },
          { key: 'father_name', value: 'Shri Hari Kumar' },
          { key: 'applicant_age', value: '32' },
          { key: 'address', value: '123 Main St, Patna' },
          { key: 'fir_number', value: '412/2026' },
          { key: 'fir_date', value: '2026-03-10' },
          { key: 'police_station', value: 'Kotwali' },
          { key: 'sections_charged', value: ['318'] },
          { key: 'currently_in_custody', value: 'Yes — Judicial custody' },
          { key: 'facts_narrative', value: 'The applicant was wrongly named in the FIR.' },
          { key: 'grounds_for_bail', value: [ground] },
          { key: 'days_from_service', value: '121' },
        ],
      });
    // The draft must reach done (else the check below proves nothing).
    expect(res.status).toBe(200);
    expect(doneOf(res.text)).toHaveLength(1);
    expect(res.text).not.toContain('event: error');
    expect(res.text).not.toContain('soft_findings');
    expect(res.text).not.toContain(SIGNED);
  });

  it('the rest of the done payload is the same for 121 and 30 (key sets minus soft_findings)', async () => {
    const a = doneOf((await generate('121')).text)[0];
    const b = doneOf((await generate('30')).text)[0];
    const keys = (o: Record<string, unknown>) =>
      Object.keys(o)
        .filter((k) => k !== 'soft_findings')
        .sort();
    expect(keys(a)).toEqual(keys(b));
    expect(Object.keys(a)).toContain('soft_findings');
    expect(Object.keys(b)).not.toContain('soft_findings');
  });

  it('failure path: a failed model run sends error, no done, no soft_findings', async () => {
    mockMessagesStream.mockRejectedValue(new Error('503 service unavailable'));
    const res = await request(app)
      .post('/generate-from-brief')
      .set(headers)
      .send({ kind: 'written_statement', values: values('121'), court });
    expect(res.text).toContain('event: error');
    expect(doneOf(res.text)).toEqual([]);
    expect(res.text).not.toContain('soft_findings');
    expect(res.text).not.toContain(SIGNED);
  });
});

// ── Part 4: the form path ────────────────────────────────────────────────────

describe('T-690c part 4: the form path (preflightCheck) is unchanged', () => {
  it('written_statement with days_from_service 121 -> soft verdict with the signed text', async () => {
    const r = await preflightCheck('written_statement', { days_from_service: 121 });
    expect(r.verdict).toBe('soft');
    expect(r.hardBlockReason).toBeUndefined();
    expect(r.questions.filter((q) => q === SIGNED)).toHaveLength(1);
  });

  it('days_from_service 30 -> no warning and the text is not shown', async () => {
    const r = await preflightCheck('written_statement', { days_from_service: 30 });
    expect(r.questions).not.toContain(SIGNED);
  });
});

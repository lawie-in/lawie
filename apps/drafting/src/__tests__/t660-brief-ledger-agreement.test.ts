/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * T-660: the brief and generation agree on whether custody_since is derived (T-638 R1 / B1-B5).
 * One ledger fixture goes through BOTH updateBrief (the brief, with the ledger) and
 * withCustodySinceDerived (generation), with the same calm description. Fictional data only.
 * No model answer decides any case below except the runBriefIntake ones, which stub the model.
 */
import './setupDb';
import request from 'supertest';

import type { LedgerFact, LedgerUnresolvedFact } from '@lawie/shared';

import app from '../app';
import redis from '../config/redis';
import { AppSetting } from '../models/AppSetting.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { ledgerCustodyInputs, withCustodySinceDerived } from '../services/custody-since-derivation';
import { buildChecklist, buildQuestions, ledgerGivenKeys } from '../services/intake-brief';
import type { Brief } from '../services/intake-brief';
import { updateBrief } from '../services/intake.service';
import { loadRulePack } from '../services/rule-pack.service';
import { createVerifiedUser } from './verifiedUser';
import { fact, regularBase } from './fixtures/t373';
import { sdkAnswer } from './sdkStream';

jest.setTimeout(60_000);

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const B2 = 'Since what date has the applicant been in custody (the date of arrest or surrender)?';
const CALM = 'Test Applicant A was arrested for a cheating FIR on 12 June 2026 and sent to jail.';

// ── The one ledger fixture ──────────────────────────────────────────────────

const arrest = (): LedgerFact =>
  fact('arrest_date', '12 June 2026', { type: 'date', value: '2026-06-12' });
/** A calm ledger: custody held, one arrest date, no custody_since, no remand. */
const calm = (): LedgerFact[] => [
  ...regularBase().filter(
    (f) => !['custody_since', 'facts_narrative', 'grounds_for_bail'].includes(f.key),
  ),
  fact('facts_narrative', 'He is accused in a cheating case.', { raw_span: 'cheating case' }),
  arrest(),
];
const unresolvedOf = (key: string, raw_span: string): LedgerUnresolvedFact =>
  ({
    id: `u-${key}`,
    key,
    label: key,
    type: 'date',
    raw_span,
    source: 'user',
    reason: 'low_confidence',
    detail: 'x',
  }) as unknown as LedgerUnresolvedFact;

const TYPICAL: Record<string, string | string[]> = {
  applicant_name: 'Test Applicant A',
  father_name: 'Test Father B',
  applicant_parentage: 'Test Father B',
  applicant_age: '32',
  address: '123 Test Street, Patna',
  applicant_address: '123 Test Street, Patna',
  fir_number: '124/2026',
  fir_date: '2026-03-10',
  police_station: 'Kotwali',
  sections_charged: ['318'],
  offences_alleged: '318(4) BNS',
};
const VALUES = [
  ...Object.entries(TYPICAL).map(([key, value]) => ({
    key,
    value,
    source: 'description' as const,
  })),
  { key: 'currently_in_custody', value: 'Yes — Judicial custody', source: 'description' as const },
  { key: 'arrest_date', value: '2026-06-12', source: 'description' as const },
];

/** The brief, as the update route builds it with this ledger. */
function briefWith(facts: LedgerFact[], unresolved: LedgerUnresolvedFact[] = []): Brief {
  return updateBrief({
    kind: 'bail_regular',
    values: VALUES as any,
    description: CALM,
    court: { state: 'bihar', court_type: 'sessions', court: 'patna' },
    ledger: { facts: facts as any, unresolved: unresolved as any },
  }) as Brief;
}
const since = (b: Brief) => b.items.find((i) => i.key === 'custody_since')!;
const generationDerives = (facts: LedgerFact[], unresolved: LedgerUnresolvedFact[] = []) =>
  withCustodySinceDerived(facts, 'bail_regular', CALM, unresolved).some(
    (f) => f.key === 'custody_since_derived',
  );
const questionsOf = (brief: Brief, facts: LedgerFact[]) =>
  buildQuestions(brief, new Map(), new Set(), new Set(), {
    checklist: buildChecklist(loadRulePack('bail_regular')!),
    ledgerGiven: ledgerGivenKeys(facts as any),
  });

describe('T-660 (1): one ledger, the brief and generation agree', () => {
  it('a calm ledger: the brief derives from the arrest date AND generation adds the marker', () => {
    const facts = calm();
    const b = briefWith(facts);
    expect(since(b).derived_from).toBe('arrest_date');
    expect(since(b).value).toBe('2026-06-12');
    expect(generationDerives(facts)).toBe(true);
  });

  const NOT: Array<[string, () => { facts: LedgerFact[]; unresolved?: LedgerUnresolvedFact[] }]> = [
    [
      'surrender only in a fact raw_span',
      () => ({
        facts: [
          ...calm().filter((f) => f.key !== 'facts_narrative'),
          fact('facts_narrative', 'He is accused in a cheating case.', {
            raw_span: 'he surrendered to the police',
          }),
        ],
      }),
    ],
    [
      're-arrested only in a fact display',
      () => ({
        facts: [
          ...calm().filter((f) => f.key !== 'facts_narrative'),
          fact('facts_narrative', 'He was re-arrested later.', { raw_span: 'cheating case' }),
        ],
      }),
    ],
    [
      'an unresolved remand_date',
      () => ({ facts: calm(), unresolved: [unresolvedOf('remand_date', 'sometime in June')] }),
    ],
    [
      'a remand_date fact with an EMPTY display (invisible to ledgerGiven)',
      () => ({
        facts: [...calm(), fact('remand_date', '', { type: 'date', value: '2026-06-14' })],
      }),
    ],
    [
      'a custody_since fact with an EMPTY display',
      () => ({
        facts: [...calm(), fact('custody_since', '', { type: 'date', value: '2026-06-20' })],
      }),
    ],
  ];

  it.each(NOT)('%s: neither derives, and the brief asks B2', (_n, make) => {
    const { facts, unresolved = [] } = make();
    const b = briefWith(facts, unresolved);
    expect(since(b).derived_from).toBeUndefined();
    expect(since(b).value).toBeNull();
    expect(generationDerives(facts, unresolved)).toBe(false);
  });

  it.each(NOT.slice(0, 4))('%s: B2 is asked as written', (_n, make) => {
    const { facts, unresolved = [] } = make();
    const q = questionsOf(briefWith(facts, unresolved), facts).find(
      (x) => x.key === 'custody_since',
    );
    expect(q?.question).toBe(B2);
  });

  it('proof the new input is used: the empty-display facts are invisible to the key check alone', () => {
    const facts = [...calm(), fact('remand_date', '', { type: 'date', value: '2026-06-14' })];
    expect(ledgerGivenKeys(facts as any).has('remand_date')).toBe(false);
    expect(ledgerCustodyInputs(facts).otherCustodyDate).toBe(true);
    const heldEmpty = [...calm(), fact('custody_since', '', { type: 'date', value: '2026-06-20' })];
    expect(ledgerGivenKeys(heldEmpty as any).has('custody_since')).toBe(false);
    expect(ledgerCustodyInputs(heldEmpty).custodySinceHeld).toBe(true);
  });
});

describe('T-660 (2): ledgerCustodyInputs', () => {
  it('ignores the computed custody_since and the custody_since_derived marker', () => {
    const computed = {
      ...fact('custody_since', '12 June 2026 surrender', { type: 'date', value: '2026-06-12' }),
      source: 'computed' as const,
      raw_span: 'remand surrender',
    };
    const marker = {
      ...fact('custody_since_derived', 'arrest_date', { type: 'boolean', value: true as never }),
      source: 'computed' as const,
    };
    const out = ledgerCustodyInputs([...calm(), computed, marker]);
    expect(out.custodySinceHeld).toBe(false);
    expect(out.otherCustodyDate).toBe(false);
    expect(out.texts.join(' ')).not.toMatch(/surrender|remand|custody_since_derived/);
  });

  it('a stored custody_since (not computed) counts as held; texts carry raw_span, display and unresolved wording', () => {
    const out = ledgerCustodyInputs(
      [...calm(), fact('custody_since', '20 June 2026', { type: 'date', value: '2026-06-20' })],
      [unresolvedOf('remand_date', 'remanded on some day')],
    );
    expect(out.custodySinceHeld).toBe(true);
    expect(out.otherCustodyDate).toBe(true);
    expect(out.texts).toEqual(
      expect.arrayContaining(['cheating case', '20 June 2026', 'remanded on some day']),
    );
  });

  it('a calm ledger gives nothing held', () => {
    const out = ledgerCustodyInputs(calm());
    expect(out).toMatchObject({ custodySinceHeld: false, otherCustodyDate: false });
  });
});

describe('T-660 (4): updateBrief with a ledger of facts only', () => {
  it('still works: derives on a calm ledger, no unresolved needed', () => {
    const b = updateBrief({
      kind: 'bail_regular',
      values: VALUES as any,
      description: CALM,
      court: { state: 'bihar', court_type: 'sessions', court: 'patna' },
      ledger: { facts: calm() as any },
    }) as Brief;
    expect(since(b).derived_from).toBe('arrest_date');
  });

  it('a ledger of facts only still stops on a fact-held custody_since', () => {
    const b = updateBrief({
      kind: 'bail_regular',
      values: VALUES as any,
      description: CALM,
      ledger: {
        facts: [...calm(), fact('custody_since', '', { type: 'date', value: '2026-06-20' })] as any,
      },
    }) as Brief;
    expect(since(b).derived_from).toBeUndefined();
  });

  it('no ledger at all: unchanged (derives)', () => {
    const b = updateBrief({
      kind: 'bail_regular',
      values: VALUES as any,
      description: CALM,
    }) as Brief;
    expect(since(b).derived_from).toBe('arrest_date');
    expect('ledger_given_keys' in b).toBe(false);
  });

  it('another pack is unchanged', () => {
    const b = updateBrief({
      kind: 'bail_anticipatory',
      values: [{ key: 'applicant_name', value: 'Test Applicant A', source: 'user' }] as any,
      description: CALM,
      ledger: { facts: [] },
    }) as Brief;
    expect(b.items.some((i) => i.derived_from !== undefined)).toBe(false);
  });
});

// ── (3) The first brief, through runBriefIntake ─────────────────────────────

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd799439660';
const MODEL = 'claude-haiku-4-5-20251001';
const INTAKE_ID = '66666666-6666-4666-8666-666666666666';
const headers = () => ({
  'x-internal-secret': INTERNAL_SECRET,
  'x-user-id': USER_ID,
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
});
const DESC =
  'Test Applicant A was arrested on 12 June 2026 in a cheating FIR and is in judicial custody.';

function read(extra: Array<Record<string, unknown>> = []) {
  return JSON.stringify({
    outcome: 'read',
    read: [
      {
        id: 'currently_in_custody',
        value: 'Yes — Judicial custody',
        quote: 'is in judicial custody',
      },
      { id: 'arrest_date', value: '2026-06-12', quote: '12 June 2026' },
      ...extra,
    ],
    conflicts: [],
    questions: [],
  });
}
const extract = (...facts: Array<Record<string, unknown>>) => JSON.stringify({ facts });
function mockModel(...contents: string[]) {
  mockMessagesStream.mockReset();
  for (const c of contents) mockMessagesStream.mockResolvedValueOnce(sdkAnswer(c, 900, 120));
}
const describe_ = (body: Record<string, unknown> = {}) =>
  request(app)
    .post('/intake/brief')
    .set(headers())
    .send({ description: DESC, intake_id: INTAKE_ID, kind: 'bail_regular', ...body });

beforeEach(async () => {
  mockMessagesStream.mockReset();
  _clearAppSettingsCache();
  await redis.flushall();
  await createVerifiedUser({ _id: USER_ID, plan: 'free', planTier: 'free' });
  await AppSetting.create({ key: 'ai.intake_model', value: MODEL });
  await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
  await AppSetting.create({ key: 'feature.fact_ledger', value: 'on' });
  await AppSetting.create({
    key: `ai.rates.${MODEL}`,
    value: JSON.stringify({ input_usd_per_mtok: 1, output_usd_per_mtok: 5 }),
  });
});

const itemOf = (brief: any, key: string) => brief.items.find((i: any) => i.key === key);

describe('T-660 (3): the first brief is checked again once the ledger exists', () => {
  it('a calm ledger keeps the derived custody date', async () => {
    mockModel(read(), extract({ key: 'arrest_date', span: '12 June 2026', confidence: 0.99 }));
    const res = await describe_();
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('brief');
    expect(itemOf(res.body.brief, 'custody_since').derived_from).toBe('arrest_date');
    expect(itemOf(res.body.brief, 'custody_since').value).toBe('2026-06-12');
    expect(res.body.ledger.facts.map((f: any) => f.key)).not.toContain('custody_since');
  });

  it('the ledger holds custody_since (read from the same words): no derived value, same ledger', async () => {
    mockModel(
      read(),
      extract(
        { key: 'arrest_date', span: '12 June 2026', confidence: 0.99 },
        { key: 'custody_since', span: '12 June 2026', confidence: 0.99 },
      ),
    );
    const res = await describe_();
    expect(res.status).toBe(200);
    expect(itemOf(res.body.brief, 'custody_since').derived_from).toBeUndefined();
    expect(res.body.ledger.facts.map((f: any) => f.key)).toEqual(
      expect.arrayContaining(['arrest_date', 'custody_since']),
    );
  });

  it('the ledger cannot read the custody date (unresolved): no derived value, and B2 is in the questions', async () => {
    mockModel(
      read(),
      extract(
        { key: 'arrest_date', span: '12 June 2026', confidence: 0.99 },
        { key: 'custody_since', span: '12 June 2026', confidence: 0.05 },
      ),
    );
    const res = await describe_();
    expect(res.status).toBe(200);
    expect(itemOf(res.body.brief, 'custody_since').derived_from).toBeUndefined();
    const q = res.body.questions.find((x: any) => x.key === 'custody_since');
    expect(q).toBeDefined();
    expect(q.question).toBe(B2);
  });

  it('ledger off: the first brief is unchanged (derived, no ledger in the answer)', async () => {
    await AppSetting.updateOne({ key: 'feature.fact_ledger' }, { value: 'off' });
    _clearAppSettingsCache();
    mockModel(read());
    const res = await describe_();
    expect(res.status).toBe(200);
    expect(itemOf(res.body.brief, 'custody_since').derived_from).toBe('arrest_date');
    expect(res.body.ledger).toBeUndefined();
  });

  it('the T-655 ledger_given_keys expectation holds: with a ledger the brief carries the given keys', async () => {
    mockModel(read(), extract({ key: 'arrest_date', span: '12 June 2026', confidence: 0.99 }));
    const res = await describe_();
    expect(res.body.brief.ledger_given_keys).toEqual(expect.arrayContaining(['arrest_date']));
    await redis.flushall();
    await AppSetting.updateOne({ key: 'feature.fact_ledger' }, { value: 'off' });
    _clearAppSettingsCache();
    mockModel(read());
    const off = await describe_();
    // with the ledger off no key is given: the route still marks the brief with an empty list (T-655)
    expect(off.body.brief.ledger_given_keys).toEqual([]);
  });

  it('another pack is unchanged: an anticipatory first brief derives nothing', async () => {
    mockModel(
      JSON.stringify({
        outcome: 'read',
        read: [{ id: 'arrest_date', value: '2026-06-12', quote: '12 June 2026' }],
        conflicts: [],
        questions: [],
      }),
      extract(),
    );
    const res = await describe_({ kind: 'bail_anticipatory' });
    expect(res.status).toBe(200);
    expect(res.body.brief.items.some((i: any) => i.derived_from !== undefined)).toBe(false);
  });
});

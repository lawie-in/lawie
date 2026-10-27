/**
 * T-628 — a past date in the O.39 prayer, end to end through POST /generate-from-brief
 * (Ajay, T-613 §(b), §(h), §(k)).
 *
 * AC1  a date before today (IST) in restraint_sought, or in the rendered prayer, blocks the
 *      draft: error event, code past_date_in_prayer
 * AC2  the user sees the signed EN question with the date; the date is in no log call
 * AC3  no delivery and no Ink: no done event, no document, a failed Generation row, hold
 *      released, no inkledger row, balance unchanged
 * AC4  past date, today, future date, no date, and Anushka's "20 October 2026"
 * Order: fact_conflict, then fact_needed, then past_date_in_prayer
 *
 * The model is the Anthropic SDK stub. The clock is faked (only Date) at 27 Oct 2026 IST so
 * "today" is fixed; the mongo and supertest timers stay real.
 */
import './setupDb';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { LawieDocument } from '../models/Document.model';
import { FactLedgerModel } from '../models/FactLedger.model';
import { Generation } from '../models/Generation.model';
import { User } from '../models/User.model';
import { createVerifiedUser } from './verifiedUser';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { CLAUSES_MARKER } from '../services/brief-drafter';
import { buildChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { sdkAnswer } from './sdkStream';

jest.setTimeout(60_000);

jest.mock('../services/rule-pack.service', () => ({
  ...jest.requireActual('../services/rule-pack.service'),
  loadSkeleton: () => null,
}));
const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd7994396c8';
const OID = new mongoose.Types.ObjectId(USER_ID);
const MODEL = 'claude-sonnet-4-5-20250929';
const COURT_ID = 'bihar_civil_junior_patna';
const KIND = 'temporary_injunction_o39';
const PACK = loadRulePack(KIND)!;
const CHECKLIST = buildChecklist(PACK);
const CLAUSE_IDS = PACK.mandatoryClauses.map((c) => c.id);
const court = { state: 'bihar', court_type: 'civil_court', court: COURT_ID };
const START_INK = 2000;
const PAST = '20 October 2026';
const LINE = (d: string) =>
  `The prayer refers to ${d}, which has already passed. An injunction can only restrain what happens from now on. What should the defendant be restrained from?`;

const BASE_VALUES: Array<{ key: string; value: string }> = [
  { key: 'suit_number', value: 'Title Suit No. 245 of 2026' },
  { key: 'plaintiff_name', value: 'Ram Kumar' },
  { key: 'defendant_name', value: 'Shyam Lal' },
  { key: 'subject_matter', value: 'Plot 4, Patna' },
  { key: 'main_suit_relief', value: 'Declaration of title' },
  { key: 'type_of_injunction_sought', value: 'prohibitory_injunction_o39_r1' },
  { key: 'prima_facie_case', value: 'Title deed.' },
  { key: 'balance_of_convenience', value: 'Favours the plaintiff.' },
  { key: 'irreparable_injury', value: 'Loss of the plot.' },
  { key: 'acts_complained_of', value: 'Threat to build.' },
  { key: 'ex_parte_sought', value: 'No' },
  { key: 'undertaking_offered', value: 'Yes.' },
  { key: 'supporting_documents', value: 'Sale deed.' },
  { key: 'advocate_name', value: 'Adv. A' },
  { key: 'advocate_enrollment', value: 'BR/1/2020' },
];
const valuesWith = (restraint: string) => [
  ...BASE_VALUES,
  { key: 'restraint_sought', value: restraint },
];

const BODY = [
  '1. That the plaintiff Ram Kumar has filed Title Suit No. 245 of 2026 against Shyam Lal.',
  '2. That on 5 March 2026 the defendant threatened to build on Plot 4, Patna.',
].join('\n\n');
const report = () => CLAUSE_IDS.map((id) => `${id}: 1`).join('\n');
const answer = (b: string) => `${b}\n\n${CLAUSES_MARKER}\n${report()}`;

function headers() {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': USER_ID,
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test Advocate',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  };
}
function events(text: string, name: string): Array<Record<string, any>> {
  return text
    .split('\n\n')
    .filter((b) => b.startsWith(`event: ${name}\n`))
    .map((b) => JSON.parse(b.split('\ndata: ')[1]));
}
const post = (values: unknown[], ledgerId?: string) =>
  request(app)
    .post('/generate-from-brief')
    .set(headers())
    .send({ kind: KIND, values, court, ...(ledgerId ? { ledger_id: ledgerId } : {}) });

async function rawUser() {
  return (await User.collection.findOne({ _id: OID })) as unknown as {
    inkTopup: number;
    inkSub: number;
    inkHolds: unknown[];
  };
}
async function expectNoInkTaken() {
  const u = await rawUser();
  expect(u.inkTopup).toBe(START_INK);
  expect(u.inkSub).toBe(0);
  expect(u.inkHolds).toEqual([]);
  const rows = await mongoose.connection
    .db!.collection('inkledger')
    .find({ userId: OID, reason: 'generate' })
    .toArray();
  expect(rows).toEqual([]);
  expect(await LawieDocument.countDocuments({})).toBe(0);
}
function logSpies() {
  return (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
    jest.spyOn(console, m).mockImplementation(() => undefined),
  );
}
const logged = (spies: jest.SpyInstance[]) =>
  spies
    .flatMap((s) => s.mock.calls)
    .map((c) => c.map(String).join(' '))
    .join('\n');

beforeEach(async () => {
  mockMessagesStream.mockReset();
  _clearAppSettingsCache();
  // 27 Oct 2026, 12:00 IST. Only Date is faked.
  jest.useFakeTimers({
    doNotFake: [
      'nextTick',
      'setImmediate',
      'setTimeout',
      'setInterval',
      'clearTimeout',
      'clearInterval',
      'clearImmediate',
      'queueMicrotask',
      'performance',
      'hrtime',
    ],
  });
  jest.setSystemTime(new Date('2026-10-27T06:30:00Z'));
  await AppSetting.create({ key: 'ai.drafting_model', value: MODEL });
  await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
  await AppSetting.create({ key: 'feature.fact_ledger', value: 'on' });
  await AppSetting.create({
    key: `ai.rates.${MODEL}`,
    value: JSON.stringify({ input_usd_per_mtok: 3, output_usd_per_mtok: 15 }),
  });
  await Court.create({
    courtId: COURT_ID,
    name: 'Civil Court (Junior Division), Patna',
    designation: 'IN THE COURT OF CIVIL JUDGE (JUNIOR DIVISION), PATNA',
    courtType: 'civil_court',
    state: 'Bihar',
    stateId: 'bihar',
    city: 'Patna',
    formattingRulesRef: 'bihar_district',
  });
  await createVerifiedUser({
    _id: USER_ID,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: START_INK,
  });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('T-628 route: a past date in restraint_sought withholds the draft', () => {
  it("Anushka's case, 20 October 2026: error event with the signed line; no done, no document, failed row, no Ink; date in no log", async () => {
    const spies = logSpies();
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production'; // the withheld log line is skipped under test
    mockMessagesStream.mockResolvedValue(sdkAnswer(answer(BODY), 4000, 800));
    let res;
    try {
      res = await post(valuesWith(`raising any construction after ${PAST}`));
    } finally {
      process.env.NODE_ENV = prev;
    }
    expect(res.status).toBe(200);
    const errs = events(res.text, 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({
      code: 'past_date_in_prayer',
      error: 'past_date_in_prayer',
      retryable: false,
      key: 'restraint_sought',
      reason: LINE(PAST),
    });
    expect(typeof errs[0].label).toBe('string');
    expect(res.text).not.toContain('event: done');
    const gens = await Generation.find({ userId: USER_ID }).lean();
    expect(gens.map((g) => g.status)).toEqual(['failed']);
    await expectNoInkTaken();
    // value only to the advocate
    const all = logged(spies);
    expect(all).not.toContain(PAST);
    expect(all).not.toContain('already passed');
    expect(all).toContain('code=past_date_in_prayer');
    expect(all).toContain('keys=restraint_sought');
  });

  it.each([
    ['20.10.2026', '20.10.2026'],
    ['2026-10-20', '2026-10-20'],
    ['20th day of October, 2026', '20th day of October, 2026'],
    ['20 अक्तूबर 2026', '20 अक्तूबर 2026'],
  ])('%s blocks, shown as written', async (written, shown) => {
    mockMessagesStream.mockResolvedValue(sdkAnswer(answer(BODY), 4000, 800));
    const res = await post(valuesWith(`raising construction after ${written}`));
    const errs = events(res.text, 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ code: 'past_date_in_prayer', reason: LINE(shown) });
    expect(res.text).not.toContain('event: done');
    await expectNoInkTaken();
  });

  it('T-628 / Ajay 410c3e34 (§(k)6): a past date only in subject_matter (a deed or plot date) is DELIVERED', async () => {
    // subject_matter lands in the system-built prayer (a); the gate reads the prayer with that
    // value left out, so no question is asked whose answer could not clear the block.
    mockMessagesStream.mockResolvedValue(sdkAnswer(answer(BODY), 4000, 800));
    const values = valuesWith('raising any construction').map((v) =>
      v.key === 'subject_matter' ? { ...v, value: `Plot 4, Patna, as surveyed on ${PAST}` } : v,
    );
    const res = await post(values);
    expect(res.status).toBe(200);
    expect(events(res.text, 'error')).toEqual([]);
    expect(res.text).not.toContain('past_date_in_prayer');
    expect(events(res.text, 'done')).toHaveLength(1);
    expect(await LawieDocument.countDocuments({})).toBe(1);
    expect((await Generation.find({ userId: USER_ID }).lean()).map((g) => g.status)).toEqual([
      'completed',
    ]);
  });

  it('a past date in restraint_sought still blocks when subject_matter also holds a date', async () => {
    mockMessagesStream.mockResolvedValue(sdkAnswer(answer(BODY), 4000, 800));
    const values = valuesWith(`raising construction after ${PAST}`).map((v) =>
      v.key === 'subject_matter' ? { ...v, value: 'Plot 4, Patna, deed of 3 March 2020' } : v,
    );
    const res = await post(values);
    const errs = events(res.text, 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ code: 'past_date_in_prayer', reason: LINE(PAST) });
    expect(res.text).not.toContain('3 March 2020');
    expect(res.text).not.toContain('event: done');
    await expectNoInkTaken();
  });

  it('a past date in the body only (not the prayer) is delivered: body is never read', async () => {
    mockMessagesStream.mockResolvedValue(sdkAnswer(answer(BODY), 4000, 800));
    const res = await post(valuesWith('raising any construction'));
    expect(events(res.text, 'error')).toEqual([]);
    expect(events(res.text, 'done')).toHaveLength(1);
  });
});

describe('T-628 route: controls are delivered', () => {
  it.each([
    ['a future date', 'raising any construction before 15 December 2026'],
    ['today (27 October 2026)', 'raising any construction on 27 October 2026'],
    ['no date', 'raising any construction'],
    [
      'an unresolved date (October 2026, the current month)',
      'raising construction in October 2026',
    ],
  ])('%s in restraint_sought: delivered, Ink taken', async (_n, restraint) => {
    mockMessagesStream.mockResolvedValue(sdkAnswer(answer(BODY), 4000, 800));
    const res = await post(valuesWith(restraint));
    expect(res.status).toBe(200);
    expect(events(res.text, 'error')).toEqual([]);
    const done = events(res.text, 'done');
    expect(done).toHaveLength(1);
    expect(await LawieDocument.countDocuments({})).toBe(1);
    expect((await Generation.find({ userId: USER_ID }).lean()).map((g) => g.status)).toEqual([
      'completed',
    ]);
    const u = await rawUser();
    expect(u.inkTopup).toBeLessThan(START_INK);
  });
});

describe('T-628 route: gate order, fact_needed before past_date_in_prayer', () => {
  const NAME_LABEL = CHECKLIST.find((i) => i.key === 'plaintiff_name')?.label ?? 'Plaintiff name';
  function fact(key: string, display: string) {
    return {
      id: `f_${key}_${display.length}`,
      key,
      label: CHECKLIST.find((i) => i.key === key)?.label ?? key,
      type: 'text',
      value: display,
      display,
      raw_span: display,
      source: 'user',
      confidence: 0.99,
      required_in_draft: true,
    };
  }
  async function ledger(facts: Array<Record<string, unknown>>) {
    const doc = await FactLedgerModel.create({
      userId: USER_ID,
      documentKind: KIND,
      runType: 'user',
      currentVersion: 1,
      versions: [{ version: 1, facts, unresolved: [], createdAt: new Date(), reason: 'extract' }],
    });
    return String(doc._id);
  }

  it('a held blank that cannot be filled withholds fact_needed first, not past_date_in_prayer', async () => {
    // two plaintiff names held: code cannot pick one, so the blank survives the one repair
    const id = await ledger([
      fact('plaintiff_name', 'Ram Kumar'),
      fact('plaintiff_name', 'Ram Kumar Singh'),
      fact('defendant_name', 'Shyam Lal'),
    ]);
    const blank = `{{MISSING: ${NAME_LABEL}}}`;
    const withBlank = `${BODY}\n\n3. That the plaintiff ${blank} is in possession.`;
    mockMessagesStream.mockResolvedValue(sdkAnswer(answer(withBlank), 4000, 800));
    const res = await post(valuesWith(`raising construction after ${PAST}`), id);
    const errs = events(res.text, 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ code: 'fact_needed', retryable: false, key: 'plaintiff_name' });
    expect(errs[0].reason).toBe(`One detail is needed before the draft: ${NAME_LABEL}.`);
    expect(errs[0].reason).not.toContain(PAST);
    expect(res.text).not.toContain('past_date_in_prayer');
    expect(res.text).not.toContain('event: done');
    await expectNoInkTaken();
  });
});

describe('T-628 route: the ledger subject_matter fills the prayer blank (review round 2 should-fix)', () => {
  const DEED = 'land under sale deed dated 5 March 2019';
  async function ledgerWithSubject(restraint: string) {
    const entries: Array<[string, string]> = [
      ['subject_matter', DEED],
      ['restraint_sought', restraint],
    ];
    const facts = entries.map(([key, text]) => ({
      id: `f_${key}`,
      key,
      label: CHECKLIST.find((i) => i.key === key)?.label ?? key,
      type: 'text',
      value: text,
      display: text,
      raw_span: text,
      source: 'user',
      confidence: 0.99,
      required_in_draft: true,
    }));
    const doc = await FactLedgerModel.create({
      userId: USER_ID,
      documentKind: KIND,
      runType: 'user',
      currentVersion: 1,
      versions: [{ version: 1, facts, unresolved: [], createdAt: new Date(), reason: 'extract' }],
    });
    return String(doc._id);
  }
  const briefLacking = (restraint: string) =>
    valuesWith(restraint).filter((v) => v.key !== 'subject_matter');

  it('a deed date only in the ledger subject_matter text, filled into the prayer, is DELIVERED', async () => {
    const RESTRAINT = 'raising any construction before 15 December 2026';
    const id = await ledgerWithSubject(RESTRAINT);
    mockMessagesStream.mockResolvedValue(sdkAnswer(answer(BODY), 4000, 800));
    const res = await post(briefLacking(RESTRAINT), id);
    expect(res.status).toBe(200);
    expect(events(res.text, 'error')).toEqual([]);
    expect(res.text).not.toContain('past_date_in_prayer');
    expect(events(res.text, 'done')).toHaveLength(1);
    expect((await Generation.find({ userId: USER_ID }).lean()).map((g) => g.status)).toEqual([
      'completed',
    ]);
    expect((await rawUser()).inkTopup).toBeLessThan(START_INK);
    // the fill really happened: the ledger text is in the delivered prayer
    expect(res.text).toContain(DEED);
    expect(res.text).toContain('before 15 December 2026');
    expect(res.text).not.toContain('{{MISSING: Acts the defendant');
  });

  it('control: a past date in restraint_sought still blocks on the same ledger path', async () => {
    const RESTRAINT = `raising construction after ${PAST}`;
    const id = await ledgerWithSubject(RESTRAINT);
    mockMessagesStream.mockResolvedValue(sdkAnswer(answer(BODY), 4000, 800));
    const res = await post(briefLacking(RESTRAINT), id);
    const errs = events(res.text, 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ code: 'past_date_in_prayer', reason: LINE(PAST) });
    expect(res.text).not.toContain('event: done');
    await expectNoInkTaken();
  });
});

describe('T-628 route: no-ledger path, the O.39 body is not streamed before the gate (review round 1, must-fix 1)', () => {
  const TEXT_CHUNK = /data: \{"text"/;

  it('a withheld O.39 run has no text chunk at all, before the error or after', async () => {
    mockMessagesStream.mockResolvedValue(sdkAnswer(answer(BODY), 4000, 800));
    const res = await post(valuesWith(`raising construction after ${PAST}`));
    expect(events(res.text, 'error')).toHaveLength(1);
    expect(res.text).not.toMatch(TEXT_CHUNK);
    expect(res.text).not.toContain('"text"');
    // nothing of the model's body, either
    expect(res.text).not.toContain('threatened to build');
    expect(res.text).not.toContain('event: template_sections');
    expect(res.text).not.toContain('event: done');
    await expectNoInkTaken();
  });

  it('a delivered O.39 run has no text chunk but does send template_sections with the body', async () => {
    mockMessagesStream.mockResolvedValue(sdkAnswer(answer(BODY), 4000, 800));
    const res = await post(valuesWith('raising any construction'));
    expect(events(res.text, 'error')).toEqual([]);
    expect(res.text).not.toMatch(TEXT_CHUNK);
    const secs = events(res.text, 'template_sections');
    expect(secs).toHaveLength(1);
    expect(JSON.stringify(secs[0])).toContain('threatened to build');
    expect(events(res.text, 'done')).toHaveLength(1);
  });
});

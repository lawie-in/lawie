/**
 * T-637 (Arjun option B, gate only): the T-611 delivery gate on POST /generate-from-template.
 *
 * AC1  the form route fills a held blank by code, repairs once, then withholds fact_needed
 *      with the signed question, no document and no Ink
 * AC2  no body text streams before the gate decides (no text chunk; done.paragraphCount)
 * AC3  a held `[To be confirmed: <label>]` is a blank; an unheld one and `_____` are left alone
 * AC4  Anushka's regular-bail inputs (the t611-gate fixtures) as form_data for bail_regular
 * AC7  the in-memory ledger branch (the form route never has a persisted ledger)
 * T-628 still blocks on the form route; formRequiredFieldBlock is called and returns null for a non-O.39 template
 *
 * The model is the Anthropic SDK stub; every answer is a fixture.
 */
import './setupDb';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { LawieDocument } from '../models/Document.model';
import { Generation } from '../models/Generation.model';
import { User } from '../models/User.model';
import { seedCourts } from './seedCourts';
import { createVerifiedUser } from './verifiedUser';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import * as formLedger from '../services/form-ledger';
import { buildChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';
import { SdkStreamParams, sdkAnswer } from './sdkStream';

// T-686: an id-shaped court with no active row stops the run, so the court is seeded.
seedCourts('district_sessions_patna', 'bihar_civil_junior_patna');

jest.setTimeout(60_000);

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const USER_ID = '507f1f77bcf86cd799439637';
const OID = new mongoose.Types.ObjectId(USER_ID);
const MODEL = 'claude-sonnet-4-5-20250929';
const START_INK = 2000;
const TEXT_CHUNK = /data: \{"text"/;
const CHECKLIST = buildChecklist(loadRulePack('bail_regular')!);
const ADDRESS_LABEL = CHECKLIST.find((i) => i.key === 'address')!.label;
const ADDRESS = '123 Main St, Patna';

// Anushka's regular-bail matter (t611-gate fixtures), as the form sends it.
const FORM = {
  applicant_name: 'Ramesh Kumar Yadav',
  father_name: 'Shri Hari Kumar',
  applicant_age: '32',
  address: ADDRESS,
  fir_number: '412/2026',
  fir_date: '2026-03-10',
  police_station: 'Kotwali',
  sections_charged: ['318'],
  currently_in_custody: 'yes_judicial',
  custody_since: '2026-03-15',
  facts_narrative:
    'The applicant was wrongly named in the FIR and is falsely implicated by a rival.',
  grounds_for_bail: ['false_implication', 'no_flight_risk'],
  state: 'bihar',
  court_type: 'sessions',
  court_name: 'district_sessions_patna',
  language: 'en',
};

const P1 = "1. That the applicant Ramesh Kumar Yadav has approached this Hon'ble Court for bail.";
const P2 = '2. That FIR No. 412/2026 was registered at PS Kotwali.';
const P3 = '3. That the applicant is in judicial custody.';
const withP3 = (p3: string) => [P1, P2, p3].join('\n\n');
const BLANK_P3 = `3. That the applicant, resident of {{MISSING: ${ADDRESS_LABEL}}}, is in judicial custody.`;
const TBC_P3 = `3. That the applicant, resident of [To be confirmed: ${ADDRESS_LABEL}], is in judicial custody.`;

const headers = () => ({
  'x-internal-secret': process.env.INTERNAL_SECRET!,
  'x-user-id': USER_ID,
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
});
const postBail = (over: Record<string, unknown> = {}) =>
  request(app)
    .post('/generate-from-template')
    .set(headers())
    .send({ template_id: 'bail_regular', form_data: { ...FORM, ...over } });

function events(text: string, name: string): Array<Record<string, any>> {
  return text
    .split('\n\n')
    .filter((b) => b.startsWith(`event: ${name}\n`))
    .map((b) => JSON.parse(b.split('\ndata: ')[1]));
}
const callUser = (n: number) =>
  (mockMessagesStream.mock.calls[n][0] as SdkStreamParams).messages[0].content;
const repairCalls = () =>
  mockMessagesStream.mock.calls.filter((_c, i) => callUser(i).includes('has a blank for'));
const sectionsText = (res: request.Response) =>
  JSON.stringify(events(res.text, 'template_sections')[0]);

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

beforeEach(async () => {
  mockMessagesStream.mockReset();
  _clearAppSettingsCache();
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
    inkTopup: START_INK,
  });
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('T-637 form route: the held-blank gate (in-memory ledger)', () => {
  it('a held fact left as {{MISSING: label}} is code-filled and delivered; no model repair, no text chunk, paragraphCount present', async () => {
    mockMessagesStream.mockResolvedValueOnce(sdkAnswer(withP3(BLANK_P3), 4000, 800));
    const res = await postBail();
    expect(res.status).toBe(200);
    expect(events(res.text, 'error')).toEqual([]);
    expect(mockMessagesStream).toHaveBeenCalledTimes(1);
    expect(res.text).not.toMatch(TEXT_CHUNK);
    const done = events(res.text, 'done');
    expect(done).toHaveLength(1);
    expect(typeof done[0].paragraphCount).toBe('number');
    expect(done[0].paragraphCount).toBeGreaterThan(0);
    const secs = sectionsText(res);
    expect(secs).toContain(`resident of ${ADDRESS}, is in judicial custody`);
    expect(secs).not.toMatch(/\{\{\s*MISSING/);
    expect(res.text).not.toMatch(/\{\{\s*MISSING/);
    expect(await LawieDocument.countDocuments({})).toBe(1);
    expect((await Generation.find({ userId: USER_ID }).lean()).map((g) => g.status)).toEqual([
      'completed',
    ]);
  });

  it('a held [To be confirmed: <held label>] is filled; an unheld one and _____ stay', async () => {
    const body = [
      P1,
      P2,
      TBC_P3,
      '4. That the applicant works as [To be confirmed: Applicant occupation] and signs _____.',
    ].join('\n\n');
    mockMessagesStream.mockResolvedValueOnce(sdkAnswer(body, 4000, 800));
    const res = await postBail();
    expect(events(res.text, 'error')).toEqual([]);
    expect(events(res.text, 'done')).toHaveLength(1);
    const secs = sectionsText(res);
    expect(secs).toContain(`resident of ${ADDRESS}, is in judicial custody`);
    expect(secs).not.toContain(`[To be confirmed: ${ADDRESS_LABEL}]`);
    expect(secs).toContain('[To be confirmed: Applicant occupation]');
    expect(secs).toContain('signs _____.');
    expect(mockMessagesStream).toHaveBeenCalledTimes(1);
  });

  it('a blank for a fact the form does NOT hold is delivered as a blank', async () => {
    mockMessagesStream.mockResolvedValueOnce(
      sdkAnswer(
        withP3('3. That the applicant works as {{MISSING: Applicant occupation}}.'),
        4000,
        800,
      ),
    );
    const res = await postBail();
    expect(events(res.text, 'error')).toEqual([]);
    expect(events(res.text, 'done')).toHaveLength(1);
    expect(repairCalls()).toHaveLength(0);
  });

  // A held fact code cannot print (a list of grounds): the blank is left to the one model repair.
  const GROUNDS_LABEL = CHECKLIST.find((i) => i.key === 'grounds_for_bail')!.label;
  const GROUNDS_BLANK = `3. That the applicant relies on {{MISSING: ${GROUNDS_LABEL}}}.`;

  it('a blank code cannot fill gets one repair, and a repair that prints the value delivers', async () => {
    mockMessagesStream
      .mockResolvedValueOnce(sdkAnswer(withP3(GROUNDS_BLANK), 4000, 800))
      .mockResolvedValueOnce(
        sdkAnswer(
          '[[P2]]\n3. That the applicant relies on false implication and no flight risk.',
          100,
          50,
        ),
      );
    const res = await postBail();
    expect(events(res.text, 'error')).toEqual([]);
    expect(repairCalls()).toHaveLength(1);
    expect(events(res.text, 'done')).toHaveLength(1);
    expect(sectionsText(res)).toContain('false implication and no flight risk');
    expect(res.text).not.toMatch(/\{\{\s*MISSING/);
  });

  it('still blank after the one repair: withheld with fact_needed and the exact signed line; no done, no document, failed row, Ink released, no value in the logs', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => undefined),
    );
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production'; // the withheld log line is skipped under test
    mockMessagesStream.mockResolvedValue(sdkAnswer(withP3(GROUNDS_BLANK), 4000, 800));
    let res;
    try {
      res = await postBail();
    } finally {
      process.env.NODE_ENV = prev;
    }
    expect(repairCalls()).toHaveLength(1); // one repair, no more
    const errs = events(res.text, 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({
      code: 'fact_needed',
      retryable: false,
      key: 'grounds_for_bail',
      reason: `One detail is needed before the draft: ${GROUNDS_LABEL}.`,
    });
    expect(res.text).not.toContain('event: done');
    expect(res.text).not.toContain('event: template_sections');
    expect(res.text).not.toMatch(TEXT_CHUNK);
    expect(res.text).not.toMatch(/\{\{\s*MISSING/);
    expect((await Generation.find({ userId: USER_ID }).lean()).map((g) => g.status)).toEqual([
      'failed',
    ]);
    await expectNoInkTaken();
    const all = spies
      .flatMap((sp) => sp.mock.calls)
      .map((c) => c.map(String).join(' '))
      .join('\n');
    for (const v of ['Ramesh Kumar Yadav', ADDRESS, 'Kotwali', '412/2026', 'false_implication'])
      expect(all).not.toContain(v);
  });

  it('formRequiredFieldBlock is called with the template and form, and returns null for bail_regular (T-629 blocks only O.39); the draft is delivered', async () => {
    const spy = jest.spyOn(formLedger, 'formRequiredFieldBlock');
    mockMessagesStream.mockResolvedValueOnce(sdkAnswer(withP3(P3), 4000, 800));
    const res = await postBail();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe('bail_regular');
    expect(spy.mock.calls[0][1]).toMatchObject({ applicant_name: 'Ramesh Kumar Yadav' });
    expect(spy.mock.results[0].value).toBeNull();
    expect(events(res.text, 'done')).toHaveLength(1);
  });
});

describe('T-637 form route: Ajay FR-9 (4813ba79) non-answers', () => {
  // Ajay FR-9b (f5eefc44): a typed "Not known" gives no fact, so nothing is held and the draft is
  // DELIVERED with the blank (P6 does not ask). "Not known" is never printed in its place.
  it('"Not known" typed for a blank field is no fact: delivered with the {{MISSING}} blank, no fact_needed, no repair, never filled with "Not known" (Ajay FR-9b f5eefc44)', async () => {
    mockMessagesStream.mockResolvedValue(sdkAnswer(withP3(BLANK_P3), 4000, 800));
    const res = await postBail({ address: 'Not known' });
    expect(res.status).toBe(200);
    expect(events(res.text, 'error')).toEqual([]);
    expect(res.text).not.toContain('fact_needed');
    expect(events(res.text, 'done')).toHaveLength(1);
    expect(repairCalls()).toHaveLength(0);
    expect(mockMessagesStream).toHaveBeenCalledTimes(1);
    const secs = sectionsText(res);
    expect(secs).toContain(`resident of {{MISSING: ${ADDRESS_LABEL}}}, is in judicial custody`);
    // Only the blank's place (the body) is checked: the cause-title template prints the raw
    // typed address ("R/o Not known") on its own, outside the gate.
    const bodySection = events(res.text, 'template_sections')[0].sections.find(
      (x: { section_id: string }) => x.section_id === 'body',
    );
    expect(bodySection.content).not.toContain('Not known');
    expect(res.text).not.toMatch(TEXT_CHUNK);
  });

  it('a held fact "none": its {{MISSING}} blank is not filled; delivered with the blank, no fact_needed, no "none" in its place', async () => {
    mockMessagesStream.mockResolvedValue(sdkAnswer(withP3(BLANK_P3), 4000, 800));
    const res = await postBail({ address: 'none' });
    expect(events(res.text, 'error')).toEqual([]);
    expect(events(res.text, 'done')).toHaveLength(1);
    expect(repairCalls()).toHaveLength(0); // not repaired either
    expect(mockMessagesStream).toHaveBeenCalledTimes(1);
    const secs = sectionsText(res);
    expect(secs).not.toContain('resident of none');
    expect(secs).not.toMatch(/resident of\s+none/i);
    expect(secs).not.toContain(ADDRESS);
    expect(secs).toContain('resident of');
    expect(await LawieDocument.countDocuments({})).toBe(1);
  });

  // Ajay FR-9a (4591bfb3) confirms: a Yes/No fact answered "No" (display "No") is
  // never filled into a blank. Pins this behaviour.
  it('a Yes/No fact answered "No" is not filled into its blank (Ajay FR-9a 4591bfb3)', async () => {
    const coopLabel = CHECKLIST.find((i) => i.key === 'cooperated_with_investigation')!.label;
    const blank = `3. That cooperation with the investigation is {{MISSING: ${coopLabel}}}.`;
    mockMessagesStream.mockResolvedValue(sdkAnswer(withP3(blank), 4000, 800));
    const res = await postBail({ cooperated_with_investigation: false });
    expect(events(res.text, 'error')).toEqual([]);
    expect(events(res.text, 'done')).toHaveLength(1);
    expect(repairCalls()).toHaveLength(0);
    const secs = sectionsText(res);
    expect(secs).not.toContain('investigation is No');
    expect(secs).not.toMatch(/investigation is\s+No\b/);
  });
});

describe('T-637 form route: T-628 still blocks after the gate', () => {
  it('a past date in the O.39 prayer: past_date_in_prayer, no done, no text, no Ink', async () => {
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
    mockMessagesStream.mockResolvedValue(
      sdkAnswer('1. That on 5 March 2026 the defendant threatened.', 4000, 800),
    );
    try {
      const res = await request(app)
        .post('/generate-from-template')
        .set(headers())
        .send({
          template_id: 'temporary_injunction_o39',
          form_data: {
            state: 'bihar',
            court_type: 'civil_court',
            court_name: 'bihar_civil_junior_patna',
            plaintiff_name: 'Ram Kumar',
            defendant_name: 'Shyam Lal',
            suit_number: 'Title Suit No. 245 of 2026',
            subject_matter: 'Plot 4, Patna',
            main_suit_relief: 'Declaration of title',
            type_of_injunction_sought: 'prohibitory_injunction_o39_r1',
            prima_facie_case: 'Title deed.',
            balance_of_convenience: 'Favours the plaintiff.',
            irreparable_injury: 'Loss of the plot.',
            acts_complained_of: 'Threat to build.',
            restraint_sought: 'raising construction after 20 October 2026',
            ex_parte_sought: false,
            undertaking_offered: 'Yes.',
            supporting_documents: 'Sale deed.',
            advocate_name: 'Adv. A',
            advocate_enrollment: 'BR/1/2020',
            language: 'en',
          },
        });
      const errs = events(res.text, 'error');
      expect(errs).toHaveLength(1);
      expect(errs[0].code).toBe('past_date_in_prayer');
      expect(res.text).not.toContain('event: done');
      expect(res.text).not.toMatch(TEXT_CHUNK);
      await expectNoInkTaken();
    } finally {
      jest.useRealTimers();
    }
  });
});

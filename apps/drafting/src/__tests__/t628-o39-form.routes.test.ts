/**
 * T-628 — a past date in the O.39 prayer, through POST /generate-from-template (the form route;
 * Ajay, T-613 §(b), §(h), §(k); review round 2).
 *
 * AC1  a date before today (IST) in restraint_sought, or in the prayer, is a blocking finding
 *      with code past_date_in_prayer on the form route too
 * AC2  the user sees the signed EN question with the date; the date is in no log call
 * AC3  no delivery and no Ink: no done, no text chunk, no document, a failed Generation row,
 *      hold released, no inkledger row
 * §(k)6 a past date only in subject_matter is delivered (Ajay 410c3e34)
 *
 * The model is the Anthropic SDK stub. The clock is faked (only Date) at 27 Oct 2026 IST.
 */
import './setupDb';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import { LawieDocument } from '../models/Document.model';
import { Generation } from '../models/Generation.model';
import { User } from '../models/User.model';
import { createVerifiedUser } from './verifiedUser';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { sdkAnswer } from './sdkStream';

jest.setTimeout(60_000);

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const USER_ID = '507f1f77bcf86cd799439628';
const OID = new mongoose.Types.ObjectId(USER_ID);
const MODEL = 'claude-sonnet-4-5-20250929';
const START_INK = 2000;
const PAST = '20 October 2026';
const LINE = (d: string) =>
  `The prayer refers to ${d}, which has already passed. An injunction can only restrain what happens from now on. What should the defendant be restrained from?`;
const TEXT_CHUNK = /data: \{"text"/;

const headers = () => ({
  'x-internal-secret': process.env.INTERNAL_SECRET!,
  'x-user-id': USER_ID,
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
});

const FORM = {
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
  restraint_sought: 'raising any construction',
  ex_parte_sought: false,
  undertaking_offered: 'Yes.',
  supporting_documents: 'Sale deed.',
  advocate_name: 'Adv. A',
  advocate_enrollment: 'BR/1/2020',
  language: 'en',
};
const BODY = '1. That on 5 March 2026 the defendant threatened to build on Plot 4, Patna.';

const postO39 = (over: Record<string, unknown> = {}) =>
  request(app)
    .post('/generate-from-template')
    .set(headers())
    .send({ template_id: 'temporary_injunction_o39', form_data: { ...FORM, ...over } });

function events(text: string, name: string): Array<Record<string, any>> {
  return text
    .split('\n\n')
    .filter((b) => b.startsWith(`event: ${name}\n`))
    .map((b) => JSON.parse(b.split('\ndata: ')[1]));
}
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
  expect(u.inkHolds).toEqual([]); // the hold is released
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
  jest.setSystemTime(new Date('2026-10-27T06:30:00Z')); // 12:00 IST
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
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('T-628 form route: a past date in restraint_sought withholds the draft', () => {
  it('error event with the signed line and the form label; no done, no text, no document, failed row, hold released, date in no log', async () => {
    const spies = logSpies();
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production'; // the withheld log line is skipped under test
    mockMessagesStream.mockResolvedValue(sdkAnswer(BODY, 4000, 800));
    let res;
    try {
      res = await postO39({ restraint_sought: `raising any construction after ${PAST}` });
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
    expect(errs[0].label).toBe('Acts the defendant should be restrained from');
    expect(res.text).not.toContain('event: done');
    expect(res.text).not.toMatch(TEXT_CHUNK);
    expect(res.text).not.toContain('threatened to build');
    expect(res.text).not.toContain('event: template_sections');
    const gens = await Generation.find({ userId: USER_ID }).lean();
    expect(gens.map((g) => g.status)).toEqual(['failed']);
    await expectNoInkTaken();
    const all = logged(spies);
    expect(all).not.toContain(PAST);
    expect(all).not.toContain('already passed');
  });

  it.each([['20.10.2026'], ['2026-10-20'], ['20th day of October, 2026'], ['20 अक्तूबर 2026']])(
    '%s blocks, shown as written',
    async (written) => {
      mockMessagesStream.mockResolvedValue(sdkAnswer(BODY, 4000, 800));
      const res = await postO39({ restraint_sought: `raising construction after ${written}` });
      const errs = events(res.text, 'error');
      expect(errs).toHaveLength(1);
      expect(errs[0]).toMatchObject({ code: 'past_date_in_prayer', reason: LINE(written) });
      expect(res.text).not.toContain('event: done');
      expect(res.text).not.toMatch(TEXT_CHUNK);
      await expectNoInkTaken();
    },
  );

  it('a past date in restraint_sought blocks even when subject_matter also holds a date', async () => {
    mockMessagesStream.mockResolvedValue(sdkAnswer(BODY, 4000, 800));
    const res = await postO39({
      restraint_sought: `raising construction after ${PAST}`,
      subject_matter: 'Plot 4, Patna, deed of 3 March 2020',
    });
    const errs = events(res.text, 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0].reason).toBe(LINE(PAST));
    expect(res.text).not.toContain('3 March 2020');
    await expectNoInkTaken();
  });
});

describe('T-628 form route: controls are delivered', () => {
  it.each([
    ['a future date', { restraint_sought: 'raising construction before 15 December 2026' }],
    ['today', { restraint_sought: 'raising construction on 27 October 2026' }],
    ['no date', { restraint_sought: 'raising any construction' }],
    [
      'a past date only in subject_matter (T-628 / Ajay 410c3e34 §(k)6)',
      { subject_matter: `Plot 4, Patna, as surveyed on ${PAST}` },
    ],
  ])('%s: delivered, Ink taken, no text chunk, body in template_sections', async (_n, over) => {
    mockMessagesStream.mockResolvedValue(sdkAnswer(BODY, 4000, 800));
    const res = await postO39(over);
    expect(res.status).toBe(200);
    expect(events(res.text, 'error')).toEqual([]);
    expect(res.text).not.toContain('past_date_in_prayer');
    expect(events(res.text, 'done')).toHaveLength(1);
    // the model's text is not streamed on this pack; it goes out with the sections
    expect(res.text).not.toMatch(TEXT_CHUNK);
    const secs = events(res.text, 'template_sections');
    expect(secs).toHaveLength(1);
    expect(JSON.stringify(secs[0])).toContain('threatened to build');
    expect(await LawieDocument.countDocuments({})).toBe(1);
    expect((await Generation.find({ userId: USER_ID }).lean()).map((g) => g.status)).toEqual([
      'completed',
    ]);
    expect((await rawUser()).inkTopup).toBeLessThan(START_INK);
  });

  it('another template on the form route still streams text chunks', async () => {
    mockMessagesStream.mockResolvedValue(
      sdkAnswer('1. Applicant seeks bail on 3 March 2020.', 1000, 200),
    );
    const res = await request(app)
      .post('/generate-from-template')
      .set(headers())
      .send({
        template_id: 'bail_regular',
        form_data: {
          fir_number: '124/2026',
          fir_date: '2026-03-15',
          police_station: 'Kotwali, Patna',
          sections_charged: ['103'],
          currently_in_custody: 'yes_judicial',
          custody_since: '2026-03-15',
          state: 'bihar',
          court_type: 'sessions',
          court_name: 'district_sessions_patna',
          applicant_name: 'Ram Kumar',
          father_name: 'Shri Hari Kumar',
          applicant_age: '32',
          address: '123 Main St',
          language: 'en',
          facts_narrative:
            'The accused was falsely implicated in FIR 124/2026 due to family dispute.',
          grounds_for_bail: ['false_implication', 'no_flight_risk'],
        },
      });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(TEXT_CHUNK);
    expect(res.text).toContain('Applicant seeks bail');
    expect(events(res.text, 'done')).toHaveLength(1);
  });
});

/**
 * T-314 - the legacy body's advocateEnrollment gets the advocate name's check (T-300): after trim,
 * 1-50 characters with no `{`, `}`, CR, LF, U+2028 or U+2029. A value that fails is dropped, so it
 * counts as empty under T-311's order. Never a refusal, and nothing from the value is logged.
 * Puppeteer is mocked, as in t311-enrollment-from-profile.test.ts.
 */
import './setupEnv';
import './setupDb';

jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      setContent: jest.fn().mockResolvedValue(undefined),
      pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF')),
    }),
    close: jest.fn().mockResolvedValue(undefined),
  }),
}));

/* eslint-disable import/order */
import request from 'supertest';

import app from '../app';
import logger from '../config/logger';
import { AppSetting } from '../models/AppSetting.model';
import { User } from '../models/User.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import * as aiService from '../services/ai.service';
import { sdkAnswer } from './sdkStream';
/* eslint-enable import/order */

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

jest.setTimeout(60_000);

const USER_ID = '507f1f77bcf86cd7994393b1';
const MODEL = 'claude-sonnet-4-5-20250929';
const PROFILE_NAME = 'Adv. Profile Name';
const TYPED_NAME = 'Adv. Typed Name';
const PROFILE_NUM = 'PROF/111/2010';
const TBC = '[To be confirmed: enrolment number]';

const headers = {
  'x-internal-secret': process.env.INTERNAL_SECRET as string,
  'x-user-id': USER_ID,
  'x-user-email': 'test@test.com',
  'x-user-name': PROFILE_NAME,
  'x-user-plan': 'free',
  'x-user-role': 'Client',
};

const MARK = 'ZQMARK314';
const LONG = MARK + 'A'.repeat(51 - MARK.length); // 51 chars
const EXACT = MARK + 'B'.repeat(50 - MARK.length); // 50 chars
const HUNDRED = MARK + 'C'.repeat(100 - MARK.length); // 100 chars, the old cap

const BAD: Array<[string, string]> = [
  ['over-long (51)', LONG],
  ['100 chars (the old cap)', HUNDRED],
  ['open brace', `${MARK}/{1}/2010`],
  ['close brace', `${MARK}/1}/2010`],
  ['CR', `${MARK}/1\r/2010`],
  ['LF', `${MARK}/1\n/2010`],
  ['U+2028', `${MARK}/1\u2028/2010`],
  ['U+2029', `${MARK}/1\u2029/2010`],
];

describe('T-314 legacy POST /generate advocateEnrollment check', () => {
  let spy: jest.SpyInstance;
  let logSpies: jest.SpyInstance[];
  let stdout: jest.SpyInstance;

  beforeEach(async () => {
    _clearAppSettingsCache();
    mockMessagesStream.mockReset();
    mockMessagesStream.mockImplementation(async () =>
      sdkAnswer('1. The petitioner submits.', 1000, 200),
    );
    await AppSetting.create({ key: 'ai.drafting_model', value: MODEL });
    await AppSetting.create({
      key: `ai.rates.${MODEL}`,
      value: JSON.stringify({ input_usd_per_mtok: 3, output_usd_per_mtok: 15 }),
    });
    await User.create({
      _id: USER_ID,
      plan: 'free',
      planTier: 'free',
      inkSub: 0,
      inkAnnualCarry: 0,
      inkTopup: 2000,
    });
    spy = jest.spyOn(aiService, 'streamGenerateDocument');
    logSpies = (['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const).map((l) =>
      jest.spyOn(logger, l).mockImplementation(() => undefined),
    );
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      logSpies.push(jest.spyOn(console, m).mockImplementation(() => undefined));
    }
    stdout = jest.spyOn(process.stdout, 'write');
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const setProfileNumber = (n: string) =>
    User.collection.updateOne(
      { _id: new (jest.requireActual('mongoose').Types.ObjectId)(USER_ID) },
      { $set: { enrollmentNumber: n } },
    );
  const post = (extra: Record<string, unknown>) =>
    request(app)
      .post('/generate')
      .set(headers)
      .send({
        docType: 'petition',
        courtName: 'Patna High Court',
        courtType: 'high_court',
        keyFacts: 'The petitioner was denied a ration card without reason.',
        reliefPrayer: 'Issue the ration card.',
        ...extra,
      });
  const sent = () => spy.mock.calls[0][0] as { advocateName?: string; advocateEnrollment?: string };
  const everyLog = () =>
    JSON.stringify(logSpies.map((s) => s.mock.calls)) + JSON.stringify(stdout.mock.calls);
  const prompt = () => JSON.stringify(mockMessagesStream.mock.calls);

  it('exactly 50 chars is kept and printed in "Enrl. No."', async () => {
    const res = await post({ advocateEnrollment: EXACT });
    expect(res.status).toBe(200);
    expect(sent().advocateEnrollment).toBe(EXACT);
    expect(res.text).toContain(`Enrl. No. ${EXACT}`);
  });

  it('51 chars is dropped', async () => {
    const res = await post({ advocateEnrollment: LONG });
    expect(res.status).toBe(200);
    expect(res.text).toContain('event: done');
    expect(sent().advocateEnrollment).toBeUndefined();
    expect(res.text).not.toContain(MARK);
    expect(res.text).not.toContain('Enrl. No.');
  });

  it('length is counted after trim: 50 chars with surrounding spaces is kept', async () => {
    const res = await post({ advocateEnrollment: `  ${EXACT}  ` });
    expect(res.status).toBe(200);
    expect(sent().advocateEnrollment).toBe(EXACT);
  });

  it('leading and trailing spaces are trimmed', async () => {
    const res = await post({ advocateEnrollment: '   TYPED/222/2015  ' });
    expect(res.status).toBe(200);
    expect(sent().advocateEnrollment).toBe('TYPED/222/2015');
    expect(res.text).toContain('Enrl. No. TYPED/222/2015');
  });

  it('a "[To be confirmed: ...]" value is kept', async () => {
    await setProfileNumber(PROFILE_NUM);
    const res = await post({ advocateEnrollment: TBC });
    expect(res.status).toBe(200);
    expect(sent().advocateEnrollment).toBe(TBC);
  });

  describe.each(BAD)('%s', (_label, value) => {
    it('dropped, profile name + profile number: the profile number prints', async () => {
      await setProfileNumber(PROFILE_NUM);
      const res = await post({ advocateEnrollment: value });
      expect(res.status).toBe(200);
      expect(res.text).toContain('event: done');
      expect(sent().advocateName).toBe(PROFILE_NAME);
      expect(sent().advocateEnrollment).toBe(PROFILE_NUM);
      expect(res.text).toContain(`Enrl. No. ${PROFILE_NUM}`);
      expect(res.text).not.toContain(MARK);
      expect(prompt()).not.toContain(MARK);
    });

    it('dropped, typed name: no "Enrl. No." line, never the profile number', async () => {
      await setProfileNumber(PROFILE_NUM);
      const res = await post({ advocateName: TYPED_NAME, advocateEnrollment: value });
      expect(res.status).toBe(200);
      expect(res.text).toContain('event: done');
      expect(sent().advocateName).toBe(TYPED_NAME);
      expect(sent().advocateEnrollment).toBeUndefined();
      expect(res.text).not.toContain('Enrl. No.');
      expect(res.text).not.toContain(PROFILE_NUM);
      expect(res.text).not.toContain(MARK);
      expect(prompt()).not.toContain(MARK);
    });

    it('dropped, no profile number: not refused, no line', async () => {
      const res = await post({ advocateEnrollment: value });
      expect(res.status).toBe(200);
      expect(res.text).toContain('event: done');
      expect(sent().advocateEnrollment).toBeUndefined();
      expect(res.text).not.toContain('Enrl. No.');
    });

    it('AC3: nothing from the value reaches any logger, console or stdout call', async () => {
      await setProfileNumber(PROFILE_NUM);
      await post({ advocateEnrollment: value });
      await post({ advocateName: TYPED_NAME, advocateEnrollment: value });
      const logged = everyLog();
      expect(logged).not.toContain(MARK);
      expect(logged).not.toContain(value);
      expect(logged).not.toContain(JSON.stringify(value).slice(1, -1));
    });
  });
});

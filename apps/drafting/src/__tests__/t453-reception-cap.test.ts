/**
 * T-453 follow-up — getIntakeReceptionCap: ai.cap.intake_reception, default 4000,
 * whole number in 500-8000, key-only warn, 60 s cache, invalidation, independent
 * of the extract cap. Also: both Reception call sites (rule pack, guided) send the
 * resolved cap as max_tokens; match (300) and fill (1500) keep theirs.
 * Time stubbed via Date.now.
 */
import './setupEnv';
import './setupDb';

import redis from '../config/redis';
import logger from '../config/logger';
import { AppSetting } from '../models/AppSetting.model';
import {
  _clearAppSettingsCache,
  APP_SETTING_KEYS,
  setAppSetting,
} from '../services/app-settings.service';
import { INTAKE_LIMITS, runBriefIntake, runIntake } from '../services/intake.service';
import {
  getIntakeExtractCap,
  getIntakeReceptionCap,
  INTAKE_RECEPTION_CAP_DEFAULT,
  INTAKE_RECEPTION_CAP_MAX,
  INTAKE_RECEPTION_CAP_MIN,
} from '../services/llm-usage';
import { SdkStreamParams, sdkAnswer } from './sdkStream';

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

const KEY = 'ai.cap.intake_reception';
const EXTRACT_KEY = 'ai.cap.intake_extract';
const MODEL = 'claude-haiku-4-5-20251001';
const USER_ID = '507f1f77bcf86cd799439081';
let now = 1_800_000_000_000;
let findOne: jest.SpyInstance;
let warn: jest.SpyInstance;
const reads = (key = KEY) =>
  findOne.mock.calls.filter((c) => (c[0] as { key?: string })?.key === key).length;

beforeEach(async () => {
  now = 1_800_000_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  _clearAppSettingsCache();
  mockMessagesStream.mockReset();
  findOne = jest.spyOn(AppSetting, 'findOne');
  warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('getIntakeReceptionCap', () => {
  it('constants and key', () => {
    expect(APP_SETTING_KEYS.CAP_INTAKE_RECEPTION).toBe(KEY);
    expect([
      INTAKE_RECEPTION_CAP_DEFAULT,
      INTAKE_RECEPTION_CAP_MIN,
      INTAKE_RECEPTION_CAP_MAX,
    ]).toEqual([4000, 500, 8000]);
    expect(INTAKE_LIMITS.receptionMaxTokens).toBe(4000);
  });

  it('is 4000 when the key is missing, with no warn', async () => {
    expect(await getIntakeReceptionCap()).toBe(4000);
    expect(warn).not.toHaveBeenCalled();
  });

  it('is 4000 when the settings read fails', async () => {
    jest.spyOn(AppSetting, 'findOne').mockImplementation(() => {
      throw new Error('db down');
    });
    expect(await getIntakeReceptionCap()).toBe(4000);
  });

  it.each([
    ['500', 500],
    ['5200', 5200],
    ['8000', 8000],
    [' 6000 ', 6000],
  ])('uses a valid value %p', async (value, want) => {
    await AppSetting.create({ key: KEY, value });
    expect(await getIntakeReceptionCap()).toBe(want);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(['499', '8001', '0', '-1', '1500.5', '3e3', 'abc', '12abc', '٣٠٠٠'])(
    'falls back to 4000 with a key-only warn for %p',
    async (value) => {
      await AppSetting.create({ key: KEY, value });
      expect(await getIntakeReceptionCap()).toBe(4000);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toEqual({ key: KEY });
      if (value.length > 2) expect(JSON.stringify(warn.mock.calls)).not.toContain(value);
    },
  );

  it('reads once per 60 s (missing key included), warns once per period, re-reads after', async () => {
    await AppSetting.create({ key: KEY, value: 'bad' });
    for (let i = 0; i < 4; i++) expect(await getIntakeReceptionCap()).toBe(4000);
    expect(reads()).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
    await AppSetting.updateOne({ key: KEY }, { value: '5000' });
    now += 59_000;
    expect(await getIntakeReceptionCap()).toBe(4000); // still cached
    now += 2_000;
    expect(await getIntakeReceptionCap()).toBe(5000);
    expect(reads()).toBeGreaterThanOrEqual(2);
  });

  it('caches the default for a missing key for 60 s', async () => {
    for (let i = 0; i < 3; i++) expect(await getIntakeReceptionCap()).toBe(4000);
    expect(reads()).toBe(1);
  });

  it("setAppSetting('ai.cap.intake_reception') invalidates the cache", async () => {
    expect(await getIntakeReceptionCap()).toBe(4000);
    await setAppSetting({ key: KEY, value: '7000' });
    expect(await getIntakeReceptionCap()).toBe(7000);
  });

  it('_clearAppSettingsCache invalidates the cache', async () => {
    await getIntakeReceptionCap();
    await AppSetting.create({ key: KEY, value: '800' });
    expect(await getIntakeReceptionCap()).toBe(4000); // cached
    _clearAppSettingsCache();
    expect(await getIntakeReceptionCap()).toBe(800);
  });

  it('an unrelated (effort-key) write leaves the cache alone', async () => {
    await getIntakeReceptionCap();
    const before = reads();
    await setAppSetting({ key: 'ai.effort.body', value: 'high' });
    await getIntakeReceptionCap();
    expect(reads()).toBe(before);
  });

  it('a reception key write leaves the extract cache alone', async () => {
    expect(await getIntakeExtractCap()).toBe(3000);
    const before = reads(EXTRACT_KEY);
    await setAppSetting({ key: KEY, value: '7000' });
    expect(await getIntakeExtractCap()).toBe(3000);
    expect(reads(EXTRACT_KEY)).toBe(before);
    expect(await getIntakeReceptionCap()).toBe(7000);
  });

  it('an extract key write leaves the reception cache alone', async () => {
    expect(await getIntakeReceptionCap()).toBe(4000);
    const before = reads();
    await setAppSetting({ key: EXTRACT_KEY, value: '6500' });
    expect(await getIntakeReceptionCap()).toBe(4000);
    expect(reads()).toBe(before);
    expect(await getIntakeExtractCap()).toBe(6500);
  });

  it('the two caps are independent values', async () => {
    await AppSetting.create({ key: KEY, value: '5200' });
    await AppSetting.create({ key: EXTRACT_KEY, value: '2200' });
    expect(await getIntakeReceptionCap()).toBe(5200);
    expect(await getIntakeExtractCap()).toBe(2200);
  });
});

describe('Reception call sites use the resolved cap', () => {
  const EMPTY_READ = JSON.stringify({ outcome: 'read', read: [], conflicts: [], questions: [] });
  const MATCH_MACT = JSON.stringify({
    template_id: 'mact_claim',
    confidence: 'high',
    alternatives: [],
    is_legal_drafting: true,
    is_court_document: true,
    label: 'legal document',
    category: 'other',
  });
  const GUIDED = JSON.stringify({ outcome: 'questions', questions: [] });
  const DESC =
    'Mere client Ramesh ka accident 12/3/26 ko hua tha, PS Kotwali mein FIR 45/26 darj hui. ' +
    'Unhone 2 lakh ka muavza claim kiya hai.';

  beforeEach(async () => {
    await redis.flushall();
    await AppSetting.create({ key: 'ai.intake_model', value: MODEL });
    await AppSetting.create({ key: 'feature.describe_first', value: 'on' });
    await AppSetting.create({
      key: `ai.rates.${MODEL}`,
      value: JSON.stringify({ input_usd_per_mtok: 1, output_usd_per_mtok: 5 }),
    });
  });

  const calls = () => mockMessagesStream.mock.calls.map((c) => c[0] as SdkStreamParams);

  it('pack path: match keeps 300, Reception sends the resolved cap (5200)', async () => {
    await AppSetting.create({ key: KEY, value: '5200' });
    mockMessagesStream
      .mockResolvedValueOnce(sdkAnswer(MATCH_MACT, 900, 120))
      .mockResolvedValueOnce(sdkAnswer(EMPTY_READ, 900, 120));
    const res = await runBriefIntake({ userId: USER_ID, plan: 'free', description: DESC });
    expect(res.outcome).toBe('brief');
    const c = calls();
    expect(c[0].max_tokens).toBe(INTAKE_LIMITS.matchMaxTokens);
    expect(c[0].max_tokens).toBe(300);
    expect(c[1].max_tokens).toBe(5200);
  });

  it('pack path: default 4000 when the key is not set', async () => {
    mockMessagesStream.mockResolvedValueOnce(sdkAnswer(EMPTY_READ, 900, 120));
    await runBriefIntake({ userId: USER_ID, plan: 'free', description: DESC, kind: 'mact_claim' });
    expect(calls()).toHaveLength(1);
    expect(calls()[0].max_tokens).toBe(4000);
  });

  it('guided path (kind none): Reception sends the resolved cap (5200)', async () => {
    await AppSetting.create({ key: KEY, value: '5200' });
    mockMessagesStream.mockResolvedValueOnce(sdkAnswer(GUIDED, 900, 120));
    await runBriefIntake({ userId: USER_ID, plan: 'free', description: DESC, kind: 'none' });
    expect(calls()).toHaveLength(1);
    expect(calls()[0].max_tokens).toBe(5200);
  });

  it('guided path: default 4000, and an invalid value falls back to 4000', async () => {
    mockMessagesStream.mockResolvedValueOnce(sdkAnswer(GUIDED, 900, 120));
    await runBriefIntake({ userId: USER_ID, plan: 'free', description: DESC, kind: 'none' });
    expect(calls()[0].max_tokens).toBe(4000);

    await setAppSetting({ key: KEY, value: '99999' });
    mockMessagesStream.mockReset();
    mockMessagesStream.mockResolvedValueOnce(sdkAnswer(GUIDED, 900, 120));
    await runBriefIntake({
      userId: USER_ID,
      plan: 'free',
      description: DESC + ' x',
      kind: 'none',
    });
    expect(calls()[0].max_tokens).toBe(4000);
  });

  it('the reception cap does not change the extract cap on the same request', async () => {
    await AppSetting.create({ key: 'feature.fact_ledger', value: 'on' });
    await AppSetting.create({ key: KEY, value: '5200' });
    mockMessagesStream
      .mockResolvedValueOnce(sdkAnswer(MATCH_MACT, 900, 120))
      .mockResolvedValueOnce(sdkAnswer(EMPTY_READ, 900, 120))
      .mockResolvedValueOnce(sdkAnswer(JSON.stringify({ facts: [] }), 900, 120));
    await runBriefIntake({ userId: USER_ID, plan: 'free', description: DESC });
    const c = calls();
    expect(c).toHaveLength(3);
    expect(c[1].max_tokens).toBe(5200);
    expect(c[2].max_tokens).toBe(3000);
  });

  it('fill keeps 1500 and is not affected by the reception cap', async () => {
    await AppSetting.create({ key: KEY, value: '5200' });
    mockMessagesStream.mockResolvedValueOnce(sdkAnswer(JSON.stringify({ fields: [] }), 900, 120));
    await runIntake({
      userId: USER_ID,
      plan: 'free',
      description: DESC,
      templateId: 'mact_claim',
    });
    expect(calls()).toHaveLength(1);
    expect(calls()[0].max_tokens).toBe(INTAKE_LIMITS.fillMaxTokens);
    expect(calls()[0].max_tokens).toBe(1500);
  });
});

/**
 * T-453 follow-up — getIntakeExtractCap: ai.cap.intake_extract, default 3000,
 * whole number in 500-8000, key-only warn, 60 s cache, invalidation. The
 * extractCall wiring is tested in t147b-ledger.test.ts. Time stubbed via Date.now.
 */
import './setupEnv';
import './setupDb';

import logger from '../config/logger';
import { AppSetting } from '../models/AppSetting.model';
import {
  _clearAppSettingsCache,
  APP_SETTING_KEYS,
  setAppSetting,
} from '../services/app-settings.service';
import {
  getIntakeExtractCap,
  INTAKE_EXTRACT_CAP_DEFAULT,
  INTAKE_EXTRACT_CAP_MAX,
  INTAKE_EXTRACT_CAP_MIN,
} from '../services/llm-usage';

const KEY = 'ai.cap.intake_extract';
let now = 1_800_000_000_000;
let findOne: jest.SpyInstance;
let warn: jest.SpyInstance;
const reads = () =>
  findOne.mock.calls.filter((c) => (c[0] as { key?: string })?.key === KEY).length;

beforeEach(() => {
  now = 1_800_000_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  _clearAppSettingsCache();
  findOne = jest.spyOn(AppSetting, 'findOne');
  warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('getIntakeExtractCap', () => {
  it('constants and key', () => {
    expect(APP_SETTING_KEYS.CAP_INTAKE_EXTRACT).toBe(KEY);
    expect([INTAKE_EXTRACT_CAP_DEFAULT, INTAKE_EXTRACT_CAP_MIN, INTAKE_EXTRACT_CAP_MAX]).toEqual([
      3000, 500, 8000,
    ]);
  });

  it('is 3000 when the key is missing, with no warn', async () => {
    expect(await getIntakeExtractCap()).toBe(3000);
    expect(warn).not.toHaveBeenCalled();
  });

  it('is 3000 when the settings read fails', async () => {
    jest.spyOn(AppSetting, 'findOne').mockImplementation(() => {
      throw new Error('db down');
    });
    expect(await getIntakeExtractCap()).toBe(3000);
  });

  it.each([
    ['500', 500],
    ['4200', 4200],
    ['8000', 8000],
    [' 6000 ', 6000],
  ])('uses a valid value %p', async (value, want) => {
    await AppSetting.create({ key: KEY, value });
    expect(await getIntakeExtractCap()).toBe(want);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(['499', '8001', '0', '-1', '1500.5', '3e3', 'abc', '12abc', '٣٠٠٠'])(
    'falls back to 3000 with a key-only warn for %p',
    async (value) => {
      await AppSetting.create({ key: KEY, value });
      expect(await getIntakeExtractCap()).toBe(3000);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toEqual({ key: KEY });
      if (value.length > 2) expect(JSON.stringify(warn.mock.calls)).not.toContain(value);
    },
  );

  it('reads once per 60 s (missing key included), warns once per period, re-reads after', async () => {
    await AppSetting.create({ key: KEY, value: 'bad' });
    for (let i = 0; i < 4; i++) expect(await getIntakeExtractCap()).toBe(3000);
    expect(reads()).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
    await AppSetting.updateOne({ key: KEY }, { value: '5000' });
    now += 59_000;
    expect(await getIntakeExtractCap()).toBe(3000); // still cached
    now += 2_000;
    expect(await getIntakeExtractCap()).toBe(5000);
    expect(reads()).toBeGreaterThanOrEqual(2);
  });

  it("setAppSetting('ai.cap.intake_extract') invalidates the cache", async () => {
    expect(await getIntakeExtractCap()).toBe(3000);
    await setAppSetting({ key: KEY, value: '7000' });
    expect(await getIntakeExtractCap()).toBe(7000);
  });

  it('an effort-key write leaves the cap cache alone', async () => {
    await getIntakeExtractCap();
    const before = reads();
    await setAppSetting({ key: 'ai.effort.body', value: 'high' });
    await getIntakeExtractCap();
    expect(reads()).toBe(before);
  });

  it('_clearAppSettingsCache invalidates the cache', async () => {
    await getIntakeExtractCap();
    await AppSetting.create({ key: KEY, value: '800' });
    expect(await getIntakeExtractCap()).toBe(3000); // cached
    _clearAppSettingsCache();
    expect(await getIntakeExtractCap()).toBe(800);
  });
});

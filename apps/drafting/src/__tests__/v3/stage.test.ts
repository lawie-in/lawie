/**
 * T-683 phase 1: services/v3/stage.ts. The AppSetting read is mocked; no DB.
 */
import '../setupEnv';

const mockSetting = jest.fn();
jest.mock('../../services/app-settings.service', () => ({
  ...jest.requireActual('../../services/app-settings.service'),
  getAppSetting: (...a: unknown[]) => mockSetting(...a),
}));
jest.mock('../../config/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import logger from '../../config/logger';
import { GOLDEN_SET_USER_ID } from '../../services/run-origin';
import {
  _clearV3StageCache,
  DRAFTING_V3_STAGE_SETTING,
  setFixtureV3Stage,
  v3Stage,
} from '../../services/v3/stage';

const REAL_USER = '64b000000000000000000001';

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  _clearV3StageCache();
  setFixtureV3Stage(null);
  mockSetting.mockRejectedValue(new Error('missing'));
});

describe('v3Stage: the setting', () => {
  it('reads feature.drafting_v3_stage', async () => {
    mockSetting.mockResolvedValue('1');
    await v3Stage(REAL_USER);
    expect(mockSetting).toHaveBeenCalledWith('feature.drafting_v3_stage');
    expect(DRAFTING_V3_STAGE_SETTING).toBe('feature.drafting_v3_stage');
  });

  it.each([
    ['0', 0],
    ['1', 1],
    ['2', 2],
    ['3', 3],
    [' 2 ', 2],
    ['3\n', 3],
  ])('value %j gives stage %i', async (raw, stage) => {
    mockSetting.mockResolvedValue(raw);
    expect(await v3Stage(REAL_USER)).toBe(stage);
  });

  it.each(['4', '-1', 'true', 'on', '', '  ', '1.5', '01', '10', 'one'])(
    'a bad value %j gives 0',
    async (raw) => {
      mockSetting.mockResolvedValue(raw);
      expect(await v3Stage(REAL_USER)).toBe(0);
    },
  );

  it('a missing setting (the read throws) gives 0', async () => {
    mockSetting.mockRejectedValue(new Error('AppSettingMissingError'));
    expect(await v3Stage(REAL_USER)).toBe(0);
  });

  it('a non-string value gives 0', async () => {
    mockSetting.mockResolvedValue(2);
    expect(await v3Stage(REAL_USER)).toBe(0);
  });

  it('no user id still reads the setting', async () => {
    mockSetting.mockResolvedValue('2');
    expect(await v3Stage(undefined)).toBe(2);
  });

  it('an invalid value logs a warning naming the setting, never the value', async () => {
    mockSetting.mockResolvedValue('SECRET-BAD-VALUE');
    await v3Stage(REAL_USER);
    const warn = logger.warn as jest.Mock;
    expect(warn).toHaveBeenCalledTimes(1);
    const all = JSON.stringify(warn.mock.calls);
    expect(all).toContain('feature.drafting_v3_stage');
    expect(all).not.toContain('SECRET-BAD-VALUE');
  });
});

describe('v3Stage: the 60 s cache', () => {
  it('reads once within 60 s, including when the setting is missing', async () => {
    mockSetting.mockRejectedValue(new Error('missing'));
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    await v3Stage(REAL_USER);
    await v3Stage(REAL_USER);
    now.mockReturnValue(1_000_000 + 59_000);
    await v3Stage(REAL_USER);
    expect(mockSetting).toHaveBeenCalledTimes(1);
  });

  it('reads again after 60 s', async () => {
    mockSetting.mockResolvedValue('1');
    const now = jest.spyOn(Date, 'now').mockReturnValue(2_000_000);
    expect(await v3Stage(REAL_USER)).toBe(1);
    mockSetting.mockResolvedValue('3');
    now.mockReturnValue(2_000_000 + 60_001);
    expect(await v3Stage(REAL_USER)).toBe(3);
    expect(mockSetting).toHaveBeenCalledTimes(2);
  });

  it('_clearV3StageCache forgets the cached value', async () => {
    mockSetting.mockResolvedValue('1');
    await v3Stage(REAL_USER);
    mockSetting.mockResolvedValue('2');
    _clearV3StageCache();
    expect(await v3Stage(REAL_USER)).toBe(2);
  });
});

describe('v3Stage: the golden-set fixture user', () => {
  it('is 0 unless set, whatever the setting says', async () => {
    mockSetting.mockResolvedValue('3');
    expect(await v3Stage(GOLDEN_SET_USER_ID)).toBe(0);
    expect(await v3Stage(GOLDEN_SET_USER_ID.toUpperCase())).toBe(0);
    expect(mockSetting).not.toHaveBeenCalled();
  });

  it('follows setFixtureV3Stage, and only for the fixture user', async () => {
    mockSetting.mockResolvedValue('0');
    setFixtureV3Stage(2);
    expect(await v3Stage(GOLDEN_SET_USER_ID)).toBe(2);
    expect(await v3Stage(REAL_USER)).toBe(0);
    expect(await v3Stage(undefined)).toBe(0);
  });

  it('a cleared override is 0 again, and an invalid stage is ignored', async () => {
    setFixtureV3Stage(3);
    expect(await v3Stage(GOLDEN_SET_USER_ID)).toBe(3);
    setFixtureV3Stage(null);
    expect(await v3Stage(GOLDEN_SET_USER_ID)).toBe(0);
    setFixtureV3Stage(7 as never);
    expect(await v3Stage(GOLDEN_SET_USER_ID)).toBe(0);
  });

  it('a real user cannot be raised by the fixture override', async () => {
    mockSetting.mockResolvedValue('1');
    setFixtureV3Stage(3);
    expect(await v3Stage(REAL_USER)).toBe(1);
  });
});

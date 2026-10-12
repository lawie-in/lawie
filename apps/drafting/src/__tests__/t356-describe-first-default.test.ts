/**
 * T-356 part 1: describe-first is on by default for every user.
 * A switch's admin setting is 'on' or 'off' (Arjun's AC3 ruling). Missing, or any
 * other value, falls to the code default (env FEATURE_DEFAULT_*), and the latter
 * logs one warning that names the setting and never the value.
 */
import './setupDb';

import logger from '../config/logger';
import { env } from '../config/env';
import { AppSetting } from '../models/AppSetting.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { isDescribeFirstEnabled, isFactLedgerEnabled } from '../services/intake.service';
import { GOLDEN_SET_USER_ID } from '../services/run-origin';

const USER = '507f1f77bcf86cd799439071';
const OTHER = '507f1f77bcf86cd799439072';
const DF = 'feature.describe_first';
const FL = 'feature.fact_ledger';

type Mutable = { FEATURE_DEFAULT_DESCRIBE_FIRST: string; FEATURE_DEFAULT_FACT_LEDGER: string };
const e = env as unknown as Mutable;
const saved = { ...e };

let warn: jest.SpyInstance;

beforeEach(() => {
  _clearAppSettingsCache();
  warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
  Object.assign(e, saved);
});

describe('T-356 code defaults (env schema, as loaded by the test run)', () => {
  it('AC1/AC4: FEATURE_DEFAULT_DESCRIBE_FIRST is on and FEATURE_DEFAULT_FACT_LEDGER is off when unset', () => {
    const prev = { ...process.env };
    delete process.env.FEATURE_DEFAULT_DESCRIBE_FIRST;
    delete process.env.FEATURE_DEFAULT_FACT_LEDGER;
    try {
      let loaded: typeof import('../config/env') | undefined;
      jest.isolateModules(() => {
        loaded = require('../config/env');
      });
      expect(loaded!.env.FEATURE_DEFAULT_DESCRIBE_FIRST).toBe('on');
      expect(loaded!.env.FEATURE_DEFAULT_FACT_LEDGER).toBe('off');
    } finally {
      process.env = prev;
    }
  });
});

describe('AC1 + AC4: no AppSetting doc, real env defaults', () => {
  it('describe-first is on for every user, new or existing', async () => {
    e.FEATURE_DEFAULT_DESCRIBE_FIRST = 'on';
    expect(await isDescribeFirstEnabled(USER)).toBe(true);
    expect(await isDescribeFirstEnabled(OTHER)).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it('the ledger stays off by default', async () => {
    e.FEATURE_DEFAULT_FACT_LEDGER = 'off';
    expect(await isFactLedgerEnabled(USER)).toBe(false);
    expect(await isFactLedgerEnabled(OTHER)).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it('the suite env itself has describe-first on and the ledger off', async () => {
    expect(await isDescribeFirstEnabled(USER)).toBe(true);
    expect(await isFactLedgerEnabled(USER)).toBe(false);
  });
});

describe('AC2: explicit admin setting', () => {
  it("'off' wins over an on default (kill switch)", async () => {
    e.FEATURE_DEFAULT_DESCRIBE_FIRST = 'on';
    await AppSetting.create({ key: DF, value: 'off' });
    expect(await isDescribeFirstEnabled(USER)).toBe(false);
    expect(await isDescribeFirstEnabled(OTHER)).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it("'on' is on, even with the default off", async () => {
    e.FEATURE_DEFAULT_DESCRIBE_FIRST = 'off';
    await AppSetting.create({ key: DF, value: 'on' });
    expect(await isDescribeFirstEnabled(USER)).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it('a read error other than missing stays off, with the default on', async () => {
    e.FEATURE_DEFAULT_DESCRIBE_FIRST = 'on';
    jest.spyOn(AppSetting, 'findOne').mockImplementation((() => {
      throw new Error('mongo down');
    }) as never);
    expect(await isDescribeFirstEnabled(USER)).toBe(false);
  });

  it('the fixture user is on with default off, with an off setting, and on a read error', async () => {
    e.FEATURE_DEFAULT_DESCRIBE_FIRST = 'off';
    expect(await isDescribeFirstEnabled(GOLDEN_SET_USER_ID)).toBe(true);
    await AppSetting.create({ key: DF, value: 'off' });
    expect(await isDescribeFirstEnabled(GOLDEN_SET_USER_ID)).toBe(true);
    jest.spyOn(AppSetting, 'findOne').mockImplementation((() => {
      throw new Error('mongo down');
    }) as never);
    expect(await isDescribeFirstEnabled(GOLDEN_SET_USER_ID)).toBe(true);
  });
});

describe.each([
  {
    name: 'describe-first',
    key: DF,
    envKey: 'FEATURE_DEFAULT_DESCRIBE_FIRST',
    read: isDescribeFirstEnabled,
  },
  {
    name: 'fact-ledger',
    key: FL,
    envKey: 'FEATURE_DEFAULT_FACT_LEDGER',
    read: isFactLedgerEnabled,
  },
] as const)('AC3: $name accepts only on/off', ({ key, envKey, read }) => {
  const setDefault = (v: 'on' | 'off') => {
    e[envKey] = v;
  };

  it.each(['on', 'off'] as const)(
    'a list value falls to the code default (%s) for everyone',
    async (def) => {
      setDefault(def);
      await AppSetting.create({ key, value: `${USER}, ${OTHER}` });
      expect(await read(USER)).toBe(def === 'on');
      expect(await read(OTHER)).toBe(def === 'on');
    },
  );

  it('a list value logs ONE warning naming the setting, with no value or user id', async () => {
    setDefault('on');
    await AppSetting.create({ key, value: `${USER}, ${OTHER}` });
    await read(USER);
    expect(warn).toHaveBeenCalledTimes(1);
    const dump = JSON.stringify(warn.mock.calls);
    expect(dump).toContain(key);
    expect(dump).not.toContain(USER);
    expect(dump).not.toContain(OTHER);
    expect(dump).not.toContain('507f1f77');
  });

  it.each(['yes', 'ON', 'Off', 'true', 'someone'])(
    'a typo (%s) falls to the default and warns without the value',
    async (bad) => {
      setDefault('on');
      await AppSetting.create({ key, value: bad });
      expect(await read(USER)).toBe(true);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(warn.mock.calls)).toContain(key);
      expect(JSON.stringify(warn.mock.calls)).not.toContain(`"${bad}"`);
    },
  );

  it.each(['', '   '])('an empty value (%j) falls to the default and warns', async (empty) => {
    setDefault('on');
    // The model rejects an empty value, so write past it (a hand-edited doc).
    await AppSetting.collection.insertOne({ key, value: empty });
    expect(await read(USER)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).toContain(key);

    _clearAppSettingsCache();
    warn.mockClear();
    setDefault('off');
    expect(await read(USER)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('missing doc: the default, and no warning', async () => {
    setDefault('on');
    expect(await read(USER)).toBe(true);
    setDefault('off');
    expect(await read(USER)).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it('on and off are exact: no warning', async () => {
    setDefault('off');
    await AppSetting.create({ key, value: 'on' });
    expect(await read(USER)).toBe(true);
    await AppSetting.updateOne({ key }, { value: 'off' });
    _clearAppSettingsCache();
    setDefault('on');
    expect(await read(USER)).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it('the fixture user does not trigger a warning', async () => {
    await AppSetting.create({ key, value: USER });
    expect(await read(GOLDEN_SET_USER_ID)).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });
});

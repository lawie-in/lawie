/**
 * T-283 AC3: FEATURE_DEFAULT_DESCRIBE_FIRST / FEATURE_DEFAULT_FACT_LEDGER are
 * the fallback for the two feature switches, used ONLY when the AppSetting doc
 * is missing. A DB value always wins; any other read error stays off; the
 * fixture-user rule stays first.
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import { env } from '../config/env';
import { AppSetting } from '../models/AppSetting.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { isDescribeFirstEnabled, isFactLedgerEnabled } from '../services/intake.service';
import { GOLDEN_SET_USER_ID } from '../services/run-origin';

const USER = '507f1f77bcf86cd799439061';
const OTHER = '507f1f77bcf86cd799439062';

type Mutable = { FEATURE_DEFAULT_DESCRIBE_FIRST: string; FEATURE_DEFAULT_FACT_LEDGER: string };
const e = env as unknown as Mutable;
const saved = { ...e };

function setEnv(df: string | undefined, fl: string | undefined) {
  e.FEATURE_DEFAULT_DESCRIBE_FIRST = df as string;
  e.FEATURE_DEFAULT_FACT_LEDGER = fl as string;
}

const SWITCHES = [
  {
    name: 'describe-first',
    key: 'feature.describe_first',
    envKey: 'DF',
    read: isDescribeFirstEnabled,
  },
  { name: 'fact-ledger', key: 'feature.fact_ledger', envKey: 'FL', read: isFactLedgerEnabled },
] as const;

function envOnlyFor(which: 'DF' | 'FL') {
  setEnv(which === 'DF' ? 'on' : 'off', which === 'FL' ? 'on' : 'off');
}

beforeEach(() => {
  _clearAppSettingsCache();
  setEnv('off', 'off');
});
afterEach(() => {
  jest.restoreAllMocks();
  Object.assign(e, saved);
});

describe.each(SWITCHES)('$name switch env default', ({ key, envKey, read }) => {
  it('missing setting + env on -> on', async () => {
    envOnlyFor(envKey);
    expect(await read(USER)).toBe(true);
  });

  it('missing setting + env off -> off', async () => {
    setEnv('off', 'off');
    expect(await read(USER)).toBe(false);
  });

  it('missing setting + env unset -> off', async () => {
    setEnv(undefined, undefined);
    expect(await read(USER)).toBe(false);
  });

  it("setting 'off' + env on -> off (DB wins)", async () => {
    envOnlyFor(envKey);
    await AppSetting.create({ key, value: 'off' });
    expect(await read(USER)).toBe(false);
  });

  it("setting 'on' + env off -> on (DB wins)", async () => {
    setEnv('off', 'off');
    await AppSetting.create({ key, value: 'on' });
    expect(await read(USER)).toBe(true);
  });

  it('legacy user-list setting + env on -> code default (on) for everyone, T-356', async () => {
    envOnlyFor(envKey);
    await AppSetting.create({ key, value: `someone, ${USER}` });
    expect(await read(USER)).toBe(true);
    expect(await read(OTHER)).toBe(true);
  });

  it('legacy user-list setting + env off -> code default (off) for everyone, T-356', async () => {
    setEnv('off', 'off');
    await AppSetting.create({ key, value: `someone, ${USER}` });
    expect(await read(USER)).toBe(false);
    expect(await read(OTHER)).toBe(false);
  });

  it('non-missing read error + env on -> off (fail closed)', async () => {
    envOnlyFor(envKey);
    jest.spyOn(AppSetting, 'findOne').mockImplementation((() => {
      throw new Error('mongo down');
    }) as never);
    expect(await read(USER)).toBe(false);
  });

  it('non-missing read error (rejecting query) + env on -> off', async () => {
    envOnlyFor(envKey);
    jest.spyOn(AppSetting, 'findOne').mockReturnValue({
      lean: () => Promise.reject(new Error('mongo down')),
      then: (_res: unknown, rej: (e: Error) => void) => rej(new Error('mongo down')),
    } as never);
    expect(await read(USER)).toBe(false);
  });

  it('fixture user is on with env off and no setting', async () => {
    setEnv('off', 'off');
    expect(await read(GOLDEN_SET_USER_ID)).toBe(true);
  });

  it('fixture user is on even when the DB says off', async () => {
    await AppSetting.create({ key, value: 'off' });
    expect(await read(GOLDEN_SET_USER_ID)).toBe(true);
  });
});

describe('each switch reads its own env key', () => {
  it('DF on + FL off -> describe-first on, fact-ledger off', async () => {
    setEnv('on', 'off');
    expect(await isDescribeFirstEnabled(USER)).toBe(true);
    expect(await isFactLedgerEnabled(USER)).toBe(false);
  });

  it('DF off + FL on -> describe-first off, fact-ledger on', async () => {
    setEnv('off', 'on');
    expect(await isDescribeFirstEnabled(USER)).toBe(false);
    expect(await isFactLedgerEnabled(USER)).toBe(true);
  });

  it('a DB value for one switch does not change the other switch env fallback', async () => {
    setEnv('on', 'on');
    await AppSetting.create({ key: 'feature.describe_first', value: 'off' });
    expect(await isDescribeFirstEnabled(USER)).toBe(false);
    expect(await isFactLedgerEnabled(USER)).toBe(true);
  });
});

describe('GET /intake/enabled with the env default', () => {
  const get = () =>
    request(app).get('/intake/enabled').set({
      'x-internal-secret': process.env.INTERNAL_SECRET!,
      'x-user-id': USER,
      'x-user-email': 'test@test.com',
      'x-user-name': 'Test',
      'x-user-plan': 'free',
      'x-user-role': 'Client',
    });

  it('missing setting + env on -> enabled true; DB off wins', async () => {
    setEnv('on', 'off');
    expect((await get()).body).toEqual({ enabled: true });
    await AppSetting.create({ key: 'feature.describe_first', value: 'off' });
    _clearAppSettingsCache();
    expect((await get()).body).toEqual({ enabled: false });
  });

  it('missing setting + env off -> enabled false', async () => {
    setEnv('off', 'off');
    expect((await get()).body).toEqual({ enabled: false });
  });
});

describe('env schema validation', () => {
  const load = (df?: string, fl?: string) => {
    const prev = { ...process.env };
    if (df === undefined) delete process.env.FEATURE_DEFAULT_DESCRIBE_FIRST;
    else process.env.FEATURE_DEFAULT_DESCRIBE_FIRST = df;
    if (fl === undefined) delete process.env.FEATURE_DEFAULT_FACT_LEDGER;
    else process.env.FEATURE_DEFAULT_FACT_LEDGER = fl;
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      let loaded: typeof import('../config/env') | undefined;
      let thrown: unknown;
      jest.isolateModules(() => {
        try {
          loaded = require('../config/env');
        } catch (err) {
          thrown = err;
        }
      });
      return { loaded, thrown, exited: exit.mock.calls.length > 0 };
    } finally {
      process.env = prev;
    }
  };

  it('unset keys: describe-first defaults to on (T-356), fact-ledger to off', () => {
    const r = load(undefined, undefined);
    expect(r.exited).toBe(false);
    expect(r.loaded!.env.FEATURE_DEFAULT_DESCRIBE_FIRST).toBe('on');
    expect(r.loaded!.env.FEATURE_DEFAULT_FACT_LEDGER).toBe('off');
  });

  it("'on' is accepted", () => {
    const r = load('on', 'on');
    expect(r.exited).toBe(false);
    expect(r.loaded!.env.FEATURE_DEFAULT_DESCRIBE_FIRST).toBe('on');
  });

  it("an invalid value ('yes') fails env loading", () => {
    expect(load('yes', 'off').exited).toBe(true);
    expect(load('off', 'yes').exited).toBe(true);
  });
});

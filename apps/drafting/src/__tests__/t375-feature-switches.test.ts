/**
 * T-375 part 1 - the three v1-scope switches (feature.tool_timeline,
 * feature.tool_bail_checker, feature.template_civil_plaint), all off in code.
 *
 * Covers: the T-356 reader unchanged; the tool switches served from the last
 * known value (Arjun's Mongo-outage ruling); the tool routes 404 while off;
 * GET /sections/features; the plaint switch over the whole civil_plaints_suits
 * category and the legacy docType 'plaint'; describe-first never offering a hidden
 * plaint; POST /intake/answers and /intake/brief/update returning 404 for one.
 *
 * getAppSetting is a jest.fn that falls through to the real in-memory Mongo unless a
 * test stubs a key. The model SDK is faked, as in the other intake suites.
 */
import './setupDb';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';

import app from '../app';
import { env } from '../config/env';
import logger from '../config/logger';
import redis from '../config/redis';
import { DOC_TYPE_ALIASES, TEMPLATE_CATALOGUE } from '../config/catalogue';
import { AppSetting } from '../models/AppSetting.model';
import { FactLedgerModel } from '../models/FactLedger.model';
import { AppSettingMissingError, getAppSetting } from '../services/app-settings.service';
import {
  _resetToolSwitches,
  CIVIL_PLAINT_CATEGORY,
  DESCRIBE_FIRST_SETTING,
  hiddenTemplateIds,
  isFeatureOn,
  isSwitchOn,
  isTemplateEnabled,
  lastKnownSwitch,
  primeToolSwitches,
  TEMPLATE_CIVIL_PLAINT_SETTING,
  TEMPLATE_NOT_FOUND,
  templateGuard,
  TOOL_BAIL_CHECKER_SETTING,
  TOOL_SWITCH_REFRESH_MS,
  TOOL_TIMELINE_SETTING,
  toolGuard,
} from '../services/feature-switches';
import { FACT_LEDGER_SETTING } from '../services/fact-ledger.service';
import { getCatalogue, getEnabledCatalogue } from '../services/intake.service';
import { GOLDEN_SET_USER_ID } from '../services/run-origin';
import { sdkAnswer } from './sdkStream';

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);

jest.mock('../services/app-settings.service', () => {
  const actual = jest.requireActual('../services/app-settings.service');
  return { ...actual, getAppSetting: jest.fn(actual.getAppSetting) };
});

const realGet = jest.requireActual('../services/app-settings.service')
  .getAppSetting as typeof getAppSetting;
const mockGet = getAppSetting as unknown as jest.Mock;

// ── Helpers ─────────────────────────────────────────────────────────────────

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd799439375';
const MODEL = 'claude-haiku-4-5-20251001';
const INTAKE_ID = '75757575-7575-4575-8575-757575757575';

function headers(userId = USER_ID) {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': userId,
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  };
}

const MISSING = Symbol('missing');
const THROW = Symbol('throw');
type Stub = string | typeof MISSING | typeof THROW | 'hang';

/** Stub some keys of getAppSetting; any other key still reads the real in-memory Mongo. */
function stub(map: Record<string, Stub>): void {
  mockGet.mockImplementation((key: string) => {
    const v = map[key];
    if (v === undefined) return realGet(key);
    if (v === MISSING) return Promise.reject(new AppSettingMissingError(key));
    if (v === THROW) return Promise.reject(new Error('mongo is down'));
    if (v === 'hang') return new Promise<string>(() => undefined);
    return Promise.resolve(v);
  });
}

const flush = () => new Promise<void>((r) => setImmediate(r));
const callsFor = (key: string) => mockGet.mock.calls.filter((c) => c[0] === key).length;

let warn: jest.SpyInstance;
const warnsFor = (setting: string) =>
  warn.mock.calls.filter((c) => (c[0] as { setting?: string } | undefined)?.setting === setting);

const PLAINT_IDS = Object.keys(TEMPLATE_CATALOGUE)
  .filter((id) => TEMPLATE_CATALOGUE[id].category === CIVIL_PLAINT_CATEGORY)
  .sort();
const PLAINT_ID = PLAINT_IDS[0];

const e = env as unknown as {
  FEATURE_DEFAULT_DESCRIBE_FIRST: string;
  FEATURE_DEFAULT_FACT_LEDGER: string;
};
const savedEnv = { ...e };

beforeEach(async () => {
  mockMessagesStream.mockReset();
  mockGet.mockReset();
  mockGet.mockImplementation(realGet);
  _resetToolSwitches();
  await redis.flushall();
  warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  Object.assign(e, savedEnv);
});

// ── isSwitchOn regression (T-356 rules, unchanged) ──────────────────────────

describe('isSwitchOn: the T-356 rules are unchanged', () => {
  it.each([DESCRIBE_FIRST_SETTING, FACT_LEDGER_SETTING])(
    '%s: on and off are honoured',
    async (s) => {
      stub({ [s]: 'on' });
      expect(await isSwitchOn(s, USER_ID)).toBe(true);
      stub({ [s]: 'off' });
      expect(await isSwitchOn(s, USER_ID)).toBe(false);
      stub({ [s]: ' on ' });
      expect(await isSwitchOn(s, USER_ID)).toBe(true);
    },
  );

  it('a missing doc gives the env default: describe_first on, fact_ledger off', async () => {
    e.FEATURE_DEFAULT_DESCRIBE_FIRST = 'on';
    e.FEATURE_DEFAULT_FACT_LEDGER = 'off';
    stub({ [DESCRIBE_FIRST_SETTING]: MISSING, [FACT_LEDGER_SETTING]: MISSING });
    expect(await isSwitchOn(DESCRIBE_FIRST_SETTING, USER_ID)).toBe(true);
    expect(await isSwitchOn(FACT_LEDGER_SETTING, USER_ID)).toBe(false);
    e.FEATURE_DEFAULT_DESCRIBE_FIRST = 'off';
    e.FEATURE_DEFAULT_FACT_LEDGER = 'on';
    expect(await isSwitchOn(DESCRIBE_FIRST_SETTING, USER_ID)).toBe(false);
    expect(await isSwitchOn(FACT_LEDGER_SETTING, USER_ID)).toBe(true);
  });

  it('a value other than on/off gives the env default and warns once with only the setting name', async () => {
    e.FEATURE_DEFAULT_DESCRIBE_FIRST = 'on';
    stub({ [DESCRIBE_FIRST_SETTING]: 'user1,user2' });
    expect(await isSwitchOn(DESCRIBE_FIRST_SETTING, USER_ID)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toEqual({ setting: DESCRIBE_FIRST_SETTING });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('user1');
  });

  it('a read error other than a missing doc is off (fail closed), even where the env default is on', async () => {
    e.FEATURE_DEFAULT_DESCRIBE_FIRST = 'on';
    stub({ [DESCRIBE_FIRST_SETTING]: THROW });
    expect(await isSwitchOn(DESCRIBE_FIRST_SETTING, USER_ID)).toBe(false);
  });

  it('the fixture user is on whatever the setting says, but only when a userId is given', async () => {
    stub({ [DESCRIBE_FIRST_SETTING]: 'off', [FACT_LEDGER_SETTING]: THROW });
    expect(await isSwitchOn(DESCRIBE_FIRST_SETTING, GOLDEN_SET_USER_ID)).toBe(true);
    expect(await isSwitchOn(FACT_LEDGER_SETTING, GOLDEN_SET_USER_ID)).toBe(true);
    expect(await isSwitchOn(DESCRIBE_FIRST_SETTING, USER_ID)).toBe(false);
    expect(await isSwitchOn(DESCRIBE_FIRST_SETTING)).toBe(false);
  });

  it('the three T-375 switches have no env default: missing doc is off', async () => {
    e.FEATURE_DEFAULT_DESCRIBE_FIRST = 'on';
    e.FEATURE_DEFAULT_FACT_LEDGER = 'on';
    for (const s of [
      TOOL_TIMELINE_SETTING,
      TOOL_BAIL_CHECKER_SETTING,
      TEMPLATE_CIVIL_PLAINT_SETTING,
    ]) {
      stub({ [s]: MISSING });
      expect(await isSwitchOn(s)).toBe(false);
      expect(await isFeatureOn(s)).toBe(false);
    }
  });
});

// ── The tool cache ──────────────────────────────────────────────────────────

describe('tool switches: the last known value', () => {
  const S = TOOL_BAIL_CHECKER_SETTING;
  const T0 = 1_000_000;

  it('is off before the first read finishes, even though the setting is on', async () => {
    stub({ [S]: 'on' });
    expect(lastKnownSwitch(S)).toBe(false);
    await flush();
    expect(lastKnownSwitch(S)).toBe(true);
  });

  it('is off when there has been no read at all and the request path starts one', () => {
    stub({ [S]: 'on' });
    expect(lastKnownSwitch(S)).toBe(false);
    expect(callsFor(S)).toBe(1);
  });

  it.each([
    ['a missing doc', MISSING as Stub],
    ['a garbage value', 'enabled' as Stub],
    ['off', 'off' as Stub],
    ['an empty string', '' as Stub],
  ])('stays off after a successful read of %s', async (_n, v) => {
    stub({ [S]: v });
    await primeToolSwitches();
    expect(lastKnownSwitch(S)).toBe(false);
  });

  it('is on after an on setting and a prime; each tool has its own value', async () => {
    stub({ [S]: 'on', [TOOL_TIMELINE_SETTING]: 'off' });
    await primeToolSwitches();
    expect(lastKnownSwitch(S)).toBe(true);
    expect(lastKnownSwitch(TOOL_TIMELINE_SETTING)).toBe(false);
  });

  it('a missing doc after an on read turns it off (a successful read, not an error)', async () => {
    stub({ [S]: 'on' });
    await primeToolSwitches(T0);
    stub({ [S]: MISSING });
    await primeToolSwitches(T0 + TOOL_SWITCH_REFRESH_MS);
    expect(lastKnownSwitch(S, T0 + TOOL_SWITCH_REFRESH_MS + 1)).toBe(false);
  });

  it('a failed refresh keeps an on value; the warn fires once, not again on a second failure', async () => {
    stub({ [S]: 'on' });
    await primeToolSwitches(T0);
    stub({ [S]: THROW });
    await primeToolSwitches(T0 + 61_000);
    expect(lastKnownSwitch(S, T0 + 61_001)).toBe(true);
    expect(warnsFor(S)).toHaveLength(1);
    expect(warnsFor(S)[0][0]).toEqual({ setting: S });

    await primeToolSwitches(T0 + 122_000);
    expect(lastKnownSwitch(S, T0 + 122_001)).toBe(true);
    expect(warnsFor(S)).toHaveLength(1);
  });

  it('a failed refresh started from the request path also keeps the value', async () => {
    stub({ [S]: 'on' });
    await primeToolSwitches(T0);
    stub({ [S]: THROW });
    expect(lastKnownSwitch(S, T0 + TOOL_SWITCH_REFRESH_MS)).toBe(true);
    await flush();
    expect(lastKnownSwitch(S, T0 + TOOL_SWITCH_REFRESH_MS + 1)).toBe(true);
    expect(warnsFor(S)).toHaveLength(1);
  });

  it('the warn resets after a success: the next failure warns again', async () => {
    stub({ [S]: 'on' });
    await primeToolSwitches(T0);
    stub({ [S]: THROW });
    await primeToolSwitches(T0 + 61_000);
    expect(warnsFor(S)).toHaveLength(1);
    stub({ [S]: 'on' });
    await primeToolSwitches(T0 + 122_000);
    stub({ [S]: THROW });
    await primeToolSwitches(T0 + 183_000);
    expect(warnsFor(S)).toHaveLength(2);
    expect(warnsFor(S)[1][0]).toEqual({ setting: S });
  });

  it('with no successful read since boot, a failing read leaves it off', async () => {
    stub({ [S]: THROW });
    await primeToolSwitches(T0);
    expect(lastKnownSwitch(S, T0 + 1)).toBe(false);
    expect(warnsFor(S)).toHaveLength(1);
  });

  it('refreshes at most every 60s', async () => {
    stub({ [S]: 'on' });
    lastKnownSwitch(S, T0);
    await flush();
    expect(callsFor(S)).toBe(1);
    lastKnownSwitch(S, T0 + 1);
    lastKnownSwitch(S, T0 + TOOL_SWITCH_REFRESH_MS - 1);
    await flush();
    expect(callsFor(S)).toBe(1);
    lastKnownSwitch(S, T0 + TOOL_SWITCH_REFRESH_MS);
    await flush();
    expect(callsFor(S)).toBe(2);
    lastKnownSwitch(S, T0 + TOOL_SWITCH_REFRESH_MS + 5);
    await flush();
    expect(callsFor(S)).toBe(2);
    lastKnownSwitch(S, T0 + 2 * TOOL_SWITCH_REFRESH_MS);
    await flush();
    expect(callsFor(S)).toBe(3);
  });

  it('a failed attempt also waits 60s before the next one', async () => {
    stub({ [S]: THROW });
    lastKnownSwitch(S, T0);
    await flush();
    lastKnownSwitch(S, T0 + 30_000);
    await flush();
    expect(callsFor(S)).toBe(1);
  });

  it('concurrent refreshes are deduped', async () => {
    let release!: (v: string) => void;
    mockGet.mockImplementation((key: string) =>
      key === S
        ? new Promise<string>((r) => {
            release = r;
          })
        : realGet(key),
    );
    lastKnownSwitch(S, T0);
    lastKnownSwitch(S, T0 + TOOL_SWITCH_REFRESH_MS * 5);
    const p1 = primeToolSwitches(T0 + TOOL_SWITCH_REFRESH_MS * 5);
    const p2 = primeToolSwitches(T0 + TOOL_SWITCH_REFRESH_MS * 5);
    expect(callsFor(S)).toBe(1);
    release('on');
    await Promise.all([p1, p2]);
    expect(callsFor(S)).toBe(1);
    expect(lastKnownSwitch(S, T0 + TOOL_SWITCH_REFRESH_MS * 5 + 1)).toBe(true);
  });

  it('the request path never awaits Mongo: with getAppSetting hanging forever, toolGuard answers at once', async () => {
    stub({ [S]: 'hang' });
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    const guard = toolGuard(S);
    // Synchronous: no await between the call and the checks.
    guard({} as Request, res as unknown as Response, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();

    // A cached on value keeps answering from the cache while a refresh hangs.
    _resetToolSwitches(); // drops the hung refresh from the first half
    stub({ [S]: 'on' });
    await primeToolSwitches(Date.now() - 2 * TOOL_SWITCH_REFRESH_MS);
    stub({ [S]: 'hang' });
    const res2 = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next2 = jest.fn();
    guard({} as Request, res2 as unknown as Response, next2 as NextFunction);
    expect(next2).toHaveBeenCalledTimes(1);
    expect(res2.status).not.toHaveBeenCalled();
    expect(callsFor(S)).toBeGreaterThanOrEqual(2);
  });
});

// ── The tool routes ─────────────────────────────────────────────────────────

describe('tool routes: 404 while the switch is off, 200 while on', () => {
  const BAIL = '/sections/bail-check?sections=BNS 103';
  const TIMELINE = '/sections/timeline?arrestDate=2026-09-01&sections=BNS 103';
  const NOT_FOUND = { error: 'Route not found', service: 'drafting' };

  it("the body is the drafting service's own unknown-route 404", async () => {
    const unknown = await request(app).get('/sections/no-such-route');
    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual(NOT_FOUND);
  });

  it('both are 404 by default (nothing read yet), sub-paths and other verbs included', async () => {
    stub({ [TOOL_BAIL_CHECKER_SETTING]: MISSING, [TOOL_TIMELINE_SETTING]: MISSING });
    for (const url of [BAIL, TIMELINE, '/sections/bail-check/anything', '/sections/timeline/x']) {
      const res = await request(app).get(url);
      expect(res.status).toBe(404);
      expect(res.body).toEqual(NOT_FOUND);
    }
    const post = await request(app).post('/sections/bail-check').send({});
    expect(post.status).toBe(404);
    expect(post.body).toEqual(NOT_FOUND);
  });

  it('each tool is switched by its own setting', async () => {
    stub({ [TOOL_BAIL_CHECKER_SETTING]: 'on', [TOOL_TIMELINE_SETTING]: 'off' });
    await primeToolSwitches();
    expect((await request(app).get(BAIL)).status).toBe(200);
    const tl = await request(app).get(TIMELINE);
    expect(tl.status).toBe(404);
    expect(tl.body).toEqual(NOT_FOUND);

    _resetToolSwitches();
    stub({ [TOOL_BAIL_CHECKER_SETTING]: 'off', [TOOL_TIMELINE_SETTING]: 'on' });
    await primeToolSwitches();
    const bc = await request(app).get(BAIL);
    expect(bc.status).toBe(404);
    expect(bc.body).toEqual(NOT_FOUND);
    expect((await request(app).get(TIMELINE)).status).toBe(200);
  });

  it('turning the setting on brings a tool back with no code change (after the next refresh)', async () => {
    const t = Date.now();
    stub({ [TOOL_BAIL_CHECKER_SETTING]: 'off', [TOOL_TIMELINE_SETTING]: 'off' });
    await primeToolSwitches(t - 10 * TOOL_SWITCH_REFRESH_MS);
    expect((await request(app).get(BAIL)).status).toBe(404);
    await flush();
    stub({ [TOOL_BAIL_CHECKER_SETTING]: 'on' });
    // The 404 above started a background refresh that read 'off'; the next one is 60s on.
    jest.spyOn(Date, 'now').mockReturnValue(t + 2 * TOOL_SWITCH_REFRESH_MS);
    await request(app).get(BAIL); // starts the background refresh
    await flush();
    expect((await request(app).get(BAIL)).status).toBe(200);
  });

  it('with Mongo down after an on prime, both still answer 200 (T-371 AC2)', async () => {
    stub({ [TOOL_BAIL_CHECKER_SETTING]: 'on', [TOOL_TIMELINE_SETTING]: 'on' });
    await primeToolSwitches();
    stub({ [TOOL_BAIL_CHECKER_SETTING]: THROW, [TOOL_TIMELINE_SETTING]: THROW });
    const later = Date.now() + 5 * TOOL_SWITCH_REFRESH_MS;
    jest.spyOn(Date, 'now').mockReturnValue(later);
    for (const url of [BAIL, TIMELINE, BAIL, TIMELINE]) {
      expect((await request(app).get(url)).status).toBe(200);
      await flush();
    }
    expect(warnsFor(TOOL_BAIL_CHECKER_SETTING)).toHaveLength(1);
    expect(warnsFor(TOOL_TIMELINE_SETTING)).toHaveLength(1);
  });

  it('with the read hanging forever after an on prime, a request still answers 200', async () => {
    stub({ [TOOL_BAIL_CHECKER_SETTING]: 'on' });
    await primeToolSwitches();
    stub({ [TOOL_BAIL_CHECKER_SETTING]: 'hang' });
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 5 * TOOL_SWITCH_REFRESH_MS);
    expect((await request(app).get(BAIL)).status).toBe(200);
  });

  it('the other /sections routes are not affected by the guards', async () => {
    stub({ [TOOL_BAIL_CHECKER_SETTING]: MISSING, [TOOL_TIMELINE_SETTING]: MISSING });
    expect((await request(app).get('/sections/codes')).status).toBe(200);
  });
});

// ── GET /sections/features ──────────────────────────────────────────────────

describe('GET /sections/features', () => {
  const combos: Array<[Stub, Stub, boolean, boolean]> = [
    ['off', 'off', false, false],
    ['on', 'off', true, false], // timeline on, bail off
    ['off', 'on', false, true],
    ['on', 'on', true, true],
  ];

  it.each(combos)(
    'timeline=%s bail=%s gives exactly the two booleans',
    async (tl, bc, wantTl, wantBc) => {
      stub({ [TOOL_TIMELINE_SETTING]: tl, [TOOL_BAIL_CHECKER_SETTING]: bc });
      await primeToolSwitches();
      const res = await request(app).get('/sections/features');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ tool_timeline: wantTl, tool_bail_checker: wantBc });
      expect(Object.keys(res.body).sort()).toEqual(['tool_bail_checker', 'tool_timeline']);
      expect(res.headers['cache-control']).toBe('public, max-age=60');
    },
  );

  it('is reachable with no auth headers while both tools are off', async () => {
    stub({ [TOOL_TIMELINE_SETTING]: MISSING, [TOOL_BAIL_CHECKER_SETTING]: MISSING });
    const res = await request(app).get('/sections/features');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tool_timeline: false, tool_bail_checker: false });
    expect(res.headers['cache-control']).toBe('public, max-age=60');
  });

  it('is both false before any read has finished, and never errors with Mongo down', async () => {
    stub({ [TOOL_TIMELINE_SETTING]: THROW, [TOOL_BAIL_CHECKER_SETTING]: THROW });
    const res = await request(app).get('/sections/features');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tool_timeline: false, tool_bail_checker: false });
  });

  it('leaks no other key or setting, whatever else is configured', async () => {
    await AppSetting.create({ key: 'ai.intake_model', value: MODEL });
    await AppSetting.create({ key: TEMPLATE_CIVIL_PLAINT_SETTING, value: 'on' });
    await AppSetting.create({ key: DESCRIBE_FIRST_SETTING, value: 'on' });
    stub({ [TOOL_TIMELINE_SETTING]: 'on', [TOOL_BAIL_CHECKER_SETTING]: 'on' });
    await primeToolSwitches();
    const res = await request(app).get('/sections/features');
    expect(Object.keys(res.body)).toHaveLength(2);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('feature.');
    expect(text).not.toContain('plaint');
    expect(text).not.toContain(MODEL);
    expect(Array.isArray(res.body)).toBe(false);
  });
});

// ── The plaint switch ───────────────────────────────────────────────────────

describe('feature.template_civil_plaint', () => {
  const P = TEMPLATE_CIVIL_PLAINT_SETTING;

  it('the catalogue has the six civil_plaints_suits ids', () => {
    expect(PLAINT_IDS).toHaveLength(6);
    expect(PLAINT_IDS.every((id) => id.startsWith('plaint_'))).toBe(true);
    // The legacy docType is not a catalogue id.
    expect(Object.keys(TEMPLATE_CATALOGUE)).not.toContain('plaint');
  });

  it.each([
    ['no doc', MISSING as Stub],
    ['off', 'off' as Stub],
    ['a garbage value', 'yes' as Stub],
    ['a read error', THROW as Stub],
  ])('off (%s): hiddenTemplateIds is exactly the six plaint ids', async (_n, v) => {
    stub({ [P]: v });
    const hidden = await hiddenTemplateIds();
    expect([...hidden].sort()).toEqual(PLAINT_IDS);
    for (const id of PLAINT_IDS) expect(await isTemplateEnabled(id)).toBe(false);
    expect(await isTemplateEnabled('plaint')).toBe(false);
    expect(await isTemplateEnabled('bail_regular')).toBe(true);
    expect(await isTemplateEnabled('nda')).toBe(true);
  });

  it('on: nothing is hidden and every plaint id and the legacy docType are enabled', async () => {
    stub({ [P]: 'on' });
    expect((await hiddenTemplateIds()).size).toBe(0);
    for (const id of PLAINT_IDS) expect(await isTemplateEnabled(id)).toBe(true);
    expect(await isTemplateEnabled('plaint')).toBe(true);
    expect(await isTemplateEnabled('bail_regular')).toBe(true);
  });

  it('a doc-type alias of a plaint follows the switch', async () => {
    const aliases = Object.entries(DOC_TYPE_ALIASES).filter(([, target]) =>
      PLAINT_IDS.includes(target),
    );
    stub({ [P]: 'off' });
    for (const [alias] of aliases) expect(await isTemplateEnabled(alias)).toBe(false);
    const other = Object.entries(DOC_TYPE_ALIASES).find(([, t]) => !PLAINT_IDS.includes(t));
    if (other) expect(await isTemplateEnabled(other[0])).toBe(true);
  });

  it('an unknown id is not hidden by this switch (the caller decides whether it exists)', async () => {
    stub({ [P]: 'off' });
    expect(await isTemplateEnabled('not_a_template')).toBe(true);
    expect(await isTemplateEnabled('__proto__')).toBe(true);
    expect(await isTemplateEnabled('constructor')).toBe(true);
  });

  it('the fixture user is only exempt when a userId is given', async () => {
    stub({ [P]: 'off' });
    expect(await isTemplateEnabled(PLAINT_ID, GOLDEN_SET_USER_ID)).toBe(true);
    expect((await hiddenTemplateIds(GOLDEN_SET_USER_ID)).size).toBe(0);
    expect(await isTemplateEnabled(PLAINT_ID, USER_ID)).toBe(false);
    expect((await hiddenTemplateIds(USER_ID)).size).toBe(6);
    expect(await isTemplateEnabled(PLAINT_ID)).toBe(false);
  });

  it('it does not touch the tool cache', async () => {
    stub({ [P]: 'on' });
    await hiddenTemplateIds();
    expect(lastKnownSwitch(TOOL_TIMELINE_SETTING)).toBe(false);
  });

  describe('templateGuard (for part 2)', () => {
    function run(id: unknown) {
      return new Promise<{ status?: number; body?: unknown; passed: boolean }>((resolve) => {
        const res = {
          status: jest.fn().mockImplementation((s: number) => {
            res._s = s;
            return res;
          }),
          json: jest.fn().mockImplementation((b: unknown) => {
            resolve({ status: res._s, body: b, passed: false });
          }),
          _s: 0,
        };
        templateGuard(() => id)({} as Request, res as unknown as Response, () =>
          resolve({ passed: true }),
        );
      });
    }

    it('404s a hidden id with the shared body, and passes the rest', async () => {
      stub({ [P]: 'off' });
      expect(await run(PLAINT_ID)).toEqual({
        status: 404,
        body: TEMPLATE_NOT_FOUND,
        passed: false,
      });
      expect(await run('plaint')).toEqual({ status: 404, body: TEMPLATE_NOT_FOUND, passed: false });
      expect((await run('bail_regular')).passed).toBe(true);
      expect((await run(undefined)).passed).toBe(true);
      expect((await run(42)).passed).toBe(true);
      expect(TEMPLATE_NOT_FOUND).toEqual({ error: 'Template not found' });
    });

    it('passes a plaint when the switch is on', async () => {
      stub({ [P]: 'on' });
      expect((await run(PLAINT_ID)).passed).toBe(true);
      expect((await run('plaint')).passed).toBe(true);
    });
  });
});

// ── Describe-first: the catalogue and the model ─────────────────────────────

describe('describe-first never offers a hidden plaint', () => {
  const P = TEMPLATE_CIVIL_PLAINT_SETTING;

  it('getEnabledCatalogue excludes the plaints when off and includes them when on', async () => {
    const all = getCatalogue().map((c) => c.template_id);
    const plaintsInCatalogue = all.filter((id) => PLAINT_IDS.includes(id));
    expect(plaintsInCatalogue.length).toBeGreaterThan(0);

    stub({ [P]: 'off' });
    const off = (await getEnabledCatalogue(USER_ID)).map((c) => c.template_id);
    expect(off.filter((id) => PLAINT_IDS.includes(id))).toEqual([]);
    expect(off).toEqual(all.filter((id) => !PLAINT_IDS.includes(id)));
    expect(off).toContain('bail_regular');

    stub({ [P]: 'on' });
    expect((await getEnabledCatalogue(USER_ID)).map((c) => c.template_id)).toEqual(all);
  });

  it('the fixture user still sees them (golden set)', async () => {
    stub({ [P]: 'off' });
    const ids = (await getEnabledCatalogue(GOLDEN_SET_USER_ID)).map((c) => c.template_id);
    expect(ids).toEqual(getCatalogue().map((c) => c.template_id));
  });

  describe('through the model', () => {
    const DESC =
      'My client wants to sue the tenant for recovery of Rs 5,00,000 lent on 1 January 2025 ' +
      'and not repaid despite a legal notice dated 3 March 2026. File a plaint in the civil court at Patna.';

    function matchJson(
      templateId: string | null,
      confidence = 'high',
      alternatives: string[] = [],
    ) {
      return JSON.stringify({
        template_id: templateId,
        confidence,
        alternatives,
        is_legal_drafting: true,
        is_court_document: templateId !== null,
        label: 'plaint for recovery',
        category: 'civil',
      });
    }
    const EMPTY_READ = JSON.stringify({ outcome: 'read', read: [], conflicts: [], questions: [] });
    const EMPTY_FILL = JSON.stringify({ fields: [] });

    function modelSays(...contents: string[]) {
      mockMessagesStream.mockReset();
      for (const c of contents) mockMessagesStream.mockResolvedValueOnce(sdkAnswer(c, 900, 120));
    }

    beforeEach(async () => {
      await AppSetting.create({ key: 'ai.intake_model', value: MODEL });
      await AppSetting.create({ key: DESCRIBE_FIRST_SETTING, value: 'on' });
      await AppSetting.create({
        key: `ai.rates.${MODEL}`,
        value: JSON.stringify({ input_usd_per_mtok: 1, output_usd_per_mtok: 5 }),
      });
    });

    it('runIntake: a plaint match is not offered when off', async () => {
      stub({ [P]: 'off' });
      modelSays(matchJson(PLAINT_ID), EMPTY_FILL);
      const res = await request(app)
        .post('/intake')
        .set(headers())
        .send({ description: DESC, intake_id: INTAKE_ID });
      expect(res.status).toBe(200);
      expect(res.body.outcome).not.toBe('matched');
      expect(JSON.stringify(res.body)).not.toMatch(/plaint_/);
    });

    it('runIntake: a plaint among the alternatives is left out when off, kept when on', async () => {
      stub({ [P]: 'off' });
      modelSays(matchJson('bail_regular', 'medium', [PLAINT_ID]));
      const off = await request(app).post('/intake').set(headers()).send({ description: DESC });
      expect(off.body.outcome).toBe('needs_choice');
      expect(off.body.choices.map((c: { template_id: string }) => c.template_id)).toEqual([
        'bail_regular',
      ]);

      stub({ [P]: 'on' });
      modelSays(matchJson('bail_regular', 'medium', [PLAINT_ID]));
      const on = await request(app).post('/intake').set(headers()).send({ description: DESC });
      expect(on.body.choices.map((c: { template_id: string }) => c.template_id)).toEqual([
        'bail_regular',
        PLAINT_ID,
      ]);
    });

    it('runIntake: a plaint is matched when on', async () => {
      stub({ [P]: 'on' });
      modelSays(matchJson(PLAINT_ID), EMPTY_FILL);
      const res = await request(app)
        .post('/intake')
        .set(headers())
        .send({ description: DESC, intake_id: INTAKE_ID });
      expect(res.body.outcome).toBe('matched');
      expect(res.body.template_id).toBe(PLAINT_ID);
    });

    it('runIntake: the user picking a plaint id from a stale choice list is refused when off', async () => {
      stub({ [P]: 'off' });
      modelSays(EMPTY_FILL);
      const res = await request(app)
        .post('/intake')
        .set(headers())
        .send({ description: DESC, template_id: PLAINT_ID, intake_id: INTAKE_ID });
      expect(res.body.outcome).not.toBe('matched');
      expect(res.body.template_id).toBeUndefined();
    });

    it('runBrief: a plaint match does not become the brief kind when off', async () => {
      stub({ [P]: 'off' });
      modelSays(matchJson(PLAINT_ID), EMPTY_READ);
      const res = await request(app)
        .post('/intake/brief')
        .set(headers())
        .send({ description: DESC, intake_id: INTAKE_ID });
      expect(res.status).toBe(200);
      expect(res.body.brief?.kind?.id).not.toBe(PLAINT_ID);
      expect(JSON.stringify(res.body)).not.toMatch(/plaint_/);
    });

    it('runBrief: the user choosing a plaint kind is refused when off', async () => {
      stub({ [P]: 'off' });
      modelSays(EMPTY_READ);
      const res = await request(app)
        .post('/intake/brief')
        .set(headers())
        .send({ description: DESC, intake_id: INTAKE_ID, template_id: PLAINT_ID });
      expect(res.body.brief?.kind?.id).not.toBe(PLAINT_ID);
    });

    it('runBrief: a plaint match becomes the brief kind when on', async () => {
      stub({ [P]: 'on' });
      modelSays(matchJson(PLAINT_ID), EMPTY_READ);
      const res = await request(app)
        .post('/intake/brief')
        .set(headers())
        .send({ description: DESC, intake_id: INTAKE_ID });
      expect(res.body.outcome).toBe('brief');
      expect(res.body.brief.kind.id).toBe(PLAINT_ID);
    });
  });
});

// ── Intake routes ───────────────────────────────────────────────────────────

describe('intake routes: a hidden template is 404', () => {
  const P = TEMPLATE_CIVIL_PLAINT_SETTING;

  function answers(templateId: string, userId = USER_ID) {
    return request(app)
      .post('/intake/answers')
      .set(headers(userId))
      .send({ intake_id: INTAKE_ID, template_id: templateId, fields: {}, answers: {}, round: 1 });
  }
  function briefUpdate(body: Record<string, unknown>, userId = USER_ID) {
    return request(app).post('/intake/brief/update').set(headers(userId)).send(body);
  }

  beforeEach(async () => {
    await AppSetting.create({ key: DESCRIBE_FIRST_SETTING, value: 'on' });
  });

  describe('POST /intake/answers', () => {
    it.each([...PLAINT_IDS, 'plaint'])('%s is 404 with the shared body when off', async (id) => {
      stub({ [P]: 'off' });
      const res = await answers(id);
      expect(res.status).toBe(404);
      expect(res.body).toEqual(TEMPLATE_NOT_FOUND);
    });

    it('is 404 when the switch cannot be read (fail closed)', async () => {
      stub({ [P]: THROW });
      const res = await answers(PLAINT_ID);
      expect(res.status).toBe(404);
      expect(res.body).toEqual(TEMPLATE_NOT_FOUND);
    });

    it('passes for every plaint id when on', async () => {
      stub({ [P]: 'on' });
      for (const id of PLAINT_IDS) {
        const res = await answers(id);
        expect(res.status).toBe(200);
        expect(res.body.error).toBeUndefined();
      }
    });

    it('does not affect other ids, on or off', async () => {
      for (const v of ['off', 'on'] as const) {
        stub({ [P]: v });
        const res = await answers('bail_regular');
        expect(res.status).toBe(200);
      }
    });

    it('the validation 400 still comes first for a bad body', async () => {
      stub({ [P]: 'off' });
      const res = await request(app)
        .post('/intake/answers')
        .set(headers())
        .send({ template_id: PLAINT_ID });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /intake/brief/update', () => {
    it.each(PLAINT_IDS)('kind %s is 404 with the shared body when off', async (kind) => {
      stub({ [P]: 'off' });
      const res = await briefUpdate({ kind, values: [] });
      expect(res.status).toBe(404);
      expect(res.body).toEqual(TEMPLATE_NOT_FOUND);
    });

    it('is 404 when the switch cannot be read (fail closed)', async () => {
      stub({ [P]: THROW });
      const res = await briefUpdate({ kind: PLAINT_ID, values: [] });
      expect(res.status).toBe(404);
      expect(res.body).toEqual(TEMPLATE_NOT_FOUND);
    });

    it('passes for a plaint kind when on', async () => {
      stub({ [P]: 'on' });
      const res = await briefUpdate({ kind: PLAINT_ID, values: [] });
      expect(res.status).toBe(200);
      expect(res.body.brief.kind.id).toBe(PLAINT_ID);
    });

    it('does not affect other kinds, on or off', async () => {
      for (const v of ['off', 'on'] as const) {
        stub({ [P]: v });
        const res = await briefUpdate({ kind: 'bail_regular', values: [] });
        expect(res.status).toBe(200);
        expect(res.body.brief.kind.id).toBe('bail_regular');
      }
    });

    it('a hidden kind is refused before the ledger changes', async () => {
      await AppSetting.create({ key: 'ai.intake_model', value: MODEL });
      await AppSetting.create({ key: FACT_LEDGER_SETTING, value: 'on' });
      await AppSetting.create({
        key: `ai.rates.${MODEL}`,
        value: JSON.stringify({ input_usd_per_mtok: 1, output_usd_per_mtok: 5 }),
      });
      stub({ [P]: 'off' });

      mockMessagesStream.mockReset();
      mockMessagesStream
        .mockResolvedValueOnce(
          sdkAnswer(
            JSON.stringify({
              template_id: 'mact_claim',
              confidence: 'high',
              alternatives: [],
              is_legal_drafting: true,
              is_court_document: true,
              label: 'legal document',
              category: 'other',
            }),
            900,
            120,
          ),
        )
        .mockResolvedValueOnce(
          sdkAnswer(
            JSON.stringify({ outcome: 'read', read: [], conflicts: [], questions: [] }),
            900,
            120,
          ),
        )
        .mockResolvedValueOnce(
          sdkAnswer(
            JSON.stringify({
              facts: [{ key: 'compensation_claimed_amount', span: '2 lakh', confidence: 0.99 }],
            }),
            900,
            120,
          ),
        );
      const first = await request(app).post('/intake/brief').set(headers()).send({
        description:
          'Mere client ka accident 12/3/26 ko hua tha, PS Kotwali mein FIR 45/26 darj hui. Unhone 2 lakh ka muavza claim kiya hai.',
        intake_id: INTAKE_ID,
      });
      expect(first.status).toBe(200);
      const ledgerId = first.body.ledger.ledger_id as string;
      const before = await FactLedgerModel.findById(ledgerId).lean();
      expect(before!.versions).toHaveLength(1);

      const res = await briefUpdate({
        kind: PLAINT_ID,
        ledger_id: ledgerId,
        ledger_edits: [{ key: 'compensation_claimed_amount', text: '3 lakh' }],
      });
      expect(res.status).toBe(404);
      expect(res.body).toEqual(TEMPLATE_NOT_FOUND);
      const after = await FactLedgerModel.findById(ledgerId).lean();
      expect(after!.currentVersion).toBe(before!.currentVersion);
      expect(after!.versions).toHaveLength(1);
      expect(JSON.stringify(after!.versions)).toBe(JSON.stringify(before!.versions));

      // The same edit on its real kind still works, so the ledger was reachable.
      const ok = await briefUpdate({
        kind: 'mact_claim',
        ledger_id: ledgerId,
        ledger_edits: [{ key: 'compensation_claimed_amount', text: '3 lakh' }],
      });
      expect(ok.status).toBe(200);
    });
  });
});

/**
 * T-684 - model and effort per role (AppSettings ai.model.<role>, ai.effort.<role>).
 *
 * Criteria covered:
 *   1. the six roles with ai.model.* and ai.effort.*; the registry the admin AI page lists
 *      (required / optional) and the T-585 boot warning
 *   2. the legacy keys (ai.drafting_model, ai.intake_model, ai.preflight_model) still work
 *      as a fallback for one release
 *   4. a deployment with only the old keys behaves exactly as before
 *   founder rule: model ids live in the DB only (no env default)
 *
 * The Anthropic client is mocked; AppSetting on the in-memory Mongo. No real model call.
 * Values used here are made-up strings; the tests assert they never reach a log payload.
 */
import './setupEnv';
import './setupDb';

import { Response } from 'express';
import supertest from 'supertest';

const mockStream = jest.fn();
const mockParse = jest.fn();
const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: {
      stream: (...a: unknown[]) => mockStream(...a),
      parse: (...a: unknown[]) => mockParse(...a),
      create: (...a: unknown[]) => mockCreate(...a),
    },
  })),
}));
jest.mock('../services/sections.service', () => ({
  convertOldReferencesInText: jest.fn(async (text: string) => ({
    converted: text,
    conversions: [],
  })),
  lookupOldToNew: jest.fn(async () => null),
}));

import app from '../app';
import redis from '../config/redis';
import logger from '../config/logger';
import { AppSetting } from '../models/AppSetting.model';
import { streamGenerateFromBrief, streamLLM } from '../services/ai.service';
import {
  _clearAppSettingsCache,
  AI_EFFORT_VALUES,
  AppSettingMissingError,
  effortKeyChain,
  getAppSettingsRegistry,
  getConfigWarnings,
  MODEL_ROLE_REGISTRY,
  MODEL_ROLES,
  modelKeyChain,
  ModelRole,
  primeConfigWarnings,
  REQUIRED_MODEL_ROLES,
  roleForLegacyModelKey,
  setAppSetting,
} from '../services/app-settings.service';
import { loadAvermentLists } from '../services/averments';
import { buildBrief, buildChecklist, GivenValue } from '../services/intake-brief';
import { runBriefIntake, runIntake } from '../services/intake.service';
import {
  AI_EFFORT_DEFAULTS,
  getAiEffort,
  getRoleEffort,
  resolveModel,
  resolveModelWithSource,
  ROLE_EFFORT_DEFAULTS,
} from '../services/llm-usage';
import { preflightCheck } from '../services/preflight.service';
import { loadRulePack } from '../services/rule-pack.service';
import { loadTemplateConfig } from '../services/template-engine.service';
import type { Skeleton } from '../types/skeleton';
import { loadFixtureSkeleton, regularBase } from './fixtures/t373';
import { asyncIterable } from './sdkStream';

const ADMIN_HEADERS = {
  'x-internal-secret': process.env.INTERNAL_SECRET ?? 'test-internal-secret-at-least-16',
  'x-user-id': '507f1f77bcf86cd799439011',
  'x-user-email': 'founder@lawie.in',
  'x-user-role': 'Admin',
  'x-user-plan': 'free',
  'x-user-name': 'Founder',
};
const CLIENT_HEADERS = {
  ...ADMIN_HEADERS,
  'x-user-id': '507f1f77bcf86cd799439012',
  'x-user-role': 'Client',
};

/** role -> [role key, legacy key | undefined]. */
const KEYS: Record<ModelRole, { key: string; legacy?: string }> = {
  matcher: { key: 'ai.model.matcher' },
  extractor: { key: 'ai.model.extractor', legacy: 'ai.intake_model' },
  drafter: { key: 'ai.model.drafter', legacy: 'ai.drafting_model' },
  fact_checker: { key: 'ai.model.fact_checker', legacy: 'ai.preflight_model' },
  legal_reviewer: { key: 'ai.model.legal_reviewer' },
  language: { key: 'ai.model.language' },
};
const ROLES_WITH_LEGACY = MODEL_ROLES.filter((r) => KEYS[r].legacy);
const ROLES_WITHOUT_LEGACY = MODEL_ROLES.filter((r) => !KEYS[r].legacy && r !== 'matcher');

async function set(key: string, value: string): Promise<void> {
  await AppSetting.create({ key, value });
  _clearAppSettingsCache();
}

function deprecationWarns(spy: jest.SpyInstance): Array<[Record<string, unknown>, string]> {
  return spy.mock.calls.filter(
    (c) => typeof c[1] === 'string' && (c[1] as string).startsWith('Deprecated AppSetting'),
  ) as Array<[Record<string, unknown>, string]>;
}

let warn: jest.SpyInstance;

beforeEach(async () => {
  _clearAppSettingsCache();
  mockStream.mockReset();
  mockParse.mockReset();
  mockCreate.mockReset();
  await redis.flushall();
  warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ── resolveModel / resolveModelWithSource ───────────────────────────────────

describe('resolveModel: the role key wins over the legacy key', () => {
  it.each(ROLES_WITH_LEGACY)('%s: ai.model.<role> over the legacy key', async (role) => {
    await set(KEYS[role].legacy!, 'legacy-value');
    await set(KEYS[role].key, 'new-value');
    expect(await resolveModel(role)).toBe('new-value');
    const r = await resolveModelWithSource(role);
    expect(r).toEqual({ model: 'new-value', key: KEYS[role].key, source: 'new' });
    expect(deprecationWarns(warn)).toHaveLength(0);
  });
});

describe('resolveModel: legacy fallback', () => {
  it.each(ROLES_WITH_LEGACY)('%s: legacy key alone is used', async (role) => {
    await set(KEYS[role].legacy!, 'legacy-value');
    expect(await resolveModel(role)).toBe('legacy-value');
    expect(await resolveModelWithSource(role)).toEqual({
      model: 'legacy-value',
      key: KEYS[role].legacy,
      source: 'legacy',
    });
  });

  it('warns ONCE per legacy key across several resolves; key names only, no value', async () => {
    await set('ai.drafting_model', 'SECRET-LEGACY-VALUE-1');
    await set('ai.preflight_model', 'SECRET-LEGACY-VALUE-2');
    for (let i = 0; i < 4; i++) await resolveModel('drafter');
    for (let i = 0; i < 3; i++) await resolveModelWithSource('fact_checker');
    const w = deprecationWarns(warn);
    expect(w).toHaveLength(2);
    expect(w[0][0]).toEqual({ key: 'ai.drafting_model', replacedBy: 'ai.model.drafter' });
    expect(w[0][1]).toBe('Deprecated AppSetting ai.drafting_model in use; set ai.model.drafter');
    expect(w[1][0]).toEqual({ key: 'ai.preflight_model', replacedBy: 'ai.model.fact_checker' });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('SECRET-LEGACY-VALUE');
  });

  it('the intake legacy key warns once even when served to extractor and matcher', async () => {
    await set('ai.intake_model', 'legacy-intake');
    await resolveModel('extractor');
    await resolveModel('matcher');
    await resolveModel('extractor');
    const w = deprecationWarns(warn);
    expect(w).toHaveLength(1);
    expect(w[0][0]).toEqual({ key: 'ai.intake_model', replacedBy: 'ai.model.extractor' });
  });

  it('_clearAppSettingsCache resets the once-per-process memory (test helper only)', async () => {
    await set('ai.drafting_model', 'legacy-value');
    await resolveModel('drafter');
    _clearAppSettingsCache();
    await resolveModel('drafter');
    expect(deprecationWarns(warn)).toHaveLength(2);
  });
});

describe('resolveModel: nothing set', () => {
  it.each(MODEL_ROLES)('%s: AppSettingMissingError naming the NEW key', async (role) => {
    const err = await resolveModel(role).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppSettingMissingError);
    expect((err as AppSettingMissingError).key).toBe(KEYS[role].key);
    expect((err as Error).message).not.toMatch(/ai\.(drafting|intake|preflight)_model/);
    await expect(resolveModelWithSource(role)).rejects.toMatchObject({ key: KEYS[role].key });
  });

  it('matcher reports ai.model.matcher, not the extractor or the intake key', async () => {
    await expect(resolveModel('matcher')).rejects.toMatchObject({ key: 'ai.model.matcher' });
  });

  it('there is no env or code default: an env model var does not help', async () => {
    const saved = process.env.AI_MODEL;
    process.env.AI_MODEL = 'env-model';
    try {
      await expect(resolveModel('drafter')).rejects.toBeInstanceOf(AppSettingMissingError);
    } finally {
      if (saved === undefined) delete process.env.AI_MODEL;
      else process.env.AI_MODEL = saved;
    }
  });
});

describe('resolveModel: matcher chain', () => {
  it('ai.model.matcher wins over the extractor and the intake key', async () => {
    await set('ai.intake_model', 'intake-v');
    await set('ai.model.extractor', 'extractor-v');
    await set('ai.model.matcher', 'matcher-v');
    expect(await resolveModelWithSource('matcher')).toEqual({
      model: 'matcher-v',
      key: 'ai.model.matcher',
      source: 'new',
    });
  });

  it('falls to ai.model.extractor, source new', async () => {
    await set('ai.intake_model', 'intake-v');
    await set('ai.model.extractor', 'extractor-v');
    expect(await resolveModelWithSource('matcher')).toEqual({
      model: 'extractor-v',
      key: 'ai.model.extractor',
      source: 'new',
    });
  });

  it('falls to ai.intake_model, source legacy', async () => {
    await set('ai.intake_model', 'intake-v');
    expect(await resolveModelWithSource('matcher')).toEqual({
      model: 'intake-v',
      key: 'ai.intake_model',
      source: 'legacy',
    });
  });

  it('does not use the drafter or fact_checker keys', async () => {
    await set('ai.model.drafter', 'd');
    await set('ai.preflight_model', 'p');
    await expect(resolveModel('matcher')).rejects.toBeInstanceOf(AppSettingMissingError);
  });
});

describe('resolveModel: roles without a legacy key', () => {
  it.each(ROLES_WITHOUT_LEGACY)('%s uses only its own key', async (role) => {
    await set('ai.drafting_model', 'd');
    await set('ai.intake_model', 'i');
    await set('ai.preflight_model', 'p');
    await expect(resolveModel(role)).rejects.toMatchObject({ key: KEYS[role].key });
    await set(KEYS[role].key, 'own-value');
    expect(await resolveModelWithSource(role)).toEqual({
      model: 'own-value',
      key: KEYS[role].key,
      source: 'new',
    });
  });
});

describe('resolveModel: errors and cache', () => {
  it('a read error that is not a missing key is rethrown unchanged', async () => {
    const boom = new Error('db down');
    jest.spyOn(AppSetting, 'findOne').mockImplementation((() => {
      throw boom;
    }) as never);
    await expect(resolveModel('drafter')).rejects.toBe(boom);
    await expect(resolveModelWithSource('extractor')).rejects.toBe(boom);
  });

  it('a read error on the legacy key (role key missing) is still rethrown, not treated as missing', async () => {
    const boom = new Error('legacy read failed');
    const real = AppSetting.findOne.bind(AppSetting);
    jest.spyOn(AppSetting, 'findOne').mockImplementation(((q: { key: string }) => {
      if (q.key === 'ai.drafting_model') throw boom;
      return real(q);
    }) as never);
    await expect(resolveModel('drafter')).rejects.toBe(boom);
  });

  it('a write to the new key changes the resolved value at once (cached legacy value)', async () => {
    await set('ai.drafting_model', 'legacy-value');
    expect(await resolveModel('drafter')).toBe('legacy-value');
    await setAppSetting({ key: 'ai.model.drafter', value: 'new-value' });
    expect(await resolveModel('drafter')).toBe('new-value');
    await setAppSetting({ key: 'ai.model.drafter', value: 'newer-value' });
    expect(await resolveModel('drafter')).toBe('newer-value');
  });

  it('setting the legacy key while the new key exists does not change the result', async () => {
    await set('ai.model.drafter', 'new-value');
    expect(await resolveModel('drafter')).toBe('new-value');
    await setAppSetting({ key: 'ai.drafting_model', value: 'legacy-value' });
    expect(await resolveModel('drafter')).toBe('new-value');
    expect(deprecationWarns(warn)).toHaveLength(0);
  });

  it('values are cached (the second resolve makes no DB read)', async () => {
    await set('ai.model.drafter', 'new-value');
    await resolveModel('drafter');
    const spy = jest.spyOn(AppSetting, 'findOne');
    await resolveModel('drafter');
    expect(spy).not.toHaveBeenCalled();
  });
});

// ── getRoleEffort / getAiEffort ─────────────────────────────────────────────

const EFFORT_CHAINS: Record<ModelRole, string[]> = {
  matcher: ['ai.effort.matcher', 'ai.effort.extractor', 'ai.effort.intake'],
  extractor: ['ai.effort.extractor', 'ai.effort.intake'],
  drafter: ['ai.effort.drafter', 'ai.effort.body'],
  fact_checker: ['ai.effort.fact_checker', 'ai.effort.preflight'],
  legal_reviewer: ['ai.effort.legal_reviewer'],
  language: ['ai.effort.language'],
};
const EFFORT_DEFAULT: Record<ModelRole, string> = {
  matcher: 'medium',
  extractor: 'medium',
  drafter: 'medium',
  fact_checker: 'low',
  legal_reviewer: 'medium',
  language: 'low',
};

describe('key chains', () => {
  it.each(MODEL_ROLES)('%s: model and effort chains', (role) => {
    expect(effortKeyChain(role)).toEqual(EFFORT_CHAINS[role]);
    const model =
      role === 'matcher'
        ? ['ai.model.matcher', 'ai.model.extractor', 'ai.intake_model']
        : KEYS[role].legacy
          ? [KEYS[role].key, KEYS[role].legacy]
          : [KEYS[role].key];
    expect(modelKeyChain(role)).toEqual(model);
  });

  it('roleForLegacyModelKey maps the three legacy keys and nothing else', () => {
    expect(roleForLegacyModelKey('ai.drafting_model')).toBe('drafter');
    expect(roleForLegacyModelKey('ai.intake_model')).toBe('extractor');
    expect(roleForLegacyModelKey('ai.preflight_model')).toBe('fact_checker');
    expect(roleForLegacyModelKey('ai.model.drafter')).toBeUndefined();
    expect(roleForLegacyModelKey('ai.effort.body')).toBeUndefined();
  });
});

describe('getRoleEffort: defaults', () => {
  it.each(MODEL_ROLES)('%s: default when nothing is set', async (role) => {
    expect(await getRoleEffort(role)).toBe(EFFORT_DEFAULT[role]);
    expect(ROLE_EFFORT_DEFAULTS[role]).toBe(EFFORT_DEFAULT[role]);
  });
});

describe('getRoleEffort: chains', () => {
  it.each(MODEL_ROLES)('%s: the role key is used', async (role) => {
    await set(EFFORT_CHAINS[role][0], 'max');
    expect(await getRoleEffort(role)).toBe('max');
  });

  it.each(MODEL_ROLES.filter((r) => EFFORT_CHAINS[r].length > 1))(
    '%s: each later key in the chain is used when the earlier ones are unset, earlier wins',
    async (role) => {
      const chain = EFFORT_CHAINS[role];
      // last key alone
      await set(chain[chain.length - 1], 'xhigh');
      expect(await getRoleEffort(role)).toBe('xhigh');
      // the first key beats it
      await setAppSetting({ key: chain[0], value: 'low' });
      expect(await getRoleEffort(role)).toBe('low');
    },
  );

  it('matcher: matcher beats extractor beats intake', async () => {
    await set('ai.effort.intake', 'low');
    expect(await getRoleEffort('matcher')).toBe('low');
    await setAppSetting({ key: 'ai.effort.extractor', value: 'high' });
    expect(await getRoleEffort('matcher')).toBe('high');
    await setAppSetting({ key: 'ai.effort.matcher', value: 'max' });
    expect(await getRoleEffort('matcher')).toBe('max');
  });

  it('a value is trimmed and lower-cased', async () => {
    await set('ai.effort.drafter', '  HiGh ');
    expect(await getRoleEffort('drafter')).toBe('high');
  });
});

describe('getRoleEffort: invalid values and read failures', () => {
  it('an invalid value warns with the key only and moves to the next key', async () => {
    await set('ai.effort.drafter', 'turbo-9000');
    await set('ai.effort.body', 'high');
    expect(await getRoleEffort('drafter')).toBe('high');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toEqual({ key: 'ai.effort.drafter' });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('turbo-9000');
  });

  it('invalid in the whole chain: the default, one warn per bad key', async () => {
    await set('ai.effort.fact_checker', 'nope');
    await set('ai.effort.preflight', 'nada');
    expect(await getRoleEffort('fact_checker')).toBe('low');
    expect(warn.mock.calls.map((c) => c[0])).toEqual([
      { key: 'ai.effort.fact_checker' },
      { key: 'ai.effort.preflight' },
    ]);
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/nope|nada/);
  });

  it.each(MODEL_ROLES)('%s: never throws when the settings read fails', async (role) => {
    jest.spyOn(AppSetting, 'findOne').mockImplementation((() => {
      throw new Error('db down');
    }) as never);
    await expect(getRoleEffort(role)).resolves.toBe(EFFORT_DEFAULT[role]);
  });
});

describe('getRoleEffort: cache', () => {
  it('is cached 60 s per role, defaults included (no DB read on the second call)', async () => {
    expect(await getRoleEffort('language')).toBe('low');
    const spy = jest.spyOn(AppSetting, 'findOne');
    expect(await getRoleEffort('language')).toBe('low');
    expect(spy).not.toHaveBeenCalled();
  });

  it('a write to the role key clears that role', async () => {
    expect(await getRoleEffort('drafter')).toBe('medium');
    await setAppSetting({ key: 'ai.effort.drafter', value: 'high' });
    expect(await getRoleEffort('drafter')).toBe('high');
  });

  it.each([
    ['drafter', 'ai.effort.body'],
    ['extractor', 'ai.effort.intake'],
    ['fact_checker', 'ai.effort.preflight'],
  ] as const)('%s: a write to the legacy key %s clears that role', async (role, legacyKey) => {
    const before = await getRoleEffort(role);
    expect(before).toBe(EFFORT_DEFAULT[role]);
    await setAppSetting({ key: legacyKey, value: 'max' });
    expect(await getRoleEffort(role)).toBe('max');
  });

  it("a write to ai.effort.extractor clears the MATCHER's entry too", async () => {
    expect(await getRoleEffort('matcher')).toBe('medium');
    await setAppSetting({ key: 'ai.effort.extractor', value: 'xhigh' });
    expect(await getRoleEffort('matcher')).toBe('xhigh');
  });

  it("a write to ai.effort.intake clears the matcher's entry too", async () => {
    expect(await getRoleEffort('matcher')).toBe('medium');
    await setAppSetting({ key: 'ai.effort.intake', value: 'low' });
    expect(await getRoleEffort('matcher')).toBe('low');
  });

  it("a write to an unrelated effort key leaves a role's cached entry in place", async () => {
    await getRoleEffort('drafter');
    await setAppSetting({ key: 'ai.effort.language', value: 'high' });
    const spy = jest.spyOn(AppSetting, 'findOne');
    await getRoleEffort('drafter');
    expect(spy).not.toHaveBeenCalled();
  });

  it('_clearAppSettingsCache clears every role', async () => {
    await getRoleEffort('drafter');
    await AppSetting.create({ key: 'ai.effort.drafter', value: 'max' });
    _clearAppSettingsCache();
    expect(await getRoleEffort('drafter')).toBe('max');
  });
});

describe('getAiEffort(stage): old-key-only deployments behave as before', () => {
  it('the T-453 defaults are unchanged', async () => {
    expect(AI_EFFORT_DEFAULTS).toEqual({ intake: 'medium', preflight: 'low', body: 'medium' });
    expect(await getAiEffort('intake')).toBe('medium');
    expect(await getAiEffort('preflight')).toBe('low');
    expect(await getAiEffort('body')).toBe('medium');
  });

  it('reads ai.effort.intake / .preflight / .body when only those are set', async () => {
    await set('ai.effort.intake', 'high');
    await set('ai.effort.preflight', 'max');
    await set('ai.effort.body', 'xhigh');
    expect(await getAiEffort('intake')).toBe('high');
    expect(await getAiEffort('preflight')).toBe('max');
    expect(await getAiEffort('body')).toBe('xhigh');
  });

  it('delegates to the role keys when they are set (new key wins)', async () => {
    await set('ai.effort.intake', 'high');
    await set('ai.effort.extractor', 'low');
    await set('ai.effort.fact_checker', 'xhigh');
    await set('ai.effort.drafter', 'max');
    expect(await getAiEffort('intake')).toBe('low');
    expect(await getAiEffort('preflight')).toBe('xhigh');
    expect(await getAiEffort('body')).toBe('max');
  });

  it('an invalid old key still falls back to the default with a key-only warn', async () => {
    await set('ai.effort.body', 'turbo-9000');
    expect(await getAiEffort('body')).toBe('medium');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toEqual({ key: 'ai.effort.body' });
  });
});

// ── registry ────────────────────────────────────────────────────────────────

describe('getAppSettingsRegistry', () => {
  const entries = getAppSettingsRegistry();
  const byKey = (k: string) => entries.find((e) => e.key === k)!;

  it('has 15 entries: 6 model, 6 effort, 3 deprecated; keys unique', () => {
    expect(entries).toHaveLength(15);
    expect(entries.filter((e) => e.group === 'model')).toHaveLength(6);
    expect(entries.filter((e) => e.group === 'effort')).toHaveLength(6);
    expect(entries.filter((e) => e.group === 'deprecated')).toHaveLength(3);
    expect(new Set(entries.map((e) => e.key)).size).toBe(15);
  });

  it('model and effort keys are ai.model.<role> and ai.effort.<role> for each role', () => {
    for (const role of MODEL_ROLES) {
      expect(byKey(`ai.model.${role}`)).toMatchObject({ group: 'model', role });
      expect(byKey(`ai.effort.${role}`)).toMatchObject({ group: 'effort', role });
    }
  });

  it('required is true for exactly the drafter, extractor and fact_checker model keys', () => {
    const required = entries.filter((e) => e.required).map((e) => e.key);
    expect(required.sort()).toEqual(
      ['ai.model.drafter', 'ai.model.extractor', 'ai.model.fact_checker'].sort(),
    );
    for (const k of ['matcher', 'legal_reviewer', 'language']) {
      expect(byKey(`ai.model.${k}`).required).toBe(false);
    }
    expect(entries.filter((e) => e.group !== 'model').every((e) => !e.required)).toBe(true);
    expect([...REQUIRED_MODEL_ROLES]).toEqual(['drafter', 'extractor', 'fact_checker']);
  });

  it('legacyKey on the model entries and replacedBy on the deprecated ones', () => {
    expect(byKey('ai.model.drafter').legacyKey).toBe('ai.drafting_model');
    expect(byKey('ai.model.extractor').legacyKey).toBe('ai.intake_model');
    expect(byKey('ai.model.fact_checker').legacyKey).toBe('ai.preflight_model');
    for (const r of ['matcher', 'legal_reviewer', 'language']) {
      expect(byKey(`ai.model.${r}`)).not.toHaveProperty('legacyKey');
    }
    expect(byKey('ai.drafting_model')).toMatchObject({
      group: 'deprecated',
      deprecated: true,
      replacedBy: 'ai.model.drafter',
      required: false,
    });
    expect(byKey('ai.intake_model')).toMatchObject({
      group: 'deprecated',
      deprecated: true,
      replacedBy: 'ai.model.extractor',
    });
    expect(byKey('ai.preflight_model')).toMatchObject({
      group: 'deprecated',
      deprecated: true,
      replacedBy: 'ai.model.fact_checker',
    });
    expect(entries.filter((e) => e.deprecated).map((e) => e.group)).toEqual([
      'deprecated',
      'deprecated',
      'deprecated',
    ]);
  });

  it('effort entries carry allowedValues; the old stage effort keys are their legacyKey', () => {
    for (const role of MODEL_ROLES) {
      expect(byKey(`ai.effort.${role}`).allowedValues).toEqual([
        'low',
        'medium',
        'high',
        'xhigh',
        'max',
      ]);
    }
    expect([...AI_EFFORT_VALUES]).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
    expect(byKey('ai.effort.drafter').legacyKey).toBe('ai.effort.body');
    expect(byKey('ai.effort.extractor').legacyKey).toBe('ai.effort.intake');
    expect(byKey('ai.effort.fact_checker').legacyKey).toBe('ai.effort.preflight');
    expect(entries.filter((e) => e.group !== 'effort').every((e) => !e.allowedValues)).toBe(true);
  });

  it('every entry has a label and help text, and never a value', () => {
    for (const e of entries) {
      expect(e.label.length).toBeGreaterThan(0);
      expect(e.help.length).toBeGreaterThan(0);
      expect(e).not.toHaveProperty('value');
    }
  });

  it('is read-only: the role registry is frozen, and a returned list is a fresh copy', () => {
    expect(Object.isFrozen(MODEL_ROLE_REGISTRY)).toBe(true);
    for (const role of MODEL_ROLES) expect(Object.isFrozen(MODEL_ROLE_REGISTRY[role])).toBe(true);
    expect(Object.isFrozen(REQUIRED_MODEL_ROLES)).toBe(true);
    const a = getAppSettingsRegistry();
    a.find((e) => e.key === 'ai.model.drafter')!.required = false;
    a.pop();
    const b = getAppSettingsRegistry();
    expect(b).toHaveLength(15);
    expect(b.find((e) => e.key === 'ai.model.drafter')!.required).toBe(true);
  });

  it('only the three required roles are required in the role registry too', () => {
    expect(MODEL_ROLES.filter((r) => MODEL_ROLE_REGISTRY[r].required)).toEqual([
      'extractor',
      'drafter',
      'fact_checker',
    ]);
  });
});

// ── boot warning table ──────────────────────────────────────────────────────

describe('boot warning (T-585) by role', () => {
  const REQUIRED = ['drafter', 'extractor', 'fact_checker'] as const;

  it.each(REQUIRED)('%s: unset -> reported by its role key', async (role) => {
    for (const other of REQUIRED.filter((r) => r !== role))
      await AppSetting.create({ key: KEYS[other].key, value: 'v' });
    expect(await primeConfigWarnings()).toEqual([KEYS[role].key]);
  });

  it.each(REQUIRED)('%s: new key set -> not reported', async (role) => {
    await AppSetting.create({ key: KEYS[role].key, value: 'v' });
    expect(await primeConfigWarnings()).not.toContain(KEYS[role].key);
  });

  it.each(REQUIRED)('%s: legacy key only -> not reported', async (role) => {
    await AppSetting.create({ key: KEYS[role].legacy!, value: 'v' });
    expect(await primeConfigWarnings()).not.toContain(KEYS[role].key);
  });

  it.each(REQUIRED)('%s: both set -> not reported', async (role) => {
    await AppSetting.create({ key: KEYS[role].legacy!, value: 'v' });
    await AppSetting.create({ key: KEYS[role].key, value: 'v' });
    expect(await primeConfigWarnings()).not.toContain(KEYS[role].key);
  });

  it('all four states at once, fixed order drafter, extractor, fact_checker', async () => {
    expect(await primeConfigWarnings()).toEqual([
      'ai.model.drafter',
      'ai.model.extractor',
      'ai.model.fact_checker',
    ]);
    expect(getConfigWarnings()).toEqual([
      'ai.model.drafter',
      'ai.model.extractor',
      'ai.model.fact_checker',
    ]);
  });

  it('the priming read does not log a deprecation warn for a legacy-only role (that is on resolve)', async () => {
    await AppSetting.create({ key: 'ai.drafting_model', value: 'v' });
    await primeConfigWarnings();
    expect(deprecationWarns(warn)).toHaveLength(0);
  });
});

// ── call sites ──────────────────────────────────────────────────────────────

const okStream = () =>
  asyncIterable([
    { type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 0 } } },
    { type: 'content_block_delta', delta: { type: 'text_delta', text: '{}' } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
  ]);

async function drainStreamLLM(): Promise<void> {
  for await (const _ of streamLLM('sys', 'usr', 100)) void _;
}

describe('call site: streamLLM uses the drafter role', () => {
  it('ai.model.drafter wins over ai.drafting_model', async () => {
    await set('ai.drafting_model', 'legacy-drafter-model');
    await set('ai.model.drafter', 'new-drafter-model');
    mockStream.mockResolvedValue(okStream());
    await drainStreamLLM();
    expect(mockStream.mock.calls[0][0].model).toBe('new-drafter-model');
  });

  it('an old deployment (ai.drafting_model only) still drafts with it', async () => {
    await set('ai.drafting_model', 'legacy-drafter-model');
    mockStream.mockResolvedValue(okStream());
    await drainStreamLLM();
    expect(mockStream.mock.calls[0][0].model).toBe('legacy-drafter-model');
  });

  it('nothing set: AppSettingMissingError naming ai.model.drafter, no model call', async () => {
    await expect(drainStreamLLM()).rejects.toMatchObject({ key: 'ai.model.drafter' });
    expect(mockStream).not.toHaveBeenCalled();
  });
});

describe('call site: callD1Drafter (streamGenerateFromBrief) uses the drafter role', () => {
  const skeleton: Skeleton = loadFixtureSkeleton('bail_regular');
  const pack = loadRulePack('bail_regular')!;
  const unparsed = {
    parsed_output: null,
    content: [],
    stop_reason: 'max_tokens',
    usage: { input_tokens: 9, output_tokens: 4 },
  };

  async function runD1() {
    const facts = regularBase();
    const u = (key: string, value: string): GivenValue => ({ source: 'user', key, value });
    const brief = buildBrief({
      kind: { id: pack.id, name: pack.name, court_document: true },
      checklist: buildChecklist(pack),
      values: facts.filter((f) => f.key !== 'grounds_for_bail').map((f) => u(f.key, f.display)),
    });
    const res = {
      setHeader: jest.fn(),
      write: jest.fn(() => true),
      end: jest.fn(),
      headersSent: false,
    };
    try {
      await streamGenerateFromBrief(
        {
          pack,
          templateConfig: loadTemplateConfig('bail_regular')!,
          brief,
          ledger: { facts, lists: loadAvermentLists('bail_regular') },
          language: 'en',
          targetParagraphs: 12,
          advocateName: 'Test Advocate',
          userId: 'u1',
          runId: 'run-684',
          runSequence: 1,
          runType: 'initial',
          loadSkeleton: () => skeleton,
        },
        res as unknown as Response,
      );
    } catch {
      // A null parsed_output ends in an error; only the model sent matters here.
    }
  }

  it('ai.model.drafter wins over ai.drafting_model', async () => {
    await set('ai.drafting_model', 'legacy-drafter-model');
    await set('ai.model.drafter', 'new-drafter-model');
    mockParse.mockResolvedValue(unparsed);
    await runD1();
    expect(mockParse.mock.calls.length).toBeGreaterThan(0);
    expect(mockParse.mock.calls[0][0].model).toBe('new-drafter-model');
  });

  it('falls back to ai.drafting_model when the role key is unset', async () => {
    await set('ai.drafting_model', 'legacy-drafter-model');
    mockParse.mockResolvedValue(unparsed);
    await runD1();
    expect(mockParse.mock.calls[0][0].model).toBe('legacy-drafter-model');
  });
});

describe('call site: intake uses the extractor role', () => {
  const USER = '507f1f77bcf86cd799439684';

  it('runIntake: ai.model.extractor wins over ai.intake_model', async () => {
    jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    await set('ai.intake_model', 'legacy-extractor-model');
    await set('ai.model.extractor', 'new-extractor-model');
    mockStream.mockResolvedValue(okStream());
    await runIntake({ userId: USER, plan: 'free', description: 'x' });
    expect(mockStream.mock.calls[0][0].model).toBe('new-extractor-model');
  });

  it('runIntake: the first call (intake_match) stays on the extractor; old key still works', async () => {
    jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    await set('ai.intake_model', 'legacy-extractor-model');
    mockStream.mockResolvedValue(okStream());
    await runIntake({ userId: USER, plan: 'free', description: 'x' });
    expect(mockStream.mock.calls[0][0].model).toBe('legacy-extractor-model');
  });

  it('runIntake: nothing set -> outcome unavailable, no model call, the log names ai.model.extractor', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = await runIntake({ userId: USER, plan: 'free', description: 'x', intakeId: 'i-1' });
    expect(r).toEqual({ intake_id: 'i-1', outcome: 'unavailable' });
    expect(mockStream).not.toHaveBeenCalled();
    expect(String(err.mock.calls[0][0])).toContain('ai.model.extractor');
  });

  it('runBriefIntake: ai.model.extractor wins; legacy key works alone', async () => {
    jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    await set('ai.intake_model', 'legacy-extractor-model');
    mockStream.mockResolvedValue(okStream());
    await runBriefIntake({ userId: USER, plan: 'free', description: 'x' });
    expect(mockStream.mock.calls[0][0].model).toBe('legacy-extractor-model');

    await redis.flushall();
    mockStream.mockReset();
    await setAppSetting({ key: 'ai.model.extractor', value: 'new-extractor-model' });
    mockStream.mockResolvedValue(okStream());
    await runBriefIntake({ userId: USER, plan: 'free', description: 'x' });
    expect(mockStream.mock.calls[0][0].model).toBe('new-extractor-model');
  });

  it('runBriefIntake: nothing set -> outcome unavailable, no model call', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = await runBriefIntake({
      userId: USER,
      plan: 'free',
      description: 'x',
      intakeId: 'i-2',
    });
    expect(r).toEqual({ intake_id: 'i-2', outcome: 'unavailable' });
    expect(mockStream).not.toHaveBeenCalled();
  });
});

describe('call site: preflight uses the fact_checker role', () => {
  const DATA: Record<string, unknown> = {
    court_name: 'patna_hc',
    applicant_name: 'Ramesh Kumar',
    father_name: 'Suresh Kumar',
    respondent_name: 'State of Bihar',
    applicant_age: 35,
    sections_charged: ['103', '109'],
    fir_number: '091/2024',
    fir_date: '15.06.2024',
    incident_date: '10.06.2024',
    facts_narrative:
      'The petitioner was falsely implicated in the FIR. At the time of the alleged incident, the petitioner was at his residence in Patna. The victim was injured but received timely medical treatment and is now recovering.',
  };
  const reply = {
    content: [{ type: 'text', text: '{"unusual":false,"hard_block":false,"findings":[]}' }],
    usage: { input_tokens: 5, output_tokens: 5 },
    stop_reason: 'end_turn',
  };

  beforeEach(() => {
    jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    mockCreate.mockResolvedValue(reply);
  });

  it('ai.model.fact_checker wins over ai.preflight_model', async () => {
    await set('ai.preflight_model', 'legacy-checker-model');
    await set('ai.model.fact_checker', 'new-checker-model');
    await preflightCheck('bail_anticipatory', DATA);
    expect(mockCreate.mock.calls[0][0].model).toBe('new-checker-model');
  });

  it('ai.preflight_model alone still works', async () => {
    await set('ai.preflight_model', 'legacy-checker-model');
    await preflightCheck('bail_anticipatory', DATA);
    expect(mockCreate.mock.calls[0][0].model).toBe('legacy-checker-model');
  });

  it('nothing set: degrades to rules only (no model call, a verdict still returned)', async () => {
    const r = await preflightCheck('bail_anticipatory', DATA);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(['pass', 'soft', 'hard']).toContain(r.verdict);
  });
});

// ── HTTP ────────────────────────────────────────────────────────────────────

describe('GET /admin/app-settings/registry', () => {
  it('200 for Admin: { entries } with 15 entries and never a stored value', async () => {
    await setAppSetting({ key: 'ai.model.drafter', value: 'SECRET-STORED-MODEL-ID' });
    await setAppSetting({ key: 'ai.drafting_model', value: 'SECRET-LEGACY-MODEL-ID' });
    const res = await supertest(app).get('/admin/app-settings/registry').set(ADMIN_HEADERS);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(['entries']);
    expect(res.body.entries).toHaveLength(15);
    expect(res.body.entries).toEqual(JSON.parse(JSON.stringify(getAppSettingsRegistry())));
    expect(JSON.stringify(res.body)).not.toContain('SECRET-');
    const required = res.body.entries
      .filter((e: { required: boolean }) => e.required)
      .map((e: { key: string }) => e.key);
    expect(required.sort()).toEqual(
      ['ai.model.drafter', 'ai.model.extractor', 'ai.model.fact_checker'].sort(),
    );
  });

  it('is not shadowed by the :key route: GET /admin/app-settings still lists settings', async () => {
    await setAppSetting({ key: 'ai.model.drafter', value: 'v' });
    const res = await supertest(app).get('/admin/app-settings').set(ADMIN_HEADERS);
    expect(res.status).toBe(200);
    expect(res.body.settings[0].key).toBe('ai.model.drafter');
  });

  it('403 for Client', async () => {
    const res = await supertest(app).get('/admin/app-settings/registry').set(CLIENT_HEADERS);
    expect(res.status).toBe(403);
  });

  it('401 without auth', async () => {
    const res = await supertest(app).get('/admin/app-settings/registry');
    expect(res.status).toBe(401);
  });
});

describe('PUT /admin/app-settings/ai.effort.*: validation', () => {
  const put = (key: string, body: unknown, headers = ADMIN_HEADERS) =>
    supertest(app)
      .put(`/admin/app-settings/${key}`)
      .set(headers)
      .send(body as object);

  it.each(['low', 'medium', 'high', 'xhigh', 'max'])('accepts %s', async (v) => {
    const res = await put('ai.effort.drafter', { value: v });
    expect(res.status).toBe(200);
    expect(res.body.value).toBe(v);
  });

  it.each(['HIGH', 'XHigh', '  max  ', ' Low'])('accepts mixed case / spaces: %j', async (v) => {
    const res = await put('ai.effort.fact_checker', { value: v });
    expect(res.status).toBe(200);
    // and the stored value resolves
    expect(await getRoleEffort('fact_checker')).toBe(v.trim().toLowerCase());
  });

  it.each([
    ['  HIGH ', 'high'],
    ['Medium', 'medium'],
    ['XHIGH', 'xhigh'],
    [' Max', 'max'],
  ])('stores an effort value canonical (trimmed, lower-cased): %j -> %j', async (sent, stored) => {
    const res = await put('ai.effort.drafter', { value: sent });
    expect(res.status).toBe(200);
    expect(res.body.value).toBe(stored);
    expect((await AppSetting.findOne({ key: 'ai.effort.drafter' }).lean())!.value).toBe(stored);
  });

  it('model ids and other keys are stored exactly as sent (case kept)', async () => {
    const cases: Array<[string, string]> = [
      ['ai.model.drafter', 'Vendor/Model_ID:1.0-MiXeD'],
      ['ai.model.fact_checker', 'CLAUDE-Haiku-X'],
      ['ai.cap.intake_extract', '3000'],
      ['some.other_key', 'MiXeD Value'],
    ];
    for (const [key, value] of cases) {
      const res = await put(key, { value });
      expect(res.status).toBe(200);
      expect((await AppSetting.findOne({ key }).lean())!.value).toBe(value);
    }
  });

  it.each(MODEL_ROLES)('validates ai.effort.%s', async (role) => {
    const bad = await put(`ai.effort.${role}`, { value: 'turbo' });
    expect(bad.status).toBe(400);
    const good = await put(`ai.effort.${role}`, { value: 'high' });
    expect(good.status).toBe(200);
  });

  it('validates the legacy stage effort keys too (ai.effort.body)', async () => {
    expect((await put('ai.effort.body', { value: 'turbo' })).status).toBe(400);
    expect((await put('ai.effort.body', { value: 'high' })).status).toBe(200);
  });

  it('rejects turbo with the exact error text and stores nothing', async () => {
    const res = await put('ai.effort.drafter', { value: 'turbo' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'value for ai.effort.drafter must be one of: low, medium, high, xhigh, max',
    });
    expect(await AppSetting.countDocuments({ key: 'ai.effort.drafter' })).toBe(0);
  });

  it('rejects an empty value (400) and a non-string value (400); nothing stored', async () => {
    const empty = await put('ai.effort.drafter', { value: '' });
    expect(empty.status).toBe(400);
    const blank = await put('ai.effort.drafter', { value: '   ' });
    expect(blank.status).toBe(400);
    for (const value of [123, null, true, ['high'], { a: 1 }]) {
      const res = await put('ai.effort.drafter', { value });
      expect(res.status).toBe(400);
    }
    expect(await AppSetting.countDocuments({ key: 'ai.effort.drafter' })).toBe(0);
  });

  it('rejects a bad value on an existing row without changing it', async () => {
    await put('ai.effort.drafter', { value: 'high' });
    const res = await put('ai.effort.drafter', { value: 'turbo' });
    expect(res.status).toBe(400);
    expect((await AppSetting.findOne({ key: 'ai.effort.drafter' }).lean())!.value).toBe('high');
  });

  it('non-effort keys are unaffected: any text is still accepted', async () => {
    for (const key of [
      'ai.cap.intake_extract',
      'ai.effortless',
      'finance.usd_inr',
      'ai.model.language',
    ]) {
      const res = await put(key, { value: 'turbo' });
      expect(res.status).toBe(200);
    }
  });

  it('model ids stay free text', async () => {
    for (const role of MODEL_ROLES) {
      const res = await put(`ai.model.${role}`, { value: 'some-vendor/Any Model_ID:1.0' });
      expect(res.status).toBe(200);
      expect(res.body.value).toBe('some-vendor/Any Model_ID:1.0');
    }
    expect(await resolveModel('drafter')).toBe('some-vendor/Any Model_ID:1.0');
  });

  it('effort PUT still needs Admin (403 Client, 401 none)', async () => {
    expect((await put('ai.effort.drafter', { value: 'high' }, CLIENT_HEADERS)).status).toBe(403);
    const res = await supertest(app)
      .put('/admin/app-settings/ai.effort.drafter')
      .send({ value: 'high' });
    expect(res.status).toBe(401);
  });

  it('an effort written through the route is what getRoleEffort returns at once', async () => {
    expect(await getRoleEffort('drafter')).toBe('medium');
    await put('ai.effort.drafter', { value: 'MAX' });
    expect(await getRoleEffort('drafter')).toBe('max');
  });
});

describe('GET /admin/overview/ai-runtime', () => {
  const get = (headers?: Record<string, string>) => {
    const r = supertest(app).get('/admin/overview/ai-runtime');
    return headers ? r.set(headers) : r;
  };

  it('403 for Client, 401 without auth', async () => {
    expect((await get(CLIENT_HEADERS)).status).toBe(403);
    expect((await get()).status).toBe(401);
  });

  it('nothing set: every model null, every source null, old fields null', async () => {
    const res = await get(ADMIN_HEADERS);
    expect(res.status).toBe(200);
    expect(res.body.drafting_model).toBeNull();
    expect(res.body.preflight_model).toBeNull();
    expect(Object.keys(res.body.models)).toEqual([...MODEL_ROLES]);
    expect(Object.keys(res.body.model_sources)).toEqual([...MODEL_ROLES]);
    for (const role of MODEL_ROLES) {
      expect(res.body.models[role]).toBeNull();
      expect(res.body.model_sources[role]).toBeNull();
    }
  });

  it('legacy-only deployment: sources legacy, drafting_model/preflight_model unchanged', async () => {
    await set('ai.drafting_model', 'legacy-drafter');
    await set('ai.preflight_model', 'legacy-checker');
    await set('ai.intake_model', 'legacy-intake');
    const res = await get(ADMIN_HEADERS);
    expect(res.status).toBe(200);
    expect(res.body.drafting_model).toBe('legacy-drafter');
    expect(res.body.preflight_model).toBe('legacy-checker');
    expect(res.body.models).toEqual({
      matcher: 'legacy-intake',
      extractor: 'legacy-intake',
      drafter: 'legacy-drafter',
      fact_checker: 'legacy-checker',
      legal_reviewer: null,
      language: null,
    });
    expect(res.body.model_sources).toEqual({
      matcher: 'legacy',
      extractor: 'legacy',
      drafter: 'legacy',
      fact_checker: 'legacy',
      legal_reviewer: null,
      language: null,
    });
  });

  it('new keys win and show source new; a matcher served by ai.model.extractor shows new', async () => {
    await set('ai.drafting_model', 'legacy-drafter');
    await set('ai.model.drafter', 'new-drafter');
    await set('ai.model.extractor', 'new-extractor');
    await set('ai.model.language', 'new-language');
    const res = await get(ADMIN_HEADERS);
    expect(res.body.drafting_model).toBe('new-drafter');
    expect(res.body.models.drafter).toBe('new-drafter');
    expect(res.body.models.matcher).toBe('new-extractor');
    expect(res.body.model_sources).toMatchObject({
      drafter: 'new',
      extractor: 'new',
      matcher: 'new',
      language: 'new',
      fact_checker: null,
      legal_reviewer: null,
    });
  });
});

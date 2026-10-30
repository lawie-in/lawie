/**
 * T-585 — missing ai.* AppSettings: getConfigWarnings / primeConfigWarnings and
 * the `config_warnings` field on /health (criteria 2, 3, 4).
 */
import './setupEnv';
import './setupDb';

import supertest from 'supertest';

import app from '../app';
import { AppSetting } from '../models/AppSetting.model';
import {
  _clearAppSettingsCache,
  getAppSetting,
  getConfigWarnings,
  primeConfigWarnings,
  setAppSetting,
} from '../services/app-settings.service';

// T-684: the warning names the role key; a role is satisfied by its role key OR its legacy key.
const ROLES = [
  { role: 'drafter', key: 'ai.model.drafter', legacy: 'ai.drafting_model' },
  { role: 'extractor', key: 'ai.model.extractor', legacy: 'ai.intake_model' },
  { role: 'fact_checker', key: 'ai.model.fact_checker', legacy: 'ai.preflight_model' },
] as const;
const KEYS: string[] = ROLES.map((r) => r.key);
const LEGACY_KEYS: string[] = ROLES.map((r) => r.legacy);
const UPDATER = '507f1f77bcf86cd799439011';

async function seed(keys: string[]): Promise<void> {
  for (const key of keys) {
    await AppSetting.create({ key, value: 'model-x', updatedBy: UPDATER });
  }
}

beforeEach(() => {
  _clearAppSettingsCache();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('primeConfigWarnings / getConfigWarnings', () => {
  it('all three role keys set: empty list', async () => {
    await seed(KEYS);
    expect(await primeConfigWarnings()).toEqual([]);
    expect(getConfigWarnings()).toEqual([]);
  });

  it('only the legacy keys set (an old deployment): empty list, no warning', async () => {
    await seed(LEGACY_KEYS);
    expect(await primeConfigWarnings()).toEqual([]);
    expect(getConfigWarnings()).toEqual([]);
  });

  it('role keys and legacy keys both set: empty list', async () => {
    await seed([...KEYS, ...LEGACY_KEYS]);
    expect(await primeConfigWarnings()).toEqual([]);
    expect(getConfigWarnings()).toEqual([]);
  });

  it.each(ROLES)('only $role unset (neither key): the role key alone', async ({ key }) => {
    const others = ROLES.filter((r) => r.key !== key);
    await seed(others.map((r) => r.key));
    expect(await primeConfigWarnings()).toEqual([key]);
    expect(getConfigWarnings()).toEqual([key]);
  });

  it.each(ROLES)('$role satisfied by its legacy key alone: not reported', async ({ legacy }) => {
    // every other role is unset, so only this one drops out of the list
    await seed([legacy]);
    const warnings = await primeConfigWarnings();
    expect(warnings).toHaveLength(2);
    expect(warnings).not.toContain(ROLES.find((r) => r.legacy === legacy)!.key);
  });

  it.each(ROLES)('$role: a legacy key of ANOTHER role does not satisfy it', async ({ key }) => {
    const other = ROLES.find((r) => r.key !== key)!;
    await seed([other.legacy]);
    expect(await primeConfigWarnings()).toContain(key);
  });

  it('none set: the three role keys in fixed order, never the legacy names', async () => {
    expect(await primeConfigWarnings()).toEqual([
      'ai.model.drafter',
      'ai.model.extractor',
      'ai.model.fact_checker',
    ]);
    expect(getConfigWarnings()).toEqual(KEYS);
    for (const l of LEGACY_KEYS) expect(getConfigWarnings()).not.toContain(l);
  });

  it('is empty before any read', () => {
    expect(getConfigWarnings()).toEqual([]);
  });

  it('a setting outside the three roles never appears', async () => {
    await expect(getAppSetting('other.key')).rejects.toThrow();
    await expect(getAppSetting('ai.model.matcher')).rejects.toThrow();
    await expect(getAppSetting('ai.model.language')).rejects.toThrow();
    expect(getConfigWarnings()).toEqual([]);
  });

  it('setAppSetting on the role key removes the role from the list', async () => {
    await primeConfigWarnings();
    await setAppSetting({ key: 'ai.model.fact_checker', value: 'm', updatedBy: UPDATER });
    expect(getConfigWarnings()).toEqual(['ai.model.drafter', 'ai.model.extractor']);
  });

  it('setAppSetting on the legacy key removes the role from the list', async () => {
    await primeConfigWarnings();
    await setAppSetting({ key: 'ai.preflight_model', value: 'm', updatedBy: UPDATER });
    expect(getConfigWarnings()).toEqual(['ai.model.drafter', 'ai.model.extractor']);
  });

  it('a role whose keys both miss on a later read is put back', async () => {
    await seed(KEYS);
    await primeConfigWarnings();
    expect(getConfigWarnings()).toEqual([]);
    await AppSetting.deleteOne({ key: 'ai.model.extractor' });
    _clearAppSettingsCache(); // drop the cached hit so the read reaches the DB
    // clearing also resets the list; both of the role's keys must be seen missing again
    await expect(getAppSetting('ai.model.extractor')).rejects.toThrow();
    expect(getConfigWarnings()).toEqual([]); // the legacy key was not read yet: not missing
    await expect(getAppSetting('ai.intake_model')).rejects.toThrow();
    expect(getConfigWarnings()).toEqual(['ai.model.extractor']);
  });

  it('a getAppSetting that finds the role key removes the role', async () => {
    await primeConfigWarnings();
    expect(getConfigWarnings()).toEqual(KEYS);
    await seed(['ai.model.drafter']);
    await getAppSetting('ai.model.drafter');
    expect(getConfigWarnings()).toEqual(['ai.model.extractor', 'ai.model.fact_checker']);
  });

  it('a getAppSetting that finds the legacy key removes the role', async () => {
    await primeConfigWarnings();
    await seed(['ai.drafting_model']);
    await getAppSetting('ai.drafting_model');
    expect(getConfigWarnings()).toEqual(['ai.model.extractor', 'ai.model.fact_checker']);
  });

  it('never throws when the DB read fails', async () => {
    jest.spyOn(AppSetting, 'findOne').mockImplementation((() => {
      throw new Error('db down');
    }) as never);
    await expect(primeConfigWarnings()).resolves.toEqual([]);
  });
});

describe('GET /health config_warnings', () => {
  it('is an empty array when none are missing; other fields unchanged', async () => {
    await seed(KEYS);
    await primeConfigWarnings();
    const res = await supertest(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.config_warnings).toEqual([]);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('drafting');
    expect(res.body.timestamp).toBeDefined();
    expect(res.body.signedTables).toBeDefined();
    expect(Object.keys(res.body).sort()).toEqual(
      ['config_warnings', 'service', 'signedTables', 'status', 'timestamp'].sort(),
    );
  });

  it('an old deployment (legacy keys only) has no warning', async () => {
    await seed(LEGACY_KEYS);
    await primeConfigWarnings();
    const res = await supertest(app).get('/health');
    expect(res.body.config_warnings).toEqual([]);
  });

  it('lists the missing role keys', async () => {
    await seed(['ai.model.drafter']);
    await primeConfigWarnings();
    const res = await supertest(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.config_warnings).toEqual(['ai.model.extractor', 'ai.model.fact_checker']);
    expect(Array.isArray(res.body.config_warnings)).toBe(true);
  });

  it('makes no AppSetting DB call per request', async () => {
    await primeConfigWarnings();
    const spies = (
      ['find', 'findOne', 'findById', 'findOneAndUpdate', 'countDocuments', 'aggregate'] as const
    ).map((m) => jest.spyOn(AppSetting, m as never));
    const res = await supertest(app).get('/health');
    await supertest(app).get('/health');
    expect(res.body.config_warnings).toEqual(KEYS);
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });
});

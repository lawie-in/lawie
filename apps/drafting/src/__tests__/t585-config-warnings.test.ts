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

const KEYS = ['ai.drafting_model', 'ai.preflight_model', 'ai.intake_model'];
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
  it('all three set: empty list', async () => {
    await seed(KEYS);
    expect(await primeConfigWarnings()).toEqual([]);
    expect(getConfigWarnings()).toEqual([]);
  });

  it.each(KEYS)('only %s missing: that key alone', async (missing) => {
    await seed(KEYS.filter((k) => k !== missing));
    expect(await primeConfigWarnings()).toEqual([missing]);
    expect(getConfigWarnings()).toEqual([missing]);
  });

  it('all missing: all three in fixed order', async () => {
    expect(await primeConfigWarnings()).toEqual(KEYS);
    expect(getConfigWarnings()).toEqual(KEYS);
  });

  it('is empty before any read', () => {
    expect(getConfigWarnings()).toEqual([]);
  });

  it('a setting outside the three never appears', async () => {
    await expect(getAppSetting('other.key')).rejects.toThrow();
    expect(getConfigWarnings()).toEqual([]);
  });

  it('setAppSetting removes the key from the list', async () => {
    await primeConfigWarnings();
    await setAppSetting({ key: 'ai.preflight_model', value: 'm', updatedBy: UPDATER });
    expect(getConfigWarnings()).toEqual(['ai.drafting_model', 'ai.intake_model']);
  });

  it('a getAppSetting that misses adds the key', async () => {
    await seed(KEYS);
    await primeConfigWarnings();
    expect(getConfigWarnings()).toEqual([]);
    await AppSetting.deleteOne({ key: 'ai.intake_model' });
    _clearAppSettingsCache(); // drop the cached hit so the read reaches the DB
    // clearing also resets the list; the miss must put the key back
    await expect(getAppSetting('ai.intake_model')).rejects.toThrow();
    expect(getConfigWarnings()).toEqual(['ai.intake_model']);
  });

  it('a getAppSetting that finds the doc removes the key', async () => {
    await primeConfigWarnings();
    expect(getConfigWarnings()).toEqual(KEYS);
    await seed(['ai.drafting_model']);
    await getAppSetting('ai.drafting_model');
    expect(getConfigWarnings()).toEqual(['ai.preflight_model', 'ai.intake_model']);
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
  });

  it('lists the missing keys', async () => {
    await seed(['ai.drafting_model']);
    await primeConfigWarnings();
    const res = await supertest(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.config_warnings).toEqual(['ai.preflight_model', 'ai.intake_model']);
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

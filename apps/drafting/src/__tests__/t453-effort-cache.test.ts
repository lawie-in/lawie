/**
 * T-453 round 4 — the per-stage effort cache in llm-usage.ts: one settings
 * read per stage per 60 s (a missing key included), a re-read after 60 s, the
 * invalid-value warn once per period, and setAppSetting invalidating only the
 * stage whose key was written. Time is controlled by stubbing Date.now.
 */
import './setupEnv';
import './setupDb';

import logger from '../config/logger';
import { AppSetting } from '../models/AppSetting.model';
import { _clearAppSettingsCache, setAppSetting } from '../services/app-settings.service';
import { getAiEffort } from '../services/llm-usage';

let now = 1_800_000_000_000;
let findOne: jest.SpyInstance;

const readsOf = (key: string) =>
  findOne.mock.calls.filter((c) => (c[0] as { key?: string })?.key === key).length;

beforeEach(() => {
  now = 1_800_000_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  _clearAppSettingsCache();
  findOne = jest.spyOn(AppSetting, 'findOne');
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('getAiEffort cache', () => {
  it('reads settings once per stage per 60 s, even when the key is missing', async () => {
    for (let i = 0; i < 5; i++) {
      expect(await getAiEffort('body')).toBe('medium');
      expect(await getAiEffort('intake')).toBe('medium');
    }
    expect(readsOf('ai.effort.body')).toBe(1);
    expect(readsOf('ai.effort.intake')).toBe(1);
    expect(readsOf('ai.effort.preflight')).toBe(0);
  });

  it('re-reads after 60 s and picks up a changed row', async () => {
    expect(await getAiEffort('body')).toBe('medium');
    await AppSetting.create({ key: 'ai.effort.body', value: 'high' });
    now += 59_000;
    expect(await getAiEffort('body')).toBe('medium'); // still cached
    expect(readsOf('ai.effort.body')).toBe(1);
    now += 2_000; // 61 s
    expect(await getAiEffort('body')).toBe('high');
    expect(readsOf('ai.effort.body')).toBeGreaterThanOrEqual(2);
  });

  it('logs the invalid-value warn once per period, not per call, and again after the period', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    await AppSetting.create({ key: 'ai.effort.body', value: 'nonsense' });
    for (let i = 0; i < 4; i++) expect(await getAiEffort('body')).toBe('medium');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toEqual({ key: 'ai.effort.body' });
    now += 61_000;
    expect(await getAiEffort('body')).toBe('medium');
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("setAppSetting('ai.effort.body', ...) invalidates only the body entry", async () => {
    await getAiEffort('body');
    await getAiEffort('intake');
    expect(readsOf('ai.effort.body')).toBe(1);
    expect(readsOf('ai.effort.intake')).toBe(1);

    await setAppSetting({ key: 'ai.effort.body', value: 'xhigh' });
    expect(await getAiEffort('body')).toBe('xhigh');
    expect(await getAiEffort('intake')).toBe('medium');
    expect(readsOf('ai.effort.intake')).toBe(1); // intake entry kept
    expect(readsOf('ai.effort.body')).toBeGreaterThanOrEqual(2); // body re-read
  });

  it('_clearAppSettingsCache clears every stage entry', async () => {
    await getAiEffort('body');
    await getAiEffort('intake');
    _clearAppSettingsCache();
    await getAiEffort('body');
    await getAiEffort('intake');
    expect(readsOf('ai.effort.body')).toBe(2);
    expect(readsOf('ai.effort.intake')).toBe(2);
  });
});

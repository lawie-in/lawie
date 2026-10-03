/**
 * T-003 — per-model USD rate lookup, USD→INR conversion rate, and the
 * costUsd arithmetic, all sourced from AppSetting instead of hardcoded.
 */
import './setupEnv';
import './setupDb';

import { AppSetting } from '../models/AppSetting.model';
import {
  _clearAppSettingsCache,
  AppSettingMissingError,
  computeCostUsd,
  getModelRateUsd,
  getUsdToInrRate,
  ModelRateMissingError,
} from '../services/app-settings.service';

beforeEach(() => {
  _clearAppSettingsCache();
});

describe('getModelRateUsd', () => {
  it('returns the configured rate for a known model', async () => {
    await AppSetting.create({
      key: 'ai.model_rates_usd',
      value: JSON.stringify({
        'claude-sonnet-4-20250514': { inputPerMTok: 3, outputPerMTok: 15 },
      }),
    });

    const rate = await getModelRateUsd('claude-sonnet-4-20250514');
    expect(rate).toEqual({ inputPerMTok: 3, outputPerMTok: 15 });
  });

  it('throws AppSettingMissingError when the key is not configured at all', async () => {
    await expect(getModelRateUsd('claude-sonnet-4-20250514')).rejects.toThrow(
      AppSettingMissingError,
    );
  });

  it('throws ModelRateMissingError when the key exists but has no entry for this model', async () => {
    await AppSetting.create({
      key: 'ai.model_rates_usd',
      value: JSON.stringify({ 'some-other-model': { inputPerMTok: 1, outputPerMTok: 2 } }),
    });

    await expect(getModelRateUsd('claude-sonnet-4-20250514')).rejects.toThrow(
      ModelRateMissingError,
    );
  });

  it('throws a clear error when the value is not valid JSON', async () => {
    await AppSetting.create({ key: 'ai.model_rates_usd', value: 'not json' });
    await expect(getModelRateUsd('claude-sonnet-4-20250514')).rejects.toThrow(/not valid JSON/);
  });
});

describe('getUsdToInrRate', () => {
  it('returns the configured numeric rate', async () => {
    await AppSetting.create({ key: 'billing.usd_to_inr_rate', value: '87.5' });
    await expect(getUsdToInrRate()).resolves.toBe(87.5);
  });

  it('throws AppSettingMissingError when unset', async () => {
    await expect(getUsdToInrRate()).rejects.toThrow(AppSettingMissingError);
  });

  it('throws when the configured value is not a positive number', async () => {
    await AppSetting.create({ key: 'billing.usd_to_inr_rate', value: 'abc' });
    await expect(getUsdToInrRate()).rejects.toThrow(/not a valid positive number/);
  });
});

describe('computeCostUsd', () => {
  it('computes cost from input + output tokens at per-million-token rates', () => {
    const cost = computeCostUsd(
      { inputTokens: 1_000_000, outputTokens: 500_000 },
      { inputPerMTok: 3, outputPerMTok: 15 },
    );
    // 1M in @ $3/MTok = $3; 0.5M out @ $15/MTok = $7.5
    expect(cost).toBeCloseTo(10.5, 6);
  });

  it('returns 0 for zero usage', () => {
    expect(
      computeCostUsd({ inputTokens: 0, outputTokens: 0 }, { inputPerMTok: 3, outputPerMTok: 15 }),
    ).toBe(0);
  });
});

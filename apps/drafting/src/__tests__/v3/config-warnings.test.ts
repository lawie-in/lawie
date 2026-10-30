/**
 * T-683 (Arjun, T-683 answers section 8 item 2): at feature.drafting_v3_stage
 * >= 1, a missing ai.model.extractor is a config warning even with the legacy
 * ai.intake_model set. Stage 0: unchanged (the legacy key satisfies the role).
 * Key names only. In-memory Mongo.
 */
import '../setupEnv';
import '../setupDb';

import { AppSetting } from '../../models/AppSetting.model';
import {
  _clearAppSettingsCache,
  getConfigWarnings,
  primeConfigWarnings,
  setAppSetting,
} from '../../services/app-settings.service';

const UPDATER = '507f1f77bcf86cd799439011';
const BASE = ['ai.model.drafter', 'ai.model.fact_checker'];

async function seed(entries: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(entries)) {
    await AppSetting.create({ key, value, updatedBy: UPDATER });
  }
}
const withBase = (extra: Record<string, string>): Record<string, string> => ({
  ...Object.fromEntries(BASE.map((k) => [k, 'model-x'])),
  ...extra,
});

beforeEach(() => {
  _clearAppSettingsCache();
});

describe('getConfigWarnings and the v3 stage', () => {
  it('stage 1, ai.intake_model set, ai.model.extractor missing: lists ai.model.extractor', async () => {
    await seed(withBase({ 'ai.intake_model': 'legacy-model', 'feature.drafting_v3_stage': '1' }));
    expect(await primeConfigWarnings()).toEqual(['ai.model.extractor']);
    expect(getConfigWarnings()).toEqual(['ai.model.extractor']);
  });

  it.each(['2', '3'])('stage %s warns too', async (stage) => {
    await seed(withBase({ 'ai.intake_model': 'legacy-model', 'feature.drafting_v3_stage': stage }));
    expect(await primeConfigWarnings()).toEqual(['ai.model.extractor']);
  });

  it('stage 0: the legacy key still satisfies the role, no warning', async () => {
    await seed(withBase({ 'ai.intake_model': 'legacy-model', 'feature.drafting_v3_stage': '0' }));
    expect(await primeConfigWarnings()).toEqual([]);
    expect(getConfigWarnings()).toEqual([]);
  });

  it('no stage setting at all: no warning', async () => {
    await seed(withBase({ 'ai.intake_model': 'legacy-model' }));
    expect(await primeConfigWarnings()).toEqual([]);
  });

  it('a bad stage value is not a raised stage', async () => {
    await seed(withBase({ 'ai.intake_model': 'legacy-model', 'feature.drafting_v3_stage': 'on' }));
    expect(await primeConfigWarnings()).toEqual([]);
  });

  it('stage 1 with ai.model.extractor set: no warning', async () => {
    await seed(withBase({ 'ai.model.extractor': 'model-x', 'feature.drafting_v3_stage': '1' }));
    expect(await primeConfigWarnings()).toEqual([]);
  });

  it('stage 1 and nothing set for the extractor: still one entry, not two', async () => {
    await seed(withBase({ 'feature.drafting_v3_stage': '1' }));
    expect(await primeConfigWarnings()).toEqual(['ai.model.extractor']);
  });

  it('raising the stage by setAppSetting adds the warning, lowering it removes it', async () => {
    await seed(withBase({ 'ai.intake_model': 'legacy-model', 'feature.drafting_v3_stage': '0' }));
    await primeConfigWarnings();
    expect(getConfigWarnings()).toEqual([]);
    await setAppSetting({ key: 'feature.drafting_v3_stage', value: '1', updatedBy: UPDATER });
    expect(getConfigWarnings()).toEqual(['ai.model.extractor']);
    await setAppSetting({ key: 'feature.drafting_v3_stage', value: '0', updatedBy: UPDATER });
    expect(getConfigWarnings()).toEqual([]);
  });

  it('names keys only: no setting value is in the list', async () => {
    await seed(
      withBase({ 'ai.intake_model': 'SECRET-LEGACY-MODEL', 'feature.drafting_v3_stage': '1' }),
    );
    const w = await primeConfigWarnings();
    expect(JSON.stringify(w)).not.toContain('SECRET-LEGACY-MODEL');
    expect(w.every((x) => /^ai\.model\./.test(x))).toBe(true);
  });
});

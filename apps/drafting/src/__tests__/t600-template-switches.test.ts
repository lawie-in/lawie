/**
 * T-600 - template-switches (pure module extracted from feature-switches, T-375 unchanged).
 */
import {
  CIVIL_PLAINT_CATEGORY,
  hiddenAtDefaults,
  LEGACY_PLAINT_DOC_TYPE,
  switchForTemplate,
  TEMPLATE_CIVIL_PLAINT_SETTING,
} from '../config/catalogue/template-switches';
import { DOC_TYPE_ALIASES, TEMPLATE_CATALOGUE } from '../config/catalogue';
import * as featureSwitches from '../services/feature-switches';

const plaintIds = Object.keys(TEMPLATE_CATALOGUE).filter(
  (id) => TEMPLATE_CATALOGUE[id].category === CIVIL_PLAINT_CATEGORY,
);

describe('T-600 switchForTemplate', () => {
  it("maps the legacy 'plaint' docType to the civil plaint switch", () => {
    expect(LEGACY_PLAINT_DOC_TYPE).toBe('plaint');
    expect(switchForTemplate('plaint')).toBe(TEMPLATE_CIVIL_PLAINT_SETTING);
  });

  it('maps every civil_plaints_suits id', () => {
    expect(plaintIds.length).toBeGreaterThan(0);
    for (const id of plaintIds) expect(switchForTemplate(id)).toBe(TEMPLATE_CIVIL_PLAINT_SETTING);
  });

  it('follows aliases to their target', () => {
    for (const [alias, target] of Object.entries(DOC_TYPE_ALIASES)) {
      const expected = plaintIds.includes(target) ? TEMPLATE_CIVIL_PLAINT_SETTING : undefined;
      expect(switchForTemplate(alias)).toBe(expected);
    }
  });

  it('returns undefined for an unrelated or unknown id', () => {
    const other = Object.keys(TEMPLATE_CATALOGUE).find(
      (id) => TEMPLATE_CATALOGUE[id].category !== CIVIL_PLAINT_CATEGORY,
    ) as string;
    expect(switchForTemplate(other)).toBeUndefined();
    expect(switchForTemplate('definitely_not_a_template')).toBeUndefined();
    expect(switchForTemplate('constructor')).toBeUndefined();
  });
});

describe('T-600 hiddenAtDefaults', () => {
  it('is exactly the civil_plaints_suits ids', () => {
    expect([...hiddenAtDefaults()].sort()).toEqual([...plaintIds].sort());
  });
});

describe('T-600 feature-switches re-exports', () => {
  it('are the same values as template-switches', () => {
    expect(featureSwitches.switchForTemplate).toBe(switchForTemplate);
    expect(featureSwitches.CIVIL_PLAINT_CATEGORY).toBe(CIVIL_PLAINT_CATEGORY);
    expect(featureSwitches.LEGACY_PLAINT_DOC_TYPE).toBe(LEGACY_PLAINT_DOC_TYPE);
    expect(featureSwitches.TEMPLATE_CIVIL_PLAINT_SETTING).toBe(TEMPLATE_CIVIL_PLAINT_SETTING);
  });
});

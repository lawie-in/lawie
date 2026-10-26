/**
 * T-600: the template-switch facts, as a pure module (no env, logger,
 * mongoose or service import), so the landing catalogue exporter can run with
 * no env and no database.
 *
 * Moved out of services/feature-switches.ts (T-375) unchanged. That module
 * imports and re-exports everything here, so its importers do not change; it
 * still owns the runtime read (AppSetting, the env fallback, the fixture-user
 * rule). This module only says which switch covers a template id and what
 * that switch is when nothing has been set.
 */
import { catalogueCategoryFor, DOC_TYPE_ALIASES, TEMPLATE_CATALOGUE } from './index';

export const TEMPLATE_CIVIL_PLAINT_SETTING = 'feature.template_civil_plaint';

/** The catalogue category `feature.template_civil_plaint` hides (Arjun's ruling 1). */
export const CIVIL_PLAINT_CATEGORY = 'civil_plaints_suits';

/** The legacy POST /generate docType that is a plaint (Arjun's ruling 2). Not a catalogue id. */
export const LEGACY_PLAINT_DOC_TYPE = 'plaint';

/**
 * Each template switch at its code default: the value with no AppSetting doc
 * (T-375: off). Must agree with feature-switches.ts `envDefaultFor`, which
 * gives no template switch an env default. Flip a default here and re-run
 * `export:catalogue` to keep the landing in step (Arjun, 26 Oct 2026).
 */
export const TEMPLATE_SWITCH_DEFAULTS: Readonly<Record<string, boolean>> = Object.freeze({
  [TEMPLATE_CIVIL_PLAINT_SETTING]: false,
});

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/**
 * The switch that hides a template id, a doc-type alias of one, or the legacy
 * 'plaint' docType; `undefined` when no switch covers it. The category comes
 * from the catalogue, so no plaint id is listed here.
 */
export function switchForTemplate(templateId: string): string | undefined {
  if (templateId === LEGACY_PLAINT_DOC_TYPE) return TEMPLATE_CIVIL_PLAINT_SETTING;
  const id = hasOwn(DOC_TYPE_ALIASES, templateId) ? DOC_TYPE_ALIASES[templateId] : templateId;
  if (catalogueCategoryFor(id) === CIVIL_PLAINT_CATEGORY) return TEMPLATE_CIVIL_PLAINT_SETTING;
  return undefined;
}

/**
 * Every catalogue template id hidden when each template switch is at its
 * default (no AppSetting, no fixture user). A switch missing from
 * TEMPLATE_SWITCH_DEFAULTS counts as off, the same fail-closed rule as T-375.
 */
export function hiddenAtDefaults(): Set<string> {
  const hidden = new Set<string>();
  for (const id of Object.keys(TEMPLATE_CATALOGUE)) {
    const setting = switchForTemplate(id);
    if (setting === undefined) continue;
    const on = hasOwn(TEMPLATE_SWITCH_DEFAULTS, setting) && TEMPLATE_SWITCH_DEFAULTS[setting];
    if (!on) hidden.add(id);
  }
  return hidden;
}

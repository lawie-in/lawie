/**
 * AppSettings service — runtime config lookup with in-memory TTL cache.
 *
 * Reads from the AppSetting Mongo collection. A short TTL (60s) means changes
 * via the admin UI propagate to all drafting-service replicas within a minute
 * without restart or pub/sub.
 *
 * Strict: if a key is missing from the DB, `getAppSetting` throws an
 * AppSettingMissingError. This is intentional — model names and other AI
 * config must live in the DB only (per founder instruction 2026-05-11), so
 * there is no codebase or env fallback. Callers handle the error by surfacing
 * a clear "set this key in /admin/ai-config" message to the advocate.
 * Exception (T-283): the two feature switches fall back to FEATURE_DEFAULT_* in intake.service.ts when missing.
 */
import { AppSetting } from '../models/AppSetting.model';

const TTL_MS = 60_000;

interface CacheEntry {
  value: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * T-585 (Arjun's go-live finding): the AI model roles drafting cannot work
 * without. The missing state of each of their keys (the T-684 role key and
 * its legacy key) is held in memory, set at boot by primeConfigWarnings and
 * refreshed on every later read or write of one of them, so /health reports
 * it with no DB call. Key names only, never values.
 *
 * T-684: a required role is missing only when its role key AND its legacy key
 * (if it has one) were both last seen missing. A key never read counts as not
 * missing, as before. The warning names the role key (ai.model.<role>).
 */
const missingRequired = new Set<string>();

function requiredModelKeys(role: ModelRole): string[] {
  const spec = MODEL_ROLE_REGISTRY[role];
  return spec.legacyModelKey ? [spec.modelKey, spec.legacyModelKey] : [spec.modelKey];
}

function isTrackedKey(key: string): boolean {
  return REQUIRED_MODEL_ROLES.some((role) => requiredModelKeys(role).includes(key));
}

function trackRequired(key: string, missing: boolean): void {
  if (!isTrackedKey(key)) return;
  if (missing) missingRequired.add(key);
  else missingRequired.delete(key);
}

/**
 * T-683 (Arjun, T-683 answers §8 item 2): while feature.drafting_v3_stage is
 * 1 or more, ai.model.extractor is required on its own: the v3 Extractor needs
 * it seeded, and the legacy ai.intake_model does not clear the warning. The
 * stage last seen on a read or write, held in memory like the missing keys.
 * The key is the one v3/stage.ts reads (DRAFTING_V3_STAGE_SETTING), written out
 * here because stage.ts imports this module.
 */
const V3_STAGE_SETTING = 'feature.drafting_v3_stage';
let v3StageRaised = false;

function trackV3Stage(key: string, value: string | null): void {
  if (key !== V3_STAGE_SETTING) return;
  v3StageRaised = value !== null && /^[1-3]$/.test(value.trim());
}

/**
 * T-585 / T-684: the role keys of the required roles that are missing (role
 * key and legacy key both missing at the last read), in a fixed order
 * (ai.model.drafter, ai.model.extractor, ai.model.fact_checker). No DB call.
 */
export function getConfigWarnings(): string[] {
  const extractorKey = MODEL_ROLE_REGISTRY.extractor.modelKey;
  // T-683: at stage ≥ 1, a missing ai.model.extractor warns even with ai.intake_model set.
  const v3Needs = v3StageRaised && missingRequired.has(extractorKey);
  return REQUIRED_MODEL_ROLES.filter(
    (role) =>
      requiredModelKeys(role).every((k) => missingRequired.has(k)) ||
      (role === 'extractor' && v3Needs),
  ).map((role) => MODEL_ROLE_REGISTRY[role].modelKey);
}

/**
 * T-585: read the required AI model keys once at boot and return the missing
 * roles' keys. Per role, the role key is read first and the legacy key only if
 * the role key is not found. Never throws; a read error other than a missing
 * doc leaves that key's state as it was.
 */
export async function primeConfigWarnings(): Promise<string[]> {
  // T-683: the v3 stage first, so the extractor rule above knows it.
  try {
    await getAppSetting(V3_STAGE_SETTING);
  } catch {
    // Missing (stage 0) or unreadable: getAppSetting already recorded it.
  }
  for (const role of REQUIRED_MODEL_ROLES) {
    for (const key of requiredModelKeys(role)) {
      try {
        await getAppSetting(key);
        break; // the role is set
      } catch {
        // getAppSetting already recorded a missing key; other errors are not a config warning.
      }
    }
  }
  return getConfigWarnings();
}

/**
 * T-453: modules that keep their own cache of a resolved setting (llm-usage's
 * effort and intake cap caches) register here, so an admin write (the key) or a full clear
 * (null) reaches them too.
 */
type InvalidationListener = (key: string | null) => void;
const invalidationListeners = new Set<InvalidationListener>();

export function onAppSettingInvalidated(fn: InvalidationListener): void {
  invalidationListeners.add(fn);
}

function notifyInvalidated(key: string | null): void {
  for (const fn of invalidationListeners) {
    try {
      fn(key);
    } catch {
      // A listener must never fail a settings write.
    }
  }
}

export class AppSettingMissingError extends Error {
  readonly key: string;
  constructor(key: string) {
    super(
      `App setting "${key}" is not configured. Set it in /admin/ai-config (founder access required) or via scripts/seed-app-settings.ts.`,
    );
    this.name = 'AppSettingMissingError';
    this.key = key;
  }
}

/**
 * Fetch a setting by key. Uses an in-memory TTL cache; misses go to Mongo.
 * Throws AppSettingMissingError if the key is not present in the DB.
 */
export async function getAppSetting(key: string): Promise<string> {
  const cached = cache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const doc = await AppSetting.findOne({ key }).lean();
  if (!doc) {
    // Don't cache misses — admin UI insert should be picked up immediately
    trackRequired(key, true);
    trackV3Stage(key, null);
    throw new AppSettingMissingError(key);
  }

  trackRequired(key, false);
  trackV3Stage(key, doc.value);
  cache.set(key, { value: doc.value, expiresAt: now + TTL_MS });
  return doc.value;
}

/**
 * Upsert a setting. Invalidates the cache entry so the next read goes to DB.
 * Returns the persisted record (excluding _id internals).
 */
export async function setAppSetting(input: {
  key: string;
  value: string;
  description?: string;
  updatedBy?: string;
}): Promise<{ key: string; value: string; description?: string; updatedAt: Date }> {
  const { key, value, description, updatedBy } = input;
  const doc = await AppSetting.findOneAndUpdate(
    { key },
    {
      $set: {
        value: value.trim(),
        ...(description !== undefined ? { description: description.trim() } : {}),
        ...(updatedBy ? { updatedBy } : {}),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  cache.delete(key);
  trackRequired(key, false);
  trackV3Stage(key, doc!.value);
  notifyInvalidated(key);

  return {
    key: doc!.key,
    value: doc!.value,
    description: doc!.description,
    updatedAt: doc!.updatedAt,
  };
}

/**
 * T-684b: insert a setting only if its key has no row. Never overwrites: the
 * write is a `$setOnInsert` upsert (as in scripts/migrate-model-settings.ts),
 * so a row that appeared meanwhile is left as it is. A duplicate-key error
 * (two concurrent inserts) counts as not inserted. Only after an insert does
 * it run setAppSetting's post-write steps (cache, required-key state, listeners).
 */
export async function insertAppSettingIfAbsent(input: {
  key: string;
  value: string;
  description?: string;
  updatedBy?: string;
}): Promise<
  | {
      inserted: true;
      setting: { key: string; value: string; description?: string; updatedAt: Date };
    }
  | { inserted: false }
> {
  const { key, value, description, updatedBy } = input;
  let upserted: boolean;
  // Timestamps are set by hand inside $setOnInsert with timestamps: false, so
  // Mongoose adds no `$set: { updatedAt }` that would touch an existing row.
  const now = new Date();
  const storedValue = value.trim();
  try {
    const r = await AppSetting.updateOne(
      { key },
      {
        $setOnInsert: {
          key,
          value: storedValue,
          ...(description !== undefined ? { description: description.trim() } : {}),
          ...(updatedBy ? { updatedBy } : {}),
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true, timestamps: false },
    );
    upserted = r.upsertedCount === 1;
  } catch (err) {
    if ((err as { code?: unknown } | null)?.code === 11000) return { inserted: false };
    throw err;
  }
  if (!upserted) return { inserted: false };

  cache.delete(key);
  trackRequired(key, false);
  trackV3Stage(key, storedValue);
  notifyInvalidated(key);

  const doc = await AppSetting.findOne({ key }).lean();
  if (!doc) throw new Error(`App setting "${key}" was inserted but could not be read back.`);
  return {
    inserted: true,
    setting: {
      key: doc.key,
      value: doc.value,
      description: doc.description,
      updatedAt: doc.updatedAt,
    },
  };
}

/**
 * List all settings (admin UI). Newest first.
 */
export async function listAppSettings(): Promise<
  Array<{ key: string; value: string; description?: string; updatedAt: Date }>
> {
  const docs = await AppSetting.find().sort({ key: 1 }).lean();
  return docs.map((d) => ({
    key: d.key,
    value: d.value,
    description: d.description,
    updatedAt: d.updatedAt,
  }));
}

/** Test helper — clear the in-memory cache. NOT called in production paths. */
export function _clearAppSettingsCache(): void {
  cache.clear();
  missingRequired.clear();
  v3StageRaised = false;
  notifyInvalidated(null);
}

// ── Well-known keys (string constants only — NOT default values) ────────────
//
// These are pointers to DB rows, not configuration. The right-hand side is the
// document key in Mongo — the value of that document is what the LLM actually
// consumes. Founder must seed both rows before drafting works.

export const APP_SETTING_KEYS = {
  DRAFTING_MODEL: 'ai.drafting_model',
  PREFLIGHT_MODEL: 'ai.preflight_model',
  /** ADR-019 §3.8 — a Haiku model id (a bare alias or a dated id). No default in code. */
  INTAKE_MODEL: 'ai.intake_model',
  /**
   * T-453 — output_config.effort per stage (low | medium | high | xhigh | max).
   * Optional: a missing or invalid value falls back to the default in
   * llm-usage.ts (getAiEffort), never a failed call.
   */
  EFFORT_INTAKE: 'ai.effort.intake',
  EFFORT_PREFLIGHT: 'ai.effort.preflight',
  EFFORT_BODY: 'ai.effort.body',
  /**
   * T-683 (Arjun, T-683 answers §8 item 1): the v3 Extractor's own effort.
   * Read first by v3/extractor.service.ts, then ai.effort.extractor, then
   * medium. The v2 intake never reads it, so setting it never moves v2.
   */
  EFFORT_EXTRACTOR_V3: 'ai.effort.extractor_v3',
  /**
   * T-453 follow-up — max_tokens for the intake_extract call, a whole number
   * in 500-8000. Optional: missing or invalid falls back to 3000 in
   * llm-usage.ts (getIntakeExtractCap), never a failed call.
   */
  CAP_INTAKE_EXTRACT: 'ai.cap.intake_extract',
  /**
   * T-453 follow-up (golden run 64) — max_tokens for both intake_reception
   * calls (pack and guided), a whole number in 500-8000. Optional: missing or
   * invalid falls back to 4000 in llm-usage.ts (getIntakeReceptionCap).
   */
  CAP_INTAKE_RECEPTION: 'ai.cap.intake_reception',
  /**
   * T-577 — the paragraph-count Ink bands, a key PREFIX: the row read is
   * `pricing.paragraph_bands.<packId>`, else `pricing.paragraph_bands.base_<classPrice>`
   * (classPrice = costForTemplate, e.g. `base_2`). Value: a JSON array of Ink
   * ADDED over the class price, ascending, e.g.
   * `[{"upTo":10,"add":0},{"upTo":18,"add":1},{"upTo":25,"add":2}]` (Vikram).
   * Optional: missing or invalid means the
   * pack does not ask for a count and is charged its class price
   * (credits.service quoteDraft), never a failed draft.
   */
  PARAGRAPH_BANDS_PREFIX: 'pricing.paragraph_bands',
} as const;

// ── T-684: model and effort per role (ADR-drafting-v3 §3, §4) ───────────────
//
// Each model role has its own `ai.model.<role>` (the model id, free text, no
// default anywhere: founder rule 2026-05-11) and `ai.effort.<role>`. For one
// release the three old keys are still read when the role key is unset
// (resolveModel / getRoleEffort in llm-usage.ts); scripts/migrate-model-settings.ts
// copies them across. Key names only here, never values.

export const MODEL_ROLES = [
  'matcher',
  'extractor',
  'drafter',
  'fact_checker',
  'legal_reviewer',
  'language',
] as const;

export type ModelRole = (typeof MODEL_ROLES)[number];

/** The roles drafting cannot work without (the T-585 boot warning), in warning order. */
export const REQUIRED_MODEL_ROLES: readonly ModelRole[] = Object.freeze([
  'drafter',
  'extractor',
  'fact_checker',
] as const);

/** The effort values the installed SDK accepts; llm-usage.ts's AiEffort is the same list. */
export const AI_EFFORT_VALUES = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

export interface ModelRoleSpec {
  readonly role: ModelRole;
  /** `ai.model.<role>`. */
  readonly modelKey: string;
  /** `ai.effort.<role>`. */
  readonly effortKey: string;
  /** The pre-T-684 model key read when modelKey is unset (one release). */
  readonly legacyModelKey?: string;
  /** The pre-T-684 effort key read when effortKey is unset. */
  readonly legacyEffortKey?: string;
  /** When set, an unset role key falls back to this role's whole chain (matcher -> extractor). */
  readonly fallbackRole?: ModelRole;
  readonly required: boolean;
  readonly label: string;
  readonly help: string;
}

function roleSpec(spec: ModelRoleSpec): ModelRoleSpec {
  return Object.freeze(spec);
}

export const MODEL_ROLE_REGISTRY: Readonly<Record<ModelRole, ModelRoleSpec>> = Object.freeze({
  matcher: roleSpec({
    role: 'matcher',
    modelKey: 'ai.model.matcher',
    effortKey: 'ai.effort.matcher',
    fallbackRole: 'extractor',
    required: false,
    label: 'Matcher',
    help: 'Model that matches a description to a template. Optional: no call reads it yet (matching uses the extractor). Falls back to ai.model.extractor, then ai.intake_model.',
  }),
  extractor: roleSpec({
    role: 'extractor',
    modelKey: 'ai.model.extractor',
    effortKey: 'ai.effort.extractor',
    legacyModelKey: APP_SETTING_KEYS.INTAKE_MODEL,
    legacyEffortKey: APP_SETTING_KEYS.EFFORT_INTAKE,
    required: true,
    label: 'Extractor',
    help: 'Model for the intake calls that read the description and fill the form. Required. Falls back to ai.intake_model until the next release.',
  }),
  drafter: roleSpec({
    role: 'drafter',
    modelKey: 'ai.model.drafter',
    effortKey: 'ai.effort.drafter',
    legacyModelKey: APP_SETTING_KEYS.DRAFTING_MODEL,
    legacyEffortKey: APP_SETTING_KEYS.EFFORT_BODY,
    required: true,
    label: 'Drafter',
    help: 'Model that writes the draft body. Required. Falls back to ai.drafting_model until the next release.',
  }),
  fact_checker: roleSpec({
    role: 'fact_checker',
    modelKey: 'ai.model.fact_checker',
    effortKey: 'ai.effort.fact_checker',
    legacyModelKey: APP_SETTING_KEYS.PREFLIGHT_MODEL,
    legacyEffortKey: APP_SETTING_KEYS.EFFORT_PREFLIGHT,
    required: true,
    label: 'Fact checker',
    help: 'Model for the preflight verifier. Required (when unset, preflight runs rules only). Falls back to ai.preflight_model until the next release.',
  }),
  legal_reviewer: roleSpec({
    role: 'legal_reviewer',
    modelKey: 'ai.model.legal_reviewer',
    effortKey: 'ai.effort.legal_reviewer',
    required: false,
    label: 'Legal reviewer',
    help: 'Model for the legal review step. Optional: no call reads it yet.',
  }),
  language: roleSpec({
    role: 'language',
    modelKey: 'ai.model.language',
    effortKey: 'ai.effort.language',
    required: false,
    label: 'Language',
    help: 'Model for the language step. Optional: no call reads it yet.',
  }),
});

/** The model keys resolveModel tries for a role, in order (role key, fallback role's chain, legacy key). */
export function modelKeyChain(role: ModelRole): string[] {
  const spec = MODEL_ROLE_REGISTRY[role];
  if (spec.fallbackRole) return [spec.modelKey, ...modelKeyChain(spec.fallbackRole)];
  return spec.legacyModelKey ? [spec.modelKey, spec.legacyModelKey] : [spec.modelKey];
}

/** The effort keys getRoleEffort tries for a role, in order (role key, fallback role's chain, legacy key). */
export function effortKeyChain(role: ModelRole): string[] {
  const spec = MODEL_ROLE_REGISTRY[role];
  if (spec.fallbackRole) return [spec.effortKey, ...effortKeyChain(spec.fallbackRole)];
  return spec.legacyEffortKey ? [spec.effortKey, spec.legacyEffortKey] : [spec.effortKey];
}

/** The role whose role key replaces a legacy model key, or undefined. */
export function roleForLegacyModelKey(key: string): ModelRole | undefined {
  return MODEL_ROLES.find((r) => MODEL_ROLE_REGISTRY[r].legacyModelKey === key);
}

/** One row of GET /admin/app-settings/registry. Key names and text only, never a value. */
export interface AppSettingRegistryEntry {
  key: string;
  group: 'model' | 'effort' | 'deprecated';
  role?: ModelRole;
  label: string;
  help: string;
  required: boolean;
  deprecated?: boolean;
  replacedBy?: string;
  legacyKey?: string;
  allowedValues?: string[];
}

const EFFORT_DEFAULT_TEXT: Record<ModelRole, string> = {
  matcher: 'medium',
  extractor: 'medium',
  drafter: 'medium',
  fact_checker: 'low',
  legal_reviewer: 'medium',
  language: 'low',
};

/** T-684: the admin AI page's list: 6 model keys, 6 effort keys, 3 deprecated keys. */
export function getAppSettingsRegistry(): AppSettingRegistryEntry[] {
  const models: AppSettingRegistryEntry[] = MODEL_ROLES.map((role) => {
    const s = MODEL_ROLE_REGISTRY[role];
    return {
      key: s.modelKey,
      group: 'model',
      role,
      label: `${s.label} model`,
      help: s.help,
      required: s.required,
      ...(s.legacyModelKey ? { legacyKey: s.legacyModelKey } : {}),
    };
  });
  const efforts: AppSettingRegistryEntry[] = MODEL_ROLES.map((role) => {
    const s = MODEL_ROLE_REGISTRY[role];
    const chain = effortKeyChain(role).slice(1);
    const fallback = [...chain, EFFORT_DEFAULT_TEXT[role]].join(', then ');
    return {
      key: s.effortKey,
      group: 'effort',
      role,
      label: `${s.label} effort`,
      help: `Effort for the ${s.label.toLowerCase()} model calls. Optional. Falls back to ${fallback}.`,
      required: false,
      allowedValues: [...AI_EFFORT_VALUES],
      ...(s.legacyEffortKey ? { legacyKey: s.legacyEffortKey } : {}),
    };
  });
  const deprecated: AppSettingRegistryEntry[] = MODEL_ROLES.flatMap((role) => {
    const s = MODEL_ROLE_REGISTRY[role];
    if (!s.legacyModelKey) return [];
    return [
      {
        key: s.legacyModelKey,
        group: 'deprecated' as const,
        role,
        label: `${s.legacyModelKey} (deprecated)`,
        help: `Replaced by ${s.modelKey}. Still read while ${s.modelKey} is unset, until the next release.`,
        required: false,
        deprecated: true,
        replacedBy: s.modelKey,
      },
    ];
  });
  return [...models, ...efforts, ...deprecated];
}

// Per-model USD rates (`ai.rates.<model-slug>`) and the USD→INR conversion
// (`finance.usd_inr`) live in llm-usage.ts (getModelRates / getUsdInrRate /
// priceUsage) — T-003, see handoff/design/T-003-token-usage-design.md §3.5.

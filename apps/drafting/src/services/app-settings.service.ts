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
 * T-585 (Arjun's go-live finding): the AI model keys drafting cannot work
 * without. Their missing state is held in memory, set at boot by
 * primeConfigWarnings and refreshed on every later read or write of one of
 * them, so /health reports it with no DB call. Key names only, never values.
 */
const REQUIRED_AI_KEYS = ['ai.drafting_model', 'ai.preflight_model', 'ai.intake_model'] as const;
const missingRequired = new Set<string>();

function trackRequired(key: string, missing: boolean): void {
  if (!(REQUIRED_AI_KEYS as readonly string[]).includes(key)) return;
  if (missing) missingRequired.add(key);
  else missingRequired.delete(key);
}

/** T-585: the required AI keys missing at the last read, in a fixed order. No DB call. */
export function getConfigWarnings(): string[] {
  return REQUIRED_AI_KEYS.filter((k) => missingRequired.has(k));
}

/**
 * T-585: read the required AI keys once at boot and return the missing ones.
 * Never throws; a read error other than a missing doc leaves that key's state as it was.
 */
export async function primeConfigWarnings(): Promise<string[]> {
  for (const key of REQUIRED_AI_KEYS) {
    try {
      await getAppSetting(key);
    } catch {
      // getAppSetting already recorded a missing key; other errors are not a config warning.
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
    throw new AppSettingMissingError(key);
  }

  trackRequired(key, false);
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
  notifyInvalidated(key);

  return {
    key: doc!.key,
    value: doc!.value,
    description: doc!.description,
    updatedAt: doc!.updatedAt,
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

// Per-model USD rates (`ai.rates.<model-slug>`) and the USD→INR conversion
// (`finance.usd_inr`) live in llm-usage.ts (getModelRates / getUsdInrRate /
// priceUsage) — T-003, see handoff/design/T-003-token-usage-design.md §3.5.

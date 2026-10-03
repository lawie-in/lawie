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
 */
import { AppSetting } from '../models/AppSetting.model';

const TTL_MS = 60_000;

interface CacheEntry {
  value: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

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
    throw new AppSettingMissingError(key);
  }

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
}

// ── Well-known keys (string constants only — NOT default values) ────────────
//
// These are pointers to DB rows, not configuration. The right-hand side is the
// document key in Mongo — the value of that document is what the LLM actually
// consumes. Founder must seed both rows before drafting works.

export const APP_SETTING_KEYS = {
  DRAFTING_MODEL: 'ai.drafting_model',
  PREFLIGHT_MODEL: 'ai.preflight_model',
  /** JSON map of model id -> { inputPerMTok, outputPerMTok } USD rates (T-003) */
  MODEL_RATES_USD: 'ai.model_rates_usd',
  /** Single numeric string — USD to INR conversion rate (T-003) */
  USD_TO_INR_RATE: 'billing.usd_to_inr_rate',
} as const;

// ── Model USD rates + USD→INR conversion (T-003) ─────────────────────────────
//
// Real generation cost (costUsd on a Generation row) is computed from these,
// not hardcoded — so the founder can update pricing without a deploy. Both
// are plain AppSetting values (JSON / numeric strings), read through the same
// cached getAppSetting path as the model-id settings above.

export interface ModelRateUsd {
  inputPerMTok: number;
  outputPerMTok: number;
}

export class ModelRateMissingError extends Error {
  readonly model: string;
  constructor(model: string) {
    super(
      `No USD rate configured for model "${model}" in app setting "${APP_SETTING_KEYS.MODEL_RATES_USD}". Add it via /admin/ai-config.`,
    );
    this.name = 'ModelRateMissingError';
    this.model = model;
  }
}

/**
 * Look up the USD per-million-token rate for a model from the
 * ai.model_rates_usd JSON map. Throws AppSettingMissingError if the setting
 * isn't configured at all, or ModelRateMissingError if it's configured but
 * has no entry for this specific model.
 */
export async function getModelRateUsd(model: string): Promise<ModelRateUsd> {
  const raw = await getAppSetting(APP_SETTING_KEYS.MODEL_RATES_USD);
  let rates: Record<string, ModelRateUsd>;
  try {
    rates = JSON.parse(raw);
  } catch {
    throw new Error(
      `App setting "${APP_SETTING_KEYS.MODEL_RATES_USD}" is not valid JSON. Fix it in /admin/ai-config.`,
    );
  }
  const rate = rates[model];
  if (!rate || typeof rate.inputPerMTok !== 'number' || typeof rate.outputPerMTok !== 'number') {
    throw new ModelRateMissingError(model);
  }
  return rate;
}

/** Read the USD→INR conversion rate from AppSetting. Throws AppSettingMissingError if unset. */
export async function getUsdToInrRate(): Promise<number> {
  const raw = await getAppSetting(APP_SETTING_KEYS.USD_TO_INR_RATE);
  const rate = Number(raw);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(
      `App setting "${APP_SETTING_KEYS.USD_TO_INR_RATE}" is not a valid positive number ("${raw}"). Fix it in /admin/ai-config.`,
    );
  }
  return rate;
}

/** costUsd = (inputTokens / 1e6) * inputPerMTok + (outputTokens / 1e6) * outputPerMTok */
export function computeCostUsd(
  usage: { inputTokens: number; outputTokens: number },
  rate: ModelRateUsd,
): number {
  return (
    (usage.inputTokens / 1_000_000) * rate.inputPerMTok +
    (usage.outputTokens / 1_000_000) * rate.outputPerMTok
  );
}

/**
 * AppSettings reader (billing, T-540). Read-only, with a short in-memory TTL
 * cache like drafting's app-settings.service.ts, so an admin change reaches
 * every billing replica within a minute.
 *
 * Today's only key: `feature.coupon_free_grant` (global), which turns on the
 * free-grant path for a ₹0 top-up quote (a 100% coupon). It FAILS CLOSED
 * (Priya, T-540):
 * - value 'on' or 'true'   -> on; 'off' or 'false' -> off;
 * - any other value        -> off (malformed; warn);
 * - key missing            -> env FEATURE_DEFAULT_COUPON_FREE_GRANT, only the
 *                             exact string 'true' turns it on;
 * - the DB read throws     -> off, always (warn). The env fallback is not used.
 * Logs carry the key and the error class only.
 */
import { env } from '../config/env';
import logger from '../config/logger';
import { AppSetting } from '../models/AppSetting.model';

export const COUPON_FREE_GRANT_SETTING = 'feature.coupon_free_grant';

const TTL_MS = 60_000;

interface CacheEntry {
  value: boolean;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Drop every cached value (tests, or after a known settings change). */
export function clearAppSettingsCache(): void {
  cache.clear();
}

function parseSwitch(raw: unknown): boolean | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  if (v === 'on' || v === 'true') return true;
  if (v === 'off' || v === 'false') return false;
  return null;
}

/**
 * Whether a ₹0 top-up quote may be granted for free. Default off everywhere.
 * Found values are cached for TTL_MS; a missing key and a DB error are not,
 * so a fix in the admin UI is picked up at once.
 */
export async function isCouponFreeGrantEnabled(): Promise<boolean> {
  const key = COUPON_FREE_GRANT_SETTING;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  let doc: { value?: unknown } | null;
  try {
    doc = await AppSetting.findOne({ key }, { value: 1 }).lean();
  } catch (err) {
    logger.warn(
      { key, errName: err instanceof Error ? err.name : 'unknown' },
      'app-settings: read failed; switch treated as off',
    );
    return false;
  }

  if (!doc) return env.FEATURE_DEFAULT_COUPON_FREE_GRANT === 'true';

  const parsed = parseSwitch(doc.value);
  if (parsed === null) {
    logger.warn(
      { key, errName: 'MalformedSetting' },
      'app-settings: value is not on/off; switch treated as off',
    );
  }
  const value = parsed === true;
  cache.set(key, { value, expiresAt: now + TTL_MS });
  return value;
}

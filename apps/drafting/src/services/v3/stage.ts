/**
 * T-683: the drafting v3 stage (ADR-drafting-v3 §7; Arjun, T-683 answers §4 item 2).
 *
 * `feature.drafting_v3_stage` is a number, not an on/off switch, so it has its
 * own reader here and `isSwitchOn` (feature-switches.ts) is unchanged:
 *
 * - the AppSetting value '0', '1', '2' or '3' (trimmed) is the stage;
 * - a missing doc, any other value, or any read error is 0 (v2 runs unchanged).
 *   An invalid value logs one warning per cache period naming the setting,
 *   never the value;
 * - the golden-set fixture user (run-origin.ts) is 0, unless the golden-set
 *   runner sets a stage for the fixture running now (`setFixtureV3Stage`).
 *   That is the only per-user override, and it can only reach the reserved
 *   fixture user: a request cannot ask for a stage.
 *
 * Never throws.
 */
import logger from '../../config/logger';
import { getAppSetting, onAppSettingInvalidated } from '../app-settings.service';
import { isFixtureUser } from '../run-origin';

export const DRAFTING_V3_STAGE_SETTING = 'feature.drafting_v3_stage';

export type V3Stage = 0 | 1 | 2 | 3;

const STAGES: readonly V3Stage[] = [0, 1, 2, 3];

function isStage(n: unknown): n is V3Stage {
  return (STAGES as readonly unknown[]).includes(n);
}

// ── The fixture override (golden set only) ──────────────────────────────────

let fixtureStage: V3Stage | null = null;

/**
 * Golden set only (scripts/golden-set), like `setLlmLogFixtureId`: the stage
 * the fixture user runs at until cleared with null. Production never sets it.
 * It never applies to any other user.
 */
export function setFixtureV3Stage(stage: V3Stage | null): void {
  fixtureStage = stage !== null && isStage(stage) ? stage : null;
}

// ── The setting, cached 60 s (as getAppSetting's own cache) ─────────────────
//
// getAppSetting does not cache a missing key, so without this every intake
// turn would read Mongo while no feature.drafting_v3_stage row exists.

const STAGE_TTL_MS = 60_000;
let cached: { value: V3Stage; expiresAt: number } | null = null;

/** Test helper: forget the cached stage. NOT called in production paths. */
export function _clearV3StageCache(): void {
  cached = null;
}

// Guarded: a test that replaces app-settings.service wholesale may not provide it.
if (typeof onAppSettingInvalidated === 'function') {
  onAppSettingInvalidated((key) => {
    if (key === null || key === DRAFTING_V3_STAGE_SETTING) cached = null;
  });
}

async function readStage(): Promise<V3Stage> {
  let raw: unknown;
  try {
    raw = await getAppSetting(DRAFTING_V3_STAGE_SETTING);
  } catch {
    // A missing doc (AppSettingMissingError) or any read error: v2.
    return 0;
  }
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (/^[0-3]$/.test(v)) return Number(v) as V3Stage;
  logger.warn(
    { setting: DRAFTING_V3_STAGE_SETTING },
    'T-683: drafting v3 stage setting is not 0, 1, 2 or 3; using 0',
  );
  return 0;
}

/** The v3 stage for this user: 0 (v2 unchanged) to 3. Never throws. */
export async function v3Stage(userId: string | undefined): Promise<V3Stage> {
  try {
    if (userId !== undefined && isFixtureUser(userId)) return fixtureStage ?? 0;
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.value;
    const value = await readStage();
    cached = { value, expiresAt: now + STAGE_TTL_MS };
    return value;
  } catch {
    return 0;
  }
}

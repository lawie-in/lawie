/**
 * T-356 / T-375: the on/off feature switches, read from AppSetting.
 *
 * One reader for every switch (`isSwitchOn`). intake.service.ts uses it for
 * `feature.describe_first` and `feature.fact_ledger`; T-375 adds three v1-scope
 * switches that hide an item until its own ticket merges:
 *
 * - `feature.tool_timeline`: the BNSS timeline tool (GET /sections/timeline).
 * - `feature.tool_bail_checker`: the bail checker tool (GET /sections/bail-check).
 * - `feature.template_civil_plaint`: the whole `civil_plaints_suits` catalogue
 *   category, and the legacy POST /generate docType 'plaint' (Arjun, 13 Oct 2026).
 *
 * All three are off in code: no AppSetting doc, any value other than 'on', or
 * any read error means off. Turning one on is an AppSetting change only.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { catalogueCategoryFor, DOC_TYPE_ALIASES, TEMPLATE_CATALOGUE } from '../config/catalogue';
import { env } from '../config/env';
import logger from '../config/logger';

import { AppSettingMissingError, getAppSetting } from './app-settings.service';
import { FACT_LEDGER_SETTING } from './fact-ledger.service';
import { isFixtureUser } from './run-origin';

// ── Keys ────────────────────────────────────────────────────────────────────

export const DESCRIBE_FIRST_SETTING = 'feature.describe_first';
export const TOOL_TIMELINE_SETTING = 'feature.tool_timeline';
export const TOOL_BAIL_CHECKER_SETTING = 'feature.tool_bail_checker';
export const TEMPLATE_CIVIL_PLAINT_SETTING = 'feature.template_civil_plaint';

/** The catalogue category `feature.template_civil_plaint` hides (Arjun's ruling 1). */
export const CIVIL_PLAINT_CATEGORY = 'civil_plaints_suits';

/** The legacy POST /generate docType that is a plaint (Arjun's ruling 2). Not a catalogue id. */
export const LEGACY_PLAINT_DOC_TYPE = 'plaint';

// ── The reader ──────────────────────────────────────────────────────────────

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/**
 * T-356 (Arjun's rule): a switch's admin setting is 'on' or 'off', nothing
 * else. Missing doc → the env default. Any other value is treated as missing
 * and logs one warning naming the setting, never the value (a legacy value may
 * hold user ids). `userId` only matters for the fixture-user rule; an
 * anonymous caller passes none. Never throws.
 */
export async function isSwitchOn(setting: string, userId?: string): Promise<boolean> {
  // T-147e: the golden set runs the describe-first ledger path whatever the
  // switches say for users. Only the reserved fixture user; see run-origin.ts.
  if (userId !== undefined && isFixtureUser(userId)) return true;
  try {
    return await readSwitch(setting);
  } catch {
    // Any read error other than a missing doc (Mongo down, etc.) stays off: fail closed.
    return false;
  }
}

/**
 * The T-356 rules for one read. A missing doc (T-283) or a value other than
 * 'on'/'off' gives the env default; that is a successful read. Any other read
 * error (Mongo down, etc.) is thrown, so each caller decides what it means.
 */
async function readSwitch(setting: string): Promise<boolean> {
  let raw: string;
  try {
    raw = (await getAppSetting(setting)).trim();
  } catch (err) {
    if (err instanceof AppSettingMissingError) return envDefaultFor(setting);
    throw err;
  }
  if (raw === 'on') return true;
  if (raw === 'off') return false;
  logger.warn(
    { setting },
    "T-356: feature switch setting is not 'on' or 'off'; using the code default",
  );
  return envDefaultFor(setting);
}

/**
 * T-283: the env fallback for a switch whose AppSetting doc is missing, or
 * (T-356) holds a value other than 'on'/'off'. Read from `env` at call time
 * (not captured at import) so tests can replace it. 'on' means on for everyone.
 * Any other switch (the three T-375 switches included) has no env default: off.
 */
function envDefaultFor(setting: string): boolean {
  if (setting === DESCRIBE_FIRST_SETTING) return env.FEATURE_DEFAULT_DESCRIBE_FIRST === 'on';
  if (setting === FACT_LEDGER_SETTING) return env.FEATURE_DEFAULT_FACT_LEDGER === 'on';
  return false;
}

/**
 * T-375: a switch read for an anonymous caller (no user id, so no fixture-user
 * rule). For the T-375 switches anything other than 'on' is off, a missing doc
 * is off and a read error is off. Never throws.
 */
export async function isFeatureOn(setting: string): Promise<boolean> {
  try {
    return await isSwitchOn(setting);
  } catch {
    return false;
  }
}

// ── Tool switches: the last known value (Arjun, T-375 part 1 ruling) ─────────
//
// T-371 AC2: the tools must not die with Mongo. So the request path for the
// two tool switches (toolGuard and GET /sections/features) never reads Mongo
// or Redis and never awaits anything: it returns the last value read
// successfully, and at most every 60s starts one refresh in the background
// (not awaited). A failed refresh keeps the last value and logs once per run of
// failures (setting name only). With no successful read since boot the switch
// is off. primeToolSwitches() lets the server read both once at boot.

export const TOOL_SWITCH_REFRESH_MS = 60_000;

/** The two switches served from the last known value. */
export const TOOL_SWITCHES = [TOOL_TIMELINE_SETTING, TOOL_BAIL_CHECKER_SETTING] as const;

interface KnownSwitch {
  /** The last successfully read value; undefined until the first success since boot. */
  value: boolean | undefined;
  /** When the last refresh started (success or not); 0 = never. */
  attemptedAt: number;
  /** The refresh in flight, if any, so only one runs at a time. */
  inFlight: Promise<void> | null;
  /** True once a failure has been logged; reset by the next success. */
  failureLogged: boolean;
}

const known = new Map<string, KnownSwitch>();

function knownFor(setting: string): KnownSwitch {
  let k = known.get(setting);
  if (!k) {
    k = { value: undefined, attemptedAt: 0, inFlight: null, failureLogged: false };
    known.set(setting, k);
  }
  return k;
}

function refresh(setting: string, k: KnownSwitch, now: number): Promise<void> {
  if (k.inFlight) return k.inFlight;
  k.attemptedAt = now;
  k.inFlight = readSwitch(setting)
    .then((value) => {
      k.value = value;
      k.failureLogged = false;
    })
    .catch(() => {
      if (!k.failureLogged) {
        k.failureLogged = true;
        logger.warn({ setting }, 'T-375: feature switch read failed; keeping the last known value');
      }
    })
    .finally(() => {
      k.inFlight = null;
    });
  return k.inFlight;
}

/**
 * The last known value of a tool switch, for the request path. Synchronous:
 * no Mongo, no Redis, nothing awaited. Starts a background refresh when the
 * last attempt is 60s old or more. Off until a first successful read.
 */
export function lastKnownSwitch(setting: string, now: number = Date.now()): boolean {
  const k = knownFor(setting);
  if (!k.inFlight && (k.attemptedAt === 0 || now - k.attemptedAt >= TOOL_SWITCH_REFRESH_MS)) {
    void refresh(setting, k, now);
  }
  return k.value === true;
}

/**
 * Read both tool switches now (for boot, or a test). Never throws; a failed
 * read leaves the switch at its last known value. Not for the request path.
 */
export async function primeToolSwitches(now: number = Date.now()): Promise<void> {
  await Promise.all(TOOL_SWITCHES.map((s) => refresh(s, knownFor(s), now)));
}

/** Test helper: forget every last known value. NOT called in production paths. */
export function _resetToolSwitches(): void {
  known.clear();
}

// ── Templates ───────────────────────────────────────────────────────────────

/**
 * The switch that hides a template id, a doc-type alias of one, or the legacy
 * 'plaint' docType; `undefined` when no switch covers it. The category comes
 * from the catalogue, so no plaint id is listed here.
 */
function switchForTemplate(templateId: string): string | undefined {
  if (templateId === LEGACY_PLAINT_DOC_TYPE) return TEMPLATE_CIVIL_PLAINT_SETTING;
  const id = hasOwn(DOC_TYPE_ALIASES, templateId) ? DOC_TYPE_ALIASES[templateId] : templateId;
  if (catalogueCategoryFor(id) === CIVIL_PLAINT_CATEGORY) return TEMPLATE_CIVIL_PLAINT_SETTING;
  return undefined;
}

/**
 * T-375: false when a switch that is off hides this template id (or the legacy
 * 'plaint' docType). An id no switch covers is always enabled here; whether it
 * exists at all is the caller's check. `userId` applies the fixture-user rule.
 */
export async function isTemplateEnabled(templateId: string, userId?: string): Promise<boolean> {
  const setting = switchForTemplate(templateId);
  if (setting === undefined) return true;
  return userId === undefined ? isFeatureOn(setting) : isSwitchOn(setting, userId);
}

/**
 * T-375: every catalogue template id hidden right now (empty when every
 * switch is on). Read from the catalogue, never a hardcoded list.
 */
export async function hiddenTemplateIds(userId?: string): Promise<Set<string>> {
  const hidden = new Set<string>();
  const ids = Object.keys(TEMPLATE_CATALOGUE).filter((id) => switchForTemplate(id) !== undefined);
  if (ids.length === 0) return hidden;
  const on =
    userId === undefined
      ? await isFeatureOn(TEMPLATE_CIVIL_PLAINT_SETTING)
      : await isSwitchOn(TEMPLATE_CIVIL_PLAINT_SETTING, userId);
  if (!on) for (const id of ids) hidden.add(id);
  return hidden;
}

// ── Middleware ──────────────────────────────────────────────────────────────

/** The drafting service's own unknown-route 404 (app.ts), so a hidden tool looks absent. */
function sendRouteNotFound(res: Response): void {
  res.status(404).json({ error: 'Route not found', service: 'drafting' });
}

/**
 * T-375: 404 every request under the mount while `setting` is off. Reads the
 * last known value only (lastKnownSwitch): no Mongo or Redis on this path.
 */
export function toolGuard(setting: string): RequestHandler {
  return (_req: Request, res: Response, next: NextFunction): void => {
    if (lastKnownSwitch(setting)) next();
    else sendRouteNotFound(res);
  };
}

/** The 404 for a hidden template, shared by templateGuard and the intake routes. */
export const TEMPLATE_NOT_FOUND = { error: 'Template not found' } as const;

/** T-375: the body of GET /sections/features, from the last known values only. */
export function toolFeatures(): { tool_timeline: boolean; tool_bail_checker: boolean } {
  return {
    tool_timeline: lastKnownSwitch(TOOL_TIMELINE_SETTING),
    tool_bail_checker: lastKnownSwitch(TOOL_BAIL_CHECKER_SETTING),
  };
}

/**
 * T-375 (for part 2, documents.routes.ts): 404 `{ error: 'Template not found' }`
 * when the template id `pick` reads from the request is hidden by a switch
 * that is off. A request with no id (pick returns a non-string) passes through
 * to the route's own validation.
 */
export function templateGuard(pick: (req: Request) => unknown): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const id = pick(req);
    if (typeof id !== 'string') {
      next();
      return;
    }
    isTemplateEnabled(id)
      .then((on) => {
        if (on) next();
        else res.status(404).json(TEMPLATE_NOT_FOUND);
      })
      .catch(() => res.status(404).json(TEMPLATE_NOT_FOUND));
  };
}

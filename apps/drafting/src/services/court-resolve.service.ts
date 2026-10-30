/**
 * T-686: a court picked in a form, resolved before any Ink hold or model call.
 *
 * A raw court id (e.g. `bihar_civil_junior_patna`) must never reach a draft.
 * An id-shaped value that does not resolve to an active Court row, after one
 * retry, is `unavailable` and the caller fails closed (HTTP 503). A typed
 * free-text court name and an empty value are left to the caller, as before.
 */
import { Court } from '../models/Court.model';

import { CourtLookupData, loadCourtRule } from './template-engine.service';

/**
 * T-686: what a court id looks like (lower-case words joined by `_`, at least
 * two). Defined here because court-label.service.ts's `looksLikeCourtId`
 * (T-674B1) is not on this branch; fold the two together once both are merged.
 */
export const COURT_ID_SHAPE = /^[a-z0-9]+(_[a-z0-9]+)+$/;

export function looksLikeCourtIdValue(value: string): boolean {
  return COURT_ID_SHAPE.test(value);
}

export type CourtUnavailableReason = 'inactive' | 'not_found' | 'timeout';

export type FormCourtResolution =
  | { status: 'none' }
  | { status: 'typed' }
  | { status: 'resolved'; court: CourtLookupData }
  | { status: 'unavailable'; reason: CourtUnavailableReason };

/** The 5 s lookup cap, as on the draft paths. */
const COURT_LOOKUP_MAX_MS = 5000;

/** The refusal line the web shows (not draft wording, Priya 29 Oct 2026). */
export const COURT_UNAVAILABLE_REASON = 'Court unavailable, try again';

/** The 503 body for a court that did not resolve. */
export function courtUnavailableBody(runId: string | null): {
  error: 'court_unavailable';
  code: 'court_unavailable';
  reason: string;
  retryable: true;
  runId: string | null;
} {
  return {
    error: 'court_unavailable',
    code: 'court_unavailable',
    reason: COURT_UNAVAILABLE_REASON,
    retryable: true,
    runId,
  };
}

async function findCourtOnce(courtId: string) {
  // No isActive filter: an inactive row is told apart from a missing one.
  return Court.findOne({ courtId }).maxTimeMS(COURT_LOOKUP_MAX_MS).lean();
}

/**
 * Resolve the form's court value. Empty → `none`; not id-shaped → `typed`;
 * id-shaped → one lookup, retried once on a throw or timeout. An active row is
 * `resolved` with the court data generation needs (so the court is looked up
 * once); an inactive row, no row, or two throws are `unavailable`.
 */
export async function resolveFormCourt(courtValue: unknown): Promise<FormCourtResolution> {
  const courtId = typeof courtValue === 'string' ? courtValue.trim() : '';
  if (!courtId) return { status: 'none' };
  if (!looksLikeCourtIdValue(courtId)) return { status: 'typed' };

  let row: Awaited<ReturnType<typeof findCourtOnce>> | undefined;
  let found = false;
  for (let attempt = 0; attempt < 2 && !found; attempt += 1) {
    try {
      row = await findCourtOnce(courtId);
      found = true;
    } catch {
      // Retried once; a second throw is a timeout.
    }
  }
  if (!found) return { status: 'unavailable', reason: 'timeout' };
  if (!row) return { status: 'unavailable', reason: 'not_found' };
  // Same rule as the old `isActive: true` filter: only an active row resolves.
  if (row.isActive !== true) return { status: 'unavailable', reason: 'inactive' };

  return {
    status: 'resolved',
    court: {
      designation: row.designation,
      city: row.city,
      caseNomenclature: row.caseNomenclature,
      formattingRulesRef: row.formattingRulesRef,
      courtType: row.courtType,
      state: row.state,
      courtRule: loadCourtRule(row.formattingRulesRef) ?? undefined,
    },
  };
}

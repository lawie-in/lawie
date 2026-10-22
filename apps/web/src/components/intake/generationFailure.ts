/**
 * T-521 (Arjun, final ruling 4, relayed by Priya): what a failed generation may
 * say about Ink. Pure, so the three cases can be pinned without a stream.
 *
 * - An SSE `error` event whose code is not `insufficient_ink`: the server ended
 *   the run itself, before `done`. "The draft did not finish." (copy row 456,
 *   Ajay AJ-511-M2/M5). T-567 item 41 (Ajay 41b): "No Ink was used." follows
 *   only when the event says the hold was released (`inkReleased: true`);
 *   otherwise no Ink line, and the neutral documents-list line instead.
 * - An SSE `error` event with code `insufficient_ink`: the server's reason, and
 *   no extra line.
 * - The stream ended without `done`, or the connection dropped or threw: a
 *   dropped run can still end charged, so nothing is claimed about Ink.
 * - The start was refused (non-OK) or the body was empty: the server's reason or
 *   the existing plain error, and no claim.
 */

/** Signed: handoff/copy/T-511-copy-v1.md row 456 (first sentence). */
export const DRAFT_DID_NOT_FINISH = 'The draft did not finish.';

/** Signed: row 456 (second sentence). Only when the server confirms the hold was released. */
export const NO_INK_USED = 'No Ink was used.';

/** Signed (Ajay 41b): when the release is not confirmed. */
export const CHECK_DOCUMENTS_LIST = 'Check your documents list to see where this draft stands.';

/** T-521 amendment (Arjun ruling 4): a dropped run. Signed: Ajay AJ-521-M1 (W13). */
export const CONNECTION_LOST = 'Connection lost. Check your documents.';

/**
 * T-565 W3/W12 (Ajay): a pre-stream failure that is not a gate (429, 401 after the refresh, other
 * 400/403/5xx). Shown with the retry control; nothing started, so nothing was charged.
 */
export const SOMETHING_DID_NOT_WORK = 'Something did not work. Try again.';

/** T-565 W7 (Ajay): the plan gate's 403. No retry. */
export const NOT_ON_CURRENT_PLAN = 'This document is not available on your current plan.';

/**
 * T-565 W7: a 403 body from the plan gate (`upgradeUrl`, or an error such as "requires a Pro
 * plan"). Pure; shared by the form flow and the one flow.
 */
export function isPlanGate(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const b = body as { error?: unknown; upgradeUrl?: unknown };
  if (typeof b.upgradeUrl === 'string') return true;
  return typeof b.error === 'string' && /requires an? .*plan/i.test(b.error);
}

/**
 * T-565 B5: the card for a refused start (non-OK before any stream), the same routing as the
 * form flow (app/dashboard/new/page.tsx). Never the server's reason. 409 (a draft for this run
 * is already in progress: a retry would take a second Ink hold) and the plan gate get no retry.
 */
export function refusedStartError(status: number, body: unknown): GenerationError {
  if (status === 409) return { reason: CHECK_DOCUMENTS_LIST, retryable: false, source: 'start' };
  if (status === 403 && isPlanGate(body)) {
    return { reason: NOT_ON_CURRENT_PLAN, retryable: false, source: 'start' };
  }
  return { reason: SOMETHING_DID_NOT_WORK, retryable: true, source: 'start' };
}

/** The SSE error code the server sends when the Ink hold was lost and could not be re-taken. */
export const INSUFFICIENT_INK_CODE = 'insufficient_ink';

/** Where a failed generation came from. */
export type GenerationFailureSource =
  /** The server sent `event: error`. */
  | 'error_event'
  /** The stream ended with no `done`, or the connection dropped or threw. */
  | 'dropped'
  /** The start was refused (non-OK) or the response had no body. */
  | 'start';

export interface GenerationError {
  /** The reason as the server sent it, or the existing plain error. */
  reason: string;
  retryable: boolean;
  /** Absent means `start`: no claim about Ink is made. */
  source?: GenerationFailureSource;
  /** The SSE error event's `code`, when it sent one. */
  code?: string;
  /**
   * T-567 item 41: the SSE error event's `inkReleased`. Only `true` means the route released
   * the hold before sending the event; absent or false means it is not confirmed.
   */
  inkReleased?: boolean;
}

export interface GenerationFailureCopy {
  /** The heading of the failure card. */
  headline: string;
  /** The Ink line or the documents-list line under the heading, or null. */
  statusLine: string | null;
  /** The server's reason under that, or null when it is empty. */
  detail: string | null;
  /** True only when the signed "No Ink was used" line is shown. */
  noInkClaim: boolean;
}

export function generationFailureCopy(error: GenerationError): GenerationFailureCopy {
  const source = error.source ?? 'start';
  if (source === 'error_event' && error.code !== INSUFFICIENT_INK_CODE) {
    const released = error.inkReleased === true;
    return {
      headline: DRAFT_DID_NOT_FINISH,
      statusLine: released ? NO_INK_USED : CHECK_DOCUMENTS_LIST,
      detail: error.reason || null,
      noInkClaim: released,
    };
  }
  if (source === 'dropped') {
    return {
      headline: CONNECTION_LOST,
      statusLine: null,
      detail: error.reason || null,
      noInkClaim: false,
    };
  }
  // insufficient_ink, a refused start, an empty body: the reason only.
  return { headline: error.reason, statusLine: null, detail: null, noInkClaim: false };
}

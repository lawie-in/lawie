/**
 * T-521 (Arjun, final ruling 4, relayed by Priya): what a failed generation may
 * say about Ink. Pure, so the three cases can be pinned without a stream.
 *
 * - An SSE `error` event whose code is not `insufficient_ink`: the server ended
 *   the run itself, before `done`, and released the hold. Only here does the
 *   screen say "The draft did not finish. No Ink was used." (copy row 456,
 *   Ajay AJ-511-M2/M5).
 * - An SSE `error` event with code `insufficient_ink`: the server's reason, and
 *   no extra line.
 * - The stream ended without `done`, or the connection dropped or threw: a
 *   dropped run can still end charged, so nothing is claimed about Ink.
 * - The start was refused (non-OK) or the body was empty: the server's reason or
 *   the existing plain error, and no claim.
 */

/** Signed: handoff/copy/T-511-copy-v1.md row 456. */
export const DRAFT_DID_NOT_FINISH = 'The draft did not finish. No Ink was used.';

/** T-521 amendment (Arjun ruling 4): a dropped run. Plain wording; Ajay to review. */
export const CONNECTION_LOST = 'Connection lost. Check your documents.';

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
}

export interface GenerationFailureCopy {
  /** The heading of the failure card. */
  headline: string;
  /** A second line under the heading, or null. */
  detail: string | null;
  /** True only when the signed "No Ink was used" line is shown. */
  noInkClaim: boolean;
}

export function generationFailureCopy(error: GenerationError): GenerationFailureCopy {
  const source = error.source ?? 'start';
  if (source === 'error_event' && error.code !== INSUFFICIENT_INK_CODE) {
    return { headline: DRAFT_DID_NOT_FINISH, detail: error.reason || null, noInkClaim: true };
  }
  if (source === 'dropped') {
    return { headline: CONNECTION_LOST, detail: error.reason || null, noInkClaim: false };
  }
  // insufficient_ink, a refused start, an empty body: the reason only.
  return { headline: error.reason, detail: null, noInkClaim: false };
}

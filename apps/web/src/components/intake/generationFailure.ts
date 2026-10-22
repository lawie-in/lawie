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

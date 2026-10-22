/**
 * T-523: what a mocked gateway endpoint answers. Pure data; e2e/fixtures.ts turns a MockReply
 * into a `route.fulfill` with the CORS headers the app (on :3100) needs from the mock gateway
 * (on :4000).
 */
import type { Request } from '@playwright/test';

export interface MockReply {
  /** HTTP status. Default 200. */
  status?: number;
  /** A JSON body (serialised for you). Ignored when `body` is set. */
  json?: unknown;
  /** A raw body, e.g. an SSE stream from sseBody(). */
  body?: string;
  /** Default `application/json`. */
  contentType?: string;
  /** Extra response headers (CORS headers are always added). */
  headers?: Record<string, string>;
  /**
   * Wait this long before answering. `route.fulfill` delivers a body at once, so a delay is how
   * a spec gets to see an in-between state (e.g. the GeneratingStep before the SSE `done`).
   */
  delayMs?: number;
}

/** A fixed reply, or a function of the request and the `:param` values in the path. */
export type MockHandler =
  | MockReply
  | ((request: Request, params: Record<string, string>) => MockReply | Promise<MockReply>);

/**
 * Mocks keyed by `"<METHOD> <path>"` (e.g. `"GET /api/credits/balance"`,
 * `"PATCH /api/documents/:id"`) or a bare `"<path>"` for any method. The path is matched
 * exactly (the query string is ignored); `:name` matches one path segment.
 */
export type ApiMocks = Record<string, MockHandler>;

/** A JSON reply. */
export function json(body: unknown, status = 200, extra: Omit<MockReply, 'json'> = {}): MockReply {
  return { ...extra, status, json: body };
}

// ── Server-sent events (POST /api/documents/generate-from-brief) ─────────────────────────────
// Format read by components/intake/OneFlow.tsx: a named event is `event: <name>` then one
// `data: <json>` line; a bare `data: {"text":"..."}` line (no event) is a streamed token. The
// event name applies to the next data line only.

export interface SseWarning {
  type: string;
  message: string;
  details?: { clauseId?: string };
}

export interface SseDone {
  docId: string;
  /** False when the document has no rule pack. */
  rulePack: boolean;
  startingDraft: boolean;
  startingDraftLabel: string | null;
  labelReason: string | null;
  missingClauses: Array<{ id: string; title: string }>;
  disclaimer: string | null;
  /** Ink the server settled; absent or 0 shows no chip (T-545). */
  inkDebited?: number;
  /** The balance after the draft; applied straight to every balance widget (T-372). */
  balance?: { totalInk: number };
}

export type SseEvent =
  | { event: 'repair'; data?: Record<string, unknown> }
  | { event: 'warning'; data: { warnings: SseWarning[] } }
  | { event: 'template_sections'; data: { sections: Array<{ content: string }> } }
  | { event: 'error'; data: { reason: string; retryable?: boolean; code?: string } }
  | { event: 'done'; data: SseDone }
  | { text: string };

/** The exact text/event-stream body for a list of events. */
export function sseBody(events: readonly SseEvent[]): string {
  return events
    .map((e) =>
      'text' in e
        ? `data: ${JSON.stringify({ text: e.text })}\n\n`
        : `event: ${e.event}\ndata: ${JSON.stringify(e.data ?? {})}\n\n`,
    )
    .join('');
}

/** An SSE reply. Default delay 600 ms so the generating screen is observable. */
export function sse(
  events: readonly SseEvent[],
  {
    delayMs = 600,
    status = 200,
    headers = {},
  }: Pick<MockReply, 'delayMs' | 'status' | 'headers'> = {},
): MockReply {
  return {
    status,
    delayMs,
    contentType: 'text/event-stream',
    headers: { 'cache-control': 'no-cache', ...headers },
    body: sseBody(events),
  };
}

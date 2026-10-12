import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;

/**
 * What a user sent never goes into an error report (T-136: the advocate's
 * description must not be written to error reports). The gateway passes a
 * request's body on without reading it, but the SDK still keeps the body of an
 * incoming request and attaches it to an event by default. This takes it off
 * every event before the event leaves the service. (T-242: scrubEvent below also removes query
 * strings; withoutRequestBody itself still changes nothing else.)
 */
export function withoutRequestBody<T extends { request?: { data?: unknown } }>(event: T): T {
  if (event.request && 'data' in event.request) delete event.request.data;
  return event;
}

// ── T-242 (Ajay condition 3): no query string in trace, span or breadcrumb data ───────────────
// The request scrub covers event.request only. Transactions and spans carry the same URL in their
// data (OpenTelemetry http attributes), so campaign tags (and any other query value) would still
// reach Sentry. Cut at '?' for URL-shaped keys; delete query-only keys.
const QUERY_CUT_KEYS = ['http.url', 'http.target', 'url.full'] as const;
const QUERY_DROP_KEYS = ['url.query', 'http.query'] as const;

function withoutQuery(value: string): string {
  const i = value.indexOf('?');
  return i === -1 ? value : value.slice(0, i);
}

function scrubQueryData(data: unknown, extraCutKeys: readonly string[] = []): void {
  if (!data || typeof data !== 'object') return;
  const d = data as Record<string, unknown>;
  for (const k of [...QUERY_CUT_KEYS, ...extraCutKeys]) {
    const v = d[k];
    if (typeof v === 'string') d[k] = withoutQuery(v);
  }
  for (const k of QUERY_DROP_KEYS) delete d[k];
}

interface QueryBearingEvent {
  transaction?: unknown;
  contexts?: { trace?: { data?: unknown } };
  spans?: { op?: unknown; description?: unknown; data?: unknown }[];
  breadcrumbs?: { data?: unknown }[];
}

/** Removes query strings from contexts.trace.data, spans[].data and http breadcrumbs. */
export function withoutQueryStrings<T>(event: T): T {
  const e = event as unknown as QueryBearingEvent;
  if (typeof e.transaction === 'string') e.transaction = withoutQuery(e.transaction);
  scrubQueryData(e.contexts?.trace?.data);
  for (const span of e.spans ?? []) {
    scrubQueryData(span.data);
    // http.client / http.server span names are "METHOD url"; only those are cut.
    const isHttp = typeof span.op === 'string' && span.op.startsWith('http');
    if (isHttp && typeof span.description === 'string') {
      span.description = withoutQuery(span.description);
    }
  }
  for (const crumb of e.breadcrumbs ?? []) scrubQueryData(crumb.data, ['url']);
  return event;
}

/**
 * T-242: request.query_string deleted and request.url cut at '?' (the gateway proxies
 * /api/auth/google?utm…), then the same trace, span and breadcrumb scrub.
 */
type QueryRequestEvent = { request?: { url?: unknown; query_string?: unknown } };

export function withoutRequestQuery<T extends QueryRequestEvent>(event: T): T {
  if (event.request) {
    delete event.request.query_string;
    if (typeof event.request.url === 'string') event.request.url = withoutQuery(event.request.url);
  }
  return withoutQueryStrings(event);
}

/** Every event and transaction: no request body (T-136), no query string anywhere (T-242). */
export function scrubEvent<T extends QueryRequestEvent & { request?: { data?: unknown } }>(
  event: T,
): T {
  return withoutRequestQuery(withoutRequestBody(event));
}

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    enabled: process.env.NODE_ENV !== 'test',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
    serverName: 'gateway',
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
  });
}

import { BODY_PARSER_ERRORS } from '@lawie/shared';
import * as Sentry from '@sentry/node';

import { maskEmails, scrubPii } from './logger';

const dsn = process.env.SENTRY_DSN;

/** Request headers kept on Sentry events; everything else (authorization, cookie, x-*) is dropped. */
const ALLOWED_HEADERS = new Set(['host', 'user-agent', 'content-type', 'content-length', 'accept']);

type TransactionEvent = Parameters<NonNullable<Sentry.NodeOptions['beforeSendTransaction']>>[0];

/**
 * PII scrub for every Sentry error event (T-210, DPDP Act 2023):
 *  - masks email-shaped text in exception values, the event message and breadcrumb messages
 *  - deletes request.data (register/login bodies), request.cookies and request.query_string;
 *    cuts the URL at '?' and masks emails in what is left (T-242)
 *  - keeps only allowlisted request headers (drops authorization: the JWT holds email + name)
 *  - runs extra/contexts through `scrubPii` (drops `keyValue`, masks emails)
 *  - cuts query strings out of trace, span and breadcrumb data (T-242, withoutQueryStrings)
 * Uses the same `maskEmails`/`scrubPii` helpers as the Pino logger.
 */
export function scrubEvent<T extends Sentry.Event>(event: T): T {
  if (typeof event.message === 'string') event.message = maskEmails(event.message);

  for (const ex of event.exception?.values ?? []) {
    if (typeof ex.value === 'string') ex.value = maskEmails(ex.value);
  }

  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    // T-242 (Ajay condition 3): no query string reaches Sentry, so campaign tags (and any other
    // query value) never do. The URL keeps its path only; emails in the path are still masked.
    delete event.request.query_string;
    if (typeof event.request.url === 'string') {
      event.request.url = maskEmails(event.request.url.split('?')[0] ?? '');
    }
    if (event.request.headers) {
      const kept: Record<string, string> = {};
      for (const [name, value] of Object.entries(event.request.headers)) {
        if (ALLOWED_HEADERS.has(name.toLowerCase()) && typeof value === 'string') {
          kept[name] = maskEmails(value);
        }
      }
      event.request.headers = kept;
    }
  }

  for (const crumb of event.breadcrumbs ?? []) {
    if (typeof crumb.message === 'string') crumb.message = maskEmails(crumb.message);
  }

  if (event.extra) {
    event.extra = scrubPii(event.extra) as T['extra'];
  }
  if (event.contexts) {
    event.contexts = scrubPii(event.contexts) as T['contexts'];
  }

  // T-242: after scrubPii, which may hand back a copy of contexts.
  return withoutQueryStrings(event);
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
 * T-315 — JSON.parse error messages can carry a slice of the input, e.g.
 * `Unexpected token 'p', "{"password": p4ss"... is not valid JSON` (V8) or
 * `Unexpected token } in JSON at position 5` (older V8). Any exception value of that
 * shape is replaced whole, wherever the SyntaxError came from.
 */
const JSON_PARSE_MESSAGE = /is not valid JSON|\bin JSON\b|end of JSON input/i;
export const JSON_PARSE_REDACTED = 'JSON parse error (message redacted)';

function bodyParserType(exception: unknown): string | undefined {
  const type = (exception as { type?: unknown } | null | undefined)?.type;
  return typeof type === 'string' && Object.prototype.hasOwnProperty.call(BODY_PARSER_ERRORS, type)
    ? type
    : undefined;
}

/**
 * T-315 defence in depth (the shared jsonBodyErrorHandler in app.ts stops these first):
 *  - a body-parser error (any type in the shared BODY_PARSER_ERRORS map, e.g. entity.parse.failed,
 *    entity.too.large, parameters.too.many) keeps the event but every exception value becomes
 *    "Request body rejected (<type>)", so its message (which holds a body slice) never
 *    leaves the process, while the event itself still shows the handler was bypassed;
 *  - any other exception value shaped like a JSON.parse error is replaced with fixed text.
 * Then the T-210 scrub runs unchanged.
 */
export function beforeSend(event: Sentry.ErrorEvent, hint?: Sentry.EventHint): Sentry.ErrorEvent {
  const rejectedType = bodyParserType(hint?.originalException);
  for (const ex of event.exception?.values ?? []) {
    if (rejectedType) {
      ex.value = `Request body rejected (${rejectedType})`;
    } else if (typeof ex.value === 'string' && JSON_PARSE_MESSAGE.test(ex.value)) {
      ex.value = JSON_PARSE_REDACTED;
    }
  }
  return scrubEvent(event);
}

/** Transactions skip beforeSend, but carry the same request data. */
export function beforeSendTransaction(event: TransactionEvent): TransactionEvent {
  return scrubEvent(event);
}

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    enabled: process.env.NODE_ENV !== 'test',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
    serverName: 'auth',
    sendDefaultPii: false,
    // Do not attach incoming request bodies (register/login carry email + password).
    // Do not attach incoming request bodies (register/login carry email + password).
    // Headers, cookies and any data left on event.request are filtered in scrubEvent.
    integrations: [Sentry.httpIntegration({ maxIncomingRequestBodySize: 'none' })],
    beforeSend,
    beforeSendTransaction,
  });
}

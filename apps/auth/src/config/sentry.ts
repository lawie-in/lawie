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
 *  - deletes request.data (register/login bodies) and request.cookies, masks emails in the URL
 *  - keeps only allowlisted request headers (drops authorization: the JWT holds email + name)
 *  - runs extra/contexts through `scrubPii` (drops `keyValue`, masks emails)
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
    if (typeof event.request.url === 'string') event.request.url = maskEmails(event.request.url);
    if (typeof event.request.query_string === 'string') {
      event.request.query_string = maskEmails(event.request.query_string);
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

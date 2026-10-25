import {
  BODY_PARSER_ERRORS,
  scrubSentryEvent,
  withoutQueryStrings as sharedWithoutQueryStrings,
} from '@lawie/shared';
import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;

type TransactionEvent = Parameters<NonNullable<Sentry.NodeOptions['beforeSendTransaction']>>[0];

/**
 * PII scrub for every Sentry error event and transaction. T-229 moved the T-210 scrub (and its
 * T-242 query-string handling) into @lawie/shared (`scrubSentryEvent`), so every service runs
 * the same rules: header allowlist, no body/cookies/query string, emails and path tokens
 * (`/reset-password/:token`) masked, `keyValue` dropped. Re-exported here under its old name.
 */
export function scrubEvent<T extends Sentry.Event>(event: T): T {
  return scrubSentryEvent(event);
}

/** Removes query strings from the transaction name, trace, span and breadcrumb data (T-242). */
export function withoutQueryStrings<T>(event: T): T {
  return sharedWithoutQueryStrings(event);
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
 * Then the shared T-229 scrub (from T-210) runs.
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
    // Headers, cookies and any data left on event.request are filtered in scrubEvent.
    integrations: [Sentry.httpIntegration({ maxIncomingRequestBodySize: 'none' })],
    beforeSend,
    beforeSendTransaction,
  });
}

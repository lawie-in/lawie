import { scrubSentryEvent, withoutQuery, withoutQueryStrings } from '@lawie/shared';
import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;

/**
 * What a user sent never goes into an error report (T-136: the advocate's
 * description must not be written to error reports). The gateway passes a
 * request's body on without reading it, but the SDK still keeps the body of an
 * incoming request and attaches it to an event by default. This takes it off
 * every event before the event leaves the service. (T-242: scrubEvent below also removes query
 * strings, headers and PII via the shared T-229 scrub; withoutRequestBody itself still changes
 * nothing else.)
 */
export function withoutRequestBody<T extends { request?: { data?: unknown } }>(event: T): T {
  if (event.request && 'data' in event.request) delete event.request.data;
  return event;
}

/**
 * T-242: request.query_string deleted and request.url cut at '?' (the gateway proxies
 * /api/auth/google?utm…), then the trace, span and breadcrumb query scrub from @lawie/shared.
 */
type QueryRequestEvent = { request?: { url?: unknown; query_string?: unknown } };

export function withoutRequestQuery<T extends QueryRequestEvent>(event: T): T {
  if (event.request) {
    delete event.request.query_string;
    if (typeof event.request.url === 'string') event.request.url = withoutQuery(event.request.url);
  }
  return withoutQueryStrings(event);
}

/**
 * Every event and transaction (T-229): the shared scrub from @lawie/shared. No request body
 * (T-136), no query string anywhere (T-242), only allowlisted headers (drops authorization,
 * cookie, x-internal-secret and the x-user-* headers the gateway adds when it forwards a
 * request), emails and path tokens masked, Mongo `keyValue` dropped.
 */
export function scrubEvent<T extends object>(event: T): T {
  return scrubSentryEvent(event);
}

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    enabled: process.env.NODE_ENV !== 'test',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
    serverName: 'gateway',
    sendDefaultPii: false,
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
  });
}

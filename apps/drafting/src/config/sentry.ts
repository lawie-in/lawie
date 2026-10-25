import { scrubSentryEvent } from '@lawie/shared';
import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;

/**
 * What a user sent never goes into an error report (T-136: the advocate's
 * description must not be written to error reports). The SDK keeps the body of
 * an incoming request and attaches it to an event by default. This takes it off
 * every event before the event leaves the service. Nothing else is changed.
 */
export function withoutRequestBody<T extends { request?: { data?: unknown } }>(event: T): T {
  if (event.request && 'data' in event.request) delete event.request.data;
  return event;
}

/**
 * Every event and transaction (T-229): the shared scrub from @lawie/shared. No request body
 * (T-136), cookies or query string; only allowlisted headers (drops authorization, cookie,
 * x-internal-secret and the x-user-* headers the gateway forwards); emails and path tokens
 * (`/review/:token`) masked; Mongo `keyValue` dropped.
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
    serverName: 'drafting',
    sendDefaultPii: false,
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
  });
}

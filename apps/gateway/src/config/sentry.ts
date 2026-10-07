import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;

/**
 * What a user sent never goes into an error report (T-136: the advocate's
 * description must not be written to error reports). The gateway passes a
 * request's body on without reading it, but the SDK still keeps the body of an
 * incoming request and attaches it to an event by default. This takes it off
 * every event before the event leaves the service. Nothing else is changed.
 */
export function withoutRequestBody<T extends { request?: { data?: unknown } }>(event: T): T {
  if (event.request && 'data' in event.request) delete event.request.data;
  return event;
}

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    enabled: process.env.NODE_ENV !== 'test',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
    serverName: 'gateway',
    beforeSend: (event) => withoutRequestBody(event),
    beforeSendTransaction: (event) => withoutRequestBody(event),
  });
}

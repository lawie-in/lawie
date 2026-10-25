import { scrubSentryEvent } from '@lawie/shared';
import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN;

/**
 * Every event and transaction (T-229): the shared scrub from @lawie/shared. No request body,
 * cookies or query string; only allowlisted headers (drops authorization, cookie,
 * x-internal-secret and the x-user-* headers the gateway forwards); emails and path tokens
 * masked; Mongo `keyValue` dropped.
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
    serverName: 'billing',
    sendDefaultPii: false,
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
  });
}

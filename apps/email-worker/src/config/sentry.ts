import { scrubSentryEvent } from '@lawie/shared';
import * as Sentry from '@sentry/node';

/**
 * Every event and transaction (T-229): the shared scrub from @lawie/shared, as in every other
 * service. No request body, cookies or query string; only allowlisted headers (drops
 * authorization, cookie, x-internal-secret and x-user-*); emails and path tokens masked; Mongo
 * `keyValue` dropped. The worker already sends message-free errors (T-353, toSentrySafeError);
 * this covers breadcrumbs, request data from its internal HTTP app and transactions.
 */
export function scrubEvent<T extends object>(event: T): T {
  return scrubSentryEvent(event);
}

interface SentryEnv {
  SENTRY_DSN?: string;
  NODE_ENV: string;
}

/** Starts Sentry when a DSN is set; does nothing otherwise. Called once from index.ts. */
export function initSentry(env: SentryEnv): void {
  if (!env.SENTRY_DSN) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.2 : 0,
    serverName: 'email-worker',
    sendDefaultPii: false,
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
  });
}

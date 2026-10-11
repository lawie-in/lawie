import * as Sentry from '@sentry/node';

import { maskEmails, scrubPii } from './logger';

const dsn = process.env.SENTRY_DSN;

/**
 * PII scrub for every Sentry error event (T-210, DPDP Act 2023):
 *  - masks email-shaped text in exception values, the event message and breadcrumb messages
 *  - deletes request.data (register/login bodies) and request.cookies, masks emails in the URL
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

export function beforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
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
    integrations: [Sentry.httpIntegration({ maxIncomingRequestBodySize: 'none' })],
    beforeSend,
  });
}

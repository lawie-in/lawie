import * as Sentry from '@sentry/node';

import { maskEmails } from './logger';

const dsn = process.env.SENTRY_DSN;

const MAX_DEPTH = 6;

/** Masks email-shaped strings and drops `keyValue` (Mongo E11000) at any depth. */
function scrubValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return maskEmails(value);
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value) || depth > MAX_DEPTH) return '[Truncated]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1, seen));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'keyValue') continue;
    out[key] = scrubValue(v, depth + 1, seen);
  }
  return out;
}

/**
 * PII scrub for every Sentry error event (T-210, DPDP Act 2023):
 *  - masks email-shaped text in exception values, the event message and breadcrumb messages
 *  - deletes request.data (register/login bodies) and request.cookies, masks emails in the URL
 *  - removes any `keyValue` under extra/contexts and masks emails in their strings
 * Uses the same `maskEmails` helper as the Pino logger.
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
    event.extra = scrubValue(event.extra, 0, new WeakSet()) as T['extra'];
  }
  if (event.contexts) {
    event.contexts = scrubValue(event.contexts, 0, new WeakSet()) as T['contexts'];
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

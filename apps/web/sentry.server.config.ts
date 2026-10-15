import { scrubSentryEvent } from '@lawie/shared';
import * as Sentry from '@sentry/nextjs';

// ── T-229 (from T-348 / T-242): no credential, cookie, query string, email or path token
// reaches Sentry. The scrub lives in @lawie/shared (packages/shared/src/observability/
// sentry-scrub.ts) and is the one every backend service runs. It is dependency-free (pure
// functions, structural types, no Node import, no Sentry SDK import), so it is safe in this
// runtime; next.config.mjs already transpiles @lawie/shared. It covers, as T-348 did here:
// header allowlist, no cookies or query string, key=value queries stripped from free text,
// emails masked, contexts.nextjs.request_path cut; and adds path-token masking
// (/review/[token], /reset-password/:token) and the deep extra/contexts scrub.

/** Every event and transaction. */
export function scrubEvent<T extends Sentry.Event>(event: T): T {
  return scrubSentryEvent(event);
}

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: 0.2,
  beforeSend: (event) => scrubEvent(event),
  beforeSendTransaction: (event) => scrubEvent(event),
});

import { maskPathTokens, scrubMaskEmails, scrubSentryEvent, withoutQuery } from '@lawie/shared';
import * as Sentry from '@sentry/nextjs';

// ── T-586: browser-side Sentry (Next 16 loads instrumentation-client.ts before the app runs).
// Same scrub as sentry.server.config.ts and sentry.edge.config.ts: the @lawie/shared scrub
// (packages/shared/src/observability/sentry-scrub.ts) on every event and transaction, so no
// credential, cookie, query string, email or path token (/review/[token],
// /reset-password/:token) reaches Sentry. sendDefaultPii stays false. No session replay, no
// setUser, no performance tracing in the browser (tracesSampleRate unset), so no page-load or
// navigation transactions carrying URLs are sent.
//
// Guarded by NEXT_PUBLIC_SENTRY_DSN: with no DSN, Sentry.init is never called. The env reads
// below are literal `process.env.NEXT_PUBLIC_*` so `next build` inlines them; each is a build
// ARG in apps/web/Dockerfile. Release: not set here on purpose. withSentryConfig resolves it at
// build time from SENTRY_RELEASE (the commit SHA) and inlines it as the SDK's default release;
// passing `release` here would override that, and SENTRY_RELEASE itself is not inlined into
// browser code.

/** Every event and transaction. */
export function scrubEvent<T extends Sentry.Event>(event: T): T {
  return scrubSentryEvent(event);
}

/**
 * The only breadcrumb categories kept; every other one (ui.click and other DOM crumbs, which
 * carry aria-label/title text such as document titles; console, which carries raw output; any
 * unknown category) is dropped. fetch and xhr data is {method, url, status_code, body sizes}; the
 * shared scrub cuts and masks its url. sentry.event / sentry.transaction are the SDK's own crumbs
 * for earlier events; their message is scrubbed like an event message.
 */
export const BREADCRUMB_CATEGORY_ALLOWLIST: readonly string[] = [
  'navigation',
  'fetch',
  'xhr',
  'sentry.event',
  'sentry.transaction',
];

/** A relative URL from a navigation crumb: no hash, query, email or path token. */
function scrubNavigationUrl(value: string): string {
  const hash = value.indexOf('#');
  const noHash = hash === -1 ? value : value.slice(0, hash);
  return maskPathTokens(scrubMaskEmails(withoutQuery(noHash)));
}

/**
 * Allowlist filter. Navigation crumbs hold data.from / data.to (path, query and hash, e.g.
 * /review/<token>), which the shared scrub does not touch, so both are scrubbed here.
 */
export function filterBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb | null {
  const category = breadcrumb.category;
  if (!category || !BREADCRUMB_CATEGORY_ALLOWLIST.includes(category)) return null;
  if (category !== 'navigation' || !breadcrumb.data) return breadcrumb;
  const data: Record<string, unknown> = { ...breadcrumb.data };
  for (const key of ['from', 'to']) {
    const v = data[key];
    if (typeof v === 'string') data[key] = scrubNavigationUrl(v);
  }
  return { ...breadcrumb, data };
}

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    enabled: process.env.NODE_ENV === 'production',
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    sendDefaultPii: false,
    maxBreadcrumbs: 50,
    beforeBreadcrumb: (breadcrumb) => filterBreadcrumb(breadcrumb),
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
  });
}

// The SDK warns at build without this export. With tracing off it records nothing.
// eslint-import resolves the package's server `main`; the browser entry the bundler uses
// (build/esm/index.client.js) and the published types both export this.
// eslint-disable-next-line import/namespace
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

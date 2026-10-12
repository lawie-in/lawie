import * as Sentry from '@sentry/nextjs';

// ── T-348 (Ajay condition 3 of T-242): no query string, no cookie, no email reaches Sentry ─────
// Mirrors apps/auth and apps/gateway (T-242). sentry.server.config.ts holds the same local copy on
// purpose (no shared web helper). Every query string is cut, not only UTM tags (`?ref=` included;
// Ajay, 12 Oct 2026).
const EMAIL_MASK = '[email]';
const EMAIL_RE = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

function maskEmails(value: string): string {
  if (!value.includes('@')) return value;
  return value.replace(EMAIL_RE, EMAIL_MASK);
}

/**
 * Removes query strings embedded in free text ("failed for /drafts/42?a=1&ref=x#frag" becomes
 * "failed for /drafts/42#frag"). Only a '?' followed by a key=value shape is cut, so a plain '?'
 * in prose ("Are you sure?") stays; the path and the #fragment stay.
 */
const TEXT_QUERY_RE = /\?[^\s?#"'<>]*=[^\s#"'<>]*/g;

function stripTextQueries(value: string): string {
  if (!value.includes('?')) return value;
  return value.replace(TEXT_QUERY_RE, '');
}

/** Free text (messages, exception values, breadcrumb messages): no query, no email. */
function scrubText(value: string): string {
  return maskEmails(stripTextQueries(value));
}

function withoutQuery(value: string): string {
  const i = value.indexOf('?');
  return i === -1 ? value : value.slice(0, i);
}

/** Request headers kept on Sentry events, as in apps/auth; everything else is dropped. */
const ALLOWED_HEADERS = new Set(['host', 'user-agent', 'content-type', 'content-length', 'accept']);

const QUERY_CUT_KEYS = ['http.url', 'http.target', 'url.full'] as const;
const QUERY_DROP_KEYS = ['url.query', 'http.query'] as const;

function scrubQueryData(data: unknown, extraCutKeys: readonly string[] = []): void {
  if (!data || typeof data !== 'object') return;
  const d = data as Record<string, unknown>;
  for (const k of [...QUERY_CUT_KEYS, ...extraCutKeys]) {
    const v = d[k];
    if (typeof v === 'string') d[k] = withoutQuery(v);
  }
  for (const k of QUERY_DROP_KEYS) delete d[k];
}

/**
 * Every event and transaction:
 *  - event.message, exception values and breadcrumb messages: embedded key=value query strings
 *    removed (T-348 round 3) and emails masked (as auth);
 *  - request: query_string and cookies deleted; url cut at '?' with emails masked; only the
 *    headers auth allowlists are kept, emails masked (authorization, cookie, referer and x-* are
 *    dropped; the RequestData integration sends headers and cookies by default);
 *  - transaction name cut at '?' with emails masked;
 *  - contexts.trace.data, spans[].data and breadcrumbs[].data: URL keys cut at '?', query keys
 *    deleted; http span descriptions ("METHOD url") cut at '?';
 *  - contexts.nextjs.request_path (set by captureRequestError from Next's request.path, which
 *    holds the query) cut at '?'.
 */
export function scrubEvent<T extends Sentry.Event>(event: T): T {
  if (typeof event.message === 'string') event.message = scrubText(event.message);
  for (const ex of event.exception?.values ?? []) {
    if (typeof ex.value === 'string') ex.value = scrubText(ex.value);
  }

  const req = event.request;
  if (req) {
    delete req.query_string;
    delete req.cookies;
    if (typeof req.url === 'string') req.url = maskEmails(withoutQuery(req.url));
    if (req.headers) {
      const kept: Record<string, string> = {};
      for (const [name, value] of Object.entries(req.headers)) {
        if (ALLOWED_HEADERS.has(name.toLowerCase()) && typeof value === 'string') {
          kept[name] = maskEmails(value);
        }
      }
      req.headers = kept;
    }
  }

  if (typeof event.transaction === 'string') {
    event.transaction = maskEmails(withoutQuery(event.transaction));
  }

  scrubQueryData(event.contexts?.trace?.data);
  const nextjs = event.contexts?.nextjs as Record<string, unknown> | undefined;
  if (nextjs && typeof nextjs.request_path === 'string') {
    nextjs.request_path = withoutQuery(nextjs.request_path);
  }

  for (const span of event.spans ?? []) {
    scrubQueryData(span.data);
    // http.client / http.server span names are "METHOD url"; only those are cut.
    const isHttp = typeof span.op === 'string' && span.op.startsWith('http');
    if (isHttp && typeof span.description === 'string') {
      span.description = withoutQuery(span.description);
    }
  }

  for (const crumb of event.breadcrumbs ?? []) {
    if (typeof crumb.message === 'string') crumb.message = scrubText(crumb.message);
    scrubQueryData(crumb.data, ['url']);
  }
  return event;
}

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: 0.2,
  beforeSend: (event) => scrubEvent(event),
  beforeSendTransaction: (event) => scrubEvent(event),
});

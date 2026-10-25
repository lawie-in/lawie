/**
 * T-229 — one Sentry scrub for every service (gateway, auth, drafting, billing, email-worker)
 * and for apps/web (server, edge). Moved from auth's T-210 scrub (with its T-242 query-string
 * handling) and web's T-348 copy, which held the same rules plus free-text query stripping.
 *
 * Run it from BOTH `beforeSend` and `beforeSendTransaction` (transactions skip beforeSend but
 * carry the same request data). Not the SDK's `dataCollection` option (Arjun, 11 Oct 2026: it
 * loosens other defaults).
 *
 * Dependency-free on purpose: pure functions, no Node imports, no Sentry SDK import, structural
 * types only. apps/web bundles it into the edge runtime (and @lawie/shared already reaches the
 * browser bundle), so nothing here may need Node.
 *
 * What it does to an event or transaction:
 *  - request: `data` (body), `cookies` and `query_string` deleted; `url` cut at '?', emails and
 *    path tokens masked; only the allowlisted headers kept (host, user-agent, content-type,
 *    content-length, accept), emails masked in their values. `authorization`, `cookie`,
 *    `x-internal-secret`, `x-user-*`, `referer` and every other header is dropped.
 *  - message, exception values, breadcrumb messages: key=value query strings removed, emails
 *    masked, path tokens masked.
 *  - transaction name: cut at '?', emails and path tokens masked.
 *  - user: reduced to {id} (ip_address, email, username dropped); removed when it has no id.
 *  - extra, contexts, tags and breadcrumbs[].data: deep scrub (`keyValue` dropped, Mongoose `errors.*` reduced to
 *    {path, kind, message}, emails masked); `code`, `keyPattern`, `name`, `stack` kept.
 *  - contexts.trace.data, spans[].data, breadcrumbs[].data: URL keys cut at '?' with emails and
 *    path tokens masked, query-only keys deleted; http span descriptions ("METHOD url") cut at
 *    '?' with path tokens masked; contexts.nextjs.request_path the same.
 */

// ── Emails and deep PII scrub (pure copies of apps/auth/src/config/logger.ts helpers) ──────────

export const SCRUB_EMAIL_MASK = '[email]';

// The lookbehind anchors a match at the start of a local-part run, so a long run of
// local-part chars (e.g. attacker-controlled req.url) is not retried from every offset.
const EMAIL_RE = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const DROPPED_ERR_KEYS = new Set(['keyValue']);
const MAX_DEPTH = 6;

export function scrubMaskEmails(value: string): string {
  if (!value.includes('@')) return value;
  return value.replace(EMAIL_RE, SCRUB_EMAIL_MASK);
}

function deepScrub(value: unknown, depth: number, ancestors: Set<object>): unknown {
  if (typeof value === 'string') return scrubMaskEmails(value);
  if (value === null || typeof value !== 'object') return value;
  // Truncate only true cycles (object is its own ancestor) and very deep trees. Objects
  // shared by two branches (E11000 keyPattern and errorResponse.keyPattern) are kept in both.
  if (ancestors.has(value) || depth > MAX_DEPTH) return '[Truncated]';
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.map((v) => deepScrub(v, depth + 1, ancestors));

    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (DROPPED_ERR_KEYS.has(key)) continue;
      if (key === 'errors' && v && typeof v === 'object' && !Array.isArray(v)) {
        // Mongoose ValidationError: keep which path failed and how, never the value.
        const errors: Record<string, unknown> = {};
        for (const [path, e] of Object.entries(v as Record<string, unknown>)) {
          const ve = (e ?? {}) as Record<string, unknown>;
          errors[path] = {
            path: ve['path'],
            kind: ve['kind'],
            message: typeof ve['message'] === 'string' ? scrubMaskEmails(ve['message']) : undefined,
          };
        }
        out[key] = errors;
        continue;
      }
      out[key] = deepScrub(v, depth + 1, ancestors);
    }
    return out;
  } finally {
    ancestors.delete(value);
  }
}

/**
 * Deep PII scrub: masks email-shaped strings, drops `keyValue`, reduces Mongoose `errors.*` to
 * {path, kind, message}. Returns a copy; the input is not changed.
 */
export function scrubPiiDeep(value: unknown): unknown {
  return deepScrub(value, 0, new Set());
}

// ── Path tokens (T-229 AC6) ────────────────────────────────────────────────────────────────────

export const PATH_TOKEN_MASK = '[token]';

/**
 * Path segments whose NEXT segment is a live secret: auth `/reset-password/:token`, drafting
 * `/review/:token` (and web `/review/[token]`), drafting `/admin/review-tokens/:token/disable`.
 * Matched anywhere in a string (full URL, path, transaction name, free text), with any prefix
 * (`/api/auth/reset-password/…` through the gateway).
 */
export const TOKEN_ROUTE_SEGMENTS = ['reset-password', 'review', 'review-tokens'] as const;

const TOKEN_ROUTE_RE = new RegExp(
  `(/(?:${TOKEN_ROUTE_SEGMENTS.join('|')})/)(?!\\[token\\])[^/\\s?#"'<>]+`,
  'gi',
);

/**
 * Defence in depth for routes not listed above: a whole path segment of 32+ characters that is
 * either all hex (crypto.randomBytes(n).toString('hex')) or base64url with at least one upper-case
 * letter and one digit (crypto.randomBytes(n).toString('base64url')). Lower-case slugs and
 * 24-hex Mongo ObjectIds are left alone.
 */
const LONG_SEGMENT_RE = /(?<=\/)[A-Za-z0-9_-]{32,}(?=$|[/?#\s"'<>])/g;

function looksLikeToken(segment: string): boolean {
  if (/^[0-9a-fA-F]+$/.test(segment)) return true;
  return /[A-Z]/.test(segment) && /[0-9]/.test(segment);
}

export function maskPathTokens(value: string): string {
  if (!value.includes('/')) return value;
  return value
    .replace(TOKEN_ROUTE_RE, `$1${PATH_TOKEN_MASK}`)
    .replace(LONG_SEGMENT_RE, (seg) => (looksLikeToken(seg) ? PATH_TOKEN_MASK : seg));
}

// ── Query strings (T-242, T-348) ───────────────────────────────────────────────────────────────

/** Cuts a URL (or "METHOD url") at the first '?'. */
export function withoutQuery(value: string): string {
  const i = value.indexOf('?');
  return i === -1 ? value : value.slice(0, i);
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

/** Free text (messages, exception values, breadcrumb messages): no query, email or path token. */
function scrubText(value: string): string {
  return maskPathTokens(scrubMaskEmails(stripTextQueries(value)));
}

/** A URL or path: no query, email or path token. */
function scrubUrl(value: string): string {
  return maskPathTokens(scrubMaskEmails(withoutQuery(value)));
}

const QUERY_CUT_KEYS = ['http.url', 'http.target', 'url.full'] as const;
const QUERY_DROP_KEYS = ['url.query', 'http.query'] as const;

function scrubUrlData(data: unknown, extraCutKeys: readonly string[] = []): void {
  if (!data || typeof data !== 'object') return;
  const d = data as Record<string, unknown>;
  for (const k of [...QUERY_CUT_KEYS, ...extraCutKeys]) {
    const v = d[k];
    if (typeof v === 'string') d[k] = scrubUrl(v);
  }
  for (const k of QUERY_DROP_KEYS) delete d[k];
}

interface UrlBearingEvent {
  transaction?: unknown;
  contexts?: { trace?: { data?: unknown }; nextjs?: unknown };
  spans?: { op?: unknown; description?: unknown; data?: unknown }[];
  breadcrumbs?: { data?: unknown }[];
}

/**
 * Removes query strings (and masks emails and path tokens) in the transaction name,
 * contexts.trace.data, contexts.nextjs.request_path, spans[].data, http span descriptions and
 * breadcrumbs[].data. Mutates and returns the event.
 */
export function withoutQueryStrings<T>(event: T): T {
  const e = event as unknown as UrlBearingEvent;
  if (typeof e.transaction === 'string') e.transaction = scrubUrl(e.transaction);
  scrubUrlData(e.contexts?.trace?.data);
  const nextjs = e.contexts?.nextjs as Record<string, unknown> | undefined;
  if (nextjs && typeof nextjs === 'object' && typeof nextjs['request_path'] === 'string') {
    nextjs['request_path'] = scrubUrl(nextjs['request_path']);
  }
  for (const span of e.spans ?? []) {
    if (!span) continue;
    scrubUrlData(span.data);
    // http.client / http.server span names are "METHOD url"; only those are cut.
    const isHttp = typeof span.op === 'string' && span.op.startsWith('http');
    if (isHttp && typeof span.description === 'string') {
      span.description = scrubUrl(span.description);
    }
  }
  for (const crumb of e.breadcrumbs ?? []) if (crumb) scrubUrlData(crumb.data, ['url']);
  return event;
}

// ── The event scrub ────────────────────────────────────────────────────────────────────────────

/** Request headers kept on Sentry events; everything else is dropped. */
export const SENTRY_ALLOWED_HEADERS: ReadonlySet<string> = new Set([
  'host',
  'user-agent',
  'content-type',
  'content-length',
  'accept',
]);

interface ScrubbableEvent {
  message?: unknown;
  exception?: { values?: { value?: unknown }[] };
  request?: {
    url?: unknown;
    data?: unknown;
    cookies?: unknown;
    query_string?: unknown;
    headers?: Record<string, unknown>;
  };
  breadcrumbs?: { message?: unknown; data?: unknown }[];
  extra?: unknown;
  contexts?: unknown;
  tags?: unknown;
  user?: Record<string, unknown> | null;
}

/**
 * Scrubs a Sentry error event or transaction in place (extra/contexts are replaced by scrubbed
 * copies) and returns it. Accepts any object shape, so it takes the SDK's ErrorEvent and
 * TransactionEvent without this package importing the SDK.
 */
export function scrubSentryEvent<T extends object>(event: T): T {
  const e = event as ScrubbableEvent;

  if (typeof e.message === 'string') e.message = scrubText(e.message);

  for (const ex of e.exception?.values ?? []) {
    if (ex && typeof ex.value === 'string') ex.value = scrubText(ex.value);
  }

  const req = e.request;
  if (req) {
    delete req.data;
    delete req.cookies;
    delete req.query_string;
    if (typeof req.url === 'string') req.url = scrubUrl(req.url);
    if (req.headers) {
      const kept: Record<string, string> = {};
      for (const [name, value] of Object.entries(req.headers)) {
        if (SENTRY_ALLOWED_HEADERS.has(name.toLowerCase()) && typeof value === 'string') {
          kept[name] = scrubMaskEmails(value);
        }
      }
      req.headers = kept;
    }
  }

  for (const crumb of e.breadcrumbs ?? []) {
    if (crumb && typeof crumb.message === 'string') crumb.message = scrubText(crumb.message);
  }

  // user: id only (no ip_address, email or username); dropped when there is no id.
  if (e.user && typeof e.user === 'object') {
    const id = e.user['id'];
    if (id !== undefined && id !== null) e.user = { id };
    else delete e.user;
  }

  if (e.extra) e.extra = scrubPiiDeep(e.extra);
  if (e.contexts) e.contexts = scrubPiiDeep(e.contexts);
  if (e.tags) e.tags = scrubPiiDeep(e.tags);

  // After the deep scrub, which hands back a copy of contexts.
  withoutQueryStrings(event);

  // Breadcrumb data after the URL cut: console breadcrumbs carry raw `arguments`.
  for (const crumb of e.breadcrumbs ?? []) {
    if (crumb && crumb.data) crumb.data = scrubPiiDeep(crumb.data);
  }
  return event;
}

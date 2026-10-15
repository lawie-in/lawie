/**
 * T-229 AC1, AC6: unit tests for @lawie/shared observability/sentry-scrub. packages/shared has no
 * test runner ("No tests for shared package"), so they live here, in the gateway workspace.
 */
import {
  maskPathTokens,
  scrubMaskEmails,
  scrubPiiDeep,
  scrubSentryEvent,
  SENTRY_ALLOWED_HEADERS,
  TOKEN_ROUTE_SEGMENTS,
  withoutQuery,
  withoutQueryStrings,
} from '@lawie/shared';

const HEX64 = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
const B64 = 'Ab3dEfGhIjKlMnOpQrStUvWxYz0123456789_-AbCdE';
const OID = '507f1f77bcf86cd799439011';

describe('header allowlist and request data', () => {
  it('keeps only the five allowed headers and drops body, cookies, query string', () => {
    const out: any = scrubSentryEvent({
      request: {
        url: 'http://h/p?a=1',
        data: { x: 1 },
        cookies: { a: 'b' },
        query_string: 'a=1',
        headers: {
          Host: 'h',
          'User-Agent': 'ua',
          'Content-Type': 'x',
          'content-length': '1',
          accept: '*/*',
          authorization: 'Bearer t',
          cookie: 'c=1',
          'x-internal-secret': 's',
          'x-user-email': 'a@b.com',
          'x-user-name': 'n',
          referer: 'http://h/?q=1',
        },
      },
    });
    expect(Object.keys(out.request.headers).sort()).toEqual([
      'Content-Type',
      'Host',
      'User-Agent',
      'accept',
      'content-length',
    ]);
    expect(out.request).toEqual({ url: 'http://h/p', headers: out.request.headers });
    expect([...SENTRY_ALLOWED_HEADERS].sort()).toEqual([
      'accept',
      'content-length',
      'content-type',
      'host',
      'user-agent',
    ]);
  });

  it('masks an email inside an allowed header value', () => {
    const out: any = scrubSentryEvent({ request: { headers: { 'user-agent': 'bot a@b.com' } } });
    expect(out.request.headers['user-agent']).toBe('bot [email]');
  });

  it('tolerates events with no request or odd shapes', () => {
    expect(scrubSentryEvent({})).toEqual({});
    expect(() =>
      scrubSentryEvent({
        request: {},
        spans: [{}, null as never],
        breadcrumbs: [null as never, {}],
      }),
    ).not.toThrow();
  });
});

describe('emails, keyValue, kept fields', () => {
  it('masks emails in message, exception, breadcrumb, extra, contexts', () => {
    const out: any = scrubSentryEvent({
      message: 'hi a@b.com',
      exception: { values: [{ value: 'dup x@y.in' }] },
      breadcrumbs: [{ message: 'm p@q.org' }],
      extra: { n: { e: 'z@z.io' } },
      contexts: { c: { e: 'k@k.co' } },
    });
    const j = JSON.stringify(out);
    expect(j).not.toMatch(/@[a-z]+\./);
    expect(out.message).toBe('hi [email]');
  });

  it('drops keyValue but keeps code, keyPattern, name, stack', () => {
    const out: any = scrubSentryEvent({
      extra: {
        err: {
          name: 'MongoServerError',
          code: 11000,
          keyPattern: { email: 1 },
          keyValue: { email: 'a@b.com' },
          stack: 'Error: x\n at y',
          errorResponse: { keyValue: { email: 'a@b.com' }, keyPattern: { email: 1 } },
        },
      },
    });
    expect(out.extra.err).toEqual({
      name: 'MongoServerError',
      code: 11000,
      keyPattern: { email: 1 },
      stack: 'Error: x\n at y',
      errorResponse: { keyPattern: { email: 1 } },
    });
  });

  it('reduces mongoose errors.* to path, kind, message', () => {
    const out: any = scrubPiiDeep({
      errors: {
        email: { path: 'email', kind: 'regexp', message: 'bad a@b.com', value: 'a@b.com' },
      },
    });
    expect(out.errors.email).toEqual({ path: 'email', kind: 'regexp', message: 'bad [email]' });
  });

  it('truncates cycles without throwing and does not mutate input', () => {
    const a: any = { n: 1 };
    a.self = a;
    expect((scrubPiiDeep(a) as any).self).toBe('[Truncated]');
    const src = { keyValue: 1, s: 'a@b.com' };
    scrubPiiDeep(src);
    expect(src).toEqual({ keyValue: 1, s: 'a@b.com' });
  });
});

describe('query strings', () => {
  it('withoutQuery and scrubMaskEmails basics', () => {
    expect(withoutQuery('GET /a?b=1')).toBe('GET /a');
    expect(withoutQuery('/a')).toBe('/a');
    expect(scrubMaskEmails('no at')).toBe('no at');
  });

  it('strips key=value queries from free text, keeps prose question marks and fragments', () => {
    const out: any = scrubSentryEvent({ message: 'failed /d/42?a=1&ref=x#frag. Sure?' });
    expect(out.message).toBe('failed /d/42#frag. Sure?');
  });
});

describe('path-token masking', () => {
  it.each(TOKEN_ROUTE_SEGMENTS)('masks the segment after /%s/ under any prefix', (seg) => {
    expect(maskPathTokens(`/api/auth/${seg}/short-secret`)).toBe(`/api/auth/${seg}/[token]`);
    expect(maskPathTokens(`http://h/${seg}/${HEX64}/disable`)).toBe(
      `http://h/${seg}/[token]/disable`,
    );
  });

  it('is idempotent', () => {
    const once = maskPathTokens(`/reset-password/${HEX64}`);
    expect(maskPathTokens(once)).toBe(once);
  });

  it('backup rule: 32+ char hex and base64url segments are masked', () => {
    expect(maskPathTokens(`/x/${HEX64}`)).toBe('/x/[token]');
    expect(maskPathTokens(`/x/${'f'.repeat(32)}/y`)).toBe('/x/[token]/y');
    expect(maskPathTokens(`/x/${B64}?q`)).toBe('/x/[token]?q');
  });

  it('false-positive guards: ObjectIds, slugs, short and mixed-case-only segments stay', () => {
    expect(maskPathTokens(`/drafts/${OID}`)).toBe(`/drafts/${OID}`);
    const slug = 'a-very-long-lowercase-slug-for-a-court-rules-page';
    expect(maskPathTokens(`/rules/${slug}`)).toBe(`/rules/${slug}`);
    expect(maskPathTokens('/api/drafts/123')).toBe('/api/drafts/123');
    // 32+ chars, mixed case but no digit: not a token
    expect(maskPathTokens(`/x/${'AbCz'.repeat(10)}`)).toBe(`/x/${'AbCz'.repeat(10)}`);
    // not a whole segment: prefix + hex still has non-hex letters, no capital+digit rule hit
    expect(maskPathTokens(`/x/pre${HEX64}`)).toBe(`/x/pre${HEX64}`);
  });

  it('strings with no slash are returned unchanged', () => {
    expect(maskPathTokens(HEX64)).toBe(HEX64);
  });
});

describe('transaction events, spans, breadcrumbs, nextjs request_path', () => {
  it('scrubs transaction name, trace data, spans, breadcrumbs, request_path', () => {
    const out: any = scrubSentryEvent({
      type: 'transaction',
      transaction: `POST /api/auth/reset-password/${HEX64}?utm=a`,
      contexts: {
        nextjs: { request_path: `/review/${HEX64}?x=1` },
        trace: {
          data: {
            'http.url': `http://a/reset-password/${HEX64}?q=1`,
            'http.target': `/reset-password/${HEX64}?q=1`,
            'url.full': `http://a/p?q=a@b.com`,
            'url.query': 'q=1',
            'http.query': 'q=1',
            'http.method': 'GET',
          },
        },
      },
      spans: [
        {
          op: 'http.client',
          description: `GET http://a/review/${HEX64}?z=1`,
          data: { 'url.query': 'z=1' },
        },
        { op: 'db', description: 'find?x=1', data: { 'http.url': 'http://a/b?c=d' } },
      ],
      breadcrumbs: [
        {
          message: `GET /reset-password/${HEX64}`,
          data: { url: `/reset-password/${HEX64}?a=b`, 'url.query': 'a=b' },
        },
      ],
    });
    expect(out.transaction).toBe('POST /api/auth/reset-password/[token]');
    expect(out.contexts.nextjs.request_path).toBe('/review/[token]');
    expect(out.contexts.trace.data).toEqual({
      'http.url': 'http://a/reset-password/[token]',
      'http.target': '/reset-password/[token]',
      'url.full': 'http://a/p',
      'http.method': 'GET',
    });
    expect(out.spans[0].description).toBe('GET http://a/review/[token]');
    expect(out.spans[0].data).toEqual({});
    expect(out.spans[1].description).toBe('find?x=1'); // non-http span left alone
    expect(out.spans[1].data['http.url']).toBe('http://a/b');
    expect(out.breadcrumbs[0].message).toBe('GET /reset-password/[token]');
    expect(out.breadcrumbs[0].data).toEqual({ url: '/reset-password/[token]' });
    expect(JSON.stringify(out)).not.toContain(HEX64);
  });

  it('withoutQueryStrings alone leaves request headers untouched', () => {
    const e: any = withoutQueryStrings({
      transaction: 'GET /a?b=1',
      request: { headers: { cookie: 'x' } },
    });
    expect(e.transaction).toBe('GET /a');
    expect(e.request.headers.cookie).toBe('x');
  });
});

describe('reset-token URL (AC6)', () => {
  it('never survives in request.url, transaction name or breadcrumbs', () => {
    const url = `http://gateway:4000/api/auth/reset-password/${HEX64}`;
    const out = scrubSentryEvent({
      transaction: `POST /api/auth/reset-password/${HEX64}`,
      request: { url },
      breadcrumbs: [{ message: `POST ${url}`, data: { url } }],
      message: `failed ${url}`,
    });
    expect(JSON.stringify(out)).not.toContain(HEX64);
    expect((out as any).request.url).toBe('http://gateway:4000/api/auth/reset-password/[token]');
  });
});

describe('event.user, event.tags, breadcrumb data', () => {
  it('cuts user to {id}', () => {
    const out: any = scrubSentryEvent({
      user: { id: 'u1', email: 'a@b.com', ip_address: '1.2.3.4', username: 'priya' },
    });
    expect(out.user).toEqual({ id: 'u1' });
  });

  it('deletes user when there is no id', () => {
    const out: any = scrubSentryEvent({ user: { email: 'a@b.com', ip_address: '1.2.3.4' } });
    expect(out).not.toHaveProperty('user');
  });

  it('leaves null or non-object user alone', () => {
    expect((scrubSentryEvent({ user: null }) as any).user).toBeNull();
    expect((scrubSentryEvent({ user: 'x' }) as any).user).toBe('x');
  });

  it('masks emails in tags', () => {
    const out: any = scrubSentryEvent({ tags: { who: 'a@b.com', n: 1 } });
    expect(out.tags).toEqual({ who: '[email]', n: 1 });
  });

  it('deep-scrubs breadcrumb data (console arguments): email masked, keyValue dropped', () => {
    const out: any = scrubSentryEvent({
      breadcrumbs: [
        null as never,
        { message: 'm' },
        {
          category: 'console',
          data: {
            arguments: ['user a@b.com', { keyValue: { email: 'a@b.com' }, code: 11000 }],
            url: '/p?q=1',
          },
        },
      ],
    });
    expect(out.breadcrumbs[2].data).toEqual({
      arguments: ['user [email]', { code: 11000 }],
      url: '/p',
    });
    expect(JSON.stringify(out)).not.toContain('a@b.com');
  });
});

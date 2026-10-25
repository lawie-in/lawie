// T-348: web server and edge Sentry configs scrub events and transactions (no query, no email).
const mockInit = jest.fn();
jest.mock('@sentry/nextjs', () => ({ init: (...args: unknown[]) => mockInit(...args) }));

type Hook = (event: Record<string, unknown>) => Record<string, unknown> | null;
interface Options {
  beforeSend: Hook;
  beforeSendTransaction: Hook;
}

async function loadOptions(file: 'server' | 'edge'): Promise<Options> {
  mockInit.mockClear();
  jest.resetModules();
  if (file === 'server') await import('../sentry.server.config');
  else await import('../sentry.edge.config');
  return mockInit.mock.calls[0][0] as Options;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function buildEvent(q: string): Record<string, unknown> {
  const url = `https://lawie.in/drafts/42`;
  return {
    message: 'failed for /drafts/42',
    transaction: `GET /drafts/42${q}`,
    request: {
      url: `${url}${q}`,
      query_string: q.slice(1),
      cookies: { session: `abc${q}` },
      headers: {
        host: 'lawie.in',
        'user-agent': 'Mozilla/5.0',
        accept: 'text/html',
        'content-type': 'text/html',
        'content-length': '10',
        referer: `https://lawie.in/x${q}`,
        cookie: `s=1; ${q.slice(1)}`,
        authorization: `Bearer ${q}`,
        'x-forwarded-url': `/drafts/42${q}`,
      },
    },
    exception: { values: [{ type: 'Error', value: 'bad' }] },
    contexts: {
      trace: {
        data: {
          'http.url': `${url}${q}`,
          'http.target': `/drafts/42${q}`,
          'url.full': `${url}${q}`,
          'url.query': q.slice(1),
          'http.query': q.slice(1),
          'http.method': 'GET',
        },
      },
      nextjs: { request_path: `/drafts/42${q}` },
    },
    spans: [
      {
        op: 'http.client',
        description: `GET https://api.lawie.in/v1/x${q}`,
        data: {
          'http.url': `https://api.lawie.in/v1/x${q}`,
          'http.target': `/v1/x${q}`,
          'url.full': `https://api.lawie.in/v1/x${q}`,
          'url.query': q.slice(1),
          'http.query': q.slice(1),
        },
      },
    ],
    breadcrumbs: [
      {
        category: 'fetch',
        message: 'fetch /v1/x',
        data: { url: `https://api.lawie.in/v1/x${q}`, 'http.query': q.slice(1) },
      },
    ],
  };
}

describe.each(['server', 'edge'] as const)('sentry.%s.config', (file) => {
  let opts: Options;
  beforeEach(async () => {
    opts = await loadOptions(file);
  });

  it('wires both beforeSend and beforeSendTransaction', () => {
    expect(typeof opts.beforeSend).toBe('function');
    expect(typeof opts.beforeSendTransaction).toBe('function');
  });

  describe.each([
    ['beforeSend', 'beforeSend'],
    ['beforeSendTransaction', 'beforeSendTransaction'],
  ] as const)('%s', (_label, hook) => {
    it.each(['?utm_source=SENTINEL', '?ref=SENTINEL', '?a=1&ref=SENTINEL#frag'])(
      'leaves no SENTINEL for %s, keeps paths, drops headers',
      (q) => {
        const out = opts[hook](buildEvent(q)) as Any;
        expect(JSON.stringify(out)).not.toContain('SENTINEL');
        expect(JSON.stringify(out)).not.toContain('utm_source');

        expect(out.request.url).toBe('https://lawie.in/drafts/42');
        expect(out.request.query_string).toBeUndefined();
        expect(out.request.cookies).toBeUndefined();
        expect(Object.keys(out.request.headers).sort()).toEqual(
          ['accept', 'content-length', 'content-type', 'host', 'user-agent'].sort(),
        );
        for (const h of ['referer', 'cookie', 'authorization', 'x-forwarded-url']) {
          expect(out.request.headers[h]).toBeUndefined();
        }

        expect(out.transaction).toBe('GET /drafts/42');
        const t = out.contexts.trace.data;
        expect(t['http.url']).toBe('https://lawie.in/drafts/42');
        expect(t['http.target']).toBe('/drafts/42');
        expect(t['url.full']).toBe('https://lawie.in/drafts/42');
        expect(t['url.query']).toBeUndefined();
        expect(t['http.query']).toBeUndefined();
        expect(t['http.method']).toBe('GET');
        expect(out.contexts.nextjs.request_path).toBe('/drafts/42');

        const s = out.spans[0];
        expect(s.description).toBe('GET https://api.lawie.in/v1/x');
        expect(s.data['http.url']).toBe('https://api.lawie.in/v1/x');
        expect(s.data['http.target']).toBe('/v1/x');
        expect(s.data['url.full']).toBe('https://api.lawie.in/v1/x');
        expect(s.data['url.query']).toBeUndefined();
        expect(s.data['http.query']).toBeUndefined();

        const b = out.breadcrumbs[0];
        expect(b.data.url).toBe('https://api.lawie.in/v1/x');
        expect(b.data['http.query']).toBeUndefined();
      },
    );

    // Free-text fields: key=value queries are stripped and emails masked; a plain '?' is kept.
    it('strips a query embedded in free-text message/exception/breadcrumb', () => {
      const q = '?ref=SENTINEL';
      const out = opts[hook]({
        message: `failed for /drafts/42${q}`,
        exception: { values: [{ value: `bad https://lawie.in/x${q}` }] },
        breadcrumbs: [{ message: `fetch /v1/x${q}` }],
      });
      expect(JSON.stringify(out)).not.toContain('SENTINEL');
    });

    it('keeps a plain question mark in prose', () => {
      const out = opts[hook]({
        message: 'Are you sure?',
        exception: { values: [{ value: 'Are you sure?' }] },
        breadcrumbs: [{ message: 'Are you sure?' }],
      }) as Any;
      expect(out.message).toBe('Are you sure?');
      expect(out.exception.values[0].value).toBe('Are you sure?');
      expect(out.breadcrumbs[0].message).toBe('Are you sure?');
    });

    it('masks emails in message, exception, breadcrumb message and user-agent', () => {
      const out = opts[hook]({
        message: 'user a.b+c@example.com failed',
        exception: { values: [{ value: 'cannot find x@y.co.in' }] },
        breadcrumbs: [{ message: 'login by q@r.org' }],
        request: { headers: { 'user-agent': 'Bot (contact: ops@corp.io)' } },
      }) as Any;
      expect(out.message).toBe('user [email] failed');
      expect(out.exception.values[0].value).toBe('cannot find [email]');
      expect(out.breadcrumbs[0].message).toBe('login by [email]');
      expect(out.request.headers['user-agent']).toBe('Bot (contact: [email])');
      expect(JSON.stringify(out)).not.toContain('@');
    });

    it('masks emails in url and transaction name', () => {
      const out = opts[hook]({
        transaction: 'GET /u/me@example.com',
        request: { url: 'https://lawie.in/u/me@example.com?ref=SENTINEL' },
      }) as Any;
      expect(out.transaction).toBe('GET /u/[email]');
      expect(out.request.url).toBe('https://lawie.in/u/[email]');
    });

    it('passes a clean event through unchanged', () => {
      const clean = {
        message: 'hello',
        transaction: 'GET /pricing',
        request: {
          url: 'https://lawie.in/pricing',
          headers: { host: 'lawie.in', accept: '*/*' },
        },
        spans: [{ op: 'db', description: 'select 1', data: { 'db.system': 'x' } }],
      };
      const copy = JSON.parse(JSON.stringify(clean));
      expect(opts[hook](clean)).toEqual(copy);
    });

    it('does not throw on missing or partial parts', () => {
      expect(() => opts[hook]({})).not.toThrow();
      expect(() =>
        opts[hook]({
          request: {},
          contexts: {},
          spans: [{}],
          breadcrumbs: [{}],
          exception: { values: [{}] },
        }),
      ).not.toThrow();
      expect(() =>
        opts[hook]({ contexts: { trace: {} }, spans: [{ op: 'http.client' }] }),
      ).not.toThrow();
    });
  });
});

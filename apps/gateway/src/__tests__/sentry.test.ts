/**
 * T-136, condition 6 (part 2): what a user sent is never written to an error
 * report. `withoutRequestBody` takes the request body off every event.
 * No DSN is set in tests, so importing the module must not start Sentry.
 */
import * as Sentry from '@sentry/node';

import { scrubEvent, withoutRequestBody, withoutRequestQuery } from '../config/sentry';

describe('withoutRequestBody', () => {
  it('does not start Sentry when there is no DSN', () => {
    // T-663: a boolean, so a failure can never print the variable's value.
    expect(process.env.SENTRY_DSN === undefined).toBe(true);
    expect(Sentry.getClient()).toBeUndefined();
  });

  it('removes the request body and keeps the rest of the event', () => {
    const event = {
      message: 'boom',
      level: 'error',
      request: {
        url: 'http://x/api',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        data: { described: 'My client Ramesh Mahto was arrested on 12.09.2026' },
      },
      tags: { service: 'x' },
    };
    const out = withoutRequestBody(event);
    expect(out.request).not.toHaveProperty('data');
    expect(JSON.stringify(out)).not.toContain('Ramesh');
    expect(out.request.url).toBe('http://x/api');
    expect(out.request.method).toBe('POST');
    expect(out.request.headers).toEqual({ 'content-type': 'application/json' });
    expect(out.message).toBe('boom');
    expect(out.tags).toEqual({ service: 'x' });
  });

  it('removes a body given as a string', () => {
    const out = withoutRequestBody<{ request: { data?: unknown; url: string } }>({
      request: { data: '{"described":"secret"}', url: 'u' },
    });
    expect(out.request).toEqual({ url: 'u' });
  });

  it('passes an event with no request through unchanged', () => {
    const event: { message: string; request?: { data?: unknown } } = { message: 'no request' };
    expect(withoutRequestBody(event)).toEqual({ message: 'no request' });
  });

  it('passes a request with no body through unchanged', () => {
    const event: { request: { url: string; method: string; data?: unknown } } = {
      request: { url: 'u', method: 'GET' },
    };
    expect(withoutRequestBody(event)).toEqual({ request: { url: 'u', method: 'GET' } });
  });
});

describe('Sentry.init with a DSN set (T-136, part 2 condition 6)', () => {
  const saved = process.env.SENTRY_DSN;
  afterEach(() => {
    if (saved === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = saved;
    jest.dontMock('@sentry/node');
    jest.resetModules();
  });

  it('starts Sentry with beforeSend and beforeSendTransaction that take request.data off', () => {
    jest.resetModules();
    const init = jest.fn();
    jest.doMock('@sentry/node', () => ({ init }));
    process.env.SENTRY_DSN = 'https://key@example.invalid/1';
    jest.isolateModules(() => {
      require('../config/sentry');
    });

    expect(init).toHaveBeenCalledTimes(1);
    const options = init.mock.calls[0][0] as {
      beforeSend: (e: unknown) => { request?: Record<string, unknown> };
      beforeSendTransaction: (e: unknown) => { request?: Record<string, unknown> };
    };
    expect(typeof options.beforeSend).toBe('function');
    expect(typeof options.beforeSendTransaction).toBe('function');

    for (const hook of [options.beforeSend, options.beforeSendTransaction]) {
      const out = hook({
        message: 'boom',
        request: { url: 'http://x/api', data: { described: 'My client Ramesh Mahto' } },
      });
      expect(out.request).not.toHaveProperty('data');
      expect(JSON.stringify(out)).not.toContain('Ramesh');
      expect(out.request?.url).toBe('http://x/api');
    }
  });

  // T-663: the test sets its own fixture DSN; the module hands it to Sentry.init only and never
  // writes it to the console. Assertions are booleans/counts so no DSN is ever printed.
  it('uses a fixture DSN it sets itself and never writes the DSN to the console', () => {
    const FIXTURE_DSN = 'https://fixture-key-t663@example.invalid/1';
    jest.resetModules();
    const init = jest.fn();
    jest.doMock('@sentry/node', () => ({ init }));
    const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;
    const spies = methods.map((m) => jest.spyOn(console, m).mockImplementation(() => undefined));
    try {
      process.env.SENTRY_DSN = FIXTURE_DSN;
      let threw = false;
      jest.isolateModules(() => {
        try {
          require('../config/sentry');
        } catch {
          threw = true;
        }
      });
      expect(threw).toBe(false);
      expect(init).toHaveBeenCalledTimes(1);
      expect((init.mock.calls[0][0] as { dsn?: unknown }).dsn === FIXTURE_DSN).toBe(true);
      const printed = spies.flatMap((s) => s.mock.calls).map((args) => JSON.stringify(args));
      expect(printed.filter((text) => text.includes('fixture-key-t663')).length).toBe(0);
    } finally {
      for (const s of spies) s.mockRestore();
    }
  });
});

// ── T-242 (Ajay condition 3): no query string reaches Sentry from the gateway ─────────────────
describe('T-242 query strings are scrubbed from every event and transaction', () => {
  const SENTINEL = 'zzutmsentinel';
  const Q = `?utmSource=${SENTINEL}&utmMedium=${SENTINEL}m`;

  const build = (): Record<string, any> => ({
    transaction: `GET /api/auth/google${Q}`,
    contexts: {
      trace: {
        op: 'http.server',
        data: {
          'http.url': `http://gateway:4000/api/auth/google${Q}`,
          'http.target': `/api/auth/google${Q}`,
          'url.full': `http://gateway:4000/api/auth/google${Q}`,
          'url.query': Q.slice(1),
          'http.query': Q.slice(1),
          'http.method': 'GET',
        },
      },
    },
    spans: [
      {
        op: 'http.client',
        description: `GET http://auth:4001/google${Q}`,
        data: {
          'http.url': `http://auth:4001/google${Q}`,
          'http.target': `/google${Q}`,
          'url.full': `http://auth:4001/google${Q}`,
          'url.query': Q.slice(1),
          'http.query': Q.slice(1),
          'http.response.status_code': 302,
        },
      },
    ],
    breadcrumbs: [
      {
        category: 'http',
        data: { url: `http://auth:4001/google${Q}`, 'http.query': Q.slice(1), method: 'GET' },
      },
    ],
    request: {
      url: `http://gateway:4000/api/auth/google${Q}`,
      query_string: Q.slice(1),
      method: 'GET',
      data: { described: 'My client Ramesh Mahto' },
    },
  });

  function expectScrubbed(out: Record<string, any>): void {
    const text = JSON.stringify(out);
    expect(text).not.toContain(SENTINEL);
    expect(text).not.toContain('utmSource');
    expect(text).not.toContain('Ramesh');

    expect(out.transaction).toBe('GET /api/auth/google');
    const t = out.contexts.trace.data;
    expect(t['http.url']).toBe('http://gateway:4000/api/auth/google');
    expect(t['http.target']).toBe('/api/auth/google');
    expect(t['url.full']).toBe('http://gateway:4000/api/auth/google');
    expect(t).not.toHaveProperty('url.query');
    expect(t).not.toHaveProperty('http.query');
    expect(t['http.method']).toBe('GET');

    const span = out.spans[0];
    expect(span.description).toBe('GET http://auth:4001/google');
    expect(span.data['http.url']).toBe('http://auth:4001/google');
    expect(span.data['http.target']).toBe('/google');
    expect(span.data['url.full']).toBe('http://auth:4001/google');
    expect(span.data).not.toHaveProperty('url.query');
    expect(span.data).not.toHaveProperty('http.query');
    expect(span.data['http.response.status_code']).toBe(302);

    expect(out.breadcrumbs[0].data.url).toBe('http://auth:4001/google');
    expect(out.breadcrumbs[0].data).not.toHaveProperty('http.query');
    expect(out.breadcrumbs[0].data.method).toBe('GET');

    expect(out.request).not.toHaveProperty('query_string');
    expect(out.request).not.toHaveProperty('data');
    expect(out.request.url).toBe('http://gateway:4000/api/auth/google');
    expect(out.request.method).toBe('GET');
  }

  it('scrubEvent cuts every place and still removes the request body', () => {
    expectScrubbed(scrubEvent(build()));
  });

  it('withoutRequestQuery deletes request.query_string and cuts request.url', () => {
    const out = withoutRequestQuery({
      request: { url: `http://g/api/auth/google${Q}`, query_string: Q.slice(1), method: 'GET' },
    });
    expect(out.request).toEqual({ url: 'http://g/api/auth/google', method: 'GET' });
  });

  describe('through the real Sentry.init options', () => {
    const saved = process.env.SENTRY_DSN;
    afterEach(() => {
      if (saved === undefined) delete process.env.SENTRY_DSN;
      else process.env.SENTRY_DSN = saved;
      jest.dontMock('@sentry/node');
      jest.resetModules();
    });

    it('beforeSend and beforeSendTransaction both scrub', async () => {
      jest.resetModules();
      const init = jest.fn();
      jest.doMock('@sentry/node', () => ({ init }));
      process.env.SENTRY_DSN = 'https://key@example.invalid/1';
      await import('../config/sentry');
      const options = init.mock.calls[0][0] as {
        beforeSend: (e: unknown) => Record<string, any>;
        beforeSendTransaction: (e: unknown) => Record<string, any>;
      };
      expectScrubbed(options.beforeSend(build()));
      expectScrubbed(options.beforeSendTransaction(build()));
    });
  });

  it('events with no query string, and a non-http span with "?", pass unchanged', () => {
    const clean = {
      transaction: 'GET /health',
      spans: [{ op: 'db.query', description: 'select ? from t', data: {} }],
      request: { url: 'http://g/health', method: 'GET' },
    };
    expect(scrubEvent(JSON.parse(JSON.stringify(clean)))).toEqual(clean);
  });
});

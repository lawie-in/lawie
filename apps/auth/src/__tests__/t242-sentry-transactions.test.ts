/**
 * T-242, Ajay condition 3 (round 2 must-fix): a campaign tag never reaches Sentry through a
 * transaction either. Trace data, span data, http span names, breadcrumbs and the transaction name
 * are cut at '?', through the real Sentry.init options (beforeSend and beforeSendTransaction).
 */

import './setupEnv';

jest.mock('@sentry/node', () => ({
  ...jest.requireActual('@sentry/node'),
  init: jest.fn(),
  httpIntegration: jest.fn(() => 'http-integration'),
}));

type Hook = (event: any, hint?: any) => any;

const SENTINEL = 'zzutmsentinel';
const Q = `?utmSource=${SENTINEL}&utmMedium=${SENTINEL}m`;

function transactionEvent(): Record<string, any> {
  return {
    type: 'transaction',
    transaction: `GET /google${Q}`,
    contexts: {
      trace: {
        op: 'http.server',
        data: {
          'http.url': `http://auth:4001/google${Q}`,
          'http.target': `/google${Q}`,
          'url.full': `http://auth:4001/google${Q}`,
          'url.query': Q.slice(1),
          'http.query': Q.slice(1),
          'http.method': 'GET',
          'url.path': '/google',
        },
      },
    },
    spans: [
      {
        op: 'http.client',
        description: `GET http://gateway/api/auth/google${Q}`,
        data: {
          'http.url': `http://gateway/api/auth/google${Q}`,
          'http.target': `/api/auth/google${Q}`,
          'url.full': `http://gateway/api/auth/google${Q}`,
          'url.query': Q.slice(1),
          'http.query': Q.slice(1),
          'http.response.status_code': 302,
        },
      },
      {
        op: 'db.redis',
        description: 'set oauth:utm:abc [4 other arguments]',
        data: { 'db.system': 'redis' },
      },
    ],
    breadcrumbs: [
      {
        category: 'http',
        data: { url: `http://x/google${Q}`, 'http.query': Q.slice(1), method: 'GET' },
      },
    ],
    request: { url: `http://auth:4001/google${Q}`, query_string: Q.slice(1), method: 'GET' },
  };
}

function expectScrubbed(out: Record<string, any>): void {
  expect(JSON.stringify(out)).not.toContain(SENTINEL);
  expect(JSON.stringify(out)).not.toContain('utmSource');

  expect(out.transaction).toBe('GET /google');
  const trace = out.contexts.trace.data;
  expect(trace['http.url']).toBe('http://auth:4001/google');
  expect(trace['http.target']).toBe('/google');
  expect(trace['url.full']).toBe('http://auth:4001/google');
  expect(trace).not.toHaveProperty('url.query');
  expect(trace).not.toHaveProperty('http.query');
  expect(trace['http.method']).toBe('GET');
  expect(trace['url.path']).toBe('/google');

  const [http, redis] = out.spans;
  expect(http.description).toBe('GET http://gateway/api/auth/google');
  expect(http.data['http.url']).toBe('http://gateway/api/auth/google');
  expect(http.data['http.target']).toBe('/api/auth/google');
  expect(http.data['url.full']).toBe('http://gateway/api/auth/google');
  expect(http.data).not.toHaveProperty('url.query');
  expect(http.data).not.toHaveProperty('http.query');
  expect(http.data['http.response.status_code']).toBe(302);
  expect(redis.description).toBe('set oauth:utm:abc [4 other arguments]');

  const crumb = out.breadcrumbs[0].data;
  expect(crumb.url).toBe('http://x/google');
  expect(crumb).not.toHaveProperty('http.query');
  expect(crumb.method).toBe('GET');

  expect(out.request.url).toBe('http://auth:4001/google');
  expect(out.request).not.toHaveProperty('query_string');
}

describe('T-242 Sentry init options scrub query strings from transactions', () => {
  const saved = process.env.SENTRY_DSN;
  let options: { beforeSend: Hook; beforeSendTransaction: Hook };

  beforeAll(async () => {
    jest.resetModules();
    process.env.SENTRY_DSN = 'https://key@example.invalid/1';
    await import('../config/sentry');
    const sentry = await import('@sentry/node');
    const init = sentry.init as unknown as jest.Mock;
    expect(init).toHaveBeenCalledTimes(1);
    options = init.mock.calls[0][0];
  });

  afterAll(() => {
    if (saved === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = saved;
    jest.resetModules();
  });

  it('beforeSendTransaction: no tag in trace data, spans, breadcrumbs or the transaction name', () => {
    expectScrubbed(options.beforeSendTransaction(transactionEvent()));
  });

  it('beforeSend (error events) cuts the same places', () => {
    const event = { ...transactionEvent(), type: undefined, message: 'boom' };
    expectScrubbed(options.beforeSend(event, {}));
  });

  it('events with no query string pass unchanged', () => {
    const clean = {
      transaction: 'GET /health',
      contexts: { trace: { data: { 'http.url': 'http://a/health', 'http.target': '/health' } } },
      spans: [{ op: 'http.client', description: 'GET http://a/health', data: {} }],
      breadcrumbs: [{ category: 'http', data: { url: 'http://a/health' } }],
    };
    expect(options.beforeSendTransaction(JSON.parse(JSON.stringify(clean)))).toEqual(clean);
  });

  it('an event with no trace, spans or breadcrumbs does not throw', () => {
    expect(options.beforeSendTransaction({ transaction: 'GET /x' })).toEqual({
      transaction: 'GET /x',
    });
    expect(
      options.beforeSendTransaction({ contexts: { trace: {} }, spans: [{}], breadcrumbs: [{}] }),
    ).toBeTruthy();
  });

  it('a non-http span name that contains a "?" is left alone', () => {
    const out = options.beforeSendTransaction({
      spans: [{ op: 'db.query', description: 'select ? from t', data: {} }],
    });
    expect(out.spans[0].description).toBe('select ? from t');
  });
});

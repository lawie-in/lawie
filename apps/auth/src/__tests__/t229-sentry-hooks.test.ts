/**
 * T-229 AC3 (auth): authorization, cookie, x-internal-secret and x-user-* headers are stripped
 * from an error event (beforeSend) and a transaction event (beforeSendTransaction), through the
 * options the real config/sentry.ts passes to Sentry.init. AC6: a reset token in the URL never
 * survives.
 */
type Hook = (event: any, hint?: any) => any;

const TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
const SECRET = 'shh-internal-secret-value-123';

function loadOptions(): { beforeSend: Hook; beforeSendTransaction: Hook } {
  const init = jest.fn();
  jest.resetModules();
  jest.doMock('@sentry/node', () => ({ init, httpIntegration: jest.fn(() => 'http') }));
  const saved = process.env.SENTRY_DSN;
  process.env.SENTRY_DSN = 'https://key@example.invalid/1';
  try {
    jest.isolateModules(() => {
      require('../config/sentry');
    });
  } finally {
    if (saved === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = saved;
    jest.dontMock('@sentry/node');
  }
  expect(init).toHaveBeenCalledTimes(1);
  return init.mock.calls[0][0];
}

function request() {
  return {
    method: 'GET',
    url: `http://gateway/api/auth/reset-password/${TOKEN}?x=1`,
    query_string: 'x=1',
    cookies: { sid: 'cookie-secret' },
    data: { password: 'hunter2' },
    headers: {
      host: 'lawie.in',
      'user-agent': 'jest',
      accept: 'application/json',
      'content-type': 'application/json',
      'content-length': '5',
      authorization: 'Bearer jwt-secret',
      cookie: 'sid=cookie-secret',
      'x-internal-secret': SECRET,
      'x-user-email': 'priya@example.com',
      'x-user-name': 'Priya Sharma',
      'x-user-id': 'u1',
    },
  };
}

describe('T-229 auth Sentry hooks', () => {
  const opts = loadOptions();
  const FORBIDDEN = [
    'authorization',
    'cookie',
    'x-internal-secret',
    'x-user-email',
    'x-user-name',
    'x-user-id',
  ];

  it.each([
    ['beforeSend (error event)', () => opts.beforeSend],
    ['beforeSendTransaction (transaction event)', () => opts.beforeSendTransaction],
  ])('%s strips credential and user headers, body, cookies, token', (_n, get) => {
    const hook = get();
    const base = request();
    const event = _n.startsWith('beforeSendTransaction')
      ? {
          type: 'transaction',
          transaction: `POST /api/auth/reset-password/${TOKEN}?x=1`,
          request: base,
          breadcrumbs: [
            {
              message: `GET /api/auth/reset-password/${TOKEN}`,
              data: { url: `/api/auth/reset-password/${TOKEN}?a=b` },
            },
          ],
        }
      : {
          message: 'boom',
          exception: { values: [{ type: 'Error', value: 'bad' }] },
          request: base,
          breadcrumbs: [
            {
              message: `GET /api/auth/reset-password/${TOKEN}`,
              data: { url: `/api/auth/reset-password/${TOKEN}?a=b` },
            },
          ],
        };
    const out = hook(event);
    const headers = Object.keys(out.request.headers);
    for (const h of FORBIDDEN) expect(headers).not.toContain(h);
    expect(headers.sort()).toEqual([
      'accept',
      'content-length',
      'content-type',
      'host',
      'user-agent',
    ]);
    expect(out.request).not.toHaveProperty('data');
    expect(out.request).not.toHaveProperty('cookies');
    expect(out.request).not.toHaveProperty('query_string');
    expect(out.request.url).toBe('http://gateway/api/auth/reset-password/[token]');
    const json = JSON.stringify(out);
    for (const s of [
      SECRET,
      'priya@example.com',
      'Priya Sharma',
      'jwt-secret',
      'cookie-secret',
      'hunter2',
      TOKEN,
    ]) {
      expect(json).not.toContain(s);
    }
    expect(out.breadcrumbs[0].data.url).toBe('/api/auth/reset-password/[token]');
    if (out.transaction) expect(out.transaction).toBe('POST /api/auth/reset-password/[token]');
  });
});

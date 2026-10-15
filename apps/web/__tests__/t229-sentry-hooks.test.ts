// T-229 AC3 (web): server and edge Sentry configs strip credential/user headers from error and
// transaction events, and mask a reset/review token in the URL, through the real init options.
export {};
const mockInit = jest.fn();
jest.mock('@sentry/nextjs', () => ({ init: (...args: unknown[]) => mockInit(...args) }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Hook = (event: Any) => Any;
const TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

async function load(file: 'server' | 'edge') {
  mockInit.mockClear();
  jest.resetModules();
  if (file === 'server') await import('../sentry.server.config');
  else await import('../sentry.edge.config');
  return mockInit.mock.calls[0][0] as { beforeSend: Hook; beforeSendTransaction: Hook };
}

describe.each(['server', 'edge'] as const)('T-229 web sentry.%s.config', (file) => {
  it.each(['beforeSend', 'beforeSendTransaction'] as const)('%s', async (name) => {
    const hook = (await load(file))[name];
    const out = hook({
      transaction: `GET /review/${TOKEN}?x=1`,
      request: {
        url: `https://lawie.in/review/${TOKEN}?x=1`,
        data: 'body',
        cookies: { s: 'c' },
        headers: {
          host: 'lawie.in',
          authorization: 'Bearer jwt-secret',
          cookie: 's=c',
          'x-internal-secret': 'shh-secret',
          'x-user-email': 'priya@example.com',
          'x-user-name': 'Priya Sharma',
        },
      },
      breadcrumbs: [{ message: `GET /review/${TOKEN}`, data: { url: `/review/${TOKEN}?a=b` } }],
      contexts: { nextjs: { request_path: `/review/${TOKEN}?a=b` } },
    });
    expect(Object.keys(out.request.headers)).toEqual(['host']);
    expect(out.request).not.toHaveProperty('data');
    expect(out.request).not.toHaveProperty('cookies');
    expect(out.request.url).toBe('https://lawie.in/review/[token]');
    expect(out.transaction).toBe('GET /review/[token]');
    expect(out.contexts.nextjs.request_path).toBe('/review/[token]');
    const json = JSON.stringify(out);
    for (const s of ['jwt-secret', 'shh-secret', 'priya@example.com', 'Priya Sharma', TOKEN]) {
      expect(json).not.toContain(s);
    }
  });
});

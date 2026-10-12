/**
 * T-223 Arjun condition 3: the gateway never reaches /internal/*. Any path with an `internal`
 * segment gets the plain gateway 404 before every proxy and is never forwarded, whatever the
 * casing, encoding or slash style. Ordinary routes, and `internal` outside the path, are
 * unaffected.
 *
 * Real local upstreams (one per service) record every request that reaches them.
 */
import http from 'http';
import type { AddressInfo } from 'net';

jest.mock('ioredis', () => require('ioredis-mock'));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let app: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let hasInternalSegment: (u: string) => boolean;

type Hit = { service: string; url: string };
const hits: Hit[] = [];
const upstreams: http.Server[] = [];
let gateway: http.Server;
let gatewayPort: number;

async function startUpstream(service: string): Promise<number> {
  const s = http.createServer((req, res) => {
    hits.push({ service, url: req.url ?? '' });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"from":"upstream"}');
  });
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  upstreams.push(s);
  return (s.address() as AddressInfo).port;
}

/** Raw request, so the path reaches the server byte for byte (no client-side normalising). */
function raw(
  path: string,
  method = 'GET',
): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: gatewayPort, method, path, headers: { connection: 'close' } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
            headers: res.headers,
          }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
}

beforeAll(async () => {
  process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${await startUpstream('auth')}`;
  process.env.DRAFTING_SERVICE_URL = `http://127.0.0.1:${await startUpstream('drafting')}`;
  process.env.BILLING_SERVICE_URL = `http://127.0.0.1:${await startUpstream('billing')}`;
  jest.resetModules();
  const mod = await import('../app');
  app = mod.default;
  hasInternalSegment = mod.hasInternalSegment;
  gateway = http.createServer(app);
  await new Promise<void>((r) => gateway.listen(0, '127.0.0.1', r));
  gatewayPort = (gateway.address() as AddressInfo).port;
});
afterAll(async () => {
  await new Promise((r) => gateway.close(r));
  await Promise.all(upstreams.map((s) => new Promise((r) => s.close(r))));
});
beforeEach(() => {
  hits.length = 0;
});

const BLOCKED: Array<[string, string]> = [
  ['auth mint route', '/api/auth/internal/verify-email/mint'],
  ['drafting grant-bonus (existing hole)', '/api/drafting/internal/grant-bonus'],
  ['billing internal', '/api/billing/internal/anything'],
  ['T-115c erase-user', '/api/auth/internal/erase-user'],
  ['upper-case path', '/API/AUTH/INTERNAL/x'],
  ['mixed-case segment', '/api/auth/InTeRnAl/verify-email/mint'],
  ['encoded slashes', '/api/auth%2Finternal%2Fverify-email%2Fmint'],
  ['encoded slashes, upper-case hex', '/api/auth/%2Finternal%2F'],
  ['encoded slashes, lower-case hex', '/api/auth/%2finternal%2fx'],
  ['double-encoded slash', '/api/auth%252Finternal%252Fx'],
  ['triple-encoded slash', '/api/auth%25252Finternal%25252Fx'],
  ['encoded letter in the segment', '/api/auth/%69nternal/x'],
  ['double-encoded letter', '/api/auth/%2569nternal/x'],
  ['backslash', '/api/auth\\internal\\verify-email\\mint'],
  ['encoded backslash', '/api/auth/%5Cinternal%5Cx'],
  ['path parameter on the segment', '/api/auth/internal;x=1/verify-email/mint'],
  ['encoded path parameter', '/api/auth/internal%3Bx/mint'],
  ['trailing segment, no slash after', '/api/auth/internal'],
  ['trailing slash', '/api/auth/internal/'],
  ['dot segment before', '/api/auth/./internal/x'],
  ['double slash', '/api/auth//internal/x'],
  ['segment hidden behind a query', '/api/auth/internal/x?token=1'],
  ['undecodable bytes then internal', '/api/auth/%E0%A4%A/internal/x'],
  ['undecodable bytes, encoded slashes', '/api/auth/%E0%A4%A%2Finternal%2Fx'],
  ['internal under a public mount', '/api/sections/internal/x'],
  ['internal under courts', '/api/courts/internal/x'],
  ['internal under samples', '/api/samples/internal/x'],
  ['internal under billing plans', '/api/billing/plans/internal/x'],
];

describe('T-223 gateway: /internal/ is never reachable', () => {
  it.each(BLOCKED)('%s: 404 from the gateway, never proxied', async (_label, path) => {
    for (const method of ['GET', 'POST']) {
      const res = await raw(path, method);
      expect(res.status).toBe(404);
      expect(JSON.parse(res.body)).toEqual({ error: 'Route not found', service: 'gateway' });
    }
    expect(hits).toEqual([]);
  });

  it('is a 404, not a 401: it fires before the auth chain too', async () => {
    const res = await raw('/api/drafting/internal/grant-bonus', 'POST');
    expect(res.status).toBe(404);
    expect(res.status).not.toBe(401);
  });

  it('other methods are refused as well', async () => {
    for (const m of ['PUT', 'DELETE', 'PATCH']) {
      const res = await raw('/api/auth/internal/verify-email/mint', m);
      expect(res.status).toBe(404);
    }
    expect(hits).toEqual([]);
  });

  it('a CORS preflight (answered by the cors layer ahead of the rule) is never proxied', async () => {
    await raw('/api/auth/internal/verify-email/mint', 'OPTIONS');
    expect(hits).toEqual([]);
  });

  it('a client-sent secret header does not change anything', async () => {
    const res = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: gatewayPort,
          method: 'POST',
          path: '/api/auth/internal/verify-email/mint',
          headers: { 'x-internal-secret': 'test-internal-secret-at-least-16' },
        },
        (r) => {
          r.resume();
          resolve(r.statusCode ?? 0);
        },
      );
      req.on('error', reject);
      req.end('{}');
    });
    expect(res).toBe(404);
    expect(hits).toEqual([]);
  });
});

describe('T-223 gateway: ordinary traffic is unaffected', () => {
  it.each([
    ['/api/auth/me'],
    ['/api/auth/login'],
    ['/api/auth/google/callback?state=x'],
    ['/api/auth/verify-email'],
    ['/api/sections/map'],
    ['/api/courts/list'],
  ])('%s is proxied', async (path) => {
    const res = await raw(path);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ from: 'upstream' });
    expect(hits).toHaveLength(1);
  });

  it('a query string containing "internal" is not checked', async () => {
    for (const path of [
      '/api/auth/me?next=/internal/x',
      '/api/auth/google?redirect=%2Finternal%2Fx',
      '/api/auth/me?internal=1',
    ]) {
      hits.length = 0;
      const res = await raw(path);
      expect(res.status).toBe(200);
      expect(hits).toHaveLength(1);
    }
  });

  it('words that merely contain "internal" are not a segment', async () => {
    for (const path of [
      '/api/auth/internals',
      '/api/auth/my-internal/x',
      '/api/auth/internal-use/x',
      '/api/auth/x/internalize',
    ]) {
      hits.length = 0;
      const res = await raw(path);
      expect(res.status).toBe(200);
      expect(hits).toHaveLength(1);
    }
  });

  it('/health still answers', async () => {
    const res = await raw('/health');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).service).toBe('gateway');
  });

  it('an unknown ordinary route keeps the gateway 404 and reaches no upstream', async () => {
    const res = await raw('/nope');
    expect(res.status).toBe(404);
    expect(hits).toEqual([]);
  });
});

describe('T-223 gateway: hasInternalSegment', () => {
  it.each([
    '/internal',
    '/internal/',
    '/INTERNAL/x',
    '/a/internal/b',
    '/a\\internal\\b',
    '/a%2Finternal',
    '/a%252Finternal',
    '/a/internal;p=1/b',
    '/a/%ZZ/internal/b',
    '/a/internal/b?q=1#f',
  ])('true: %s', (u) => {
    expect(hasInternalSegment(u)).toBe(true);
  });

  it.each([
    '/',
    '/api/auth/me',
    '/internals',
    '/a/xinternal/b',
    '/a?x=/internal/y',
    '/a?x=%2Finternal',
    '/a#/internal/x',
    '/a/inter/nal',
  ])('false: %s', (u) => {
    expect(hasInternalSegment(u)).toBe(false);
  });

  it('does not log anything', async () => {
    const spies = (['log', 'info', 'warn', 'error'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => undefined),
    );
    await raw('/api/auth/internal/verify-email/mint?token=abcdef');
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });
});

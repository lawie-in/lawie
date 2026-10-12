import http from 'http';
import type { AddressInfo } from 'net';

import request from 'supertest';

jest.mock('ioredis', () => require('ioredis-mock'));

// T-315 — gateway: createJsonBodyErrorHandler is mounted, and because the gateway parses no
// bodies, a malformed body to a proxied route reaches the upstream untouched (no 400 from the
// gateway itself). The upstream is a real local http server on an ephemeral port; AUTH_SERVICE_URL
// is pointed at it before the app is imported.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let app: any;

const BAD = '{"email": "a@b.co", "password": "Sup3rS3cret!" oops}';

type Layer = { handle: (...a: unknown[]) => unknown };
const stack = (): Layer[] => (app as { _router: { stack: Layer[] } })._router.stack;

describe('T-315 gateway', () => {
  let upstream: http.Server;
  let received: { body: string; contentType?: string }[] = [];

  beforeAll(async () => {
    upstream = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        received.push({
          body: Buffer.concat(chunks).toString('utf8'),
          contentType: req.headers['content-type'],
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"from":"upstream"}');
      });
    });
    await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
    process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
    jest.resetModules();
    app = (await import('../app')).default;
  });
  afterAll(async () => {
    await new Promise((r) => upstream.close(r));
  });
  beforeEach(() => {
    received = [];
  });

  it('mounts a 4-arity error middleware that maps body-parser errors', () => {
    const handlers = stack()
      .map((l) => l.handle)
      .filter((h) => h.length === 4);
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const next = jest.fn();
    let mapped: unknown;
    for (const h of handlers) {
      status.mockClear();
      json.mockClear();
      (h as (...a: unknown[]) => void)(
        Object.assign(new Error('{"password":"Sup3rS3cret!"'), { type: 'entity.parse.failed' }),
        { method: 'POST', path: '/x' },
        { status },
        next,
      );
      if (status.mock.calls.length) {
        mapped = [status.mock.calls[0], json.mock.calls[0]];
        break;
      }
    }
    expect(mapped).toEqual([[400], [{ error: 'Bad Request' }]]);
  });

  it('passes an unrelated error on with next(err)', () => {
    const err = new Error('boom');
    const nexts: unknown[] = [];
    for (const h of stack()
      .map((l) => l.handle)
      .filter((h) => h.length === 4)) {
      (h as (...a: unknown[]) => void)(err, {}, { status: jest.fn() }, (e: unknown) =>
        nexts.push(e),
      );
    }
    expect(nexts.length).toBeGreaterThan(0);
    expect(nexts.every((e) => e === err)).toBe(true);
  });

  it('a malformed JSON body to a proxied route reaches the upstream unparsed, not a gateway 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(BAD);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ from: 'upstream' });
    expect(received).toHaveLength(1);
    expect(received[0].body).toBe(BAD);
    expect(received[0].contentType).toMatch(/application\/json/);
  });

  it('a >10mb body to a proxied route is forwarded, not 413 from the gateway', async () => {
    const big = 'x'.repeat(11 * 1024 * 1024);
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(big);
    expect(res.status).toBe(200);
    expect(received[0].body.length).toBe(big.length);
  });

  it('/health still returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});

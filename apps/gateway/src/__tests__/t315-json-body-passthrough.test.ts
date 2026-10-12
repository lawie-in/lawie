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

  // Finds ONLY the T-315 layer: the first 4-arity layer that answers 400 to a body-parser
  // entity.parse.failed error with a recording res and never calls next.
  const findT315Layer = () => {
    for (const l of stack().filter((x) => x.handle.length === 4)) {
      const json = jest.fn();
      const status = jest.fn(() => ({ json }));
      const next = jest.fn();
      try {
        l.handle(
          Object.assign(new Error('{"password":"Sup3rS3cret!"'), { type: 'entity.parse.failed' }),
          { method: 'POST', path: '/x' },
          { status },
          next,
        );
      } catch {
        continue;
      }
      if (status.mock.calls.length && !next.mock.calls.length) {
        return { layer: l.handle as (...a: unknown[]) => void, status, json };
      }
    }
    return undefined;
  };

  it('mounts a 4-arity error middleware that maps body-parser errors', () => {
    const found = findT315Layer();
    expect(found).toBeDefined();
    expect(found!.status.mock.calls).toEqual([[400]]);
    expect(found!.json.mock.calls).toEqual([[{ error: 'Bad Request' }]]);
  });

  it('the T-315 layer alone passes an unrelated error on with next(err)', () => {
    const found = findT315Layer();
    expect(found).toBeDefined();
    const err = new Error('boom');
    const next = jest.fn();
    const status = jest.fn();
    found!.layer(err, { method: 'GET', path: '/x' }, { status }, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(err);
    expect(status).not.toHaveBeenCalled();
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

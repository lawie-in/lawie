/**
 * T-436 (AC10): the gateway lets /api/billing/public/supplier through without auth, like /plans,
 * and nothing else new under /api/billing. Real gateway app, ioredis-mock, and a local HTTP
 * server standing in for billing so the path and headers that reach it can be read.
 */
import http from 'http';
import type { AddressInfo } from 'net';

import type { Express } from 'express';
import request from 'supertest';

jest.mock('ioredis', () => require('ioredis-mock'));
jest.mock('rate-limit-redis', () => ({
  __esModule: true,
  default: class {
    increment = async () => ({ totalHits: 1, resetTime: new Date(Date.now() + 60_000) });
    decrement = async () => undefined;
    resetKey = async () => undefined;
  },
}));

let upstream: http.Server;
let seen: Array<{ url?: string; headers: http.IncomingHttpHeaders }> = [];
let app: Express;

beforeAll(async () => {
  upstream = http.createServer((req, res) => {
    seen.push({ url: req.url, headers: req.headers });
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'public, max-age=3600');
    res.end(JSON.stringify({ gstin: 'FAKE', legalName: 'Fake' }));
  });
  await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
  process.env.BILLING_SERVICE_URL = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    app = require('../app').default;
  });
});

afterAll(async () => {
  await new Promise<void>((r) => upstream.close(() => r()));
});

beforeEach(() => {
  seen = [];
});

describe('gateway: /api/billing/public/supplier is public (T-436)', () => {
  it('passes through with no Authorization header, rewritten to billing /public/supplier', async () => {
    const res = await request(app).get('/api/billing/public/supplier');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ gstin: 'FAKE', legalName: 'Fake' });
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe('/public/supplier');
  });

  it("forwards billing's Cache-Control untouched", async () => {
    const res = await request(app).get('/api/billing/public/supplier');
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
  });

  it('adds no user identity to the upstream request (it is the public proxy, not authChain)', async () => {
    await request(app).get('/api/billing/public/supplier');
    expect(seen[0].headers['x-user-id']).toBeUndefined();
    expect(seen[0].headers['x-internal-secret']).toBeUndefined();
  });

  it('/api/billing/plans stays public too (the pattern it follows)', async () => {
    const res = await request(app).get('/api/billing/plans');
    expect(res.status).toBe(200);
    expect(seen[0].url).toBe('/plans');
  });
});

describe('gateway: only the exact supplier path is proxied (SF4)', () => {
  it.each([
    '/api/billing/public/supplier/x',
    '/api/billing/public/supplier/x/y',
    '/api/billing/public/supplier/..%2Finvoices',
  ])('%s is 404 and never reaches billing', async (path) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(404);
    expect(seen).toHaveLength(0);
  });

  // Not under the public mount (Express matches whole path segments), so it falls to the
  // authenticated /api/billing mount: 401 without a token, never proxied (not 404 as the
  // handoff expected; reported to the lead).
  it('/api/billing/public/supplierx is not public: 401 without a token and never reaches billing', async () => {
    const res = await request(app).get('/api/billing/public/supplierx');
    expect(res.status).toBe(401);
    expect(seen).toHaveLength(0);
  });

  it.each([
    ['/api/billing/public/supplier', '/public/supplier'],
    ['/api/billing/public/supplier/', '/public/supplier'],
    ['/api/billing/public/supplier?x=1', '/public/supplier?x=1'],
    ['/api/billing/public/supplier/?x=1', '/public/supplier?x=1'],
  ])('%s still passes (upstream sees %s)', async (path, upstreamUrl) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe(upstreamUrl);
  });
});

describe('gateway: everything else T-436 added under /api/billing stays behind auth', () => {
  it.each([
    '/api/billing/invoices',
    '/api/billing/invoices/507f1f77bcf86cd799439011/pdf',
    '/api/billing/admin/billing/invoices.csv?month=2026-10',
    '/api/billing/public/other',
    '/api/billing/public',
    '/api/billing/status',
  ])('%s without a token is 401 and never reaches billing', async (path) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(401);
    expect(seen).toHaveLength(0);
  });

  it('a made-up bearer token is 401 on /api/billing/invoices', async () => {
    const res = await request(app)
      .get('/api/billing/invoices')
      .set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
    expect(seen).toHaveLength(0);
  });
});

/**
 * T-196 AC5 (gateway half) — POST /api/auth/register through the gateway.
 *
 * Stub upstream: a real HTTP server on an ephemeral port records the exact body and path it
 * receives and replies with a canned auth-style response. The gateway must (a) forward the
 * request body unchanged to the upstream's /register, and (b) return the upstream's status and
 * body unchanged. It must not add, drop or rewrite `role` in either direction.
 *
 * The real auth behaviour (role forced to Client) is proven in
 * apps/auth/src/__tests__/register-role.test.ts. The real auth app cannot be loaded into the
 * gateway's ts-jest run: both apps augment Express.Request.jwtPayload with different types (TS2717).
 */

jest.mock('ioredis', () => require('ioredis-mock'));

import http from 'http';
import { AddressInfo } from 'net';

import supertest from 'supertest';

interface Seen {
  method?: string;
  url?: string;
  body: unknown;
}

let upstream: http.Server;
let seen: Seen[] = [];
let cannedStatus = 201;
let cannedBody: unknown = {};
let app: import('express').Express;

beforeAll(async () => {
  upstream = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      seen.push({ method: req.method, url: req.url, body: raw ? JSON.parse(raw) : undefined });
      res.writeHead(cannedStatus, { 'content-type': 'application/json' });
      res.end(JSON.stringify(cannedBody));
    });
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  app = require('../app').default;
});

afterAll(async () => {
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

beforeEach(() => {
  seen = [];
});

describe('T-196 AC5 — gateway passes register through unchanged', () => {
  it.each(['Admin', 'admin'])('role=%s: body reaches auth unchanged at /register', async (role) => {
    cannedStatus = 201;
    cannedBody = { status: 'success', data: { user: { role: 'Client' } } };
    const payload = { email: 'a@example.com', password: 'Passw0rdOk', name: 'A', role };

    const res = await supertest(app).post('/api/auth/register').send(payload);

    expect(res.status).toBe(201);
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe('POST');
    expect(seen[0].url).toBe('/register');
    expect(seen[0].body).toEqual(payload);
  });

  it('returns the upstream response unchanged (a Client user and token are not rewritten)', async () => {
    cannedStatus = 201;
    cannedBody = {
      status: 'success',
      data: {
        user: { id: 'u1', email: 'a@example.com', name: 'A', role: 'Client' },
        accessToken: 'access.token.value',
        refreshToken: 'refresh.token.value',
      },
    };

    const res = await supertest(app)
      .post('/api/auth/register')
      .send({ email: 'a@example.com', password: 'Passw0rdOk', name: 'A', role: 'Admin' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(cannedBody);
    expect(res.body.data.user.role).toBe('Client');
  });

  it('passes upstream error status and body through unchanged', async () => {
    cannedStatus = 409;
    cannedBody = { status: 'error', message: 'An account with this email already exists' };

    const res = await supertest(app)
      .post('/api/auth/register')
      .send({ email: 'a@example.com', password: 'Passw0rdOk', name: 'A', role: 'admin' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual(cannedBody);
  });

  it('register is public: no Authorization header is required to reach auth', async () => {
    cannedStatus = 201;
    cannedBody = { status: 'success' };
    const res = await supertest(app)
      .post('/api/auth/register')
      .send({ email: 'p@example.com', password: 'Passw0rdOk', name: 'P' });
    expect(res.status).toBe(201);
    expect(seen).toHaveLength(1);
  });
});

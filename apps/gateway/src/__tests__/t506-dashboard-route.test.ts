/**
 * T-506 — the gateway reaches GET /api/drafting/dashboard/summary through the /api/drafting
 * catch-all (no per-path allowlist): an authenticated call is proxied to the drafting service as
 * /dashboard/summary with the internal secret and the verified user id; an unauthenticated one
 * never reaches drafting. Real gateway app, ioredis-mock sessions, local http server as drafting.
 */
import crypto from 'crypto';
import http from 'http';
import type { AddressInfo } from 'net';

import { INTERNAL_HEADERS } from '@lawie/shared';
import type { Express } from 'express';
import jwt from 'jsonwebtoken';
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

const JWT_SECRET = process.env.JWT_SECRET as string;
const USER = 'user506';

let upstream: http.Server;
let seen: { url?: string; method?: string; headers: http.IncomingHttpHeaders }[] = [];
let gateway: Express;
let redisClient: { set: (...a: unknown[]) => Promise<unknown>; flushall: () => Promise<unknown> };

beforeAll(async () => {
  upstream = http.createServer((req, res) => {
    seen.push({ url: req.url, method: req.method, headers: req.headers });
    res.setHeader('content-type', 'application/json');
    res.end('{"from":"drafting"}');
  });
  await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
  process.env.DRAFTING_SERVICE_URL = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    gateway = require('../app').default;
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    redisClient = require('../config/redis').default;
  });
});

afterAll(async () => {
  await new Promise<void>((r) => upstream.close(() => r()));
});

beforeEach(() => {
  seen = [];
});

afterEach(async () => {
  await redisClient.flushall();
});

async function signedIn(): Promise<string> {
  const token = jwt.sign(
    {
      sub: USER,
      email: 'u@lawie.in',
      name: 'U',
      role: 'Client',
      plan: 'free',
      type: 'access',
      jti: crypto.randomUUID(),
    },
    JWT_SECRET,
    { expiresIn: '15m' },
  );
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  await redisClient.set(
    `session:${USER}:${hash}`,
    JSON.stringify({ refreshTokenHash: 'rh', createdAt: new Date().toISOString() }),
    'EX',
    900,
  );
  return token;
}

describe('T-506 gateway: /api/drafting/dashboard/summary', () => {
  it('proxies an authenticated GET to drafting as /dashboard/summary with the verified user', async () => {
    const token = await signedIn();
    const res = await request(gateway)
      .get('/api/drafting/dashboard/summary')
      .set('Authorization', `Bearer ${token}`)
      // a client-sent identity must not win over the verified token
      .set('x-user-id', 'someone-else');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ from: 'drafting' });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe('GET');
    expect(seen[0].url).toBe('/dashboard/summary');
    expect(seen[0].headers[INTERNAL_HEADERS.USER_ID]).toBe(USER);
    expect(seen[0].headers[INTERNAL_HEADERS.SECRET]).toBe(process.env.INTERNAL_SECRET);
  });

  it('an unauthenticated call is refused at the gateway and never reaches drafting', async () => {
    const res = await request(gateway).get('/api/drafting/dashboard/summary');
    expect(res.status).toBe(401);
    expect(seen).toHaveLength(0);
  });
});

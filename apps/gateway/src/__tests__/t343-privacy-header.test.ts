/**
 * T-343 (Arjun, 12 Oct 2026) — the gateway carries the accepted privacy version as the internal
 * header x-user-privacy-version, set from the VERIFIED `pv` claim only:
 *  - set from the claim on every authenticated proxy;
 *  - a client-sent copy is stripped / overwritten, whatever the token says;
 *  - no `pv` claim means no header (fails closed downstream);
 *  - devBypass sets pv = CURRENT_PRIVACY_VERSION; the production authChain has no devBypass.
 * Real gateway app, ioredis-mock for sessions, and a real local HTTP server standing in for the
 * drafting and billing services so the headers that actually reach them are read.
 */
import crypto from 'crypto';
import http from 'http';
import type { AddressInfo } from 'net';

import { CURRENT_PRIVACY_VERSION, INTERNAL_HEADERS } from '@lawie/shared';
import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

jest.mock('ioredis', () => require('ioredis-mock'));
// The production app builds a Redis-backed rate-limit store, which ioredis-mock cannot drive
// (no .call). Swap in a store that counts nothing; rate limiting is not under test here.
jest.mock('rate-limit-redis', () => ({
  __esModule: true,
  default: class {
    increment = async () => ({ totalHits: 1, resetTime: new Date(Date.now() + 60_000) });
    decrement = async () => undefined;
    resetKey = async () => undefined;
  },
}));

const JWT_SECRET = process.env.JWT_SECRET as string;
const PV_HEADER = INTERNAL_HEADERS.USER_PRIVACY_VERSION;
const USER = 'user343';

let upstream: http.Server;
let seen: http.IncomingHttpHeaders[] = [];
let drafting: Express;
let production: Express;
let development: Express;
let redisClient: { set: (...a: unknown[]) => Promise<unknown>; flushall: () => Promise<unknown> };

function loadApp(nodeEnv: string): Express {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = nodeEnv;
  let app!: Express;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    app = require('../app').default;
    if (nodeEnv === 'test') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      redisClient = require('../config/redis').default;
    }
  });
  process.env.NODE_ENV = previous;
  return app;
}

beforeAll(async () => {
  upstream = http.createServer((req, res) => {
    seen.push(req.headers);
    res.setHeader('content-type', 'application/json');
    res.end('{}');
  });
  await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  process.env.DRAFTING_SERVICE_URL = url;
  process.env.BILLING_SERVICE_URL = url;
  drafting = loadApp('test');
  production = loadApp('production');
  development = loadApp('development');
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

async function signedIn(claims: Record<string, unknown> = {}): Promise<string> {
  const token = jwt.sign(
    {
      sub: USER,
      email: 'u@lawie.in',
      name: 'U',
      role: 'Client',
      plan: 'free',
      type: 'access',
      jti: crypto.randomUUID(),
      ...claims,
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

const PROXIED_PATHS = [
  '/api/documents',
  '/api/templates',
  '/api/billing/plan/practice_monthly',
  '/api/drafting/admin/overview/kpis',
  '/api/users/me/bookmarks/sections',
  '/api/credits/balance',
];

describe('T-343 gateway: x-user-privacy-version from the verified pv claim', () => {
  it.each(PROXIED_PATHS)('%s: sets the header from the claim', async (path) => {
    const token = await signedIn({ pv: CURRENT_PRIVACY_VERSION });
    const res = await request(drafting).get(path).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0][PV_HEADER]).toBe(CURRENT_PRIVACY_VERSION);
    expect(seen[0]['x-user-id']).toBe(USER);
  });

  it('forwards an older claim as is, so the service can refuse it', async () => {
    const token = await signedIn({ pv: '2026-10-11' });
    await request(drafting).get('/api/documents').set('Authorization', `Bearer ${token}`);
    expect(seen[0][PV_HEADER]).toBe('2026-10-11');
  });

  it.each(PROXIED_PATHS)(
    '%s: a client-sent header never reaches the service (stale claim)',
    async (path) => {
      const token = await signedIn({ pv: '2026-10-11' });
      await request(drafting)
        .get(path)
        .set('Authorization', `Bearer ${token}`)
        .set(PV_HEADER, CURRENT_PRIVACY_VERSION);
      expect(seen[0][PV_HEADER]).toBe('2026-10-11');
    },
  );

  it.each(PROXIED_PATHS)(
    '%s: no pv claim means no header, even if the client sends one',
    async (path) => {
      const token = await signedIn();
      await request(drafting)
        .get(path)
        .set('Authorization', `Bearer ${token}`)
        .set(PV_HEADER, CURRENT_PRIVACY_VERSION);
      expect(seen).toHaveLength(1);
      expect(seen[0]).not.toHaveProperty(PV_HEADER);
      // The gateway still sets the other identity headers.
      expect(seen[0]['x-user-id']).toBe(USER);
    },
  );

  it('ignores a non-string pv claim (number, object, empty string)', async () => {
    for (const pv of [12, { v: CURRENT_PRIVACY_VERSION }, '']) {
      seen = [];
      const token = await signedIn({ pv });
      await request(drafting).get('/api/documents').set('Authorization', `Bearer ${token}`);
      expect(seen).toHaveLength(1);
      expect(seen[0]).not.toHaveProperty(PV_HEADER);
    }
  });

  it('a request with a client-sent header and no valid token is refused and reaches no service', async () => {
    const res = await request(drafting)
      .get('/api/documents')
      .set(PV_HEADER, CURRENT_PRIVACY_VERSION);
    expect(res.status).toBe(401);
    expect(seen).toHaveLength(0);
  });

  it('a forged token (wrong secret) with pv=current is refused', async () => {
    const forged = jwt.sign(
      {
        sub: USER,
        email: 'u@lawie.in',
        name: 'U',
        role: 'Client',
        plan: 'free',
        type: 'access',
        pv: CURRENT_PRIVACY_VERSION,
      },
      'x'.repeat(40),
    );
    const res = await request(drafting)
      .get('/api/documents')
      .set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
    expect(seen).toHaveLength(0);
  });

  it('a refresh-type token with pv=current is refused', async () => {
    const token = await signedIn({ pv: CURRENT_PRIVACY_VERSION, type: 'refresh' });
    const res = await request(drafting)
      .get('/api/documents')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(seen).toHaveLength(0);
  });
});

describe('T-343 gateway: devBypass pv', () => {
  it('sets pv = CURRENT_PRIVACY_VERSION for the dev user', async () => {
    const res = await request(development).get('/api/documents').set('X-Dev-Bypass', 'true');
    expect(res.status).toBe(200);
    expect(seen[0][PV_HEADER]).toBe(CURRENT_PRIVACY_VERSION);
  });

  it('overwrites a client-sent header on the dev bypass too', async () => {
    await request(development)
      .get('/api/billing/plan/practice_monthly')
      .set('X-Dev-Bypass', 'true')
      .set(PV_HEADER, '1999-01-01');
    expect(seen[0][PV_HEADER]).toBe(CURRENT_PRIVACY_VERSION);
  });

  it('without X-Dev-Bypass the development app still needs a real token', async () => {
    const res = await request(development).get('/api/documents');
    expect(res.status).toBe(401);
    expect(seen).toHaveLength(0);
  });
});

describe('T-343 gateway: the production authChain has no devBypass', () => {
  it.each(PROXIED_PATHS)('%s: X-Dev-Bypass: true is 401 and reaches no service', async (path) => {
    const res = await request(production)
      .get(path)
      .set('X-Dev-Bypass', 'true')
      .set('X-Dev-User-Id', '507f1f77bcf86cd799439011');
    expect(res.status).toBe(401);
    expect(seen).toHaveLength(0);
  });

  it('the test-mode app has no devBypass either', async () => {
    const res = await request(drafting).get('/api/documents').set('X-Dev-Bypass', 'true');
    expect(res.status).toBe(401);
    expect(seen).toHaveLength(0);
  });
});

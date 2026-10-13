/**
 * T-325 — auth routes must refuse revoked access tokens.
 *
 * authenticate = verify JWT, then require a live Redis session. No session -> 401,
 * Redis error -> 503 (fail closed). Only POST /logout may skip the session lookup.
 */

import './setupEnv';

jest.mock('ioredis', () => require('ioredis-mock'));

import './setupDb';

import fs from 'fs';
import path from 'path';

import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import supertest from 'supertest';

import app from '../app';
import redis from '../config/redis';
import { AuditLog } from '../models/AuditLog.model';
import { ReferralCode } from '../models/ReferralCode.model';
import { User } from '../models/User.model';
import { authenticate, authenticateAllowRevoked } from '../middleware/authenticate';
import { signAccessToken, signRefreshToken } from '../services/jwt.service';
import {
  createSession,
  deleteAllUserSessions,
  hashToken,
  validateSession,
} from '../services/session.service';

const ADMIN_ID = '507f1f77bcf86cd799439011';
const CLIENT_ID = '507f1f77bcf86cd799439012';
const OTHER_ID = '507f1f77bcf86cd799439013';

const REVOKED_MSG = 'Session expired or revoked. Please log in again.';
const UNAVAILABLE_MSG = 'Session service unavailable. Please try again shortly.';

type Role = 'Admin' | 'Client';

async function login(userId: string, role: Role = 'Admin'): Promise<string> {
  const claims = { sub: userId, email: `${userId}@lawie.in`, name: 'T325', role, plan: 'free' };
  const accessToken = signAccessToken(claims as Parameters<typeof signAccessToken>[0]);
  const refreshToken = signRefreshToken(claims as Parameters<typeof signRefreshToken>[0]);
  await createSession(userId, accessToken, refreshToken, {
    plan: 'free',
    email: claims.email,
    role,
    name: claims.name,
  });
  return accessToken;
}

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

interface RouteCase {
  name: string;
  call: (token: string) => supertest.Test;
  expectOk: number;
  handlerSpy: () => jest.SpyInstance;
}

const ROUTES: RouteCase[] = [
  {
    name: 'POST /admin/referral-codes',
    call: (t) => supertest(app).post('/admin/referral-codes').set(bearer(t)).send({}),
    expectOk: 201,
    handlerSpy: () => jest.spyOn(ReferralCode, 'create'),
  },
  {
    name: 'GET /admin/referral-codes',
    call: (t) => supertest(app).get('/admin/referral-codes').set(bearer(t)),
    expectOk: 200,
    handlerSpy: () => jest.spyOn(ReferralCode, 'find'),
  },
  {
    name: 'PATCH /admin/users/:id/status',
    call: (t) =>
      supertest(app)
        .patch(`/admin/users/${CLIENT_ID}/status`)
        .set(bearer(t))
        .send({ isActive: false }),
    expectOk: 200,
    handlerSpy: () => jest.spyOn(User, 'findByIdAndUpdate'),
  },
  {
    name: 'GET /admin/audit-log',
    call: (t) => supertest(app).get('/admin/audit-log').set(bearer(t)),
    expectOk: 200,
    handlerSpy: () => jest.spyOn(AuditLog, 'find'),
  },
];

beforeEach(async () => {
  await redis.flushall();
  await User.create({
    _id: new mongoose.Types.ObjectId(CLIENT_ID),
    email: 'c@lawie.in',
    name: 'C',
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('live token', () => {
  it.each(ROUTES)('passes on $name', async ({ call, expectOk }) => {
    const res = await call(await login(ADMIN_ID));
    expect(res.status).toBe(expectOk);
  });

  it.each(ROUTES)('role check still works on $name (Client -> 403)', async ({ call }) => {
    const res = await call(await login(CLIENT_ID, 'Client'));
    expect(res.status).toBe(403);
  });
});

describe('after deleteAllUserSessions', () => {
  it.each(ROUTES)('old token gets 401 on $name, handler not reached', async (r) => {
    const token = await login(ADMIN_ID);
    await deleteAllUserSessions(ADMIN_ID);
    const spy = r.handlerSpy();
    const res = await r.call(token);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe(REVOKED_MSG);
    expect(spy).not.toHaveBeenCalled();
  });

  it('a token issued after the revoke works again (only old ones are dead)', async () => {
    const oldToken = await login(ADMIN_ID);
    await deleteAllUserSessions(ADMIN_ID);
    const fresh = await login(ADMIN_ID);
    expect((await ROUTES[1].call(fresh)).status).toBe(200);
    expect((await ROUTES[1].call(oldToken)).status).toBe(401);
  });
});

describe('after logout', () => {
  it.each(ROUTES)('old token gets 401 on $name', async ({ call }) => {
    const token = await login(ADMIN_ID);
    const out = await supertest(app).post('/logout').set(bearer(token));
    expect(out.status).toBe(200);
    const res = await call(token);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe(REVOKED_MSG);
  });

  it('logging out one token leaves another live token of the same user working', async () => {
    const a = await login(ADMIN_ID);
    const b = await login(ADMIN_ID);
    await supertest(app).post('/logout').set(bearer(a));
    expect((await ROUTES[1].call(b)).status).toBe(200);
  });
});

describe('Redis failure fails closed', () => {
  it.each(ROUTES)('503 on $name when redis.get rejects, handler not reached', async (r) => {
    const token = await login(ADMIN_ID);
    jest.spyOn(redis, 'get').mockRejectedValue(new Error('ECONNRESET'));
    const spy = r.handlerSpy();
    const res = await r.call(token);
    expect(res.status).toBe(503);
    expect(res.body.message).toBe(UNAVAILABLE_MSG);
    expect(spy).not.toHaveBeenCalled();
  });

  it('503 when session data is corrupt JSON (validateSession throws)', async () => {
    const token = await login(ADMIN_ID);
    const key = (await redis.keys(`session:${ADMIN_ID}:*`))[0];
    await redis.set(key, '{not json');
    const res = await ROUTES[1].call(token);
    expect(res.status).toBe(503);
    expect(res.body.message).toBe(UNAVAILABLE_MSG);
  });
});

describe('JWT failures keep their existing 401 texts', () => {
  it('missing header', async () => {
    const res = await supertest(app).get('/admin/audit-log');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('No token provided. Please log in.');
  });

  it('non-Bearer scheme', async () => {
    const res = await supertest(app).get('/admin/audit-log').set('Authorization', 'Basic abc');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('No token provided. Please log in.');
  });

  it('garbage token', async () => {
    const res = await supertest(app).get('/admin/audit-log').set(bearer('garbage.jwt.value'));
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid token. Please log in again.');
  });

  it('refresh token used as access token', async () => {
    const refresh = signRefreshToken({
      sub: ADMIN_ID,
      email: 'a@lawie.in',
      name: 'A',
      role: 'Admin',
      plan: 'free',
    } as Parameters<typeof signRefreshToken>[0]);
    const res = await supertest(app).get('/admin/audit-log').set(bearer(refresh));
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid token. Please log in again.');
  });

  it('expired token, even with a live session', async () => {
    const expired = jwt.sign(
      {
        sub: ADMIN_ID,
        email: 'a@lawie.in',
        name: 'A',
        role: 'Admin',
        plan: 'free',
        type: 'access',
      },
      process.env.JWT_SECRET as string,
      { expiresIn: -10 },
    );
    await createSession(ADMIN_ID, expired, 'r-expired', {
      plan: 'free',
      email: 'a@lawie.in',
      role: 'Admin',
      name: 'A',
    });
    const res = await supertest(app).get('/admin/audit-log').set(bearer(expired));
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Your session has expired. Please log in again.');
  });

  it('JWT failures do not touch redis', async () => {
    const spy = jest.spyOn(redis, 'get');
    await supertest(app).get('/admin/audit-log').set(bearer('garbage'));
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('logout idempotency', () => {
  it('double logout is 200 twice; a garbage JWT is still 401', async () => {
    const token = await login(ADMIN_ID);
    const first = await supertest(app).post('/logout').set(bearer(token));
    const second = await supertest(app).post('/logout').set(bearer(token));
    const third = await supertest(app).post('/logout').set(bearer('garbage.jwt.value'));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(401);
    expect(third.body.message).toBe('Invalid token. Please log in again.');
  });

  it('logout with no header is still refused (401)', async () => {
    const res = await supertest(app).post('/logout');
    expect(res.status).toBe(401);
  });
});

describe('authenticateAllowRevoked is confined to /logout', () => {
  const srcRoot = path.join(__dirname, '..');
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(p);
      return p.endsWith('.ts') ? [p] : [];
    });

  it('is referenced only by its definition and the /logout route', () => {
    const users = walk(srcRoot)
      .filter((f) => fs.readFileSync(f, 'utf8').includes('authenticateAllowRevoked'))
      .map((f) => path.relative(srcRoot, f))
      .sort();
    expect(users).toEqual(['middleware/authenticate.ts', 'routes/auth.routes.ts']);
  });

  it('auth.routes.ts uses it on /logout and nowhere else', () => {
    const src = fs.readFileSync(path.join(srcRoot, 'routes/auth.routes.ts'), 'utf8');
    const uses = src
      .split('\n')
      .filter((l) => /authenticateAllowRevoked/.test(l) && /router\./.test(l));
    expect(uses).toHaveLength(1);
    expect(uses[0]).toContain("'/logout'");
    // T-343 (Arjun, Addendum 1): GET /me and POST /me/privacy-acceptance deliberately use the
    // session-checking authenticate; no other route in this file may use it (the intent of
    // this test is unchanged: only /logout accepts a revoked token).
    const plain = src
      .split('\n')
      .filter((l) => /router\.\w+\(/.test(l) && /\bauthenticate\b/.test(l))
      .map((l) => /router\.\w+\(\s*'([^']+)'/.exec(l)?.[1])
      .sort();
    // T-223: POST /verify-email/resend also needs a live session (the public /verify-email does not).
    expect(plain).toEqual(['/me', '/me/privacy-acceptance', '/verify-email/resend']);
  });

  it('every other router that guards routes uses the session-checking authenticate', () => {
    const routes = walk(path.join(srcRoot, 'routes')).filter((f) => !f.endsWith('auth.routes.ts'));
    for (const f of routes) {
      expect(fs.readFileSync(f, 'utf8')).not.toContain('authenticateAllowRevoked');
    }
  });

  it('GET /me-style behavior: only /logout accepts a revoked token', async () => {
    const token = await login(ADMIN_ID);
    await deleteAllUserSessions(ADMIN_ID);
    expect((await supertest(app).post('/logout').set(bearer(token))).status).toBe(200);
    expect((await ROUTES[3].call(token)).status).toBe(401);
  });
});

describe('req.jwtPayload on failure', () => {
  const mkReq = (token: string) =>
    ({ headers: { authorization: `Bearer ${token}` } }) as unknown as import('express').Request;
  const res = {} as import('express').Response;

  it('is cleared when the session is missing', async () => {
    const token = signAccessToken({
      sub: ADMIN_ID,
      email: 'a@lawie.in',
      name: 'A',
      role: 'Admin',
      plan: 'free',
    } as Parameters<typeof signAccessToken>[0]);
    const req = mkReq(token);
    const next = jest.fn();
    await authenticate(req, res, next);
    expect(req.jwtPayload).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 401, message: REVOKED_MSG });
  });

  it('is cleared when redis errors', async () => {
    const token = await login(ADMIN_ID);
    jest.spyOn(redis, 'get').mockRejectedValue(new Error('down'));
    const req = mkReq(token);
    const next = jest.fn();
    await authenticate(req, res, next);
    expect(req.jwtPayload).toBeUndefined();
    expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 503, message: UNAVAILABLE_MSG });
  });

  it('is set on success, and next() is called with no error', async () => {
    const token = await login(ADMIN_ID);
    const req = mkReq(token);
    const next = jest.fn();
    await authenticate(req, res, next);
    expect(req.jwtPayload?.sub).toBe(ADMIN_ID);
    expect(next).toHaveBeenCalledWith();
  });

  it('authenticateAllowRevoked sets the payload without a session', () => {
    const token = signAccessToken({
      sub: ADMIN_ID,
      email: 'a@lawie.in',
      name: 'A',
      role: 'Admin',
      plan: 'free',
    } as Parameters<typeof signAccessToken>[0]);
    const req = mkReq(token);
    const next = jest.fn();
    authenticateAllowRevoked(req, res, next);
    expect(req.jwtPayload?.sub).toBe(ADMIN_ID);
    expect(next).toHaveBeenCalledWith();
  });
});

describe('deleteAllUserSessions patterns', () => {
  it("removes all of a user's access and refresh keys and leaves another user's alone", async () => {
    const mine = [await login(ADMIN_ID), await login(ADMIN_ID), await login(ADMIN_ID)];
    const theirs = [await login(OTHER_ID), await login(OTHER_ID)];

    expect(await redis.keys(`session:${ADMIN_ID}:*`)).toHaveLength(3);
    expect(await redis.keys(`session:refresh:${ADMIN_ID}:*`)).toHaveLength(3);

    await deleteAllUserSessions(ADMIN_ID);

    expect(await redis.keys(`session:${ADMIN_ID}:*`)).toHaveLength(0);
    expect(await redis.keys(`session:refresh:${ADMIN_ID}:*`)).toHaveLength(0);
    for (const t of mine) expect(await validateSession(ADMIN_ID, hashToken(t))).toBeNull();

    expect(await redis.keys(`session:${OTHER_ID}:*`)).toHaveLength(2);
    expect(await redis.keys(`session:refresh:${OTHER_ID}:*`)).toHaveLength(2);
    for (const t of theirs) expect(await validateSession(OTHER_ID, hashToken(t))).not.toBeNull();
  });
});

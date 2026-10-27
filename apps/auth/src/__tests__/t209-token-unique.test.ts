/**
 * T-209 — every token carries a unique jti, so register then login (or two logins) in the same
 * second no longer collide on the unique Session.jwtTokenHash.
 *
 * AC1: unique jti on access + refresh. AC2: register then login same second. AC3: two logins same
 * second, logout of one leaves the other. AC4: old-format (no jti) tokens still verify / refresh.
 */

import './setupEnv';

jest.mock('ioredis', () => jest.requireActual('ioredis-mock'));

import './setupDb';

import jwt from 'jsonwebtoken';
import supertest from 'supertest';

import app from '../app';
import redis from '../config/redis';
import { Session } from '../models/Session.model';
import { User } from '../models/User.model';
import {
  generateTokenPair,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../services/jwt.service';
import { createSession, hashToken } from '../services/session.service';

const PASSWORD = 'Passw0rdOk';
const claims = {
  sub: 'user-1',
  email: 'a@example.com',
  name: 'A',
  role: 'Client' as never,
  plan: 'free' as never,
};

/** Freeze the clock so every token gets an identical iat/exp. */
function freezeClock() {
  const now = Date.now();
  return jest.spyOn(Date, 'now').mockReturnValue(now);
}

afterEach(async () => {
  jest.restoreAllMocks();
  await redis.flushall();
});

describe('T-209 AC1 — unique jti', () => {
  it('two access tokens signed in the same second differ and carry distinct jti', () => {
    freezeClock();
    const a = signAccessToken(claims);
    const b = signAccessToken(claims);
    const da = jwt.decode(a) as jwt.JwtPayload;
    const db = jwt.decode(b) as jwt.JwtPayload;
    expect(da.iat).toBe(db.iat);
    expect(da.jti).toEqual(expect.any(String));
    expect(db.jti).toEqual(expect.any(String));
    expect(da.jti).not.toBe(db.jti);
    expect(a).not.toBe(b);
  });

  it('two refresh tokens signed in the same second differ and carry distinct jti', () => {
    freezeClock();
    const a = signRefreshToken(claims);
    const b = signRefreshToken(claims);
    const da = jwt.decode(a) as jwt.JwtPayload;
    const db = jwt.decode(b) as jwt.JwtPayload;
    expect(da.iat).toBe(db.iat);
    expect(da.jti).toBeTruthy();
    expect(da.jti).not.toBe(db.jti);
    expect(a).not.toBe(b);
  });

  it('generateTokenPair: access and refresh both have jti, and pairs differ', () => {
    freezeClock();
    const p1 = generateTokenPair(claims);
    const p2 = generateTokenPair(claims);
    for (const t of [p1.accessToken, p1.refreshToken, p2.accessToken, p2.refreshToken]) {
      expect((jwt.decode(t) as jwt.JwtPayload).jti).toBeTruthy();
    }
    expect(p1.accessToken).not.toBe(p2.accessToken);
    expect(p1.refreshToken).not.toBe(p2.refreshToken);
  });

  it('new tokens still verify and keep type/claims', () => {
    const p = generateTokenPair(claims);
    expect(verifyAccessToken(p.accessToken)).toMatchObject({ sub: 'user-1', type: 'access' });
    expect(verifyRefreshToken(p.refreshToken)).toMatchObject({ sub: 'user-1', type: 'refresh' });
  });
});

describe('T-209 AC2 — register then login in the same second', () => {
  it('register is 202 with no session; two same-second logins give different tokens and two sessions', async () => {
    freezeClock();
    const email = 't209-reg-login@example.com';
    const reg = await supertest(app)
      .post('/register')
      .send({ email, password: PASSWORD, name: 'T' });
    const login = await supertest(app).post('/login').send({ email, password: PASSWORD });

    // T-522: register no longer signs in, so the two same-second sessions are two logins.
    expect(reg.status).toBe(202);
    expect(login.status).toBe(200);
    const login2 = await supertest(app).post('/login').send({ email, password: PASSWORD });
    expect(login2.status).toBe(200);
    expect(login2.body.data.accessToken).not.toBe(login.body.data.accessToken);
    expect(login2.body.data.refreshToken).not.toBe(login.body.data.refreshToken);

    const user = await User.findOne({ email });
    expect(await Session.countDocuments({ userId: user!._id })).toBe(2);
  });
});

describe('T-209 AC3 — two logins in the same second', () => {
  it('both succeed, both sessions valid, logout of one leaves the other', async () => {
    const email = 't209-two-logins@example.com';
    await supertest(app).post('/register').send({ email, password: PASSWORD, name: 'T' });
    const user = await User.findOne({ email });
    await Session.deleteMany({});
    await redis.flushall();

    freezeClock();
    const l1 = await supertest(app).post('/login').send({ email, password: PASSWORD });
    const l2 = await supertest(app).post('/login').send({ email, password: PASSWORD });
    expect(l1.status).toBe(200);
    expect(l2.status).toBe(200);
    const t1 = l1.body.data.accessToken as string;
    const t2 = l2.body.data.accessToken as string;
    expect(t1).not.toBe(t2);

    const key = (t: string) => `session:${user!._id}:${hashToken(t)}`;
    expect(await redis.exists(key(t1))).toBe(1);
    expect(await redis.exists(key(t2))).toBe(1);
    expect(await Session.countDocuments({ userId: user!._id })).toBe(2);

    const out = await supertest(app).post('/logout').set('Authorization', `Bearer ${t1}`);
    expect(out.status).toBeLessThan(300);

    expect(await redis.exists(key(t1))).toBe(0);
    expect(await redis.exists(key(t2))).toBe(1);
    expect(await Session.countDocuments({ userId: user!._id })).toBe(1);
    expect(await Session.countDocuments({ userId: user!._id, jwtTokenHash: hashToken(t2) })).toBe(
      1,
    );

    // the surviving refresh token still works
    const ref = await supertest(app)
      .post('/refresh')
      .send({ refreshToken: l2.body.data.refreshToken });
    expect(ref.status).toBe(200);
  });

  it('two concurrent logins in the same second both succeed', async () => {
    const email = 't209-concurrent@example.com';
    await supertest(app).post('/register').send({ email, password: PASSWORD, name: 'T' });
    freezeClock();
    const [a, b] = await Promise.all([
      supertest(app).post('/login').send({ email, password: PASSWORD }),
      supertest(app).post('/login').send({ email, password: PASSWORD }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.data.accessToken).not.toBe(b.body.data.accessToken);
  });
});

describe('T-209 AC4 — tokens signed the old way (no jti) still work', () => {
  const oldSign = (type: 'access' | 'refresh', sub: string) =>
    jwt.sign(
      { sub, email: 'old@example.com', name: 'Old', role: 'Client', plan: 'free', type },
      type === 'access' ? process.env.JWT_SECRET! : process.env.JWT_REFRESH_SECRET!,
      { expiresIn: type === 'access' ? '15m' : '7d', algorithm: 'HS256' },
    );

  it('old access token verifies, has no jti', () => {
    const t = oldSign('access', 'u');
    expect((jwt.decode(t) as jwt.JwtPayload).jti).toBeUndefined();
    expect(verifyAccessToken(t)).toMatchObject({ sub: 'u', type: 'access' });
  });

  it('old refresh token verifies', () => {
    expect(verifyRefreshToken(oldSign('refresh', 'u'))).toMatchObject({ type: 'refresh' });
  });

  it('old access token is accepted by the auth authenticate middleware (/logout)', async () => {
    const user = await User.create({
      email: 'old-logout@example.com',
      password: PASSWORD,
      name: 'Old',
    });
    const access = oldSign('access', user._id.toString());
    const refresh = oldSign('refresh', user._id.toString());
    await createSession(user._id.toString(), access, refresh, {
      plan: 'free',
      email: user.email,
      role: 'Client',
      name: 'Old',
    });
    const res = await supertest(app).post('/logout').set('Authorization', `Bearer ${access}`);
    expect(res.status).toBeLessThan(300);
    expect(await redis.exists(`session:${user._id}:${hashToken(access)}`)).toBe(0);
  });

  it('old-format refresh token still refreshes and rotates the old session', async () => {
    const user = await User.create({
      email: 'old-refresh@example.com',
      password: PASSWORD,
      name: 'Old',
    });
    const id = user._id.toString();
    const access = oldSign('access', id);
    const refresh = oldSign('refresh', id);
    await createSession(id, access, refresh, {
      plan: 'free',
      email: user.email,
      role: 'Client',
      name: 'Old',
    });

    const res = await supertest(app).post('/refresh').send({ refreshToken: refresh });
    expect(res.status).toBe(200);
    const { accessToken, refreshToken } = res.body.data;
    expect((jwt.decode(accessToken) as jwt.JwtPayload).jti).toBeTruthy();
    expect(refreshToken).not.toBe(refresh);
    // T-616b: the old access key is not deleted; it is cut to the 30 s grace window
    const oldTtl = await redis.ttl(`session:${id}:${hashToken(access)}`);
    expect(oldTtl).toBeGreaterThan(0);
    expect(oldTtl).toBeLessThanOrEqual(30);
    expect(await redis.exists(`session:${id}:${hashToken(accessToken)}`)).toBe(1);
    // the old-format refresh key now holds a grace record that dies within 30 s
    const grace = JSON.parse((await redis.get(`session:refresh:${id}:${hashToken(refresh)}`))!);
    expect(grace.g).toBe(1);
    expect(await redis.ttl(`session:refresh:${id}:${hashToken(refresh)}`)).toBeLessThanOrEqual(30);
  });
});

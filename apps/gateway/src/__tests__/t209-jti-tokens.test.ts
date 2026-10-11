/**
 * T-209 AC4/AC5 — the gateway accepts tokens with a jti (new) and without (old), as long as the
 * session exists in Redis.
 */
import crypto from 'crypto';

import jwt from 'jsonwebtoken';
import request from 'supertest';

jest.mock('ioredis', () => require('ioredis-mock'));

import app from '../app';
import redis from '../config/redis';

const JWT_SECRET = process.env.JWT_SECRET!;
const base = {
  sub: 'user123',
  email: 'test@test.com',
  name: 'Test',
  role: 'Client',
  plan: 'free',
  type: 'access',
};

function hashOf(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function seed(token: string): Promise<void> {
  await redis.set(
    `session:user123:${hashOf(token)}`,
    JSON.stringify({
      refreshTokenHash: 'rh',
      plan: 'free',
      email: 'test@test.com',
      role: 'Client',
      name: 'Test',
      createdAt: new Date().toISOString(),
    }),
    'EX',
    86400,
  );
}

const get = (t: string) => request(app).get('/api/documents').set('Authorization', `Bearer ${t}`);

describe('T-209 gateway — tokens with and without jti', () => {
  afterEach(async () => {
    await redis.flushall();
  });

  it('AC5: accepts a token carrying a jti (as auth now issues) when its session exists', async () => {
    const token = jwt.sign(base, JWT_SECRET, {
      expiresIn: '15m',
      algorithm: 'HS256',
      jwtid: crypto.randomUUID(),
    });
    await seed(token);
    const res = await get(token);
    expect(res.status).not.toBe(401);
  });

  it('AC5: two same-second jti tokens have independent sessions; revoking one leaves the other', async () => {
    const iat = Math.floor(Date.now() / 1000);
    const mk = () =>
      jwt.sign({ ...base, iat }, JWT_SECRET, {
        expiresIn: '15m',
        algorithm: 'HS256',
        jwtid: crypto.randomUUID(),
      });
    const a = mk();
    const b = mk();
    expect(a).not.toBe(b);
    await seed(a);
    await seed(b);
    expect((await get(a)).status).not.toBe(401);
    expect((await get(b)).status).not.toBe(401);

    await redis.del(`session:user123:${hashOf(a)}`);
    expect((await get(a)).status).toBe(401);
    expect((await get(b)).status).not.toBe(401);
  });

  it('AC4: accepts an old-format token (no jti) when its session exists', async () => {
    const token = jwt.sign(base, JWT_SECRET, { expiresIn: '15m', algorithm: 'HS256' });
    expect((jwt.decode(token) as jwt.JwtPayload).jti).toBeUndefined();
    await seed(token);
    const res = await get(token);
    expect(res.status).not.toBe(401);
  });

  it('AC4: old-format token without a session is still rejected by sessionCheck', async () => {
    const token = jwt.sign(base, JWT_SECRET, { expiresIn: '15m', algorithm: 'HS256' });
    const res = await get(token);
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Session expired or revoked');
  });
});

import crypto from 'crypto';

import jwt from 'jsonwebtoken';
import request from 'supertest';

// Mock Redis with ioredis-mock
jest.mock('ioredis', () => require('ioredis-mock'));

import app from '../app';
import redis from '../config/redis';

const JWT_SECRET = process.env.JWT_SECRET!;

function signToken(payload: Record<string, unknown> = {}): string {
  return jwt.sign(
    {
      sub: 'user_rl',
      email: 'rl@test.com',
      name: 'RLTest',
      role: 'Client',
      plan: 'free',
      type: 'access',
      ...payload,
    },
    JWT_SECRET,
    { expiresIn: '15m' },
  );
}

async function seedSession(token: string, userId: string): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await redis.set(
    `session:${userId}:${tokenHash}`,
    JSON.stringify({
      refreshTokenHash: 'rh',
      plan: 'free',
      email: 'rl@test.com',
      role: 'Client',
      name: 'RLTest',
      createdAt: new Date().toISOString(),
    }),
    'EX',
    86400,
  );
}

describe('Gateway — planRateLimiter middleware', () => {
  afterEach(async () => {
    await redis.flushall();
  });

  it('returns rate limit headers on authenticated requests', async () => {
    const token = signToken();
    await seedSession(token, 'user_rl');

    const res = await request(app).get('/api/documents').set('Authorization', `Bearer ${token}`);
    // Will be 502 (proxy) but should have rate limit headers
    expect(res.headers).toHaveProperty('ratelimit-limit');
  });

  it('uses different limits for free vs pro', async () => {
    const freeToken = signToken({ sub: 'free_user', plan: 'free' });
    await seedSession(freeToken, 'free_user');

    const proToken = signToken({ sub: 'pro_user', plan: 'pro' });
    const proHash = crypto.createHash('sha256').update(proToken).digest('hex');
    await redis.set(
      `session:pro_user:${proHash}`,
      JSON.stringify({
        refreshTokenHash: 'rh',
        plan: 'pro',
        email: 'pro@test.com',
        role: 'Client',
        name: 'Pro',
        createdAt: new Date().toISOString(),
      }),
      'EX',
      86400,
    );

    const freeRes = await request(app)
      .get('/api/documents')
      .set('Authorization', `Bearer ${freeToken}`);
    const proRes = await request(app)
      .get('/api/documents')
      .set('Authorization', `Bearer ${proToken}`);

    const freeLimit = parseInt(freeRes.headers['ratelimit-limit'], 10);
    const proLimit = parseInt(proRes.headers['ratelimit-limit'], 10);

    expect(freeLimit).toBe(60);
    expect(proLimit).toBe(300);
  });
});

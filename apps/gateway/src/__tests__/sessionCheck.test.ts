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
      sub: 'user123',
      email: 'test@test.com',
      name: 'Test',
      role: 'Client',
      plan: 'free',
      type: 'access',
      ...payload,
    },
    JWT_SECRET,
    { expiresIn: '15m' },
  );
}

describe('Gateway — sessionCheck middleware', () => {
  afterEach(async () => {
    await redis.flushall();
  });

  it('returns 401 when session does not exist in Redis', async () => {
    const token = signToken();
    const res = await request(app).get('/api/documents').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Session expired or revoked');
  });

  it('passes through when session exists in Redis', async () => {
    const token = signToken();

    // Compute the hash the same way the middleware does
    const crypto = await import('crypto');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Store session in Redis (simulates what auth service does on login)
    await redis.set(
      `session:user123:${tokenHash}`,
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

    const res = await request(app).get('/api/documents').set('Authorization', `Bearer ${token}`);
    // Should NOT be 401 — will be 502 (proxy error) since drafting service isn't running
    expect(res.status).not.toBe(401);
  });
});

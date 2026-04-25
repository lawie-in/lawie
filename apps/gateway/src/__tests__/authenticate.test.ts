import jwt from 'jsonwebtoken';
import request from 'supertest';

// Mock Redis — gateway authenticate middleware doesn't use Redis directly,
// but app.ts imports modules that do. Mock before importing app.
jest.mock('ioredis', () => require('ioredis-mock'));

import app from '../app';

const JWT_SECRET = process.env.JWT_SECRET!;

function signToken(
  payload: Record<string, unknown> = {},
  secret = JWT_SECRET,
  options: jwt.SignOptions = { expiresIn: '15m' },
): string {
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
    secret,
    options,
  );
}

describe('Gateway — authenticate middleware', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app).get('/api/documents');
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('No token provided');
  });

  it('returns 401 when Authorization header is malformed', async () => {
    const res = await request(app).get('/api/documents').set('Authorization', 'Token abc');
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('No token provided');
  });

  it('returns 401 when token is invalid', async () => {
    const res = await request(app)
      .get('/api/documents')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid token');
  });

  it('returns 401 when token is expired', async () => {
    const token = signToken({}, JWT_SECRET, { expiresIn: '0s' });
    // Tiny delay to ensure expiry
    await new Promise((r) => setTimeout(r, 50));
    const res = await request(app).get('/api/documents').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('expired');
  });

  it('returns 401 when token type is refresh (not access)', async () => {
    const token = signToken({ type: 'refresh' });
    const res = await request(app).get('/api/documents').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Invalid token type');
  });

  it('allows public auth routes without JWT', async () => {
    // /api/auth/* routes should not require JWT — they are public.
    // The request will fail at proxy (no auth service running) but should NOT be 401.
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@b.com', password: '12345678' });
    // Should NOT be 401 — could be 502 (proxy error) since auth service isn't running
    expect(res.status).not.toBe(401);
  });
});

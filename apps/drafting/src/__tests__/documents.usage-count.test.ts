/**
 * T-003 §3.7 — a failed generation shouldn't use up a free user's monthly
 * allowance: both readers that count rows (GET /documents/usage and the
 * enforceFreeLimit middleware) must exclude status: 'failed'.
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import { enforceFreeLimit, FREE_TIER_MONTHLY_LIMIT } from '../middleware/enforceFreeLimit';
import { Generation } from '../models/Generation.model';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd799439011';

function internalHeaders(plan: 'free' | 'pro' = 'free') {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': USER_ID,
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test',
    'x-user-plan': plan,
    'x-user-role': 'Client',
  };
}

describe('GET /documents/usage — excludes failed rows', () => {
  it('only counts completed generations', async () => {
    await Generation.create([
      { userId: USER_ID, docType: 'bail_application', tokensUsed: 100, status: 'completed' },
      { userId: USER_ID, docType: 'bail_application', tokensUsed: 50, status: 'failed' },
      { userId: USER_ID, docType: 'bail_application', tokensUsed: 50, status: 'failed' },
      // Pre-T-003 row, no status field — treated as completed.
      { userId: USER_ID, docType: 'bail_application', tokensUsed: 100 },
    ]);

    const res = await request(app).get('/usage').set(internalHeaders());

    expect(res.status).toBe(200);
    expect(res.body.used).toBe(2); // the 2 'completed'/undefined rows, not the 2 failed ones
  });
});

describe('enforceFreeLimit — excludes failed rows', () => {
  it('does not block when only failed attempts exist, even past the limit', async () => {
    const rows = Array.from({ length: FREE_TIER_MONTHLY_LIMIT + 2 }, () => ({
      userId: USER_ID,
      docType: 'bail_application' as const,
      tokensUsed: 10,
      status: 'failed' as const,
    }));
    await Generation.create(rows);

    const mockReq = { jwtPayload: { sub: USER_ID, plan: 'free', role: 'Client' } } as any;
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as any;
    const mockNext = jest.fn();

    await enforceFreeLimit(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('still blocks once completed generations reach the limit', async () => {
    const rows = Array.from({ length: FREE_TIER_MONTHLY_LIMIT }, () => ({
      userId: USER_ID,
      docType: 'bail_application' as const,
      tokensUsed: 10,
      status: 'completed' as const,
    }));
    await Generation.create(rows);

    const mockReq = { jwtPayload: { sub: USER_ID, plan: 'free', role: 'Client' } } as any;
    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    } as any;
    const mockNext = jest.fn();

    await enforceFreeLimit(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(402);
    expect(mockNext).not.toHaveBeenCalled();
  });
});

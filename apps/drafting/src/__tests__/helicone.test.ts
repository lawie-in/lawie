/**
 * SCRUM-58 — Helicone integration tests.
 * Tests spend-cap middleware and Generation.costUsd field.
 */
import './setupEnv';
import './setupDb';

import mongoose from 'mongoose';

import { Generation } from '../models/Generation.model';
import { spendCapCheck } from '../middleware/spendCap';

const USER_ID = new mongoose.Types.ObjectId('000000000000000000000001');

// ---------------------------------------------------------------------------
// Generation model: costUsd field
// ---------------------------------------------------------------------------

describe('Generation model — costUsd', () => {
  it('stores costUsd from Helicone response', async () => {
    const gen = await Generation.create({
      userId: USER_ID,
      docType: 'bail_application',
      tokensUsed: 1500,
      costUsd: 0.0045,
    });

    expect(gen.costUsd).toBeCloseTo(0.0045, 4);
  });

  it('defaults costUsd to 0', async () => {
    const gen = await Generation.create({
      userId: USER_ID,
      docType: 'legal_notice',
      tokensUsed: 800,
    });

    expect(gen.costUsd).toBe(0);
  });

  it('aggregates daily spend per user', async () => {
    await Generation.create([
      { userId: USER_ID, docType: 'bail_application', tokensUsed: 1000, costUsd: 0.003 },
      { userId: USER_ID, docType: 'legal_notice', tokensUsed: 800, costUsd: 0.002 },
      { userId: USER_ID, docType: 'complaint', tokensUsed: 1200, costUsd: 0.004 },
    ]);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [result] = await Generation.aggregate([
      { $match: { userId: USER_ID, createdAt: { $gte: startOfDay } } },
      { $group: { _id: null, totalCost: { $sum: '$costUsd' } } },
    ]);

    expect(result.totalCost).toBeCloseTo(0.009, 4);
  });
});

// ---------------------------------------------------------------------------
// Spend-cap middleware
// ---------------------------------------------------------------------------

describe('spendCapCheck middleware', () => {
  it('calls next() without blocking (Phase 1 permissive)', async () => {
    // Create some generations to simulate spend
    await Generation.create([
      { userId: USER_ID, docType: 'bail_application', tokensUsed: 5000, costUsd: 7.0 }, // exceeds $6 cap
    ]);

    const mockReq = {
      jwtPayload: { sub: USER_ID, plan: 'free' },
    } as any;
    const mockRes = {} as any;
    const mockNext = jest.fn();

    // Spy on console.warn to verify logging
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await spendCapCheck(mockReq, mockRes, mockNext);

    // Must always call next (Phase 1 = permissive)
    expect(mockNext).toHaveBeenCalled();
    // Should have logged the breach (single template-literal arg)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[spend-cap] User'));

    warnSpy.mockRestore();
  });

  it('calls next() even without jwtPayload', async () => {
    const mockReq = {} as any;
    const mockRes = {} as any;
    const mockNext = jest.fn();

    await spendCapCheck(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  it('calls next() when under cap', async () => {
    await Generation.create({
      userId: USER_ID,
      docType: 'bail_application',
      tokensUsed: 500,
      costUsd: 0.001,
    });

    const mockReq = {
      jwtPayload: { sub: USER_ID, plan: 'free' },
    } as any;
    const mockRes = {} as any;
    const mockNext = jest.fn();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await spendCapCheck(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
    // Should NOT have warned for user spend
    const userWarnings = warnSpy.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('User'),
    );
    expect(userWarnings).toHaveLength(0);

    warnSpy.mockRestore();
  });
});

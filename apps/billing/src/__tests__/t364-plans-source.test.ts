// T-364: one source of plan data. GET /plans serves exactly PLANS from @lawie/shared, the same
// object the web pricing page reads at build time.
import './setupDb';
import request from 'supertest';
import { INK_PER_CYCLE, PLANS } from '@lawie/shared';

jest.mock('../config/razorpay', () => ({
  razorpay: { subscriptions: { create: jest.fn(), fetch: jest.fn() } },
}));

import { SUBSCRIPTION_PLANS } from '../config/credit-skus';
import app from '../app';

const IDS = ['solo_monthly', 'solo_yearly', 'pro_monthly', 'pro_yearly'] as const;

describe('T-364 plans single source', () => {
  it('pins the agreed prices and Ink once', () => {
    expect(IDS.map((id) => PLANS[id].priceInr)).toEqual([799, 7990, 1999, 19990]);
    expect(IDS.map((id) => PLANS[id].inkPerCycle)).toEqual([50, 50, 150, 150]);
    expect(IDS.map((id) => `${PLANS[id].tier}_${PLANS[id].cycle}`)).toEqual([...IDS]);
  });

  it('GET /plans subscriptions equal PLANS for all four SKUs, in order', async () => {
    const res = await request(app).get('/plans');
    expect(res.status).toBe(200);
    expect(res.body.subscriptions).toHaveLength(4);
    const served = (res.body.subscriptions as Array<Record<string, unknown>>).map((s) => ({
      id: s.id,
      tier: s.tier,
      cycle: s.cycle,
      priceInr: s.priceInr,
      inkPerCycle: s.inkPerCycle,
    }));
    expect(served).toEqual(IDS.map((id) => ({ id, ...PLANS[id] })));
  });

  it('GET /plans has no "unlimited" text', async () => {
    const res = await request(app).get('/plans');
    expect(JSON.stringify(res.body)).not.toMatch(/unlimited/i);
  });

  it('SUBSCRIPTION_PLANS values equal PLANS', () => {
    expect(SUBSCRIPTION_PLANS.map((p) => p.id)).toEqual([...IDS]);
    for (const p of SUBSCRIPTION_PLANS) {
      expect(p.tier).toBe(PLANS[p.id].tier);
      expect(p.cycle).toBe(PLANS[p.id].cycle);
      expect(p.priceInr).toBe(PLANS[p.id].priceInr);
      expect(p.inkPerCycle).toBe(PLANS[p.id].inkPerCycle);
    }
  });

  it('INK_PER_CYCLE equals PLANS inkPerCycle with exactly four keys', () => {
    expect(Object.keys(INK_PER_CYCLE).sort()).toEqual([...IDS].sort());
    for (const id of IDS) expect(INK_PER_CYCLE[id]).toBe(PLANS[id].inkPerCycle);
  });
});

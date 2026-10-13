// T-370 — fetchPlans reads billing's public catalogue and fails loudly, so the UI never
// falls back to a hard-coded price.
import { fetchPlans, formatPlanInk, formatPlanPrice, planName } from '../plans';

const mockApiFetch = jest.fn();
jest.mock('../apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

const res = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
const PRO = { id: 'pro_monthly', tier: 'pro', cycle: 'monthly', priceInr: 1999, inkPerCycle: 150 };

beforeEach(() => jest.clearAllMocks());

describe('T-370 fetchPlans', () => {
  it('requests /api/billing/plans and returns the catalogue', async () => {
    mockApiFetch.mockResolvedValue(res(200, { subscriptions: [PRO], topups: [] }));
    await expect(fetchPlans()).resolves.toEqual({ subscriptions: [PRO], topups: [] });
    expect(mockApiFetch).toHaveBeenCalledWith('/api/billing/plans');
  });

  it('defaults topups to []', async () => {
    mockApiFetch.mockResolvedValue(res(200, { subscriptions: [PRO] }));
    await expect(fetchPlans()).resolves.toEqual({ subscriptions: [PRO], topups: [] });
  });

  it('throws on a non-2xx response', async () => {
    mockApiFetch.mockResolvedValue(res(500, {}));
    await expect(fetchPlans()).rejects.toThrow('500');
  });

  it.each([[null], [{}], [{ subscriptions: 'nope' }]])('throws on a bad body %j', async (body) => {
    mockApiFetch.mockResolvedValue(res(200, body));
    await expect(fetchPlans()).rejects.toThrow('no subscriptions');
  });

  it('propagates a network error', async () => {
    mockApiFetch.mockRejectedValue(new Error('offline'));
    await expect(fetchPlans()).rejects.toThrow('offline');
  });
});

describe('T-370 plan label helpers', () => {
  const SOLO = { ...PRO, id: 'solo_monthly', tier: 'solo', priceInr: 799, inkPerCycle: 50 };
  const PRO_YEARLY = { ...PRO, id: 'pro_yearly', cycle: 'yearly', priceInr: 19990 };
  type Plan = Parameters<typeof planName>[0];

  it('planName capitalises the tier', () => {
    expect(planName(PRO as Plan)).toBe('Pro');
    expect(planName(SOLO as Plan)).toBe('Solo');
  });

  it('formatPlanPrice uses en-IN grouping and the cycle, long and short', () => {
    expect(formatPlanPrice(PRO as Plan)).toBe('₹1,999/month');
    expect(formatPlanPrice(PRO as Plan, true)).toBe('₹1,999/mo');
    expect(formatPlanPrice(PRO_YEARLY as Plan)).toBe('₹19,990/year');
    expect(formatPlanPrice(PRO_YEARLY as Plan, true)).toBe('₹19,990/yr');
    expect(formatPlanPrice(SOLO as Plan)).toBe('₹799/month');
  });

  it('formatPlanInk reports the monthly grant from the plan', () => {
    expect(formatPlanInk(PRO as Plan)).toBe('150 Ink/month');
    expect(formatPlanInk(SOLO as Plan)).toBe('50 Ink/month');
  });
});

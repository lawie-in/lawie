import {
  SUBSCRIPTION_PLANS,
  TOPUP_SKUS,
  findSubscriptionPlan,
  findTopupSku,
  findPlanByRazorpayId,
} from '../config/credit-skus';

describe('credit-skus catalog', () => {
  it('has 4 subscription plans', () => {
    expect(SUBSCRIPTION_PLANS).toHaveLength(4);
    const ids = SUBSCRIPTION_PLANS.map((p) => p.id);
    expect(ids).toEqual(['solo_monthly', 'solo_yearly', 'pro_monthly', 'pro_yearly']);
  });

  it('has 3 topup SKUs', () => {
    expect(TOPUP_SKUS).toHaveLength(3);
    expect(TOPUP_SKUS.map((t) => t.id)).toEqual(['topup_mini', 'topup_mid', 'topup_max']);
  });

  describe('findSubscriptionPlan', () => {
    it('returns the plan for a valid id', () => {
      const plan = findSubscriptionPlan('solo_monthly');
      expect(plan).toBeDefined();
      expect(plan!.tier).toBe('solo');
      expect(plan!.cycle).toBe('monthly');
      expect(plan!.inkPerCycle).toBe(50);
    });

    it('returns undefined for unknown id', () => {
      expect(findSubscriptionPlan('nonexistent')).toBeUndefined();
    });
  });

  describe('findTopupSku', () => {
    it('returns the SKU for a valid id', () => {
      const sku = findTopupSku('topup_mid');
      expect(sku).toBeDefined();
      expect(sku!.ink).toBe(10);
      expect(sku!.badge).toBe('POPULAR');
    });

    it('returns undefined for unknown id', () => {
      expect(findTopupSku('topup_999')).toBeUndefined();
    });
  });

  describe('findPlanByRazorpayId', () => {
    it('returns the plan matching the env var', () => {
      process.env.RAZORPAY_PLAN_PRO_MONTHLY = 'plan_test_pro_m';
      const plan = findPlanByRazorpayId('plan_test_pro_m');
      expect(plan).toBeDefined();
      expect(plan!.id).toBe('pro_monthly');
      delete process.env.RAZORPAY_PLAN_PRO_MONTHLY;
    });

    it('returns undefined when no env var matches', () => {
      expect(findPlanByRazorpayId('plan_does_not_exist')).toBeUndefined();
    });
  });
});

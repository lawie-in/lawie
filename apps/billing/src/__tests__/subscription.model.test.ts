import './setupDb';

import mongoose from 'mongoose';

import { Subscription } from '../models/Subscription.model';

describe('Subscription model', () => {
  const validSub = {
    userId: new mongoose.Types.ObjectId(),
    razorpaySubscriptionId: 'sub_TestSubscription123',
    status: 'active' as const,
    planType: 'monthly' as const,
    amount: 79900,
    currency: 'INR',
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  };

  it('creates a subscription with all fields', async () => {
    const sub = await Subscription.create(validSub);
    expect(sub.razorpaySubscriptionId).toBe('sub_TestSubscription123');
    expect(sub.status).toBe('active');
    expect(sub.planType).toBe('monthly');
    expect(sub.amount).toBe(79900);
    expect(sub.currency).toBe('INR');
    expect(sub.paymentHistory).toEqual([]);
  });

  it('rejects missing userId', async () => {
    await expect(
      Subscription.create({ ...validSub, userId: undefined, razorpaySubscriptionId: 'sub_2' }),
    ).rejects.toThrow();
  });

  it('rejects missing razorpaySubscriptionId', async () => {
    await expect(
      Subscription.create({ ...validSub, razorpaySubscriptionId: undefined }),
    ).rejects.toThrow();
  });

  it('enforces unique razorpaySubscriptionId', async () => {
    await Subscription.create(validSub);
    await expect(Subscription.create({ ...validSub })).rejects.toThrow(/duplicate key/i);
  });

  it('rejects invalid status', async () => {
    await expect(
      Subscription.create({ ...validSub, razorpaySubscriptionId: 'sub_3', status: 'invalid' }),
    ).rejects.toThrow(/is not a valid enum/);
  });

  it('stores payment history records', async () => {
    const sub = await Subscription.create({
      ...validSub,
      razorpaySubscriptionId: 'sub_with_payments',
      paymentHistory: [
        { paymentId: 'pay_abc123', amount: 79900, status: 'captured', paidAt: new Date() },
        { paymentId: 'pay_def456', amount: 79900, status: 'failed', paidAt: new Date() },
      ],
    });
    expect(sub.paymentHistory).toHaveLength(2);
    expect(sub.paymentHistory[0].paymentId).toBe('pay_abc123');
    expect(sub.paymentHistory[0].status).toBe('captured');
    expect(sub.paymentHistory[1].status).toBe('failed');
  });

  it('defaults planType to monthly', async () => {
    const sub = await Subscription.create({
      ...validSub,
      razorpaySubscriptionId: 'sub_default_plan',
      planType: undefined,
    });
    expect(sub.planType).toBe('monthly');
  });

  it('allows annual planType', async () => {
    const sub = await Subscription.create({
      ...validSub,
      razorpaySubscriptionId: 'sub_annual',
      planType: 'annual',
      amount: 699900,
    });
    expect(sub.planType).toBe('annual');
    expect(sub.amount).toBe(699900);
  });

  it('stores razorpayPlanId and razorpayCustomerId', async () => {
    const sub = await Subscription.create({
      ...validSub,
      razorpaySubscriptionId: 'sub_extra_fields',
      razorpayPlanId: 'plan_TestPlan',
      razorpayCustomerId: 'cust_TestCustomer',
    });
    expect(sub.razorpayPlanId).toBe('plan_TestPlan');
    expect(sub.razorpayCustomerId).toBe('cust_TestCustomer');
  });
});

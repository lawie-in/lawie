import mongoose from 'mongoose';

import { User } from '../models/User.model';
import { grantSubscriptionCredits, grantTopupCredits } from '../services/credit-grant.service';

import './setupDb';

describe('grantSubscriptionCredits', () => {
  it('sets subscriptionCredits, planTier, billingCycle and writes ledger row', async () => {
    const user = await User.create({ email: 'sub@test.com' });

    const granted = await grantSubscriptionCredits({
      userId: user._id.toString(),
      credits: 25,
      planTier: 'practice',
      billingCycle: 'monthly',
      razorpaySubscriptionId: 'sub_test123',
      amountInr: 79900,
    });

    expect(granted).toBe(25);

    const updated = await User.findById(user._id).lean();
    expect(updated!.subscriptionCredits).toBe(25);
    expect(updated!.planTier).toBe('practice');
    expect(updated!.billingCycle).toBe('monthly');
    expect(updated!.plan).toBe('pro');

    // Ledger row written
    const ledger = await mongoose.connection
      .db!.collection('creditledgers')
      .find({ userId: user._id, source: 'plan_renewal' })
      .toArray();
    expect(ledger).toHaveLength(1);
    expect(ledger[0].amount).toBe(25);
    expect(ledger[0].bucket).toBe('subscriptionCredits');
  });

  it('resets (not increments) subscriptionCredits on renewal', async () => {
    const user = await User.create({
      email: 'renew@test.com',
      subscriptionCredits: 10,
    });

    await grantSubscriptionCredits({
      userId: user._id.toString(),
      credits: 25,
      planTier: 'practice',
      billingCycle: 'monthly',
    });

    const updated = await User.findById(user._id).lean();
    // Should be 25 (set), not 35 (increment)
    expect(updated!.subscriptionCredits).toBe(25);
  });

  it('sets planRenewsAt when provided', async () => {
    const user = await User.create({ email: 'renew-date@test.com' });
    const renewDate = new Date('2026-07-01');

    await grantSubscriptionCredits({
      userId: user._id.toString(),
      credits: 50,
      planTier: 'firm',
      billingCycle: 'yearly',
      planRenewsAt: renewDate,
    });

    const updated = await User.findById(user._id).lean();
    expect(updated!.planRenewsAt).toEqual(renewDate);
  });

  it('returns 0 for invalid userId', async () => {
    const result = await grantSubscriptionCredits({
      userId: 'invalid',
      credits: 25,
      planTier: 'practice',
      billingCycle: 'monthly',
    });
    expect(result).toBe(0);
  });

  it('returns 0 for non-existent userId', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const result = await grantSubscriptionCredits({
      userId: fakeId,
      credits: 25,
      planTier: 'practice',
      billingCycle: 'monthly',
    });
    expect(result).toBe(0);
  });
});

describe('grantTopupCredits', () => {
  it('increments topupCredits and writes ledger row', async () => {
    const user = await User.create({ email: 'topup@test.com', topupCredits: 5 });

    const granted = await grantTopupCredits({
      userId: user._id.toString(),
      credits: 10,
      amountInr: 29900,
      razorpayOrderId: 'order_test456',
      razorpayPaymentId: 'pay_test789',
      topupSkuId: 'topup_10',
    });

    expect(granted).toBe(10);

    const updated = await User.findById(user._id).lean();
    expect(updated!.topupCredits).toBe(15); // 5 + 10 incremented

    const ledger = await mongoose.connection
      .db!.collection('creditledgers')
      .find({ userId: user._id, source: 'topup_purchase' })
      .toArray();
    expect(ledger).toHaveLength(1);
    expect(ledger[0].amount).toBe(10);
    expect(ledger[0].bucket).toBe('topupCredits');
  });

  it('returns 0 for invalid userId', async () => {
    const result = await grantTopupCredits({
      userId: 'bad',
      credits: 10,
      amountInr: 29900,
      razorpayOrderId: 'order_x',
      topupSkuId: 'topup_10',
    });
    expect(result).toBe(0);
  });

  it('returns 0 for non-existent userId', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const result = await grantTopupCredits({
      userId: fakeId,
      credits: 10,
      amountInr: 29900,
      razorpayOrderId: 'order_y',
      topupSkuId: 'topup_10',
    });
    expect(result).toBe(0);
  });
});

/**
 * T-438 (a): all nine Razorpay subscription statuses are valid in the model
 * (create and later save), anything else is still rejected.
 */
import './setupDb';

import mongoose from 'mongoose';

import {
  SUBSCRIPTION_STATUSES,
  Subscription,
  isSubscriptionStatus,
} from '../models/Subscription.model';

const NINE = [
  'created',
  'authenticated',
  'active',
  'pending',
  'halted',
  'paused',
  'cancelled',
  'completed',
  'expired',
];

let n = 0;
const base = (status: string) => ({
  userId: new mongoose.Types.ObjectId(),
  razorpaySubscriptionId: `sub_t438_${++n}`,
  status,
});

describe('SUBSCRIPTION_STATUSES', () => {
  it('is exactly the nine documented Razorpay statuses', () => {
    expect([...SUBSCRIPTION_STATUSES].sort()).toEqual([...NINE].sort());
    expect(SUBSCRIPTION_STATUSES).toHaveLength(9);
    expect(new Set(SUBSCRIPTION_STATUSES).size).toBe(9);
  });

  it('is the schema enum', () => {
    const path = Subscription.schema.path('status') as unknown as { enumValues: string[] };
    expect([...path.enumValues].sort()).toEqual([...NINE].sort());
  });
});

describe('isSubscriptionStatus', () => {
  it.each(NINE)('true for %s', (s) => expect(isSubscriptionStatus(s)).toBe(true));

  it.each([
    ['invalid', 'invalid'],
    ['frozen', 'frozen'],
    ['wrong case ACTIVE', 'ACTIVE'],
    ['wrong case Active', 'Active'],
    ['trailing space', 'active '],
    ['leading space', ' active'],
    ['empty string', ''],
    ['null', null],
    ['undefined', undefined],
    ['number', 1],
    ['boolean', true],
    ['object', { status: 'active' }],
    ['array holding a valid one', ['active']],
    ['inherited key name', 'constructor'],
    ['length', 'length'],
  ] as Array<[string, unknown]>)('false for %s', (_n, v) => {
    expect(isSubscriptionStatus(v)).toBe(false);
  });
});

describe('Subscription model - status', () => {
  it.each(NINE)('create saves status %s', async (status) => {
    const doc = await Subscription.create(base(status));
    expect(doc.status).toBe(status);
    const found = await Subscription.findById(doc._id).lean();
    expect(found!.status).toBe(status);
  });

  it.each(NINE)('a later save changes status to %s', async (status) => {
    const doc = await Subscription.create(base('created'));
    doc.status = status as never;
    await doc.save();
    expect((await Subscription.findById(doc._id).lean())!.status).toBe(status);
  });

  it.each(NINE)('an update with validators accepts %s', async (status) => {
    const doc = await Subscription.create(base('active'));
    await Subscription.updateOne({ _id: doc._id }, { $set: { status } }, { runValidators: true });
    expect((await Subscription.findById(doc._id).lean())!.status).toBe(status);
  });

  it('still rejects an invalid status on create', async () => {
    await expect(Subscription.create(base('invalid'))).rejects.toThrow(/status/);
  });

  it.each(['ACTIVE', 'frozen', ''])('still rejects %j on create', async (bad) => {
    await expect(Subscription.create(base(bad))).rejects.toThrow();
  });

  it('still rejects an invalid status on a later save, and keeps the old one stored', async () => {
    const doc = await Subscription.create(base('active'));
    doc.status = 'invalid' as never;
    await expect(doc.save()).rejects.toThrow(/status/);
    expect((await Subscription.findById(doc._id).lean())!.status).toBe('active');
  });

  it('still rejects an invalid status on an update with validators', async () => {
    const doc = await Subscription.create(base('active'));
    await expect(
      Subscription.updateOne(
        { _id: doc._id },
        { $set: { status: 'invalid' } },
        { runValidators: true },
      ),
    ).rejects.toThrow();
  });
});

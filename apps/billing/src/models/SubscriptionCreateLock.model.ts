/**
 * T-444c (Arjun, 15 Oct 2026): a per-user lock around createSubscription, so
 * two parallel calls cannot create two Razorpay subscriptions.
 *
 * One row per user while a create is in flight. Taking the lock is one insert:
 * the unique index on userId makes a second insert fail with E11000 (lock
 * held). The row is deleted in a finally once createSubscription is done. A
 * crash leaves the row until the TTL monitor removes it (expireAfterSeconds 60,
 * plus up to ~60s for the monitor's sweep): Arjun accepts that.
 *
 * Holds a user id and a timestamp only.
 */
import mongoose, { Document, Schema } from 'mongoose';

export interface ISubscriptionCreateLock extends Document {
  userId: mongoose.Types.ObjectId;
  createdAt: Date;
}

const SubscriptionCreateLockSchema = new Schema<ISubscriptionCreateLock>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    createdAt: { type: Date, required: true, default: () => new Date() },
  },
  { collection: 'subscriptioncreatelocks', versionKey: false },
);

SubscriptionCreateLockSchema.index({ userId: 1 }, { unique: true });
SubscriptionCreateLockSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 });

export const SubscriptionCreateLock =
  (mongoose.models['SubscriptionCreateLock'] as mongoose.Model<ISubscriptionCreateLock>) ||
  mongoose.model<ISubscriptionCreateLock>('SubscriptionCreateLock', SubscriptionCreateLockSchema);

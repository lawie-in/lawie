/**
 * T-527 (Arjun design (a), 21 Oct 2026): a durable marker that a
 * razorpay.subscriptions.create timed out for this user, so a sub may exist at
 * Razorpay with no local Subscription row.
 *
 * Written (upserted) by createSubscription on a create timeout. One marker per
 * user (unique userId); repeated timeouts keep the EARLIEST lockCreatedAt
 * ($min), so the Razorpay scan window always covers the first unknown create;
 * T-542: they also keep the LATEST one in lastLockCreatedAt ($max), which caps
 * the window's end.
 * Read and cleared by reconcileRazorpaySubscriptions, on the user's next
 * subscribe and from the reconcile sweep. No TTL: only a complete scan clears it.
 *
 * Holds ids, a plan SKU id and timestamps only.
 */
import mongoose, { Document, Schema } from 'mongoose';

export interface ISubscriptionReconcile extends Document {
  userId: mongoose.Types.ObjectId;
  /** When the per-user create lock of the timed-out create was taken. */
  lockCreatedAt: Date;
  /**
   * T-542 (Arjun): the LATEST lockCreatedAt of a timeout written to this
   * marker ($max). Bounds the scan window's end. Markers written before T-542
   * have none; readers fall back to lockCreatedAt.
   */
  lastLockCreatedAt?: Date;
  /** Plan SKU id the timed-out create asked for (e.g. 'solo_monthly'). */
  planId: string;
  createdAt: Date;
}

const SubscriptionReconcileSchema = new Schema<ISubscriptionReconcile>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    lockCreatedAt: { type: Date, required: true },
    lastLockCreatedAt: { type: Date },
    planId: { type: String, required: true },
    createdAt: { type: Date, required: true, default: () => new Date() },
  },
  { collection: 'subscriptionreconciles', versionKey: false },
);

SubscriptionReconcileSchema.index({ userId: 1 }, { unique: true });
SubscriptionReconcileSchema.index({ createdAt: 1 });

export const SubscriptionReconcile =
  (mongoose.models['SubscriptionReconcile'] as mongoose.Model<ISubscriptionReconcile>) ||
  mongoose.model<ISubscriptionReconcile>('SubscriptionReconcile', SubscriptionReconcileSchema);

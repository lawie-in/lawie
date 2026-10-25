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
 * subscribe and from the reconcile sweep. No TTL: only a complete scan clears it,
 * and (T-542) never while a paid orphan is left unadopted.
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
  /**
   * T-542 (Arjun): Razorpay sub ids of paid orphans already reported
   * reconcile_live_orphan_not_adopted for this marker ($addToSet). A later scan
   * logs them at warn only (no error log, no Sentry). Razorpay ids only.
   */
  reportedOrphanIds?: string[];
  /**
   * T-542: Razorpay sub ids of adopt targets already reported
   * reconcile_adopt_target_superseded for this marker ($addToSet); later scans
   * log them at warn only. Kept apart from reportedOrphanIds so an unpaid
   * target that is paid later still gets its not-adopted error. Ids only.
   */
  reportedSupersededIds?: string[];
  /**
   * T-542 (Arjun): set ($min, first time kept) when a scan left a paid orphan
   * unadopted and kept this marker. While set, createSubscription runs the
   * reconcile BEFORE its local checks (no checkout link reuse or checkout
   * cancel ahead of it). Cleared with the marker (deleted on a clean scan).
   */
  paidOrphanPendingAt?: Date;
}

const SubscriptionReconcileSchema = new Schema<ISubscriptionReconcile>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    lockCreatedAt: { type: Date, required: true },
    lastLockCreatedAt: { type: Date },
    planId: { type: String, required: true },
    createdAt: { type: Date, required: true, default: () => new Date() },
    // No default: absent until a paid orphan is first reported.
    reportedOrphanIds: { type: [String], default: undefined },
    reportedSupersededIds: { type: [String], default: undefined },
    paidOrphanPendingAt: { type: Date },
  },
  { collection: 'subscriptionreconciles', versionKey: false },
);

SubscriptionReconcileSchema.index({ userId: 1 }, { unique: true });
SubscriptionReconcileSchema.index({ createdAt: 1 });

export const SubscriptionReconcile =
  (mongoose.models['SubscriptionReconcile'] as mongoose.Model<ISubscriptionReconcile>) ||
  mongoose.model<ISubscriptionReconcile>('SubscriptionReconcile', SubscriptionReconcileSchema);

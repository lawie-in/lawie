import mongoose, { Document, Schema } from 'mongoose';

export interface ICouponUsage extends Document {
  couponId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  orderId: string;
  usedAt: Date;
}

const CouponUsageSchema = new Schema<ICouponUsage>(
  {
    couponId: { type: Schema.Types.ObjectId, ref: 'CouponCode', required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    orderId: { type: String, required: true },
    usedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

// Lookup index for the per-user count (not unique: maxUsesPerUser can be > 1).
// T-540: a free grant's per-user limit is race-free through its ledger claim
// row (`_id` coupon:<couponId>:<userId>:<n> in inkledger); its usage row
// carries that key as orderId.
CouponUsageSchema.index({ couponId: 1, userId: 1 });

export const CouponUsage = mongoose.model<ICouponUsage>('CouponUsage', CouponUsageSchema);

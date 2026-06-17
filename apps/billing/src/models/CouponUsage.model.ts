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

// Enforce per-user per-coupon limit at the DB layer when maxUsesPerUser === 1
CouponUsageSchema.index({ couponId: 1, userId: 1 });

export const CouponUsage = mongoose.model<ICouponUsage>('CouponUsage', CouponUsageSchema);

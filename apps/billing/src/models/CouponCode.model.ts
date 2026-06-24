import mongoose, { Document, Schema } from 'mongoose';

export interface ICouponCode extends Document {
  code: string;
  label: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  applicablePlans: string[];
  maxUses: number | null;
  maxUsesPerUser: number;
  uses: number;
  isActive: boolean;
  expiresAt: Date | null;
  razorpayOfferId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const CouponCodeSchema = new Schema<ICouponCode>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    label: { type: String, required: true, trim: true },
    discountType: { type: String, enum: ['percent', 'fixed'], required: true },
    discountValue: { type: Number, required: true, min: 1 },
    applicablePlans: { type: [String], default: [] },
    maxUses: { type: Number, default: null },
    maxUsesPerUser: { type: Number, default: 1, min: 1 },
    uses: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
    expiresAt: { type: Date, default: null },
    razorpayOfferId: { type: String, default: null },
  },
  { timestamps: true },
);

export const CouponCode = mongoose.model<ICouponCode>('CouponCode', CouponCodeSchema);

import mongoose, { Document, Schema } from 'mongoose';

// Minimal User model for billing service — only the fields billing needs to read/write.
// The auth service owns the full schema; both services share the same MongoDB collection.
// `strict: false` so auth-side schema additions don't break us.
export interface IUserBilling extends Document {
  email?: string;
  plan?: 'free' | 'pro';
  planTier?: 'free' | 'practice' | 'firm' | 'solo' | 'pro';
  billingCycle?: 'none' | 'monthly' | 'yearly';
  planRenewsAt?: Date;
  subscriptionCredits?: number;
  topupCredits?: number;
  earnedCredits?: number;
  // New Ink system fields (SCRUM-101) — integer units ×2, all default to 0
  inkSub?: number; // subscription bucket (resets each billing cycle)
  inkAnnualCarry?: number; // annual plan carry bucket (50% rollover capped at 2× monthly allotment)
  inkTopup?: number; // non-expiring top-up bucket (survives cancellation)
  inkSubMonthlyAllotment?: number; // monthly allotment for this user (for carry cap calc)
}

const UserSchema = new Schema<IUserBilling>(
  {
    email: { type: String },
    plan: { type: String, enum: ['free', 'pro'], default: 'free' },
    planTier: { type: String, enum: ['free', 'practice', 'firm', 'solo', 'pro'], default: 'free' },
    billingCycle: { type: String, enum: ['none', 'monthly', 'yearly'], default: 'none' },
    planRenewsAt: { type: Date, default: null },
    subscriptionCredits: { type: Number, default: 0 },
    topupCredits: { type: Number, default: 0 },
    earnedCredits: { type: Number, default: 0 },
    // New Ink system fields (SCRUM-101)
    inkSub: { type: Number, default: 0 },
    inkAnnualCarry: { type: Number, default: 0 },
    inkTopup: { type: Number, default: 0 },
    inkSubMonthlyAllotment: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    collection: 'users',
    strict: false,
  },
);

export const User =
  (mongoose.models['User'] as mongoose.Model<IUserBilling>) ||
  mongoose.model<IUserBilling>('User', UserSchema);

/**
 * Minimal User shape that the drafting service needs.
 * Owns nothing — the auth service is the canonical writer for User documents.
 * We declare just the fields the drafting flow touches (credit buckets, plan
 * tier), share the same `users` collection, and use `strict: false` so the
 * auth-side schema additions don't break us.
 */
import mongoose, { Document, Schema } from 'mongoose';

export interface IUserDrafting extends Document {
  email?: string;
  name?: string;
  plan?: 'free' | 'pro';
  planTier?: 'free' | 'practice' | 'firm';
  billingCycle?: 'none' | 'monthly' | 'yearly';
  subscriptionCredits?: number;
  earnedCredits?: number;
  topupCredits?: number;
  /** ObjectId reference — typed permissively for cross-service shape */
  referredVia?: unknown;
  createdAt?: Date;
  updatedAt?: Date;
}

const UserSchema = new Schema<IUserDrafting>(
  {
    email: String,
    name: String,
    plan: String,
    planTier: String,
    billingCycle: String,
    subscriptionCredits: { type: Number, default: 0 },
    earnedCredits: { type: Number, default: 0 },
    topupCredits: { type: Number, default: 0 },
    referredVia: { type: Schema.Types.ObjectId, default: null },
  },
  {
    timestamps: true,
    collection: 'users',
    strict: false,
  },
);

export const User =
  (mongoose.models['User'] as mongoose.Model<IUserDrafting>) ||
  mongoose.model<IUserDrafting>('User', UserSchema);

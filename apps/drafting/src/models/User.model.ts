/**
 * Minimal User shape that the drafting service needs.
 * Owns nothing — the auth service is the canonical writer for User documents.
 * We declare just the fields the drafting flow touches (credit buckets, plan
 * tier), share the same `users` collection, and use `strict: false` so the
 * auth-side schema additions don't break us.
 */
import mongoose, { Document, Schema } from 'mongoose';

/** T-226: one open hold. Units are ×2 storage units, as the buckets. */
export interface IInkHold {
  runId: string;
  runSequence: number;
  units: number;
  split: { sub: number; carry: number; topup: number };
  unit: 'ink2';
  expiresAt: Date;
  /**
   * Set by settleInk before its ledger write: the draft reached the user, so
   * the sweep must settle this hold, never release it.
   */
  deliver?: boolean;
  /** The ledger reference settleInk was given, for a settle the sweep finishes. */
  reference?: string;
}

export interface IUserDrafting extends Document {
  email?: string;
  name?: string;
  plan?: 'free' | 'pro';
  planTier?: 'free' | 'practice' | 'firm' | 'solo' | 'pro';
  billingCycle?: 'none' | 'monthly' | 'yearly';
  subscriptionCredits?: number;
  earnedCredits?: number;
  topupCredits?: number;
  // Ink ledger fields (SCRUM-101) — stored as ×2 integer units (1 Ink = 2 units)
  inkSub?: number;
  inkAnnualCarry?: number;
  inkTopup?: number;
  inkSubMonthlyAllotment?: number;
  /**
   * T-226: open Ink holds, one per in-flight draft attempt. Written only by
   * holdInk / settleInk / releaseInk / releaseExpiredHolds (credits.service).
   */
  inkHolds?: IInkHold[];
  /**
   * T-226 round 3: the last few settled holds' keys, pushed in the same write
   * that pulls a settled hold. Lets a route whose hold vanished tell "settled
   * by someone else (paid)" from "released (unpaid)". Capped at
   * INK_SETTLED_KEEP entries.
   */
  inkSettled?: Array<{ runId: string; runSequence: number; settledAt: Date }>;
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
    // SCRUM-101 Ink buckets. On the interface already; declared here (T-226)
    // only so Mongoose casts them as numbers. No default on purpose: a
    // default would write 0 into every user doc drafting saves, and billing
    // owns these fields. The hold pipelines treat a missing bucket as 0.
    inkSub: Number,
    inkAnnualCarry: Number,
    inkTopup: Number,
    inkSubMonthlyAllotment: Number,
    // T-226: open Ink holds. Pipelines treat a missing array as [] ($ifNull).
    inkHolds: {
      type: [
        new Schema<IInkHold>(
          {
            runId: { type: String, required: true },
            runSequence: { type: Number, required: true },
            units: { type: Number, required: true },
            split: {
              sub: { type: Number, default: 0 },
              carry: { type: Number, default: 0 },
              topup: { type: Number, default: 0 },
            },
            unit: { type: String, enum: ['ink2'], default: 'ink2' },
            expiresAt: { type: Date, required: true },
            deliver: Boolean,
            reference: String,
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    inkSettled: {
      type: [
        new Schema(
          {
            runId: { type: String, required: true },
            runSequence: { type: Number, required: true },
            settledAt: { type: Date, required: true },
          },
          { _id: false },
        ),
      ],
      default: undefined,
    },
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

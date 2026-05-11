/**
 * BonusCredit model — SCRUM-71
 *
 * Tracks referral-granted bonus drafts for a user in the drafting service.
 * Populated by POST /internal/grant-bonus (called by auth service after referral signup).
 *
 * `used` is incremented atomically by enforceFreeLimit each time a bonus draft is consumed.
 * A user's remaining bonus = granted - used.
 *
 * One record per user (upserted — never duplicated).
 */
import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IBonusCredit extends Document {
  userId: Types.ObjectId;
  granted: number;  // total bonus drafts granted (e.g. 25 from referral)
  used: number;     // bonus drafts already consumed
  createdAt: Date;
  updatedAt: Date;
}

const BonusCreditSchema = new Schema<IBonusCredit>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      unique: true,
    },
    granted: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    used: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

// userId unique index is declared on the field above (`unique: true`) — no need
// for an explicit schema.index() call (Mongoose would otherwise warn about a
// duplicate index registration).

export const BonusCredit = mongoose.model<IBonusCredit>('BonusCredit', BonusCreditSchema);

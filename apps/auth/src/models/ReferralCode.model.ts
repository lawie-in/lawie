/**
 * ReferralCode model — SCRUM-71
 *
 * Founder-issued codes shared with advocates during panel distribution.
 * A valid code at signup grants the referee 25 bonus drafts (freeTierBonusGrant on User).
 *
 * Reviewer: Priya (UX), Vikram (cap math).
 */
import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IReferralCode extends Document {
  code: string;               // 8-char uppercase alphanumeric, e.g. "LWPATNA1"
  label?: string;             // human-readable label, e.g. "Patna bar review"
  createdBy: Types.ObjectId;  // founder's userId
  isActive: boolean;
  maxUses: number | null;     // null = unlimited
  uses: number;               // incremented on each successful referral signup
  createdAt: Date;
  updatedAt: Date;
}

const ReferralCodeSchema = new Schema<IReferralCode>(
  {
    code: {
      type: String,
      required: [true, 'code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z0-9]{4,16}$/, 'code must be 4–16 uppercase alphanumeric characters'],
    },
    label: {
      type: String,
      trim: true,
      maxlength: [100, 'label too long'],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'createdBy is required'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    maxUses: {
      type: Number,
      default: null,
      min: [1, 'maxUses must be at least 1 if set'],
    },
    uses: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

// code unique index is declared on the field above.
ReferralCodeSchema.index({ createdBy: 1, createdAt: -1 });

export const ReferralCode = mongoose.model<IReferralCode>('ReferralCode', ReferralCodeSchema);

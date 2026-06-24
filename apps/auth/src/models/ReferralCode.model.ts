/**
 * ReferralCode model — SCRUM-71
 *
 * Founder-issued codes shared with advocates during panel distribution.
 * Each code carries its own bonusInk offer (Ink granted into inkTopup on signup).
 */
import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IReferralCode extends Document {
  code: string; // 4–16 char uppercase alphanumeric, e.g. "LWPATNA1"
  label?: string; // human-readable label, e.g. "Patna bar review"
  createdBy: Types.ObjectId; // founder's userId
  isActive: boolean;
  maxUses: number | null; // null = unlimited
  uses: number; // incremented on each successful referral signup
  bonusInk: number; // Ink to grant into inkTopup on signup (display units, ×2 for ledger)
  expiresAt?: Date; // optional — code rejects after this date
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
    bonusInk: {
      type: Number,
      default: 5,
      min: [1, 'bonusInk must be at least 1'],
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// code unique index is declared on the field above.
ReferralCodeSchema.index({ createdBy: 1, createdAt: -1 });

export const ReferralCode = mongoose.model<IReferralCode>('ReferralCode', ReferralCodeSchema);

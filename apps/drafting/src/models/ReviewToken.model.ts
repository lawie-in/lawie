/**
 * ReviewToken model — SCRUM-74
 *
 * One-time-use, signed access token for the Jharkhand advocate review panel.
 * Founder generates a token per (document, advocate) pair; advocate hits
 * /review/:token, sees the draft inline, submits structured feedback.
 *
 * Token IS the auth — no password required. Reuses the SCRUM-71 referral-code
 * primitives (random alphanumeric token, isActive flag, expiry).
 *
 * Reviewer: Priya (UX), Ajay (review form fields), Founder (whom to invite).
 */
import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IReviewToken extends Document {
  token: string;                  // 32-char URL-safe random token
  documentId: Types.ObjectId;     // ref to LawieDocument
  assignedTo: string;             // advocate name (display only)
  assignedEmail?: string;         // advocate email (display only — no auth use)
  expiresAt: Date;                // hard expiry (default +14 days)
  isActive: boolean;              // founder can revoke
  isUsed: boolean;                // flipped true on first feedback submission
  createdBy: Types.ObjectId;      // founder userId
  createdAt: Date;
  updatedAt: Date;
}

const ReviewTokenSchema = new Schema<IReviewToken>(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      minlength: [16, 'token too short'],
      maxlength: [64, 'token too long'],
    },
    documentId: {
      type: Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
    },
    assignedTo: {
      type: String,
      required: true,
      trim: true,
      maxlength: [100, 'assignedTo too long'],
    },
    assignedEmail: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: [200, 'assignedEmail too long'],
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      required: true,
    },
  },
  { timestamps: true },
);

// token unique index is declared on the field above.
ReviewTokenSchema.index({ documentId: 1, createdAt: -1 });
ReviewTokenSchema.index({ createdBy: 1, createdAt: -1 });

export const ReviewToken = mongoose.model<IReviewToken>('ReviewToken', ReviewTokenSchema);

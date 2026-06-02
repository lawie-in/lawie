/**
 * CreditLedger — every credit grant/spend audit row.
 *
 * One row per accounting event. Used for:
 *   • Founder credit-ledger UI at /admin/credit-ledger
 *   • Telemetry / monthly revenue reconciliation
 *   • User-side balance breakdowns
 *
 * Sources are intentionally enumerated — keep this enum in sync with the credit
 * grant + spend code paths.
 */
import mongoose, { Document, Schema, Types } from 'mongoose';

export type CreditBucket = 'subscriptionCredits' | 'earnedCredits' | 'topupCredits';

export type CreditSource =
  // ── Grants ────────────────────────────────────────────────────────────────
  | 'signup_bonus'         // referral signup → +25 → earnedCredits
  | 'login_bonus'          // daily login    → +2  → earnedCredits
  | 'rating_bonus'         // user rated a draft → +1 → earnedCredits
  | 'plan_renewal'         // monthly/yearly renewal → +N → subscriptionCredits
  | 'topup_purchase'       // top-up SKU purchase → +N → topupCredits
  | 'admin_grant'          // founder hand-grant
  // ── Spends ────────────────────────────────────────────────────────────────
  | 'draft_spent'          // a document was generated
  | 'plan_lapsed'          // monthly subscriptionCredits expired
  // ── Adjustments ───────────────────────────────────────────────────────────
  | 'admin_revoke';        // founder revoked credits

export interface ICreditLedger extends Document {
  userId: Types.ObjectId;
  source: CreditSource;
  bucket: CreditBucket;
  amount: number;             // Positive for grants/credits, negative for spends
  balanceAfter: number;       // Bucket balance for that user after this event
  reference?: string;         // Free-form (e.g. "Bail u/s 437", "razorpay:pay_xxx", "Rated 5★")
  templateId?: string;        // For draft_spent — which template was generated
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const CreditLedgerSchema = new Schema<ICreditLedger>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    source: {
      type: String,
      required: true,
      enum: [
        'signup_bonus',
        'login_bonus',
        'rating_bonus',
        'plan_renewal',
        'topup_purchase',
        'admin_grant',
        'draft_spent',
        'plan_lapsed',
        'admin_revoke',
      ],
    },
    bucket: {
      type: String,
      required: true,
      enum: ['subscriptionCredits', 'earnedCredits', 'topupCredits'],
    },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true, min: 0 },
    reference: { type: String, maxlength: 200 },
    templateId: { type: String, maxlength: 100 },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Recent-activity queries by user; founder-view queries by createdAt desc.
CreditLedgerSchema.index({ userId: 1, createdAt: -1 });
CreditLedgerSchema.index({ createdAt: -1 });
CreditLedgerSchema.index({ source: 1, createdAt: -1 });

export const CreditLedger = mongoose.model<ICreditLedger>('CreditLedger', CreditLedgerSchema);

/**
 * T-436 (b), Arjun #3: the running total refunded (and credited) against one
 * original invoice. One row per original invoice, keyed by its id.
 *
 * Kept apart from the Invoice row so invoices stay immutable. The cap check is
 * one conditional update on this row (see recordCreditNoteForRefund):
 * `$inc refundedTotal` + `$addToSet creditedRefundIds`, matched only while the
 * refund is not yet listed and the new total stays within the invoiced amount.
 *
 * Holds ids and paise only: no name, email or other personal data.
 */
import mongoose, { Document, Schema } from 'mongoose';

export interface IRefundCap extends Document {
  originalInvoiceId: mongoose.Types.ObjectId;
  /** Paise credited so far against the original invoice. */
  refundedTotal: number;
  /** Razorpay refund ids already counted in refundedTotal. */
  creditedRefundIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

const RefundCapSchema = new Schema<IRefundCap>(
  {
    originalInvoiceId: { type: Schema.Types.ObjectId, required: true },
    refundedTotal: { type: Number, required: true, default: 0 },
    creditedRefundIds: { type: [String], default: [] },
  },
  { timestamps: true, collection: 'refundcaps' },
);

RefundCapSchema.index({ originalInvoiceId: 1 }, { unique: true });

export const RefundCap =
  (mongoose.models['RefundCap'] as mongoose.Model<IRefundCap>) ||
  mongoose.model<IRefundCap>('RefundCap', RefundCapSchema);

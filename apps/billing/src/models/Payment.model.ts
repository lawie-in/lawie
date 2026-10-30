/**
 * T-646 (Arjun ruling 1; Vikram 28 Oct 2026): one row per Razorpay payment
 * attempt, for the customer's payment history. Written by the webhook (after
 * the Ink grant, never instead of it), by POST /topup/order (an order row only)
 * and by scripts/backfill-payments.ts.
 *
 * - `razorpayPaymentId` is unique where present. A row without one is an ORDER
 *   row (status 'created', from POST /topup/order): it maps the Razorpay order
 *   to the user and SKU so a later payment.failed / payment.authorized for that
 *   order can be attributed. Order rows are never shown (Vikram 2: an order
 *   with no payment attempt is not a payment).
 * - `createdAt` is the payment's own time at Razorpay (created_at), set once, so
 *   backfilled rows sort with live ones. No Mongoose timestamps.
 * - Amounts are paise, as charged by Razorpay (GST-inclusive, coupons applied).
 * - Ink is in ledger units (1 Ink = 2 units). `inkUnits` is what the payment
 *   granted; `inkReversedUnits` what refunds took back (ledger reason
 *   'refund_reversal', see services/refund-ink.service.ts).
 *
 * No PII and no free text: ids, amounts, statuses and dates only.
 */
import mongoose, { Schema } from 'mongoose';

export const PAYMENT_STATUSES = [
  'created',
  'processing',
  'paid',
  'failed',
  'refunded',
  'partly_refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** The statuses the customer sees (Vikram 1). 'created' (order only) is never shown. */
export const VISIBLE_PAYMENT_STATUSES = [
  'processing',
  'paid',
  'failed',
  'refunded',
  'partly_refunded',
] as const satisfies readonly PaymentStatus[];
export type VisiblePaymentStatus = (typeof VISIBLE_PAYMENT_STATUSES)[number];

export type PaymentKind = 'plan' | 'topup';
export type PaymentSource = 'webhook' | 'order' | 'backfill';

export interface IPayment {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  kind: PaymentKind;
  status: PaymentStatus;
  razorpayPaymentId?: string;
  razorpayOrderId?: string;
  razorpaySubscriptionId?: string;
  topupSkuId?: string;
  planId?: string;
  amountPaise: number;
  refundedPaise: number;
  inkUnits: number;
  inkReversedUnits: number;
  source: PaymentSource;
  /** When Razorpay settled it (captured or failed). */
  settledAt?: Date | null;
  /** Set once when the 24 h "still processing" alert was raised (Vikram 2). */
  checkingAlertedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    kind: { type: String, enum: ['plan', 'topup'], required: true },
    status: { type: String, enum: PAYMENT_STATUSES, required: true },
    razorpayPaymentId: { type: String },
    razorpayOrderId: { type: String },
    razorpaySubscriptionId: { type: String },
    topupSkuId: { type: String },
    planId: { type: String },
    amountPaise: { type: Number, required: true, min: 0 },
    refundedPaise: { type: Number, default: 0, min: 0 },
    inkUnits: { type: Number, default: 0, min: 0 },
    inkReversedUnits: { type: Number, default: 0, min: 0 },
    source: { type: String, enum: ['webhook', 'order', 'backfill'], required: true },
    settledAt: { type: Date, default: null },
    checkingAlertedAt: { type: Date, default: null },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { collection: 'payments', timestamps: false },
);

// Arjun ruling 1: one row per Razorpay payment. Order rows have no payment id.
PaymentSchema.index(
  { razorpayPaymentId: 1 },
  { unique: true, partialFilterExpression: { razorpayPaymentId: { $type: 'string' } } },
);
// Arjun ruling 1: the history list (own user, newest first).
PaymentSchema.index({ userId: 1, createdAt: -1 });
// Order rows are looked up by order id when a payment for that order arrives.
PaymentSchema.index(
  { razorpayOrderId: 1 },
  { partialFilterExpression: { razorpayOrderId: { $type: 'string' } } },
);

export const Payment =
  (mongoose.models['Payment'] as mongoose.Model<IPayment>) ||
  mongoose.model<IPayment>('Payment', PaymentSchema);

/**
 * T-646 (Arjun rulings 1 and 5): a customer's concern about one of their
 * payments.
 *
 * The `note` is the customer's free text and lives ONLY here: never in a log,
 * Sentry, Redis job data, an email, or any /internal response. Nothing reads it
 * back out except a future admin view; account erase unsets it.
 *
 * `openKey` is the payment id while the concern is open or in review, and
 * unset once resolved: its unique index allows one open concern per payment
 * (Arjun ruling 7, a second one is a 409).
 *
 * `reference` is the short code the customer sees and the acknowledgement
 * email quotes ({ref}, AJ-646-M2).
 */
import mongoose, { Schema } from 'mongoose';

/** AJ-646-M1: the signed reasons, as codes. The web holds the signed labels. */
export const CONCERN_REASONS = [
  'charged_no_ink',
  'charged_twice',
  'wrong_amount',
  'refund_request',
  'other',
] as const;
export type ConcernReason = (typeof CONCERN_REASONS)[number];

export const CONCERN_STATUSES = ['open', 'in_review', 'resolved'] as const;
export type ConcernStatus = (typeof CONCERN_STATUSES)[number];

/** Statuses that count as "open" for the one-open-concern-per-payment rule. */
export const OPEN_CONCERN_STATUSES: readonly ConcernStatus[] = ['open', 'in_review'];

export const CONCERN_NOTE_MAX = 500;

export interface IPaymentConcern {
  _id: mongoose.Types.ObjectId;
  /** Payment._id (not the Razorpay id). */
  paymentId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  reason: ConcernReason;
  note: string;
  status: ConcernStatus;
  reference: string;
  openKey?: string | null;
  ackQueuedAt?: Date | null;
  notifyQueuedAt?: Date | null;
  resolvedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentConcernSchema = new Schema<IPaymentConcern>(
  {
    paymentId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    reason: { type: String, enum: CONCERN_REASONS, required: true },
    note: { type: String, default: '', maxlength: CONCERN_NOTE_MAX },
    status: { type: String, enum: CONCERN_STATUSES, required: true, default: 'open' },
    reference: { type: String, required: true },
    openKey: { type: String },
    ackQueuedAt: { type: Date, default: null },
    notifyQueuedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
  },
  { collection: 'paymentconcerns', timestamps: true },
);

PaymentConcernSchema.index({ paymentId: 1, userId: 1, createdAt: -1 });
PaymentConcernSchema.index({ reference: 1 }, { unique: true });
PaymentConcernSchema.index(
  { openKey: 1 },
  { unique: true, partialFilterExpression: { openKey: { $type: 'string' } } },
);

export const PaymentConcern =
  (mongoose.models['PaymentConcern'] as mongoose.Model<IPaymentConcern>) ||
  mongoose.model<IPaymentConcern>('PaymentConcern', PaymentConcernSchema);

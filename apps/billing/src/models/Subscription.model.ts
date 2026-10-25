import mongoose, { Document, Schema } from 'mongoose';

/**
 * T-438: every documented Razorpay subscription status. Single source for the
 * TS type, the schema enum and the admin sync's check of Razorpay's live value.
 */
export const SUBSCRIPTION_STATUSES = [
  'created',
  'authenticated',
  'active',
  'pending',
  'halted',
  'paused',
  'cancelled',
  'completed',
  'expired',
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return typeof value === 'string' && (SUBSCRIPTION_STATUSES as readonly string[]).includes(value);
}

export interface IPaymentRecord {
  paymentId: string;
  amount: number;
  status: 'captured' | 'failed';
  paidAt: Date;
}

export interface ISubscription extends Document {
  userId: mongoose.Types.ObjectId;

  razorpaySubscriptionId: string;
  razorpayPlanId?: string;
  razorpayCustomerId?: string;

  planType: 'monthly' | 'annual';
  amount: number; // paise — 79900 or 699900
  currency: string;

  status: SubscriptionStatus;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;

  paymentHistory: IPaymentRecord[];

  // T-399: plan SKU id (e.g. 'solo_yearly'), cycle, end of the paid period
  // (Razorpay current_end), yearly drip state, and the last granted cycle
  // (Razorpay paid_count, or current_start when paid_count is absent).
  planId?: string;
  billingCycle?: 'monthly' | 'yearly';
  paidThrough?: Date;
  inkDripAnchor?: Date; // start of the paid year; drip n is anchor + n months
  inkDripNextAt?: Date;
  inkDripCount?: number;
  lastGrantedPaidCount?: number;
  lastGrantedPeriodStart?: Date;
  // T-415: state of the claim on the cycle above ('pending' until the grant
  // succeeds), when it was (re-)claimed, and the claiming attempt's token.
  // Absent on pre-T-415 documents, which count as granted.
  grantClaimState?: 'pending' | 'granted';
  grantClaimedAt?: Date;
  grantClaimToken?: string;

  cancelledAt?: Date;
  // T-508: the user asked to cancel at the end of the current cycle (Razorpay
  // cancel_at_cycle_end). Status is unchanged until the cancelled webhook.
  // Absent on older documents; the schema default reads them as false.
  cancelAtCycleEnd?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentRecordSchema = new Schema<IPaymentRecord>(
  {
    paymentId: { type: String, required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['captured', 'failed'], required: true },
    paidAt: { type: Date, required: true },
  },
  { _id: false },
);

const SubscriptionSchema = new Schema<ISubscription>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    razorpaySubscriptionId: {
      type: String,
      required: true,
      unique: true,
    },
    razorpayPlanId: String,
    razorpayCustomerId: String,

    planType: {
      type: String,
      enum: ['monthly', 'annual'],
      default: 'monthly',
    },
    amount: {
      type: Number,
      default: 79900,
    },
    currency: {
      type: String,
      default: 'INR',
    },

    status: {
      type: String,
      enum: SUBSCRIPTION_STATUSES,
      required: true,
    },
    currentPeriodStart: Date,
    currentPeriodEnd: Date,

    paymentHistory: {
      type: [PaymentRecordSchema],
      default: [],
    },

    planId: String,
    billingCycle: { type: String, enum: ['monthly', 'yearly'] },
    paidThrough: Date,
    inkDripAnchor: Date,
    inkDripNextAt: Date,
    inkDripCount: Number,
    lastGrantedPaidCount: Number,
    lastGrantedPeriodStart: Date,
    grantClaimState: { type: String, enum: ['pending', 'granted'] },
    grantClaimedAt: Date,
    grantClaimToken: String,

    cancelledAt: Date,
    cancelAtCycleEnd: { type: Boolean, default: false },
  },
  { timestamps: true },
);

SubscriptionSchema.index({ userId: 1 });
// razorpaySubscriptionId index created by `unique: true` on field definition
SubscriptionSchema.index({ status: 1 });

export const Subscription = mongoose.model<ISubscription>('Subscription', SubscriptionSchema);

import mongoose, { Document, Schema } from 'mongoose';

export type SubscriptionStatus =
  | 'created'
  | 'authenticated'
  | 'active'
  | 'paused'
  | 'cancelled'
  | 'expired';

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

  cancelledAt?: Date;
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
      enum: ['created', 'authenticated', 'active', 'paused', 'cancelled', 'expired'],
      required: true,
    },
    currentPeriodStart: Date,
    currentPeriodEnd: Date,

    paymentHistory: {
      type: [PaymentRecordSchema],
      default: [],
    },

    cancelledAt: Date,
  },
  { timestamps: true },
);

SubscriptionSchema.index({ userId: 1 });
// razorpaySubscriptionId index created by `unique: true` on field definition
SubscriptionSchema.index({ status: 1 });

export const Subscription = mongoose.model<ISubscription>('Subscription', SubscriptionSchema);

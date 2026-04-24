import mongoose, { Document, Schema } from 'mongoose';

export type SubscriptionStatus =
  | 'created'
  | 'authenticated'
  | 'active'
  | 'paused'
  | 'cancelled'
  | 'expired';

export interface ISubscription extends Document {
  userId: mongoose.Types.ObjectId;
  razorpaySubscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

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
    status: {
      type: String,
      enum: ['created', 'authenticated', 'active', 'paused', 'cancelled', 'expired'],
      required: true,
    },
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
    cancelledAt: Date,
  },
  { timestamps: true },
);

SubscriptionSchema.index({ userId: 1 });
SubscriptionSchema.index({ razorpaySubscriptionId: 1 });

export const Subscription = mongoose.model<ISubscription>('Subscription', SubscriptionSchema);

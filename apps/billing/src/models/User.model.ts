import mongoose, { Document, Schema } from 'mongoose';

// Minimal User model for billing service — only the fields billing needs to read/write.
// The auth service owns the full schema; both services share the same MongoDB collection.
export interface IUserBilling extends Document {
  email: string;
  plan: 'free' | 'pro';
}

const UserSchema = new Schema<IUserBilling>(
  {
    email: { type: String },
    plan: { type: String, enum: ['free', 'pro'], default: 'free' },
  },
  {
    timestamps: true,
    // Use the same collection as the auth service User model
    collection: 'users',
  },
);

// Avoid OverwriteModelError if module is hot-reloaded
export const User =
  (mongoose.models['User'] as mongoose.Model<IUserBilling>) ||
  mongoose.model<IUserBilling>('User', UserSchema);

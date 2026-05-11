import { UserRole, UserPlan } from '@lawie/shared';
import bcrypt from 'bcryptjs';
import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IUser extends Document {
  email: string;
  password?: string;
  authProvider: 'email' | 'google';
  googleId?: string;

  name: string;
  phone?: string;
  barCouncilId?: string;
  state?: string;
  practiceAreas: string[];
  yearsOfExperience?: number;

  role: UserRole;
  plan: UserPlan;
  planStartedAt?: Date;
  planExpiresAt?: Date;
  docCount: number;

  enrollmentNumber?: string;
  emailVerified: boolean;
  isActive: boolean;
  lastLoginAt?: Date;

  referredVia?: Types.ObjectId;   // ReferralCode._id used at signup (SCRUM-71)
  freeTierBonusGrant: number;     // bonus drafts granted via referral (default 0)

  // ── SCRUM-73 / SCRUM-59 — credit system (founder-authorised 2026-05-12) ──
  // Three credit buckets, consumed in priority order: topup → earned → subscription.
  subscriptionCredits: number;    // Granted on plan renewal. Lapses on monthly/yearly cycle.
  earnedCredits: number;          // From daily login + rating bonuses. Permanent.
  topupCredits: number;           // One-time top-up purchases. Permanent.
  planTier: 'free' | 'practice' | 'firm';
  billingCycle: 'none' | 'monthly' | 'yearly';
  planRenewsAt?: Date;
  lastLoginBonusAt?: Date;        // Used by daily-login-bonus dedupe

  passwordResetToken?: string;
  passwordResetExpires?: Date;
  createdAt: Date;
  updatedAt: Date;

  comparePassword(candidate: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email format'],
    },
    password: {
      type: String,
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    authProvider: {
      type: String,
      enum: ['email', 'google'],
      default: 'email',
    },
    googleId: {
      type: String,
      sparse: true,
      select: false,
    },

    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name too long'],
    },
    phone: {
      type: String,
      trim: true,
      match: [/^\+91\d{10}$/, 'Phone must be +91XXXXXXXXXX'],
    },
    barCouncilId: {
      type: String,
      trim: true,
    },
    state: {
      type: String,
      trim: true,
    },
    practiceAreas: {
      type: [String],
      default: [],
    },
    yearsOfExperience: {
      type: Number,
      min: 0,
    },

    role: {
      type: String,
      enum: ['Admin', 'Lawyer', 'Client'],
      default: 'Client',
    },
    plan: {
      type: String,
      enum: ['free', 'pro'],
      default: 'free',
    },
    planStartedAt: Date,
    planExpiresAt: Date,
    docCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    enrollmentNumber: {
      type: String,
      trim: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: Date,

    referredVia: {
      type: Schema.Types.ObjectId,
      ref: 'ReferralCode',
      default: null,
    },
    freeTierBonusGrant: {
      type: Number,
      default: 0,
      min: 0,
    },

    // SCRUM-73 / SCRUM-59 — credit system
    subscriptionCredits: { type: Number, default: 0, min: 0 },
    earnedCredits: { type: Number, default: 0, min: 0 },
    topupCredits: { type: Number, default: 0, min: 0 },
    planTier: {
      type: String,
      enum: ['free', 'practice', 'firm'],
      default: 'free',
    },
    billingCycle: {
      type: String,
      enum: ['none', 'monthly', 'yearly'],
      default: 'none',
    },
    planRenewsAt: { type: Date, default: null },
    lastLoginBonusAt: { type: Date, default: null },

    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        ret['id'] = ret['_id'];
        delete ret['_id'];
        delete ret['password'];
        delete ret['__v'];
        return ret;
      },
    },
  },
);

// -- Indexes per CTO schema design --
// email index created by `unique: true` on field definition
// googleId index created by `sparse: true` on field definition
UserSchema.index({ plan: 1 });
UserSchema.index({ createdAt: -1 });

// -- Pre-save: bcrypt password hashing --
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

UserSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  if (!this.password) throw new Error('User has no password — use OAuth login');
  return bcrypt.compare(candidate, this.password);
};

export const User = mongoose.model<IUser>('User', UserSchema);

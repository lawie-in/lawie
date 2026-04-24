import { UserRole, UserPlan } from '@lawie/shared';
import bcrypt from 'bcryptjs';
import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  email: string;
  password?: string;
  name: string;
  role: UserRole;
  plan: UserPlan;
  docCount: number;
  googleId?: string;
  barCouncilState?: string;
  enrollmentNumber?: string;
  isActive: boolean;
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
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name too long'],
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
    docCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    googleId: {
      type: String,
      sparse: true,
      select: false,
    },
    barCouncilState: {
      type: String,
      trim: true,
    },
    enrollmentNumber: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
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

UserSchema.index({ email: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ plan: 1 });
UserSchema.index({ googleId: 1 }, { sparse: true });
UserSchema.index({ passwordResetToken: 1 }, { sparse: true });

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

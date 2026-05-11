import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ISession extends Document {
  userId: Types.ObjectId;

  jwtTokenHash: string;
  refreshTokenHash: string;

  ipAddress?: string;
  userAgent?: string;
  deviceType: 'web' | 'mobile';

  isActive: boolean;
  expiresAt: Date;
  lastActivityAt: Date;

  createdAt: Date;
}

const SessionSchema = new Schema<ISession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
    },

    jwtTokenHash: {
      type: String,
      required: [true, 'jwtTokenHash is required'],
    },
    refreshTokenHash: {
      type: String,
      required: [true, 'refreshTokenHash is required'],
    },

    ipAddress: {
      type: String,
      trim: true,
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: [500, 'userAgent too long'],
    },
    deviceType: {
      type: String,
      enum: ['web', 'mobile'],
      default: 'web',
    },

    isActive: {
      type: Boolean,
      default: true,
    },
    expiresAt: {
      type: Date,
      required: [true, 'expiresAt is required'],
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// -- Indexes per CTO schema design --
SessionSchema.index({ userId: 1 });
SessionSchema.index({ jwtTokenHash: 1 }, { unique: true });
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

export const Session = mongoose.model<ISession>('Session', SessionSchema);

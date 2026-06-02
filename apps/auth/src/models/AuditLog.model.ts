import mongoose, { Document, Schema, Types } from 'mongoose';

export type AuditEventType =
  | 'login'
  | 'logout'
  | 'payment'
  | 'data_export'
  | 'account_delete'
  | 'password_change'
  | 'plan_change';
export type AuditSeverity = 'info' | 'warning' | 'critical';

export interface IAuditLog extends Document {
  userId?: Types.ObjectId;

  eventType: AuditEventType;
  severity: AuditSeverity;

  ipAddress?: string;
  metadata?: Record<string, unknown>;

  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    eventType: {
      type: String,
      enum: [
        'login',
        'logout',
        'payment',
        'data_export',
        'account_delete',
        'password_change',
        'plan_change',
      ],
      required: [true, 'eventType is required'],
    },
    severity: {
      type: String,
      enum: ['info', 'warning', 'critical'],
      default: 'info',
    },

    ipAddress: {
      type: String,
      trim: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// -- Indexes per CTO schema design --
AuditLogSchema.index({ userId: 1 });
AuditLogSchema.index({ eventType: 1 });
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 63072000 }); // 2-year TTL — DPDP Act

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);

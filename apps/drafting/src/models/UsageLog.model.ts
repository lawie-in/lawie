import mongoose, { Document, Schema, Types } from 'mongoose';

export type UsageAction = 'document_created' | 'document_exported' | 'ai_generation';

export interface IUsageLog extends Document {
  userId: Types.ObjectId;

  action: UsageAction;
  documentId?: Types.ObjectId;

  monthYear: string; // "2026-04" — for quota queries
  tokensUsed: number;
  costInr: number; // calculated infra cost per action

  createdAt: Date;
}

const UsageLogSchema = new Schema<IUsageLog>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
    },

    action: {
      type: String,
      enum: ['document_created', 'document_exported', 'ai_generation'],
      required: [true, 'action is required'],
    },
    documentId: {
      type: Schema.Types.ObjectId,
      ref: 'Document',
      default: null,
    },

    monthYear: {
      type: String,
      required: [true, 'monthYear is required'],
      match: [/^\d{4}-\d{2}$/, 'monthYear must be YYYY-MM format'],
    },
    tokensUsed: {
      type: Number,
      default: 0,
      min: 0,
    },
    costInr: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// -- Indexes per CTO schema design --
UsageLogSchema.index({ userId: 1, monthYear: 1 });
UsageLogSchema.index({ createdAt: -1 });

export const UsageLog = mongoose.model<IUsageLog>('UsageLog', UsageLogSchema);

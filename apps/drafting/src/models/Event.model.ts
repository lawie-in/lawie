import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IEvent extends Document {
  userId: Types.ObjectId;
  type: string; // 'activation_first_export' | 'draft.exported' | etc.
  docId?: Types.ObjectId;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const EventSchema = new Schema<IEvent>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      index: true,
    },
    type: {
      type: String,
      required: [true, 'event type is required'],
      trim: true,
      maxlength: [100, 'type too long'],
    },
    docId: {
      type: Schema.Types.ObjectId,
      ref: 'Document',
      default: null,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

EventSchema.index({ userId: 1, type: 1 });
EventSchema.index({ type: 1, createdAt: -1 });

export const Event = mongoose.model<IEvent>('Event', EventSchema);

import mongoose, { Document, Schema, Types } from 'mongoose';

import { fixtureOriginPlugin, RUN_ORIGINS, RunOrigin } from '../services/run-origin';

export interface IEvent extends Document {
  userId: Types.ObjectId;
  type: string; // 'activation_first_export' | 'draft.exported' | etc.
  docId?: Types.ObjectId;
  metadata?: Record<string, unknown>;
  /** T-147e — 'fixture' for a golden-set run. Old rows have none and count as 'user'. */
  runType?: RunOrigin;
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
    runType: { type: String, enum: RUN_ORIGINS, default: 'user' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

EventSchema.plugin(fixtureOriginPlugin('runType'));

EventSchema.index({ userId: 1, type: 1 });
EventSchema.index({ type: 1, createdAt: -1 });

export const Event = mongoose.model<IEvent>('Event', EventSchema);

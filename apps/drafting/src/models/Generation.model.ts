import { DocType, DOC_TYPES } from '@lawie/shared';
import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IGeneration extends Document {
  userId: Types.ObjectId;
  docType: DocType;
  tokensUsed: number;
  createdAt: Date;
  updatedAt: Date;
}

const GenerationSchema = new Schema<IGeneration>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
    },
    docType: {
      type: String,
      enum: Object.values(DOC_TYPES),
      required: [true, 'docType is required'],
    },
    tokensUsed: {
      type: Number,
      required: [true, 'tokensUsed is required'],
      min: 0,
    },
  },
  { timestamps: true },
);

GenerationSchema.index({ userId: 1 });
GenerationSchema.index({ docType: 1 });
GenerationSchema.index({ createdAt: -1 });
// Used for monthly cost aggregation per user
GenerationSchema.index({ userId: 1, createdAt: -1 });

export const Generation = mongoose.model<IGeneration>('Generation', GenerationSchema);

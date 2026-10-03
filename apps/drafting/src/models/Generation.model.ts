import { DocType, DOC_TYPES } from '@lawie/shared';
import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IGeneration extends Document {
  userId: Types.ObjectId;
  docType: DocType;
  tokensUsed: number;
  costUsd: number;
  /** Real input tokens used (T-003). 0 on generations predating this field. */
  inputTokens: number;
  /** Real output tokens used (T-003). 0 on generations predating this field. */
  outputTokens: number;
  /** Number of LLM calls this generation made (legacy pipeline: always 1; config-driven: one per ai_generated section) */
  llmCalls: number;
  /** Paragraph count of the final draft. 0 for a generation that failed before producing one. */
  paragraphCount: number;
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
    costUsd: {
      type: Number,
      default: 0,
      min: 0,
    },
    inputTokens: {
      type: Number,
      default: 0,
      min: 0,
    },
    outputTokens: {
      type: Number,
      default: 0,
      min: 0,
    },
    llmCalls: {
      type: Number,
      default: 0,
      min: 0,
    },
    paragraphCount: {
      type: Number,
      default: 0,
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

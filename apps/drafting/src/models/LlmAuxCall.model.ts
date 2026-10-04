import mongoose, { Document, Schema, Types } from 'mongoose';

/**
 * LlmAuxCall — one row per model call that is not a document generation
 * (ADR-019 §3.7). Intake now; Reception, review and preflight later.
 *
 * Never holds description text, image data or field values: numbers and ids only.
 */
export const LLM_AUX_PURPOSES = ['intake_match', 'intake_fill'] as const;
export type LlmAuxPurpose = (typeof LLM_AUX_PURPOSES)[number];

export interface ILlmAuxCall extends Document {
  intakeId: string;
  userId: Types.ObjectId;
  purpose: LlmAuxPurpose;
  status: 'completed' | 'failed';
  aiModel?: string;
  transport?: 'helicone' | 'direct';
  inputTokens: number;
  outputTokens: number;
  imageCount: number;
  costUsd: number;
  costStatus: 'priced' | 'rate_missing';
  usageSource: 'provider' | 'estimated';
  rateInputUsdPerMTok?: number;
  rateOutputUsdPerMTok?: number;
  durationMs?: number;
  createdAt: Date;
}

const LlmAuxCallSchema = new Schema<ILlmAuxCall>(
  {
    intakeId: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    purpose: { type: String, enum: LLM_AUX_PURPOSES, required: true },
    status: { type: String, enum: ['completed', 'failed'], required: true },
    aiModel: { type: String, default: undefined },
    transport: { type: String, enum: ['helicone', 'direct'], default: undefined },
    inputTokens: { type: Number, default: 0, min: 0 },
    outputTokens: { type: Number, default: 0, min: 0 },
    imageCount: { type: Number, default: 0, min: 0 },
    costUsd: { type: Number, default: 0, min: 0 },
    costStatus: { type: String, enum: ['priced', 'rate_missing'], required: true },
    usageSource: { type: String, enum: ['provider', 'estimated'], required: true },
    rateInputUsdPerMTok: { type: Number, default: undefined, min: 0 },
    rateOutputUsdPerMTok: { type: Number, default: undefined, min: 0 },
    durationMs: { type: Number, default: undefined, min: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

LlmAuxCallSchema.index({ intakeId: 1 });
LlmAuxCallSchema.index({ userId: 1, createdAt: -1 });
LlmAuxCallSchema.index({ purpose: 1, createdAt: -1 });

export const LlmAuxCall = mongoose.model<ILlmAuxCall>(
  'LlmAuxCall',
  LlmAuxCallSchema,
  'llmauxcalls',
);

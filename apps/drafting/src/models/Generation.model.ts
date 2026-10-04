import { DocType, DOC_TYPES } from '@lawie/shared';
import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IGenerationCall {
  sectionId: string;
  inputTokens: number;
  outputTokens: number;
  usageSource: 'provider' | 'estimated';
}

/** T-110 — what kind of attempt a row is. Revisions arrive with T-205. */
export const RUN_TYPES = ['initial', 'revision'] as const;
export type RunType = (typeof RUN_TYPES)[number];

/**
 * Rows written before T-110 have no runType. Every reader goes through this
 * so they count as 'initial' — never read `runType` off a row directly.
 */
export function effectiveRunType(row: { runType?: RunType | null }): RunType {
  return row.runType ?? 'initial';
}

export interface IGeneration extends Document {
  userId: Types.ObjectId;
  docType: DocType;
  tokensUsed: number;
  costUsd: number;

  /** T-003 — all fields below are optional/defaulted so pre-T-003 rows stay valid. */

  /** Missing on old rows, which are treated as completed. */
  status?: 'completed' | 'failed';
  templateId?: string;
  documentId?: Types.ObjectId;
  /** Resolved model id for this generation (e.g. a full dated Anthropic model id). */
  aiModel?: string;
  transport?: 'direct' | 'helicone';
  /** One per ai_generated section (config-driven pipeline) or one entry for the legacy pipeline. */
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  usageSource?: 'provider' | 'estimated' | 'mixed';
  /** 'rate_missing' means costUsd is 0 only because no rate was configured — tokens are still real. */
  costStatus?: 'priced' | 'rate_missing';
  /** Rate copied onto the row at save time, so a later rate change doesn't rewrite history. */
  rateInputUsdPerMTok?: number;
  rateOutputUsdPerMTok?: number;
  paragraphCount: number;
  durationMs?: number;
  /** §3.8 — identifies one draft across retries; pair unique with runSequence. */
  runId?: string;
  runSequence?: number;
  /** T-110 — missing on pre-T-110 rows; read it through effectiveRunType(). */
  runType?: RunType;
  /** ADR-019 §3.7 — the intake that led to this draft, when there was one. */
  intakeId?: string;
  /** Per-section breakdown — how much of the cost is the repeated system prompt (feeds T-004). */
  calls?: IGenerationCall[];

  createdAt: Date;
  updatedAt: Date;
}

const GenerationCallSchema = new Schema<IGenerationCall>(
  {
    sectionId: { type: String, required: true },
    inputTokens: { type: Number, required: true, min: 0 },
    outputTokens: { type: Number, required: true, min: 0 },
    usageSource: { type: String, enum: ['provider', 'estimated'], required: true },
  },
  { _id: false },
);

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
    status: {
      type: String,
      enum: ['completed', 'failed'],
      default: undefined,
    },
    templateId: { type: String, default: undefined },
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', default: undefined },
    aiModel: { type: String, default: undefined },
    transport: { type: String, enum: ['direct', 'helicone'], default: undefined },
    llmCalls: {
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
    usageSource: {
      type: String,
      enum: ['provider', 'estimated', 'mixed'],
      default: undefined,
    },
    costStatus: {
      type: String,
      enum: ['priced', 'rate_missing'],
      default: undefined,
    },
    rateInputUsdPerMTok: { type: Number, default: undefined, min: 0 },
    rateOutputUsdPerMTok: { type: Number, default: undefined, min: 0 },
    paragraphCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    durationMs: { type: Number, default: undefined, min: 0 },
    runId: { type: String, default: undefined },
    runSequence: { type: Number, default: undefined, min: 1 },
    runType: { type: String, enum: RUN_TYPES, default: undefined },
    intakeId: { type: String, default: undefined },
    calls: { type: [GenerationCallSchema], default: undefined },
  },
  { timestamps: true },
);

GenerationSchema.index({ userId: 1 });
GenerationSchema.index({ docType: 1 });
GenerationSchema.index({ createdAt: -1 });
// Used for monthly cost aggregation per user
GenerationSchema.index({ userId: 1, createdAt: -1 });
// One attempt per (runId, runSequence) — sparse because rows before T-003 have neither.
GenerationSchema.index({ runId: 1, runSequence: 1 }, { unique: true, sparse: true });
// Retry validation: "does this runId belong to this user, for this template, with no completed attempt?"
GenerationSchema.index({ runId: 1, userId: 1, templateId: 1 });
// Full cost of a draft = Generation rows by runId + LlmAuxCall rows by intakeId.
GenerationSchema.index({ intakeId: 1 }, { sparse: true });

export const Generation = mongoose.model<IGeneration>('Generation', GenerationSchema);

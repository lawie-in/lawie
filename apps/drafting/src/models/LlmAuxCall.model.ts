import mongoose, { Document, Schema, Types } from 'mongoose';

import { fixtureOriginPlugin, RUN_ORIGINS, RunOrigin } from '../services/run-origin';

/**
 * LlmAuxCall — one row per model call that is not a document generation
 * (ADR-019 §3.7). Intake, Reception and (T-437) preflight; review later.
 *
 * Never holds description text, image data or field values: numbers and ids only.
 */
export const LLM_AUX_PURPOSES = [
  'intake_match',
  'intake_fill',
  'intake_reception',
  /** T-147b: the fact-ledger extraction pass. */
  'intake_extract',
  /**
   * T-437: the SCRUM-69 preflight verifier. The preflight route carries no
   * intake id, so these rows have none (intakeId is required for every other purpose).
   */
  'preflight',
] as const;
export type LlmAuxPurpose = (typeof LLM_AUX_PURPOSES)[number];

export interface ILlmAuxCall extends Document {
  /** Absent only on 'preflight' rows (T-437). */
  intakeId?: string;
  userId: Types.ObjectId;
  purpose: LlmAuxPurpose;
  status: 'completed' | 'failed';
  aiModel?: string;
  /** 'helicone' is kept so rows written before T-118 still load; new rows are always 'direct'. */
  transport?: 'helicone' | 'direct';
  /** Uncached input only (T-437). */
  inputTokens: number;
  outputTokens: number;
  /** T-437 — prompt-cache writes (all TTLs) and reads, with the 1h / 5m split when reported. */
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreation1hInputTokens?: number;
  cacheCreation5mInputTokens?: number;
  imageCount: number;
  costUsd: number;
  costStatus: 'priced' | 'rate_missing';
  usageSource: 'provider' | 'estimated';
  rateInputUsdPerMTok?: number;
  rateOutputUsdPerMTok?: number;
  /** T-437 — the cache rates used (configured, or the fallback multipliers of the input rate). */
  rateCacheWriteUsdPerMTok?: number;
  rateCacheReadUsdPerMTok?: number;
  durationMs?: number;
  /** T-147e — 'fixture' for a golden-set run. Old rows have none and count as 'user'. */
  runType?: RunOrigin;
  createdAt: Date;
}

const LlmAuxCallSchema = new Schema<ILlmAuxCall>(
  {
    intakeId: {
      type: String,
      required: function (this: { purpose?: string }) {
        return this.purpose !== 'preflight';
      },
    },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    purpose: { type: String, enum: LLM_AUX_PURPOSES, required: true },
    status: { type: String, enum: ['completed', 'failed'], required: true },
    aiModel: { type: String, default: undefined },
    transport: { type: String, enum: ['helicone', 'direct'], default: undefined },
    inputTokens: { type: Number, default: 0, min: 0 },
    outputTokens: { type: Number, default: 0, min: 0 },
    cacheCreationInputTokens: { type: Number, default: 0, min: 0 },
    cacheReadInputTokens: { type: Number, default: 0, min: 0 },
    cacheCreation1hInputTokens: { type: Number, default: undefined, min: 0 },
    cacheCreation5mInputTokens: { type: Number, default: undefined, min: 0 },
    imageCount: { type: Number, default: 0, min: 0 },
    costUsd: { type: Number, default: 0, min: 0 },
    costStatus: { type: String, enum: ['priced', 'rate_missing'], required: true },
    usageSource: { type: String, enum: ['provider', 'estimated'], required: true },
    rateInputUsdPerMTok: { type: Number, default: undefined, min: 0 },
    rateOutputUsdPerMTok: { type: Number, default: undefined, min: 0 },
    rateCacheWriteUsdPerMTok: { type: Number, default: undefined, min: 0 },
    rateCacheReadUsdPerMTok: { type: Number, default: undefined, min: 0 },
    durationMs: { type: Number, default: undefined, min: 0 },
    runType: { type: String, enum: RUN_ORIGINS, default: 'user' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

LlmAuxCallSchema.plugin(fixtureOriginPlugin('runType'));

LlmAuxCallSchema.index({ intakeId: 1 });
LlmAuxCallSchema.index({ userId: 1, createdAt: -1 });
LlmAuxCallSchema.index({ purpose: 1, createdAt: -1 });

export const LlmAuxCall = mongoose.model<ILlmAuxCall>(
  'LlmAuxCall',
  LlmAuxCallSchema,
  'llmauxcalls',
);

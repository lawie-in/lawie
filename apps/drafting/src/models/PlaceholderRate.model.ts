/**
 * PlaceholderRate — one row per draft written from the fact ledger (T-147d,
 * AC7). How many `{{MISSING: ...}}` placeholders the delivered draft carries
 * against how many facts the pack requires, per rule pack, so that a spike
 * reads as an allowlist gap rather than a model regression.
 *
 * No `userId`, no `documentId`, no value: counts and ids of the pack only.
 */
import mongoose, { Document, Schema } from 'mongoose';

import { FACT_DIFF_PHASES, FACT_DIFF_RUN_TYPES } from './FactDiff.model';

export interface IPlaceholderRate extends Document {
  rulePack: string;
  rulePackVersion: string;
  runType: (typeof FACT_DIFF_RUN_TYPES)[number];
  /** Placeholders in the delivered document, the parts the system wrote included. */
  placeholderCount: number;
  /** Placeholders the verifier itself put in. */
  verifierPlaceholderCount: number;
  /** Required items of the pack's checklist. */
  requiredFactCount: number;
  /** The phase the delivered body came from. */
  phase: (typeof FACT_DIFF_PHASES)[number];
  repairRan: boolean;
  repairFixed: boolean;
  createdAt: Date;
}

const PlaceholderRateSchema = new Schema<IPlaceholderRate>(
  {
    rulePack: { type: String, required: true, maxlength: 100 },
    rulePackVersion: { type: String, required: true, maxlength: 64 },
    runType: { type: String, enum: FACT_DIFF_RUN_TYPES, required: true },
    placeholderCount: { type: Number, required: true, min: 0 },
    verifierPlaceholderCount: { type: Number, required: true, min: 0 },
    requiredFactCount: { type: Number, required: true, min: 0 },
    phase: { type: String, enum: FACT_DIFF_PHASES, required: true },
    repairRan: { type: Boolean, required: true },
    repairFixed: { type: Boolean, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

PlaceholderRateSchema.index({ rulePack: 1, createdAt: 1 });

export const PlaceholderRate = mongoose.model<IPlaceholderRate>(
  'PlaceholderRate',
  PlaceholderRateSchema,
  'placeholderrates',
);

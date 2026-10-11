/**
 * FactDiff — one row per fact-verifier violation per phase (T-147d, ADR-022
 * section 2C). Ajay's agreed format; his weekly review reads it through
 * `buildWeeklyFactDiffReport` (services/fact-diff-log.ts).
 *
 * Privacy:
 * - `ledgerValue` and `draftValue` are encrypted with the same `encrypt()`
 *   as `Document.generatedContent`. No paragraph text is stored.
 * - `userId` is kept only so a future account delete (T-115) can remove the
 *   rows; it is never exported. Reports use `userRef`, a keyed one-way hash.
 * - Nothing from this collection is logged.
 *
 * Retention: rows of `runType: 'real'` expire 90 days after `createdAt`
 * (a partial TTL index). Fixture rows have no TTL.
 */
import mongoose, { Document, Schema, Types } from 'mongoose';

export const FACT_DIFF_CHECKS = ['unsupported', 'dropped', 'mutation', 'banned'] as const;
export const FACT_DIFF_ENTITY_TYPES = [
  'date',
  'amount',
  'name',
  'police_station',
  'court',
  'case_no',
  'section',
  'phrase',
] as const;
/**
 * `flagged`: a dropped fact still missing after the repair. It has no place in
 * the text for a placeholder, so it is listed in the banner instead. (Not in
 * the three resolutions first agreed; for Ajay to confirm.)
 */
export const FACT_DIFF_RESOLUTIONS = ['repaired', 'placeholdered', 'stripped', 'flagged'] as const;
export const FACT_DIFF_PHASES = ['initial', 'after_repair'] as const;
export const FACT_DIFF_RUN_TYPES = ['real', 'fixture'] as const;

/** 90 days, for rows of real traffic. */
export const FACT_DIFF_TTL_SECONDS = 90 * 24 * 60 * 60;

export interface IFactDiff extends Document {
  runId: string;
  documentId: Types.ObjectId | null;
  /** For the delete cascade only (T-115). Never exported. */
  userId: Types.ObjectId;
  /** Keyed one-way hash of `userId`; what reports use. */
  userRef: string;
  /** The ledger the draft was written from, for the delete cascade. An id only. */
  ledgerId: Types.ObjectId | null;
  rulePack: string;
  rulePackVersion: string;
  verifierVersion: string;
  repairPromptVersion: string;
  runType: (typeof FACT_DIFF_RUN_TYPES)[number];
  check: (typeof FACT_DIFF_CHECKS)[number];
  entityType: (typeof FACT_DIFF_ENTITY_TYPES)[number];
  bannedEntryId: string | null;
  ledgerKey: string | null;
  label: string;
  paragraphIndex: number;
  charOffset: number;
  /** encrypt()ed. Null when the value has no ledger fact. */
  ledgerValue: string | null;
  /** encrypt()ed. Null for `dropped`; the stripped phrase for `banned`. */
  draftValue: string | null;
  resolution: (typeof FACT_DIFF_RESOLUTIONS)[number];
  phase: (typeof FACT_DIFF_PHASES)[number];
  createdAt: Date;
}

const FactDiffSchema = new Schema<IFactDiff>(
  {
    runId: { type: String, required: true, maxlength: 100 },
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', default: null },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    userRef: { type: String, required: true, maxlength: 64 },
    ledgerId: { type: Schema.Types.ObjectId, ref: 'FactLedger', default: null },
    rulePack: { type: String, required: true, maxlength: 100 },
    rulePackVersion: { type: String, required: true, maxlength: 64 },
    verifierVersion: { type: String, required: true, maxlength: 64 },
    repairPromptVersion: { type: String, required: true, maxlength: 64 },
    runType: { type: String, enum: FACT_DIFF_RUN_TYPES, required: true },
    check: { type: String, enum: FACT_DIFF_CHECKS, required: true },
    entityType: { type: String, enum: FACT_DIFF_ENTITY_TYPES, required: true },
    bannedEntryId: { type: String, default: null, maxlength: 100 },
    ledgerKey: { type: String, default: null, maxlength: 200 },
    label: { type: String, required: true, maxlength: 300 },
    paragraphIndex: { type: Number, required: true, min: 0 },
    charOffset: { type: Number, required: true, min: 0 },
    ledgerValue: { type: String, default: null },
    draftValue: { type: String, default: null },
    resolution: { type: String, enum: FACT_DIFF_RESOLUTIONS, required: true },
    phase: { type: String, enum: FACT_DIFF_PHASES, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

FactDiffSchema.index({ rulePack: 1, createdAt: 1 });
FactDiffSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: FACT_DIFF_TTL_SECONDS, partialFilterExpression: { runType: 'real' } },
);
FactDiffSchema.index({ userId: 1 });
FactDiffSchema.index({ documentId: 1 });
FactDiffSchema.index({ ledgerId: 1 });

export const FactDiff = mongoose.model<IFactDiff>('FactDiff', FactDiffSchema, 'factdiffs');

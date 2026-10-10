/**
 * FactLedger — the advocate's facts for one brief, versioned (T-147b, ADR-022
 * section 2A).
 *
 * Every write appends a version; an earlier version is never changed, so the
 * ledger is an audit record of what the advocate said and what they
 * corrected. Only `fact-ledger.service.ts` writes here, and only with `$push`.
 *
 * Privacy: no description text is stored. A fact holds only its `raw_span`
 * (the advocate's words for that one value), its `value` and its `display`.
 * Nothing from this collection is logged.
 */
import type {
  FactLedgerRunType,
  FactLedgerVersionReason,
  LedgerFact,
  LedgerUnresolvedFact,
} from '@lawie/shared';
import mongoose, { Document, Schema, Types } from 'mongoose';

export const FACT_LEDGER_REASONS: readonly FactLedgerVersionReason[] = [
  'extract',
  'answer',
  'edit',
] as const;
export const FACT_LEDGER_RUN_TYPES: readonly FactLedgerRunType[] = ['user', 'fixture'] as const;

export interface IFactLedgerVersion {
  version: number;
  facts: LedgerFact[];
  unresolved: LedgerUnresolvedFact[];
  createdAt: Date;
  reason: FactLedgerVersionReason;
}

export interface IFactLedger extends Document {
  userId: Types.ObjectId;
  /** The rule-pack id the ledger was read against. */
  documentKind: string;
  runType: FactLedgerRunType;
  /** The intake the ledger was written for. An id only. */
  intakeId?: string;
  /** The number of the last version; equals `versions.length`. */
  currentVersion: number;
  versions: IFactLedgerVersion[];
  createdAt: Date;
  updatedAt: Date;
}

const FactLedgerVersionSchema = new Schema<IFactLedgerVersion>(
  {
    version: { type: Number, required: true, min: 1 },
    // Stored as written: a fact's `value` is typed per fact type (ADR-022).
    facts: { type: Schema.Types.Mixed, default: () => [] },
    unresolved: { type: Schema.Types.Mixed, default: () => [] },
    createdAt: { type: Date, required: true },
    reason: { type: String, enum: FACT_LEDGER_REASONS, required: true },
  },
  { _id: false },
);

const FactLedgerSchema = new Schema<IFactLedger>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    documentKind: { type: String, required: true, maxlength: 100 },
    runType: { type: String, enum: FACT_LEDGER_RUN_TYPES, required: true },
    intakeId: { type: String, default: undefined, maxlength: 100 },
    currentVersion: { type: Number, required: true, min: 1 },
    versions: { type: [FactLedgerVersionSchema], default: [] },
  },
  { timestamps: true },
);

FactLedgerSchema.index({ userId: 1, createdAt: -1 });
FactLedgerSchema.index({ intakeId: 1 });

export const FactLedgerModel = mongoose.model<IFactLedger>(
  'FactLedger',
  FactLedgerSchema,
  'factledgers',
);

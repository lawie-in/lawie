/**
 * FactLedger — the advocate's facts for one brief, versioned (T-147b, ADR-022
 * section 2A).
 *
 * Every write appends a version; an earlier version is never changed, so the
 * ledger is an audit record of what the advocate said and what they
 * corrected. Only `fact-ledger.service.ts` writes here, and only with `$push`.
 * The one exception is the one-off T-115a backfill
 * (`src/scripts/encrypt-case-details.ts`), which rewrites each legacy version
 * from plain `facts` / `unresolved` to `factsEnc` without changing what it
 * holds (checked by decrypting before the write).
 *
 * Encryption (T-115a): a version written since T-115a holds `factsEnc` =
 * encrypt(JSON.stringify({ facts, unresolved })) and no plain `facts` or
 * `unresolved`. A version written before holds the plain fields until the
 * backfill runs. Read a version only through `openVersion` in
 * `fact-ledger.service.ts`, which handles both.
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

import { fixtureOriginPlugin } from '../services/run-origin';

export const FACT_LEDGER_REASONS: readonly FactLedgerVersionReason[] = [
  'extract',
  'answer',
  'edit',
] as const;
export const FACT_LEDGER_RUN_TYPES: readonly FactLedgerRunType[] = ['user', 'fixture'] as const;

export interface IFactLedgerVersion {
  version: number;
  /** Legacy, plain: only on a version written before T-115a and not yet backfilled. */
  facts?: LedgerFact[];
  /** Legacy, plain: only on a version written before T-115a and not yet backfilled. */
  unresolved?: LedgerUnresolvedFact[];
  /** T-115a — encrypt(JSON.stringify({ facts, unresolved })). Read through `openVersion`. */
  factsEnc?: string;
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
    // Legacy plain fields (T-115a): kept so pre-T-115a rows still read, with no
    // default. Mongoose applies a default on create and when casting a $push
    // subdocument, so a default would put plain fields back on every version.
    facts: { type: Schema.Types.Mixed },
    unresolved: { type: Schema.Types.Mixed },
    factsEnc: { type: String },
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

// T-147e: a ledger written for the golden-set user is always 'fixture'.
FactLedgerSchema.plugin(fixtureOriginPlugin('runType'));

FactLedgerSchema.index({ userId: 1, createdAt: -1 });
FactLedgerSchema.index({ intakeId: 1 });

export const FactLedgerModel = mongoose.model<IFactLedger>(
  'FactLedger',
  FactLedgerSchema,
  'factledgers',
);

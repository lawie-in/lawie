/**
 * FactLedgerV3 — the v3 typed fact ledger, one per run (T-682;
 * handoff/design/T-682-ledger-schema.md §2, approved by Arjun).
 *
 * A new collection, `factledgers_v3`: the v2 `factledgers` collection is not
 * touched. Only `services/v3/ledger.service.ts` writes here, and only with a
 * `$push` of one version guarded by `currentVersion` (append-only: an earlier
 * version is never changed).
 *
 * Encryption (T-115a helper and key): each version holds `sealed` =
 * encrypt(JSON.stringify({ entries, nonAnswers })). Everything about a fact
 * (value, display, quote, candidates, detail) is inside `sealed`. The plain
 * fields are ids, keys (`changedKeys`), reasons, counts and timestamps only.
 * KEY ROTATION: a rotation of the encryption key must re-seal BOTH this
 * collection and the v2 `factledgers` (no rotation code exists in T-682).
 *
 * Privacy: no description text is stored here or on the run (Arjun Q4). The
 * advocate's words for one value (`quote`) are stored sealed and are never
 * logged or sent to Sentry. No TTL: rows go with the account (account-erase)
 * or with the document (document-erase, through the intake id).
 */
import mongoose, { Document, Schema, Types } from 'mongoose';

import { fixtureOriginPlugin } from '../services/run-origin';
import type { LedgerVersionReason } from '../services/v3/ledger.types';

export const FACT_LEDGER_V3_REASONS: readonly LedgerVersionReason[] = [
  'extract',
  'answer',
  'edit',
  'conflict_resolved',
  'import_v2',
  'kind_change',
] as const;

export interface IFactLedgerV3Version {
  version: number;
  reason: LedgerVersionReason;
  createdAt: Date;
  /** Keys whose entries changed in this version (keys only, no values). */
  changedKeys: string[];
  /** encrypt(JSON.stringify({ entries, nonAnswers })). */
  sealed: string;
}

export interface IFactLedgerV3 extends Document {
  runId: string;
  userId: Types.ObjectId;
  packId: string;
  runType: 'user' | 'fixture';
  intakeId?: string;
  /** The v2 ledger read into version 1 (`import_v2`). An id only. */
  importedFrom?: Types.ObjectId;
  /** The number of the last version; equals `versions.length`. */
  currentVersion: number;
  versions: IFactLedgerV3Version[];
  createdAt: Date;
  updatedAt: Date;
}

const FactLedgerV3VersionSchema = new Schema<IFactLedgerV3Version>(
  {
    version: { type: Number, required: true, min: 1 },
    reason: { type: String, enum: FACT_LEDGER_V3_REASONS, required: true },
    createdAt: { type: Date, required: true },
    changedKeys: { type: [String], default: [] },
    sealed: { type: String, required: true },
  },
  { _id: false },
);

const FactLedgerV3Schema = new Schema<IFactLedgerV3>(
  {
    runId: { type: String, required: true, maxlength: 100 },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    packId: { type: String, required: true, maxlength: 100 },
    runType: { type: String, enum: ['user', 'fixture'], required: true },
    intakeId: { type: String, default: undefined, maxlength: 100 },
    importedFrom: { type: Schema.Types.ObjectId, default: undefined },
    currentVersion: { type: Number, required: true, min: 1 },
    versions: { type: [FactLedgerV3VersionSchema], default: [] },
  },
  { timestamps: true },
);

// T-147e: a ledger written for the golden-set user is always 'fixture'.
FactLedgerV3Schema.plugin(fixtureOriginPlugin('runType'));

// One ledger per run (invariant 1) and the run lookup.
FactLedgerV3Schema.index({ runId: 1 }, { unique: true });
// The user's own ledgers: account export and erase.
FactLedgerV3Schema.index({ userId: 1, createdAt: -1 });
// Resume and carry-over on a change of kind; document erase by intake.
FactLedgerV3Schema.index({ intakeId: 1 });

export const FactLedgerV3Model = mongoose.model<IFactLedgerV3>(
  'FactLedgerV3',
  FactLedgerV3Schema,
  'factledgers_v3',
);

import { DocType, DOC_TYPES, COURT_TYPES } from '@lawie/shared';
import mongoose, { Document, Schema, Types } from 'mongoose';

import { fixtureOriginPlugin, RUN_ORIGINS, RunOrigin } from '../services/run-origin';

/** T-705: how many revisions a draft may have (the 11th is refused, 429 revision_limit). */
export const REVISION_LIMIT = 10;
/** T-705: how many earlier versions a document keeps (oldest dropped first). */
export const PREVIOUS_VERSIONS_KEEP = 5;

/**
 * T-705 — one earlier text of the document, kept when a revision replaced it.
 * `content` is sealed with the same helper as generatedContent / finalContent
 * (utils/encryption). Erased with the document (it lives on the row).
 */
export interface IPreviousVersion {
  version: number;
  content: string;
  createdAt: Date;
}

export interface IDocument extends Document {
  userId: Types.ObjectId;
  templateId?: Types.ObjectId;

  title: string;
  docType: DocType;
  courtType?: string;
  courtName?: string;

  /**
   * T-115a — legacy, plain. Rows written before T-115a hold the case details
   * here until the backfill encrypts them. New writes leave it unset. Read
   * through `readFormInputs` (utils/case-details), never directly.
   */
  formInputs?: Record<string, unknown> | null;
  /** T-115a — the case details, encrypt(JSON.stringify(inputs)). Read through `readFormInputs`. */
  formInputsEnc?: string;
  generatedContent: string; // AI-generated draft (encrypted)
  finalContent?: string; // user-edited version (encrypted)

  status: 'draft' | 'finalised' | 'exported';
  exportedAs: string[];

  sectionsCited: string[]; // ["BNS 103", "BNSS 190"]

  /**
   * T-115a — legacy, plain. The checklist items, filled with the user's form
   * values. Rows written before T-115a hold it here until the backfill; new
   * writes leave it unset. Read through `readFilingChecklist`, never directly.
   */
  filingChecklist?: string[];
  /** T-115a — encrypt(JSON.stringify(items)). Read through `readFilingChecklist`. */
  filingChecklistEnc?: string;
  // Stays plain (T-115a): booleans only, parallel to the checklist.
  checklistState: boolean[]; // per-item checked state (parallel array)

  version: number;
  /**
   * Hides the document from every read. T-115b: set together with
   * `deletion.requestedAt` when the owner deletes it; the row itself is then
   * erased (services/document-erase.service.ts).
   */
  isDeleted: boolean;
  /**
   * T-115b — the delete marker. Set on `DELETE /documents/:id`, before any
   * erase step, and kept until the row itself is removed (the last step). The
   * sweep finishes any document that still has it. `intakeIds` / `ledgerIds`
   * are the links to the FactLedger and LlmAuxCall rows, saved before the
   * steps that remove them, so a re-run still finds those rows. Ids only.
   */
  deletion?: {
    requestedAt: Date;
    intakeIds: string[];
    ledgerIds: Types.ObjectId[];
  };

  /** T-003 §3.8 — the run that produced this document, and which attempt within it. */
  runId?: string;
  runSequence?: number;

  /**
   * T-705 — revisions delivered on this draft. `count` counts delivered
   * revisions only (a failed, withheld or refused one is not counted);
   * `freeUsed` is set by the first delivered revision. Absent on older rows,
   * which read as {count: 0, freeUsed: false}.
   */
  revisions?: { count: number; freeUsed: boolean };
  /** T-705 — the texts revisions replaced, newest last, at most PREVIOUS_VERSIONS_KEEP. Sealed. */
  previousVersions?: IPreviousVersion[];

  /** T-106 — the rule pack the draft was written under. Unset for a draft from a form. */
  rulePackId?: string;
  /**
   * T-106, ADR-021 rule 6 — true when the draft carries "Starting draft — review
   * before use · not court-verified". Set by the server. The user cannot clear it.
   */
  startingDraft?: boolean;
  /** T-106 — the confirmed brief the draft was written from (encrypted). A revision needs it. */
  brief?: string;
  /**
   * T-147e — 'fixture' for a golden-set run, 'user' otherwise. Rows written
   * before T-147e have no value and count as 'user'. Filter with NOT_FIXTURE.
   */
  runType?: RunOrigin;

  createdAt: Date;
  updatedAt: Date;
}

const DocumentSchema = new Schema<IDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
    },
    templateId: {
      type: Schema.Types.ObjectId,
      ref: 'Template',
      default: null,
    },

    title: {
      type: String,
      required: [true, 'title is required'],
      trim: true,
      maxlength: [300, 'title too long'],
    },
    docType: {
      type: String,
      enum: Object.values(DOC_TYPES),
      required: [true, 'docType is required'],
    },
    courtType: {
      type: String,
      enum: Object.values(COURT_TYPES),
    },
    courtName: {
      type: String,
      default: '',
      trim: true,
      maxlength: [200, 'courtName too long'],
    },

    // T-115a — kept in the schema so legacy rows still read (strict mode would
    // drop it), but with no default: a default would write a plain field on
    // every new document.
    formInputs: {
      type: Schema.Types.Mixed,
    },
    formInputsEnc: {
      type: String,
      default: undefined,
    },
    generatedContent: {
      type: String,
      required: [true, 'generatedContent is required'],
    },
    finalContent: {
      type: String,
      default: null,
    },

    status: {
      type: String,
      enum: ['draft', 'finalised', 'exported'],
      default: 'draft',
    },
    exportedAs: {
      type: [String],
      default: [],
    },

    sectionsCited: {
      type: [String],
      default: [],
    },

    // T-115a — kept for legacy rows. `default: undefined` because a Mongoose
    // array defaults to [] otherwise, which would write a plain field on every
    // new document.
    filingChecklist: {
      type: [String],
      default: undefined,
    },
    filingChecklistEnc: {
      type: String,
      default: undefined,
    },
    checklistState: {
      type: [Boolean],
      default: [],
    },

    version: {
      type: Number,
      default: 1,
      min: 1,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    // T-115b — no default: unset on every live document.
    deletion: {
      type: new Schema(
        {
          requestedAt: { type: Date, required: true },
          intakeIds: { type: [String], default: [] },
          ledgerIds: { type: [Schema.Types.ObjectId], default: [] },
        },
        { _id: false },
      ),
      default: undefined,
    },

    runId: { type: String, default: undefined },
    runSequence: { type: Number, default: undefined },

    // T-705: no defaults, so a document that was never revised is written as before.
    revisions: {
      type: new Schema(
        {
          count: { type: Number, default: 0, min: 0 },
          freeUsed: { type: Boolean, default: false },
        },
        { _id: false },
      ),
      default: undefined,
    },
    previousVersions: {
      type: [
        new Schema<IPreviousVersion>(
          {
            version: { type: Number, required: true },
            content: { type: String, required: true },
            createdAt: { type: Date, required: true },
          },
          { _id: false },
        ),
      ],
      default: undefined,
    },

    rulePackId: { type: String, default: undefined, maxlength: 100 },
    startingDraft: { type: Boolean, default: undefined },
    brief: { type: String, default: undefined },
    runType: { type: String, enum: RUN_ORIGINS, default: 'user' },
  },
  { timestamps: true },
);

DocumentSchema.plugin(fixtureOriginPlugin('runType'));

// -- Indexes per CTO schema design --
DocumentSchema.index({ userId: 1, createdAt: -1 });
DocumentSchema.index({ docType: 1 });
DocumentSchema.index({ isDeleted: 1 });
// T-115b — the erase sweep finds unfinished deletes by this.
DocumentSchema.index({ 'deletion.requestedAt': 1 }, { sparse: true });

export const LawieDocument = mongoose.model<IDocument>('Document', DocumentSchema);

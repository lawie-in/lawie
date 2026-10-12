import { DocType, DOC_TYPES, COURT_TYPES } from '@lawie/shared';
import mongoose, { Document, Schema, Types } from 'mongoose';

import { fixtureOriginPlugin, RUN_ORIGINS, RunOrigin } from '../services/run-origin';

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
  isDeleted: boolean; // soft delete — never hard delete

  /** T-003 §3.8 — the run that produced this document, and which attempt within it. */
  runId?: string;
  runSequence?: number;

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

    runId: { type: String, default: undefined },
    runSequence: { type: Number, default: undefined },

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

export const LawieDocument = mongoose.model<IDocument>('Document', DocumentSchema);

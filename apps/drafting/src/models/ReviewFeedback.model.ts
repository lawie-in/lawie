/**
 * ReviewFeedback model — SCRUM-74
 *
 * Structured feedback from a Jharkhand panel advocate on a specific draft.
 * Form schema combines Ajay's CLO 1-page checklist (Round 3, 2026-04-30) with
 * the SCRUM-74 spec fields: court-readiness, factual correctness, prayer
 * language, citations, annexures, formatting, plus an overall verdict.
 *
 * One ReviewFeedback per ReviewToken (token is single-use).
 * Founder reviews aggregate at /admin/panel-review.
 */
import mongoose, { Document, Schema, Types } from 'mongoose';

export type ReviewVerdict = 'ready_to_file' | 'minor_edits' | 'major_edits' | 'reject';

export const REVIEW_VERDICTS: ReviewVerdict[] = [
  'ready_to_file',
  'minor_edits',
  'major_edits',
  'reject',
];

export interface IReviewFeedback extends Document {
  reviewTokenId: Types.ObjectId;  // ref to ReviewToken
  documentId: Types.ObjectId;     // denormalised for aggregation queries
  assignedTo: string;             // denormalised advocate name (display only)

  // 1-page checklist (yes/no)
  causeTitleCorrect: boolean;
  sectionsCorrect: boolean;
  factsAccurate: boolean;
  prayerCorrect: boolean;
  citationsCorrect: boolean;
  annexuresSufficient: boolean;
  formattingCorrect: boolean;
  wouldFileAfterEdits: boolean;

  overallVerdict: ReviewVerdict;
  comments?: string;              // freeform comments

  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ReviewFeedbackSchema = new Schema<IReviewFeedback>(
  {
    reviewTokenId: {
      type: Schema.Types.ObjectId,
      ref: 'ReviewToken',
      required: true,
      unique: true,
    },
    documentId: {
      type: Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
    },
    assignedTo: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    causeTitleCorrect: { type: Boolean, required: true },
    sectionsCorrect: { type: Boolean, required: true },
    factsAccurate: { type: Boolean, required: true },
    prayerCorrect: { type: Boolean, required: true },
    citationsCorrect: { type: Boolean, required: true },
    annexuresSufficient: { type: Boolean, required: true },
    formattingCorrect: { type: Boolean, required: true },
    wouldFileAfterEdits: { type: Boolean, required: true },

    overallVerdict: {
      type: String,
      enum: REVIEW_VERDICTS,
      required: true,
    },
    comments: {
      type: String,
      maxlength: [10_000, 'comments too long'],
    },

    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// reviewTokenId unique index is declared on the field above.
ReviewFeedbackSchema.index({ documentId: 1 });
ReviewFeedbackSchema.index({ submittedAt: -1 });

export const ReviewFeedback = mongoose.model<IReviewFeedback>(
  'ReviewFeedback',
  ReviewFeedbackSchema,
);

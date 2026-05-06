import { DocType, DOC_TYPES, COURT_TYPES } from '@lawie/shared';
import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IDocument extends Document {
  userId: Types.ObjectId;
  templateId?: Types.ObjectId;

  title: string;
  docType: DocType;
  courtType?: string;
  courtName?: string;

  formInputs?: Record<string, unknown>;
  generatedContent: string; // AI-generated draft (encrypted)
  finalContent?: string; // user-edited version (encrypted)

  status: 'draft' | 'finalised' | 'exported';
  exportedAs: string[];

  sectionsCited: string[]; // ["BNS 103", "BNSS 190"]

  version: number;
  isDeleted: boolean; // soft delete — never hard delete

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

    formInputs: {
      type: Schema.Types.Mixed,
      default: null,
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

    version: {
      type: Number,
      default: 1,
      min: 1,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

// -- Indexes per CTO schema design --
DocumentSchema.index({ userId: 1, createdAt: -1 });
DocumentSchema.index({ docType: 1 });
DocumentSchema.index({ isDeleted: 1 });

export const LawieDocument = mongoose.model<IDocument>('Document', DocumentSchema);

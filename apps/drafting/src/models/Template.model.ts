import { DocType, CourtType, DOC_TYPES, COURT_TYPES } from '@lawie/shared';
import mongoose, { Document, Schema } from 'mongoose';

export interface ITemplate extends Document {
  docType: DocType;
  courtType: CourtType;
  content: string;
  version: number;
  approvedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const TemplateSchema = new Schema<ITemplate>(
  {
    docType: {
      type: String,
      enum: Object.values(DOC_TYPES),
      required: [true, 'docType is required'],
    },
    courtType: {
      type: String,
      enum: Object.values(COURT_TYPES),
      required: [true, 'courtType is required'],
    },
    content: {
      type: String,
      required: [true, 'content is required'],
    },
    version: {
      type: Number,
      default: 1,
      min: 1,
    },
    approvedBy: {
      type: String,
      required: [true, 'approvedBy is required'],
      trim: true,
    },
  },
  { timestamps: true },
);

TemplateSchema.index({ docType: 1, courtType: 1 });
TemplateSchema.index({ docType: 1, version: -1 });

export const Template = mongoose.model<ITemplate>('Template', TemplateSchema);

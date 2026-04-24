import { DocType, DocStatus, DOC_TYPES, DOC_STATUSES } from '@lawie/shared';
import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IDocument extends Document {
  userId: Types.ObjectId;
  docType: DocType;
  courtName: string;
  /**
   * Stored as AES-256-GCM encrypted string (see utils/encryption.ts).
   * Always encrypt before saving; decrypt after reading.
   */
  content: string;
  status: DocStatus;
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
    docType: {
      type: String,
      enum: Object.values(DOC_TYPES),
      required: [true, 'docType is required'],
    },
    courtName: {
      type: String,
      required: [true, 'courtName is required'],
      trim: true,
      maxlength: [200, 'courtName too long'],
    },
    // Content is stored encrypted — use utils/encryption.ts in the service layer
    content: {
      type: String,
      required: [true, 'content is required'],
    },
    status: {
      type: String,
      enum: Object.values(DOC_STATUSES),
      default: DOC_STATUSES.DRAFT,
    },
  },
  { timestamps: true },
);

DocumentSchema.index({ userId: 1 });
DocumentSchema.index({ docType: 1 });
DocumentSchema.index({ createdAt: -1 });
DocumentSchema.index({ userId: 1, docType: 1, createdAt: -1 });

export const LawieDocument = mongoose.model<IDocument>('Document', DocumentSchema);

/**
 * TemplateUsage — per-event usage log for the Template collection.
 *
 * Splits out of Template.usageCount (SCRUM-80, ADR-018). Each successful
 * generation writes one row here so we can aggregate top-templates / per-user
 * usage without coupling write traffic to the read-through Template cache.
 *
 * The Express app writes to this collection; the Template collection is
 * filesystem-driven and read-only from the app's perspective.
 */
import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ITemplateUsage extends Document {
  templateId: string; // matches Template.templateId (NOT an ObjectId — string id from doc-rule)
  userId: Types.ObjectId;
  documentId?: Types.ObjectId;
  source: 'generate' | 'preview' | 'admin';
  createdAt: Date;
}

const TemplateUsageSchema = new Schema<ITemplateUsage>(
  {
    templateId: { type: String, required: true, lowercase: true, trim: true },
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    documentId: { type: Schema.Types.ObjectId, ref: 'Document' },
    source: {
      type: String,
      enum: ['generate', 'preview', 'admin'],
      default: 'generate',
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

TemplateUsageSchema.index({ templateId: 1, createdAt: -1 });
TemplateUsageSchema.index({ userId: 1, createdAt: -1 });

export const TemplateUsage = mongoose.model<ITemplateUsage>('TemplateUsage', TemplateUsageSchema);

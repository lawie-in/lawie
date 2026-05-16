/**
 * SectionBookmark — per-user starred section reference (SCRUM-83).
 *
 * Source-of-truth on the server; the Section Finder side panel mirrors this
 * into localStorage for offline read but writes go through the API. Unique on
 * (userId, code, section) so a star-twice is a no-op.
 */
import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ISectionBookmark extends Document {
  userId: Types.ObjectId;
  code: string;
  section: string;
  title: string;
  createdAt: Date;
}

const SectionBookmarkSchema = new Schema<ISectionBookmark>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    code: { type: String, required: true, trim: true, maxlength: 10 },
    section: { type: String, required: true, trim: true, maxlength: 20 },
    title: { type: String, default: '', maxlength: 300 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

SectionBookmarkSchema.index({ userId: 1, code: 1, section: 1 }, { unique: true });
SectionBookmarkSchema.index({ userId: 1, createdAt: -1 });

export const SectionBookmark = mongoose.model<ISectionBookmark>(
  'SectionBookmark',
  SectionBookmarkSchema,
);

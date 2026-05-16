/**
 * SectionRecent — per-user recent-section-lookup log (SCRUM-83).
 *
 * Powers the Recent tab in the Section Finder side panel. Last 20 are
 * returned by the GET endpoint; older rows are pruned by a separate cron
 * (>30 days) to be filed as a follow-up.
 *
 * Unique on (userId, code, section) so repeat lookups bump the existing
 * row's `searchedAt` rather than piling up duplicates.
 */
import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ISectionRecent extends Document {
  userId: Types.ObjectId;
  code: string;
  section: string;
  title: string;
  searchedAt: Date;
}

const SectionRecentSchema = new Schema<ISectionRecent>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    code: { type: String, required: true, trim: true, maxlength: 10 },
    section: { type: String, required: true, trim: true, maxlength: 20 },
    title: { type: String, default: '', maxlength: 300 },
    searchedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: false },
);

SectionRecentSchema.index({ userId: 1, code: 1, section: 1 }, { unique: true });
SectionRecentSchema.index({ userId: 1, searchedAt: -1 });

export const SectionRecent = mongoose.model<ISectionRecent>('SectionRecent', SectionRecentSchema);

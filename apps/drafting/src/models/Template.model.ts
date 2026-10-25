/**
 * Template — Mongo read-through cache for the in-memory TemplateConfig registry.
 *
 * Per ADR-018 (template wiring, 2026-05-12): the file system at
 * `apps/drafting/src/config/document-rules/*.json` is the single source of truth.
 * This collection mirrors what the SCRUM-78 promoter produces so that catalog
 * listing, plan-gated access checks, and admin reporting have an indexed view
 * without re-reading 92 JSONs on every request.
 *
 * Write-paths: ONLY `syncTemplateRegistry()` (template-seed.service.ts). The
 * Express app must never write to this collection. usageCount lives in the
 * separate TemplateUsage collection.
 *
 * Schema is intentionally loose — `category`, `court_levels`, and `plan_access`
 * carry the values CLO actually authors (not the narrower SCRUM-40 enums) so
 * future doc-types ship with zero schema migration.
 */
import mongoose, { Document, Schema } from 'mongoose';

export interface ITemplate extends Document {
  templateId: string;
  displayName: string;
  slug: string;
  category: string;
  /** T-240: library category id (one of T-239's 26), from config/catalogue. */
  catalogueCategory: string;
  description: string;
  icon: string;
  planAccess: 'free' | 'pro';
  courtLevels: string[];
  states: string[];
  supportedLanguages: string[];
  creditsCost: number;
  formSchema: Record<string, unknown>;
  documentStructure: Record<string, unknown>;
  validationRules: Record<string, unknown>;
  relatedActs: string[];
  filingChecklist: string[];
  metadata: Record<string, unknown>;
  source: Record<string, unknown>;
  sourceFile: string;
  isActive: boolean;
  promotedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TemplateSchema = new Schema<ITemplate>(
  {
    templateId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    // A duplicate of templateId (the catalogue template_id); the sync service
    // writes both to the same value. Kept because pre-SCRUM-80 rows may have
    // only slug: the sync service and GET /templates' hidden-template filter
    // (T-385) match on either. No route reads it by slug (T-385 removed /:slug).
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    displayName: { type: String, required: true, trim: true, maxlength: 200 },
    category: { type: String, required: true, trim: true },
    // T-240: the library category, from config/catalogue (never the rule file).
    // `category` above stays the behaviour value. The seed always writes it.
    catalogueCategory: { type: String, required: true, trim: true },
    description: { type: String, default: '', maxlength: 2000 },
    icon: { type: String, default: 'file-text' },
    planAccess: { type: String, enum: ['free', 'pro'], default: 'free' },
    courtLevels: { type: [String], default: [] },
    states: { type: [String], default: ['all'] },
    supportedLanguages: { type: [String], default: ['en'] },
    // T-227: no default. The seed writes the price from the one price list
    // (credits.service TEMPLATE_PRICES); a row without one is invalid.
    creditsCost: { type: Number, required: true, min: 0 },
    formSchema: { type: Schema.Types.Mixed, default: () => ({ steps: [] }) },
    documentStructure: { type: Schema.Types.Mixed, default: () => ({ sections: [] }) },
    validationRules: { type: Schema.Types.Mixed, default: () => ({}) },
    relatedActs: { type: [String], default: [] },
    filingChecklist: { type: [String], default: [] },
    metadata: { type: Schema.Types.Mixed, default: () => ({}) },
    source: { type: Schema.Types.Mixed, default: () => ({}) },
    sourceFile: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    promotedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

// Indexes — catalog filters by plan + category, sort by display name.
TemplateSchema.index({ category: 1 });
TemplateSchema.index({ catalogueCategory: 1 });
TemplateSchema.index({ planAccess: 1 });
TemplateSchema.index({ isActive: 1 });
TemplateSchema.index({ courtLevels: 1 });

export const Template = mongoose.model<ITemplate>('Template', TemplateSchema);

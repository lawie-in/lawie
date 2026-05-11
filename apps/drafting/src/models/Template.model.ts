import { DocType, DOC_TYPES } from '@lawie/shared';
import mongoose, { Document, Schema } from 'mongoose';

export interface ITemplate extends Document {
  name: string;
  slug: string;
  category: 'criminal' | 'civil' | 'corporate' | 'family';
  docType: DocType;
  courtType?: string;

  description: string;
  formSchema?: Record<string, unknown>; // JSON schema for guided form
  promptTemplate: string; // AI prompt with {{placeholders}}

  planAccess: 'free' | 'pro';

  reviewedBy: string; // CLO agent/name
  reviewedAt?: Date;
  isActive: boolean;

  usageCount: number;

  createdAt: Date;
  updatedAt: Date;
}

const TemplateSchema = new Schema<ITemplate>(
  {
    name: {
      type: String,
      required: [true, 'name is required'],
      trim: true,
      maxlength: [200, 'name too long'],
    },
    slug: {
      type: String,
      required: [true, 'slug is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ['criminal', 'civil', 'corporate', 'family'],
      required: [true, 'category is required'],
    },
    docType: {
      type: String,
      enum: Object.values(DOC_TYPES),
      required: [true, 'docType is required'],
    },
    courtType: {
      type: String,
      enum: [
        'district_court',
        'high_court',
        'supreme_court',
        'tribunal',
        'consumer_forum',
        'family_court',
      ],
    },

    description: {
      type: String,
      required: [true, 'description is required'],
      maxlength: [500, 'description too long'],
    },
    formSchema: {
      type: Schema.Types.Mixed,
      default: null,
    },
    promptTemplate: {
      type: String,
      required: [true, 'promptTemplate is required'],
    },

    planAccess: {
      type: String,
      enum: ['free', 'pro'],
      default: 'free',
    },

    reviewedBy: {
      type: String,
      required: [true, 'reviewedBy is required'],
      trim: true,
    },
    reviewedAt: Date,
    isActive: {
      type: Boolean,
      default: true,
    },

    usageCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

// -- Indexes per CTO schema design --
// slug index created by `unique: true` on field definition
TemplateSchema.index({ category: 1 });
TemplateSchema.index({ docType: 1 });
TemplateSchema.index({ planAccess: 1 });
TemplateSchema.index({ isActive: 1 });

export const Template = mongoose.model<ITemplate>('Template', TemplateSchema);

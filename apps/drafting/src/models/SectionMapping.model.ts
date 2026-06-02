import mongoose, { Document, Schema } from 'mongoose';

export type MappingType = 'direct' | 'partial' | 'merged' | 'split' | 'repealed';

export interface ISectionMapping extends Document {
  oldCode: string; // IPC, CrPC, IEA
  oldCodeFull: string; // Indian Penal Code, 1860
  newCode: string; // BNS, BNSS, BSA
  newCodeFull: string; // Bharatiya Nyaya Sanhita, 2023
  oldSection: string; // "302", "498A", "120B"
  newSection: string | null; // "103(1)", null for repealed
  oldTitle: string;
  newTitle: string | null;
  mappingType: MappingType;
  notes: string;
  effectiveDate: Date;
  validatedBy: string;
  validatedAt: Date | null;
  isActive: boolean;
  // For new provisions (no old equivalent)
  isNewProvision: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SectionMappingSchema = new Schema<ISectionMapping>(
  {
    oldCode: {
      type: String,
      required: [true, 'oldCode is required'],
      enum: ['IPC', 'CrPC', 'IEA'],
      index: true,
    },
    oldCodeFull: {
      type: String,
      required: [true, 'oldCodeFull is required'],
    },
    newCode: {
      type: String,
      required: [true, 'newCode is required'],
      enum: ['BNS', 'BNSS', 'BSA'],
      index: true,
    },
    newCodeFull: {
      type: String,
      required: [true, 'newCodeFull is required'],
    },
    oldSection: {
      type: String,
      required: [true, 'oldSection is required'],
      trim: true,
    },
    newSection: {
      type: String,
      default: null,
      trim: true,
    },
    oldTitle: {
      type: String,
      required: [true, 'oldTitle is required'],
      trim: true,
    },
    newTitle: {
      type: String,
      default: null,
      trim: true,
    },
    mappingType: {
      type: String,
      required: [true, 'mappingType is required'],
      enum: ['direct', 'partial', 'merged', 'split', 'repealed'],
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    effectiveDate: {
      type: Date,
      required: true,
      default: new Date('2024-07-01'),
    },
    validatedBy: {
      type: String,
      default: 'Pending CLO review',
      trim: true,
    },
    validatedAt: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isNewProvision: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

// Compound index for fast old→new lookups
SectionMappingSchema.index({ oldCode: 1, oldSection: 1 }, { unique: false });
// Compound index for fast new→old reverse lookups
SectionMappingSchema.index({ newCode: 1, newSection: 1 });
// Filter active mappings quickly
SectionMappingSchema.index({ isActive: 1 });
// Unique constraint: one mapping per old code + old section (for regular mappings)
SectionMappingSchema.index({ oldCode: 1, oldSection: 1, isNewProvision: 1 }, { unique: true });

export const SectionMapping = mongoose.model<ISectionMapping>(
  'SectionMapping',
  SectionMappingSchema,
);

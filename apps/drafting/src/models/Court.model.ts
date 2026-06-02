import mongoose, { Document, Schema } from 'mongoose';

export interface ICourt extends Document {
  courtId: string;
  name: string;
  designation: string;
  courtType:
    | 'high_court'
    | 'sessions'
    | 'district_court'
    | 'jmfc'
    | 'cjm'
    | 'civil_court'
    | 'consumer_commission';
  state: string;
  stateId: string;
  city: string;
  formattingRulesRef: string;
  caseNomenclature: string;
  supportedLanguages: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CourtSchema = new Schema<ICourt>(
  {
    courtId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    designation: {
      type: String,
      required: true,
      trim: true,
    },
    courtType: {
      type: String,
      enum: [
        'high_court',
        'sessions',
        'district_court',
        'jmfc',
        'cjm',
        'civil_court',
        'consumer_commission',
      ],
      required: true,
    },
    state: {
      type: String,
      required: true,
      trim: true,
    },
    stateId: {
      type: String,
      required: true,
      trim: true,
    },
    city: {
      type: String,
      required: true,
      trim: true,
    },
    formattingRulesRef: {
      type: String,
      required: true,
      trim: true,
    },
    caseNomenclature: {
      type: String,
      default: 'Case No. _____ of [YEAR]',
    },
    supportedLanguages: {
      type: [String],
      default: ['en'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

CourtSchema.index({ stateId: 1, courtType: 1 });
CourtSchema.index({ stateId: 1 });
CourtSchema.index({ courtType: 1 });
CourtSchema.index({ isActive: 1 });

export const Court = mongoose.model<ICourt>('Court', CourtSchema);

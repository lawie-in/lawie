import mongoose, { Document, Schema } from 'mongoose';

export interface ICourt extends Document {
  courtId: string;
  name: string;
  designation: string;
  courtType: // T-634: every type indian-courts.json carries.
    | 'supreme_court'
    | 'high_court'
    | 'high_court_bench'
    | 'sessions'
    | 'district_court'
    | 'jmfc'
    | 'cjm'
    | 'civil_court'
    | 'civil_court_junior'
    | 'consumer_commission'
    | 'tribunal';
  state: string;
  stateId: string;
  city: string;
  formattingRulesRef: string;
  caseNomenclature: string;
  supportedLanguages: string[];
  /**
   * T-482: when set, the court is listed only for these template ids (courts.routes.ts):
   * never in an unscoped list or another template's list. A by-id lookup still finds it.
   */
  templates?: string[];
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
        // T-634: every type indian-courts.json carries.
        'supreme_court',
        'high_court',
        'high_court_bench',
        'sessions',
        'district_court',
        'jmfc',
        'cjm',
        'civil_court',
        'civil_court_junior',
        'consumer_commission',
        'tribunal',
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
    // T-482: no default, so a court without the field stays without it (listed for all).
    templates: {
      type: [String],
      default: undefined,
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

/**
 * AppSetting (billing, T-540): a READ-ONLY view of the runtime key/value store
 * that drafting owns (apps/drafting/src/models/AppSetting.model.ts). Same shared
 * database, same `appsettings` collection, same fields.
 *
 * Billing never writes this collection: the founder edits keys through
 * drafting's /admin/ai-config. Billing only reads `feature.coupon_free_grant`
 * through services/app-settings.service.ts.
 */
import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IAppSetting extends Document {
  key: string;
  value: string;
  description?: string;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AppSettingSchema = new Schema<IAppSetting>(
  {
    key: { type: String, required: true, trim: true },
    value: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  {
    timestamps: true,
    collection: 'appsettings',
    // Drafting owns the collection and its unique `key` index; billing never
    // builds indexes on it.
    autoIndex: false,
    autoCreate: false,
  },
);

export const AppSetting = mongoose.model<IAppSetting>('AppSetting', AppSettingSchema);

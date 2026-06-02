/**
 * AppSetting — runtime-configurable key/value store
 *
 * Used for settings that should be changeable WITHOUT a code deploy or env
 * rotation. Today's keys:
 *
 *   ai.drafting_model  — Anthropic model id for the main bail/notice/petition body
 *   ai.preflight_model — Anthropic model id for the SCRUM-69 verifier layer
 *
 * Source of truth is Mongo. The drafting service reads via the AppSettings
 * service (in-memory TTL cache) so we don't hit Mongo on every LLM call. The
 * founder edits via /admin/ai-config in the dashboard.
 *
 * No default values live in the codebase or in env files — if a required key is
 * missing, the drafting service throws a clear error that tells the founder
 * which key to set in the admin UI. Bootstrap is done via scripts/seed-app-settings.ts
 * which takes the key + value as CLI args (also no hardcoded names there).
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
    key: {
      type: String,
      required: [true, 'key is required'],
      unique: true,
      trim: true,
      maxlength: [120, 'key too long'],
      match: [/^[a-z][a-z0-9_.-]*$/i, 'key must be lowercase alphanumeric with . _ -'],
    },
    value: {
      type: String,
      required: [true, 'value is required'],
      trim: true,
      maxlength: [500, 'value too long'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'description too long'],
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true },
);

// key unique index is declared on the field above.

export const AppSetting = mongoose.model<IAppSetting>('AppSetting', AppSettingSchema);

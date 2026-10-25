import mongoose, { Document, Schema } from 'mongoose';

export interface IStaticAsset extends Document {
  slug: string;
  filename: string;
  contentType: string;
  data: Buffer;
  createdAt: Date;
  updatedAt: Date;
}

const staticAssetSchema = new Schema<IStaticAsset>(
  {
    slug: { type: String, required: true, unique: true, index: true },
    filename: { type: String, required: true },
    contentType: { type: String, required: true },
    data: { type: Buffer, required: true },
  },
  { timestamps: true },
);

export const StaticAsset = mongoose.model<IStaticAsset>('StaticAsset', staticAssetSchema);

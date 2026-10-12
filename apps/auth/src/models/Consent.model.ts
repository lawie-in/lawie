import mongoose, { Document, Schema } from 'mongoose';

// T-310 (Ajay's ruling, Arjun's spec): the minimal record of an anonymous visitor's analytics
// choice, so Lawie can show consent was given or refused. A random id (also in the visitor's
// localStorage), the choice, the notice text version and the time. No IP, no user agent, no
// account link, and no other fields. Deleted 12 months after the latest decision (TTL index).

export type ConsentChoice = 'granted' | 'denied';

export const CONSENT_PURPOSE = 'analytics' as const;
export const CONSENT_HISTORY_LIMIT = 5;
export const CONSENT_RETENTION_MONTHS = 12;

export interface IConsentHistoryEntry {
  choice: ConsentChoice;
  textVersion: number;
  decidedAt: Date;
}

export interface IConsentRecord extends Document {
  consentId: string;
  purpose: typeof CONSENT_PURPOSE;
  choice: ConsentChoice;
  textVersion: number;
  decidedAt: Date;
  previous: IConsentHistoryEntry[];
  expiresAt: Date;
}

/** decidedAt + 12 calendar months (UTC). */
export function consentExpiry(decidedAt: Date): Date {
  const expiresAt = new Date(decidedAt.getTime());
  expiresAt.setUTCMonth(expiresAt.getUTCMonth() + CONSENT_RETENTION_MONTHS);
  return expiresAt;
}

const HistoryEntrySchema = new Schema<IConsentHistoryEntry>(
  {
    choice: { type: String, enum: ['granted', 'denied'], required: true },
    textVersion: { type: Number, required: true },
    decidedAt: { type: Date, required: true },
  },
  { _id: false },
);

const ConsentRecordSchema = new Schema<IConsentRecord>(
  {
    consentId: { type: String, required: true },
    purpose: { type: String, enum: [CONSENT_PURPOSE], default: CONSENT_PURPOSE, required: true },
    choice: { type: String, enum: ['granted', 'denied'], required: true },
    textVersion: { type: Number, required: true, min: 1, max: 1000 },
    decidedAt: { type: Date, required: true },
    previous: { type: [HistoryEntrySchema], default: [] },
    expiresAt: { type: Date, required: true },
  },
  // No timestamps and no version key: the record holds the listed fields and nothing else.
  { versionKey: false, strict: 'throw' },
);

ConsentRecordSchema.index({ consentId: 1 }, { unique: true });
ConsentRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

export const ConsentRecord = mongoose.model<IConsentRecord>(
  'ConsentRecord',
  ConsentRecordSchema,
  'consentrecords',
);

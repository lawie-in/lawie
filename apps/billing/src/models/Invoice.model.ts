/**
 * T-436 (Arjun #1): a GST tax invoice or credit note. The row IS the document;
 * no PDF is stored (rendered on demand from the row).
 *
 * Lifecycle: inserted in state 'issuing' with only the payment facts (the
 * `draft` block), then issued once: number, FY, issue date, seller and customer
 * snapshots, place of supply, lines and amounts are set in one conditional
 * update with state 'issued'. After that the row is immutable: every update and
 * delete through this model is filtered to `state != 'issued'`, and `save()` on
 * an existing row throws.
 *
 * One exception (T-436 c, Arjun #2): the post-issue marker `emailQueuedAt` may
 * be set once, from null, by an update that sets that field and nothing else
 * (see isEmailMarkerUpdate). It is not part of the tax document.
 *
 * Indexes: paymentId unique per invoice (credit notes repeat the original's
 * paymentId), refundId unique where present, (kind, fy, number) unique where a
 * number is set. `kind` is the numbering series ('invoice' | 'credit_note').
 */
import mongoose, { Document, Schema } from 'mongoose';

import type { SellerSnapshot } from '../config/gst';

export type InvoiceState = 'issuing' | 'issued';
export type InvoiceKindValue = 'invoice' | 'credit_note';
export type PlaceOfSupplySource = 'user' | 'fallback';

export interface InvoiceLine {
  description: string;
  sac: string;
  ratePercent: number;
  quantity: number;
  taxable: number; // paise
  amount: number; // paise, GST-inclusive
}

export interface InvoiceDraft {
  /** Paise charged (invoice) or refunded (credit note); from the Razorpay entity. */
  amount: number;
  /** Line description per Ajay §1, fixed at capture. */
  description: string;
  /** When Razorpay captured the payment (or processed the refund). */
  paidAt: Date;
  /** Where the row came from, for audit only. */
  source:
    | 'subscription.charged'
    | 'order.paid'
    | 'payment.captured'
    | 'refund.processed'
    | 'backfill';
  razorpayOrderId?: string;
  razorpaySubscriptionId?: string;
}

export interface IInvoice extends Document {
  kind: InvoiceKindValue;
  state: InvoiceState;
  paymentId: string;
  refundId?: string;
  userId: mongoose.Types.ObjectId;
  draft: InvoiceDraft;

  // Set at issue, never after.
  number?: string;
  fy?: string;
  seq?: number;
  issuedAt?: Date;
  seller?: SellerSnapshot;
  customer?: { name: string; email: string; stateCode: string; stateName: string };
  placeOfSupply?: { code: string; name: string; source: PlaceOfSupplySource };
  lines?: InvoiceLine[];
  price?: number;
  taxable?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  total?: number;

  // Credit notes only.
  originalInvoiceId?: mongoose.Types.ObjectId;
  originalInvoiceNumber?: string;
  originalInvoiceDate?: Date;

  /** T-436 (c): when the invoice email was queued. Null/absent until then; set once. */
  emailQueuedAt?: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

const SellerSchema = new Schema(
  {
    legalName: { type: String, required: true },
    tradeName: { type: String, required: true },
    gstin: { type: String, required: true },
    address: { type: String, required: true },
    stateCode: { type: String, required: true },
    stateName: { type: String, required: true },
  },
  { _id: false },
);

const CustomerSchema = new Schema(
  {
    name: { type: String, default: '' },
    email: { type: String, default: '' },
    stateCode: { type: String, required: true },
    stateName: { type: String, required: true },
  },
  { _id: false },
);

const PlaceOfSupplySchema = new Schema(
  {
    code: { type: String, required: true },
    name: { type: String, required: true },
    source: { type: String, enum: ['user', 'fallback'], required: true },
  },
  { _id: false },
);

const LineSchema = new Schema<InvoiceLine>(
  {
    description: { type: String, required: true },
    sac: { type: String, required: true },
    ratePercent: { type: Number, required: true },
    quantity: { type: Number, required: true },
    taxable: { type: Number, required: true },
    amount: { type: Number, required: true },
  },
  { _id: false },
);

const DraftSchema = new Schema<InvoiceDraft>(
  {
    amount: { type: Number, required: true },
    description: { type: String, required: true },
    paidAt: { type: Date, required: true },
    source: { type: String, required: true },
    razorpayOrderId: String,
    razorpaySubscriptionId: String,
  },
  { _id: false },
);

const InvoiceSchema = new Schema<IInvoice>(
  {
    kind: { type: String, enum: ['invoice', 'credit_note'], required: true },
    state: { type: String, enum: ['issuing', 'issued'], required: true },
    paymentId: { type: String, required: true },
    refundId: { type: String },
    userId: { type: Schema.Types.ObjectId, required: true },
    draft: { type: DraftSchema, required: true },

    number: String,
    fy: String,
    seq: Number,
    issuedAt: Date,
    seller: SellerSchema,
    customer: CustomerSchema,
    placeOfSupply: PlaceOfSupplySchema,
    lines: { type: [LineSchema], default: undefined },
    price: Number,
    taxable: Number,
    cgst: Number,
    sgst: Number,
    igst: Number,
    total: Number,

    originalInvoiceId: { type: Schema.Types.ObjectId },
    originalInvoiceNumber: String,
    originalInvoiceDate: Date,

    emailQueuedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'invoices' },
);

InvoiceSchema.index(
  { paymentId: 1 },
  { unique: true, partialFilterExpression: { kind: 'invoice' } },
);
InvoiceSchema.index(
  { refundId: 1 },
  { unique: true, partialFilterExpression: { refundId: { $type: 'string' } } },
);
InvoiceSchema.index(
  { kind: 1, fy: 1, number: 1 },
  { unique: true, partialFilterExpression: { number: { $type: 'string' } } },
);
InvoiceSchema.index({ userId: 1, issuedAt: -1 });
InvoiceSchema.index({ state: 1, createdAt: 1 });
InvoiceSchema.index({ issuedAt: 1 });

// ── Immutable after issue ─────────────────────────────────────────────────────
// Every query write/delete through the model skips issued rows. The service
// only ever writes rows in 'issuing'; this makes that a model rule too.
const GUARDED_QUERY_OPS = [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'replaceOne',
  'findOneAndReplace',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
] as const;

/** Ops through which the email marker may be set (never replace or delete). */
const MARKER_OPS: ReadonlySet<string> = new Set(['updateOne', 'findOneAndUpdate']);

/**
 * True only for an update whose whole effect is `$set: { emailQueuedAt: <Date> }`
 * (T-436 c): no other operator, no other field, no upsert. Call it with
 * `{ timestamps: false }` so Mongoose adds no `updatedAt` to the $set; if it
 * does, this returns false and the issued row stays untouched.
 */
export function isEmailMarkerUpdate(
  op: string,
  update: unknown,
  options: { upsert?: unknown } | undefined,
): boolean {
  if (!MARKER_OPS.has(op) || options?.upsert) return false;
  if (!update || typeof update !== 'object' || Array.isArray(update)) return false;
  const keys = Object.keys(update);
  if (keys.length !== 1 || keys[0] !== '$set') return false;
  const set = (update as { $set?: unknown }).$set;
  if (!set || typeof set !== 'object' || Array.isArray(set)) return false;
  const setKeys = Object.keys(set);
  return (
    setKeys.length === 1 &&
    setKeys[0] === 'emailQueuedAt' &&
    (set as { emailQueuedAt?: unknown }).emailQueuedAt instanceof Date
  );
}

for (const op of GUARDED_QUERY_OPS) {
  InvoiceSchema.pre(op, { document: false, query: true }, function guardIssued() {
    if (isEmailMarkerUpdate(op, this.getUpdate(), this.getOptions())) {
      // The marker: only on an issued row whose marker is still null/absent,
      // so it is set at most once and never overwritten.
      this.setQuery({ $and: [this.getFilter(), { state: 'issued', emailQueuedAt: null }] });
      return;
    }
    this.setQuery({ $and: [this.getFilter(), { state: { $ne: 'issued' } }] });
  });
}

InvoiceSchema.pre('save', function guardSave(next) {
  if (!this.isNew) {
    next(new Error('Invoice rows are immutable; use the invoice service'));
    return;
  }
  next();
});

InvoiceSchema.pre('deleteOne', { document: true, query: false }, function guardDocDelete(next) {
  if (this.state === 'issued') {
    next(new Error('Issued invoices are never deleted'));
    return;
  }
  next();
});

export const Invoice =
  (mongoose.models['Invoice'] as mongoose.Model<IInvoice>) ||
  mongoose.model<IInvoice>('Invoice', InvoiceSchema);

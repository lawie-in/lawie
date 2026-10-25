/**
 * T-436 (Arjun #3): one counter per (fy, series). `seq` is the last number
 * allocated. Allocation is `findOneAndUpdate` + `$inc` and also records which
 * invoice the number is for (`pending*`), so a crash between allocating and
 * writing the number onto the invoice is finished by whoever touches the
 * series next (the next issue or the sweep), with the same number: no gaps, no
 * reuse. While `pendingInvoiceId` is set, the series allocates nothing else.
 */
import mongoose, { Document, Schema } from 'mongoose';

export type InvoiceSeries = 'invoice' | 'credit_note';

export interface IInvoiceCounter extends Document {
  fy: string;
  series: InvoiceSeries;
  seq: number;
  pendingInvoiceId?: mongoose.Types.ObjectId | null;
  pendingIssuedAt?: Date | null;
  updatedAt: Date;
  createdAt: Date;
}

const InvoiceCounterSchema = new Schema<IInvoiceCounter>(
  {
    fy: { type: String, required: true },
    series: { type: String, enum: ['invoice', 'credit_note'], required: true },
    seq: { type: Number, required: true, default: 0 },
    pendingInvoiceId: { type: Schema.Types.ObjectId, default: null },
    pendingIssuedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'invoicecounters' },
);

InvoiceCounterSchema.index({ fy: 1, series: 1 }, { unique: true });

export const InvoiceCounter =
  (mongoose.models['InvoiceCounter'] as mongoose.Model<IInvoiceCounter>) ||
  mongoose.model<IInvoiceCounter>('InvoiceCounter', InvoiceCounterSchema);

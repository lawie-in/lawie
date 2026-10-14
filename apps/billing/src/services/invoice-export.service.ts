/**
 * T-436 (Arjun #9, Vikram AC7): monthly CSV of issued invoices and credit
 * notes for GSTR-1. A month is a calendar month in IST, by issue date. Credit
 * notes carry negative amounts. Amounts in rupees with 2 decimals.
 */
import { Invoice, type IInvoice } from '../models/Invoice.model';

import { formatIstDateTime, istMonthRange, paiseToRupees } from './invoice-math';

type CsvRow = Pick<
  IInvoice,
  | 'number'
  | 'kind'
  | 'issuedAt'
  | 'customer'
  | 'placeOfSupply'
  | 'taxable'
  | 'cgst'
  | 'sgst'
  | 'igst'
  | 'total'
  | 'originalInvoiceNumber'
>;

export const INVOICE_CSV_COLUMNS = [
  'number',
  'kind',
  'issuedAt',
  'customerName',
  'customerGstin',
  'placeOfSupplyCode',
  'placeOfSupplyName',
  'placeOfSupplySource',
  'taxable',
  'cgst',
  'sgst',
  'igst',
  'total',
  'originalInvoiceNumber',
] as const;

/** One CSV field: quoted when needed; text that a spreadsheet would run as a formula is prefixed with '. */
export function csvField(value: string, isText = true): string {
  let v = value;
  if (isText && /^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function rowFor(inv: CsvRow): string {
  const sign = inv.kind === 'credit_note' ? -1 : 1;
  const money = (p: number | undefined) => paiseToRupees(sign * (p ?? 0));
  return [
    csvField(inv.number ?? ''),
    csvField(inv.kind),
    csvField(inv.issuedAt ? formatIstDateTime(inv.issuedAt) : ''),
    csvField(inv.customer?.name ?? ''),
    csvField(''), // customer GSTIN: parked by Ajay, not collected in v1
    csvField(inv.placeOfSupply?.code ?? ''),
    csvField(inv.placeOfSupply?.name ?? ''),
    csvField(inv.placeOfSupply?.source ?? ''),
    csvField(money(inv.taxable), false),
    csvField(money(inv.cgst), false),
    csvField(money(inv.sgst), false),
    csvField(money(inv.igst), false),
    csvField(money(inv.total), false),
    csvField(inv.originalInvoiceNumber ?? ''),
  ].join(',');
}

/** The CSV for `month` (`YYYY-MM`), or null when the month is malformed. */
export async function buildInvoiceCsv(
  month: string,
): Promise<{ csv: string; count: number } | null> {
  const range = istMonthRange(month);
  if (!range) return null;
  const rows = await Invoice.find({
    state: 'issued',
    issuedAt: { $gte: range.start, $lt: range.end },
  })
    .sort({ issuedAt: 1, kind: -1, seq: 1 })
    .lean();
  const lines = [INVOICE_CSV_COLUMNS.join(','), ...rows.map((r) => rowFor(r as CsvRow))];
  return { csv: `${lines.join('\r\n')}\r\n`, count: rows.length };
}

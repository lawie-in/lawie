/**
 * T-436: pure helpers for GST tax invoices. Integer paise only; no floats touch
 * money. No I/O.
 */
import { INVOICE_NUMBER_PREFIX } from '../config/gst';

export type InvoiceKind = 'invoice' | 'credit_note';

export interface GstSplit {
  price: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

/** round(n / d) for non-negative integers, half up, in integer arithmetic. */
function roundDiv(n: number, d: number): number {
  return Math.floor((2 * n + d) / (2 * d));
}

/**
 * Backs GST out of a GST-inclusive price in paise (Vikram AC2, Arjun #4):
 * taxable = round(price / 1.18), tax = price - taxable; intra-state
 * cgst = round(tax / 2), sgst = tax - cgst; inter-state igst = tax.
 * taxable + cgst + sgst + igst === total === price, always.
 */
export function splitGstInclusive(pricePaise: number, intraState: boolean): GstSplit {
  if (!Number.isSafeInteger(pricePaise) || pricePaise < 0) {
    throw new RangeError('price must be a non-negative integer number of paise');
  }
  const taxable = roundDiv(pricePaise * 100, 118);
  const tax = pricePaise - taxable;
  if (intraState) {
    const cgst = roundDiv(tax, 2);
    return { price: pricePaise, taxable, cgst, sgst: tax - cgst, igst: 0, total: pricePaise };
  }
  return { price: pricePaise, taxable, cgst: 0, sgst: 0, igst: tax, total: pricePaise };
}

const IST_OFFSET_MS = 330 * 60 * 1000;

/** The calendar fields of `d` in IST (UTC+05:30, no DST). */
export function istParts(d: Date): {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const s = new Date(d.getTime() + IST_OFFSET_MS);
  return {
    year: s.getUTCFullYear(),
    month: s.getUTCMonth() + 1,
    day: s.getUTCDate(),
    hour: s.getUTCHours(),
    minute: s.getUTCMinutes(),
    second: s.getUTCSeconds(),
  };
}

/** Indian financial year of `d` (rolls on 1 April IST), as `2026-27`. */
export function financialYear(d: Date): string {
  const { year, month } = istParts(d);
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** `LAW/2026-27/0001` (invoice) or `LCN/2026-27/0001` (credit note). */
export function formatInvoiceNumber(kind: InvoiceKind, fy: string, seq: number): string {
  return `${INVOICE_NUMBER_PREFIX[kind]}/${fy}/${String(seq).padStart(4, '0')}`;
}

/** [start, end) of a calendar month in IST, for `YYYY-MM`. Null if malformed. */
export function istMonthRange(month: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return {
    start: new Date(Date.UTC(y, mo - 1, 1) - IST_OFFSET_MS),
    end: new Date(Date.UTC(y, mo, 1) - IST_OFFSET_MS),
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `14 Oct 2026` in IST. */
export function formatIstDate(d: Date): string {
  const p = istParts(d);
  return `${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
}

/** `2026-10-14 18:05:00` in IST. */
export function formatIstDateTime(d: Date): string {
  const p = istParts(d);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${two(p.month)}-${two(p.day)} ${two(p.hour)}:${two(p.minute)}:${two(p.second)}`;
}

/** Paise as rupees with 2 decimals, e.g. 79900 -> `799.00`, -50 -> `-0.50`. */
export function paiseToRupees(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Paise for display, e.g. 199900 -> `Rs. 1,999.00` (Indian digit grouping). */
export function formatRupees(paise: number): string {
  const [whole, frac] = paiseToRupees(paise).replace('-', '').split('.');
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  return `${paise < 0 ? '-' : ''}Rs. ${grouped}.${frac}`;
}

/**
 * T-436: GST tax invoice configuration.
 *
 * Seller details come from env only (founder-set per environment; never in the
 * repo). Ajay §1 + Addendum 1: SAC 998319 at 18%, CGST 9% + SGST 9% when the
 * place of supply is our State, IGST 18% otherwise.
 */
import { findGstState } from '@lawie/shared';

import { env } from './env';

/**
 * The users-collection field (owned by auth) holding the customer's 2-digit GST
 * State code. Arjun, 14 Oct 2026: `gstStateCode`. One constant, so a rename is
 * one line.
 */
export const CUSTOMER_STATE_CODE_FIELD = 'gstStateCode';

/** Ajay Addendum 1 (Vikram's finance call). */
export const GST_SAC = '998319';
export const GST_RATE_PERCENT = 18;

/**
 * Invoice number prefixes (Ajay §1: max 16 chars, letters/digits/"-"/"/", FY
 * prefix). `LAW/2026-27/0001` is 16 characters.
 *
 * Credit notes: Ajay's example `LAW-CN/2026-27/0001` is 19 characters, over the
 * 16-character limit in the same section, so this uses `LCN/2026-27/0001`
 * (16). Needs Ajay's confirmation; change it here only.
 */
export const INVOICE_NUMBER_PREFIX = {
  invoice: 'LAW',
  credit_note: 'LCN',
} as const;

/** Ajay §1: max length of an invoice / credit note number. */
export const INVOICE_NUMBER_MAX_LENGTH = 16;

export interface SellerSnapshot {
  legalName: string;
  tradeName: string;
  gstin: string;
  address: string;
  stateCode: string;
  stateName: string;
}

/** Thrown when the seller env is incomplete; carries env var names only, never values. */
export class InvoiceConfigError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`GST invoice config missing: ${missing.join(', ')}`);
    this.name = 'InvoiceConfigError';
    this.missing = missing;
  }
}

const SELLER_KEYS = [
  'GST_GSTIN',
  'GST_LEGAL_NAME',
  'GST_TRADE_NAME',
  'GST_ADDRESS',
  'GST_STATE_CODE',
] as const;

/** Names of the seller env vars that are empty (or, for the State code, not one of the 36). */
export function missingSellerConfig(): string[] {
  const missing: string[] = SELLER_KEYS.filter((k) => env[k].trim() === '');
  if (!missing.includes('GST_STATE_CODE') && !findGstState(env.GST_STATE_CODE.trim())) {
    missing.push('GST_STATE_CODE');
  }
  return missing;
}

/** The seller snapshot, or null when any value is missing or invalid. */
export function readSellerConfig(): SellerSnapshot | null {
  if (missingSellerConfig().length > 0) return null;
  const stateCode = env.GST_STATE_CODE.trim();
  return {
    legalName: env.GST_LEGAL_NAME.trim(),
    tradeName: env.GST_TRADE_NAME.trim(),
    gstin: env.GST_GSTIN.trim(),
    address: env.GST_ADDRESS.trim(),
    stateCode,
    stateName: findGstState(stateCode)!.name,
  };
}

const IST_OFFSET_MS = 330 * 60 * 1000;
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * GST_EFFECTIVE_FROM as an instant. `YYYY-MM-DD` is midnight IST on that day;
 * any other value goes through Date.parse. Null when unset or unparseable.
 */
export function readEffectiveFrom(): Date | null {
  const raw = env.GST_EFFECTIVE_FROM.trim();
  if (!raw) return null;
  const m = DATE_ONLY_RE.exec(raw);
  if (m) {
    const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - IST_OFFSET_MS;
    return Number.isNaN(ms) ? null : new Date(ms);
  }
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : new Date(ms);
}

/** Seller config plus a valid effective date, or throws InvoiceConfigError. */
export function requireInvoiceConfig(): { seller: SellerSnapshot; effectiveFrom: Date } {
  const missing = missingSellerConfig();
  const effectiveFrom = readEffectiveFrom();
  if (!effectiveFrom) missing.push('GST_EFFECTIVE_FROM');
  if (missing.length > 0) throw new InvoiceConfigError(missing);
  return { seller: readSellerConfig()!, effectiveFrom: effectiveFrom! };
}

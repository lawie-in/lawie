/**
 * T-436 (b/c): merge-field formatting for the invoice emails. Pure, no env, so templates and the
 * worker can both use it.
 *
 * Amount: "₹" in the email, "Rs." on the PDF; both are lawful and the figure must match the PDF
 * (Ajay, gst-tax-invoice-signed.md Addendum 7 (4c)). Same Indian digit grouping as billing's
 * formatRupees (apps/billing/src/services/invoice-math.ts). Whole rupees print without paise
 * (₹799), anything else with two decimals (₹799.50), per the T-436 (c) handoff.
 *
 * Date: "14 Oct 2026" in IST, the same form as the PDF's "Date of issue" (billing formatIstDate).
 * Built from fixed month names, not Intl, so an ICU update cannot turn "Sep" into "Sept".
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Non-negative integer paise to "₹1,999" / "₹1,999.50". Throws (no value in the message) otherwise. */
export function formatInr(paise: number): string {
  if (!Number.isSafeInteger(paise) || paise < 0) {
    throw new Error('invoice amount must be a non-negative integer number of paise');
  }
  const whole = String(Math.floor(paise / 100));
  const frac = paise % 100;
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  return frac === 0 ? `₹${grouped}` : `₹${grouped}.${String(frac).padStart(2, '0')}`;
}

/** "14 Oct 2026" in IST. Throws (no value in the message) on an invalid date. */
export function formatIstDate(d: Date): string {
  if (Number.isNaN(d.getTime())) throw new Error('invoice date is not a valid date');
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return `${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`;
}

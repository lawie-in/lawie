/**
 * T-690b / T-690c: the written statement 90-day warning, shared by preflight
 * (form flow) and the guided brief (buildBrief). Pure: it imports nothing, so
 * intake-brief.ts can use it without pulling in mongoose, models or the SDK.
 */

/**
 * T-690b (Ajay, 29 Oct 2026, option (a)): a written statement filed more than
 * 90 days after service of summons gets a soft warning, in any suit. Strictly
 * greater than 90; a value that is missing, empty or not a finite number never
 * qualifies. A later suit-type (commercial) check, if Ajay signs one, goes here.
 */
export function wsOver90DaysWarningApplies(
  templateId: string,
  formData: Record<string, unknown>,
): boolean {
  if (templateId !== 'written_statement') return false;
  const raw = formData['days_from_service'];
  let days: number;
  if (typeof raw === 'number') days = raw;
  else if (typeof raw === 'string' && raw.trim() !== '') days = Number(raw.trim());
  else return false;
  return Number.isFinite(days) && days > 90;
}

/** IST is UTC+05:30 all year (no daylight saving). */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A service date as the app stores it (`YYYY-MM-DD`: the brief's date check and
 * both date pickers), as UTC midnight of that calendar date in ms; null when it
 * is not a string of that form or not a real date (no 30 February, no rollover).
 * Years outside 1900-2100 are not read, as the brief's own date check.
 */
function storedDateMs(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const ms = Date.UTC(y, mo - 1, d);
  const dt = new Date(ms);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return ms;
}

/** Today's calendar date in India (IST), as UTC midnight of that date in ms. */
function istTodayMs(now: Date): number {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
}

/**
 * T-690c (Ajay AJ-690c, 8b650c1a): the service-of-summons date alone warns when
 * the IST calendar days from that date to today (IST) are strictly over 90.
 * Today is 0 days. A future, invalid, empty or non-string (list) date never
 * qualifies. The figure is worked out for this check only and never returned.
 * `now` defaults to the clock; tests pass a fixed one.
 */
export function wsServiceDateOver90Days(serviceDate: unknown, now: Date = new Date()): boolean {
  const served = storedDateMs(serviceDate);
  if (served === null) return false;
  const today = istTodayMs(now);
  if (!Number.isFinite(today) || served > today) return false;
  return Math.round((today - served) / DAY_MS) > 90;
}

/**
 * T-690c (Ajay AJ-690c): the written statement 90-day warning from either fact.
 * True when the typed days_from_service is over 90 (T-690b, unchanged) or the
 * summons_service_date is valid, not in the future and over 90 IST calendar
 * days before today. Either one over 90 warns; blank days fall to the date.
 */
export function wsOver90DaysApplies(
  templateId: string,
  formData: Record<string, unknown>,
  now: Date = new Date(),
): boolean {
  if (templateId !== 'written_statement') return false;
  if (wsOver90DaysWarningApplies(templateId, formData)) return true;
  return wsServiceDateOver90Days(formData['summons_service_date'], now);
}

/** T-690b: Ajay's signed warning text (run5-rulings-ajay.md, T-690b reworded). */
export const WS_OVER_90_DAYS_WARNING =
  'This written statement is more than 90 days after service of summons. In an ordinary suit the court allows that only in exceptional cases; in a commercial suit it can be allowed up to 120 days, for reasons recorded in writing and on payment of costs, and not after that. Set out the reasons in the delay application.';

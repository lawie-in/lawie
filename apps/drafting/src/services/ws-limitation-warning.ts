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

/** T-690b: Ajay's signed warning text (run5-rulings-ajay.md, T-690b reworded). */
export const WS_OVER_90_DAYS_WARNING =
  'This written statement is more than 90 days after service of summons. In an ordinary suit the court allows that only in exceptional cases; in a commercial suit it can be allowed up to 120 days, for reasons recorded in writing and on payment of costs, and not after that. Set out the reasons in the delay application.';

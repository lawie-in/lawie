/**
 * T-521 (Rajesh): the generating inkwell shows the advocate's real Ink level,
 * worked out as the dashboard's ShelfKpis does: the balance over the plan's
 * monthly Ink, or over 5 on Free (copy 4.1, one-time Ink). Pure.
 *
 * Null while the balance is not known (not loaded, or not a number): the
 * inkwell is then not shown at all, as on the dashboard. It never shows a
 * made-up level.
 */

/** Copy 4.1: Free is 5 Ink, one time; the full mark when there is no monthly allotment. */
export const FREE_INK = 5;

export function inkLevelFrom(ink: {
  loaded: boolean;
  totalInk: number;
  monthlyAllotment: number;
}): number | null {
  if (!ink.loaded || !Number.isFinite(ink.totalInk)) return null;
  const reference =
    Number.isFinite(ink.monthlyAllotment) && ink.monthlyAllotment > 0
      ? ink.monthlyAllotment
      : FREE_INK;
  return Math.min(100, Math.max(0, (ink.totalInk / reference) * 100));
}

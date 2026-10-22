/**
 * T-506 — calendar month in India time (IST, UTC+05:30), not server time.
 *
 * India has no DST, so a fixed +330 min offset is exact (same approach as
 * istDayKey in intake.service.ts). Query with `$gte start` and `$lt end`.
 */
const IST_OFFSET_MS = 330 * 60_000;

export interface IstMonthBounds {
  /** First instant of the IST month, as a UTC Date. */
  start: Date;
  /** First instant of the next IST month (exclusive), as a UTC Date. */
  end: Date;
  /** The IST month as 'YYYY-MM'. */
  month: string;
}

export function istMonthBounds(now: Date = new Date()): IstMonthBounds {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  return {
    start: new Date(Date.UTC(y, m, 1) - IST_OFFSET_MS),
    end: new Date(Date.UTC(y, m + 1, 1) - IST_OFFSET_MS),
    month: `${y}-${String(m + 1).padStart(2, '0')}`,
  };
}

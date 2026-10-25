/**
 * BNSS Investigation Timeline Tracker — SCRUM-48
 *
 * Given an FIR/arrest date and BNS sections, computes:
 *   - Police custody window (15 days in total, in one go or in parts, within the
 *     first 40 / 60 days, BNSS 187(2))
 *   - Detention limit before charge sheet (60 or 90 days, BNSS 187(3))
 *   - Last day for the charge sheet and the default bail date
 *   - Key milestone dates as a visual timeline
 *
 * T-367 (Ajay, signed 51175aa): the date of the first remand is day 1 (ED v. Kapil
 * Wadhawan). Last day = day 1 + 59 / + 89; default bail from day 1 + 60 / + 90.
 */
import { normalizeDate } from '@lawie/shared';

import {
  DEPENDS_BNSS_187,
  OLD_LAW_LINE,
  readSectionsCharged,
  resolveBnsKey,
  resolveOffence,
} from './bns-offence-resolver';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TimelineInput {
  /** Date of FIR / arrest (ISO string or Date) */
  arrestDate: string | Date;
  /** BNS section numbers */
  sections: string[];
}

export interface TimelineMilestone {
  date: string; // ISO date string (YYYY-MM-DD)
  label: string;
  description: string;
  type: 'start' | 'police_custody' | 'judicial_custody' | 'chargesheet' | 'default_bail';
  critical: boolean;
}

export interface TimelineResult {
  arrestDate: string;
  /** null when no period can be given (T-277, R1) */
  maxYears: number | null;
  isLifeOrDeath: boolean;

  /**
   * T-367 R1: last day of the window in which police custody may be taken (day 40
   * or day 60, day 1 being the first remand date). null when no period can be given.
   */
  policeCustodyEndDate: string | null;
  /** Police custody in total, in one go or in parts (BNSS 187(2)) */
  policeCustodyDays: 15;
  /** T-367 R1 line, or DEPENDS_BNSS_187 when no period can be given */
  policeCustodyNote: string;

  /**
   * Last day of the 60/90-day period (first remand date + 59 / + 89). null (with
   * the date fields below) when no period can be given: see `periodNote`.
   */
  judicialCustodyEndDate: string | null;
  judicialCustodyDays: 60 | 90 | null;

  /** Last day for the charge sheet — same as judicial custody end */
  chargesheetDeadline: string | null;

  /** Default bail available from — day after the last day (first remand + 60 / + 90) */
  defaultBailDate: string | null;

  /** T-367 R2 line; null when no period can be given */
  detentionLimitNote: string | null;
  /** T-367 R3 line; null when no period can be given */
  chargesheetNote: string | null;

  /** DEPENDS_BNSS_187 when no period can be given, else null (T-277, R1) */
  periodNote: string | null;

  /** BNSS section governing custody limits */
  bnssSection: string;
  bnssSectionTitle: string;

  // T-367 Addendum 1 (5): the staggered remand breakdown is removed.

  /** Ordered milestones for timeline visualization */
  milestones: TimelineMilestone[];

  /** Whether default bail is available; null when no period can be given */
  defaultBailAvailable: boolean | null;
  defaultBailExplanation: string;

  /** Sections used for calculation (exact-key rows with a max term) */
  sectionsUsed: string[];
  /** Sections that resolve to no offence; left out of the period */
  sectionsNotFound: string[];
  /**
   * Sections that resolve to an offence but cannot drive a period: resolved
   * through a variant or a parent row, or the row's max_years is null (R1).
   */
  sectionsWithoutPeriod: string[];
  /** Per-section notes: leftOutOfPeriodNote(n), or "Section {n}: " + DEPENDS_BNSS_187 */
  sectionNotes: Record<string, string>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Calendar-day maths in UTC, so no local time zone or DST shift moves the date. */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** T-367: dates in Ajay's lines print as "4 April 2026". */
export function formatLegalDate(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** Ajay (CLO), T-367 Addendum 1 (1, signed 3431cce): start milestone label. */
export const START_LABEL = 'Day 1: first remand';

/**
 * Ajay's help text for the input (Addendum 1, item 1), reused as the start
 * milestone's description; the old "All custody periods begin…" line is removed.
 */
export const START_DESCRIPTION =
  'The date the Magistrate first ordered the accused into custody. This is day 1.';

/** Ajay (CLO), T-367 Addendum 1 (4, signed 3431cce): police milestone and card label. */
export function policeCustodyLabel(windowDays: 40 | 60): string {
  return `Last day for police custody (day ${windowDays})`;
}

/** Ajay (CLO), T-367 Addendum 2 (3a): charge sheet milestone label. */
export function chargesheetLabel(periodDays: 60 | 90): string {
  return `Last day for the charge sheet (day ${periodDays})`;
}

/** Ajay (CLO), T-367 Addendum 2 (3b): default bail milestone label. */
export function defaultBailLabel(periodDays: 60 | 90): string {
  return `Default bail available from (day ${periodDays + 1})`;
}

/** Ajay (CLO), T-367 Addendum 2 (3e). */
export const BNSS_SECTION_TITLE = 'BNSS 187(3): detention limit before the charge sheet';

/** Ajay (CLO), T-367 R1 (signed 51175aa). */
export function policeCustodyLine(windowDays: 40 | 60): string {
  return `Police custody: up to 15 days in total, in one go or in parts, within the first ${windowDays} days of detention (BNSS 187(2)).`;
}

/** Ajay (CLO), T-367 R2 (signed 51175aa). */
export function detentionLimitLine(periodDays: 60 | 90): string {
  return `Detention limit before charge sheet: ${periodDays} days (BNSS 187(3)), counting the date of the first remand as day 1.`;
}

/** Ajay (CLO), T-367 R3 (signed 51175aa). */
export function chargesheetLine(lastDay: Date, defaultBailFrom: Date): string {
  return `Last day for the charge sheet: ${formatLegalDate(lastDay)}. If none is filed by then, default bail is available from ${formatLegalDate(defaultBailFrom)}.`;
}

/**
 * T-496 (Ajay c585cf80, point 2): read the date with the shared reader, so a
 * partial date ("June 2026", "2026-06") gives no date and nothing is computed;
 * a day is never supplied. ISO from the date picker reads as before (UTC midnight).
 */
function parseDate(input: string | Date): Date {
  if (input instanceof Date) return input;
  const n = normalizeDate(input);
  if (!n.ok) {
    throw new Error(`Invalid date: ${input}`);
  }
  return new Date(`${n.value}T00:00:00Z`);
}

/** Ajay (CLO), T-277 Q6: a non-offence is left out of the period, and the result says so. */
export function leftOutOfPeriodNote(section: string): string {
  return `Section ${section} does not create an offence, so it was left out of this period.`;
}

/** Ajay (CLO), T-278 (signed f4244ec): an IPC / CrPC / IEA input is left out. */
export function oldLawLeftOutNote(code: string, section: string, newCode: string): string {
  return `${code} ${section} is an old-law section, so it was left out of this period. Use the section converter to find the ${newCode} section.`;
}

/** New-law codes named first in the not-found line (T-295 casing). */
const NAMED_NEW_CODES = new Set(['BNS', 'BNSS', 'BSA']);

/**
 * Ajay (CLO), T-278 (signed f4244ec, Addendum 1 9f11633): no BNS row or parent row,
 * or not a BNS input. Display tweak (Ajay, after 7e34982): a token whose single
 * entry carries BNS, BNSS or BSA is named "{Code} {n}" with no "Section"; a bare
 * number, text, or any other code keeps "Section {token}".
 */
export function notInBnsTableNote(token: string): string {
  const entries = readSectionsCharged(token);
  const e = entries.length === 1 ? entries[0] : undefined;
  const label =
    e?.code && NAMED_NEW_CODES.has(e.code) ? `${e.code} ${e.number}` : `Section ${token}`;
  return `${label} was not found in the BNS offences table, so it was left out of this period. Check the Gazette.`;
}

type TimelineEntry = { kind: 'bns'; section: string } | { kind: 'left_out'; note: string };

/**
 * T-278 (Ajay): read one input token with the shared T-277 reader, so "103-BNS",
 * "BNS 103" and "103" all read as BNS 103 (a bare number is BNS in this tool).
 * Left-out lines in Ajay's order: old-law code; else a single BNS entry is resolved
 * by the caller; else "not found in the BNS table" for the token as typed.
 */
function readTimelineEntry(token: string): TimelineEntry {
  const entries = readSectionsCharged(token, 'BNS');
  for (const e of entries) {
    const old = e.code ? OLD_LAW_LINE[e.code] : undefined;
    if (old) return { kind: 'left_out', note: oldLawLeftOutNote(old.name, e.number, old.newCode) };
  }
  if (entries.length === 1 && entries[0].code === 'BNS') {
    return { kind: 'bns', section: entries[0].number };
  }
  return { kind: 'left_out', note: notInBnsTableNote(token) };
}

// ── Main Calculation ───────────────────────────────────────────────────────────

export function calculateTimeline(input: TimelineInput): TimelineResult {
  const arrestDate = parseDate(input.arrestDate);
  const arrestDateStr = toISODate(arrestDate);

  // Resolve max punishment from sections. T-277 R1: only an exact-key row's
  // max_years may drive a period; a null max_years is never 0.
  let maxYears = 0;
  const sectionsUsed: string[] = [];
  const sectionsNotFound: string[] = [];
  const sectionsWithoutPeriod: string[] = [];
  const sectionNotes: Record<string, string> = {};

  for (const section of input.sections) {
    const s = section.trim();
    if (!s) continue;
    // Keys stay the trimmed token as typed, so the web matches them (T-278).
    const entry = readTimelineEntry(s);
    if (entry.kind === 'left_out') {
      sectionsNotFound.push(s);
      sectionNotes[s] = entry.note;
      continue;
    }
    const r = resolveOffence(entry.section);
    if (r.kind === 'not_an_offence') {
      sectionsNotFound.push(s);
      // A row or parent row exists → not an offence; no row at all → not in the table.
      sectionNotes[s] =
        resolveBnsKey(entry.section) !== null
          ? leftOutOfPeriodNote(entry.section)
          : notInBnsTableNote(s);
    } else if (r.kind === 'exact' && r.maxYears !== null) {
      sectionsUsed.push(s);
      if (r.maxYears > maxYears) maxYears = r.maxYears;
    } else {
      sectionsWithoutPeriod.push(s);
      sectionNotes[s] = `Section ${entry.section}: ${DEPENDS_BNSS_187}`;
    }
  }

  // Ajay Q10: an exact-key term of 10+ years fixes 90 days whatever the other
  // sections are (each section without an exact term keeps its R1 note). Otherwise
  // a section without an exact term means no period; no exact term at all, likewise.
  const exactGives90 = sectionsUsed.length > 0 && maxYears >= 10;
  if (sectionsUsed.length === 0 || (sectionsWithoutPeriod.length > 0 && !exactGives90)) {
    return noPeriodResult(arrestDate, {
      sectionsUsed,
      sectionsNotFound,
      sectionsWithoutPeriod,
      sectionNotes,
    });
  }

  const isLifeOrDeath = maxYears >= 99;

  // BNSS 187(3): >= 10 years or death/life → 90 days; otherwise 60 days.
  const judicialCustodyDays: 60 | 90 = maxYears >= 10 ? 90 : 60;

  // BNSS 187(2): 15 days of police custody in total, in one go or in parts,
  // within the first 40 days (60-day period) or 60 days (90-day period).
  const policeCustodyDays = 15 as const;
  const policeWindowDays: 40 | 60 = judicialCustodyDays === 90 ? 60 : 40;

  // T-367 R3 (Kapil Wadhawan): the input date (first remand) is day 1, so day N
  // is input + (N - 1). Last day = + 59 / + 89; default bail from + 60 / + 90.
  const policeCustodyEnd = addDays(arrestDate, policeWindowDays - 1);
  const judicialCustodyEnd = addDays(arrestDate, judicialCustodyDays - 1);
  const chargesheetDeadline = judicialCustodyEnd; // same date
  const defaultBailDate = addDays(arrestDate, judicialCustodyDays);

  const policeCustodyNote = policeCustodyLine(policeWindowDays);
  const detentionLimitNote = detentionLimitLine(judicialCustodyDays);
  const chargesheetNote = chargesheetLine(chargesheetDeadline, defaultBailDate);

  // Build milestones
  const milestones: TimelineMilestone[] = [
    {
      date: arrestDateStr,
      label: START_LABEL,
      description: START_DESCRIPTION,
      type: 'start',
      critical: false,
    },
    {
      date: toISODate(policeCustodyEnd),
      label: policeCustodyLabel(policeWindowDays),
      description: policeCustodyNote,
      type: 'police_custody',
      critical: true,
    },
    {
      date: toISODate(judicialCustodyEnd),
      label: chargesheetLabel(judicialCustodyDays),
      description: detentionLimitNote,
      type: 'chargesheet',
      critical: true,
    },
    {
      date: toISODate(defaultBailDate),
      label: defaultBailLabel(judicialCustodyDays),
      description: chargesheetNote,
      type: 'default_bail',
      critical: true,
    },
  ];

  // BNSS section reference
  const bnssSection = '187';
  // T-367 Addendum 2 (3e): one title for both periods.
  const bnssSectionTitle = BNSS_SECTION_TITLE;

  // T-367 Addendum 2 (2): every variant is R2 followed by R3.
  const defaultBailExplanation = `${detentionLimitNote} ${chargesheetNote}`;

  return {
    arrestDate: arrestDateStr,
    maxYears,
    isLifeOrDeath,
    policeCustodyEndDate: toISODate(policeCustodyEnd),
    policeCustodyDays,
    policeCustodyNote,
    judicialCustodyEndDate: toISODate(judicialCustodyEnd),
    judicialCustodyDays,
    chargesheetDeadline: toISODate(chargesheetDeadline),
    defaultBailDate: toISODate(defaultBailDate),
    detentionLimitNote,
    chargesheetNote,
    bnssSection,
    bnssSectionTitle,
    milestones,
    defaultBailAvailable: true,
    defaultBailExplanation,
    periodNote: null,
    sectionsUsed,
    sectionsNotFound,
    sectionsWithoutPeriod,
    sectionNotes,
  };
}

/**
 * T-277 R1: no 60/90-day period. Police custody (15 days, BNSS 187(2)) still
 * applies; judicial custody, chargesheet and default-bail dates are null.
 * T-367: the police-custody window (40 or 60 days) depends on the period, so
 * there is no window date and the police line is DEPENDS_BNSS_187.
 */
function noPeriodResult(
  arrestDate: Date,
  sections: Pick<
    TimelineResult,
    'sectionsUsed' | 'sectionsNotFound' | 'sectionsWithoutPeriod' | 'sectionNotes'
  >,
): TimelineResult {
  const arrestDateStr = toISODate(arrestDate);
  const policeCustodyDays = 15 as const;
  return {
    arrestDate: arrestDateStr,
    maxYears: null,
    isLifeOrDeath: false,
    policeCustodyEndDate: null,
    policeCustodyDays,
    policeCustodyNote: DEPENDS_BNSS_187,
    judicialCustodyEndDate: null,
    judicialCustodyDays: null,
    chargesheetDeadline: null,
    defaultBailDate: null,
    detentionLimitNote: null,
    chargesheetNote: null,
    periodNote: DEPENDS_BNSS_187,
    bnssSection: '187',
    bnssSectionTitle: DEPENDS_BNSS_187,
    milestones: [
      {
        date: arrestDateStr,
        label: START_LABEL,
        description: START_DESCRIPTION,
        type: 'start',
        critical: false,
      },
    ],
    defaultBailAvailable: null,
    defaultBailExplanation: DEPENDS_BNSS_187,
    ...sections,
  };
}

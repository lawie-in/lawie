/**
 * BNSS Investigation Timeline Tracker — SCRUM-48
 *
 * Given an FIR/arrest date and BNS sections, computes:
 *   - Police custody limit (15 days max, BNSS 187)
 *   - Judicial custody limit (60 or 90 days, BNSS 187)
 *   - Chargesheet filing deadline
 *   - Default bail eligibility date (BNSS 187(3))
 *   - Staggered remand breakdown (first 15 days police, remainder judicial)
 *   - Key milestone dates as a visual timeline
 */
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

  /** Police custody limit — 15 days from arrest (BNSS 187) */
  policeCustodyEndDate: string;
  policeCustodyDays: 15;

  /**
   * Judicial custody limit — 60 or 90 days from arrest. null (with the date
   * fields below) when no period can be given: see `periodNote`.
   */
  judicialCustodyEndDate: string | null;
  judicialCustodyDays: 60 | 90 | null;

  /** Chargesheet filing deadline — same as judicial custody end */
  chargesheetDeadline: string | null;

  /** Default bail eligibility — day after chargesheet deadline */
  defaultBailDate: string | null;

  /** DEPENDS_BNSS_187 when no period can be given, else null (T-277, R1) */
  periodNote: string | null;

  /** BNSS section governing custody limits */
  bnssSection: string;
  bnssSectionTitle: string;

  /** Staggered remand breakdown */
  remandBreakdown: {
    policeCustody: { from: string; to: string; days: number };
    /** null when no period can be given */
    judicialCustody: { from: string; to: string; days: number } | null;
  };

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

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function parseDate(input: string | Date): Date {
  if (input instanceof Date) return input;
  const d = new Date(input);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${input}`);
  }
  return d;
}

/** Ajay (CLO), T-277 Q6: a non-offence is left out of the period, and the result says so. */
export function leftOutOfPeriodNote(section: string): string {
  return `Section ${section} does not create an offence, so it was left out of this period.`;
}

/** Ajay (CLO), T-278 (signed f4244ec): an IPC / CrPC / IEA input is left out. */
export function oldLawLeftOutNote(code: string, section: string, newCode: string): string {
  return `${code} ${section} is an old-law section, so it was left out of this period. Use the section converter to find the ${newCode} section.`;
}

/** Ajay (CLO), T-278 (signed f4244ec, Addendum 1 9f11633): no BNS row or parent row, or not a BNS input. */
export function notInBnsTableNote(section: string): string {
  return `Section ${section} was not found in the BNS offences table, so it was left out of this period. Check the Gazette.`;
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

  // BNSS 187: custody limits based on punishment quantum
  // >= 10 years or death/life → 90 days judicial custody
  // < 10 years → 60 days judicial custody
  const judicialCustodyDays: 60 | 90 = maxYears >= 10 ? 90 : 60;

  // Police custody: always 15 days max (BNSS 187(2))
  const policeCustodyDays = 15 as const;

  // Calculate dates
  const policeCustodyEnd = addDays(arrestDate, policeCustodyDays);
  const judicialCustodyEnd = addDays(arrestDate, judicialCustodyDays);
  const chargesheetDeadline = judicialCustodyEnd; // same date
  const defaultBailDate = addDays(arrestDate, judicialCustodyDays + 1);

  // Staggered remand: first 15 days police, remaining judicial
  const judicialRemandStart = addDays(arrestDate, policeCustodyDays + 1);
  const remainingJudicialDays = judicialCustodyDays - policeCustodyDays;

  // Build milestones
  const milestones: TimelineMilestone[] = [
    {
      date: arrestDateStr,
      label: 'Arrest / FIR Date',
      description: 'Date of arrest or FIR registration. All custody periods begin from this date.',
      type: 'start',
      critical: false,
    },
    {
      date: toISODate(policeCustodyEnd),
      label: 'Police Custody Limit (Day 15)',
      description:
        'Maximum period of police/physical custody under BNSS Section 187(2). No further police remand can be granted after this date.',
      type: 'police_custody',
      critical: true,
    },
    {
      date: toISODate(judicialCustodyEnd),
      label: `Chargesheet Deadline (Day ${judicialCustodyDays})`,
      description: `Investigation must be completed and chargesheet filed within ${judicialCustodyDays} days under BNSS Section 187. Failure to file chargesheet entitles accused to default bail.`,
      type: 'chargesheet',
      critical: true,
    },
    {
      date: toISODate(defaultBailDate),
      label: `Default Bail Eligibility (Day ${judicialCustodyDays + 1})`,
      description: `If chargesheet is not filed by Day ${judicialCustodyDays}, the accused becomes entitled to default bail under BNSS Section 187(3). This right is indefeasible once it accrues.`,
      type: 'default_bail',
      critical: true,
    },
  ];

  // BNSS section reference
  const bnssSection = '187';
  const bnssSectionTitle =
    judicialCustodyDays === 90
      ? 'BNSS Section 187 — 90-day limit (offence punishable with death, life imprisonment, or imprisonment ≥ 10 years)'
      : 'BNSS Section 187 — 60-day limit (offence punishable with imprisonment < 10 years)';

  // Default bail explanation
  const defaultBailExplanation = isLifeOrDeath
    ? `Since the offence is punishable with death or imprisonment for life, the chargesheet must be filed within 90 days. If not filed, the accused is entitled to default bail under BNSS Section 187(3). However, for offences of this gravity, courts may impose stringent conditions.`
    : maxYears >= 10
      ? `Since the maximum punishment is ${maxYears} years (≥ 10 years), the chargesheet must be filed within 90 days. Default bail accrues on Day 91 under BNSS Section 187(3).`
      : `Since the maximum punishment is ${maxYears} year(s) (< 10 years), the chargesheet must be filed within 60 days. Default bail accrues on Day 61 under BNSS Section 187(3). This is an indefeasible right.`;

  return {
    arrestDate: arrestDateStr,
    maxYears,
    isLifeOrDeath,
    policeCustodyEndDate: toISODate(policeCustodyEnd),
    policeCustodyDays,
    judicialCustodyEndDate: toISODate(judicialCustodyEnd),
    judicialCustodyDays,
    chargesheetDeadline: toISODate(chargesheetDeadline),
    defaultBailDate: toISODate(defaultBailDate),
    bnssSection,
    bnssSectionTitle,
    remandBreakdown: {
      policeCustody: {
        from: arrestDateStr,
        to: toISODate(policeCustodyEnd),
        days: policeCustodyDays,
      },
      judicialCustody: {
        from: toISODate(judicialRemandStart),
        to: toISODate(judicialCustodyEnd),
        days: remainingJudicialDays,
      },
    },
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
  const policeCustodyEnd = addDays(arrestDate, policeCustodyDays);
  return {
    arrestDate: arrestDateStr,
    maxYears: null,
    isLifeOrDeath: false,
    policeCustodyEndDate: toISODate(policeCustodyEnd),
    policeCustodyDays,
    judicialCustodyEndDate: null,
    judicialCustodyDays: null,
    chargesheetDeadline: null,
    defaultBailDate: null,
    periodNote: DEPENDS_BNSS_187,
    bnssSection: '187',
    bnssSectionTitle: DEPENDS_BNSS_187,
    remandBreakdown: {
      policeCustody: {
        from: arrestDateStr,
        to: toISODate(policeCustodyEnd),
        days: policeCustodyDays,
      },
      judicialCustody: null,
    },
    milestones: [
      {
        date: arrestDateStr,
        label: 'Arrest / FIR Date',
        description:
          'Date of arrest or FIR registration. All custody periods begin from this date.',
        type: 'start',
        critical: false,
      },
      {
        date: toISODate(policeCustodyEnd),
        label: 'Police Custody Limit (Day 15)',
        description:
          'Maximum period of police/physical custody under BNSS Section 187(2). No further police remand can be granted after this date.',
        type: 'police_custody',
        critical: true,
      },
    ],
    defaultBailAvailable: null,
    defaultBailExplanation: DEPENDS_BNSS_187,
    ...sections,
  };
}

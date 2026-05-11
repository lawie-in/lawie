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
import offencesData from '../config/bns-offences.json';

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
  maxYears: number;
  isLifeOrDeath: boolean;

  /** Police custody limit — 15 days from arrest (BNSS 187) */
  policeCustodyEndDate: string;
  policeCustodyDays: 15;

  /** Judicial custody limit — 60 or 90 days from arrest */
  judicialCustodyEndDate: string;
  judicialCustodyDays: 60 | 90;

  /** Chargesheet filing deadline — same as judicial custody end */
  chargesheetDeadline: string;

  /** Default bail eligibility — day after chargesheet deadline */
  defaultBailDate: string;

  /** BNSS section governing custody limits */
  bnssSection: string;
  bnssSectionTitle: string;

  /** Staggered remand breakdown */
  remandBreakdown: {
    policeCustody: { from: string; to: string; days: number };
    judicialCustody: { from: string; to: string; days: number };
  };

  /** Ordered milestones for timeline visualization */
  milestones: TimelineMilestone[];

  /** Whether default bail is available */
  defaultBailAvailable: boolean;
  defaultBailExplanation: string;

  /** Sections used for calculation */
  sectionsUsed: string[];
  sectionsNotFound: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const offences = offencesData.offences as Record<
  string,
  { max_years: number; title: string; punishment: string }
>;

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

// ── Main Calculation ───────────────────────────────────────────────────────────

export function calculateTimeline(input: TimelineInput): TimelineResult {
  const arrestDate = parseDate(input.arrestDate);
  const arrestDateStr = toISODate(arrestDate);

  // Resolve max punishment from sections
  let maxYears = 0;
  const sectionsUsed: string[] = [];
  const sectionsNotFound: string[] = [];

  for (const section of input.sections) {
    const s = section.trim();
    if (!s) continue;
    const offence = offences[s];
    if (offence) {
      sectionsUsed.push(s);
      if (offence.max_years > maxYears) {
        maxYears = offence.max_years;
      }
    } else {
      sectionsNotFound.push(s);
    }
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
    sectionsUsed,
    sectionsNotFound,
  };
}

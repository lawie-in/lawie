/**
 * T-245a: the old/new criminal law switch for the bail packs (pure, no I/O).
 *
 * LEGAL CONTENT. Every string here is Ajay's, byte for byte, from
 * handoff/legal/T-245-old-new-law-switch-signed.md (345bd24), its
 * Addendum 1 (2992891) and Addendum 2 (d5a3005), 14 Oct 2026. Any other
 * wording goes back to him.
 *
 * The rule:
 * - The law of the offence follows the date of the offence: before 1 July 2024
 *   the IPC, on or after it the BNS. No offence date: unknown (the S-text blank).
 * - The procedure follows the date of the FIR (or the complaint): on or after
 *   1 July 2024 the BNSS and BSA, whatever was chosen. Before, or no FIR date:
 *   the advocate's `procedure_code` choice. No choice: the per-pack blank.
 * - Lawie never converts a section and never assumes a date. A date that cannot
 *   be read is treated as not given.
 */

/** The day the BNS, BNSS and BSA came into force (ISO). */
export const LAW_SWITCH_DATE = '2024-07-01';

export type ProcedureCode = 'CrPC' | 'BNSS';
export type OffenceLaw = 'IPC' | 'BNS';
/** The court the application is made to, as far as the pair depends on it. */
export type BailCourt = 'magistrate' | 'sessions_or_hc';

/** The two `procedure_code` options, labels exact (signed form-keys table). */
export const PROCEDURE_CODE_OPTIONS: Readonly<Record<ProcedureCode, string>> = {
  BNSS: 'BNSS and BSA',
  CrPC: 'CrPC and Evidence Act',
};

/** The bail packs T-245a covers. */
export const LAW_SWITCH_PACKS = [
  'bail_regular',
  'bail_before_magistrate',
  'bail_anticipatory',
  'interim_bail',
  'bail_cancellation',
  'default_bail',
] as const;
export type LawSwitchPack = (typeof LAW_SWITCH_PACKS)[number];

interface Pair {
  crpc: string;
  bnss: string;
}

/**
 * Each pack's provision pair (CrPC → BNSS), from the signed per-pack table.
 * `any`: one pair whatever the court. Otherwise one pair per court.
 */
const PAIRS: Readonly<
  Record<LawSwitchPack, { any: Pair } | { magistrate: Pair; sessions_or_hc: Pair }>
> = {
  bail_regular: {
    magistrate: { crpc: '437', bnss: '480' },
    sessions_or_hc: { crpc: '439', bnss: '483' },
  },
  // The bailable variant takes its own pair (Addendum 2 #4); see BAILABLE_PAIR.
  bail_before_magistrate: { any: { crpc: '437', bnss: '480' } },
  bail_anticipatory: { any: { crpc: '438', bnss: '482' } },
  interim_bail: {
    magistrate: { crpc: '437', bnss: '480' },
    sessions_or_hc: { crpc: '439', bnss: '483' },
  },
  // Magistrate: BNSS 480 with no sub-section; the sub-section stays "verify" (Addendum 1 #4).
  bail_cancellation: {
    magistrate: { crpc: '437(5)', bnss: '480' },
    sessions_or_hc: { crpc: '439(2)', bnss: '483(3)' },
  },
  default_bail: { any: { crpc: '167(2)', bnss: '187(3)' } },
};

/** Addendum 2 #4: bail_before_magistrate, offence bailable: CrPC 436 → BNSS 478. */
const BAILABLE_PAIR: Pair = { crpc: '436', bnss: '478' };

/**
 * Addendum 1 #4: the court is unknown in a two-pair pack. Signed for
 * bail_regular and interim_bail only (both have the 437/439 → 480/483 pairs).
 */
const COURT_UNKNOWN: Readonly<Record<ProcedureCode | 'none', string>> = {
  BNSS: '[To be confirmed: Section 480 or Section 483 of the BNSS]',
  CrPC: '[To be confirmed: Section 437 or Section 439 of the CrPC]',
  none: '[To be confirmed: Section 437 or 439 of the CrPC, or Section 480 or 483 of the BNSS]',
};
const COURT_UNKNOWN_SIGNED: ReadonlySet<LawSwitchPack> = new Set(['bail_regular', 'interim_bail']);

/** Addendum 2 #2: bail_cancellation with the court unknown. No "480(5)" (verify stands). */
const CANCELLATION_COURT_UNKNOWN: Readonly<Record<ProcedureCode | 'none', string>> = {
  BNSS: '[To be confirmed: Section 480 or Section 483(3) of the BNSS]',
  CrPC: '[To be confirmed: Section 437(5) or Section 439(2) of the CrPC]',
  none: '[To be confirmed: Section 437(5) or 439(2) of the CrPC, or Section 480 or 483(3) of the BNSS]',
};

/** Addendum 2 #1: the notice to appear (BNSS 35(3) / CrPC 41A), every pack. */
const NOTICE_PROVISION: Readonly<Record<ProcedureCode | 'none', string>> = {
  BNSS: 'Section 35(3) of the BNSS',
  CrPC: 'Section 41A of the CrPC',
  none: '[To be confirmed: Section 41A of the CrPC or Section 35(3) of the BNSS]',
};

/** Addendum 1 #2: the women's proviso in bail_before_magistrate, three variants. */
const WOMEN_PROVISO: Readonly<Record<ProcedureCode | 'none', string>> = {
  BNSS: 'the first proviso to Section 480(1) of the BNSS',
  CrPC: 'the first proviso to Section 437(1) of the CrPC',
  none: 'the first proviso to [To be confirmed: Section 437(1) of the CrPC or Section 480(1) of the BNSS]',
};

/** Addendum 1: how `{governing_provision}` renders, byte-exact. */
export function renderProvision(code: ProcedureCode, section: string): string {
  return code === 'BNSS'
    ? `Section ${section} of the Bharatiya Nagarik Suraksha Sanhita, 2023`
    : `Section ${section} of the Code of Criminal Procedure, 1973`;
}

/** Addendum 1: `{governing_provision}` with no procedure code chosen. */
export function renderProvisionBlank(pair: Pair): string {
  return `[To be confirmed: Section ${pair.crpc} of the CrPC or Section ${pair.bnss} of the BNSS]`;
}

// ── Dates ───────────────────────────────────────────────────────────────────

function validYmd(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1) return null;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > days) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * A date as `YYYY-MM-DD`, or null when it cannot be read for certain.
 * Reads ISO (`2024-07-01`, with or without a time part) and day-first
 * `dd/mm/yyyy`, `dd.mm.yyyy`, `dd-mm-yyyy`. A two-digit year, a month name or
 * any other form is not read: a date Lawie is not sure of is treated as not given.
 */
export function parseLawDate(value: unknown): string | null {
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return validYmd(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value !== 'string') return null;
  const s = value.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(s);
  if (iso) return validYmd(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
  if (dmy) return validYmd(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  return null;
}

/** The law of the offence from the date of the offence; null when no date can be read. */
export function offenceLawFor(offenceDate: unknown): OffenceLaw | null {
  const d = parseLawDate(offenceDate);
  if (d === null) return null;
  return d < LAW_SWITCH_DATE ? 'IPC' : 'BNS';
}

/** True only when the FIR date is given, readable and on or after 1 July 2024. */
export function firForcesBnss(firDate: unknown): boolean {
  const d = parseLawDate(firDate);
  return d !== null && d >= LAW_SWITCH_DATE;
}

// ── Inputs ──────────────────────────────────────────────────────────────────

const slug = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

/**
 * The advocate's `procedure_code` choice, read from the option label or its id
 * (`BNSS and BSA` / `bnss_and_bsa`, `CrPC and Evidence Act` /
 * `crpc_and_evidence_act`). Anything else is no choice.
 */
export function readProcedureChoice(value: unknown): ProcedureCode | null {
  if (typeof value !== 'string') return null;
  const v = slug(value);
  if (v === slug(PROCEDURE_CODE_OPTIONS.BNSS)) return 'BNSS';
  if (v === slug(PROCEDURE_CODE_OPTIONS.CrPC)) return 'CrPC';
  return null;
}

/** courts-db `courtType` ids (config/courts/indian-courts.json). */
const MAGISTRATE_COURT_TYPES = new Set(['jmfc', 'cjm']);
const SESSIONS_OR_HC_COURT_TYPES = new Set(['sessions', 'high_court', 'high_court_bench']);

/**
 * The court for the pair, from a courts-db court type id only. `district_court`
 * houses both Magistrates and the Court of Session, so it is unknown, as is any
 * free text: the court is never guessed.
 */
export function bailCourtFromCourtType(courtType: unknown): BailCourt | null {
  if (typeof courtType !== 'string') return null;
  const t = slug(courtType);
  if (MAGISTRATE_COURT_TYPES.has(t)) return 'magistrate';
  if (SESSIONS_OR_HC_COURT_TYPES.has(t)) return 'sessions_or_hc';
  return null;
}

export function isLawSwitchPack(templateId: string): templateId is LawSwitchPack {
  return (LAW_SWITCH_PACKS as readonly string[]).includes(templateId);
}

// ── The switch ──────────────────────────────────────────────────────────────

export interface LawSwitchInput {
  templateId: string;
  /** The advocate's choice, as the form or brief gives it (label or option id). */
  procedureCode?: unknown;
  firDate?: unknown;
  offenceDate?: unknown;
  /** The court for the pair; for single-pair packs it is not read. */
  court?: BailCourt | null;
  /**
   * bail_before_magistrate only: true when the offence is bailable (the
   * skeleton's `Bailable` variant), giving the 436 → 478 pair. Otherwise the
   * pack's 437 → 480 pair.
   */
  offenceBailable?: boolean | null;
}

export interface LawSwitchResult {
  /** BNSS when the FIR date is on or after 1 July 2024; else the choice; else null. */
  procedureCode: ProcedureCode | null;
  /** True when the FIR date forced BNSS (any choice was overridden). */
  forcedByFirDate: boolean;
  /** IPC / BNS from the offence date; null when no date is given. */
  offenceLaw: OffenceLaw | null;
  /** What `{governing_provision}` prints. */
  governingProvision: string;
  /** `{GOVERNING_PROVISION}`: the same, upper-cased as a whole (Addendum 1). */
  governingProvisionUpper: string;
  /** bail_before_magistrate only: the women's proviso phrase (Addendum 1 #2). */
  womenProviso: string | null;
  /** `{notice_provision}`: the notice to appear, BNSS 35(3) / CrPC 41A (Addendum 2 #1). */
  noticeProvision: string;
  /**
   * The derived case-details lines for the Drafter: `PROCEDURE CODE: ...` and
   * `GOVERNING PROVISION: ...`. Empty with no procedure code (the P-text blank applies).
   */
  lines: string[];
}

/** The switch for one bail pack. Throws for a template that is not a T-245a pack. */
export function lawSwitch(input: LawSwitchInput): LawSwitchResult {
  const { templateId } = input;
  if (!isLawSwitchPack(templateId)) {
    throw new Error(`law-switch: '${templateId}' is not a T-245a pack`);
  }
  const forcedByFirDate = firForcesBnss(input.firDate);
  const procedureCode: ProcedureCode | null = forcedByFirDate
    ? 'BNSS'
    : readProcedureChoice(input.procedureCode);
  const offenceLaw = offenceLawFor(input.offenceDate);

  const pairs = PAIRS[templateId];
  let pair: Pair | null = null;
  if (templateId === 'bail_before_magistrate' && input.offenceBailable === true) {
    pair = BAILABLE_PAIR;
  } else if ('any' in pairs) pair = pairs.any;
  else if (input.court === 'magistrate') pair = pairs.magistrate;
  else if (input.court === 'sessions_or_hc') pair = pairs.sessions_or_hc;

  let governingProvision: string;
  if (pair !== null) {
    governingProvision =
      procedureCode === null
        ? renderProvisionBlank(pair)
        : renderProvision(procedureCode, procedureCode === 'BNSS' ? pair.bnss : pair.crpc);
  } else if (COURT_UNKNOWN_SIGNED.has(templateId)) {
    governingProvision = COURT_UNKNOWN[procedureCode ?? 'none'];
  } else {
    // bail_cancellation is the only other two-pair pack.
    governingProvision = CANCELLATION_COURT_UNKNOWN[procedureCode ?? 'none'];
  }

  const womenProviso =
    templateId === 'bail_before_magistrate' ? WOMEN_PROVISO[procedureCode ?? 'none'] : null;

  const lines: string[] = [];
  if (procedureCode !== null) {
    lines.push(`PROCEDURE CODE: ${PROCEDURE_CODE_OPTIONS[procedureCode]}`);
    lines.push(`GOVERNING PROVISION: ${governingProvision}`);
  }

  return {
    procedureCode,
    forcedByFirDate,
    offenceLaw,
    governingProvision,
    governingProvisionUpper: governingProvision.toUpperCase(),
    womenProviso,
    noticeProvision: NOTICE_PROVISION[procedureCode ?? 'none'],
    lines,
  };
}

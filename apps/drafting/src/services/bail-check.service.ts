/**
 * Bail Eligibility Checker — SCRUM-47
 *
 * Given BNS (or old IPC) section numbers, determines:
 *   - Bailable / non-bailable per section
 *   - Cognizable / non-cognizable
 *   - Compoundable / non-compoundable
 *   - Maximum punishment
 *   - Recommended BNSS bail section
 *   - Court jurisdiction level
 */
import {
  DEPENDS_FIRST_SCHEDULE,
  NOT_AN_OFFENCE,
  ResolutionKind,
  resolveOffence,
} from './bns-offence-resolver';
import { lookupOldToNew } from './sections.service';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface OffenceInfo {
  /** BNS section as resolved (the input target) */
  section: string;
  /** How the target resolved (T-277, R2) */
  resolution: Exclude<ResolutionKind, 'not_an_offence'>;
  /** Table row or variant key used */
  resolvedKey: string;
  title: string;
  /** Variant's offence description, when resolved through a variant */
  offenceDescription?: string;
  punishment: string;
  /** Only an exact-key row carries max_years; null otherwise (T-277, R1) */
  maxYears: number | null;
  /** Term for the court level only: exact row or parent row without variants */
  courtMaxYears: number | null;
  /** null = "Depends. Check the First Schedule." (T-277, R3) — never false */
  bailable: boolean | null;
  cognizable: boolean | null;
  /** 'with_permission' = "Compoundable with the Court's permission" (Ajay, Q7) */
  compoundable: boolean | 'with_permission' | null;
  /** DEPENDS_FIRST_SCHEDULE when the matching attribute is null; Q7 text for with_permission */
  bailableNote: string | null;
  cognizableNote: string | null;
  compoundableNote: string | null;
  /** The table's verify note, when present */
  verify?: string;
  chapter: string;
}

export interface SectionResult {
  /** Input section as given by user */
  input: string;
  /** Resolved BNS section */
  bnsSection: string;
  /** Whether the input was auto-converted from IPC */
  convertedFromIpc: boolean;
  /** Original IPC section if converted */
  ipcSection?: string;
  /** Offence details, null if the section does not resolve to an offence */
  offence: OffenceInfo | null;
  /** True if the section resolved to an offence in our table */
  found: boolean;
  /**
   * Set when an IPC input has no BNS target, or no row in the IPC table, or the
   * BNS section does not create an offence (NOT_AN_OFFENCE).
   */
  note?: string;
}

export interface BailCheckResult {
  sections: SectionResult[];
  summary: {
    /**
     * false if any charged section is non-bailable; true only if every charged
     * section resolved and is bailable; null otherwise ("depends").
     */
    overallBailable: boolean | null;
    /** DEPENDS_FIRST_SCHEDULE when overallBailable is null */
    overallBailableNote: string | null;
    /** Charged sections whose bailability is not known (null or unresolved IPC input) */
    undeterminedSections: string[];
    /** Most serious offence section */
    mostSeriousSection: string;
    /** Maximum punishment across all sections */
    maxPunishment: string;
    /** null when any resolved section has no single max term */
    maxYears: number | null;
    /** Term behind courtLevel only; may come from a parent row (never the period) */
    courtMaxYears: number | null;
    /** Recommended BNSS section for bail; null when bailability depends */
    bnssBailSection: string | null;
    bnssBailSectionTitle: string;
    /** Recommended court level */
    courtLevel: string;
    courtLevelExplanation: string;
    /** CTA text */
    recommendation: string;
  };
}

// ── Offence Lookup ─────────────────────────────────────────────────────────────

function lookupOffence(bnsSection: string): OffenceInfo | null {
  const r = resolveOffence(bnsSection);
  if (r.kind === 'not_an_offence' || r.key === null) return null;
  // Ajay Q7: one rule everywhere — 'with_permission' is kept, never "Depends".
  const compoundable =
    r.compoundable === 'yes'
      ? true
      : r.compoundable === 'no'
        ? false
        : r.compoundable === 'with_permission'
          ? 'with_permission'
          : null;
  return {
    section: r.section,
    resolution: r.kind,
    resolvedKey: r.key,
    title: r.title ?? '',
    ...(r.offence ? { offenceDescription: r.offence } : {}),
    punishment: r.punishment ?? '',
    maxYears: r.maxYears,
    courtMaxYears: r.courtMaxYears,
    bailable: r.bailable,
    cognizable: r.cognizable,
    compoundable,
    bailableNote: r.bailableNote,
    cognizableNote: r.cognizableNote,
    compoundableNote: r.compoundableNote,
    ...(r.verify ? { verify: r.verify } : {}),
    chapter: r.chapter ?? '',
  };
}

// ── IPC Detection ──────────────────────────────────────────────────────────────

/** Common IPC sections that advocates enter (beyond 358 = BNS range) */
const IPC_INDICATORS = new Set([
  '302',
  '304',
  '304A',
  '306',
  '307',
  '354',
  '376',
  '377',
  '379',
  '380',
  '384',
  '392',
  '395',
  '406',
  '409',
  '415',
  '417',
  '418',
  '420',
  '426',
  '427',
  '447',
  '448',
  '452',
  '457',
  '463',
  '464',
  '465',
  '467',
  '468',
  '471',
  '482',
  '489',
  '497',
  '498A',
  '500',
  '504',
  '506',
  '509',
]);

/**
 * Determine if a section number is likely IPC vs BNS.
 * BNS has 358 sections; IPC had 511.
 * If user explicitly passes code prefix (e.g., "302-IPC"), that's handled upstream.
 * Here we guess based on number and known patterns.
 */
function isLikelyIpc(section: string): boolean {
  const num = parseInt(section, 10);
  if (isNaN(num)) return false;
  // Sections > 358 can only be IPC
  if (num > 358) return true;
  // Check known IPC indicators for overlapping range
  return IPC_INDICATORS.has(section);
}

/** Ajay (CLO), T-277 round 6: court level when a charged section's term is unknown. */
export const COURT_LEVEL_DEPENDS = 'Depends on the offence. Check the First Schedule.';
/** Ajay (CLO), T-277 round 7 (signed): non-bailable, death/life or above 7 years. */
export const BAIL_TITLE_483 =
  'Bail in non-bailable offence (BNSS Section 483), discretionary: apply to the Sessions Court or the High Court';
/** Ajay (CLO), T-277 round 7 (signed): non-bailable, up to 7 years. */
export const BAIL_TITLE_480 =
  'Bail in non-bailable offence (BNSS Section 480), discretionary: apply to the Magistrate; if refused, to the Sessions Court or the High Court under BNSS Section 483';
/** Ajay (CLO), T-277 round 6: no bail provision named when a term is unknown. */
export const BAIL_PROVISION_DEPENDS =
  'Which bail provision applies depends on the offence. Check BNSS sections 480 and 483.';

// ── Jurisdiction Logic ─────────────────────────────────────────────────────────

function determineCourtLevel(maxYears: number | null): {
  level: string;
  explanation: string;
} {
  // T-277: an unknown maximum term is never treated as 0.
  if (maxYears === null) {
    // Ajay (signed, T-277 round 6); the web prints its own "Court:" label. No explanation.
    return { level: COURT_LEVEL_DEPENDS, explanation: '' };
  }
  if (maxYears === 0) {
    return {
      level: 'Judicial Magistrate First Class (JMFC)',
      explanation:
        'Offences punishable with fine only or imprisonment up to 3 years are triable by a Magistrate.',
    };
  }
  if (maxYears <= 3) {
    return {
      level: 'Judicial Magistrate First Class (JMFC)',
      explanation: `Maximum punishment is ${maxYears} year(s). Offences up to 3 years imprisonment are triable by JMFC.`,
    };
  }
  if (maxYears <= 7) {
    return {
      level: 'Court of Sessions',
      explanation: `Maximum punishment is ${maxYears} years. Offences with punishment between 3-7 years are generally triable by Sessions Court.`,
    };
  }
  if (maxYears >= 99) {
    return {
      level: 'Court of Sessions (bail from High Court if rejected)',
      explanation:
        'Offences punishable with death or imprisonment for life. Triable exclusively by Sessions Court. If bail rejected by Sessions, apply to the High Court under BNSS Section 483.',
    };
  }
  return {
    level: 'Court of Sessions or High Court',
    explanation: `Maximum punishment exceeds 7 years (${maxYears} years). Triable by Sessions Court. Bail may be sought from Sessions or High Court.`,
  };
}

function determineBnssBailSection(
  bailable: boolean | null,
  courtMaxYears: number | null,
): { section: string | null; title: string } {
  // T-277: bailability unknown → no recommended section.
  if (bailable === null) {
    return { section: null, title: DEPENDS_FIRST_SCHEDULE };
  }
  if (bailable) {
    return {
      section: '478',
      title: 'Bail in bailable offence (BNSS Section 478) — bail is a matter of right',
    };
  }
  // Term unknown: no provision named (round 6 (e)); the caller normally catches this.
  if (courtMaxYears === null) {
    return { section: null, title: BAIL_PROVISION_DEPENDS };
  }
  // Ajay (signed, T-277 round 7): death or life, or above 7 years → BNSS 483.
  if (courtMaxYears > 7) {
    return { section: '483', title: BAIL_TITLE_483 };
  }
  // Ajay (signed, T-277 round 7): up to 7 years → BNSS 480.
  return { section: '480', title: BAIL_TITLE_480 };
}

// ── Main Check ─────────────────────────────────────────────────────────────────

/** Ajay (CLO), T-267 ruling C: a null BNS target is reported, never looked up as BNS. */
export const NO_BNS_EQUIVALENT = 'No BNS equivalent. Check the Gazette';
/** Ajay (CLO), T-267: an explicit "NNN-IPC" with no row is never looked up as BNS. */
export const NOT_IN_IPC_TABLE = 'Not found in the IPC table. Check the Gazette';

/** How a charged section is named in "Section {n}: …" lines: "420-IPC" → "IPC 420". */
function displaySection(input: string, ipcSection: string | undefined, bnsSection: string): string {
  if (ipcSection) return `IPC ${ipcSection}`;
  return bnsSection || input;
}

export async function checkBailEligibility(sectionInputs: string[]): Promise<BailCheckResult> {
  const results: SectionResult[] = [];
  /** Charged sections whose bailability is unknown (T-277). */
  const undeterminedSections: string[] = [];

  for (const raw of sectionInputs) {
    const input = raw.trim();
    if (!input) continue;

    // Check if user provided code prefix (e.g., "302-IPC", "103-BNS")
    const dashMatch = input.match(/^(\d+[A-Za-z]{0,2}(?:\([0-9A-Za-z]+\))*)\s*[-–]\s*(\w+)$/);
    let bnsSection = input;
    let convertedFromIpc = false;
    let ipcSection: string | undefined;
    let note: string | undefined;
    /** An IPC input that did not reach a BNS target. */
    let ipcUnresolved = false;

    if (dashMatch) {
      const [, num, code] = dashMatch;
      const codeUpper = code.toUpperCase();
      if (codeUpper === 'IPC') {
        // Explicit IPC — convert via lookupOldToNew
        const mapping = await lookupOldToNew(num, 'IPC');
        if (mapping && mapping.new_section) {
          ipcSection = num;
          bnsSection = mapping.new_section;
          convertedFromIpc = true;
        } else {
          bnsSection = '';
          ipcSection = num;
          convertedFromIpc = true;
          ipcUnresolved = true;
          note = mapping ? NO_BNS_EQUIVALENT : NOT_IN_IPC_TABLE;
        }
      } else {
        bnsSection = num;
      }
    } else if (isLikelyIpc(input)) {
      // Auto-detect IPC — try to convert
      const mapping = await lookupOldToNew(input, 'IPC');
      if (mapping && mapping.new_section) {
        ipcSection = input;
        bnsSection = mapping.new_section;
        convertedFromIpc = true;
      } else if (mapping) {
        bnsSection = '';
        ipcSection = input;
        convertedFromIpc = true;
        ipcUnresolved = true;
        note = NO_BNS_EQUIVALENT;
      } else {
        // Section is likely IPC (> 358 or in known set) but no mapping found
        ipcSection = input;
        convertedFromIpc = true;
        ipcUnresolved = true;
      }
    }

    const offence = note ? null : lookupOffence(bnsSection);
    // An IPC input with no BNS target is unknown, not "not an offence".
    if (!offence && !note && !ipcUnresolved) note = NOT_AN_OFFENCE;
    if (!offence && ipcUnresolved) undeterminedSections.push(displaySection(input, ipcSection, ''));

    results.push({
      input,
      bnsSection,
      convertedFromIpc,
      ipcSection,
      offence,
      found: offence !== null,
      ...(note ? { note } : {}),
    });
  }

  // T-277: null bailable / max_years are "depends", never false / 0.
  const foundResults = results.filter((r) => r.offence !== null);
  for (const r of foundResults) {
    if (r.offence && r.offence.bailable === null) {
      undeterminedSections.push(displaySection(r.input, r.ipcSection, r.bnsSection));
    }
  }

  // Seriousness: non-bailable > depends > bailable; then an unknown max term
  // ranks above any known term, then the higher known term.
  const bailRank = (b: boolean | null): number => (b === false ? 2 : b === null ? 1 : 0);
  const yearsRank = (y: number | null): number => (y === null ? Infinity : y);
  const mostSerious = foundResults.reduce<SectionResult | null>((worst, curr) => {
    if (!worst) return curr;
    if (!curr.offence || !worst.offence) return worst;
    const cb = bailRank(curr.offence.bailable);
    const wb = bailRank(worst.offence.bailable);
    if (cb !== wb) return cb > wb ? curr : worst;
    return yearsRank(curr.offence.maxYears) > yearsRank(worst.offence.maxYears) ? curr : worst;
  }, null);

  let overallBailable: boolean | null;
  if (foundResults.some((r) => r.offence?.bailable === false)) overallBailable = false;
  else if (foundResults.length === 0 || undeterminedSections.length > 0) overallBailable = null;
  else overallBailable = true;

  const maxYears: number | null =
    foundResults.length === 0 || foundResults.some((r) => r.offence?.maxYears === null)
      ? null
      : Math.max(...foundResults.map((r) => r.offence?.maxYears ?? 0));
  // Ajay (T-277 round 2): a parent row without variants may set the court level only.
  // Court term: a known death/life term (exact, or a parent's court term) fixes
  // Sessions even if another term is unknown; otherwise any unknown term → Depends.
  const knownCourtTerms = foundResults
    .map((r) => r.offence?.courtMaxYears)
    .filter((y): y is number => typeof y === 'number');
  const anyUnknownTerm = foundResults.some((r) => r.offence?.courtMaxYears === null);
  const anyKnownLife = knownCourtTerms.some((y) => y >= 99);
  const courtMaxYears: number | null =
    foundResults.length === 0 || (anyUnknownTerm && !anyKnownLife)
      ? null
      : Math.max(...knownCourtTerms);
  const court = determineCourtLevel(courtMaxYears);
  // Ajay (round 6): a non-bailable charge with an unknown term names no bail
  // provision, unless a known term (exact, or a parent's court term) is death or life.
  const bnssBail =
    overallBailable === false && anyUnknownTerm && !anyKnownLife
      ? { section: null, title: BAIL_PROVISION_DEPENDS }
      : determineBnssBailSection(overallBailable, courtMaxYears);
  // Ajay (round 6): one line per section whose bailability is unknown.
  const dependsLines = undeterminedSections.map((n) => `Section ${n}: ${DEPENDS_FIRST_SCHEDULE}`);

  let recommendation: string;
  if (overallBailable === true) {
    recommendation =
      'All charged sections are bailable. Bail is a matter of right under BNSS Section 478. The accused is entitled to be released on bail.';
  } else if (overallBailable === false) {
    if (bnssBail.section === null) {
      recommendation = `One or more sections are non-bailable. ${BAIL_PROVISION_DEPENDS}`;
    } else {
      const forum = courtMaxYears === null ? '' : ` before the ${court.level}`;
      recommendation = `One or more sections are non-bailable. Bail application should be filed under BNSS Section ${bnssBail.section}${forum}. Consider filing for anticipatory bail under BNSS Section 482 if arrest is apprehended.`;
    }
    recommendation = [recommendation, ...dependsLines].join(' ');
  } else if (dependsLines.length > 0) {
    recommendation = dependsLines.join(' ');
  } else {
    // Nothing resolved to an offence: only the left-out lines below apply.
    recommendation = '';
  }
  // Ajay Q9: a non-offence section is excluded from "all", and the summary says so.
  const leftOut = results
    .filter((r) => r.note === NOT_AN_OFFENCE)
    .map(
      (r) =>
        `Section ${displaySection(r.input, r.ipcSection, r.bnsSection)} does not create an offence, so it was left out.`,
    );
  recommendation = [recommendation, ...leftOut].filter(Boolean).join(' ');

  return {
    sections: results,
    summary: {
      overallBailable,
      overallBailableNote: overallBailable === null ? DEPENDS_FIRST_SCHEDULE : null,
      undeterminedSections,
      mostSeriousSection: mostSerious?.bnsSection ?? '',
      maxPunishment: mostSerious?.offence?.punishment ?? 'N/A',
      maxYears,
      courtMaxYears,
      bnssBailSection: bnssBail.section,
      bnssBailSectionTitle: bnssBail.title,
      courtLevel: court.level,
      courtLevelExplanation: court.explanation,
      recommendation,
    },
  };
}

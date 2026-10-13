/**
 * Bail Eligibility Checker — SCRUM-47
 *
 * Given BNS (or old IPC) section numbers, determines:
 *   - Bailable / non-bailable per section
 *   - Cognizable / non-cognizable
 *   - Compoundable / non-compoundable
 *   - Maximum punishment
 *   - Recommended BNSS bail section
 *   - Court by which triable (First Schedule, T-289)
 */
import {
  ANY_MAGISTRATE,
  attributeNotes,
  COURT_OF_SESSION,
  DEPENDS_FIRST_SCHEDULE,
  MAGISTRATE_FIRST_CLASS,
  MOST_SERIOUS_CANNOT_BE_DETERMINED,
  NOT_AN_OFFENCE,
  NOT_VERIFIED,
  outsideBnsRange,
  readToolSections,
  ResolutionKind,
  resolveBnsKey,
  resolveOffence,
  showsVerifyCaveat,
  TABLE_CODE,
  VERIFY_CAVEAT,
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
  /** Term for the BNSS 480/483 choice only: exact row or parent row without variants */
  courtMaxYears: number | null;
  /** T-289: court by which triable, as printed in the First Schedule; null = depends */
  triableBy: string | null;
  /** null = "Depends. Check the First Schedule." (T-277, R3) — never false */
  bailable: boolean | null;
  cognizable: boolean | null;
  /** 'with_permission' = "Compoundable with the Court's permission" (Ajay, Q7) */
  compoundable: boolean | 'with_permission' | null;
  /** ATTRIBUTE_DEPENDS when the matching attribute is null (T-361 Addendum 1); Q7 text for with_permission */
  bailableNote: string | null;
  cognizableNote: string | null;
  compoundableNote: string | null;
  /** T-371: VERIFY_CAVEAT for a verify-flagged row. The raw verify text is never served. */
  caveat?: string;
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
   * Set when an IPC input has no BNS target (NO_BNS_EQUIVALENT), the section or its
   * mapping row is missing / unverified (NOT_VERIFIED, T-371), or the BNS section
   * does not create an offence (NOT_AN_OFFENCE).
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
    /**
     * Most serious offence section, by maximum term only (T-361 AC3). A section with no
     * known maximum is left out (T-361 Addendum 1); null when none has one.
     */
    mostSeriousSection: string | null;
    /** Punishment of the most serious section; MOST_SERIOUS_CANNOT_BE_DETERMINED or 'N/A' otherwise */
    maxPunishment: string;
    /** MOST_SERIOUS_CANNOT_BE_DETERMINED when sections resolved but none has a known maximum */
    mostSeriousNote: string | null;
    /** null when any resolved section has no single max term */
    maxYears: number | null;
    /** Term behind the BNSS 480/483 choice only; may come from a parent row (never the period or the court) */
    courtMaxYears: number | null;
    /** Recommended BNSS section for bail; null when bailability depends */
    bnssBailSection: string | null;
    bnssBailSectionTitle: string;
    /** T-289: court by which triable (First Schedule, as printed), or COURT_LEVEL_DEPENDS */
    courtLevel: string;
    /** Always '': no court explanation text is signed (T-289) */
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
    triableBy: r.triableBy,
    bailable: r.bailable,
    cognizable: r.cognizable,
    compoundable,
    ...attributeNotes(r),
    ...(showsVerifyCaveat(r) ? { caveat: VERIFY_CAVEAT } : {}),
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

/** Ajay (CLO), T-277 round 6 / T-289: the court when the First Schedule gives no single court. */
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

/**
 * Ajay (CLO), T-289 rules 3-5 (signed): the court comes ONLY from the First
 * Schedule value (`triableBy`), never from the term.
 * - One charged section: its value as printed (a reference value included); null
 *   is COURT_LEVEL_DEPENDS.
 * - Several: any Court of Session decides; else, if every one is Magistrate of the
 *   first class or Any Magistrate, the higher of the two; else (a null, a reference
 *   value or any other value) COURT_LEVEL_DEPENDS.
 * `null` in `values` is a charged section whose court is unknown.
 */
function determineCourtLevel(values: Array<string | null>): string {
  if (values.length === 0) return COURT_LEVEL_DEPENDS;
  if (values.length === 1) return values[0] ?? COURT_LEVEL_DEPENDS;
  if (values.includes(COURT_OF_SESSION)) return COURT_OF_SESSION;
  if (values.every((v) => v === MAGISTRATE_FIRST_CLASS || v === ANY_MAGISTRATE)) {
    return values.includes(MAGISTRATE_FIRST_CLASS) ? MAGISTRATE_FIRST_CLASS : ANY_MAGISTRATE;
  }
  return COURT_LEVEL_DEPENDS;
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

/**
 * T-371: the bail checker's input, read with the tools' reader (T-277), so
 * "BNS 318(4), BNS 316(2)" and "318(4), 316(2)" give the same sections. Each entry
 * becomes a checker token: BNS → "318(4)", a bare number → "318(4)" (the IPC guess
 * below still applies), any other code → "420-IPC", "154-CrPC" and so on.
 */
export function readBailInputs(text: string): string[] {
  return readToolSections(text).map((e) => {
    if (e.code === null || e.code === 'BNS') return e.number;
    return `${e.number}-${TABLE_CODE[e.code] ?? 'OTHER'}`;
  });
}

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
      if (codeUpper !== 'IPC' && codeUpper !== 'BNS') {
        // T-371: CrPC, IEA, BNSS, BSA or another Act: not in the BNS offences table.
        // Before T-371 these were looked up as BNS numbers.
        bnsSection = '';
        ipcUnresolved = true;
        note = NOT_VERIFIED;
      } else if (codeUpper === 'IPC') {
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
          // T-371 (T-361 Addendum 1): missing or unverified row → NOT_VERIFIED; a
          // repealed row keeps Ajay's T-267 "No BNS equivalent" note.
          note =
            mapping && mapping.mapping_type !== 'unverified' ? NO_BNS_EQUIVALENT : NOT_VERIFIED;
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
      } else if (mapping && mapping.mapping_type !== 'unverified') {
        bnsSection = '';
        ipcSection = input;
        convertedFromIpc = true;
        ipcUnresolved = true;
        note = NO_BNS_EQUIVALENT;
      } else {
        // Likely IPC (> 358 or in known set) but no row, or an unverified row.
        bnsSection = '';
        ipcSection = input;
        convertedFromIpc = true;
        ipcUnresolved = true;
        // T-371 (T-361 Addendum 1): same as an explicit "NNN-IPC" with no row.
        note = NOT_VERIFIED;
      }
    }

    const offence = note ? null : lookupOffence(bnsSection);
    if (!offence && !note && !ipcUnresolved) {
      if (resolveBnsKey(bnsSection) === null && outsideBnsRange(bnsSection)) {
        // T-371 Addendum 1 point 1: a number outside the BNS (above 358) is unknown.
        note = NOT_VERIFIED;
        ipcUnresolved = true;
      } else {
        // T-277 rule 3 (kept by T-371 Addendum 1 point 1): a BNS number from 1 to 358
        // with no row, or a sub-section that creates no offence.
        note = NOT_AN_OFFENCE;
      }
    }
    if (!offence && ipcUnresolved) {
      undeterminedSections.push(displaySection(input, ipcSection, bnsSection));
    }

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

  // T-361 AC3 + Addendum 1 (Ajay), T-371 (Arjun): "most serious" ranks by the
  // maximum term only. A section with no known maximum (max_years null, or a variant
  // with no term of its own) is left out entirely, never ranked as infinite or lowest.
  // The first section wins a tie.
  const ranked = foundResults.filter(
    (r): r is SectionResult & { offence: OffenceInfo & { courtMaxYears: number } } =>
      typeof r.offence?.courtMaxYears === 'number',
  );
  const mostSerious = ranked.reduce<(typeof ranked)[number] | null>(
    (worst, curr) =>
      !worst || curr.offence.courtMaxYears > worst.offence.courtMaxYears ? curr : worst,
    null,
  );
  const mostSeriousUndetermined = foundResults.length > 0 && mostSerious === null;

  let overallBailable: boolean | null;
  if (foundResults.some((r) => r.offence?.bailable === false)) overallBailable = false;
  else if (foundResults.length === 0 || undeterminedSections.length > 0) overallBailable = null;
  else overallBailable = true;

  const maxYears: number | null =
    foundResults.length === 0 || foundResults.some((r) => r.offence?.maxYears === null)
      ? null
      : Math.max(...foundResults.map((r) => r.offence?.maxYears ?? 0));
  // Ajay (T-277 rounds 2, 6, 7): the term behind the BNSS 480/483 choice only. A
  // parent row without variants may set it. A known death/life term fixes 483 even
  // if another term is unknown; otherwise any unknown term → no provision named.
  // T-289: this term never decides the court.
  const knownCourtTerms = foundResults
    .map((r) => r.offence?.courtMaxYears)
    .filter((y): y is number => typeof y === 'number');
  const anyUnknownTerm = foundResults.some((r) => r.offence?.courtMaxYears === null);
  const anyKnownLife = knownCourtTerms.some((y) => y >= 99);
  const courtMaxYears: number | null =
    foundResults.length === 0 || (anyUnknownTerm && !anyKnownLife)
      ? null
      : Math.max(...knownCourtTerms);
  // Ajay (T-289): the court only from the First Schedule value. An IPC input with no
  // BNS target is a charged section whose court is unknown; a section that creates
  // no offence is left out (Q9).
  const courtLevel = determineCourtLevel(
    results
      .filter((r) => r.offence !== null || r.note !== NOT_AN_OFFENCE)
      .map((r) => r.offence?.triableBy ?? null),
  );
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
      // T-289: no forum from the term; the signed 480/483 title names where to apply.
      recommendation = `One or more sections are non-bailable. Bail application should be filed under BNSS Section ${bnssBail.section}. Consider filing for anticipatory bail under BNSS Section 482 if arrest is apprehended.`;
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
      mostSeriousSection: mostSerious?.bnsSection ?? null,
      maxPunishment: mostSerious
        ? mostSerious.offence.punishment
        : mostSeriousUndetermined
          ? MOST_SERIOUS_CANNOT_BE_DETERMINED
          : 'N/A',
      mostSeriousNote: mostSeriousUndetermined ? MOST_SERIOUS_CANNOT_BE_DETERMINED : null,
      maxYears,
      courtMaxYears,
      bnssBailSection: bnssBail.section,
      bnssBailSectionTitle: bnssBail.title,
      courtLevel,
      courtLevelExplanation: '',
      recommendation,
    },
  };
}

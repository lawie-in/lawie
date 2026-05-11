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
import offencesData from '../config/bns-offences.json';

import { lookupOldToNew } from './sections.service';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface OffenceInfo {
  section: string;
  title: string;
  punishment: string;
  maxYears: number;
  bailable: boolean;
  cognizable: boolean;
  compoundable: boolean;
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
  /** Offence details, null if section not found */
  offence: OffenceInfo | null;
  /** True if section found in our database */
  found: boolean;
}

export interface BailCheckResult {
  sections: SectionResult[];
  summary: {
    /** Overall bail type based on most serious offence */
    overallBailable: boolean;
    /** Most serious offence section */
    mostSeriousSection: string;
    /** Maximum punishment across all sections */
    maxPunishment: string;
    maxYears: number;
    /** Recommended BNSS section for bail */
    bnssBailSection: string;
    bnssBailSectionTitle: string;
    /** Recommended court level */
    courtLevel: string;
    courtLevelExplanation: string;
    /** CTA text */
    recommendation: string;
  };
}

// ── Offence Lookup ─────────────────────────────────────────────────────────────

const offences = offencesData.offences as Record<
  string,
  {
    title: string;
    punishment: string;
    max_years: number;
    bailable: boolean;
    cognizable: boolean;
    compoundable: boolean;
    chapter: string;
  }
>;

function lookupOffence(bnsSection: string): OffenceInfo | null {
  const entry = offences[bnsSection];
  if (!entry) return null;
  return {
    section: bnsSection,
    title: entry.title,
    punishment: entry.punishment,
    maxYears: entry.max_years,
    bailable: entry.bailable,
    cognizable: entry.cognizable,
    compoundable: entry.compoundable,
    chapter: entry.chapter,
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

// ── Jurisdiction Logic ─────────────────────────────────────────────────────────

function determineCourtLevel(maxYears: number): {
  level: string;
  explanation: string;
} {
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
        'Offences punishable with death or imprisonment for life. Triable exclusively by Sessions Court. If bail rejected by Sessions, approach High Court under BNSS Section 482.',
    };
  }
  return {
    level: 'Court of Sessions or High Court',
    explanation: `Maximum punishment exceeds 7 years (${maxYears} years). Triable by Sessions Court. Bail may be sought from Sessions or High Court.`,
  };
}

function determineBnssBailSection(
  bailable: boolean,
  maxYears: number,
): { section: string; title: string } {
  if (bailable) {
    return {
      section: '478',
      title: 'Bail in bailable offence (BNSS Section 478) — bail is a matter of right',
    };
  }
  if (maxYears >= 99) {
    // Death / life imprisonment — BNSS 482 (anticipatory) or 480 (regular from Sessions/HC)
    return {
      section: '480',
      title:
        'Bail in non-bailable offence (BNSS Section 480) — discretionary, apply before Sessions/High Court',
    };
  }
  if (maxYears > 7) {
    return {
      section: '480',
      title:
        'Bail in non-bailable offence (BNSS Section 480) — discretionary, Sessions Court or High Court',
    };
  }
  // Non-bailable but < 7 years
  return {
    section: '480',
    title:
      'Bail in non-bailable offence (BNSS Section 480) — discretionary, apply before Magistrate/Sessions Court',
  };
}

// ── Main Check ─────────────────────────────────────────────────────────────────

export async function checkBailEligibility(sectionInputs: string[]): Promise<BailCheckResult> {
  const results: SectionResult[] = [];

  for (const raw of sectionInputs) {
    const input = raw.trim();
    if (!input) continue;

    // Check if user provided code prefix (e.g., "302-IPC", "103-BNS")
    const dashMatch = input.match(/^(\d+[A-Za-z]?(?:\(\d+\))?)\s*[-–]\s*(\w+)$/);
    let bnsSection = input;
    let convertedFromIpc = false;
    let ipcSection: string | undefined;

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
          bnsSection = num;
          ipcSection = num;
          convertedFromIpc = true;
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
      } else {
        // Section is likely IPC (> 358 or in known set) but no mapping found
        ipcSection = input;
        convertedFromIpc = true;
      }
    }

    const offence = lookupOffence(bnsSection);

    results.push({
      input,
      bnsSection,
      convertedFromIpc,
      ipcSection,
      offence,
      found: offence !== null,
    });
  }

  // Determine summary from most serious offence
  const foundResults = results.filter((r) => r.offence !== null);
  const mostSerious = foundResults.reduce<SectionResult | null>((worst, curr) => {
    if (!worst) return curr;
    if (!curr.offence || !worst.offence) return worst;
    // Non-bailable > bailable
    if (!curr.offence.bailable && worst.offence.bailable) return curr;
    if (curr.offence.bailable && !worst.offence.bailable) return worst;
    // Higher punishment
    return curr.offence.maxYears > worst.offence.maxYears ? curr : worst;
  }, null);

  const overallBailable =
    foundResults.length > 0
      ? foundResults.every((r) => r.offence !== null && r.offence.bailable)
      : true;

  const maxYears = mostSerious?.offence?.maxYears ?? 0;
  const court = determineCourtLevel(maxYears);
  const bnssBail = determineBnssBailSection(overallBailable, maxYears);

  const recommendation = overallBailable
    ? 'All charged sections are bailable. Bail is a matter of right under BNSS Section 478. The accused is entitled to be released on bail.'
    : `One or more sections are non-bailable. Bail application should be filed under BNSS Section ${bnssBail.section} before the ${court.level}. Consider filing for anticipatory bail under BNSS Section 482 if arrest is apprehended.`;

  return {
    sections: results,
    summary: {
      overallBailable,
      mostSeriousSection: mostSerious?.bnsSection ?? '',
      maxPunishment: mostSerious?.offence?.punishment ?? 'N/A',
      maxYears,
      bnssBailSection: bnssBail.section,
      bnssBailSectionTitle: bnssBail.title,
      courtLevel: court.level,
      courtLevelExplanation: court.explanation,
      recommendation,
    },
  };
}

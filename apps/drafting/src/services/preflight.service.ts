/**
 * Pre-Generation Verification Layer — SCRUM-69
 *
 * Runs before /generate to catch input errors cheaply (~50ms rules + ~1.5s Haiku).
 * Architecture: ADR-018 (Arjun, CTO) | Rule taxonomy: CLO verification taxonomy (Ajay, CLO)
 *
 * Two layers:
 *   1. Pure-rule layer (~50ms): deterministic checks on form_data fields
 *   2. Haiku LLM layer (~1.5s): fuzzy checks on narrative text (run in parallel with rules)
 *
 * Hard-block triggers (only 5, per ADR-018 + SCRUM-69 spec):
 *   1. Future date in past-event field (FIR date, incident date, arrest date)
 *   2. Age out of range (<0 or >120)
 *   3. BNS/BNSS section not in first-schedule whitelist
 *   4. Missing required field (template-specific: cheque_amount, dishonour_reason, etc.)
 *   5. Narrative role inversion (petitioner = aggressor) — LLM
 *
 * Everything else: SOFT WARN (advocate can dismiss and proceed).
 * FAIL-OPEN: if Haiku API is down, rules-only result is returned + preflight_skipped logged.
 *
 * Rule authorship: Ajay (CLO) via /docs/legal/verification_rules.yaml
 * Vishal reads, never authors rules. Rule content questions → Ajay via Priya.
 */

import Anthropic from '@anthropic-ai/sdk';
import mongoose from 'mongoose';

import { env } from '../config/env';
import { Court } from '../models/Court.model';
import { Event } from '../models/Event.model';
import { LlmAuxCall } from '../models/LlmAuxCall.model';

import {
  ChargedSection,
  normaliseBnsSection,
  parentSection,
  readChargedField,
  resolveBnsKey,
  resolveOffence,
} from './bns-offence-resolver';
import { isLawSwitchPack, offenceLawFor } from './law-switch';
import {
  cacheCounts,
  effectiveCacheRates,
  estimateOutputTokens,
  getAiEffort,
  getModelRates,
  logLlmCall,
  parseAnthropicMessageUsage,
  priceUsage,
  resolveModel,
} from './llm-usage';
import { lookupOldToNew } from './sections.service';
import {
  clientFormData,
  declaredFieldIds,
  fieldSourceOf,
  loadTemplateConfig,
  oldLawLine,
  resolveAdvocate,
  resolveEnrollmentNumber,
} from './template-engine.service';
import { WS_OVER_90_DAYS_WARNING, wsOver90DaysWarningApplies } from './ws-limitation-warning';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PreflightFinding {
  rule_id: string;
  severity: 'hard' | 'soft';
  question: string;
}

export interface PreflightResult {
  verdict: 'pass' | 'soft' | 'hard';
  questions: string[];
  hardBlockReason?: string;
  /** Internal telemetry — not sent to client */
  _meta?: {
    rule_hits: string[];
    haiku_ran: boolean;
    haiku_unusual: boolean;
  };
}

// ── BNS whitelist ─────────────────────────────────────────────────────────────

// T-277 R5: a citation passes when it is a table key or has a parent row.
// Same resolveBnsKey as validator.ts BNS_SECTION_WHITELIST, so they cannot drift.
const BNS_WHITELIST = { has: (section: string): boolean => resolveBnsKey(section) !== null };

// T-277: E1 goes through the same resolver. Only a definite "bailable" counts;
// a null ("depends") or a non-offence never does.
const BNS_BAILABLE_SECTIONS = {
  has: (section: string): boolean => resolveOffence(section).bailable === true,
};

/** Valid BNSS bail sections per chapter (BNSS 478–484) */
const BNSS_BAIL_SECTIONS = new Set(['478', '479', '480', '481', '482', '483', '484']);

// ── Helpers ──────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * T-387: the profile values the renderer would use — the JWT name and the
 * profile's enrolment number. Both optional; absent means an empty profile.
 */
export interface PreflightProfile {
  advocateName?: string;
  enrollmentNumber?: string;
}

/**
 * T-387: the enrolment number the draft will print, by the same steps as
 * buildPlaceholderContext (T-311): a typed advocate_enrollment wins; else the
 * profile number, only when the printed name is also the profile's; else
 * undefined. No config means nothing is rendered, so nothing is printed.
 */
function printedEnrollmentNumber(
  templateId: string,
  rawFormData: Record<string, unknown>,
  profile?: PreflightProfile,
): string | undefined {
  const config = loadTemplateConfig(templateId);
  if (!config) return undefined;
  const { kept: formData } = clientFormData(config, rawFormData);
  const advocate = resolveAdvocate(formData, { name: profile?.advocateName }, config);
  const declaresEnrollment = declaredFieldIds(config).has('advocate_enrollment');
  return resolveEnrollmentNumber(
    declaresEnrollment ? formData.advocate_enrollment : undefined,
    profile?.enrollmentNumber,
    advocate.fromProfile,
  );
}

function num(v: unknown): number | null {
  const n = Number(v);
  return isNaN(n) ? null : n;
}

/** Parse date string (DD.MM.YYYY or YYYY-MM-DD) → Date | null */
function parseDate(value: unknown): Date | null {
  const s = str(value);
  if (!s) return null;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  // DD.MM.YYYY or DD/MM/YYYY
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) {
    const d = new Date(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Parse year from FIR number string (e.g. "091/2021" → 2021, "91/21" → 2021) */
function parseFirYear(firNumber: string): number | null {
  const m = firNumber.match(/\/(\d{2,4})$/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  // 2-digit year: assume 2000+
  return y < 100 ? 2000 + y : y;
}

/**
 * Parse sections_charged with the one shared reader (Arjun, T-277 round 4) and his
 * step 7 correction: picker array values of a `source: bns_mapping` field default
 * to BNS; a plain string keeps bare numbers bare.
 */
function parseSectionsCharged(templateId: string, value: unknown): ChargedSection[] {
  return readChargedField(value, fieldSourceOf(loadTemplateConfig(templateId), 'sections_charged'));
}

/** Display: a BNS number as before ("303"); another code named ("IPC 302"); bare as typed. */
function sectionLabel(e: ChargedSection): string {
  if (e.code === null || e.code === 'BNS') return e.number;
  return `${e.code === 'CRPC' ? 'CrPC' : e.code} ${e.number}`;
}

/** True when `a` is `b` or an ancestor of `b` along the T-277 parentSection chain. */
function isSelfOrAncestor(a: string, b: string): boolean {
  for (let k: string | null = b; k; k = parentSection(k)) if (k === a) return true;
  return false;
}

/**
 * T-324 sub-section rule: the table's BNS target and the attached BNS section match
 * when, after normaliseBnsSection, one is the other or an ancestor of it (T-277
 * parentSection chain). "303" matches a "303(2)" target and "303(2)(a)" does too;
 * siblings ("303(1)" vs "303(2)") and different sections never match.
 */
function sameBnsSection(tableTarget: string, attached: string): boolean {
  const t = normaliseBnsSection(tableTarget);
  const a = normaliseBnsSection(attached);
  if (!t || !a) return false;
  return isSelfOrAncestor(t, a) || isSelfOrAncestor(a, t);
}

/**
 * T-324 (Arjun's alias follow-up to T-295; Ajay's condition): indices in `sections`
 * of IPC alias entries whose old-law finding is skipped. The attached entry is the
 * reader's `attachedTo` (recorded before dedupe). Skip only when it is an explicit
 * BNS entry AND the signed T-267 table (via lookupOldToNew) maps the IPC number to it.
 * CrPC / IEA aliases, a missing or non-BNS attachedTo, IPC numbers with no BNS
 * target, and any lookup failure keep the warning.
 */
async function bnsMatchedAliasIndices(sections: ChargedSection[]): Promise<Set<number>> {
  const skip = new Set<number>();
  for (let i = 0; i < sections.length; i++) {
    const e = sections[i];
    const attached = e.attachedTo;
    if (!e.alias || e.code !== 'IPC' || attached?.code !== 'BNS') continue;
    try {
      const row = await lookupOldToNew(e.number, 'IPC');
      if (
        row?.new_code === 'BNS' &&
        row.new_section &&
        sameBnsSection(row.new_section, attached.number)
      ) {
        skip.add(i);
      }
    } catch {
      // Lookup unavailable: keep the warning (never skip on an unknown).
    }
  }
  return skip;
}

/** Levenshtein distance ≤ 2 (used for name-match check D1) */
function nearMatch(a: string, b: string): boolean {
  a = a.toLowerCase().trim();
  b = b.toLowerCase().trim();
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 3) return false;
  // Simple character overlap heuristic
  const setA = new Set(a.split(' '));
  const setB = new Set(b.split(' '));
  const common = [...setA].filter((w) => setB.has(w) && w.length > 2).length;
  return common >= 2 && common >= Math.min(setA.size, setB.size) * 0.8;
}

// T-690b: wsOver90DaysWarningApplies and WS_OVER_90_DAYS_WARNING live in
// ./ws-limitation-warning (T-690c), shared with the guided brief.

// ── Pure-rule layer ───────────────────────────────────────────────────────────

/**
 * Run all deterministic rule checks.
 * Returns findings array — empty array = all rules passed.
 */
async function runPureRules(
  templateId: string,
  formData: Record<string, unknown>,
  profile?: PreflightProfile,
): Promise<PreflightFinding[]> {
  const findings: PreflightFinding[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ── B2: Future date in past-event field ──────────────────────────────────
  // HARD BLOCK #1 (future date)
  for (const field of ['fir_date', 'incident_date', 'arrest_date'] as const) {
    const d = parseDate(formData[field]);
    if (d && d > today) {
      findings.push({
        rule_id: 'B2',
        severity: 'hard',
        question: `${field.replace(/_/g, ' ')} is in the future (${str(formData[field])}). Please correct.`,
      });
    }
  }

  // ── B1: FIR number-year vs FIR-date-year mismatch ───────────────────────
  // HARD BLOCK (treated as required-field/date-coherence violation)
  const firNumber = str(formData['fir_number']);
  const firDate = parseDate(formData['fir_date']);
  if (firNumber && firDate) {
    const firYear = parseFirYear(firNumber);
    const dateYear = firDate.getFullYear();
    if (firYear !== null && firYear !== dateYear) {
      findings.push({
        rule_id: 'B1',
        severity: 'hard',
        question: `FIR number (${firNumber}) has year ${firYear} but FIR date shows ${dateYear}. Which is correct?`,
      });
    }
  }

  // ── B3: Age/DOB inconsistency ────────────────────────────────────────────
  const age = num(formData['applicant_age']);
  const dob = parseDate(formData['dob']);

  // HARD BLOCK #2: age out of range (<0 or >120)
  if (age !== null && (age < 0 || age > 120)) {
    findings.push({
      rule_id: 'B3_hard',
      severity: 'hard',
      question: `Applicant age (${age}) is out of valid range (0–120). Please correct.`,
    });
  } else if (age !== null && dob) {
    // SOFT: stated age vs DOB inconsistency (>1 year difference)
    const calculatedAge = today.getFullYear() - dob.getFullYear();
    if (Math.abs(calculatedAge - age) > 1) {
      findings.push({
        rule_id: 'B3',
        severity: 'soft',
        question: `Stated age (${age}) and date of birth (${str(formData['dob'])}) don't match (calculated age ~${calculatedAge}). Please confirm.`,
      });
    }
  }

  // ── B4: Incident date precedes petitioner DOB ────────────────────────────
  const incidentDate = parseDate(formData['incident_date']);
  if (incidentDate && dob && incidentDate < dob) {
    findings.push({
      rule_id: 'B4',
      severity: 'soft',
      question: `Incident date (${str(formData['incident_date'])}) is before the petitioner's date of birth (${str(formData['dob'])}). Please verify.`,
    });
  }

  // ── BNS whitelist (hard, #3) / old-law section (soft, T-295) / no code (soft) ──
  const sections = parseSectionsCharged(templateId, formData['sections_charged']);
  // `sections` comes from the T-277 reader, already deduped on (code, number).
  const matchedAliases = await bnsMatchedAliasIndices(sections);
  // T-245a (Ajay, Addendum 1 ruling 7, 2992891): the old-law finding follows the
  // offence date only. It is raised only when the offence date is given and is on
  // or after 1 July 2024. No offence date: no finding (the S-text blank handles it);
  // the FIR date is never a stand-in for the offence date. This gate is for the
  // six T-245a bail packs only; every other template keeps the finding with no
  // date gate, as before T-245a.
  const oldLawFindingOn = isLawSwitchPack(templateId)
    ? offenceLawFor(formData['offence_date']) === 'BNS'
    : true;
  for (const [i, e] of sections.entries()) {
    // T-295 (Priya's soft decision; Arjun's ruling: the T-277 reader, not a per-part
    // loop): an IPC / CrPC / IEA entry is a SOFT warning carrying Ajay's signed line.
    // Never a section_whitelist finding; an old-law number never goes through the BNS
    // whitelist. T-245a: date-aware, on the offence date only (see above).
    // T-324: an IPC alias on a BNS entry the T-267 table maps it to gets no finding.
    const oldLine = oldLawLine(e.code, e.number);
    if (oldLine) {
      if (oldLawFindingOn && !matchedAliases.has(i)) {
        findings.push({ rule_id: 'old_law_section', severity: 'soft', question: oldLine });
      }
    } else if (e.code === null) {
      // Arjun (step 7 correction): a bare number is a soft warning, never a block,
      // and is never looked up in the BNS table.
      findings.push({
        rule_id: 'section_no_code',
        severity: 'soft',
        question: `Section ${e.number} has no code (BNS, IPC …). Add the code so it can be checked.`,
      });
    } else if (e.code === 'BNS' && !BNS_WHITELIST.has(e.number)) {
      // Otherwise hard block only for an explicit BNS code with an unknown parent
      // (BNS 999(1)). BNSS, BSA and other Acts no longer block (they did by accident).
      findings.push({
        rule_id: 'section_whitelist',
        severity: 'hard',
        question: `BNS Section ${sectionLabel(e)} is not in the First Schedule (recognised BNS offences). Please verify — this may be a typo or hallucination.`,
      });
    }
  }

  // ── HARD BLOCK #4: Missing required field (template-specific) ────────────

  // F1: s.138 notice — cheque amount required
  if (templateId === 'legal_notice_s138') {
    if (!str(formData['cheque_amount'])) {
      findings.push({
        rule_id: 'F1',
        severity: 'hard',
        question: 'Cheque amount is required for a s.138 NI Act notice. Please add.',
      });
    }
    // F2: dishonour reason required
    if (!str(formData['dishonour_reason'])) {
      findings.push({
        rule_id: 'F2',
        severity: 'hard',
        question:
          "Bank's dishonour reason (e.g. 'insufficient funds') is required to establish s.138 ingredients. Please add.",
      });
    }
  }

  // F4: vakalatnama — bar enrolment number required. T-387 (Ajay, 13 Oct
  // 2026): F4 checks the number the draft will print, resolved as
  // buildPlaceholderContext does (T-311), on the same un-aliased form data the
  // renderer reads, so a body carrying only the old T-382 key resolves as the
  // draft would.
  if (templateId === 'vakalatnama') {
    if (!str(printedEnrollmentNumber(templateId, formData, profile))) {
      findings.push({
        rule_id: 'F4',
        severity: 'hard',
        question:
          'Bar enrolment number is missing. Required under BCI Rules — vakalatnama will be rejected by registry without it.',
      });
    }
  }

  // ── C2: Consumer complaint pecuniary jurisdiction ────────────────────────
  if (templateId === 'consumer_complaint') {
    const claimAmount = num(formData['claim_amount']);
    // Rs. 50 lakh = 5,000,000 paise / 50,00,000 rupees
    if (claimAmount !== null && claimAmount > 5000000) {
      findings.push({
        rule_id: 'C2',
        severity: 'soft',
        question: `Claim amount (₹${claimAmount.toLocaleString('en-IN')}) exceeds District Consumer Commission limit of ₹50 lakh (post-Dec 2021 CPA notification). Should this go to the State Commission?`,
      });
    }
  }

  // ── C1: Court state vs police station state ──────────────────────────────
  // Only runs if we can determine court state from DB
  const courtName = str(formData['court_name']);
  const psState = str(formData['police_station_state'] ?? formData['ps_state'] ?? '');
  if (courtName && psState) {
    try {
      const court = await Court.findOne({ courtId: courtName }).lean();
      if (court && court.stateId && court.stateId.toLowerCase() !== psState.toLowerCase()) {
        findings.push({
          rule_id: 'C1',
          severity: 'soft',
          question: `Court is in ${court.state} but police station is in ${psState}. Is the forum correct?`,
        });
      }
    } catch {
      // Non-fatal: court lookup optional for preflight
    }
  }

  // ── D1: Same name on both sides ──────────────────────────────────────────
  const petitioner = str(formData['applicant_name'] ?? formData['petitioner_name'] ?? '');
  const respondent = str(formData['respondent_name'] ?? '');
  if (petitioner && respondent && nearMatch(petitioner, respondent)) {
    findings.push({
      rule_id: 'D1',
      severity: 'soft',
      question: `Petitioner and respondent appear to have the same name ("${petitioner}" / "${respondent}"). Please verify — this may be a copy-paste error.`,
    });
  }

  // ── D2: Petitioner age < 18 (minor) ─────────────────────────────────────
  if (age !== null && age >= 0 && age < 18) {
    findings.push({
      rule_id: 'D2',
      severity: 'soft',
      question: `Petitioner age is ${age} (minor). Application should typically be filed through a natural guardian/next friend per O.XXXII CPC. Continue?`,
    });
  }

  // ── D3: Married female + only father's name ──────────────────────────────
  const applicantTitle = str(formData['applicant_title'] ?? '');
  const fatherName = str(formData['father_name'] ?? '');
  const husbandName = str(formData['husband_name'] ?? '');
  if (/^smt\.|^w\/o/i.test(applicantTitle) && fatherName && !husbandName) {
    findings.push({
      rule_id: 'D3',
      severity: 'soft',
      question: `Petitioner is described as Smt. but only father's name is given. Add husband's name (W/o) for cause-title per district court convention?`,
    });
  }

  // ── E1: Anticipatory bail for bailable offence ───────────────────────────
  if (templateId === 'bail_anticipatory' && sections.length > 0) {
    const allBailable = sections.every(
      (e) => e.code === 'BNS' && BNS_BAILABLE_SECTIONS.has(e.number),
    );
    if (allBailable) {
      findings.push({
        rule_id: 'E1',
        severity: 'soft',
        question: `All sections cited (${sections.map(sectionLabel).join(', ')}) are bailable. Anticipatory bail (BNSS 482) isn't required — bail is a right under BNSS 478. Proceed?`,
      });
    }
  }

  // ── E2: Regular bail without arrest date ────────────────────────────────
  if (templateId === 'bail_regular' && !str(formData['arrest_date'])) {
    findings.push({
      rule_id: 'E2',
      severity: 'soft',
      question:
        'No arrest date provided. If the petitioner has not been arrested yet, anticipatory bail (BNSS 482) may be the correct route.',
    });
  }

  // ── E3: Bail section outside BNSS 478–484 ───────────────────────────────
  if (templateId === 'bail_regular' || templateId === 'bail_anticipatory') {
    const bailSection = str(formData['bail_section'] ?? '');
    if (bailSection) {
      const norm = bailSection.replace(/^BNSS\s*/i, '').trim();
      if (norm && !BNSS_BAIL_SECTIONS.has(norm)) {
        findings.push({
          rule_id: 'E3',
          severity: 'soft',
          question: `Bail section BNSS ${norm} is not in the BNSS bail chapter (478–484). Please correct.`,
        });
      }
    }
  }

  // ── F3: Rent agreement above registration threshold ──────────────────────
  if (templateId === 'rent_agreement') {
    const monthlyRent = num(formData['monthly_rent']);
    const termMonths = num(formData['tenancy_term_months'] ?? formData['tenancy_term'] ?? null);
    const registered = str(formData['registered'] ?? 'no').toLowerCase();
    if (monthlyRent && termMonths && termMonths >= 12) {
      const annualRent = monthlyRent * 12;
      if (annualRent > 100000 && registered !== 'yes') {
        findings.push({
          rule_id: 'F3',
          severity: 'soft',
          question: `Annual rent (₹${annualRent.toLocaleString('en-IN')}) may exceed the registration threshold. Unregistered, this agreement could be inadmissible under s.17 Registration Act. Register?`,
        });
      }
    }
  }

  // ── T-690b: written statement more than 90 days after service (soft) ─────
  // A warning, never a block (Ajay, 29 Oct 2026).
  if (wsOver90DaysWarningApplies(templateId, formData)) {
    findings.push({
      rule_id: 'ws_over_90_days',
      severity: 'soft',
      question: WS_OVER_90_DAYS_WARNING,
    });
  }

  return findings;
}

// ── LLM-assisted layer (Haiku 4.5) ───────────────────────────────────────────

const HAIKU_SYSTEM_PROMPT = `You are a legal input verifier for an Indian legal drafting tool.
Your job is to detect two types of issues in advocate-submitted form data:

1. SECTION vs FACTS mismatch: Does the charged BNS section match the facts described?
   - BNS 103 (Murder) requires the victim to be DEAD. If facts say victim is alive/hospitalised → flag.
   - BNS 105 (Culpable homicide) requires death. If no death in facts → flag.
   - BNS 64 (Rape) is gender-specific (female victim). If facts suggest male victim → flag.
   - BNS 318 (Cheating) requires false inducement/deception. If facts lack this element → flag.
   - BNS 117 (Grievous hurt) requires fracture, permanent damage, or 20+ day hospitalisation.

2. ROLE INVERSION: Does the narrative describe the petitioner as the AGGRESSOR (not the victim)?
   If petitioner is clearly the person who initiated violence/fraud → HARD BLOCK.

Respond ONLY with valid JSON:
{
  "unusual": boolean,
  "hard_block": boolean,
  "findings": [
    { "rule_id": "A1" | "A2" | "A3" | "A4" | "A5" | "G1" | "G2", "question": "advocate-friendly clarification question (max 160 chars)" }
  ]
}

Rules:
- hard_block = true ONLY for G2 (role inversion) or A1/A4 (murder/rape gender mismatch on living/wrong-gender victim)
- Keep questions respectful — "We noticed..." not "ERROR:"
- Return empty findings array if nothing is unusual
- Max 3 findings total`;

/**
 * T-437 (Arjun ruling 2): one LlmAuxCall row per preflight model call, the
 * same fields as intake's rows (numbers and ids only, never the form data or
 * the reply). No intake id reaches the preflight route, so the row has none.
 * Never throws: a failed write is logged and preflight goes on.
 */
async function recordPreflightCall(args: {
  userId?: string;
  status: 'completed' | 'failed';
  model: string;
  response: unknown;
  text: string;
  durationMs: number;
}): Promise<void> {
  if (!args.userId || !mongoose.Types.ObjectId.isValid(args.userId)) return;
  try {
    const counts = parseAnthropicMessageUsage(args.response);
    const fromProvider = counts.inputTokens !== undefined || counts.outputTokens !== undefined;
    const usage = {
      inputTokens: counts.inputTokens ?? 0,
      outputTokens: fromProvider
        ? (counts.outputTokens ?? 0)
        : args.text
          ? estimateOutputTokens(args.text)
          : 0,
      ...cacheCounts(counts),
    };
    const rate = await getModelRates(args.model);
    const priced = rate.costStatus === 'priced';
    const usedCache = Object.keys(cacheCounts(counts)).length > 0;
    const cacheRates = priced && usedCache ? effectiveCacheRates(rate.rate) : undefined;
    await LlmAuxCall.create({
      userId: args.userId,
      purpose: 'preflight',
      status: args.status,
      aiModel: args.model,
      transport: 'direct',
      ...usage,
      imageCount: 0,
      costUsd: priced ? priceUsage(usage, rate.rate, args.model) : 0,
      costStatus: rate.costStatus,
      usageSource: fromProvider ? 'provider' : 'estimated',
      rateInputUsdPerMTok: priced ? rate.rate.inputUsdPerMTok : undefined,
      rateOutputUsdPerMTok: priced ? rate.rate.outputUsdPerMTok : undefined,
      rateCacheWriteUsdPerMTok: cacheRates?.cacheWriteUsdPerMTok,
      rateCacheReadUsdPerMTok: cacheRates?.cacheReadUsdPerMTok,
      durationMs: args.durationMs,
    });
  } catch (err) {
    console.error(
      '[preflight] failed to record LlmAuxCall (purpose=preflight):',
      err instanceof Error ? err.message : 'unknown error',
    );
  }
}

async function runLLMChecks(
  templateId: string,
  formData: Record<string, unknown>,
  userId?: string,
): Promise<{ findings: PreflightFinding[]; ran: boolean }> {
  if (!env.ANTHROPIC_API_KEY) {
    return { findings: [], ran: false };
  }

  const sections = parseSectionsCharged(templateId, formData['sections_charged']);
  const factsNarrative = str(formData['facts_narrative'] ?? formData['key_facts'] ?? '');

  // Only run LLM if there's enough text to analyse
  if (!factsNarrative || factsNarrative.length < 30) {
    return { findings: [], ran: false };
  }

  const payload = {
    template_id: templateId,
    sections_charged: sections.map(sectionLabel),
    facts_narrative: factsNarrative.slice(0, 1500), // token budget
    respondent_type: str(formData['respondent_type'] ?? ''),
  };

  try {
    // Model id is configured at runtime via the AppSetting collection.
    // T-684: the fact_checker role (ai.model.fact_checker, falling back to
    // ai.preflight_model for one release). If unset, resolveModel throws →
    // caught below → preflight degrades gracefully to rules-only (fail-open per ADR-018).
    const model = await resolveModel('fact_checker');
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    // T-453: effort from ai.effort.preflight (default low). Never throws.
    const effort = await getAiEffort('preflight');
    const startedAt = Date.now();
    // T-437: not cached (Arjun ruling 2) — the system prompt stays a plain string.
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model,
        max_tokens: 300,
        system: HAIKU_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
        ...(effort ? { output_config: { effort } } : {}),
      });
    } catch (callErr) {
      logLlmCall({
        stage: 'preflight',
        call: 'preflight',
        model,
        effort: effort ?? null,
        status: 'failed',
        startedAt,
        durationMs: Date.now() - startedAt,
      });
      throw callErr;
    }
    const durationMs = Date.now() - startedAt;
    const callUsage = parseAnthropicMessageUsage(response);
    logLlmCall({
      stage: 'preflight',
      call: 'preflight',
      model,
      effort: effort ?? null,
      status: 'completed',
      inputTokens: callUsage.inputTokens,
      outputTokens: callUsage.outputTokens,
      cacheReadInputTokens: callUsage.cacheReadInputTokens,
      cacheCreationInputTokens: callUsage.cacheCreationInputTokens,
      stopReason: typeof response?.stop_reason === 'string' ? response.stop_reason : null,
      startedAt,
      durationMs,
    });

    // T-453: the first text block, not content[0] — Haiku 5.5 thinks by default,
    // so content[0] can be a thinking block.
    const textBlock = (response.content ?? []).find(
      (b): b is Anthropic.TextBlock => b?.type === 'text',
    );
    const text = textBlock?.text ?? '';

    // Strip markdown fences if any
    const clean = text.replace(/```(?:json)?/gi, '').trim();
    let parsed: {
      unusual: boolean;
      hard_block: boolean;
      findings: Array<{ rule_id: string; question: string }>;
    };
    try {
      parsed = JSON.parse(clean) as typeof parsed;
    } catch (parseErr) {
      // The call was made and billed even though its reply is unusable.
      await recordPreflightCall({ userId, status: 'failed', model, response, text, durationMs });
      throw parseErr;
    }
    await recordPreflightCall({ userId, status: 'completed', model, response, text, durationMs });

    const findings: PreflightFinding[] = (parsed.findings ?? []).map((f) => ({
      rule_id: f.rule_id,
      // G2 and A1/A4 are hard blocks per spec; everything else is soft
      severity:
        parsed.hard_block && (f.rule_id === 'G2' || f.rule_id === 'A1' || f.rule_id === 'A4')
          ? 'hard'
          : 'soft',
      question: f.question,
    }));

    return { findings, ran: true };
  } catch {
    // Fail-open: log and skip LLM layer
    return { findings: [], ran: false };
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Run the pre-generation verification layer.
 *
 * @param templateId  The template being generated (e.g. "bail_anticipatory")
 * @param formData    The advocate-submitted form data
 * @param userId      For telemetry (optional)
 * @param profile     T-387: the profile's advocate name (JWT) and enrolment
 *                    number, so F4 resolves the number the vakalatnama will
 *                    print exactly as the renderer does (optional; absent
 *                    means an empty profile)
 * @returns PreflightResult — verdict, questions, optional hard-block reason
 */
export async function preflightCheck(
  templateId: string,
  formData: Record<string, unknown>,
  userId?: string,
  profile?: PreflightProfile,
): Promise<PreflightResult> {
  // Run pure rules + Haiku in parallel (ADR-018: run alongside each other)
  const [ruleFindings, llmResult] = await Promise.all([
    runPureRules(templateId, formData, profile),
    runLLMChecks(templateId, formData, userId),
  ]);

  const allFindings = [...ruleFindings, ...llmResult.findings];
  const hardFindings = allFindings.filter((f) => f.severity === 'hard');
  const softFindings = allFindings.filter((f) => f.severity === 'soft');

  let verdict: 'pass' | 'soft' | 'hard';
  let hardBlockReason: string | undefined;

  if (hardFindings.length > 0) {
    verdict = 'hard';
    hardBlockReason = hardFindings[0].question;
  } else if (softFindings.length > 0) {
    verdict = 'soft';
  } else {
    verdict = 'pass';
  }

  const ruleHits = allFindings.map((f) => f.rule_id);

  // Telemetry — fire-and-forget (non-blocking)
  void logPreflightEvent({
    userId,
    templateId,
    verdict,
    ruleHits,
    haikuRan: llmResult.ran,
    haikuUnusual: llmResult.findings.length > 0,
  });

  return {
    verdict,
    questions: allFindings.map((f) => f.question),
    hardBlockReason,
    _meta: {
      rule_hits: ruleHits,
      haiku_ran: llmResult.ran,
      haiku_unusual: llmResult.findings.length > 0,
    },
  };
}

// ── Telemetry ─────────────────────────────────────────────────────────────────

async function logPreflightEvent(data: {
  userId?: string;
  templateId: string;
  verdict: string;
  ruleHits: string[];
  haikuRan: boolean;
  haikuUnusual: boolean;
}): Promise<void> {
  // Telemetry requires a valid ObjectId — skip if not available
  if (!data.userId || !mongoose.Types.ObjectId.isValid(data.userId)) return;
  try {
    await Event.create({
      userId: new mongoose.Types.ObjectId(data.userId),
      type: 'preflight_result',
      metadata: {
        templateId: data.templateId,
        verdict: data.verdict,
        rule_hits: data.ruleHits,
        haiku_ran: data.haikuRan,
        haiku_unusual: data.haikuUnusual,
      },
    });
  } catch {
    // Non-fatal telemetry failure
  }
}

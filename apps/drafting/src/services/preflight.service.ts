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

import bnsOffences from '../config/bns-offences.json';
import { env } from '../config/env';
import { Court } from '../models/Court.model';
import { Event } from '../models/Event.model';

import { APP_SETTING_KEYS, getAppSetting } from './app-settings.service';

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

const BNS_WHITELIST = new Set(Object.keys((bnsOffences as { offences: Record<string, unknown> }).offences));

const BNS_BAILABLE_SECTIONS = new Set(
  Object.entries((bnsOffences as { offences: Record<string, { bailable: boolean }> }).offences)
    .filter(([, v]) => v.bailable)
    .map(([k]) => k),
);

/** Valid BNSS bail sections per chapter (BNSS 478–484) */
const BNSS_BAIL_SECTIONS = new Set(['478', '479', '480', '481', '482', '483', '484']);

// ── Helpers ──────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
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

/** Normalise BNS section string: "103", "103(1)", "BNS 103" → "103" or "103(1)" */
function normaliseBnsSection(raw: string): string {
  return raw.replace(/^(BNS|BNSS|BSA)\s*/i, '').trim();
}

/** Parse sections_charged field — accepts comma-separated or array */
function parseSectionsCharged(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => normaliseBnsSection(str(v))).filter(Boolean);
  return str(value)
    .split(/[,;]+/)
    .map((s) => normaliseBnsSection(s))
    .filter(Boolean);
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

// ── Pure-rule layer ───────────────────────────────────────────────────────────

/**
 * Run all deterministic rule checks.
 * Returns findings array — empty array = all rules passed.
 */
async function runPureRules(
  templateId: string,
  formData: Record<string, unknown>,
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

  // ── HARD BLOCK #3: BNS section not in whitelist ──────────────────────────
  const sections = parseSectionsCharged(formData['sections_charged']);
  for (const s of sections) {
    if (s && !BNS_WHITELIST.has(s)) {
      findings.push({
        rule_id: 'section_whitelist',
        severity: 'hard',
        question: `BNS Section ${s} is not in the First Schedule (recognised BNS offences). Please verify — this may be a typo or hallucination.`,
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
        question: "Bank's dishonour reason (e.g. 'insufficient funds') is required to establish s.138 ingredients. Please add.",
      });
    }
  }

  // F4: vakalatnama — bar enrolment number required
  if (templateId === 'vakalatnama') {
    if (!str(formData['advocate_enrolment_no'])) {
      findings.push({
        rule_id: 'F4',
        severity: 'hard',
        question: 'Bar enrolment number is missing. Required under BCI Rules — vakalatnama will be rejected by registry without it.',
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
    const allBailable = sections.every((s) => BNS_BAILABLE_SECTIONS.has(s));
    if (allBailable) {
      findings.push({
        rule_id: 'E1',
        severity: 'soft',
        question: `All sections cited (${sections.join(', ')}) are bailable. Anticipatory bail (BNSS 482) isn't required — bail is a right under BNSS 478. Proceed?`,
      });
    }
  }

  // ── E2: Regular bail without arrest date ────────────────────────────────
  if (templateId === 'bail_regular' && !str(formData['arrest_date'])) {
    findings.push({
      rule_id: 'E2',
      severity: 'soft',
      question: 'No arrest date provided. If the petitioner has not been arrested yet, anticipatory bail (BNSS 482) may be the correct route.',
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

async function runLLMChecks(
  templateId: string,
  formData: Record<string, unknown>,
): Promise<{ findings: PreflightFinding[]; ran: boolean }> {
  if (!env.ANTHROPIC_API_KEY) {
    return { findings: [], ran: false };
  }

  const sections = parseSectionsCharged(formData['sections_charged']);
  const factsNarrative = str(formData['facts_narrative'] ?? formData['key_facts'] ?? '');

  // Only run LLM if there's enough text to analyse
  if (!factsNarrative || factsNarrative.length < 30) {
    return { findings: [], ran: false };
  }

  const payload = {
    template_id: templateId,
    sections_charged: sections,
    facts_narrative: factsNarrative.slice(0, 1500), // token budget
    respondent_type: str(formData['respondent_type'] ?? ''),
  };

  try {
    // Model id is configured at runtime via the AppSetting collection.
    // If the key is unset, getAppSetting throws → caught below → preflight
    // degrades gracefully to rules-only (fail-open per ADR-018).
    const model = await getAppSetting(APP_SETTING_KEYS.PREFLIGHT_MODEL);
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model,
      max_tokens: 300,
      system: HAIKU_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(payload) }],
    });

    const text =
      response.content[0].type === 'text' ? response.content[0].text : '';

    // Strip markdown fences if any
    const clean = text.replace(/```(?:json)?/gi, '').trim();
    const parsed = JSON.parse(clean) as {
      unusual: boolean;
      hard_block: boolean;
      findings: Array<{ rule_id: string; question: string }>;
    };

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
 * @returns PreflightResult — verdict, questions, optional hard-block reason
 */
export async function preflightCheck(
  templateId: string,
  formData: Record<string, unknown>,
  userId?: string,
): Promise<PreflightResult> {
  // Run pure rules + Haiku in parallel (ADR-018: run alongside each other)
  const [ruleFindings, llmResult] = await Promise.all([
    runPureRules(templateId, formData),
    runLLMChecks(templateId, formData),
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

/**
 * Annexures Pack Generator — SCRUM-65
 *
 * Generates the 7 mandatory court-filing annexures that accompany every drafted document.
 * Output: single multi-page PDF rendered by Puppeteer (page-break-before on each annexure).
 * Court-rule aware: designation, verification language, and party labels read from
 * the court_rules JSON that matches the document's court_id field in form_data.
 *
 * 7 Annexures:
 *   A — Memo of Parties
 *   B — Synopsis (HC practice)
 *   C — List of Dates and Chronology of Events
 *   D — Index of Documents Annexed
 *   E — Vakalatnama
 *   F — Court Fee Paid Statement
 *   G — Affidavit on Separate Sheet with Notary Block (absorbs SCRUM-66)
 *
 * Arjun (CTO) reviewer: architecture. Ajay (CLO) reviewer: legal correctness.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { renderPdf } from './pdf-export.service';

// ── Court rules loader ────────────────────────────────────────────────────────

interface CourtRules {
  courtId: string;
  courtType: string;
  designation: string;
  cause_title_format?: string;
  party_designation: Record<string, string>;
  verification_format: string;
  case_nomenclature?: Record<string, string>;
  prayer_language?: { opening: string; closing: string };
}

const COURT_RULES_DIR = join(__dirname, '..', 'config', 'court-rules');
const courtRulesCache = new Map<string, CourtRules>();

function loadCourtRules(courtId: string): CourtRules | null {
  if (courtRulesCache.has(courtId)) return courtRulesCache.get(courtId)!;
  const filePath = join(COURT_RULES_DIR, `${courtId}.json`);
  if (!existsSync(filePath)) return null;
  try {
    const rules = JSON.parse(readFileSync(filePath, 'utf-8')) as CourtRules;
    courtRulesCache.set(courtId, rules);
    return rules;
  } catch {
    return null;
  }
}

/**
 * Resolve court rules from form_data.
 * Tries form_data.court_id directly, then derives from court_type + state.
 */
function resolveCourtRules(formData: Record<string, unknown>): CourtRules {
  const fallback: CourtRules = {
    courtId: 'district_court_generic',
    courtType: 'district_court',
    designation: 'IN THE COURT OF THE DISTRICT JUDGE',
    party_designation: {
      petitioner: 'Petitioner',
      respondent: 'Respondent',
      applicant: 'Applicant',
      state: 'State',
    },
    verification_format:
      'I, {deponent_name}, {designation}, do hereby solemnly affirm and state that the contents of paragraphs 1 to {body_para_count} of the above petition are true and correct to the best of my knowledge and belief and nothing material has been concealed therefrom.\n\nVerified at {place} on this {date}.\n\nDEPONENT',
  };

  // Try explicit court_id first
  const courtId = formData.court_id ?? formData.court_rules_id;
  if (typeof courtId === 'string') {
    const rules = loadCourtRules(courtId);
    if (rules) return rules;
  }

  // Derive from court_type + state
  const courtType = String(formData.court_type ?? '');
  const state = String(formData.state ?? formData.jurisdiction ?? '');

  const derivedId = deriveCourtRulesId(courtType, state);
  if (derivedId) {
    const rules = loadCourtRules(derivedId);
    if (rules) return rules;
  }

  return fallback;
}

function deriveCourtRulesId(courtType: string, state: string): string | null {
  const s = state.toLowerCase().replace(/\s+/g, '_');
  const t = courtType.toLowerCase();

  if (t.includes('high_court') || t.includes('hc')) {
    if (s.includes('jharkhand')) return 'jharkhand_hc';
    if (s.includes('bihar') || s.includes('patna')) return 'patna_hc';
    if (s.includes('delhi')) return 'delhi_hc';
    if (s.includes('allahabad') || s.includes('uttar_pradesh') || s.includes('up'))
      return 'allahabad_hc';
  }

  if (t.includes('district') || t.includes('sessions')) {
    if (s.includes('jharkhand')) return 'jharkhand_district';
    if (s.includes('bihar')) return 'bihar_district';
    if (s.includes('delhi')) return 'delhi_district';
    if (s.includes('uttar_pradesh') || s.includes('up')) return 'up_district';
  }

  if (t.includes('consumer')) return 'consumer_commission_generic';
  if (t.includes('cjm')) return 'cjm_generic';
  if (t.includes('jmfc')) return 'jmfc_generic';
  if (t.includes('sessions')) return 'sessions_generic';

  return null;
}

// ── Shared CSS for all annexure pages ─────────────────────────────────────────

const ANNEXURE_CSS = `
  @page { size: A4; margin: 1in 1in 1in 1.5in; }
  body { font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 1.8; color: #000; margin: 0; padding: 0; }
  .page-break { page-break-before: always; }
  .annexure-header { font-weight: bold; text-align: center; margin-bottom: 1em; font-size: 11pt; letter-spacing: 0.05em; text-transform: uppercase; }
  .annexure-label { text-align: center; font-size: 10pt; margin-bottom: 0.5em; text-decoration: underline; }
  h2 { font-size: 12pt; font-weight: bold; text-align: center; margin: 0.8em 0 0.5em; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; font-size: 11pt; margin: 0.8em 0; }
  th { border: 1px solid #000; padding: 5px 8px; font-weight: bold; background: #f0f0f0; text-align: left; }
  td { border: 1px solid #000; padding: 5px 8px; vertical-align: top; }
  .sig-block { margin-top: 3em; }
  .sig-line { border-top: 1px solid #000; width: 45%; display: inline-block; margin-top: 0.5em; }
  .notary-box { border: 2px solid #000; padding: 1em; margin-top: 2em; min-height: 100px; }
  .notary-title { font-weight: bold; text-align: center; margin-bottom: 0.5em; }
  .stamp-placeholder { text-align: center; color: #999; font-style: italic; margin: 1em 0; font-size: 10pt; }
  p { margin: 0 0 0.4em 0; }
  .indent { margin-left: 2em; }
  .right-align { text-align: right; }
  .disclaimer { margin-top: 2em; padding-top: 0.8em; border-top: 1px solid #999; font-size: 9pt; color: #666; text-align: center; }
`;

function wrapHtml(body: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><style>${ANNEXURE_CSS}</style></head><body>${body}</body></html>`;
}

// ── Helper to safely stringify unknown form values ────────────────────────────

function str(v: unknown, fallback = '___________'): string {
  if (v === undefined || v === null || v === '') return fallback;
  if (Array.isArray(v)) return v.map((x) => String(x)).join(', ');
  return String(v);
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function safeEsc(v: unknown, fallback = '___________'): string {
  return esc(str(v, fallback));
}

// ── Annexure A — Memo of Parties ──────────────────────────────────────────────

function annexureMemoOfParties(
  formData: Record<string, unknown>,
  rules: CourtRules,
  pageBreak: boolean,
): string {
  const applicant = safeEsc(
    formData.applicant_name ?? formData.petitioner_name ?? formData.party_name,
  );
  const respondent = safeEsc(formData.respondent_name ?? formData.opposite_party);
  const state = safeEsc(formData.state ?? formData.jurisdiction);
  const advocateName = safeEsc(formData.advocate_name);
  const applicantAddr = safeEsc(formData.applicant_address ?? formData.address);
  const applicantAge = safeEsc(formData.age ?? formData.applicant_age);
  const applicantFather = safeEsc(formData.father_name ?? formData.parent_name);
  const courtDesig = esc(rules.designation);

  const applicantLabel = esc(rules.party_designation.applicant ?? rules.party_designation.petitioner ?? 'Applicant');
  const respondentLabel = esc(rules.party_designation.respondent ?? rules.party_designation.opposite_party ?? 'Respondent');

  return `
<div class="${pageBreak ? 'page-break' : ''}">
  <div class="annexure-label">ANNEXURE A</div>
  <h2>Memo of Parties</h2>
  <p style="text-align:center">${courtDesig}</p>
  <br>
  <table>
    <tr><th style="width:30%">Role</th><th>Name, Address &amp; Description</th></tr>
    <tr>
      <td>${applicantLabel}</td>
      <td>
        <strong>${applicant}</strong><br>
        ${applicantAge !== '___________' ? `Age: ${applicantAge} years<br>` : ''}
        ${applicantFather !== '___________' ? `S/o / D/o / W/o: ${applicantFather}<br>` : ''}
        ${applicantAddr !== '___________' ? applicantAddr : '___________'}
      </td>
    </tr>
    <tr>
      <td>${respondentLabel}</td>
      <td>
        <strong>${respondent}</strong><br>
        ${state !== '___________' ? `State of ${state}, through the concerned authority` : '___________'}
      </td>
    </tr>
  </table>
  <div class="sig-block">
    <p>Through Advocate:</p>
    <p><strong>${advocateName !== '___________' ? advocateName : '[Advocate Name]'}</strong></p>
    <p>Bar Enrolment No.: ${safeEsc(formData.enrollment_number ?? formData.advocate_enrollment)}</p>
  </div>
</div>`;
}

// ── Annexure B — Synopsis ─────────────────────────────────────────────────────

function annexureSynopsis(
  formData: Record<string, unknown>,
  rules: CourtRules,
): string {
  const applicant = safeEsc(formData.applicant_name ?? formData.petitioner_name ?? formData.party_name);
  const courtDesig = esc(rules.designation);
  const docType = safeEsc(formData.template_id ?? formData.doc_type ?? 'Application');
  const sections = str(formData.sections_charged ?? formData.bns_sections ?? formData.sections, '');
  const firNo = safeEsc(formData.fir_number ?? formData.fir_no ?? formData.complaint_number);
  const ps = safeEsc(formData.police_station ?? formData.ps_name);
  const year = new Date().getFullYear();

  const bulletPoints: string[] = [
    `Applicant/Petitioner: ${applicant}`,
    sections ? `Sections invoked: ${esc(sections)}` : '',
    firNo !== '___________' ? `FIR/Complaint No.: ${firNo}, PS: ${ps}` : '',
    `Court: ${courtDesig}`,
    `Year: ${year}`,
  ].filter(Boolean);

  return `
<div class="page-break">
  <div class="annexure-label">ANNEXURE B</div>
  <h2>Synopsis</h2>
  <p style="text-align:center">(As required by High Court Practice)</p>
  <br>
  <p><strong>Nature of matter:</strong> ${esc(docType.replace(/_/g, ' ').toUpperCase())}</p>
  <p><strong>Brief synopsis of the case:</strong></p>
  <ul>
    ${bulletPoints.map((b) => `<li>${b}</li>`).join('\n    ')}
  </ul>
  <p>The petitioner has approached this Hon'ble Court seeking relief as set out in the accompanying petition/application. The facts are briefly summarised hereunder for the convenience of this Hon'ble Court.</p>
  <p><em>[Advocate to insert 3–5 sentence summary of the factual background before filing.]</em></p>
  <div class="disclaimer">AI-assisted draft &mdash; verify before filing. Lawie does not provide legal advice.</div>
</div>`;
}

// ── Annexure C — List of Dates ────────────────────────────────────────────────

function annexureListOfDates(formData: Record<string, unknown>): string {
  const eventDate = safeEsc(formData.event_date ?? formData.incident_date ?? formData.date_of_incident);
  const firDate = safeEsc(formData.fir_date ?? formData.date_of_fir);
  const firNo = safeEsc(formData.fir_number ?? formData.fir_no ?? formData.complaint_number);
  const ps = safeEsc(formData.police_station ?? formData.ps_name);
  const arrestDate = safeEsc(formData.date_of_arrest ?? formData.arrest_date);
  const filingDate = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const rows: Array<[string, string]> = [
    [eventDate !== '___________' ? eventDate : '___________', 'Date of alleged incident/event'],
    [firDate !== '___________' ? firDate : '___________', `FIR No. ${firNo} registered at PS ${ps}`],
    [arrestDate !== '___________' ? arrestDate : '___________', 'Date of arrest / apprehension'],
    [filingDate, 'Filing of the present application/petition'],
  ];

  return `
<div class="page-break">
  <div class="annexure-label">ANNEXURE C</div>
  <h2>List of Dates and Chronology of Events</h2>
  <br>
  <table>
    <tr><th style="width:28%">Date</th><th>Event</th></tr>
    ${rows.map(([d, e]) => `<tr><td>${d}</td><td>${e}</td></tr>`).join('\n    ')}
    <tr><td colspan="2"><em>[Advocate to add further dates as appropriate before filing.]</em></td></tr>
  </table>
  <div class="disclaimer">AI-assisted draft &mdash; verify before filing. Lawie does not provide legal advice.</div>
</div>`;
}

// ── Annexure D — Index of Documents ──────────────────────────────────────────

function annexureIndexOfDocuments(formData: Record<string, unknown>): string {
  const firNo = safeEsc(formData.fir_number ?? formData.fir_no ?? formData.complaint_number);
  const applicant = safeEsc(formData.applicant_name ?? formData.petitioner_name ?? formData.party_name);

  const stdDocs: Array<[string, string, string]> = [
    ['1', 'Memo of Parties', 'Annexure A'],
    ['2', 'Synopsis', 'Annexure B'],
    ['3', 'List of Dates and Chronology', 'Annexure C'],
    ['4', 'Index of Documents Annexed', 'Annexure D (this document)'],
    ['5', 'Vakalatnama', 'Annexure E'],
    ['6', 'Court Fee Paid Statement', 'Annexure F'],
    ['7', 'Affidavit of ' + applicant, 'Annexure G'],
    [
      '8',
      firNo !== '___________' ? `Copy of FIR No. ${firNo}` : 'Copy of FIR / Complaint (if available)',
      'Annexure H (to be annexed by advocate)',
    ],
    ['9', 'Identity and Address Proof of Applicant/Petitioner', 'Annexure I (to be annexed by advocate)'],
    ['10', 'Any other document relied upon', 'Annexure J onwards (as applicable)'],
  ];

  return `
<div class="page-break">
  <div class="annexure-label">ANNEXURE D</div>
  <h2>Index of Documents Annexed</h2>
  <br>
  <table>
    <tr><th style="width:8%">Sr.</th><th>Document</th><th style="width:32%">Reference / Page No.</th></tr>
    ${stdDocs.map(([n, d, r]) => `<tr><td>${n}.</td><td>${d}</td><td>${r}</td></tr>`).join('\n    ')}
  </table>
  <p style="margin-top:1em"><em>Note: Page numbers to be filled in by advocate before filing.</em></p>
  <div class="disclaimer">AI-assisted draft &mdash; verify before filing. Lawie does not provide legal advice.</div>
</div>`;
}

// ── Annexure E — Vakalatnama ──────────────────────────────────────────────────

function annexureVakalatnama(
  formData: Record<string, unknown>,
  rules: CourtRules,
): string {
  const applicant = safeEsc(formData.applicant_name ?? formData.petitioner_name ?? formData.party_name);
  const applicantAddr = safeEsc(formData.applicant_address ?? formData.address);
  const advocateName = safeEsc(formData.advocate_name);
  const enrollmentNo = safeEsc(formData.enrollment_number ?? formData.advocate_enrollment);
  const courtDesig = esc(rules.designation);

  return `
<div class="page-break">
  <div class="annexure-label">ANNEXURE E</div>
  <h2>Vakalatnama</h2>
  <p style="text-align:center">${courtDesig}</p>
  <br>
  <p>Know all men by these presents that I/We, <strong>${applicant}</strong>, resident of ${applicantAddr}, do hereby appoint and retain <strong>${advocateName !== '___________' ? advocateName : '[Advocate Name]'}</strong>, Advocate, enrolled with the Bar Council (Enrolment No. <strong>${enrollmentNo !== '___________' ? enrollmentNo : '___________'}</strong>), to act, appear and plead on my/our behalf in the above matter and in all proceedings arising therefrom.</p>
  <br>
  <p>I/We authorise the said Advocate to:</p>
  <ol>
    <li>File pleadings, applications, affidavits, and other documents on my/our behalf;</li>
    <li>Appear before this Hon'ble Court and all subordinate/connected courts and authorities;</li>
    <li>Accept notices and orders on my/our behalf;</li>
    <li>Take all necessary steps to prosecute/defend the said matter;</li>
    <li>Engage other advocates as junior counsel or co-counsel as may be required.</li>
  </ol>
  <br>
  <div class="sig-block">
    <table style="border:none; width:100%">
      <tr>
        <td style="border:none; width:50%">
          <p>Client's Signature:</p>
          <div class="sig-line"></div><br>
          <p>${applicant}</p>
          <p>Date: _______________</p>
          <p>Place: _______________</p>
        </td>
        <td style="border:none; width:50%">
          <p>Advocate's Signature:</p>
          <div class="sig-line"></div><br>
          <p>${advocateName !== '___________' ? advocateName : '[Advocate Name]'}</p>
          <p>Enrolment No.: ${enrollmentNo !== '___________' ? enrollmentNo : '___________'}</p>
          <p>Date: _______________</p>
        </td>
      </tr>
    </table>
  </div>
  <div class="disclaimer">AI-assisted draft &mdash; verify before filing. Lawie does not provide legal advice.</div>
</div>`;
}

// ── Annexure F — Court Fee Statement ─────────────────────────────────────────

function annexureCourtFeeStatement(
  formData: Record<string, unknown>,
  rules: CourtRules,
): string {
  const courtDesig = esc(rules.designation);
  const courtType = str(formData.court_type ?? rules.courtType, 'district_court');

  // Court fee schedules vary widely — provide a reference template with blanks
  const isHC = courtType.includes('high_court') || courtType.includes('hc');

  return `
<div class="page-break">
  <div class="annexure-label">ANNEXURE F</div>
  <h2>Court Fee Paid Statement</h2>
  <p style="text-align:center">${courtDesig}</p>
  <br>
  <table>
    <tr><th>Sr.</th><th>Description</th><th>Amount (₹)</th><th>Mode of Payment</th></tr>
    <tr><td>1.</td><td>Court fee on application/petition</td><td>___________</td><td>Court Fee Stamp / DD / Online</td></tr>
    ${isHC ? '<tr><td>2.</td><td>Process fee</td><td>___________</td><td>___________</td></tr>' : ''}
    <tr><td>${isHC ? '3' : '2'}.</td><td>Miscellaneous (if any)</td><td>___________</td><td>___________</td></tr>
    <tr><td colspan="2"><strong>Total</strong></td><td colspan="2"><strong>___________</strong></td></tr>
  </table>
  <p style="margin-top:1em"><em>Note: Court fee amounts to be confirmed from the applicable Court Fees Act / schedule in force for the relevant court. The advocate must affix court fee stamps or attach proof of online payment before filing.</em></p>
  <div class="sig-block">
    <p>Certified by Advocate:</p>
    <div class="sig-line"></div><br>
    <p>Date: _______________</p>
  </div>
  <div class="disclaimer">AI-assisted draft &mdash; verify before filing. Lawie does not provide legal advice.</div>
</div>`;
}

// ── Annexure G — Affidavit (absorbs SCRUM-66) ────────────────────────────────

function annexureAffidavit(
  formData: Record<string, unknown>,
  rules: CourtRules,
  bodyParaCount: number,
): string {
  const deponent = safeEsc(formData.applicant_name ?? formData.petitioner_name ?? formData.party_name);
  const deponentAge = safeEsc(formData.age ?? formData.applicant_age);
  const deponentFather = safeEsc(formData.father_name ?? formData.parent_name);
  const deponentAddr = safeEsc(formData.applicant_address ?? formData.address);
  const designation = safeEsc(formData.deponent_designation ?? 'the above-named Applicant/Petitioner');

  const today = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const place = safeEsc(formData.place ?? formData.city ?? formData.district ?? 'Ranchi');
  const courtDesig = esc(rules.designation);

  // Build verification text from court_rules.verification_format — fill placeholders
  const verificationText = esc(
    rules.verification_format
      .replace('{deponent_name}', str(formData.applicant_name ?? formData.petitioner_name ?? formData.party_name))
      .replace('{designation}', str(formData.deponent_designation ?? 'the above-named Applicant/Petitioner'))
      .replace('{body_para_count}', String(bodyParaCount))
      .replace('{place}', str(formData.place ?? formData.city ?? formData.district ?? 'Ranchi'))
      .replace('{date}', today),
  );

  return `
<div class="page-break">
  <div class="annexure-label">ANNEXURE G</div>
  <h2>Affidavit</h2>
  <p style="text-align:center">${courtDesig}</p>
  <br>
  <p style="text-align:center"><strong>AFFIDAVIT OF ${deponent.toUpperCase()}</strong></p>
  <br>
  <p>I, <strong>${deponent}</strong>,${deponentAge !== '___________' ? ` aged about ${deponentAge} years,` : ''}${deponentFather !== '___________' ? ` ${deponentFather},` : ''} resident of ${deponentAddr !== '___________' ? deponentAddr : '___________'}, do hereby solemnly affirm and state on oath as under:</p>
  <br>
  <p class="indent">1. That I am the ${designation} in the accompanying matter and am well acquainted with the facts of the case.</p>
  <p class="indent">2. That the facts stated in the accompanying petition/application are true and correct to the best of my knowledge and belief.</p>
  <p class="indent">3. That no material fact has been concealed or misstated in the accompanying petition/application.</p>
  <p class="indent">4. That the Annexures filed along with the accompanying petition/application are true copies of the originals.</p>
  <p class="indent">5. That this affidavit is being affirmed in support of the accompanying petition/application.</p>
  <br>
  <p>${verificationText.replace(/\n/g, '<br>')}</p>
  <br>
  <div class="sig-block">
    <table style="border:none; width:100%">
      <tr>
        <td style="border:none; width:50%; vertical-align:bottom">
          <div class="sig-line"></div><br>
          <p><strong>DEPONENT</strong></p>
          <p>${deponent}</p>
          <p>Date: ${today}</p>
          <p>Place: ${place}</p>
        </td>
        <td style="border:none; width:50%">
          <div class="notary-box">
            <div class="notary-title">BEFORE ME</div>
            <div class="stamp-placeholder">[Notary / Oath Commissioner Stamp &amp; Seal]</div>
            <p>Signed before me on: _______________</p>
            <p>Name: _______________</p>
            <p>Registration No.: _______________</p>
            <p>Place: _______________</p>
          </div>
        </td>
      </tr>
    </table>
  </div>
  <div class="disclaimer">AI-assisted draft &mdash; verify before filing. Lawie does not provide legal advice.</div>
</div>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface AnnexuresInput {
  /** Raw form_data stored in formInputs (includes template_id) */
  formData: Record<string, unknown>;
  /** Approximate paragraph count from the main draft (for verification clause) */
  bodyParaCount?: number;
  /** Advocate name from JWT profile (fallback if not in formData) */
  advocateName?: string;
}

/**
 * Build a multi-page PDF containing all 7 mandatory annexures.
 * Each annexure starts on a new page (page-break-before: always).
 * Court rules are resolved automatically from formData.court_id / court_type + state.
 */
export async function buildAnnexuresPack(input: AnnexuresInput): Promise<Buffer> {
  const { formData, bodyParaCount = 10, advocateName } = input;

  // Inject advocate name from JWT if not in form
  const enrichedForm: Record<string, unknown> = {
    ...formData,
    ...(advocateName && !formData.advocate_name ? { advocate_name: advocateName } : {}),
  };

  const rules = resolveCourtRules(enrichedForm);

  const parts: string[] = [
    annexureMemoOfParties(enrichedForm, rules, false), // A — first page, no break
    annexureSynopsis(enrichedForm, rules),             // B
    annexureListOfDates(enrichedForm),                 // C
    annexureIndexOfDocuments(enrichedForm),            // D
    annexureVakalatnama(enrichedForm, rules),           // E
    annexureCourtFeeStatement(enrichedForm, rules),    // F
    annexureAffidavit(enrichedForm, rules, bodyParaCount), // G
  ];

  const html = wrapHtml(parts.join('\n'));
  return renderPdf(html);
}

/**
 * Estimate paragraph count from plain-text / TipTap HTML content.
 * Used when building annexures immediately after generation.
 */
export function estimateBodyParaCount(content: string): number {
  if (content.trimStart().startsWith('<')) {
    // TipTap HTML — count <p> tags
    const matches = content.match(/<p[\s>]/gi);
    return Math.max(1, (matches?.length ?? 1) - 1); // exclude last AI disclaimer
  }
  // Plain text — count double newlines
  const paras = content.split(/\n\n+/).filter((s) => s.trim().length > 0);
  return Math.max(1, paras.length);
}

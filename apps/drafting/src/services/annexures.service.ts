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

import { CaseSide, CLIENT_ROLE_TABLE, ClientRoleRow, storesState } from './brief-party-fields';
import { renderPdf } from './pdf-export.service';
import {
  chosenCourtHeading,
  CourtLookupData,
  CourtRuleData,
  declaredFieldIds,
  formatDraftDate,
  formatIsoDraftDate,
  loadTemplateConfig,
  MatterTypeOverride,
  normaliseRelation,
  PARENT_NAME_SOURCES,
  RELATION_SOURCES,
  relationLine,
  resolveAdvocate,
  resolveEnrollmentNumber,
  ruleForMatter,
  signedPartyLabels,
} from './template-engine.service';

// ── Court rules loader ────────────────────────────────────────────────────────

interface CourtRules {
  courtId: string;
  courtType: string;
  designation: string;
  cause_title_format?: string;
  party_designation: Record<string, string>;
  party_designation_by_side?: CourtRuleData['party_designation_by_side'];
  verification_format: string;
  case_nomenclature?: CourtRuleData['case_nomenclature'];
  matter_type_overrides?: Record<string, MatterTypeOverride>;
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

/**
 * T-349: a user date as "4 April 2026" when it is a real ISO date; anything
 * else (non-ISO, impossible) exactly as entered. Formatted first, then escaped.
 */
function safeDateEsc(v: unknown, fallback = '___________'): string {
  const formatted = typeof v === 'string' ? formatIsoDraftDate(v) : null;
  return safeEsc(formatted ?? v, fallback);
}

/** First of `values` that is non-empty after trim (trimmed if a string), else undefined. */
function firstNonBlank(...values: unknown[]): unknown {
  for (const v of values) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string') {
      const t = v.trim();
      if (t !== '') return t;
      continue;
    }
    if (String(v).trim() !== '') return v;
  }
  return undefined;
}

// ── T-396: party keys, relation and State line ───────────────────────────────

/** The pack's signed client-role row (brief-party-fields), if it has one. */
function packRow(formData: Record<string, unknown>): ClientRoleRow | undefined {
  const id = String(formData.template_id ?? formData.doc_type ?? '').trim();
  return Object.prototype.hasOwnProperty.call(CLIENT_ROLE_TABLE, id)
    ? CLIENT_ROLE_TABLE[id]
    : undefined;
}

/** The opposite side's named fields for the pack (empty for State / no-field rows). */
function counterpartFields(row: ClientRoleRow | undefined): readonly string[] {
  return row?.counterpart.kind === 'field' ? row.counterpart.fields : [];
}

/**
 * T-396 AC2: the applicant side's name. The flat keys first (as before), then
 * the pack's client field from CLIENT_ROLE_TABLE, then the form-draft role keys
 * that are not the pack's opposite side.
 */
function applicantNameOf(formData: Record<string, unknown>): unknown {
  const row = packRow(formData);
  const opposite = new Set(counterpartFields(row));
  const roleKeys = ['plaintiff_name', 'complainant_name', 'accused_name'].filter(
    (k) => !opposite.has(k),
  );
  return firstNonBlank(
    formData.applicant_name,
    formData.petitioner_name,
    formData.party_name,
    ...(row?.client ? [formData[row.client]] : []),
    ...roleKeys.map((k) => formData[k]),
  );
}

/** T-396 AC2: the respondent side's name; never the pack's client field. */
function respondentNameOf(formData: Record<string, unknown>): unknown {
  const row = packRow(formData);
  const roleKeys = [...counterpartFields(row), 'defendant_name'].filter((k) => k !== row?.client);
  return firstNonBlank(
    formData.respondent_name,
    formData.opposite_party,
    ...roleKeys.map((k) => formData[k]),
  );
}

/** T-396 AC2: the applicant's address. */
function applicantAddressOf(formData: Record<string, unknown>): unknown {
  const row = packRow(formData);
  return firstNonBlank(
    formData.applicant_address,
    formData.address,
    formData.petitioner_address,
    ...(row?.details.address ?? []).map((k) => formData[k]),
  );
}

/** T-396 AC2: the applicant's age. */
function applicantAgeOf(formData: Record<string, unknown>): unknown {
  const row = packRow(formData);
  return firstNonBlank(
    formData.age,
    formData.applicant_age,
    formData.petitioner_age,
    ...(row?.details.age ?? []).map((k) => formData[k]),
  );
}

/**
 * T-396 AC1 (Ajay, T-359 AC6 Addendum, T-393): the relation and the name of the
 * parent or spouse, as the template engine prints it, escaped. Never a fixed
 * S/o; the blank prints when neither is given.
 */
function relationOf(formData: Record<string, unknown>): string {
  const row = packRow(formData);
  const relKey = RELATION_SOURCES.find((k) => normaliseRelation(formData[k]) !== undefined);
  // A "[To be confirmed: …]" placeholder is not a given name (as TE's isGivenName).
  const parentName = [
    formData.father_name,
    formData.parent_name,
    ...PARENT_NAME_SOURCES.map((k) => formData[k]),
    ...(row?.details.parentage ?? []).map((k) => formData[k]),
  ].find((v) => typeof v === 'string' && v.trim() !== '' && !/^\[To be confirmed/i.test(v.trim()));
  return esc(relationLine(relKey && formData[relKey], parentName));
}

// ── T-424 (Addendum 5): counter and rejoinder affidavits ────────────────────

/**
 * The client's side on a pack whose parties print under their own roles
 * (brief-party-fields SIDED_PACKS), as the resolver set it; null on every
 * other pack. On such a pack the parties are petitioner_name and
 * respondent_name, the client is the deponent (deponent_*), and the applicant
 * and generic party keys are never read.
 */
function clientSideOf(formData: Record<string, unknown>): CaseSide | null {
  const v = formData.client_side;
  return v === 'petitioner' || v === 'respondent' ? v : null;
}

/** Ajay, T-424 44bf8a5: the deponent's designation, by the client's side. */
const SIDED_DESIGNATION: Readonly<Record<CaseSide, string>> = {
  respondent: 'the above-named Respondent',
  petitioner: 'the above-named Petitioner',
};

/** The client's name: the deponent on a sided pack, else the applicant side. */
function clientNameOf(formData: Record<string, unknown>): unknown {
  return clientSideOf(formData) ? formData.deponent_name : applicantNameOf(formData);
}

/** The client's address: the deponent's on a sided pack, else the applicant's. */
function clientAddressOf(formData: Record<string, unknown>): unknown {
  return clientSideOf(formData) ? formData.deponent_address : applicantAddressOf(formData);
}

/** The deponent's relation line on a sided pack: deponent_father_name only. */
function deponentRelationOf(formData: Record<string, unknown>): string {
  return esc(relationLine(undefined, formData.deponent_father_name));
}

const COURTS_FILE = join(__dirname, '..', 'config', 'courts', 'indian-courts.json');
let stateNames: Map<string, string> | null = null;

/** T-396 AC4: a court-picker state id ("bihar") as its name ("Bihar"); else as given. */
function stateName(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (!stateNames) {
    stateNames = new Map();
    try {
      const data = JSON.parse(readFileSync(COURTS_FILE, 'utf-8')) as {
        states?: Array<{ id?: unknown; name?: unknown }>;
      };
      for (const s of data.states ?? []) {
        if (typeof s.id === 'string' && typeof s.name === 'string') stateNames.set(s.id, s.name);
      }
    } catch {
      // No courts list: ids pass through unchanged.
    }
  }
  return stateNames.get(value.trim()) ?? value;
}

// ── Annexure A — Memo of Parties ──────────────────────────────────────────────

function annexureMemoOfParties(
  formData: Record<string, unknown>,
  rules: CourtRules,
  pageBreak: boolean,
): string {
  // T-424 (Addendum 5): each party under its own role; the client's details
  // only on the client's row.
  const side = clientSideOf(formData);
  const applicant = safeEsc(side ? formData.petitioner_name : applicantNameOf(formData));
  const respondent = safeEsc(side ? formData.respondent_name : respondentNameOf(formData));
  // T-396 AC3 (T-381 Addendum 4 point 1): the State line only when the State
  // is the counterpart (storesState: State rows and withState rows).
  const templateId = String(formData.template_id ?? formData.doc_type ?? '').trim();
  const stateIsCounterpart = storesState(templateId);
  const state = safeEsc(stateName(firstNonBlank(formData.state, formData.jurisdiction)));
  const advocateName = safeEsc(formData.advocate_name);
  const applicantAddr = safeEsc(applicantAddressOf(formData));
  const applicantAge = safeEsc(applicantAgeOf(formData));
  const applicantRelation = relationOf(formData);
  const courtDesig = esc(rules.designation);

  // T-149: a signed document type uses the signed labels; others as before.
  const signed = signedPartyLabels(rules, String(formData.template_id ?? formData.doc_type ?? ''));
  // T-424 (Ajay, ad5aeb3): on a sided pack the labels are always exactly
  // "Petitioner" and "Respondent", whatever the court rule or signed label says.
  const applicantLabel = side
    ? 'Petitioner'
    : esc(
        signed?.petitioner ??
          rules.party_designation.applicant ??
          rules.party_designation.petitioner ??
          'Applicant',
      );
  const respondentLabel = side
    ? 'Respondent'
    : esc(
        signed?.respondent ??
          rules.party_designation.respondent ??
          rules.party_designation.opposite_party ??
          'Respondent',
      );

  const clientDetails = (age: string, relation: string, addr: string): string => `<br>
        ${age !== '___________' ? `Age: ${age} years<br>` : ''}
        ${relation}<br>
        ${addr !== '___________' ? addr : '___________'}`;
  const deponentDetails = side
    ? clientDetails(
        safeEsc(formData.deponent_age),
        deponentRelationOf(formData),
        safeEsc(formData.deponent_address),
      )
    : '';
  const firstRowDetails = side
    ? side === 'petitioner'
      ? deponentDetails
      : ''
    : clientDetails(applicantAge, applicantRelation, applicantAddr);
  const secondRowDetails = side === 'respondent' ? deponentDetails : '';

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
        <strong>${applicant}</strong>${firstRowDetails}
      </td>
    </tr>
    <tr>
      <td>${respondentLabel}</td>
      <td>
        <strong>${respondent}</strong>${secondRowDetails}${
          stateIsCounterpart
            ? `<br>
        ${state !== '___________' ? `State of ${state}, through the concerned authority` : '___________'}`
            : ''
        }
      </td>
    </tr>
  </table>
  <div class="sig-block">
    <p>Through Advocate:</p>
    <p><strong>${advocateName !== '___________' ? advocateName : '[Advocate Name]'}</strong></p>
    <p>Bar Enrolment No.: ${safeEsc(formData.enrollment_number)}</p>
  </div>
  <div class="disclaimer">Draft prepared by Lawie from the details you entered. Check it before filing. Lawie does not provide legal advice.</div>
</div>`;
}

// ── Annexure B — Synopsis ─────────────────────────────────────────────────────

function annexureSynopsis(formData: Record<string, unknown>, rules: CourtRules): string {
  // T-424 (Ajay, 14 Oct): on a sided pack the party line is "Petitioner:" and
  // names the petitioner.
  const sided = clientSideOf(formData) !== null;
  const applicant = safeEsc(sided ? formData.petitioner_name : applicantNameOf(formData));
  const partyLabel = sided ? 'Petitioner' : 'Applicant/Petitioner';
  const courtDesig = esc(rules.designation);
  const docType = safeEsc(formData.template_id ?? formData.doc_type ?? 'Application');
  const sections = str(formData.sections_charged ?? formData.bns_sections ?? formData.sections, '');
  const firNo = safeEsc(formData.fir_number ?? formData.fir_no ?? formData.complaint_number);
  const ps = safeEsc(formData.police_station ?? formData.ps_name);
  const year = new Date().getFullYear();

  const bulletPoints: string[] = [
    `${partyLabel}: ${applicant}`,
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
  <div class="disclaimer">Draft prepared by Lawie from the details you entered. Check it before filing. Lawie does not provide legal advice.</div>
</div>`;
}

// ── Annexure C — List of Dates ────────────────────────────────────────────────

function annexureListOfDates(formData: Record<string, unknown>): string {
  const eventDate = safeDateEsc(
    formData.event_date ?? formData.incident_date ?? formData.date_of_incident,
  );
  const firDate = safeDateEsc(formData.fir_date ?? formData.date_of_fir);
  const firNo = safeEsc(formData.fir_number ?? formData.fir_no ?? formData.complaint_number);
  const ps = safeEsc(formData.police_station ?? formData.ps_name);
  const arrestDate = safeDateEsc(formData.date_of_arrest ?? formData.arrest_date);
  // T-349: "4 April 2026" (T-340's formatter), local date as before.
  const filingDate = formatDraftDate(new Date());

  const rows: Array<[string, string]> = [
    [eventDate !== '___________' ? eventDate : '___________', 'Date of alleged incident/event'],
    [
      firDate !== '___________' ? firDate : '___________',
      `FIR No. ${firNo} registered at PS ${ps}`,
    ],
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
  <div class="disclaimer">Draft prepared by Lawie from the details you entered. Check it before filing. Lawie does not provide legal advice.</div>
</div>`;
}

// ── Annexure D — Index of Documents ──────────────────────────────────────────

function annexureIndexOfDocuments(formData: Record<string, unknown>): string {
  const firNo = safeEsc(formData.fir_number ?? formData.fir_no ?? formData.complaint_number);
  // T-424: "Affidavit of" the deponent, who is the client on a sided pack.
  const applicant = safeEsc(clientNameOf(formData));

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
      firNo !== '___________'
        ? `Copy of FIR No. ${firNo}`
        : 'Copy of FIR / Complaint (if available)',
      'Annexure H (to be annexed by advocate)',
    ],
    [
      '9',
      'Identity and Address Proof of Applicant/Petitioner',
      'Annexure I (to be annexed by advocate)',
    ],
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
  <div class="disclaimer">Draft prepared by Lawie from the details you entered. Check it before filing. Lawie does not provide legal advice.</div>
</div>`;
}

// ── Annexure E — Vakalatnama ──────────────────────────────────────────────────

function annexureVakalatnama(formData: Record<string, unknown>, rules: CourtRules): string {
  // T-424: the client appoints the advocate; on a sided pack, the deponent.
  const applicant = safeEsc(clientNameOf(formData));
  const applicantAddr = safeEsc(clientAddressOf(formData));
  const advocateName = safeEsc(formData.advocate_name);
  const enrollmentNo = safeEsc(formData.enrollment_number);
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
  <div class="disclaimer">Draft prepared by Lawie from the details you entered. Check it before filing. Lawie does not provide legal advice.</div>
</div>`;
}

// ── Annexure F — Court Fee Statement ─────────────────────────────────────────

function annexureCourtFeeStatement(formData: Record<string, unknown>, rules: CourtRules): string {
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
  <div class="disclaimer">Draft prepared by Lawie from the details you entered. Check it before filing. Lawie does not provide legal advice.</div>
</div>`;
}

// ── Annexure G — Affidavit (absorbs SCRUM-66) ────────────────────────────────

function annexureAffidavit(
  formData: Record<string, unknown>,
  rules: CourtRules,
  bodyParaCount: number,
): string {
  // T-424 (Ajay, 44bf8a5): on a sided pack the deponent is the client, and the
  // designation follows the client's side; an explicit one still wins.
  const side = clientSideOf(formData);
  const deponentName = side ? formData.deponent_name : applicantNameOf(formData);
  const designationText =
    formData.deponent_designation ??
    (side ? SIDED_DESIGNATION[side] : 'the above-named Applicant/Petitioner');
  const deponent = safeEsc(deponentName);
  const deponentAge = safeEsc(side ? formData.deponent_age : applicantAgeOf(formData));
  const deponentRelation = side ? deponentRelationOf(formData) : relationOf(formData);
  const deponentAddr = safeEsc(side ? formData.deponent_address : applicantAddressOf(formData));
  const designation = safeEsc(designationText);

  // T-349: "4 April 2026" (T-340's formatter), local date as before.
  const today = formatDraftDate(new Date());
  const verifiedAt = firstNonBlank(formData.place, formData.city, formData.district);
  const place = safeEsc(verifiedAt);
  const courtDesig = esc(rules.designation);

  // Build verification text from court_rules.verification_format — fill placeholders
  const verificationText = esc(
    rules.verification_format
      .replace('{deponent_name}', () => str(deponentName))
      .replace('{designation}', () => str(designationText))
      .replace('{body_para_count}', () => String(bodyParaCount))
      .replace('{place}', () => str(verifiedAt))
      .replace('{date}', () => today),
  );

  return `
<div class="page-break">
  <div class="annexure-label">ANNEXURE G</div>
  <h2>Affidavit</h2>
  <p style="text-align:center">${courtDesig}</p>
  <br>
  <p style="text-align:center"><strong>AFFIDAVIT OF ${deponent.toUpperCase()}</strong></p>
  <br>
  <p>I, <strong>${deponent}</strong>,${deponentAge !== '___________' ? ` aged about ${deponentAge} years,` : ''} ${deponentRelation}, resident of ${deponentAddr !== '___________' ? deponentAddr : '___________'}, do hereby solemnly affirm and state on oath as under:</p>
  <br>
  <p class="indent">1. That I am ${designation} in the accompanying matter and am well acquainted with the facts of the case.</p>
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
  <div class="disclaimer">Draft prepared by Lawie from the details you entered. Check it before filing. Lawie does not provide legal advice.</div>
</div>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface AnnexuresInput {
  /** Raw form_data stored in formInputs (includes template_id) */
  formData: Record<string, unknown>;
  /** Approximate paragraph count from the main draft (for verification clause) */
  bodyParaCount?: number;
  /** Advocate name from JWT profile (fallback when the template's own field is empty or not declared) */
  advocateName?: string;
  /**
   * T-311: enrolment number from the user's profile. Printed only when none was
   * typed and the advocate name printed is the profile's.
   */
  enrollmentNumber?: string;
  /**
   * T-156: the chosen court from the courts list, looked up the same way the
   * draft path does. When set, every annexure heading prints the draft's
   * `court_header` for it instead of the court-rules designation line.
   */
  courtData?: CourtLookupData;
}

/** T-579: one annexure of the pack: its label and heading as printed, and its HTML. */
export interface AnnexurePart {
  /** As printed in the part's `annexure-label` div, e.g. "ANNEXURE A". */
  label: string;
  /** As printed in the part's `<h2>`, e.g. "Memo of Parties". */
  heading: string;
  /** The part's own HTML block, ending with its own disclaimer line. */
  html: string;
}

/** T-579: the annexures pack as HTML, the single source for the PDF and the Word file. */
export interface AnnexuresHtml {
  /** The full wrapped document (doctype, CSS, body) that the PDF path renders. */
  html: string;
  /** The 7 annexures A to G in order; `parts[i].html` joined with "\n" is the body. */
  parts: AnnexurePart[];
}

/**
 * T-579: the file name stem shared by the PDF and the Word file: the document
 * title with anything but letters, digits, spaces and hyphens removed, at most
 * 60 characters (as the route has always derived it).
 */
export function annexuresFileTitle(docTitle: string): string {
  return docTitle.replace(/[^a-zA-Z0-9\s-]/g, '').slice(0, 60);
}

/** T-579: `<stem>_annexures.pdf` or `<stem>_annexures.docx`. */
export function annexuresFilename(docTitle: string, ext: 'pdf' | 'docx'): string {
  return `${annexuresFileTitle(docTitle)}_annexures.${ext}`;
}

/**
 * T-579: build the HTML of all 7 mandatory annexures (one source for both
 * renderers). Each annexure after the first starts with the page-break class.
 * Court rules are resolved automatically from formData.court_id / court_type + state.
 */
export function buildAnnexuresHtml(input: AnnexuresInput): AnnexuresHtml {
  const { formData, bodyParaCount = 10, advocateName, enrollmentNumber, courtData } = input;

  // T-300: the same advocate name as the draft (resolveAdvocateName): the typed
  // name where this template declares the field, else the profile name.
  const templateId = typeof formData.template_id === 'string' ? formData.template_id.trim() : '';
  const config = templateId ? loadTemplateConfig(templateId) : null;
  const advocate = resolveAdvocate(formData, { name: advocateName }, config);
  const enrichedForm: Record<string, unknown> = { ...formData };
  if (advocate.name !== undefined) enrichedForm.advocate_name = advocate.name;
  else delete enrichedForm.advocate_name;

  // T-311: the same number as the draft. The typed source is this template's
  // declared advocate_enrollment only (a client enrollment_number is never
  // read; list A); else the profile number when the name is the profile's;
  // else the blank. The annexures read `enrollment_number` only.
  const enrollment = resolveEnrollmentNumber(
    declaredFieldIds(config).has('advocate_enrollment') ? formData.advocate_enrollment : undefined,
    enrollmentNumber,
    advocate.fromProfile,
  );
  if (enrollment !== undefined) enrichedForm.enrollment_number = enrollment;
  else delete enrichedForm.enrollment_number;

  // T-158: labels and verification follow the document's matter type.
  const resolved = ruleForMatter(
    resolveCourtRules(enrichedForm),
    String(enrichedForm.template_id ?? enrichedForm.doc_type ?? ''),
  );
  // T-156: one court, one designation. With a court chosen, the heading is the
  // draft's `court_header` (computed once, in template-engine). Party labels,
  // verification wording and court-fee text still come from the court rule.
  const chosen = chosenCourtHeading(courtData);
  const rules: CourtRules = chosen ? { ...resolved, designation: chosen.header } : resolved;

  const parts: AnnexurePart[] = [
    {
      label: 'ANNEXURE A',
      heading: 'Memo of Parties',
      html: annexureMemoOfParties(enrichedForm, rules, false), // A — first page, no break
    },
    { label: 'ANNEXURE B', heading: 'Synopsis', html: annexureSynopsis(enrichedForm, rules) },
    {
      label: 'ANNEXURE C',
      heading: 'List of Dates and Chronology of Events',
      html: annexureListOfDates(enrichedForm),
    },
    {
      label: 'ANNEXURE D',
      heading: 'Index of Documents Annexed',
      html: annexureIndexOfDocuments(enrichedForm),
    },
    { label: 'ANNEXURE E', heading: 'Vakalatnama', html: annexureVakalatnama(enrichedForm, rules) },
    {
      label: 'ANNEXURE F',
      heading: 'Court Fee Paid Statement',
      html: annexureCourtFeeStatement(enrichedForm, rules),
    },
    {
      label: 'ANNEXURE G',
      heading: 'Affidavit',
      html: annexureAffidavit(enrichedForm, rules, bodyParaCount),
    },
  ];

  const html = wrapHtml(parts.map((p) => p.html).join('\n'));
  return { html, parts };
}

/**
 * Build a multi-page PDF containing all 7 mandatory annexures.
 * Each annexure starts on a new page (page-break-before: always).
 * T-579: a thin wrapper, buildAnnexuresHtml then renderPdf.
 */
export async function buildAnnexuresPack(input: AnnexuresInput): Promise<Buffer> {
  return renderPdf(buildAnnexuresHtml(input).html);
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

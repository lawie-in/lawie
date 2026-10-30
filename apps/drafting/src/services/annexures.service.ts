/**
 * Annexures Pack Generator — SCRUM-65
 *
 * Generates the court-filing annexures that accompany a drafted document.
 * Output: single multi-page PDF rendered by Puppeteer (page-break-before on each annexure).
 * Court-rule aware: designation, verification language, and party labels read from
 * the court_rules JSON that matches the document's court_id field in form_data.
 *
 * T-700 (AJ-700, AJ-700a): the set depends on the pack (annexureSetFor).
 * Criminal packs (isCriminalCategory, plus writ_petition_criminal), in this order:
 *   Memo of Parties
 *   Synopsis (HC practice) — only where annexureBApplies (T-689c, AJ-689c-a;
 *     never for a respondent-side client, AJ-689c-b)
 *   List of Dates and Chronology of Events
 *   Index of Documents Annexed
 *   Vakalatnama
 *   Court Fee Paid Statement
 *   Affidavit on Separate Sheet with Notary Block (absorbs SCRUM-66)
 * Civil pleadings (written_statement, replication, plaint_*): Memo of Parties,
 *   [Synopsis], List of Dates, Index, the pack's own Verification (if any).
 * O.39 application: Memo of Parties, [Synopsis], [List of Dates, only with
 *   dates], Index, Affidavit in support.
 * Counter / rejoinder affidavits and every other civil pack: Memo of Parties,
 *   [Synopsis], Index. On civil packs the Vakalatnama and court fee are Index
 *   rows only.
 * Lettered from A in order with no gap.
 *
 * Arjun (CTO) reviewer: architecture. Ajay (CLO) reviewer: legal correctness.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import type { CourtType } from '@lawie/shared';

import {
  CaseSide,
  CLIENT_ROLE_TABLE,
  ClientRole,
  CLIENT_ROLES,
  ClientRoleRow,
  flattenPartyValues,
  storesState,
} from './brief-party-fields';
import { GUIDED_PACK_ID } from './doc-type-label';
import { isCourtDocument } from './intake-brief';
import { renderPdf } from './pdf-export.service';
import { policeStationName } from './police-station-name';
import { loadRulePack, RULE_PACKS_DIR, RulePack } from './rule-pack.service';
import {
  chosenCourtHeading,
  CourtLookupData,
  CourtRuleData,
  declaredFieldIds,
  formatDraftDate,
  formatIsoDraftDate,
  isCriminalCategory,
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

/** The signed client-role row (brief-party-fields) for a pack id, if it has one. */
function rowFor(id: string): ClientRoleRow | undefined {
  return Object.prototype.hasOwnProperty.call(CLIENT_ROLE_TABLE, id)
    ? CLIENT_ROLE_TABLE[id]
    : undefined;
}

/** The pack's signed client-role row (brief-party-fields), if it has one. */
function packRow(formData: Record<string, unknown>): ClientRoleRow | undefined {
  return rowFor(String(formData.template_id ?? formData.doc_type ?? '').trim());
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

/** One row of the Memo of Parties, each part already escaped. */
interface MemoRow {
  label: string;
  name: string;
  /** Printed right after the name (the client's details, the State line). */
  extra: string;
}

/** T-700: how the Memo of Parties is built for the pack's set. */
interface MemoOptions {
  /** Civil pleadings and O.39 (civilMemoRows): these rows instead of the two below. */
  rows?: MemoRow[];
  /** AJ-700a (2): writ_petition_criminal's party is the Petitioner, never the Applicant. */
  petitionerRole?: boolean;
  /**
   * AJ-700 (3): another civil pack's own roles (its cause title, AJ-700b (H):
   * only as printed there), after the signed labels.
   */
  packLabels?: readonly [string | undefined, string | undefined] | null;
}

/** The client's age, relation and address lines, as the Memo has always printed them. */
function memoClientDetails(age: string, relation: string, addr: string): string {
  return `<br>
        ${age !== '___________' ? `Age: ${age} years<br>` : ''}
        ${relation}<br>
        ${addr !== '___________' ? addr : '___________'}`;
}

function annexureMemoOfParties(
  formData: Record<string, unknown>,
  rules: CourtRules,
  pageBreak: boolean,
  label: string,
  options: MemoOptions = {},
): string {
  const advocateName = safeEsc(formData.advocate_name);
  const courtDesig = esc(rules.designation);
  const rows = options.rows ?? twoPartyMemoRows(formData, rules, options);

  return `
<div class="${pageBreak ? 'page-break' : ''}">
  <div class="annexure-label">${label}</div>
  <h2>Memo of Parties</h2>
  <p style="text-align:center">${courtDesig}</p>
  <br>
  <table>
    <tr><th style="width:30%">Role</th><th>Name, Address &amp; Description</th></tr>${rows
      .map(
        (r) => `
    <tr>
      <td>${r.label}</td>
      <td>
        <strong>${r.name}</strong>${r.extra}
      </td>
    </tr>`,
      )
      .join('')}
  </table>
  <div class="sig-block">
    <p>Through Advocate:</p>
    <p><strong>${advocateName !== '___________' ? advocateName : '[Advocate Name]'}</strong></p>
    <p>Bar Enrolment No.: ${safeEsc(formData.enrollment_number)}</p>
  </div>
  <div class="disclaimer">Draft prepared by Lawie from the details you entered. Check it before filing. Lawie does not provide legal advice.</div>
</div>`;
}

/** The Memo's two rows (client side, opposite side) as before T-700. */
function twoPartyMemoRows(
  formData: Record<string, unknown>,
  rules: CourtRules,
  options: MemoOptions,
): MemoRow[] {
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
  const applicantAddr = safeEsc(applicantAddressOf(formData));
  const applicantAge = safeEsc(applicantAgeOf(formData));
  const applicantRelation = relationOf(formData);

  // T-149: a signed document type uses the signed labels; others as before.
  const signed = signedPartyLabels(rules, String(formData.template_id ?? formData.doc_type ?? ''));
  // T-700 (AJ-700 (3)): another civil pack's own roles, after the signed labels.
  const packLabels = options.packLabels ?? null;
  // T-424 (Ajay, ad5aeb3): on a sided pack the labels are always exactly
  // "Petitioner" and "Respondent", whatever the court rule or signed label says.
  // T-700 (AJ-700a (2)): writ_petition_criminal's party is the Petitioner.
  const applicantLabel =
    side || options.petitionerRole
      ? 'Petitioner'
      : esc(
          signed?.petitioner ??
            packLabels?.[0] ??
            rules.party_designation.applicant ??
            rules.party_designation.petitioner ??
            'Applicant',
        );
  const respondentLabel = side
    ? 'Respondent'
    : esc(
        signed?.respondent ??
          packLabels?.[1] ??
          rules.party_designation.respondent ??
          rules.party_designation.opposite_party ??
          'Respondent',
      );

  const clientDetails = memoClientDetails;
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
  const stateLine = stateIsCounterpart
    ? `<br>
        ${state !== '___________' ? `State of ${state}, through the concerned authority` : '___________'}`
    : '';

  return [
    { label: applicantLabel, name: applicant, extra: firstRowDetails },
    { label: respondentLabel, name: respondent, extra: `${secondRowDetails}${stateLine}` },
  ];
}

/** T-700, AJ-700a (3): the placeholder for a side with no name. */
export function civilPartyPlaceholder(side: 'Plaintiff' | 'Defendant'): string {
  return `[To be confirmed: name of the ${side}]`;
}

/**
 * The several names one party field holds (a list value with more than one
 * name), each exactly as given; null when it holds one name or none.
 */
function severalNames(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  return value.map((v) => (typeof v === 'string' ? v.trim() : ''));
}

/**
 * T-700 (AJ-700 (1), (3); AJ-700a (3)): the Memo rows of a civil pleading or
 * the O.39 application, plaintiff side first, each party in the pack's own
 * role (`labels`, from its cause title). The client's details print on the
 * client's row only. Where the pack's signed row has no field for the
 * opposite party (counterpart NONE: written_statement, replication,
 * plaint_partition), it prints civilPartyPlaceholder. Several names on a side
 * print as "Plaintiff No. 1", "Defendant No. 1", ..., each as given, and a
 * party with no name gets the placeholder. The cause title is not touched.
 */
function civilMemoRows(
  formData: Record<string, unknown>,
  partyValues: Record<string, unknown> | undefined,
  packId: string,
  labels: readonly [string, string],
  clientSide: CaseSide | null,
): MemoRow[] {
  const row = rowFor(packId);
  const flat = flattenPartyValues(partyValues ?? formData);
  const clientIsDefendant = clientSide === 'respondent';
  const clientDetails = memoClientDetails(
    safeEsc(applicantAgeOf(formData)),
    relationOf(formData),
    safeEsc(applicantAddressOf(formData)),
  );

  const clientNames = (row?.client ? severalNames(flat[row.client]) : null) ?? [
    str(applicantNameOf(formData), ''),
  ];
  const counterpartNames: string[] =
    row?.counterpart.kind === 'none'
      ? ['']
      : ((row?.counterpart.kind === 'field' && row.counterpart.fields.length === 1
          ? severalNames(flat[row.counterpart.fields[0]])
          : null) ?? [str(respondentNameOf(formData), '')]);

  const sideRows = (
    names: string[],
    role: 'Plaintiff' | 'Defendant',
    singleLabel: string,
    extra: string,
  ): MemoRow[] =>
    names.map((name, i) => ({
      label: esc(names.length > 1 ? `${role} No. ${i + 1}` : singleLabel),
      name: esc(name.trim() !== '' ? name : civilPartyPlaceholder(role)),
      extra,
    }));

  const plaintiffRows = clientIsDefendant
    ? sideRows(counterpartNames, 'Plaintiff', labels[0], '')
    : sideRows(clientNames, 'Plaintiff', labels[0], clientDetails);
  const defendantRows = clientIsDefendant
    ? sideRows(clientNames, 'Defendant', labels[1], clientDetails)
    : sideRows(counterpartNames, 'Defendant', labels[1], '');
  return [...plaintiffRows, ...defendantRows];
}

// ── T-700 / T-689d: the court type and the pack's annexure set ────────────────

/** A string with something other than spaces in it, as given; else undefined. */
function nonBlankString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
}

/**
 * T-689d, AJ-700a (4): the one court type every annexure uses (the Synopsis
 * gate and the court-fee annexure alike): the first non-blank string of the
 * chosen court's lookup type, the form's `court_type`, the stored
 * `doc.courtType`, then the court rule's `courtType`. Each as given, never
 * trimmed or mapped. Undefined when none is given. Pure.
 */
export function annexureCourtType(input: {
  courtData?: Pick<CourtLookupData, 'courtType'> | null;
  formCourtType?: unknown;
  docCourtType?: unknown;
  rulesCourtType?: unknown;
}): string | undefined {
  return (
    nonBlankString(input.courtData?.courtType) ??
    nonBlankString(input.formCourtType) ??
    nonBlankString(input.docCourtType) ??
    nonBlankString(input.rulesCourtType)
  );
}

/**
 * T-700 (AJ-700, AJ-700a): the annexure sets.
 *   criminal     the criminal set (AJ-700 rule 0), unchanged
 *   pleading     written_statement, replication, plaint_* (AJ-700 (1))
 *   o39          temporary_injunction_o39 (AJ-700 (3))
 *   sided        counter_affidavit, rejoinder_affidavit (AJ-700 (3))
 *   civil_other  every other pack, a guided brief and no pack: Memo + Index
 */
export type AnnexureSet = 'criminal' | 'pleading' | 'o39' | 'sided' | 'civil_other';

/** AJ-700a (2): criminal by subject matter though its category is `writ`; party: Petitioner. */
const CRIMINAL_BY_ID: ReadonlySet<string> = new Set(['writ_petition_criminal']);

/** AJ-700 (3): the affidavits that get no separate affidavit. */
const SIDED_SET_IDS: ReadonlySet<string> = new Set(['counter_affidavit', 'rejoinder_affidavit']);

const O39_PACK_ID = 'temporary_injunction_o39';

/** AJ-700 (1): the civil pleadings. */
function isPleadingId(id: string): boolean {
  return id === 'written_statement' || id === 'replication' || id.startsWith('plaint_');
}

/** The rule pack, or null when there is none or it cannot be read. */
function packOf(id: string): RulePack | null {
  try {
    return loadRulePack(id);
  } catch {
    return null;
  }
}

/** The pack's `category` (rule pack, else template config); null when neither says. */
function packCategory(id: string): string | null {
  const pack = packOf(id);
  if (pack) return pack.category;
  try {
    return loadTemplateConfig(id)?.category ?? null;
  } catch {
    return null;
  }
}

/**
 * T-700 (AJ-700 rule 0, AJ-700a (2)): the annexure set a pack gets. Criminal:
 * the T-566 isCriminalCategory test on the pack's category, plus
 * writ_petition_criminal by id. Every other pack is civil, by kind.
 */
export function annexureSetFor(packId: string | null | undefined): AnnexureSet {
  const id = typeof packId === 'string' ? packId.trim() : '';
  if (id === '') return 'civil_other';
  if (CRIMINAL_BY_ID.has(id) || isCriminalCategory(packCategory(id))) return 'criminal';
  if (isPleadingId(id)) return 'pleading';
  if (id === O39_PACK_ID) return 'o39';
  if (SIDED_SET_IDS.has(id)) return 'sided';
  return 'civil_other';
}

/**
 * T-700, AJ-700b (H): the pack's i-th cause-title role label, only where the
 * cause title itself prints it ("... <label>" in its format). A label that is
 * only a form hint (e.g. "Defendants (all coparceners / co-sharers including
 * women)") never prints in a document: undefined.
 */
function printedRoleLabel(pack: RulePack | null, i: number): string | undefined {
  const d = pack?.causeTitle?.partyDesignations[i];
  if (!d) return undefined;
  return pack?.causeTitle?.format.includes(`... ${d.label}`) ? d.label : undefined;
}

/** AJ-700 (1), AJ-700b (H): the civil role word for a cause-title role id. */
const CIVIL_ROLE_WORDS: Readonly<Record<string, string>> = {
  plaintiff: 'Plaintiff',
  defendant: 'Defendant',
  defendants: 'Defendant',
};

/**
 * The Memo roles of a pleading or the O.39 application: each the printed
 * cause-title label, else the role word for its role id; null when either is
 * missing.
 */
function civilRoleLabels(pack: RulePack | null): readonly [string, string] | null {
  const roles = pack?.causeTitle?.partyDesignations ?? [];
  const at = (i: number): string | undefined =>
    printedRoleLabel(pack, i) ??
    (roles[i] && Object.prototype.hasOwnProperty.call(CIVIL_ROLE_WORDS, roles[i].role)
      ? CIVIL_ROLE_WORDS[roles[i].role]
      : undefined);
  const first = at(0);
  const second = at(1);
  return first !== undefined && second !== undefined ? [first, second] : null;
}

/**
 * T-700, AJ-700b (E): the Synopsis role and noun of a civil pack, from the
 * pack: a plaint is the Plaintiff's plaint, a (civil) writ the Petitioner's
 * petition. Null for every other civil pack: it gets no Synopsis, so the
 * criminal "Applicant/Petitioner" / "petition/application" wording never
 * prints on it.
 */
function civilSynopsisWording(
  id: string,
  category: string | null,
): { role: string; noun: string } | null {
  if (id.startsWith('plaint_')) return { role: 'Plaintiff', noun: 'plaint' };
  if (category === 'writ') return { role: 'Petitioner', noun: 'petition' };
  return null;
}

/**
 * T-700 (AJ-700 (1)): the rule the Index's list of documents relied on cites:
 * Order VIII Rule 1A CPC for a written statement, Order VII Rule 14 CPC for a
 * plaint; null for any other pack (replication included: not ruled).
 */
function documentsRuleOf(id: string): string | null {
  if (id === 'written_statement') return 'Order VIII Rule 1A CPC';
  if (id.startsWith('plaint_')) return 'Order VII Rule 14 CPC';
  return null;
}

// ── Synopsis (Annexure B when attached) ───────────────────────────────────────

/**
 * T-689c, AJ-689c-a (2) (Ajay, via Priya, 30 Oct 2026): the packs that never
 * get the Synopsis annexure, whatever the court. AJ-689c-d (3): nor a guided
 * brief (GUIDED_PACK_ID, 'guided').
 */
export const NO_SYNOPSIS_PACK_IDS: ReadonlySet<string> = new Set([
  'written_statement',
  'replication',
  'counter_affidavit',
  'rejoinder_affidavit',
  'memo_of_parties',
  'list_of_dates',
  'synopsis',
  'vakalatnama',
  'affidavit_identity',
  'affidavit_in_support',
  'production_of_documents',
  // AJ-689c-d (3): no Synopsis for a guided brief.
  GUIDED_PACK_ID,
]);

/**
 * T-689c, AJ-689c-a (3): the only court types (COURT_TYPES, @lawie/shared)
 * that get the Synopsis annexure. Unknown, missing or any other type: none.
 */
export const SYNOPSIS_COURT_TYPES: ReadonlySet<CourtType> = new Set<CourtType>([
  'high_court',
  'high_court_bench',
  'supreme_court',
]);

/**
 * T-689c, AJ-689c-b (Ajay, via Priya, 30 Oct 2026): the client_role option ids
 * (brief-party-fields CLIENT_ROLES) by the side they put the client on. The
 * respondent side is the respondent and the defendant; the filing side is the
 * petitioner, applicant, plaintiff and appellant. The accused is on neither
 * (it files bail and quashing, and defends a trial): no side.
 */
const ROLE_SIDE: Readonly<Record<ClientRole, CaseSide | null>> = {
  petitioner: 'petitioner',
  applicant: 'petitioner',
  plaintiff: 'petitioner',
  appellant: 'petitioner',
  respondent: 'respondent',
  defendant: 'respondent',
  accused: null,
};

/**
 * T-689c, AJ-689c-b: the client fields of CLIENT_ROLE_TABLE that put the client
 * on the respondent (opposite-party, defence) side. Every other client field
 * (applicant, petitioner, plaintiff, appellant, aggrieved, complainant, victim)
 * is the filing side; client_name has no side of its own (client_role gives it).
 */
const RESPONDENT_SIDE_CLIENT_FIELDS: ReadonlySet<string> = new Set([
  'respondent_name',
  'defendant_name',
]);

/** An option label or id as its id, as brief-party-fields reads client_role. */
function roleId(v: unknown): string {
  return typeof v === 'string'
    ? v
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
    : '';
}

/**
 * T-689c, AJ-689c-b: the client's side for the Synopsis rule, from what the
 * party resolver (brief-party-fields) reads, in its order:
 *   1. `client_side` as the resolver set it (sided packs, clientSideOf);
 *   2. else an answered `client_role` (rule 1: it overrides the table), by
 *      ROLE_SIDE; an accused client has no side and the table is not read;
 *   3. else the pack's row in CLIENT_ROLE_TABLE: 'respondent' for a
 *      RESPONDENT_SIDE_CLIENT_FIELDS client field, 'petitioner' for any other.
 * null when none says (no client_side, no recognised client_role, no row or a
 * row with no client field). 'petitioner' here means only "not the respondent
 * side". `partyValues` is what the resolver mapped (the form, or a brief's
 * values); absent, the form. Pure.
 */
export function synopsisClientSide(input: {
  rulePackId?: string | null;
  formData: Record<string, unknown>;
  partyValues?: Record<string, unknown>;
}): CaseSide | null {
  const resolved = clientSideOf(input.formData);
  if (resolved) return resolved;
  const role = roleId(flattenPartyValues(input.partyValues ?? input.formData).client_role);
  if ((CLIENT_ROLES as readonly string[]).includes(role)) return ROLE_SIDE[role as ClientRole];
  const row = typeof input.rulePackId === 'string' ? rowFor(input.rulePackId) : undefined;
  if (!row || row.client === null || row.client === 'client_name') return null;
  return RESPONDENT_SIDE_CLIENT_FIELDS.has(row.client) ? 'respondent' : 'petitioner';
}

/**
 * T-689c, AJ-689c-a (2)-(3) and AJ-689c-b: whether the pack gets the Synopsis
 * annexure. True only for a pack id not in NO_SYNOPSIS_PACK_IDS, a court type
 * in SYNOPSIS_COURT_TYPES (both matched exactly), and a client not on the
 * respondent side (AJ-689c-b: "A respondent-side client BLOCKS B"). With no
 * side (`clientSide` absent or null) the deny list and the court list decide.
 * A missing pack id or court type is false (fails closed).
 */
export function annexureBApplies(input: {
  rulePackId?: string | null;
  courtType?: string | null;
  clientSide?: CaseSide | null;
}): boolean {
  const { rulePackId, courtType, clientSide } = input;
  if (typeof rulePackId !== 'string' || rulePackId === '') return false;
  if (typeof courtType !== 'string') return false;
  if (NO_SYNOPSIS_PACK_IDS.has(rulePackId)) return false;
  if (clientSide === 'respondent') return false;
  return SYNOPSIS_COURT_TYPES.has(courtType as CourtType);
}

/** T-689c, AJ-689c-a (1): printed when the pack has no display name. */
export const NATURE_OF_MATTER_PLACEHOLDER = '[To be confirmed: Nature of matter]';

/** A pack id is a rule file name without `.json` (as rule-pack.service PACK_ID). */
const NATURE_PACK_ID = /^[a-z0-9_]+$/;

/**
 * T-689c, AJ-689c-a (1): the "Nature of matter", unescaped: the pack's raw
 * catalogue name, byte for byte, as template-promoter sets `display_name` (the
 * rule file's `displayName`, else its `title`, each when a non-empty string;
 * never trimmed, recased or humanised). NATURE_OF_MATTER_PLACEHOLDER when
 * neither exists, or the pack id is missing, not a pack id, or its rule file is
 * missing or unreadable. Reads `dir/<id>.json` only.
 */
export function natureOfMatter(
  rulePackId: string | null | undefined,
  dir: string = RULE_PACKS_DIR,
): string {
  if (typeof rulePackId !== 'string' || !NATURE_PACK_ID.test(rulePackId)) {
    return NATURE_OF_MATTER_PLACEHOLDER;
  }
  let source: unknown;
  try {
    source = JSON.parse(readFileSync(join(dir, `${rulePackId}.json`), 'utf-8'));
  } catch {
    return NATURE_OF_MATTER_PLACEHOLDER;
  }
  if (typeof source !== 'object' || source === null || Array.isArray(source)) {
    return NATURE_OF_MATTER_PLACEHOLDER;
  }
  const { displayName, title } = source as Record<string, unknown>;
  if (typeof displayName === 'string' && displayName.length > 0) return displayName;
  if (typeof title === 'string' && title.length > 0) return title;
  return NATURE_OF_MATTER_PLACEHOLDER;
}

function annexureSynopsis(
  formData: Record<string, unknown>,
  rules: CourtRules,
  label: string,
  nature: string,
  petitionerRole = false,
  civil: { role: string; noun: string } | null = null,
): string {
  // T-424 (Ajay, 14 Oct): on a sided pack the party line is "Petitioner:" and
  // names the petitioner.
  const sided = clientSideOf(formData) !== null;
  const applicant = safeEsc(sided ? formData.petitioner_name : applicantNameOf(formData));
  // T-700 (AJ-700a (2)): writ_petition_criminal's party is the Petitioner.
  // AJ-700b (E): a civil pack's own role.
  const partyLabel = civil
    ? civil.role
    : sided || petitionerRole
      ? 'Petitioner'
      : 'Applicant/Petitioner';
  const courtDesig = esc(rules.designation);
  const sections = str(formData.sections_charged ?? formData.bns_sections ?? formData.sections, '');
  const firNo = safeEsc(formData.fir_number ?? formData.fir_no ?? formData.complaint_number);
  const ps = safeEsc(formData.police_station ?? formData.ps_name);
  const year = new Date().getFullYear();

  const bulletPoints: string[] = [
    `${partyLabel}: ${applicant}`,
    sections ? `Sections invoked: ${esc(sections)}` : '',
    // AJ-700 rule 0: no FIR line on a civil pack.
    !civil && firNo !== '___________' ? `FIR/Complaint No.: ${firNo}, PS: ${ps}` : '',
    `Court: ${courtDesig}`,
    `Year: ${year}`,
  ].filter(Boolean);

  return `
<div class="page-break">
  <div class="annexure-label">${label}</div>
  <h2>Synopsis</h2>
  <p style="text-align:center">(As required by High Court Practice)</p>
  <br>
  <p><strong>Nature of matter:</strong> ${esc(nature)}</p>
  <p><strong>Brief synopsis of the case:</strong></p>
  <ul>
    ${bulletPoints.map((b) => `<li>${b}</li>`).join('\n    ')}
  </ul>
  <p>The ${civil ? civil.role.toLowerCase() : 'petitioner'} has approached this Hon'ble Court seeking relief as set out in the accompanying ${civil ? civil.noun : 'petition/application'}. The facts are briefly summarised hereunder for the convenience of this Hon'ble Court.</p>
  <p><em>[Advocate to insert 3–5 sentence summary of the factual background before filing.]</em></p>
  <div class="disclaimer">Draft prepared by Lawie from the details you entered. Check it before filing. Lawie does not provide legal advice.</div>
</div>`;
}

// ── List of Dates ─────────────────────────────────────────────────────────────

function annexureListOfDates(formData: Record<string, unknown>, label: string): string {
  const eventDate = safeDateEsc(
    formData.event_date ?? formData.incident_date ?? formData.date_of_incident,
  );
  const firDate = safeDateEsc(formData.fir_date ?? formData.date_of_fir);
  const firNo = safeEsc(formData.fir_number ?? formData.fir_no ?? formData.complaint_number);
  // T-638 (Ajay T-612 (6), (6a), (6b)): "Police Station {name}" in prose, the
  // name without its own station marker.
  const psRaw = str(formData.police_station ?? formData.ps_name);
  const ps = esc(psRaw === '___________' ? psRaw : policeStationName(psRaw));
  const arrestDate = safeDateEsc(formData.date_of_arrest ?? formData.arrest_date);
  // T-349: "4 April 2026" (T-340's formatter), local date as before.
  const filingDate = formatDraftDate(new Date());

  const rows: Array<[string, string]> = [
    [eventDate !== '___________' ? eventDate : '___________', 'Date of alleged incident/event'],
    [
      firDate !== '___________' ? firDate : '___________',
      `FIR No. ${firNo} registered at Police Station ${ps}`,
    ],
    [arrestDate !== '___________' ? arrestDate : '___________', 'Date of arrest / apprehension'],
    [filingDate, 'Filing of the present application/petition'],
  ];

  return `
<div class="page-break">
  <div class="annexure-label">${label}</div>
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

/** T-700 (AJ-700a (7)): one date of the brief, with the brief's own label. */
export interface AnnexureBriefDate {
  /** What the date is, as the brief labels it. */
  date_of: string;
  /** The date as the brief holds it. */
  date: string;
}

/** One List of Dates row: the date as given, and its label, both unescaped. */
type DateRow = readonly [date: string, event: string];

/** A date answered "Not known", or blank: never listed (AJ-700a (7)). */
function isListedDate(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '' && !/^not known$/i.test(v.trim());
}

/** AJ-700a (7), brief path: the brief's dates with their labels, in the brief's order. */
function briefDateRows(dates: readonly AnnexureBriefDate[]): DateRow[] {
  return dates.filter((d) => isListedDate(d.date)).map((d) => [d.date, d.date_of] as const);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * AJ-700a (7), template path: the pack's filled date-type form fields, each
 * with its signed form label, in date order (ISO dates by date; any other
 * value after them, in form order). Nothing is computed.
 */
function formDateRows(pack: RulePack | null, formData: Record<string, unknown>): DateRow[] {
  const rows = (pack?.facts ?? [])
    .filter((f) => f.type === 'date')
    .map((f) => ({ value: formData[f.key] ?? formData[f.name], label: f.label }))
    .filter((r): r is { value: string; label: string } => isListedDate(r.value))
    .map((r) => ({ value: r.value.trim(), label: r.label }));
  const iso = rows.filter((r) => ISO_DATE.test(r.value));
  const other = rows.filter((r) => !ISO_DATE.test(r.value));
  iso.sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
  return [...iso, ...other].map((r) => [r.value, r.label] as const);
}

/**
 * T-700 (AJ-700 (1), AJ-700a (7)): the civil List of Dates: only the given
 * dates, with no FIR, arrest or filing line; none given, only the "advocate to
 * add" row.
 */
function annexureCivilListOfDates(rows: readonly DateRow[], label: string): string {
  return `
<div class="page-break">
  <div class="annexure-label">${label}</div>
  <h2>List of Dates and Chronology of Events</h2>
  <br>
  <table>
    <tr><th style="width:28%">Date</th><th>Event</th></tr>${rows
      .map(([d, e]) => `\n    <tr><td>${safeDateEsc(d)}</td><td>${esc(e)}</td></tr>`)
      .join('')}
    <tr><td colspan="2"><em>[Advocate to add further dates as appropriate before filing.]</em></td></tr>
  </table>
  <div class="disclaimer">Draft prepared by Lawie from the details you entered. Check it before filing. Lawie does not provide legal advice.</div>
</div>`;
}

// ── Index of Documents ───────────────────────────────────────────────────────

/** T-689c: the annexures the builder can attach, in pack order. */
type AnnexureKind =
  | 'memo'
  | 'synopsis'
  | 'dates'
  | 'index'
  | 'vakalatnama'
  | 'court_fee'
  | 'affidavit'
  | 'verification';

/** T-689c: one attached annexure and the letter it is printed under. */
interface AttachedAnnexure {
  kind: AnnexureKind;
  letter: string;
}

/**
 * T-689c, AJ-689c-a (4): the n-th annexure's letter, from A with no gap
 * (0 -> "A"). A pack has at most 7 attached annexures (the criminal set) and
 * 3 lettered index rows after them, so it never runs past "J".
 */
function annexureLetter(n: number): string {
  return String.fromCharCode('A'.charCodeAt(0) + n);
}

/** T-700: what the Index lists besides the attached annexures. */
interface IndexOptions {
  set: AnnexureSet;
  /** AJ-700 (2): the "Nature of matter" first line, unescaped; null: none. */
  nature: string | null;
  /** AJ-700a (2): writ_petition_criminal's party is the Petitioner. */
  petitionerRole: boolean;
  /** AJ-700 (1): a pleading's own row (its nature of matter), unescaped. */
  pleading?: string;
  /** AJ-700 (1): the rule the list of documents relied on cites (documentsRuleOf). */
  documentsRule?: string | null;
  /** AJ-700a (1): the "Court fee" row, where payable. */
  courtFee: boolean;
}

/** The Reference column of an index row that is neither attached nor lettered. */
const INDEX_REFERENCE_BLANK = '___________';

/**
 * The index annexure. T-689c, AJ-689c-a (4): built from the same list of
 * attached annexures as the pack, so its letters and serial numbers always
 * match what is attached; the advocate's further annexures follow on from the
 * last attached letter.
 * T-700: the criminal set keeps its FIR and identity rows. A civil pleading
 * lists the pleading first, then the attached annexures, its list of documents
 * relied on (AJ-700 (1)), the documents the advocate annexes, the Vakalatnama
 * and, where payable, the court fee (AJ-700a (1)). Every other civil pack lists
 * the attached annexures, any other document relied upon, the Vakalatnama and,
 * where payable, the court fee. "Nature of matter" is the first line on every
 * court document (AJ-700 (2)).
 */
function annexureIndexOfDocuments(
  formData: Record<string, unknown>,
  label: string,
  attached: readonly AttachedAnnexure[],
  options: IndexOptions,
): string {
  const firNo = safeEsc(formData.fir_number ?? formData.fir_no ?? formData.complaint_number);
  // T-424: "Affidavit of" the deponent, who is the client on a sided pack.
  const applicant = safeEsc(clientNameOf(formData));

  const documentOf: Readonly<Record<AnnexureKind, string>> = {
    memo: 'Memo of Parties',
    synopsis: 'Synopsis',
    dates: 'List of Dates and Chronology',
    index: 'Index of Documents Annexed',
    vakalatnama: 'Vakalatnama',
    court_fee: 'Court Fee Paid Statement',
    affidavit: 'Affidavit of ' + applicant,
    verification: 'Verification',
  };
  const attachedRows: Array<[string, string]> = attached.map(({ kind, letter }) => [
    documentOf[kind],
    kind === 'index' ? `Annexure ${letter} (this document)` : `Annexure ${letter}`,
  ]);
  const next = (k: number): string => annexureLetter(attached.length + k);
  const rows: Array<[string, string]> = [];
  if (options.set === 'criminal') {
    rows.push(...attachedRows);
    rows.push(
      [
        firNo !== '___________'
          ? `Copy of FIR No. ${firNo}`
          : 'Copy of FIR / Complaint (if available)',
        `Annexure ${next(0)} (to be annexed by advocate)`,
      ],
      [
        options.petitionerRole
          ? 'Identity and Address Proof of Petitioner'
          : 'Identity and Address Proof of Applicant/Petitioner',
        `Annexure ${next(1)} (to be annexed by advocate)`,
      ],
      ['Any other document relied upon', `Annexure ${next(2)} onwards (as applicable)`],
    );
  } else if (options.set === 'pleading') {
    if (options.pleading !== undefined) {
      rows.push([esc(options.pleading), INDEX_REFERENCE_BLANK]);
    }
    rows.push(...attachedRows);
    let k = 0;
    if (options.documentsRule) {
      rows.push([
        `List of documents relied on (${esc(options.documentsRule)})`,
        `Annexure ${next(k++)} (to be annexed by advocate)`,
      ]);
    }
    rows.push(
      ['Documents as annexed by the advocate', `Annexure ${next(k)} onwards (as applicable)`],
      ['Vakalatnama', INDEX_REFERENCE_BLANK],
    );
    if (options.courtFee) rows.push(['Court fee', INDEX_REFERENCE_BLANK]);
  } else {
    rows.push(...attachedRows);
    rows.push(
      ['Any other document relied upon', `Annexure ${next(0)} onwards (as applicable)`],
      ['Vakalatnama', INDEX_REFERENCE_BLANK],
    );
    if (options.courtFee) rows.push(['Court fee', INDEX_REFERENCE_BLANK]);
  }
  const stdDocs: Array<[string, string, string]> = rows.map(([d, r], i) => [String(i + 1), d, r]);
  // AJ-700 (2): the AJ-689c-a bytes, as the Synopsis prints them.
  const natureLine =
    options.nature !== null
      ? `
  <p><strong>Nature of matter:</strong> ${esc(options.nature)}</p>`
      : '';

  return `
<div class="page-break">
  <div class="annexure-label">${label}</div>
  <h2>Index of Documents Annexed</h2>
  <br>${natureLine}
  <table>
    <tr><th style="width:8%">Sr.</th><th>Document</th><th style="width:32%">Reference / Page No.</th></tr>
    ${stdDocs.map(([n, d, r]) => `<tr><td>${n}.</td><td>${d}</td><td>${r}</td></tr>`).join('\n    ')}
  </table>
  <p style="margin-top:1em"><em>Note: Page numbers to be filled in by advocate before filing.</em></p>
  <div class="disclaimer">Draft prepared by Lawie from the details you entered. Check it before filing. Lawie does not provide legal advice.</div>
</div>`;
}

// ── Vakalatnama ───────────────────────────────────────────────────────────────

function annexureVakalatnama(
  formData: Record<string, unknown>,
  rules: CourtRules,
  label: string,
): string {
  // T-424: the client appoints the advocate; on a sided pack, the deponent.
  const applicant = safeEsc(clientNameOf(formData));
  const applicantAddr = safeEsc(clientAddressOf(formData));
  const advocateName = safeEsc(formData.advocate_name);
  const enrollmentNo = safeEsc(formData.enrollment_number);
  const courtDesig = esc(rules.designation);

  return `
<div class="page-break">
  <div class="annexure-label">${label}</div>
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

// ── Court Fee Statement ──────────────────────────────────────────────────────

function annexureCourtFeeStatement(
  rules: CourtRules,
  label: string,
  resolvedCourtType: string | undefined,
): string {
  const courtDesig = esc(rules.designation);
  // T-689d (AJ-700a (4)): the same court type as the Synopsis gate.
  const courtType = str(resolvedCourtType, 'district_court');

  // Court fee schedules vary widely — provide a reference template with blanks
  const isHC = courtType.includes('high_court') || courtType.includes('hc');

  return `
<div class="page-break">
  <div class="annexure-label">${label}</div>
  <h2>Court Fee Paid Statement</h2>
  <p style="text-align:center">${courtDesig}</p>
  <br>
  <table>
    <tr><th>Sr.</th><th>Description</th><th>Amount (₹)</th><th>Mode of Payment</th></tr>
    <tr><td>1.</td><td>Court fee on application/petition</td><td>___________</td><td>Court Fee Stamp / DD / Online</td></tr>
    ${isHC ? '<tr><td>2.</td><td>Process fee</td><td>___________</td><td>___________</td></tr>\n    ' : ''}<tr><td>${isHC ? '3' : '2'}.</td><td>Miscellaneous (if any)</td><td>___________</td><td>___________</td></tr>
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

// ── Affidavit (absorbs SCRUM-66) ─────────────────────────────────────────────

/** T-700: an affidavit's own designation and verification, where the pack gives them. */
interface AffidavitOptions {
  /** The deponent's designation when none is given or sided (default: Applicant/Petitioner). */
  designation?: string;
  /**
   * AJ-700b (B): the document the affidavit supports, in lines 2-5 and the
   * verification ("application" for O.39). Absent: as before
   * ("petition/application"; the court rule's verification unchanged).
   */
  noun?: string;
}

/**
 * AJ-700b (B): the court rule's affidavit verification with only its noun set
 * ("the above <noun>") and a fixed role word ("the <Role> herein above named")
 * set to the deponent's role; every other byte as the court rule has it.
 */
function withAffidavitNoun(text: string, noun: string, role: string | undefined): string {
  const out = text.replace(
    /the above (?:petition|plaint\/application|application|Original Application|complaint|appeal)\b/g,
    () => `the above ${noun}`,
  );
  return role
    ? out.replace(
        /the (?:Applicant|Petitioner|Complainant|Appellant) herein above named/g,
        () => `the ${role} herein above named`,
      )
    : out;
}

function annexureAffidavit(
  formData: Record<string, unknown>,
  rules: CourtRules,
  bodyParaCount: number,
  label: string,
  options: AffidavitOptions = {},
): string {
  // T-424 (Ajay, 44bf8a5): on a sided pack the deponent is the client, and the
  // designation follows the client's side; an explicit one still wins.
  const side = clientSideOf(formData);
  const deponentName = side ? formData.deponent_name : applicantNameOf(formData);
  const designationText =
    formData.deponent_designation ??
    (side
      ? SIDED_DESIGNATION[side]
      : (options.designation ?? 'the above-named Applicant/Petitioner'));
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

  // Build verification text from court_rules.verification_format — fill placeholders.
  const filledVerification = rules.verification_format
    .replace('{deponent_name}', () => str(deponentName))
    .replace('{designation}', () => str(designationText))
    .replace('{body_para_count}', () => String(bodyParaCount))
    .replace('{place}', () => str(verifiedAt))
    .replace('{date}', () => today);
  // AJ-700b (B): only the noun (and a fixed role word) change, where given.
  const docNoun = options.noun ?? 'petition/application';
  const verificationText = esc(
    options.noun
      ? withAffidavitNoun(
          filledVerification,
          options.noun,
          options.designation?.replace(/^the above-named /, ''),
        )
      : filledVerification,
  );

  return `
<div class="page-break">
  <div class="annexure-label">${label}</div>
  <h2>Affidavit</h2>
  <p style="text-align:center">${courtDesig}</p>
  <br>
  <p style="text-align:center"><strong>AFFIDAVIT OF ${deponent.toUpperCase()}</strong></p>
  <br>
  <p>I, <strong>${deponent}</strong>,${deponentAge !== '___________' ? ` aged about ${deponentAge} years,` : ''} ${deponentRelation}, resident of ${deponentAddr !== '___________' ? deponentAddr : '___________'}, do hereby solemnly affirm and state on oath as under:</p>
  <br>
  <p class="indent">1. That I am ${designation} in the accompanying matter and am well acquainted with the facts of the case.</p>
  <p class="indent">2. That the facts stated in the accompanying ${docNoun} are true and correct to the best of my knowledge and belief.</p>
  <p class="indent">3. That no material fact has been concealed or misstated in the accompanying ${docNoun}.</p>
  <p class="indent">4. That the Annexures filed along with the accompanying ${docNoun} are true copies of the originals.</p>
  <p class="indent">5. That this affidavit is being affirmed in support of the accompanying ${docNoun}.</p>
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

// ── Verification (T-700) ─────────────────────────────────────────────────────

/** AJ-700 (1): printed where the draft gives no paragraph count. */
export const PARAGRAPH_NUMBERS_PLACEHOLDER = '[To be confirmed: paragraph numbers]';

/**
 * T-700 (AJ-700 (1), AJ-700a (5)): the pack's signed verificationTemplate
 * filled in, every other byte as signed. `{lastParagraph}` is the draft's
 * paragraph count, else PARAGRAPH_NUMBERS_PLACEHOLDER; `{place}` and `{date}`
 * as the affidavit fills them; any other `{key}` is the party value of that
 * key, else the blank. Unescaped.
 */
function fillPackVerification(
  template: string,
  formData: Record<string, unknown>,
  partyValues: Record<string, unknown> | undefined,
  bodyParaCount: number | undefined,
): string {
  const flat = flattenPartyValues(partyValues ?? formData);
  const today = formatDraftDate(new Date());
  const place = firstNonBlank(formData.place, formData.city, formData.district);
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (_m, key: string) => {
    if (key === 'lastParagraph') {
      return bodyParaCount !== undefined ? String(bodyParaCount) : PARAGRAPH_NUMBERS_PLACEHOLDER;
    }
    if (key === 'place') return str(place);
    if (key === 'date') return today;
    return str(firstNonBlank(formData[key], flat[key]));
  });
}

/**
 * T-700 (AJ-700 (1), AJ-700a (5)): the pleading's Verification page: the
 * filled template's first line ("VERIFICATION") as the heading, the rest as
 * signed.
 */
function annexureVerification(filled: string, label: string): { heading: string; html: string } {
  const lines = filled.split('\n');
  const heading = lines.length > 1 && lines[0].trim() !== '' ? lines[0].trim() : 'Verification';
  const body = (heading === lines[0]?.trim() ? lines.slice(1) : lines)
    .join('\n')
    .replace(/^\n+/, '');
  return {
    heading,
    html: `
<div class="page-break">
  <div class="annexure-label">${label}</div>
  <h2>${esc(heading)}</h2>
  <br>
  <p>${esc(body).replace(/\n/g, '<br>')}</p>
  <div class="disclaimer">Draft prepared by Lawie from the details you entered. Check it before filing. Lawie does not provide legal advice.</div>
</div>`,
  };
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
  /**
   * T-689c: the document's rule pack id (the brief's rule pack, else the
   * form's template_id). With courtType, decides whether the Synopsis is
   * attached (annexureBApplies) and names its "Nature of matter"
   * (natureOfMatter). Absent: no Synopsis.
   */
  rulePackId?: string;
  /**
   * T-689c, T-689d: the document's court type (COURT_TYPES), as the route
   * resolved it with annexureCourtType (chosen court, form, doc.courtType).
   * Absent: resolved here from courtData, the form's court_type, then the
   * court rule (annexureCourtType). Used for the Synopsis and the court fee.
   */
  courtType?: string;
  /**
   * T-689c (AJ-689c-b): the party values the resolver mapped (the form, or an
   * older brief draft's values), read for client_role (synopsisClientSide),
   * T-700 for several names on a side and the verification's party values.
   * Absent: formData.
   */
  partyValues?: Record<string, unknown>;
  /**
   * T-700 (AJ-700a (7)): on the brief path, the brief's dates with their
   * labels (given, even empty, means the brief path). Absent: the template
   * path, which lists the pack's filled date-type form fields.
   */
  briefDates?: readonly AnnexureBriefDate[];
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
  /**
   * The attached annexures in order, lettered from A with no gap (T-689c; the
   * set by pack, T-700); `parts[i].html` joined with "\n" is the body.
   */
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
 * T-579: build the HTML of the annexures (one source for both renderers). Each
 * annexure after the first starts with the page-break class. Court rules are
 * resolved automatically from formData.court_id / court_type + state.
 * T-689c: the Synopsis only where annexureBApplies; the rest lettered from A in
 * order with no gap, the index built from the same list.
 * T-700: the set by pack (annexureSetFor); T-689d: one court type
 * (annexureCourtType) for the Synopsis and the court fee.
 */
export function buildAnnexuresHtml(input: AnnexuresInput): AnnexuresHtml {
  const {
    formData,
    bodyParaCount = 10,
    advocateName,
    enrollmentNumber,
    courtData,
    rulePackId,
    courtType,
    partyValues,
    briefDates,
  } = input;

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

  // T-689d (AJ-700a (4)): one court type for the Synopsis gate and the court
  // fee: the route's (chosen court, form, doc.courtType), else resolved here
  // from the chosen court, the form, then the court rule.
  const resolvedCourtType =
    nonBlankString(courtType) ??
    annexureCourtType({
      courtData,
      formCourtType: enrichedForm.court_type,
      rulesCourtType: rules.courtType,
    });

  // T-700 (AJ-700, AJ-700a): the pack's set. The pack is the brief's rule pack,
  // else the form's template_id.
  const setPackId = str(firstNonBlank(rulePackId, templateId), '');
  const set = annexureSetFor(setPackId);
  const pack = set === 'criminal' || setPackId === '' ? null : packOf(setPackId);
  const petitionerRole = CRIMINAL_BY_ID.has(setPackId);
  // AJ-700b (H): roles as the cause title prints them, never a form hint.
  const civilLabels = set === 'pleading' || set === 'o39' ? civilRoleLabels(pack) : null;
  const otherLabels =
    set === 'civil_other'
      ? ([printedRoleLabel(pack, 0), printedRoleLabel(pack, 1)] as const)
      : null;
  // AJ-700b (E): a civil pack's Synopsis wording, from the pack; none, no Synopsis.
  const synopsisWording =
    set === 'criminal' ? null : civilSynopsisWording(setPackId, pack?.category ?? null);

  // T-700 (AJ-700a (7)): the civil List of Dates rows (brief path: the brief's
  // dates; template path: the pack's filled date fields).
  const civilDates: DateRow[] =
    set === 'criminal'
      ? []
      : briefDates !== undefined
        ? briefDateRows(briefDates)
        : formDateRows(pack, enrichedForm);
  // AJ-700a (5): the pack's own verification; an empty template, no page.
  const verificationTemplate = pack?.verificationTemplate ?? null;

  // T-689c (AJ-689c-a, AJ-689c-b): the Synopsis only where it applies (never
  // for a respondent-side client); every annexure is lettered by its place in
  // this one list, and the index is built from it.
  const clientSide = synopsisClientSide({ rulePackId, formData: enrichedForm, partyValues });
  const synopsis =
    (set === 'criminal' || synopsisWording !== null) &&
    annexureBApplies({ rulePackId, courtType: resolvedCourtType, clientSide })
      ? (['synopsis'] as const)
      : [];
  const kindsBySet: Readonly<Record<AnnexureSet, AnnexureKind[]>> = {
    criminal: ['memo', ...synopsis, 'dates', 'index', 'vakalatnama', 'court_fee', 'affidavit'],
    pleading: [
      'memo',
      ...synopsis,
      'dates',
      'index',
      ...(verificationTemplate !== null ? (['verification'] as const) : []),
    ],
    // AJ-700 (3): no List of Dates unless there are dates.
    o39: [
      'memo',
      ...synopsis,
      ...(civilDates.length > 0 ? (['dates'] as const) : []),
      'index',
      'affidavit',
    ],
    sided: ['memo', ...synopsis, 'index'],
    civil_other: ['memo', ...synopsis, 'index'],
  };
  const kinds = kindsBySet[set];
  const attached: AttachedAnnexure[] = kinds.map((kind, i) => ({
    kind,
    letter: annexureLetter(i),
  }));

  // T-700: the Memo by set. Pleadings and O.39: the pack's own roles
  // (AJ-700 (1), (3)); counter/rejoinder: the main matter's (sided) roles;
  // another civil pack: its own roles after the signed labels.
  const memoOptions: MemoOptions =
    (set === 'pleading' || set === 'o39') && civilLabels
      ? { rows: civilMemoRows(enrichedForm, partyValues, setPackId, civilLabels, clientSide) }
      : set === 'civil_other'
        ? { packLabels: otherLabels }
        : { petitionerRole };

  // AJ-700 (2), AJ-700a (6): "Nature of matter" on the Index of every court
  // document (a guided brief: the placeholder, as natureOfMatter gives it).
  const nature = natureOfMatter(setPackId || undefined);
  const indexOptions: IndexOptions = {
    set,
    nature: setPackId === GUIDED_PACK_ID || isCourtDocument(setPackId) ? nature : null,
    petitionerRole,
    ...(set === 'pleading' ? { pleading: nature, documentsRule: documentsRuleOf(setPackId) } : {}),
    // AJ-700a (1): pleadings and the O.39 application carry the court fee.
    courtFee: set === 'pleading' || set === 'o39',
  };

  // AJ-700 (3), AJ-700b (B): the O.39 affidavit in support is by the
  // plaintiff/applicant, of "the application"; it ends with the court rule's
  // affidavit verification, only its role and noun set. The pack's own
  // verificationTemplate belongs to the application itself, not here.
  const affidavitOptions: AffidavitOptions =
    set === 'o39'
      ? {
          ...(civilLabels ? { designation: `the above-named ${civilLabels[0]}` } : {}),
          noun: 'application',
        }
      : petitionerRole
        ? { designation: SIDED_DESIGNATION.petitioner }
        : {};

  const partOf = (kind: AnnexureKind, label: string): Omit<AnnexurePart, 'label'> => {
    switch (kind) {
      case 'memo':
        // The first page, no break.
        return {
          heading: 'Memo of Parties',
          html: annexureMemoOfParties(enrichedForm, rules, false, label, memoOptions),
        };
      case 'synopsis':
        return {
          heading: 'Synopsis',
          html: annexureSynopsis(
            enrichedForm,
            rules,
            label,
            natureOfMatter(rulePackId),
            petitionerRole,
            synopsisWording,
          ),
        };
      case 'dates':
        return {
          heading: 'List of Dates and Chronology of Events',
          html:
            set === 'criminal'
              ? annexureListOfDates(enrichedForm, label)
              : annexureCivilListOfDates(civilDates, label),
        };
      case 'index':
        return {
          heading: 'Index of Documents Annexed',
          html: annexureIndexOfDocuments(enrichedForm, label, attached, indexOptions),
        };
      case 'vakalatnama':
        return { heading: 'Vakalatnama', html: annexureVakalatnama(enrichedForm, rules, label) };
      case 'court_fee':
        return {
          heading: 'Court Fee Paid Statement',
          html: annexureCourtFeeStatement(rules, label, resolvedCourtType),
        };
      case 'affidavit':
        return {
          heading: 'Affidavit',
          html: annexureAffidavit(enrichedForm, rules, bodyParaCount, label, affidavitOptions),
        };
      case 'verification':
        return annexureVerification(
          fillPackVerification(
            verificationTemplate ?? '',
            enrichedForm,
            partyValues,
            input.bodyParaCount,
          ),
          label,
        );
    }
  };

  const parts: AnnexurePart[] = attached.map(({ kind, letter }) => {
    const label = `ANNEXURE ${letter}`;
    return { label, ...partOf(kind, label) };
  });

  const html = wrapHtml(parts.map((p) => p.html).join('\n'));
  return { html, parts };
}

/**
 * Build a multi-page PDF containing the annexures (buildAnnexuresHtml).
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

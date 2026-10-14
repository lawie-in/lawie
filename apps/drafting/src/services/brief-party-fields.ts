/**
 * T-381 — who the annexures pack names as the client and the opposite party.
 *
 * Ajay's rule (handoff/legal/T-381-annexures-button-signed.md, Addenda 1-3):
 *   1. `client_role`, when answered, names the client. It always overrides the table.
 *   2. Otherwise the pack's row in the signed per-pack table (Addendum 3).
 *   3. Otherwise blanks. Never a guess, never a "first non-empty" chain across roles.
 *
 * The output is the flat keys annexures.service.ts already reads (applicant_name,
 * respondent_name, applicant_address, applicant_age, father_name, plus the
 * advocate passthrough). That file is not changed here (T-396).
 *
 * T-424 (Addendum 5): on SIDED_PACKS (counter and rejoinder affidavits) the
 * output is instead petitioner_name and respondent_name, each party under its
 * own role, plus deponent_name/_address/_age/_father_name (the client) and
 * client_side ('petitioner' | 'respondent').
 *
 * Pure: no I/O, no model call, and nothing is logged (the values are PII).
 */

/**
 * What the route refuses on (Addenda 2 and 4). `client_role`: the client's
 * side is unknown (ambiguous row, caveat answer, no row), so no name is
 * missing yet; `client_name`: the side is known and its name is empty.
 */
export type PartyMissing = 'client_role' | 'client_name' | 'opposite_party_name';

/** The opposite side of a row. */
export type CounterpartRule =
  /** A named field (or fields, all printed). Empty means the route refuses (Addendum 2). */
  | { kind: 'field'; fields: readonly string[]; withState?: true }
  /** The State (Addendum 1 State rule). The pack prints it as it does today. */
  | { kind: 'state' }
  /** No field holds it: the signed blank prints. */
  | { kind: 'none' };

/** A flip or caveat answer that gives blanks (Addendum 3). Never an automatic side swap. */
export interface CaveatRule {
  field: string;
  /** The option id. A label is folded to its id before comparing. */
  value: string;
}

export interface ClientRoleRow {
  /** The client's name field (last segment), or null: blanks unless client_role is answered. */
  client: string | null;
  /** The client's detail fields, in order; only these may fill the client's details. */
  details: {
    address: readonly string[];
    age: readonly string[];
    parentage: readonly string[];
  };
  counterpart: CounterpartRule;
  caveat?: CaveatRule;
}

// ── The signed table (Addendum 3, 13 Oct 2026) ──────────────────────────────

const NO_DETAILS = { address: [], age: [], parentage: [] } as const;

/** `<role>_address`, `<role>_age`, `<role>_father_name` / `<role>_parentage` for a `<role>_name` field. */
function roleDetails(clientField: string, generic = false): ClientRoleRow['details'] {
  const p = clientField.replace(/_name$/, '');
  return {
    address: [`${p}_address`, ...(generic ? ['address'] : [])],
    age: [`${p}_age`, ...(generic ? ['age'] : [])],
    parentage: [`${p}_father_name`, `${p}_parentage`, ...(generic ? ['father_name'] : [])],
  };
}

function row(
  client: string,
  counterpart: CounterpartRule,
  extra: {
    generic?: boolean;
    caveat?: CaveatRule;
    /** Addendum 4: signed extra detail fields, after the role's own. */
    details?: Partial<ClientRoleRow['details']>;
  } = {},
): ClientRoleRow {
  const d = roleDetails(client, extra.generic === true);
  return {
    client,
    details: {
      address: [...d.address, ...(extra.details?.address ?? [])],
      age: [...d.age, ...(extra.details?.age ?? [])],
      parentage: [...d.parentage, ...(extra.details?.parentage ?? [])],
    },
    counterpart,
    ...(extra.caveat ? { caveat: extra.caveat } : {}),
  };
}

const STATE: CounterpartRule = { kind: 'state' };
const NONE: CounterpartRule = { kind: 'none' };
const field = (...fields: string[]): CounterpartRule => ({ kind: 'field', fields });
const BLANK_ROW: ClientRoleRow = { client: null, details: NO_DETAILS, counterpart: NONE };

/**
 * One row per court pack, as signed. A pack with no row prints blanks until
 * Ajay signs one. Field names are the last segment (`parties.plaintiff_name`
 * is `plaintiff_name`).
 */
export const CLIENT_ROLE_TABLE: Readonly<Record<string, ClientRoleRow>> = {
  // Bail and allied: the accused/applicant against the State.
  bail_regular: row('applicant_name', STATE, { generic: true }),
  bail_anticipatory: row('applicant_name', STATE, { generic: true }),
  bail_before_magistrate: row('applicant_name', STATE),
  default_bail: row('applicant_name', STATE),
  interim_bail: row('applicant_name', STATE),
  surrender_application: row('applicant_name', STATE),
  discharge_application: row('applicant_name', STATE),
  suspension_of_sentence: row('appellant_name', STATE),

  amendment_of_pleadings: row('applicant_name', field('respondent_name')),
  condonation_of_delay: row('applicant_name', field('respondent_name')),
  production_of_documents: row('applicant_name', field('respondent_name')),
  receiver_appointment: row('applicant_name', field('respondent_name')),
  maintenance_bnss_144: row('applicant_name', field('respondent_name')),
  interim_application: row('applicant_name', field('non_applicant_name')),
  cat_oa: row('applicant_name', NONE, { details: { address: ['applicant_office_address'] } }),
  ibc_application: row('applicant_name', field('corporate_debtor_name')),
  dv_act_complaint: row('aggrieved_name', field('respondent_name')),

  divorce_hma: row('petitioner_name', field('respondent_name')),
  divorce_sma: row('petitioner_name', field('respondent_name')),
  judicial_separation: row('petitioner_name', field('respondent_name')),
  rcr_petition: row('petitioner_name', field('respondent_name')),
  guardianship_petition: row('petitioner_name', field('respondent_name')),
  curative_petition: row('petitioner_name', field('respondent_name')),
  criminal_revision: row('petitioner_name', field('respondent_name')),
  certiorari: row('petitioner_name', field('respondent_authority')),
  mandamus: row('petitioner_name', field('respondent_authority')),
  writ_petition_civil: row('petitioner_name', NONE),
  writ_petition_criminal: row('petitioner_name', NONE),
  review_petition: row('petitioner_name', NONE),
  slp: row('petitioner_name', NONE),
  habeas_corpus: row('petitioner_name', NONE),
  pil: row('petitioner_name', NONE),
  quo_warranto: row('petitioner_name', NONE),

  // The accused as petitioner: the complainant, and the State.
  fir_quashing: row('petitioner_name', {
    kind: 'field',
    fields: ['complainant_name'],
    withState: true,
  }),
  quashing_528_bnss: row('petitioner_name', {
    kind: 'field',
    fields: ['complainant_name'],
    withState: true,
  }),
  bail_cancellation: row('petitioner_name', field('respondent_name'), {
    caveat: { field: 'party_role', value: 'accused_for_variation_of_conditions' },
  }),

  criminal_appeal: row('appellant_name', field('respondent_name')),
  itat_appeal: row('appellant_name', field('respondent_name')),
  consumer_complaint: row('applicant_name', field('respondent_name'), { generic: true }),
  posh_complaint: row('complainant_name', field('respondent_name')),
  rera_complaint: row('complainant_name', field('promoter_name'), {
    caveat: { field: 'complainant_type', value: 'promoter_against_allottee' },
  }),
  mact_claim: row('victim_name', field('owner_name', 'insurer_name'), {
    caveat: { field: 'claim_type', value: 'death_claim_by_legal_heirs' },
    details: { age: ['victim_age_at_accident'] },
  }),

  plaint_declaration: row('plaintiff_name', field('defendant_name')),
  plaint_eviction: row('plaintiff_name', field('defendant_name')),
  plaint_injunction: row('plaintiff_name', field('defendant_name')),
  plaint_recovery: row('plaintiff_name', field('defendant_name')),
  plaint_specific_performance: row('plaintiff_name', field('defendant_name')),
  temporary_injunction_o39: row('plaintiff_name', field('defendant_name')),
  plaint_partition: row('plaintiff_name', NONE),
  replication: row('plaintiff_name', NONE),
  restoration_application: row('plaintiff_name', field('defendant_name')),
  written_statement: row('defendant_name', NONE),
  // Addendum 4: the deponent is the client in both.
  counter_affidavit: row('respondent_name', field('petitioner_name'), {
    details: { address: ['deponent_address'], age: ['deponent_age'] },
  }),
  rejoinder_affidavit: row('petitioner_name', field('respondent_name'), {
    details: { address: ['deponent_address'], age: ['deponent_age'] },
  }),

  // The client is client_name; its role comes from client_role (rule 1).
  vakalatnama: row('client_name', NONE),

  // Ambiguous: blanks unless client_role is answered.
  affidavit_in_support: BLANK_ROW,
  divorce_mutual_consent: BLANK_ROW,
  list_of_dates: BLANK_ROW,
  synopsis: BLANK_ROW,
  memo_of_parties: BLANK_ROW,
};

// ── client_role (rule 1) ─────────────────────────────────────────────────────

/** The vakalatnama's client_role option ids. */
export const CLIENT_ROLES = [
  'petitioner',
  'applicant',
  'plaintiff',
  'defendant',
  'respondent',
  'accused',
  'appellant',
] as const;
export type ClientRole = (typeof CLIENT_ROLES)[number];

/**
 * The opposite side of an answered role. Respondent (petitioner, applicant or
 * appellant on the other side) and accused (the State) are not one field, so
 * they have none: the signed blank.
 */
const ROLE_COUNTERPART: Readonly<Partial<Record<ClientRole, string>>> = {
  petitioner: 'respondent_name',
  applicant: 'respondent_name',
  appellant: 'respondent_name',
  plaintiff: 'defendant_name',
  defendant: 'plaintiff_name',
};

// ── Values ───────────────────────────────────────────────────────────────────

/** An option label or id, as its id: "Accused (for variation of conditions)" -> accused_for_variation_of_conditions. */
function foldOption(v: string): string {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function lastSegment(key: string): string {
  const i = key.lastIndexOf('.');
  return i === -1 ? key : key.slice(i + 1);
}

function text(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (Array.isArray(v)) {
    return v
      .filter((x): x is string => typeof x === 'string')
      .map((x) => x.trim())
      .filter((x) => x !== '')
      .join(', ');
  }
  return '';
}

/**
 * Flat values by last segment: `parties.plaintiff_name` -> `plaintiff_name`.
 * An undotted key wins over a dotted one; among dotted keys the first
 * non-empty wins. Accepts a record (formInputs) or the brief's
 * `[{ key, value }]` list.
 */
export function flattenPartyValues(values: unknown): Record<string, unknown> {
  const entries: Array<[string, unknown]> = [];
  if (Array.isArray(values)) {
    for (const item of values) {
      if (item && typeof item === 'object' && typeof (item as { key?: unknown }).key === 'string') {
        entries.push([(item as { key: string }).key, (item as { value?: unknown }).value]);
      }
    }
  } else if (values && typeof values === 'object') {
    entries.push(...Object.entries(values as Record<string, unknown>));
  }

  // Rank: a non-empty undotted key (2), a non-empty dotted key (1), empty (0).
  // The highest rank wins; on a tie, the first.
  const out: Record<string, unknown> = {};
  const rank = new Map<string, number>();
  for (const [key, value] of entries) {
    const name = lastSegment(key);
    const r = text(value) === '' ? 0 : name === key ? 2 : 1;
    if (!rank.has(name) || r > rank.get(name)!) {
      out[name] = value;
      rank.set(name, r);
    }
  }
  return out;
}

function firstOf(flat: Record<string, unknown>, fields: readonly string[]): string {
  for (const f of fields) {
    const t = text(flat[f]);
    if (t !== '') return t;
  }
  return '';
}

// ── The mapper ───────────────────────────────────────────────────────────────

export type PartyBasis = 'client_role' | 'table' | 'caveat' | 'blank_row' | 'no_row';

export interface PartyFieldsResult {
  /** Flat keys for annexures.service.ts. Only non-empty values are set. */
  fields: Record<string, string>;
  clientName: string;
  /** The opposite party's name when a field holds it; '' for State and no-field rows. */
  counterpartName: string;
  /** How the opposite side prints: a field, the State as today, or the signed blank. */
  counterpart: CounterpartRule['kind'];
  basis: PartyBasis;
  missing: PartyMissing[];
  /**
   * T-424 (Addendum 5): the client's side in the case on a pack whose Memo
   * prints each party under its own role (SIDED_PACKS). null on every other
   * pack, and when the side cannot be told (then `missing` is set).
   */
  clientSide: CaseSide | null;
}

// ── Addendum 5 (T-424): each party under its own role ───────────────────────

/** A party's role in the case, on the packs whose Memo prints both by role. */
export type CaseSide = 'petitioner' | 'respondent';

/**
 * Addendum 5: the packs whose client is on the petitioner or respondent side,
 * and that side by the signed row. The client is the deponent; it is never
 * printed as "applicant" or moved to the filer's side. Every other pack maps
 * as T-381 does.
 */
export const SIDED_PACKS: Readonly<Record<string, CaseSide>> = {
  counter_affidavit: 'respondent',
  rejoinder_affidavit: 'petitioner',
};

const SIDE_NAME_FIELD: Readonly<Record<CaseSide, string>> = {
  petitioner: 'petitioner_name',
  respondent: 'respondent_name',
};
const OTHER_SIDE: Readonly<Record<CaseSide, CaseSide>> = {
  petitioner: 'respondent',
  respondent: 'petitioner',
};
/** Addendum 4/5: the deponent's own detail fields, after the role's. */
const DEPONENT_DETAILS = { address: ['deponent_address'], age: ['deponent_age'] } as const;

/**
 * The render keys a sided pack adds for annexures.service.ts: the client as
 * the deponent, and the client's side. The parties themselves go in
 * `petitioner_name` and `respondent_name`.
 */
const SIDED_RENDER_KEYS = [
  'deponent_name',
  'deponent_address',
  'deponent_age',
  'deponent_father_name',
  'client_side',
] as const;

function isSidedPack(templateId: string): boolean {
  return Object.prototype.hasOwnProperty.call(SIDED_PACKS, templateId);
}

/** The answered client_role as an option id, or null. */
function answeredRole(flat: Record<string, unknown>): ClientRole | null {
  const v = foldOption(text(flat.client_role));
  return (CLIENT_ROLES as readonly string[]).includes(v) ? (v as ClientRole) : null;
}

function advocatePassthrough(flat: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ['advocate_name', 'advocate_enrollment', 'enrollment_number']) {
    const t = text(flat[k]);
    if (t !== '') out[k] = t;
  }
  return out;
}

function clientFields(
  name: string,
  details: ClientRoleRow['details'],
  flat: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (name !== '') out.applicant_name = name;
  const address = firstOf(flat, details.address);
  const age = firstOf(flat, details.age);
  const parentage = firstOf(flat, details.parentage);
  if (address !== '') out.applicant_address = address;
  if (age !== '') out.applicant_age = age;
  if (parentage !== '') out.father_name = parentage;
  return out;
}

/** The client's details as the deponent's (sided packs). */
function deponentFields(
  name: string,
  details: ClientRoleRow['details'],
  flat: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (name !== '') out.deponent_name = name;
  const address = firstOf(flat, details.address);
  const age = firstOf(flat, details.age);
  const parentage = firstOf(flat, details.parentage);
  if (address !== '') out.deponent_address = address;
  if (age !== '') out.deponent_age = age;
  if (parentage !== '') out.deponent_father_name = parentage;
  return out;
}

/**
 * Addendum 5: a sided pack. The side is an answered client_role (petitioner or
 * respondent), else the signed row's. Any other answered role cannot be told
 * as a side here, so it is refused with client_role. Each party prints under
 * its own role; the client is also the deponent.
 */
function mapSidedPack(
  templateId: string,
  flat: Record<string, unknown>,
  advocate: Record<string, string>,
): PartyFieldsResult {
  const tableRow = CLIENT_ROLE_TABLE[templateId];
  const role = answeredRole(flat);
  if (role !== null && role !== 'petitioner' && role !== 'respondent') {
    return {
      fields: advocate,
      clientName: '',
      counterpartName: '',
      counterpart: 'none',
      basis: 'client_role',
      missing: ['client_role'],
      clientSide: null,
    };
  }

  const side: CaseSide = role ?? SIDED_PACKS[templateId];
  const other = OTHER_SIDE[side];
  let clientField: string;
  let details: ClientRoleRow['details'];
  if (role !== null) {
    clientField = text(flat.client_name) !== '' ? 'client_name' : SIDE_NAME_FIELD[side];
    const d = roleDetails(clientField);
    details = {
      address: [...d.address, ...DEPONENT_DETAILS.address],
      age: [...d.age, ...DEPONENT_DETAILS.age],
      parentage: d.parentage,
    };
  } else {
    clientField = tableRow.client ?? SIDE_NAME_FIELD[side];
    details = tableRow.details;
  }

  const clientName = text(flat[clientField]);
  const counterpartName = text(flat[SIDE_NAME_FIELD[other]]);
  const missing: PartyMissing[] = [];
  if (clientName === '') missing.push('client_name');
  if (counterpartName === '') missing.push('opposite_party_name');

  return {
    fields: {
      ...advocate,
      ...(clientName !== '' ? { [SIDE_NAME_FIELD[side]]: clientName } : {}),
      ...(counterpartName !== '' ? { [SIDE_NAME_FIELD[other]]: counterpartName } : {}),
      ...deponentFields(clientName, details, flat),
      client_side: side,
    },
    clientName,
    counterpartName,
    counterpart: 'field',
    basis: role !== null ? 'client_role' : 'table',
    missing,
    clientSide: side,
  };
}

/**
 * The client and the opposite party for `templateId`, from flat or dotted
 * values (formInputs, or the brief's values). `missing` names what the route
 * refuses on (Addendum 2): the client's name, and the opposite party's name
 * when a named field should hold it.
 */
export function mapPartyFields(
  templateId: string,
  values: Record<string, unknown>,
): PartyFieldsResult {
  const flat = flattenPartyValues(values);
  const advocate = advocatePassthrough(flat);

  // T-424 (Addendum 5): each party under its own role, the client as deponent.
  if (isSidedPack(templateId)) return mapSidedPack(templateId, flat, advocate);

  // Rule 1: an answered client_role always wins.
  const role = answeredRole(flat);
  if (role) {
    const fromClientField = text(flat.client_name) !== '';
    const clientField = fromClientField ? 'client_name' : `${role}_name`;
    const clientName = text(flat[clientField]);
    const counterpartField = ROLE_COUNTERPART[role];
    const counterpartName = counterpartField ? text(flat[counterpartField]) : '';
    const fields: Record<string, string> = {
      ...advocate,
      ...clientFields(clientName, roleDetails(clientField), flat),
      ...(counterpartName !== '' ? { respondent_name: counterpartName } : {}),
    };
    return {
      fields,
      clientName,
      counterpartName,
      // The pack may not have the counterpart's field (the vakalatnama's row is
      // a blank), so an empty one is the signed blank, not a refusal.
      counterpart: counterpartName !== '' ? 'field' : 'none',
      basis: 'client_role',
      missing: clientName === '' ? ['client_name'] : [],
      clientSide: null,
    };
  }

  const tableRow = Object.prototype.hasOwnProperty.call(CLIENT_ROLE_TABLE, templateId)
    ? CLIENT_ROLE_TABLE[templateId]
    : undefined;
  const caveatHit =
    tableRow?.caveat !== undefined &&
    foldOption(text(flat[tableRow.caveat.field])) === tableRow.caveat.value;

  // Rule 3: no row, an ambiguous row, or a caveat answer: blanks.
  if (!tableRow || tableRow.client === null || caveatHit) {
    return {
      fields: advocate,
      clientName: '',
      counterpartName: '',
      counterpart: 'none',
      basis: !tableRow ? 'no_row' : caveatHit ? 'caveat' : 'blank_row',
      // Addendum 4: the side is unknown, so the role is what is missing.
      missing: ['client_role'],
      clientSide: null,
    };
  }

  // Rule 2: the signed row.
  const clientName = text(flat[tableRow.client]);
  const cp = tableRow.counterpart;
  const counterpartName =
    cp.kind === 'field'
      ? cp.fields
          .map((f) => text(flat[f]))
          .filter((t) => t !== '')
          .join(', ')
      : '';
  const missing: PartyMissing[] = [];
  if (clientName === '') missing.push('client_name');
  if (cp.kind === 'field' && counterpartName === '') missing.push('opposite_party_name');

  return {
    fields: {
      ...advocate,
      ...clientFields(clientName, tableRow.details, flat),
      // State rows: respondent_name is not set; the pack prints the State as today.
      ...(cp.kind === 'field' && counterpartName !== ''
        ? { respondent_name: counterpartName }
        : {}),
    },
    clientName,
    counterpartName,
    counterpart: cp.kind,
    basis: 'table',
    missing,
    clientSide: null,
  };
}

// ── What a brief draft seals, and what the pack renders ─────────────────────

/** Every field `mapPartyFields` may read for `templateId` (last segments). */
export function partyInputKeys(templateId: string): Set<string> {
  const keys = new Set<string>([
    'client_role',
    'client_name',
    ...roleDetailKeys('client_name'),
    'advocate_name',
    'advocate_enrollment',
    'enrollment_number',
  ]);
  for (const r of CLIENT_ROLES) {
    keys.add(`${r}_name`);
    for (const k of roleDetailKeys(`${r}_name`)) keys.add(k);
  }
  const tableRow = Object.prototype.hasOwnProperty.call(CLIENT_ROLE_TABLE, templateId)
    ? CLIENT_ROLE_TABLE[templateId]
    : undefined;
  if (tableRow) {
    if (tableRow.client) keys.add(tableRow.client);
    for (const list of Object.values(tableRow.details)) for (const k of list) keys.add(k);
    if (tableRow.counterpart.kind === 'field') {
      for (const k of tableRow.counterpart.fields) keys.add(k);
    }
    if (tableRow.caveat) keys.add(tableRow.caveat.field);
  }
  return keys;
}

function roleDetailKeys(clientField: string): string[] {
  const d = roleDetails(clientField);
  return [...d.address, ...d.age, ...d.parentage];
}

/**
 * The party inputs to seal on a brief draft: the flat values `mapPartyFields`
 * reads for this pack, non-empty only. The pack's own role fields are kept
 * (not the mapped output), so mapping them again gives the same sides.
 */
export function pickPartyInputs(templateId: string, values: unknown): Record<string, string> {
  const flat = flattenPartyValues(values);
  const out: Record<string, string> = {};
  for (const k of partyInputKeys(templateId)) {
    const t = text(flat[k]);
    if (t !== '') out[k] = t;
  }
  return out;
}

/**
 * Addendum 4: whether a brief draft of this pack stores `state`. Only the
 * State rows (bail, and the criminal rows with the State as a party) do, so
 * the memo's State line does not appear under a private respondent.
 */
export function storesState(templateId: string): boolean {
  const tableRow = Object.prototype.hasOwnProperty.call(CLIENT_ROLE_TABLE, templateId)
    ? CLIENT_ROLE_TABLE[templateId]
    : undefined;
  if (!tableRow) return false;
  const cp = tableRow.counterpart;
  return cp.kind === 'state' || (cp.kind === 'field' && cp.withState === true);
}

/** True when `values` holds any party input for this pack. */
export function hasPartyInputs(templateId: string, values: unknown): boolean {
  return Object.keys(pickPartyInputs(templateId, values)).length > 0;
}

/**
 * Party keys annexures.service.ts falls back to. They are cleared before the
 * mapped keys go in, so a generic `address`/`age`/`father_name` or another
 * role's `petitioner_name` never fills a side the table did not give it.
 */
const CLIENT_RENDER_KEYS = [
  'applicant_name',
  'petitioner_name',
  'party_name',
  'applicant_address',
  'address',
  'applicant_age',
  'age',
  'father_name',
  'parent_name',
] as const;
const COUNTERPART_RENDER_KEYS = ['respondent_name', 'opposite_party'] as const;

/**
 * The form data the pack renders: `formData` with the fallback party keys
 * cleared and the mapped keys merged over it. On a State row the opposite
 * side is left as the form has it, so the pack prints the State as today.
 */
export function applyPartyFields(
  formData: Record<string, unknown>,
  mapped: PartyFieldsResult,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...formData };
  for (const k of CLIENT_RENDER_KEYS) delete out[k];
  // T-424: only the resolver sets these; a raw form value never stands in.
  for (const k of SIDED_RENDER_KEYS) delete out[k];
  if (mapped.counterpart !== 'state') {
    for (const k of COUNTERPART_RENDER_KEYS) delete out[k];
  }
  return { ...out, ...mapped.fields };
}

/**
 * The parts of a stored brief (the decrypted `doc.brief` JSON) this file
 * needs: its values, and for a guided brief whether it is a court document.
 */
export function readStoredBrief(json: string): {
  values: unknown;
  courtDocument?: boolean;
} {
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { values: [] };
  const b = parsed as { values?: unknown; court_document?: unknown };
  return {
    values: b.values ?? [],
    ...(typeof b.court_document === 'boolean' ? { courtDocument: b.court_document } : {}),
  };
}

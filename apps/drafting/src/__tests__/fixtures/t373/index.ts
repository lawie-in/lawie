/**
 * T-373 fixtures. The four skeleton JSON files in this folder are the JSON
 * blocks of Ajay's signed handoff/legal/skeleton-<pack>-signed.md (re-signed at d87355a: regular v2, anticipatory v3, Magistrate v4, default_bail unchanged),
 * copies of the JSON in the signed file (prettier in the commit hook reformats them, so
 * they are pinned by value, not by bytes; the tests load the skeleton from the signed md block itself). The ledgers are Anushka's
 * run-3 reproduce steps (handoff/quality/2026-10-13-run-3-develop-FAIL.md).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import type { LedgerFact } from '@lawie/shared';

import type { Skeleton } from '../../../types/skeleton';

export type PackId =
  | 'bail_regular'
  | 'bail_anticipatory'
  | 'bail_before_magistrate'
  | 'default_bail';
export const PACK_IDS: PackId[] = [
  'bail_regular',
  'bail_anticipatory',
  'bail_before_magistrate',
  'default_bail',
];

export function skeletonFile(pack: PackId): string {
  return readFileSync(join(__dirname, `skeleton-${pack}.json`), 'utf8');
}

/** Ajay's signed file. The JSON in it is the one source of truth for the skeleton. */
export function signedMarkdown(pack: PackId): string {
  return readFileSync(
    join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      '..',
      '..',
      'handoff',
      'legal',
      `skeleton-${pack}-signed.md`,
    ),
    'utf8',
  );
}

/** The JSON block between the fences, final newline included: what Ajay's SHA-256 covers. */
export function signedJsonBlock(pack: PackId): string {
  const m = /```json\n([\s\S]*?\n)```/.exec(signedMarkdown(pack));
  if (!m) throw new Error(`no json block in the signed file for ${pack}`);
  return m[1];
}

/** The SHA-256 the signed file prints under the block. */
export function signedPrintedSha(pack: PackId): string {
  const m = /SHA-256 of the JSON block[^`]*`([0-9a-f]{64})`/.exec(signedMarkdown(pack));
  if (!m) throw new Error(`no printed SHA in the signed file for ${pack}`);
  return m[1];
}

/** The skeleton the tests use: parsed from the signed md block, not from a file the commit hook may reformat. */
export function loadFixtureSkeleton(pack: PackId): Skeleton {
  return JSON.parse(signedJsonBlock(pack)) as Skeleton;
}

export interface FactOpts {
  /** Machine value; defaults to the display. A choice fact carries its option id here. */
  value?: string | number | boolean | Record<string, string>;
  label?: string;
  raw_span?: string;
  type?: string;
}

/** One ledger entry. Several entries with one key are a list fact. */
export function fact(key: string, display: string, opts: FactOpts = {}): LedgerFact {
  return {
    id: `f_${key}_${Math.abs(hash(display + (opts.raw_span ?? '')))}`,
    key,
    label: opts.label ?? key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
    type: opts.type ?? 'text',
    value: opts.value ?? display,
    display,
    raw_span: opts.raw_span ?? display,
    source: 'user',
    confidence: 0.99,
    required_in_draft: true,
  } as unknown as LedgerFact;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/** One section_ref entry per section: `BNS 318(4)` is { act: 'BNS', section: '318(4)' }. */
export function sections(key: string, list: string[]): LedgerFact[] {
  return list.map((d) => {
    const m = /^(?:Section\s+)?([A-Z]+)\s+([0-9A-Za-z()]+)$/.exec(d)!;
    return fact(key, d, { type: 'section_ref', value: { act: m[1], section: m[2] } as never });
  });
}

/** A choice fact: display is the option's label, value its id. */
export const choice = (key: string, label: string, id: string): LedgerFact =>
  fact(key, label, { value: id, type: 'enum' });

// ── Option labels, as the packs word them ───────────────────────────────────

export const REG_GROUND = {
  false_implication: 'Falsely implicated due to enmity / mistaken identity',
  no_flight_risk: 'Not a flight risk — deep roots in society',
  no_criminal_antecedent: 'No prior criminal record / first-time offender',
  cooperation: 'Will cooperate with investigation and trial',
  no_evidence_tampering: 'No possibility of tampering with evidence',
  prolonged_custody: 'Already in prolonged custody',
  investigation_complete: 'Investigation is complete / chargesheet filed',
  medical_grounds: 'Medical / health grounds',
  willing_mediation: 'Willing to participate in mediation / counselling',
  youth_first_time: 'Young person, no prior offence',
} as const;

export const ANT_GROUND = {
  false_implication: 'Falsely implicated due to enmity / business dispute',
  no_criminal_antecedent: 'No prior criminal record',
  deep_roots_in_community: 'Deep roots in community — not a flight risk',
  medical_grounds: 'Medical / health grounds',
} as const;

const grounds = (labels: string[]): LedgerFact[] => labels.map((l) => fact('grounds_for_bail', l));

// ── bail_regular: Anushka T-189 (three grounds; sections entered twice; custody three weeks) ──

export const REGULAR_NARRATIVE_RAW =
  'He is accused in a dispute that is civil, from a failed land-sale agreement of 2 Mar 2025, and was arrested three weeks ago.';

export function regularBase(): LedgerFact[] {
  return [
    fact('applicant_name', 'Ramesh Kumar', { type: 'person_name' }),
    fact('applicant_age', '34'),
    fact('address', 'Village Kotwali, Patna'),
    fact('fir_number', '143/2026'),
    fact('fir_date', '2 June 2026', { type: 'date', value: '2026-06-02' }),
    fact('police_station', 'Kotwali', { type: 'police_station' }),
    ...sections('sections_charged', ['BNS 318(4)', 'BNS 316(2)', 'BNS 318(4)']),
    choice('currently_in_custody', 'Yes — Judicial custody', 'yes_judicial'),
    fact('custody_since', '12 June 2026', { type: 'date', value: '2026-06-12' }),
    fact(
      'facts_narrative',
      'He is accused in a civil dispute from a failed land-sale agreement of 2 March 2025.',
      {
        raw_span: REGULAR_NARRATIVE_RAW,
      },
    ),
    fact('antecedents', 'None', { value: 'none' }),
    fact('earlier_bail_applications', 'None', { value: 'none' }),
    ...grounds([
      REG_GROUND.false_implication,
      REG_GROUND.cooperation,
      REG_GROUND.no_evidence_tampering,
    ]),
  ];
}

// ── bail_anticipatory: Anushka T-241 (nothing about roots, character, flight; "boundary quarrel") ──

export function anticipatoryBase(): LedgerFact[] {
  return [
    fact('applicant_name', 'Mohan Singh', { type: 'person_name' }),
    fact('applicant_age', '52'),
    fact('address', 'Village Sherghati, Gaya'),
    fact('fir_number', '88/2026'),
    fact('fir_date', '9 July 2026', { type: 'date', value: '2026-07-09' }),
    fact('police_station', 'Sherghati', { type: 'police_station' }),
    ...sections('sections_charged', ['BNS 115(2)', 'BNS 351(2)']),
    choice('currently_in_custody', 'No — apprehends arrest', 'no'),
    fact('facts_narrative', 'It was a boundary quarrel with the neighbour, he fears arrest.', {
      raw_span: 'it was a boundary quarrel with the neighbour, he fears arrest',
    }),
    fact('antecedents', 'None', { value: 'none' }),
    fact('earlier_bail_applications', 'None', { value: 'none' }),
    ...grounds([ANT_GROUND.false_implication]),
  ];
}

// ── bail_before_magistrate: Anushka T-241 / T-341 ──

export function magistrateBase(over: { woman?: boolean; bailable?: boolean } = {}): LedgerFact[] {
  return [
    fact('applicant_name', 'Sunita Devi', { type: 'person_name' }),
    fact('applicant_age', '41'),
    fact('applicant_address', 'Mohalla Aminabad, Lucknow'),
    fact('fir_number', '27/2026'),
    fact('fir_date', '3 May 2026', { type: 'date', value: '2026-05-03' }),
    fact('police_station', 'Aminabad', { type: 'police_station' }),
    ...sections('offences_alleged', ['BNS 318(4)']),
    over.bailable
      ? choice('offence_classification', 'Bailable', 'bailable')
      : choice(
          'offence_classification',
          "Non-bailable (within Magistrate's powers)",
          'non_bailable_within_magistrate_s_powers',
        ),
    choice(
      'applicant_sex',
      over.woman === false ? 'Male' : 'Female',
      over.woman === false ? 'male' : 'female',
    ),
    fact('grounds_for_bail', 'She has two kids and was not at the spot.', {
      raw_span: 'she has two kids, was not at the spot',
    }),
    fact('facts_narrative', 'The complaint is about a deal she had no part in.', {
      raw_span: 'the complaint is about a deal she had no part in',
    }),
  ];
}

// ── default_bail: Anushka T-251 (will furnish bail bonds = No) ──

export function defaultBailBase(bond: 'Yes' | 'No'): LedgerFact[] {
  return [
    fact('applicant_name', 'Deepak Ravidas', { type: 'person_name' }),
    fact('applicant_address', 'Village Kotwali, Ranchi'),
    fact('fir_number', '143/2026'),
    fact('fir_date', '2 June 2026', { type: 'date', value: '2026-06-02' }),
    fact('police_station', 'Kotwali', { type: 'police_station' }),
    ...sections('offences_alleged', ['BNS 318(4)']),
    fact('arrest_date', '3 June 2026', { type: 'date', value: '2026-06-03' }),
    fact('remand_date', '4 June 2026', { type: 'date', value: '2026-06-04' }),
    choice('period_claimed', '60 days', '60_days'),
    fact('period_expiry_date', '2 August 2026', { type: 'date', value: '2026-08-02' }),
    choice('charge_sheet_status', 'Not filed', 'not_filed'),
    fact('earlier_bail_applications', 'None', { value: 'none' }),
    fact('willingness_to_furnish_bond', bond, { type: 'boolean', value: bond === 'Yes' }),
  ];
}

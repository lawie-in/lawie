import type { MappingType } from '../models/SectionMapping.model';

import {
  attributeNotes,
  BNS_OFFENCE_KEYS,
  caveatForBnsSection,
  getOffenceRow,
  NOT_VERIFIED,
  outsideBnsRange,
  parentSection,
  readToolSections,
  ResolutionKind,
  ResolvedOffence,
  resolveBnsKey,
  resolveOffence,
  showsVerifyCaveat,
  TABLE_CODE,
  VERIFY_CAVEAT,
} from './bns-offence-resolver';
import { getSignedTables, MappingFileMeta, SectionRow } from './signed-tables';

// T-371: Ajay's tool texts and the tools' reader live in the resolver (one module the
// bail checker, timeline and converter share); re-exported here for the converter.
export {
  ATTRIBUTE_DEPENDS,
  attributeNotes,
  caveatForBnsSection,
  MOST_SERIOUS_CANNOT_BE_DETERMINED,
  NOT_VERIFIED,
  readToolSections,
  showsVerifyCaveat,
  TABLE_CODE,
  VERIFY_CAVEAT,
} from './bns-offence-resolver';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LookupResult {
  old_code: string;
  old_code_full: string;
  old_section: string;
  old_title: string;
  new_code: string;
  new_code_full: string;
  new_section: string | null;
  new_title: string | null;
  mapping_type: MappingType;
  notes?: string;
}

export interface ReverseLookupResult {
  new_code: string;
  new_code_full: string;
  new_section: string;
  old_code: string;
  old_code_full: string;
  old_section: string;
  old_title: string;
  new_title: string | null;
  mapping_type: MappingType;
  notes?: string;
}

export interface CodeMeta {
  old_code: string;
  old_code_full: string;
  new_code: string;
  new_code_full: string;
  effective_date: string;
  mapped_sections: number;
  new_provisions: number;
  validated_by: string;
}

// ── Code alias resolution ────────────────────────────────────────────────────

const CODE_ALIASES: Record<string, string> = {
  IPC: 'IPC',
  'INDIAN PENAL CODE': 'IPC',
  BNS: 'BNS',
  'BHARATIYA NYAYA SANHITA': 'BNS',
  CRPC: 'CrPC',
  'CR.P.C.': 'CrPC',
  'CR.P.C': 'CrPC',
  'CODE OF CRIMINAL PROCEDURE': 'CrPC',
  BNSS: 'BNSS',
  'BHARATIYA NAGARIK SURAKSHA SANHITA': 'BNSS',
  IEA: 'IEA',
  'INDIAN EVIDENCE ACT': 'IEA',
  BSA: 'BSA',
  'BHARATIYA SAKSHYA ADHINIYAM': 'BSA',
};

const OLD_CODES = new Set(['IPC', 'CrPC', 'IEA']);
const NEW_CODES = new Set(['BNS', 'BNSS', 'BSA']);

function resolveCode(input: string): string | null {
  const upper = input.trim().toUpperCase().replace(/\./g, '');
  return CODE_ALIASES[input.trim().toUpperCase()] ?? CODE_ALIASES[upper] ?? null;
}

// ── Data source (T-371, ADR-025 D2) ──────────────────────────────────────────
// Every read comes from the signed files in memory (signed-tables.ts). Mongo's
// SectionMapping collection and the Redis `sections:*` cache are no longer read:
// a table change ships with the file, and no reseed is needed.

/**
 * @deprecated T-371: the tables are served from the signed files in memory. Kept as a
 * no-op so existing callers compile; nothing is cached any more.
 */
export async function refreshCache(): Promise<void> {
  getSignedTables();
}

/** @deprecated T-371: no cache to invalidate. Kept as a no-op so existing callers compile. */
export async function invalidateCache(): Promise<void> {
  // Nothing to do: the signed tables are read once from the files.
}

function metaFor(code: string): MappingFileMeta | undefined {
  return getSignedTables().mappingTables.find(
    (t) => t.meta.old_code === code || t.meta.new_code === code,
  )?.meta;
}

// ── Lookup functions ─────────────────────────────────────────────────────────

/**
 * Look up old section → new section.
 * Input: "302-IPC" or (section, code) separately.
 */
export async function lookupOldToNew(query: string): Promise<LookupResult | null>;
export async function lookupOldToNew(section: string, code: string): Promise<LookupResult | null>;
export async function lookupOldToNew(
  queryOrSection: string,
  code?: string,
): Promise<LookupResult | null> {
  let section: string;
  let resolvedCode: string;

  if (code) {
    section = queryOrSection.trim();
    const resolved = resolveCode(code);
    if (!resolved || !OLD_CODES.has(resolved)) return null;
    resolvedCode = resolved;
  } else {
    const match = queryOrSection.trim().match(/^([\w./\s]+?)[\s-]+(.+)$/);
    if (!match) return null;
    section = match[1].trim();
    const resolved = resolveCode(match[2]);
    if (!resolved || !OLD_CODES.has(resolved)) return null;
    resolvedCode = resolved;
  }

  const doc = getSignedTables().forward.get(`${resolvedCode}:${section}`);
  if (!doc) return null;
  return {
    old_code: doc.oldCode,
    old_code_full: doc.oldCodeFull,
    old_section: doc.oldSection,
    old_title: doc.oldTitle,
    new_code: doc.newCode,
    new_code_full: doc.newCodeFull,
    new_section: doc.newSection,
    new_title: doc.newTitle,
    mapping_type: doc.mappingType,
    notes: doc.notes || undefined,
  };
}

/**
 * Reverse lookup: new section → old section(s).
 */
export async function lookupNewToOld(query: string): Promise<ReverseLookupResult[] | null>;
export async function lookupNewToOld(
  section: string,
  code: string,
): Promise<ReverseLookupResult[] | null>;
export async function lookupNewToOld(
  queryOrSection: string,
  code?: string,
): Promise<ReverseLookupResult[] | null> {
  let section: string;
  let resolvedCode: string;

  if (code) {
    section = queryOrSection.trim();
    const resolved = resolveCode(code);
    if (!resolved || !NEW_CODES.has(resolved)) return null;
    resolvedCode = resolved;
  } else {
    const match = queryOrSection.trim().match(/^([\w./\s()]+?)[\s-]+(.+)$/);
    if (!match) return null;
    section = match[1].trim();
    const resolved = resolveCode(match[2]);
    if (!resolved || !NEW_CODES.has(resolved)) return null;
    resolvedCode = resolved;
  }

  const docs = getSignedTables().reverse.get(`${resolvedCode}:${section}`);
  if (!docs || docs.length === 0) return null;

  return docs.map((doc) => ({
    new_code: doc.newCode,
    new_code_full: doc.newCodeFull,
    new_section: section,
    old_code: doc.oldCode,
    old_code_full: doc.oldCodeFull,
    old_section: doc.oldSection,
    old_title: doc.oldTitle,
    new_title: doc.newTitle,
    mapping_type: doc.mappingType,
    notes: doc.notes || undefined,
  }));
}

/**
 * Auto-detect direction and look up.
 */
export async function autoLookup(
  section: string,
  code: string,
): Promise<{
  direction: 'old_to_new' | 'new_to_old';
  results: LookupResult[] | ReverseLookupResult[];
} | null> {
  const resolved = resolveCode(code);
  if (!resolved) return null;

  if (OLD_CODES.has(resolved)) {
    const result = await lookupOldToNew(section, code);
    return result ? { direction: 'old_to_new', results: [result] } : null;
  }

  if (NEW_CODES.has(resolved)) {
    const results = await lookupNewToOld(section, code);
    return results ? { direction: 'new_to_old', results } : null;
  }

  return null;
}

/**
 * Get all mappings for a given code pair, from the signed file in memory.
 * Same shape as before T-371 (rows use the old SectionMapping field names).
 */
export async function getAllMappings(code: string): Promise<{
  meta: CodeMeta;
  mappings: SectionRow[];
  newProvisions: SectionRow[];
} | null> {
  const resolved = resolveCode(code);
  if (!resolved) return null;

  let docs: SectionRow[];
  if (OLD_CODES.has(resolved)) {
    docs = rowsWhere((r) => r.oldCode === resolved);
  } else if (NEW_CODES.has(resolved)) {
    docs = rowsWhere((r) => r.newCode === resolved);
  } else {
    return null;
  }
  if (docs.length === 0) return null;
  // Same order Mongo gave: { oldSection: 1 }.
  docs = [...docs].sort((a, b) =>
    a.oldSection < b.oldSection ? -1 : a.oldSection > b.oldSection ? 1 : 0,
  );

  const mappings = docs.filter((d) => !d.isNewProvision);
  const newProvisions = docs.filter((d) => d.isNewProvision);
  const sample = docs[0];

  return {
    meta: {
      old_code: sample.oldCode,
      old_code_full: sample.oldCodeFull,
      new_code: sample.newCode,
      new_code_full: sample.newCodeFull,
      effective_date: sample.effectiveDate.toISOString().split('T')[0],
      mapped_sections: mappings.length,
      new_provisions: newProvisions.length,
      validated_by: sample.validatedBy,
    },
    mappings,
    newProvisions,
  };
}

function rowsWhere(pred: (r: SectionRow) => boolean): SectionRow[] {
  return getSignedTables().mappingTables.flatMap((t) => t.rows.filter(pred));
}

// ── Section details (SCRUM-83 — rich result card) ──────────────────────────

export interface SectionDetail {
  code: string;
  section: string;
  title: string;
  statute: string;
  chapter: string | null;
  bailable: boolean | null;
  cognizable: boolean | null;
  compoundable: 'yes' | 'no' | 'with_permission' | null;
  /** T-289: court by which triable, as printed in the First Schedule; null = depends. */
  triable_by: string | null;
  punishment: string | null;
  max_years: number | null;
  ingredients: string[];
  bare_section_text: string | null;
  /** T-277: how a BNS section resolved in the offences table; null for non-BNS. */
  resolution: ResolutionKind | null;
  /** T-277: the table row or variant key used; null when not resolved. */
  resolved_key: string | null;
  /** T-277: "Depends. Check the First Schedule." for a null attribute. */
  bailable_note: string | null;
  cognizable_note: string | null;
  compoundable_note: string | null;
  /** T-277: "This section does not create an offence. Check the Gazette." */
  offence_note: string | null;
  /**
   * T-371 (Ajay, 6526597): VERIFY_CAVEAT for a verify-flagged offence row, else null.
   * The row's raw `verify` text is never served.
   */
  caveat: string | null;
  /** T-371: NOT_VERIFIED for a missing section or an unverified / null-target row. */
  label: string | null;
  related: Array<{ code: string; section: string; title: string }>;
  mapping: {
    old_code: string;
    old_code_full: string;
    old_section: string;
    old_title: string;
    new_code: string;
    new_code_full: string;
    new_section: string | null;
    new_title: string | null;
    mapping_type: MappingType;
    notes?: string;
  } | null;
}

function attributeNotesSnake(offence: ResolvedOffence | undefined): {
  bailable_note: string | null;
  cognizable_note: string | null;
  compoundable_note: string | null;
} {
  if (!offence) return { bailable_note: null, cognizable_note: null, compoundable_note: null };
  const n = attributeNotes(offence);
  return {
    bailable_note: n.bailableNote,
    cognizable_note: n.cognizableNote,
    compoundable_note: n.compoundableNote,
  };
}

const STATUTE_LABEL: Record<string, string> = {
  BNS: 'Bharatiya Nyaya Sanhita, 2023',
  BNSS: 'Bharatiya Nagarik Suraksha Sanhita, 2023',
  BSA: 'Bharatiya Sakshya Adhiniyam, 2023',
  IPC: 'Indian Penal Code, 1860',
  CrPC: 'Code of Criminal Procedure, 1973',
  IEA: 'Indian Evidence Act, 1872',
};

/**
 * Fetch the rich result-card payload for a single section. Returns null only
 * when the code is invalid. An unknown section number returns an envelope with
 * `title` empty so the UI can render "no data" gracefully instead of 404.
 */
export async function getSectionDetail(
  section: string,
  code: string,
): Promise<SectionDetail | null> {
  const resolved = resolveCode(code);
  if (!resolved) return null;
  const trimmedSection = section.trim();
  if (!trimmedSection) return null;

  const isNew = NEW_CODES.has(resolved);
  const isOld = OLD_CODES.has(resolved);
  if (!isNew && !isOld) return null;

  // Mapping doc (single forward for old → new, first reverse for new → old).
  let mapping: SectionDetail['mapping'] = null;
  if (isOld) {
    const doc = await lookupOldToNew(trimmedSection, resolved);
    if (doc) {
      mapping = {
        old_code: doc.old_code,
        old_code_full: doc.old_code_full,
        old_section: doc.old_section,
        old_title: doc.old_title,
        new_code: doc.new_code,
        new_code_full: doc.new_code_full,
        new_section: doc.new_section,
        new_title: doc.new_title,
        mapping_type: doc.mapping_type,
        notes: doc.notes,
      };
    }
  } else {
    const docs = await lookupNewToOld(trimmedSection, resolved);
    const doc = docs?.[0];
    if (doc) {
      mapping = {
        old_code: doc.old_code,
        old_code_full: doc.old_code_full,
        old_section: doc.old_section,
        old_title: doc.old_title,
        new_code: doc.new_code,
        new_code_full: doc.new_code_full,
        new_section: doc.new_section,
        new_title: doc.new_title,
        mapping_type: doc.mapping_type,
        notes: doc.notes,
      };
    }
  }

  // Offence metadata (only available for BNS in the current data set).
  const offenceCode = isNew ? resolved : mapping?.new_code;
  const offenceSection = isNew ? trimmedSection : mapping?.new_section;
  // T-277: resolve through the shared resolver (exact key → variant → parent row).
  const resolvedOffence =
    offenceCode === 'BNS' && offenceSection ? resolveOffence(offenceSection) : undefined;
  const offence =
    resolvedOffence && resolvedOffence.kind !== 'not_an_offence' ? resolvedOffence : undefined;

  // Title — prefer the offence metadata, fall back to the mapping doc, then ''.
  const title = offence?.title ?? (isNew ? mapping?.new_title : mapping?.old_title) ?? '';

  // T-371: missing section, or an unverified / null-target mapping row.
  const detailNotVerified = isOld
    ? !mapping || isNotVerifiedRow(mapping.mapping_type, mapping.new_section)
    : !mapping &&
      (resolved !== 'BNS' || (!resolveBnsKey(trimmedSection) && outsideBnsRange(trimmedSection)));

  // Related sections — derive from same BNS chapter when offence metadata
  // is available. Skipped for old codes / non-BNS for now.
  const related: SectionDetail['related'] = [];
  if (offence?.chapter && offence.key) {
    for (const secKey of BNS_OFFENCE_KEYS) {
      if (secKey === offenceSection || secKey === offence.key) continue;
      const meta = getOffenceRow(secKey);
      if (!meta || meta.chapter !== offence.chapter) continue;
      related.push({ code: 'BNS', section: secKey, title: meta.title });
      if (related.length >= 3) break;
    }
  }

  return {
    code: resolved,
    section: trimmedSection,
    title,
    statute: STATUTE_LABEL[resolved] ?? resolved,
    chapter: offence?.chapter ?? null,
    bailable: offence?.bailable ?? null,
    cognizable: offence?.cognizable ?? null,
    compoundable: offence?.compoundable ?? null,
    // Ajay (T-289): only from the signed First Schedule value, never from the term.
    triable_by: offence?.triableBy ?? null,
    punishment: offence?.punishment ?? null,
    max_years: offence?.maxYears ?? null,
    // Ingredients + bare section text are not yet authored in bns-offences.json.
    // Filed as CLO follow-up; UI renders empty list / null gracefully.
    ingredients: [],
    bare_section_text: null,
    resolution: resolvedOffence?.kind ?? null,
    resolved_key: offence?.key ?? null,
    ...attributeNotesSnake(offence),
    offence_note: resolvedOffence?.note ?? null,
    caveat: offence && showsVerifyCaveat(offence) ? VERIFY_CAVEAT : null,
    label: detailNotVerified ? NOT_VERIFIED : null,
    related,
    mapping,
  };
}

/**
 * Search sections within a single code (SCRUM-85 — typeahead for in-form
 * multi_select_search fields with `source: 'bns_mapping'`).
 *
 * Matches `query` against either the section number (prefix) or the title
 * (case-insensitive substring) of the named code. Returns up to `limit`
 * results, ranked: section-number prefix matches first, then title hits.
 *
 * For new codes (BNS / BNSS / BSA) the result's `section`/`title` come from
 * the new shape; for old codes (IPC / CrPC / IEA) from the old shape.
 */
export interface SectionSearchResult {
  code: string;
  section: string;
  title: string;
  /** Counterpart section in the opposite era — null for repealed or new-provisions. */
  mapped_to: { code: string; section: string | null; title: string | null } | null;
  mapping_type: MappingType;
  is_new_provision: boolean;
}

export async function searchSections(
  query: string,
  code: string,
  limit = 10,
): Promise<SectionSearchResult[]> {
  const resolved = resolveCode(code);
  if (!resolved) return [];
  const trimmed = query.trim();
  if (!trimmed) return [];
  if (limit <= 0) return [];

  const isNew = NEW_CODES.has(resolved);
  const isOld = OLD_CODES.has(resolved);
  if (!isNew && !isOld) return [];

  // Escape regex metacharacters in the user query — keeps the typeahead safe
  // against advocates pasting "(2)" or "/" into the input.
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sectionRe = new RegExp(`^${escaped}`, 'i');
  const titleRe = new RegExp(escaped, 'i');

  // Same filters and order as the retired Mongo queries, over the in-memory rows.
  const inCode = rowsWhere((r) => (isNew ? r.newCode === resolved : r.oldCode === resolved));
  const sectionOf = (r: SectionRow): string | null => (isNew ? r.newSection : r.oldSection);
  const titleOf = (r: SectionRow): string | null => (isNew ? r.newTitle : r.oldTitle);

  // Two-stage search so prefix hits always win against title-only hits when we
  // cap at `limit` results.
  const prefixDocs = inCode
    .filter((r) => {
      const sec = sectionOf(r);
      return sec !== null && sectionRe.test(sec);
    })
    .slice(0, limit);

  let docs = prefixDocs;
  if (docs.length < limit) {
    const remaining = limit - docs.length;
    const seen = new Set(docs);
    const titleDocs = inCode
      .filter((r) => {
        const title = titleOf(r);
        return title !== null && titleRe.test(title);
      })
      .slice(0, remaining + docs.length); // pad so we can dedupe
    for (const d of titleDocs) {
      if (docs.length >= limit) break;
      if (seen.has(d)) continue;
      docs = docs.concat(d);
    }
  }

  return docs.slice(0, limit).map((d) => {
    if (isNew) {
      const newSection = d.newSection ?? '';
      return {
        code: d.newCode,
        section: newSection,
        title: d.newTitle ?? '',
        mapped_to: d.isNewProvision
          ? null
          : { code: d.oldCode, section: d.oldSection, title: d.oldTitle },
        mapping_type: d.mappingType,
        is_new_provision: d.isNewProvision,
      };
    }
    return {
      code: d.oldCode,
      section: d.oldSection,
      title: d.oldTitle,
      mapped_to: d.newSection
        ? { code: d.newCode, section: d.newSection, title: d.newTitle }
        : null,
      mapping_type: d.mappingType,
      is_new_provision: false,
    };
  });
}

/**
 * Get metadata for all code pairs.
 */
export async function getCodesMeta(): Promise<CodeMeta[]> {
  const results: CodeMeta[] = [];
  for (const oldCode of ['IPC', 'CrPC', 'IEA']) {
    const data = await getAllMappings(oldCode);
    if (data) results.push(data.meta);
  }
  return results;
}

/**
 * Convert old-law section references in text to new-law references.
 */
export async function convertOldReferencesInText(text: string): Promise<{
  converted: string;
  conversions: Array<{ original: string; replacement: string }>;
}> {
  const conversions: Array<{ original: string; replacement: string }> = [];

  const pattern =
    /(?:(?:Section|Sec\.?|S\.?)\s*)?(\d+[A-Z]?(?:\([^)]+\))?)\s+(?:of\s+)?(?:the\s+)?(IPC|CrPC|Cr\.?P\.?C\.?|IEA|Indian Penal Code|Code of Criminal Procedure|Indian Evidence Act)\b/gi;

  // Collect all matches first (async lookups needed)
  const matches: Array<{ match: string; section: string; code: string; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    matches.push({ match: m[0], section: m[1], code: m[2], index: m.index });
  }

  // Look up all in parallel
  const lookups = await Promise.all(matches.map((item) => lookupOldToNew(item.section, item.code)));

  // Build replacement string from right to left to preserve indices
  let converted = text;
  for (let i = matches.length - 1; i >= 0; i--) {
    const result = lookups[i];
    if (result && result.new_section) {
      const replacement = `Section ${result.new_section} ${result.new_code} (formerly ${matches[i].section} ${result.old_code})`;
      conversions.unshift({ original: matches[i].match, replacement });
      converted =
        converted.slice(0, matches[i].index) +
        replacement +
        converted.slice(matches[i].index + matches[i].match.length);
    }
  }

  return { converted, conversions };
}

// ── T-371: free tools (converter single + bulk) ──────────────────────────────
// Ajay's texts (NOT_VERIFIED, VERIFY_CAVEAT, ATTRIBUTE_DEPENDS) are in the resolver.

/**
 * T-360 / T-361 Addendum 1: a mapping row that shows NOT_VERIFIED. `unverified` rows
 * (IPC 236, 254, 292A, 376DA) and any other row with no target, except repealed rows,
 * which show "None" (Ajay, T-296 round 2).
 */
export function isNotVerifiedRow(type: MappingType, newSection: string | null): boolean {
  if (type === 'unverified') return true;
  return newSection === null && type !== 'repealed' && type !== 'repealed_no_equivalent';
}

/** Badge per mapping type: Ajay's signed converter copy (T-296 addendum). */
export const MAPPING_TYPE_LABELS: Partial<Record<MappingType, string>> = {
  partial: 'Partial mapping — verify scope',
  repealed: 'Repealed — no equivalent',
  repealed_no_equivalent: 'Repealed — no equivalent',
  merged: 'Merged with other sections — verify scope',
  split: 'Split across several sections — check which one applies',
};

function labelFor(type: MappingType, newSection: string | null): string | null {
  if (isNotVerifiedRow(type, newSection)) return NOT_VERIFIED;
  return MAPPING_TYPE_LABELS[type] ?? null;
}

// ── Single lookup for the converter ──────────────────────────────────────────

export interface ToolMapping extends LookupResult {
  /** False when the section has no row (NOT_VERIFIED). */
  found: boolean;
  /** True for a missing section or an unverified / null-target row. */
  not_verified: boolean;
  /** NOT_VERIFIED, the signed mapping-type badge, or null. */
  label: string | null;
  /** VERIFY_CAVEAT when the BNS section's offence row carries a verify note. */
  caveat?: string;
  /** Parent row used for a sub-section ("156" for "156(3)"). */
  via_parent?: string;
}

export interface ToolReverseMapping extends ReverseLookupResult {
  found: boolean;
  not_verified: boolean;
  label: string | null;
  caveat?: string;
}

/** "498a" → "498A", "156 (3)" → "156(3)", "103(1)(A)" → "103(1)(a)". */
function normaliseSection(raw: string): string {
  const s = raw.replace(/\s+/g, '');
  const i = s.indexOf('(');
  const head = i < 0 ? s : s.slice(0, i);
  const tail = i < 0 ? '' : s.slice(i);
  return head.toUpperCase() + tail.toLowerCase();
}

function toolResult(
  row: SectionRow,
  oldSection: string,
  newSection: string | null,
  viaParent?: string,
): ToolMapping {
  const notVerified = isNotVerifiedRow(row.mappingType, newSection);
  const caveat =
    !notVerified && row.newCode === 'BNS' && newSection
      ? caveatForBnsSection(newSection)
      : undefined;
  return {
    old_code: row.oldCode,
    old_code_full: row.oldCodeFull,
    old_section: oldSection,
    old_title: row.oldTitle,
    new_code: row.newCode,
    new_code_full: row.newCodeFull,
    new_section: notVerified ? null : newSection,
    new_title: notVerified ? null : row.newTitle,
    mapping_type: row.mappingType,
    notes: row.notes || undefined,
    found: true,
    not_verified: notVerified,
    label: labelFor(row.mappingType, newSection),
    ...(caveat ? { caveat } : {}),
    ...(viaParent ? { via_parent: viaParent } : {}),
  };
}

function notVerifiedOld(meta: MappingFileMeta, section: string): ToolMapping {
  return {
    old_code: meta.old_code,
    old_code_full: meta.old_code_full,
    old_section: section,
    old_title: '',
    new_code: meta.new_code,
    new_code_full: meta.new_code_full,
    new_section: null,
    new_title: null,
    mapping_type: 'unverified',
    found: false,
    not_verified: true,
    label: NOT_VERIFIED,
  };
}

/**
 * T-371 / T-360: old → new for the converter (single and bulk). Returns null only for
 * a code that is not IPC, CrPC or IEA. A sub-section with no row of its own uses its
 * parent row (Ajay, T-360): a `direct` parent carries the sub-section across
 * (CrPC 156(3) → BNSS 175(3)); any other parent gives the parent's mapping and label.
 * A section with no row, or a direct parent whose target already has a sub-section,
 * is NOT_VERIFIED. Drafts keep lookupOldToNew (no parent fallback).
 */
export function mapOldForTool(sectionRaw: string, code: string): ToolMapping | null {
  const resolved = resolveCode(code);
  if (!resolved || !OLD_CODES.has(resolved)) return null;
  const meta = metaFor(resolved);
  if (!meta) return null;
  const section = normaliseSection(sectionRaw);
  const { forward } = getSignedTables();

  const exact = forward.get(`${resolved}:${section}`);
  if (exact) return toolResult(exact, section, exact.newSection);

  for (let p = parentSection(section); p; p = parentSection(p)) {
    const row = forward.get(`${resolved}:${p}`);
    if (!row) continue;
    if (row.mappingType === 'direct') {
      // Carry "(3)" across only onto a whole-section target.
      if (row.newSection && !row.newSection.includes('(')) {
        return toolResult(row, section, row.newSection + section.slice(p.length), p);
      }
      if (row.newSection) return notVerifiedOld(meta, section);
    }
    return toolResult(row, section, row.newSection, p);
  }
  return notVerifiedOld(meta, section);
}

/** T-371: new → old for the converter. Null only for a code that is not BNS, BNSS or BSA. */
export function mapNewForTool(sectionRaw: string, code: string): ToolReverseMapping[] | null {
  const resolved = resolveCode(code);
  if (!resolved || !NEW_CODES.has(resolved)) return null;
  const meta = metaFor(resolved);
  if (!meta) return null;
  const section = normaliseSection(sectionRaw);
  const { reverse } = getSignedTables();
  const exact = reverse.get(`${resolved}:${section}`);
  if (!exact || exact.length === 0) {
    // T-371 Addendum 1 point 6: a bare section with only sub-section rows ("103" →
    // 103(1), 103(2) …) lists those rows, each with its own label.
    const prefix = `${resolved}:${section}(`;
    const children = [...reverse.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
      .flatMap(([, rows]) => rows.map((row) => reverseResult(row, row.newSection ?? section)));
    if (children.length > 0) return children;
  }
  const rows = exact;
  if (!rows || rows.length === 0) {
    return [
      {
        new_code: meta.new_code,
        new_code_full: meta.new_code_full,
        new_section: section,
        old_code: meta.old_code,
        old_code_full: meta.old_code_full,
        old_section: '',
        old_title: '',
        new_title: null,
        mapping_type: 'unverified',
        found: false,
        not_verified: true,
        label: NOT_VERIFIED,
      },
    ];
  }
  return rows.map((doc) => reverseResult(doc, section));
}

function reverseResult(doc: SectionRow, section: string): ToolReverseMapping {
  const caveat = doc.newCode === 'BNS' ? caveatForBnsSection(section) : undefined;
  return {
    new_code: doc.newCode,
    new_code_full: doc.newCodeFull,
    new_section: section,
    old_code: doc.oldCode,
    old_code_full: doc.oldCodeFull,
    old_section: doc.oldSection,
    old_title: doc.oldTitle,
    new_title: doc.newTitle,
    mapping_type: doc.mappingType,
    notes: doc.notes || undefined,
    found: true,
    not_verified: false,
    label: MAPPING_TYPE_LABELS[doc.mappingType] ?? null,
    ...(caveat ? { caveat } : {}),
  };
}

export type ToolQueryResult =
  | { direction: 'old_to_new'; result: ToolMapping }
  | { direction: 'new_to_old'; results: ToolReverseMapping[] }
  | { error: string };

/** Shown when a converter query has no code the tables cover. */
/** Ajay (CLO), T-371 Addendum 1 point 5. */
export const ADD_THE_CODE =
  'Enter a section number and its code, for example IPC 302 or BNS 103(1).';

/**
 * T-371: the converter's free-text lookup ("302 IPC", "IPC 302", "BNS 318(4)",
 * "65B Evidence Act"), read with readToolSections. The first section read is looked up.
 */
export function mapQueryForTool(query: string): ToolQueryResult {
  const read = readToolSections(query)[0];
  // The T-277 reader drops what is never a section (4+ digit runs, dates). A query
  // like "9999 IPC" is still a section to report as NOT_VERIFIED, so read the plain
  // "<number> <code>" / "<code> <number>" forms as a fallback.
  const entry: { number: string; code: string | undefined } | undefined = read
    ? { number: read.number, code: read.code ? TABLE_CODE[read.code] : undefined }
    : plainQuery(query);
  const code = entry?.code;
  if (!entry || !code) return { error: ADD_THE_CODE };
  if (OLD_CODES.has(code)) {
    const result = mapOldForTool(entry.number, code);
    return result ? { direction: 'old_to_new', result } : { error: ADD_THE_CODE };
  }
  const results = mapNewForTool(entry.number, code);
  return results ? { direction: 'new_to_old', results } : { error: ADD_THE_CODE };
}

function plainQuery(query: string): { number: string; code: string | undefined } | undefined {
  const q = query.trim();
  const numberFirst = q.match(/^(\d+[A-Za-z]{0,2}(?:\([0-9A-Za-z]+\))*)[\s-]+(.+)$/);
  if (numberFirst)
    return { number: numberFirst[1], code: resolveCode(numberFirst[2]) ?? undefined };
  const codeFirst = q.match(/^(.+?)[\s-]+(\d+[A-Za-z]{0,2}(?:\([0-9A-Za-z]+\))*)$/);
  if (codeFirst) return { number: codeFirst[2], code: resolveCode(codeFirst[1]) ?? undefined };
  return undefined;
}

// ── Bulk converter ───────────────────────────────────────────────────────────

export interface ToolReference {
  /** The reference as read, e.g. "420 IPC". */
  original: string;
  old_code: string;
  old_section: string;
  new_code: string;
  new_section: string | null;
  mapping_type: MappingType;
  /** True when the text now carries the new section. */
  converted: boolean;
  not_verified: boolean;
  /** NOT_VERIFIED, the signed badge, or null. */
  label: string | null;
  caveat?: string;
  via_parent?: string;
}

export interface ToolConversion {
  converted: string;
  conversions: Array<{ original: string; replacement: string }>;
  references: ToolReference[];
}

const NUM = String.raw`\d{1,3}[A-Z]{0,2}(?:\([0-9A-Za-z]+\))*`;
const SEP = String.raw`(?:\s*(?:,|&|\/)\s*(?:and\s+)?|\s+(?:and|or)\s+)`;
const OLD_CODE_NAME = String.raw`I\.?P\.?C\.?|Cr\.?\s?P\.?\s?C\.?|I\.?E\.?A\.?|Indian\s+Penal\s+Code|Code\s+of\s+Criminal\s+Procedure|(?:Indian\s+)?Evidence\s+Act`;
/** A run of section numbers ending in an old-law code: "Sections 420, 406 and 120B IPC". */
const OLD_CITATION = new RegExp(
  String.raw`(?:(?:Sections?|Secs?\.?|Ss?\.|u\/s\.?)\s*)?${NUM}(?:${SEP}${NUM})*\s+(?:of\s+)?(?:the\s+)?(?:${OLD_CODE_NAME})(?![A-Za-z])`,
  'gi',
);

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * T-371 / T-360: the bulk converter, for the /convert route and the web bulk tab only.
 * Reads lists ("Sections 420, 406 and 120B IPC") and "Evidence Act" with
 * readToolSections, and labels every reference, converted or not. Drafts keep
 * convertOldReferencesInText unchanged.
 */
export function convertReferencesForTool(text: string): ToolConversion {
  const references: ToolReference[] = [];
  const conversions: ToolConversion['conversions'] = [];
  const spans: Array<{ index: number; text: string; replacement: string | null }> = [];

  for (const m of text.matchAll(OLD_CITATION)) {
    const spanText = m[0];
    const refs: Array<{ number: string; result: ToolMapping }> = [];
    for (const e of readToolSections(spanText)) {
      const code = e.code ? TABLE_CODE[e.code] : undefined;
      if (!code || !OLD_CODES.has(code)) continue;
      const result = mapOldForTool(e.number, code);
      if (result) refs.push({ number: e.number, result });
    }
    if (refs.length === 0) continue;

    for (const { number, result: r } of refs) {
      references.push({
        original: `${number} ${r.old_code}`,
        old_code: r.old_code,
        old_section: r.old_section,
        new_code: r.new_code,
        new_section: r.new_section,
        mapping_type: r.mapping_type,
        converted: r.new_section !== null,
        not_verified: r.not_verified,
        label: r.label,
        ...(r.caveat ? { caveat: r.caveat } : {}),
        ...(r.via_parent ? { via_parent: r.via_parent } : {}),
      });
    }

    // Leave the span as written unless at least one reference converts.
    if (!refs.some((x) => x.result.new_section !== null)) continue;
    const replacement = joinList(
      refs.map(({ number, result: r }) =>
        r.new_section !== null
          ? `Section ${r.new_section} ${r.new_code} (formerly ${number} ${r.old_code})`
          : `Section ${number} ${r.old_code}`,
      ),
    );
    spans.push({ index: m.index ?? 0, text: spanText, replacement });
    conversions.push({ original: spanText, replacement });
  }

  let converted = text;
  for (let i = spans.length - 1; i >= 0; i--) {
    const s = spans[i];
    if (s.replacement === null) continue;
    converted =
      converted.slice(0, s.index) + s.replacement + converted.slice(s.index + s.text.length);
  }
  return { converted, conversions, references };
}

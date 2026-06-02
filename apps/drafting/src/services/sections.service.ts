import bnsOffencesJson from '../config/bns-offences.json';
import logger from '../config/logger';
import { ISectionMapping, MappingType, SectionMapping } from '../models/SectionMapping.model';
import { cacheHGet, cacheHSetBulk, cacheDel, cacheSet, cacheExists } from '../utils/cache';

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

// ── Redis cache ─────────────────────────────────────────────────────────────
// Mappings change rarely (CLO validation only). Cache all active mappings in
// Redis for fast lookup across service instances. TTL = 1 hour; refreshed on
// startup + explicit invalidation.

const CACHE_PREFIX = 'sections';
const FORWARD_HASH = `${CACHE_PREFIX}:forward`; // HSET field = oldCode:oldSection
const REVERSE_HASH = `${CACHE_PREFIX}:reverse`; // HSET field = newCode:newSection
const LOADED_KEY = `${CACHE_PREFIX}:loaded_at`;
const CACHE_TTL = 3600; // 1 hour

async function isCacheLoaded(): Promise<boolean> {
  return cacheExists(LOADED_KEY);
}

export async function refreshCache(): Promise<void> {
  const docs = await SectionMapping.find({ isActive: true }).lean<ISectionMapping[]>();

  // Build forward and reverse maps in memory
  const forwardMap = new Map<string, ISectionMapping>();
  const reverseMap = new Map<string, ISectionMapping[]>();

  for (const doc of docs) {
    if (!doc.isNewProvision) {
      forwardMap.set(`${doc.oldCode}:${doc.oldSection}`, doc);
    }
    if (doc.newSection) {
      const rKey = `${doc.newCode}:${doc.newSection}`;
      const existing = reverseMap.get(rKey) ?? [];
      existing.push(doc);
      reverseMap.set(rKey, existing);
    }
  }

  // Write to Redis using the generic bulk utility
  await cacheHSetBulk(FORWARD_HASH, forwardMap, CACHE_TTL);
  await cacheHSetBulk(REVERSE_HASH, reverseMap, CACHE_TTL);
  await cacheSet(LOADED_KEY, new Date().toISOString(), CACHE_TTL);

  logger.info({ count: docs.length }, 'Section mappings cached in Redis');
}

async function ensureCache(): Promise<void> {
  const loaded = await isCacheLoaded();
  if (!loaded) await refreshCache();
}

export async function invalidateCache(): Promise<void> {
  await cacheDel(FORWARD_HASH, REVERSE_HASH, LOADED_KEY);
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

  await ensureCache();
  const doc = await cacheHGet<ISectionMapping>(FORWARD_HASH, `${resolvedCode}:${section}`);
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

  await ensureCache();
  const docs = await cacheHGet<ISectionMapping[]>(REVERSE_HASH, `${resolvedCode}:${section}`);
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
 * Get all mappings for a given code pair.
 */
export async function getAllMappings(code: string): Promise<{
  meta: CodeMeta;
  mappings: ISectionMapping[];
  newProvisions: ISectionMapping[];
} | null> {
  const resolved = resolveCode(code);
  if (!resolved) return null;

  // Determine query: if old code, query by oldCode; if new code, query by newCode
  const filter: Record<string, unknown> = { isActive: true };
  if (OLD_CODES.has(resolved)) {
    filter.oldCode = resolved;
  } else if (NEW_CODES.has(resolved)) {
    filter.newCode = resolved;
  } else {
    return null;
  }

  const docs = await SectionMapping.find(filter).sort({ oldSection: 1 }).lean<ISectionMapping[]>();
  if (docs.length === 0) return null;

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

// ── Section details (SCRUM-83 — rich result card) ──────────────────────────

/**
 * Triable-by inferred from punishment severity per BNSS scheduling rules.
 * Offences with max imprisonment > 7 years go to Sessions; the rest are
 * Magistrate-triable. Sentinel `max_years === 99` (life / death) → Sessions.
 */
function inferTriableBy(maxYears: number | undefined): 'Sessions' | 'Magistrate' | 'Tribunal' {
  if (typeof maxYears !== 'number') return 'Magistrate';
  if (maxYears > 7) return 'Sessions';
  return 'Magistrate';
}

export interface SectionDetail {
  code: string;
  section: string;
  title: string;
  statute: string;
  chapter: string | null;
  bailable: boolean | null;
  cognizable: boolean | null;
  compoundable: 'yes' | 'no' | 'with_permission' | null;
  triable_by: 'Sessions' | 'Magistrate' | 'Tribunal' | null;
  punishment: string | null;
  max_years: number | null;
  ingredients: string[];
  bare_section_text: string | null;
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

interface BnsOffenceMeta {
  title?: string;
  punishment?: string;
  max_years?: number;
  bailable?: boolean;
  cognizable?: boolean;
  compoundable?: boolean | 'with_permission';
  chapter?: string;
}

const BNS_OFFENCES: Record<string, BnsOffenceMeta> =
  (bnsOffencesJson as { offences: Record<string, BnsOffenceMeta> }).offences ?? {};

function compoundableLabel(
  raw: boolean | 'with_permission' | undefined,
): 'yes' | 'no' | 'with_permission' | null {
  if (raw === undefined) return null;
  if (raw === 'with_permission') return 'with_permission';
  return raw ? 'yes' : 'no';
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
  const offence =
    offenceCode === 'BNS' && offenceSection ? BNS_OFFENCES[offenceSection] : undefined;

  // Title — prefer the offence metadata, fall back to the mapping doc, then ''.
  const title = offence?.title ?? (isNew ? mapping?.new_title : mapping?.old_title) ?? '';

  // Related sections — derive from same BNS chapter when offence metadata
  // is available. Skipped for old codes / non-BNS for now.
  const related: SectionDetail['related'] = [];
  if (offence?.chapter && offenceCode === 'BNS' && offenceSection) {
    for (const [secKey, meta] of Object.entries(BNS_OFFENCES)) {
      if (secKey === offenceSection) continue;
      if (meta.chapter !== offence.chapter) continue;
      related.push({ code: 'BNS', section: secKey, title: meta.title ?? '' });
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
    compoundable: compoundableLabel(offence?.compoundable),
    triable_by: offence ? inferTriableBy(offence.max_years) : null,
    punishment: offence?.punishment ?? null,
    max_years: typeof offence?.max_years === 'number' ? offence.max_years : null,
    // Ingredients + bare section text are not yet authored in bns-offences.json.
    // Filed as CLO follow-up; UI renders empty list / null gracefully.
    ingredients: [],
    bare_section_text: null,
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
  const sectionFilter = { $regex: `^${escaped}`, $options: 'i' };
  const titleFilter = { $regex: escaped, $options: 'i' };

  const codeFilter: Record<string, unknown> = isNew ? { newCode: resolved } : { oldCode: resolved };
  const fieldNamePrefix = isNew ? 'new' : 'old';

  // Two-stage search so prefix hits always win against title-only hits when we
  // cap at `limit` results.
  const prefixDocs = await SectionMapping.find({
    isActive: true,
    ...codeFilter,
    [`${fieldNamePrefix}Section`]: sectionFilter,
  })
    .limit(limit)
    .lean<ISectionMapping[]>();

  let docs = prefixDocs;
  if (docs.length < limit) {
    const remaining = limit - docs.length;
    const seenIds = new Set(docs.map((d) => String(d._id)));
    const titleDocs = await SectionMapping.find({
      isActive: true,
      ...codeFilter,
      [`${fieldNamePrefix}Title`]: titleFilter,
    })
      .limit(remaining + docs.length) // pad so we can dedupe
      .lean<ISectionMapping[]>();
    for (const d of titleDocs) {
      if (docs.length >= limit) break;
      if (seenIds.has(String(d._id))) continue;
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

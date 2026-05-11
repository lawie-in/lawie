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

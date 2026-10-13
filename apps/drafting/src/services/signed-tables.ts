/**
 * Signed legal tables, served from memory — T-371 (ADR-025 D2, Arjun, 13 Oct 2026).
 *
 * The ONE loader of the signed section files. Each file is read once, as raw bytes;
 * the SHA-256 of those bytes is what GET /health reports, and the same bytes are
 * parsed and served. No Mongo, no Redis: a table change ships with the file, and no
 * reseed is needed.
 *
 * Loads lazily on first use, so importing app.ts without index.ts (the tests) works.
 * index.ts calls loadSignedTables() at boot so a missing or unreadable file fails
 * fast before the service listens.
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';

import type { MappingType } from '../models/SectionMapping.model';

/** Paths relative to src/config (dist/config after build). Keys are what /health shows. */
export const SIGNED_TABLE_FILES = {
  ipcToBns: 'sections/ipc-to-bns.json',
  crpcToBnss: 'sections/crpc-to-bnss.json',
  ieaToBsa: 'sections/iea-to-bsa.json',
  bnsOffences: 'bns-offences.json',
  bnsTriableBy: 'bns-triable-by.json',
} as const;

export type SignedTableName = keyof typeof SIGNED_TABLE_FILES;

const CONFIG_DIR = path.resolve(__dirname, '../config');

// ── Mapping-file shape (config/sections/*.json) ──────────────────────────────

export interface MappingFileMeta {
  old_code: string;
  old_code_full: string;
  new_code: string;
  new_code_full: string;
  effective_date: string;
  validated_by: string;
  last_updated: string;
}

export interface MappingFileRow {
  new: string | null;
  old_title: string;
  new_title: string | null;
  type: string;
  notes?: string;
  // CrPC rows use `note` (singular); read it when `notes` is absent.
  note?: string;
  // repealed_no_equivalent rows carry their reason here.
  new_law_status?: string;
  /** Internal working note. Never served. */
  verify?: string;
}

export interface MappingFile {
  meta: MappingFileMeta;
  mappings: Record<string, MappingFileRow>;
  new_provisions: Record<string, { title: string; notes: string }>;
}

/**
 * One served row. Same field names as the retired SectionMapping documents, so the
 * /sections/all and /sections/codes payloads keep their shape.
 */
export interface SectionRow {
  oldCode: string;
  oldCodeFull: string;
  newCode: string;
  newCodeFull: string;
  oldSection: string;
  newSection: string | null;
  oldTitle: string;
  newTitle: string | null;
  mappingType: MappingType;
  notes: string;
  effectiveDate: Date;
  validatedBy: string;
  validatedAt: Date | null;
  isActive: boolean;
  isNewProvision: boolean;
}

// ── Row logic copied from scripts/seed-sections.ts (notesFor / validationFor) ──

/**
 * Tables Ajay (CLO) has signed row by row (T-250, T-255, T-267), keyed by meta.old_code.
 * Only these carry validatedBy (meta.validated_by) and validatedAt (meta.last_updated).
 * Rows from any other table get "Pending CLO review" and validatedAt null.
 * Explicit list: do not infer a signature from the meta text.
 */
const SIGNED_TABLES = new Set(['IPC', 'CrPC', 'IEA']);
const PENDING_CLO_REVIEW = 'Pending CLO review';

function validationFor(meta: MappingFileMeta): { validatedBy: string; validatedAt: Date | null } {
  if (SIGNED_TABLES.has(meta.old_code)) {
    return { validatedBy: meta.validated_by, validatedAt: new Date(meta.last_updated) };
  }
  return { validatedBy: PENDING_CLO_REVIEW, validatedAt: null };
}

/**
 * Ajay (CLO), T-267 ruling A: unverified rows never carry a guessed section.
 * The row's `verify` text is internal and is never served.
 */
export const UNVERIFIED_NOTE = 'Not verified. Check the Gazette before citing a BNS section.';

function notesFor(mapping: MappingFileRow): string {
  if (mapping.type === 'unverified') return UNVERIFIED_NOTE;
  const notes = mapping.notes ?? mapping.note;
  if (notes !== undefined) return notes;
  // Ajay approved new_law_status as the note only for rows with no equivalent.
  if (mapping.type === 'repealed_no_equivalent') return mapping.new_law_status ?? '';
  return '';
}

function rowsOf(file: MappingFile): SectionRow[] {
  const { meta } = file;
  const validation = validationFor(meta);
  const effectiveDate = new Date(meta.effective_date);
  const rows: SectionRow[] = [];
  for (const [oldSection, m] of Object.entries(file.mappings)) {
    rows.push({
      oldCode: meta.old_code,
      oldCodeFull: meta.old_code_full,
      newCode: meta.new_code,
      newCodeFull: meta.new_code_full,
      oldSection,
      newSection: m.new,
      oldTitle: m.old_title,
      newTitle: m.new_title,
      mappingType: m.type as MappingType,
      notes: notesFor(m),
      effectiveDate,
      ...validation,
      isActive: true,
      isNewProvision: false,
    });
  }
  for (const [newSection, p] of Object.entries(file.new_provisions ?? {})) {
    rows.push({
      oldCode: meta.old_code,
      oldCodeFull: meta.old_code_full,
      newCode: meta.new_code,
      newCodeFull: meta.new_code_full,
      oldSection: `NEW-${newSection}`,
      newSection,
      oldTitle: 'No equivalent in old code',
      newTitle: p.title,
      mappingType: 'direct',
      notes: p.notes,
      effectiveDate,
      ...validation,
      isActive: true,
      isNewProvision: true,
    });
  }
  return rows;
}

// ── Loaded state ─────────────────────────────────────────────────────────────

export interface MappingTable {
  meta: MappingFileMeta;
  /** Regular rows then new provisions, in file order. */
  rows: SectionRow[];
}

export interface SignedTables {
  /** File (as in SIGNED_TABLE_FILES) → SHA-256 hex of the raw bytes served. */
  sha256: Record<string, string>;
  /** Raw parsed JSON per table. */
  raw: Record<SignedTableName, unknown>;
  /** Mapping tables keyed by old code: IPC, CrPC, IEA. */
  mappingTables: MappingTable[];
  /** `${oldCode}:${oldSection}` → regular row. */
  forward: Map<string, SectionRow>;
  /** `${newCode}:${newSection}` → rows (regular and new provisions), file order. */
  reverse: Map<string, SectionRow[]>;
}

let loaded: SignedTables | null = null;

function readTable(file: string): { sha256: string; json: unknown } {
  const full = path.join(CONFIG_DIR, file);
  let bytes: Buffer;
  try {
    bytes = readFileSync(full);
  } catch (err) {
    throw new Error(
      `Signed table missing or unreadable: ${file} (${full}): ${(err as Error).message}`,
    );
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  try {
    return { sha256, json: JSON.parse(bytes.toString('utf8')) };
  } catch (err) {
    throw new Error(`Signed table is not valid JSON: ${file}: ${(err as Error).message}`);
  }
}

/** Read every signed file once. Throws on a missing or invalid file (boot fails fast). */
export function loadSignedTables(): SignedTables {
  if (loaded) return loaded;
  const sha256: Record<string, string> = {};
  const raw = {} as Record<SignedTableName, unknown>;
  for (const [name, file] of Object.entries(SIGNED_TABLE_FILES) as Array<
    [SignedTableName, string]
  >) {
    const t = readTable(file);
    sha256[file] = t.sha256;
    raw[name] = t.json;
  }

  const mappingTables: MappingTable[] = (['ipcToBns', 'crpcToBnss', 'ieaToBsa'] as const).map(
    (name) => {
      const file = raw[name] as MappingFile;
      if (!file?.meta || !file.mappings) {
        throw new Error(`Signed table has no meta or mappings: ${SIGNED_TABLE_FILES[name]}`);
      }
      return { meta: file.meta, rows: rowsOf(file) };
    },
  );

  const forward = new Map<string, SectionRow>();
  const reverse = new Map<string, SectionRow[]>();
  for (const table of mappingTables) {
    for (const row of table.rows) {
      if (!row.isNewProvision) forward.set(`${row.oldCode}:${row.oldSection}`, row);
      if (row.newSection) {
        const key = `${row.newCode}:${row.newSection}`;
        const list = reverse.get(key) ?? [];
        list.push(row);
        reverse.set(key, list);
      }
    }
  }

  loaded = { sha256, raw, mappingTables, forward, reverse };
  return loaded;
}

/** The loaded tables (loads on first call). */
export function getSignedTables(): SignedTables {
  return loaded ?? loadSignedTables();
}

/** File → SHA-256 of the served bytes, for GET /health. */
export function signedTableHashes(): Record<string, string> {
  return { ...getSignedTables().sha256 };
}

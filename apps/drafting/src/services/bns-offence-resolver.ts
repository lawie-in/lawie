/**
 * BNS offence resolver — T-277.
 *
 * The single reader of `config/bns-offences.json` (Ajay's signed table, 12 Oct 2026).
 * bail-check, timeline, sections, preflight, validator and template-engine all go
 * through this module so their answers cannot drift apart.
 *
 * Ajay's rulings (T-277):
 * - R1: only an EXACT-key row's max_years may drive a BNSS s.187 default-bail period.
 * - R2: resolve a target to its exact key; else to its parent row (drop the trailing
 *   "(…)" group, repeatedly). A parent with `variants` uses the variant for the target;
 *   if none matches, the target is a definition sub-section and creates no offence.
 * - R3: a null attribute, or a variant string other than exactly "yes"/"no", is
 *   "Depends. Check the First Schedule." and never false.
 *
 * T-289 (Ajay, signed 12 Oct 2026): the court comes ONLY from
 * `config/bns-triable-by.json` (BNSS First Schedule, column 6, as printed). It is
 * never derived from the term.
 */
// T-371: read through the shared signed-table loader, so the bytes hashed in /health
// are the bytes served here.
import { getSignedTables } from './signed-tables';

// ── Ajay's texts (exact strings, T-277) ──────────────────────────────────────

/** R3: shown for a null / non-"yes"/"no" bailable, cognizable or compoundable. */
export const DEPENDS_FIRST_SCHEDULE = 'Depends. Check the First Schedule.';
/** R2: a target with no row, or a definition sub-section of a row with variants. */
export const NOT_AN_OFFENCE = 'This section does not create an offence. Check the Gazette.';
/** Q7: the one display text for "yes (with Court permission)" ('with_permission'). */
export const WITH_COURT_PERMISSION = "Compoundable with the Court's permission";
/** R1: no default-bail period can be given. */
export const DEPENDS_BNSS_187 = 'Depends on the offence. Check BNSS section 187.';

// ── Table types ──────────────────────────────────────────────────────────────

export interface BnsOffenceVariant {
  offence: string;
  punishment: string;
  cognizable: string;
  bailable: string;
  compoundable: string;
}

export interface BnsOffenceRow {
  title: string;
  punishment: string;
  max_years: number | null;
  bailable: boolean | null;
  cognizable: boolean | null;
  compoundable: boolean | null;
  chapter: string;
  verify?: string;
  variants?: Record<string, BnsOffenceVariant>;
}

const OFFENCES: Readonly<Record<string, BnsOffenceRow>> = (
  getSignedTables().raw.bnsOffences as unknown as { offences: Record<string, BnsOffenceRow> }
).offences;

/** Every row key in the table, in file order. */
export const BNS_OFFENCE_KEYS: readonly string[] = Object.keys(OFFENCES);

export function getOffenceRow(key: string): BnsOffenceRow | undefined {
  return Object.prototype.hasOwnProperty.call(OFFENCES, key) ? OFFENCES[key] : undefined;
}

// ── Resolution ───────────────────────────────────────────────────────────────

export type ResolutionKind = 'exact' | 'variant' | 'parent' | 'not_an_offence';
export type Compoundable = 'yes' | 'no' | 'with_permission';

export interface ResolvedOffence {
  /** The section as given (whitespace removed). */
  section: string;
  kind: ResolutionKind;
  /** The row key (exact / parent) or variant key used; null when not an offence. */
  key: string | null;
  /** Gazette heading of the (parent) section; null when not an offence. */
  title: string | null;
  /** Variant's offence description (kind 'variant' only). */
  offence?: string;
  punishment: string | null;
  chapter: string | null;
  bailable: boolean | null;
  cognizable: boolean | null;
  compoundable: Compoundable | null;
  /** Only an exact-key row carries max_years (R1). Null otherwise. */
  maxYears: number | null;
  /**
   * Term for the BNSS 480 / 483 choice only (Ajay, T-277 rounds 2 and 7): an exact
   * row's or a parent row's (no variants) max_years. Never drives the default-bail
   * period, bailable, cognizable or the court (T-289). Null for variants and
   * non-offences.
   */
  courtMaxYears: number | null;
  /**
   * T-289: the court by which the offence is triable, as printed in the First
   * Schedule (`bns-triable-by.json`). Null = "Depends on the offence. Check the
   * First Schedule." Null for non-offences.
   */
  triableBy: string | null;
  /** DEPENDS_FIRST_SCHEDULE when bailable is null, else null. */
  bailableNote: string | null;
  /** DEPENDS_FIRST_SCHEDULE when cognizable is null, else null. */
  cognizableNote: string | null;
  /** DEPENDS_FIRST_SCHEDULE when null; WITH_COURT_PERMISSION when 'with_permission'. */
  compoundableNote: string | null;
  /** The table's verify note for the row, when present. */
  verify?: string;
  /** NOT_AN_OFFENCE for kind 'not_an_offence'. */
  note?: string;
}

/** Strip whitespace and lowercase inside parentheses: "238 (B)" → "238(b)". */
export function normaliseBnsSection(raw: string): string {
  return raw.replace(/\s+/g, '').replace(/\([^()]*\)/g, (g) => g.toLowerCase());
}

/** "61(2)(a)" → "61(2)"; "316" → null. */
export function parentSection(section: string): string | null {
  const m = section.match(/^(.+)\([^()]*\)$/);
  return m ? m[1] : null;
}

export interface BnsKeyResolution {
  /** The exact row key, or the nearest ancestor row key. */
  key: string;
  /** True when the section is itself a row key. */
  exact: boolean;
}

/**
 * Arjun (CTO) condition: try the exact key; else strip trailing "(…)" groups one at
 * a time and retry on the parent. Returns null when no row and no parent row exist.
 * Pure key lookup: it never consults `variants`, so it cannot widen a match beyond
 * a parent lookup.
 */
export function resolveBnsKey(raw: string): BnsKeyResolution | null {
  const section = normaliseBnsSection(raw);
  if (!section) return null;
  if (getOffenceRow(section)) return { key: section, exact: true };
  let parent = parentSection(section);
  while (parent) {
    if (getOffenceRow(parent)) return { key: parent, exact: false };
    parent = parentSection(parent);
  }
  return null;
}

// ── Court by which triable (T-289, Ajay signed 12 Oct 2026) ───────────────────

/** First Schedule column 6 values that rank a multi-section result (Ajay, T-289 rule 4). */
export const COURT_OF_SESSION = 'Court of Session';
export const MAGISTRATE_FIRST_CLASS = 'Magistrate of the first class';
export const ANY_MAGISTRATE = 'Any Magistrate';

export interface BnsTriableByRow {
  /** As printed; null = Depends (parts differ, or no line in the Schedule). */
  triable_by: string | null;
  verify?: string;
  /** Sub-section → court as printed; a null value is Depends. */
  variants?: Record<string, string | null>;
  /** Parts differ but are not keyed by sub-section: display only, never resolved. */
  lines?: string[];
}

const TRIABLE_BY: Readonly<Record<string, BnsTriableByRow>> = (
  getSignedTables().raw.bnsTriableBy as unknown as { offences: Record<string, BnsTriableByRow> }
).offences;

function getTriableByRow(key: string): BnsTriableByRow | undefined {
  return Object.prototype.hasOwnProperty.call(TRIABLE_BY, key) ? TRIABLE_BY[key] : undefined;
}

/**
 * Ajay (T-289 rule 3, resolving as T-277 rule 3): the exact key's value; else the
 * nearest parent row's. A parent with `variants` gives the sub-section's value (the
 * target or a stripped form of it); no matching sub-section, or a null value, is
 * null. `lines` are never resolved: such a row's own value (null) applies.
 * Resolved against bns-triable-by.json's own rows and variants, which differ from
 * bns-offences.json's. Never derived from the term.
 */
export function resolveTriableBy(raw: string): string | null {
  const section = normaliseBnsSection(raw);
  if (!section) return null;
  const exact = getTriableByRow(section);
  if (exact) return exact.triable_by;
  for (let parent = parentSection(section); parent; parent = parentSection(parent)) {
    const row = getTriableByRow(parent);
    if (!row) continue;
    if (!row.variants) return row.triable_by;
    for (let k: string | null = section; k && k !== parent; k = parentSection(k)) {
      if (Object.prototype.hasOwnProperty.call(row.variants, k)) return row.variants[k];
    }
    return null;
  }
  return null;
}

// ── sections_charged reader (Arjun, T-277 round 4 rule, steps 1-9) ───────────

export type ChargedCode = 'BNS' | 'BNSS' | 'BSA' | 'IPC' | 'CRPC' | 'IEA' | 'OTHER';
export interface ChargedSection {
  /** null = bare: no code stated. Never treated as BNS. */
  code: ChargedCode | null;
  number: string;
  /** True when read from an alias bracket, e.g. the IPC 420 in "BNS 318(4) (IPC 420)". */
  alias?: true;
  /**
   * T-324: on an alias entry, the non-alias entry its bracket belongs to (BNS 318(4)
   * above), recorded before dedupe. Absent when the bracket follows no entry.
   */
  attachedTo?: { code: ChargedCode | null; number: string };
}

/**
 * Ajay Q8 / round 5c: old-law codes, how the line names them, and the new code.
 * Moved here from template-engine (T-278) so template-engine and timeline share one copy.
 */
export const OLD_LAW_LINE: Partial<Record<ChargedCode, { name: string; newCode: string }>> = {
  IPC: { name: 'IPC', newCode: 'BNS' },
  CRPC: { name: 'CrPC', newCode: 'BNSS' },
  IEA: { name: 'IEA', newCode: 'BSA' },
};

/** Step 3: code names (case-insensitive; specific names before the generic "… Act"). */
const CODE_NAMES: Array<[ChargedCode, string]> = [
  ['BNSS', String.raw`\bb\.?n\.?s\.?s\b\.?|\bbharatiya\s+nagarik\s+suraksha\s+sanhita\b`],
  ['BSA', String.raw`\bb\.?s\.?a\b\.?|\bbharatiya\s+sakshya\s+adhiniyam\b`],
  ['BNS', String.raw`\bb\.?n\.?s\b\.?|\bbharatiya\s+nyaya\s+sanhita\b`],
  ['IPC', String.raw`\bi\.?p\.?c\b\.?|\bindian\s+penal\s+code\b`],
  ['CRPC', String.raw`\bcr\.?\s?p\.?\s?c\b\.?|\bcode\s+of\s+criminal\s+procedure\b`],
  ['IEA', String.raw`\bi\.?e\.?a\b\.?|\bindian\s+evidence\s+act\b`],
  ['OTHER', String.raw`\b[a-z][a-z.&-]*\s+act\b`],
];
const CODE_ANY = new RegExp(CODE_NAMES.map(([, src]) => `(${src})`).join('|'), 'gi');
const CODE_TEST = new RegExp(CODE_ANY.source, 'i');

/** Step 4: 1-3 digits, an optional capital letter, then attached brackets. */
const NUMBER = /(?<![0-9A-Za-z])\d{1,3}(?:[A-Z](?![A-Za-z]))?(?:\([0-9A-Za-z]+\))*(?![0-9])/g;
/** Step 6: top-level separators and read-with markers. */
const SEGMENT_SPLIT = /,|;|&|\band\b|\br\/w\b|\br\.\s?w\.?|\brw\b|\bread\s+with\b/i;
const MONTH = String.raw`(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?`;
const NEVER_A_SECTION: RegExp[] = [
  // 2(a) dates, and the date words after "dated" / "on"
  /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g,
  new RegExp(
    String.raw`\b(?:dated|on)\s+(?:\d{1,2}(?:st|nd|rd|th)?\s+${MONTH},?(?:\s+\d{2,4})?|${MONTH}\s+\d{1,2}(?:st|nd|rd|th)?,?(?:\s+\d{2,4})?)`,
    'gi',
  ),
  // 2(b) FIR / Crime No. / Case No. / No. + digits, optional /year
  /\b(?:fir|crime\s*no\.?|case\s*no\.?|no\.)\s*(?:no\.?\s*)?\d+(?:\s*\/\s*\d{2,4})?/gi,
  // 2(c) any run of 4 or more digits
  /\d{4,}/g,
];

function codeOf(match: RegExpExecArray): ChargedCode {
  const i = match.slice(1).findIndex((g) => g !== undefined);
  return CODE_NAMES[i][0];
}

/** Index of the ")" closing the "(" at `open`, or the end of the text. */
function closingBracket(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return i;
  }
  return text.length;
}

type Token =
  | { at: number; kind: 'code'; code: ChargedCode }
  | { at: number; kind: 'alias'; entries: ChargedSection[] }
  | { at: number; kind: 'number'; number: string; bare: boolean };

function readList(text: string): ChargedSection[] {
  // Step 5: detached brackets are alias lists (with a code name) or comments.
  const aliases: ChargedSection[][] = [];
  let outer = '';
  for (let i = 0; i < text.length; ) {
    if (text[i] !== '(') {
      outer += text[i++];
      continue;
    }
    const close = closingBracket(text, i);
    const attached = i > 0 && /[0-9A-Za-z)]/.test(text[i - 1]);
    const inner = text.slice(i + 1, close);
    if (attached) outer += text.slice(i, close + 1);
    else if (CODE_TEST.test(inner)) {
      aliases.push(readList(inner));
      outer += ` \uE000${'x'.repeat(aliases.length)}\uE000 `;
    } else outer += ' ';
    i = close + 1;
  }

  const entries: Array<{
    code: ChargedCode | null;
    number: string;
    alias: boolean;
    /** T-324: alias only: index of the non-alias entry the bracket belongs to. */
    owner?: number;
    /** T-324: alias only: an owner already recorded by a nested bracket. */
    attachedTo?: ChargedSection['attachedTo'];
  }> = [];
  let carry: ChargedCode | null = null;
  let crossPending: number[] = [];
  // T-324: the latest non-alias entry; an alias bracket belongs to it.
  let lastEntry: number | undefined;

  // Step 6/7: segments; a code before numbers carries forward, a code after
  // numbers applies back within its segment (and to the start, before any code).
  for (const segment of outer.split(SEGMENT_SPLIT)) {
    const tokens: Token[] = [];
    for (const m of segment.matchAll(/\uE000(x+)\uE000/g)) {
      tokens.push({ at: m.index ?? 0, kind: 'alias', entries: aliases[m[1].length - 1] });
    }
    for (const m of segment.matchAll(CODE_ANY)) {
      tokens.push({ at: m.index ?? 0, kind: 'code', code: codeOf(m) });
    }
    for (const m of segment.matchAll(NUMBER)) {
      const at = m.index ?? 0;
      // "IPC 302/34": a number written straight after "/" is bare.
      tokens.push({ at, kind: 'number', number: m[0], bare: segment[at - 1] === '/' });
    }
    tokens.sort((a, b) => a.at - b.at);

    let segPending: number[] = [];
    let segHasCode = false;
    for (const t of tokens) {
      if (t.kind === 'code') {
        for (const i of segPending) entries[i].code = t.code;
        if (carry === null) for (const i of crossPending) entries[i].code = t.code;
        segPending = [];
        crossPending = [];
        segHasCode = true;
        carry = t.code;
      } else if (t.kind === 'alias') {
        for (const e of t.entries) {
          entries.push({
            code: e.code,
            number: e.number,
            alias: true,
            owner: lastEntry,
            attachedTo: e.attachedTo,
          });
        }
      } else if (t.bare) {
        lastEntry = entries.push({ code: null, number: t.number, alias: false }) - 1;
      } else {
        const i = entries.push({ code: carry, number: t.number, alias: false }) - 1;
        lastEntry = i;
        if (!segHasCode) segPending.push(i);
        if (carry === null) crossPending.push(i);
      }
    }
  }
  // Owners are resolved here, after every code (including one applied back) is set.
  return entries.map(({ code, number, alias, owner, attachedTo }) => {
    if (!alias) return { code, number };
    const ownerEntry = owner === undefined ? undefined : entries[owner];
    const at =
      attachedTo ?? (ownerEntry ? { code: ownerEntry.code, number: ownerEntry.number } : undefined);
    return at
      ? { code, number, alias: true as const, attachedTo: at }
      : { code, number, alias: true as const };
  });
}

/**
 * Arjun (CTO), T-277 round 4: the ONE reader of `sections_charged`. Returns
 * `{ code, number }` in first-seen order, deduped on (code, number). A number with
 * no code stated is bare (`code: null`) unless `defaultCode` is given.
 */
export function readSectionsCharged(
  text: string | null | undefined,
  defaultCode?: ChargedCode,
): ChargedSection[] {
  if (!text) return [];
  // Step 1: NFKC, strip zero-width characters, collapse whitespace.
  let clean = text
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Step 2: remove what is never a section.
  for (const re of NEVER_A_SECTION) clean = clean.replace(re, ' ');

  // key → index in `out` of the kept entry.
  const seen = new Map<string, number>();
  const out: ChargedSection[] = [];
  for (const e of readList(clean)) {
    const code = e.code ?? defaultCode ?? null;
    const key = `${code ?? ''}|${e.number}`;
    const kept = seen.get(key);
    if (kept !== undefined) {
      // Step 9. T-324: an alias kept first and a non-alias duplicate later → the
      // kept entry becomes non-alias (no alias, no attachedTo), at the same position.
      if (out[kept].alias && !e.alias) out[kept] = { code, number: e.number };
      continue;
    }
    seen.set(key, out.length);
    if (!e.alias) {
      out.push({ code, number: e.number });
      continue;
    }
    // T-324: carry attachedTo through, its code defaulted as its own entry's is.
    const at = e.attachedTo;
    out.push(
      at
        ? {
            code,
            number: e.number,
            alias: true,
            attachedTo: { code: at.code ?? defaultCode ?? null, number: at.number },
          }
        : { code, number: e.number, alias: true },
    );
  }
  return out;
}

/**
 * Arjun (CTO), correction to step 7: the CALL-SITE rule for a sections_charged
 * value. Array entries from a `source: bns_mapping` field (the BNS picker stores a
 * bare "303") are read one by one with defaultCode 'BNS'; an explicit code in an
 * entry still wins ("302 IPC" → IPC 302). A plain string, or any other field, is
 * read with no default, so a bare number stays bare. readSectionsCharged stays pure.
 */
export function readChargedField(value: unknown, fieldSource?: string): ChargedSection[] {
  const entryText = (v: unknown): string => {
    if (typeof v === 'object' && v !== null) {
      const o = v as { id?: unknown; label?: unknown };
      return String(o.id ?? o.label ?? '');
    }
    return v === null || v === undefined ? '' : String(v);
  };
  const reads = Array.isArray(value)
    ? value.map((v) =>
        readSectionsCharged(entryText(v), fieldSource === 'bns_mapping' ? 'BNS' : undefined),
      )
    : [readSectionsCharged(entryText(value))];
  // key → index in `out` of the kept entry.
  const seen = new Map<string, number>();
  const out: ChargedSection[] = [];
  for (const e of reads.flat()) {
    const key = `${e.code ?? ''}|${e.number}`;
    const kept = seen.get(key);
    if (kept !== undefined) {
      // T-324: an alias kept first and a non-alias duplicate later → the kept entry
      // becomes non-alias (no alias, no attachedTo), at the same position.
      if (out[kept].alias && !e.alias) out[kept] = { code: e.code, number: e.number };
      continue;
    }
    seen.set(key, out.length);
    out.push(e);
  }
  return out;
}

/** R5: a citation passes when it is a row key or has a parent row (definitions included). */
export function citationResolves(raw: string): boolean {
  return resolveBnsKey(raw) !== null;
}

/** R3: only an exact "yes" / "no" becomes true / false. */
function yesNo(value: string): boolean | null {
  if (value === 'yes') return true;
  if (value === 'no') return false;
  return null;
}

/** R3, compoundable: keep sections.service's existing "with_permission" mapping. */
function variantCompoundable(value: string): Compoundable | null {
  if (value === 'yes') return 'yes';
  if (value === 'no') return 'no';
  if (value === 'yes (with Court permission)') return 'with_permission';
  return null;
}

function rowCompoundable(value: boolean | null): Compoundable | null {
  if (value === null) return null;
  return value ? 'yes' : 'no';
}

function notes(
  bailable: boolean | null,
  cognizable: boolean | null,
  compoundable: Compoundable | null,
): Pick<ResolvedOffence, 'bailableNote' | 'cognizableNote' | 'compoundableNote'> {
  return {
    bailableNote: bailable === null ? DEPENDS_FIRST_SCHEDULE : null,
    cognizableNote: cognizable === null ? DEPENDS_FIRST_SCHEDULE : null,
    compoundableNote:
      compoundable === null
        ? DEPENDS_FIRST_SCHEDULE
        : compoundable === 'with_permission'
          ? WITH_COURT_PERMISSION
          : null,
  };
}

function notAnOffence(section: string): ResolvedOffence {
  return {
    section,
    kind: 'not_an_offence',
    key: null,
    title: null,
    punishment: null,
    chapter: null,
    bailable: null,
    cognizable: null,
    compoundable: null,
    maxYears: null,
    courtMaxYears: null,
    triableBy: null,
    // Only Ajay's NOT_AN_OFFENCE text applies; no "Depends" notes.
    bailableNote: null,
    cognizableNote: null,
    compoundableNote: null,
    note: NOT_AN_OFFENCE,
  };
}

function fromRow(
  section: string,
  key: string,
  row: BnsOffenceRow,
  kind: 'exact' | 'parent',
): ResolvedOffence {
  const compoundable = rowCompoundable(row.compoundable);
  return {
    section,
    kind,
    key,
    title: row.title,
    punishment: row.punishment,
    chapter: row.chapter,
    bailable: row.bailable,
    cognizable: row.cognizable,
    compoundable,
    // R1: a parent row's max_years never drives a period.
    maxYears: kind === 'exact' ? row.max_years : null,
    courtMaxYears: row.max_years,
    triableBy: resolveTriableBy(section),
    ...notes(row.bailable, row.cognizable, compoundable),
    ...(row.verify ? { verify: row.verify } : {}),
  };
}

/** R2 target resolution. */
export function resolveOffence(raw: string): ResolvedOffence {
  const section = normaliseBnsSection(raw);
  const hit = resolveBnsKey(section);
  if (!hit) return notAnOffence(section);

  const row = OFFENCES[hit.key];
  if (hit.exact) return fromRow(section, hit.key, row, 'exact');

  if (row.variants) {
    // Check the target, then each stripped form above the row key:
    // 308(2)(a) → 308(2), a variant of row 308.
    let variantKey: string | null = null;
    for (let k: string | null = section; k && k !== hit.key; k = parentSection(k)) {
      if (Object.prototype.hasOwnProperty.call(row.variants, k)) {
        variantKey = k;
        break;
      }
    }
    // R2: parent has variants but no stripped form matches → a definition sub-section.
    if (!variantKey) return notAnOffence(section);
    const variant = row.variants[variantKey];
    const bailable = yesNo(variant.bailable);
    const cognizable = yesNo(variant.cognizable);
    const compoundable = variantCompoundable(variant.compoundable);
    return {
      section,
      kind: 'variant',
      key: variantKey,
      title: row.title,
      offence: variant.offence,
      punishment: variant.punishment,
      chapter: row.chapter,
      bailable,
      cognizable,
      compoundable,
      maxYears: null,
      courtMaxYears: null,
      triableBy: resolveTriableBy(section),
      ...notes(bailable, cognizable, compoundable),
      ...(row.verify ? { verify: row.verify } : {}),
    };
  }

  return fromRow(section, hit.key, row, 'parent');
}

// ── R4 classification lists (generated at load time) ─────────────────────────

export interface BnsClassification {
  bailable: string[];
  non_bailable: string[];
  cognizable: string[];
  non_cognizable: string[];
}

/**
 * Replaces the retired `config/bns-bailability.json`. One entry per table key, from
 * the row's own value; a null row goes in neither list.
 */
function buildClassification(): BnsClassification {
  const out: BnsClassification = {
    bailable: [],
    non_bailable: [],
    cognizable: [],
    non_cognizable: [],
  };
  for (const key of BNS_OFFENCE_KEYS) {
    const r = resolveOffence(key);
    if (r.bailable === true) out.bailable.push(key);
    else if (r.bailable === false) out.non_bailable.push(key);
    if (r.cognizable === true) out.cognizable.push(key);
    else if (r.cognizable === false) out.non_cognizable.push(key);
  }
  return out;
}

export const BNS_CLASSIFICATION: Readonly<BnsClassification> = buildClassification();

// ── T-371: Ajay's texts for the free tools, and the tools' reader ────────────
// Signed: T-360, T-361 Addendum 1 (e3df5a0), and
// handoff/legal/T-371-verify-caveat-signed.md (6526597), which wins where they differ.

/**
 * T-360 / T-371 Addendum 1: a converter mapping miss (missing, unverified or
 * null-target row) and, in the bail checker, a BNS number outside the Act (above 358).
 * A BNS number from 1 to 358 with no row keeps NOT_AN_OFFENCE (T-277 rule 3).
 * Never used for a signed offence row.
 */
export const NOT_VERIFIED = 'Not verified — check the Gazette';

/**
 * T-371 (6526597): shown once per section, with its normal result, for every
 * bns-offences.json row that carries a `verify` note (84 rows, including the 44 with a
 * null max_years). The raw `verify` text is never served.
 */
export const VERIFY_CAVEAT =
  'The BNSS First Schedule does not classify this section in one simple line. Check it for your case before relying on this result.';

/** T-361 Addendum 1: a null bailable / cognizable / compoundable, in place of the value. */
export const ATTRIBUTE_DEPENDS =
  'Depends on the sub-section or the offence — see the BNSS First Schedule.';

/** Ajay (CLO), T-371 Addendum 1 point 4: no entered section has a known maximum. */
export const MOST_SERIOUS_CANNOT_BE_DETERMINED =
  'The most serious offence cannot be worked out from these sections. Check the BNSS First Schedule.';

/** The BNS has 358 sections; a higher number is outside the Act (T-371 Addendum 1 point 1). */
export const BNS_LAST_SECTION = 358;

/** True when the section's number is above BNS_LAST_SECTION ("400", "512(1)"). */
export function outsideBnsRange(raw: string): boolean {
  const n = parseInt(normaliseBnsSection(raw), 10);
  return Number.isFinite(n) && n > BNS_LAST_SECTION;
}

/**
 * Which resolved offence rows get VERIFY_CAVEAT. Ajay's signed file (6526597): every
 * row with a `verify` note (exact, parent or variant resolution). One-line flip here.
 */
export function showsVerifyCaveat(r: ResolvedOffence): boolean {
  return r.kind !== 'not_an_offence' && r.verify !== undefined;
}

/** VERIFY_CAVEAT for a BNS section whose row carries a verify note, else undefined. */
export function caveatForBnsSection(section: string): string | undefined {
  const r = resolveOffence(section);
  return showsVerifyCaveat(r) ? VERIFY_CAVEAT : undefined;
}

/**
 * T-361 Addendum 1: notes for null attributes. 'with_permission' keeps Ajay's Q7 text
 * (T-277); a known value has no note.
 */
export function attributeNotes(
  r: Pick<ResolvedOffence, 'bailable' | 'cognizable' | 'compoundable'>,
): { bailableNote: string | null; cognizableNote: string | null; compoundableNote: string | null } {
  return {
    bailableNote: r.bailable === null ? ATTRIBUTE_DEPENDS : null,
    cognizableNote: r.cognizable === null ? ATTRIBUTE_DEPENDS : null,
    compoundableNote:
      r.compoundable === null
        ? ATTRIBUTE_DEPENDS
        : r.compoundable === 'with_permission'
          ? WITH_COURT_PERMISSION
          : null,
  };
}

/** Code as the tables spell it, from the T-277 reader's code. */
export const TABLE_CODE: Partial<Record<ChargedCode, string>> = {
  BNS: 'BNS',
  BNSS: 'BNSS',
  BSA: 'BSA',
  IPC: 'IPC',
  CRPC: 'CrPC',
  IEA: 'IEA',
};

/** "376DA": two capital letters (IPC 153AA, 376AB, 376DA, 376DB). */
const TWO_LETTER_SECTION = /(?<![0-9A-Za-z])(\d{1,3})([A-Z]{2})(?![A-Za-z])/g;
const TWO_LETTER_MARK = /\(qq([a-z]{2})qq\)/;
/** "Evidence Act" alone is the Indian Evidence Act (T-360 bulk bug). */
const BARE_EVIDENCE_ACT = /(?<!\bindian\s{1,5})\bevidence\s+act\b/gi;

function unmark(number: string): string {
  return number.replace(TWO_LETTER_MARK, (_m, l: string) => l.toUpperCase());
}

/**
 * T-371: the tools' reader. readSectionsCharged (T-277), unchanged, with two inputs
 * made readable first: "Evidence Act" is read as the Indian Evidence Act, and a
 * two-letter IPC suffix (376DA) is kept, where the T-277 reader would read "376".
 */
export function readToolSections(
  text: string | null | undefined,
  defaultCode?: ChargedCode,
): ChargedSection[] {
  if (!text) return [];
  const prepared = text
    .replace(BARE_EVIDENCE_ACT, 'Indian Evidence Act')
    .replace(TWO_LETTER_SECTION, (_m, n: string, l: string) => `${n}(qq${l.toLowerCase()}qq)`);
  return readSectionsCharged(prepared, defaultCode).map((e) => ({
    ...e,
    number: unmark(e.number),
    ...(e.attachedTo
      ? { attachedTo: { ...e.attachedTo, number: unmark(e.attachedTo.number) } }
      : {}),
  }));
}

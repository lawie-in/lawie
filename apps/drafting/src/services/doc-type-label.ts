/**
 * T-689: the human name of a document's type, for the document page's "Type" row.
 *
 * The stored `docType` is a coarse enum (a written statement is stored as
 * 'petition'), so the page shows the rule pack's own name for the document instead.
 * Pure: no disk, no network, no model.
 *
 * Rule: take the pack's name as the pack writes it (`displayName`, else `title`, as
 * the rule-pack loader reads it), trimmed and with runs of whitespace collapsed. If it
 * ends in one parenthetical segment set off by whitespace AND that segment is a
 * statute or rule reference, the segment is dropped, but only when text remains
 * before it. Any other parenthetical stays, since it may be what tells two packs apart.
 *
 * A statute or rule reference is one whose text inside the brackets starts (after
 * optional whitespace, case-insensitive) with:
 *   - one of: Order, Section, Sec., S., Rule, Article, Art., Schedule; or
 *   - a Roman or Arabic numeral (an Arabic one may carry a letter, e.g. 13B) followed
 *     by a statute word: CPC, CrPC, BNSS, BNS, BSA, IPC, Act, Rules, Constitution.
 * "S." and "Sec." need their dot, so "(SMA, contested)" is not a reference.
 *
 *   "Written Statement (Order VIII CPC)"                            -> "Written Statement"
 *   "Condonation of Delay Application (S.5 Limitation Act)"         -> "Condonation of Delay Application"
 *   "Divorce Petition (HMA, contested)"                             -> unchanged (not a reference)
 *   "Public Interest Litigation (PIL)"                              -> unchanged (not a reference)
 *   "Interim Application (IA) for Interim Relief During Pendency"   -> unchanged (not trailing)
 *   "Writ Petition (Criminal) — WP(CRL)"                            -> unchanged (no space before "(")
 *   "(Order VIII CPC)"                                              -> unchanged (nothing would remain)
 *
 * Only one trailing segment is dropped. No pack, or a pack with no usable name, gives
 * null; the page then falls back to the humanised `docType`.
 *
 * docTypeLabelFor is pure; docTypeLabelForPackId (below) reads the pack from disk.
 */
import { loadRulePack } from './rule-pack.service';

const TRAILING_PARENTHETICAL = /\s+\(([^()]*)\)$/;

const STATUTE_PREFIX = /^\s*(?:(?:order|section|rule|article|schedule)\b|sec\.|s\.|art\.)/i;
const NUMERAL_THEN_STATUTE =
  /^\s*(?:[ivxlcdm]+|\d+[a-z]?)\s+(?:cpc|crpc|bnss|bns|bsa|ipc|act|rules|constitution)\b/i;

function isStatuteReference(inner: string): boolean {
  return STATUTE_PREFIX.test(inner) || NUMERAL_THEN_STATUTE.test(inner);
}

export function docTypeLabelFor(pack: { name?: unknown } | null | undefined): string | null {
  if (pack === null || pack === undefined || typeof pack.name !== 'string') return null;
  const name = pack.name.replace(/\s+/g, ' ').trim();
  if (name === '') return null;
  const tail = TRAILING_PARENTHETICAL.exec(name);
  if (tail === null || !isStatuteReference(tail[1])) return name;
  const stripped = name.slice(0, tail.index).trim();
  return stripped !== '' ? stripped : name;
}

/** The rulePackId a guided document stores; it has no pack file. */
export const GUIDED_PACK_ID = 'guided';

/**
 * T-689b: the docTypeLabel for a stored rulePackId, the one path the documents list
 * and the dashboard summary share. Not pure: it reads the pack through `load` (the
 * rule-pack loader by default, which caches each pack it reads).
 *
 * A missing, empty or non-string id, the guided id (its kind name sits in the
 * encrypted brief, which is not read for this), a pack with no file or no usable
 * name, or a pack that fails to load gives null; the caller then falls back to the
 * humanised docType. Never throws.
 */
export function docTypeLabelForPackId(
  rulePackId: unknown,
  load: (id: string) => { name?: unknown } | null = loadRulePack,
): string | null {
  if (typeof rulePackId !== 'string' || rulePackId === '' || rulePackId === GUIDED_PACK_ID) {
    return null;
  }
  try {
    return docTypeLabelFor(load(rulePackId));
  } catch (err) {
    console.error(
      `[drafting] Doc type label: could not read rule pack ${rulePackId}:`,
      err instanceof Error ? err.name : 'UnknownError',
    );
    return null;
  }
}

/**
 * T-689b: a docType id for the screen when there is no pack label, as the web's
 * typeLabel does it ("bail_regular" -> "Bail regular").
 */
export function humaniseDocType(docType: string): string {
  const s = docType.replace(/_/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

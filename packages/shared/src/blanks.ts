/**
 * T-194 — the blanks of a draft. ONE set, used by web and server for the
 * export header's count, the export warning's count and list, and the
 * highlighting in the DOCX and PDF.
 *
 * The set is Ajay's sign-off (d), 11 Oct 2026, narrowed by his rulings on the
 * phase 2 questions (same night), both in
 * handoff/tickets/T-194-export-shows-unfilled-blanks.md. Any change to the set,
 * to the header text in `draftHeaderText` or to the dialog labels needs his
 * fresh sign-off.
 *
 * Counts and is highlighted:
 *   - `[To be confirmed: …]`
 *   - `{{MISSING: …}}` (prints as `[To be confirmed: …]`; counts if it ever reaches the file raw)
 *   - `[Section — verify before filing]`
 *   - `[Authority — add if relied upon]`
 *   - a run of 3 or more underscores inside a line (`Case No. _____`, a date)
 * Except (not a blank):
 *   - a line of underscores only (the signature line)
 *   - a signing date `___ day of ______, 20___` (or with the year printed,
 *     `, 2026`), only when it is inside the verification, affidavit or jurat
 *     block, or directly preceded by "this" on the same line. Every other
 *     day-of date counts, as one blank.
 *   - the registry's case number: only the FIRST `No. ___ of` in the cause
 *     title, and only when neither the whole word "in" nor "arising out of"
 *     (any case) comes before it on the same line. Every other `No. ___ of`
 *     counts.
 *
 * Pure TypeScript: no Node or DOM APIs (the web transpiles this package).
 */

/** One blank in a draft. */
export interface Blank {
  /** Offset of the blank's first character in the text `findBlanks` was given. */
  start: number;
  /** Offset just past the blank's last character. */
  end: number;
  /** The blank as written, e.g. "[To be confirmed: Date of FIR]". */
  text: string;
  /** What the export warning lists: the label, or the marker words for other markers. */
  label: string;
  /**
   * A few words of the draft around the blank, from its own line (e.g.
   * "Case No. _____ of 2026"), so the advocate can find it. Shown in the
   * warning only, never printed. Set by `findBlanks`.
   */
  context?: string;
}

/**
 * Finds every blank in a draft's text, in document order, not overlapping.
 * Lines are separated by "\n"; an empty line separates paragraphs.
 */
export type FindBlanks = (text: string) => Blank[];

/**
 * The header of an export with blanks (T-194 AC5). Text signed by Ajay, 11 Oct 2026, (a):
 * digits, an em dash, singular for one. Do not change it without a fresh sign-off.
 */
export function draftHeaderText(count: number): string {
  return count === 1 ? 'DRAFT — 1 item to be confirmed' : `DRAFT — ${count} items to be confirmed`;
}

/** Dialog label for an underscore blank (Ajay's ruling 1). Never printed in the file. */
export const UNDERSCORE_BLANK_LABEL = 'Blank to fill in';

/** Dialog label for `[To be confirmed: ]` with nothing after the colon (Ajay's ruling 1). */
export const EMPTY_BLANK_LABEL = 'To be confirmed — add the detail';

/** How many words of the line on each side of a blank its context shows. */
const CONTEXT_WORDS = 3;

const SECTION_MARKER = '[Section — verify before filing]';
const AUTHORITY_MARKER = '[Authority — add if relied upon]';

/** The marked blanks. Group 1: a `[To be confirmed: …]` label; group 2: a `{{MISSING: …}}` label. */
const MARKER =
  /\[To be confirmed:([^\]]*)\]|\{\{\s*MISSING\s*:([^}]*?)\}\}|\[Section — verify before filing\]|\[Authority — add if relied upon\]/g;

const UNDERSCORES = /_{3,}/g;

/** A line holding nothing but underscores (and spaces): the line a signature goes on. */
const SIGNATURE_LINE = /^[^\S\n]*_{3,}[\s_]*$/;

/**
 * A day-of date: "___ day of ______, 20___", or with the year printed
 * ("_____ day of _________, 2026", as the template engine writes it).
 */
const DAY_OF_DATE =
  /_{3,}[^\S\n]*(?:st|nd|rd|th)?[^\S\n]+day[^\S\n]+of[^\S\n]+_{3,}(?:[^\S\n]*,?[^\S\n]*(?:20_{2,}|_{3,}|\d{4}))?/gi;

/** "this" directly before a day-of date, on the same line ("on this ___ day of"). */
const THIS_BEFORE = /\bthis[^\S\n]+$/i;

/**
 * The start of a verification, affidavit or jurat block, at the start of a
 * paragraph: "Verified at …", "VERIFICATION", "Solemnly affirmed …",
 * "Sworn …", "Affirmed …", "JURAT".
 */
const SIGNING_BLOCK_START =
  /^[^\S\n]*(?:verified|verification|solemnly[^\S\n]+affirmed|sworn|affirmed|jurat)\b/i;

/** A heading line that opens a verification or jurat block. */
const SIGNING_BLOCK_HEADING = /^[^\S\n]*(?:verification|jurat)[^\S\n]*:?[^\S\n]*$/i;

/** "No. ___ of": group 1 is the underscore run. */
const REGISTRY_NUMBER = /\bNo\.[^\S\n]*(_{3,})[^\S\n]*of\b/gi;

/** Words that, before the number on its line, mean it is not the registry's own number. */
const NOT_REGISTRY_BEFORE = /\bin\b|\barising[^\S\n]+out[^\S\n]+of\b/i;

/** Paragraph 1 of the body ("1. That …", "1) …"). */
const PARAGRAPH_ONE = /^[^\S\n]*1[^\S\n]*[.)](?:[^\S\n]|$)/m;

function lineStartOf(text: string, at: number): number {
  return text.lastIndexOf('\n', at - 1) + 1;
}

function lineEndOf(text: string, at: number): number {
  const nl = text.indexOf('\n', at);
  return nl === -1 ? text.length : nl;
}

/** A line that is only VERSUS / VS / V/S (any case, dots allowed). */
function isPartySeparator(line: string): boolean {
  const word = line.replace(/\./g, '').replace(/\s+/g, '').toLowerCase();
  return word === 'versus' || word === 'vs' || word === 'v/s';
}

/**
 * Where the cause title ends: at the first line that is only VERSUS / VS / V/S,
 * or at paragraph 1, whichever comes first. An inline "v." or "vs." never ends
 * it. Neither found: -1 (no cause title; the registry exception never applies).
 */
function causeTitleEnd(text: string): number {
  let sep = -1;
  let at = 0;
  while (at <= text.length) {
    const end = lineEndOf(text, at);
    if (isPartySeparator(text.slice(at, end))) {
      sep = at;
      break;
    }
    at = end + 1;
  }
  const para = PARAGRAPH_ONE.exec(text);
  const one = para ? para.index : -1;
  if (sep === -1) return one;
  if (one === -1) return sep;
  return Math.min(sep, one);
}

/** Where the paragraph holding `at` starts: just after the last empty line before it. */
function paragraphStartOf(text: string, at: number): number {
  const re = /\n[^\S\n]*\n/g;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null && m.index < at) {
    start = m.index + m[0].length;
    re.lastIndex = m.index + 1;
  }
  return start;
}

/** True when the paragraph holding `at` is a verification, affidavit or jurat block. */
function inSigningBlock(text: string, at: number): boolean {
  const start = paragraphStartOf(text, at);
  const firstLine = text.slice(start, lineEndOf(text, start));
  if (SIGNING_BLOCK_START.test(firstLine)) return true;
  // The paragraph right after a "VERIFICATION" / "JURAT" heading line.
  const before = text.slice(0, start).replace(/\s+$/, '');
  const headingLine = before.slice(lineStartOf(before, before.length));
  return SIGNING_BLOCK_HEADING.test(headingLine);
}

/** A signing date the exception covers (Ajay's ruling 2). */
function isExemptSigningDate(text: string, start: number): boolean {
  if (THIS_BEFORE.test(text.slice(lineStartOf(text, start), start))) return true;
  return inSigningBlock(text, start);
}

/**
 * A few words of the blank's own line around it: up to CONTEXT_WORDS words on
 * each side, with "…" where the line goes on.
 */
export function blankContext(text: string, blank: Pick<Blank, 'start' | 'end'>): string {
  const lineStart = lineStartOf(text, blank.start);
  const lineEnd = lineEndOf(text, blank.end);
  const before = text.slice(lineStart, blank.start).split(/\s+/).filter(Boolean);
  const after = text.slice(blank.end, lineEnd).split(/\s+/).filter(Boolean);
  const shownBefore = before.slice(-CONTEXT_WORDS);
  const shownAfter = after.slice(0, CONTEXT_WORDS);
  const gapBefore = /^\s/.test(text.slice(blank.start - 1, blank.start)) ? ' ' : '';
  const gapAfter = /^\s/.test(text.slice(blank.end, blank.end + 1)) ? ' ' : '';
  const blankText = text.slice(blank.start, blank.end).replace(/\s+/g, ' ');
  return (
    (before.length > shownBefore.length ? '… ' : '') +
    (shownBefore.length > 0 ? shownBefore.join(' ') + gapBefore : '') +
    blankText +
    (shownAfter.length > 0 ? gapAfter + shownAfter.join(' ') : '') +
    (after.length > shownAfter.length ? ' …' : '')
  );
}

function tidyLabel(label: string): string {
  return label.replace(/\s+/g, ' ').trim();
}

/** Ajay's set (d) with his rulings. See the file header. */
export const findBlanks: FindBlanks = (text) => {
  const blanks: Blank[] = [];
  /** Ranges no underscore blank may come from: markers and the exceptions. */
  const taken: [number, number][] = [];
  const add = (start: number, end: number, label: string) =>
    blanks.push({
      start,
      end,
      text: text.slice(start, end),
      label,
      context: blankContext(text, { start, end }),
    });

  for (const m of text.matchAll(MARKER)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    let label: string;
    if (m[1] !== undefined) label = tidyLabel(m[1]) || EMPTY_BLANK_LABEL;
    else if (m[2] !== undefined) label = tidyLabel(m[2]) || EMPTY_BLANK_LABEL;
    else if (m[0] === SECTION_MARKER) label = SECTION_MARKER.slice(1, -1);
    else label = AUTHORITY_MARKER.slice(1, -1);
    add(start, end, label);
    taken.push([start, end]);
  }

  // A day-of date is one value: exempt as a whole, or one blank as a whole.
  for (const m of text.matchAll(DAY_OF_DATE)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (taken.some(([a, b]) => start < b && end > a)) continue;
    if (!isExemptSigningDate(text, start)) add(start, end, UNDERSCORE_BLANK_LABEL);
    taken.push([start, end]);
  }

  // Only the first "No. ___ of" in the cause title, and only when "in" /
  // "arising out of" does not come before it on its line.
  const titleEnd = causeTitleEnd(text);
  if (titleEnd !== -1) {
    REGISTRY_NUMBER.lastIndex = 0;
    const first = REGISTRY_NUMBER.exec(text);
    if (first && first.index < titleEnd) {
      const before = text.slice(lineStartOf(text, first.index), first.index);
      if (!NOT_REGISTRY_BEFORE.test(before)) {
        const start = first.index + first[0].indexOf(first[1]);
        taken.push([start, start + first[1].length]);
      }
    }
  }

  for (const m of text.matchAll(UNDERSCORES)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (taken.some(([a, b]) => start < b && end > a)) continue;
    const line = text.slice(lineStartOf(text, start), lineEndOf(text, end));
    if (SIGNATURE_LINE.test(line)) continue;
    add(start, end, UNDERSCORE_BLANK_LABEL);
  }

  return blanks.sort((a, b) => a.start - b.start);
};

/** How many blanks a draft's text has (Ajay's set (d)). */
export function countBlanks(text: string): number {
  return findBlanks(text).length;
}

// ── Reading a draft's content for findBlanks, and marking its blanks ──────────
// Shared by the web exports (DOCX, fallback PDF) and the server PDF, so the web
// warning and the server header count the same N from the same content.

// Private-use characters that mark where a blank starts and ends while the
// export markup is built. Removed from the content first, so they never collide.
const BLANK_OPEN = '';
const BLANK_CLOSE = '';
const BLANK_MARKS = /[]/g;

const BLOCK_TAG =
  /^<\/?(?:p|div|h[1-6]|li|ul|ol|br|hr|tr|td|th|table|thead|tbody|blockquote|pre|section)\b/i;
const ENTITY = /&(#\d+|#x[0-9a-f]+|[a-z]+);/iy;
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntity(body: string): string | null {
  if (body[0] === '#') {
    const code =
      body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff
      ? String.fromCodePoint(code)
      : null;
  }
  return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, body) ? NAMED_ENTITIES[body] : null;
}

/**
 * The text of a draft as `findBlanks` reads it, with where each character came
 * from in the content. HTML (TipTap) content: the text without tags, entities
 * decoded, a "\n" for each block tag and line break. Plain text: as it is.
 * `sources[i]` is the content range character i came from; null for a line break.
 */
function projectContent(content: string): {
  text: string;
  sources: ([number, number] | null)[];
} {
  const chars: string[] = [];
  const sources: ([number, number] | null)[] = [];
  if (!content.trimStart().startsWith('<')) {
    for (let i = 0; i < content.length; i++) {
      chars.push(content[i]);
      sources.push(content[i] === '\n' ? null : [i, i + 1]);
    }
    return { text: chars.join(''), sources };
  }
  let i = 0;
  while (i < content.length) {
    const c = content[i];
    if (c === '<') {
      const close = content.indexOf('>', i);
      if (close !== -1) {
        if (BLOCK_TAG.test(content.slice(i, close + 1))) {
          chars.push('\n');
          sources.push(null);
        }
        i = close + 1;
        continue;
      }
    } else if (c === '&') {
      ENTITY.lastIndex = i;
      const m = ENTITY.exec(content);
      const decoded = m ? decodeEntity(m[1]) : null;
      if (m && decoded !== null) {
        for (const ch of decoded.split('')) {
          chars.push(ch);
          sources.push([i, i + m[0].length]);
        }
        i += m[0].length;
        continue;
      }
    }
    chars.push(c);
    sources.push([i, i + 1]);
    i++;
  }
  return { text: chars.join(''), sources };
}

/** A draft's content (TipTap HTML or plain text) as the text `findBlanks` reads. */
export function blankText(content: string): string {
  return projectContent(stripBlankMarks(content)).text;
}

/** Removes the marks `markBlanks` puts in. */
export function stripBlankMarks(text: string): string {
  return text.replace(BLANK_MARKS, '');
}

/**
 * Finds the blanks in a draft's content and marks each with two private-use
 * characters; `blankMarksToTags` turns them into markup. A blank that crosses a
 * tag (e.g. part of it bold) is marked once per run of text, so the markup it
 * becomes always nests.
 */
export function markBlanks(
  content: string,
  find: FindBlanks = findBlanks,
): { marked: string; blanks: Blank[] } {
  const clean = stripBlankMarks(content);
  const { text, sources } = projectContent(clean);
  const blanks = find(text);
  if (blanks.length === 0) return { marked: clean, blanks };

  const ranges: [number, number][] = [];
  for (const b of blanks) {
    let from = -1;
    let to = -1;
    for (let k = Math.max(0, b.start); k < Math.min(b.end, sources.length); k++) {
      const s = sources[k];
      if (s && from !== -1 && s[0] <= to) {
        to = Math.max(to, s[1]);
        continue;
      }
      if (from !== -1) ranges.push([from, to]);
      if (s) {
        from = s[0];
        to = s[1];
      } else {
        from = -1;
      }
    }
    if (from !== -1) ranges.push([from, to]);
  }
  ranges.sort((a, b) => a[0] - b[0]);

  let marked = '';
  let at = 0;
  for (const [from, to] of ranges) {
    if (from < at) continue;
    marked += clean.slice(at, from) + BLANK_OPEN + clean.slice(from, to) + BLANK_CLOSE;
    at = to;
  }
  marked += clean.slice(at);
  return { marked, blanks };
}

/** Turns the marks `markBlanks` put in into an opening and a closing tag. */
export function blankMarksToTags(marked: string, open: string, close: string): string {
  return marked.split(BLANK_OPEN).join(open).split(BLANK_CLOSE).join(close);
}

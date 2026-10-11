/**
 * Server-side PDF Export — generates court-formatted A4 PDF from document content.
 *
 * Uses Puppeteer for rendering (same pipeline as scripts/export-pdf.ts).
 * Court standard: A4, Times New Roman 12pt, double-spaced, 1.5" left margin.
 */
import puppeteer from 'puppeteer';

import { missingAsBlanks } from '../utils/missingAsBlanks';

import { STARTING_DRAFT_FOOTER } from './brief-drafter';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function markdownBoldItalic(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  return html;
}

export { missingAsBlanks };

// ── T-194: blanks in an export ───────────────────────────────────────────────

/**
 * One blank in a draft (T-194, Ajay's set (d)). The same shape as the `Blank`
 * that `packages/shared/src/blanks.ts` exports in phase 2.
 */
export interface Blank {
  /** Offset of the blank's first character in the text `findBlanks` was given. */
  start: number;
  /** Offset just past the blank's last character. */
  end: number;
  /** The blank as written, e.g. "[To be confirmed: Date of FIR]". */
  text: string;
  /** What the export warning lists: the label, or the marker words for other markers. */
  label: string;
}

/**
 * Finds every blank in a draft's text, in document order, not overlapping.
 * Lines are separated by "\n" (each paragraph, heading, list item and line break
 * of the HTML starts a new line).
 */
export type FindBlanks = (text: string) => Blank[];

// ---- T-194 PHASE-2 SEAM -----------------------------------------------------
// Phase 2 replaces this stub with the one function of Ajay's set (d), from
// packages/shared/src/blanks.ts:
//   export { findBlanks } from '@lawie/shared';
// (and `Blank` / `FindBlanks` above become re-exports of the shared types).
// Until then no blank is found, so every PDF prints exactly as before T-194.
// -----------------------------------------------------------------------------
export const findBlanks: FindBlanks = () => [];

/**
 * The header of an export with blanks (T-194 AC5). Text signed by Ajay, 11 Oct 2026, (a).
 * Do not change it without a fresh sign-off. The web DOCX prints the same text
 * (apps/web/src/components/editor/exportUtils.ts).
 */
export function draftHeaderText(count: number): string {
  return count === 1 ? 'DRAFT — 1 item to be confirmed' : `DRAFT — ${count} items to be confirmed`;
}

// Private-use characters that mark where a blank starts and ends while the
// export HTML is built. Removed from the content first, so they never collide.
const BLANK_OPEN = '\uE000';
const BLANK_CLOSE = '\uE001';
const SENTINELS = /[\uE000\uE001]/g;

const BLOCK_TAG =
  /^<\/?(?:p|div|h[1-6]|li|ul|ol|br|hr|tr|td|th|table|thead|tbody|blockquote|pre|section)\b/i;
const ENTITY = /&(#\d+|#x[0-9a-f]+|[a-z]+);/iy;
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
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
 * Kept identical to `projectContent` in the web's exportUtils.ts, so the web
 * warning and this header count the same N.
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

/**
 * Finds the blanks in a draft and marks each in the content with the two
 * sentinels. A blank that crosses a tag (e.g. part of it bold) is marked once
 * per run of text, so the markup it becomes always nests.
 */
function markBlanks(content: string, find: FindBlanks): { marked: string; blanks: Blank[] } {
  const clean = content.replace(SENTINELS, '');
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

/**
 * The blanks of a saved draft, as the PDF prints it (after `missingAsBlanks`).
 * T-194: the route takes the header's N from this; `contentToHtml` highlights
 * the same blanks.
 */
export function blanksInContent(rawContent: string, find: FindBlanks = findBlanks): Blank[] {
  return find(projectContent(missingAsBlanks(rawContent).replace(SENTINELS, '')).text);
}

/** T-194 options for `contentToHtml`. */
export interface ContentToHtmlOptions {
  /** When given, each blank it finds prints bold and highlighted (Ajay (b)). */
  findBlanks?: FindBlanks;
}

/** T-194, Ajay (b): bold, yellow #FFFF00, black text; colour kept in print. */
const BLANK_CSS = `  .tbc {
    font-weight: 700;
    background: #FFFF00;
    color: #000;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
`;

/**
 * Convert document content to court-formatted HTML.
 * Handles two content formats:
 *  - TipTap HTML (saved after user edits): embedded directly, no escaping
 *  - Plain text / markdown (original AI output): converted to paragraphs
 */
export function contentToHtml(
  rawContent: string,
  _isFree: boolean,
  startingDraft = false,
  options: ContentToHtmlOptions = {},
): string {
  // T-194: blanks are marked with sentinels here and become <span class="tbc">
  // once the body is built. No finder, or no blanks: the content is as before.
  const { marked: content, blanks } = options.findBlanks
    ? markBlanks(missingAsBlanks(rawContent), options.findBlanks)
    : { marked: missingAsBlanks(rawContent), blanks: [] };
  let body = '';

  if (content.trimStart().startsWith('<')) {
    // Already HTML from TipTap editor — embed as-is
    body = content;
  } else {
    // Plain text / markdown — convert to paragraphs
    const paragraphs = content.split('\n\n');

    for (const para of paragraphs) {
      if (!para.trim()) continue;
      const lines = para.split('\n');
      const lineHtml = lines.map((l) => markdownBoldItalic(l)).join('<br>');

      // The blank sentinels (T-194) do not count toward the heading test.
      const line = lines[0].replace(SENTINELS, '');
      const isHeading =
        lines.length === 1 &&
        line.length < 120 &&
        (line === line.toUpperCase() ||
          line.startsWith('PRAYER') ||
          line.startsWith('VERIFICATION') ||
          line.startsWith('DEMAND') ||
          line.startsWith('APPLICATION FOR') ||
          line.startsWith('THROUGH:') ||
          line.startsWith('LEGAL NOTICE') ||
          line.startsWith('Subject:'));

      if (isHeading) {
        body += `<p class="heading">${lineHtml}</p>\n`;
      } else {
        body += `<p>${lineHtml}</p>\n`;
      }
    }
  }

  if (blanks.length > 0) {
    body = body.split(BLANK_OPEN).join('<span class="tbc">').split(BLANK_CLOSE).join('</span>');
  }

  // T-106, ADR-021 rule 6 — a starting draft says so in its footer (T-107, section 4).
  if (startingDraft) {
    body += `<div class="disclaimer">${STARTING_DRAFT_FOOTER}</div>`;
  }

  // AI disclaimer footer
  body += `<div class="disclaimer">AI-assisted draft &mdash; verify with applicable law before filing. Lawie does not provide legal advice.</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  @page {
    size: A4;
    margin: 1in 1in 1in 1.5in;
  }
  body {
    font-family: "Times New Roman", Times, serif;
    font-size: 12pt;
    line-height: 2;
    color: #000;
    margin: 0;
    padding: 0;
  }
  p {
    margin: 0 0 0.5em 0;
    orphans: 2;
    widows: 2;
  }
  p.heading {
    font-weight: bold;
    text-align: center;
    margin-top: 1em;
    margin-bottom: 0.5em;
    line-height: 1.5;
  }
  .disclaimer {
    margin-top: 2em;
    padding-top: 1em;
    border-top: 1px solid #999;
    font-size: 9pt;
    color: #666;
    text-align: center;
    line-height: 1.4;
    page-break-inside: avoid;
  }
  strong { font-weight: bold; }
  em { font-style: italic; }
  u { text-decoration: underline; }
  s { text-decoration: line-through; }
  h1 { font-size: 14pt; font-weight: bold; text-align: center; margin: 0.8em 0 0.4em; }
  h2 { font-size: 13pt; font-weight: bold; margin: 0.6em 0 0.3em; }
  h3 { font-size: 12pt; font-weight: bold; margin: 0.4em 0 0.2em; }
  ul, ol { margin: 0.4em 0 0.4em 1.5em; padding: 0; }
  li { margin-bottom: 0.2em; }
  hr { border: none; border-top: 1px solid #999; margin: 1em 0; }
${blanks.length > 0 ? BLANK_CSS : ''}</style>
</head>
<body>
${body}
</body>
</html>`;
}

/**
 * Render HTML to PDF buffer using Puppeteer.
 *
 * `executablePath` is only passed when explicitly set (production via Docker env)
 * — when omitted, Puppeteer auto-resolves to the bundled Chromium installed by
 * `puppeteer install` (works out of the box in `yarn dev` locally and in CI).
 * Passing `executablePath: undefined` previously triggered intermittent launch
 * failures in dev where the value evaluated to undefined but the option was
 * still present in the options object.
 */
/** T-194 options for `renderPdf`. */
export interface RenderPdfOptions {
  /**
   * Printed at the top of every page, 10pt bold, centred over the text column
   * ("DRAFT — N items to be confirmed"). Omitted: no header, as before.
   */
  headerText?: string;
}

function headerTemplate(text: string): string {
  // Puppeteer renders the template in the page's top margin, outside the
  // document's own CSS, so it carries its own font and size.
  return (
    '<div style="box-sizing:border-box;width:100%;padding:0 1in 0 1.5in;' +
    "font-family:'Times New Roman',Times,serif;font-size:10pt;font-weight:bold;" +
    'text-align:center;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact;">' +
    `${escapeHtml(text)}</div>`
  );
}

export async function renderPdf(html: string, options: RenderPdfOptions = {}): Promise<Buffer> {
  const launchOpts: Parameters<typeof puppeteer.launch>[0] = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  const browser = await puppeteer.launch(launchOpts);

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: {
        top: '1in',
        bottom: '1in',
        left: '1.5in',
        right: '1in',
      },
      printBackground: true,
      // T-194 AC5: the header only when the draft has blanks. The empty footer
      // template keeps Puppeteer's default footer (date, page numbers) off the
      // page; the in-page disclaimer footer is unchanged.
      ...(options.headerText
        ? {
            displayHeaderFooter: true,
            headerTemplate: headerTemplate(options.headerText),
            footerTemplate: '<span></span>',
          }
        : {}),
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

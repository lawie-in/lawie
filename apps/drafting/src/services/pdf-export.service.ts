/**
 * Server-side PDF Export — generates court-formatted A4 PDF from document content.
 *
 * Uses Puppeteer for rendering (same pipeline as scripts/export-pdf.ts).
 * Court standard: A4, Times New Roman 12pt, double-spaced, 1.5" left margin.
 */
import {
  blankMarksToTags,
  blankText,
  draftHeaderText,
  findBlanks,
  markBlanks,
  stripBlankMarks,
  type Blank,
  type FindBlanks,
} from '@lawie/shared';
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
// The one blank set (Ajay's sign-off (d)), the signed header text and the
// marking of blanks in the content live in packages/shared/src/blanks.ts, used
// by this file and by the web exports alike.

export { draftHeaderText, findBlanks };
export type { Blank, FindBlanks };

/**
 * The blanks of a saved draft, as the PDF prints it (after `missingAsBlanks`).
 * T-194: the route takes the header's N from this; `contentToHtml` highlights
 * the same blanks.
 */
export function blanksInContent(rawContent: string, find: FindBlanks = findBlanks): Blank[] {
  return find(blankText(missingAsBlanks(normaliseLineEnds(rawContent))));
}

/**
 * T-274 review: CRLF/CR line ends become LF on the raw content, before
 * missingAsBlanks and markBlanks, in blanksInContent and contentToHtml alike,
 * so a blank whose label spans a line end is found and marked the same as with
 * LF and the header's N stays equal to the highlighted blanks. In HTML a CR is
 * whitespace the parser already folds into LF, so this changes nothing there.
 */
function normaliseLineEnds(text: string): string {
  return text.replace(/\r\n?/g, '\n');
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
  const normalised = normaliseLineEnds(rawContent);
  const { marked: content, blanks } = options.findBlanks
    ? markBlanks(missingAsBlanks(normalised), options.findBlanks)
    : { marked: missingAsBlanks(normalised), blanks: [] };
  let body = '';

  if (content.trimStart().startsWith('<')) {
    // Already HTML from TipTap editor — embed as-is
    body = content;
  } else {
    // Plain text / markdown — convert to paragraphs. The content is already LF
    // (normaliseLineEnds above), so a CRLF draft gets the same paragraphs and
    // headings as an LF one.
    const paragraphs = content.split(/\n{2,}/);

    for (const para of paragraphs) {
      if (!para.trim()) continue;
      const lines = para.split('\n');
      const lineHtml = lines.map((l) => markdownBoldItalic(l)).join('<br>');

      // The blank sentinels (T-194) do not count toward the heading test.
      const line = stripBlankMarks(lines[0]);
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
    body = blankMarksToTags(body, '<span class="tbc">', '</span>');
  }

  // T-106, ADR-021 rule 6 — a starting draft says so in its footer (T-107, section 4).
  // T-321: exactly one AI disclaimer, the starting-draft line replaces the generic one.
  if (startingDraft) {
    body += `<div class="disclaimer">${STARTING_DRAFT_FOOTER}</div>`;
  } else {
    // AI disclaimer footer
    body += `<div class="disclaimer">First draft generated with AI. Check it against the applicable law before filing. Lawie does not provide legal advice.</div>`;
  }

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

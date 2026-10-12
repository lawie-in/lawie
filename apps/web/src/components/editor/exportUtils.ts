import {
  blankMarksToTags,
  blankText,
  draftHeaderText,
  findBlanks,
  markBlanks,
  UNDERSCORE_BLANK_LABEL,
  type Blank,
  type FindBlanks,
} from '@lawie/shared';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import type { IRunOptions } from 'docx';
import { saveAs } from 'file-saver';

/**
 * T-147c: a draft written from the fact ledger marks a missing fact as
 * `{{MISSING: label}}`. In an export it prints as today's blank,
 * `[To be confirmed: label]`, as the server PDF does. Text substitution only.
 * Any case, as the shared blank marker (Ajay's T-194 follow-up).
 */
export function missingAsBlanks(text: string): string {
  return text.replace(/\{\{\s*MISSING\s*:\s*([^}]*?)\s*\}\}/gi, '[To be confirmed: $1]');
}

// T-233 review: plain text unless it starts with '<' after leading whitespace,
// as shared projectContent reads it (blanks.ts). textToHtml is aligned in T-274.
function isPlainContent(content: string): boolean {
  return !content.trimStart().startsWith('<');
}

// T-274 review: CRLF/CR line ends become LF on the raw content, before
// missingAsBlanks and markBlanks, in the count (blanksInContent) and in both
// exports alike, so a blank whose label spans a line end is found and marked the
// same as with LF, and the warning's count equals the header's N. In HTML a CR
// is whitespace the parser already folds into LF, so this changes nothing there.
function normaliseLineEnds(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/**
 * T-233: an unedited draft is the server's plain text, not HTML. Mirrors
 * DocumentEditor's textToHtml (keep the two in step): an empty line starts a
 * new <p>, a single line break becomes <br>. T-274: like textToHtml, the text
 * is HTML-escaped before the tags go in, so '<', '>' and '&' print as written.
 * The blank marks (U+E000/U+E001) from markBlanks are not touched by the
 * escaping and survive to blankMarksToTags. Its only callers (exportPdf,
 * exportDocx) pass it text already made LF by normaliseLineEnds; textToHtml
 * makes its own input LF.
 * Content that starts with '<' (after any leading whitespace) is already HTML.
 */
function plainTextToHtml(text: string): string {
  if (!isPlainContent(text)) return text;
  return escapeHtml(text)
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

// ── T-194: blanks in an export ───────────────────────────────────────────────
// The one blank set (Ajay's sign-off (d)), the signed header text and the
// marking of blanks in the content live in packages/shared/src/blanks.ts, used
// by this file and by the server PDF alike.

export { draftHeaderText, findBlanks } from '@lawie/shared';
export type { Blank, FindBlanks } from '@lawie/shared';

/** One row of the export warning's list. */
export interface BlankListItem {
  label: string;
  /** A few words of the draft around the blank (Ajay's ruling 1, Priya's call). */
  context?: string;
}

/**
 * The rows the export warning lists, in document order. A labelled blank is
 * listed once however often it appears; underscore blanks share one label, so
 * each is listed by where it is.
 */
export function blankListItems(blanks: Blank[]): BlankListItem[] {
  const seen = new Set<string>();
  const items: BlankListItem[] = [];
  for (const b of blanks) {
    const key = b.label === UNDERSCORE_BLANK_LABEL ? `${b.label}\u0000${b.start}` : b.label;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ label: b.label, context: b.context });
  }
  return items;
}

/** The editor listens for this to put the cursor on the first blank ("Go back and fill"). */
export const EXPORT_BLANKS_GO_BACK_EVENT = 'lawie:export-blanks-go-back';
export interface ExportBlanksGoBackDetail {
  /** The first blank of the saved draft, as written in the export. */
  text?: string;
}

/**
 * The blanks of a saved draft, as the export prints it (after `missingAsBlanks`).
 * T-194: the warning's count and list, the header's N and the highlighting all
 * come from this one call over the same content.
 */
export function blanksInContent(content: string, find: FindBlanks = findBlanks): Blank[] {
  return find(blankText(missingAsBlanks(normaliseLineEnds(content))));
}

/** Options shared by both exports (T-194). */
export interface ExportBlankOptions {
  /** Defaults to the shared `findBlanks`. */
  findBlanks?: FindBlanks;
}

/** T-194, Ajay (b): bold, yellow #FFFF00, black text; colour kept in print. */
const BLANK_CSS =
  'font-weight: 700 !important; background: #FFFF00; color: #000; print-color-adjust: exact; -webkit-print-color-adjust: exact;';

/**
 * Export the editor HTML content as a PDF file (CLIENT-SIDE FALLBACK).
 *
 * IMPORTANT: This is the fallback path used only when the server-side
 * Puppeteer render in apps/drafting/src/services/pdf-export.service.ts is
 * unreachable. The server route is the source of truth for filing-grade
 * formatting; this function MUST mirror its output as closely as possible:
 * Times New Roman 12pt, double-spaced, 1.5" left margin, single AI disclaimer
 * footer with the .disclaimer divider line.
 *
 * Style is injected via a <style> tag inside the wrapper rather than inline
 * on the wrapper element, because TipTap's inner HTML carries its own
 * inherited styling that would otherwise override a wrapper-level fontFamily.
 */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The parts of a jsPDF document the fallback header uses. */
interface JsPdfPages {
  internal: { getNumberOfPages(): number; pageSize: { getWidth(): number } };
  setPage(page: number): unknown;
  setFont(name: string, style: string): unknown;
  setFontSize(size: number): unknown;
  setTextColor(gray: number): unknown;
  text(text: string, x: number, y: number, options?: { align?: 'center' }): unknown;
}

/**
 * T-194 AC5: the header on every page of the fallback PDF. 10pt bold Times,
 * centred over the text column, in the top margin. `margin` is html2pdf's
 * [top, left, bottom, right] in mm.
 */
function stampHeader(pdf: JsPdfPages, text: string, margin: [number, number, number, number]) {
  const width = pdf.internal.pageSize.getWidth();
  const x = margin[1] + (width - margin[1] - margin[3]) / 2;
  const y = margin[0] * 0.6;
  for (let page = 1; page <= pdf.internal.getNumberOfPages(); page++) {
    pdf.setPage(page);
    pdf.setFont('times', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(0);
    pdf.text(text, x, y, { align: 'center' });
  }
}

/**
 * `startingDraftFooter` is the footer of a starting draft (T-107, section 4),
 * as the service sent it with the document. The user cannot remove it.
 *
 * T-194: each blank prints bold and highlighted, and a draft with blanks
 * carries the "DRAFT — N items to be confirmed" header on every page. A draft
 * with none prints as before.
 */
export async function exportPdf(
  rawHtml: string,
  title: string,
  _isFree: boolean,
  startingDraftFooter?: string | null,
  options: ExportBlankOptions = {},
): Promise<void> {
  // T-233: as in exportDocx, mark the blanks in the content as saved, then turn
  // an unedited plain-text draft into HTML so its paragraphs and line breaks print.
  const isPlainText = isPlainContent(rawHtml);
  const { marked, blanks } = markBlanks(
    missingAsBlanks(normaliseLineEnds(rawHtml)),
    options.findBlanks ?? findBlanks,
  );
  const markedHtml = isPlainText ? plainTextToHtml(marked) : marked;
  const html = blankMarksToTags(markedHtml, '<span class="tbc">', '</span>');
  const headerText = blanks.length > 0 ? draftHeaderText(blanks.length) : null;
  // Dynamic import — html2pdf.js is a large bundle, only load when needed
  const html2pdf = (await import('html2pdf.js')).default;

  const wrapper = document.createElement('div');
  // Court-grade CSS — mirrors apps/drafting/src/services/pdf-export.service.ts
  // contentToHtml() so server-side and client-side fallback paths produce
  // visually-identical PDFs. If you change one, change the other.
  wrapper.innerHTML = `
    <style>
      .lawie-pdf-root, .lawie-pdf-root * {
        font-family: "Times New Roman", Times, serif !important;
        color: #000;
      }
      .lawie-pdf-root {
        font-size: 12pt;
        line-height: 2;
        margin: 0;
        padding: 0;
      }
      .lawie-pdf-root p {
        margin: 0 0 0.5em 0;
        orphans: 2;
        widows: 2;
        font-size: 12pt;
        line-height: 2;
      }
      .lawie-pdf-root h1, .lawie-pdf-root h2, .lawie-pdf-root h3 {
        font-weight: bold;
        margin: 0.6em 0 0.3em;
      }
      .lawie-pdf-root h1 { font-size: 14pt; text-align: center; }
      .lawie-pdf-root h2 { font-size: 13pt; }
      .lawie-pdf-root h3 { font-size: 12pt; }
      .lawie-pdf-root strong, .lawie-pdf-root b { font-weight: bold; }
      .lawie-pdf-root em, .lawie-pdf-root i { font-style: italic; }
      .lawie-pdf-root u { text-decoration: underline; }
      .lawie-pdf-root ul, .lawie-pdf-root ol { margin: 0.4em 0 0.4em 1.5em; padding: 0; }
      .lawie-pdf-root li { margin-bottom: 0.2em; }
      .lawie-pdf-root .disclaimer {
        margin-top: 2em;
        padding-top: 1em;
        border-top: 1px solid #999;
        font-size: 9pt;
        color: #666;
        text-align: center;
        line-height: 1.4;
        page-break-inside: avoid;
      }${headerText ? `\n      .lawie-pdf-root .tbc { ${BLANK_CSS} }` : ''}
    </style>
    <div class="lawie-pdf-root">
      ${html}
      ${startingDraftFooter ? `<div class="disclaimer">${escapeHtml(startingDraftFooter)}</div>` : ''}
      <div class="disclaimer">First draft generated with AI. Check it against the applicable law before filing. Lawie does not provide legal advice.</div>
    </div>
  `;

  const filename = `${title.replace(/[^a-zA-Z0-9\s-]/g, '').slice(0, 60)}.pdf`;
  // html2pdf's margin order is [top, left, bottom, right], in mm (T-233: the
  // 1.5" goes in the second slot, the left).
  const margin: [number, number, number, number] = [25.4, 38.1, 25.4, 25.4];

  let worker = html2pdf()
    .set({
      // 1.5" left, 1" top/bottom/right — court convention (matches server margins)
      margin, // mm: top 1in, left 1.5in, bottom 1in, right 1in
      filename,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    })
    .from(wrapper);
  if (headerText) {
    // Render first, then write the header on every page of the jsPDF document.
    // At run time get() returns the same chainable worker (its typings say Promise).
    worker = worker
      .toPdf()
      .get('pdf', (pdf: JsPdfPages) =>
        stampHeader(pdf, headerText, margin),
      ) as unknown as typeof worker;
  }
  await worker.save();
}

/** Formatting a run inherits from the tags around it. */
interface RunFormat {
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  /** T-194: inside a blank — bold, yellow highlight, black text (Ajay (b)). */
  blank?: boolean;
}

function textRun(text: string, fmt: RunFormat): TextRun {
  const opts: { -readonly [K in keyof IRunOptions]: IRunOptions[K] } = { text };
  if (fmt.bold || fmt.blank) opts.bold = true;
  if (fmt.italics) opts.italics = true;
  if (fmt.underline) opts.underline = {};
  if (fmt.blank) {
    opts.highlight = 'yellow';
    opts.color = '000000';
  }
  return new TextRun(opts);
}

/**
 * Parse simple HTML into docx paragraphs.
 * Handles: <h1-h3>, <p>, <strong>, <em>, <u>, <br>, <li>, and the T-194 blank
 * marker `<span data-lawie-blank>`. Formatting is passed down to the text, so
 * nested tags (e.g. bold inside a blank) combine.
 */
function htmlToDocxParagraphs(html: string, _isFree: boolean): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  function processNode(node: Node, fmt: RunFormat = {}): TextRun[] {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      return text ? [textRun(text, fmt)] : [];
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return [];

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === 'br') return [new TextRun({ break: 1 })];

    const inner: RunFormat = { ...fmt };
    if (tag === 'strong' || tag === 'b') inner.bold = true;
    if (tag === 'em' || tag === 'i') inner.italics = true;
    if (tag === 'u') inner.underline = true;
    if (el.hasAttribute('data-lawie-blank')) inner.blank = true;

    const runs: TextRun[] = [];
    el.childNodes.forEach((child) => runs.push(...processNode(child, inner)));
    return runs;
  }

  const body = doc.body;
  body.childNodes.forEach((node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    let heading: (typeof HeadingLevel)[keyof typeof HeadingLevel] | undefined;
    if (tag === 'h1') heading = HeadingLevel.HEADING_1;
    else if (tag === 'h2') heading = HeadingLevel.HEADING_2;
    else if (tag === 'h3') heading = HeadingLevel.HEADING_3;

    const align = el.style.textAlign;
    let alignment: (typeof AlignmentType)[keyof typeof AlignmentType] | undefined;
    if (align === 'center') alignment = AlignmentType.CENTER;
    else if (align === 'right') alignment = AlignmentType.RIGHT;
    else if (align === 'justify') alignment = AlignmentType.JUSTIFIED;

    if (tag === 'ul' || tag === 'ol') {
      el.querySelectorAll('li').forEach((li) => {
        paragraphs.push(
          new Paragraph({
            children: processNode(li),
            bullet: tag === 'ul' ? { level: 0 } : undefined,
            numbering: tag === 'ol' ? { reference: 'default-numbering', level: 0 } : undefined,
          }),
        );
      });
    } else {
      paragraphs.push(
        new Paragraph({
          children: processNode(el),
          heading,
          alignment,
        }),
      );
    }
  });

  return paragraphs;
}

/**
 * T-194 AC5: the DOCX header of a draft with blanks — one centred paragraph,
 * Times New Roman 10pt bold, a thin rule under it. An ordinary section header
 * the advocate can delete (Ajay (a)).
 */
function draftHeader(count: number): Header {
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'auto', space: 1 } },
        children: [
          new TextRun({
            text: draftHeaderText(count),
            font: 'Times New Roman',
            size: 20,
            bold: true,
          }),
        ],
      }),
    ],
  });
}

/**
 * Export the editor HTML content as a DOCX file.
 * Uses the `docx` package (client-side generation).
 *
 * A starting draft carries its footer on every page (T-107, section 4). The
 * text comes from the service with the document.
 *
 * T-194: each blank is bold and highlighted yellow; a draft with blanks
 * carries the "DRAFT — N items to be confirmed" header. A draft with none is
 * as before.
 */
export async function exportDocx(
  html: string,
  title: string,
  isFree: boolean,
  startingDraftFooter?: string | null,
  options: ExportBlankOptions = {},
): Promise<void> {
  // T-233: find and mark the blanks in the content as saved, the same text the
  // export warning counts (blanksInContent), then turn plain text into HTML.
  // The marks are single characters that never span a line break, so the
  // conversion keeps them whole; blankMarksToTags then makes them spans.
  const isPlainText = isPlainContent(html);
  const { marked, blanks } = markBlanks(
    missingAsBlanks(normaliseLineEnds(html)),
    options.findBlanks ?? findBlanks,
  );
  const markedHtml = isPlainText ? plainTextToHtml(marked) : marked;
  const paragraphs = htmlToDocxParagraphs(
    blankMarksToTags(markedHtml, '<span data-lawie-blank="">', '</span>'),
    isFree,
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, bottom: 1440, left: 2160, right: 1440 }, // 1.5" left (court standard)
          },
        },
        ...(blanks.length > 0 ? { headers: { default: draftHeader(blanks.length) } } : {}),
        ...(startingDraftFooter
          ? {
              footers: {
                default: new Footer({
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [
                        new TextRun({ text: startingDraftFooter, size: 16, color: '666666' }),
                      ],
                    }),
                  ],
                }),
              },
            }
          : {}),
        children: paragraphs,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const filename = `${title.replace(/[^a-zA-Z0-9\s-]/g, '').slice(0, 60)}.docx`;
  saveAs(blob, filename);
}

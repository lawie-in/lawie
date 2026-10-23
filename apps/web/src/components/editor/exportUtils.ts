import {
  blankContext,
  blankMarksToTags,
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
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableBorders,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { IParagraphOptions, IRunOptions } from 'docx';
import { saveAs } from 'file-saver';

import { missingAsBlanks, normaliseLineEnds } from './blankCount';

// T-483: the blank count lives in ./blankCount (no docx), re-exported for existing callers.
export { blanksInContent, missingAsBlanks } from './blankCount';

// T-233 review: plain text unless it starts with '<' after leading whitespace,
// as shared projectContent reads it (blanks.ts). textToHtml is aligned in T-274.
function isPlainContent(content: string): boolean {
  return !content.trimStart().startsWith('<');
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
 * downloadBlob / filenameFromDisposition moved to lib/download (T-436: the invoice PDFs use
 * them too, without this module's export code). Re-exported here so existing imports (the
 * PDF export, the T-381 annexures pack) keep working.
 */
export { downloadBlob, filenameFromDisposition } from '@/lib/download';

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
 * T-567 item 30 (Ajay, signed): the footer of every PDF and Word export. A
 * starting draft carries its own signed footer instead, so there is exactly
 * one (T-321).
 */
export const EXPORT_DISCLAIMER_FOOTER =
  'First draft generated with AI. Check it against the applicable law before filing. Lawie does not provide legal advice.';

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
      <div class="disclaimer">${escapeHtml(startingDraftFooter || EXPORT_DISCLAIMER_FOOTER)}</div>
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

/**
 * `style` (T-579, annexures only) adds size, colour etc. under the format; a
 * blank keeps its own bold, yellow and black over it. The draft export never
 * passes it, so its runs are as before.
 */
function textRun(text: string, fmt: RunFormat, style?: IRunOptions): TextRun {
  const opts: { -readonly [K in keyof IRunOptions]: IRunOptions[K] } = style
    ? { ...style, text }
    : { text };
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
 * text comes from the service with the document. Any other draft carries
 * EXPORT_DISCLAIMER_FOOTER, the same footer as the PDF (T-567 item 30).
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
        // T-567 item 30: every Word export carries one footer, as the PDF does.
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: startingDraftFooter || EXPORT_DISCLAIMER_FOOTER,
                    size: 16,
                    color: '666666',
                  }),
                ],
              }),
            ],
          }),
        },
        children: paragraphs,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const filename = `${title.replace(/[^a-zA-Z0-9\s-]/g, '').slice(0, 60)}.docx`;
  saveAs(blob, filename);
}

// ── T-579: the annexures pack as an editable Word file ──────────────────────
// The drafting service builds the annexures as HTML (buildAnnexuresHtml), the
// one source the PDF is rendered from. POST /documents/:id/annexures-pack
// ?format=html returns it; this turns it into a .docx with the same text, in
// the same order: one paragraph per block, real Word tables, a page break
// before each annexure after the first, and each annexure's own disclaimer
// line at its end, as in the PDF (AJ-579-M1). No page header or footer: the PDF
// has none. htmlToDocxParagraphs (the draft's export) is not used or changed.

/** Block-level tags; anything else is inline (text, strong, em, u, span, br). */
const ANNEX_BLOCK_TAGS = new Set([
  'p',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'table',
  'ul',
  'ol',
  'li',
  'tr',
  'td',
  'th',
  'tbody',
  'thead',
  'style',
]);

/** Numbered list config for `<ol>`; each list is its own instance, so it starts at 1. */
const ANNEX_NUMBERING_REF = 'lawie-annexure-numbered';

/** A4 width less the 1.5" left and 1" right margins, in twips. */
const ANNEX_TEXT_WIDTH = 11906 - 2160 - 1440;

type AnnexBlock = Paragraph | Table;

interface AnnexContext {
  /** The next block starts a new page (the annexure's page-break class). */
  breakBefore: boolean;
  /** `<ol>` lists seen, for their numbering instance. */
  lists: number;
}

type InlineItem = { text: string; fmt: RunFormat } | { br: true };

function isAnnexBlock(node: Node): boolean {
  return (
    node.nodeType === Node.ELEMENT_NODE &&
    ANNEX_BLOCK_TAGS.has((node as Element).tagName.toLowerCase())
  );
}

function hasClass(el: Element, name: string): boolean {
  return el.classList.contains(name);
}

/** The inline content of a node as text and line breaks, with the format passed down. */
function collectInline(node: Node, fmt: RunFormat, out: InlineItem[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? '';
    if (text) out.push({ text, fmt });
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === 'br') {
    out.push({ br: true });
    return;
  }
  const inner: RunFormat = { ...fmt };
  if (tag === 'strong' || tag === 'b') inner.bold = true;
  if (tag === 'em' || tag === 'i') inner.italics = true;
  if (tag === 'u') inner.underline = true;
  if (el.hasAttribute('data-lawie-blank')) inner.blank = true;
  el.childNodes.forEach((child) => collectInline(child, inner, out));
}

/**
 * Inline items to runs, with white space folded as a browser does: runs of
 * spaces, tabs and line ends become one space, and none at the start or end of
 * a line. Other characters (no-break spaces, underscores) are kept as they are.
 */
function inlineRuns(items: InlineItem[], style?: IRunOptions): TextRun[] {
  const runs: TextRun[] = [];
  let line: { text: string; fmt: RunFormat }[] = [];
  const flushLine = () => {
    const last = line[line.length - 1];
    if (last) last.text = last.text.replace(/ $/, '');
    for (const seg of line) if (seg.text) runs.push(textRun(seg.text, seg.fmt, style));
    line = [];
  };
  let atStart = true;
  for (const item of items) {
    if ('br' in item) {
      flushLine();
      runs.push(new TextRun({ break: 1 }));
      atStart = true;
      continue;
    }
    let text = item.text.replace(/[ \t\n\r\f]+/g, ' ');
    if (atStart) text = text.replace(/^ /, '');
    if (!text) continue;
    line.push({ text, fmt: item.fmt });
    atStart = text.endsWith(' ');
  }
  flushLine();
  return runs;
}

function hasVisibleText(items: InlineItem[]): boolean {
  return items.some((i) => !('br' in i) && /[^ \t\n\r\f]/.test(i.text));
}

function alignmentOf(el: HTMLElement): IParagraphOptions['alignment'] {
  const align = el.style.textAlign;
  if (align === 'center') return AlignmentType.CENTER;
  if (align === 'right') return AlignmentType.RIGHT;
  if (align === 'justify') return AlignmentType.JUSTIFIED;
  return undefined;
}

function annexParagraph(ctx: AnnexContext, options: IParagraphOptions): Paragraph {
  if (!ctx.breakBefore) return new Paragraph(options);
  ctx.breakBefore = false;
  return new Paragraph({ ...options, pageBreakBefore: true });
}

/** One block element with only inline content, as one paragraph styled as the PDF CSS does. */
function annexLeafParagraph(el: HTMLElement, ctx: AnnexContext): Paragraph {
  const tag = el.tagName.toLowerCase();
  const items: InlineItem[] = [];
  el.childNodes.forEach((child) => collectInline(child, {}, items));

  let base: RunFormat = {};
  let style: IRunOptions | undefined;
  const opts: { -readonly [K in keyof IParagraphOptions]: IParagraphOptions[K] } = {
    alignment: alignmentOf(el),
  };
  if (/^h[1-6]$/.test(tag)) {
    base = { bold: true };
    if (tag === 'h2') {
      style = { allCaps: true };
      opts.alignment = opts.alignment ?? AlignmentType.CENTER;
    }
    opts.spacing = { before: 160, after: 100 };
  } else if (hasClass(el, 'annexure-label')) {
    base = { bold: true, underline: true };
    style = { size: 20 };
    opts.alignment = AlignmentType.CENTER;
  } else if (hasClass(el, 'disclaimer')) {
    style = { size: 18, color: '666666' };
    opts.alignment = AlignmentType.CENTER;
    opts.border = { top: { style: BorderStyle.SINGLE, size: 4, color: '999999', space: 4 } };
    opts.spacing = { before: 480 };
  } else if (hasClass(el, 'notary-title')) {
    base = { bold: true };
    opts.alignment = AlignmentType.CENTER;
  } else if (hasClass(el, 'stamp-placeholder')) {
    base = { italics: true };
    style = { size: 20, color: '999999' };
    opts.alignment = AlignmentType.CENTER;
  } else if (hasClass(el, 'sig-line')) {
    // The PDF's signature rule (an empty bordered box): a ruled empty line.
    opts.border = { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 1 } };
    opts.indent = { right: Math.round(ANNEX_TEXT_WIDTH * 0.1) };
  }
  if (hasClass(el, 'indent')) opts.indent = { left: 480 };

  const runs = inlineRuns(
    items.map((i) => ('br' in i ? i : { text: i.text, fmt: { ...base, ...i.fmt } })),
    style,
  );
  return annexParagraph(ctx, { ...opts, children: runs });
}

/** "30%" from an element's own width, as a Word percentage width. */
function percentWidth(el: HTMLElement): `${number}%` | undefined {
  const m = /^(\d+(?:\.\d+)?)%$/.exec(el.style.width.trim());
  return m ? (`${Number(m[1])}%` as `${number}%`) : undefined;
}

function annexTable(el: HTMLTableElement, ctx: AnnexContext): AnnexBlock[] {
  const out: AnnexBlock[] = [];
  if (ctx.breakBefore) out.push(annexParagraph(ctx, { children: [] }));
  // Layout tables (the signature blocks) have no borders in the PDF.
  const layout = /border\s*:\s*none/i.test(el.getAttribute('style') ?? '');
  const line = { style: BorderStyle.SINGLE, size: 4, color: '000000' } as const;
  const borders = layout
    ? TableBorders.NONE
    : {
        top: line,
        bottom: line,
        left: line,
        right: line,
        insideHorizontal: line,
        insideVertical: line,
      };

  const htmlRows = Array.from(el.rows);
  const columns = Math.max(
    1,
    ...htmlRows.map((r) => Array.from(r.cells).reduce((n, c) => n + Math.max(1, c.colSpan), 0)),
  );
  // Column widths from the first full row's cell widths; the rest share what is left.
  const firstRow = htmlRows.find(
    (r) => Array.from(r.cells).reduce((n, c) => n + Math.max(1, c.colSpan), 0) === columns,
  );
  const pct: (number | undefined)[] = firstRow
    ? Array.from(firstRow.cells).map((c) => {
        const w = percentWidth(c);
        return w ? parseFloat(w) : undefined;
      })
    : [];
  const fixed = pct.reduce<number>((n, p) => n + (p ?? 0), 0);
  const open = Array.from({ length: columns }, (_, i) => pct[i]).filter(
    (p) => p === undefined,
  ).length;
  const share = open > 0 ? Math.max(0, 100 - fixed) / open : 0;
  const columnWidths = Array.from({ length: columns }, (_, i) =>
    Math.round(((pct[i] ?? share) / 100) * ANNEX_TEXT_WIDTH),
  );

  const rows = htmlRows.map(
    (tr) =>
      new TableRow({
        children: Array.from(tr.cells).map((cell) => {
          const header = cell.tagName.toLowerCase() === 'th';
          const cellCtx: AnnexContext = { breakBefore: false, lists: ctx.lists };
          let children = annexBlocks(cell, cellCtx, header ? { bold: true } : {});
          ctx.lists = cellCtx.lists;
          if (children.length === 0 || !(children[children.length - 1] instanceof Paragraph)) {
            // A Word cell must end with a paragraph.
            children = [...children, new Paragraph({ children: [] })];
          }
          const width = percentWidth(cell);
          return new TableCell({
            children,
            ...(cell.colSpan > 1 ? { columnSpan: cell.colSpan } : {}),
            ...(width ? { width: { size: width, type: WidthType.PERCENTAGE } } : {}),
            ...(header
              ? { shading: { fill: 'F0F0F0', type: ShadingType.CLEAR, color: 'auto' } }
              : {}),
            ...(layout ? {} : { margins: { top: 60, bottom: 60, left: 115, right: 115 } }),
          });
        }),
      }),
  );
  out.push(
    new Table({
      rows,
      borders,
      width: { size: '100%', type: WidthType.PERCENTAGE },
      columnWidths,
    }),
  );
  return out;
}

/**
 * The blocks of a container, in order. Inline content between blocks becomes a
 * paragraph of its own; a lone <br> between blocks is an empty line, as in the
 * PDF. `base` is the format the container gives its text (bold in a <th>).
 */
function annexBlocks(container: Element, ctx: AnnexContext, base: RunFormat = {}): AnnexBlock[] {
  const out: AnnexBlock[] = [];
  let pending: Node[] = [];

  const flush = () => {
    if (pending.length === 0) return;
    const items: InlineItem[] = [];
    pending.forEach((n) => collectInline(n, base, items));
    pending = [];
    if (hasVisibleText(items)) {
      out.push(annexParagraph(ctx, { children: inlineRuns(items) }));
    } else if (items.some((i) => 'br' in i)) {
      out.push(annexParagraph(ctx, { children: [] }));
    }
  };

  container.childNodes.forEach((node) => {
    if (!isAnnexBlock(node)) {
      pending.push(node);
      return;
    }
    flush();
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === 'style') return;
    if (tag === 'table') {
      out.push(...annexTable(el as HTMLTableElement, ctx));
      return;
    }
    if (tag === 'ul' || tag === 'ol') {
      const instance = tag === 'ol' ? ++ctx.lists : 0;
      el.childNodes.forEach((li) => {
        if (li.nodeType !== Node.ELEMENT_NODE || (li as Element).tagName.toLowerCase() !== 'li')
          return;
        const items: InlineItem[] = [];
        li.childNodes.forEach((c) => collectInline(c, base, items));
        out.push(
          annexParagraph(ctx, {
            children: inlineRuns(items),
            ...(tag === 'ul'
              ? { bullet: { level: 0 } }
              : { numbering: { reference: ANNEX_NUMBERING_REF, level: 0, instance } }),
          }),
        );
      });
      return;
    }
    if (tag === 'div' && hasClass(el, 'page-break')) ctx.breakBefore = true;
    const hasBlockChild = Array.from(el.childNodes).some(isAnnexBlock);
    if (!hasBlockChild && tag !== 'div') {
      out.push(annexLeafParagraph(el, ctx));
      return;
    }
    if (!hasBlockChild) {
      // A div of text (label, disclaimer, notary title, stamp line) or an empty
      // rule (sig-line). Other empty divs print nothing.
      const items: InlineItem[] = [];
      el.childNodes.forEach((c) => collectInline(c, {}, items));
      if (hasVisibleText(items) || hasClass(el, 'sig-line')) out.push(annexLeafParagraph(el, ctx));
      return;
    }
    const inner = annexBlocks(el, ctx, base);
    if (hasClass(el, 'notary-box')) {
      // The PDF's bordered notary box: a one-cell table with a heavier border.
      const box = { style: BorderStyle.SINGLE, size: 12, color: '000000' } as const;
      if (inner.length === 0 || !(inner[inner.length - 1] instanceof Paragraph)) {
        inner.push(new Paragraph({ children: [] }));
      }
      out.push(
        new Table({
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: inner,
                  margins: { top: 120, bottom: 120, left: 120, right: 120 },
                }),
              ],
            }),
          ],
          borders: { top: box, bottom: box, left: box, right: box },
          width: { size: '100%', type: WidthType.PERCENTAGE },
        }),
      );
      return;
    }
    out.push(...inner);
  });
  flush();
  return out;
}

/**
 * AJ-579-M2: in the Word file every `[To be confirmed: …]` marker and every run
 * of three or more underscores is a blank, highlighted as the draft's DOCX marks
 * its blanks. The draft's own exceptions (a line of only underscores is a
 * signature line) are not applied here: an annexure's lone `___________` (an
 * amount, an address not given) is a detail still to be filled in.
 */
export const findAnnexureBlanks: FindBlanks = (text) => {
  const blanks = findBlanks(text);
  const taken = blanks.map((b) => [b.start, b.end] as const);
  for (const m of text.matchAll(/_{3,}/g)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (taken.some(([a, b]) => start < b && end > a)) continue;
    blanks.push({
      start,
      end,
      text: m[0],
      label: UNDERSCORE_BLANK_LABEL,
      context: blankContext(text, { start, end }),
    });
  }
  return blanks.sort((a, b) => a.start - b.start);
};

/**
 * The annexures HTML (from ?format=html) as Word blocks, in order. The text is
 * the HTML's own text; only the blanks get the blank styling.
 */
export function annexuresHtmlToDocxBlocks(html: string): AnnexBlock[] {
  const { marked } = markBlanks(html, findAnnexureBlanks);
  const tagged = blankMarksToTags(marked, '<span data-lawie-blank="">', '</span>');
  const doc = new DOMParser().parseFromString(tagged, 'text/html');
  return annexBlocks(doc.body, { breakBefore: false, lists: 0 });
}

/** The annexures Word document: Times New Roman 12pt, 1.5" left margin, as the PDF. */
export function annexuresDocxDocument(html: string): Document {
  return new Document({
    styles: {
      default: {
        document: {
          run: { font: { ascii: 'Times New Roman', hAnsi: 'Times New Roman' }, size: 24 },
          paragraph: { spacing: { after: 80, line: 360 } },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: ANNEX_NUMBERING_REF,
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, bottom: 1440, left: 2160, right: 1440 }, // 1.5" left, as the PDF
          },
        },
        children: annexuresHtmlToDocxBlocks(html),
      },
    ],
  });
}

/** `<title>_annexures.docx`, the title cleaned as for the PDF (AnnexuresCard). */
export function annexuresDocxFilename(title: string): string {
  return `${title.replace(/[^a-zA-Z0-9\s-]/g, '').slice(0, 60)}_annexures.docx`;
}

/**
 * T-579: save the annexures as an editable Word file. `html` is the `html` of
 * POST /documents/:id/annexures-pack?format=html; `filename` is its `filename`
 * when given, else `<title>_annexures.docx`.
 */
export async function exportAnnexuresDocx(
  html: string,
  title: string,
  filename?: string,
): Promise<void> {
  const blob = await Packer.toBlob(annexuresDocxDocument(html));
  saveAs(blob, filename || annexuresDocxFilename(title));
}

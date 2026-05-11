import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';

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
export async function exportPdf(html: string, title: string, _isFree: boolean): Promise<void> {
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
      }
    </style>
    <div class="lawie-pdf-root">
      ${html}
      <div class="disclaimer">AI-assisted draft &mdash; verify with applicable law before filing. Lawie does not provide legal advice.</div>
    </div>
  `;

  const filename = `${title.replace(/[^a-zA-Z0-9\s-]/g, '').slice(0, 60)}.pdf`;

  await html2pdf()
    .set({
      // 1.5" left, 1" top/bottom/right — court convention (matches server margins)
      margin: [25.4, 25.4, 25.4, 38.1], // mm: 1in, 1in, 1in, 1.5in
      filename,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    })
    .from(wrapper)
    .save();
}

/**
 * Parse simple HTML into docx paragraphs.
 * Handles: <h1-h3>, <p>, <strong>, <em>, <u>, <br>, <li>.
 */
function htmlToDocxParagraphs(html: string, _isFree: boolean): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  function processNode(node: Node): TextRun[] {
    const runs: TextRun[] = [];
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (text) runs.push(new TextRun(text));
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();

      if (tag === 'br') {
        runs.push(new TextRun({ break: 1 }));
        return runs;
      }

      const childRuns: TextRun[] = [];
      el.childNodes.forEach((child) => childRuns.push(...processNode(child)));

      for (const run of childRuns) {
        const opts: Record<string, unknown> = {};
        if (tag === 'strong' || tag === 'b') opts.bold = true;
        if (tag === 'em' || tag === 'i') opts.italics = true;
        if (tag === 'u') opts.underline = {};

        if (Object.keys(opts).length > 0) {
          runs.push(
            new TextRun({
              text: (run as TextRun & { text?: string }).text ?? '',
              ...opts,
            }),
          );
        } else {
          runs.push(run);
        }
      }
    }
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
 * Export the editor HTML content as a DOCX file.
 * Uses the `docx` package (client-side generation).
 */
export async function exportDocx(html: string, title: string, isFree: boolean): Promise<void> {
  const paragraphs = htmlToDocxParagraphs(html, isFree);

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, bottom: 1440, left: 2160, right: 1440 }, // 1.5" left (court standard)
          },
        },
        children: paragraphs,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const filename = `${title.replace(/[^a-zA-Z0-9\s-]/g, '').slice(0, 60)}.docx`;
  saveAs(blob, filename);
}

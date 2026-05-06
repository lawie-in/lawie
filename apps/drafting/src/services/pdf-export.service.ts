/**
 * Server-side PDF Export — generates court-formatted A4 PDF from document content.
 *
 * Uses Puppeteer for rendering (same pipeline as scripts/export-pdf.ts).
 * Court standard: A4, Times New Roman 12pt, double-spaced, 1.5" left margin.
 */
import puppeteer from 'puppeteer';

const WATERMARK_TEXT = 'DRAFT — Lawie Free Tier';

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

/**
 * Convert plain/markdown document content to court-formatted HTML.
 */
export function contentToHtml(content: string, isFree: boolean): string {
  // Split into paragraphs
  const paragraphs = content.split('\n\n');
  let body = '';

  for (const para of paragraphs) {
    if (!para.trim()) continue;
    const lines = para.split('\n');
    const lineHtml = lines.map((l) => markdownBoldItalic(l)).join('<br>');

    // Detect headings (all-caps short lines, or known heading patterns)
    const isHeading =
      lines.length === 1 &&
      lines[0].length < 120 &&
      (lines[0] === lines[0].toUpperCase() ||
        lines[0].startsWith('PRAYER') ||
        lines[0].startsWith('VERIFICATION') ||
        lines[0].startsWith('DEMAND') ||
        lines[0].startsWith('APPLICATION FOR') ||
        lines[0].startsWith('THROUGH:') ||
        lines[0].startsWith('LEGAL NOTICE') ||
        lines[0].startsWith('Subject:'));

    if (isHeading) {
      body += `<p class="heading">${lineHtml}</p>\n`;
    } else {
      body += `<p>${lineHtml}</p>\n`;
    }
  }

  // AI disclaimer footer
  body += `<div class="disclaimer">AI-assisted draft &mdash; verify with applicable law before filing. Lawie does not provide legal advice.</div>`;

  const watermark = isFree ? `<div class="watermark">${escapeHtml(WATERMARK_TEXT)}</div>` : '';

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
  .watermark {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-45deg);
    font-size: 60pt;
    color: rgba(0, 0, 0, 0.06);
    white-space: nowrap;
    pointer-events: none;
    z-index: 9999;
  }
  strong { font-weight: bold; }
  em { font-style: italic; }
</style>
</head>
<body>
${watermark}
${body}
</body>
</html>`;
}

/**
 * Render HTML to PDF buffer using Puppeteer.
 */
export async function renderPdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

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
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

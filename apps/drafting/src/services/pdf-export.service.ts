/**
 * Server-side PDF Export — generates court-formatted A4 PDF from document content.
 *
 * Uses Puppeteer for rendering (same pipeline as scripts/export-pdf.ts).
 * Court standard: A4, Times New Roman 12pt, double-spaced, 1.5" left margin.
 */
import puppeteer from 'puppeteer';

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
 * Convert document content to court-formatted HTML.
 * Handles two content formats:
 *  - TipTap HTML (saved after user edits): embedded directly, no escaping
 *  - Plain text / markdown (original AI output): converted to paragraphs
 */
export function contentToHtml(content: string, _isFree: boolean): string {
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
</style>
</head>
<body>
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
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
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

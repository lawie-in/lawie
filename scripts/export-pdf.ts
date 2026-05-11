#!/usr/bin/env npx ts-node
/**
 * Lawie — CLI Export: SSE response.json → advocate-review PDF
 *
 * Reads smoke-test .response.json files (SSE event logs), extracts the
 * template_sections event, assembles into court-formatted HTML, and
 * renders to A4 PDF via Puppeteer.
 *
 * Usage:
 *   npx ts-node scripts/export-pdf.ts <dir-or-file> [--clean]
 *
 * Examples:
 *   npx ts-node scripts/export-pdf.ts scripts/test-templates/results/20260506-133018
 *   npx ts-node scripts/export-pdf.ts scripts/test-templates/results/20260506-133018/01-bail_regular.response.json
 *   npx ts-node scripts/export-pdf.ts scripts/test-templates/results/20260506-133018 --clean
 *
 * Output: <input-dir>/pdfs/<filename>.pdf
 *
 * --clean flag omits the free-tier watermark (for advocate review pack).
 */

import fs from 'fs';
import path from 'path';

import { marked } from 'marked';
import puppeteer from 'puppeteer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TemplateSection {
  section_id: string;
  type: string;
  content: string;
  alignment?: string;
  style?: string;
}

interface ParsedResponse {
  sections: TemplateSection[];
  checklist: string[];
  docId: string | null;
  sectionsCited: string[];
}

// ---------------------------------------------------------------------------
// SSE Parser
// ---------------------------------------------------------------------------

export function parseSSEResponse(raw: string): ParsedResponse {
  const result: ParsedResponse = {
    sections: [],
    checklist: [],
    docId: null,
    sectionsCited: [],
  };

  const lines = raw.split('\n');
  let currentEvent = '';

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      currentEvent = line.slice(7).trim();
      continue;
    }

    if (!line.startsWith('data: ')) continue;

    const jsonStr = line.slice(6);
    try {
      const data = JSON.parse(jsonStr);

      if (currentEvent === 'template_sections' && data.sections) {
        result.sections = data.sections;
      } else if (currentEvent === 'checklist' && data.items) {
        result.checklist = data.items;
      } else if (currentEvent === 'done') {
        result.docId = data.docId ?? null;
        result.sectionsCited = data.sectionsCited ?? [];
      }
      // Reset event after processing (SSE events are one-shot)
      if (currentEvent) currentEvent = '';
    } catch {
      // Text chunks (no event prefix) — skip, we use template_sections
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// HTML Renderer
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function markdownToHtml(text: string): string {
  // Escape HTML entities first, then parse inline markdown (**bold**, *italic*, `code`).
  // Pre-escaping prevents XSS while still letting marked handle formatting tokens.
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return marked.parseInline(escaped) as string;
}

function renderSectionToHtml(section: TemplateSection): string {
  const alignment = section.alignment || 'left';
  const style = section.style || '';

  // Disclaimer gets special footer styling
  if (style === 'footer_small_gray' || section.section_id === 'disclaimer') {
    const html = markdownToHtml(section.content);
    return `<div class="disclaimer">${html.replace(/\n/g, '<br>')}</div>`;
  }

  // Split content into paragraphs
  const paragraphs = section.content.split('\n\n');
  let html = '';

  for (const para of paragraphs) {
    if (!para.trim()) continue;

    // Horizontal rule — Ajay audit A4
    if (para.trim() === '---') {
      html += '<hr>\n';
      continue;
    }

    const lines = para.split('\n');
    const lineHtml = lines.map((l) => markdownToHtml(l)).join('<br>');

    // Detect headings (all-caps lines, short lines that look like titles)
    const isHeading =
      lines.length === 1 &&
      lines[0].length < 120 &&
      (lines[0] === lines[0].toUpperCase() ||
        lines[0].startsWith('PRAYER') ||
        lines[0].startsWith('VERIFICATION') ||
        lines[0].startsWith('DEMAND') ||
        lines[0].startsWith('LEGAL NOTICE') ||
        lines[0].startsWith('APPLICATION FOR') ||
        lines[0].startsWith('THROUGH:') ||
        lines[0].startsWith('Subject:'));

    if (isHeading) {
      html += `<p class="heading" style="text-align:${alignment}">${lineHtml}</p>\n`;
    } else {
      html += `<p style="text-align:${alignment}">${lineHtml}</p>\n`;
    }
  }

  return html;
}

export function renderToHtml(parsed: ParsedResponse, _clean: boolean): string {
  let body = '';

  for (const section of parsed.sections) {
    body += renderSectionToHtml(section);
  }

  // Checklist
  if (parsed.checklist.length > 0) {
    body += '<div class="checklist">';
    body += '<p class="heading">FILING CHECKLIST</p>';
    body += '<ul>';
    for (const item of parsed.checklist) {
      body += `<li>${escapeHtml(item)}</li>`;
    }
    body += '</ul>';
    body += '</div>';
  }

  // Watermark permanently removed — founder + CLO policy: no watermark on any output

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
    text-indent: 0;
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

  .checklist {
    margin-top: 2em;
    page-break-inside: avoid;
  }

  .checklist ul {
    list-style-type: square;
    padding-left: 1.5em;
    line-height: 1.8;
  }

  .checklist li {
    margin-bottom: 0.3em;
  }

  strong {
    font-weight: bold;
  }

  em {
    font-style: italic;
  }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// PDF Generator
// ---------------------------------------------------------------------------

async function generatePdf(html: string, outputPath: string): Promise<void> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    await page.pdf({
      path: outputPath,
      format: 'A4',
      margin: {
        top: '1in',
        bottom: '1in',
        left: '1.5in',
        right: '1in',
      },
      printBackground: true,
      displayHeaderFooter: false,
    });
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// CLI Entry Point
// ---------------------------------------------------------------------------

async function processFile(
  filePath: string,
  outputDir: string,
  clean: boolean,
): Promise<{ name: string; size: number }> {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = parseSSEResponse(raw);

  if (parsed.sections.length === 0) {
    throw new Error(`No template_sections found in ${filePath}`);
  }

  const html = renderToHtml(parsed, clean);
  const baseName = path.basename(filePath, '.response.json');
  const pdfPath = path.join(outputDir, `${baseName}.pdf`);

  await generatePdf(html, pdfPath);

  const stats = fs.statSync(pdfPath);
  return { name: baseName, size: stats.size };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const clean = args.includes('--clean');
  const inputArg = args.find((a) => !a.startsWith('--'));

  if (!inputArg) {
    console.error('Usage: npx ts-node scripts/export-pdf.ts <dir-or-file> [--clean]');
    process.exit(1);
  }

  const inputPath = path.resolve(inputArg);

  if (!fs.existsSync(inputPath)) {
    console.error(`Path not found: ${inputPath}`);
    process.exit(1);
  }

  const isDir = fs.statSync(inputPath).isDirectory();
  const files: string[] = [];

  if (isDir) {
    const entries = fs.readdirSync(inputPath);
    for (const entry of entries) {
      if (entry.endsWith('.response.json')) {
        files.push(path.join(inputPath, entry));
      }
    }
    files.sort();
  } else {
    files.push(inputPath);
  }

  if (files.length === 0) {
    console.error('No .response.json files found.');
    process.exit(1);
  }

  const outputDir = isDir
    ? path.join(inputPath, 'pdfs')
    : path.join(path.dirname(inputPath), 'pdfs');
  fs.mkdirSync(outputDir, { recursive: true });

  console.log('================================================================');
  console.log(' Lawie · PDF Export');
  console.log(` Input:  ${inputPath}`);
  console.log(` Output: ${outputDir}`);
  console.log(` Clean:  ${clean ? 'yes (no watermark)' : 'no (watermark applied)'}`);
  console.log(` Files:  ${files.length}`);
  console.log('================================================================');
  console.log('');

  let success = 0;
  let failed = 0;

  for (const file of files) {
    const basename = path.basename(file, '.response.json');
    process.stdout.write(`  ${basename} ... `);

    try {
      const result = await processFile(file, outputDir, clean);
      const sizeKb = (result.size / 1024).toFixed(1);
      console.log(`✓ ${sizeKb} KB`);
      success++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`✗ ${msg}`);
      failed++;
    }
  }

  console.log('');
  console.log('================================================================');
  console.log(` Done. ${success} exported, ${failed} failed.`);
  console.log(` PDFs at: ${outputDir}`);
  console.log('================================================================');

  if (failed > 0) process.exit(1);
}

// Only run when executed directly (not when imported by tests)
if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}

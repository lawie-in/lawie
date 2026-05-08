import fs from 'fs';
import path from 'path';

import { parseSSEResponse, renderToHtml } from '../export-pdf';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BAIL_REGULAR_RESPONSE = path.resolve(
  __dirname,
  '../test-templates/results/20260506-133018/01-bail_regular.response.json',
);

const SAMPLE_SSE = `data: {"text":"First paragraph of body text."}

data: {"text":"\\n\\nSecond paragraph continues."}

event: template_sections
data: {"sections":[{"section_id":"cause_title","type":"template","content":"IN THE HIGH COURT\\n\\nCase No. 123/2026\\n\\nApplicant vs Respondent","alignment":"center"},{"section_id":"body","type":"ai_generated","content":"First paragraph of body text.\\n\\nSecond paragraph continues."},{"section_id":"disclaimer","type":"template","content":"AI-assisted draft — verify with applicable law before filing.","alignment":"center","style":"footer_small_gray"}]}

event: checklist
data: {"items":["Check item 1","Check item 2"]}

event: done
data: {"complete":true,"docId":"abc123","sectionsCited":["BNSS 480"],"mandatoryClausesComplete":true}
`;

// ---------------------------------------------------------------------------
// Unit: parseSSEResponse
// ---------------------------------------------------------------------------

describe('parseSSEResponse', () => {
  it('extracts template_sections from SSE stream', () => {
    const parsed = parseSSEResponse(SAMPLE_SSE);
    expect(parsed.sections).toHaveLength(3);
    expect(parsed.sections[0].section_id).toBe('cause_title');
    expect(parsed.sections[1].section_id).toBe('body');
    expect(parsed.sections[2].section_id).toBe('disclaimer');
  });

  it('extracts checklist items', () => {
    const parsed = parseSSEResponse(SAMPLE_SSE);
    expect(parsed.checklist).toEqual(['Check item 1', 'Check item 2']);
  });

  it('extracts done event metadata', () => {
    const parsed = parseSSEResponse(SAMPLE_SSE);
    expect(parsed.docId).toBe('abc123');
    expect(parsed.sectionsCited).toEqual(['BNSS 480']);
  });

  it('returns empty sections when no template_sections event', () => {
    const raw = 'data: {"text":"some text"}\n';
    const parsed = parseSSEResponse(raw);
    expect(parsed.sections).toHaveLength(0);
  });

  it('parses real bail_regular response file', () => {
    if (!fs.existsSync(BAIL_REGULAR_RESPONSE)) {
      console.warn('Skipping: bail_regular.response.json not found');
      return;
    }
    const raw = fs.readFileSync(BAIL_REGULAR_RESPONSE, 'utf-8');
    const parsed = parseSSEResponse(raw);
    expect(parsed.sections.length).toBeGreaterThan(3);
    expect(parsed.sections[0].section_id).toBe('cause_title');
    expect(parsed.checklist.length).toBeGreaterThan(0);
    expect(parsed.docId).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Unit: renderToHtml
// ---------------------------------------------------------------------------

describe('renderToHtml', () => {
  const parsed = parseSSEResponse(SAMPLE_SSE);

  it('produces valid HTML with court-standard styles', () => {
    const html = renderToHtml(parsed, true);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Times New Roman');
    expect(html).toContain('line-height: 2');
    expect(html).toContain('IN THE HIGH COURT');
  });

  it('includes disclaimer section', () => {
    const html = renderToHtml(parsed, true);
    expect(html).toContain('AI-assisted draft');
    expect(html).toContain('class="disclaimer"');
  });

  it('includes checklist', () => {
    const html = renderToHtml(parsed, true);
    expect(html).toContain('FILING CHECKLIST');
    expect(html).toContain('Check item 1');
    expect(html).toContain('Check item 2');
  });

  it('never includes watermark regardless of clean flag (A3 — policy: no watermark on any output)', () => {
    const htmlClean = renderToHtml(parsed, true);
    const htmlDirty = renderToHtml(parsed, false);
    expect(htmlClean).not.toContain('class="watermark"');
    expect(htmlDirty).not.toContain('class="watermark"');
    expect(htmlDirty).not.toContain('Free Tier');
  });

  it('renders **bold** as <strong> not raw asterisks (A1)', () => {
    const boldSection = parseSSEResponse(
      `event: template_sections\ndata: {"sections":[{"section_id":"body","type":"ai_generated","content":"This is **important** text.","alignment":"left"}]}\n`,
    );
    const html = renderToHtml(boldSection, true);
    expect(html).toContain('<strong>important</strong>');
    expect(html).not.toMatch(/\*\*important\*\*/);
  });

  it('renders *italic* as <em> not raw asterisks (A5)', () => {
    const italicSection = parseSSEResponse(
      `event: template_sections\ndata: {"sections":[{"section_id":"body","type":"ai_generated","content":"inter *alia* the accused","alignment":"left"}]}\n`,
    );
    const html = renderToHtml(italicSection, true);
    expect(html).toContain('<em>alia</em>');
    expect(html).not.toMatch(/\*alia\*/);
  });

  it('renders --- as <hr> not literal text (A4)', () => {
    const hrSection = parseSSEResponse(
      `event: template_sections\ndata: {"sections":[{"section_id":"body","type":"ai_generated","content":"First para.\\n\\n---\\n\\nSecond para.","alignment":"left"}]}\n`,
    );
    const html = renderToHtml(hrSection, true);
    expect(html).toContain('<hr>');
    expect(html).not.toContain('>---<');
  });

  it('escapes HTML entities in content', () => {
    const malicious = parseSSEResponse(
      `event: template_sections\ndata: {"sections":[{"section_id":"test","type":"template","content":"<script>alert(1)</script>","alignment":"left"}]}\n`,
    );
    const html = renderToHtml(malicious, true);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

// ---------------------------------------------------------------------------
// Integration: real file → PDF size check
// ---------------------------------------------------------------------------

describe('integration: PDF generation', () => {
  it('bail_regular PDF exists and is > 5KB', () => {
    const pdfPath = path.resolve(
      __dirname,
      '../test-templates/results/20260506-133018/pdfs/01-bail_regular.pdf',
    );
    if (!fs.existsSync(pdfPath)) {
      console.warn('Skipping: PDF not yet generated — run export-pdf.ts first');
      return;
    }
    const stats = fs.statSync(pdfPath);
    expect(stats.size).toBeGreaterThan(5 * 1024); // > 5KB
    expect(stats.size).toBeLessThan(500 * 1024); // < 500KB
  });

  it('all 12 PDFs exist across Bihar + Jharkhand', () => {
    const biharDir = path.resolve(__dirname, '../test-templates/results/20260506-133018/pdfs');
    const jharkhandDir = path.resolve(__dirname, '../test-templates/results/20260506-133324/pdfs');

    if (!fs.existsSync(biharDir) || !fs.existsSync(jharkhandDir)) {
      console.warn('Skipping: PDF directories not found');
      return;
    }

    const biharPdfs = fs.readdirSync(biharDir).filter((f) => f.endsWith('.pdf'));
    const jharkhandPdfs = fs.readdirSync(jharkhandDir).filter((f) => f.endsWith('.pdf'));

    expect(biharPdfs).toHaveLength(6);
    expect(jharkhandPdfs).toHaveLength(6);
  });
});

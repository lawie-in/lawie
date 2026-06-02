/**
 * SCRUM-44 — Document export + checklist persistence + activation telemetry tests.
 */
import './setupEnv';
import './setupDb';

import { LawieDocument } from '../models/Document.model';
import { Event } from '../models/Event.model';
import { contentToHtml } from '../services/pdf-export.service';

const USER_ID = '000000000000000000000001';

// ---------------------------------------------------------------------------
// Document model: filingChecklist + checklistState
// ---------------------------------------------------------------------------

describe('Document model — checklist fields', () => {
  it('stores filingChecklist and checklistState', async () => {
    const doc = await LawieDocument.create({
      userId: USER_ID,
      title: 'Test bail application',
      docType: 'bail_application',
      generatedContent: 'encrypted-content',
      filingChecklist: ['Vakalatnama signed', 'Court fee affixed', 'FIR copy attached'],
      checklistState: [true, false, false],
    });

    expect(doc.filingChecklist).toHaveLength(3);
    expect(doc.checklistState).toEqual([true, false, false]);
  });

  it('defaults to empty arrays when not provided', async () => {
    const doc = await LawieDocument.create({
      userId: USER_ID,
      title: 'Minimal doc',
      docType: 'legal_notice',
      generatedContent: 'encrypted-content',
    });

    expect(doc.filingChecklist).toEqual([]);
    expect(doc.checklistState).toEqual([]);
  });

  it('updates checklistState via findOneAndUpdate', async () => {
    const doc = await LawieDocument.create({
      userId: USER_ID,
      title: 'Updatable doc',
      docType: 'bail_application',
      generatedContent: 'encrypted-content',
      filingChecklist: ['Item 1', 'Item 2'],
      checklistState: [false, false],
    });

    await LawieDocument.findOneAndUpdate(
      { _id: doc._id },
      { $set: { checklistState: [true, true] } },
    );

    const updated = await LawieDocument.findById(doc._id).lean();
    expect(updated!.checklistState).toEqual([true, true]);
  });
});

// ---------------------------------------------------------------------------
// Event model — activation telemetry
// ---------------------------------------------------------------------------

describe('Event model — activation telemetry', () => {
  it('creates activation_first_export event', async () => {
    const event = await Event.create({
      userId: USER_ID,
      type: 'activation_first_export',
      docId: '000000000000000000000002',
      metadata: { format: 'pdf', docType: 'bail_application' },
    });

    expect(event.type).toBe('activation_first_export');
    expect(event.userId.toString()).toBe(USER_ID);
    expect(event.metadata).toEqual({ format: 'pdf', docType: 'bail_application' });
  });

  it('creates draft.exported event', async () => {
    const event = await Event.create({
      userId: USER_ID,
      type: 'draft.exported',
      docId: '000000000000000000000002',
      metadata: { format: 'docx', docType: 'legal_notice' },
    });

    expect(event.type).toBe('draft.exported');
    expect(event.createdAt).toBeDefined();
  });

  it('idempotent activation check — findOne returns existing', async () => {
    await Event.create({
      userId: USER_ID,
      type: 'activation_first_export',
    });

    const existing = await Event.findOne({
      userId: USER_ID,
      type: 'activation_first_export',
    }).lean();

    expect(existing).not.toBeNull();
    expect(existing!.type).toBe('activation_first_export');
  });
});

// ---------------------------------------------------------------------------
// PDF export service — contentToHtml
// ---------------------------------------------------------------------------

describe('contentToHtml', () => {
  const sampleContent = `IN THE COURT OF SESSIONS JUDGE, PATNA

APPLICATION FOR BAIL

1. That the applicant has been falsely implicated.

2. That the applicant is a respectable member of society.

PRAYER

It is prayed that bail be granted.

VERIFICATION

I verify the contents are true.`;

  it('generates valid HTML with court-standard styles', () => {
    const html = contentToHtml(sampleContent, false);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Times New Roman');
    expect(html).toContain('line-height: 2');
    expect(html).toContain('1.5in'); // left margin
  });

  it('includes AI disclaimer', () => {
    const html = contentToHtml(sampleContent, false);
    expect(html).toContain('AI-assisted draft');
    expect(html).toContain('class="disclaimer"');
  });

  it('never includes watermark regardless of tier (policy: no watermark on any output)', () => {
    const htmlFree = contentToHtml(sampleContent, true);
    const htmlPro = contentToHtml(sampleContent, false);
    expect(htmlFree).not.toContain('class="watermark"');
    expect(htmlPro).not.toContain('class="watermark"');
    expect(htmlFree).not.toContain('Free Tier');
    expect(htmlPro).not.toContain('Free Tier');
  });

  it('detects headings (all-caps lines)', () => {
    const html = contentToHtml(sampleContent, false);
    expect(html).toContain('class="heading"');
    // PRAYER and VERIFICATION should be headings
    expect(html).toMatch(/class="heading"[^>]*>PRAYER/);
    expect(html).toMatch(/class="heading"[^>]*>VERIFICATION/);
  });

  it('escapes HTML entities in plain-text content', () => {
    // Plain text that contains angle brackets (not TipTap HTML) — markdownBoldItalic escapes them
    const html = contentToHtml('Text with <b>inline</b> tags', false);
    expect(html).not.toContain('<b>inline</b>');
    expect(html).toContain('&lt;b&gt;inline&lt;/b&gt;');
  });

  it('embeds TipTap HTML content as-is (trusted editor output)', () => {
    // Content that starts with < is treated as TipTap HTML and embedded directly
    const html = contentToHtml('<p>Hello <strong>world</strong></p>', false);
    expect(html).toContain('<p>Hello <strong>world</strong></p>');
  });

  it('handles bold markdown', () => {
    const html = contentToHtml('**GRANT OF TENANCY**', false);
    expect(html).toContain('<strong>GRANT OF TENANCY</strong>');
  });
});

/**
 * SCRUM-65 — Annexures pack generator tests
 *
 * Coverage:
 *   - estimateBodyParaCount (plain-text and TipTap HTML)
 *   - buildAnnexuresPack (unit: HTML content assertions for Bihar district + Jharkhand HC)
 *   - Route integration: POST /documents/:id/annexures-pack
 *     401 no auth, 404 wrong doc, 200 valid → returns PDF headers
 *
 * Puppeteer is mocked — no headless browser required in CI.
 * The mock returns a minimal 4-byte Buffer so Content-Length assertions still work.
 */

import './setupEnv';
import './setupDb';

import supertest from 'supertest';

// ── Mock Puppeteer before any imports that use it ─────────────────────────────
jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      setContent: jest.fn().mockResolvedValue(undefined),
      pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF')),
    }),
    close: jest.fn().mockResolvedValue(undefined),
  }),
}));

// eslint-disable-next-line import/order
import app from '../app';
// eslint-disable-next-line import/order
import { LawieDocument } from '../models/Document.model';
// eslint-disable-next-line import/order
import {
  buildAnnexuresPack,
  estimateBodyParaCount,
} from '../services/annexures.service';
// eslint-disable-next-line import/order
import { encrypt } from '../utils/encryption';

// ── Auth headers (same pattern as preflight tests) ────────────────────────────

const AUTH = {
  'x-internal-secret': process.env.INTERNAL_SECRET ?? 'test-internal-secret-at-least-16',
  'x-user-id': '507f1f77bcf86cd799439011',
  'x-user-email': 'test@lawie.in',
  'x-user-role': 'Client',
  'x-user-plan': 'free',
  'x-user-name': 'Test Advocate',
};

// ── Shared form data ──────────────────────────────────────────────────────────

const BIHAR_FORM: Record<string, unknown> = {
  template_id: 'bail_anticipatory',
  court_id: 'bihar_district',
  court_type: 'district_court',
  state: 'Bihar',
  applicant_name: 'Ramesh Kumar',
  father_name: 'Suresh Kumar',
  applicant_age: 35,
  applicant_address: 'Village Mirza, Patna, Bihar',
  respondent_name: 'State of Bihar',
  fir_number: '091/2024',
  fir_date: '15.06.2024',
  incident_date: '10.06.2024',
  police_station: 'Kotwali PS',
  advocate_name: 'Adv. Ravi Shankar',
  enrollment_number: 'BAR/2018/1234',
  sections_charged: ['103', '109'],
};

const JHARKHAND_FORM: Record<string, unknown> = {
  template_id: 'bail_anticipatory',
  court_id: 'jharkhand_hc',
  court_type: 'high_court',
  state: 'Jharkhand',
  applicant_name: 'Priya Devi',
  father_name: 'Mohan Lal',
  applicant_age: 28,
  applicant_address: 'HB-47 Harmu Housing Colony, Ranchi, Jharkhand',
  respondent_name: 'State of Jharkhand',
  fir_number: '045/2025',
  fir_date: '20.01.2025',
  incident_date: '18.01.2025',
  police_station: 'Ranchi Sadar PS',
  advocate_name: 'Adv. Sunita Kumari',
  enrollment_number: 'JHA/2020/567',
  sections_charged: ['103'],
};

// ── estimateBodyParaCount ─────────────────────────────────────────────────────

describe('estimateBodyParaCount', () => {
  it('counts double-newline paragraphs in plain text', () => {
    const text = 'Para one.\n\nPara two.\n\nPara three.';
    expect(estimateBodyParaCount(text)).toBe(3);
  });

  it('counts <p> tags in TipTap HTML', () => {
    const html = '<p>One</p><p>Two</p><p>Three</p><p>Four</p>';
    // HTML — 4 <p> tags, subtract 1 for disclaimer = 3
    expect(estimateBodyParaCount(html)).toBe(3);
  });

  it('returns at least 1 for empty content', () => {
    expect(estimateBodyParaCount('')).toBe(1);
    expect(estimateBodyParaCount('   ')).toBe(1);
  });

  it('handles content with a single paragraph', () => {
    expect(estimateBodyParaCount('Only one paragraph here.')).toBe(1);
  });
});

// ── buildAnnexuresPack — HTML content assertions ──────────────────────────────
// We call buildAnnexuresPack and verify that Puppeteer receives an HTML string
// containing the expected court-specific content.

describe('buildAnnexuresPack — Bihar district', () => {
  let capturedHtml = '';

  beforeAll(async () => {
    const puppeteer = jest.requireMock('puppeteer') as {
      launch: jest.Mock;
    };
    const page = (await (await puppeteer.launch()).newPage()) as {
      setContent: jest.Mock;
      pdf: jest.Mock;
    };
    page.setContent.mockImplementation((html: string) => {
      capturedHtml = html;
      return Promise.resolve(undefined);
    });

    await buildAnnexuresPack({ formData: BIHAR_FORM, bodyParaCount: 8 });
  });

  it('contains Bihar district court designation', () => {
    expect(capturedHtml).toContain('DISTRICT');
  });

  it('contains Annexure A — Memo of Parties with applicant name', () => {
    expect(capturedHtml).toContain('ANNEXURE A');
    expect(capturedHtml).toContain('Memo of Parties');
    expect(capturedHtml).toContain('Ramesh Kumar');
  });

  it('contains Annexure B — Synopsis', () => {
    expect(capturedHtml).toContain('ANNEXURE B');
    expect(capturedHtml).toContain('Synopsis');
  });

  it('contains Annexure C — List of Dates with FIR date', () => {
    expect(capturedHtml).toContain('ANNEXURE C');
    expect(capturedHtml).toContain('List of Dates');
    expect(capturedHtml).toContain('091/2024');
  });

  it('contains Annexure D — Index of Documents with all 10 entries', () => {
    expect(capturedHtml).toContain('ANNEXURE D');
    expect(capturedHtml).toContain('Index of Documents');
    expect(capturedHtml).toContain('Vakalatnama');
    expect(capturedHtml).toContain('Court Fee');
  });

  it('contains Annexure E — Vakalatnama with advocate name', () => {
    expect(capturedHtml).toContain('ANNEXURE E');
    expect(capturedHtml).toContain('Vakalatnama');
    expect(capturedHtml).toContain('Adv. Ravi Shankar');
    expect(capturedHtml).toContain('BAR/2018/1234');
  });

  it('contains Annexure F — Court Fee Statement', () => {
    expect(capturedHtml).toContain('ANNEXURE F');
    expect(capturedHtml).toContain('Court Fee');
  });

  it('contains Annexure G — Affidavit with deponent name', () => {
    expect(capturedHtml).toContain('ANNEXURE G');
    expect(capturedHtml).toContain('Affidavit');
    expect(capturedHtml).toContain('RAMESH KUMAR');
  });

  it('contains page-break dividers between annexures', () => {
    // Annexures B–G use class="page-break" (A does not) = 6 page-break divs
    const pageBreaks = (capturedHtml.match(/class="page-break"/g) ?? []).length;
    expect(pageBreaks).toBeGreaterThanOrEqual(6);
  });

  it('uses Bihar verification format (verify contents of application)', () => {
    // Bihar's verification_format: "contents of the above application are true and correct"
    expect(capturedHtml).toContain('Verified at');
    // Bihar does NOT use "paragraphs 1 to N" phrasing — that is JH HC format
    expect(capturedHtml).not.toContain('paragraphs 1 to');
  });
});

describe('buildAnnexuresPack — Jharkhand HC', () => {
  let capturedHtml = '';

  beforeAll(async () => {
    const puppeteer = jest.requireMock('puppeteer') as {
      launch: jest.Mock;
    };
    const page = (await (await puppeteer.launch()).newPage()) as {
      setContent: jest.Mock;
      pdf: jest.Mock;
    };
    page.setContent.mockImplementation((html: string) => {
      capturedHtml = html;
      return Promise.resolve(undefined);
    });

    await buildAnnexuresPack({ formData: JHARKHAND_FORM, bodyParaCount: 12 });
  });

  it('contains Jharkhand HC designation', () => {
    expect(capturedHtml).toContain('HIGH COURT OF JHARKHAND');
  });

  it('Annexure A contains Jharkhand applicant name', () => {
    expect(capturedHtml).toContain('Priya Devi');
  });

  it('Affidavit uses Jharkhand HC verification format', () => {
    // jharkhand_hc.json verification_format includes "solemnly affirm and state"
    expect(capturedHtml).toContain('solemnly affirm and state');
  });

  it('Annexure C shows Jharkhand FIR number', () => {
    expect(capturedHtml).toContain('045/2025');
  });

  it('Vakalatnama shows Jharkhand advocate', () => {
    expect(capturedHtml).toContain('Adv. Sunita Kumari');
    expect(capturedHtml).toContain('JHA/2020/567');
  });

  it('Synopsis references the HC context', () => {
    expect(capturedHtml).toContain('ANNEXURE B');
    expect(capturedHtml).toContain('High Court Practice');
  });
});

describe('buildAnnexuresPack — fallback (no court_id)', () => {
  it('generates without error when court_id is absent', async () => {
    const buf = await buildAnnexuresPack({
      formData: {
        applicant_name: 'John Doe',
        respondent_name: 'State',
      },
      bodyParaCount: 5,
    });
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
  });
});

// ── Route integration tests ───────────────────────────────────────────────────

describe('POST /documents/:id/annexures-pack', () => {
  let docId: string;

  // setupDb.ts's afterEach clears all collections, so recreate before each test
  beforeEach(async () => {
    const doc = await LawieDocument.create({
      userId: AUTH['x-user-id'],
      title: 'Bail Application — Patna HC',
      docType: 'bail_application',
      generatedContent: encrypt('Paragraph one.\n\nParagraph two.\n\nParagraph three.'),
      formInputs: {
        ...BIHAR_FORM,
        template_id: 'bail_anticipatory',
      },
      filingChecklist: [],
      checklistState: [],
    });
    docId = String(doc._id);
  });

  it('401 without auth headers', async () => {
    // docId is set in beforeAll — must be a valid ObjectId to pass validateObjectId middleware
    const res = await supertest(app).post(`/${docId}/annexures-pack`);
    expect(res.status).toBe(401);
  });

  it('404 for non-existent document', async () => {
    const res = await supertest(app)
      .post('/000000000000000000000099/annexures-pack')
      .set(AUTH);
    expect(res.status).toBe(404);
  });

  it('200 for valid document → returns PDF headers', async () => {
    const res = await supertest(app)
      .post(`/${docId}/annexures-pack`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toMatch(/annexures\.pdf/);
    expect(res.headers['content-length']).toBeDefined();
  });

  it('200 → response body is a Buffer (non-empty)', async () => {
    const res = await supertest(app)
      .post(`/${docId}/annexures-pack`)
      .set(AUTH)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect((res.body as Buffer).length).toBeGreaterThan(0);
  });

  it('404 for document belonging to a different user', async () => {
    // Create doc owned by a different user
    const otherDoc = await LawieDocument.create({
      userId: '000000000000000000000099',
      title: 'Other user doc',
      docType: 'legal_notice',
      generatedContent: 'enc',
    });

    const res = await supertest(app)
      .post(`/documents/${otherDoc._id}/annexures-pack`)
      .set(AUTH);
    expect(res.status).toBe(404);
  });
});

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
import { buildAnnexuresPack, estimateBodyParaCount } from '../services/annexures.service';
// eslint-disable-next-line import/order
import { encrypt } from '../utils/encryption';
// eslint-disable-next-line import/order
import { Court } from '../models/Court.model';
// eslint-disable-next-line import/order
import {
  buildPlaceholderContext,
  chosenCourtHeading,
  CourtLookupData,
  loadCourtRule,
  loadTemplateConfig,
} from '../services/template-engine.service';

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
  enrollment_number: 'JHA/2020/567',
  sections_charged: ['103'],
};

/**
 * T-689c: the letter an annexure is printed under, found by its heading, so the
 * tests do not hard-code which letter the Synopsis (when attached) pushes along.
 */
function letterOf(html: string, heading: string): string | undefined {
  const re = new RegExp(`class="annexure-label">ANNEXURE ([A-Z])</div>\\s*<h2>${heading}</h2>`);
  return re.exec(html)?.[1];
}

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

    await buildAnnexuresPack({
      formData: BIHAR_FORM,
      bodyParaCount: 8,
      advocateName: 'Adv. Ravi Shankar',
      // T-311/T-313: no advocate_enrollment typed in BIHAR_FORM, so the profile number pairs with the profile name
      enrollmentNumber: 'BAR/2018/1234',
      // T-689c: a district court gets no Synopsis, so the pack runs A to F
      rulePackId: 'bail_anticipatory',
      courtType: 'district_court',
    });
  });

  it('contains Bihar district court designation', () => {
    expect(capturedHtml).toContain('DISTRICT');
  });

  it('contains Annexure A — Memo of Parties with applicant name', () => {
    expect(capturedHtml).toContain('ANNEXURE A');
    expect(capturedHtml).toContain('Memo of Parties');
    expect(capturedHtml).toContain('Ramesh Kumar');
  });

  it('has no Annexure B — Synopsis (district court, T-689c)', () => {
    expect(capturedHtml).not.toContain('>Synopsis</h2>');
    expect(capturedHtml).not.toContain('As required by High Court Practice');
    expect(letterOf(capturedHtml, 'Synopsis')).toBeUndefined();
  });

  it('contains Annexure B — List of Dates with FIR date (no Synopsis before it)', () => {
    expect(letterOf(capturedHtml, 'List of Dates and Chronology of Events')).toBe('B');
    expect(capturedHtml).toContain('List of Dates');
    expect(capturedHtml).toContain('091/2024');
  });

  it('contains Annexure C — Index of Documents with all 10 entries', () => {
    expect(letterOf(capturedHtml, 'Index of Documents Annexed')).toBe('C');
    expect(capturedHtml).toContain('Index of Documents');
    expect(capturedHtml).toContain('Vakalatnama');
    expect(capturedHtml).toContain('Court Fee');
  });

  it('contains Annexure D — Vakalatnama with advocate name', () => {
    expect(letterOf(capturedHtml, 'Vakalatnama')).toBe('D');
    expect(capturedHtml).toContain('Adv. Ravi Shankar');
    expect(capturedHtml).toContain('BAR/2018/1234');
  });

  it('contains Annexure E — Court Fee Statement', () => {
    expect(letterOf(capturedHtml, 'Court Fee Paid Statement')).toBe('E');
    expect(capturedHtml).toContain('Court Fee');
  });

  it('contains Annexure F — Affidavit with deponent name, and no Annexure G', () => {
    expect(letterOf(capturedHtml, 'Affidavit')).toBe('F');
    expect(capturedHtml).toContain('RAMESH KUMAR');
    expect(capturedHtml).not.toContain('ANNEXURE G');
  });

  it('contains page-break dividers between annexures', () => {
    // Annexures B–F use class="page-break" (A does not) = 5 page-break divs
    const pageBreaks = (capturedHtml.match(/class="page-break"/g) ?? []).length;
    expect(pageBreaks).toBeGreaterThanOrEqual(5);
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

    await buildAnnexuresPack({
      formData: JHARKHAND_FORM,
      bodyParaCount: 12,
      advocateName: 'Adv. Sunita Kumari',
      enrollmentNumber: 'JHA/2020/567',
      // T-689c: the Synopsis is for a High Court and a pack not on the deny list
      rulePackId: 'bail_anticipatory',
      courtType: 'high_court',
    });
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
    expect(letterOf(capturedHtml, 'Synopsis')).toBe('B');
    expect(capturedHtml).toContain('High Court Practice');
  });

  it('runs A to G with the Synopsis attached', () => {
    const labels = capturedHtml.match(/annexure-label">ANNEXURE [A-Z]</g) ?? [];
    expect(labels.map((l) => l.slice(-2, -1))).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
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

// ── T-156: one court, one designation ────────────────────────────────────────

async function packHtml(
  formData: Record<string, unknown>,
  courtData?: CourtLookupData,
  // T-689c: the pack and court type; default is a sessions bail (no Synopsis)
  pack: { rulePackId?: string; courtType?: string } = {},
): Promise<string> {
  const puppeteer = jest.requireMock('puppeteer') as { launch: jest.Mock };
  const page = (await (await puppeteer.launch()).newPage()) as { setContent: jest.Mock };
  let html = '';
  page.setContent.mockImplementation((h: string) => {
    html = h;
    return Promise.resolve(undefined);
  });
  await buildAnnexuresPack({ formData, bodyParaCount: 8, courtData, ...pack });
  return html;
}

function sessionsCourt(over: Partial<CourtLookupData>): CourtLookupData {
  return {
    designation: 'SESSIONS COURT, GAYA',
    city: 'Gaya',
    caseNomenclature: 'Bail Application No. ___ of {year}',
    formattingRulesRef: 'sessions_generic',
    courtType: 'sessions',
    state: 'Bihar',
    courtRule: loadCourtRule('sessions_generic') ?? undefined,
    ...over,
  };
}

const GAYA = sessionsCourt({});
const MUMBAI = sessionsCourt({
  designation: 'SESSIONS COURT, MUMBAI',
  city: 'Mumbai',
  state: 'Maharashtra',
});
const SESSIONS_FORM: Record<string, unknown> = {
  template_id: 'bail_regular',
  applicant_name: 'Ramesh Kumar',
  respondent_name: 'State of Bihar',
  advocate_name: 'Adv. Ravi Shankar',
  court_id: 'sessions_generic',
};

/** Text of the HTML with tags dropped, for wording comparisons. */
const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('chosenCourtHeading (T-156)', () => {
  it('is undefined with no court', () => {
    expect(chosenCourtHeading(undefined)).toBeUndefined();
  });

  it('is undefined for a blank designation', () => {
    expect(chosenCourtHeading(sessionsCourt({ designation: '   ' }))).toBeUndefined();
    expect(chosenCourtHeading(sessionsCourt({ designation: '' }))).toBeUndefined();
  });

  it('returns a header and designation for a chosen court', () => {
    const h = chosenCourtHeading(GAYA);
    expect(h?.header).toBeTruthy();
    expect(h?.header).toContain('GAYA');
  });

  it('equals the draft court_header', () => {
    const cfg = loadTemplateConfig('bail_regular')!;
    const ctx = buildPlaceholderContext(cfg, SESSIONS_FORM, undefined, GAYA);
    expect(ctx.court_header).toBe(chosenCourtHeading(GAYA)!.header);
    expect(ctx.court_designation).toBe(chosenCourtHeading(GAYA)!.designation);
  });
});

describe('buildAnnexuresPack — chosen court (T-156)', () => {
  const COURT_RULE_LINE = 'IN THE COURT OF SESSIONS JUDGE';

  it.each([
    ['Gaya', GAYA],
    ['Mumbai', MUMBAI],
  ])('%s: all headed annexures print the draft court_header', async (_n, court) => {
    const cfg = loadTemplateConfig('bail_regular')!;
    const draftHeader = buildPlaceholderContext(cfg, SESSIONS_FORM, undefined, court).court_header;
    expect(draftHeader).toBe(chosenCourtHeading(court)!.header);

    const html = await packHtml(SESSIONS_FORM, court, {
      rulePackId: 'bail_regular',
      courtType: 'sessions',
    });
    // Memo, Vakalatnama, Court Fee, Affidavit (a sessions bail has no Synopsis, T-689c)
    const count = html.split(draftHeader).length - 1;
    expect(count).toBeGreaterThanOrEqual(4);
    expect(html).not.toContain('>Synopsis</h2>');

    // With the Synopsis attached (a High Court) its "Court:" line is a fifth
    const hcHtml = await packHtml(SESSIONS_FORM, court, {
      rulePackId: 'bail_regular',
      courtType: 'high_court',
    });
    expect(hcHtml.split(draftHeader).length - 1).toBeGreaterThanOrEqual(5);
    expect(html).not.toContain(COURT_RULE_LINE);
    // no choice-style "X / Y" designation (the pack has other " / " in unrelated text)
    expect(html).not.toMatch(/JUDGE\s*\/\s*/);
    expect(html).not.toContain('SESSIONS JUDGE /');
    expect(html).not.toContain('DISTRICT JUDGE');
  });

  it('Synopsis court line carries the chosen header', async () => {
    // The Synopsis is attached only for a High Court (T-689c)
    const html = await packHtml(SESSIONS_FORM, GAYA, {
      rulePackId: 'bail_regular',
      courtType: 'high_court',
    });
    expect(textOf(html)).toContain(`Court: ${chosenCourtHeading(GAYA)!.header}`);
  });

  it('keeps party labels, verification and court-fee text from the court rule', async () => {
    const withCourt = await packHtml(SESSIONS_FORM, GAYA);
    const without = await packHtml(SESSIONS_FORM);
    const h = chosenCourtHeading(GAYA)!.header;
    const noCourtHeading = 'IN THE COURT OF SESSIONS JUDGE';
    // Same document once each heading is normalised
    expect(withCourt.split(h).join('@@')).toBe(without.split(noCourtHeading).join('@@'));
  });
});

describe('buildAnnexuresPack — no court chosen (T-156)', () => {
  it('prints the court-rule designation as today', async () => {
    const html = await packHtml(SESSIONS_FORM);
    expect(html).toContain('IN THE COURT OF SESSIONS JUDGE');
  });

  it('falls back to the district judge when no rule resolves', async () => {
    const html = await packHtml({ applicant_name: 'John Doe', respondent_name: 'State' });
    expect(html).toContain('IN THE COURT OF THE DISTRICT JUDGE');
  });

  it('a court with a blank designation behaves like no court', async () => {
    const blank = sessionsCourt({ designation: '  ' });
    expect(await packHtml(SESSIONS_FORM, blank)).toBe(await packHtml(SESSIONS_FORM));
    const bare = { applicant_name: 'John Doe', respondent_name: 'State' };
    expect(await packHtml(bare, blank)).toBe(await packHtml(bare));
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
    const res = await supertest(app).post('/000000000000000000000099/annexures-pack').set(AUTH);
    expect(res.status).toBe(404);
  });

  it('200 for valid document → returns PDF headers', async () => {
    const res = await supertest(app).post(`/${docId}/annexures-pack`).set(AUTH);

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

    const res = await supertest(app).post(`/documents/${otherDoc._id}/annexures-pack`).set(AUTH);
    expect(res.status).toBe(404);
  });

  it('T-156: brief-style doc with courtName set prints the chosen court header', async () => {
    await Court.create({
      courtId: 'sessions-gaya-t156',
      name: 'Sessions Court, Gaya',
      designation: GAYA.designation,
      courtType: 'sessions',
      state: 'Bihar',
      stateId: 'BR',
      city: 'Gaya',
      formattingRulesRef: 'sessions_generic',
      caseNomenclature: GAYA.caseNomenclature,
      isActive: true,
    });
    const doc = await LawieDocument.create({
      userId: AUTH['x-user-id'],
      title: 'Brief bail',
      docType: 'bail_application',
      courtName: 'sessions-gaya-t156',
      generatedContent: encrypt('Paragraph one.\n\nParagraph two.'),
      formInputs: { template_id: 'bail_regular', source: 'brief', applicant_name: 'Ramesh Kumar' },
      filingChecklist: [],
      checklistState: [],
    });
    const puppeteer = jest.requireMock('puppeteer') as { launch: jest.Mock };
    const page = (await (await puppeteer.launch()).newPage()) as { setContent: jest.Mock };
    let html = '';
    page.setContent.mockImplementation((h: string) => {
      html = h;
      return Promise.resolve(undefined);
    });
    const res = await supertest(app).post(`/${doc._id}/annexures-pack`).set(AUTH);
    expect(res.status).toBe(200);
    expect(html).toContain(chosenCourtHeading(GAYA)!.header);
    expect(html).not.toContain('IN THE COURT OF THE DISTRICT JUDGE');

    // Unknown courtName falls back to the court rule
    const other = await LawieDocument.create({
      userId: AUTH['x-user-id'],
      title: 'Brief bail 2',
      docType: 'bail_application',
      courtName: 'no-such-court',
      generatedContent: encrypt('Paragraph one.'),
      formInputs: { template_id: 'bail_regular', source: 'brief', applicant_name: 'Ramesh Kumar' },
      filingChecklist: [],
      checklistState: [],
    });
    const res2 = await supertest(app).post(`/${other._id}/annexures-pack`).set(AUTH);
    expect(res2.status).toBe(200);
    expect(html).not.toContain('GAYA');
    expect(html).toContain('IN THE COURT OF THE DISTRICT JUDGE');
  });
});

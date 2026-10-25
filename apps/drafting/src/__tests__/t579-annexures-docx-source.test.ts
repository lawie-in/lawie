/**
 * T-579 — annexures as an editable Word file: the drafting side.
 *
 * 1. One source, two renderers: buildAnnexuresHtml(...).html is byte-identical to
 *    what buildAnnexuresPack hands renderPdf; 7 parts A..G; each ends with the
 *    signed T-317 line (AJ-579-M1/M2); file name helpers.
 * 2. POST /documents/:id/annexures-pack?format=html (JSON for the web's Word export)
 *    next to the unchanged PDF path.
 *
 * All expectations are typed by hand from the ticket and the signed rulings, not
 * captured from the code. renderPdf (Chromium) is mocked.
 */
import './setupEnv';
import './setupDb';

import mongoose from 'mongoose';
import supertest from 'supertest';

const mockRenderPdf = jest.fn();
jest.mock('../services/pdf-export.service', () => ({
  renderPdf: (...args: unknown[]) => mockRenderPdf(...args),
}));

// eslint-disable-next-line import/order
import app from '../app';
// eslint-disable-next-line import/order
import { LawieDocument } from '../models/Document.model';
// eslint-disable-next-line import/order
import { Event } from '../models/Event.model';
// eslint-disable-next-line import/order
import {
  annexuresFileTitle,
  annexuresFilename,
  buildAnnexuresHtml,
  buildAnnexuresPack,
} from '../services/annexures.service';
// eslint-disable-next-line import/order
import { sealFormInputs } from '../utils/case-details';
// eslint-disable-next-line import/order
import { encrypt } from '../utils/encryption';

const DISCLAIMER =
  '<div class="disclaimer">Draft prepared by Lawie from the details you entered. Check it before filing. Lawie does not provide legal advice.</div>';
const DISCLAIMER_TEXT =
  'Draft prepared by Lawie from the details you entered. Check it before filing. Lawie does not provide legal advice.';

const AUTH = {
  'x-internal-secret': process.env.INTERNAL_SECRET ?? 'test-internal-secret-at-least-16',
  'x-user-id': '507f1f77bcf86cd799439011',
  'x-user-email': 'test@lawie.in',
  'x-user-role': 'Client',
  'x-user-plan': 'free',
  'x-user-name': 'Test Advocate',
};

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
  ...BIHAR_FORM,
  court_id: 'jharkhand_hc',
  court_type: 'high_court',
  state: 'Jharkhand',
  applicant_name: 'Priya Devi',
  respondent_name: 'State of Jharkhand',
};
// Sparse: no address, no FIR details, so the pack carries blanks.
const SPARSE_FORM: Record<string, unknown> = {
  template_id: 'bail_anticipatory',
  court_id: 'bihar_district',
  court_type: 'district_court',
  state: 'Bihar',
  applicant_name: 'Ramesh Kumar',
  respondent_name: 'State of Bihar',
};

const INPUTS = [
  { formData: BIHAR_FORM, bodyParaCount: 8, advocateName: 'Adv. Ravi Shankar' },
  { formData: JHARKHAND_FORM, bodyParaCount: 12, enrollmentNumber: 'JHA/2020/567' },
  { formData: SPARSE_FORM },
  { formData: { ...BIHAR_FORM, applicant_name: 'राम कुमार <b>&</b>' }, bodyParaCount: 3 },
];

beforeEach(() => {
  mockRenderPdf.mockReset();
  mockRenderPdf.mockResolvedValue(Buffer.from('%PDF-fake'));
});

describe('T-579 1: buildAnnexuresHtml is the single source', () => {
  it.each(INPUTS.map((input, i) => [i, input] as const))(
    'input %i: .html is byte-identical to what buildAnnexuresPack passes renderPdf',
    async (_i, input) => {
      const pdf = await buildAnnexuresPack(input);
      expect(pdf.toString()).toBe('%PDF-fake');
      expect(mockRenderPdf).toHaveBeenCalledTimes(1);
      const passed = mockRenderPdf.mock.calls[0][0] as string;
      const built = buildAnnexuresHtml(input);
      expect(built.html).toBe(passed);
      expect(Buffer.from(built.html, 'utf8').equals(Buffer.from(passed, 'utf8'))).toBe(true);
    },
  );

  it('the body of .html is the 7 parts joined with a newline, inside the wrapper', () => {
    const { html, parts } = buildAnnexuresHtml(INPUTS[0]);
    expect(html.startsWith('<!DOCTYPE html>') || html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain(parts.map((p) => p.html).join('\n'));
  });

  it('has exactly 7 parts, A to G, with the signed labels and headings in order', () => {
    const { parts } = buildAnnexuresHtml(INPUTS[0]);
    expect(parts.map((p) => [p.label, p.heading])).toEqual([
      ['ANNEXURE A', 'Memo of Parties'],
      ['ANNEXURE B', 'Synopsis'],
      ['ANNEXURE C', 'List of Dates and Chronology of Events'],
      ['ANNEXURE D', 'Index of Documents Annexed'],
      ['ANNEXURE E', 'Vakalatnama'],
      ['ANNEXURE F', 'Court Fee Paid Statement'],
      ['ANNEXURE G', 'Affidavit'],
    ]);
  });

  it.each(INPUTS.map((input, i) => [i, input] as const))(
    'input %i: every part prints its label and heading and ends with its own T-317 line',
    (_i, input) => {
      const { parts, html } = buildAnnexuresHtml(input);
      for (const p of parts) {
        expect(p.html).toContain(p.label);
        expect(p.html).toContain(p.heading);
        // the disclaimer is the last element inside the annexure's wrapper div
        expect(p.html.trimEnd().endsWith(`${DISCLAIMER}\n</div>`)).toBe(true);
        expect(p.html.split(DISCLAIMER_TEXT)).toHaveLength(2); // once per part
      }
      expect(html.split(DISCLAIMER_TEXT)).toHaveLength(8); // 7 in the document
    },
  );

  it('annexures B to G start on a new page, A does not', () => {
    const { parts } = buildAnnexuresHtml(INPUTS[0]);
    expect(parts[0].html).not.toContain('page-break');
    for (const p of parts.slice(1)) expect(p.html).toContain('page-break');
  });
});

describe('T-579 1b: file names', () => {
  it('annexuresFileTitle strips everything but letters, digits, spaces and hyphens', () => {
    expect(annexuresFileTitle('Bail Application — Patna HC')).toBe('Bail Application  Patna HC');
    expect(annexuresFileTitle('A/B\\C:D*E?"F<G>H|I.J_K,L')).toBe('ABCDEFGHIJKL');
    expect(annexuresFileTitle('state-of v. राम')).toBe('state-of v ');
    expect(annexuresFileTitle('')).toBe('');
  });

  it('cuts at 60 characters (after stripping)', () => {
    const long = 'a'.repeat(100);
    expect(annexuresFileTitle(long)).toBe('a'.repeat(60));
    // specials are removed first, so they do not use up the 60
    expect(annexuresFileTitle('!'.repeat(30) + 'b'.repeat(70))).toBe('b'.repeat(60));
    expect(annexuresFileTitle('c'.repeat(60))).toHaveLength(60);
    expect(annexuresFileTitle('c'.repeat(59))).toHaveLength(59);
  });

  it('annexuresFilename adds _annexures and the extension', () => {
    expect(annexuresFilename('Bail Application — Patna HC', 'pdf')).toBe(
      'Bail Application  Patna HC_annexures.pdf',
    );
    expect(annexuresFilename('Bail Application — Patna HC', 'docx')).toBe(
      'Bail Application  Patna HC_annexures.docx',
    );
    expect(annexuresFilename('x'.repeat(80), 'docx')).toBe(`${'x'.repeat(60)}_annexures.docx`);
    expect(annexuresFilename('', 'pdf')).toBe('_annexures.pdf');
  });
});

// ── 2. the route ─────────────────────────────────────────────────────────────

async function makeDoc(overrides: Record<string, unknown> = {}): Promise<string> {
  const doc = await LawieDocument.create({
    userId: AUTH['x-user-id'],
    title: 'Bail Application — Patna HC',
    docType: 'bail_application',
    generatedContent: encrypt('Paragraph one.\n\nParagraph two.\n\nParagraph three.'),
    formInputs: { ...BIHAR_FORM },
    filingChecklist: [],
    checklistState: [],
    ...overrides,
  });
  return String(doc._id);
}

describe('T-579 2: POST /documents/:id/annexures-pack?format=html', () => {
  it('401 without auth, PDF and html alike', async () => {
    const id = await makeDoc();
    expect((await supertest(app).post(`/${id}/annexures-pack`)).status).toBe(401);
    expect((await supertest(app).post(`/${id}/annexures-pack?format=html`)).status).toBe(401);
  });

  it("404 for a missing document and for another user's document", async () => {
    const other = await makeDoc({ userId: '507f1f77bcf86cd799439099' });
    for (const q of ['', '?format=html']) {
      const missing = await supertest(app)
        .post(`/000000000000000000000099/annexures-pack${q}`)
        .set(AUTH);
      expect(missing.status).toBe(404);
      const notMine = await supertest(app).post(`/${other}/annexures-pack${q}`).set(AUTH);
      expect(notMine.status).toBe(404);
    }
    expect(mockRenderPdf).not.toHaveBeenCalled();
  });

  it('422 party_details_missing is the same body for both formats, and nothing is recorded', async () => {
    const now = new Date();
    const ins = await LawieDocument.collection.insertOne({
      userId: new mongoose.Types.ObjectId(AUTH['x-user-id']),
      title: 'Draft',
      docType: 'bail_application',
      rulePackId: 'plaint_recovery',
      generatedContent: encrypt('Paragraph one.\n\nParagraph two.'),
      formInputsEnc: sealFormInputs({ template_id: 'plaint_recovery', source: 'brief' }),
      filingChecklist: [],
      checklistState: [],
      exportedAs: [],
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    });
    const id = String(ins.insertedId);
    const expected = {
      error: 'party_details_missing',
      missing: ['client_name', 'opposite_party_name'],
    };
    for (const q of ['', '?format=html']) {
      const res = await supertest(app).post(`/${id}/annexures-pack${q}`).set(AUTH);
      expect(res.status).toBe(422);
      expect(res.body).toEqual(expected);
    }
    expect(mockRenderPdf).not.toHaveBeenCalled();
    expect(await Event.countDocuments({ type: 'draft.exported' })).toBe(0);
  });

  it('200 JSON { title, filename, html } with the exact html the PDF is built from', async () => {
    const id = await makeDoc();
    const res = await supertest(app).post(`/${id}/annexures-pack?format=html`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(Object.keys(res.body).sort()).toEqual(['filename', 'html', 'title']);
    expect(res.body.title).toBe('Bail Application — Patna HC');
    expect(res.body.filename).toBe('Bail Application  Patna HC_annexures.docx');
    expect(res.body.html).toContain('ANNEXURE A');
    expect(res.body.html).toContain('ANNEXURE G');
    expect(res.body.html.split(DISCLAIMER_TEXT)).toHaveLength(8);
    // No Chromium on this path.
    expect(mockRenderPdf).not.toHaveBeenCalled();

    // Same document, PDF path: renderPdf receives the identical string.
    const pdf = await supertest(app).post(`/${id}/annexures-pack`).set(AUTH);
    expect(pdf.status).toBe(200);
    expect(mockRenderPdf).toHaveBeenCalledTimes(1);
    expect(mockRenderPdf.mock.calls[0][0]).toBe(res.body.html);
  });

  it('PDF path unchanged: application/pdf, attachment filename, length', async () => {
    const id = await makeDoc();
    const res = await supertest(app).post(`/${id}/annexures-pack`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="Bail Application  Patna HC_annexures.pdf"',
    );
    expect(res.headers['content-length']).toBe(String(Buffer.from('%PDF-fake').length));
  });

  it('an unknown or different format value gives the PDF', async () => {
    const id = await makeDoc();
    for (const q of ['?format=docx', '?format=pdf', '?format=HTML', '?format=', '?format=html,x']) {
      mockRenderPdf.mockClear();
      const res = await supertest(app).post(`/${id}/annexures-pack${q}`).set(AUTH);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/pdf/);
      expect(mockRenderPdf).toHaveBeenCalledTimes(1);
    }
  });

  it('records draft.exported with the format, and marks exportedAs annexures, for both', async () => {
    const id = await makeDoc();
    await supertest(app).post(`/${id}/annexures-pack?format=html`).set(AUTH).expect(200);
    let events = await Event.find({ type: 'draft.exported', docId: id }).lean();
    expect(events).toHaveLength(1);
    expect(events[0].metadata).toMatchObject({
      format: 'annexures_docx',
      docType: 'bail_application',
    });
    expect((await LawieDocument.findById(id).lean())!.exportedAs).toEqual(['annexures']);

    await supertest(app).post(`/${id}/annexures-pack`).set(AUTH).expect(200);
    events = await Event.find({ type: 'draft.exported', docId: id }).sort({ _id: 1 }).lean();
    expect(events.map((e) => (e.metadata as { format: string }).format)).toEqual([
      'annexures_docx',
      'annexures_pdf',
    ]);
    // $addToSet: still one entry
    expect((await LawieDocument.findById(id).lean())!.exportedAs).toEqual(['annexures']);
  });

  it('no event and no exportedAs mark when the request is refused', async () => {
    await supertest(app)
      .post('/000000000000000000000099/annexures-pack?format=html')
      .set(AUTH)
      .expect(404);
    expect(await Event.countDocuments({ type: 'draft.exported' })).toBe(0);
  });

  it('the route does not log PII (title, names) on the html path', async () => {
    const id = await makeDoc();
    const spies = [
      jest.spyOn(console, 'log').mockImplementation(() => undefined),
      jest.spyOn(console, 'error').mockImplementation(() => undefined),
      jest.spyOn(console, 'warn').mockImplementation(() => undefined),
    ];
    try {
      await supertest(app).post(`/${id}/annexures-pack?format=html`).set(AUTH).expect(200);
      const logged = spies
        .flatMap((s) => s.mock.calls)
        .flat()
        .map(String)
        .join('\n');
      expect(logged).not.toContain('Ramesh');
      expect(logged).not.toContain('Patna');
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });

  it('the route has no per-route limiter: 15 calls as one user, both formats, all 200', async () => {
    const id = await makeDoc();
    for (let i = 0; i < 15; i++) {
      const q = i % 2 === 0 ? '?format=html' : '';
      const res = await supertest(app).post(`/${id}/annexures-pack${q}`).set(AUTH);
      expect(res.status).toBe(200);
      expect(res.headers['retry-after']).toBeUndefined();
    }
  });
});

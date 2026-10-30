/**
 * T-674 AC3 (R4), review r1 fix: a classic document's title, and the file names
 * of its downloads, never carry the court id.
 *
 * - creation: POST /generate-from-template (model mocked at the SDK, as the
 *   sibling generate tests do) titles the document `<pack name> — <label>`;
 *   typed name -> as typed. An unresolved id is now
 *   refused (T-686: 503 court_unavailable, no document), see below.
 * - downloads: PDF export Content-Disposition and the annexures PDF/DOCX
 *   filename and title (Chromium mocked at renderPdf).
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import courtsJson from '../config/courts/indian-courts.json';
import { AppSetting } from '../models/AppSetting.model';
import { Court } from '../models/Court.model';
import { LawieDocument } from '../models/Document.model';
import { _clearAppSettingsCache } from '../services/app-settings.service';
import { encrypt } from '../utils/encryption';
import { sdkAnswer } from './sdkStream';
import { createVerifiedUser } from './verifiedUser';

const mockMessagesStream = jest.fn();
jest.mock('@anthropic-ai/sdk', () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  require('./sdkStream').sdkModuleStub((...args: unknown[]) => mockMessagesStream(...args)),
);
const mockRenderPdf = jest.fn();
jest.mock('../services/pdf-export.service', () => ({
  ...jest.requireActual('../services/pdf-export.service'),
  renderPdf: (...args: unknown[]) => mockRenderPdf(...args),
}));

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd799439099';
const headers = () => ({
  'x-internal-secret': INTERNAL_SECRET,
  'x-user-id': USER_ID,
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
});

const FORM = {
  fir_number: '124/2026',
  fir_date: '2026-03-15',
  police_station: 'Kotwali, Patna',
  sections_charged: ['103'],
  currently_in_custody: 'yes_judicial',
  custody_since: '2026-03-15',
  state: 'bihar',
  court_type: 'sessions',
  court_name: 'up_district_lucknow',
  applicant_name: 'Ram Kumar',
  father_name: 'Shri Hari Kumar',
  applicant_age: '32',
  address: '123 Main St',
  language: 'en',
  facts_narrative: 'The accused was falsely implicated in FIR 124/2026 due to family dispute.',
  grounds_for_bail: ['false_implication', 'no_flight_risk'],
};

type JsonCourt = {
  courtId: string;
  name: string;
  designation: string;
  courtType: string;
  state: string;
  stateId: string;
  city: string;
  formattingRulesRef: string;
};
async function seedCourt(courtId: string) {
  const c = (courtsJson as unknown as { courts: JsonCourt[] }).courts.find(
    (x) => x.courtId === courtId,
  )!;
  await Court.create({ ...c, courtType: c.courtType });
}

const ID_SHAPE = /\b(?:up|mp|kl|bihar|rj|ap)_[a-z0-9]+(?:_[a-z0-9]+)*\b/;

beforeEach(async () => {
  mockMessagesStream.mockReset();
  mockRenderPdf.mockReset();
  mockRenderPdf.mockResolvedValue(Buffer.from('%PDF-fake'));
  _clearAppSettingsCache();
  await AppSetting.create({ key: 'ai.drafting_model', value: 'claude-sonnet-4-5-20250929' });
  await AppSetting.create({
    key: 'ai.rates.claude-sonnet-4-5-20250929',
    value: JSON.stringify({ input_usd_per_mtok: 3, output_usd_per_mtok: 15 }),
  });
  await createVerifiedUser({
    _id: USER_ID,
    plan: 'free',
    planTier: 'free',
    inkSub: 0,
    inkAnnualCarry: 0,
    inkTopup: 2000,
  });
});
afterEach(() => jest.restoreAllMocks());

describe('classic creation: the stored title carries the label, not the id', () => {
  async function create(courtName: string | undefined) {
    const res = await post(courtName);
    expect(res.status).toBe(200);
    expect(res.text).toContain('event: done');
    return LawieDocument.findOne({ userId: USER_ID }).sort({ createdAt: -1 }).lean();
  }
  async function post(courtName: string | undefined) {
    mockMessagesStream.mockResolvedValue(sdkAnswer('1. Applicant seeks bail.', 1000, 200));
    const form: Record<string, unknown> = { ...FORM };
    if (courtName === undefined) delete form.court_name;
    else form.court_name = courtName;
    return request(app)
      .post('/generate-from-template')
      .set(headers())
      .send({ template_id: 'bail_regular', form_data: form });
  }

  it('a known id -> "<display name> — <label>"; courtName keeps the id', async () => {
    await seedCourt('up_district_lucknow');
    const doc = await create('up_district_lucknow');
    expect(doc).not.toBeNull();
    expect(doc!.title.endsWith(' — District Court, Lucknow')).toBe(true);
    expect(doc!.title).not.toMatch(ID_SHAPE);
    expect(doc!.courtName).toBe('up_district_lucknow');
  });

  it('an unknown id -> 503 court_unavailable, no document, no model call (T-686)', async () => {
    const res = await post('up_district_nowhere');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('court_unavailable');
    expect(await LawieDocument.countDocuments({ userId: USER_ID })).toBe(0);
    expect(mockMessagesStream).not.toHaveBeenCalled();
  });

  it('a typed court -> "<pack name> — <typed>", no dangling dash, no id', async () => {
    const doc = await create('Sessions Court, Nowhere');
    expect(doc!.title.endsWith(' — Sessions Court, Nowhere')).toBe(true);
    expect(doc!.title).not.toMatch(ID_SHAPE);
    expect(doc!.title).not.toMatch(/[—-]\s*$/);
    expect(doc!.title.trim().length).toBeGreaterThan(0);
  });

  it('a typed court name stays as typed', async () => {
    const doc = await create('Civil Judge (Senior Division), Sitapur');
    expect(doc!.title.endsWith(' — Civil Judge (Senior Division), Sitapur')).toBe(true);
  });

  it('the pack name part is the same in every case', async () => {
    await seedCourt('up_district_lucknow');
    const known = await create('up_district_lucknow');
    const name = known!.title.replace(/ — District Court, Lucknow$/, '');
    await LawieDocument.deleteMany({});
    const typed = await create('Sessions Court, Nowhere');
    expect(typed!.title).toBe(`${name} — Sessions Court, Nowhere`);
  });
});

describe('download names carry no court id', () => {
  const BASE = 'Bail Application u/s 480 BNSS';
  async function seedDoc(title: string, courtName: string) {
    const doc = await LawieDocument.create({
      userId: USER_ID,
      title,
      docType: 'bail_application',
      courtName,
      generatedContent: encrypt('Paragraph one.\n\nParagraph two.\n\nParagraph three.'),
      formInputs: {
        template_id: 'bail_anticipatory',
        court_id: 'bihar_district',
        court_type: 'district_court',
        state: 'Bihar',
        applicant_name: 'Ramesh Kumar',
        respondent_name: 'State of Bihar',
      },
      filingChecklist: [],
      checklistState: [],
    });
    return String(doc._id);
  }

  it('PDF export: Content-Disposition has the label words and no id', async () => {
    await seedCourt('up_district_lucknow');
    const id = await seedDoc(`${BASE} — up_district_lucknow`, 'up_district_lucknow');
    const res = await request(app).post(`/${id}/export/pdf`).set(headers()).send({});
    expect(res.status).toBe(200);
    const cd = String(res.headers['content-disposition']);
    expect(cd).toContain('District Court Lucknow');
    expect(cd).not.toContain('up_district_lucknow');
    expect(cd).not.toContain('updistrictlucknow'); // underscores are stripped, so check the run too
    expect(cd).not.toMatch(ID_SHAPE);
  });

  it('PDF export: an unknown id drops the suffix', async () => {
    const id = await seedDoc(`${BASE} — up_district_nowhere`, 'up_district_nowhere');
    const res = await request(app).post(`/${id}/export/pdf`).set(headers()).send({});
    expect(res.status).toBe(200);
    expect(String(res.headers['content-disposition'])).toBe(
      'attachment; filename="Bail Application us 480 BNSS.pdf"',
    );
  });

  it('annexures DOCX json: title and filename have the label and no id', async () => {
    await seedCourt('up_district_lucknow');
    const id = await seedDoc(`${BASE} — up_district_lucknow`, 'up_district_lucknow');
    const res = await request(app).post(`/${id}/annexures-pack?format=html`).set(headers());
    expect(res.status).toBe(200);
    expect(res.body.title).toBe(`${BASE} — District Court, Lucknow`);
    expect(res.body.filename).toContain('District Court Lucknow');
    expect(res.body.filename.endsWith('_annexures.docx')).toBe(true);
    expect(res.body.title + res.body.filename).not.toContain('up_district_lucknow');
    expect(res.body.filename).not.toContain('updistrictlucknow');
  });

  it('annexures PDF: attachment filename has the label and no id', async () => {
    await seedCourt('up_district_lucknow');
    const id = await seedDoc(`${BASE} - up_district_lucknow  `, 'up_district_lucknow');
    const res = await request(app).post(`/${id}/annexures-pack`).set(headers());
    expect(res.status).toBe(200);
    const cd = String(res.headers['content-disposition']);
    expect(cd).toContain('District Court Lucknow');
    expect(cd).toContain('_annexures.pdf');
    expect(cd).not.toContain('up_district_lucknow');
    expect(cd).not.toContain('updistrictlucknow'); // the id once underscores are stripped
  });

  it('annexures: an unknown id fails closed with 503 court_unavailable (T-686)', async () => {
    const id = await seedDoc(`${BASE} — up_district_nowhere`, 'up_district_nowhere');
    const res = await request(app).post(`/${id}/annexures-pack?format=html`).set(headers());
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('court_unavailable');
    expect(JSON.stringify(res.body)).not.toContain('up_district_nowhere');
  });

  it('annexures: no court gives the base title and filename without a suffix', async () => {
    const id = await seedDoc(BASE, '');
    const res = await request(app).post(`/${id}/annexures-pack?format=html`).set(headers());
    expect(res.status).toBe(200);
    expect(res.body.title).toBe(BASE);
    expect(res.body.filename).toBe('Bail Application us 480 BNSS_annexures.docx');
  });

  it('the stored title is never rewritten by an export', async () => {
    await seedCourt('up_district_lucknow');
    const stored = `${BASE} — up_district_lucknow`;
    const id = await seedDoc(stored, 'up_district_lucknow');
    await request(app).post(`/${id}/export/pdf`).set(headers()).send({});
    await request(app).post(`/${id}/annexures-pack?format=html`).set(headers());
    expect((await LawieDocument.findById(id).lean())!.title).toBe(stored);
  });
});

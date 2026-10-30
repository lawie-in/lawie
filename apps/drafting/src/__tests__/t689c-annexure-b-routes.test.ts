/**
 * T-689c routes (Ajay, AJ-689c-a, -b, -c):
 *   d. POST /:id/annexures-pack: the Synopsis (Annexure B) follows the stored pack id,
 *      the court type (doc.courtType, else the form's court_type), and the client side.
 *   e. GET /review/:token and GET /admin/documents/exports carry docTypeLabel
 *      (the rule pack's name) and never the rulePackId.
 *
 * The PDF renderer (Chromium) is mocked; ?format=html returns the HTML the PDF is built from.
 * Documents are inserted raw so a court type outside the schema's enum (whitespace) can be stored.
 */
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
import { Court } from '../models/Court.model';
// eslint-disable-next-line import/order
import { LawieDocument } from '../models/Document.model';
// eslint-disable-next-line import/order
import { ReviewToken } from '../models/ReviewToken.model';
// eslint-disable-next-line import/order
import * as rulePacks from '../services/rule-pack.service';
// eslint-disable-next-line import/order
import { _resetDocTypeLabelCache } from '../services/doc-type-label';
// eslint-disable-next-line import/order
import { sealFormInputs } from '../utils/case-details';
// eslint-disable-next-line import/order
import { encrypt } from '../utils/encryption';

import { createActiveCourt } from './seedCourts';

const USER_ID = '507f1f77bcf86cd799439011';
const SECRET = process.env.INTERNAL_SECRET ?? 'test-internal-secret-at-least-16';
const AUTH = {
  'x-internal-secret': SECRET,
  'x-user-id': USER_ID,
  'x-user-email': 'test@lawie.in',
  'x-user-role': 'Client',
  'x-user-plan': 'free',
  'x-user-name': 'Test Advocate',
};
const ADMIN = { ...AUTH, 'x-user-role': 'Admin', 'x-user-email': 'founder@lawie.in' };

const FORM: Record<string, unknown> = {
  court_id: 'jharkhand_hc',
  state: 'Jharkhand',
  applicant_name: 'Priya Devi',
  petitioner_name: 'Priya Devi',
  respondent_name: 'State of Jharkhand',
  defendant_name: 'State of Jharkhand',
  complainant_name: 'Sunil Kumar',
  plaintiff_name: 'Priya Devi',
  father_name: 'Mohan Lal',
  applicant_address: 'HB-47 Harmu, Ranchi',
  fir_number: '045/2025',
};

async function insertDoc(
  fields: Record<string, unknown>,
  formInputs: Record<string, unknown> = FORM,
): Promise<string> {
  const now = new Date();
  const ins = await LawieDocument.collection.insertOne({
    userId: new mongoose.Types.ObjectId(USER_ID),
    title: 'T-689c draft',
    docType: 'petition',
    generatedContent: encrypt('Paragraph one.\n\nParagraph two.\n\nParagraph three.'),
    formInputsEnc: sealFormInputs(formInputs),
    filingChecklist: [],
    checklistState: [],
    exportedAs: [],
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    ...fields,
  });
  return String(ins.insertedId);
}

const SYNOPSIS = '>Synopsis</h2>';

async function packHtml(id: string): Promise<string> {
  const res = await supertest(app).post(`/${id}/annexures-pack?format=html`).set(AUTH);
  expect(res.status).toBe(200);
  return res.body.html as string;
}
const labelsIn = (html: string) =>
  [...html.matchAll(/class="annexure-label">ANNEXURE ([A-Z])</g)].map((m) => m[1]).join('');

beforeEach(() => {
  mockRenderPdf.mockReset();
  mockRenderPdf.mockResolvedValue(Buffer.from('%PDF-fake'));
  _resetDocTypeLabelCache();
});
afterEach(() => jest.restoreAllMocks());

// ── d. the annexures-pack route ──────────────────────────────────────────────

describe('T-689c d: POST /:id/annexures-pack', () => {
  it('a written statement before a High Court: no Synopsis, the civil set A to D, Nature of matter on the Index only (T-700)', async () => {
    const id = await insertDoc(
      { rulePackId: 'written_statement', courtType: 'high_court' },
      { ...FORM, template_id: 'written_statement' },
    );
    const html = await packHtml(id);
    expect(html).not.toContain(SYNOPSIS);
    expect(html.split('Nature of matter').length - 1).toBe(1);
    expect(html).toContain(
      '<h2>Index of Documents Annexed</h2>\n  <br>\n  <p><strong>Nature of matter:</strong> Written Statement (Order VIII CPC)</p>',
    );
    expect(labelsIn(html)).toBe('ABCD');
  });

  it('a s.528 BNSS quashing petition before a High Court: Synopsis with the raw displayName, A to G', async () => {
    const id = await insertDoc(
      { rulePackId: 'quashing_528_bnss', courtType: 'high_court' },
      { ...FORM, template_id: 'quashing_528_bnss' },
    );
    const html = await packHtml(id);
    expect(html).toContain(SYNOPSIS);
    expect(html).toContain('<strong>Nature of matter:</strong> Quashing Petition (S.528 BNSS)</p>');
    expect(html).not.toContain('QUASHING 528 BNSS');
    expect(labelsIn(html)).toBe('ABCDEFG');
  });

  it('the PDF path gets the same HTML as the html path', async () => {
    const id = await insertDoc(
      { rulePackId: 'quashing_528_bnss', courtType: 'high_court' },
      { ...FORM, template_id: 'quashing_528_bnss' },
    );
    const html = await packHtml(id);
    await supertest(app).post(`/${id}/annexures-pack`).set(AUTH).expect(200);
    expect(mockRenderPdf.mock.calls[0][0]).toBe(html);
  });

  it('a Sessions bail: no Synopsis', async () => {
    const id = await insertDoc(
      { rulePackId: 'bail_regular', courtType: 'sessions' },
      { ...FORM, template_id: 'bail_regular' },
    );
    const html = await packHtml(id);
    expect(html).not.toContain(SYNOPSIS);
    expect(labelsIn(html)).toBe('ABCDEF');
  });

  it.each(['high_court_bench', 'supreme_court'])(
    '%s with a non-denied pack: Synopsis',
    async (court) => {
      const id = await insertDoc(
        { rulePackId: 'bail_regular', courtType: court },
        { ...FORM, template_id: 'bail_regular' },
      );
      expect(await packHtml(id)).toContain(SYNOPSIS);
    },
  );

  // T-689d, AJ-700a (4) reverses T-689c d: the form court_type now beats a stored doc.courtType.
  it('the form court_type wins over doc.courtType (stale sessions vs form high_court: Synopsis)', async () => {
    const id = await insertDoc(
      { rulePackId: 'quashing_528_bnss', courtType: 'sessions' },
      { ...FORM, template_id: 'quashing_528_bnss', court_type: 'high_court' },
    );
    expect(await packHtml(id)).toContain(SYNOPSIS);
  });

  it('the form court_type wins over doc.courtType (stale high_court vs form sessions: no Synopsis)', async () => {
    const id = await insertDoc(
      { rulePackId: 'quashing_528_bnss', courtType: 'high_court' },
      { ...FORM, template_id: 'quashing_528_bnss', court_type: 'sessions' },
    );
    const html = await packHtml(id);
    expect(html).not.toContain(SYNOPSIS);
    // and the court fee agrees: both annexures follow the one court type (T-689d)
    expect(html).not.toContain('Process fee');
  });

  it.each(['', '   ', '\t'])(
    'a blank doc.courtType (%j) falls to the form court_type',
    async (blank) => {
      const id = await insertDoc(
        { rulePackId: 'quashing_528_bnss', courtType: blank },
        { ...FORM, template_id: 'quashing_528_bnss', court_type: 'high_court' },
      );
      expect(await packHtml(id)).toContain(SYNOPSIS);
    },
  );

  it('a form court_type with spaces around it is not trimmed: it is no court type, so no Synopsis', async () => {
    const id = await insertDoc(
      { rulePackId: 'quashing_528_bnss', courtType: 'high_court' },
      { ...FORM, template_id: 'quashing_528_bnss', court_type: ' high_court ' },
    );
    expect(await packHtml(id)).not.toContain(SYNOPSIS);
  });

  it('no court type anywhere (AJ-700a (4)): the court rule type decides; jharkhand_hc is a High Court', async () => {
    const id = await insertDoc(
      { rulePackId: 'quashing_528_bnss' },
      { ...FORM, template_id: 'quashing_528_bnss' },
    );
    const html = await packHtml(id);
    expect(html).toContain(SYNOPSIS);
    expect(labelsIn(html)).toBe('ABCDEFG');
  });

  it('T-689d: a High Court document with no form court_type: Synopsis and High Court court fee agree', async () => {
    const id = await insertDoc(
      { rulePackId: 'quashing_528_bnss', courtType: 'high_court' },
      { ...FORM, template_id: 'quashing_528_bnss' },
    );
    const html = await packHtml(id);
    expect(FORM).not.toHaveProperty('court_type');
    expect(html).toContain(SYNOPSIS);
    expect(html).toContain('Process fee');
  });

  it('T-689d: the same document with a trial court chosen and a stale doc.courtType high_court: neither', async () => {
    await createActiveCourt(HC_ID, { courtType: 'sessions' });
    const id = await insertDoc(
      { rulePackId: 'quashing_528_bnss', courtName: HC_ID, courtType: 'high_court' },
      { ...FORM, template_id: 'quashing_528_bnss' },
    );
    const html = await packHtml(id);
    expect(html).not.toContain(SYNOPSIS);
    expect(html).not.toContain('Process fee');
  });

  it('the form court_type alone (no doc.courtType) is enough', async () => {
    const id = await insertDoc(
      { rulePackId: 'quashing_528_bnss' },
      { ...FORM, template_id: 'quashing_528_bnss', court_type: 'supreme_court' },
    );
    expect(await packHtml(id)).toContain(SYNOPSIS);
  });

  it('the pack id falls back to the form template_id when doc.rulePackId is empty', async () => {
    const withBlank = await insertDoc(
      { rulePackId: '', courtType: 'high_court' },
      { ...FORM, template_id: 'quashing_528_bnss' },
    );
    expect(await packHtml(withBlank)).toContain(
      '<strong>Nature of matter:</strong> Quashing Petition (S.528 BNSS)</p>',
    );
    const absent = await insertDoc(
      { courtType: 'high_court' },
      { ...FORM, template_id: 'written_statement' },
    );
    expect(await packHtml(absent)).not.toContain(SYNOPSIS);
  });

  it('no pack id anywhere: the party details are refused (422), nothing with a Synopsis is built', async () => {
    const id = await insertDoc({ courtType: 'high_court' }, { ...FORM });
    const res = await supertest(app).post(`/${id}/annexures-pack?format=html`).set(AUTH);
    expect(res.status).toBe(422);
    expect(res.body.html).toBeUndefined();
    expect(mockRenderPdf).not.toHaveBeenCalled();
  });

  // AJ-689c-b
  it('a respondent-side client (client_side) before a High Court: no Synopsis', async () => {
    const id = await insertDoc(
      { rulePackId: 'quashing_528_bnss', courtType: 'high_court' },
      { ...FORM, template_id: 'quashing_528_bnss', client_role: 'respondent' },
    );
    const html = await packHtml(id);
    expect(html).not.toContain(SYNOPSIS);
    expect(labelsIn(html)).toBe('ABCDEF');
  });

  it('a petitioner-side client before a High Court: Synopsis', async () => {
    const id = await insertDoc(
      { rulePackId: 'quashing_528_bnss', courtType: 'high_court' },
      { ...FORM, template_id: 'quashing_528_bnss', client_role: 'petitioner' },
    );
    expect(await packHtml(id)).toContain(SYNOPSIS);
  });

  it('a brief draft whose client_role is only in the stored brief values (respondent): no Synopsis', async () => {
    const brief = (role: string) =>
      encrypt(
        JSON.stringify({
          kind: 'x',
          values: [
            { key: 'petitioner_name', value: 'Priya Devi' },
            { key: 'respondent_name', value: 'State of Jharkhand' },
            { key: 'client_role', value: role },
          ],
        }),
      );
    const stored = { template_id: 'quashing_528_bnss', source: 'brief', court_type: 'high_court' };
    const respondent = await insertDoc(
      { rulePackId: 'quashing_528_bnss', courtType: 'high_court', brief: brief('respondent') },
      stored,
    );
    const res = await supertest(app).post(`/${respondent}/annexures-pack?format=html`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.html).not.toContain(SYNOPSIS);

    // the same brief with the petitioner as the client keeps the Synopsis
    const petitioner = await insertDoc(
      { rulePackId: 'quashing_528_bnss', courtType: 'high_court', brief: brief('petitioner') },
      stored,
    );
    const res2 = await supertest(app).post(`/${petitioner}/annexures-pack?format=html`).set(AUTH);
    expect(res2.status).toBe(200);
    expect(res2.body.html).toContain(SYNOPSIS);
  });
});

// ── d2. the court type from the chosen court (courtData.courtType) ───────────

const NATURE_QUASHING = '<strong>Nature of matter:</strong> Quashing Petition (S.528 BNSS)</p>';
const HC_ID = 'jharkhand_hc';
const QUASH_FORM = { ...FORM, template_id: 'quashing_528_bnss' };

describe('T-689c d2: the court type falls back to the chosen court row', () => {
  it('(a) quashing_528_bnss, no court_type, no doc.courtType, an active High Court row: Synopsis, A to G', async () => {
    await createActiveCourt(HC_ID);
    expect(QUASH_FORM).not.toHaveProperty('court_type');
    const id = await insertDoc({ rulePackId: 'quashing_528_bnss', courtName: HC_ID }, QUASH_FORM);
    const html = await packHtml(id);
    expect(html).toContain(SYNOPSIS);
    expect(html).toContain(NATURE_QUASHING);
    expect(labelsIn(html)).toBe('ABCDEFG');
  });

  it('(a) the pack id may come from the form template_id alone', async () => {
    await createActiveCourt(HC_ID);
    const id = await insertDoc({ courtName: HC_ID }, QUASH_FORM);
    const html = await packHtml(id);
    expect(html).toContain(SYNOPSIS);
    expect(html).toContain(NATURE_QUASHING);
  });

  it('(a) the court id only in the form court_name (no doc.courtName) also reaches the row', async () => {
    await createActiveCourt(HC_ID);
    const id = await insertDoc(
      { rulePackId: 'quashing_528_bnss' },
      { ...QUASH_FORM, court_name: HC_ID },
    );
    expect(await packHtml(id)).toContain(SYNOPSIS);
  });

  it.each(['high_court_bench', 'supreme_court'])(
    '(a) a %s row gives the Synopsis too',
    async (type) => {
      await createActiveCourt(HC_ID, { courtType: type });
      const id = await insertDoc({ rulePackId: 'quashing_528_bnss', courtName: HC_ID }, QUASH_FORM);
      expect(await packHtml(id)).toContain(SYNOPSIS);
    },
  );

  it('(b) the same document with a sessions row: no Synopsis, A to F', async () => {
    await createActiveCourt(HC_ID, { courtType: 'sessions' });
    const id = await insertDoc({ rulePackId: 'quashing_528_bnss', courtName: HC_ID }, QUASH_FORM);
    const html = await packHtml(id);
    expect(html).not.toContain(SYNOPSIS);
    // AJ-700 (2): Nature of matter is on the Index (criminal set, no Synopsis)
    expect(html.split('Nature of matter').length - 1).toBe(1);
    expect(labelsIn(html)).toBe('ABCDEF');
  });

  it('(b) no court row: the court rule type decides (AJ-700a (4), jharkhand_hc): Synopsis, A to G', async () => {
    const id = await insertDoc({ rulePackId: 'quashing_528_bnss' }, QUASH_FORM);
    const html = await packHtml(id);
    expect(html).toContain(SYNOPSIS);
    expect(labelsIn(html)).toBe('ABCDEFG');
  });

  // T-689d, AJ-700a (4) reverses T-689c d2 (c): the chosen court's row is the first source,
  // then the form court_type, then doc.courtType.
  it('(c) a High Court row beats a stale doc.courtType sessions: Synopsis', async () => {
    await createActiveCourt(HC_ID);
    const id = await insertDoc(
      { rulePackId: 'quashing_528_bnss', courtName: HC_ID, courtType: 'sessions' },
      QUASH_FORM,
    );
    expect(await packHtml(id)).toContain(SYNOPSIS);
  });

  it('(c) a High Court row beats a form court_type sessions: Synopsis', async () => {
    await createActiveCourt(HC_ID);
    const id = await insertDoc(
      { rulePackId: 'quashing_528_bnss', courtName: HC_ID },
      { ...QUASH_FORM, court_type: 'sessions' },
    );
    expect(await packHtml(id)).toContain(SYNOPSIS);
  });

  it('(c) a sessions row beats a stale doc.courtType high_court: no Synopsis, no Process fee', async () => {
    await createActiveCourt(HC_ID, { courtType: 'sessions' });
    const id = await insertDoc(
      { rulePackId: 'quashing_528_bnss', courtName: HC_ID, courtType: 'high_court' },
      QUASH_FORM,
    );
    const html = await packHtml(id);
    expect(html).not.toContain(SYNOPSIS);
    expect(html).not.toContain('Process fee');
  });

  it('(c) a sessions row beats a form court_type high_court: no Synopsis', async () => {
    await createActiveCourt(HC_ID, { courtType: 'sessions' });
    const id = await insertDoc(
      { rulePackId: 'quashing_528_bnss', courtName: HC_ID },
      { ...QUASH_FORM, court_type: 'high_court' },
    );
    expect(await packHtml(id)).not.toContain(SYNOPSIS);
  });

  it.each(['', '   ', '\t'])(
    '(c) a blank doc.courtType (%j) and a form court_type sessions: the High Court row still decides',
    async (blank) => {
      await createActiveCourt(HC_ID);
      const id = await insertDoc(
        { rulePackId: 'quashing_528_bnss', courtName: HC_ID, courtType: blank },
        { ...QUASH_FORM, court_type: 'sessions' },
      );
      expect(await packHtml(id)).toContain(SYNOPSIS);
    },
  );

  it.each(['', '   ', '\t'])(
    '(c) a blank doc.courtType (%j) and a blank form court_type fall to the High Court row',
    async (blank) => {
      await createActiveCourt(HC_ID);
      const id = await insertDoc(
        { rulePackId: 'quashing_528_bnss', courtName: HC_ID, courtType: blank },
        { ...QUASH_FORM, court_type: blank },
      );
      expect(await packHtml(id)).toContain(SYNOPSIS);
    },
  );

  it('(c) a non-string form court_type is skipped, the row decides', async () => {
    await createActiveCourt(HC_ID);
    const id = await insertDoc(
      { rulePackId: 'quashing_528_bnss', courtName: HC_ID },
      { ...QUASH_FORM, court_type: 42 },
    );
    expect(await packHtml(id)).toContain(SYNOPSIS);
  });

  it('(c) a non-blank but unknown form court_type is used as is and does not fall through: no Synopsis', async () => {
    const id = await insertDoc(
      { rulePackId: 'quashing_528_bnss' },
      { ...QUASH_FORM, court_type: 'HIGH_COURT' },
    );
    expect(await packHtml(id)).not.toContain(SYNOPSIS);
  });

  it('(c) an unknown doc.courtType under a High Court row: the row decides', async () => {
    await createActiveCourt(HC_ID);
    const id = await insertDoc(
      { rulePackId: 'quashing_528_bnss', courtName: HC_ID, courtType: 'HIGH_COURT' },
      QUASH_FORM,
    );
    expect(await packHtml(id)).toContain(SYNOPSIS);
  });

  it('(d) typed court name that finds an active high_court row: Synopsis', async () => {
    const typed = 'Typed High Court Of Jharkhand';
    await createActiveCourt(typed, { courtType: 'high_court' });
    const id = await insertDoc({ rulePackId: 'quashing_528_bnss', courtName: typed }, QUASH_FORM);
    const html = await packHtml(id);
    expect(html).toContain(SYNOPSIS);
    expect(labelsIn(html)).toBe('ABCDEFG');
  });

  it('(d) typed court name that finds an active sessions row: no Synopsis', async () => {
    const typed = 'Typed Sessions Court Of Patna';
    await createActiveCourt(typed, { courtType: 'sessions' });
    const id = await insertDoc({ rulePackId: 'quashing_528_bnss', courtName: typed }, QUASH_FORM);
    expect(await packHtml(id)).not.toContain(SYNOPSIS);
  });

  it('(d) typed court name with no matching row: falls to the court rule type (High Court): Synopsis, A to G', async () => {
    const id = await insertDoc(
      { rulePackId: 'quashing_528_bnss', courtName: 'Typed Court With No Row' },
      QUASH_FORM,
    );
    const html = await packHtml(id);
    expect(html).toContain(SYNOPSIS);
    expect(labelsIn(html)).toBe('ABCDEFG');
  });

  it('(d) typed court name whose row is inactive: the row is skipped, the court rule type decides', async () => {
    const typed = 'Typed Inactive High Court';
    await createActiveCourt(typed, { courtType: 'sessions', isActive: false });
    const id = await insertDoc({ rulePackId: 'quashing_528_bnss', courtName: typed }, QUASH_FORM);
    expect(await packHtml(id)).toContain(SYNOPSIS);
  });

  it('(d) typed court lookup that throws: the pack still builds, the court rule type decides', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Court, 'findOne').mockImplementation((() => {
      throw new Error('db down');
    }) as never);
    const id = await insertDoc(
      { rulePackId: 'quashing_528_bnss', courtName: 'Typed High Court Of Jharkhand' },
      QUASH_FORM,
    );
    const html = await packHtml(id);
    expect(html).toContain(SYNOPSIS);
    expect(labelsIn(html)).toBe('ABCDEFG');
  });

  it('(d) a typed lookup that throws still uses a stored doc.courtType', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Court, 'findOne').mockImplementation((() => {
      throw new Error('db down');
    }) as never);
    const id = await insertDoc(
      {
        rulePackId: 'quashing_528_bnss',
        courtName: 'Typed High Court Of Jharkhand',
        courtType: 'high_court',
      },
      QUASH_FORM,
    );
    expect(await packHtml(id)).toContain(SYNOPSIS);
  });

  // A guided brief keeps its parties in the encrypted brief (client_role, petitioner_name, ...).
  const briefOf = () =>
    encrypt(
      JSON.stringify({
        kind: 'x',
        court_document: true,
        values: [
          { key: 'client_role', value: 'petitioner' },
          { key: 'petitioner_name', value: 'Priya Devi' },
          { key: 'respondent_name', value: 'State of Jharkhand' },
        ],
      }),
    );

  it.each([
    ['a stored high_court', { courtType: 'high_court' }],
    ['the High Court row alone', {}],
  ])(
    '(e) guided before a High Court (%s): no Synopsis, Memo + Index (A to B)',
    async (_n, extra) => {
      await createActiveCourt(HC_ID);
      const id = await insertDoc(
        { rulePackId: 'guided', courtName: HC_ID, brief: briefOf(), ...extra },
        { template_id: 'guided', source: 'brief' },
      );
      const res = await supertest(app).post(`/${id}/annexures-pack?format=html`).set(AUTH);
      expect(res.status).toBe(200);
      expect(res.body.html).not.toContain(SYNOPSIS);
      expect(labelsIn(res.body.html)).toBe('AB');
    },
  );

  it('(e) control: the same brief document under a non-denied pack id has the Synopsis', async () => {
    await createActiveCourt(HC_ID);
    const id = await insertDoc(
      { rulePackId: 'quashing_528_bnss', courtName: HC_ID, brief: briefOf() },
      { template_id: 'quashing_528_bnss', source: 'brief' },
    );
    const res = await supertest(app).post(`/${id}/annexures-pack?format=html`).set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.html).toContain(SYNOPSIS);
  });

  it('(f) a respondent-side client before a High Court row (no stored court type): no Synopsis', async () => {
    await createActiveCourt(HC_ID);
    const id = await insertDoc(
      { rulePackId: 'quashing_528_bnss', courtName: HC_ID },
      { ...QUASH_FORM, client_role: 'respondent' },
    );
    const html = await packHtml(id);
    expect(html).not.toContain(SYNOPSIS);
    expect(labelsIn(html)).toBe('ABCDEF');
  });

  it('(f) control: the same document with a petitioner-side client has the Synopsis', async () => {
    await createActiveCourt(HC_ID);
    const id = await insertDoc(
      { rulePackId: 'quashing_528_bnss', courtName: HC_ID },
      { ...QUASH_FORM, client_role: 'petitioner' },
    );
    expect(await packHtml(id)).toContain(SYNOPSIS);
  });

  it('a denied pack (written_statement) before a High Court row is still without the Synopsis', async () => {
    await createActiveCourt(HC_ID);
    const id = await insertDoc(
      { rulePackId: 'written_statement', courtName: HC_ID },
      { ...FORM, template_id: 'written_statement' },
    );
    expect(await packHtml(id)).not.toContain(SYNOPSIS);
  });
});

// ── e. review page and admin exports ─────────────────────────────────────────

async function reviewTokenFor(docId: string): Promise<string> {
  const gen = await supertest(app)
    .post('/admin/review-tokens')
    .set(ADMIN)
    .send({ documentId: docId, assignedTo: 'Adv. Kumar' });
  expect(gen.status).toBe(201);
  return gen.body.token as string;
}

async function reviewDoc(fields: Record<string, unknown>) {
  const id = await insertDoc(fields);
  const token = await reviewTokenFor(id);
  const res = await supertest(app).get(`/review/${encodeURIComponent(token)}`);
  return res;
}

describe('T-689c e: GET /review/:token docTypeLabel', () => {
  it('a written statement stored as "petition" reads "Written Statement"; docType is unchanged', async () => {
    const res = await reviewDoc({ rulePackId: 'written_statement' });
    expect(res.status).toBe(200);
    expect(res.body.document.docTypeLabel).toBe('Written Statement');
    expect(res.body.document.docType).toBe('petition');
  });

  it('the rulePackId is not sent anywhere in the response', async () => {
    const res = await reviewDoc({ rulePackId: 'written_statement' });
    expect(JSON.stringify(res.body)).not.toContain('rulePackId');
    expect(JSON.stringify(res.body)).not.toContain('written_statement');
  });

  it.each([
    ['guided', { rulePackId: 'guided' }],
    ['no pack id', {}],
    ['an empty pack id', { rulePackId: '' }],
    ['an unknown pack id', { rulePackId: 't689c_no_such_pack' }],
  ])('%s: docTypeLabel is null and the page falls back to the docType', async (_n, fields) => {
    const res = await reviewDoc(fields);
    expect(res.status).toBe(200);
    expect(res.body.document.docTypeLabel).toBeNull();
    expect(res.body.document.docType).toBe('petition');
  });

  it('a pack load that throws does not fail the request', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const id = await insertDoc({ rulePackId: 'written_statement' });
    const token = await reviewTokenFor(id);
    jest.spyOn(rulePacks, 'loadRulePack').mockImplementation(() => {
      throw new Error('disk gone');
    });
    const res = await supertest(app).get(`/review/${encodeURIComponent(token)}`);
    expect(res.status).toBe(200);
    expect(res.body.document.docTypeLabel).toBeNull();
    expect(res.body.document.content).toContain('Paragraph one.');
    expect(err).toHaveBeenCalled();
  });

  it('the token is not consumed by a GET and the rest of the payload is unchanged', async () => {
    const id = await insertDoc({ rulePackId: 'written_statement' });
    const token = await reviewTokenFor(id);
    const res = await supertest(app).get(`/review/${encodeURIComponent(token)}`);
    expect(res.body.review.assignedTo).toBe('Adv. Kumar');
    expect(res.body.formSchema.verdicts.length).toBe(4);
    expect((await ReviewToken.findOne({ token }).lean())!.isUsed).toBe(false);
  });
});

describe('T-689c e: GET /admin/documents/exports docTypeLabel', () => {
  const exported = (fields: Record<string, unknown>) =>
    insertDoc({ status: 'exported', exportedAs: ['pdf'], ...fields });
  const exportsOf = async () => {
    const res = await supertest(app).get('/admin/documents/exports').set(ADMIN);
    expect(res.status).toBe(200);
    return res.body.exports as Array<Record<string, unknown>>;
  };

  it('a written statement reads "Written Statement"; docType unchanged; no rulePackId', async () => {
    await exported({ rulePackId: 'written_statement' });
    const rows = await exportsOf();
    expect(rows).toHaveLength(1);
    expect(rows[0].docTypeLabel).toBe('Written Statement');
    expect(rows[0].docType).toBe('petition');
    expect(JSON.stringify(rows)).not.toContain('rulePackId');
    expect(JSON.stringify(rows)).not.toContain('written_statement');
  });

  it('guided, no pack and unknown pack give null', async () => {
    await exported({ rulePackId: 'guided' });
    await exported({});
    await exported({ rulePackId: 't689c_no_such_pack' });
    const rows = await exportsOf();
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.docTypeLabel).toBeNull();
      expect(r.docType).toBe('petition');
    }
  });

  it('a throwing pack load does not fail the list', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await exported({ rulePackId: 'written_statement' });
    jest.spyOn(rulePacks, 'loadRulePack').mockImplementation(() => {
      throw new Error('disk gone');
    });
    const rows = await exportsOf();
    expect(rows).toHaveLength(1);
    expect(rows[0].docTypeLabel).toBeNull();
  });

  it('is admin only', async () => {
    const res = await supertest(app).get('/admin/documents/exports').set(AUTH);
    expect(res.status).toBe(403);
  });
});

/**
 * T-700 AJ-700c (2), route level: POST /:id/annexures-pack. A brief document with no usable pack
 * id (guided) takes its annexure set from the stored brief's kind. The PDF renderer is mocked;
 * ?format=html returns the HTML the PDF is built from.
 */
import './setupDb';

import mongoose from 'mongoose';
import supertest from 'supertest';

jest.mock('../services/pdf-export.service', () => ({
  renderPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-fake')),
}));

// eslint-disable-next-line import/order
import app from '../app';
// eslint-disable-next-line import/order
import { LawieDocument } from '../models/Document.model';
// eslint-disable-next-line import/order
import { sealFormInputs } from '../utils/case-details';
// eslint-disable-next-line import/order
import { encrypt } from '../utils/encryption';

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

const briefOf = (kind: string) =>
  encrypt(
    JSON.stringify({
      kind,
      court_document: true,
      values: [
        { key: 'client_role', value: 'petitioner' },
        { key: 'petitioner_name', value: 'Priya Devi' },
        { key: 'respondent_name', value: 'State of Jharkhand' },
      ],
    }),
  );

async function insertGuidedDoc(kind: string): Promise<string> {
  const now = new Date();
  const ins = await LawieDocument.collection.insertOne({
    userId: new mongoose.Types.ObjectId(USER_ID),
    title: 'T-700 draft',
    docType: 'petition',
    generatedContent: encrypt('Paragraph one.\n\nParagraph two.\n\nParagraph three.'),
    formInputsEnc: sealFormInputs({ template_id: 'guided', source: 'brief' }),
    rulePackId: 'guided',
    courtType: 'sessions',
    brief: briefOf(kind),
    filingChecklist: [],
    checklistState: [],
    exportedAs: [],
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  });
  return String(ins.insertedId);
}

const labelsIn = (html: string) =>
  [...html.matchAll(/class="annexure-label">ANNEXURE ([A-Z])</g)].map((m) => m[1]).join('');
const headingsIn = (html: string) => [...html.matchAll(/<h2>([^<]*)<\/h2>/g)].map((m) => m[1]);

async function packHtml(id: string): Promise<string> {
  const res = await supertest(app).post(`/${id}/annexures-pack?format=html`).set(AUTH);
  expect(res.status).toBe(200);
  return res.body.html as string;
}

describe('T-700 AJ-700c (2): the stored brief kind decides the set of a guided document', () => {
  it('a guided document whose stored brief kind is bail_regular: the criminal set, A to F', async () => {
    const html = await packHtml(await insertGuidedDoc('bail_regular'));
    expect(labelsIn(html)).toBe('ABCDEF');
    expect(html).toContain('Court Fee Paid Statement');
    expect(html).toContain('<h2>Affidavit</h2>');
  });

  it('a guided document whose stored brief kind is "none": Memo + Index, A to B', async () => {
    const html = await packHtml(await insertGuidedDoc('none'));
    expect(labelsIn(html)).toBe('AB');
    expect(html).not.toContain('Court Fee Paid Statement');
    expect(headingsIn(html)).not.toContain('Affidavit');
  });

  it('a guided document whose stored brief kind is a civil pack: Memo + Index, A to B', async () => {
    const html = await packHtml(await insertGuidedDoc('plaint_recovery'));
    expect(labelsIn(html)).toBe('AB');
  });
});

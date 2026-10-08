/**
 * T-152 — PATCH /:id makes a new version only when the text really changed.
 */
import './setupDb';
import request from 'supertest';

import app from '../app';
import { LawieDocument } from '../models/Document.model';
import { decrypt, encrypt } from '../utils/encryption';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER_ID = '507f1f77bcf86cd799439152';
const GENERATED = 'Generated draft text.';
const EDITED = 'Saved edit of the draft.';

function headers() {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': USER_ID,
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
  };
}

async function makeDoc(withEdit: boolean) {
  return LawieDocument.create({
    userId: USER_ID,
    title: 'T-152 doc',
    docType: 'bail_application',
    generatedContent: encrypt(GENERATED),
    ...(withEdit ? { finalContent: encrypt(EDITED) } : {}),
  });
}

function patch(id: unknown, body: Record<string, unknown>) {
  return request(app).patch(`/${String(id)}`).set(headers()).send(body);
}

describe('PATCH /:id version bumping (T-152)', () => {
  it('unchanged text equal to generated content: 200, version unchanged', async () => {
    const doc = await makeDoc(false);
    const res = await patch(doc._id, { finalContent: GENERATED });
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(doc.version);
    expect(res.body.status).toBe('draft');
    const after = await LawieDocument.findById(doc._id).lean();
    expect(after!.version).toBe(doc.version);
    expect(after!.finalContent ?? null).toBeNull();
  });

  it('unchanged text equal to saved edit: 200, version unchanged', async () => {
    const doc = await makeDoc(true);
    const res = await patch(doc._id, { finalContent: EDITED });
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(doc.version);
    const after = await LawieDocument.findById(doc._id).lean();
    expect(after!.version).toBe(doc.version);
  });

  it('one changed character: version goes up by exactly 1 and text is stored', async () => {
    const doc = await makeDoc(true);
    const changed = EDITED.slice(0, -1) + '!';
    const res = await patch(doc._id, { finalContent: changed });
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(doc.version + 1);
    const after = await LawieDocument.findById(doc._id).lean();
    expect(after!.version).toBe(doc.version + 1);
    expect(decrypt(after!.finalContent!)).toBe(changed);
  });

  it('unchanged text plus status change: version +1 and status saved', async () => {
    const doc = await makeDoc(true);
    const res = await patch(doc._id, { finalContent: EDITED, status: 'finalised' });
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(doc.version + 1);
    expect(res.body.status).toBe('finalised');
  });

  it('unchanged text for a missing document: 404', async () => {
    const res = await patch('507f1f77bcf86cd799439999', { finalContent: GENERATED });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Document not found');
  });
});

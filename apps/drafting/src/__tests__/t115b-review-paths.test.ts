/**
 * T-115b round 2 — the public review links must not serve, or accept feedback for,
 * a document that is pending erase or missing.
 */
import './setupEnv';
import './setupDb';

import { Types } from 'mongoose';
import supertest from 'supertest';

import app from '../app';
import { LawieDocument } from '../models/Document.model';
import { ReviewFeedback } from '../models/ReviewFeedback.model';
import { ReviewToken } from '../models/ReviewToken.model';
import { eraseDocument } from '../services/document-erase.service';
import { encrypt } from '../utils/encryption';

const OWNER = '507f1f77bcf86cd799439161';

const BODY = {
  causeTitleCorrect: true,
  sectionsCorrect: true,
  factsAccurate: true,
  prayerCorrect: true,
  citationsCorrect: true,
  annexuresSufficient: true,
  formattingCorrect: true,
  wouldFileAfterEdits: true,
  overallVerdict: 'minor_edits',
  comments: 'fine',
};

async function makeDoc() {
  return LawieDocument.create({
    userId: OWNER,
    title: 'Review path doc',
    docType: 'bail_application',
    generatedContent: encrypt('Para 1.'),
  });
}

async function makeToken(documentId: unknown, token: string) {
  await ReviewToken.create({
    token,
    documentId,
    assignedTo: 'Adv. Kumar',
    expiresAt: new Date(Date.now() + 86_400_000),
    createdBy: OWNER,
  });
  return token;
}

/** Marks the document pending erase without running any erase step. */
async function markPending(id: unknown) {
  await LawieDocument.updateOne(
    { _id: id },
    { $set: { isDeleted: true, 'deletion.requestedAt': new Date() } },
  );
}

const get = (t: string) => supertest(app).get(`/review/${encodeURIComponent(t)}`);
const post = (t: string) =>
  supertest(app)
    .post(`/review/${encodeURIComponent(t)}/feedback`)
    .send(BODY);

describe('review links and T-115b erase', () => {
  describe('GET /review/:token', () => {
    it('live document: 200 with content', async () => {
      const doc = await makeDoc();
      const res = await get(await makeToken(doc._id, 'live-get-token-0001'));
      expect(res.status).toBe(200);
      expect(res.body.document.content).toContain('Para 1.');
    });

    it('pending-erase document (direct mark): 404, no content', async () => {
      const doc = await makeDoc();
      const t = await makeToken(doc._id, 'pending-get-token');
      await markPending(doc._id);
      const res = await get(t);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Document no longer available');
      expect(JSON.stringify(res.body)).not.toContain('Para 1');
    });

    it('pending-erase document after a forced partial erase: 404', async () => {
      const doc = await makeDoc();
      await makeToken(doc._id, 'partial-get-token');
      await markPending(doc._id);
      jest.spyOn(ReviewFeedback, 'deleteMany').mockRejectedValueOnce(new Error('boom'));
      // Fail at feedback: tokens are already gone, so make a second token afterwards.
      const r = await eraseDocument(String(doc._id));
      expect(r.done).toBe(false);
      jest.restoreAllMocks();
      const t = await makeToken(doc._id, 'partial-get-token-2');
      expect((await get(t)).status).toBe(404);
    });

    it('missing document: 404', async () => {
      const t = await makeToken(new Types.ObjectId(), 'missing-get-token');
      const res = await get(t);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Document no longer available');
    });
  });

  describe('POST /review/:token/feedback', () => {
    it('live document: 201, feedback stored, token used', async () => {
      const doc = await makeDoc();
      const t = await makeToken(doc._id, 'live-post-token-0001');
      const res = await post(t);
      expect(res.status).toBe(201);
      expect(await ReviewFeedback.countDocuments({ documentId: doc._id })).toBe(1);
      expect((await ReviewToken.findOne({ token: t }))!.isUsed).toBe(true);
    });

    it('pending-erase document: 404 and no ReviewFeedback written', async () => {
      const doc = await makeDoc();
      const t = await makeToken(doc._id, 'pending-post-token');
      await markPending(doc._id);
      const res = await post(t);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Document no longer available');
      expect(await ReviewFeedback.countDocuments({})).toBe(0);
      expect((await ReviewToken.findOne({ token: t }))!.isUsed).toBe(false);
    });

    it('missing document: 404 and no ReviewFeedback written', async () => {
      const t = await makeToken(new Types.ObjectId(), 'missing-post-token');
      const res = await post(t);
      expect(res.status).toBe(404);
      expect(await ReviewFeedback.countDocuments({})).toBe(0);
    });
  });
});

/**
 * T-674 AC3 / Ajay R4 — the documents list, the document detail and the review
 * link send `courtLabel` next to the raw `courtName`, with one Court query.
 * Real in-memory Mongo (setupDb); Court.find is spied on, not mocked.
 */
import './setupEnv';
import './setupDb';
import request from 'supertest';

import app from '../app';
import courtsJson from '../config/courts/indian-courts.json';
import { LawieDocument } from '../models/Document.model';
import { Court } from '../models/Court.model';
import { ReviewToken } from '../models/ReviewToken.model';
import { encrypt } from '../utils/encryption';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const OWNER = '507f1f77bcf86cd799439171';

const headers = () => ({
  'x-internal-secret': INTERNAL_SECRET,
  'x-user-id': OWNER,
  'x-user-email': 'test@test.com',
  'x-user-name': 'Test',
  'x-user-plan': 'free',
  'x-user-role': 'Client',
});

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
const COURTS = (courtsJson as unknown as { courts: JsonCourt[] }).courts;

async function seedCourt(courtId: string) {
  const c = COURTS.find((x) => x.courtId === courtId)!;
  await Court.create({
    courtId: c.courtId,
    name: c.name,
    designation: c.designation,
    courtType: c.courtType,
    state: c.state,
    stateId: c.stateId,
    city: c.city,
    formattingRulesRef: c.formattingRulesRef,
  });
}

function makeDoc(courtName: string | undefined, title = 'Label doc') {
  return LawieDocument.create({
    userId: OWNER,
    title,
    docType: 'bail_application',
    courtName,
    generatedContent: encrypt('Para 1.'),
  });
}

// a court id of the families used here (docType values like bail_application are not ids)
const ID_SHAPE = /\b(?:up|mp|kl|bihar|rj|ap)_[a-z0-9]+(?:_[a-z0-9]+)*\b/;

describe('T-674 court labels on the API', () => {
  let findSpy: jest.SpyInstance;
  beforeEach(async () => {
    await seedCourt('up_district_lucknow');
    await seedCourt('mp_sessions_bhopal');
    findSpy = jest.spyOn(Court, 'find');
  });
  afterEach(() => findSpy.mockRestore());

  describe('GET /documents (list)', () => {
    it('adds courtLabel per document, courtName stays the raw id, ONE Court query', async () => {
      await makeDoc('up_district_lucknow', 'A');
      await makeDoc('mp_sessions_bhopal', 'B');
      await makeDoc('up_district_lucknow', 'C');
      await makeDoc('Civil Judge (Senior Division), Sitapur', 'D');
      await makeDoc('up_district_nowhere', 'E');
      await makeDoc(undefined, 'F');
      findSpy.mockClear();

      const res = await request(app).get('/').set(headers());
      expect(res.status).toBe(200);
      const byTitle = Object.fromEntries(
        res.body.documents.map((d: { title: string }) => [d.title, d]),
      );
      expect(res.body.documents).toHaveLength(6);

      expect(byTitle.A.courtName).toBe('up_district_lucknow');
      expect(byTitle.A.courtLabel).toBe('District Court, Lucknow');
      expect(byTitle.B.courtName).toBe('mp_sessions_bhopal');
      expect(byTitle.B.courtLabel).toBe('District & Sessions Court, Bhopal');
      expect(byTitle.C.courtLabel).toBe('District Court, Lucknow');
      expect(byTitle.D.courtName).toBe('Civil Judge (Senior Division), Sitapur');
      expect(byTitle.D.courtLabel).toBe('Civil Judge (Senior Division), Sitapur');
      expect(byTitle.E.courtName).toBe('up_district_nowhere');
      expect(byTitle.E.courtLabel).toBe('');
      expect(byTitle.F.courtLabel).toBe('');

      for (const d of res.body.documents) {
        expect(typeof d.courtLabel).toBe('string');
        expect(d.courtLabel).not.toMatch(ID_SHAPE);
      }
      // 6 documents, one lookup (not 6).
      expect(findSpy).toHaveBeenCalledTimes(1);
    });

    it('existing fields are unchanged (title, docType, _id still present)', async () => {
      const d = await makeDoc('up_district_lucknow', 'Keep fields');
      const res = await request(app).get('/').set(headers());
      expect(res.body.documents[0]._id).toBe(String(d._id));
      expect(res.body.documents[0].title).toBe('Keep fields');
      expect(res.body.documents[0].docType).toBe('bail_application');
    });
  });

  describe('GET /documents/:id (detail)', () => {
    it('returns courtLabel and the raw courtName', async () => {
      const d = await makeDoc('mp_sessions_bhopal');
      const res = await request(app)
        .get(`/${String(d._id)}`)
        .set(headers());
      expect(res.status).toBe(200);
      expect(res.body.courtName).toBe('mp_sessions_bhopal');
      expect(res.body.courtLabel).toBe('District & Sessions Court, Bhopal');
    });

    it('an unknown id gives courtLabel "" and keeps courtName', async () => {
      const d = await makeDoc('up_district_nowhere');
      const res = await request(app)
        .get(`/${String(d._id)}`)
        .set(headers());
      expect(res.status).toBe(200);
      expect(res.body.courtName).toBe('up_district_nowhere');
      expect(res.body.courtLabel).toBe('');
    });

    it('a typed court name is returned as typed', async () => {
      const d = await makeDoc('Court of the Munsif, Sitapur');
      const res = await request(app)
        .get(`/${String(d._id)}`)
        .set(headers());
      expect(res.body.courtLabel).toBe('Court of the Munsif, Sitapur');
    });
  });

  describe('GET /review/:token', () => {
    async function tokenFor(courtName: string | undefined, token: string) {
      const d = await makeDoc(courtName);
      await ReviewToken.create({
        token,
        documentId: d._id,
        assignedTo: 'Adv. Kumar',
        expiresAt: new Date(Date.now() + 86_400_000),
        createdBy: OWNER,
      });
      return token;
    }

    it('returns document.courtLabel next to the raw courtName', async () => {
      const t = await tokenFor('up_district_lucknow', 'label-review-token-001');
      const res = await request(app).get(`/review/${t}`);
      expect(res.status).toBe(200);
      expect(res.body.document.courtName).toBe('up_district_lucknow');
      expect(res.body.document.courtLabel).toBe('District Court, Lucknow');
    });

    it('an unknown id gives courtLabel ""', async () => {
      const t = await tokenFor('up_district_nowhere', 'label-review-token-002');
      const res = await request(app).get(`/review/${t}`);
      expect(res.status).toBe(200);
      expect(res.body.document.courtLabel).toBe('');
    });

    it('a lookup failure does not fail the route', async () => {
      const t = await tokenFor('up_district_lucknow', 'label-review-token-003');
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      findSpy.mockImplementationOnce(() => {
        throw new Error('db down');
      });
      const res = await request(app).get(`/review/${t}`);
      errSpy.mockRestore();
      expect(res.status).toBe(200);
      expect(res.body.document.courtLabel).toBe('');
    });
  });
  describe('titles never carry the court id (stored title unchanged)', () => {
    const ID = 'up_district_lucknow';
    const KOCHI_ID = 'kl_sessions_ernakulam_kochi';
    const BASE = 'Bail Application u/s 480 BNSS';

    /** Whole body as JSON with the by-design `courtName` field removed. */
    function withoutCourtName(body: unknown): string {
      return JSON.stringify(body, (k, v) => (k === 'courtName' ? undefined : v));
    }

    async function tokenFor(docId: unknown, token: string) {
      await ReviewToken.create({
        token,
        documentId: docId,
        assignedTo: 'Adv. Kumar',
        expiresAt: new Date(Date.now() + 86_400_000),
        createdBy: OWNER,
      });
      return token;
    }

    it('list, detail and review rewrite an id-suffixed title; the DB title is untouched', async () => {
      const stored = `${BASE} — ${ID}`;
      const d = await makeDoc(ID, stored);
      const t = await tokenFor(d._id, 'title-review-token-01');

      const list = await request(app).get('/').set(headers());
      const detail = await request(app)
        .get(`/${String(d._id)}`)
        .set(headers());
      const review = await request(app).get(`/review/${t}`);

      expect(list.body.documents[0].title).toBe(`${BASE} — District Court, Lucknow`);
      expect(detail.body.title).toBe(`${BASE} — District Court, Lucknow`);
      expect(review.body.document.title).toBe(`${BASE} — District Court, Lucknow`);
      for (const res of [list, detail, review]) {
        expect(res.status).toBe(200);
        expect(withoutCourtName(res.body)).not.toContain(ID);
        expect(withoutCourtName(res.body)).not.toMatch(ID_SHAPE);
      }
      // the raw id stays in courtName by design
      expect(list.body.documents[0].courtName).toBe(ID);

      const row = await LawieDocument.findById(d._id).lean();
      expect(row!.title).toBe(stored);
    });

    it('hyphen and trailing spaces are handled; an unknown id drops the suffix', async () => {
      await seedCourt(KOCHI_ID);
      const a = await makeDoc(KOCHI_ID, `${BASE} - ${KOCHI_ID}  `);
      const b = await makeDoc('up_district_nowhere', `${BASE} — up_district_nowhere`);
      const t = await tokenFor(b._id, 'title-review-token-02');
      const list = await request(app).get('/').set(headers());
      const titles = list.body.documents.map((x: { title: string }) => x.title).sort();
      expect(titles).toEqual(
        [`${BASE}`, `${BASE} — District & Sessions Court, Ernakulam (Kochi)`].sort(),
      );
      expect(withoutCourtName(list.body)).not.toMatch(ID_SHAPE);
      const detailB = await request(app)
        .get(`/${String(b._id)}`)
        .set(headers());
      expect(detailB.body.title).toBe(BASE);
      const reviewB = await request(app).get(`/review/${t}`);
      expect(reviewB.body.document.title).toBe(BASE);
      expect(reviewB.body.document.courtLabel).toBe('');
      expect(String(a._id)).toBeTruthy();
    });

    it('typed-name, brief-path and own titles are returned exactly as stored', async () => {
      const typed = 'Bail Application — Civil Judge (Senior Division), Sitapur';
      const brief = 'Guided brief — District & Sessions Court, Bhopal';
      await makeDoc('Civil Judge (Senior Division), Sitapur', typed);
      await makeDoc('mp_sessions_bhopal', brief);
      await makeDoc(ID, 'My own title');
      const list = await request(app).get('/').set(headers());
      const titles = list.body.documents.map((x: { title: string }) => x.title).sort();
      expect(titles).toEqual([brief, typed, 'My own title'].sort());
    });
  });
});

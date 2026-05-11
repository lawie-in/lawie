/**
 * SCRUM-74 — Advocate-panel review pipeline tests
 *
 * Coverage:
 *   - ReviewToken model: token unique, expiry, isUsed default
 *   - ReviewFeedback model: required fields, verdict enum
 *   - Token generation: 32-char URL-safe; unique across calls
 *   - Admin routes: 401/403/201 for POST, GET, PATCH /:token/disable
 *   - Public routes: 404 unknown, 410 expired, 403 revoked, 409 already-used,
 *     200 valid GET with form schema, 201 valid feedback submission
 *   - End-to-end: admin generates → advocate fetches → submits → token
 *     marked used → admin sees row in /admin/panel-review
 *   - Founder telemetry Event recorded on submission
 */

import './setupEnv';
import './setupDb';

import supertest from 'supertest';

import app from '../app';
import { LawieDocument } from '../models/Document.model';
import { Event } from '../models/Event.model';
import { ReviewFeedback } from '../models/ReviewFeedback.model';
import { ReviewToken } from '../models/ReviewToken.model';
import { encrypt } from '../utils/encryption';

// ── Auth headers (drafting uses x-internal-secret pattern) ────────────────────

const FOUNDER_ID = '507f1f77bcf86cd799439011';

const ADMIN_AUTH = {
  'x-internal-secret': process.env.INTERNAL_SECRET ?? 'test-internal-secret-at-least-16',
  'x-user-id': FOUNDER_ID,
  'x-user-email': 'founder@lawie.in',
  'x-user-role': 'Admin',
  'x-user-plan': 'free',
  'x-user-name': 'Founder',
};

const CLIENT_AUTH = {
  ...ADMIN_AUTH,
  'x-user-id': '507f1f77bcf86cd799439012',
  'x-user-role': 'Client',
};

// ── Helper — create a document ────────────────────────────────────────────────

async function makeDoc(overrides: Partial<Record<string, unknown>> = {}): Promise<string> {
  const doc = await LawieDocument.create({
    userId: FOUNDER_ID,
    title: 'Bail Application — Patna HC',
    docType: 'bail_application',
    generatedContent: encrypt('Para 1.\n\nPara 2.\n\nPara 3.'),
    courtName: 'Patna HC',
    sectionsCited: ['BNS 103'],
    ...overrides,
  });
  return String(doc._id);
}

// ── Model tests ───────────────────────────────────────────────────────────────

describe('ReviewToken model', () => {
  beforeAll(async () => {
    // mongodb-memory-server doesn't always have the unique index built before
    // the first uniqueness test fires.
    await ReviewToken.syncIndexes();
  });

  it('creates with isUsed=false, isActive=true defaults', async () => {
    const docId = await makeDoc();
    const rt = await ReviewToken.create({
      token: 'a'.repeat(24),
      documentId: docId,
      assignedTo: 'Adv. Kumar',
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
      createdBy: FOUNDER_ID,
    });
    expect(rt.isUsed).toBe(false);
    expect(rt.isActive).toBe(true);
  });

  it('enforces token uniqueness', async () => {
    const docId = await makeDoc();
    await ReviewToken.create({
      token: 'unique-token-001',
      documentId: docId,
      assignedTo: 'A',
      expiresAt: new Date(Date.now() + 86_400_000),
      createdBy: FOUNDER_ID,
    });
    await expect(
      ReviewToken.create({
        token: 'unique-token-001',
        documentId: docId,
        assignedTo: 'B',
        expiresAt: new Date(Date.now() + 86_400_000),
        createdBy: FOUNDER_ID,
      }),
    ).rejects.toThrow();
  });
});

describe('ReviewFeedback model', () => {
  it('rejects invalid verdict enum', async () => {
    const docId = await makeDoc();
    const rt = await ReviewToken.create({
      token: 't1234567890123456',
      documentId: docId,
      assignedTo: 'A',
      expiresAt: new Date(Date.now() + 86_400_000),
      createdBy: FOUNDER_ID,
    });
    await expect(
      ReviewFeedback.create({
        reviewTokenId: rt._id,
        documentId: docId,
        assignedTo: 'A',
        causeTitleCorrect: true,
        sectionsCorrect: true,
        factsAccurate: true,
        prayerCorrect: true,
        citationsCorrect: true,
        annexuresSufficient: true,
        formattingCorrect: true,
        wouldFileAfterEdits: true,
        overallVerdict: 'invalid_verdict',
      }),
    ).rejects.toThrow();
  });
});

// ── Admin route tests ─────────────────────────────────────────────────────────

describe('POST /admin/review-tokens', () => {
  it('201 — Admin generates a token', async () => {
    const docId = await makeDoc();
    const res = await supertest(app)
      .post('/admin/review-tokens')
      .set(ADMIN_AUTH)
      .send({ documentId: docId, assignedTo: 'Adv. Kumar', assignedEmail: 'k@bar.in' });

    expect(res.status).toBe(201);
    expect(res.body.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(res.body.token.length).toBeGreaterThanOrEqual(24);
    expect(res.body.assignedTo).toBe('Adv. Kumar');
    expect(res.body.isActive).toBe(true);
    expect(res.body.isUsed).toBe(false);
  });

  it('403 — Client cannot generate token', async () => {
    const docId = await makeDoc();
    const res = await supertest(app)
      .post('/admin/review-tokens')
      .set(CLIENT_AUTH)
      .send({ documentId: docId, assignedTo: 'X' });
    expect(res.status).toBe(403);
  });

  it('401 — no auth', async () => {
    const docId = await makeDoc();
    const res = await supertest(app)
      .post('/admin/review-tokens')
      .send({ documentId: docId, assignedTo: 'X' });
    expect(res.status).toBe(401);
  });

  it('400 — invalid documentId', async () => {
    const res = await supertest(app)
      .post('/admin/review-tokens')
      .set(ADMIN_AUTH)
      .send({ documentId: 'not-an-objectid', assignedTo: 'X' });
    expect(res.status).toBe(400);
  });

  it('400 — missing assignedTo', async () => {
    const docId = await makeDoc();
    const res = await supertest(app)
      .post('/admin/review-tokens')
      .set(ADMIN_AUTH)
      .send({ documentId: docId });
    expect(res.status).toBe(400);
  });

  it('404 — document not found', async () => {
    const res = await supertest(app)
      .post('/admin/review-tokens')
      .set(ADMIN_AUTH)
      .send({ documentId: '000000000000000000000099', assignedTo: 'X' });
    expect(res.status).toBe(404);
  });

  it('generates unique tokens across calls', async () => {
    const docId = await makeDoc();
    const a = await supertest(app)
      .post('/admin/review-tokens')
      .set(ADMIN_AUTH)
      .send({ documentId: docId, assignedTo: 'A' });
    const b = await supertest(app)
      .post('/admin/review-tokens')
      .set(ADMIN_AUTH)
      .send({ documentId: docId, assignedTo: 'B' });
    expect(a.body.token).not.toBe(b.body.token);
  });
});

describe('GET /admin/review-tokens', () => {
  it('200 — Admin lists tokens with document title', async () => {
    const docId = await makeDoc({ title: 'Test draft 1' });
    await supertest(app)
      .post('/admin/review-tokens')
      .set(ADMIN_AUTH)
      .send({ documentId: docId, assignedTo: 'Adv. A' });

    const res = await supertest(app).get('/admin/review-tokens').set(ADMIN_AUTH);
    expect(res.status).toBe(200);
    expect(res.body.tokens.length).toBe(1);
    expect(res.body.tokens[0].documentTitle).toBe('Test draft 1');
    expect(res.body.tokens[0].assignedTo).toBe('Adv. A');
  });

  it('403 — Client', async () => {
    const res = await supertest(app).get('/admin/review-tokens').set(CLIENT_AUTH);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /admin/review-tokens/:token/disable', () => {
  it('200 — disables', async () => {
    const docId = await makeDoc();
    const gen = await supertest(app)
      .post('/admin/review-tokens')
      .set(ADMIN_AUTH)
      .send({ documentId: docId, assignedTo: 'X' });
    const tok = gen.body.token;

    const res = await supertest(app)
      .patch(`/admin/review-tokens/${encodeURIComponent(tok)}/disable`)
      .set(ADMIN_AUTH);
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
  });

  it('404 — unknown token', async () => {
    const res = await supertest(app)
      .patch('/admin/review-tokens/no-such-token/disable')
      .set(ADMIN_AUTH);
    expect(res.status).toBe(404);
  });
});

// ── Public route tests ────────────────────────────────────────────────────────

describe('GET /review/:token (public)', () => {
  async function setup(): Promise<{ token: string; docId: string }> {
    const docId = await makeDoc();
    const gen = await supertest(app)
      .post('/admin/review-tokens')
      .set(ADMIN_AUTH)
      .send({ documentId: docId, assignedTo: 'Adv. Kumar' });
    return { token: gen.body.token, docId };
  }

  it('404 — unknown token', async () => {
    const res = await supertest(app).get('/review/totally-fake');
    expect(res.status).toBe(404);
  });

  it('200 — returns document content + form schema', async () => {
    const { token } = await setup();
    const res = await supertest(app).get(`/review/${encodeURIComponent(token)}`);
    expect(res.status).toBe(200);
    expect(res.body.document.title).toBe('Bail Application — Patna HC');
    expect(res.body.document.content).toContain('Para 1.');
    expect(res.body.review.assignedTo).toBe('Adv. Kumar');
    expect(res.body.formSchema.yes_no_items.length).toBe(8);
    expect(res.body.formSchema.verdicts.length).toBe(4);
  });

  it('403 — revoked token', async () => {
    const { token } = await setup();
    await ReviewToken.updateOne({ token }, { $set: { isActive: false } });
    const res = await supertest(app).get(`/review/${encodeURIComponent(token)}`);
    expect(res.status).toBe(403);
  });

  it('410 — expired token', async () => {
    const { token } = await setup();
    await ReviewToken.updateOne({ token }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await supertest(app).get(`/review/${encodeURIComponent(token)}`);
    expect(res.status).toBe(410);
  });

  it('409 — already used', async () => {
    const { token } = await setup();
    await ReviewToken.updateOne({ token }, { $set: { isUsed: true } });
    const res = await supertest(app).get(`/review/${encodeURIComponent(token)}`);
    expect(res.status).toBe(409);
  });
});

describe('POST /review/:token/feedback (public)', () => {
  async function setup(): Promise<string> {
    const docId = await makeDoc();
    const gen = await supertest(app)
      .post('/admin/review-tokens')
      .set(ADMIN_AUTH)
      .send({ documentId: docId, assignedTo: 'Adv. Kumar' });
    return gen.body.token;
  }

  const VALID_BODY = {
    causeTitleCorrect: true,
    sectionsCorrect: true,
    factsAccurate: false,
    prayerCorrect: true,
    citationsCorrect: true,
    annexuresSufficient: true,
    formattingCorrect: true,
    wouldFileAfterEdits: true,
    overallVerdict: 'minor_edits',
    comments: 'Two small typos in para 3.',
  };

  it('201 — submission stored, token marked used', async () => {
    const token = await setup();
    const res = await supertest(app)
      .post(`/review/${encodeURIComponent(token)}/feedback`)
      .send(VALID_BODY);
    expect(res.status).toBe(201);
    expect(res.body.overallVerdict).toBe('minor_edits');

    const fb = await ReviewFeedback.findOne({});
    expect(fb).not.toBeNull();
    expect(fb!.factsAccurate).toBe(false);
    expect(fb!.comments).toBe('Two small typos in para 3.');

    const rt = await ReviewToken.findOne({ token });
    expect(rt!.isUsed).toBe(true);
  });

  it('400 — checklist field missing', async () => {
    const token = await setup();
    const { causeTitleCorrect: _omit, ...rest } = VALID_BODY;
    void _omit;
    const res = await supertest(app)
      .post(`/review/${encodeURIComponent(token)}/feedback`)
      .send(rest);
    expect(res.status).toBe(400);
  });

  it('400 — invalid verdict', async () => {
    const token = await setup();
    const res = await supertest(app)
      .post(`/review/${encodeURIComponent(token)}/feedback`)
      .send({ ...VALID_BODY, overallVerdict: 'wrong' });
    expect(res.status).toBe(400);
  });

  it('409 — second submission rejected (single-shot)', async () => {
    const token = await setup();
    await supertest(app)
      .post(`/review/${encodeURIComponent(token)}/feedback`)
      .send(VALID_BODY);
    const second = await supertest(app)
      .post(`/review/${encodeURIComponent(token)}/feedback`)
      .send(VALID_BODY);
    expect(second.status).toBe(409);
  });

  it('records founder telemetry Event on submission', async () => {
    const token = await setup();
    await supertest(app)
      .post(`/review/${encodeURIComponent(token)}/feedback`)
      .send(VALID_BODY);
    const event = await Event.findOne({ type: 'panel_review_submitted' });
    expect(event).not.toBeNull();
    expect(event!.metadata).toMatchObject({ verdict: 'minor_edits', assignedTo: 'Adv. Kumar' });
  });
});

// ── Aggregation route ─────────────────────────────────────────────────────────

describe('GET /admin/panel-review', () => {
  it('200 — empty matrix when no tokens', async () => {
    const res = await supertest(app).get('/admin/panel-review').set(ADMIN_AUTH);
    expect(res.status).toBe(200);
    expect(res.body.matrix).toEqual([]);
    expect(res.body.counts.total).toBe(0);
  });

  it('200 — matrix shows pending then submitted with verdict', async () => {
    const docId = await makeDoc({ title: 'Doc A' });
    const docId2 = await makeDoc({ title: 'Doc B' });

    const t1 = await supertest(app)
      .post('/admin/review-tokens')
      .set(ADMIN_AUTH)
      .send({ documentId: docId, assignedTo: 'Adv. A' });
    await supertest(app)
      .post('/admin/review-tokens')
      .set(ADMIN_AUTH)
      .send({ documentId: docId2, assignedTo: 'Adv. B' });

    // Submit feedback only for Adv. A
    await supertest(app)
      .post(`/review/${encodeURIComponent(t1.body.token)}/feedback`)
      .send({
        causeTitleCorrect: true,
        sectionsCorrect: true,
        factsAccurate: true,
        prayerCorrect: true,
        citationsCorrect: true,
        annexuresSufficient: true,
        formattingCorrect: true,
        wouldFileAfterEdits: true,
        overallVerdict: 'ready_to_file',
      });

    const res = await supertest(app).get('/admin/panel-review').set(ADMIN_AUTH);
    expect(res.status).toBe(200);
    expect(res.body.counts.total).toBe(2);
    expect(res.body.counts.submitted).toBe(1);
    expect(res.body.counts.pending).toBe(1);
    expect(res.body.counts.verdicts.ready_to_file).toBe(1);

    const rowA = res.body.matrix.find((r: { assignedTo: string }) => r.assignedTo === 'Adv. A');
    expect(rowA.status).toBe('submitted');
    expect(rowA.verdict).toBe('ready_to_file');
    expect(rowA.checklist).not.toBeNull();

    const rowB = res.body.matrix.find((r: { assignedTo: string }) => r.assignedTo === 'Adv. B');
    expect(rowB.status).toBe('pending');
  });

  it('403 — Client cannot access', async () => {
    const res = await supertest(app).get('/admin/panel-review').set(CLIENT_AUTH);
    expect(res.status).toBe(403);
  });
});

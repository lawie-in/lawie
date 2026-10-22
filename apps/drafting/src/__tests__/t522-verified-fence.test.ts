/**
 * T-522 (Arjun ruling 6, 22 Oct 2026) — requireVerifiedEmail on the drafting routes that call a
 * model. Unverified fixtures throughout; the rest of the suite uses createVerifiedUser.
 *
 *   1. each fenced route answers 403 email_verification_required to an unverified user
 *   2. the 403 comes before the 402 (0 Ink), before templateGuard and before enforceCredits
 *   3. a failed user read answers 503 (fail closed)
 *   4. verified = emailVerified true, OR authProvider google, OR a non-empty googleId
 *   5. /intake/answers, export, annexures-pack and document GET/PATCH/DELETE stay open
 *   6. position: after authenticate and requireCurrentPrivacy (real middleware here)
 */
import './setupDb';
import { CURRENT_PRIVACY_VERSION } from '@lawie/shared';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { LawieDocument } from '../models/Document.model';
import { User } from '../models/User.model';
import { encrypt } from '../utils/encryption';
import { createVerifiedUser } from './verifiedUser';

// Real requireCurrentPrivacy for the ordering test (setupEnv replaces it with a pass-through).
jest.mock('@lawie/shared', () => jest.requireActual('@lawie/shared'));

const INTERNAL_SECRET = process.env.INTERNAL_SECRET as string;
const USER_ID = '507f1f77bcf86cd799439522';
const FENCE = 'email_verification_required';

function headers(extra: Record<string, string> = {}) {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': USER_ID,
    'x-user-email': 'test@test.com',
    'x-user-name': 'Test',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
    'x-user-privacy-version': CURRENT_PRIVACY_VERSION,
    ...extra,
  };
}

const FENCED: Array<[string, Record<string, unknown>]> = [
  ['/preflight', { template_id: 'bail_regular', form_data: {} }],
  ['/generate-from-template', { template_id: 'bail_regular', form_data: {} }],
  ['/generate-from-brief', { kind: 'bail_regular', values: [] }],
  ['/intake', { description: 'My client was arrested on a cheque bounce complaint.' }],
  ['/intake/brief', { description: 'My client was arrested on a cheque bounce complaint.' }],
  ['/intake/brief/update', { template_id: 'bail_regular', values: [] }],
];

async function unverifiedUser(extra: Record<string, unknown> = {}) {
  // Raw User.create on purpose: no emailVerified, so the fence must refuse.
  return User.create({ _id: USER_ID, plan: 'free', inkSub: 0, inkTopup: 0, ...extra });
}

afterEach(() => jest.restoreAllMocks());

describe('T-522 requireVerifiedEmail — fenced routes refuse an unverified user', () => {
  it.each(FENCED)('POST %s -> 403 email_verification_required', async (path, body) => {
    await unverifiedUser();
    const res = await request(app).post(path).set(headers()).send(body);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: FENCE });
  });

  it.each(FENCED)('POST %s -> 403 for an explicit emailVerified:false', async (path, body) => {
    await unverifiedUser({ emailVerified: false });
    const res = await request(app).post(path).set(headers()).send(body);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(FENCE);
  });

  it.each(FENCED)(
    'POST %s -> 403 for an empty googleId and a password provider',
    async (path, body) => {
      await unverifiedUser({ emailVerified: false, googleId: '', authProvider: 'local' });
      const res = await request(app).post(path).set(headers()).send(body);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe(FENCE);
    },
  );

  it.each(FENCED)('POST %s -> 403 when the user row does not exist', async (path, body) => {
    const res = await request(app).post(path).set(headers()).send(body);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(FENCE);
  });

  it.each(FENCED)('POST %s -> 403 for a malformed user id', async (path, body) => {
    const res = await request(app)
      .post(path)
      .set(headers({ 'x-user-id': 'not-an-object-id' }))
      .send(body);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(FENCE);
  });
});

describe('T-522 requireVerifiedEmail — fail closed', () => {
  it.each(FENCED)('POST %s -> 503 when the user read throws', async (path, body) => {
    await unverifiedUser({ emailVerified: true }); // verified, so only the DB error can stop it
    jest.spyOn(User, 'findById').mockImplementation((() => ({
      lean: () => Promise.reject(new Error('mongo down')),
    })) as never);
    const res = await request(app).post(path).set(headers()).send(body);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'Service unavailable' });
  });
});

describe('T-522 requireVerifiedEmail — the 403 comes before the 402', () => {
  it('an unverified user with 0 Ink gets 403 on /generate-from-template, not 402', async () => {
    await unverifiedUser();
    const res = await request(app)
      .post('/generate-from-template')
      .set(headers())
      .send({ template_id: 'bail_regular', form_data: {} });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(FENCE);
  });

  it('control: the same request from a verified user with 0 Ink is a 402', async () => {
    await createVerifiedUser({ _id: USER_ID, plan: 'free', inkSub: 0, inkTopup: 0 });
    const res = await request(app)
      .post('/generate-from-template')
      .set(headers())
      .send({ template_id: 'bail_regular', form_data: {} });
    expect(res.status).toBe(402);
  });

  it('an unverified user with 0 Ink gets 403 on /generate-from-brief, not 402', async () => {
    await unverifiedUser();
    const res = await request(app)
      .post('/generate-from-brief')
      .set(headers())
      .send({ kind: 'bail_regular', values: [] });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(FENCE);
  });

  it('it is also before templateGuard: an unlisted template id is still 403 for unverified', async () => {
    await unverifiedUser();
    for (const path of ['/generate-from-template', '/preflight']) {
      const res = await request(app)
        .post(path)
        .set(headers())
        .send({ template_id: 'not_a_template', form_data: {} });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe(FENCE);
    }
  });

  it('control: a verified user with an unlisted template id is refused by the guard, not the fence', async () => {
    await createVerifiedUser({ _id: USER_ID, inkTopup: 0 });
    const res = await request(app)
      .post('/generate-from-template')
      .set(headers())
      .send({ template_id: 'not_a_template', form_data: {} });
    expect(res.status).not.toBe(403);
    expect(res.body.error).not.toBe(FENCE);
  });
});

describe('T-522 requireVerifiedEmail — position after authenticate and requireCurrentPrivacy', () => {
  it.each(FENCED)(
    'POST %s -> 401 without the internal secret, before the fence',
    async (path, body) => {
      await unverifiedUser();
      const res = await request(app)
        .post(path)
        .set({ ...headers(), 'x-internal-secret': 'wrong-secret-wrong-secret' })
        .send(body);
      expect(res.status).toBe(401);
    },
  );

  it.each(['/generate-from-template', '/generate-from-brief'])(
    'POST %s -> privacy_reaccept_required (not the fence) for an unverified user on a stale privacy version',
    async (path) => {
      await unverifiedUser();
      const res = await request(app)
        .post(path)
        .set(headers({ 'x-user-privacy-version': '2026-10-11' }))
        .send({});
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'privacy_reaccept_required' });
    },
  );

  it.each(['/generate-from-template', '/generate-from-brief'])(
    'POST %s -> the fence once privacy is current',
    async (path) => {
      await unverifiedUser();
      const res = await request(app)
        .post(path)
        .set(headers({ 'x-user-privacy-version': CURRENT_PRIVACY_VERSION }))
        .send({});
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: FENCE });
    },
  );
});

describe('T-522 requireVerifiedEmail — what counts as verified', () => {
  const CASES: Array<[string, Record<string, unknown>]> = [
    ['emailVerified true', { emailVerified: true }],
    ['authProvider google', { authProvider: 'google' }],
    ['a non-empty googleId', { googleId: 'g-1234567890' }],
  ];

  describe.each(CASES)('%s', (_label, fields) => {
    it.each(FENCED)('POST %s passes the fence', async (path, body) => {
      await User.create({ _id: USER_ID, plan: 'free', inkSub: 0, inkTopup: 0, ...fields });
      const res = await request(app).post(path).set(headers()).send(body);
      expect(res.body.error).not.toBe(FENCE);
      expect(res.status).not.toBe(503);
    });
  });

  it('a verified user with 0 Ink passes the fence and meets the 402 on generate', async () => {
    await User.create({
      _id: USER_ID,
      plan: 'free',
      inkSub: 0,
      inkTopup: 0,
      authProvider: 'google',
    });
    const res = await request(app)
      .post('/generate-from-template')
      .set(headers())
      .send({ template_id: 'bail_regular', form_data: {} });
    expect(res.status).toBe(402);
  });
});

describe('T-522 requireVerifiedEmail — routes that stay open to an unverified user', () => {
  const MISSING = new mongoose.Types.ObjectId().toString();

  async function ownDoc() {
    return LawieDocument.create({
      userId: USER_ID,
      title: 'T-522 open route',
      docType: 'bail_application',
      generatedContent: encrypt('Generated content'),
    });
  }

  it('POST /intake/answers is not fenced', async () => {
    await unverifiedUser();
    const res = await request(app)
      .post('/intake/answers')
      .set(headers())
      .send({ template_id: 'bail_regular', answers: {} });
    expect(res.body.error).not.toBe(FENCE);
    expect(res.status).not.toBe(503);
  });

  it('GET /:id returns the document', async () => {
    await unverifiedUser();
    const doc = await ownDoc();
    const res = await request(app).get(`/${doc._id}`).set(headers());
    expect(res.status).toBe(200);
  });

  it('PATCH /:id updates the document', async () => {
    await unverifiedUser();
    const doc = await ownDoc();
    const res = await request(app)
      .patch(`/${doc._id}`)
      .set(headers())
      .send({ finalContent: 'Edited by an unverified user' });
    expect(res.status).toBe(200);
  });

  it('DELETE /:id deletes the document', async () => {
    await unverifiedUser();
    const doc = await ownDoc();
    const res = await request(app).delete(`/${doc._id}`).set(headers());
    expect(res.status).toBe(200);
  });

  it.each(['/export/pdf', '/export/docx', '/annexures-pack'])(
    'POST /:id%s answers 404 for a missing document, never the fence',
    async (suffix) => {
      await unverifiedUser();
      const res = await request(app).post(`/${MISSING}${suffix}`).set(headers());
      expect(res.status).toBe(404);
      expect(res.body.error).not.toBe(FENCE);
    },
  );
});

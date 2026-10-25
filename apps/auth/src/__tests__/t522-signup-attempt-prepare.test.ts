/**
 * T-522 (AJ-522-M5, S9) - POST /internal/signup-attempt/prepare { userId }, called only by the
 * email worker for an auth.signupAttempt job (userId only in Redis, T-223 condition 1).
 * 200 { email, signInUrl, resetUrl } with plain pages and NO token; 404 for an unknown, inactive
 * or closing user; 400 / 401 for a bad body / secret. It mints nothing and is no-store.
 */
import './setupEnv';

jest.mock('ioredis', () => jest.requireActual('ioredis-mock'));

import './setupDb';

import mongoose from 'mongoose';
import supertest from 'supertest';

import app from '../app';
import { User } from '../models/User.model';

import { rawUsers } from './t234-helpers';

const SECRET = process.env.INTERNAL_SECRET as string;
const post = (body: unknown, secret: string | null = SECRET) => {
  const r = supertest(app).post('/internal/signup-attempt/prepare');
  return (secret === null ? r : r.set('x-internal-secret', secret)).send(body as object);
};

let n = 0;
const mk = (fields: Record<string, unknown> = {}) => {
  n += 1;
  return User.create({
    email: `t522-sa-${n}@example.com`,
    name: 'Attempt Person',
    password: 'Passw0rdOk',
    ...fields,
  });
};

describe('T-522 signup-attempt prepare route', () => {
  it('200 with the address and the two plain page URLs; no token anywhere; no-store', async () => {
    const u = await mk();
    const res = await post({ userId: String(u._id) });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(Object.keys(res.body).sort()).toEqual(['email', 'resetUrl', 'signInUrl']);
    expect(res.body.email).toBe(u.email);
    expect(res.body.signInUrl).toBe('http://localhost:3000/login');
    expect(res.body.resetUrl).toBe('http://localhost:3000/forgot-password');
    expect(JSON.stringify(res.body)).not.toMatch(/token|[?]/i);
  });

  it('mints nothing: the account holds no verify link and no reset token afterwards', async () => {
    const u = await mk();
    await post({ userId: String(u._id) });
    const doc = await rawUsers().findOne({ _id: u._id });
    expect(doc!['emailVerifyTokenHash']).toBeUndefined();
    expect(doc!['emailVerifyKind']).toBeUndefined();
    expect(doc!['passwordResetToken']).toBeUndefined();
  });

  it('404 for an unknown id, a malformed id, an inactive user and a closing (erasure) user', async () => {
    const inactive = await mk();
    await rawUsers().updateOne({ _id: inactive._id }, { $set: { isActive: false } });
    const closing = await mk();
    await rawUsers().updateOne(
      { _id: closing._id },
      { $set: { erasure: { requestedAt: new Date(), stage: 'locked' } } },
    );
    for (const id of [
      String(new mongoose.Types.ObjectId()),
      'not-an-id',
      String(inactive._id),
      String(closing._id),
    ]) {
      const res = await post({ userId: id });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'not_found' });
    }
  });

  it('400 for a missing or non-string userId', async () => {
    for (const body of [{}, { userId: '' }, { userId: 5 }, undefined]) {
      expect((await post(body)).status).toBe(400);
    }
  });

  it('401 with a missing or wrong secret, and nothing is revealed', async () => {
    const u = await mk();
    for (const secret of [null, 'wrong', '']) {
      const res = await post({ userId: String(u._id) }, secret);
      expect(res.status).toBe(401);
      expect(res.text).not.toContain(u.email);
    }
  });
});

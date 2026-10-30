/**
 * T-587 (Arjun, option A) - POST /internal/welcome/prepare { userId }, called only by the email
 * worker for an auth.welcome job (userId only in Redis). 200 { email, name, loginUrl } for a live,
 * non-test account whose welcome was claimed; 404 otherwise; 400 / 401 for a bad body / secret.
 * No-store; never returns any other user field.
 */
import './setupEnv';

jest.mock('ioredis', () => jest.requireActual('ioredis-mock'));

import './setupDb';

import mongoose from 'mongoose';
import supertest from 'supertest';

import app from '../app';
import { User } from '../models/User.model';
import { buildLoginUrl } from '../services/password-reset.service';

import { rawUsers } from './t234-helpers';

const SECRET = process.env.INTERNAL_SECRET as string;
const post = (body: unknown, secret: string | null = SECRET) => {
  const r = supertest(app).post('/internal/welcome/prepare');
  return (secret === null ? r : r.set('x-internal-secret', secret)).send(body as object);
};

let n = 0;
const mk = (fields: Record<string, unknown> = {}) => {
  n += 1;
  return User.create({
    email: `t587-wp-${n}@example.com`,
    name: 'Anita Rao',
    password: 'Passw0rdOk',
    welcomeQueuedAt: new Date(),
    ...fields,
  });
};

describe('T-587 welcome prepare route', () => {
  it('200 with exactly {email, name, loginUrl}; loginUrl from buildLoginUrl; no-store', async () => {
    const u = await mk();
    const res = await post({ userId: String(u._id) });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(Object.keys(res.body).sort()).toEqual(['email', 'loginUrl', 'name']);
    expect(res.body.email).toBe(u.email);
    expect(res.body.name).toBe('Anita Rao');
    expect(res.body.loginUrl).toBe(buildLoginUrl());
  });

  it('never returns other user fields (password hash, ids, tokens, referral code)', async () => {
    const u = await mk();
    const res = await post({ userId: String(u._id) });
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/password|hash|token|googleId|referral|_id|isActive|erasure/i);
    expect(text).not.toContain(String(u._id));
  });

  it('name is the empty string when it equals the address (Google stores displayName ?? email)', async () => {
    const u = await mk({ email: 't587-same@example.com', name: 't587-same@example.com' });
    const res = await post({ userId: String(u._id) });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('');
    const upper = await mk({ email: 't587-case@example.com', name: ' T587-CASE@example.com ' });
    expect((await post({ userId: String(upper._id) })).body.name).toBe('');
  });

  it('name is trimmed', async () => {
    const u = await mk({ name: '  Anita Rao  ' });
    expect((await post({ userId: String(u._id) })).body.name).toBe('Anita Rao');
  });

  it('404 when no welcome was claimed (welcomeQueuedAt null or absent)', async () => {
    const nullFlag = await mk({ welcomeQueuedAt: null });
    const absent = await mk();
    await rawUsers().updateOne({ _id: absent._id }, { $unset: { welcomeQueuedAt: '' } });
    for (const id of [String(nullFlag._id), String(absent._id)]) {
      const res = await post({ userId: id });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'not_found' });
    }
  });

  it('404 for an unknown id, a malformed id, an inactive, a closing (erasure) and a test account', async () => {
    const inactive = await mk();
    await rawUsers().updateOne({ _id: inactive._id }, { $set: { isActive: false } });
    const closing = await mk();
    await rawUsers().updateOne(
      { _id: closing._id },
      { $set: { erasure: { requestedAt: new Date(), stage: 'locked' } } },
    );
    const test = await mk();
    await rawUsers().updateOne({ _id: test._id }, { $set: { isTestAccount: true } });
    for (const id of [
      String(new mongoose.Types.ObjectId()),
      'not-an-id',
      String(inactive._id),
      String(closing._id),
      String(test._id),
    ]) {
      const res = await post({ userId: id });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'not_found' });
    }
  });

  it('400 for a missing or non-string userId', async () => {
    for (const body of [{}, { userId: '' }, { userId: 5 }, { userId: { $ne: null } }, undefined]) {
      expect((await post(body)).status).toBe(400);
    }
  });

  it('401 with a missing or wrong secret, and nothing is revealed', async () => {
    const u = await mk();
    for (const secret of [null, 'wrong', '']) {
      const res = await post({ userId: String(u._id) }, secret);
      expect(res.status).toBe(401);
      expect(res.text).not.toContain(u.email);
      expect(res.text).not.toContain('Anita');
    }
  });

  it('401 comes before 400: a bad body with a wrong secret is still 401', async () => {
    expect((await post({}, 'wrong')).status).toBe(401);
  });

  it('a GET is not a route', async () => {
    expect((await supertest(app).get('/internal/welcome/prepare')).status).toBe(404);
  });
});

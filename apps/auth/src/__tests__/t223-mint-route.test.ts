/**
 * T-223 Arjun condition 2: POST /internal/verify-email/mint (email worker only).
 * 401 bad secret, 400 no userId, 404 unknown user, 409 not eligible (nothing minted),
 * 200 { email, name, link } with Cache-Control: no-store.
 */

import './setupEnv';

jest.mock('ioredis', () => jest.requireActual('ioredis-mock'));
jest.mock('@lawie/email-client', () => ({ enqueueEmail: jest.fn() }));

import './setupDb';

import crypto from 'crypto';

import mongoose from 'mongoose';
import supertest from 'supertest';

import app from '../app';
import logger from '../config/logger';
import { User } from '../models/User.model';
import { verifyEmailToken } from '../services/verify-email.service';

import { rawUsers } from './t234-helpers';

const SECRET = process.env.INTERNAL_SECRET as string;
const PATH = '/internal/verify-email/mint';
const H = 'x-internal-secret';
const PASSWORD = 'Passw0rdOk';

let n = 0;
const mk = (fields: Record<string, unknown> = {}) => {
  n += 1;
  return User.create({
    email: `t223-route-${n}@example.com`,
    name: 'Route Person',
    password: PASSWORD,
    ...fields,
  });
};
const raw = async (id: unknown) =>
  (await rawUsers().findOne({ _id: id as mongoose.Types.ObjectId }))!;
const post = (body: unknown, secret: string | null = SECRET) => {
  const r = supertest(app).post(PATH);
  if (secret !== null) r.set(H, secret);
  return r.send(body as object);
};

beforeEach(() => {
  jest.spyOn(logger, 'info').mockImplementation(() => undefined);
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('T-223 mint route: secret (401)', () => {
  it('no header', async () => {
    const u = await mk();
    const res = await post({ userId: String(u._id) }, null);
    expect(res.status).toBe(401);
    expect((await raw(u._id)).emailVerifyTokenHash).toBeUndefined();
  });

  it('wrong secret of the same length', async () => {
    const u = await mk();
    const wrong = `${SECRET.slice(0, -1)}${SECRET.endsWith('x') ? 'y' : 'x'}`;
    expect(wrong).toHaveLength(SECRET.length);
    expect(wrong).not.toBe(SECRET);
    const res = await post({ userId: String(u._id) }, wrong);
    expect(res.status).toBe(401);
    expect(res.body).not.toHaveProperty('link');
    expect((await raw(u._id)).emailVerifyTokenHash).toBeUndefined();
  });

  it.each([
    ['shorter', 'short'],
    ['longer', 'test-internal-secret-at-least-16-and-more'],
    ['prefix of the real one', 'test-internal-secret'],
    ['empty', ''],
    ['upper-cased', 'TEST-INTERNAL-SECRET-AT-LEAST-16'],
  ])('wrong secret (%s)', async (_l, wrong) => {
    const u = await mk();
    const res = await post({ userId: String(u._id) }, wrong);
    expect(res.status).toBe(401);
  });

  it('401 comes before body validation (bad secret + no userId is 401, not 400)', async () => {
    expect((await post({}, 'nope-nope-nope-nope')).status).toBe(401);
  });

  it('the secret in the query string or body is not accepted', async () => {
    const u = await mk();
    const q = await supertest(app)
      .post(`${PATH}?x-internal-secret=${SECRET}`)
      .send({ userId: String(u._id) });
    expect(q.status).toBe(401);
    const b = await supertest(app)
      .post(PATH)
      .send({ userId: String(u._id), secret: SECRET });
    expect(b.status).toBe(401);
  });

  it('401 also carries no-store', async () => {
    const res = await post({}, 'wrong-wrong-wrong-w');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('the compare is constant-time: timingSafeEqual is used on equal-length digests', async () => {
    const spy = jest.spyOn(crypto, 'timingSafeEqual');
    await post({}, 'short');
    await post({}, SECRET.slice(0, -1) + '!');
    expect(spy).toHaveBeenCalledTimes(2);
    for (const call of spy.mock.calls) {
      expect((call[0] as Buffer).length).toBe(32);
      expect((call[1] as Buffer).length).toBe(32);
    }
  });
});

describe('T-223 mint route: body (400) and unknown user (404)', () => {
  it.each([
    ['missing body', undefined],
    ['empty object', {}],
    ['empty string', { userId: '' }],
    ['number', { userId: 123 }],
    ['operator object', { userId: { $ne: null } }],
    ['array', { userId: ['a'] }],
  ])('400: %s', async (_l, body) => {
    const res = await post(body ?? {});
    expect(res.status).toBe(400);
  });

  it('404: well-formed id that matches no user', async () => {
    const res = await post({ userId: String(new mongoose.Types.ObjectId()) });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  it('404: not an ObjectId', async () => {
    expect((await post({ userId: 'not-an-id' })).status).toBe(404);
  });
});

describe('T-223 mint route: 409 not eligible, nothing minted', () => {
  it.each([
    ['verified', { emailVerified: true }],
    ['google provider', { authProvider: 'google' }],
    ['googleId set', { googleId: 'g-t223-route' }],
    ['deactivated', { isActive: false }],
  ])('%s', async (_l, fields) => {
    const u = await mk(fields);
    const res = await post({ userId: String(u._id) });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'not_eligible' });
    const doc = await raw(u._id);
    expect(doc.emailVerifyTokenHash).toBeUndefined();
    expect(doc.emailVerifyExpires).toBeUndefined();
  });

  it('a 409 does not disturb a link minted earlier', async () => {
    const u = await mk();
    const first = await post({ userId: String(u._id) });
    expect(first.status).toBe(200);
    await rawUsers().updateOne({ _id: u._id }, { $set: { emailVerified: true } });
    const hashBefore = (await raw(u._id)).emailVerifyTokenHash;
    expect((await post({ userId: String(u._id) })).status).toBe(409);
    expect((await raw(u._id)).emailVerifyTokenHash).toBe(hashBefore);
  });
});

describe('T-223 mint route: 200', () => {
  it('returns {email, name, link, signupInkGranted} with no-store, and the link verifies the account', async () => {
    const u = await mk();
    const res = await post({ userId: String(u._id) });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(Object.keys(res.body).sort()).toEqual(['email', 'link', 'name', 'signupInkGranted']);
    expect(res.body.signupInkGranted).toBe(false);
    expect(res.body.email).toBe(u.email);
    expect(res.body.name).toBe('Route Person');
    expect(res.body.link).toMatch(/^http:\/\/localhost:3000\/verify-email\?token=[a-f0-9]{64}$/);

    const token = new URL(res.body.link).searchParams.get('token') as string;
    expect((await raw(u._id)).emailVerifyTokenHash).toBe(
      crypto.createHash('sha256').update(token).digest('hex'),
    );
    expect((await verifyEmailToken(token)).kind).toBe('verified');
  });

  it('a second call mints a new link and the first stops working (newest wins)', async () => {
    const u = await mk();
    const a = await post({ userId: String(u._id) });
    const b = await post({ userId: String(u._id) });
    expect(a.body.link).not.toBe(b.body.link);
    const ta = new URL(a.body.link).searchParams.get('token') as string;
    const tb = new URL(b.body.link).searchParams.get('token') as string;
    expect((await verifyEmailToken(ta)).kind).toBe('expired_or_invalid');
    expect((await verifyEmailToken(tb)).kind).toBe('verified');
  });

  it('GET on the path is not a route (404 from the auth fallback)', async () => {
    const res = await supertest(app).get(PATH).set(H, SECRET);
    expect(res.status).toBe(404);
  });
});

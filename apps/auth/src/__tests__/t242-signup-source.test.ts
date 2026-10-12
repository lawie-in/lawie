/**
 * T-242 — sign-up source (UTM). Ajay's conditions 2-5 on the auth side:
 *   AC1/2  register stores signupSource {utm*, recordedAt}; bad values are dropped (no 422)
 *   AC2    OAuth state carries no tags (Redis holds them instead); an old state with `u` is accepted, `u` dropped
 *   AC3    GET /admin/users/count-by-source is admin only and groups correctly
 *   AC4    no query string / UTM value in Sentry events or in any logger call
 */

import './setupEnv';

jest.mock('ioredis', () => require('ioredis-mock'));

import './setupDb';

import crypto from 'crypto';

import supertest from 'supertest';

import app from '../app';
import logger from '../config/logger';
import { scrubEvent } from '../config/sentry';
import { CURRENT_PRIVACY_VERSION, User } from '../models/User.model';
import { signAccessToken, signRefreshToken } from '../services/jwt.service';
import { createOAuthState, verifyOAuthState } from '../services/oauth-state';
import { createSession } from '../services/session.service';
import {
  buildSignupSource,
  sanitizeUtm,
  sanitizeUtmValue,
  validateRegister,
} from '../validators/auth.validator';

const PASSWORD = 'Passw0rdOk';
const CHALLENGE = 'A'.repeat(43);
let n = 0;
const email = () => `u242-${++n}-${Math.random().toString(36).slice(2)}@example.com`;
const reg = (extra: Record<string, unknown> = {}) =>
  supertest(app)
    .post('/register')
    .send({ email: email(), password: PASSWORD, name: 'Test Person', ...extra });

async function tokenFor(userId: string, role: 'Admin' | 'Lawyer') {
  const claims = { sub: userId, email: `${userId}@lawie.in`, name: 'T242', role, plan: 'free' };
  const accessToken = signAccessToken(claims as Parameters<typeof signAccessToken>[0]);
  const refreshToken = signRefreshToken(claims as Parameters<typeof signRefreshToken>[0]);
  await createSession(userId, accessToken, refreshToken, {
    plan: 'free',
    email: claims.email,
    role,
    name: claims.name,
  });
  return { Authorization: `Bearer ${accessToken}` };
}

describe('sanitizeUtmValue (Ajay condition 2)', () => {
  it('keeps a normal value, trimmed', () => {
    expect(sanitizeUtmValue('  google ')).toBe('google');
  });
  it('caps at 100 characters', () => {
    expect(sanitizeUtmValue('a'.repeat(250))).toBe('a'.repeat(100));
    expect(sanitizeUtmValue('b'.repeat(100))).toBe('b'.repeat(100));
  });
  it.each(['a@b.co', '@', 'call-9876543210', '1234567', 'x1234567y'])('drops %s', (v) => {
    expect(sanitizeUtmValue(v)).toBeUndefined();
  });
  it('keeps a run of 6 digits (below the limit)', () => {
    expect(sanitizeUtmValue('promo123456')).toBe('promo123456');
  });
  it('drops a digit run that straddles the 100th character', () => {
    expect(sanitizeUtmValue('a'.repeat(97) + '1234567')).toBeUndefined();
  });
  it.each([undefined, null, 5, true, {}, [], ['a']])('drops non-string %p', (v) => {
    expect(sanitizeUtmValue(v)).toBeUndefined();
  });
  it('drops empty and blank', () => {
    expect(sanitizeUtmValue('')).toBeUndefined();
    expect(sanitizeUtmValue('   ')).toBeUndefined();
  });
  it('buildSignupSource is undefined without a surviving tag, and stamps recordedAt otherwise', () => {
    expect(buildSignupSource(undefined)).toBeUndefined();
    expect(buildSignupSource({ utmSource: 'a@b.co' })).toBeUndefined();
    const s = buildSignupSource({ utmSource: 'x', utmMedium: '1234567' });
    expect(s).toEqual({ utmSource: 'x', recordedAt: expect.any(Date) });
    expect(sanitizeUtm({ utmCampaign: 'c' })).toEqual({ utmCampaign: 'c' });
  });
});

describe('POST /register stores signupSource', () => {
  it('stores the three tags and recordedAt, returns 201', async () => {
    const before = Date.now();
    const e = email();
    const res = await supertest(app).post('/register').send({
      email: e,
      password: PASSWORD,
      name: 'T',
      utmSource: 'newsletter',
      utmMedium: 'email',
      utmCampaign: 'launch',
    });
    expect(res.status).toBe(201);
    const u = await User.findOne({ email: e }).lean();
    expect(u!.signupSource).toMatchObject({
      utmSource: 'newsletter',
      utmMedium: 'email',
      utmCampaign: 'launch',
    });
    expect(u!.signupSource!.recordedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(u!.signupSource!.recordedAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    expect(u!.privacyVersion).toBe(CURRENT_PRIVACY_VERSION);
    // The tags are not echoed back in the response.
    expect(JSON.stringify(res.body)).not.toContain('newsletter');
  });

  it('stores only the tags that were sent', async () => {
    const e = email();
    await supertest(app)
      .post('/register')
      .send({ email: e, password: PASSWORD, name: 'T', utmSource: 'x' });
    const u = await User.findOne({ email: e }).lean();
    expect(u!.signupSource!.utmSource).toBe('x');
    expect(u!.signupSource).not.toHaveProperty('utmMedium');
    expect(u!.signupSource).not.toHaveProperty('utmCampaign');
  });

  it('caps a 300-character value at 100', async () => {
    const e = email();
    const res = await supertest(app)
      .post('/register')
      .send({ email: e, password: PASSWORD, name: 'T', utmCampaign: 'c'.repeat(300) });
    expect(res.status).toBe(201);
    const u = await User.findOne({ email: e }).lean();
    expect(u!.signupSource!.utmCampaign).toBe('c'.repeat(100));
  });

  it.each([
    ['an @', 'a@b.co'],
    ['7 digits', '1234567'],
    ['non-string number', 42],
    ['non-string object', { $ne: '' }],
    ['non-string array', ['x']],
    ['null', null],
  ])('a bad value (%s) is dropped with no 422; the good tags stay', async (_l, bad) => {
    const e = email();
    const res = await supertest(app)
      .post('/register')
      .send({ email: e, password: PASSWORD, name: 'T', utmSource: bad, utmMedium: 'ok' });
    expect(res.status).toBe(201);
    const u = await User.findOne({ email: e }).lean();
    expect(u!.signupSource).toMatchObject({ utmMedium: 'ok' });
    expect(u!.signupSource).not.toHaveProperty('utmSource');
  });

  it('all three bad: account created, no signupSource at all', async () => {
    const e = email();
    const res = await supertest(app).post('/register').send({
      email: e,
      password: PASSWORD,
      name: 'T',
      utmSource: 'a@b.co',
      utmMedium: 7,
      utmCampaign: '99999999',
    });
    expect(res.status).toBe(201);
    const raw = await User.collection.findOne({ email: e });
    expect(raw).not.toHaveProperty('signupSource');
  });

  it('a register with no tags has no signupSource', async () => {
    const e = email();
    const res = await supertest(app)
      .post('/register')
      .send({ email: e, password: PASSWORD, name: 'T' });
    expect(res.status).toBe(201);
    const raw = await User.collection.findOne({ email: e });
    expect(raw).not.toHaveProperty('signupSource');
  });

  it('validateRegister drops bad tags instead of throwing', () => {
    const out = validateRegister({
      email: 'v@example.com',
      password: PASSWORD,
      name: 'V',
      utmSource: 'a@b.co',
      utmMedium: 'ok',
      utmCampaign: 12,
    });
    expect(out).toMatchObject({ utmMedium: 'ok' });
    expect((out as { utmSource?: string }).utmSource).toBeUndefined();
  });

  it('a validation failure still returns 422 (tags do not change that)', async () => {
    const res = await supertest(app)
      .post('/register')
      .send({ email: 'not-an-email', password: PASSWORD, name: 'T', utmSource: 'x' });
    expect(res.status).toBe(422);
  });
});

describe('OAuth state carries no tags (Arjun (a), Ajay condition 3)', () => {
  // Hand-sign a state with a chosen body (same scheme as oauth-state.ts).
  function signed(body: Record<string, unknown>): string {
    const payload = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
    const key = crypto
      .createHmac('sha256', process.env.JWT_SECRET as string)
      .update('oauth-state-v1')
      .digest();
    return `${payload}.${crypto.createHmac('sha256', key).update(payload).digest('base64url')}`;
  }
  const bodyOf = (state: string): Record<string, unknown> =>
    JSON.parse(Buffer.from(state.split('.')[0], 'base64url').toString('utf8'));

  it('createOAuthState takes only (challenge, referralCode)', () => {
    expect(createOAuthState.length).toBeLessThanOrEqual(2);
  });

  it('the state body is exactly {c, r, t}, with no u', () => {
    const state = createOAuthState(CHALLENGE, 'REF1');
    expect(Object.keys(bodyOf(state)).sort()).toEqual(['c', 'r', 't']);
    const v = verifyOAuthState(state);
    expect(v).not.toBeNull();
    expect(v!.c).toBe(CHALLENGE);
    expect(v!.r).toBe('REF1');
    expect(v).not.toHaveProperty('u');
  });

  it('no referral: the body is exactly {c, t}', () => {
    const state = createOAuthState(CHALLENGE);
    expect(Object.keys(bodyOf(state)).sort()).toEqual(['c', 't']);
    expect(verifyOAuthState(state)).not.toHaveProperty('u');
  });

  it('extra arguments cannot put tags into the state', () => {
    const loose = createOAuthState as unknown as (...a: unknown[]) => string;
    const state = loose(CHALLENGE, undefined, { utmSource: 'zzleak', utmMedium: 'zzleak' });
    expect(Buffer.from(state.split('.')[0], 'base64url').toString('utf8')).not.toContain('zzleak');
    expect(bodyOf(state)).not.toHaveProperty('u');
  });

  it('an old-style signed state with u is accepted and u is dropped', () => {
    const v = verifyOAuthState(
      signed({ c: CHALLENGE, r: 'REF2', u: { s: 'x', m: 'y' }, t: Date.now() }),
    );
    expect(v).not.toBeNull();
    expect(v!.c).toBe(CHALLENGE);
    expect(v!.r).toBe('REF2');
    expect(v).not.toHaveProperty('u');
  });

  it('an old-style state with a malformed u is also accepted with u ignored', () => {
    for (const u of ['str', 5, [], null, { s: 5 }]) {
      const v = verifyOAuthState(signed({ c: CHALLENGE, u, t: Date.now() }));
      expect(v).not.toBeNull();
      expect(v).not.toHaveProperty('u');
    }
  });

  it('a state tampered after signing is still refused', () => {
    const [, sig] = createOAuthState(CHALLENGE).split('.');
    const forged = Buffer.from(
      JSON.stringify({ c: CHALLENGE, u: { s: 'evil' }, t: Date.now() }),
      'utf8',
    ).toString('base64url');
    expect(verifyOAuthState(`${forged}.${sig}`)).toBeNull();
  });
});

describe('GET /admin/users/count-by-source', () => {
  it('401 without auth', async () => {
    const res = await supertest(app).get('/admin/users/count-by-source');
    expect(res.status).toBe(401);
  });

  it('403 for a non-admin', async () => {
    const h = await tokenFor('507f1f77bcf86cd799439021', 'Lawyer');
    const res = await supertest(app).get('/admin/users/count-by-source').set(h);
    expect(res.status).toBe(403);
    expect(res.body).not.toHaveProperty('bySource');
  });

  it('admin: groups by utmSource, null for missing, counts only', async () => {
    const mk = (source?: string, medium?: string) =>
      User.create({
        email: email(),
        name: 'C',
        password: PASSWORD,
        ...(source || medium
          ? { signupSource: { utmSource: source, utmMedium: medium, recordedAt: new Date() } }
          : {}),
      });
    await mk('google');
    await mk('google', 'cpc');
    await mk('google');
    await mk('newsletter');
    await mk();
    await mk();

    const h = await tokenFor('507f1f77bcf86cd799439022', 'Admin');
    const res = await supertest(app).get('/admin/users/count-by-source').set(h);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(6);
    expect(res.body.bySource).toEqual([
      { source: 'google', count: 3 },
      { source: null, count: 2 },
      { source: 'newsletter', count: 1 },
    ]);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('@');
    expect(text).not.toContain('cpc');
  });

  it('admin with no users: total 0', async () => {
    const h = await tokenFor('507f1f77bcf86cd799439023', 'Admin');
    const res = await supertest(app).get('/admin/users/count-by-source').set(h);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ total: 0, bySource: [] });
  });

  it('the route is not reachable by POST', async () => {
    const h = await tokenFor('507f1f77bcf86cd799439024', 'Admin');
    const res = await supertest(app).post('/admin/users/count-by-source').set(h);
    expect(res.status).toBe(404);
  });
});

describe('Sentry scrubEvent (Ajay condition 3)', () => {
  it('drops query_string and cuts the url at ?', () => {
    const out = scrubEvent({
      request: {
        url: 'https://api.lawie.in/api/auth/google?utmSource=secretsrc&utmMedium=m&challenge=zzz',
        query_string: 'utmSource=secretsrc&utmMedium=m',
        method: 'GET',
      },
    } as never) as { request: { url: string; query_string?: string } };
    expect(out.request).not.toHaveProperty('query_string');
    expect(out.request.url).toBe('https://api.lawie.in/api/auth/google');
    expect(out.request.url).not.toContain('?');
    expect(JSON.stringify(out)).not.toContain('secretsrc');
  });

  it('an object-shaped query_string is also removed', () => {
    const out = scrubEvent({
      request: { url: 'http://x/y?utmSource=secretsrc', query_string: { utmSource: 'secretsrc' } },
    } as never) as { request: Record<string, unknown> };
    expect(out.request).not.toHaveProperty('query_string');
    expect(JSON.stringify(out)).not.toContain('secretsrc');
  });

  it('still masks an email in the path', () => {
    const out = scrubEvent({ request: { url: 'http://x/users/me@x.com?a=1' } } as never) as {
      request: { url: string };
    };
    expect(out.request.url).not.toContain('me@x.com');
    expect(out.request.url).not.toContain('?');
  });
});

describe('No logger call carries a UTM value (Ajay condition 3)', () => {
  const SENTINEL = 'zzsentinelsrc';
  it('register, /google start and the error handler log none of it', async () => {
    const spies = (['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const).map((l) =>
      jest.spyOn(logger, l),
    );
    try {
      await reg({ utmSource: SENTINEL, utmMedium: `${SENTINEL}m`, utmCampaign: `${SENTINEL}c` });
      // /google start (may answer 404/503 when Google is not configured; still must not log).
      await supertest(app)
        .get('/google')
        .query({
          challenge: CHALLENGE,
          utmSource: SENTINEL,
          utmMedium: `${SENTINEL}m`,
          utmCampaign: `${SENTINEL}c`,
        });
      // An error path with the tags in the query string.
      await supertest(app)
        .get(`/nope?utmSource=${SENTINEL}&utmMedium=${SENTINEL}m`)
        .set('Accept', 'application/json');
      await supertest(app)
        .post(`/register?utmSource=${SENTINEL}`)
        .send({ email: 'bad', password: 'x', utmSource: SENTINEL });
      const calls = spies.flatMap((s) => s.mock.calls);
      expect(calls.length).toBeGreaterThan(0); // the spy does see the service's log calls
      expect(JSON.stringify(calls)).not.toContain(SENTINEL);
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });
});

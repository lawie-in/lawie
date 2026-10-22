/**
 * T-507 — PATCH /me profile fields, POST /me/password, GET /me/sessions, DELETE /me/sessions/:id,
 * GET /me/privacy-history. Real app, in-memory Mongo, ioredis-mock.
 *
 *  AC1  PATCH /me takes the 9 profile fields (+ gstStateCode); API names map to stored names
 *  AC2  every field validated; null clears; email and unknown keys are 422; empty body 422
 *  AC3  the current-privacy-acceptance gate stays (403, same body, nothing written)
 *  AC4  change password, list sessions, sign out a session, privacy history
 *  AC5  a test per field and for the gate; no personal data in logs
 */

import './setupEnv';

jest.mock('ioredis', () => require('ioredis-mock'));

// Capture everything the app logs, through the REAL pino options (redact paths, serializers).
jest.mock('../config/logger', () => {
  const actual = jest.requireActual('../config/logger');
  const pino = jest.requireActual('pino');
  const captured: string[] = [];
  const log = pino(
    { ...actual.loggerOptions, level: 'trace' },
    { write: (s: string) => captured.push(s) },
  );
  return { ...actual, __esModule: true, default: log, __captured: captured };
});

import './setupDb';

import { CURRENT_PRIVACY_VERSION, refreshSessionKey, sessionKey } from '@lawie/shared';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import supertest from 'supertest';

import app from '../app';
import logger from '../config/logger';
import redis from '../config/redis';
import { Session } from '../models/Session.model';
import { User } from '../models/User.model';
import { pwchangeUserKey } from '../services/password-change-rate-limit';

// bcrypt cost 12 on every seed and login: the multi-login tests are slow on a loaded CI box.
jest.setTimeout(30000);

const PASSWORD = 'Passw0rdOk';
const NEW_PASSWORD = 'BrandNew1pass';
const OLD_VERSION = '2026-10-12b';
const captured = (jest.requireMock('../config/logger') as { __captured: string[] }).__captured;

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const raw = (email: string) => mongoose.connection.db!.collection('users').findOne({ email });

let n = 0;
async function seed(extra: Record<string, unknown> = {}) {
  n += 1;
  const email = `t507-${n}@example.com`;
  const u = await User.create({
    email,
    name: 'T507 Person',
    password: PASSWORD,
    privacyVersion: CURRENT_PRIVACY_VERSION,
    ...extra,
  });
  return { email, userId: String(u._id) };
}

interface Login {
  accessToken: string;
  refreshToken: string;
}
async function login(email: string, password = PASSWORD, ua = 'T507-Agent/1.0'): Promise<Login> {
  const res = await supertest(app).post('/login').set('User-Agent', ua).send({ email, password });
  expect(res.status).toBe(200);
  const d = res.body.data;
  return (d.tokens ?? d) as Login;
}

/** A seeded user that is signed in. */
async function userWithToken(extra: Record<string, unknown> = {}) {
  const s = await seed(extra);
  const { accessToken } = await login(s.email);
  return { ...s, token: accessToken };
}

const patch = (t: string, body: unknown) =>
  supertest(app)
    .patch('/me')
    .set(bearer(t))
    .send(body as object);
const getMe = (t: string) => supertest(app).get('/me').set(bearer(t));

beforeEach(async () => {
  await redis.flushall();
  captured.length = 0;
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
});
afterEach(() => jest.restoreAllMocks());

// ═══════════════════════════════════════════════════════════════════════════════════════════
// PATCH /me
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('T-507 AC1 PATCH /me saves each field', () => {
  it.each([
    ['name', 'Asha Verma'],
    ['phone', '+919876543210'],
    ['enrollmentNumber', 'D/1234/2015'],
    ['barCouncil', 'Bar Council of Delhi'],
    ['barCouncilState', '07'],
    ['practiceAreas', ['Criminal', 'Tax']],
    ['yearsOfExperience', 12],
    ['courtsPractisedIn', ['delhi_high_court', 'supreme_court']],
  ])('%s alone: 200, echoes exactly the key sent, GET /me reads it back', async (key, value) => {
    const { token } = await userWithToken();
    const res = await patch(token, { [key]: value });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'success', data: { [key]: value } });
    expect(res.headers['cache-control']).toBe('no-store');
    expect((await getMe(token)).body.data[key]).toEqual(value);
  });

  it('defaultCourt, with courtsPractisedIn in the same request', async () => {
    const { token } = await userWithToken();
    const body = {
      courtsPractisedIn: ['delhi_high_court', 'supreme_court'],
      defaultCourt: 'supreme_court',
    };
    const res = await patch(token, body);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(body);
    const me = (await getMe(token)).body.data;
    expect(me.defaultCourt).toBe('supreme_court');
    expect(me.courtsPractisedIn).toEqual(['delhi_high_court', 'supreme_court']);
  });

  it('all fields at once', async () => {
    const { token, email } = await userWithToken();
    const body = {
      gstStateCode: '29',
      name: 'Meera Rao',
      phone: '+911234567890',
      enrollmentNumber: 'K/55/2010',
      barCouncil: 'Karnataka State Bar Council',
      barCouncilState: '29',
      practiceAreas: ['Civil', 'Consumer'],
      yearsOfExperience: 3,
      courtsPractisedIn: ['karnataka_high_court'],
      defaultCourt: 'karnataka_high_court',
    };
    const res = await patch(token, body);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(body);
    const u = await raw(email);
    expect(u).toMatchObject({
      gstStateCode: '29',
      name: 'Meera Rao',
      phone: '+911234567890',
      enrollmentNumber: 'K/55/2010',
      yearsOfExperience: 3,
      defaultCourt: 'karnataka_high_court',
    });
  });

  it('maps barCouncil to barCouncilId and barCouncilState to state in the stored record', async () => {
    const { token, email } = await userWithToken();
    const res = await patch(token, { barCouncil: 'Bar Council of Delhi', barCouncilState: '07' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ barCouncil: 'Bar Council of Delhi', barCouncilState: '07' });
    const u = await raw(email);
    expect(u?.barCouncilId).toBe('Bar Council of Delhi');
    expect(u?.state).toBe('07');
    expect(u).not.toHaveProperty('barCouncil');
    expect(u).not.toHaveProperty('barCouncilState');
  });

  it('{ gstStateCode } alone is unchanged: { data: { gstStateCode } } and nothing else touched', async () => {
    const { token, email } = await userWithToken({ phone: '+919999999999' });
    const res = await patch(token, { gstStateCode: '07' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'success', data: { gstStateCode: '07' } });
    const u = await raw(email);
    expect(u?.gstStateCode).toBe('07');
    expect(u?.name).toBe('T507 Person');
    expect(u?.phone).toBe('+919999999999');
  });

  it('trims free text', async () => {
    const { token } = await userWithToken();
    const res = await patch(token, {
      name: '  Asha Verma  ',
      enrollmentNumber: ' D/1/2000 ',
      barCouncil: ' BCD ',
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      name: 'Asha Verma',
      enrollmentNumber: 'D/1/2000',
      barCouncil: 'BCD',
    });
  });
});

describe('T-507 AC2 PATCH /me validation, per field', () => {
  const long = (len: number) => 'a'.repeat(len);
  it.each([
    ['name: empty', { name: '' }],
    ['name: blank', { name: '   ' }],
    ['name: 101 chars', { name: long(101) }],
    ['name: number', { name: 5 }],
    ['name: HTML', { name: 'Asha <b>Verma</b>' }],
    ['name: null (cannot be cleared)', { name: null }],
    ['phone: no +91', { phone: '9876543210' }],
    ['phone: too short', { phone: '+91987654321' }],
    ['phone: too long', { phone: '+9198765432101' }],
    ['phone: letters', { phone: '+91abcdefghij' }],
    ['phone: number', { phone: 919876543210 }],
    ['phone: empty', { phone: '' }],
    ['enrollmentNumber: empty', { enrollmentNumber: '' }],
    ['enrollmentNumber: 51 chars', { enrollmentNumber: long(51) }],
    ['enrollmentNumber: HTML', { enrollmentNumber: '<script>x</script>' }],
    ['enrollmentNumber: number', { enrollmentNumber: 123 }],
    ['barCouncil: empty', { barCouncil: '' }],
    ['barCouncil: 101 chars', { barCouncil: long(101) }],
    ['barCouncil: HTML', { barCouncil: 'Bar > Council' }],
    ['barCouncil: array', { barCouncil: ['x'] }],
    ['barCouncilState: unknown code', { barCouncilState: '99' }],
    ['barCouncilState: a name', { barCouncilState: 'Delhi' }],
    ['barCouncilState: unpadded', { barCouncilState: '7' }],
    ['barCouncilState: number', { barCouncilState: 7 }],
    ['practiceAreas: not a list', { practiceAreas: 'Criminal' }],
    ['practiceAreas: unknown value', { practiceAreas: ['Criminal', 'Astrology'] }],
    ['practiceAreas: wrong case', { practiceAreas: ['criminal'] }],
    ['practiceAreas: non-string entry', { practiceAreas: [1] }],
    ['practiceAreas: null', { practiceAreas: null }],
    ['yearsOfExperience: negative', { yearsOfExperience: -1 }],
    ['yearsOfExperience: 71', { yearsOfExperience: 71 }],
    ['yearsOfExperience: fraction', { yearsOfExperience: 1.5 }],
    ['yearsOfExperience: string', { yearsOfExperience: '5' }],
    ['courtsPractisedIn: not a list', { courtsPractisedIn: 'delhi_high_court' }],
    ['courtsPractisedIn: upper case id', { courtsPractisedIn: ['Delhi_High_Court'] }],
    ['courtsPractisedIn: hyphen id', { courtsPractisedIn: ['delhi-high-court'] }],
    ['courtsPractisedIn: 1-char id', { courtsPractisedIn: ['x'] }],
    ['courtsPractisedIn: 81-char id', { courtsPractisedIn: [long(81)] }],
    ['courtsPractisedIn: non-string id', { courtsPractisedIn: [12] }],
    ['courtsPractisedIn: null', { courtsPractisedIn: null }],
    ['defaultCourt: bad id', { courtsPractisedIn: ['ab'], defaultCourt: 'A B' }],
    ['defaultCourt: number', { defaultCourt: 5 }],
    ['gstStateCode: null (cannot be cleared)', { gstStateCode: null }],
    ['email (never editable)', { email: 'attacker@example.com' }],
    ['email with a valid field', { name: 'Ok Name', email: 'attacker@example.com' }],
    ['unknown key', { nickname: 'x' }],
    ['role', { name: 'Ok Name', role: 'admin' }],
    ['barCouncilId (stored name, not an API name)', { barCouncilId: 'x' }],
    ['state (stored name, not an API name)', { state: '07' }],
    ['empty body', {}],
  ])('422 for %s and stores nothing', async (_label, body) => {
    const { token, email } = await userWithToken({ phone: '+919999999999', gstStateCode: '29' });
    const before = await raw(email);
    const res = await patch(token, body);
    expect(res.status).toBe(422);
    expect(await raw(email)).toEqual(before);
  });

  it('422 for a body that is not an object', async () => {
    const { token } = await userWithToken();
    expect((await patch(token, [])).status).toBe(422);
    expect((await patch(token, 'name')).status).toBe(422);
  });

  it('email is not changed and the error does not echo the value', async () => {
    const { token, email } = await userWithToken();
    const res = await patch(token, { email: 'zzattacker@example.com' });
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).not.toContain('zzattacker');
    expect(await raw('zzattacker@example.com')).toBeNull();
    expect(await raw(email)).not.toBeNull();
  });

  it('error messages never include the submitted value', async () => {
    const { token } = await userWithToken();
    const bodies = [
      { name: 'ZZPROBENAME<' },
      { phone: 'ZZPROBEPHONE' },
      { enrollmentNumber: 'ZZPROBE<ENR>' },
      { barCouncil: 'ZZPROBEBAR>' },
      { barCouncilState: 'ZZPROBESTATE' },
      { practiceAreas: ['ZZPROBEAREA'] },
      { courtsPractisedIn: ['ZZPROBECOURT'] },
    ];
    for (const b of bodies) {
      const res = await patch(token, b);
      expect(res.status).toBe(422);
      expect(JSON.stringify(res.body)).not.toContain('ZZPROBE');
    }
  });

  it('accepts the boundaries: 100-char name, 50-char enrollment, 100-char bar council, 0 and 70 years', async () => {
    const { token } = await userWithToken();
    const body = {
      name: long(100),
      enrollmentNumber: long(50),
      barCouncil: long(100),
      yearsOfExperience: 70,
    };
    expect((await patch(token, body)).status).toBe(200);
    expect((await patch(token, { yearsOfExperience: 0 })).body.data).toEqual({
      yearsOfExperience: 0,
    });
  });

  it('accepts every allowed practice area, and 10 of them; refuses 11 entries', async () => {
    const { token } = await userWithToken();
    const all = [
      'Criminal',
      'Civil',
      'Family and matrimonial',
      'Property and land',
      'Cheque bounce (NI Act)',
      'Writs and constitutional',
      'Consumer',
      'Labour and service',
      'Corporate and commercial',
      'Tax',
      'Other',
    ];
    for (const a of all) expect((await patch(token, { practiceAreas: [a] })).status).toBe(200);
    expect((await patch(token, { practiceAreas: all.slice(0, 10) })).status).toBe(200);
    // 11 distinct allowed values: over the limit of 10
    expect((await patch(token, { practiceAreas: all })).status).toBe(422);
  });

  it('refuses more than 10 practiceAreas entries even when they repeat', async () => {
    const { token } = await userWithToken();
    expect((await patch(token, { practiceAreas: Array(11).fill('Tax') })).status).toBe(422);
  });

  it('de-duplicates practiceAreas and courtsPractisedIn, keeping first-seen order', async () => {
    const { token, email } = await userWithToken();
    const res = await patch(token, {
      practiceAreas: ['Tax', 'Civil', 'Tax'],
      courtsPractisedIn: ['bb', 'aa', 'bb', 'aa'],
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      practiceAreas: ['Tax', 'Civil'],
      courtsPractisedIn: ['bb', 'aa'],
    });
    expect((await raw(email))?.courtsPractisedIn).toEqual(['bb', 'aa']);
  });

  it('courtsPractisedIn: 20 ids are allowed, 21 are not', async () => {
    const { token } = await userWithToken();
    const ids = (k: number) => Array.from({ length: k }, (_, i) => `court_${i}`);
    expect((await patch(token, { courtsPractisedIn: ids(20) })).status).toBe(200);
    expect((await patch(token, { courtsPractisedIn: ids(21) })).status).toBe(422);
    expect(
      (await patch(token, { courtsPractisedIn: ['ab', long(80).replace(/a/g, '9')] })).status,
    ).toBe(200);
  });

  it('a court id may use digits and underscores', async () => {
    const { token } = await userWithToken();
    expect((await patch(token, { courtsPractisedIn: ['dc_9', '_1', '99'] })).status).toBe(200);
  });
});

describe('T-507 AC2 PATCH /me: null clears an optional field', () => {
  it.each([
    ['phone', 'phone', '+919999999999'],
    ['enrollmentNumber', 'enrollmentNumber', 'D/1/2000'],
    ['barCouncil', 'barCouncilId', 'BCD'],
    ['barCouncilState', 'state', '07'],
    ['yearsOfExperience', 'yearsOfExperience', 9],
  ])('%s: null removes %s', async (apiKey, storedKey, value) => {
    const { token, email } = await userWithToken({ [storedKey]: value });
    expect((await raw(email))?.[storedKey]).toBe(value);
    const res = await patch(token, { [apiKey]: null });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ [apiKey]: null });
    expect(await raw(email)).not.toHaveProperty(storedKey);
    expect((await getMe(token)).body.data[apiKey]).toBeNull();
  });

  it('defaultCourt: null removes it', async () => {
    const { token, email } = await userWithToken({
      courtsPractisedIn: ['aa', 'bb'],
      defaultCourt: 'aa',
    });
    const res = await patch(token, { defaultCourt: null });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ defaultCourt: null });
    expect(await raw(email)).not.toHaveProperty('defaultCourt');
    expect((await getMe(token)).body.data.defaultCourt).toBeNull();
  });

  it('[] clears the lists', async () => {
    const { token, email } = await userWithToken({
      practiceAreas: ['Tax'],
      courtsPractisedIn: ['aa'],
    });
    const res = await patch(token, { practiceAreas: [], courtsPractisedIn: [] });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ practiceAreas: [], courtsPractisedIn: [] });
    const u = await raw(email);
    expect(u?.practiceAreas).toEqual([]);
    expect(u?.courtsPractisedIn).toEqual([]);
  });

  it('name and gstStateCode keep their value when a clear is refused', async () => {
    const { token, email } = await userWithToken({ gstStateCode: '29' });
    expect((await patch(token, { name: null })).status).toBe(422);
    expect((await patch(token, { gstStateCode: null })).status).toBe(422);
    const u = await raw(email);
    expect(u?.name).toBe('T507 Person');
    expect(u?.gstStateCode).toBe('29');
  });
});

describe('T-507 PATCH /me: defaultCourt must be one of courtsPractisedIn', () => {
  it('sent together and inside the list: 200', async () => {
    const { token } = await userWithToken();
    expect(
      (await patch(token, { courtsPractisedIn: ['aa', 'bb'], defaultCourt: 'bb' })).status,
    ).toBe(200);
  });

  it('sent together and outside the list: 422, nothing written (other fields included)', async () => {
    const { token, email } = await userWithToken({ courtsPractisedIn: ['old_court'] });
    const before = await raw(email);
    const res = await patch(token, {
      name: 'Changed Name',
      courtsPractisedIn: ['aa'],
      defaultCourt: 'zz',
    });
    expect(res.status).toBe(422);
    expect(await raw(email)).toEqual(before);
  });

  it('sent alone and in the stored list: 200', async () => {
    const { token, email } = await userWithToken({ courtsPractisedIn: ['aa', 'bb'] });
    const res = await patch(token, { defaultCourt: 'bb' });
    expect(res.status).toBe(200);
    expect((await raw(email))?.defaultCourt).toBe('bb');
  });

  it('sent alone and NOT in the stored list: 422, nothing written (atomic)', async () => {
    const { token, email } = await userWithToken({
      courtsPractisedIn: ['aa', 'bb'],
      defaultCourt: 'aa',
    });
    const before = await raw(email);
    const res = await patch(token, { name: 'Changed Name', defaultCourt: 'zz' });
    expect(res.status).toBe(422);
    expect(await raw(email)).toEqual(before);
  });

  it('sent alone with no stored list at all: 422', async () => {
    const { token, email } = await userWithToken();
    const res = await patch(token, { defaultCourt: 'aa' });
    expect(res.status).toBe(422);
    expect(await raw(email)).not.toHaveProperty('defaultCourt');
  });

  it('a new list sent alone that still holds the stored default: 200', async () => {
    const { token, email } = await userWithToken({ courtsPractisedIn: ['aa'], defaultCourt: 'aa' });
    const res = await patch(token, { courtsPractisedIn: ['aa', 'cc'] });
    expect(res.status).toBe(200);
    expect((await raw(email))?.defaultCourt).toBe('aa');
  });

  it('a new list sent alone that drops the stored default: 422, nothing written', async () => {
    const { token, email } = await userWithToken({
      courtsPractisedIn: ['aa', 'bb'],
      defaultCourt: 'aa',
    });
    const before = await raw(email);
    const res = await patch(token, { name: 'Changed Name', courtsPractisedIn: ['bb', 'cc'] });
    expect(res.status).toBe(422);
    expect(await raw(email)).toEqual(before);
  });

  it('[] sent alone with a stored default: 422; with defaultCourt: null: 200', async () => {
    const { token, email } = await userWithToken({ courtsPractisedIn: ['aa'], defaultCourt: 'aa' });
    expect((await patch(token, { courtsPractisedIn: [] })).status).toBe(422);
    const res = await patch(token, { courtsPractisedIn: [], defaultCourt: null });
    expect(res.status).toBe(200);
    const u = await raw(email);
    expect(u?.courtsPractisedIn).toEqual([]);
    expect(u).not.toHaveProperty('defaultCourt');
  });

  it('a new list sent alone is fine when there is no stored default', async () => {
    const { token } = await userWithToken({ courtsPractisedIn: ['aa'] });
    expect((await patch(token, { courtsPractisedIn: ['zz'] })).status).toBe(200);
  });

  it('the way out: send a new defaultCourt with the new list', async () => {
    const { token, email } = await userWithToken({ courtsPractisedIn: ['aa'], defaultCourt: 'aa' });
    const res = await patch(token, { courtsPractisedIn: ['bb'], defaultCourt: 'bb' });
    expect(res.status).toBe(200);
    expect((await raw(email))?.defaultCourt).toBe('bb');
  });
});

describe('T-507 AC3 PATCH /me privacy gate', () => {
  const ALL_FIELDS = {
    gstStateCode: '07',
    name: 'Gate Breaker',
    phone: '+919876543210',
    enrollmentNumber: 'G/1/2000',
    barCouncil: 'Gate Council',
    barCouncilState: '07',
    practiceAreas: ['Tax'],
    yearsOfExperience: 4,
    courtsPractisedIn: ['aa'],
    defaultCourt: 'aa',
  };

  it.each([
    ['an older version', { privacyVersion: OLD_VERSION }],
    ['no version', { privacyVersion: undefined }],
  ])('403 privacy_reaccept_required, same body, nothing written, for %s', async (_n, extra) => {
    const { token, email } = await userWithToken(extra);
    const before = await raw(email);
    const res = await patch(token, ALL_FIELDS);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'privacy_reaccept_required' });
    expect(await raw(email)).toEqual(before);
  });

  it('the 403 body is the same for a GST-only patch (T-436 shape unchanged)', async () => {
    const { token } = await userWithToken({ privacyVersion: OLD_VERSION });
    const a = await patch(token, { gstStateCode: '07' });
    const b = await patch(token, { name: 'Someone' });
    expect(a.status).toBe(403);
    expect(b.status).toBe(403);
    expect(a.body).toEqual(b.body);
    expect(a.body).toEqual({ error: 'privacy_reaccept_required' });
  });

  it('403 for a defaultCourt that would also miss the stored list: the privacy reason wins', async () => {
    const { token } = await userWithToken({ privacyVersion: OLD_VERSION });
    const res = await patch(token, { defaultCourt: 'zz' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'privacy_reaccept_required' });
  });

  it('reads the stored record, not the token: version rolled back after login', async () => {
    const { token, email } = await userWithToken();
    await User.updateOne({ email }, { privacyVersion: OLD_VERSION });
    const res = await patch(token, { name: 'Late Change' });
    expect(res.status).toBe(403);
    expect((await raw(email))?.name).toBe('T507 Person');
  });

  it('an invalid body is still 422 under an old version (validation first, nothing written)', async () => {
    const { token } = await userWithToken({ privacyVersion: OLD_VERSION });
    expect((await patch(token, { email: 'x@example.com' })).status).toBe(422);
  });

  it('saves after the user accepts the current version', async () => {
    const { token, email } = await userWithToken({ privacyVersion: OLD_VERSION });
    expect((await patch(token, { name: 'After Accept' })).status).toBe(403);
    const acc = await supertest(app).post('/me/privacy-acceptance').set(bearer(token));
    expect(acc.status).toBe(200);
    const t2 = (acc.body.data.tokens ?? acc.body.data).accessToken as string;
    expect((await patch(t2, { name: 'After Accept' })).status).toBe(200);
    expect((await raw(email))?.name).toBe('After Accept');
  });

  it('401 without a token; 401 and nothing written for an inactive or closing user', async () => {
    expect((await supertest(app).patch('/me').send({ name: 'No Token' })).status).toBe(401);
    const a = await userWithToken();
    await User.updateOne({ email: a.email }, { isActive: false });
    expect((await patch(a.token, { name: 'Inactive' })).status).toBe(401);
    expect((await raw(a.email))?.name).toBe('T507 Person');
    const b = await userWithToken();
    await User.updateOne(
      { email: b.email },
      { erasure: { requestedAt: new Date(), stage: 'locked' } },
    );
    expect((await patch(b.token, { name: 'Erasing' })).status).toBe(401);
    expect((await raw(b.email))?.name).toBe('T507 Person');
  });

  it('writes only to the caller, never another user', async () => {
    const a = await userWithToken();
    const b = await seed();
    await patch(a.token, { name: 'Only Me', courtsPractisedIn: ['aa'] });
    expect((await raw(b.email))?.name).toBe('T507 Person');
  });
});

describe('T-507 AC1 GET /me new keys', () => {
  it('reports null / [] for a user who never gave them, and keeps the old keys', async () => {
    const { token } = await userWithToken();
    const res = await getMe(token);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      privacyVersion: CURRENT_PRIVACY_VERSION,
      currentPrivacyVersion: CURRENT_PRIVACY_VERSION,
      needsPrivacyAcceptance: false,
      emailVerified: false,
      hasGoogle: false,
      hasPassword: true,
      gstStateCode: null,
      name: 'T507 Person',
      phone: null,
      enrollmentNumber: null,
      barCouncil: null,
      barCouncilState: null,
      practiceAreas: [],
      yearsOfExperience: null,
      courtsPractisedIn: [],
      defaultCourt: null,
    });
  });

  it('reports stored values under the API names, never the stored names', async () => {
    const { token } = await userWithToken({
      phone: '+919876543210',
      enrollmentNumber: 'E/1/2001',
      barCouncilId: 'Some Council',
      state: '33',
      practiceAreas: ['Tax'],
      yearsOfExperience: 8,
      courtsPractisedIn: ['aa', 'bb'],
      defaultCourt: 'bb',
    });
    const d = (await getMe(token)).body.data;
    expect(d).toMatchObject({
      phone: '+919876543210',
      enrollmentNumber: 'E/1/2001',
      barCouncil: 'Some Council',
      barCouncilState: '33',
      practiceAreas: ['Tax'],
      yearsOfExperience: 8,
      courtsPractisedIn: ['aa', 'bb'],
      defaultCourt: 'bb',
    });
    expect(d).not.toHaveProperty('barCouncilId');
    expect(d).not.toHaveProperty('state');
    expect(d).not.toHaveProperty('email');
  });

  it('yearsOfExperience 0 is reported as 0, not null', async () => {
    const { token } = await userWithToken({ yearsOfExperience: 0 });
    expect((await getMe(token)).body.data.yearsOfExperience).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// POST /me/password
// ═══════════════════════════════════════════════════════════════════════════════════════════
const changePw = (t: string, body: unknown) =>
  supertest(app)
    .post('/me/password')
    .set(bearer(t))
    .send(body as object);
const limiterKey = (userId: string) => pwchangeUserKey(userId);

describe('T-507 AC4 POST /me/password', () => {
  it('success: new hash works, old does not, other sessions gone, current kept, count returned', async () => {
    const s = await seed({
      passwordResetToken: 'a'.repeat(64),
      passwordResetExpires: new Date(Date.now() + 600000),
    });
    const cur = await login(s.email, PASSWORD, 'Current-UA');
    const other1 = await login(s.email, PASSWORD, 'Other-UA-1');
    const other2 = await login(s.email, PASSWORD, 'Other-UA-2');
    const res = await changePw(cur.accessToken, {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'success', data: { revokedSessions: 2 } });
    expect(res.headers['cache-control']).toBe('no-store');

    const u = await mongoose.connection.db!.collection('users').findOne({ email: s.email });
    expect(await bcrypt.compare(NEW_PASSWORD, u!.password)).toBe(true);
    expect(await bcrypt.compare(PASSWORD, u!.password)).toBe(false);
    expect(u).not.toHaveProperty('passwordResetToken');
    expect(u).not.toHaveProperty('passwordResetExpires');

    expect((await getMe(cur.accessToken)).status).toBe(200);
    expect((await getMe(other1.accessToken)).status).toBe(401);
    expect((await getMe(other2.accessToken)).status).toBe(401);
    for (const o of [other1, other2]) {
      const r = await supertest(app).post('/refresh').send({ refreshToken: o.refreshToken });
      expect(r.status).toBe(401);
    }
    // the current session's refresh token still works
    expect(
      (await supertest(app).post('/refresh').send({ refreshToken: cur.refreshToken })).status,
    ).toBe(200);
    expect(await Session.countDocuments({ userId: s.userId })).toBe(1);

    const bad = await supertest(app).post('/login').send({ email: s.email, password: PASSWORD });
    expect(bad.status).toBe(401);
    await login(s.email, NEW_PASSWORD);
  });

  it('only this user is affected: another user keeps every session', async () => {
    const a = await seed();
    const b = await seed();
    const at = await login(a.email);
    const bt = await login(b.email);
    await login(a.email);
    const res = await changePw(at.accessToken, {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    expect(res.body.data.revokedSessions).toBe(1);
    expect((await getMe(bt.accessToken)).status).toBe(200);
  });

  it('with no other session: 200 and revokedSessions 0', async () => {
    const { token } = await userWithToken();
    const res = await changePw(token, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ revokedSessions: 0 });
  });

  it('counts a session that is idle (access key expired, refresh key live) as revoked', async () => {
    const s = await seed();
    const cur = await login(s.email);
    const idle = await login(s.email, PASSWORD, 'Idle-UA');
    const row = await Session.findOne({ userId: s.userId, userAgent: 'Idle-UA' }).lean();
    await redis.del(sessionKey(s.userId, row!.jwtTokenHash));
    expect(await redis.exists(refreshSessionKey(s.userId, row!.refreshTokenHash))).toBe(1);
    const res = await changePw(cur.accessToken, {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    expect(res.body.data.revokedSessions).toBe(1);
    expect(await redis.exists(refreshSessionKey(s.userId, row!.refreshTokenHash))).toBe(0);
    expect(
      (await supertest(app).post('/refresh').send({ refreshToken: idle.refreshToken })).status,
    ).toBe(401);
  });

  it.each([
    ['too short', 'Ab1'],
    ['no digit', 'Passwordonly'],
    ['no letter', '1234567890'],
    ['not a string', 12345678],
    ['missing', undefined],
  ])(
    '422 weak_password for a newPassword that is %s; nothing changes, not counted',
    async (_n, pw) => {
      const { token, email, userId } = await userWithToken();
      const before = (await raw(email))!.password;
      const res = await changePw(token, { currentPassword: PASSWORD, newPassword: pw });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe('weak_password');
      expect(Array.isArray(res.body.unmet)).toBe(true);
      expect(res.body.unmet.length).toBeGreaterThan(0);
      expect((await raw(email))!.password).toBe(before);
      expect(await redis.exists(limiterKey(userId))).toBe(0);
    },
  );

  it('a weak newPassword gets 422 before the limiter: even over the limit', async () => {
    const { token, userId } = await userWithToken();
    await redis.set(limiterKey(userId), '5', 'EX', 600);
    const res = await changePw(token, { currentPassword: PASSWORD, newPassword: 'weak' });
    expect(res.status).toBe(422);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['not a string', 12345],
  ])('422 when currentPassword is %s', async (_n, cp) => {
    const { token, email } = await userWithToken();
    const before = (await raw(email))!.password;
    const res = await changePw(token, { currentPassword: cp, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(422);
    expect((await raw(email))!.password).toBe(before);
  });

  it('422 for an empty body', async () => {
    const { token } = await userWithToken();
    expect((await changePw(token, {})).status).toBe(422);
  });

  it('403 wrong_password: nothing changes, sessions kept', async () => {
    const s = await seed();
    const cur = await login(s.email);
    const other = await login(s.email);
    const before = (await raw(s.email))!.password;
    const res = await changePw(cur.accessToken, {
      currentPassword: 'Wr0ngPassword',
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'wrong_password' });
    expect((await raw(s.email))!.password).toBe(before);
    expect((await getMe(other.accessToken)).status).toBe(200);
  });

  it('409 no_password for a Google-only account; not counted against the limiter', async () => {
    const g = await seed({ password: undefined, authProvider: 'google', googleId: 'g-t507-1' });
    const u = await User.findOne({ email: g.email }).lean();
    expect(u).not.toBeNull();
    const { accessToken } = await mintSession(g.userId, g.email);
    for (let i = 0; i < 7; i += 1) {
      const res = await changePw(accessToken, {
        currentPassword: 'Whatever1x',
        newPassword: NEW_PASSWORD,
      });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'no_password' });
    }
    expect(await redis.exists(limiterKey(g.userId))).toBe(0);
    expect(await raw(g.email)).not.toHaveProperty('password');
  });

  it('401 without a token; 401 for an inactive user', async () => {
    expect(
      (
        await supertest(app)
          .post('/me/password')
          .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
      ).status,
    ).toBe(401);
    const { token, email } = await userWithToken();
    await User.updateOne({ email }, { isActive: false });
    const res = await changePw(token, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(401);
  });

  it('email stays the same; the privacy gate does not apply to password change', async () => {
    const { token, email } = await userWithToken();
    await changePw(token, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(await raw(email)).not.toBeNull();
  });

  it('writes one audit log line {userId, event, revokedSessions} and no secrets', async () => {
    const s = await seed();
    const cur = await login(s.email);
    await login(s.email);
    captured.length = 0;
    await changePw(cur.accessToken, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    const lines = captured.map((l) => JSON.parse(l));
    const audit = lines.filter((l) => l.event === 'password_changed');
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      userId: s.userId,
      event: 'password_changed',
      revokedSessions: 1,
    });
    const text = captured.join('\n');
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain(NEW_PASSWORD);
    expect(text).not.toContain(s.email);
  });
});

/** A session for a user with no password (Google-only): login by password is impossible. */
async function mintSession(userId: string, email: string): Promise<Login> {
  const { generateTokenPair } = await import('../services/jwt.service');
  const { createSession } = await import('../services/session.service');
  const pair = generateTokenPair({
    sub: userId,
    email,
    name: 'T507 Person',
    role: 'user',
    plan: 'free',
    pv: CURRENT_PRIVACY_VERSION,
  } as never);
  await createSession(
    userId,
    pair.accessToken,
    pair.refreshToken,
    { plan: 'free', email, role: 'user', name: 'T507 Person' },
    { ip: '203.0.113.9', userAgent: 'Google-UA' },
  );
  return pair;
}

describe('T-507 AC4 POST /me/password: per-user limiter (5 failures per 15 min)', () => {
  it('5 wrong -> 403 each; the 6th is 429 with Retry-After, even with the right password', async () => {
    const s = await seed();
    const cur = await login(s.email);
    const other = await login(s.email);
    for (let i = 0; i < 5; i += 1) {
      const r = await changePw(cur.accessToken, {
        currentPassword: 'Wr0ngPassword',
        newPassword: NEW_PASSWORD,
      });
      expect(r.status).toBe(403);
    }
    const before = (await raw(s.email))!.password;
    const res = await changePw(cur.accessToken, {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
    const retry = Number(res.headers['retry-after']);
    expect(retry).toBeGreaterThan(0);
    expect(retry).toBeLessThanOrEqual(900);
    expect(res.body).toEqual({ error: 'rate_limited', retryAfter: retry });
    expect((await raw(s.email))!.password).toBe(before);
    expect((await getMe(other.accessToken)).status).toBe(200);
    // refused attempts do not extend the count
    expect(Number(await redis.get(limiterKey(s.userId)))).toBe(5);
    expect(await redis.pttl(limiterKey(s.userId))).toBeGreaterThan(0);
  });

  it('the limit is per user: another user can still change their password', async () => {
    const a = await userWithToken();
    const b = await userWithToken();
    for (let i = 0; i < 6; i += 1) {
      await changePw(a.token, { currentPassword: 'Wr0ngPassword', newPassword: NEW_PASSWORD });
    }
    expect(
      (await changePw(b.token, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD })).status,
    ).toBe(200);
  });

  it('a success resets the count', async () => {
    const { token, userId } = await userWithToken();
    for (let i = 0; i < 4; i += 1) {
      expect(
        (await changePw(token, { currentPassword: 'Wr0ngPassword', newPassword: NEW_PASSWORD }))
          .status,
      ).toBe(403);
    }
    expect(Number(await redis.get(limiterKey(userId)))).toBe(4);
    const ok = await changePw(token, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(ok.status).toBe(200);
    expect(await redis.exists(limiterKey(userId))).toBe(0);
    // five more wrong guesses are allowed again
    for (let i = 0; i < 5; i += 1) {
      expect(
        (await changePw(token, { currentPassword: 'Wr0ngPassword', newPassword: 'Another1pass' }))
          .status,
      ).toBe(403);
    }
    expect(
      (await changePw(token, { currentPassword: NEW_PASSWORD, newPassword: 'Another1pass' }))
        .status,
    ).toBe(429);
  });

  it('the key holds the user id only, with a TTL of at most 15 minutes', async () => {
    const { token, userId } = await userWithToken();
    await changePw(token, { currentPassword: 'Wr0ngPassword', newPassword: NEW_PASSWORD });
    const keys = await redis.keys('auth:pwchange:*');
    expect(keys).toEqual([`auth:pwchange:user:${userId}`]);
    const ttl = await redis.pttl(keys[0]!);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(15 * 60 * 1000);
  });

  it('parallel wrong guesses never exceed 5 compares', async () => {
    const { token, userId } = await userWithToken();
    const compare = jest.spyOn(bcrypt, 'compare');
    const results = await Promise.all(
      Array.from({ length: 9 }, () =>
        changePw(token, { currentPassword: 'Wr0ngPassword', newPassword: NEW_PASSWORD }),
      ),
    );
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 403)).toHaveLength(5);
    expect(statuses.filter((s) => s === 429)).toHaveLength(4);
    expect(compare.mock.calls.filter((c) => c[0] === 'Wr0ngPassword')).toHaveLength(5);
    expect(Number(await redis.get(limiterKey(userId)))).toBe(5);
  });

  it('Redis down: 503 service_unavailable, nothing looked up or changed', async () => {
    const s = await seed();
    const cur = await login(s.email);
    const other = await login(s.email);
    const before = (await raw(s.email))!.password;
    jest.spyOn(redis, 'incr').mockRejectedValue(new Error('ECONNREFUSED'));
    const find = jest.spyOn(User, 'findById');
    find.mockClear();
    const res = await changePw(cur.accessToken, {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'service_unavailable' });
    expect(find).not.toHaveBeenCalled();
    jest.restoreAllMocks();
    expect((await raw(s.email))!.password).toBe(before);
    expect(await Session.countDocuments({ userId: s.userId })).toBe(2);
    expect((await getMe(other.accessToken)).status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Sessions
// ═══════════════════════════════════════════════════════════════════════════════════════════
const listSessions = (t: string) => supertest(app).get('/me/sessions').set(bearer(t));
const delSession = (t: string, id: string) =>
  supertest(app).delete(`/me/sessions/${id}`).set(bearer(t));

describe('T-507 AC4 GET /me/sessions', () => {
  it('lists {id, userAgent, createdAt, current}, newest first, no IP and no hashes', async () => {
    const s = await seed();
    await login(s.email, PASSWORD, 'First-UA');
    await sleep(15);
    const second = await login(s.email, PASSWORD, 'Second-UA');
    await sleep(15);
    const third = await login(s.email, PASSWORD, 'Third-UA');
    const res = await listSessions(second.accessToken);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const sessions = res.body.data.sessions;
    expect(sessions.map((x: { userAgent: string }) => x.userAgent)).toEqual([
      'Third-UA',
      'Second-UA',
      'First-UA',
    ]);
    for (const x of sessions) {
      expect(Object.keys(x).sort()).toEqual(['createdAt', 'current', 'id', 'userAgent']);
      expect(typeof x.id).toBe('string');
      expect(Number.isNaN(Date.parse(x.createdAt))).toBe(false);
    }
    expect(sessions.map((x: { current: boolean }) => x.current)).toEqual([false, true, false]);
    expect(sessions.filter((x: { current: boolean }) => x.current)).toHaveLength(1);
    const text = JSON.stringify(res.body);
    const rows = await Session.find({ userId: s.userId }).lean();
    for (const r of rows) {
      expect(text).not.toContain(r.jwtTokenHash);
      expect(text).not.toContain(r.refreshTokenHash);
      if (r.ipAddress) expect(text).not.toContain(r.ipAddress);
    }
    expect(text).not.toMatch(/ip/i);
    expect(third.accessToken).toBeDefined();
  });

  it('userAgent is null when none was sent', async () => {
    const s = await seed();
    const res = await supertest(app)
      .post('/login')
      .set('User-Agent', '')
      .send({ email: s.email, password: PASSWORD });
    const t = (res.body.data.tokens ?? res.body.data).accessToken as string;
    const list = await listSessions(t);
    expect(list.body.data.sessions).toHaveLength(1);
    expect(list.body.data.sessions[0].userAgent).toBeNull();
    expect(list.body.data.sessions[0].current).toBe(true);
  });

  it("lists only the caller's sessions", async () => {
    const a = await seed();
    const b = await seed();
    const at = await login(a.email, PASSWORD, 'A-UA');
    await login(b.email, PASSWORD, 'B-UA');
    const res = await listSessions(at.accessToken);
    expect(res.body.data.sessions.map((x: { userAgent: string }) => x.userAgent)).toEqual(['A-UA']);
  });

  it('lists an idle session that has only a live refresh key', async () => {
    const s = await seed();
    const cur = await login(s.email, PASSWORD, 'Cur-UA');
    await login(s.email, PASSWORD, 'Idle-UA');
    const row = await Session.findOne({ userId: s.userId, userAgent: 'Idle-UA' }).lean();
    await redis.del(sessionKey(s.userId, row!.jwtTokenHash));
    const res = await listSessions(cur.accessToken);
    const uas = res.body.data.sessions.map((x: { userAgent: string }) => x.userAgent).sort();
    expect(uas).toEqual(['Cur-UA', 'Idle-UA']);
  });

  it('does not list a session whose access and refresh keys are both gone', async () => {
    const s = await seed();
    const cur = await login(s.email, PASSWORD, 'Cur-UA');
    await login(s.email, PASSWORD, 'Dead-UA');
    const row = await Session.findOne({ userId: s.userId, userAgent: 'Dead-UA' }).lean();
    await redis.del(
      sessionKey(s.userId, row!.jwtTokenHash),
      refreshSessionKey(s.userId, row!.refreshTokenHash),
    );
    const res = await listSessions(cur.accessToken);
    expect(res.body.data.sessions.map((x: { userAgent: string }) => x.userAgent)).toEqual([
      'Cur-UA',
    ]);
  });

  it('new Session rows live for the refresh TTL (7 days), not the access TTL', async () => {
    const s = await seed();
    await login(s.email);
    const row = await Session.findOne({ userId: s.userId }).lean();
    const ms = row!.expiresAt.getTime() - Date.now();
    expect(ms).toBeGreaterThan(6.9 * 24 * 3600 * 1000);
    expect(ms).toBeLessThanOrEqual(7 * 24 * 3600 * 1000);
  });

  it('401 without a token or with a revoked one', async () => {
    expect((await supertest(app).get('/me/sessions')).status).toBe(401);
    const s = await seed();
    const t = await login(s.email);
    await supertest(app).post('/logout').set(bearer(t.accessToken)).send({});
    expect((await listSessions(t.accessToken)).status).toBe(401);
  });
});

describe('T-507 AC4 DELETE /me/sessions/:id', () => {
  it('own session: 200, access and refresh keys gone, refresh now 401, no longer listed', async () => {
    const s = await seed();
    const cur = await login(s.email, PASSWORD, 'Cur-UA');
    const other = await login(s.email, PASSWORD, 'Other-UA');
    const row = await Session.findOne({ userId: s.userId, userAgent: 'Other-UA' }).lean();
    const list = await listSessions(cur.accessToken);
    const id = list.body.data.sessions.find(
      (x: { userAgent: string }) => x.userAgent === 'Other-UA',
    ).id;
    expect(id).toBe(String(row!._id));
    const res = await delSession(cur.accessToken, id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'success' });
    expect(await redis.exists(sessionKey(s.userId, row!.jwtTokenHash))).toBe(0);
    expect(await redis.exists(refreshSessionKey(s.userId, row!.refreshTokenHash))).toBe(0);
    expect((await getMe(other.accessToken)).status).toBe(401);
    expect(
      (await supertest(app).post('/refresh').send({ refreshToken: other.refreshToken })).status,
    ).toBe(401);
    const after = await listSessions(cur.accessToken);
    expect(after.body.data.sessions.map((x: { userAgent: string }) => x.userAgent)).toEqual([
      'Cur-UA',
    ]);
    expect((await getMe(cur.accessToken)).status).toBe(200);
  });

  it('an idle session (refresh key only): 200 and the refresh key is revoked', async () => {
    const s = await seed();
    const cur = await login(s.email);
    const idle = await login(s.email, PASSWORD, 'Idle-UA');
    const row = await Session.findOne({ userId: s.userId, userAgent: 'Idle-UA' }).lean();
    await redis.del(sessionKey(s.userId, row!.jwtTokenHash));
    const res = await delSession(cur.accessToken, String(row!._id));
    expect(res.status).toBe(200);
    expect(await redis.exists(refreshSessionKey(s.userId, row!.refreshTokenHash))).toBe(0);
    expect(
      (await supertest(app).post('/refresh').send({ refreshToken: idle.refreshToken })).status,
    ).toBe(401);
  });

  it("the caller's own session may be signed out too", async () => {
    const s = await seed();
    const cur = await login(s.email);
    const row = await Session.findOne({ userId: s.userId }).lean();
    expect((await delSession(cur.accessToken, String(row!._id))).status).toBe(200);
    expect((await getMe(cur.accessToken)).status).toBe(401);
  });

  it("another user's session id: 404 not_found, and that session is untouched", async () => {
    const a = await seed();
    const b = await seed();
    const at = await login(a.email);
    const bt = await login(b.email);
    const brow = await Session.findOne({ userId: b.userId }).lean();
    const res = await delSession(at.accessToken, String(brow!._id));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
    expect((await getMe(bt.accessToken)).status).toBe(200);
    expect(await redis.exists(refreshSessionKey(b.userId, brow!.refreshTokenHash))).toBe(1);
  });

  it.each([
    ['not an id', 'not-an-id'],
    ['an unknown id', new mongoose.Types.ObjectId().toString()],
    ['a hash-like string', 'a'.repeat(64)],
  ])('404 not_found for %s', async (_n, id) => {
    const { token } = await userWithToken();
    const res = await delSession(token, id);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  it('401 without a token', async () => {
    const res = await supertest(app).delete(`/me/sessions/${new mongoose.Types.ObjectId()}`);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Privacy history
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('T-507 AC4 GET /me/privacy-history', () => {
  const hist = (t: string) => supertest(app).get('/me/privacy-history').set(bearer(t));

  it('returns {version, acceptedAt, via}, newest first, and nothing else', async () => {
    const { token } = await userWithToken({
      privacyHistory: [
        { version: '2026-10-11', acceptedAt: new Date('2026-10-11T08:00:00Z'), via: 'signup' },
        {
          version: CURRENT_PRIVACY_VERSION,
          acceptedAt: new Date('2026-10-16T08:00:00Z'),
          via: 'reaccept',
        },
        { version: OLD_VERSION, acceptedAt: new Date('2026-10-13T08:00:00Z'), via: 'reaccept' },
      ],
    });
    const res = await hist(token);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({
      status: 'success',
      data: {
        privacyHistory: [
          {
            version: CURRENT_PRIVACY_VERSION,
            acceptedAt: '2026-10-16T08:00:00.000Z',
            via: 'reaccept',
          },
          { version: OLD_VERSION, acceptedAt: '2026-10-13T08:00:00.000Z', via: 'reaccept' },
          { version: '2026-10-11', acceptedAt: '2026-10-11T08:00:00.000Z', via: 'signup' },
        ],
      },
    });
  });

  it('shows a row added by accepting the current version', async () => {
    const { token } = await userWithToken({ privacyVersion: OLD_VERSION });
    const acc = await supertest(app).post('/me/privacy-acceptance').set(bearer(token));
    const t2 = (acc.body.data.tokens ?? acc.body.data).accessToken as string;
    const res = await hist(t2);
    expect(res.status).toBe(200);
    const rows = res.body.data.privacyHistory;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].version).toBe(CURRENT_PRIVACY_VERSION);
    expect(rows[0].via).toBe('reaccept');
    expect(Object.keys(rows[0]).sort()).toEqual(['acceptedAt', 'version', 'via']);
  });

  it('is an empty list for a user with no history', async () => {
    const { token } = await userWithToken();
    const res = await hist(token);
    expect(res.status).toBe(200);
    expect(res.body.data.privacyHistory).toEqual([]);
  });

  it("only the caller's history", async () => {
    const a = await userWithToken({
      privacyHistory: [
        { version: '2026-10-11', acceptedAt: new Date('2026-10-11T08:00:00Z'), via: 'signup' },
      ],
    });
    const b = await userWithToken();
    expect((await hist(a.token)).body.data.privacyHistory).toHaveLength(1);
    expect((await hist(b.token)).body.data.privacyHistory).toHaveLength(0);
  });

  it('401 without a token, and for an inactive user', async () => {
    expect((await supertest(app).get('/me/privacy-history')).status).toBe(401);
    const { token, email } = await userWithToken();
    await User.updateOne({ email }, { isActive: false });
    expect((await hist(token)).status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Logs
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('T-507 AC5 no personal data in logs', () => {
  const NAME = 'Zebulon Quillfeather';
  const PHONE = '+919876501234';
  const ENROLL = 'ENR/9988/2015';
  const COUNCIL = 'Bar Council of Zanzibar';
  const UA = 'LogProbe-UA/7.7';
  const PW_OLD = ['LogProbe', 'Old9pass'].join('');
  const PW_NEW = ['LogProbe', 'New9pass'].join('');

  it('no profile value, password, userAgent or ip is logged by any new endpoint (success and error paths)', async () => {
    const s = await seed({ password: PW_OLD });
    const cur = await login(s.email, PW_OLD, UA);
    await login(s.email, PW_OLD, UA);
    captured.length = 0;

    const full = {
      name: NAME,
      phone: PHONE,
      enrollmentNumber: ENROLL,
      barCouncil: COUNCIL,
      barCouncilState: '07',
      practiceAreas: ['Tax'],
      yearsOfExperience: 11,
      courtsPractisedIn: ['logprobe_court'],
      defaultCourt: 'logprobe_court',
    };
    const t = cur.accessToken;
    const xff = { 'x-forwarded-for': '198.51.100.77' };
    await supertest(app).patch('/me').set(bearer(t)).set(xff).set('User-Agent', UA).send(full);
    // 422 paths, carrying the same values
    await patch(t, { ...full, email: 'zzleak@example.com' });
    await patch(t, { name: `${NAME}<`, phone: PHONE.slice(1), enrollmentNumber: `${ENROLL}>` });
    await patch(t, { defaultCourt: 'not_in_list_zz' });
    // 403 gate
    await User.updateOne({ email: s.email }, { privacyVersion: OLD_VERSION });
    await patch(t, full);
    await User.updateOne({ email: s.email }, { privacyVersion: CURRENT_PRIVACY_VERSION });

    await getMe(t);
    await listSessions(t);
    await supertest(app).get('/me/privacy-history').set(bearer(t));
    await delSession(t, new mongoose.Types.ObjectId().toString());
    await delSession(t, 'bad-id');
    // password: weak, missing, wrong, over the limit, then success
    await changePw(t, { currentPassword: PW_OLD, newPassword: 'weak' });
    await changePw(t, { newPassword: PW_NEW });
    for (let i = 0; i < 6; i += 1) {
      await changePw(t, { currentPassword: `${PW_OLD}x`, newPassword: PW_NEW });
    }
    await redis.del(limiterKey(s.userId));
    expect((await changePw(t, { currentPassword: PW_OLD, newPassword: PW_NEW })).status).toBe(200);
    // Redis down on the limiter
    jest.spyOn(redis, 'incr').mockRejectedValue(new Error(`ECONNREFUSED ${PW_OLD} ${NAME}`));
    await changePw(t, { currentPassword: PW_NEW, newPassword: PW_OLD });
    jest.restoreAllMocks();

    expect(captured.length).toBeGreaterThan(0);
    const text = captured.join('\n');
    for (const v of [
      NAME,
      'Quillfeather',
      PHONE,
      ENROLL,
      COUNCIL,
      'Zanzibar',
      'logprobe_court',
      PW_OLD,
      PW_NEW,
      'weak',
      UA,
      'LogProbe-UA',
      '198.51.100.77',
      'zzleak',
      s.email,
      'T507 Person',
    ]) {
      expect(text).not.toContain(v);
    }
    // and the audit line is there
    expect(captured.map((l) => JSON.parse(l)).some((l) => l.event === 'password_changed')).toBe(
      true,
    );
  });

  it('redacts the T-507 keys when a call site logs them, at the top and one level down', () => {
    logger.info({
      name: NAME,
      phone: PHONE,
      enrollmentNumber: ENROLL,
      barCouncil: COUNCIL,
      barCouncilId: COUNCIL,
      barCouncilState: '07',
      state: '07',
      currentPassword: PW_OLD,
      newPassword: PW_NEW,
      userAgent: UA,
      ipAddress: '198.51.100.9',
      user: { name: NAME, enrollmentNumber: ENROLL, userAgent: UA },
      body: { name: NAME, currentPassword: PW_OLD },
      req: { body: { name: NAME } },
    });
    const text = captured.join('\n');
    for (const v of [NAME, PHONE, ENROLL, COUNCIL, PW_OLD, PW_NEW, UA, '198.51.100.9']) {
      expect(text).not.toContain(v);
    }
  });

  it('err.name is still logged (the error class is not personal data)', () => {
    const err = new Error('boom');
    err.name = 'MongoServerError';
    logger.error({ err }, 'Request failed');
    const line = JSON.parse(captured[captured.length - 1]!);
    expect(line.err.name).toBe('MongoServerError');
    expect(line.err.message).toBe('boom');
  });
});

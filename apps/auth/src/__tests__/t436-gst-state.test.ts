/**
 * T-436 (b)/(c) slice 3 — the GST State of supply on the user: GET /me gstStateCode, PATCH /me,
 * the model validator, and the privacy summary for '2026-10-15'. Real app, in-memory Mongo,
 * ioredis-mock.
 *
 * Ajay (GST file Addendum 7 (2), must-fix): the State is stored only after the current privacy
 * version is accepted. A 403 stores NOTHING.
 */

import './setupEnv';

jest.mock('ioredis', () => require('ioredis-mock'));

import './setupDb';

import fs from 'fs';
import path from 'path';

import {
  CURRENT_PRIVACY_VERSION,
  GST_STATES,
  PRIVACY_VERSION_SUMMARIES,
  getPrivacyVersionSummary,
} from '@lawie/shared';
import mongoose from 'mongoose';
import supertest from 'supertest';

import app from '../app';
import redis from '../config/redis';
import { User } from '../models/User.model';

const PASSWORD = 'Passw0rdOk';
const OLD_VERSION = '2026-10-12b';
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

async function seed(email: string, extra: Record<string, unknown> = {}) {
  await User.create({
    email,
    name: 'T436 Person',
    password: PASSWORD,
    privacyVersion: CURRENT_PRIVACY_VERSION,
    ...extra,
  });
}

async function token(email: string): Promise<string> {
  const res = await supertest(app).post('/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  const data = res.body.data;
  return (data.tokens ?? data).accessToken as string;
}

const raw = (email: string) => mongoose.connection.db?.collection('users').findOne({ email });
const patch = (t: string, body: unknown) =>
  supertest(app)
    .patch('/me')
    .set(bearer(t))
    .send(body as object);

beforeEach(async () => {
  await redis.flushall();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
});
afterEach(() => jest.restoreAllMocks());

describe('T-436 privacy summary 2026-10-15 (Ajay, Addendum 4)', () => {
  it('is the current version and the summary is byte-exact against the signed file', () => {
    expect(CURRENT_PRIVACY_VERSION).toBe('2026-10-15');
    const legal = fs.readFileSync(
      path.join(__dirname, '../../../../handoff/legal/gst-tax-invoice-signed.md'),
      'utf8',
    );
    const line = legal
      .split('\n')
      .find((l) => l.startsWith('`We now ask for your State to issue GST tax invoices'));
    expect(line).toBeDefined();
    const signed = line!.slice(1, -1);
    expect(PRIVACY_VERSION_SUMMARIES['2026-10-15']).toBe(signed);
    expect(getPrivacyVersionSummary('2026-10-15')).toBe(
      'We now ask for your State to issue GST tax invoices, and we explain how you can close your account and how long we keep your data.',
    );
  });

  it('keeps the earlier signed summary', () => {
    expect(PRIVACY_VERSION_SUMMARIES['2026-10-12b']).toBe(
      'We now explain how Google Analytics works on our public pages, and that we keep the campaign link a new account came from.',
    );
  });
});

describe('T-436 GET /me gstStateCode', () => {
  it('is null when none was given', async () => {
    await seed('none@example.com');
    const res = await supertest(app)
      .get('/me')
      .set(bearer(await token('none@example.com')));
    expect(res.status).toBe(200);
    expect(res.body.data.gstStateCode).toBeNull();
  });

  it('returns the stored code as a string', async () => {
    await seed('has@example.com', { gstStateCode: '37' });
    const res = await supertest(app)
      .get('/me')
      .set(bearer(await token('has@example.com')));
    expect(res.body.data.gstStateCode).toBe('37');
  });
});

describe('T-436 PATCH /me', () => {
  it('saves a valid code, answers 200 with no-store, and GET /me reads it back', async () => {
    await seed('ok@example.com');
    const t = await token('ok@example.com');
    const res = await patch(t, { gstStateCode: '01' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'success', data: { gstStateCode: '01' } });
    expect(res.headers['cache-control']).toBe('no-store');
    expect((await raw('ok@example.com'))?.gstStateCode).toBe('01');
    const me = await supertest(app).get('/me').set(bearer(t));
    expect(me.body.data.gstStateCode).toBe('01');
  });

  it('accepts every one of the 36 codes and can change an earlier choice', async () => {
    await seed('all@example.com');
    const t = await token('all@example.com');
    expect(GST_STATES).toHaveLength(36);
    for (const s of GST_STATES) {
      const res = await patch(t, { gstStateCode: s.code });
      expect(res.status).toBe(200);
      expect((await raw('all@example.com'))?.gstStateCode).toBe(s.code);
    }
  });

  it.each([
    ['an unknown extra field', { gstStateCode: '07', name: 'Mallory' }],
    ['only another field', { name: 'Mallory' }],
    ['a role field', { gstStateCode: '07', role: 'admin' }],
    ['an empty body', {}],
    ['a bad code', { gstStateCode: '99' }],
    ['code 97 (Other Territory)', { gstStateCode: '97' }],
    ['the old Andhra Pradesh code 28', { gstStateCode: '28' }],
    ['the pre-merger Daman code 25', { gstStateCode: '25' }],
    ['an unpadded code', { gstStateCode: '1' }],
    ['a name instead of a code', { gstStateCode: 'Delhi' }],
    ['an empty string', { gstStateCode: '' }],
    ['a number instead of a string', { gstStateCode: 7 }],
    ['a number 37', { gstStateCode: 37 }],
    ['null', { gstStateCode: null }],
  ])('422 for %s and stores nothing', async (_n, body) => {
    await seed('bad@example.com', { gstStateCode: '29' });
    const t = await token('bad@example.com');
    const res = await patch(t, body);
    expect(res.status).toBe(422);
    const u = await raw('bad@example.com');
    expect(u?.gstStateCode).toBe('29');
    expect(u?.name).toBe('T436 Person');
    expect(u?.role).not.toBe('admin');
  });

  it('401 without a token', async () => {
    const res = await supertest(app).patch('/me').send({ gstStateCode: '07' });
    expect(res.status).toBe(401);
  });
});

describe('T-436 PATCH /me privacy gate (Ajay Addendum 7 (2), must-fix)', () => {
  it.each([
    ['an older version', { privacyVersion: OLD_VERSION }],
    ['no version at all', { privacyVersion: undefined }],
  ])('403 privacy_reaccept_required with NOTHING stored for %s', async (_n, extra) => {
    await seed('old@example.com', extra);
    const t = await token('old@example.com');
    const res = await patch(t, { gstStateCode: '07' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'privacy_reaccept_required' });
    const u = await raw('old@example.com');
    expect(u).not.toBeNull();
    expect(u).not.toHaveProperty('gstStateCode');
  });

  it('does not overwrite an existing State while the version is old', async () => {
    await seed('old2@example.com', { privacyVersion: OLD_VERSION, gstStateCode: '29' });
    const t = await token('old2@example.com');
    const res = await patch(t, { gstStateCode: '07' });
    expect(res.status).toBe(403);
    expect((await raw('old2@example.com'))?.gstStateCode).toBe('29');
  });

  it('the gate reads the stored record, not the token: version rolled back after login', async () => {
    await seed('stale@example.com');
    const t = await token('stale@example.com');
    await User.updateOne({ email: 'stale@example.com' }, { privacyVersion: OLD_VERSION });
    const res = await patch(t, { gstStateCode: '07' });
    expect(res.status).toBe(403);
    expect(await raw('stale@example.com')).not.toHaveProperty('gstStateCode');
  });

  it('saves after the user accepts the current version', async () => {
    await seed('acc@example.com', { privacyVersion: OLD_VERSION });
    const t = await token('acc@example.com');
    expect((await patch(t, { gstStateCode: '07' })).status).toBe(403);
    const acc = await supertest(app).post('/me/privacy-acceptance').set(bearer(t));
    expect(acc.status).toBe(200);
    const d = acc.body.data;
    const t2 = (d.tokens ?? d).accessToken as string;
    const res = await patch(t2, { gstStateCode: '07' });
    expect(res.status).toBe(200);
    expect((await raw('acc@example.com'))?.gstStateCode).toBe('07');
  });
});

describe('T-436 PATCH /me refused for inactive or erasing users', () => {
  it('401 and nothing stored for an inactive user', async () => {
    await seed('inactive@example.com');
    const t = await token('inactive@example.com');
    await User.updateOne({ email: 'inactive@example.com' }, { isActive: false });
    const res = await patch(t, { gstStateCode: '07' });
    expect(res.status).toBe(401);
    expect(await raw('inactive@example.com')).not.toHaveProperty('gstStateCode');
  });

  it('401 and nothing stored for a user whose account is being closed', async () => {
    await seed('erasing@example.com');
    const t = await token('erasing@example.com');
    await User.updateOne(
      { email: 'erasing@example.com' },
      { erasure: { requestedAt: new Date(), stage: 'locked' } },
    );
    const res = await patch(t, { gstStateCode: '07' });
    expect(res.status).toBe(401);
    expect(await raw('erasing@example.com')).not.toHaveProperty('gstStateCode');
  });
});

describe('T-436 User model validator', () => {
  it.each(['28', '99', '1', 'Delhi', ''])('rejects %p', async (bad) => {
    const u = new User({ email: `m${bad}@example.com`, name: 'M', password: PASSWORD });
    u.gstStateCode = bad;
    await expect(u.validate()).rejects.toThrow(/Invalid GST State code/);
  });

  it('accepts a valid code and an absent one', async () => {
    const a = new User({ email: 'ma@example.com', name: 'M', password: PASSWORD });
    await expect(a.validate()).resolves.toBeUndefined();
    a.gstStateCode = '38';
    await expect(a.validate()).resolves.toBeUndefined();
  });

  it('updateOne with runValidators rejects a bad code', async () => {
    await seed('rv@example.com');
    await expect(
      User.updateOne(
        { email: 'rv@example.com' },
        { $set: { gstStateCode: '28' } },
        { runValidators: true },
      ),
    ).rejects.toThrow();
  });
});

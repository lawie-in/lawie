/**
 * T-652: POST /credits/rate/:docId is gone (404, grants nothing); the admin ledger keeps reading
 * the historic login/rating/signup rows; ?source= takes one value, a comma list or repeated
 * params, matched only against a fixed list (nothing else reaches Mongo); kpis still count old rows.
 */
import './setupDb';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { CreditLedger } from '../models/CreditLedger.model';
import { LawieDocument } from '../models/Document.model';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const USER = '507f1f77bcf86cd7994390b1';
const hdrs = (role: string, id = '507f1f77bcf86cd7994390b9') => ({
  'x-internal-secret': INTERNAL_SECRET,
  'x-user-id': id,
  'x-user-email': 'u@test.com',
  'x-user-name': 'U',
  'x-user-plan': 'pro',
  'x-user-role': role,
});
const admin = () => hdrs('Admin');
const uidObj = new mongoose.Types.ObjectId(USER);

async function seedLedger() {
  const rows: Array<[string, number]> = [
    ['login_bonus', 2],
    ['rating_bonus', 1],
    ['signup_bonus', 5],
    ['admin_grant', 10],
    ['draft_spent', -1],
  ];
  for (const [source, amount] of rows) {
    await CreditLedger.create({
      userId: uidObj,
      source,
      bucket: 'earnedCredits',
      amount,
      balanceAfter: 1,
    });
  }
}
const sources = (body: { entries: Array<{ source: string }> }) =>
  body.entries.map((e) => e.source).sort();

describe('T-652 rating route is gone', () => {
  it('POST /credits/rate/:docId is 404 for a real draft; no rating_bonus row, earnedCredits unchanged', async () => {
    await mongoose.connection.db!.collection('users').insertOne({
      _id: uidObj,
      email: 'rater@example.com',
      name: 'Rater',
      earnedCredits: 3,
    });
    const doc = await LawieDocument.create({
      userId: USER,
      title: 'Real draft',
      docType: 'bail_application',
      generatedContent: 'x',
    });
    for (let i = 0; i < 2; i += 1) {
      const res = await request(app)
        .post(`/credits/rate/${doc._id}`)
        .set(hdrs('Client', USER))
        .send({ stars: 5 });
      expect(res.status).toBe(404);
    }
    expect(await CreditLedger.countDocuments({})).toBe(0);
    const u = await mongoose.connection.db!.collection('users').findOne({ _id: uidObj });
    expect(u!.earnedCredits).toBe(3);
  });
});

describe('T-652 GET /admin/credits/ledger ?source=', () => {
  beforeEach(seedLedger);
  const get = (q: string) => request(app).get(`/admin/credits/ledger${q}`).set(admin());

  it('no filter: old login/rating/signup rows are still returned', async () => {
    const res = await get('');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(5);
    expect(sources(res.body)).toEqual([
      'admin_grant',
      'draft_spent',
      'login_bonus',
      'rating_bonus',
      'signup_bonus',
    ]);
  });

  it.each(['login_bonus', 'rating_bonus', 'signup_bonus'])('single source %s', async (s) => {
    const res = await get(`?source=${s}`);
    expect(sources(res.body)).toEqual([s]);
    expect(res.body.total).toBe(1);
  });

  it('comma-separated list (the Granted tab), whitespace tolerated', async () => {
    const res = await get('?source=signup_bonus,login_bonus,rating_bonus,admin_grant');
    expect(sources(res.body)).toEqual([
      'admin_grant',
      'login_bonus',
      'rating_bonus',
      'signup_bonus',
    ]);
    expect(res.body.total).toBe(4);
    const spaced = await get('?source=login_bonus%2C%20rating_bonus');
    expect(sources(spaced.body)).toEqual(['login_bonus', 'rating_bonus']);
  });

  it('repeated params', async () => {
    const res = await get('?source=login_bonus&source=signup_bonus');
    expect(sources(res.body)).toEqual(['login_bonus', 'signup_bonus']);
    expect(res.body.total).toBe(2);
  });

  it('a known value mixed with an unknown one returns just the known', async () => {
    const res = await get('?source=login_bonus,bogus');
    expect(sources(res.body)).toEqual(['login_bonus']);
  });

  it('unknown value => empty (200, total 0), not a 400 and not "no filter"', async () => {
    const res = await get('?source=nope');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ total: 0, entries: [] });
  });

  it.each([
    ['source[$ne]=x'],
    ['source[$regex]=.*'],
    ['source[$exists]=true'],
    ['source[$in][]=login_bonus'],
    ['source[a][b]=login_bonus'],
    ['source[$ne]=login_bonus&source[$gt]='],
  ])(
    'injection %s never reaches Mongo as an operator: dropped => matches nothing (never everything)',
    async (q) => {
      const res = await get(`?${q}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ total: 0, entries: [] });
    },
  );

  it('regex-looking plain string and prefix are not patterns', async () => {
    expect((await get('?source=.*')).body.total).toBe(0);
    expect((await get('?source=login')).body.total).toBe(0);
  });

  it('an operator object next to a valid value: only the literal value is used', async () => {
    const res = await get('?source=login_bonus&source[$ne]=login_bonus');
    expect(res.status).toBe(200);
    // qs merges the mixed shapes into one object, which is dropped: nothing leaks either way
    expect(res.body.entries.every((e: { source: string }) => e.source !== 'draft_spent')).toBe(
      true,
    );
  });

  it('admin only', async () => {
    const res = await request(app).get('/admin/credits/ledger').set(hdrs('Client'));
    expect(res.status).toBe(403);
    const anon = await request(app).get('/admin/credits/ledger');
    expect([401, 403]).toContain(anon.status);
    const kp = await request(app).get('/admin/credits/kpis').set(hdrs('Client'));
    expect(kp.status).toBe(403);
  });
});

describe('T-652 GET /admin/credits/kpis still counts historic grants', () => {
  it('grantedThisMonth includes login, rating and signup rows (2 + 1 + 5 + 10), not spends', async () => {
    await seedLedger();
    const res = await request(app).get('/admin/credits/kpis').set(admin());
    expect(res.status).toBe(200);
    expect(res.body.grantedThisMonth).toBe(18);
    expect(res.body.spentThisMonth).toBe(1);
  });
});

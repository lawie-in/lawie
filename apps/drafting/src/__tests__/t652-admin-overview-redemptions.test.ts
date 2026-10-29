/**
 * T-652: GET /admin/overview/activity builds 'redemption' entries from the inkledger
 * 'referral_bonus' row (the new source), plus OLD creditledger 'signup_bonus' rows for history,
 * one per user. Top-ups are unchanged. Admin only.
 */
import './setupDb';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const hdrs = (role: string) => ({
  'x-internal-secret': INTERNAL_SECRET,
  'x-user-id': '507f1f77bcf86cd7994390b9',
  'x-user-email': 'admin@test.com',
  'x-user-name': 'Admin',
  'x-user-plan': 'pro',
  'x-user-role': role,
});
const admin = () => hdrs('Admin');
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

const col = (n: string) => mongoose.connection.db!.collection(n);
let uid = 0;
async function mkUser(name: string, extra: Record<string, unknown> = {}) {
  uid += 1;
  const r = await col('users').insertOne({
    name,
    email: `t652-ov-${uid}@example.com`,
    createdAt: ago(30), // outside the 7-day window, so no 'signup' item muddies the feed
    updatedAt: ago(30),
    ...extra,
  });
  return r.insertedId;
}
const inkRow = (userId: unknown, reason: string, at: Date, extra: Record<string, unknown> = {}) =>
  col('inkledger').insertOne({
    userId,
    delta: 6,
    reason,
    sourceBucket: 'topup',
    balanceAfter: 6,
    createdAt: at,
    ...extra,
  });
const creditRow = (
  userId: unknown,
  source: string,
  at: Date,
  extra: Record<string, unknown> = {},
) =>
  col('creditledgers').insertOne({
    userId,
    source,
    bucket: 'earnedCredits',
    amount: 5,
    balanceAfter: 5,
    createdAt: at,
    ...extra,
  });

type Item = { type: string; label: string; detail: string; at: string };
async function feed(): Promise<Item[]> {
  const res = await request(app).get('/admin/overview/activity').set(admin());
  expect(res.status).toBe(200);
  return res.body.items as Item[];
}
const redemptions = (items: Item[]) => items.filter((i) => i.type === 'redemption');

describe('T-652 activity feed: redemptions', () => {
  it('an inkledger referral_bonus row appears as a redemption with name, bonus Ink and code', async () => {
    const u = await mkUser('Asha Advocate');
    await inkRow(u, 'referral_bonus', ago(1), {
      reference: 'FALLBACK',
      metadata: { referralCode: 'WELCOME3', bonusInk: 3 },
    });
    const r = redemptions(await feed());
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      type: 'redemption',
      label: 'Asha Advocate redeemed referral',
      detail: '3 Ink · WELCOME3',
    });
  });

  it('detail falls back to reference when metadata is missing; unknown user is (advocate)', async () => {
    const u = await mkUser('Ravi R');
    await inkRow(u, 'referral_bonus', ago(1), { reference: 'REFCODE' });
    await inkRow(new mongoose.Types.ObjectId(), 'referral_bonus', ago(2), {
      reference: 'GHOSTCODE',
    });
    const r = redemptions(await feed());
    expect(r.map((x) => [x.label, x.detail])).toEqual([
      ['Ravi R redeemed referral', 'REFCODE'],
      ['(advocate) redeemed referral', 'GHOSTCODE'],
    ]);
  });

  it('an OLD creditledger signup_bonus row still appears, with its reference', async () => {
    const u = await mkUser('Old Timer');
    await creditRow(u, 'signup_bonus', ago(2), { reference: 'OLDCODE' });
    const r = redemptions(await feed());
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ label: 'Old Timer redeemed referral', detail: 'OLDCODE' });
  });

  it('a user with both an inkledger referral row and an old signup_bonus row is listed ONCE, from the inkledger row', async () => {
    const both = await mkUser('Both Rows');
    const oldOnly = await mkUser('Old Only');
    await creditRow(both, 'signup_bonus', ago(2), { reference: 'FROM-OLD' });
    await inkRow(both, 'referral_bonus', ago(1), {
      metadata: { referralCode: 'FROM-INK', bonusInk: 5 },
    });
    await creditRow(oldOnly, 'signup_bonus', ago(3), { reference: 'OLD-ONLY' });
    const r = redemptions(await feed());
    const mine = r.filter((x) => x.label.startsWith('Both Rows'));
    expect(mine).toHaveLength(1);
    expect(mine[0].detail).toBe('5 Ink · FROM-INK');
    expect(JSON.stringify(r)).not.toContain('FROM-OLD');
    expect(r.filter((x) => x.label.startsWith('Old Only'))).toHaveLength(1); // not over-deduped
    expect(r).toHaveLength(2);
  });

  it('only referral_bonus inkledger rows count: free_seed, topup_purchase, test_grant do not show', async () => {
    const u = await mkUser('Seed Person');
    await inkRow(u, 'free_seed', ago(1), { delta: 10 });
    await inkRow(u, 'topup_purchase', ago(1), { delta: 50 });
    await inkRow(u, 'test_grant', ago(1), { delta: 60 });
    await inkRow(u, 'draft_spent', ago(1), { delta: -2 });
    const items = await feed();
    expect(redemptions(items)).toHaveLength(0);
    expect(JSON.stringify(items)).not.toContain('Seed Person');
  });

  it('rows older than the 7-day window are excluded (both sources)', async () => {
    const u = await mkUser('Stale One');
    const v = await mkUser('Stale Two');
    await inkRow(u, 'referral_bonus', ago(8), { metadata: { referralCode: 'STALE', bonusInk: 1 } });
    await creditRow(v, 'signup_bonus', ago(8), { reference: 'STALE2' });
    expect(redemptions(await feed())).toHaveLength(0);
  });

  it('top-up rows are unaffected and still appear as a topup item (and never as a redemption)', async () => {
    const u = await mkUser('Payer');
    await creditRow(u, 'topup_purchase', ago(1), {
      bucket: 'topupCredits',
      amount: 20,
      metadata: { amountInr: 499 },
    });
    const items = await feed();
    const t = items.filter((i) => i.type === 'topup');
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({
      label: 'Payer purchased top-up',
      detail: '20 credits · ₹499',
    });
    expect(redemptions(items)).toHaveLength(0);
  });

  it("a referral row of a different user is not suppressed by another user's inkledger row", async () => {
    const a = await mkUser('Alpha');
    const b = await mkUser('Beta');
    await inkRow(a, 'referral_bonus', ago(1), { metadata: { referralCode: 'A', bonusInk: 3 } });
    await creditRow(b, 'signup_bonus', ago(1), { reference: 'B' });
    expect(redemptions(await feed())).toHaveLength(2);
  });

  it('test accounts: signups are excluded; a test account has no referral row (test_grant only) so nothing shows', async () => {
    const t = await mkUser('TEST Account', {
      isTestAccount: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await inkRow(t, 'test_grant', ago(0), { delta: 60 });
    const text = JSON.stringify(await feed());
    expect(text).not.toContain('TEST Account');
  });

  it('no database handle: no crash, the rest of the feed still returns', async () => {
    const u = await mkUser('Fine User');
    await creditRow(u, 'signup_bonus', ago(1), { reference: 'X' });
    const conn = mongoose.connection as unknown as { db: unknown };
    const real = conn.db;
    conn.db = undefined;
    try {
      const res = await request(app).get('/admin/overview/activity').set(admin());
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(redemptions(res.body.items)).toHaveLength(1); // the old creditledger row still shows
    } finally {
      conn.db = real;
    }
  });

  it('admin only: Client role 403, no credentials refused, no data leaked', async () => {
    const u = await mkUser('Secret Name');
    await inkRow(u, 'referral_bonus', ago(1), {
      metadata: { referralCode: 'SECRET', bonusInk: 3 },
    });
    const client = await request(app).get('/admin/overview/activity').set(hdrs('Client'));
    expect(client.status).toBe(403);
    expect(JSON.stringify(client.body)).not.toContain('Secret Name');
    const anon = await request(app).get('/admin/overview/activity');
    expect([401, 403]).toContain(anon.status);
  });

  it('csv format carries the same redemption', async () => {
    const u = await mkUser('Csv Person');
    await inkRow(u, 'referral_bonus', ago(1), { metadata: { referralCode: 'CSV1', bonusInk: 3 } });
    const res = await request(app).get('/admin/overview/activity?format=csv').set(admin());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Csv Person redeemed referral');
    expect(res.text).toContain('3 Ink · CSV1');
  });
});

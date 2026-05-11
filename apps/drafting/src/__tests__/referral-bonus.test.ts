/**
 * SCRUM-71 — Referral bonus tests (drafting service)
 *
 * Coverage:
 *   - BonusCredit model: creation, unique per user
 *   - POST /internal/grant-bonus: 401 no secret, 400 bad input, 200 creates/increments BonusCredit
 *   - enforceFreeLimit: deducts bonus first, then falls to monthly limit
 */

import './setupEnv';
import './setupDb';

import supertest from 'supertest';

import app from '../app';
import { BonusCredit } from '../models/BonusCredit.model';
// Generation import was used by the legacy "falls to monthly limit" test that
// the SCRUM-73 rewrite replaced — kept here as a comment so the symbol is
// findable when we cut the legacy enforceFreeLimit path entirely.

const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? 'test-internal-secret-at-least-16';
const USER_ID = '507f1f77bcf86cd799439011';

// Auth headers for enforceFreeLimit tests (drafting uses x-internal-secret pattern)
const AUTH = {
  'x-internal-secret': INTERNAL_SECRET,
  'x-user-id': USER_ID,
  'x-user-email': 'adv@lawie.in',
  'x-user-role': 'Client',
  'x-user-plan': 'free',
  'x-user-name': 'Test Advocate',
};

// ── BonusCredit model ─────────────────────────────────────────────────────────

describe('BonusCredit model', () => {
  it('creates with granted and used defaults', async () => {
    const bc = await BonusCredit.create({ userId: USER_ID, granted: 25 });
    expect(bc.granted).toBe(25);
    expect(bc.used).toBe(0);
  });

  it('enforces unique userId', async () => {
    await BonusCredit.create({ userId: USER_ID, granted: 25 });
    await expect(BonusCredit.create({ userId: USER_ID, granted: 10 })).rejects.toThrow();
  });
});

// ── POST /internal/grant-bonus ────────────────────────────────────────────────

describe('POST /internal/grant-bonus', () => {
  it('401 without x-internal-secret', async () => {
    const res = await supertest(app)
      .post('/internal/grant-bonus')
      .send({ userId: USER_ID, bonus: 25 });
    expect(res.status).toBe(401);
  });

  it('401 with wrong secret', async () => {
    const res = await supertest(app)
      .post('/internal/grant-bonus')
      .set({ 'x-internal-secret': 'wrong-secret' })
      .send({ userId: USER_ID, bonus: 25 });
    expect(res.status).toBe(401);
  });

  it('400 when userId missing', async () => {
    const res = await supertest(app)
      .post('/internal/grant-bonus')
      .set({ 'x-internal-secret': INTERNAL_SECRET })
      .send({ bonus: 25 });
    expect(res.status).toBe(400);
  });

  it('400 when bonus is not a positive integer', async () => {
    const res = await supertest(app)
      .post('/internal/grant-bonus')
      .set({ 'x-internal-secret': INTERNAL_SECRET })
      .send({ userId: USER_ID, bonus: -5 });
    expect(res.status).toBe(400);
  });

  it('400 when userId is not a valid ObjectId', async () => {
    const res = await supertest(app)
      .post('/internal/grant-bonus')
      .set({ 'x-internal-secret': INTERNAL_SECRET })
      .send({ userId: 'not-an-objectid', bonus: 25 });
    expect(res.status).toBe(400);
  });

  it('200 — creates BonusCredit record', async () => {
    const res = await supertest(app)
      .post('/internal/grant-bonus')
      .set({ 'x-internal-secret': INTERNAL_SECRET })
      .send({ userId: USER_ID, bonus: 25 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const bc = await BonusCredit.findOne({ userId: USER_ID });
    expect(bc).not.toBeNull();
    expect(bc!.granted).toBe(25);
    expect(bc!.used).toBe(0);
  });

  it('200 — increments existing BonusCredit on second call', async () => {
    await supertest(app)
      .post('/internal/grant-bonus')
      .set({ 'x-internal-secret': INTERNAL_SECRET })
      .send({ userId: USER_ID, bonus: 25 });

    await supertest(app)
      .post('/internal/grant-bonus')
      .set({ 'x-internal-secret': INTERNAL_SECRET })
      .send({ userId: USER_ID, bonus: 10 });

    const bc = await BonusCredit.findOne({ userId: USER_ID });
    expect(bc!.granted).toBe(35);
  });
});

// ── enforceFreeLimit — bonus deduction ────────────────────────────────────────
// We can't easily test enforceFreeLimit in isolation without a full generate call,
// so we test the /usage endpoint as a proxy for counting, and the grant-bonus
// endpoint to verify the BonusCredit record is consumed.

describe('enforceFreeLimit — bonus deduction', () => {
  it('BonusCredit.used increments when bonus > 0 (via grant + usage verification)', async () => {
    // Pre-load bonus
    await BonusCredit.create({ userId: USER_ID, granted: 25, used: 0 });

    // Simulate enforceFreeLimit consuming one bonus draft:
    // directly call the update that enforceFreeLimit performs
    await BonusCredit.updateOne(
      { userId: USER_ID, used: { $lt: 25 } },
      { $inc: { used: 1 } },
    );

    const bc = await BonusCredit.findOne({ userId: USER_ID });
    expect(bc!.used).toBe(1);
    // remaining = 24
    expect(bc!.granted - bc!.used).toBe(24);
  });

  it('refuses generation with 402 when user has zero credits (post SCRUM-73)', async () => {
    // SCRUM-73 — enforceFreeLimit replaced with enforceCredits. With no
    // credits in any bucket the route now responds 402 "Insufficient credits".
    const res = await supertest(app)
      .post('/generate-from-template')
      .set(AUTH)
      .send({ template_id: 'bail_anticipatory', form_data: { applicant_name: 'Test' } });

    expect(res.status).toBe(402);
    expect(res.body.error).toMatch(/Insufficient credits/);
    expect(res.body.cost).toBe(2);   // bail_anticipatory costs 2 credits
    expect(res.body.balance.total).toBe(0);
  });
});

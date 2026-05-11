/**
 * SCRUM-71 — Referral code system tests (auth service)
 *
 * Coverage:
 *   - ReferralCode model: creation, uniqueness, field defaults
 *   - User model: referredVia + freeTierBonusGrant fields
 *   - referral.service: generateReferralCode, validateReferralCode, disableReferralCode, listReferralCodes
 *   - Admin routes: POST /admin/referral-codes, GET, PATCH /:code/disable (auth + 403 non-admin)
 *   - Public route: GET /validate-code/:code
 *   - Security: non-Admin cannot access admin routes
 */

import './setupEnv';

// ioredis must be mocked before app import (session.service uses it)
jest.mock('ioredis', () => require('ioredis-mock'));

import './setupDb';

import supertest from 'supertest';

import app from '../app';
import { ReferralCode } from '../models/ReferralCode.model';
import { User } from '../models/User.model';
import { signAccessToken } from '../services/jwt.service';
import {
  generateReferralCode,
  validateReferralCode,
  disableReferralCode,
  listReferralCodes,
  REFERRAL_BONUS_DRAFTS,
} from '../services/referral.service';

// ── Auth helper — real JWT signed with test secret ─────────────────────────────

const FOUNDER_ID = '507f1f77bcf86cd799439011';
const CLIENT_ID = '507f1f77bcf86cd799439012';

function adminToken(userId = FOUNDER_ID) {
  return signAccessToken({
    sub: userId,
    email: 'founder@lawie.in',
    name: 'Founder',
    role: 'Admin',
    plan: 'free',
  });
}

function clientToken(userId = CLIENT_ID) {
  return signAccessToken({
    sub: userId,
    email: 'advocate@lawie.in',
    name: 'Test Advocate',
    role: 'Client',
    plan: 'free',
  });
}

function adminHeaders() {
  return { Authorization: `Bearer ${adminToken()}` };
}

function clientHeaders() {
  return { Authorization: `Bearer ${clientToken()}` };
}

// ── ReferralCode model ────────────────────────────────────────────────────────

describe('ReferralCode model', () => {
  it('creates a code with required fields and defaults', async () => {
    const rc = await ReferralCode.create({
      code: 'TESTCODE',
      createdBy: FOUNDER_ID,
    });
    expect(rc.code).toBe('TESTCODE');
    expect(rc.isActive).toBe(true);
    expect(rc.maxUses).toBeNull();
    expect(rc.uses).toBe(0);
  });

  it('enforces uniqueness on code', async () => {
    await ReferralCode.create({ code: 'UNIQUE01', createdBy: FOUNDER_ID });
    await expect(
      ReferralCode.create({ code: 'UNIQUE01', createdBy: FOUNDER_ID }),
    ).rejects.toThrow();
  });

  it('uppercases code on save', async () => {
    const rc = await ReferralCode.create({ code: 'lwtest01', createdBy: FOUNDER_ID });
    expect(rc.code).toBe('LWTEST01');
  });
});

// ── User model — new referral fields ─────────────────────────────────────────

describe('User model — referral fields', () => {
  it('defaults freeTierBonusGrant to 0', async () => {
    const user = await User.create({
      email: 'test@lawie.in',
      password: 'TestPass1',
      name: 'Test User',
    });
    expect(user.freeTierBonusGrant).toBe(0);
    expect(user.referredVia).toBeNull();
  });

  it('stores referredVia ObjectId', async () => {
    const rc = await ReferralCode.create({ code: 'LWPATNA1', createdBy: FOUNDER_ID });
    const user = await User.create({
      email: 'adv@lawie.in',
      password: 'TestPass1',
      name: 'Advocate',
      referredVia: rc._id,
      freeTierBonusGrant: 25,
    });
    expect(user.freeTierBonusGrant).toBe(25);
    expect(user.referredVia?.toString()).toBe(rc._id.toString());
  });
});

// ── referral.service ──────────────────────────────────────────────────────────

describe('generateReferralCode', () => {
  it('generates an 8-char uppercase alphanumeric code', async () => {
    const rc = await generateReferralCode(FOUNDER_ID, { label: 'Patna bar' });
    expect(rc.code).toMatch(/^[A-Z0-9]{8}$/);
    expect(rc.label).toBe('Patna bar');
    expect(rc.isActive).toBe(true);
    expect(rc.maxUses).toBeNull();
  });

  it('generates a code with maxUses cap', async () => {
    const rc = await generateReferralCode(FOUNDER_ID, { maxUses: 10 });
    expect(rc.maxUses).toBe(10);
  });

  it('generates unique codes across multiple calls', async () => {
    const [a, b] = await Promise.all([
      generateReferralCode(FOUNDER_ID),
      generateReferralCode(FOUNDER_ID),
    ]);
    expect(a.code).not.toBe(b.code);
  });
});

describe('validateReferralCode', () => {
  it('returns code when active and not exhausted', async () => {
    await ReferralCode.create({ code: 'VALID001', createdBy: FOUNDER_ID });
    const rc = await validateReferralCode('VALID001');
    expect(rc).not.toBeNull();
    expect(rc!.code).toBe('VALID001');
  });

  it('is case-insensitive', async () => {
    await ReferralCode.create({ code: 'LOWER001', createdBy: FOUNDER_ID });
    const rc = await validateReferralCode('lower001');
    expect(rc).not.toBeNull();
  });

  it('returns null for inactive code', async () => {
    await ReferralCode.create({ code: 'INACTIVE', createdBy: FOUNDER_ID, isActive: false });
    expect(await validateReferralCode('INACTIVE')).toBeNull();
  });

  it('returns null when uses >= maxUses', async () => {
    await ReferralCode.create({ code: 'EXHAUST1', createdBy: FOUNDER_ID, maxUses: 1, uses: 1 });
    expect(await validateReferralCode('EXHAUST1')).toBeNull();
  });

  it('returns null for unknown code', async () => {
    expect(await validateReferralCode('UNKNOWN1')).toBeNull();
  });
});

describe('disableReferralCode', () => {
  it('disables an active code', async () => {
    await ReferralCode.create({ code: 'TODIABLE', createdBy: FOUNDER_ID });
    const rc = await disableReferralCode('TODIABLE');
    expect(rc!.isActive).toBe(false);
  });

  it('returns null for unknown code', async () => {
    expect(await disableReferralCode('NOTFOUND')).toBeNull();
  });
});

describe('listReferralCodes', () => {
  it('returns all codes sorted newest first', async () => {
    await ReferralCode.create({ code: 'FIRST001', createdBy: FOUNDER_ID });
    // Tiny delay so the second createdAt timestamp definitely differs — without
    // this the two creates can land in the same millisecond and the {createdAt:
    // -1} sort tie-breaks unpredictably.
    await new Promise((r) => setTimeout(r, 10));
    await ReferralCode.create({ code: 'SECOND01', createdBy: FOUNDER_ID });
    const list = await listReferralCodes();
    expect(list.length).toBe(2);
    // newest first
    expect(list[0].code).toBe('SECOND01');
  });
});

// ── Admin routes ──────────────────────────────────────────────────────────────

describe('POST /admin/referral-codes', () => {
  it('201 for Admin role — creates code', async () => {
    const res = await supertest(app)
      .post('/admin/referral-codes')
      .set(adminHeaders())
      .send({ label: 'Ranchi bar review' });
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^[A-Z0-9]{8}$/);
    expect(res.body.label).toBe('Ranchi bar review');
    expect(res.body.isActive).toBe(true);
  });

  it('403 for Client role', async () => {
    const res = await supertest(app)
      .post('/admin/referral-codes')
      .set(clientHeaders())
      .send({});
    expect(res.status).toBe(403);
  });

  it('401 without auth', async () => {
    const res = await supertest(app).post('/admin/referral-codes').send({});
    expect(res.status).toBe(401);
  });

  it('201 with maxUses cap', async () => {
    const res = await supertest(app)
      .post('/admin/referral-codes')
      .set(adminHeaders())
      .send({ maxUses: 50 });
    expect(res.status).toBe(201);
    expect(res.body.maxUses).toBe(50);
  });
});

describe('GET /admin/referral-codes', () => {
  it('200 for Admin — lists codes', async () => {
    await ReferralCode.create({ code: 'LISTTEST', createdBy: FOUNDER_ID });
    const res = await supertest(app).get('/admin/referral-codes').set(adminHeaders());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.codes)).toBe(true);
    expect(res.body.codes.some((c: { code: string }) => c.code === 'LISTTEST')).toBe(true);
  });

  it('403 for non-Admin', async () => {
    const res = await supertest(app).get('/admin/referral-codes').set(clientHeaders());
    expect(res.status).toBe(403);
  });
});

describe('PATCH /admin/referral-codes/:code/disable', () => {
  it('200 — disables the code', async () => {
    await ReferralCode.create({ code: 'DISBLME1', createdBy: FOUNDER_ID });
    const res = await supertest(app)
      .patch('/admin/referral-codes/DISBLME1/disable')
      .set(adminHeaders());
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
  });

  it('404 for unknown code', async () => {
    const res = await supertest(app)
      .patch('/admin/referral-codes/NOTEXIST/disable')
      .set(adminHeaders());
    expect(res.status).toBe(404);
  });

  it('403 for non-Admin', async () => {
    const res = await supertest(app)
      .patch('/admin/referral-codes/DISBLME1/disable')
      .set(clientHeaders());
    expect(res.status).toBe(403);
  });
});

// ── Public validate-code route ────────────────────────────────────────────────

describe('GET /validate-code/:code', () => {
  it('returns valid:true for an active code', async () => {
    await ReferralCode.create({ code: 'PUBTEST1', createdBy: FOUNDER_ID, label: 'Test batch' });
    const res = await supertest(app).get('/validate-code/PUBTEST1');
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.bonusDrafts).toBe(REFERRAL_BONUS_DRAFTS);
    expect(res.body.label).toBe('Test batch');
  });

  it('returns valid:false for unknown code', async () => {
    const res = await supertest(app).get('/validate-code/BADCODE1');
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
  });

  it('returns valid:false for exhausted code', async () => {
    await ReferralCode.create({
      code: 'EXHAUST2',
      createdBy: FOUNDER_ID,
      maxUses: 1,
      uses: 1,
    });
    const res = await supertest(app).get('/validate-code/EXHAUST2');
    expect(res.body.valid).toBe(false);
  });

  it('is case-insensitive', async () => {
    await ReferralCode.create({ code: 'CASETEST', createdBy: FOUNDER_ID });
    const res = await supertest(app).get('/validate-code/casetest');
    expect(res.body.valid).toBe(true);
  });
});

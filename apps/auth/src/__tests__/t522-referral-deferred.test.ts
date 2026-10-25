/**
 * T-522 (Arjun rulings 2 and (b), 22 Oct 2026; AJ-522-S2/S3) - the referral Ink is deferred to
 * verification for a password sign-up.
 *
 *  - recorded at sign-up (claim + use slot), no Ink
 *  - granted at verify only if the code is still valid at that moment
 *  - lapsed / exhausted -> no grant, referralStatus 'not_applied', slot and claim freed
 *  - the holder of the last slot of a capped code is still granted (exhausted = uses > maxUses)
 *  - idempotent; grantReferralInk itself refuses unverified users
 *  - GET /me reports signupInkGranted and referralStatus
 */
import './setupEnv';

jest.mock('ioredis', () => jest.requireActual('ioredis-mock'));

jest.mock('@lawie/email-client', () => ({
  enqueueEmail: jest.fn().mockResolvedValue({ jobId: 'j', queue: 'q', deduped: false }),
}));

import './setupDb';

import mongoose from 'mongoose';
import supertest from 'supertest';

import app from '../app';
import redis from '../config/redis';
import { ReferralCode } from '../models/ReferralCode.model';
import { User } from '../models/User.model';
import { grantReferralInk } from '../services/credit-bonus.service';
import { applyReferralCode, grantDeferredReferralInk } from '../services/referral.service';

import {
  ledger,
  makeCode,
  rawUsers,
  verifyViaLink,
  waitFor,
  waitForReferralDecision,
} from './t234-helpers';

const PASSWORD = 'Passw0rdOk';
const BONUS = 3;
const UNITS = BONUS * 2;

beforeEach(async () => {
  await redis.flushall();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
});

const reg = (email: string, referralCode?: string) =>
  supertest(app)
    .post('/register')
    .send({
      email,
      password: PASSWORD,
      name: 'Ref Person',
      ...(referralCode ? { referralCode } : {}),
    });

/** A password user with the code recorded (deferInk), the way sign-up does it. */
async function signedUp(email: string, code: string) {
  const u = await User.create({ email, name: 'R', password: PASSWORD });
  expect(await applyReferralCode(String(u._id), code, { deferInk: true })).toBe('applied');
  return u;
}
const raw = (id: unknown) => rawUsers().findOne({ _id: id as mongoose.Types.ObjectId });
const referralRows = (id: unknown) =>
  ledger().countDocuments({ userId: id, reason: 'referral_bonus' });
const codeOf = async (code: string) => (await ReferralCode.findOne({ code }).lean())!;

describe('T-522 referral: recorded at sign-up, no Ink', () => {
  it('POST /register with a valid code: claim and slot taken, referralStatus applied, 0 Ink, no ledger row', async () => {
    await makeCode({ code: 'DEFER001', bonusInk: BONUS });
    const res = await reg('def1@example.com', 'defer001');
    expect(res.status).toBe(202);
    const u = await User.findOne({ email: 'def1@example.com' }).lean();
    const decided = await waitForReferralDecision(u!._id);
    expect(decided['referralStatus']).toBe('applied');
    expect(String(decided['referredVia'])).toBe(String((await codeOf('DEFER001'))._id));
    expect((await codeOf('DEFER001')).uses).toBe(1);
    expect(decided['inkTopup'] ?? 0).toBe(0);
    expect(decided['referralInkGrantedAt']).toBeUndefined();
    expect(await ledger().countDocuments({ userId: u!._id })).toBe(0);
  });

  it('an invalid code at sign-up is recorded as not_applied, with no claim', async () => {
    const res = await reg('def2@example.com', 'NOSUCH99');
    expect(res.status).toBe(202);
    const u = await User.findOne({ email: 'def2@example.com' }).lean();
    const decided = await waitForReferralDecision(u!._id);
    expect(decided['referralStatus']).toBe('not_applied');
    expect(decided['referredVia'] ?? null).toBeNull();
  });
});

describe('T-522 referral: granted at verify, only if the code is still valid', () => {
  it('a valid code is granted when the address is verified (with the sign-up Ink), once', async () => {
    await makeCode({ code: 'DEFER002', bonusInk: BONUS });
    const u = await signedUp('v1@example.com', 'DEFER002');
    expect(await referralRows(u._id)).toBe(0);

    await verifyViaLink(u._id);
    await waitFor(async () => (await referralRows(u._id)) === 1);

    const doc = await raw(u._id);
    expect(doc!['inkTopup']).toBe(10 + UNITS);
    expect(doc!['referralInkGrantedAt']).toBeInstanceOf(Date);
    expect(doc!['referralInkCode']).toBe('DEFER002');
    expect(doc!['referralStatus']).toBe('applied');
    expect((await codeOf('DEFER002')).uses).toBe(1);
  });

  it('a code disabled after sign-up: no grant, not_applied, claim released, slot freed', async () => {
    await makeCode({ code: 'DEFER003', bonusInk: BONUS });
    const u = await signedUp('v2@example.com', 'DEFER003');
    expect((await codeOf('DEFER003')).uses).toBe(1);
    await ReferralCode.updateOne({ code: 'DEFER003' }, { isActive: false });

    await verifyViaLink(u._id);
    const doc = await waitFor(async () => {
      const d = await raw(u._id);
      return d!['referralStatus'] === 'not_applied' ? d : null;
    });

    expect(await referralRows(u._id)).toBe(0);
    expect(doc['referralInkGrantedAt']).toBeUndefined();
    expect(doc['referredVia'] ?? null).toBeNull();
    expect((await codeOf('DEFER003')).uses).toBe(0);
    // the sign-up Ink itself is unaffected
    expect(doc['inkTopup']).toBe(10);
  });

  it('a code that expired after sign-up: no grant, not_applied, slot and claim freed', async () => {
    await makeCode({ code: 'DEFER004', bonusInk: BONUS });
    const u = await signedUp('v3@example.com', 'DEFER004');
    await ReferralCode.updateOne({ code: 'DEFER004' }, { expiresAt: new Date(Date.now() - 1000) });

    await grantDeferredReferralInk(String(u._id));

    const doc = await raw(u._id);
    expect(doc!['referralStatus']).toBe('not_applied');
    expect(doc!['referredVia'] ?? null).toBeNull();
    expect(await referralRows(u._id)).toBe(0);
    expect((await codeOf('DEFER004')).uses).toBe(0);
  });

  it('an exhausted code (uses over maxUses): no grant, not_applied, slot and claim freed', async () => {
    await makeCode({ code: 'DEFER005', bonusInk: BONUS, maxUses: 1 });
    const u = await signedUp('v4@example.com', 'DEFER005');
    // an admin lowered the cap / another path overshot: uses now exceeds maxUses
    await ReferralCode.updateOne({ code: 'DEFER005' }, { $set: { uses: 2 } });

    await grantDeferredReferralInk(String(u._id));

    const doc = await raw(u._id);
    expect(doc!['referralStatus']).toBe('not_applied');
    expect(doc!['referredVia'] ?? null).toBeNull();
    expect(await referralRows(u._id)).toBe(0);
    expect((await codeOf('DEFER005')).uses).toBe(1);
  });

  it('the holder of the LAST slot of a capped code (uses == maxUses) is still granted', async () => {
    await makeCode({ code: 'DEFER006', bonusInk: BONUS, maxUses: 1 });
    const u = await signedUp('v5@example.com', 'DEFER006');
    const rc = await codeOf('DEFER006');
    expect(rc.uses).toBe(1);
    expect(rc.maxUses).toBe(1);

    await verifyViaLink(u._id);
    await waitFor(async () => (await referralRows(u._id)) === 1);

    const doc = await raw(u._id);
    expect(doc!['referralStatus']).toBe('applied');
    expect(doc!['inkTopup']).toBe(10 + UNITS);
    expect((await codeOf('DEFER006')).uses).toBe(1);
  });

  it('freeing the slot lets another sign-up use the capped code', async () => {
    await makeCode({ code: 'DEFER007', bonusInk: BONUS, maxUses: 1 });
    const a = await signedUp('v6a@example.com', 'DEFER007');
    await ReferralCode.updateOne({ code: 'DEFER007' }, { expiresAt: new Date(Date.now() - 1000) });
    await grantDeferredReferralInk(String(a._id));
    await ReferralCode.updateOne({ code: 'DEFER007' }, { $unset: { expiresAt: 1 } });
    const b = await User.create({ email: 'v6b@example.com', name: 'B', password: PASSWORD });
    expect(await applyReferralCode(String(b._id), 'DEFER007', { deferInk: true })).toBe('applied');
  });

  it('is idempotent: a repeat call, and a repeat verify, give exactly one referral row and one $inc', async () => {
    await makeCode({ code: 'DEFER008', bonusInk: BONUS });
    const u = await signedUp('v7@example.com', 'DEFER008');
    await verifyViaLink(u._id);
    await waitFor(async () => (await referralRows(u._id)) === 1);
    await grantDeferredReferralInk(String(u._id));
    await grantDeferredReferralInk(String(u._id));
    await Promise.all([
      grantDeferredReferralInk(String(u._id)),
      grantDeferredReferralInk(String(u._id)),
    ]);
    expect(await referralRows(u._id)).toBe(1);
    expect((await raw(u._id))!['inkTopup']).toBe(10 + UNITS);
    expect((await codeOf('DEFER008')).uses).toBe(1);
  });

  it('a code that lapses AFTER the Ink was paid cannot flip the status of a paid user', async () => {
    await makeCode({ code: 'DEFER009', bonusInk: BONUS });
    const u = await signedUp('v8@example.com', 'DEFER009');
    await verifyViaLink(u._id);
    await waitFor(async () => (await referralRows(u._id)) === 1);
    await ReferralCode.updateOne({ code: 'DEFER009' }, { isActive: false });
    await grantDeferredReferralInk(String(u._id));
    const doc = await raw(u._id);
    expect(doc!['referralStatus']).toBe('applied');
    expect(String(doc!['referredVia'])).not.toBe('null');
    expect(await referralRows(u._id)).toBe(1);
  });

  it('a user with no recorded referral is a no-op, and a bad id never throws', async () => {
    const u = await User.create({ email: 'v9@example.com', name: 'N', password: PASSWORD });
    await expect(grantDeferredReferralInk(String(u._id))).resolves.toBeUndefined();
    await expect(grantDeferredReferralInk('not-an-id')).resolves.toBeUndefined();
    expect(await referralRows(u._id)).toBe(0);
  });
});

describe('T-522 grantReferralInk refuses unverified users', () => {
  it('an unverified password user is credited 0, with no marker and no ledger row', async () => {
    const u = await User.create({ email: 'f1@example.com', name: 'F', password: PASSWORD });
    expect(await grantReferralInk(String(u._id), BONUS, 'FENCE001')).toBe(0);
    const doc = await raw(u._id);
    expect(doc!['inkTopup'] ?? 0).toBe(0);
    expect(doc!['referralInkGrantedAt']).toBeUndefined();
    expect(await referralRows(u._id)).toBe(0);
  });

  it('a verified user is credited, and a Google user is credited without emailVerified', async () => {
    const v = await User.create({
      email: 'f2@example.com',
      name: 'F',
      password: PASSWORD,
      emailVerified: true,
    });
    const g = await User.create({
      email: 'f3@example.com',
      name: 'G',
      authProvider: 'google',
      googleId: 'g-fence-3',
    });
    expect(await grantReferralInk(String(v._id), BONUS, 'FENCE002')).toBe(UNITS);
    expect(await grantReferralInk(String(g._id), BONUS, 'FENCE003')).toBe(UNITS);
  });

  it('applyReferralCode without deferInk on an unverified user grants nothing and rolls back to invalid', async () => {
    await makeCode({ code: 'FENCE004', bonusInk: BONUS });
    const u = await User.create({ email: 'f4@example.com', name: 'F', password: PASSWORD });
    expect(await applyReferralCode(String(u._id), 'FENCE004')).toBe('invalid');
    expect((await codeOf('FENCE004')).uses).toBe(0);
    expect(await referralRows(u._id)).toBe(0);
  });
});

describe('T-522 GET /me: signupInkGranted and referralStatus', () => {
  async function meFor(email: string) {
    const login = await supertest(app).post('/login').send({ email, password: PASSWORD });
    expect(login.status).toBe(200);
    return supertest(app)
      .get('/me')
      .set({ Authorization: `Bearer ${login.body.data.accessToken}` });
  }

  it('a fresh unverified user: signupInkGranted false, referralStatus null', async () => {
    await User.create({ email: 'me1@example.com', name: 'M', password: PASSWORD });
    const me = await meFor('me1@example.com');
    expect(me.status).toBe(200);
    expect(me.body.data.signupInkGranted).toBe(false);
    expect(me.body.data.referralStatus).toBeNull();
  });

  it('after the verify: signupInkGranted true; referralStatus applied', async () => {
    await makeCode({ code: 'MEREF001', bonusInk: BONUS });
    const u = await signedUp('me2@example.com', 'MEREF001');
    await verifyViaLink(u._id);
    await waitFor(async () => (await referralRows(u._id)) === 1);
    const me = await meFor('me2@example.com');
    expect(me.body.data.signupInkGranted).toBe(true);
    expect(me.body.data.referralStatus).toBe('applied');
    expect(me.body.data.emailVerified).toBe(true);
  });

  it('a lapsed code: referralStatus not_applied', async () => {
    await makeCode({ code: 'MEREF002', bonusInk: BONUS });
    const u = await signedUp('me3@example.com', 'MEREF002');
    await ReferralCode.updateOne({ code: 'MEREF002' }, { isActive: false });
    await verifyViaLink(u._id);
    await waitFor(async () => (await raw(u._id))!['referralStatus'] === 'not_applied');
    const me = await meFor('me3@example.com');
    expect(me.body.data.referralStatus).toBe('not_applied');
    expect(me.body.data.signupInkGranted).toBe(true);
  });

  it('an unknown stored status is reported as null', async () => {
    const u = await User.create({ email: 'me4@example.com', name: 'M', password: PASSWORD });
    await rawUsers().updateOne({ _id: u._id }, { $set: { referralStatus: 'weird' } });
    const me = await meFor('me4@example.com');
    expect(me.body.data.referralStatus).toBeNull();
  });
});

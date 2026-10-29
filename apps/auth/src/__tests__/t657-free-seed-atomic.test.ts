/**
 * T-657: the free 5 Ink seed (10 units) and its once-only marker (signupBonusGrantedAt) are ONE
 * atomic write, so a failure between steps can never leave a marked user without the Ink.
 *
 *  - invariant: marker set by this code => inkTopup >= 10 (checked after every step)
 *  - the ledger row has a deterministic _id (`free_seed:<userId>`): at most one, E11000 = written
 *  - a failed row insert is healed by the next call; a failed pipeline update writes nothing
 *  - markers set by OLD code (no freeSeedAt) are never healed here (the backfill covers them)
 *  - sign-in self-heal (fire-and-forget, never awaited, never fails sign-in, no PII in logs)
 */
import './setupEnv';
import './t563-bypass-env';

jest.mock('ioredis', () => jest.requireActual('ioredis-mock'));
jest.mock('@lawie/email-client', () => ({ enqueueEmail: jest.fn() }));

import './setupDb';

import fs from 'fs';
import path from 'path';

import mongoose from 'mongoose';
import supertest from 'supertest';

import app from '../app';
import logger from '../config/logger';
import redis from '../config/redis';
import { User } from '../models/User.model';
import * as bonus from '../services/credit-bonus.service';
import { applyReferralCode } from '../services/referral.service';

import { ledger, makeCode, rawUsers } from './t234-helpers';

import * as backfill from '../../scripts/backfill-free-seed';

jest.setTimeout(60_000);

const { grantSignupBonus } = bonus;
const PASSWORD = 'Passw0rdOk';
const settle = () => new Promise((r) => setTimeout(r, 300));

beforeEach(async () => {
  await redis.flushall();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
  jest.spyOn(logger, 'info').mockImplementation(() => undefined);
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

let n = 0;
const mk = (fields: Record<string, unknown> = {}) => {
  n += 1;
  return User.create({
    email: `t657-${n}@example.com`,
    name: 'Seed Person',
    password: PASSWORD,
    emailVerified: true,
    ...fields,
  });
};
const raw = async (id: unknown) =>
  (await rawUsers().findOne({ _id: new mongoose.Types.ObjectId(String(id)) }))!;
const rows = (id: unknown) =>
  ledger()
    .find({ userId: new mongoose.Types.ObjectId(String(id)), reason: 'free_seed' })
    .toArray();
const warnCalls = () => (logger.warn as unknown as jest.Mock).mock.calls;

/** Reject the next matching native-driver call once (collection name + method). */
function failOnce(method: 'insertOne' | 'findOneAndUpdate', collection: string, err?: Error) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proto = mongoose.mongo.Collection.prototype as any;
  const orig = proto[method];
  let used = false;
  const spy = jest.spyOn(proto, method).mockImplementation(function (this: any, ...args: any[]) {
    if (!used && this.collectionName === collection) {
      used = true;
      return Promise.reject(err ?? new Error('boom secret@example.com Seed Person'));
    }
    return orig.apply(this, args);
  });
  return spy;
}

/** marker set by THIS code implies the Ink landed. */
async function expectInvariant(id: unknown) {
  const d = await raw(id);
  if (d.signupBonusGrantedAt && d.freeSeedAt) expect(d.inkTopup).toBeGreaterThanOrEqual(10);
}

describe('T-657 exports', () => {
  it('FREE_SEED_UNITS is 10 and the ledger id is deterministic', () => {
    expect(bonus.FREE_SEED_UNITS).toBe(10);
    expect(bonus.freeSeedLedgerId('abc')).toBe('free_seed:abc');
  });

  it('(i) VERIFIED_FOR_BONUS is exported and deep-equal to the backfill script copy', () => {
    expect(bonus.VERIFIED_FOR_BONUS).toBeDefined();
    expect(backfill.VERIFIED_FOR_BONUS).toEqual(bonus.VERIFIED_FOR_BONUS);
    expect(backfill.FREE_SEED_UNITS).toBe(bonus.FREE_SEED_UNITS);
  });

  it('the happy path sets marker + freeSeedAt together with inkTopup 10 and one string-id row', async () => {
    const u = await mk();
    await grantSignupBonus(String(u._id));
    const d = await raw(u._id);
    expect(d.inkTopup).toBe(10);
    expect(d.signupBonusGrantedAt).toBeInstanceOf(Date);
    expect(d.freeSeedAt).toBeInstanceOf(Date);
    expect(d.inkSub).toBe(0);
    expect(d.inkAnnualCarry).toBe(0);
    expect(d.inkSubMonthlyAllotment).toBe(0);
    const r = await rows(u._id);
    expect(r).toHaveLength(1);
    expect(r[0]._id).toBe(`free_seed:${String(u._id)}`);
    expect(r[0]).toMatchObject({ delta: 10, sourceBucket: 'topup', balanceAfter: 10 });
    expect(d.earnedCredits ?? 0).toBe(0);
  });
});

describe('T-657 AC3 (a) the ledger insert fails once: user is granted, the next call heals the row', () => {
  it('fully granted, row missing; second call heals; third changes nothing', async () => {
    const u = await mk();
    const id = String(u._id);
    failOnce('insertOne', 'inkledger');

    await expect(grantSignupBonus(id)).resolves.toBeUndefined();
    const d1 = await raw(id);
    expect(d1.signupBonusGrantedAt).toBeInstanceOf(Date);
    expect(d1.freeSeedAt).toBeInstanceOf(Date);
    expect(d1.inkTopup).toBe(10);
    expect(await rows(id)).toHaveLength(0);
    await expectInvariant(id);

    await grantSignupBonus(id); // heal
    const r = await rows(id);
    expect(r).toHaveLength(1);
    expect(r[0]._id).toBe(`free_seed:${id}`);
    expect((await raw(id)).inkTopup).toBe(10);

    const before = await raw(id);
    await grantSignupBonus(id); // nothing to do
    expect(await raw(id)).toEqual(before);
    expect(await rows(id)).toHaveLength(1);
  });

  it('the failed insert is logged with userId and errName only', async () => {
    const u = await mk();
    failOnce('insertOne', 'inkledger');
    await grantSignupBonus(String(u._id));
    const calls = warnCalls();
    expect(calls).toHaveLength(1);
    expect(Object.keys(calls[0][0]).sort()).toEqual(['errName', 'userId']);
    expect(calls[0][0]).toEqual({ userId: String(u._id), errName: 'Error' });
    expect(JSON.stringify(calls)).not.toContain('secret@example.com');
    expect(JSON.stringify(calls)).not.toContain('Seed Person');
  });

  it('heal keeps the Ink the user has since gained (referral) and writes the row once', async () => {
    await makeCode({ code: 'T657HEAL', bonusInk: 3 });
    const u = await mk();
    const id = String(u._id);
    failOnce('insertOne', 'inkledger');
    await grantSignupBonus(id);
    await applyReferralCode(id, 'T657HEAL'); // +6 units, its own row
    await grantSignupBonus(id);
    const d = await raw(id);
    expect(d.inkTopup).toBe(16);
    expect(await rows(id)).toHaveLength(1);
  });
});

describe('T-657 AC3 (b) the pipeline update fails once: nothing is written, retry grants once', () => {
  it('marker stays null, no Ink, no row, no throw, userId+errName logged; retry grants 10 once', async () => {
    const u = await mk();
    const id = String(u._id);
    failOnce('findOneAndUpdate', 'users');

    await expect(grantSignupBonus(id)).resolves.toBeUndefined();
    const d1 = await raw(id);
    expect(d1.signupBonusGrantedAt ?? null).toBeNull();
    expect(d1.freeSeedAt).toBeUndefined();
    expect(d1.inkTopup).toBeUndefined();
    expect(await rows(id)).toHaveLength(0);
    await expectInvariant(id);

    const calls = warnCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toEqual({ userId: id, errName: 'Error' });
    expect(JSON.stringify(calls)).not.toContain('secret@example.com');

    await grantSignupBonus(id);
    const d2 = await raw(id);
    expect(d2.inkTopup).toBe(10);
    expect(d2.freeSeedAt).toBeInstanceOf(Date);
    expect(await rows(id)).toHaveLength(1);
    await expectInvariant(id);

    await grantSignupBonus(id);
    expect((await raw(id)).inkTopup).toBe(10);
    expect(await rows(id)).toHaveLength(1);
  });
});

describe('T-657 AC3 (c) parallel calls', () => {
  it('8 parallel calls on one verified user: exactly one +10 and exactly one row', async () => {
    const u = await mk();
    const id = String(u._id);
    await Promise.all(Array.from({ length: 8 }, () => grantSignupBonus(id)));
    expect((await raw(id)).inkTopup).toBe(10);
    expect(await rows(id)).toHaveLength(1);
    await expectInvariant(id);
  });

  it('8 parallel calls with a failure injected into the first row insert: 10 units, one row after a heal', async () => {
    const u = await mk();
    const id = String(u._id);
    failOnce('insertOne', 'inkledger');
    await Promise.all(Array.from({ length: 8 }, () => grantSignupBonus(id)));
    await grantSignupBonus(id); // a heal if the parallel losers did not already write it
    expect((await raw(id)).inkTopup).toBe(10);
    expect(await rows(id)).toHaveLength(1);
    await expectInvariant(id);
  });

  it('8 parallel calls with a failure injected into the first pipeline update: still 10 once', async () => {
    const u = await mk();
    const id = String(u._id);
    failOnce('findOneAndUpdate', 'users');
    await Promise.all(Array.from({ length: 8 }, () => grantSignupBonus(id)));
    await grantSignupBonus(id);
    expect((await raw(id)).inkTopup).toBe(10);
    expect(await rows(id)).toHaveLength(1);
  });
});

describe('T-657 AC3 (d) a marker set by OLD code is not healed', () => {
  it('marker set, no freeSeedAt, no Ink: no Ink, no row, nothing changes', async () => {
    const u = await mk();
    const stamp = new Date('2026-09-01T10:00:00Z');
    await rawUsers().updateOne({ _id: u._id }, { $set: { signupBonusGrantedAt: stamp } });
    await grantSignupBonus(String(u._id));
    await grantSignupBonus(String(u._id));
    const d = await raw(u._id);
    expect(d.inkTopup).toBeUndefined();
    expect(d.freeSeedAt).toBeUndefined();
    expect(d.signupBonusGrantedAt).toEqual(stamp);
    expect(await rows(u._id)).toHaveLength(0);
  });

  it('old marker WITH some Ink (topup) is also left alone', async () => {
    const u = await mk();
    await rawUsers().updateOne(
      { _id: u._id },
      { $set: { signupBonusGrantedAt: new Date('2026-09-01'), inkTopup: 4 } },
    );
    await grantSignupBonus(String(u._id));
    expect((await raw(u._id)).inkTopup).toBe(4);
    expect(await rows(u._id)).toHaveLength(0);
  });
});

describe('T-657 (e) E11000 on the row is success', () => {
  it('a pre-existing row free_seed:<id> stays as is; no warning; Ink granted once', async () => {
    const u = await mk();
    const id = String(u._id);
    await ledger().insertOne({
      _id: `free_seed:${id}` as unknown as mongoose.Types.ObjectId,
      userId: u._id,
      delta: 10,
      reason: 'free_seed',
      sourceBucket: 'topup',
      balanceAfter: 999,
      createdAt: new Date(),
    });
    await grantSignupBonus(id);
    const r = await rows(id);
    expect(r).toHaveLength(1);
    expect(r[0].balanceAfter).toBe(999); // untouched
    expect((await raw(id)).inkTopup).toBe(10);
    expect(warnCalls()).toHaveLength(0);
  });
});

describe('T-657 (f) referral Ink stays order-independent', () => {
  it.each(['seed first', 'referral first', 'parallel'])('%s', async (order) => {
    const code = `T657${order.length}`;
    await makeCode({ code, bonusInk: 3 });
    const u = await mk();
    const id = String(u._id);
    if (order === 'seed first') {
      await grantSignupBonus(id);
      await applyReferralCode(id, code);
    } else if (order === 'referral first') {
      await applyReferralCode(id, code);
      await grantSignupBonus(id);
    } else {
      await Promise.all([grantSignupBonus(id), applyReferralCode(id, code)]);
    }
    await grantSignupBonus(id);
    const d = await raw(id);
    expect(d.inkTopup).toBe(16);
    expect(await rows(id)).toHaveLength(1);
    expect(await ledger().countDocuments({ userId: u._id, reason: 'referral_bonus' })).toBe(1);
    expect(d.earnedCredits ?? 0).toBe(0);
  });
});

describe('T-657 (g) eligibility', () => {
  it('unverified password user: nothing, marker null, no freeSeedAt; after verification exactly 10 once', async () => {
    const u = await mk({ emailVerified: false });
    const id = String(u._id);
    await grantSignupBonus(id);
    const d = await raw(id);
    expect(d.signupBonusGrantedAt ?? null).toBeNull();
    expect(d.freeSeedAt).toBeUndefined();
    expect(d.inkTopup).toBeUndefined();
    expect(await rows(id)).toHaveLength(0);

    await rawUsers().updateOne({ _id: u._id }, { $set: { emailVerified: true } });
    await Promise.all([grantSignupBonus(id), grantSignupBonus(id)]);
    expect((await raw(id)).inkTopup).toBe(10);
    expect(await rows(id)).toHaveLength(1);
  });

  it('Google user and verified email user both get 10 and a row', async () => {
    const g = await mk({ emailVerified: false, authProvider: 'google', googleId: 'g-t657' });
    const e = await mk();
    await grantSignupBonus(String(g._id));
    await grantSignupBonus(String(e._id));
    for (const x of [g, e]) {
      expect((await raw(x._id)).inkTopup).toBe(10);
      expect(await rows(x._id)).toHaveLength(1);
    }
  });

  it('a marker explicitly null (legacy) is seeded once', async () => {
    const u = await mk();
    await rawUsers().updateOne({ _id: u._id }, { $set: { signupBonusGrantedAt: null } });
    await grantSignupBonus(String(u._id));
    await grantSignupBonus(String(u._id));
    expect((await raw(u._id)).inkTopup).toBe(10);
    expect(await rows(u._id)).toHaveLength(1);
  });

  it('invalid id and unknown user: no throw, no write', async () => {
    await expect(grantSignupBonus('not-an-id')).resolves.toBeUndefined();
    await expect(grantSignupBonus(String(new mongoose.Types.ObjectId()))).resolves.toBeUndefined();
    expect(await ledger().countDocuments({})).toBe(0);
  });
});

describe('T-657 (h) never throws, no PII in logs', () => {
  it('both writes rejecting: no throw; logs have no email or name', async () => {
    const u = await mk({ email: 'pii-t657@example.com', name: 'Pii Name T657' });
    const err = new Error('failed for pii-t657@example.com Pii Name T657');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proto = mongoose.mongo.Collection.prototype as any;
    jest.spyOn(proto, 'findOneAndUpdate').mockRejectedValue(err);
    jest.spyOn(proto, 'insertOne').mockRejectedValue(err);
    await expect(grantSignupBonus(String(u._id))).resolves.toBeUndefined();
    jest.restoreAllMocks();
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);

    // update ok, insert rejects, then heal read rejects
    const u2 = await mk({ email: 'pii2-t657@example.com', name: 'Pii Two T657' });
    const err2 = new Error('failed for pii2-t657@example.com Pii Two T657');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p2 = mongoose.mongo.Collection.prototype as any;
    jest.spyOn(p2, 'insertOne').mockRejectedValue(err2);
    await expect(grantSignupBonus(String(u2._id))).resolves.toBeUndefined();
    jest.spyOn(p2, 'findOne').mockRejectedValue(err2);
    await expect(grantSignupBonus(String(u2._id))).resolves.toBeUndefined();

    const text = JSON.stringify(warnCalls());
    expect(text).not.toContain('pii2-t657@example.com');
    expect(text).not.toContain('Pii Two T657');
    for (const c of warnCalls()) expect(Object.keys(c[0]).sort()).toEqual(['errName', 'userId']);
  });
});

describe('T-657 sign-in self-heal (item 4)', () => {
  const login = (email: string) =>
    supertest(app).post('/login').send({ email, password: PASSWORD });

  it('password login of a verified user with a null marker heals: 10 Ink + the row, no earnedCredits', async () => {
    const u = await mk();
    const res = await login(u.email);
    expect(res.status).toBe(200);
    await settle();
    const d = await raw(u._id);
    expect(d.inkTopup).toBe(10);
    expect(d.freeSeedAt).toBeInstanceOf(Date);
    expect(await rows(u._id)).toHaveLength(1);
    expect(d.earnedCredits ?? 0).toBe(0);
    expect(
      await mongoose.connection.db!.collection('creditledgers').countDocuments({ userId: u._id }),
    ).toBe(0);
    await login(u.email);
    await settle();
    expect((await raw(u._id)).inkTopup).toBe(10); // repeat sign-in adds nothing
    expect(await rows(u._id)).toHaveLength(1);
  });

  it('heals the row of a user whose insert failed earlier', async () => {
    const u = await mk();
    failOnce('insertOne', 'inkledger');
    await grantSignupBonus(String(u._id));
    expect(await rows(u._id)).toHaveLength(0);
    expect((await login(u.email)).status).toBe(200);
    await settle();
    expect(await rows(u._id)).toHaveLength(1);
    expect((await raw(u._id)).inkTopup).toBe(10);
  });

  it('never awaits it: a hanging grant does not delay the login response', async () => {
    const spy = jest
      .spyOn(bonus, 'grantSignupBonus')
      .mockImplementation(() => new Promise(() => {}));
    const u = await mk();
    const res = await Promise.race([
      login(u.email),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('login blocked on grantSignupBonus')), 5000),
      ),
    ]);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain('accessToken');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(String(u._id));
  });

  it('a rejecting grant never fails the sign-in and logs only errName', async () => {
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    jest
      .spyOn(bonus, 'grantSignupBonus')
      .mockRejectedValue(new Error('leak secret@example.com Seed Person'));
    const u = await mk();
    const res = await login(u.email);
    expect(res.status).toBe(200);
    await settle();
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    const calls = warnCalls().filter((c) => c[1] === 'Signup bonus failed');
    expect(calls).toHaveLength(1);
    expect(Object.keys(calls[0][0])).toEqual(['errName']);
    expect(JSON.stringify(warnCalls())).not.toContain('secret@example.com');
    expect(JSON.stringify(warnCalls())).not.toContain(String(u._id));
  });

  it('an unverified user never triggers it', async () => {
    const spy = jest.spyOn(bonus, 'grantSignupBonus');
    const u = await mk({ emailVerified: false });
    expect((await login(u.email)).status).toBe(200);
    await settle();
    expect(spy).not.toHaveBeenCalled();
    expect((await raw(u._id)).inkTopup).toBeUndefined();
  });

  it('a test account never triggers it (even verified, marker null)', async () => {
    const spy = jest.spyOn(bonus, 'grantSignupBonus');
    const u = await mk();
    await rawUsers().updateOne({ _id: u._id }, { $set: { isTestAccount: true } });
    expect((await login(u.email)).status).toBe(200);
    await settle();
    expect(spy).not.toHaveBeenCalled();
    const d = await raw(u._id);
    expect(d.inkTopup).toBeUndefined();
    expect(await rows(u._id)).toHaveLength(0);
  });

  it('a Google-provider user (password login) triggers it', async () => {
    const spy = jest.spyOn(bonus, 'grantSignupBonus');
    const u = await mk({ emailVerified: false, authProvider: 'google', googleId: 'g-t657-login' });
    expect((await login(u.email)).status).toBe(200);
    await settle();
    expect(spy).toHaveBeenCalledTimes(1);
    expect((await raw(u._id)).inkTopup).toBe(10);
  });

  it('a user marked by OLD code is not healed by signing in', async () => {
    const u = await mk();
    await rawUsers().updateOne(
      { _id: u._id },
      { $set: { signupBonusGrantedAt: new Date('2026-09-01') } },
    );
    expect((await login(u.email)).status).toBe(200);
    await settle();
    expect((await raw(u._id)).inkTopup).toBeUndefined();
    expect(await rows(u._id)).toHaveLength(0);
  });
});

describe('T-657 source hygiene', () => {
  it('the credit-bonus service writes only the raw users + inkledger collections for the seed', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'services', 'credit-bonus.service.ts'),
      'utf8',
    );
    const body = src.slice(src.indexOf('export async function grantSignupBonus'));
    const seedPart = body.slice(0, body.indexOf('/** T-563'));
    expect(seedPart).not.toContain('creditledger');
    expect(seedPart).not.toContain('earnedCredits');
  });
});

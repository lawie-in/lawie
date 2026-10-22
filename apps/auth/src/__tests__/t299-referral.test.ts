/**
 * T-299 riders from T-234 review:
 *  - the use-slot update re-checks expiresAt (a code that expires between validation and slot);
 *  - grantReferralInk is idempotent per user (referralInkGrantedAt marker in the same update as
 *    the $inc), and applyReferralCode keeps the referral when the Ink landed before a throw.
 */

import './setupEnv';

jest.mock('ioredis', () => jest.requireActual('ioredis-mock'));

import './setupDb';

import mongoose from 'mongoose';

import logger from '../config/logger';
import { ReferralCode } from '../models/ReferralCode.model';
import { User } from '../models/User.model';
import * as bonus from '../services/credit-bonus.service';
import { applyReferralCode } from '../services/referral.service';

import { ledger, makeCode, rawUsers } from './t234-helpers';

const BONUS = 3;
const INK = BONUS * 2; // inkTopup units for a bonusInk of 3

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
});
afterEach(() => jest.restoreAllMocks());

const mkUser = (email: string) =>
  User.create({ email, name: 'Secret Name', password: 'Passw0rdOk', emailVerified: true });
const inkOf = async (id: mongoose.Types.ObjectId) =>
  (await rawUsers().findOne({ _id: id }))!.inkTopup ?? 0;

describe('T-299 — expiresAt is re-checked at slot time', () => {
  it('a code that expires between validation and the slot update: invalid, rolled back, no Ink', async () => {
    await makeCode({
      code: 'EXP299A',
      bonusInk: BONUS,
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    const u = await mkUser('exp1@example.com');
    const real = ReferralCode.findOneAndUpdate.bind(ReferralCode);
    // validation has passed; the code expires before the slot update runs
    jest
      .spyOn(ReferralCode, 'findOneAndUpdate')
      .mockImplementation(((...args: unknown[]) =>
        ReferralCode.collection
          .updateOne({ code: 'EXP299A' }, { $set: { expiresAt: new Date(Date.now() - 1000) } })
          .then(() => (real as (...a: unknown[]) => unknown)(...args))) as never);
    const grant = jest.spyOn(bonus, 'grantReferralInk');

    expect(await applyReferralCode(String(u._id), 'EXP299A')).toBe('invalid');

    expect(grant).not.toHaveBeenCalled();
    expect((await ReferralCode.findOne({ code: 'EXP299A' }).lean())!.uses).toBe(0);
    expect((await User.findOne({ _id: u._id }).lean())!.referredVia ?? null).toBeNull();
    expect(await inkOf(u._id)).toBe(0);
    expect(await ledger().countDocuments({ userId: u._id, reason: 'referral_bonus' })).toBe(0);
  });

  it('an already-expired code is invalid at the first check and claims nothing', async () => {
    await makeCode({ code: 'EXP299B', expiresAt: new Date(Date.now() - 1000) });
    const u = await mkUser('exp2@example.com');
    expect(await applyReferralCode(String(u._id), 'EXP299B')).toBe('invalid');
    expect((await User.findOne({ _id: u._id }).lean())!.referredVia ?? null).toBeNull();
  });

  it('a code with no expiry (null) still takes its slot and grants', async () => {
    await makeCode({ code: 'EXP299C', bonusInk: BONUS, expiresAt: null });
    const u = await mkUser('exp3@example.com');
    expect(await applyReferralCode(String(u._id), 'EXP299C')).toBe('applied');
    expect((await ReferralCode.findOne({ code: 'EXP299C' }).lean())!.uses).toBe(1);
    expect(await inkOf(u._id)).toBe(INK);
  });

  it('a code with the expiresAt field missing entirely still takes its slot', async () => {
    await makeCode({ code: 'EXP299D', bonusInk: BONUS });
    await ReferralCode.collection.updateOne({ code: 'EXP299D' }, { $unset: { expiresAt: '' } });
    const u = await mkUser('exp4@example.com');
    expect(await applyReferralCode(String(u._id), 'EXP299D')).toBe('applied');
  });

  it('a code that expires in the future still works', async () => {
    await makeCode({
      code: 'EXP299E',
      bonusInk: BONUS,
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    const u = await mkUser('exp5@example.com');
    expect(await applyReferralCode(String(u._id), 'EXP299E')).toBe('applied');
  });
});

describe('T-299 — grantReferralInk is idempotent per user', () => {
  it('a second grant credits 0 and changes nothing', async () => {
    const u = await mkUser('idem1@example.com');
    expect(await bonus.grantReferralInk(String(u._id), BONUS, 'IDEM1')).toBe(INK);
    expect(await bonus.grantReferralInk(String(u._id), BONUS, 'IDEM1')).toBe(0);
    expect(await bonus.grantReferralInk(String(u._id), 9, 'OTHER')).toBe(0);
    expect(await inkOf(u._id)).toBe(INK);
    expect(await ledger().countDocuments({ userId: u._id, reason: 'referral_bonus' })).toBe(1);
  });

  it('sets the marker and the code in the same update as the $inc', async () => {
    const u = await mkUser('idem2@example.com');
    await bonus.grantReferralInk(String(u._id), BONUS, 'IDEM2');
    const raw = await rawUsers().findOne({ _id: u._id });
    expect(raw!.referralInkGrantedAt).toBeInstanceOf(Date);
    expect(raw!.referralInkCode).toBe('IDEM2');
    expect(raw!.inkTopup).toBe(INK);
    expect(raw!.freeTierBonusGrant).toBe(BONUS * 5);
  });

  it('two concurrent grants give exactly one $inc', async () => {
    const u = await mkUser('idem3@example.com');
    const results = await Promise.all([
      bonus.grantReferralInk(String(u._id), BONUS, 'IDEM3'),
      bonus.grantReferralInk(String(u._id), BONUS, 'IDEM3'),
      bonus.grantReferralInk(String(u._id), BONUS, 'IDEM3'),
    ]);
    expect(results.sort()).toEqual([0, 0, INK]);
    expect(await inkOf(u._id)).toBe(INK);
    expect(await ledger().countDocuments({ userId: u._id, reason: 'referral_bonus' })).toBe(1);
  });

  it('an unknown user or an invalid id credits nothing', async () => {
    expect(await bonus.grantReferralInk(String(new mongoose.Types.ObjectId()), BONUS, 'X')).toBe(0);
    expect(await bonus.grantReferralInk('not-an-id', BONUS, 'X')).toBe(0);
  });

  it('a ledger insert failure after the $inc: Ink stays credited, grant reports it, no retry, no PII in the log', async () => {
    const u = await mkUser('idem4@example.com');
    const db = mongoose.connection.db!;
    const realCollection = db.collection.bind(db);
    jest.spyOn(db, 'collection').mockImplementation(((name: string) =>
      name === 'inkledger'
        ? {
            insertOne: async () => {
              throw new Error('E11000 dup key idem4@example.com Secret Name');
            },
          }
        : realCollection(name)) as never);
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const spyConsole = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(await bonus.grantReferralInk(String(u._id), BONUS, 'IDEM4')).toBe(INK);

    expect(await inkOf(u._id)).toBe(INK);
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify([warn.mock.calls, spyConsole.mock.calls]);
    expect(logged).not.toContain('idem4@example.com');
    expect(logged).not.toContain('Secret Name');
    expect(Object.keys(warn.mock.calls[0][0] as object)).toEqual(['userId']);
    // a second call is a no-op: the ledger failure is never retried into a second $inc
    jest.restoreAllMocks();
    expect(await bonus.grantReferralInk(String(u._id), BONUS, 'IDEM4')).toBe(0);
    expect(await inkOf(u._id)).toBe(INK);
  });
});

describe('T-299 — applyReferralCode after a grant failure', () => {
  it('grant throws AFTER the $inc landed: applied, claim and slot kept, Ink credited once', async () => {
    await makeCode({ code: 'LAND299', bonusInk: BONUS, maxUses: 5 });
    const u = await mkUser('land1@example.com');
    const real = bonus.grantReferralInk;
    const spy = jest.spyOn(bonus, 'grantReferralInk').mockImplementation(async (...args) => {
      await real(...args); // the write lands ...
      throw new Error('connection reset secret@example.com'); // ... the reply is lost
    });
    const error = jest.spyOn(logger, 'error').mockImplementation(() => undefined);

    expect(await applyReferralCode(String(u._id), 'LAND299')).toBe('applied');

    expect(spy).toHaveBeenCalledTimes(1);
    expect(await inkOf(u._id)).toBe(INK);
    expect((await ReferralCode.findOne({ code: 'LAND299' }).lean())!.uses).toBe(1);
    const fresh = await User.findOne({ _id: u._id }).lean();
    expect(String(fresh!.referredVia)).toBe(
      String((await ReferralCode.findOne({ code: 'LAND299' }).lean())!._id),
    );
    expect(await ledger().countDocuments({ userId: u._id, reason: 'referral_bonus' })).toBe(1);
    // landing is not logged as an error and nothing leaks the error text
    expect(error).not.toHaveBeenCalled();
  });

  it('grant throws BEFORE the $inc: invalid, slot and claim rolled back, no Ink, no marker', async () => {
    await makeCode({ code: 'LAND299B', bonusInk: BONUS, maxUses: 5, uses: 2 });
    const u = await mkUser('land2@example.com');
    jest.spyOn(bonus, 'grantReferralInk').mockRejectedValue(new Error('boom'));
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);

    expect(await applyReferralCode(String(u._id), 'LAND299B')).toBe('invalid');

    expect(await inkOf(u._id)).toBe(0);
    const raw = await rawUsers().findOne({ _id: u._id });
    expect(raw!.referralInkGrantedAt ?? null).toBeNull();
    expect(raw!.referredVia ?? null).toBeNull();
    expect((await ReferralCode.findOne({ code: 'LAND299B' }).lean())!.uses).toBe(2);
  });

  it('cannot tell (the landed check also fails): rolls back', async () => {
    await makeCode({ code: 'LAND299C', bonusInk: BONUS });
    const u = await mkUser('land3@example.com');
    jest.spyOn(bonus, 'grantReferralInk').mockRejectedValue(new Error('boom'));
    jest.spyOn(bonus, 'referralInkLanded').mockRejectedValue(new Error('db down'));
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);

    expect(await applyReferralCode(String(u._id), 'LAND299C')).toBe('invalid');
    expect((await User.findOne({ _id: u._id }).lean())!.referredVia ?? null).toBeNull();
    expect((await ReferralCode.findOne({ code: 'LAND299C' }).lean())!.uses).toBe(0);
  });

  it('grant credits 0 because a marker for a different code exists: rolled back, no extra Ink', async () => {
    await makeCode({ code: 'LAND299D', bonusInk: BONUS });
    const u = await mkUser('land4@example.com');
    await rawUsers().updateOne(
      { _id: u._id },
      { $set: { referralInkGrantedAt: new Date(), referralInkCode: 'SOMEOTHER', inkTopup: 4 } },
    );
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);

    expect(await applyReferralCode(String(u._id), 'LAND299D')).toBe('invalid');
    expect(await inkOf(u._id)).toBe(4);
    expect((await User.findOne({ _id: u._id }).lean())!.referredVia ?? null).toBeNull();
    expect((await ReferralCode.findOne({ code: 'LAND299D' }).lean())!.uses).toBe(0);
  });

  it('referralInkLanded: false before a grant, true after it for the same code only', async () => {
    const u = await mkUser('land5@example.com');
    expect(await bonus.referralInkLanded(String(u._id), 'L5')).toBe(false);
    await bonus.grantReferralInk(String(u._id), BONUS, 'L5');
    expect(await bonus.referralInkLanded(String(u._id), 'L5')).toBe(true);
    expect(await bonus.referralInkLanded(String(u._id), 'OTHER')).toBe(false);
    expect(await bonus.referralInkLanded('not-an-id', 'L5')).toBe(false);
  });

  it('normal path: applied, one Ink credit, one ledger row, uses 1', async () => {
    await makeCode({ code: 'LAND299E', bonusInk: BONUS });
    const u = await mkUser('land6@example.com');
    expect(await applyReferralCode(String(u._id), 'LAND299E')).toBe('applied');
    expect(await inkOf(u._id)).toBe(INK);
    expect(await ledger().countDocuments({ userId: u._id, reason: 'referral_bonus' })).toBe(1);
    expect((await ReferralCode.findOne({ code: 'LAND299E' }).lean())!.uses).toBe(1);
  });
});

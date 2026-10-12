/**
 * T-234 review R1 (should-fix): if the Ink grant credits nothing or throws, applyReferralCode
 * rolls back the use slot and the claim and returns 'invalid' - the code is not consumed for
 * Ink the user never got, and the user is told the code is no longer valid.
 */

import './setupEnv';

jest.mock('ioredis', () => require('ioredis-mock'));

import './setupDb';

import supertest from 'supertest';

import app from '../app';
import logger from '../config/logger';
import { ReferralCode } from '../models/ReferralCode.model';
import { User } from '../models/User.model';
import * as bonus from '../services/credit-bonus.service';
import { applyReferralCode } from '../services/referral.service';

import { ledger, makeCode, rawUsers, verifyAndSeed } from './t234-helpers';

const PASSWORD = 'Passw0rdOk';
const BONUS = 3;

let errorSpy: jest.SpyInstance;

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
  errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const mkUser = (email: string) => User.create({ email, name: 'Secret Name', password: PASSWORD });

type Mode = 'returns 0' | 'throws';
const failGrant = (mode: Mode) => {
  const spy = jest.spyOn(bonus, 'grantReferralInk');
  if (mode === 'returns 0') spy.mockResolvedValue(0);
  else spy.mockRejectedValue(new Error('boom secret@example.com'));
  return spy;
};

describe.each<Mode>(['returns 0', 'throws'])('grantReferralInk %s', (mode) => {
  it('applyReferralCode: invalid, uses back, referredVia null, no referral ledger row', async () => {
    await makeCode({ code: 'RBACK1', bonusInk: BONUS, uses: 4, maxUses: 10 });
    const u = await mkUser(`rb1-${mode.replace(' ', '')}@example.com`);
    const spy = failGrant(mode);

    expect(await applyReferralCode(String(u._id), 'rback1')).toBe('invalid');
    expect(spy).toHaveBeenCalledTimes(1);

    expect((await ReferralCode.findOne({ code: 'RBACK1' }).lean())!.uses).toBe(4);
    expect((await User.findOne({ _id: u._id }).lean())!.referredVia ?? null).toBeNull();
    expect(await ledger().countDocuments({ userId: u._id, reason: 'referral_bonus' })).toBe(0);
  });

  it('logs only userId and referralCodeId (no email or name)', async () => {
    const rc = await makeCode({ code: 'RBACK2', bonusInk: BONUS });
    const u = await mkUser(`rb2-${mode.replace(' ', '')}@example.com`);
    failGrant(mode);

    await applyReferralCode(String(u._id), 'RBACK2');

    expect(errorSpy).toHaveBeenCalled();
    for (const call of errorSpy.mock.calls) {
      expect(Object.keys(call[0]).sort()).toEqual(['referralCodeId', 'userId']);
      expect(call[0].userId).toBe(String(u._id));
      expect(call[0].referralCodeId).toBe(String(rc._id));
      const text = JSON.stringify(call);
      expect(text).not.toContain('@example.com');
      expect(text).not.toContain('Secret Name');
    }
  });

  it('register: 201 referralApplied false, only the seed Ink, uses unchanged', async () => {
    await makeCode({ code: 'RBACK3', bonusInk: BONUS });
    failGrant(mode);
    const res = await supertest(app)
      .post('/register')
      .send({
        email: `rb3-${mode.replace(' ', '')}@example.com`,
        password: PASSWORD,
        name: 'Ref Person',
        referralCode: 'RBACK3',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.referralApplied).toBe(false);

    const u = await User.findOne({ email: `rb3-${mode.replace(' ', '')}@example.com` }).lean();
    await verifyAndSeed(u!._id);
    expect((await rawUsers().findOne({ _id: u!._id }))!.inkTopup).toBe(10);
    expect(await ledger().countDocuments({ userId: u!._id })).toBe(1);
    expect(await ledger().countDocuments({ userId: u!._id, reason: 'referral_bonus' })).toBe(0);
    expect(u!.referredVia ?? null).toBeNull();
    expect((await ReferralCode.findOne({ code: 'RBACK3' }).lean())!.uses).toBe(0);
  });

  it('the code is reusable afterwards (slot freed): a later user with a working grant gets it', async () => {
    await makeCode({ code: 'RBACK4', bonusInk: BONUS, maxUses: 1 });
    const a = await mkUser(`rb4a-${mode.replace(' ', '')}@example.com`);
    failGrant(mode);
    expect(await applyReferralCode(String(a._id), 'RBACK4')).toBe('invalid');
    jest.restoreAllMocks();
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
    const b = await mkUser(`rb4b-${mode.replace(' ', '')}@example.com`);
    expect(await applyReferralCode(String(b._id), 'RBACK4')).toBe('applied');
    expect((await ReferralCode.findOne({ code: 'RBACK4' }).lean())!.uses).toBe(1);
  });
});

describe('rollback never makes uses negative', () => {
  it('uses already 0 (e.g. reset by an admin mid-flight): stays 0, user claim still released', async () => {
    await makeCode({ code: 'RBACK5', bonusInk: BONUS });
    const u = await mkUser('rb5@example.com');
    jest.spyOn(bonus, 'grantReferralInk').mockImplementation(async () => {
      // the slot was taken (uses 1); something zeroes it before the rollback runs
      await ReferralCode.updateOne({ code: 'RBACK5' }, { $set: { uses: 0 } });
      return 0;
    });
    expect(await applyReferralCode(String(u._id), 'RBACK5')).toBe('invalid');
    expect((await ReferralCode.findOne({ code: 'RBACK5' }).lean())!.uses).toBe(0);
    expect((await User.findOne({ _id: u._id }).lean())!.referredVia ?? null).toBeNull();
  });

  it('refused slot (used up since validation) does not decrement uses', async () => {
    await makeCode({ code: 'RBACK6', bonusInk: BONUS, maxUses: 1, uses: 0 });
    const u = await mkUser('rb6@example.com');
    const real = ReferralCode.findOneAndUpdate.bind(ReferralCode);
    // another sign-up takes the last slot between validation and this call's slot update
    jest.spyOn(ReferralCode, 'findOneAndUpdate').mockImplementation(((...args: unknown[]) => {
      return ReferralCode.collection
        .updateOne({ code: 'RBACK6' }, { $set: { uses: 1 } })
        .then(() => (real as (...a: unknown[]) => unknown)(...args));
    }) as never);
    const grant = jest.spyOn(bonus, 'grantReferralInk');
    expect(await applyReferralCode(String(u._id), 'RBACK6')).toBe('invalid');
    expect(grant).not.toHaveBeenCalled();
    expect((await ReferralCode.findOne({ code: 'RBACK6' }).lean())!.uses).toBe(1);
    expect((await User.findOne({ _id: u._id }).lean())!.referredVia ?? null).toBeNull();
  });

  it('repeated failed applications never push uses below 0', async () => {
    await makeCode({ code: 'RBACK7', bonusInk: BONUS });
    failGrant('returns 0');
    for (let i = 0; i < 3; i++) {
      const u = await mkUser(`rb7-${i}@example.com`);
      expect(await applyReferralCode(String(u._id), 'RBACK7')).toBe('invalid');
    }
    expect((await ReferralCode.findOne({ code: 'RBACK7' }).lean())!.uses).toBe(0);
  });
});

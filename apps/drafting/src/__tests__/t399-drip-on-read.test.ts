/**
 * T-399: getCreditBalance and holdInk first settle the yearly Ink drip.
 * Best effort (a throwing settle never blocks the read or the hold) and never
 * for the golden-set fixture user (T-147e: no inkledger rows for it).
 *
 * The drip arithmetic itself is tested in apps/billing t399-yearly-drip.test.ts;
 * here the real settleYearlyDrip runs against a user who is behind (real clock).
 */
import './setupDb';
import mongoose from 'mongoose';

import { User } from '../models/User.model';
import { createVerifiedUser } from './verifiedUser';
import { getCreditBalance, holdInk } from '../services/credits.service';
import { GOLDEN_SET_USER_ID } from '../services/run-origin';

jest.mock('@lawie/shared', () => {
  const actual = jest.requireActual('@lawie/shared');
  const settle = jest.fn(actual.settleYearlyDrip);
  return { ...actual, settleYearlyDrip: settle, __realSettle: actual.settleYearlyDrip };
});
// eslint-disable-next-line @typescript-eslint/no-var-requires
const shared = require('@lawie/shared');
const mockSettle = shared.settleYearlyDrip as jest.Mock;

const USER_ID = '507f1f77bcf86cd7994392c9';
const OID = new mongoose.Types.ObjectId(USER_ID);
const DAY = 86_400_000;
const db = () => mongoose.connection.db!;
const rows = (userId: mongoose.Types.ObjectId | string) =>
  db()
    .collection('inkledger')
    .find({ userId: typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId })
    .toArray();

/** A yearly user one drip behind: nextAt two days ago, paid through next year. */
async function seedBehind(id = OID) {
  await createVerifiedUser({
    _id: id,
    plan: 'pro',
    planTier: 'solo',
    billingCycle: 'yearly',
    inkSub: 10,
    inkAnnualCarry: 0,
    inkTopup: 0,
    inkSubMonthlyAllotment: 100,
  });
  await db()
    .collection('subscriptions')
    .insertOne({
      userId: id,
      razorpaySubscriptionId: 'sub_drafting_t399',
      status: 'active',
      billingCycle: 'yearly',
      planId: 'solo_yearly',
      paidThrough: new Date(Date.now() + 200 * DAY),
      inkDripNextAt: new Date(Date.now() - 2 * DAY),
      inkDripCount: 0,
      lastGrantedPaidCount: 1,
      createdAt: new Date(),
    });
}

afterEach(() => {
  jest.restoreAllMocks();
  mockSettle.mockReset();
  mockSettle.mockImplementation(shared.__realSettle);
});

describe('T-399: drip on read (drafting)', () => {
  it('getCreditBalance grants the due month before reading', async () => {
    await seedBehind();
    const bal = await getCreditBalance(USER_ID);
    expect(bal.inkSub).toBe(50); // 100 units back to the allotment, shown as 50 Ink
    const r = await rows(OID);
    expect(r).toHaveLength(1);
    expect(r[0].reason).toBe('sub_drip');
    expect(r[0].reference).toBe('sub_drip:sub_drafting_t399:1:1');
    // A second read grants nothing more.
    await getCreditBalance(USER_ID);
    expect(await rows(OID)).toHaveLength(1);
  });

  it('holdInk grants the due month before judging the hold', async () => {
    await seedBehind();
    // 10 units left; a 30-Ink hold (60 units) only succeeds if the drip landed first.
    const res = await holdInk({
      userId: USER_ID,
      costCredits: 30,
      runId: 'run-t399',
      runSequence: 1,
    });
    expect(res.ok).toBe(true);
    const u = await User.findById(USER_ID).lean();
    expect(u!.inkSub).toBe(100 - 60);
    expect((await rows(OID)).map((x) => x.reason)).toEqual(['sub_drip']);
  });

  it('the fixture user is skipped: settle is not called and no inkledger row is written', async () => {
    const fixtureOid = new mongoose.Types.ObjectId(GOLDEN_SET_USER_ID);
    await seedBehind(fixtureOid);
    await getCreditBalance(GOLDEN_SET_USER_ID);
    const hold = await holdInk({
      userId: GOLDEN_SET_USER_ID,
      costCredits: 1,
      runId: 'run-fx',
      runSequence: 1,
    });
    expect(hold).toEqual({ ok: true, fixture: true });
    expect(mockSettle).not.toHaveBeenCalled();
    expect(await rows(fixtureOid)).toHaveLength(0);
    expect(await db().collection('inkledger').countDocuments({})).toBe(0);
  });

  it('a throwing settle does not block getCreditBalance or holdInk, and logs the class only', async () => {
    await createVerifiedUser({ _id: USER_ID, plan: 'free', inkSub: 0, inkTopup: 20 });
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    class Boom extends Error {
      constructor() {
        super('driver text test@test.com');
        this.name = 'Boom';
      }
    }
    mockSettle.mockRejectedValue(new Boom());

    const bal = await getCreditBalance(USER_ID);
    expect(bal.inkTopup).toBe(10); // 20 units shown as 10 Ink
    const res = await holdInk({
      userId: USER_ID,
      costCredits: 1,
      runId: 'run-boom',
      runSequence: 1,
    });
    expect(res.ok).toBe(true);

    expect(mockSettle).toHaveBeenCalledTimes(2);
    const out = err.mock.calls.flat().map(String).join(' ');
    expect(out).toContain('settleYearlyDrip failed');
    expect(out).toContain('Boom');
    expect(out).not.toContain('test@test.com');
    expect(out).not.toContain('driver text');
  });
});

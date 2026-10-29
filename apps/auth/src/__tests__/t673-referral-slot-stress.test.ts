/**
 * T-673: stress test for the last-slot contention behind the flaky T-298 test
 * ("maxUses 1, five concurrent sign-ups"). Five claims race for one use slot; across many fresh
 * iterations exactly one may win, so `uses` is exactly 1 (never 0, never more than 1).
 *
 * Users are created directly and the claims run through the service (no HTTP route, no bcrypt),
 * so 50 iterations stay fast. The background variant mirrors registerUser, which fires
 * applyReferralCode(..., { deferInk: true }) without awaiting and so returns before the claim lands.
 */

import './setupEnv';

jest.mock('ioredis', () => jest.requireActual('ioredis-mock'));

import './setupDb';

import { ReferralCode } from '../models/ReferralCode.model';
import { User } from '../models/User.model';
import { applyReferralCode } from '../services/referral.service';

import redis from '../config/redis';

import { ledger, makeCode, rawUsers, waitForReferralDecision } from './t234-helpers';

const ITERATIONS = 50;
const CLAIMERS = 5;

beforeEach(async () => {
  await redis.flushall();
  // signalDraftingBonus calls the drafting service over HTTP; never hit the network.
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
});

// insertMany skips the pre-save bcrypt hook (cost 12, ~250 ms a user); the claim never reads a
// password, so these users have none. Schema defaults (referredVia: null) still apply.
async function mkUsers(tag: string) {
  return User.insertMany(
    Array.from({ length: CLAIMERS }, (_, i) => ({
      email: `${tag}-${i}@example.com`,
      name: 'U',
      role: 'Lawyer',
      emailVerified: true,
    })),
  );
}

async function expectOneWinner(codeValue: string, userIds: unknown[]) {
  const code = await ReferralCode.findOne({ code: codeValue }).lean();
  expect(code!.uses).toBe(1);

  const raws = await Promise.all(
    userIds.map((id) => rawUsers().findOne({ _id: id as import('mongoose').Types.ObjectId })),
  );
  const statuses = raws.map((r) => r!['referralStatus']);
  expect(statuses.filter((s) => s === 'applied')).toHaveLength(1);
  expect(statuses.filter((s) => s === 'not_applied')).toHaveLength(CLAIMERS - 1);

  const referred = raws.filter((r) => r!['referredVia']);
  expect(referred).toHaveLength(1);
  expect(String(referred[0]!['referredVia'])).toBe(String(code!._id));
  expect(referred[0]!['referralStatus']).toBe('applied');
}

describe('T-673 — maxUses 1, five concurrent claims: exactly one wins', () => {
  it(`background claims (deferInk, as registerUser fires them), ${ITERATIONS} iterations`, async () => {
    for (let n = 0; n < ITERATIONS; n++) {
      const codeValue = `BGSLOT${n}`;
      await makeCode({ code: codeValue, bonusInk: 3, maxUses: 1 });
      const users = await mkUsers(`bg${n}`);
      // fire and forget, like registerUser; only the referral decision tells us the claim landed
      for (const u of users) {
        void applyReferralCode(u._id.toString(), codeValue, { deferInk: true }).catch(() => {});
      }
      for (const u of users) await waitForReferralDecision(u._id);
      await expectOneWinner(
        codeValue,
        users.map((u) => u._id),
      );
    }
  }, 55000);

  it(`awaited claims with immediate Ink grant, ${ITERATIONS} iterations`, async () => {
    for (let n = 0; n < ITERATIONS; n++) {
      const codeValue = `AWSLOT${n}`;
      await makeCode({ code: codeValue, bonusInk: 3, maxUses: 1 });
      const users = await mkUsers(`aw${n}`);
      const results = await Promise.all(
        users.map((u) => applyReferralCode(u._id.toString(), codeValue)),
      );
      expect(results.filter((r) => r === 'applied')).toHaveLength(1);
      expect(results.filter((r) => r === 'invalid')).toHaveLength(CLAIMERS - 1);
      await expectOneWinner(
        codeValue,
        users.map((u) => u._id),
      );
      // the single slot pays out the referral Ink exactly once
      expect(
        await ledger().countDocuments({ reason: 'referral_bonus', reference: codeValue }),
      ).toBe(1);
    }
  }, 55000);
});

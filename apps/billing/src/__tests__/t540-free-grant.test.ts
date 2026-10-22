/**
 * T-540: the 0 rupee path (a 100% coupon), Vikram's option (a), behind the AppSettings switch
 * `feature.coupon_free_grant` (default off, fails closed).
 *
 * - switch off: a 0 quote is 409 coupon_invalid and nothing is granted;
 * - switch on: { status: 'granted', grant } with no `data`, the ledger row, CouponUsage, inkTopup,
 *   uses, the no-PII info log;
 * - atomic counting at the grant: concurrent grants for the last use, the per-user limit under
 *   concurrency, rollback after each failing step, the stale-claim re-claim after 120 s;
 * - the switch reader: env fallback, DB error = off, malformed = off, 60 s cache.
 *
 * Razorpay is mocked. Ids are built at runtime (no literals for gitleaks to flag).
 */
import './setupDb';
import { CURRENT_PRIVACY_VERSION } from '@lawie/shared';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../app';
import { env } from '../config/env';
import logger from '../config/logger';
import { AppSetting } from '../models/AppSetting.model';
import { CouponCode } from '../models/CouponCode.model';
import { CouponUsage } from '../models/CouponUsage.model';
import { User } from '../models/User.model';
import {
  COUPON_FREE_GRANT_SETTING,
  clearAppSettingsCache,
  isCouponFreeGrantEnabled,
} from '../services/app-settings.service';
import {
  COUPON_CLAIM_STALE_MS,
  couponGrantKey,
  grantCouponInk,
} from '../services/ink-ledger.service';
import { QUOTE_REASONS } from '../services/topup-quote.service';

jest.mock('../config/razorpay', () => ({
  razorpay: {
    subscriptions: { create: jest.fn(), fetch: jest.fn(), cancel: jest.fn() },
    orders: { create: jest.fn() },
  },
}));

import { razorpay } from '../config/razorpay';

const actualShared = jest.requireActual('@lawie/shared') as {
  INTERNAL_HEADERS: Record<string, string>;
};
const ordersCreate = (razorpay as unknown as { orders: { create: jest.Mock } }).orders.create;
const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const H = actualShared.INTERNAL_HEADERS;

const oid = () => new mongoose.Types.ObjectId();
const ledger = () => mongoose.connection.db!.collection('inkledger');
const envMut = env as { FEATURE_DEFAULT_COUPON_FREE_GRANT?: string };

function headersFor(userId: string) {
  return {
    [H.SECRET]: INTERNAL_SECRET,
    [H.USER_ID]: userId,
    [H.USER_EMAIL]: 'grantee@test.com',
    [H.USER_NAME]: 'Grantee',
    [H.USER_PLAN]: 'free',
    [H.USER_ROLE]: 'Client',
    'x-user-privacy-version': CURRENT_PRIVACY_VERSION,
  };
}

async function seedUser(extra: Record<string, unknown> = {}): Promise<string> {
  const u = await User.create({
    email: `g${oid().toString()}@test.com`,
    emailVerified: true,
    ...extra,
  });
  return u._id.toString();
}

async function freeCoupon(over: Record<string, unknown> = {}) {
  return CouponCode.create({
    code: 'FREE100',
    label: 'Free pack',
    discountType: 'percent',
    discountValue: 100,
    maxUses: 10,
    maxUsesPerUser: 1,
    ...over,
  });
}

async function switchOn(): Promise<void> {
  await AppSetting.create({ key: COUPON_FREE_GRANT_SETTING, value: 'true' });
  clearAppSettingsCache();
}

const order = (userId: string, body: Record<string, unknown> = {}) =>
  request(app)
    .post('/topup/order')
    .set(headersFor(userId))
    .send({ skuId: 'topup_mid', couponCode: 'FREE100', ...body });

const inkOf = async (userId: string) => (await User.findById(userId).lean())!.inkTopup ?? 0;
const usesOf = async (id: unknown) => (await CouponCode.findById(id).lean())!.uses;

/** Every log argument from info/warn/error/debug, as one string, for the no-PII canaries. */
function spyLogs() {
  const spies = (['info', 'warn', 'error', 'debug'] as const).map((l) => jest.spyOn(logger, l));
  return {
    info: spies[0],
    warn: spies[1],
    error: spies[2],
    all: () => JSON.stringify(spies.flatMap((s) => s.mock.calls)),
  };
}

beforeAll(async () => {
  await CouponCode.init();
});

beforeEach(() => {
  clearAppSettingsCache();
  delete envMut.FEATURE_DEFAULT_COUPON_FREE_GRANT;
  ordersCreate.mockReset();
  ordersCreate.mockResolvedValue({ id: 'order_t540_unexpected' });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('T-540 free grant: switch off (the default)', () => {
  it('a 0 quote is 409 coupon_invalid with the fixed reason, and nothing is granted', async () => {
    const userId = await seedUser();
    const c = await freeCoupon();
    const res = await order(userId);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'coupon_invalid',
      reason: 'This coupon cannot be applied to this item',
    });
    expect(await inkOf(userId)).toBe(0);
    expect(await ledger().countDocuments({})).toBe(0);
    expect(await CouponUsage.countDocuments()).toBe(0);
    expect(await usesOf(c._id)).toBe(0);
    expect(ordersCreate).not.toHaveBeenCalled();
  });

  it('validate shows the same refusal, so the web never displays a 0 total', async () => {
    await freeCoupon();
    const res = await request(app).get('/validate-coupon/FREE100?skuId=topup_mid');
    expect(res.body).toEqual({ valid: false, reason: QUOTE_REASONS.cannotApply });
  });

  it('the switch set to anything but true/on is still off', async () => {
    const userId = await seedUser();
    await freeCoupon();
    await AppSetting.create({ key: COUPON_FREE_GRANT_SETTING, value: 'false' });
    expect((await order(userId)).status).toBe(409);
    expect(await ledger().countDocuments({})).toBe(0);
  });

  it('a partial coupon is unaffected by the switch', async () => {
    const userId = await seedUser();
    await freeCoupon({ code: 'HALF', discountValue: 50 });
    const res = await order(userId, { couponCode: 'HALF' });
    expect(res.status).toBe(200);
    expect(res.body.data.amountPaise).toBe(9900);
  });
});

describe('T-540 free grant: switch on', () => {
  it('returns granted with the grant and NO data, and creates no Razorpay order', async () => {
    const userId = await seedUser();
    const c = await freeCoupon();
    await switchOn();
    const res = await order(userId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'granted',
      grant: {
        ink: 10,
        couponCode: 'FREE100',
        ledgerKey: `coupon:${c._id.toString()}:${userId}:1`,
      },
    });
    expect(res.body).not.toHaveProperty('data');
    expect(ordersCreate).not.toHaveBeenCalled();
  });

  it('writes the ledger row: reason coupon_grant, key format, metadata without amountInr', async () => {
    const userId = await seedUser({ inkTopup: 4 });
    const c = await freeCoupon();
    await switchOn();
    const res = await order(userId);
    const key = `coupon:${c._id.toString()}:${userId}:1`;
    expect(res.body.grant.ledgerKey).toBe(key);
    expect(couponGrantKey(c._id.toString(), userId, 1)).toBe(key);

    const rows = await ledger().find({}).toArray();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row._id).toBe(key);
    expect(row).toMatchObject({
      reason: 'coupon_grant',
      sourceBucket: 'topup',
      delta: 20,
      reference: key,
      state: 'granted',
      balanceAfter: 24,
    });
    expect(String(row.userId)).toBe(userId);
    expect(row.reason).not.toBe('topup_purchase');
    expect(row.metadata).toEqual({
      couponId: c._id.toString(),
      couponCode: 'FREE100',
      skuId: 'topup_mid',
      listPaise: 19900,
      provider: 'coupon',
    });
    expect(row.metadata).not.toHaveProperty('amountInr');
    expect(row.metadata).not.toHaveProperty('razorpayPaymentId');
  });

  it('writes CouponUsage with orderId = the ledger key, increments inkTopup and uses', async () => {
    const userId = await seedUser({ inkTopup: 4 });
    const c = await freeCoupon({ uses: 2 });
    await switchOn();
    const res = await order(userId);
    const usage = await CouponUsage.find({ couponId: c._id }).lean();
    expect(usage).toHaveLength(1);
    expect(usage[0].orderId).toBe(res.body.grant.ledgerKey);
    expect(String(usage[0].userId)).toBe(userId);
    expect(await inkOf(userId)).toBe(24); // 4 + 10 Ink x 2 units
    expect(await usesOf(c._id)).toBe(3);
  });

  it.each([
    ['topup_mini', 3, 6, 6500],
    ['topup_mid', 10, 20, 19900],
    ['topup_max', 28, 56, 49900],
  ])(
    '%s: grants %i Ink (%i units) and logs list value %i paise',
    async (skuId, ink, units, list) => {
      const userId = await seedUser();
      await freeCoupon();
      await switchOn();
      const logs = spyLogs();
      const res = await order(userId, { skuId });
      expect(res.body.grant.ink).toBe(ink);
      expect(await inkOf(userId)).toBe(units);
      const call = logs.info.mock.calls.find((c) => c[1] === 'coupon free grant');
      expect(call![0]).toEqual({ couponCode: 'FREE100', skuId, listPaise: list, n: 1 });
    },
  );

  it('a fixed coupon of at least the price is free too', async () => {
    const userId = await seedUser();
    await freeCoupon({ code: 'FIXFREE', discountType: 'fixed', discountValue: 500 });
    await switchOn();
    const res = await order(userId, { couponCode: 'FIXFREE', skuId: 'topup_max' });
    expect(res.body.status).toBe('granted');
    expect(await inkOf(userId)).toBe(56);
  });

  it('validate shows 0 paise with the switch on, matching the granted order', async () => {
    const userId = await seedUser();
    await freeCoupon();
    await switchOn();
    const v = await request(app)
      .get('/validate-coupon/FREE100?skuId=topup_mid')
      .set(headersFor(userId));
    expect(v.body).toMatchObject({
      valid: true,
      finalPaise: 0,
      amountPaise: 0,
      finalPriceInr: 0,
      discountPaise: 19900,
      originalPaise: 19900,
    });
    const o = await order(userId, { expectedAmountPaise: v.body.amountPaise });
    expect(o.body.status).toBe('granted');
  });

  it('a stale expectedAmountPaise on a free quote is price_changed, and nothing is granted', async () => {
    const userId = await seedUser();
    await freeCoupon();
    await switchOn();
    const res = await order(userId, { expectedAmountPaise: 100 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('price_changed');
    expect(res.body.quote.finalPaise).toBe(0);
    expect(await inkOf(userId)).toBe(0);
    expect(await CouponUsage.countDocuments()).toBe(0);
  });

  it('the key advances with each use (n) and the per-user limit then refuses', async () => {
    const userId = await seedUser();
    const c = await freeCoupon({ maxUsesPerUser: 3 });
    await switchOn();
    const keys: string[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await order(userId);
      expect(res.status).toBe(200);
      keys.push(res.body.grant.ledgerKey);
    }
    expect(keys).toEqual([1, 2, 3].map((n) => `coupon:${c._id.toString()}:${userId}:${n}`));
    const fourth = await order(userId);
    expect(fourth.status).toBe(409);
    expect(fourth.body).toEqual({ error: 'coupon_invalid', reason: QUOTE_REASONS.perUser });
    expect(await inkOf(userId)).toBe(60);
    expect(await usesOf(c._id)).toBe(3);
  });

  it('turning the switch off again stops grants once the cache is dropped', async () => {
    const userId = await seedUser();
    await freeCoupon({ maxUsesPerUser: 5 });
    await switchOn();
    expect((await order(userId)).status).toBe(200);
    await AppSetting.updateOne({ key: COUPON_FREE_GRANT_SETTING }, { value: 'false' });
    clearAppSettingsCache();
    expect((await order(userId)).status).toBe(409);
    expect(await inkOf(userId)).toBe(20);
  });

  it('the env fallback turns it on only when the key is missing and the value is exactly "true"', async () => {
    const userId = await seedUser();
    await freeCoupon({ maxUsesPerUser: 5 });
    envMut.FEATURE_DEFAULT_COUPON_FREE_GRANT = 'true';
    expect((await order(userId)).status).toBe(200);
    envMut.FEATURE_DEFAULT_COUPON_FREE_GRANT = 'TRUE';
    expect((await order(userId)).status).toBe(409);
  });

  it('a database value beats the env fallback', async () => {
    const userId = await seedUser();
    await freeCoupon();
    envMut.FEATURE_DEFAULT_COUPON_FREE_GRANT = 'true';
    await AppSetting.create({ key: COUPON_FREE_GRANT_SETTING, value: 'off' });
    expect((await order(userId)).status).toBe(409);
  });

  it('a switch read error is off: 409, and nothing is granted even with the env set to true', async () => {
    const userId = await seedUser();
    await freeCoupon();
    envMut.FEATURE_DEFAULT_COUPON_FREE_GRANT = 'true';
    jest.spyOn(AppSetting, 'findOne').mockImplementation(() => {
      throw new Error('db down');
    });
    const res = await order(userId);
    expect(res.status).toBe(409);
    expect(res.body.reason).toBe(QUOTE_REASONS.cannotApply);
    expect(await ledger().countDocuments({})).toBe(0);
  });

  describe('logs carry no personal data', () => {
    it('the success path: no userId, ledger key, email or name in any log line', async () => {
      const userId = await seedUser();
      await freeCoupon();
      await switchOn();
      const logs = spyLogs();
      const res = await order(userId);
      const text = logs.all();
      expect(text).toContain('coupon free grant');
      expect(text).not.toContain(userId);
      expect(text).not.toContain(res.body.grant.ledgerKey);
      expect(text).not.toContain('grantee@test.com');
      expect(text).not.toContain('Grantee');
      const call = logs.info.mock.calls.find((c) => c[1] === 'coupon free grant')!;
      expect(Object.keys(call[0] as object).sort()).toEqual([
        'couponCode',
        'listPaise',
        'n',
        'skuId',
      ]);
    });

    it('lost-race and refusal paths log no userId or key either', async () => {
      const users = await Promise.all([seedUser(), seedUser(), seedUser()]);
      await freeCoupon({ maxUses: 1 });
      await switchOn();
      const logs = spyLogs();
      await Promise.all(users.map((u) => order(u)));
      const text = logs.all();
      for (const u of users) expect(text).not.toContain(u);
      expect(text).not.toContain('coupon:');
    });
  });
});

describe('T-540 free grant: atomic counting', () => {
  it('concurrent grants for the last use: exactly one wins, the rest 409, no over-grant', async () => {
    const users = await Promise.all(Array.from({ length: 6 }, () => seedUser()));
    const c = await freeCoupon({ maxUses: 1 });
    await switchOn();

    const results = await Promise.all(users.map((u) => order(u)));
    const won = results.filter((r) => r.status === 200);
    const lost = results.filter((r) => r.status === 409);
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(5);
    for (const r of lost) expect(r.body.error).toBe('coupon_invalid');
    expect(won[0].body.status).toBe('granted');

    expect(await usesOf(c._id)).toBe(1);
    expect(await CouponUsage.countDocuments({ couponId: c._id })).toBe(1);
    expect(await ledger().countDocuments({ reason: 'coupon_grant' })).toBe(1);
    const inks = await Promise.all(users.map(inkOf));
    expect(inks.reduce((a, b) => a + b, 0)).toBe(20);
    expect(ordersCreate).not.toHaveBeenCalled();
  });

  it('concurrent grants with 3 uses left among 8 buyers: exactly 3 win, counts agree', async () => {
    const users = await Promise.all(Array.from({ length: 8 }, () => seedUser()));
    const c = await freeCoupon({ maxUses: 3 });
    await switchOn();
    const results = await Promise.all(users.map((u) => order(u)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(3);
    expect(results.filter((r) => r.status === 409)).toHaveLength(5);
    expect(await usesOf(c._id)).toBe(3);
    expect(await CouponUsage.countDocuments({ couponId: c._id })).toBe(3);
    expect(await ledger().countDocuments({ reason: 'coupon_grant', state: 'granted' })).toBe(3);
    expect(await ledger().countDocuments({})).toBe(3); // the losers' claims were rolled back
    const inks = await Promise.all(users.map(inkOf));
    expect(inks.reduce((a, b) => a + b, 0)).toBe(60);
  });

  it('the per-user limit holds under concurrency: one user, five parallel orders, one grant', async () => {
    const userId = await seedUser();
    const c = await freeCoupon({ maxUses: 10, maxUsesPerUser: 1 });
    await switchOn();
    const results = await Promise.all(Array.from({ length: 5 }, () => order(userId)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    for (const r of results.filter((x) => x.status === 409)) {
      expect(r.body.error).toBe('coupon_invalid');
    }
    expect(await inkOf(userId)).toBe(20);
    expect(await usesOf(c._id)).toBe(1);
    expect(await CouponUsage.countDocuments({ couponId: c._id, userId })).toBe(1);
    expect(await ledger().countDocuments({ reason: 'coupon_grant' })).toBe(1);
  });

  it('a per-user limit of 2 under concurrency never grants more than 2, and every count agrees', async () => {
    const userId = await seedUser();
    const c = await freeCoupon({ maxUses: 10, maxUsesPerUser: 2 });
    await switchOn();
    const results = await Promise.all(Array.from({ length: 6 }, () => order(userId)));
    const granted = results.filter((r) => r.status === 200).length;
    expect(granted).toBeGreaterThanOrEqual(1);
    expect(granted).toBeLessThanOrEqual(2);
    expect(results.every((r) => r.status === 200 || r.status === 409)).toBe(true);
    expect(await inkOf(userId)).toBe(granted * 20);
    expect(await usesOf(c._id)).toBe(granted);
    expect(await CouponUsage.countDocuments({ couponId: c._id })).toBe(granted);
    expect(await ledger().countDocuments({ reason: 'coupon_grant', state: 'granted' })).toBe(
      granted,
    );
  });

  it('a 409 for a lost race is the usage-limit reason when the global count is what ran out', async () => {
    const userId = await seedUser();
    const c = await freeCoupon({ maxUses: 5 });
    await switchOn();
    // The quote saw a use left; the coupon runs out before the grant's compare-and-set.
    jest.spyOn(CouponCode, 'findOneAndUpdate').mockReturnValue({
      lean: () => Promise.resolve(null),
    } as never);
    const res = await order(userId);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'coupon_invalid', reason: QUOTE_REASONS.usedUp });
    expect(await inkOf(userId)).toBe(0);
    expect(await usesOf(c._id)).toBe(0);
    expect(await CouponUsage.countDocuments()).toBe(0);
    expect(await ledger().countDocuments({})).toBe(0);
  });
});

describe('T-540 free grant: rollback after each failing step', () => {
  const CANARY = 'PII_CANARY_do_not_log';

  async function setup() {
    const userId = await seedUser({ inkTopup: 2 });
    const c = await freeCoupon({ uses: 1, maxUses: 5 });
    await switchOn();
    return { userId, c };
  }

  async function expectUntouched(userId: string, c: { _id: unknown }) {
    expect(await usesOf(c._id)).toBe(1);
    expect(await CouponUsage.countDocuments()).toBe(0);
    expect(await ledger().countDocuments({})).toBe(0);
    expect(await inkOf(userId)).toBe(2);
  }

  async function retryWorks(userId: string, c: { _id: unknown }) {
    jest.restoreAllMocks();
    const again = await order(userId);
    expect(again.status).toBe(200);
    expect(again.body.grant.ledgerKey).toBe(`coupon:${String(c._id)}:${userId}:1`);
    expect(await usesOf(c._id)).toBe(2);
    expect(await inkOf(userId)).toBe(22);
  }

  it('step 2 throws (the uses compare-and-set): 500, claim row removed, nothing counted', async () => {
    const { userId, c } = await setup();
    const logs = spyLogs();
    jest.spyOn(CouponCode, 'findOneAndUpdate').mockImplementation(() => {
      throw new Error(CANARY);
    });
    const res = await order(userId);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to create top-up order' });
    await expectUntouched(userId, c);
    expect(logs.all()).not.toContain(CANARY);
    expect(logs.all()).not.toContain(userId);
    await retryWorks(userId, c);
  });

  it('step 3 fails (CouponUsage.create): uses put back, claim row removed, 500', async () => {
    const { userId, c } = await setup();
    const logs = spyLogs();
    jest.spyOn(CouponUsage, 'create').mockRejectedValue(new Error(CANARY) as never);
    const res = await order(userId);
    expect(res.status).toBe(500);
    await expectUntouched(userId, c);
    expect(logs.all()).not.toContain(CANARY);
    await retryWorks(userId, c);
  });

  it('step 4 fails (the inkTopup $inc): usage row deleted, uses put back, claim row removed, 500', async () => {
    const { userId, c } = await setup();
    const logs = spyLogs();
    jest.spyOn(User, 'findByIdAndUpdate').mockReturnValue({
      lean: () => Promise.reject(new Error(CANARY)),
    } as never);
    const res = await order(userId);
    expect(res.status).toBe(500);
    await expectUntouched(userId, c);
    expect(logs.all()).not.toContain(CANARY);
    await retryWorks(userId, c);
  });

  it('step 4 finds no user: everything undone, 500 (not a 409)', async () => {
    const { userId, c } = await setup();
    jest.spyOn(User, 'findByIdAndUpdate').mockReturnValue({
      lean: () => Promise.resolve(null),
    } as never);
    const res = await order(userId);
    expect(res.status).toBe(500);
    await expectUntouched(userId, c);
    await retryWorks(userId, c);
  });

  it('a rollback that itself fails is logged (class names only) and the caller still gets the 500', async () => {
    const { userId, c } = await setup();
    const logs = spyLogs();
    jest.spyOn(User, 'findByIdAndUpdate').mockReturnValue({
      lean: () => Promise.reject(new Error(CANARY)),
    } as never);
    jest.spyOn(CouponCode, 'updateOne').mockRejectedValue(new Error(CANARY) as never);
    const res = await order(userId);
    expect(res.status).toBe(500);
    const call = logs.error.mock.calls.find((x) => String(x[1]).includes('rollback failed'));
    expect(call).toBeDefined();
    expect(call![0]).toMatchObject({
      couponCode: 'FREE100',
      skuId: 'topup_mid',
      n: 1,
      errName: 'Error',
      rollbackErrName: 'Error',
    });
    expect(logs.all()).not.toContain(CANARY);
    expect(logs.all()).not.toContain(userId);
    // Fails closed: uses stays counted (one high) and the claim row stays, so it is findable.
    expect(await usesOf(c._id)).toBe(2);
    expect(await ledger().countDocuments({ state: 'pending' })).toBe(1);
  });

  it('grantCouponInk refuses ids that are not ObjectIds without touching the database', async () => {
    const r = await grantCouponInk({
      userId: 'nope',
      couponId: oid().toString(),
      couponCode: 'X',
      maxUsesPerUser: 1,
      skuId: 'topup_mid',
      inkUnits: 20,
      listPaise: 19900,
    });
    expect(r).toEqual({ ok: false, reason: 'user_not_found' });
    expect(await ledger().countDocuments({})).toBe(0);
  });
});

describe('T-540 free grant: stale claim re-claim', () => {
  async function plantClaim(
    c: { _id: unknown },
    userId: string,
    ageMs: number,
    state: 'pending' | 'granted' = 'pending',
  ) {
    const key = `coupon:${String(c._id)}:${userId}:1`;
    await ledger().insertOne({
      _id: key as never,
      userId: new mongoose.Types.ObjectId(userId),
      delta: 20,
      reason: 'coupon_grant',
      sourceBucket: 'topup',
      reference: key,
      state,
      claimedAt: new Date(Date.now() - ageMs),
      claimToken: 'old_attempt_token',
      createdAt: new Date(Date.now() - ageMs),
    });
    return key;
  }

  it('the stale window is 120 seconds', () => {
    expect(COUPON_CLAIM_STALE_MS).toBe(120_000);
  });

  it('a pending claim older than 120 s is re-claimed and the grant completes', async () => {
    const userId = await seedUser();
    const c = await freeCoupon();
    await switchOn();
    const key = await plantClaim(c, userId, COUPON_CLAIM_STALE_MS + 1000);
    const logs = spyLogs();

    const res = await order(userId);
    expect(res.status).toBe(200);
    expect(res.body.grant.ledgerKey).toBe(key);
    const row = await ledger().findOne({ _id: key as never });
    expect(row!.state).toBe('granted');
    expect(row!.claimToken).not.toBe('old_attempt_token');
    expect(await inkOf(userId)).toBe(20);
    expect(await usesOf(c._id)).toBe(1);
    expect(await CouponUsage.countDocuments({ couponId: c._id, orderId: key })).toBe(1);
    expect(await ledger().countDocuments({})).toBe(1);
    expect(logs.warn.mock.calls.some((x) => String(x[1]).includes('re-claimed'))).toBe(true);
    expect(logs.all()).not.toContain(userId);
    expect(logs.all()).not.toContain(key);
  });

  it('a fresh pending claim is refused (409): another attempt may be running', async () => {
    const userId = await seedUser();
    const c = await freeCoupon();
    await switchOn();
    const key = await plantClaim(c, userId, 119_000 - 0);
    const res = await order(userId);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('coupon_invalid');
    expect(await inkOf(userId)).toBe(0);
    expect(await usesOf(c._id)).toBe(0);
    expect(await CouponUsage.countDocuments()).toBe(0);
    const row = await ledger().findOne({ _id: key as never });
    expect(row!.claimToken).toBe('old_attempt_token'); // untouched
  });

  it('a just-created pending claim is refused', async () => {
    const userId = await seedUser();
    const c = await freeCoupon();
    await switchOn();
    await plantClaim(c, userId, 0);
    expect((await order(userId)).status).toBe(409);
  });

  it('an old claim that is not pending (already granted) is never re-claimed', async () => {
    const userId = await seedUser();
    const c = await freeCoupon({ maxUsesPerUser: 2 });
    await switchOn();
    await plantClaim(c, userId, 10 * COUPON_CLAIM_STALE_MS, 'granted');
    const res = await order(userId);
    // n is 1 (no CouponUsage row was planted), the key is taken and not stale: refused.
    expect(res.status).toBe(409);
    expect(await inkOf(userId)).toBe(0);
  });

  it('two attempts racing for one stale claim: exactly one grants', async () => {
    const userId = await seedUser();
    const c = await freeCoupon();
    await switchOn();
    await plantClaim(c, userId, COUPON_CLAIM_STALE_MS + 5000);
    const results = await Promise.all([order(userId), order(userId), order(userId)]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
    expect(await inkOf(userId)).toBe(20);
    expect(await usesOf(c._id)).toBe(1);
    expect(await CouponUsage.countDocuments()).toBe(1);
  });

  it('grantCouponInk takes a clock for the stale test', async () => {
    const userId = await seedUser();
    const c = await freeCoupon();
    await plantClaim(c, userId, 0);
    const input = {
      userId,
      couponId: c._id.toString(),
      couponCode: 'FREE100',
      maxUsesPerUser: 1 as number | null,
      skuId: 'topup_mid',
      inkUnits: 20,
      listPaise: 19900,
    };
    expect(await grantCouponInk(input)).toMatchObject({ ok: false });
    const later = new Date(Date.now() + COUPON_CLAIM_STALE_MS + 1000);
    expect(await grantCouponInk({ ...input, now: later })).toMatchObject({ ok: true, n: 1 });
  });
});

describe('T-540 isCouponFreeGrantEnabled (the switch reader)', () => {
  const setRaw = (value: unknown) =>
    mongoose.connection
      .db!.collection('appsettings')
      .insertOne({ key: COUPON_FREE_GRANT_SETTING, value });

  it('defaults to off: no key, no env', async () => {
    expect(await isCouponFreeGrantEnabled()).toBe(false);
  });

  it.each([
    ['true', true],
    ['on', true],
    ['TRUE', true],
    ['  On ', true],
    ['false', false],
    ['off', false],
    ['OFF', false],
  ])('stored %j -> %s', async (value, expected) => {
    await setRaw(value);
    expect(await isCouponFreeGrantEnabled()).toBe(expected);
  });

  it.each([['yes'], ['1'], ['enabled'], ['truee'], ['']])(
    'malformed %j -> off, with a warn',
    async (value) => {
      await setRaw(value);
      const warn = jest.spyOn(logger, 'warn');
      expect(await isCouponFreeGrantEnabled()).toBe(false);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toEqual({
        key: COUPON_FREE_GRANT_SETTING,
        errName: 'MalformedSetting',
      });
    },
  );

  it.each([[1], [true], [{ v: 'true' }], [null]])(
    'a stored non-string %j -> off',
    async (value) => {
      await setRaw(value);
      // A null value is a present doc with no usable value: off, never the env.
      envMut.FEATURE_DEFAULT_COUPON_FREE_GRANT = 'true';
      expect(await isCouponFreeGrantEnabled()).toBe(false);
    },
  );

  it('missing key: env exactly "true" is on, anything else is off', async () => {
    envMut.FEATURE_DEFAULT_COUPON_FREE_GRANT = 'true';
    expect(await isCouponFreeGrantEnabled()).toBe(true);
    for (const v of ['TRUE', 'True', '1', 'yes', 'on', ' true', 'true ', '', 'false', undefined]) {
      envMut.FEATURE_DEFAULT_COUPON_FREE_GRANT = v;
      expect(await isCouponFreeGrantEnabled()).toBe(false);
    }
  });

  it('a stored value always wins over the env, in both directions', async () => {
    envMut.FEATURE_DEFAULT_COUPON_FREE_GRANT = 'true';
    await setRaw('false');
    expect(await isCouponFreeGrantEnabled()).toBe(false);
    clearAppSettingsCache();
    await mongoose.connection.db!.collection('appsettings').deleteMany({});
    envMut.FEATURE_DEFAULT_COUPON_FREE_GRANT = undefined;
    await setRaw('true');
    expect(await isCouponFreeGrantEnabled()).toBe(true);
  });

  it('a DB error is off even with the env on, and warns with the key and error class only', async () => {
    envMut.FEATURE_DEFAULT_COUPON_FREE_GRANT = 'true';
    const warn = jest.spyOn(logger, 'warn');
    class BoomError extends Error {
      constructor() {
        super(`${['mongodb', '://', 'u', ':', 'pa55w0rd', '@h/db'].join('')} connection refused`);
        this.name = 'MongoNetworkError';
      }
    }
    jest.spyOn(AppSetting, 'findOne').mockImplementation(() => {
      throw new BoomError();
    });
    expect(await isCouponFreeGrantEnabled()).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toEqual({
      key: COUPON_FREE_GRANT_SETTING,
      errName: 'MongoNetworkError',
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('pa55w0rd');
  });

  it('a DB error is not cached: the next read after recovery sees the stored value', async () => {
    const spy = jest.spyOn(AppSetting, 'findOne').mockImplementationOnce(() => {
      throw new Error('blip');
    });
    expect(await isCouponFreeGrantEnabled()).toBe(false);
    spy.mockRestore();
    await setRaw('true');
    expect(await isCouponFreeGrantEnabled()).toBe(true);
  });

  it('a found value is cached for 60 s, then re-read', async () => {
    const realNow = Date.now.bind(Date);
    let offset = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => realNow() + offset);

    await setRaw('true');
    expect(await isCouponFreeGrantEnabled()).toBe(true);

    await AppSetting.updateOne({ key: COUPON_FREE_GRANT_SETTING }, { value: 'false' });
    expect(await isCouponFreeGrantEnabled()).toBe(true); // cached
    offset = 59_000;
    expect(await isCouponFreeGrantEnabled()).toBe(true); // still inside the TTL
    offset = 61_000;
    expect(await isCouponFreeGrantEnabled()).toBe(false); // re-read
  });

  it('the cache is served without a DB read inside the TTL', async () => {
    await setRaw('true');
    const find = jest.spyOn(AppSetting, 'findOne');
    await isCouponFreeGrantEnabled();
    await isCouponFreeGrantEnabled();
    await isCouponFreeGrantEnabled();
    expect(find).toHaveBeenCalledTimes(1);
  });

  it('a missing key is not cached: adding the key takes effect at once', async () => {
    expect(await isCouponFreeGrantEnabled()).toBe(false);
    await setRaw('true');
    expect(await isCouponFreeGrantEnabled()).toBe(true);
  });

  it('clearAppSettingsCache drops the cached value', async () => {
    await setRaw('true');
    expect(await isCouponFreeGrantEnabled()).toBe(true);
    await AppSetting.updateOne({ key: COUPON_FREE_GRANT_SETTING }, { value: 'off' });
    clearAppSettingsCache();
    expect(await isCouponFreeGrantEnabled()).toBe(false);
  });
});

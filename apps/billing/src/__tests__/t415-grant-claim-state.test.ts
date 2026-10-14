import './setupDb';
import './setupEnv';
import crypto from 'crypto';
import mongoose from 'mongoose';
import * as Sentry from '@sentry/node';
import request from 'supertest';

import app from '../app';
import logger from '../config/logger';
import { Subscription } from '../models/Subscription.model';
import { User } from '../models/User.model';
import * as inkLedger from '../services/ink-ledger.service';
import {
  CLAIM_STALE_MS,
  MARK_GRANTED_ATTEMPTS,
  topupClaimId,
} from '../services/ink-ledger.service';

// T-415 (Arjun) - grant claims carry a state (pending -> granted) and a timestamp. A pending claim
// older than 60 s is re-claimed by a retry; a granted claim never is. Real handleWebhookEvent
// through the route, in-memory Mongo; staleness is simulated by writing the claim time in the past.

jest.mock('../config/razorpay', () => ({
  razorpay: { subscriptions: { create: jest.fn(), fetch: jest.fn() } },
}));

jest.mock('@sentry/node', () => ({
  ...jest.requireActual('@sentry/node'),
  withScope: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

const SECRET = process.env.RAZORPAY_WEBHOOK_SECRET!;
const ORDER = 'order_t415';
const SUB_ID = 'sub_t415';
const UNITS = 6; // topup_mini
const AGO_61S = () => new Date(Date.now() - (CLAIM_STALE_MS + 1_000));
const AGO_10S = () => new Date(Date.now() - 10_000);

const post = (body: string) =>
  request(app)
    .post('/webhook/razorpay')
    .type('json')
    .set('x-razorpay-signature', crypto.createHmac('sha256', SECRET).update(body).digest('hex'))
    .send(body);

const ledger = () => mongoose.connection.db!.collection('inkledger');
const claimRow = () => ledger().findOne({ _id: topupClaimId(ORDER) as never });

const paymentCaptured = (userId: unknown) =>
  JSON.stringify({
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: 'pay_t415',
          order_id: ORDER,
          notes: { sku_id: 'topup_mini', user_id: String(userId) },
        },
      },
    },
  });

const subCharged = () =>
  JSON.stringify({
    event: 'subscription.charged',
    payload: {
      subscription: {
        entity: {
          id: SUB_ID,
          notes: { planId: 'solo_monthly' },
          current_start: 1_800_000_000,
          current_end: 1_802_600_000,
          paid_count: 1,
        },
      },
      payment: { entity: { id: 'pay_sub_t415' } },
    },
  });

const subChargedNoPaidCount = () => {
  const body = JSON.parse(subCharged());
  delete body.payload.subscription.entity.paid_count;
  return JSON.stringify(body);
};
const PERIOD_START = new Date(1_800_000_000 * 1000);
const signals = () => (Sentry.captureMessage as jest.Mock).mock.calls;

/** Makes the first `n` Subscription.updateOne calls throw (as a thenable query), then calls through. */
function failSubscriptionUpdateOne(n: number) {
  const real = Subscription.updateOne.bind(Subscription);
  let calls = 0;
  const spy = jest.spyOn(Subscription, 'updateOne').mockImplementation(((...a: unknown[]) => {
    calls += 1;
    if (calls <= n) {
      const rejected = () => Promise.reject(new Error('ZZSECRET'));
      return { exec: rejected, then: (f: never, r: never) => rejected().then(f, r) };
    }
    return (real as (...x: unknown[]) => unknown)(...a);
  }) as never);
  return spy;
}

const mkUser = () => User.create({ email: 't415@example.com', plan: 'free' });
const topup = async (id: unknown) => (await User.findById(id).lean())!.inkTopup ?? 0;

/** A top-up claim row as a crashed attempt leaves it: inserted, never granted. */
async function seedTopupClaim(userId: unknown, extra: Record<string, unknown>) {
  await ledger().insertOne({
    _id: topupClaimId(ORDER) as never,
    userId: userId as never,
    delta: UNITS,
    reason: 'topup_purchase',
    sourceBucket: 'topup',
    reference: ORDER,
    createdAt: new Date(),
    ...extra,
  });
}

async function mkSub(extra: Record<string, unknown> = {}) {
  const user = await mkUser();
  await Subscription.create({
    userId: user._id,
    razorpaySubscriptionId: SUB_ID,
    status: 'created',
    ...extra,
  });
  return user;
}
const renewals = (userId: unknown) =>
  ledger().countDocuments({ userId: userId as never, reason: 'sub_renewal' });
const subDoc = async () => (await Subscription.findOne({ razorpaySubscriptionId: SUB_ID }).lean())!;

describe('T-415 grant claim state', () => {
  let warnSpy: jest.SpyInstance;
  beforeEach(() => {
    (Sentry.captureException as jest.Mock).mockReset();
    (Sentry.captureMessage as jest.Mock).mockReset();
    (Sentry.withScope as jest.Mock).mockReset().mockImplementation((cb: (s: unknown) => void) =>
      cb({
        setFingerprint: jest.fn(),
        setSDKProcessingMetadata: jest.fn(),
        addEventProcessor: jest.fn(),
        setTags: jest.fn(),
        setTag: jest.fn(),
        setExtra: jest.fn(),
        setExtras: jest.fn(),
        setContext: jest.fn(),
        setUser: jest.fn(),
      }),
    );
    warnSpy = jest.spyOn(logger, 'warn');
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('AC1: claims carry a state and a timestamp', () => {
    it('top-up: a good grant leaves the claim row granted with claimedAt, grantedAt, a token', async () => {
      const user = await mkUser();
      const before = Date.now();
      expect((await post(paymentCaptured(user._id))).status).toBe(200);
      const row = await claimRow();
      expect(row).toMatchObject({ state: 'granted', balanceAfter: UNITS });
      expect(row!.claimedAt.getTime()).toBeGreaterThanOrEqual(before - 1_000);
      expect(row!.grantedAt).toBeInstanceOf(Date);
      expect(typeof row!.claimToken).toBe('string');
    });

    it('top-up: a failed grant removes the pending claim so the retry grants', async () => {
      const user = await mkUser();
      jest.spyOn(User, 'findByIdAndUpdate').mockImplementationOnce((() => {
        throw new Error('db down');
      }) as never);
      expect((await post(paymentCaptured(user._id))).status).toBe(500);
      expect(await claimRow()).toBeNull();
    });

    it('subscription: a good grant leaves grantClaimState granted with a timestamp and token', async () => {
      const user = await mkSub();
      const before = Date.now();
      expect((await post(subCharged())).status).toBe(200);
      const sub = await subDoc();
      expect(sub.grantClaimState).toBe('granted');
      expect(sub.grantClaimedAt!.getTime()).toBeGreaterThanOrEqual(before - 1_000);
      expect(typeof sub.grantClaimToken).toBe('string');
      expect(sub.lastGrantedPaidCount).toBe(1);
      expect(await renewals(user._id)).toBe(1);
    });

    it('subscription: a failed grant restores the claim fields (no pending left behind)', async () => {
      const user = await mkSub();
      jest.spyOn(User, 'findByIdAndUpdate').mockImplementationOnce((() => {
        throw new Error('db down');
      }) as never);
      expect((await post(subCharged())).status).toBe(500);
      const sub = await subDoc();
      expect(sub.grantClaimState).toBeUndefined();
      expect(sub.lastGrantedPaidCount).toBeUndefined();
      expect((await post(subCharged())).status).toBe(200);
      expect(await renewals(user._id)).toBe(1);
    });
  });

  describe('AC2/AC3: top-up crash after the claim, then a retry', () => {
    it('pending claim 61 s old (crash) -> retry 200, exactly one grant, row granted', async () => {
      const user = await mkUser();
      await seedTopupClaim(user._id, {
        state: 'pending',
        claimedAt: AGO_61S(),
        claimToken: 'dead-attempt',
      });
      expect(await topup(user._id)).toBe(0);

      const res = await post(paymentCaptured(user._id));
      expect(res.status).toBe(200);
      expect(await topup(user._id)).toBe(UNITS);
      const row = await claimRow();
      expect(row).toMatchObject({ state: 'granted', balanceAfter: UNITS });
      expect(row!.claimToken).not.toBe('dead-attempt');
      expect(await ledger().countDocuments({ userId: user._id })).toBe(1);

      // A further retry is a no-op: granted never re-claims.
      expect((await post(paymentCaptured(user._id))).status).toBe(200);
      expect(await topup(user._id)).toBe(UNITS);
    });

    it('pending claim 10 s old -> 500, no grant, warn log, no Sentry capture, row untouched', async () => {
      const user = await mkUser();
      const claimedAt = AGO_10S();
      await seedTopupClaim(user._id, { state: 'pending', claimedAt, claimToken: 'other' });

      const res = await post(paymentCaptured(user._id));
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal Server Error' });
      expect(await topup(user._id)).toBe(0);
      expect(await claimRow()).toMatchObject({
        state: 'pending',
        claimedAt,
        claimToken: 'other',
      });
      expect(warnSpy.mock.calls.some((c) => String(c[1]).includes('grant claim pending'))).toBe(
        true,
      );
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });

    it('granted claim, even if old -> retry 200 no-op', async () => {
      const user = await mkUser();
      await seedTopupClaim(user._id, {
        state: 'granted',
        claimedAt: new Date(Date.now() - 3_600_000),
        claimToken: 'done',
        balanceAfter: UNITS,
      });
      const res = await post(paymentCaptured(user._id));
      expect(res.status).toBe(200);
      expect(await topup(user._id)).toBe(0);
      expect(await claimRow()).toMatchObject({ state: 'granted', claimToken: 'done' });
    });

    it('T-413 row with no state -> no-op, 200, never re-claimed', async () => {
      const user = await mkUser();
      await seedTopupClaim(user._id, { balanceAfter: UNITS });
      const res = await post(paymentCaptured(user._id));
      expect(res.status).toBe(200);
      expect(await topup(user._id)).toBe(0);
      const row = await claimRow();
      expect(row!.state).toBeUndefined();
      expect(row!.claimToken).toBeUndefined();
    });

    it('two concurrent retries on a stale pending claim -> exactly one grant', async () => {
      const user = await mkUser();
      await seedTopupClaim(user._id, {
        state: 'pending',
        claimedAt: AGO_61S(),
        claimToken: 'dead-attempt',
      });
      const res = await Promise.all([
        post(paymentCaptured(user._id)),
        post(paymentCaptured(user._id)),
        post(paymentCaptured(user._id)),
      ]);
      expect(res.every((r) => r.status === 200 || r.status === 500)).toBe(true);
      expect(res.some((r) => r.status === 200)).toBe(true);
      expect(await topup(user._id)).toBe(UNITS);
      expect(await ledger().countDocuments({ userId: user._id })).toBe(1);
      expect(await claimRow()).toMatchObject({ state: 'granted' });
      expect(Sentry.captureMessage).not.toHaveBeenCalled(); // no superseded signal
    });
  });

  describe('AC2/AC3: subscription crash after the claim, then a retry', () => {
    it('pending claim 61 s old (crash) -> retry grants once, state granted', async () => {
      const user = await mkSub({
        lastGrantedPaidCount: 1,
        grantClaimState: 'pending',
        grantClaimedAt: AGO_61S(),
        grantClaimToken: 'dead-attempt',
      });
      expect(await renewals(user._id)).toBe(0);

      expect((await post(subCharged())).status).toBe(200);
      expect(await renewals(user._id)).toBe(1);
      const sub = await subDoc();
      expect(sub.grantClaimState).toBe('granted');
      expect(sub.grantClaimToken).not.toBe('dead-attempt');
      expect(sub.grantClaimedAt!.getTime()).toBeGreaterThan(Date.now() - 30_000);

      // And a further retry no-ops.
      expect((await post(subCharged())).status).toBe(200);
      expect(await renewals(user._id)).toBe(1);
    });

    it('pending claim 10 s old -> 500, no grant, no Sentry capture, claim untouched', async () => {
      const claimedAt = AGO_10S();
      const user = await mkSub({
        lastGrantedPaidCount: 1,
        grantClaimState: 'pending',
        grantClaimedAt: claimedAt,
        grantClaimToken: 'other',
      });
      const res = await post(subCharged());
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal Server Error' });
      expect(await renewals(user._id)).toBe(0);
      const sub = await subDoc();
      expect(sub).toMatchObject({ grantClaimState: 'pending', grantClaimToken: 'other' });
      expect(sub.grantClaimedAt).toEqual(claimedAt);
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });

    it('granted claim, even if old -> 200 no-op', async () => {
      const user = await mkSub({
        lastGrantedPaidCount: 1,
        grantClaimState: 'granted',
        grantClaimedAt: new Date(Date.now() - 3_600_000),
        grantClaimToken: 'done',
      });
      expect((await post(subCharged())).status).toBe(200);
      expect(await renewals(user._id)).toBe(0);
      expect(await subDoc()).toMatchObject({ grantClaimState: 'granted', grantClaimToken: 'done' });
    });

    it('pre-T-415 document (paid_count claimed, no state) never re-claims', async () => {
      const user = await mkSub({ lastGrantedPaidCount: 1 });
      expect((await post(subCharged())).status).toBe(200);
      expect(await renewals(user._id)).toBe(0);
    });

    it('two concurrent retries on a stale pending claim -> exactly one grant', async () => {
      const user = await mkSub({
        lastGrantedPaidCount: 1,
        grantClaimState: 'pending',
        grantClaimedAt: AGO_61S(),
        grantClaimToken: 'dead-attempt',
      });
      const res = await Promise.all([post(subCharged()), post(subCharged()), post(subCharged())]);
      expect(res.every((r) => r.status === 200 || r.status === 500)).toBe(true);
      expect(res.some((r) => r.status === 200)).toBe(true);
      expect(await renewals(user._id)).toBe(1);
      expect((await subDoc()).grantClaimState).toBe('granted');
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });
  });

  describe('route: busy is not an alert, other errors still are', () => {
    it('busy -> warn log with event and error name, no captureException, fixed 500 body', async () => {
      const user = await mkUser();
      await seedTopupClaim(user._id, {
        state: 'pending',
        claimedAt: AGO_10S(),
        claimToken: 'other',
      });
      const res = await post(paymentCaptured(user._id));
      expect(res.status).toBe(500);
      const call = warnSpy.mock.calls.find(
        (c) => c[1] === 'Webhook grant claim pending in another attempt; asking Razorpay to retry',
      );
      expect(call![0]).toEqual({
        event: 'payment.captured',
        errorName: 'GrantClaimBusyError',
        errorCode: undefined,
      });
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });

    it('a non-busy error still logs at error and captures exactly once', async () => {
      const user = await mkUser();
      jest.spyOn(User, 'findByIdAndUpdate').mockImplementationOnce((() => {
        throw new Error('db down');
      }) as never);
      const errSpy = jest.spyOn(logger, 'error');
      const res = await post(paymentCaptured(user._id));
      expect(res.status).toBe(500);
      expect(errSpy.mock.calls.some((c) => c[1] === 'Webhook handler error')).toBe(true);
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    });
  });

  describe('manual-grant signals stay as the net', () => {
    it('top-up claim re-claimed during a slow grant -> topup-grant-superseded, 200', async () => {
      const user = await mkUser();
      const proto = mongoose.mongo.Collection.prototype;
      const realUpdate = proto.updateOne;
      // Simulate another attempt re-claiming just before this attempt's mark-granted write.
      jest.spyOn(proto, 'updateOne').mockImplementationOnce(async function (
        this: unknown,
        ...args: unknown[]
      ) {
        await (realUpdate as (...a: unknown[]) => Promise<unknown>).call(
          this,
          { _id: topupClaimId(ORDER) },
          { $set: { claimToken: 'someone-else' } },
        );
        return (realUpdate as (...a: unknown[]) => Promise<unknown>).apply(this, args) as never;
      } as never);
      const res = await post(paymentCaptured(user._id));
      expect(res.status).toBe(200);
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'Billing: topup-grant-superseded',
        'error',
      );
      expect(await claimRow()).toMatchObject({ state: 'pending', claimToken: 'someone-else' });
    });
  });

  describe('round 2: mark-granted retries, fallback path, superseded', () => {
    it('top-up: mark fails once then succeeds -> claim granted, no signal, 200', async () => {
      const user = await mkUser();
      jest
        .spyOn(mongoose.mongo.Collection.prototype, 'updateOne')
        .mockRejectedValueOnce(new Error('ZZSECRET'));
      const res = await post(paymentCaptured(user._id));
      expect(res.status).toBe(200);
      expect(await topup(user._id)).toBe(UNITS);
      expect(await claimRow()).toMatchObject({ state: 'granted', balanceAfter: UNITS });
      expect(signals()).toEqual([]);
    });

    it('subscription: mark fails 3x -> subscription-mark-granted-failed (error), grant stands, 200', async () => {
      const user = await mkSub();
      const spy = failSubscriptionUpdateOne(MARK_GRANTED_ATTEMPTS);
      const res = await post(subCharged());
      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledTimes(MARK_GRANTED_ATTEMPTS);
      expect(await renewals(user._id)).toBe(1);
      expect((await subDoc()).grantClaimState).toBe('pending');
      expect(signals()).toEqual([['Billing: subscription-mark-granted-failed', 'error']]);
      expect(JSON.stringify(signals())).not.toContain('ZZSECRET');
    });

    it('subscription: mark fails once then succeeds -> granted, no signal', async () => {
      const user = await mkSub();
      const spy = failSubscriptionUpdateOne(1);
      expect((await post(subCharged())).status).toBe(200);
      expect(spy).toHaveBeenCalledTimes(2);
      expect(await renewals(user._id)).toBe(1);
      expect((await subDoc()).grantClaimState).toBe('granted');
      expect(signals()).toEqual([]);
    });

    it('subscription: claim re-claimed between grant and mark -> subscription-grant-superseded, no retry', async () => {
      const user = await mkSub();
      const real = inkLedger.grantSubscriptionInk;
      jest.spyOn(inkLedger, 'grantSubscriptionInk').mockImplementationOnce(async (...a) => {
        const out = await real(...a);
        await Subscription.updateOne(
          { razorpaySubscriptionId: SUB_ID },
          { $set: { grantClaimToken: 'someone-else' } },
        );
        return out;
      });
      const upd = jest.spyOn(Subscription, 'updateOne');
      const res = await post(subCharged());
      expect(res.status).toBe(200);
      expect(await renewals(user._id)).toBe(1);
      expect(signals()).toEqual([['Billing: subscription-grant-superseded', 'error']]);
      expect(await subDoc()).toMatchObject({
        grantClaimState: 'pending',
        grantClaimToken: 'someone-else',
      });
      // one test setup call + one mark call; matchedCount 0 is not retried
      expect(upd).toHaveBeenCalledTimes(2);
    });

    it('period-start fallback: fresh pending claim -> 500, no grant, no Sentry', async () => {
      const user = await mkSub({
        lastGrantedPeriodStart: PERIOD_START,
        grantClaimState: 'pending',
        grantClaimedAt: AGO_10S(),
        grantClaimToken: 'other',
      });
      const res = await post(subChargedNoPaidCount());
      expect(res.status).toBe(500);
      expect(await renewals(user._id)).toBe(0);
      expect(await subDoc()).toMatchObject({
        grantClaimState: 'pending',
        grantClaimToken: 'other',
      });
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(signals()).toEqual([]);
    });

    it('period-start fallback: stale pending claim (crash) -> retry grants once, granted', async () => {
      const user = await mkSub({
        lastGrantedPeriodStart: PERIOD_START,
        grantClaimState: 'pending',
        grantClaimedAt: AGO_61S(),
        grantClaimToken: 'dead-attempt',
      });
      expect((await post(subChargedNoPaidCount())).status).toBe(200);
      expect(await renewals(user._id)).toBe(1);
      expect((await subDoc()).grantClaimState).toBe('granted');
      expect((await post(subChargedNoPaidCount())).status).toBe(200);
      expect(await renewals(user._id)).toBe(1);
    });

    it('period-start fallback: failed grant rolls back its own claim (token matched)', async () => {
      const user = await mkSub();
      jest.spyOn(User, 'findByIdAndUpdate').mockImplementationOnce((() => {
        throw new Error('db down');
      }) as never);
      expect((await post(subChargedNoPaidCount())).status).toBe(500);
      const sub = await subDoc();
      expect(sub.lastGrantedPeriodStart).toBeUndefined();
      expect(sub.grantClaimState).toBeUndefined();
      expect(sub.grantClaimToken).toBeUndefined();
      expect((await post(subChargedNoPaidCount())).status).toBe(200);
      expect(await renewals(user._id)).toBe(1);
    });

    it('period-start fallback: rollback does not undo a claim another attempt re-claimed', async () => {
      await mkSub();
      jest.spyOn(inkLedger, 'grantSubscriptionInk').mockImplementationOnce(async () => {
        await Subscription.updateOne(
          { razorpaySubscriptionId: SUB_ID },
          { $set: { grantClaimToken: 'someone-else' } },
        );
        throw new Error('db down');
      });
      expect((await post(subChargedNoPaidCount())).status).toBe(500);
      expect(await subDoc()).toMatchObject({
        lastGrantedPeriodStart: PERIOD_START,
        grantClaimState: 'pending',
        grantClaimToken: 'someone-else',
      });
      expect(signals()).toEqual([['Billing: subscription-claim-rollback-no-match', 'error']]);
    });
  });
});

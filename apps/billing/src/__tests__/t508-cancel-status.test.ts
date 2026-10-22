/**
 * T-508: POST /cancel (cancel at cycle end), GET /status payload (tier, renewsAt,
 * state, cancelAtCycleEnd), the pure subscriptionState helper. Razorpay is mocked.
 */
import './setupDb';
import mongoose from 'mongoose';
import request from 'supertest';
import { CURRENT_PRIVACY_VERSION } from '@lawie/shared';

import { User } from '../models/User.model';
import { Subscription } from '../models/Subscription.model';
import logger from '../config/logger';
import * as inkLedger from '../services/ink-ledger.service';
import {
  createSubscription,
  handleWebhookEvent,
  subscriptionState,
} from '../services/subscription.service';

jest.mock('../config/razorpay', () => ({
  razorpay: {
    subscriptions: {
      create: jest.fn(),
      fetch: jest.fn(),
      cancel: jest.fn(),
    },
  },
}));

import { razorpay } from '../config/razorpay';
import app from '../app';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const cancelMock = razorpay.subscriptions.cancel as unknown as jest.Mock;
const fetchMock = razorpay.subscriptions.fetch as unknown as jest.Mock;
const createMock = razorpay.subscriptions.create as unknown as jest.Mock;

const DAY = 24 * 60 * 60 * 1000;
const future = (days = 10) => new Date(Date.now() + days * DAY);
const past = (days = 10) => new Date(Date.now() - days * DAY);

function headers(userId: string, email: string) {
  return {
    'x-internal-secret': INTERNAL_SECRET,
    'x-user-id': userId,
    'x-user-email': email,
    'x-user-name': 'Test',
    'x-user-plan': 'free',
    'x-user-role': 'Client',
    'x-user-privacy-version': CURRENT_PRIVACY_VERSION,
  };
}

let userId = '';
let email = '';
let counter = 0;

async function seedUser(extra: Record<string, unknown> = {}): Promise<void> {
  email = `t508-${++counter}@test.com`;
  const user = await User.create({ email, plan: 'free', emailVerified: true, ...extra });
  userId = user._id.toString();
}

let subN = 0;
async function seedSub(fields: Record<string, unknown> = {}) {
  return Subscription.create({
    userId,
    razorpaySubscriptionId: `sub_t508_${++subN}`,
    status: 'active',
    planId: 'solo_monthly',
    ...fields,
  });
}

const getStatus = () => request(app).get('/status').set(headers(userId, email));
const postCancel = () => request(app).post('/cancel').set(headers(userId, email)).send({});

beforeEach(() => {
  cancelMock.mockReset().mockResolvedValue({});
  fetchMock.mockReset();
  createMock.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── subscriptionState (pure) ────────────────────────────────────────────────
describe('T-508 subscriptionState', () => {
  const now = new Date('2026-10-17T00:00:00.000Z');
  const later = new Date('2026-11-01T00:00:00.000Z');
  const earlier = new Date('2026-10-01T00:00:00.000Z');

  it.each([
    ['active', { status: 'active' }, 'active'],
    ['active with no dates', { status: 'active', paidThrough: null }, 'active'],
    ['cancelled within paidThrough', { status: 'cancelled', paidThrough: later }, 'active'],
    ['cancelled after paidThrough', { status: 'cancelled', paidThrough: earlier }, 'lapsed'],
    ['cancelled, no dates', { status: 'cancelled' }, 'lapsed'],
    [
      'cancelled, currentPeriodEnd fallback in future',
      { status: 'cancelled', currentPeriodEnd: later },
      'active',
    ],
    ['completed within paidThrough', { status: 'completed', paidThrough: later }, 'active'],
    ['completed after paidThrough', { status: 'completed', paidThrough: earlier }, 'lapsed'],
    ['halted within paidThrough', { status: 'halted', paidThrough: later }, 'past_due'],
    [
      'halted, currentPeriodEnd fallback',
      { status: 'halted', paidThrough: null, currentPeriodEnd: later },
      'past_due',
    ],
    ['halted after end', { status: 'halted', paidThrough: earlier }, 'lapsed'],
    ['paused within paidThrough', { status: 'paused', paidThrough: later }, 'past_due'],
    [
      'paused, currentPeriodEnd fallback',
      { status: 'paused', currentPeriodEnd: later },
      'past_due',
    ],
    ['pending with paidThrough in future', { status: 'pending', paidThrough: later }, 'past_due'],
    [
      'pending with only currentPeriodEnd in future',
      { status: 'pending', currentPeriodEnd: later },
      'lapsed',
    ],
    ['pending with paidThrough past', { status: 'pending', paidThrough: earlier }, 'lapsed'],
    ['expired', { status: 'expired', paidThrough: later }, 'lapsed'],
    ['created (unfinished checkout)', { status: 'created', paidThrough: later }, 'lapsed'],
    ['authenticated (unfinished checkout)', { status: 'authenticated' }, 'lapsed'],
  ] as const)('%s -> %s', (_name, sub, expected) => {
    expect(subscriptionState(sub as never, now)).toBe(expected);
  });

  it('null sub is lapsed', () => {
    expect(subscriptionState(null, now)).toBe('lapsed');
  });

  it('paidThrough exactly equal to now still counts as paid', () => {
    expect(subscriptionState({ status: 'cancelled', paidThrough: now }, now)).toBe('active');
  });
});

// ─── GET /status payload ─────────────────────────────────────────────────────
describe('T-508 GET /status', () => {
  it('no sub: free tier, lapsed, renewsAt null, cancelAtCycleEnd false, old fields kept', async () => {
    await seedUser();
    const res = await getStatus();
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data).toEqual({
      plan: 'free',
      status: null,
      currentPeriodEnd: null,
      tier: 'free',
      renewsAt: null,
      state: 'lapsed',
      cancelAtCycleEnd: false,
    });
  });

  it('active sub: tier from the plan, renewsAt = paidThrough, state active', async () => {
    await seedUser({ plan: 'pro' });
    const paidThrough = future(20);
    const periodEnd = future(25);
    await seedSub({
      planId: 'pro_monthly',
      paidThrough,
      currentPeriodEnd: periodEnd,
    });
    const { data } = (await getStatus()).body;
    expect(data.plan).toBe('pro');
    expect(data.status).toBe('active');
    expect(data.tier).toBe('pro');
    expect(data.state).toBe('active');
    expect(data.cancelAtCycleEnd).toBe(false);
    expect(data.renewsAt).toBe(paidThrough.toISOString());
    expect(data.currentPeriodEnd).toBe(periodEnd.toISOString());
  });

  it('renewsAt falls back to currentPeriodEnd when there is no paidThrough', async () => {
    await seedUser();
    const periodEnd = future(5);
    await seedSub({ currentPeriodEnd: periodEnd });
    const { data } = (await getStatus()).body;
    expect(data.renewsAt).toBe(periodEnd.toISOString());
  });

  it('active sub flagged cancelAtCycleEnd: status stays active, flag true', async () => {
    await seedUser();
    await seedSub({ paidThrough: future(), cancelAtCycleEnd: true });
    const { data } = (await getStatus()).body;
    expect(data.status).toBe('active');
    expect(data.state).toBe('active');
    expect(data.cancelAtCycleEnd).toBe(true);
  });

  it('cancelled sub within paidThrough: state active, tier kept', async () => {
    await seedUser();
    await seedSub({ status: 'cancelled', planId: 'solo_yearly', paidThrough: future(100) });
    const { data } = (await getStatus()).body;
    expect(data.status).toBe('cancelled');
    expect(data.state).toBe('active');
    expect(data.tier).toBe('solo');
  });

  it('halted sub within paidThrough: past_due', async () => {
    await seedUser();
    await seedSub({ status: 'halted', paidThrough: future() });
    const { data } = (await getStatus()).body;
    expect(data.state).toBe('past_due');
  });

  it('lapsed: expired sub reads lapsed with its last renewsAt', async () => {
    await seedUser();
    const paidThrough = past(3);
    await seedSub({ status: 'expired', paidThrough });
    const { data } = (await getStatus()).body;
    expect(data.status).toBe('expired');
    expect(data.state).toBe('lapsed');
    expect(data.renewsAt).toBe(paidThrough.toISOString());
  });

  it('lapsed: cancelled sub past paidThrough', async () => {
    await seedUser();
    await seedSub({ status: 'cancelled', paidThrough: past() });
    const { data } = (await getStatus()).body;
    expect(data.state).toBe('lapsed');
  });

  it('a newer stale "created" checkout does not hide a still-paid cancelled sub', async () => {
    await seedUser();
    const paidThrough = future(15);
    const paid = await seedSub({
      status: 'cancelled',
      planId: 'pro_monthly',
      paidThrough,
      createdAt: past(30),
    });
    await seedSub({ status: 'created', planId: 'solo_monthly', createdAt: new Date() });
    const { data } = (await getStatus()).body;
    expect(data.status).toBe('cancelled');
    expect(data.tier).toBe('pro');
    expect(data.state).toBe('active');
    expect(data.renewsAt).toBe(paidThrough.toISOString());
    expect(paid.razorpaySubscriptionId).toBeTruthy();
  });

  it('with only unfinished checkouts, falls back to the newest sub', async () => {
    await seedUser();
    await seedSub({ status: 'created', createdAt: past(2) });
    await seedSub({ status: 'authenticated', planId: 'pro_monthly', createdAt: new Date() });
    const { data } = (await getStatus()).body;
    expect(data.status).toBe('authenticated');
    expect(data.state).toBe('lapsed');
  });

  it('a document written without cancelAtCycleEnd reads false', async () => {
    await seedUser();
    const raw = {
      userId: new mongoose.Types.ObjectId(userId),
      razorpaySubscriptionId: 'sub_t508_legacy',
      status: 'active',
      planId: 'solo_monthly',
      paidThrough: future(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await Subscription.collection.insertOne(raw);
    const stored = await Subscription.collection.findOne({
      razorpaySubscriptionId: 'sub_t508_legacy',
    });
    expect(stored).not.toHaveProperty('cancelAtCycleEnd');
    const { data } = (await getStatus()).body;
    expect(data.cancelAtCycleEnd).toBe(false);
    expect(data.state).toBe('active');
  });

  it('a plan id that is no longer in the catalogue gives tier free', async () => {
    await seedUser();
    await seedSub({ planId: 'retired_plan' });
    const { data } = (await getStatus()).body;
    expect(data.tier).toBe('free');
  });

  it('requires auth', async () => {
    const res = await request(app).get('/status');
    expect(res.status).toBe(401);
  });
});

// ─── POST /cancel ────────────────────────────────────────────────────────────
describe('T-508 POST /cancel', () => {
  it('requires auth', async () => {
    const res = await request(app).post('/cancel').send({});
    expect(res.status).toBe(401);
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it('happy path: cancels at cycle end at Razorpay, records the flag, status unchanged', async () => {
    await seedUser({ plan: 'pro' });
    const paidThrough = future(12);
    const sub = await seedSub({ paidThrough });
    const info = jest.spyOn(logger, 'info').mockImplementation(() => undefined);

    const res = await postCancel();

    expect(res.status).toBe(200);
    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(cancelMock).toHaveBeenCalledWith(sub.razorpaySubscriptionId, true);
    expect(cancelMock).not.toHaveBeenCalledWith(expect.anything(), false);

    const after = await Subscription.findById(sub._id);
    expect(after!.cancelAtCycleEnd).toBe(true);
    expect(after!.status).toBe('active');

    expect(res.body.status).toBe('success');
    expect(res.body.data).toMatchObject({
      status: 'active',
      state: 'active',
      tier: 'solo',
      cancelAtCycleEnd: true,
      renewsAt: paidThrough.toISOString(),
    });
    // The body is exactly what GET /status returns afterwards.
    const status = await getStatus();
    expect(res.body.data).toEqual(status.body.data);

    // Exactly one ops line, with only userId, subscriptionId and paidThrough.
    const lines = info.mock.calls.filter((c) => c[1] === 'billing.cancel.scheduled');
    expect(lines).toHaveLength(1);
    const logged = lines[0][0] as Record<string, unknown>;
    expect(Object.keys(logged).sort()).toEqual(['paidThrough', 'subscriptionId', 'userId']);
    expect(logged.userId).toBe(userId);
    expect(logged.subscriptionId).toBe(sub.razorpaySubscriptionId);
    expect(logged.paidThrough).toEqual(paidThrough);
  });

  it('logs the currentPeriodEnd as paidThrough when no paidThrough is stored', async () => {
    await seedUser();
    const periodEnd = future(3);
    await seedSub({ currentPeriodEnd: periodEnd });
    const info = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    const res = await postCancel();
    expect(res.status).toBe(200);
    const line = info.mock.calls.find((c) => c[1] === 'billing.cancel.scheduled');
    expect((line![0] as { paidThrough: Date }).paidThrough).toEqual(periodEnd);
  });

  it('double cancel: second call is 200 with the same body and no Razorpay call', async () => {
    await seedUser();
    await seedSub({ paidThrough: future() });
    const info = jest.spyOn(logger, 'info').mockImplementation(() => undefined);

    const first = await postCancel();
    const second = await postCancel();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(second.body.data.cancelAtCycleEnd).toBe(true);
    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    // The ops line is for a real cancel only.
    expect(info.mock.calls.filter((c) => c[1] === 'billing.cancel.scheduled')).toHaveLength(1);
  });

  it('cancels a halted (live) sub too, and keeps its status', async () => {
    await seedUser();
    const sub = await seedSub({ status: 'halted', paidThrough: future() });
    const res = await postCancel();
    expect(res.status).toBe(200);
    expect(cancelMock).toHaveBeenCalledWith(sub.razorpaySubscriptionId, true);
    const after = await Subscription.findById(sub._id);
    expect(after!.status).toBe('halted');
    expect(after!.cancelAtCycleEnd).toBe(true);
    expect(res.body.data.state).toBe('past_due');
  });

  it('cancels the newest live sub when there are several rows', async () => {
    await seedUser();
    await seedSub({ status: 'expired', createdAt: past(60) });
    const live = await seedSub({ status: 'active', createdAt: past(5), paidThrough: future() });
    await seedSub({ status: 'created', createdAt: new Date() });
    const res = await postCancel();
    expect(res.status).toBe(200);
    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(cancelMock).toHaveBeenCalledWith(live.razorpaySubscriptionId, true);
  });

  it('no subscription at all: 409 flat body, no Razorpay call', async () => {
    await seedUser();
    const res = await postCancel();
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'no_live_subscription' });
    expect(cancelMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['cancelled', 'expired', 'completed', 'created', 'authenticated'] as const)(
    'only a %s sub: 409 flat body, no Razorpay call, no flag written',
    async (status) => {
      await seedUser();
      const sub = await seedSub({ status, paidThrough: future() });
      const res = await postCancel();
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'no_live_subscription' });
      expect(cancelMock).not.toHaveBeenCalled();
      expect((await Subscription.findById(sub._id))!.cancelAtCycleEnd).toBe(false);
    },
  );

  it("another user's live sub is not cancelled", async () => {
    await seedUser();
    const other = new mongoose.Types.ObjectId();
    await Subscription.create({
      userId: other,
      razorpaySubscriptionId: 'sub_t508_other',
      status: 'active',
      planId: 'solo_monthly',
      paidThrough: future(),
    });
    const res = await postCancel();
    expect(res.status).toBe(409);
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it('cancel throws but Razorpay says cancelled: treated as success', async () => {
    await seedUser();
    const sub = await seedSub({ paidThrough: future() });
    cancelMock.mockRejectedValue(new Error('already cancelled'));
    fetchMock.mockResolvedValue({ id: sub.razorpaySubscriptionId, status: 'cancelled' });

    const res = await postCancel();

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(sub.razorpaySubscriptionId);
    expect(res.body.data.cancelAtCycleEnd).toBe(true);
    expect((await Subscription.findById(sub._id))!.cancelAtCycleEnd).toBe(true);
  });

  it.each(['completed', 'expired'])(
    'cancel throws but Razorpay says %s: treated as success',
    async (rzpStatus) => {
      await seedUser();
      const sub = await seedSub({ paidThrough: future() });
      cancelMock.mockRejectedValue(new Error('boom'));
      fetchMock.mockResolvedValue({ status: rzpStatus });
      const res = await postCancel();
      expect(res.status).toBe(200);
      expect((await Subscription.findById(sub._id))!.cancelAtCycleEnd).toBe(true);
    },
  );

  it('cancel throws and Razorpay says active: 503 try_again, flag stays false', async () => {
    await seedUser();
    const sub = await seedSub({ paidThrough: future() });
    cancelMock.mockRejectedValue(new Error('rzp 500'));
    fetchMock.mockResolvedValue({ id: sub.razorpaySubscriptionId, status: 'active' });
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);

    const res = await postCancel();

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'try_again' });
    const after = await Subscription.findById(sub._id);
    expect(after!.cancelAtCycleEnd).toBe(false);
    expect(after!.status).toBe('active');
  });

  it('cancel throws and the fetch also throws: 503 try_again, flag stays false', async () => {
    await seedUser();
    const sub = await seedSub({ paidThrough: future() });
    cancelMock.mockRejectedValue(new Error('rzp down'));
    fetchMock.mockRejectedValue(new Error('rzp down'));
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);

    const res = await postCancel();

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'try_again' });
    expect((await Subscription.findById(sub._id))!.cancelAtCycleEnd).toBe(false);
  });

  it('a failed cancel can be retried and then succeeds', async () => {
    await seedUser();
    const sub = await seedSub({ paidThrough: future() });
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    cancelMock.mockRejectedValueOnce(new Error('rzp down'));
    fetchMock.mockResolvedValue({ status: 'active' });
    expect((await postCancel()).status).toBe(503);

    const retry = await postCancel();
    expect(retry.status).toBe(200);
    expect(cancelMock).toHaveBeenCalledTimes(2);
    expect((await Subscription.findById(sub._id))!.cancelAtCycleEnd).toBe(true);
  });

  it('never sends an immediate cancel (cancel_at_cycle_end false) on any path', async () => {
    await seedUser();
    await seedSub({ paidThrough: future() });
    await postCancel();
    await postCancel();
    for (const call of cancelMock.mock.calls) {
      expect(call[1]).toBe(true);
    }
  });
});

// ─── Ink rules ───────────────────────────────────────────────────────────────
describe('T-508 cancel never touches Ink', () => {
  it('leaves every ink field, plan and tier as they were, and does not call the ink ledger', async () => {
    await seedUser({
      plan: 'pro',
      planTier: 'solo',
      billingCycle: 'monthly',
      inkSub: 40,
      inkAnnualCarry: 6,
      inkTopup: 12,
      inkSubMonthlyAllotment: 40,
    });
    await seedSub({ paidThrough: future() });
    const cancelInk = jest.spyOn(inkLedger, 'cancelSubscriptionInk');
    const grantInk = jest.spyOn(inkLedger, 'grantSubscriptionInk');
    const before = (await User.findById(userId).lean())!;

    const res = await postCancel();
    expect(res.status).toBe(200);

    const after = (await User.findById(userId).lean())!;
    expect(after).toEqual(before);
    expect(after.inkSub).toBe(40);
    expect(after.inkAnnualCarry).toBe(6);
    expect(after.inkTopup).toBe(12);
    expect(cancelInk).not.toHaveBeenCalled();
    expect(grantInk).not.toHaveBeenCalled();
  });

  it('the idempotent second cancel leaves Ink alone too', async () => {
    await seedUser({ plan: 'pro', inkSub: 100, inkTopup: 5 });
    await seedSub({ planId: 'pro_monthly', paidThrough: future() });
    await postCancel();
    const before = (await User.findById(userId).lean())!;
    await postCancel();
    expect(await User.findById(userId).lean()).toEqual(before);
  });
});

// ─── AC4: subscribe again after the cancelled cycle ends ────────────────────
describe('T-508 AC4: resubscribe after a cancel', () => {
  it('while a cancel is scheduled (sub still active) a new subscribe is refused 409', async () => {
    await seedUser();
    await seedSub({ paidThrough: future() });
    await postCancel();
    await expect(createSubscription(userId, email, 'pro_monthly')).rejects.toMatchObject({
      name: 'SubscriptionExistsError',
    });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('after the subscription.cancelled webhook, a new plan can be subscribed', async () => {
    await seedUser();
    const sub = await seedSub({ paidThrough: future() });
    expect((await postCancel()).status).toBe(200);

    await handleWebhookEvent('subscription.cancelled', {
      subscription: { entity: { id: sub.razorpaySubscriptionId, status: 'cancelled' } },
    });
    const cancelled = await Subscription.findById(sub._id);
    expect(cancelled!.status).toBe('cancelled');
    expect(cancelled!.cancelAtCycleEnd).toBe(true);

    createMock.mockResolvedValue({ id: 'sub_t508_new', short_url: 'https://rzp.test/new' });
    const result = await createSubscription(userId, email, 'pro_monthly');
    expect(result).toEqual({
      subscriptionId: 'sub_t508_new',
      shortUrl: 'https://rzp.test/new',
      planId: 'pro_monthly',
    });
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('POST /subscribe answers 200, not 409, once the cancelled sub is in place', async () => {
    await seedUser();
    const sub = await seedSub({ paidThrough: future() });
    await postCancel();
    await handleWebhookEvent('subscription.cancelled', {
      subscription: { entity: { id: sub.razorpaySubscriptionId } },
    });
    createMock.mockResolvedValue({ id: 'sub_t508_new2', short_url: 'https://rzp.test/new2' });

    const res = await request(app)
      .post('/subscribe')
      .set(headers(userId, email))
      .send({ planId: 'solo_yearly' });

    expect(res.status).not.toBe(409);
    expect(res.status).toBe(200);
  });

  it('after the cycle ended (cancelled, paidThrough past) status reads lapsed and subscribe works', async () => {
    await seedUser();
    await seedSub({ status: 'cancelled', cancelAtCycleEnd: true, paidThrough: past() });
    expect((await getStatus()).body.data.state).toBe('lapsed');
    createMock.mockResolvedValue({ id: 'sub_t508_new3', short_url: 'https://rzp.test/new3' });
    const result = await createSubscription(userId, email, 'solo_monthly');
    expect(result.subscriptionId).toBe('sub_t508_new3');
  });

  it('a new sub after cancel: status reports the new live sub with cancelAtCycleEnd false', async () => {
    await seedUser();
    await seedSub({
      status: 'cancelled',
      cancelAtCycleEnd: true,
      planId: 'solo_monthly',
      paidThrough: past(),
      createdAt: past(40),
    });
    await seedSub({
      status: 'active',
      planId: 'pro_monthly',
      paidThrough: future(),
      createdAt: new Date(),
    });
    const { data } = (await getStatus()).body;
    expect(data.tier).toBe('pro');
    expect(data.cancelAtCycleEnd).toBe(false);
    expect(data.state).toBe('active');
  });
});

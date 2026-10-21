/**
 * T-526: subscribe follow-ups 2. Rules are Arjun's (21 Oct 2026):
 *  1. no provider or internal message in any subscribe error body; a create
 *     timeout is 503 try_again, the lock row is KEPT (TTL expires it), error
 *     log + Sentry warning; a subscription.* webhook with no local row is
 *     reported (ids only), never silently dropped, response unchanged;
 *  2. stale + lapsed paths: a strict not-found on the cancel or on the
 *     follow-up fetch counts as already ended (one warn); auth/5xx/timeout
 *     never do;
 *  3. lockedAt comes from the lock's createdAt;
 *  5. isRazorpayNotFound needs statusCode 400 for the description match.
 * (Item 4 is a comment only; nothing to test.)
 *
 * Razorpay is mocked. Fake ids and the leak canary are built at runtime so
 * gitleaks sees no secret-looking literals.
 */
import './setupDb';
import './setupEnv';
import crypto from 'crypto';
import request from 'supertest';
import { CURRENT_PRIVACY_VERSION } from '@lawie/shared';

import logger from '../config/logger';
import { Subscription } from '../models/Subscription.model';
import { SubscriptionCreateLock } from '../models/SubscriptionCreateLock.model';
import { User } from '../models/User.model';
import {
  CREATE_LOCK_BUDGET_MS,
  RAZORPAY_CALL_TIMEOUT_MS,
  SubscriptionCreateUnknownOutcomeError,
  SubscriptionExistsError,
  SubscriptionInProgressError,
  createSubscription,
  handleWebhookEvent,
  isRazorpayNotFound,
} from '../services/subscription.service';

jest.mock('../config/razorpay', () => ({
  razorpay: {
    subscriptions: {
      create: jest.fn(),
      fetch: jest.fn(),
      cancel: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const mockCaptureMessage = jest.fn();
const mockSetTag = jest.fn();
const mockSetExtra = jest.fn();
jest.mock('@sentry/node', () => ({
  ...jest.requireActual('@sentry/node'),
  captureMessage: (...a: unknown[]) => mockCaptureMessage(...a),
  withScope: (cb: (scope: unknown) => void) =>
    cb({ setTag: mockSetTag, setExtra: mockSetExtra, setTags: jest.fn() }),
}));

import { razorpay } from '../config/razorpay';
import app from '../app';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET!;
const createMock = razorpay.subscriptions.create as jest.Mock;
const fetchMock = razorpay.subscriptions.fetch as jest.Mock;
const cancelMock = razorpay.subscriptions.cancel as jest.Mock;

const DAY = 86_400_000;
const past = () => new Date(Date.now() - 10 * DAY);
const future = () => new Date(Date.now() + 10 * DAY);
const sid = (n: string) => ['sub', '_', 't526', n].join('');
const url = (n: string) => ['https://rzp.io/', 't526-', n].join('');
// A distinctive, runtime-built canary: it must never appear in a response body,
// a log line or a Sentry call.
const canary = (n: string) =>
  ['leak', 'canary', n, crypto.randomBytes(6).toString('hex')].join('-');

const CREATE_TIMEOUT_MSG = 'billing.subscription.create_timeout_unknown_outcome';
const UNKNOWN_SUB_MSG = 'billing.webhook.unknown_subscription';
const GENERIC_500 = { error: 'Failed to create subscription' };
const STALE_NF_MSG = 'Stale checkout not found at Razorpay for a different plan; treated as ended';
const LAPSED_NF_MSG = 'Lapsed subscription not found at Razorpay on resubscribe; treated as ended';

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

let counter = 0;
async function seedUser(): Promise<{ userId: string; email: string }> {
  const email = `t526-${++counter}@example.com`;
  const u = await User.create({ email, plan: 'free', emailVerified: true });
  return { userId: u._id.toString(), email };
}
type U = { userId: string; email: string };
const addSub = (userId: string, id: string, fields: Record<string, unknown>) =>
  Subscription.create({ userId, razorpaySubscriptionId: id, ...fields });
const getSub = (id: string) => Subscription.findOne({ razorpaySubscriptionId: id }).lean();
const lockCount = (userId: string) => SubscriptionCreateLock.countDocuments({ userId });
const subscribe = (u: U, planId?: string) =>
  request(app)
    .post('/subscribe')
    .set(headers(u.userId, u.email))
    .send(planId ? { planId } : {});
const mockNewSub = (id = sid('new')) => createMock.mockResolvedValue({ id, short_url: url('new') });

/** The Razorpay SDK's error shape: { statusCode, error: { code, description } }. */
function rzpError(
  statusCode: number | undefined,
  code?: string,
  description?: string,
  message = 'razorpay error',
) {
  return Object.assign(new Error(message), {
    ...(statusCode !== undefined ? { statusCode } : {}),
    error: { code, description },
  });
}
const notFound404 = () => rzpError(404);
const notFound400 = () => rzpError(400, 'BAD_REQUEST_ERROR', 'The id provided does not exist');

let warnSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;
let infoSpy: jest.SpyInstance;
const callsFor = (spy: jest.SpyInstance, msg: string) => spy.mock.calls.filter((c) => c[1] === msg);
/** Everything the logger and Sentry mock saw, as one string. */
const observed = (): string =>
  JSON.stringify([
    warnSpy.mock.calls,
    errorSpy.mock.calls,
    infoSpy.mock.calls,
    mockCaptureMessage.mock.calls,
    mockSetTag.mock.calls,
    mockSetExtra.mock.calls,
  ]);

/** Fire the 15 s Razorpay call timeout immediately. */
function collapseRazorpayTimeouts() {
  const realSetTimeout = global.setTimeout;
  jest
    .spyOn(global, 'setTimeout')
    .mockImplementation(((fn: () => void, ms?: number, ...a: []) =>
      realSetTimeout(
        fn,
        ms === RAZORPAY_CALL_TIMEOUT_MS ? 0 : ms,
        ...a,
      )) as unknown as typeof setTimeout);
}
const never = () => new Promise(() => undefined);

// Movable clock for the item 3 budget tests.
let skew = 0;
function useSkewedClock() {
  skew = 0;
  const realNow = Date.now.bind(Date);
  jest.spyOn(Date, 'now').mockImplementation(() => realNow() + skew);
}

beforeEach(() => {
  skew = 0;
  mockCaptureMessage.mockClear();
  mockSetTag.mockClear();
  mockSetExtra.mockClear();
  createMock.mockReset();
  fetchMock.mockReset();
  cancelMock.mockReset().mockResolvedValue({});
  warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
  errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);
  infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => logger);
});

afterEach(() => {
  jest.restoreAllMocks();
  skew = 0;
});

// ─── AC1 / item 1: no error body carries a provider or internal message ──────
describe('T-526 AC1: no subscribe error response contains the thrown message', () => {
  it('Razorpay SDK error with a message and a description on create -> 500, fixed body', async () => {
    const secret = canary('sdk');
    const u = await seedUser();
    createMock.mockRejectedValue(rzpError(500, 'SERVER_ERROR', secret, secret));

    const res = await subscribe(u);

    expect(res.status).toBe(500);
    expect(res.body).toEqual(GENERIC_500);
    expect(res.text).not.toContain(secret);
    expect(observed()).not.toContain(secret);
    expect(await lockCount(u.userId)).toBe(0);
  });

  it('a non-Error rejection (string) on create -> 500, fixed body', async () => {
    const secret = canary('str');
    const u = await seedUser();
    createMock.mockRejectedValue(secret);

    const res = await subscribe(u);

    expect(res.status).toBe(500);
    expect(res.body).toEqual(GENERIC_500);
    expect(res.text).not.toContain(secret);
    expect(observed()).not.toContain(secret);
  });

  it('a Mongo error mid-flow -> 500, fixed body, lock released', async () => {
    const secret = canary('mongo');
    const u = await seedUser();
    jest.spyOn(Subscription, 'findOne').mockImplementation((() => {
      throw Object.assign(new Error(`E11000 duplicate key ${secret}`), { code: 11000 });
    }) as unknown as typeof Subscription.findOne);

    const res = await subscribe(u);

    expect(res.status).toBe(500);
    expect(res.body).toEqual(GENERIC_500);
    expect(res.text).not.toContain(secret);
    expect(observed()).not.toContain(secret);
    expect(await lockCount(u.userId)).toBe(0);
  });

  it('an unknown planId (echoed in the thrown message) -> 500, fixed body, nothing created', async () => {
    const secret = canary('plan');
    const u = await seedUser();

    const res = await subscribe(u, secret);

    expect(res.status).toBe(500);
    expect(res.body).toEqual(GENERIC_500);
    expect(res.text).not.toContain(secret);
    expect(res.text).not.toContain('Unknown plan');
    expect(observed()).not.toContain(secret);
    expect(createMock).not.toHaveBeenCalled();
    expect(await lockCount(u.userId)).toBe(0);
  });

  it('the generic-500 log carries userId and errName only, never err.message', async () => {
    const secret = canary('log');
    const u = await seedUser();
    createMock.mockRejectedValue(new TypeError(secret));

    await subscribe(u);

    const logs = callsFor(errorSpy, 'Failed to create subscription');
    expect(logs).toHaveLength(1);
    expect(logs[0][0]).toEqual({ userId: u.userId, errName: 'TypeError' });
    expect(JSON.stringify(logs)).not.toContain(secret);
    expect(observed()).not.toContain(secret);
  });

  it('a create timeout -> 503 try_again with no provider text', async () => {
    collapseRazorpayTimeouts();
    const u = await seedUser();
    createMock.mockReturnValue(never());

    const res = await subscribe(u);

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'try_again' });
    expect(res.text).not.toContain('timed out');
    expect(res.text).not.toContain(new SubscriptionCreateUnknownOutcomeError().message);
  });

  it('a failed cancel of a lapsed sub (provider message) -> 503 try_again', async () => {
    const secret = canary('cancel');
    const u = await seedUser();
    await addSub(u.userId, sid('lapsed-cf'), { status: 'halted', paidThrough: past() });
    cancelMock.mockRejectedValue(rzpError(500, 'SERVER_ERROR', secret, secret));
    fetchMock.mockRejectedValue(rzpError(500, 'SERVER_ERROR', secret, secret));

    const res = await subscribe(u);

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'try_again' });
    expect(res.text).not.toContain(secret);
    expect(observed()).not.toContain(secret);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('a failed cancel of a stale checkout (provider message) -> 503 try_again', async () => {
    const secret = canary('stale');
    const u = await seedUser();
    await addSub(u.userId, sid('stale-cf'), { status: 'created', planId: 'solo_monthly' });
    cancelMock.mockRejectedValue(rzpError(500, 'SERVER_ERROR', secret, secret));
    fetchMock.mockRejectedValue(rzpError(500, 'SERVER_ERROR', secret, secret));

    const res = await subscribe(u, 'solo_yearly');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'try_again' });
    expect(res.text).not.toContain(secret);
    expect(observed()).not.toContain(secret);
  });

  it('a create already in flight (lock held) -> 409 subscription_in_progress', async () => {
    const u = await seedUser();
    await SubscriptionCreateLock.create({ userId: u.userId, createdAt: new Date() });

    const res = await subscribe(u);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'subscription_in_progress' });
    expect(res.text).not.toContain(new SubscriptionInProgressError().message.replace(/_/g, ' '));
    expect(createMock).not.toHaveBeenCalled();
    // The held lock belongs to someone else: this call must not delete it.
    expect(await lockCount(u.userId)).toBe(1);
  });

  it('a live sub exists -> 409 subscription_exists with the structured fields only', async () => {
    const u = await seedUser();
    await addSub(u.userId, sid('live'), {
      status: 'active',
      planId: 'solo_monthly',
      paidThrough: future(),
    });

    const res = await subscribe(u);

    expect(res.status).toBe(409);
    expect(Object.keys(res.body).sort()).toEqual(['error', 'paidThrough', 'planId', 'status']);
    expect(res.body.error).toBe('subscription_exists');
    expect(res.body.status).toBe('active');
    expect(res.body.planId).toBe('solo_monthly');
    expect(createMock).not.toHaveBeenCalled();
    expect(
      new SubscriptionExistsError({ status: 'active', planId: null, paidThrough: null }).name,
    ).toBe('SubscriptionExistsError');
  });

  it('the email-verification lookup failing -> 503 with a fixed body', async () => {
    const secret = canary('mw');
    const u = await seedUser();
    jest.spyOn(User, 'findById').mockImplementation((() => {
      throw new Error(secret);
    }) as unknown as typeof User.findById);

    const res = await subscribe(u);

    expect(res.status).toBe(503);
    expect(res.text).not.toContain(secret);
    expect(observed()).not.toContain(secret);
  });
});

// ─── Item 1a/1b: create timeout keeps the lock ───────────────────────────────
describe('T-526 item 1: create timeout -> 503, lock kept, reported', () => {
  it('503 try_again, lock row kept, no local row, error log + Sentry warning (user id only)', async () => {
    collapseRazorpayTimeouts();
    const u = await seedUser();
    createMock.mockReturnValue(never());

    const res = await subscribe(u);

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'try_again' });
    expect(await Subscription.countDocuments({ userId: u.userId })).toBe(0);
    expect(await lockCount(u.userId)).toBe(1);

    const errs = callsFor(errorSpy, CREATE_TIMEOUT_MSG);
    expect(errs).toHaveLength(1);
    expect(errs[0][0]).toEqual({ userId: u.userId, marker: 'create_timeout_unknown_outcome' });
    // The old warn is gone.
    expect(callsFor(warnSpy, 'billing.subscription.create_timeout')).toHaveLength(0);

    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    expect(mockCaptureMessage).toHaveBeenCalledWith(CREATE_TIMEOUT_MSG, 'warning');
    expect(mockSetTag).toHaveBeenCalledWith('userId', u.userId);
    expect(mockSetTag).toHaveBeenCalledWith('marker', 'create_timeout_unknown_outcome');
    expect(observed()).not.toContain(u.email);
  });

  it('a retry inside the TTL window gets 409 in-progress and no second create happens', async () => {
    collapseRazorpayTimeouts();
    const u = await seedUser();
    createMock.mockReturnValue(never());

    const first = await subscribe(u);
    expect(first.status).toBe(503);
    expect(createMock).toHaveBeenCalledTimes(1);

    const second = await subscribe(u);

    expect(second.status).toBe(409);
    expect(second.body).toEqual({ error: 'subscription_in_progress' });
    expect(createMock).toHaveBeenCalledTimes(1);
    // The kept lock was not deleted by the rejected second call.
    expect(await lockCount(u.userId)).toBe(1);
    // Only the first timeout was reported.
    expect(callsFor(errorSpy, CREATE_TIMEOUT_MSG)).toHaveLength(1);
  });

  it('once the lock row expires (TTL), the user can subscribe again', async () => {
    collapseRazorpayTimeouts();
    const u = await seedUser();
    createMock.mockReturnValueOnce(never());
    expect((await subscribe(u)).status).toBe(503);

    // Stand in for the TTL monitor.
    await SubscriptionCreateLock.deleteMany({ userId: u.userId });
    mockNewSub();
    const res = await subscribe(u);

    expect(res.status).toBe(200);
    expect(res.body.data.subscriptionId).toBe(sid('new'));
    expect(await lockCount(u.userId)).toBe(0);
  });

  it('the kept lock row has a createdAt of the create attempt and the model TTL is 60 s', async () => {
    collapseRazorpayTimeouts();
    const u = await seedUser();
    createMock.mockReturnValue(never());
    const before = Date.now();

    await subscribe(u);

    const lock = await SubscriptionCreateLock.findOne({ userId: u.userId }).lean();
    expect(lock).not.toBeNull();
    expect(lock!.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1);
    expect(lock!.createdAt.getTime()).toBeLessThanOrEqual(Date.now());
    const ttl = SubscriptionCreateLock.schema
      .indexes()
      .map(([, o]) => (o as { expireAfterSeconds?: number }).expireAfterSeconds)
      .find((v) => typeof v === 'number');
    expect(ttl).toBe(60);
  });

  it('the service throws SubscriptionCreateUnknownOutcomeError (name and fixed message)', async () => {
    collapseRazorpayTimeouts();
    const u = await seedUser();
    createMock.mockReturnValue(never());

    const err = await createSubscription(u.userId, u.email).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(SubscriptionCreateUnknownOutcomeError);
    expect((err as Error).name).toBe('SubscriptionCreateUnknownOutcomeError');
  });

  it('only a TIMEOUT keeps the lock: a create that rejects releases it', async () => {
    const u = await seedUser();
    createMock.mockRejectedValue(rzpError(500, 'SERVER_ERROR', 'x'));
    expect((await subscribe(u)).status).toBe(500);
    expect(await lockCount(u.userId)).toBe(0);
  });

  it('a timeout on the lapsed cancel (not the create) still releases the lock', async () => {
    collapseRazorpayTimeouts();
    const u = await seedUser();
    await addSub(u.userId, sid('lapsed-to'), { status: 'halted', paidThrough: past() });
    cancelMock.mockReturnValue(never());
    fetchMock.mockReturnValue(never());

    const res = await subscribe(u);

    expect(res.status).toBe(503);
    expect(callsFor(errorSpy, CREATE_TIMEOUT_MSG)).toHaveLength(0);
    expect(mockCaptureMessage).not.toHaveBeenCalled();
    expect(await lockCount(u.userId)).toBe(0);
  });
});

// ─── Item 1e: unknown subscription webhook ───────────────────────────────────
describe('T-526 item 1e: subscription.* webhook with no local row is reported', () => {
  const payloadFor = (id: string, extra: Record<string, unknown> = {}) => ({
    subscription: {
      entity: { id, notes: { email: 'pii@example.com', userId: 'u-pii' }, ...extra },
    },
    payment: { entity: { email: 'pii@example.com', contact: '+910000000000' } },
  });

  it.each([
    'subscription.activated',
    'subscription.charged',
    'subscription.authenticated',
    'subscription.halted',
    'subscription.cancelled',
    'subscription.completed',
    'subscription.pending',
    'subscription.paused',
  ])('%s with no row -> error log + Sentry warning, ids only', async (event) => {
    const id = sid(`unk-${event.split('.')[1]}`);

    await handleWebhookEvent(event, payloadFor(id));

    const errs = callsFor(errorSpy, UNKNOWN_SUB_MSG);
    expect(errs).toHaveLength(1);
    expect(errs[0][0]).toEqual({ subId: id, event });
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    expect(mockCaptureMessage).toHaveBeenCalledWith(UNKNOWN_SUB_MSG, 'warning');
    expect(mockSetTag).toHaveBeenCalledWith('razorpaySubscriptionId', id);
    expect(mockSetExtra).toHaveBeenCalledWith('event', event);
    const seen = observed();
    expect(seen).not.toContain('pii@example.com');
    expect(seen).not.toContain('u-pii');
    expect(seen).not.toContain('+910000000000');
    // The old warn is not also logged for these events.
    expect(callsFor(warnSpy, 'Webhook received for unknown subscription')).toHaveLength(0);
  });

  it('the webhook response is unchanged: signed POST -> 200 {status:ok}', async () => {
    const id = sid('unk-http');
    const body = JSON.stringify({
      event: 'subscription.charged',
      payload: payloadFor(id),
    });
    const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');

    const res = await request(app)
      .post('/webhook/razorpay')
      .type('json')
      .set('x-razorpay-signature', sig)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(callsFor(errorSpy, UNKNOWN_SUB_MSG)).toHaveLength(1);
    expect(mockCaptureMessage).toHaveBeenCalledWith(UNKNOWN_SUB_MSG, 'warning');
  });

  it('a non-subscription event with a subscription payload and no row keeps only the warn', async () => {
    const id = sid('unk-pay');

    await handleWebhookEvent('payment.failed', payloadFor(id));

    expect(callsFor(warnSpy, 'Webhook received for unknown subscription')).toHaveLength(1);
    expect(callsFor(warnSpy, 'Webhook received for unknown subscription')[0][0]).toEqual({
      subId: id,
      event: 'payment.failed',
    });
    expect(callsFor(errorSpy, UNKNOWN_SUB_MSG)).toHaveLength(0);
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it('no subscription id in the payload -> still an early return, nothing reported', async () => {
    await handleWebhookEvent('subscription.charged', { subscription: { entity: {} } });
    await handleWebhookEvent('subscription.charged', {});

    expect(callsFor(errorSpy, UNKNOWN_SUB_MSG)).toHaveLength(0);
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it('a subscription.* event for a KNOWN row is not reported as unknown', async () => {
    const u = await seedUser();
    const id = sid('known');
    await addSub(u.userId, id, { status: 'created', planId: 'solo_monthly' });

    await handleWebhookEvent('subscription.authenticated', payloadFor(id));

    expect(callsFor(errorSpy, UNKNOWN_SUB_MSG)).toHaveLength(0);
    expect(mockCaptureMessage).not.toHaveBeenCalledWith(UNKNOWN_SUB_MSG, 'warning');
  });
});

// ─── AC2 / item 2: a stale row lost at Razorpay no longer blocks checkout ────
describe('T-526 AC2 / item 2: not-found on cancel or fetch counts as already ended', () => {
  const paths = [
    {
      name: 'stale checkout (different plan)',
      msg: STALE_NF_MSG,
      planId: 'solo_yearly' as string | undefined,
      endedStatus: 'cancelled',
      seed: (u: U, id: string) =>
        addSub(u.userId, id, { status: 'created', planId: 'solo_monthly' }),
    },
    {
      name: 'lapsed sub',
      msg: LAPSED_NF_MSG,
      planId: undefined as string | undefined,
      endedStatus: 'expired',
      seed: (u: U, id: string) =>
        addSub(u.userId, id, { status: 'halted', planId: 'solo_monthly', paidThrough: past() }),
    },
  ];

  describe.each(paths)('$name', ({ msg, planId, endedStatus, seed }) => {
    it.each([
      ['404', notFound404],
      ['400 BAD_REQUEST_ERROR "does not exist"', notFound400],
    ])('cancel -> %s: guarded local end, one warn, new sub created', async (_n, mk) => {
      const u = await seedUser();
      const id = sid(`c-${_n.slice(0, 3)}-${endedStatus}`);
      await seed(u, id);
      cancelMock.mockRejectedValue(mk());
      mockNewSub();

      const res = await subscribe(u, planId);

      expect(res.status).toBe(200);
      expect(res.body.data.subscriptionId).toBe(sid('new'));
      expect(createMock).toHaveBeenCalledTimes(1);
      expect(cancelMock).toHaveBeenCalledTimes(1);
      expect((await getSub(id))!.status).toBe(endedStatus);
      expect((await getSub(sid('new')))!.status).toBe('created');
      const warns = callsFor(warnSpy, msg);
      expect(warns).toHaveLength(1);
      expect(warns[0][0]).toEqual({ userId: u.userId, subscriptionId: id });
      expect(await lockCount(u.userId)).toBe(0);
    });

    it.each([
      ['404', notFound404],
      ['400 BAD_REQUEST_ERROR "does not exist"', notFound400],
    ])('cancel fails generically, follow-up fetch -> %s: same outcome', async (_n, mk) => {
      const u = await seedUser();
      const id = sid(`f-${_n.slice(0, 3)}-${endedStatus}`);
      await seed(u, id);
      cancelMock.mockRejectedValue(rzpError(500, 'SERVER_ERROR', 'boom'));
      fetchMock.mockRejectedValue(mk());
      mockNewSub();

      const res = await subscribe(u, planId);

      expect(res.status).toBe(200);
      expect(createMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(id);
      expect((await getSub(id))!.status).toBe(endedStatus);
      const warns = callsFor(warnSpy, msg);
      expect(warns).toHaveLength(1);
      expect(warns[0][0]).toEqual({ userId: u.userId, subscriptionId: id });
      expect(await lockCount(u.userId)).toBe(0);
    });

    it('a not-found cancel does not need the follow-up fetch', async () => {
      const u = await seedUser();
      await seed(u, sid(`nf-nofetch-${endedStatus}`));
      cancelMock.mockRejectedValue(notFound404());
      mockNewSub();

      await subscribe(u, planId);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
      ['401', () => rzpError(401, 'BAD_REQUEST_ERROR', 'The id provided does not exist')],
      ['403', () => rzpError(403, 'BAD_REQUEST_ERROR', 'The id provided does not exist')],
      ['500', () => rzpError(500, 'SERVER_ERROR', 'does not exist')],
      [
        'no statusCode with the description',
        () => rzpError(undefined, 'BAD_REQUEST_ERROR', 'does not exist'),
      ],
      ['a plain Error', () => new Error('does not exist')],
    ])('cancel -> %s is never not-found: 503, nothing written or created', async (_n, mk) => {
      const u = await seedUser();
      const id = sid(`neg-${_n.slice(0, 4).replace(/\W/g, '')}-${endedStatus}`);
      await seed(u, id);
      const before = (await getSub(id))!.status;
      cancelMock.mockRejectedValue(mk());
      fetchMock.mockRejectedValue(new Error('rzp down'));

      const res = await subscribe(u, planId);

      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: 'try_again' });
      expect(createMock).not.toHaveBeenCalled();
      expect((await getSub(id))!.status).toBe(before);
      expect(callsFor(warnSpy, msg)).toHaveLength(0);
      expect(await lockCount(u.userId)).toBe(0);
    });

    it.each([
      ['401', () => rzpError(401, 'BAD_REQUEST_ERROR', 'The id provided does not exist')],
      ['403', () => rzpError(403)],
      ['500', () => rzpError(500, 'SERVER_ERROR', 'boom')],
      [
        'no statusCode with the description',
        () => rzpError(undefined, 'BAD_REQUEST_ERROR', 'does not exist'),
      ],
    ])('cancel fails, follow-up fetch -> %s is never not-found: 503', async (_n, mk) => {
      const u = await seedUser();
      const id = sid(`fneg-${_n.slice(0, 4).replace(/\W/g, '')}-${endedStatus}`);
      await seed(u, id);
      const before = (await getSub(id))!.status;
      cancelMock.mockRejectedValue(rzpError(500, 'SERVER_ERROR', 'boom'));
      fetchMock.mockRejectedValue(mk());

      const res = await subscribe(u, planId);

      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: 'try_again' });
      expect(createMock).not.toHaveBeenCalled();
      expect((await getSub(id))!.status).toBe(before);
      expect(callsFor(warnSpy, msg)).toHaveLength(0);
      expect(await lockCount(u.userId)).toBe(0);
    });

    it('cancel and fetch both time out: 503, nothing created, lock released', async () => {
      collapseRazorpayTimeouts();
      const u = await seedUser();
      const id = sid(`to-${endedStatus}`);
      await seed(u, id);
      const before = (await getSub(id))!.status;
      cancelMock.mockReturnValue(never());
      fetchMock.mockReturnValue(never());

      const res = await subscribe(u, planId);

      expect(res.status).toBe(503);
      expect(createMock).not.toHaveBeenCalled();
      expect((await getSub(id))!.status).toBe(before);
      expect(callsFor(warnSpy, msg)).toHaveLength(0);
      expect(await lockCount(u.userId)).toBe(0);
    });

    it('cancel fails but the follow-up fetch shows an ended sub: the existing "already ended" path still works', async () => {
      const u = await seedUser();
      const id = sid(`ended-${endedStatus}`);
      await seed(u, id);
      cancelMock.mockRejectedValue(
        rzpError(400, 'BAD_REQUEST_ERROR', 'Subscription cannot be cancelled'),
      );
      fetchMock.mockResolvedValue({ status: 'cancelled' });
      mockNewSub();

      const res = await subscribe(u, planId);

      expect(res.status).toBe(200);
      expect(callsFor(warnSpy, msg)).toHaveLength(0);
      expect((await getSub(id))!.status).toBe(endedStatus);
    });
  });
});

// ─── Item 3: the budget clock is the lock's createdAt ────────────────────────
describe('T-526 item 3: lockedAt comes from the lock createdAt', () => {
  function slowInsert(ms: number) {
    const orig = SubscriptionCreateLock.create.bind(SubscriptionCreateLock) as (
      ...a: unknown[]
    ) => Promise<unknown>;
    const seen: Date[] = [];
    jest.spyOn(SubscriptionCreateLock, 'create').mockImplementation((async (...a: unknown[]) => {
      seen.push((a[0] as { createdAt: Date }).createdAt);
      const r = await orig(...a);
      skew += ms; // the insert took `ms` of (skewed) wall clock
      return r;
    }) as unknown as typeof SubscriptionCreateLock.create);
    return seen;
  }

  it('an insert slower than the budget does not push the budget start later: 503, create never called', async () => {
    useSkewedClock();
    const u = await seedUser();
    const seen = slowInsert(CREATE_LOCK_BUDGET_MS + 1_000);
    mockNewSub();

    const res = await subscribe(u);

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'try_again' });
    expect(createMock).not.toHaveBeenCalled();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(Date);
    const warns = callsFor(warnSpy, 'billing.subscription.create_lock_budget_exceeded');
    expect(warns).toHaveLength(1);
    expect(warns[0][0].elapsedMs).toBeGreaterThan(CREATE_LOCK_BUDGET_MS);
    expect(await lockCount(u.userId)).toBe(0);
  });

  it('an insert just inside the budget still creates', async () => {
    useSkewedClock();
    const u = await seedUser();
    slowInsert(CREATE_LOCK_BUDGET_MS - 5_000);
    mockNewSub();

    const res = await subscribe(u);

    expect(res.status).toBe(200);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('the createdAt written to the lock row is the one passed to create (single Date)', async () => {
    const u = await seedUser();
    const seen = slowInsert(0);
    createMock.mockImplementation(async () => {
      const row = await SubscriptionCreateLock.findOne({ userId: u.userId }).lean();
      expect(row!.createdAt.getTime()).toBe(seen[0].getTime());
      return { id: sid('new'), short_url: url('new') };
    });

    const res = await subscribe(u);

    expect(res.status).toBe(200);
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});

// ─── Item 5: isRazorpayNotFound needs statusCode 400 for the description ─────
describe('T-526 item 5: isRazorpayNotFound', () => {
  it('an undefined statusCode is false, even with the description', () => {
    expect(isRazorpayNotFound(rzpError(undefined, 'BAD_REQUEST_ERROR', 'does not exist'))).toBe(
      false,
    );
    expect(
      isRazorpayNotFound({ error: { code: 'BAD_REQUEST_ERROR', description: 'does not exist' } }),
    ).toBe(false);
  });
  it('a non-numeric statusCode is false', () => {
    expect(
      isRazorpayNotFound({
        statusCode: '400',
        error: { code: 'BAD_REQUEST_ERROR', description: 'does not exist' },
      }),
    ).toBe(false);
  });
  it('400 with the description and 404 are true; 401/403/500 are false', () => {
    expect(isRazorpayNotFound(notFound400())).toBe(true);
    expect(isRazorpayNotFound(notFound404())).toBe(true);
    expect(isRazorpayNotFound(rzpError(404, 'X', 'anything'))).toBe(true);
    for (const c of [401, 403, 500]) {
      expect(isRazorpayNotFound(rzpError(c, 'BAD_REQUEST_ERROR', 'does not exist'))).toBe(false);
    }
  });
});

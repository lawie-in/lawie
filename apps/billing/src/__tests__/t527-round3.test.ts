/**
 * T-527 round 3 (Arjun option (a)): the post-create duplicate check, the
 * webhook adopt under the per-user SubscriptionCreateLock, and
 * syncLocalToLive.
 *
 *  AC2: in no timing do two live subs (or a duplicate checkout plus a create)
 *    exist for one user.
 *    - Post-create check: another non-terminal row that appeared while the lock
 *      was held -> the NEW sub is cancelled (cancel(id,false)) and its row
 *      marked cancelled; the earlier row is answered (409, or its checkout link).
 *    - Webhook adopt: lock held -> SubscriptionAdoptBusyError (route: 500, so
 *      Razorpay retries); the lock is always released by the one that took it.
 *    - syncLocalToLive: a guarded checkout -> Razorpay-status update.
 *  AC3: every new log line and Sentry call carries ids only (a canary email,
 *    name or customer id never appears).
 *
 * Razorpay is mocked. Ids and canaries are built at runtime so gitleaks sees
 * no secret-looking literals.
 */
import './setupDb';
import './setupEnv';
import crypto from 'crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { CURRENT_PRIVACY_VERSION } from '@lawie/shared';

import logger from '../config/logger';
import { Subscription } from '../models/Subscription.model';
import { SubscriptionCreateLock } from '../models/SubscriptionCreateLock.model';
import { SubscriptionReconcile } from '../models/SubscriptionReconcile.model';
import { User } from '../models/User.model';
import { SubscriptionAdoptBusyError, handleWebhookEvent } from '../services/subscription.service';

jest.mock('../config/razorpay', () => ({
  razorpay: {
    subscriptions: {
      create: jest.fn(),
      all: jest.fn(),
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
    cb({
      setTag: mockSetTag,
      setExtra: mockSetExtra,
      setTags: jest.fn(),
      setFingerprint: jest.fn(),
      setSDKProcessingMetadata: jest.fn(),
      addEventProcessor: jest.fn(),
    }),
}));

import { razorpay } from '../config/razorpay';
import app from '../app';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET!;
const createMock = razorpay.subscriptions.create as jest.Mock;
const allMock = razorpay.subscriptions.all as jest.Mock;
const fetchMock = razorpay.subscriptions.fetch as jest.Mock;
const cancelMock = razorpay.subscriptions.cancel as jest.Mock;

const sid = (n: string) => ['sub', '_', 't527r3', n].join('');
const url = (n: string) => ['https://rzp.io/', 't527r3-', n].join('');
const canary = (n: string) =>
  ['leak', 'canary', n, crypto.randomBytes(6).toString('hex')].join('-');

const SOLO = 'solo_monthly';
const PRO = 'pro_monthly';
const NON_TERMINAL = ['created', 'authenticated', 'active', 'pending', 'halted', 'paused'];

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
type U = { userId: string; email: string };
async function seedUser(): Promise<U> {
  const email = `t527r3-${++counter}@example.com`;
  const u = await User.create({ email, plan: 'free', emailVerified: true });
  return { userId: u._id.toString(), email };
}
const subscribe = (u: U, planId?: string) =>
  request(app)
    .post('/subscribe')
    .set(headers(u.userId, u.email))
    .send(planId ? { planId } : {});
const getSub = (id: string) => Subscription.findOne({ razorpaySubscriptionId: id }).lean();
const rowsOf = (userId: string) => Subscription.find({ userId }).lean();
const nonTerminalCount = (userId: string) =>
  Subscription.countDocuments({ userId, status: { $in: NON_TERMINAL } });
const lockCount = (userId: string) => SubscriptionCreateLock.countDocuments({ userId });
const webhookOutcome = (event: string, payload: unknown) =>
  handleWebhookEvent(event, payload as never).then(
    () => null,
    (e: unknown) => e,
  );

let seq = 0;
function rzpItem(userId: string, id: string, status: string, planId: string = SOLO) {
  return {
    id,
    status,
    short_url: url(id),
    created_at: Math.floor(Date.now() / 1000) + ++seq,
    customer_id: canary('cust'),
    notes: { userId, email: canary('notemail'), name: canary('notename'), planId },
  };
}
const orphanPayload = (u: U, id: string, planId = SOLO) => ({
  subscription: {
    entity: {
      id,
      notes: { userId: u.userId, planId, email: canary('wh-mail'), name: canary('n') },
    },
  },
});

let warnSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;
let infoSpy: jest.SpyInstance;
const callsFor = (spy: jest.SpyInstance, msg: string) => spy.mock.calls.filter((c) => c[1] === msg);
const observed = (): string =>
  JSON.stringify([
    warnSpy.mock.calls,
    errorSpy.mock.calls,
    infoSpy.mock.calls,
    mockCaptureMessage.mock.calls,
    mockSetTag.mock.calls,
    mockSetExtra.mock.calls,
  ]);

const DUP = 'billing.subscription.post_create_duplicate';
const DUP_CANCEL_FAILED = 'billing.subscription.post_create_duplicate_cancel_failed';
const LOCK_BUSY = 'billing.webhook.unknown_subscription_lock_busy';
const SYNCED = 'billing.subscription.reconcile_local_row_synced_live';

beforeEach(() => {
  seq = 0;
  mockCaptureMessage.mockClear();
  mockSetTag.mockClear();
  mockSetExtra.mockClear();
  createMock.mockReset();
  allMock.mockReset();
  fetchMock.mockReset().mockResolvedValue({ status: 'created', short_url: url('fetched') });
  cancelMock.mockReset().mockResolvedValue({});
  warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
  errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);
  infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => logger);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** create() writes `row` for the user (a row that bypassed the lock), then answers. */
function createWritesRowThenAnswers(
  u: U,
  row: { id: string; status: string; planId?: string; userId?: string },
  newId: string,
) {
  createMock.mockImplementation(async () => {
    await Subscription.create({
      userId: row.userId ?? u.userId,
      razorpaySubscriptionId: row.id,
      status: row.status,
      planId: row.planId ?? SOLO,
    });
    return { id: newId, short_url: url(newId), customer_id: canary('create-cust') };
  });
}

// ─── Post-create duplicate check ─────────────────────────────────────────────
describe('T-527 round 3: post-create check (another non-terminal row appeared during the create)', () => {
  it.each([
    ['created', SOLO],
    ['authenticated', PRO],
  ])(
    'an existing %s checkout: the NEW sub is cancelled (id,false), its row cancelled, the existing checkout link is returned; one non-terminal row',
    async (status, planId) => {
      const u = await seedUser();
      const existingId = sid(`dup-co-${status}`);
      const newId = sid(`dup-new-${status}`);
      createWritesRowThenAnswers(u, { id: existingId, status, planId }, newId);
      fetchMock.mockResolvedValue({ status, short_url: url(existingId) });

      const res = await subscribe(u, SOLO);

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        subscriptionId: existingId,
        shortUrl: url(existingId),
        planId,
      });
      expect(createMock).toHaveBeenCalledTimes(1);
      expect(cancelMock).toHaveBeenCalledTimes(1);
      expect(cancelMock).toHaveBeenCalledWith(newId, false);
      expect(fetchMock).toHaveBeenCalledWith(existingId);
      const newRow = await getSub(newId);
      expect(newRow!.status).toBe('cancelled');
      expect(newRow!.cancelledAt).toBeTruthy();
      expect((await getSub(existingId))!.status).toBe(status);
      expect(await nonTerminalCount(u.userId)).toBe(1);
      expect(await lockCount(u.userId)).toBe(0);
      expect(callsFor(errorSpy, DUP_CANCEL_FAILED)).toHaveLength(0);
    },
  );

  it.each(['active', 'past_due'])(
    'an existing %s row: the NEW sub is cancelled, its row cancelled, 409 subscription_exists for the existing row; no checkout link of the new sub',
    async (status) => {
      const u = await seedUser();
      const existingId = sid(`dup-live-${status}`);
      const newId = sid(`dup-newl-${status}`);
      createWritesRowThenAnswers(
        u,
        { id: existingId, status: status === 'past_due' ? 'halted' : status },
        newId,
      );
      fetchMock.mockResolvedValue({ status: 'halted', short_url: url(existingId) });

      const res = await subscribe(u, SOLO);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('subscription_exists');
      expect(JSON.stringify(res.body)).not.toContain(newId);
      expect(cancelMock).toHaveBeenCalledTimes(1);
      expect(cancelMock).toHaveBeenCalledWith(newId, false);
      expect((await getSub(newId))!.status).toBe('cancelled');
      expect((await getSub(existingId))!.status).toBe(status === 'past_due' ? 'halted' : status);
      expect(await nonTerminalCount(u.userId)).toBe(1);
      expect(await lockCount(u.userId)).toBe(0);
    },
  );

  it('the existing checkout link cannot be fetched: 409 (still cancels the new sub, never returns the new link)', async () => {
    const u = await seedUser();
    const existingId = sid('dup-fetchfail');
    const newId = sid('dup-fetchfail-new');
    createWritesRowThenAnswers(u, { id: existingId, status: 'created' }, newId);
    fetchMock.mockRejectedValue(Object.assign(new Error('boom'), { statusCode: 500 }));

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('subscription_exists');
    expect(JSON.stringify(res.body)).not.toContain(newId);
    expect(cancelMock).toHaveBeenCalledWith(newId, false);
    expect((await getSub(newId))!.status).toBe('cancelled');
    expect(await nonTerminalCount(u.userId)).toBe(1);
  });

  it('the cancel of the new sub fails: error log + Sentry with ids only, the new row stays created, the existing row is returned', async () => {
    const u = await seedUser();
    const existingId = sid('dup-cf');
    const newId = sid('dup-cf-new');
    createWritesRowThenAnswers(u, { id: existingId, status: 'created' }, newId);
    const cancelErr = Object.assign(new Error(canary('cancel-msg')), {
      statusCode: 500,
      error: { description: canary('cancel-desc') },
    });
    cancelMock.mockRejectedValue(cancelErr);
    // The follow-up fetch inside the cancel helper: the new sub is not ended.
    fetchMock.mockImplementation(async (id: string) =>
      id === newId
        ? { status: 'created', short_url: url(newId) }
        : { status: 'created', short_url: url(existingId) },
    );

    const res = await subscribe(u, SOLO);

    // The existing checkout is still the answer.
    expect(res.status).toBe(200);
    expect(res.body.data.subscriptionId).toBe(existingId);
    expect((await getSub(newId))!.status).toBe('created');
    expect((await getSub(existingId))!.status).toBe('created');
    const errs = callsFor(errorSpy, DUP_CANCEL_FAILED);
    expect(errs).toHaveLength(1);
    expect(errs[0][0]).toEqual({
      userId: u.userId,
      subscriptionId: newId,
      existingSubscriptionId: existingId,
    });
    expect(mockCaptureMessage).toHaveBeenCalledWith(DUP_CANCEL_FAILED, 'warning');
    expect(mockSetTag).toHaveBeenCalledWith('userId', u.userId);
    expect(mockSetTag).toHaveBeenCalledWith('razorpaySubscriptionId', newId);
    expect(mockSetExtra).toHaveBeenCalledWith('existingSubscriptionId', existingId);
    const seen = observed();
    for (const c of [canary('cancel-msg'), canary('cancel-desc')]) {
      expect(seen).not.toContain(c);
      expect(res.text).not.toContain(c);
    }
    expect(seen).not.toContain(u.email);
    expect(await lockCount(u.userId)).toBe(0);
  });

  it('the cancel of the new sub fails and the existing row is live: 409, new row stays created, reported', async () => {
    const u = await seedUser();
    const existingId = sid('dup-cf-live');
    const newId = sid('dup-cf-live-new');
    createWritesRowThenAnswers(u, { id: existingId, status: 'active' }, newId);
    cancelMock.mockRejectedValue(Object.assign(new Error('x'), { statusCode: 500 }));
    fetchMock.mockResolvedValue({ status: 'created', short_url: url(newId) });

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('subscription_exists');
    expect((await getSub(newId))!.status).toBe('created');
    expect(callsFor(errorSpy, DUP_CANCEL_FAILED)).toHaveLength(1);
    expect(mockCaptureMessage).toHaveBeenCalledWith(DUP_CANCEL_FAILED, 'warning');
  });

  it('the new sub is already gone at Razorpay (cancel 404): treated as ended, row cancelled, no failure report', async () => {
    const u = await seedUser();
    const existingId = sid('dup-404');
    const newId = sid('dup-404-new');
    createWritesRowThenAnswers(u, { id: existingId, status: 'created' }, newId);
    cancelMock.mockRejectedValue(Object.assign(new Error('nf'), { statusCode: 404 }));

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(200);
    expect(res.body.data.subscriptionId).toBe(existingId);
    expect((await getSub(newId))!.status).toBe('cancelled');
    expect(callsFor(errorSpy, DUP_CANCEL_FAILED)).toHaveLength(0);
  });

  it('a row of ANOTHER user, or a terminal row of this user, created during the create does not trigger it', async () => {
    const u = await seedUser();
    const other = await seedUser();
    const newId = sid('dup-neg-new');
    createMock.mockImplementation(async () => {
      await Subscription.create({
        userId: other.userId,
        razorpaySubscriptionId: sid('dup-neg-other'),
        status: 'created',
        planId: SOLO,
      });
      await Subscription.create({
        userId: u.userId,
        razorpaySubscriptionId: sid('dup-neg-term'),
        status: 'cancelled',
        planId: SOLO,
      });
      return { id: newId, short_url: url(newId) };
    });

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(200);
    expect(res.body.data.subscriptionId).toBe(newId);
    expect(cancelMock).not.toHaveBeenCalled();
    expect(callsFor(warnSpy, DUP)).toHaveLength(0);
    expect((await getSub(newId))!.status).toBe('created');
  });

  it('t516 scenario: an OLDER different-plan checkout (before the lock) is cancelled by the local checks; the create proceeds, the post-create check does NOT fire', async () => {
    const u = await seedUser();
    const oldId = sid('t516-old');
    const newId = sid('t516-new');
    await Subscription.create({
      userId: u.userId,
      razorpaySubscriptionId: oldId,
      status: 'created',
      planId: PRO,
    });
    createMock.mockResolvedValue({ id: newId, short_url: url(newId) });

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(200);
    expect(res.body.data.subscriptionId).toBe(newId);
    expect(createMock).toHaveBeenCalledTimes(1);
    // Exactly one cancel: the stale one, never the new sub.
    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(cancelMock).toHaveBeenCalledWith(oldId, false);
    expect(callsFor(warnSpy, DUP)).toHaveLength(0);
    expect((await getSub(oldId))!.status).toBe('cancelled');
    expect((await getSub(newId))!.status).toBe('created');
    expect(await nonTerminalCount(u.userId)).toBe(1);
  });

  it('an older row that predates the lock and survives the local checks (cancelled/expired) never triggers it', async () => {
    const u = await seedUser();
    const newId = sid('old-term-new');
    for (const [i, status] of ['cancelled', 'expired'].entries()) {
      await Subscription.create({
        userId: u.userId,
        razorpaySubscriptionId: sid(`old-term-${i}`),
        status,
        planId: SOLO,
      });
    }
    createMock.mockResolvedValue({ id: newId, short_url: url(newId) });

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(200);
    expect(cancelMock).not.toHaveBeenCalled();
    expect(callsFor(warnSpy, DUP)).toHaveLength(0);
  });

  it('the earlier createdAt wins: of two rows that appeared during the create the OLDER one is answered', async () => {
    const u = await seedUser();
    const firstId = sid('dup-two-1');
    const secondId = sid('dup-two-2');
    const newId = sid('dup-two-new');
    createMock.mockImplementation(async () => {
      await Subscription.create({
        userId: u.userId,
        razorpaySubscriptionId: firstId,
        status: 'created',
        planId: SOLO,
      });
      await new Promise((r) => setTimeout(r, 5));
      await Subscription.create({
        userId: u.userId,
        razorpaySubscriptionId: secondId,
        status: 'created',
        planId: SOLO,
      });
      return { id: newId, short_url: url(newId) };
    });

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(200);
    expect(res.body.data.subscriptionId).toBe(firstId);
    expect(cancelMock).toHaveBeenCalledWith(newId, false);
  });

  it('AC3: the duplicate warn and the cancel log lines carry ids only (canary create response, notes and customer never appear)', async () => {
    const u = await seedUser();
    const existingId = sid('ac3-dup');
    const newId = sid('ac3-dup-new');
    createWritesRowThenAnswers(u, { id: existingId, status: 'created' }, newId);
    const created = canary('create-notes');
    createMock.mockImplementation(async () => {
      await Subscription.create({
        userId: u.userId,
        razorpaySubscriptionId: existingId,
        status: 'created',
        planId: SOLO,
      });
      return { id: newId, short_url: url(newId), notes: { email: created, name: created } };
    });

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(200);
    const warn = callsFor(warnSpy, DUP);
    expect(warn).toHaveLength(1);
    expect(Object.keys(warn[0][0]).sort()).toEqual(
      ['existingStatus', 'existingSubscriptionId', 'subscriptionId', 'userId'].sort(),
    );
    expect(warn[0][0]).toMatchObject({
      userId: u.userId,
      subscriptionId: newId,
      existingSubscriptionId: existingId,
    });
    const seen = observed();
    expect(seen).not.toContain(created);
    expect(seen).not.toContain(u.email);
    expect(res.text).not.toContain(created);
  });
});

// ─── Webhook adopt under the lock ────────────────────────────────────────────
describe('T-527 round 3: the webhook adopt takes the per-user SubscriptionCreateLock', () => {
  it('lock held: SubscriptionAdoptBusyError, no row, the other holder lock is untouched, warn with ids only', async () => {
    const u = await seedUser();
    await SubscriptionCreateLock.init();
    const held = await SubscriptionCreateLock.create({ userId: u.userId, createdAt: new Date() });
    const id = sid('busy1');

    const err = await webhookOutcome('subscription.authenticated', orphanPayload(u, id));

    expect(err).toBeInstanceOf(SubscriptionAdoptBusyError);
    expect(await getSub(id)).toBeNull();
    expect(await SubscriptionCreateLock.exists({ _id: held._id })).toBeTruthy();
    const busy = callsFor(warnSpy, LOCK_BUSY);
    expect(busy).toHaveLength(1);
    expect(busy[0][0]).toEqual({ subId: id, userId: u.userId });
    const seen = observed();
    expect(seen).not.toContain(u.email);
    expect(seen).not.toMatch(/leak-canary|leak.canary/);
  });

  it('the lock is released after a successful adopt, and the adopted row is handled', async () => {
    const u = await seedUser();
    const id = sid('rel-ok');

    expect(await webhookOutcome('subscription.authenticated', orphanPayload(u, id))).toBeNull();

    expect((await getSub(id))!.status).toBe('authenticated');
    expect(await lockCount(u.userId)).toBe(0);
    // A second adopt for the same user can take the lock at once.
    expect(await webhookOutcome('subscription.authenticated', orphanPayload(u, id))).toBeNull();
  });

  it('the lock is released after a not-adopted outcome (the user already has a live row)', async () => {
    const u = await seedUser();
    await Subscription.create({
      userId: u.userId,
      razorpaySubscriptionId: sid('rel-live'),
      status: 'active',
      planId: SOLO,
    });
    const id = sid('rel-skip');

    expect(await webhookOutcome('subscription.authenticated', orphanPayload(u, id))).toBeNull();

    expect(await getSub(id)).toBeNull();
    expect(await lockCount(u.userId)).toBe(0);
  });

  it('the lock is released after a FAILED adopt (the write throws)', async () => {
    const u = await seedUser();
    const id = sid('rel-fail');
    jest
      .spyOn(Subscription, 'findOneAndUpdate')
      .mockImplementation((() => Promise.reject(new Error(canary('db-down')))) as never);

    const err = await webhookOutcome('subscription.authenticated', orphanPayload(u, id));

    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(SubscriptionAdoptBusyError);
    expect(await lockCount(u.userId)).toBe(0);
  });

  it('a lock-release failure does not fail the adopt; logged with ids and error name only', async () => {
    const u = await seedUser();
    const id = sid('rel-err');
    jest
      .spyOn(SubscriptionCreateLock, 'deleteOne')
      .mockImplementation((() => Promise.reject(new Error(canary('del-msg')))) as never);

    expect(await webhookOutcome('subscription.authenticated', orphanPayload(u, id))).toBeNull();

    expect(await getSub(id)).not.toBeNull();
    const logs = callsFor(errorSpy, 'billing.webhook.adopt_lock_release_failed');
    expect(logs).toHaveLength(1);
    expect(logs[0][0]).toEqual({ subId: id, userId: u.userId, errName: 'Error' });
    expect(observed()).not.toContain(canary('del-msg'));
    jest.restoreAllMocks();
    await SubscriptionCreateLock.deleteMany({ userId: u.userId });
  });

  it('no lock is taken when notes.userId is invalid or the user does not exist', async () => {
    const ghost = new mongoose.Types.ObjectId().toString();
    const lockSpy = jest.spyOn(SubscriptionCreateLock, 'create');

    await handleWebhookEvent('subscription.authenticated', {
      subscription: { entity: { id: sid('nolock-1'), notes: { userId: 'nope' } } },
    } as never);
    await handleWebhookEvent('subscription.authenticated', {
      subscription: { entity: { id: sid('nolock-2'), notes: { userId: ghost } } },
    } as never);

    expect(lockSpy).not.toHaveBeenCalled();
  });

  it('a known sub id never takes the lock (the normal handler path), even while a subscribe holds it', async () => {
    const u = await seedUser();
    const id = sid('known');
    await Subscription.create({
      userId: u.userId,
      razorpaySubscriptionId: id,
      status: 'created',
      planId: SOLO,
    });
    await SubscriptionCreateLock.init();
    await SubscriptionCreateLock.create({ userId: u.userId, createdAt: new Date() });

    expect(await webhookOutcome('subscription.authenticated', orphanPayload(u, id))).toBeNull();

    expect((await getSub(id))!.status).toBe('authenticated');
  });

  it('webhook over HTTP: busy -> 500 (Razorpay retries), retry after the lock is gone -> 200 and the row exists', async () => {
    const u = await seedUser();
    await SubscriptionCreateLock.init();
    await SubscriptionCreateLock.create({ userId: u.userId, createdAt: new Date() });
    const id = sid('http');
    const post = async () => {
      const body = JSON.stringify({
        event: 'subscription.authenticated',
        payload: orphanPayload(u, id),
      });
      const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
      return request(app)
        .post('/webhook/razorpay')
        .type('json')
        .set('x-razorpay-signature', sig)
        .send(body);
    };

    const first = await post();
    expect(first.status).toBe(500);
    expect(first.body).toEqual({ error: 'Internal Server Error' });
    expect(await getSub(id)).toBeNull();
    // Ids only on the route log and Sentry too.
    expect(observed()).not.toMatch(/leak-canary/);

    await SubscriptionCreateLock.deleteMany({ userId: u.userId });
    const retry = await post();
    expect(retry.status).toBe(200);
    expect((await getSub(id))!.userId.toString()).toBe(u.userId);
  });

  it('a subscribe whose lock is held by a webhook adopt gets 409 subscription_in_progress, with no scan and no create', async () => {
    const u = await seedUser();
    const id = sid('sub-vs-wh');
    let subscribeRes: request.Response | undefined;
    const realFindOneAndUpdate = Subscription.findOneAndUpdate.bind(Subscription);
    // While the webhook adopt holds the lock, a subscribe arrives.
    jest.spyOn(Subscription, 'findOneAndUpdate').mockImplementation(((...a: unknown[]) =>
      (async () => {
        subscribeRes = await subscribe(u, SOLO);
        return (realFindOneAndUpdate as (...x: unknown[]) => unknown)(...a);
      })()) as never);

    expect(await webhookOutcome('subscription.authenticated', orphanPayload(u, id))).toBeNull();

    expect(subscribeRes!.status).toBe(409);
    expect(subscribeRes!.body).toEqual({ error: 'subscription_in_progress' });
    expect(createMock).not.toHaveBeenCalled();
    expect(await nonTerminalCount(u.userId)).toBe(1);
    expect(await lockCount(u.userId)).toBe(0);
  });
});

// ─── syncLocalToLive ─────────────────────────────────────────────────────────
describe('T-527 round 3: Razorpay live status wins over a checkout local row (syncLocalToLive)', () => {
  async function plantMarker(userId: string) {
    return SubscriptionReconcile.create({
      userId,
      lockCreatedAt: new Date(Date.now() - 120_000),
      planId: SOLO,
      createdAt: new Date(),
    });
  }

  it.each([
    ['created', 'active'],
    ['authenticated', 'active'],
    ['created', 'halted'],
  ])(
    'a local %s row listed by Razorpay as %s: 409, no cancel, no create, no link; the row is synced to the Razorpay status; one warn with ids only',
    async (localStatus, rzpStatus) => {
      const u = await seedUser();
      await plantMarker(u.userId);
      const id = sid(`sync-${localStatus}-${rzpStatus}`);
      const item = rzpItem(u.userId, id, rzpStatus, SOLO);
      // The checkout row lands during the scan (a webhook not yet applied).
      allMock.mockImplementation(async () => {
        await Subscription.create({
          userId: u.userId,
          razorpaySubscriptionId: id,
          status: localStatus,
          planId: SOLO,
        });
        return { items: [item] };
      });

      const res = await subscribe(u, SOLO);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('subscription_exists');
      expect(res.body.status).toBe(rzpStatus);
      expect(cancelMock).not.toHaveBeenCalled();
      expect(createMock).not.toHaveBeenCalled();
      expect((await getSub(id))!.status).toBe(rzpStatus);
      const logs = callsFor(warnSpy, SYNCED);
      expect(logs).toHaveLength(1);
      expect(logs[0][0]).toEqual({
        userId: u.userId,
        subscriptionId: id,
        priorStatus: localStatus,
        status: rzpStatus,
        updated: true,
      });
      const seen = observed();
      for (const c of [item.notes.email, item.notes.name, item.customer_id, u.email]) {
        expect(seen).not.toContain(c);
        expect(res.text).not.toContain(c);
      }
    },
  );

  it('a local row that is already live is not touched and logs nothing', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    const id = sid('sync-already');
    await Subscription.create({
      userId: u.userId,
      razorpaySubscriptionId: id,
      status: 'active',
      planId: SOLO,
    });
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, id, 'active', SOLO)] });

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(409);
    expect(callsFor(warnSpy, SYNCED)).toHaveLength(0);
    expect((await getSub(id))!.status).toBe('active');
  });

  it('a local row that is already live while Razorpay lists a CHECKOUT status counts as live: 409, no cancel', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    const id = sid('sync-localLive');
    await Subscription.create({
      userId: u.userId,
      razorpaySubscriptionId: id,
      status: 'active',
      planId: SOLO,
    });
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, id, 'created', SOLO)] });

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(409);
    expect(cancelMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('a local TERMINAL row is still ignored even when Razorpay lists the sub live: no sync, no write', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    const id = sid('sync-term');
    await Subscription.create({
      userId: u.userId,
      razorpaySubscriptionId: id,
      status: 'cancelled',
      planId: SOLO,
    });
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, id, 'active', SOLO)] });
    createMock.mockResolvedValue({ id: sid('sync-term-new'), short_url: url('sync-term-new') });

    await subscribe(u, SOLO);

    expect((await getSub(id))!.status).toBe('cancelled');
    expect(callsFor(warnSpy, SYNCED)).toHaveLength(0);
  });

  it('guarded: the row moved out of the checkout statuses between the read and the write is NOT overwritten; updated:false; still no cancel, no create', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    const id = sid('sync-guard');
    allMock.mockImplementation(async () => {
      await Subscription.create({
        userId: u.userId,
        razorpaySubscriptionId: id,
        status: 'created',
        planId: SOLO,
      });
      return { items: [rzpItem(u.userId, id, 'active', SOLO)] };
    });
    const realUpdateOne = Subscription.updateOne.bind(Subscription);
    let moved = false;
    jest.spyOn(Subscription, 'updateOne').mockImplementation(((
      filter: never,
      update: never,
      ...rest: never[]
    ) =>
      (async () => {
        const set = (update as { $set?: { status?: string } }).$set;
        if (!moved && set?.status === 'active') {
          moved = true;
          // A webhook ended the row between the read and this guarded write.
          await realUpdateOne({ razorpaySubscriptionId: id }, { $set: { status: 'cancelled' } });
        }
        return (realUpdateOne as (...x: unknown[]) => unknown)(filter, update, ...rest);
      })()) as never);

    const res = await subscribe(u, SOLO);

    expect(moved).toBe(true);
    expect((await getSub(id))!.status).toBe('cancelled');
    const logs = callsFor(warnSpy, SYNCED);
    expect(logs).toHaveLength(1);
    expect(logs[0][0]).toMatchObject({
      subscriptionId: id,
      priorStatus: 'created',
      status: 'active',
      updated: false,
    });
    expect(cancelMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
    expect(res.status).toBe(409);
  });
});

// ─── Adversarial timings with the lock in place ──────────────────────────────
describe('T-527 round 3: adversarial timings (no two live subs, no duplicate checkout plus a create)', () => {
  it('8 users: a subscribe racing one orphan webhook each (no marker): one non-terminal row per user, create at most once per user, locks released', async () => {
    const users = await Promise.all(Array.from({ length: 8 }, () => seedUser()));
    let n = 0;
    createMock.mockImplementation(async () => {
      const id = sid(`adv8-${++n}`);
      return { id, short_url: url(id) };
    });

    const results = await Promise.all(
      users.map(async (u, i) => {
        const [res, wh] = await Promise.all([
          subscribe(u, SOLO),
          webhookOutcome('subscription.authenticated', orphanPayload(u, sid(`adv8-orphan-${i}`))),
        ]);
        return { res, wh };
      }),
    );

    for (const [i, u] of users.entries()) {
      const { res, wh } = results[i];
      expect([200, 409]).toContain(res.status);
      if (res.status === 409) expect(res.body.error).toBe('subscription_in_progress');
      if (wh) expect(wh).toBeInstanceOf(SubscriptionAdoptBusyError);
      // Whatever the order: at most one non-terminal row for the user.
      expect(await nonTerminalCount(u.userId)).toBeLessThanOrEqual(1);
      expect(await lockCount(u.userId)).toBe(0);
    }
    expect(createMock.mock.calls.length).toBeLessThanOrEqual(users.length);
  });

  it('the webhook adopts first, then a subscribe: the checkout is reused (no create, no cancel)', async () => {
    const u = await seedUser();
    const id = sid('wh-first');
    expect(await webhookOutcome('subscription.authenticated', orphanPayload(u, id))).toBeNull();
    fetchMock.mockResolvedValue({ status: 'authenticated', short_url: url(id) });

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(200);
    expect(res.body.data.subscriptionId).toBe(id);
    expect(createMock).not.toHaveBeenCalled();
    expect(cancelMock).not.toHaveBeenCalled();
    expect(await nonTerminalCount(u.userId)).toBe(1);
  });

  it('subscribe creates first, then the orphan webhook: not adopted (another non-terminal row), no second row', async () => {
    const u = await seedUser();
    const newId = sid('sub-first');
    createMock.mockResolvedValue({ id: newId, short_url: url(newId) });
    expect((await subscribe(u, SOLO)).status).toBe(200);

    expect(
      await webhookOutcome('subscription.authenticated', orphanPayload(u, sid('orph-after'))),
    ).toBeNull();

    expect(await getSub(sid('orph-after'))).toBeNull();
    expect(await nonTerminalCount(u.userId)).toBe(1);
    expect(callsFor(warnSpy, 'billing.webhook.unknown_subscription_not_adopted')).toHaveLength(1);
  });

  it('a stale-lock webhook race: the lock row expired (TTL) during a slow create -> the webhook takes it; the post-create check still leaves one non-terminal row', async () => {
    const u = await seedUser();
    const orphan = sid('ttl-orphan');
    const newId = sid('ttl-new');
    createMock.mockImplementation(async () => {
      // The subscribe lock is gone (TTL monitor stand-in); the webhook adopts.
      await SubscriptionCreateLock.deleteMany({ userId: u.userId });
      expect(
        await webhookOutcome('subscription.authenticated', orphanPayload(u, orphan)),
      ).toBeNull();
      return { id: newId, short_url: url(newId) };
    });

    const res = await subscribe(u, SOLO);

    // The webhook row appeared after lockedAt and before the new row: it wins,
    // the new sub is cancelled and the existing checkout answered.
    expect(res.status).toBe(200);
    expect(res.body.data.subscriptionId).toBe(orphan);
    expect(cancelMock).toHaveBeenCalledWith(newId, false);
    expect((await getSub(newId))!.status).toBe('cancelled');
    expect(await nonTerminalCount(u.userId)).toBe(1);
  });

  it('the webhook ACTIVATES the orphan in the TTL window during the create: the new sub is cancelled and the 409 answers with the live row (never two live)', async () => {
    const u = await seedUser();
    const orphan = sid('ttl-live');
    const newId = sid('ttl-live-new');
    const now = Math.floor(Date.now() / 1000);
    createMock.mockImplementation(async () => {
      await SubscriptionCreateLock.deleteMany({ userId: u.userId });
      await handleWebhookEvent('subscription.activated', {
        subscription: {
          entity: {
            id: orphan,
            current_start: now,
            current_end: now + 2_592_000,
            paid_count: 1,
            notes: { userId: u.userId, planId: SOLO },
          },
        },
      } as never);
      return { id: newId, short_url: url(newId) };
    });

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('subscription_exists');
    expect(res.body.status).toBe('active');
    expect(cancelMock).toHaveBeenCalledWith(newId, false);
    const rows = await rowsOf(u.userId);
    expect(rows.filter((r) => r.status === 'active')).toHaveLength(1);
    expect(await nonTerminalCount(u.userId)).toBe(1);
  });
});

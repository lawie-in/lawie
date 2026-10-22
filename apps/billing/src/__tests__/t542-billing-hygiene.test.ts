/**
 * T-542 billing reconcile hygiene (Arjun's rulings, 22 Oct 2026).
 *  AC1  paid orphan: budget check, then subscriptions.fetch before an orphan
 *       checkout is cancelled (cancel loop and the live-index-refused cancel).
 *  AC3  stuck marker: lastLockCreatedAt ($max), scan `to` cap at +24 h, the
 *       stale report, and the marker delete bound.
 *  AC4  post-create duplicate past CREATE_LOCK_BUDGET_MS: no cancel, no fetch,
 *       failed-cancel report + marker, 409 (never 503).
 *  AC9  create: insert failures write the reconcile marker then rethrow.
 *  AC10 reconcile "live" with a CHECKOUT row re-runs the local checks.
 *  D    adopt target superseded by a late-live orphan.
 *  (Arjun, 22 Oct) a paid orphan left unadopted keeps the marker: two
 *       subscribes both 409; defensive 409; Sentry fingerprint by sub id and
 *       once-per-marker reporting (reportedOrphanIds / reportedSupersededIds).
 *
 * Mongo is the in-memory server (setupDb); Razorpay is mocked. Ids and canaries
 * are built at runtime so gitleaks sees no secret-looking literals.
 */
import './setupDb';
import './setupEnv';
import crypto from 'crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { CURRENT_PRIVACY_VERSION } from '@lawie/shared';

import logger from '../config/logger';
import {
  SUBSCRIPTION_COLLECTION,
  SUBSCRIPTION_LIVE_UNIQUE_NAME,
  ensureSubscriptionIndexes,
} from '../config/subscription-indexes';
import { Subscription } from '../models/Subscription.model';
import { SubscriptionCreateLock } from '../models/SubscriptionCreateLock.model';
import { SubscriptionReconcile } from '../models/SubscriptionReconcile.model';
import { User } from '../models/User.model';
import {
  CREATE_LOCK_BUDGET_MS,
  RAZORPAY_CALL_TIMEOUT_MS,
  RECONCILE_WINDOW_MAX_S,
  RECONCILE_WINDOW_SLACK_S,
  SubscriptionCancelFailedError,
  reconcileRazorpaySubscriptions,
} from '../services/subscription.service';
import { runReconcileSweep } from '../services/subscription-reconcile-sweep.service';

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
const mockSetFingerprint = jest.fn();
jest.mock('@sentry/node', () => ({
  ...jest.requireActual('@sentry/node'),
  captureMessage: (...a: unknown[]) => mockCaptureMessage(...a),
  withScope: (cb: (scope: unknown) => void) =>
    cb({
      setTag: mockSetTag,
      setExtra: mockSetExtra,
      setFingerprint: mockSetFingerprint,
      setTags: jest.fn(),
    }),
}));

import { razorpay } from '../config/razorpay';
import app from '../app';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const createMock = razorpay.subscriptions.create as jest.Mock;
const allMock = razorpay.subscriptions.all as jest.Mock;
const fetchMock = razorpay.subscriptions.fetch as jest.Mock;
const cancelMock = razorpay.subscriptions.cancel as jest.Mock;

const SOLO = 'solo_monthly';
const PRO = 'pro_monthly';
const sid = (n: string) => ['sub', '_', 't542', n].join('');
const url = (n: string) => ['https://rzp.io/', 't542-', n].join('');
const canary = (n: string) =>
  ['leak', 'canary', n, crypto.randomBytes(6).toString('hex')].join('-');
const never = () => new Promise(() => undefined);

let counter = 0;
type U = { userId: string; email: string };
async function seedUser(): Promise<U> {
  const email = `${canary('mail')}-${++counter}@example.com`;
  const u = await User.create({ email, plan: 'free', emailVerified: true });
  return { userId: u._id.toString(), email };
}
const subscribe = (u: U, planId?: string) =>
  request(app)
    .post('/subscribe')
    .set({
      'x-internal-secret': INTERNAL_SECRET,
      'x-user-id': u.userId,
      'x-user-email': u.email,
      'x-user-name': 'Test',
      'x-user-plan': 'free',
      'x-user-role': 'Client',
      'x-user-privacy-version': CURRENT_PRIVACY_VERSION,
    })
    .send(planId ? { planId } : {});
const seedRow = (userId: string, id: string, status: string, planId = SOLO) =>
  Subscription.create({ userId, razorpaySubscriptionId: id, status, planId });
const getSub = (id: string) => Subscription.findOne({ razorpaySubscriptionId: id }).lean();
const rowsOf = (userId: string) => Subscription.find({ userId }).lean();
const markerOf = (userId: string) => SubscriptionReconcile.findOne({ userId }).lean();
const markerCount = (userId: string) => SubscriptionReconcile.countDocuments({ userId });
const lockCount = (userId: string) => SubscriptionCreateLock.countDocuments({ userId });

let seq = 0;
function rzpItem(
  userId: string,
  id: string,
  status: string,
  planId: string = SOLO,
  createdAt?: number,
) {
  return {
    id,
    status,
    short_url: url(id),
    created_at: createdAt ?? Math.floor(Date.now() / 1000) + ++seq,
    customer_id: canary('cust'),
    notes: { userId, email: canary('notemail'), name: canary('notename'), planId },
  };
}
async function plantMarker(
  userId: string,
  opts: { lockCreatedAt?: Date; lastLockCreatedAt?: Date } = {},
) {
  return SubscriptionReconcile.create({
    userId,
    lockCreatedAt: opts.lockCreatedAt ?? new Date(Date.now() - 120_000),
    ...(opts.lastLockCreatedAt ? { lastLockCreatedAt: opts.lastLockCreatedAt } : {}),
    planId: SOLO,
    createdAt: new Date(),
  });
}
const recon = (u: U, plan: string | undefined = SOLO) =>
  reconcileRazorpaySubscriptions(u.userId, {
    requestedPlanId: plan,
    lockedAt: Date.now(),
  } as never);

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
let skew = 0;
function useSkewedClock() {
  skew = 0;
  const realNow = Date.now.bind(Date);
  jest.spyOn(Date, 'now').mockImplementation(() => realNow() + skew);
}

const coll = () => mongoose.connection.db!.collection(SUBSCRIPTION_COLLECTION);
async function dropLive() {
  try {
    await coll().dropIndex(SUBSCRIPTION_LIVE_UNIQUE_NAME);
  } catch {
    // not there
  }
}

/** A Subscription.create whose first call loses to a blocker row (real E11000 from the index). */
function createLosesTo(u: U, blockerId: string, blockerStatus: string, planId = SOLO) {
  const realCreate = Subscription.create.bind(Subscription) as (
    ...a: unknown[]
  ) => Promise<unknown>;
  return jest.spyOn(Subscription, 'create').mockImplementationOnce((async (...args: unknown[]) => {
    await seedRow(u.userId, blockerId, blockerStatus, planId);
    return realCreate(...args);
  }) as never);
}

beforeAll(async () => {
  await Subscription.init();
  await SubscriptionReconcile.init();
  await SubscriptionCreateLock.init();
});

beforeEach(async () => {
  skew = 0;
  seq = 0;
  mockCaptureMessage.mockReset();
  mockSetTag.mockReset();
  mockSetExtra.mockReset();
  mockSetFingerprint.mockReset();
  createMock.mockReset();
  allMock.mockReset();
  fetchMock.mockReset().mockResolvedValue({ status: 'created', short_url: url('fetched') });
  cancelMock.mockReset().mockResolvedValue({});
  warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
  errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);
  infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => logger);
  await dropLive();
});

afterEach(() => {
  jest.restoreAllMocks();
  skew = 0;
});

const NOT_ADOPTED = 'billing.subscription.reconcile_live_orphan_not_adopted';

// ─── AC1: paid orphan ────────────────────────────────────────────────────────
describe('T-542 AC1: an orphan checkout is fetched before it is cancelled', () => {
  it('row-less orphan, still a checkout at Razorpay: fetched, then cancelled (fetch first)', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('co1'), 'created', SOLO)] });
    createMock.mockResolvedValue({ id: sid('fresh'), short_url: url('fresh') });

    const res = await subscribe(u, PRO);

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(sid('co1'));
    expect(cancelMock).toHaveBeenCalledWith(sid('co1'), false);
    expect(fetchMock.mock.invocationCallOrder[0]).toBeLessThan(
      cancelMock.mock.invocationCallOrder[0],
    );
    expect(await markerCount(u.userId)).toBe(0);
  });

  it.each(['active', 'pending', 'halted', 'paused'])(
    'row-less orphan now %s at Razorpay: never cancelled, adopted as a live orphan, outcome live',
    async (status) => {
      const u = await seedUser();
      await plantMarker(u.userId);
      allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('paid'), 'created', PRO)] });
      fetchMock.mockResolvedValue({ status });

      const out = await recon(u, SOLO);

      expect(out.kind).toBe('live');
      expect(cancelMock).not.toHaveBeenCalled();
      const row = await getSub(sid('paid'));
      expect(row).not.toBeNull();
      expect(row!.status).toBe(status);
      expect(await rowsOf(u.userId)).toHaveLength(1);
      expect(callsFor(errorSpy, 'billing.subscription.reconcile_adopted_live')).toHaveLength(1);
      expect(await markerCount(u.userId)).toBe(0);
    },
  );

  it('through /subscribe: a now-paid orphan is a 409, no create, no cancel', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('paid2'), 'created', PRO)] });
    fetchMock.mockResolvedValue({ status: 'active' });

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(409);
    expect(createMock).not.toHaveBeenCalled();
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it('an authenticated status at Razorpay is still a checkout: cancelled', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('auth'), 'created', PRO)] });
    fetchMock.mockResolvedValue({ status: 'authenticated' });

    const out = await recon(u, SOLO);

    expect(out.kind).toBe('none');
    expect(cancelMock).toHaveBeenCalledWith(sid('auth'), false);
  });

  it('a now-paid orphan beside an older listed live orphan: the newest is adopted, the other reported, none cancelled', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    const now = Math.floor(Date.now() / 1000);
    allMock.mockResolvedValue({
      items: [
        rzpItem(u.userId, sid('older-live'), 'active', SOLO, now + 10),
        rzpItem(u.userId, sid('newer-co'), 'created', PRO, now + 50),
      ],
    });
    fetchMock.mockResolvedValue({ status: 'active' });

    const out = await recon(u, SOLO);

    expect(out.kind).toBe('live');
    expect((await getSub(sid('newer-co')))!.status).toBe('active');
    expect(await getSub(sid('older-live'))).toBeNull();
    const reported = callsFor(errorSpy, NOT_ADOPTED);
    expect(reported).toHaveLength(1);
    expect(reported[0][0]).toEqual({
      userId: u.userId,
      subscriptionId: sid('older-live'),
      existingSubscriptionId: sid('newer-co'),
    });
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it.each([
    ['404', { statusCode: 404, error: { description: 'not found' } }],
    [
      '400 "does not exist"',
      {
        statusCode: 400,
        error: { code: 'BAD_REQUEST_ERROR', description: 'The id provided does not exist' },
      },
    ],
  ])(
    'strict not-found (%s) at the fetch: treated as ended, cancel skipped, create proceeds, ids-only warn',
    async (_label, rzpErr) => {
      const u = await seedUser();
      await plantMarker(u.userId);
      allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('gone'), 'created', PRO)] });
      fetchMock.mockRejectedValue({ ...rzpErr, message: canary('rzpmsg') });
      createMock.mockResolvedValue({ id: sid('fresh2'), short_url: url('fresh2') });

      const res = await subscribe(u, SOLO);

      expect(res.status).toBe(200);
      expect(res.body.data.subscriptionId).toBe(sid('fresh2'));
      expect(cancelMock).not.toHaveBeenCalled();
      expect(await getSub(sid('gone'))).toBeNull();
      const warned = callsFor(
        warnSpy,
        'Orphan subscription not found at Razorpay on reconcile; treated as ended',
      );
      expect(warned).toHaveLength(1);
      expect(warned[0][0]).toEqual({ userId: u.userId, subscriptionId: sid('gone') });
      expect(await markerCount(u.userId)).toBe(0);
      expect(observed()).not.toContain('leak-canary');
    },
  );

  it.each([
    ['plain error', () => new Error('boom')],
    ['5xx', () => Object.assign(new Error('x'), { statusCode: 502 })],
    ['401', () => Object.assign(new Error('x'), { statusCode: 401 })],
    [
      '403 does-not-exist body',
      () => ({ statusCode: 403, error: { description: 'does not exist' } }),
    ],
    [
      '400 other',
      () => ({ statusCode: 400, error: { code: 'BAD_REQUEST_ERROR', description: 'nope' } }),
    ],
  ])('fetch failure (%s): 503, marker kept, no cancel, no create', async (_l, mk) => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('f1'), 'created', PRO)] });
    fetchMock.mockRejectedValue(mk());

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(503);
    expect(cancelMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
    expect(await markerCount(u.userId)).toBe(1);
    expect(await lockCount(u.userId)).toBe(0);
  });

  it('fetch timeout: 503, marker kept, no cancel', async () => {
    collapseRazorpayTimeouts();
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('f2'), 'created', PRO)] });
    fetchMock.mockReturnValue(never());

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(503);
    expect(cancelMock).not.toHaveBeenCalled();
    expect(await markerCount(u.userId)).toBe(1);
  });

  it('service level: the failure is a SubscriptionCancelFailedError', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('f3'), 'created', PRO)] });
    fetchMock.mockRejectedValue(new Error('down'));

    await expect(recon(u, SOLO)).rejects.toBeInstanceOf(SubscriptionCancelFailedError);
  });

  it('budget is checked BEFORE the fetch: past the budget no fetch and no cancel, 503, marker kept', async () => {
    useSkewedClock();
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockImplementation(async () => {
      skew = CREATE_LOCK_BUDGET_MS + 5_000;
      return { items: [rzpItem(u.userId, sid('late'), 'created', PRO)] };
    });

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cancelMock).not.toHaveBeenCalled();
    expect(await markerCount(u.userId)).toBe(1);
  });

  it('an orphan that has a local row is not fetched by the guard (only row-less orphans)', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    await seedRow(u.userId, sid('has-row'), 'created', PRO);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('has-row'), 'created', PRO)] });
    createMock.mockResolvedValue({ id: sid('fresh3'), short_url: url('fresh3') });

    await subscribe(u, SOLO);

    expect(fetchMock).not.toHaveBeenCalledWith(sid('has-row'));
  });

  describe('at the live-index-refused cancel (adopt target refused)', () => {
    beforeEach(async () => {
      await ensureSubscriptionIndexes();
    });

    it('target now live: reported reconcile_live_orphan_not_adopted, never cancelled, the existing row stays the answer', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('tgt'), 'created', SOLO)] });
      fetchMock.mockResolvedValue({ status: 'active' });
      createLosesTo(u, sid('blk'), 'created');

      const out = await recon(u, SOLO);

      expect(out.kind).toBe('live');
      expect((out as { row: { razorpaySubscriptionId: string } }).row.razorpaySubscriptionId).toBe(
        sid('blk'),
      );
      expect(cancelMock).not.toHaveBeenCalled();
      const reported = callsFor(errorSpy, NOT_ADOPTED);
      expect(reported).toHaveLength(1);
      expect(reported[0][0]).toEqual({
        userId: u.userId,
        subscriptionId: sid('tgt'),
        existingSubscriptionId: sid('blk'),
      });
      expect(mockCaptureMessage).toHaveBeenCalledWith(NOT_ADOPTED, 'error');
      expect(await getSub(sid('tgt'))).toBeNull();
      expect(await rowsOf(u.userId)).toHaveLength(1);
    });

    it('target still a checkout: fetched, then cancelled (fetch first)', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('tgt2'), 'created', SOLO)] });
      createLosesTo(u, sid('blk2'), 'active');

      const out = await recon(u, SOLO);

      expect(out.kind).toBe('live');
      expect(fetchMock).toHaveBeenCalledWith(sid('tgt2'));
      expect(cancelMock).toHaveBeenCalledWith(sid('tgt2'), false);
      expect(fetchMock.mock.invocationCallOrder[0]).toBeLessThan(
        cancelMock.mock.invocationCallOrder[0],
      );
    });

    it('target not found at Razorpay: cancel skipped, the existing row answers', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('tgt3'), 'created', SOLO)] });
      // pre-adopt fetch: still a checkout; the fetch before the ~:918 cancel: not found
      fetchMock.mockResolvedValueOnce({ status: 'created' }).mockRejectedValue({ statusCode: 404 });
      createLosesTo(u, sid('blk3'), 'active');

      const out = await recon(u, SOLO);

      expect(out.kind).toBe('live');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(cancelMock).not.toHaveBeenCalled();
      expect(callsFor(errorSpy, NOT_ADOPTED)).toHaveLength(0);
      expect(await markerCount(u.userId)).toBe(0);
    });

    it('fetch fails (5xx): SubscriptionCancelFailedError, marker kept, no cancel', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('tgt4'), 'created', SOLO)] });
      fetchMock
        .mockResolvedValueOnce({ status: 'created' })
        .mockRejectedValue(Object.assign(new Error('x'), { statusCode: 503 }));
      createLosesTo(u, sid('blk4'), 'active');

      await expect(recon(u, SOLO)).rejects.toBeInstanceOf(SubscriptionCancelFailedError);

      expect(cancelMock).not.toHaveBeenCalled();
      expect(await markerCount(u.userId)).toBe(1);
    });

    it('budget exceeded before the fetch: no fetch, no cancel, 503-class error, marker kept', async () => {
      useSkewedClock();
      const u = await seedUser();
      await plantMarker(u.userId);
      allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('tgt5'), 'created', SOLO)] });
      const realCreate = Subscription.create.bind(Subscription) as (
        ...a: unknown[]
      ) => Promise<unknown>;
      jest.spyOn(Subscription, 'create').mockImplementationOnce((async (...args: unknown[]) => {
        await seedRow(u.userId, sid('blk5'), 'active');
        skew = CREATE_LOCK_BUDGET_MS + 5_000;
        return realCreate(...args);
      }) as never);

      await expect(recon(u, SOLO)).rejects.toBeInstanceOf(SubscriptionCancelFailedError);

      // Only the pre-adopt fetch ran; none after the budget was exceeded.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(cancelMock).not.toHaveBeenCalled();
      expect(await markerCount(u.userId)).toBe(1);
    });
  });
});

// ─── ruling (b): the adopt target is fetched before it is adopted ────────────
describe('T-542 (b): a same-plan orphan with no local row is fetched before it is adopted', () => {
  it('paid between list and adopt: adopted as LIVE, no created row, 409 through /subscribe, never cancelled', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('paid-tgt'), 'created', SOLO)] });
    fetchMock.mockResolvedValue({ status: 'active' });

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('subscription_exists');
    expect(fetchMock).toHaveBeenCalledWith(sid('paid-tgt'));
    expect(createMock).not.toHaveBeenCalled();
    expect(cancelMock).not.toHaveBeenCalled();
    const rows = await rowsOf(u.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('active');
    expect(rows.some((r) => r.status === 'created')).toBe(false);
    expect(
      callsFor(warnSpy, 'billing.subscription.reconcile_orphan_checkout_now_live'),
    ).toHaveLength(1);
    expect(callsFor(errorSpy, 'billing.subscription.reconcile_adopted_live')).toHaveLength(1);
    expect(
      callsFor(errorSpy, 'billing.subscription.reconcile_adopt_target_superseded'),
    ).toHaveLength(0);
    expect(await markerCount(u.userId)).toBe(0);
  });

  it('still created: adopted with Razorpay status (authenticated wins over the list)', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('st-tgt'), 'created', SOLO)] });
    fetchMock.mockResolvedValue({ status: 'authenticated' });

    const out = await recon(u, SOLO);

    expect(out.kind).toBe('adopted_checkout');
    expect((await getSub(sid('st-tgt')))!.status).toBe('authenticated');
  });

  it('not found at the pre-adopt fetch: adopt skipped, no row, no cancel, marker deleted', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('nf-tgt'), 'created', SOLO)] });
    fetchMock.mockRejectedValue({ statusCode: 404 });

    const out = await recon(u, SOLO);

    expect(out.kind).toBe('none');
    expect(await getSub(sid('nf-tgt'))).toBeNull();
    expect(cancelMock).not.toHaveBeenCalled();
    expect(await markerCount(u.userId)).toBe(0);
  });

  it('fetch 5xx: 503 through /subscribe, marker kept, nothing adopted, cancelled or created', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('5xx-tgt'), 'created', SOLO)] });
    fetchMock.mockRejectedValue(Object.assign(new Error('x'), { statusCode: 502 }));

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(503);
    expect(await getSub(sid('5xx-tgt'))).toBeNull();
    expect(cancelMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
    expect(await markerCount(u.userId)).toBe(1);
  });

  it.each(['cancelled', 'completed', 'expired'])(
    'fetched with terminal status %s: not adopted, not cancelled, one ids/status warn',
    async (status) => {
      const u = await seedUser();
      await plantMarker(u.userId);
      allMock.mockResolvedValue({
        items: [rzpItem(u.userId, sid(`t-${status}`), 'created', SOLO)],
      });
      fetchMock.mockResolvedValue({ status });

      const out = await recon(u, SOLO);

      expect(out.kind).toBe('none');
      expect(await getSub(sid(`t-${status}`))).toBeNull();
      expect(cancelMock).not.toHaveBeenCalled();
      const w = callsFor(warnSpy, 'billing.subscription.reconcile_adopt_target_not_checkout');
      expect(w).toHaveLength(1);
      expect(JSON.stringify(w[0][0])).toContain(status);
      expect(observed()).not.toContain('leak-canary');
    },
  );

  it('budget exceeded before the pre-adopt fetch: no fetch, no adopt, 503, marker kept', async () => {
    useSkewedClock();
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockImplementation(async () => {
      skew = CREATE_LOCK_BUDGET_MS + 5_000;
      return { items: [rzpItem(u.userId, sid('bud-tgt'), 'created', SOLO)] };
    });

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await getSub(sid('bud-tgt'))).toBeNull();
    expect(await markerCount(u.userId)).toBe(1);
  });

  it('a target with a local row is reused without a fetch', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    await seedRow(u.userId, sid('row-tgt'), 'created', SOLO);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('row-tgt'), 'created', SOLO)] });

    const out = await recon(u, SOLO);

    expect(out.kind).toBe('adopted_checkout');
    expect(fetchMock).not.toHaveBeenCalledWith(sid('row-tgt'));
  });
});

// ─── D: adopt target superseded ──────────────────────────────────────────────
describe('T-542 D: an adopt target superseded by a late-live orphan', () => {
  it('reported reconcile_adopt_target_superseded (ids only); the target is neither adopted nor cancelled', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    const now = Math.floor(Date.now() / 1000);
    allMock.mockResolvedValue({
      items: [
        rzpItem(u.userId, sid('target'), 'created', SOLO, now + 50), // newest same-plan: the target
        rzpItem(u.userId, sid('late-live'), 'created', PRO, now + 10),
      ],
    });
    fetchMock.mockImplementation(async (id: string) =>
      id === sid('late-live') ? { status: 'active' } : { status: 'created' },
    );

    const out = await recon(u, SOLO);

    expect(out.kind).toBe('live');
    expect((await getSub(sid('late-live')))!.status).toBe('active');
    expect(await getSub(sid('target'))).toBeNull();
    expect(cancelMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalledWith(sid('target'));
    const rep = callsFor(errorSpy, 'billing.subscription.reconcile_adopt_target_superseded');
    expect(rep).toHaveLength(1);
    expect(rep[0][0]).toEqual({
      userId: u.userId,
      subscriptionId: sid('target'),
      existingSubscriptionId: sid('late-live'),
    });
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'billing.subscription.reconcile_adopt_target_superseded',
      'error',
    );
    expect(observed()).not.toContain('leak-canary');
    expect(observed()).not.toContain(u.email);
  });

  it('no late-live orphan: the target is adopted as before and nothing is reported', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('plain'), 'created', SOLO)] });

    const out = await recon(u, SOLO);

    expect(out.kind).toBe('adopted_checkout');
    expect(await getSub(sid('plain'))).not.toBeNull();
    expect(
      callsFor(errorSpy, 'billing.subscription.reconcile_adopt_target_superseded'),
    ).toHaveLength(0);
  });
});

// ─── AC3: stuck marker ───────────────────────────────────────────────────────
describe('T-542 AC3: the reconcile marker window', () => {
  const STALE = 'billing.subscription.reconcile_marker_stale';

  it('a new marker written by a create timeout has lastLockCreatedAt === lockCreatedAt', async () => {
    collapseRazorpayTimeouts();
    const u = await seedUser();
    createMock.mockReturnValue(never());

    const res = await subscribe(u, PRO);

    expect(res.status).toBe(503);
    const m = await markerOf(u.userId);
    expect(m!.lastLockCreatedAt).toBeInstanceOf(Date);
    expect(m!.lastLockCreatedAt!.getTime()).toBe(m!.lockCreatedAt.getTime());
  });

  it('a later timeout keeps lockCreatedAt ($min) and moves lastLockCreatedAt up ($max)', async () => {
    collapseRazorpayTimeouts();
    const u = await seedUser();
    const first = new Date(Date.now() - 3_600_000);
    await plantMarker(u.userId, { lockCreatedAt: first, lastLockCreatedAt: first });
    allMock.mockResolvedValue({ items: [] });
    jest.spyOn(SubscriptionReconcile, 'deleteOne').mockRejectedValueOnce(new Error('db down'));
    createMock.mockReturnValue(never());

    const res = await subscribe(u);

    expect(res.status).toBe(503);
    const m = await markerOf(u.userId);
    expect(await markerCount(u.userId)).toBe(1);
    expect(m!.lockCreatedAt.getTime()).toBe(first.getTime());
    expect(m!.lastLockCreatedAt!.getTime()).toBeGreaterThan(first.getTime() + 3_000_000);
  });

  it('a later timeout never lowers an already later lastLockCreatedAt ($max)', async () => {
    collapseRazorpayTimeouts();
    const u = await seedUser();
    const future = new Date(Date.now() + 3_600_000);
    await plantMarker(u.userId, { lockCreatedAt: future, lastLockCreatedAt: future });
    allMock.mockResolvedValue({ items: [] });
    jest.spyOn(SubscriptionReconcile, 'deleteOne').mockRejectedValueOnce(new Error('db down'));
    createMock.mockReturnValue(never());

    await subscribe(u);

    const m = await markerOf(u.userId);
    expect(m!.lastLockCreatedAt!.getTime()).toBe(future.getTime());
    expect(m!.lockCreatedAt.getTime()).toBeLessThan(future.getTime());
  });

  it('a fresh marker: the scan ends at now, no stale report', async () => {
    const u = await seedUser();
    const lock = new Date(Date.now() - 600_000);
    await plantMarker(u.userId, { lockCreatedAt: lock, lastLockCreatedAt: lock });
    allMock.mockResolvedValue({ items: [] });
    const before = Math.floor(Date.now() / 1000);

    await recon(u);

    const q = allMock.mock.calls[0][0];
    expect(q.from).toBe(Math.floor(lock.getTime() / 1000) - RECONCILE_WINDOW_SLACK_S);
    expect(q.to).toBeGreaterThanOrEqual(before);
    expect(q.to).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
    expect(callsFor(errorSpy, STALE)).toHaveLength(0);
    expect(mockCaptureMessage).not.toHaveBeenCalledWith(STALE, expect.anything());
  });

  it('exports the 24 h bound', () => {
    expect(RECONCILE_WINDOW_MAX_S).toBe(86_400);
  });

  it('a marker stuck for days: `to` is lastLockCreatedAt + 24 h, one error log and one Sentry event, user id only', async () => {
    const u = await seedUser();
    const lock = new Date(Date.now() - 5 * 86_400_000);
    const last = new Date(Date.now() - 3 * 86_400_000);
    await plantMarker(u.userId, { lockCreatedAt: lock, lastLockCreatedAt: last });
    allMock.mockResolvedValue({ items: [] });

    await recon(u);

    const q = allMock.mock.calls[0][0];
    expect(q.from).toBe(Math.floor(lock.getTime() / 1000) - RECONCILE_WINDOW_SLACK_S);
    expect(q.to).toBe(Math.floor(last.getTime() / 1000) + RECONCILE_WINDOW_MAX_S);
    const rep = callsFor(errorSpy, STALE);
    expect(rep).toHaveLength(1);
    expect(rep[0][0]).toEqual({ userId: u.userId });
    expect(mockCaptureMessage.mock.calls.filter((c) => c[0] === STALE)).toEqual([[STALE, 'error']]);
    expect(mockSetTag).toHaveBeenCalledWith('userId', u.userId);
    expect(observed()).not.toContain('leak-canary');
    expect(observed()).not.toContain(u.email);
  });

  it('a legacy marker (no lastLockCreatedAt) falls back to lockCreatedAt + 24 h', async () => {
    const u = await seedUser();
    const lock = new Date(Date.now() - 4 * 86_400_000);
    await plantMarker(u.userId, { lockCreatedAt: lock });
    allMock.mockResolvedValue({ items: [] });

    await recon(u);

    expect(allMock.mock.calls[0][0].to).toBe(
      Math.floor(lock.getTime() / 1000) + RECONCILE_WINDOW_MAX_S,
    );
    expect(callsFor(errorSpy, STALE)).toHaveLength(1);
  });

  it('the stale scan does not throw: it continues with the capped window and still adopts', async () => {
    const u = await seedUser();
    const lock = new Date(Date.now() - 3 * 86_400_000);
    await plantMarker(u.userId, { lockCreatedAt: lock });
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('stale-orphan'), 'active')] });

    const out = await recon(u);

    expect(out.kind).toBe('live');
    expect(await getSub(sid('stale-orphan'))).not.toBeNull();
  });

  it('a legacy marker (no lastLockCreatedAt) is still deleted after a complete scan', async () => {
    const u = await seedUser();
    await plantMarker(u.userId, { lockCreatedAt: new Date(Date.now() - 120_000) });
    allMock.mockResolvedValue({ items: [] });

    await recon(u);

    expect(await markerCount(u.userId)).toBe(0);
  });

  it('a stale marker whose lastLockCreatedAt is within the scan bound is deleted after a complete scan', async () => {
    const u = await seedUser();
    const lock = new Date(Date.now() - 3 * 86_400_000);
    await plantMarker(u.userId, { lockCreatedAt: lock, lastLockCreatedAt: lock });
    allMock.mockResolvedValue({ items: [] });

    await recon(u);

    expect(await markerCount(u.userId)).toBe(0);
  });

  it('a later timeout written DURING the scan (lastLockCreatedAt past `to`) keeps the marker', async () => {
    const u = await seedUser();
    const lock = new Date(Date.now() - 3 * 86_400_000);
    const m = await plantMarker(u.userId, { lockCreatedAt: lock, lastLockCreatedAt: lock });
    allMock.mockImplementation(async () => {
      await SubscriptionReconcile.updateOne(
        { _id: m._id },
        { $max: { lastLockCreatedAt: new Date(Date.now()) } },
      );
      return { items: [] };
    });

    await recon(u);

    expect(await markerCount(u.userId)).toBe(1);
    expect((await markerOf(u.userId))!.lockCreatedAt.getTime()).toBe(lock.getTime());
  });

  it('a later timeout within the scan bound does not keep the marker', async () => {
    const u = await seedUser();
    const lock = new Date(Date.now() - 600_000);
    const m = await plantMarker(u.userId, { lockCreatedAt: lock, lastLockCreatedAt: lock });
    allMock.mockImplementation(async () => {
      // Written during the scan but not past `to` (the scan's `to` is now).
      await SubscriptionReconcile.updateOne(
        { _id: m._id },
        { $max: { lastLockCreatedAt: new Date(Date.now() - 1_000) } },
      );
      return { items: [] };
    });

    await recon(u);

    expect(await markerCount(u.userId)).toBe(0);
  });
});

// ─── AC4: post-create duplicate past the budget ──────────────────────────────
describe('T-542 AC4: a post-create duplicate past CREATE_LOCK_BUDGET_MS', () => {
  const FAILED = 'billing.subscription.post_create_duplicate_cancel_failed';
  const OVER = 'billing.subscription.post_create_duplicate_budget_exceeded';

  /** A create that, while "in flight", lets a rival land and then runs past the budget. */
  function createOverBudgetWithRival(u: U, rivalId: string, rivalStatus: string, newId: string) {
    createMock.mockImplementationOnce(async () => {
      await seedRow(u.userId, rivalId, rivalStatus);
      skew = CREATE_LOCK_BUDGET_MS + 5_000;
      return { id: newId, short_url: url(newId) };
    });
  }

  describe.each([
    ['live-index-refused insert (2A)', true],
    ['post-write earlier-row check', false],
  ])('%s', (_label, withIndex) => {
    beforeEach(async () => {
      if (withIndex) await ensureSubscriptionIndexes();
    });

    it.each(['created', 'active'])(
      'rival %s: 409 subscription_exists (never 503); no cancel, no fetch; failed-cancel report + marker',
      async (rivalStatus) => {
        useSkewedClock();
        const u = await seedUser();
        createOverBudgetWithRival(u, sid(`rv-${rivalStatus}`), rivalStatus, sid('newsub'));

        const res = await subscribe(u, SOLO);

        expect(res.status).toBe(409);
        expect(res.body.error).toBe('subscription_exists');
        expect(cancelMock).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
        const failed = callsFor(errorSpy, FAILED);
        expect(failed).toHaveLength(1);
        expect(failed[0][0]).toEqual({
          userId: u.userId,
          subscriptionId: sid('newsub'),
          existingSubscriptionId: sid(`rv-${rivalStatus}`),
        });
        expect(mockCaptureMessage).toHaveBeenCalledWith(FAILED, 'warning');
        const over = callsFor(warnSpy, OVER);
        expect(over).toHaveLength(1);
        expect(over[0][0]).toMatchObject({ userId: u.userId, subscriptionId: sid('newsub') });
        const marker = await markerOf(u.userId);
        expect(marker).not.toBeNull();
        expect(marker!.planId).toBe(SOLO);
        expect(marker!.lastLockCreatedAt!.getTime()).toBe(marker!.lockCreatedAt.getTime());
        expect(observed()).not.toContain('leak-canary');
        expect(observed()).not.toContain(u.email);
        expect(await lockCount(u.userId)).toBe(0);
      },
    );

    it('within the budget the new sub is still cancelled (control)', async () => {
      const u = await seedUser();
      createMock.mockImplementationOnce(async () => {
        await seedRow(u.userId, sid('rv-ctl'), 'active');
        return { id: sid('new-ctl'), short_url: url('new-ctl') };
      });

      const res = await subscribe(u, SOLO);

      expect(res.status).toBe(409);
      expect(cancelMock).toHaveBeenCalledWith(sid('new-ctl'), false);
      expect(callsFor(warnSpy, OVER)).toHaveLength(0);
      expect(callsFor(errorSpy, FAILED)).toHaveLength(0);
      expect(await markerCount(u.userId)).toBe(0);
    });
  });
});

// ─── AC9: insert failures write the marker ───────────────────────────────────
describe('T-542 AC9: a failed insert after the Razorpay create writes the reconcile marker', () => {
  it('a non-live-conflict insert error: marker written (lock time, plan), error rethrown (5xx, not 409)', async () => {
    const u = await seedUser();
    createMock.mockResolvedValue({ id: sid('ins1'), short_url: url('ins1') });
    jest.spyOn(Subscription, 'create').mockRejectedValueOnce(new Error('db down'));
    const before = Date.now();

    const res = await subscribe(u, PRO);

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.status).not.toBe(409);
    const m = await markerOf(u.userId);
    expect(m).not.toBeNull();
    expect(m!.planId).toBe(PRO);
    expect(m!.lockCreatedAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(m!.lockCreatedAt.getTime()).toBeGreaterThanOrEqual(before - 60_000);
    expect(m!.lastLockCreatedAt!.getTime()).toBe(m!.lockCreatedAt.getTime());
    expect(await rowsOf(u.userId)).toHaveLength(0);
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it('a duplicate razorpaySubscriptionId (not the live index) also writes the marker and rethrows', async () => {
    const u = await seedUser();
    createMock.mockResolvedValue({ id: sid('ins-dup'), short_url: url('ins-dup') });
    jest.spyOn(Subscription, 'create').mockRejectedValueOnce(
      Object.assign(new Error('E11000 duplicate key'), {
        code: 11000,
        keyPattern: { razorpaySubscriptionId: 1 },
      }),
    );

    const res = await subscribe(u, SOLO);

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(await markerCount(u.userId)).toBe(1);
  });

  it('a failing retry insert (blocker ended before the re-read): marker written, retry error rethrown', async () => {
    await ensureSubscriptionIndexes();
    const u = await seedUser();
    createMock.mockImplementationOnce(async () => {
      await seedRow(u.userId, sid('rv-ret'), 'created');
      return { id: sid('ins2'), short_url: url('ins2') };
    });
    const realCreate = Subscription.create.bind(Subscription) as (
      ...a: unknown[]
    ) => Promise<unknown>;
    jest
      .spyOn(Subscription, 'create')
      .mockImplementationOnce((async (...args: unknown[]) => {
        try {
          return await realCreate(...args); // refused by the index
        } finally {
          await Subscription.updateOne(
            { razorpaySubscriptionId: sid('rv-ret') },
            { $set: { status: 'cancelled' } },
          );
        }
      }) as never)
      .mockRejectedValueOnce(new Error('retry db down'));

    const res = await subscribe(u, SOLO);

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.status).not.toBe(409);
    expect(await markerCount(u.userId)).toBe(1);
    expect(await getSub(sid('ins2'))).toBeNull();
  });

  it('a marker write failure does not mask the original error (still a 5xx, ids-only log)', async () => {
    const u = await seedUser();
    createMock.mockResolvedValue({ id: sid('ins3'), short_url: url('ins3') });
    jest.spyOn(Subscription, 'create').mockRejectedValueOnce(new Error('db down'));
    jest.spyOn(SubscriptionReconcile, 'updateOne').mockRejectedValue(new Error(canary('mk')));

    const res = await subscribe(u, SOLO);

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(observed()).not.toContain('leak-canary');
  });

  it('the happy path writes no marker', async () => {
    const u = await seedUser();
    createMock.mockResolvedValue({ id: sid('ok1'), short_url: url('ok1') });

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(200);
    expect(await markerCount(u.userId)).toBe(0);
  });
});

// ─── AC10: reconcile live with a checkout row ────────────────────────────────
describe('T-542 AC10: reconcile answers `live` with a CHECKOUT row', () => {
  beforeEach(async () => {
    await ensureSubscriptionIndexes();
  });

  it('same plan: the local checks re-run and the checkout is reused (200 with its link), no create', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('orph'), 'created', SOLO)] });
    fetchMock.mockImplementation(async (id: string) =>
      id === sid('blkco')
        ? { status: 'created', short_url: url('blkco-link') }
        : { status: 'created', short_url: url('other') },
    );
    createLosesTo(u, sid('blkco'), 'created');

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      subscriptionId: sid('blkco'),
      shortUrl: url('blkco-link'),
      planId: SOLO,
    });
    expect(createMock).not.toHaveBeenCalled();
    expect(await rowsOf(u.userId)).toHaveLength(1);
    expect(await markerCount(u.userId)).toBe(0);
  });

  it('a live (active) row from the same reconcile is still a 409 subscription_exists', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('orph2'), 'created', SOLO)] });
    createLosesTo(u, sid('blkact'), 'active');

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('subscription_exists');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('a live orphan adopted by the reconcile is still a 409', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('orph3'), 'active', SOLO)] });

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(409);
    expect(createMock).not.toHaveBeenCalled();
  });
});

// ─── ruling (a): a paid orphan reported-not-adopted answers 409 ──────────────
describe('T-542 (a): paidOrphanNotAdopted on the live outcome', () => {
  type Flagged = { kind: string; paidOrphanNotAdopted?: true };

  beforeEach(async () => {
    await ensureSubscriptionIndexes();
  });

  describe.each([
    ['same plan', SOLO],
    ['different plan', PRO],
  ])('live orphan refused because of the user checkout row (%s)', (_l, blockerPlan) => {
    it('outcome is flagged; /subscribe answers 409, no link fetch, no cancel, no create', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('paid-o'), 'active', SOLO)] });
      createLosesTo(u, sid('co-blk'), 'created', blockerPlan);

      const res = await subscribe(u, SOLO);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('subscription_exists');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(cancelMock).not.toHaveBeenCalled();
      expect(createMock).not.toHaveBeenCalled();
      expect(callsFor(errorSpy, NOT_ADOPTED)).toHaveLength(1);
      expect(await getSub(sid('paid-o'))).toBeNull();
      expect(await lockCount(u.userId)).toBe(0);
    });

    it('service level: kind live with paidOrphanNotAdopted true', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('paid-o2'), 'active', SOLO)] });
      createLosesTo(u, sid('co-blk2'), 'created', blockerPlan);

      const out = (await recon(u, SOLO)) as Flagged;

      expect(out.kind).toBe('live');
      expect(out.paidOrphanNotAdopted).toBe(true);
    });
  });

  it('target refused, then fetched live at the ~:918 check: flagged; 409 through /subscribe', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('tgt-a'), 'created', SOLO)] });
    fetchMock.mockResolvedValueOnce({ status: 'created' }).mockResolvedValue({ status: 'active' });
    createLosesTo(u, sid('co-blk3'), 'created');

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('subscription_exists');
    expect(fetchMock).toHaveBeenCalledTimes(2); // pre-adopt + ~:918; no link fetch
    expect(cancelMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
    expect(callsFor(errorSpy, NOT_ADOPTED)).toHaveLength(1);
  });

  it('an extra live orphan is reported and the outcome is flagged', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    const now = Math.floor(Date.now() / 1000);
    allMock.mockResolvedValue({
      items: [
        rzpItem(u.userId, sid('x-new'), 'active', SOLO, now + 50),
        rzpItem(u.userId, sid('x-old'), 'halted', SOLO, now + 10),
      ],
    });

    const out = (await recon(u, SOLO)) as Flagged;

    expect(out.kind).toBe('live');
    expect(out.paidOrphanNotAdopted).toBe(true);
    expect(callsFor(errorSpy, NOT_ADOPTED)).toHaveLength(1);
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it('plain checkout conflict (target refused, still a checkout): no flag; same plan reuses the link (AC10)', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('tgt-p'), 'created', SOLO)] });
    createLosesTo(u, sid('co-blk4'), 'created');

    const out = (await recon(u, SOLO)) as Flagged;
    expect(out.kind).toBe('live');
    expect(out).not.toHaveProperty('paidOrphanNotAdopted');
    expect(callsFor(errorSpy, NOT_ADOPTED)).toHaveLength(0);
  });

  it('plain checkout conflict, different-plan blocker: no 409, the blocker is cancelled and a new sub is created', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('tgt-q'), 'created', PRO)] });
    createMock.mockResolvedValue({ id: sid('fresh-q'), short_url: url('fresh-q') });
    createLosesTo(u, sid('co-blk5'), 'created', SOLO);

    const res = await subscribe(u, PRO);

    expect(res.status).toBe(200);
    expect(res.body.data.subscriptionId).toBe(sid('fresh-q'));
    expect(cancelMock).toHaveBeenCalledWith(sid('co-blk5'), false);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('D: a superseded target does not set the flag', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    const now = Math.floor(Date.now() / 1000);
    allMock.mockResolvedValue({
      items: [
        rzpItem(u.userId, sid('d-target'), 'created', SOLO, now + 50),
        rzpItem(u.userId, sid('d-late'), 'created', PRO, now + 10),
      ],
    });
    fetchMock.mockImplementation(async (id: string) =>
      id === sid('d-late') ? { status: 'active' } : { status: 'created' },
    );

    const out = await recon(u, SOLO);

    expect(out.kind).toBe('live');
    expect(out).not.toHaveProperty('paidOrphanNotAdopted');
    expect(
      callsFor(errorSpy, 'billing.subscription.reconcile_adopt_target_superseded'),
    ).toHaveLength(1);
  });
});

// ─── Arjun's ruling (22 Oct): a paid orphan left unadopted keeps the marker ──
describe('T-542 (Arjun): the marker is kept while a paid orphan is left unadopted', () => {
  const SUPERSEDED = 'billing.subscription.reconcile_adopt_target_superseded';
  const KEPT = 'billing.subscription.reconcile_marker_kept_paid_orphan';
  const NO_ANSWER = 'billing.subscription.reconcile_paid_orphan_no_answer_row';
  const WRITE_FAILED = 'billing.subscription.reconcile_reported_orphans_write_failed';

  type Out = {
    kind: string;
    paidOrphanNotAdopted?: true;
    row?: { razorpaySubscriptionId: string };
    subscriptionId?: string;
    status?: string;
    planId?: string | null;
  };
  const sentryFor = (m: string) => mockCaptureMessage.mock.calls.filter((c) => c[0] === m);
  const clearObserved = () => {
    warnSpy.mockClear();
    errorSpy.mockClear();
    infoSpy.mockClear();
    mockCaptureMessage.mockClear();
    mockSetFingerprint.mockClear();
  };
  const oldMarker = (userId: string) =>
    SubscriptionReconcile.create({
      userId,
      lockCreatedAt: new Date(Date.now() - 3_600_000),
      planId: SOLO,
      createdAt: new Date(Date.now() - 3_600_000),
    });
  /**
   * The next Subscription.create (the reconcile's adopt) "succeeds" with a row
   * that is not live, so the adopted orphan is not an answer. `seed` can write
   * a user row first (a row that landed meanwhile).
   */
  function adoptYieldsNonLiveRow(
    u: U,
    orphanId: string,
    seed?: { id: string; status: string; planId?: string },
  ) {
    return jest.spyOn(Subscription, 'create').mockImplementationOnce((async () => {
      if (seed) await seedRow(u.userId, seed.id, seed.status, seed.planId ?? SOLO);
      return {
        razorpaySubscriptionId: orphanId,
        userId: new mongoose.Types.ObjectId(u.userId),
        status: 'cancelled',
      };
    }) as never);
  }

  beforeEach(async () => {
    await ensureSubscriptionIndexes();
  });

  // ── mandatory: two subscribes in a row ──
  describe.each([
    ['same plan as the checkout', SOLO],
    ['different plan from the checkout', PRO],
  ])(
    'two /subscribe in a row, paid orphan refused by the user checkout row (%s)',
    (_l, blockerPlan) => {
      it('409 then 409: no link fetch, no cancel, no create, marker still present, checkout row unchanged', async () => {
        const u = await seedUser();
        await plantMarker(u.userId);
        allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('tw-paid'), 'active', SOLO)] });
        createLosesTo(u, sid('tw-co'), 'created', blockerPlan);

        const first = await subscribe(u, SOLO);
        expect(first.status).toBe(409);
        expect(first.body.error).toBe('subscription_exists');
        expect(await markerCount(u.userId)).toBe(1);

        const second = await subscribe(u, SOLO);
        expect(second.status).toBe(409);
        expect(second.body.error).toBe('subscription_exists');

        expect(fetchMock).not.toHaveBeenCalled();
        expect(cancelMock).not.toHaveBeenCalled();
        expect(createMock).not.toHaveBeenCalled();
        expect(await markerCount(u.userId)).toBe(1);
        const rows = await rowsOf(u.userId);
        expect(rows).toHaveLength(1);
        expect(rows[0].razorpaySubscriptionId).toBe(sid('tw-co'));
        expect(rows[0].status).toBe('created');
        expect(rows[0].planId).toBe(blockerPlan);
        expect(await getSub(sid('tw-paid'))).toBeNull();
        expect(await lockCount(u.userId)).toBe(0);
      });
    },
  );

  it('the kept marker: one warn with ids only, and the plain no-orphan case still deletes it', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('kp-paid'), 'active', SOLO)] });
    createLosesTo(u, sid('kp-co'), 'created');

    const out = (await recon(u, SOLO)) as Out;

    expect(out.paidOrphanNotAdopted).toBe(true);
    expect(await markerCount(u.userId)).toBe(1);
    const kept = callsFor(warnSpy, KEPT);
    expect(kept).toHaveLength(1);
    expect(kept[0][0]).toEqual({ userId: u.userId, subscriptionIds: [sid('kp-paid')] });
    expect(observed()).not.toContain('leak-canary');
  });

  // ── noise control: once per marker ──
  describe('reported once per marker', () => {
    it('first scan: error + Sentry fingerprinted by sub id, id recorded; second scan: warn only (alreadyReported)', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('nr-paid'), 'active', SOLO)] });
      createLosesTo(u, sid('nr-co'), 'created');

      await recon(u, SOLO);

      expect(callsFor(errorSpy, NOT_ADOPTED)).toHaveLength(1);
      expect(sentryFor(NOT_ADOPTED)).toHaveLength(1);
      expect(mockSetFingerprint).toHaveBeenCalledTimes(1);
      expect(mockSetFingerprint).toHaveBeenCalledWith([NOT_ADOPTED, sid('nr-paid')]);
      const m1 = await markerOf(u.userId);
      expect(m1!.reportedOrphanIds).toEqual([sid('nr-paid')]);

      clearObserved();
      const out2 = (await recon(u, SOLO)) as Out;

      expect(out2.kind).toBe('live');
      expect(out2.paidOrphanNotAdopted).toBe(true);
      expect(callsFor(errorSpy, NOT_ADOPTED)).toHaveLength(0);
      expect(sentryFor(NOT_ADOPTED)).toHaveLength(0);
      expect(mockSetFingerprint).not.toHaveBeenCalled();
      const warned = callsFor(warnSpy, NOT_ADOPTED);
      expect(warned).toHaveLength(1);
      expect(warned[0][0]).toEqual({
        userId: u.userId,
        subscriptionId: sid('nr-paid'),
        existingSubscriptionId: sid('nr-co'),
        alreadyReported: true,
      });
      const m2 = await markerOf(u.userId);
      expect(m2!.reportedOrphanIds).toEqual([sid('nr-paid')]);
      expect(await markerCount(u.userId)).toBe(1);
    });

    it('a new orphan appearing on the second scan is still reported at error level (the old one is warn only)', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      const now = Math.floor(Date.now() / 1000);
      allMock.mockResolvedValue({
        items: [rzpItem(u.userId, sid('nw-old'), 'active', SOLO, now + 10)],
      });
      createLosesTo(u, sid('nw-co'), 'created');
      await recon(u, SOLO);
      clearObserved();

      allMock.mockResolvedValue({
        items: [
          rzpItem(u.userId, sid('nw-old'), 'active', SOLO, now + 10),
          rzpItem(u.userId, sid('nw-new'), 'active', SOLO, now + 60),
        ],
      });
      await recon(u, SOLO);

      const errs = callsFor(errorSpy, NOT_ADOPTED);
      expect(errs).toHaveLength(1);
      expect(errs[0][0]).toMatchObject({ subscriptionId: sid('nw-new') });
      expect(sentryFor(NOT_ADOPTED)).toHaveLength(1);
      expect(mockSetFingerprint).toHaveBeenCalledTimes(1);
      expect(mockSetFingerprint).toHaveBeenCalledWith([NOT_ADOPTED, sid('nw-new')]);
      const warned = callsFor(warnSpy, NOT_ADOPTED);
      expect(warned).toHaveLength(1);
      expect(warned[0][0]).toMatchObject({ subscriptionId: sid('nw-old'), alreadyReported: true });
      const m = await markerOf(u.userId);
      expect([...m!.reportedOrphanIds!].sort()).toEqual([sid('nw-new'), sid('nw-old')].sort());
    });

    it('an id already on the marker is warn only even on the first scan of this process (the marker is the memory)', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      await SubscriptionReconcile.updateOne(
        { userId: u.userId },
        { $set: { reportedOrphanIds: [sid('pre-paid')] } },
      );
      allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('pre-paid'), 'active', SOLO)] });
      createLosesTo(u, sid('pre-co'), 'created');

      await recon(u, SOLO);

      expect(callsFor(errorSpy, NOT_ADOPTED)).toHaveLength(0);
      expect(sentryFor(NOT_ADOPTED)).toHaveLength(0);
      expect(callsFor(warnSpy, NOT_ADOPTED)).toHaveLength(1);
    });

    it('a failed $addToSet write is logged (no PII), the result is still the 409, the next scan reports again', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('wf-paid'), 'active', SOLO)] });
      createLosesTo(u, sid('wf-co'), 'created');
      const upd = jest
        .spyOn(SubscriptionReconcile, 'updateOne')
        .mockRejectedValueOnce(new Error(canary('wf')));

      const res = await subscribe(u, SOLO);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('subscription_exists');
      expect(upd).toHaveBeenCalled();
      const failed = callsFor(errorSpy, WRITE_FAILED);
      expect(failed).toHaveLength(1);
      expect(failed[0][0]).toEqual({ userId: u.userId, errName: 'Error' });
      expect(observed()).not.toContain('leak-canary');
      expect(await markerCount(u.userId)).toBe(1);
      expect((await markerOf(u.userId))!.reportedOrphanIds).toBeUndefined();
      expect(createMock).not.toHaveBeenCalled();

      clearObserved();
      upd.mockRestore();
      const out2 = (await recon(u, SOLO)) as Out;
      expect(out2.paidOrphanNotAdopted).toBe(true);
      expect(callsFor(errorSpy, NOT_ADOPTED)).toHaveLength(1);
      expect((await markerOf(u.userId))!.reportedOrphanIds).toEqual([sid('wf-paid')]);
    });
  });

  // ── fingerprint at all three report sites ──
  describe('Sentry fingerprint [marker, subscriptionId] at each not-adopted site', () => {
    it('newest orphan refused by the live index', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('fp-new'), 'active', SOLO)] });
      createLosesTo(u, sid('fp-blk'), 'active');

      await recon(u, SOLO);

      expect(mockSetFingerprint).toHaveBeenCalledTimes(1);
      expect(mockSetFingerprint).toHaveBeenCalledWith([NOT_ADOPTED, sid('fp-new')]);
      expect(mockCaptureMessage).toHaveBeenCalledWith(NOT_ADOPTED, 'error');
    });

    it('extra live orphan (the newest is adopted)', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      const now = Math.floor(Date.now() / 1000);
      allMock.mockResolvedValue({
        items: [
          rzpItem(u.userId, sid('fp-x-new'), 'active', SOLO, now + 50),
          rzpItem(u.userId, sid('fp-x-old'), 'halted', SOLO, now + 10),
        ],
      });

      await recon(u, SOLO);

      expect(mockSetFingerprint).toHaveBeenCalledTimes(1);
      expect(mockSetFingerprint).toHaveBeenCalledWith([NOT_ADOPTED, sid('fp-x-old')]);
      expect((await markerOf(u.userId))!.reportedOrphanIds).toEqual([sid('fp-x-old')]);
    });

    it('adopt target refused, then fetched live', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('fp-tgt'), 'created', SOLO)] });
      fetchMock
        .mockResolvedValueOnce({ status: 'created' })
        .mockResolvedValue({ status: 'active' });
      createLosesTo(u, sid('fp-tgt-blk'), 'created');

      await recon(u, SOLO);

      expect(mockSetFingerprint).toHaveBeenCalledTimes(1);
      expect(mockSetFingerprint).toHaveBeenCalledWith([NOT_ADOPTED, sid('fp-tgt')]);
      expect((await markerOf(u.userId))!.reportedOrphanIds).toEqual([sid('fp-tgt')]);
    });

    it('other live-conflict reports (adopted live) carry no fingerprint', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('fp-ad'), 'active', SOLO)] });

      await recon(u, SOLO);

      expect(callsFor(errorSpy, 'billing.subscription.reconcile_adopted_live')).toHaveLength(1);
      expect(mockSetFingerprint).not.toHaveBeenCalled();
    });
  });

  // ── defensive 409 ──
  describe('defensive 409: flag set, no answer row collected', () => {
    it('the user has a non-terminal row: { live, paidOrphanNotAdopted } on that row', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      await seedRow(u.userId, sid('df-row'), 'created', PRO);
      const now = Math.floor(Date.now() / 1000);
      allMock.mockResolvedValue({
        items: [
          rzpItem(u.userId, sid('df-new'), 'active', SOLO, now + 50),
          rzpItem(u.userId, sid('df-old'), 'halted', SOLO, now + 10),
        ],
      });
      adoptYieldsNonLiveRow(u, sid('df-new'));

      const out = (await recon(u, SOLO)) as Out;

      expect(out.kind).toBe('live');
      expect(out.paidOrphanNotAdopted).toBe(true);
      expect(out.row!.razorpaySubscriptionId).toBe(sid('df-row'));
      const logged = callsFor(warnSpy, NO_ANSWER);
      expect(logged).toHaveLength(1);
      expect(logged[0][0]).toEqual({
        userId: u.userId,
        subscriptionId: sid('df-old'),
        existingSubscriptionId: sid('df-row'),
      });
      expect(await markerCount(u.userId)).toBe(1);
      expect(cancelMock).not.toHaveBeenCalled();
    });

    it('a row landed during the reconcile: /subscribe answers 409, no create, no link fetch', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      const now = Math.floor(Date.now() / 1000);
      allMock.mockResolvedValue({
        items: [
          rzpItem(u.userId, sid('dr-new'), 'active', SOLO, now + 50),
          rzpItem(u.userId, sid('dr-old'), 'halted', SOLO, now + 10),
        ],
      });
      adoptYieldsNonLiveRow(u, sid('dr-new'), { id: sid('dr-row'), status: 'created' });

      const res = await subscribe(u, SOLO);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('subscription_exists');
      expect(createMock).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(cancelMock).not.toHaveBeenCalled();
      expect(await markerCount(u.userId)).toBe(1);
    });

    it('no such row: { paid_orphan_unadopted } with the orphan status and its notes plan', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      const now = Math.floor(Date.now() / 1000);
      allMock.mockResolvedValue({
        items: [
          rzpItem(u.userId, sid('nr2-new'), 'active', SOLO, now + 50),
          rzpItem(u.userId, sid('nr2-old'), 'halted', PRO, now + 10),
        ],
      });
      adoptYieldsNonLiveRow(u, sid('nr2-new'));

      const out = (await recon(u, SOLO)) as Out;

      expect(out).toEqual({
        kind: 'paid_orphan_unadopted',
        subscriptionId: sid('nr2-old'),
        status: 'halted',
        planId: PRO,
      });
      const logged = callsFor(warnSpy, NO_ANSWER);
      expect(logged).toHaveLength(1);
      expect(logged[0][0]).toEqual({
        userId: u.userId,
        subscriptionId: sid('nr2-old'),
        existingSubscriptionId: null,
      });
      expect(await markerCount(u.userId)).toBe(1);
      expect(cancelMock).not.toHaveBeenCalled();
      expect(createMock).not.toHaveBeenCalled();
    });

    it('no such row through /subscribe: normal subscription_exists 409, status = orphan Razorpay status, planId from notes, paidThrough null, no create', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      const now = Math.floor(Date.now() / 1000);
      allMock.mockResolvedValue({
        items: [
          rzpItem(u.userId, sid('nb-new'), 'active', SOLO, now + 50),
          rzpItem(u.userId, sid('nb-old'), 'halted', PRO, now + 10),
        ],
      });
      adoptYieldsNonLiveRow(u, sid('nb-new'));

      const res = await subscribe(u, SOLO);

      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        error: 'subscription_exists',
        status: 'halted',
        planId: PRO,
        paidThrough: null,
      });
      expect(createMock).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(cancelMock).not.toHaveBeenCalled();
      expect(await rowsOf(u.userId)).toHaveLength(0);
      expect(await markerCount(u.userId)).toBe(1);
      expect(await lockCount(u.userId)).toBe(0);
    });

    it('no such row, orphan plan unknown: planId null in the 409 body', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      const now = Math.floor(Date.now() / 1000);
      allMock.mockResolvedValue({
        items: [
          rzpItem(u.userId, sid('nu-new'), 'active', SOLO, now + 50),
          rzpItem(u.userId, sid('nu-old'), 'pending', 'no_such_plan', now + 10),
        ],
      });
      adoptYieldsNonLiveRow(u, sid('nu-new'));

      const res = await subscribe(u, SOLO);

      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        error: 'subscription_exists',
        status: 'pending',
        planId: null,
        paidThrough: null,
      });
      expect(createMock).not.toHaveBeenCalled();
    });
  });

  // ── sweep ──
  describe('sweep path', () => {
    it('an unadopted paid orphan keeps the marker (counted as live, nothing created or cancelled)', async () => {
      const u = await seedUser();
      await oldMarker(u.userId);
      await seedRow(u.userId, sid('sw-co'), 'created', PRO);
      allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('sw-paid'), 'active', SOLO)] });

      const counts = await runReconcileSweep();

      expect(counts).toMatchObject({ found: 1, reconciled: 1, adoptedLive: 1, failed: 0 });
      expect(await markerCount(u.userId)).toBe(1);
      expect(callsFor(errorSpy, NOT_ADOPTED)).toHaveLength(1);
      expect(mockSetFingerprint).toHaveBeenCalledWith([NOT_ADOPTED, sid('sw-paid')]);
      expect((await markerOf(u.userId))!.reportedOrphanIds).toEqual([sid('sw-paid')]);
      expect(cancelMock).not.toHaveBeenCalled();
      expect(createMock).not.toHaveBeenCalled();

      // The next sweep: same marker, warn only.
      clearObserved();
      const again = await runReconcileSweep();
      expect(again).toMatchObject({ found: 1, reconciled: 1, failed: 0 });
      expect(await markerCount(u.userId)).toBe(1);
      expect(callsFor(errorSpy, NOT_ADOPTED)).toHaveLength(0);
      expect(sentryFor(NOT_ADOPTED)).toHaveLength(0);
    });

    it('paid_orphan_unadopted counts under neither adoptedLive nor failed, and keeps the marker', async () => {
      const u = await seedUser();
      await oldMarker(u.userId);
      const now = Math.floor(Date.now() / 1000);
      allMock.mockResolvedValue({
        items: [
          rzpItem(u.userId, sid('sn-new'), 'active', SOLO, now + 50),
          rzpItem(u.userId, sid('sn-old'), 'halted', SOLO, now + 10),
        ],
      });
      adoptYieldsNonLiveRow(u, sid('sn-new'));

      const counts = await runReconcileSweep();

      expect(counts).toMatchObject({ found: 1, reconciled: 1, adoptedLive: 0, failed: 0 });
      expect(await markerCount(u.userId)).toBe(1);
    });
  });

  // ── D: superseded target ──
  describe('reconcile_adopt_target_superseded: once per marker, fingerprinted by target id', () => {
    /** target (same plan, still a checkout) superseded by d-late which turns out live. */
    function supersededScenario(u: U, tag: string) {
      const now = Math.floor(Date.now() / 1000);
      allMock.mockResolvedValue({
        items: [
          rzpItem(u.userId, sid(`${tag}-target`), 'created', SOLO, now + 50),
          rzpItem(u.userId, sid(`${tag}-late`), 'created', PRO, now + 10),
        ],
      });
      fetchMock.mockImplementation(async (id: string) =>
        id === sid(`${tag}-late`) ? { status: 'active' } : { status: 'created' },
      );
    }

    it('first scan: error + Sentry fingerprinted by target id, id recorded on the kept marker; second scan: warn only', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      supersededScenario(u, 'sp');
      createLosesTo(u, sid('sp-blk'), 'created'); // the late orphan's adopt is refused: marker kept

      await recon(u, SOLO);

      const first = callsFor(errorSpy, SUPERSEDED);
      expect(first).toHaveLength(1);
      expect(first[0][0]).toEqual({
        userId: u.userId,
        subscriptionId: sid('sp-target'),
        existingSubscriptionId: sid('sp-blk'),
      });
      expect(sentryFor(SUPERSEDED)).toHaveLength(1);
      expect(mockSetFingerprint).toHaveBeenCalledWith([SUPERSEDED, sid('sp-target')]);
      const m1 = await markerOf(u.userId);
      expect(m1).not.toBeNull();
      expect(m1!.reportedSupersededIds).toEqual([sid('sp-target')]);
      expect(m1!.reportedOrphanIds).toEqual([sid('sp-late')]);

      clearObserved();
      await recon(u, SOLO);

      expect(callsFor(errorSpy, SUPERSEDED)).toHaveLength(0);
      expect(sentryFor(SUPERSEDED)).toHaveLength(0);
      expect(mockSetFingerprint).not.toHaveBeenCalledWith([SUPERSEDED, expect.anything()]);
      const warned = callsFor(warnSpy, SUPERSEDED);
      expect(warned).toHaveLength(1);
      expect(warned[0][0]).toEqual({
        userId: u.userId,
        subscriptionId: sid('sp-target'),
        existingSubscriptionId: sid('sp-blk'),
        alreadyReported: true,
      });
      expect(cancelMock).not.toHaveBeenCalled();
      expect(await getSub(sid('sp-target'))).toBeNull();
    });

    it('the two id lists are separate: a target id in reportedSupersededIds does not silence a later not-adopted report for it', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      await SubscriptionReconcile.updateOne(
        { userId: u.userId },
        { $set: { reportedSupersededIds: [sid('sep-x')] } },
      );
      // The same sub is now paid and refused by the index.
      allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('sep-x'), 'active', SOLO)] });
      createLosesTo(u, sid('sep-blk'), 'created');

      await recon(u, SOLO);

      expect(callsFor(errorSpy, NOT_ADOPTED)).toHaveLength(1);
      expect(sentryFor(NOT_ADOPTED)).toHaveLength(1);
      expect(mockSetFingerprint).toHaveBeenCalledWith([NOT_ADOPTED, sid('sep-x')]);
      const m = await markerOf(u.userId);
      expect(m!.reportedOrphanIds).toEqual([sid('sep-x')]);
      expect(m!.reportedSupersededIds).toEqual([sid('sep-x')]);
    });

    it('the marker is deleted (no paid orphan left unadopted): superseded is reported once and nothing is recorded', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      supersededScenario(u, 'sd');

      const out = await recon(u, SOLO);

      expect(out.kind).toBe('live');
      expect(callsFor(errorSpy, SUPERSEDED)).toHaveLength(1);
      expect(mockSetFingerprint).toHaveBeenCalledWith([SUPERSEDED, sid('sd-target')]);
      expect(await markerCount(u.userId)).toBe(0);
    });
  });

  // ── regression: no paid orphan -> marker deleted as before ──
  describe('regression: with no paid orphan left unadopted the marker is deleted as before', () => {
    it('a cleanly adopted live orphan deletes the marker; no kept-marker warn, no fingerprint', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('rg-ok'), 'active', SOLO)] });

      const out = (await recon(u, SOLO)) as Out;

      expect(out.kind).toBe('live');
      expect(out).not.toHaveProperty('paidOrphanNotAdopted');
      expect(await markerCount(u.userId)).toBe(0);
      expect(callsFor(warnSpy, KEPT)).toHaveLength(0);
      expect(mockSetFingerprint).not.toHaveBeenCalled();
    });

    it('nothing at Razorpay: marker deleted', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      allMock.mockResolvedValue({ items: [] });

      const out = await recon(u, SOLO);

      expect(out.kind).toBe('none');
      expect(await markerCount(u.userId)).toBe(0);
    });

    it('the lastLockCreatedAt bound still applies: a later timeout past `to` keeps the marker after a clean adopt', async () => {
      const u = await seedUser();
      const lock = new Date(Date.now() - 3 * 86_400_000);
      const m = await plantMarker(u.userId, { lockCreatedAt: lock, lastLockCreatedAt: lock });
      allMock.mockImplementation(async () => {
        await SubscriptionReconcile.updateOne(
          { _id: m._id },
          { $max: { lastLockCreatedAt: new Date(Date.now()) } },
        );
        return { items: [rzpItem(u.userId, sid('rg-lb'), 'active', SOLO)] };
      });

      const out = await recon(u, SOLO);

      expect(out.kind).toBe('live');
      expect(await markerCount(u.userId)).toBe(1);
      expect((await markerOf(u.userId))!.lockCreatedAt.getTime()).toBe(lock.getTime());
      expect(callsFor(warnSpy, KEPT)).toHaveLength(0);
    });

    it('a failed delete is still logged and does not throw', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      allMock.mockResolvedValue({ items: [] });
      jest
        .spyOn(SubscriptionReconcile, 'deleteOne')
        .mockRejectedValueOnce(new Error(canary('del')));

      const out = await recon(u, SOLO);

      expect(out.kind).toBe('none');
      expect(
        callsFor(errorSpy, 'billing.subscription.reconcile_marker_delete_failed'),
      ).toHaveLength(1);
      expect(observed()).not.toContain('leak-canary');
    });
  });
});

// ─── Arjun's ruling (22 Oct, round 6): paidOrphanPendingAt -> reconcile first ─
describe('T-542 (Arjun): a marker kept for a paid orphan makes the next subscribe reconcile first', () => {
  const FIRST = 'billing.subscription.reconcile_first_paid_orphan_pending';
  const WRITE_FAILED = 'billing.subscription.reconcile_reported_orphans_write_failed';

  beforeEach(async () => {
    await ensureSubscriptionIndexes();
  });

  const setPending = (userId: string) =>
    SubscriptionReconcile.updateOne({ userId }, { $set: { paidOrphanPendingAt: new Date() } });

  it('(1) a kept marker has paidOrphanPendingAt; a second kept scan does not move it ($min)', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    expect((await markerOf(u.userId))!.paidOrphanPendingAt).toBeUndefined();
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('pd-paid'), 'active', SOLO)] });
    createLosesTo(u, sid('pd-co'), 'created');

    const before = Date.now();
    await recon(u, SOLO);

    const first = (await markerOf(u.userId))!.paidOrphanPendingAt;
    expect(first).toBeInstanceOf(Date);
    expect(first!.getTime()).toBeGreaterThanOrEqual(before - 1_000);

    await new Promise((r) => setTimeout(r, 25));
    await recon(u, SOLO);

    expect((await markerOf(u.userId))!.paidOrphanPendingAt!.getTime()).toBe(first!.getTime());
    expect(await markerCount(u.userId)).toBe(1);
  });

  it('(1b) the flag is written even when every orphan id was already reported (no $addToSet)', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    await SubscriptionReconcile.updateOne(
      { userId: u.userId },
      { $set: { reportedOrphanIds: [sid('pe-paid')] } },
    );
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('pe-paid'), 'active', SOLO)] });
    createLosesTo(u, sid('pe-co'), 'created');

    await recon(u, SOLO);

    expect((await markerOf(u.userId))!.paidOrphanPendingAt).toBeInstanceOf(Date);
  });

  it('(2) an ordinary create-timeout marker has no flag and keeps local-checks-first: same-plan checkout reused, no Razorpay list', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    await seedRow(u.userId, sid('or-co'), 'created', SOLO);
    allMock.mockResolvedValue({ items: [] });
    fetchMock.mockResolvedValue({ status: 'created', short_url: url('or-link') });

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ subscriptionId: sid('or-co'), shortUrl: url('or-link') });
    expect(allMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
    expect(callsFor(infoSpy, FIRST)).toHaveLength(0);
    const m = await markerOf(u.userId);
    expect(m).not.toBeNull();
    expect(m!.paidOrphanPendingAt).toBeUndefined();
  });

  it('the reconcile-first order is logged with the user id only', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    await setPending(u.userId);
    allMock.mockResolvedValue({ items: [] });
    createMock.mockResolvedValue({ id: sid('lg-new'), short_url: url('lg-new') });

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(200);
    const logged = callsFor(infoSpy, FIRST);
    expect(logged).toHaveLength(1);
    expect(logged[0][0]).toEqual({ userId: u.userId });
    expect(allMock).toHaveBeenCalled();
  });

  it('(3) pending marker, checkout C listed at Razorpay: C cancelled with no fetch first, P adopted, 409, marker (and flag) deleted', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    await setPending(u.userId);
    const now = Math.floor(Date.now() / 1000);
    await seedRow(u.userId, sid('p3-c'), 'created', SOLO);
    allMock.mockResolvedValue({
      items: [
        rzpItem(u.userId, sid('p3-c'), 'created', SOLO, now + 10),
        rzpItem(u.userId, sid('p3-p'), 'active', SOLO, now + 50),
      ],
    });

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('subscription_exists');
    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(cancelMock).toHaveBeenCalledWith(sid('p3-c'), false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
    expect((await getSub(sid('p3-c')))!.status).toBe('cancelled');
    expect((await getSub(sid('p3-p')))!.status).toBe('active');
    expect(await markerCount(u.userId)).toBe(0);
  });

  it('pending marker, C not in the scan list: nothing done to C, 409 on the flag, marker kept', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    await setPending(u.userId);
    await seedRow(u.userId, sid('p3b-c'), 'created', SOLO);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('p3b-p'), 'active', SOLO)] });

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(409);
    expect(cancelMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
    expect((await getSub(sid('p3b-c')))!.status).toBe('created');
    expect(await markerCount(u.userId)).toBe(1);
  });

  describe('(4) pending marker, orphan gone (clean scan): the skipped local checks run after the reconcile', () => {
    it('a live local row: 409, no create', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      await setPending(u.userId);
      await seedRow(u.userId, sid('p4-live'), 'active', SOLO);
      allMock.mockResolvedValue({ items: [] });

      const res = await subscribe(u, SOLO);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('subscription_exists');
      expect(allMock).toHaveBeenCalled();
      expect(createMock).not.toHaveBeenCalled();
      expect(cancelMock).not.toHaveBeenCalled();
    });

    it('a same-plan checkout: its link, no create', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      await setPending(u.userId);
      await seedRow(u.userId, sid('p4-co'), 'created', SOLO);
      allMock.mockResolvedValue({ items: [] });
      fetchMock.mockResolvedValue({ status: 'created', short_url: url('p4-link') });

      const res = await subscribe(u, SOLO);

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        subscriptionId: sid('p4-co'),
        shortUrl: url('p4-link'),
      });
      expect(allMock).toHaveBeenCalled();
      expect(createMock).not.toHaveBeenCalled();
      expect(await markerCount(u.userId)).toBe(0);
    });

    it('a different-plan checkout: cancelled by the local checks, then the new sub is created', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      await setPending(u.userId);
      await seedRow(u.userId, sid('p4-old'), 'created', SOLO);
      allMock.mockResolvedValue({ items: [] });
      createMock.mockResolvedValue({ id: sid('p4-new'), short_url: url('p4-new') });

      const res = await subscribe(u, PRO);

      expect(res.status).toBe(200);
      expect(res.body.data.subscriptionId).toBe(sid('p4-new'));
      expect(cancelMock).toHaveBeenCalledWith(sid('p4-old'), false);
      expect(createMock).toHaveBeenCalledTimes(1);
    });

    it('no rows at all: reconcile then create, as for an ordinary marker', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      await setPending(u.userId);
      allMock.mockResolvedValue({ items: [] });
      createMock.mockResolvedValue({ id: sid('p4-fresh'), short_url: url('p4-fresh') });

      const res = await subscribe(u, SOLO);

      expect(res.status).toBe(200);
      expect(createMock).toHaveBeenCalledTimes(1);
      expect(await markerCount(u.userId)).toBe(0);
    });
  });

  it('(5) the kept-marker write fails: still 409, error logged (no PII), flag absent', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('p5-paid'), 'active', SOLO)] });
    createLosesTo(u, sid('p5-co'), 'created');
    jest.spyOn(SubscriptionReconcile, 'updateOne').mockRejectedValue(new Error(canary('p5')));

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('subscription_exists');
    const failed = callsFor(errorSpy, WRITE_FAILED);
    expect(failed).toHaveLength(1);
    expect(failed[0][0]).toEqual({ userId: u.userId, errName: 'Error' });
    expect(observed()).not.toContain('leak-canary');
    expect(createMock).not.toHaveBeenCalled();
    const m = await markerOf(u.userId);
    expect(m).not.toBeNull();
    expect(m!.paidOrphanPendingAt).toBeUndefined();
  });
});

/**
 * T-527: reconcile before create at Razorpay (Arjun design (a), 21 Oct 2026).
 *  AC1/AC2: after a create timeout (SubscriptionReconcile marker), the next
 *    subscribe scans Razorpay for the user under the lock and before any create:
 *    same-plan created/authenticated -> adopted and returned (no create);
 *    other-plan -> cancelled; live -> adopted then 409; terminal -> ignored.
 *    The marker is cleared only after a complete scan; a list failure, timeout,
 *    budget overrun or the 3-page cap is 503 and keeps it.
 *  AC3: logs and Sentry carry ids only (a canary email/name never appears).
 *  AC4: the 5 min sweep reconciles markers older than 5 min; the webhook adopts
 *    an unknown sub with a valid notes.userId and no other live/checkout row.
 *  (AC5 is in t527-key-mode.test.ts; AC6 is a comment only.)
 *
 * Razorpay is mocked. Ids and the leak canary are built at runtime so gitleaks
 * sees no secret-looking literals.
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
import {
  CREATE_LOCK_BUDGET_MS,
  RAZORPAY_CALL_TIMEOUT_MS,
  RECONCILE_MAX_PAGES,
  RECONCILE_PAGE_SIZE,
  RECONCILE_WINDOW_SLACK_S,
  SubscriptionAdoptBusyError,
  handleWebhookEvent,
  reconcileRazorpaySubscriptions,
} from '../services/subscription.service';
import {
  RECONCILE_SWEEP_INTERVAL_MS,
  RECONCILE_SWEEP_MIN_AGE_MS,
  runReconcileSweep,
  startReconcileSweep,
  stopReconcileSweep,
} from '../services/subscription-reconcile-sweep.service';

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
    cb({ setTag: mockSetTag, setExtra: mockSetExtra, setTags: jest.fn() }),
}));

import { razorpay } from '../config/razorpay';
import app from '../app';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET!;
const createMock = razorpay.subscriptions.create as jest.Mock;
const allMock = razorpay.subscriptions.all as jest.Mock;
const fetchMock = razorpay.subscriptions.fetch as jest.Mock;
const cancelMock = razorpay.subscriptions.cancel as jest.Mock;

const sid = (n: string) => ['sub', '_', 't527', n].join('');
const url = (n: string) => ['https://rzp.io/', 't527-', n].join('');
// Distinctive runtime-built canaries: must never reach a log line, a Sentry
// call or a response body.
const canary = (n: string) =>
  ['leak', 'canary', n, crypto.randomBytes(6).toString('hex')].join('-');
const PII_EMAIL = () => `${canary('mail')}@example.com`;

const SOLO = 'solo_monthly';
const PRO = 'pro_monthly';

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
  const email = `t527-${++counter}@example.com`;
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
const lockCount = (userId: string) => SubscriptionCreateLock.countDocuments({ userId });
const markerOf = (userId: string) => SubscriptionReconcile.findOne({ userId }).lean();
const markerCount = (userId: string) => SubscriptionReconcile.countDocuments({ userId });

let seq = 0;
/** A Razorpay subscription as subscriptions.all returns it (with PII-ish extras). */
function rzpItem(
  userId: string,
  id: string,
  status: string,
  planId: string = SOLO,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    status,
    short_url: url(id),
    created_at: Math.floor(Date.now() / 1000) + ++seq,
    customer_id: canary('cust'),
    notes: { userId, email: canary('notemail'), name: canary('notename'), planId },
    ...extra,
  };
}
const otherUserItem = (id: string, status = 'created') =>
  rzpItem(new mongoose.Types.ObjectId().toString(), id, status);
const page = (n: number, prefix: string) =>
  Array.from({ length: n }, (_, i) => otherUserItem(sid(`${prefix}${i}`)));

async function plantMarker(
  userId: string,
  opts: { lockCreatedAt?: Date; createdAt?: Date; planId?: string } = {},
) {
  return SubscriptionReconcile.create({
    userId,
    lockCreatedAt: opts.lockCreatedAt ?? new Date(Date.now() - 120_000),
    planId: opts.planId ?? SOLO,
    createdAt: opts.createdAt ?? new Date(),
  });
}

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

let skew = 0;
function useSkewedClock() {
  skew = 0;
  const realNow = Date.now.bind(Date);
  jest.spyOn(Date, 'now').mockImplementation(() => realNow() + skew);
}

/** A create timeout, then the lock row expires (stand-in for the TTL monitor). */
async function timeoutThenLockExpiry(u: U, planId?: string) {
  createMock.mockReturnValueOnce(never());
  const first = await subscribe(u, planId);
  expect(first.status).toBe(503);
  await SubscriptionCreateLock.deleteMany({ userId: u.userId });
}

beforeEach(() => {
  skew = 0;
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
  stopReconcileSweep();
  jest.restoreAllMocks();
  skew = 0;
});

// ─── The marker ──────────────────────────────────────────────────────────────
describe('T-527 marker: a create timeout writes a durable SubscriptionReconcile', () => {
  it('create timeout -> 503 try_again, one marker with the lock time and plan, lock kept', async () => {
    collapseRazorpayTimeouts();
    const u = await seedUser();
    createMock.mockReturnValue(never());
    const before = Date.now();

    const res = await subscribe(u, PRO);

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'try_again' });
    const lock = await SubscriptionCreateLock.findOne({ userId: u.userId }).lean();
    const marker = await markerOf(u.userId);
    expect(marker).not.toBeNull();
    expect(marker!.planId).toBe(PRO);
    expect(marker!.lockCreatedAt.getTime()).toBe(lock!.createdAt.getTime());
    expect(marker!.lockCreatedAt.getTime()).toBeGreaterThanOrEqual(before - 1);
    expect(await markerCount(u.userId)).toBe(1);
    expect(allMock).not.toHaveBeenCalled();
  });

  it('the model has a unique userId index and no TTL', () => {
    const idx = SubscriptionReconcile.schema.indexes();
    const userIdx = idx.find(([k]) => JSON.stringify(k) === JSON.stringify({ userId: 1 }));
    expect(userIdx).toBeDefined();
    expect((userIdx![1] as { unique?: boolean }).unique).toBe(true);
    expect(
      idx.some(
        ([, o]) => typeof (o as { expireAfterSeconds?: number }).expireAfterSeconds === 'number',
      ),
    ).toBe(false);
  });

  it('a second row for the same user is refused by the unique index', async () => {
    const u = await seedUser();
    await SubscriptionReconcile.init();
    await plantMarker(u.userId);
    await expect(plantMarker(u.userId)).rejects.toMatchObject({ code: 11000 });
  });

  it('a later timeout keeps the EARLIEST lockCreatedAt (older marker survives a failed delete)', async () => {
    collapseRazorpayTimeouts();
    const u = await seedUser();
    const old = new Date(Date.now() - 3_600_000);
    await plantMarker(u.userId, { lockCreatedAt: old });
    allMock.mockResolvedValue({ items: [] });
    // The scan completes but its marker delete fails: the old marker stays.
    jest.spyOn(SubscriptionReconcile, 'deleteOne').mockRejectedValueOnce(new Error('db down'));
    createMock.mockReturnValue(never());

    const res = await subscribe(u);

    expect(res.status).toBe(503);
    expect(await markerCount(u.userId)).toBe(1);
    expect((await markerOf(u.userId))!.lockCreatedAt.getTime()).toBe(old.getTime());
    expect(callsFor(errorSpy, 'billing.subscription.reconcile_marker_delete_failed')).toHaveLength(
      1,
    );
  });

  it('a later timeout lowers a NEWER marker to the earlier time ($min), still one row', async () => {
    collapseRazorpayTimeouts();
    const u = await seedUser();
    const future = new Date(Date.now() + 3_600_000);
    await plantMarker(u.userId, { lockCreatedAt: future });
    allMock.mockResolvedValue({ items: [] });
    jest.spyOn(SubscriptionReconcile, 'deleteOne').mockRejectedValueOnce(new Error('db down'));
    createMock.mockReturnValue(never());

    await subscribe(u);

    const m = await markerOf(u.userId);
    expect(await markerCount(u.userId)).toBe(1);
    expect(m!.lockCreatedAt.getTime()).toBeLessThan(future.getTime());
  });

  it('a marker write that hits E11000 once is retried and the marker exists', async () => {
    collapseRazorpayTimeouts();
    const u = await seedUser();
    createMock.mockReturnValue(never());
    jest
      .spyOn(SubscriptionReconcile, 'updateOne')
      .mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }));

    const res = await subscribe(u);

    expect(res.status).toBe(503);
    expect(await markerCount(u.userId)).toBe(1);
  });

  it('a marker write FAILURE is swallowed: still 503 try_again, still one create, ids-only error log', async () => {
    collapseRazorpayTimeouts();
    const u = await seedUser();
    createMock.mockReturnValue(never());
    const secret = canary('dberr');
    jest.spyOn(SubscriptionReconcile, 'updateOne').mockRejectedValue(new Error(secret));

    const res = await subscribe(u);

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'try_again' });
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(await markerCount(u.userId)).toBe(0);
    const logged = callsFor(errorSpy, 'billing.subscription.reconcile_marker_write_failed');
    expect(logged).toHaveLength(1);
    expect(logged[0][0]).toMatchObject({ userId: u.userId });
    expect(observed()).not.toContain(secret);
    // The create-timeout report still fired.
    expect(callsFor(errorSpy, 'billing.subscription.create_timeout_unknown_outcome')).toHaveLength(
      1,
    );
  });

  it('a create that fails without timing out writes NO marker', async () => {
    const u = await seedUser();
    createMock.mockRejectedValue(new Error('boom'));
    expect((await subscribe(u)).status).toBe(500);
    expect(await markerCount(u.userId)).toBe(0);
  });
});

// ─── AC1 / AC2: the subscribe path ───────────────────────────────────────────
describe('T-527 AC1/AC2: reconcile before create on subscribe', () => {
  it('no marker: the normal path makes NO list call and creates once', async () => {
    const u = await seedUser();
    createMock.mockResolvedValue({ id: sid('plain'), short_url: url('plain') });

    const res = await subscribe(u);

    expect(res.status).toBe(200);
    expect(allMock).not.toHaveBeenCalled();
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('timeout, lock expiry, retry: the same-plan orphan is adopted, short_url returned, create NEVER called again', async () => {
    collapseRazorpayTimeouts();
    const u = await seedUser();
    await timeoutThenLockExpiry(u);
    const marker = await markerOf(u.userId);
    const orphan = rzpItem(u.userId, sid('orphan'), 'created', SOLO);
    allMock.mockResolvedValue({ items: [orphan] });

    const res = await subscribe(u);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      subscriptionId: sid('orphan'),
      shortUrl: url(sid('orphan')),
      planId: SOLO,
    });
    expect(createMock).toHaveBeenCalledTimes(1); // only the timed-out one
    const rows = await rowsOf(u.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      razorpaySubscriptionId: sid('orphan'),
      status: 'created',
      planId: SOLO,
    });
    expect(await markerCount(u.userId)).toBe(0);
    expect(await lockCount(u.userId)).toBe(0);
    expect(cancelMock).not.toHaveBeenCalled();
    // The scan window starts 300 s before the first unknown create.
    expect(allMock).toHaveBeenCalledTimes(1);
    const q = allMock.mock.calls[0][0];
    expect(q.from).toBe(
      Math.floor(marker!.lockCreatedAt.getTime() / 1000) - RECONCILE_WINDOW_SLACK_S,
    );
    expect(q.count).toBe(RECONCILE_PAGE_SIZE);
    expect(q.skip).toBe(0);
    expect(q.to).toBeGreaterThanOrEqual(q.from);
  });

  it('an authenticated same-plan orphan is adopted too (status kept)', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('auth'), 'authenticated')] });
    fetchMock.mockResolvedValue({ status: 'authenticated' }); // T-542 (b): Razorpay's status wins

    const res = await subscribe(u);

    expect(res.status).toBe(200);
    expect(res.body.data.subscriptionId).toBe(sid('auth'));
    expect((await getSub(sid('auth')))!.status).toBe('authenticated');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('a different-plan orphan is cancelled now at Razorpay, then the create proceeds; no row for the orphan', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('wrongplan'), 'created', SOLO)] });
    createMock.mockResolvedValue({ id: sid('fresh'), short_url: url('fresh') });

    const res = await subscribe(u, PRO);

    expect(res.status).toBe(200);
    expect(res.body.data.subscriptionId).toBe(sid('fresh'));
    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(cancelMock).toHaveBeenCalledWith(sid('wrongplan'), false);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(await getSub(sid('wrongplan'))).toBeNull();
    expect((await rowsOf(u.userId)).map((r) => r.razorpaySubscriptionId)).toEqual([sid('fresh')]);
    expect(await markerCount(u.userId)).toBe(0);
    // Cancel happens before the create.
    expect(cancelMock.mock.invocationCallOrder[0]).toBeLessThan(
      createMock.mock.invocationCallOrder[0],
    );
  });

  it('an orphan with no notes.planId is not adopted; it is cancelled', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    const item = rzpItem(u.userId, sid('noplan'), 'created');
    delete (item.notes as Record<string, unknown>).planId;
    allMock.mockResolvedValue({ items: [item] });
    createMock.mockResolvedValue({ id: sid('fresh2'), short_url: url('fresh2') });

    const res = await subscribe(u);

    expect(res.status).toBe(200);
    expect(cancelMock).toHaveBeenCalledWith(sid('noplan'), false);
    expect(res.body.data.subscriptionId).toBe(sid('fresh2'));
  });

  it('several same-plan orphans: the NEWEST is adopted, the others cancelled', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    const older = rzpItem(u.userId, sid('older'), 'created');
    const newer = rzpItem(u.userId, sid('newer'), 'authenticated');
    newer.created_at = older.created_at + 50;
    allMock.mockResolvedValue({ items: [older, newer] });

    const res = await subscribe(u);

    expect(res.status).toBe(200);
    expect(res.body.data.subscriptionId).toBe(sid('newer'));
    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(cancelMock).toHaveBeenCalledWith(sid('older'), false);
    expect(createMock).not.toHaveBeenCalled();
    expect((await rowsOf(u.userId)).map((r) => r.razorpaySubscriptionId)).toEqual([sid('newer')]);
  });

  it.each(['active', 'pending', 'halted', 'paused'])(
    'a %s sub at Razorpay with no local row: row adopted with that status, 409 subscription_exists, NO create',
    async (status) => {
      const u = await seedUser();
      await plantMarker(u.userId);
      allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('live'), status)] });

      const res = await subscribe(u);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('subscription_exists');
      expect(res.body.status).toBe(status);
      expect(createMock).not.toHaveBeenCalled();
      const row = await getSub(sid('live'));
      expect(row).not.toBeNull();
      expect(row!.status).toBe(status);
      expect(String(row!.userId)).toBe(u.userId);
      expect(await markerCount(u.userId)).toBe(0);
      expect(await lockCount(u.userId)).toBe(0);
      // Reported: error log + Sentry warning, ids and status only.
      const rep = callsFor(errorSpy, 'billing.subscription.reconcile_adopted_live');
      expect(rep).toHaveLength(1);
      expect(rep[0][0]).toEqual({ userId: u.userId, subscriptionId: sid('live'), status });
      expect(mockCaptureMessage).toHaveBeenCalledWith(
        'billing.subscription.reconcile_adopted_live',
        'warning',
      );
    },
  );

  it('live AND checkout together: live adopted, checkout cancelled (not adopted), 409, no create', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({
      items: [
        rzpItem(u.userId, sid('chk'), 'created', SOLO),
        rzpItem(u.userId, sid('lv'), 'active', SOLO),
      ],
    });

    const res = await subscribe(u);

    expect(res.status).toBe(409);
    expect(createMock).not.toHaveBeenCalled();
    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(cancelMock).toHaveBeenCalledWith(sid('chk'), false);
    const rows = await rowsOf(u.userId);
    expect(rows.map((r) => r.razorpaySubscriptionId)).toEqual([sid('lv')]);
    expect(await markerCount(u.userId)).toBe(0);
  });

  it('a notes.userId of ANOTHER user is ignored: nothing adopted or cancelled, create proceeds', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({
      items: [otherUserItem(sid('theirs-live'), 'active'), otherUserItem(sid('theirs-chk'))],
    });
    createMock.mockResolvedValue({ id: sid('mine'), short_url: url('mine') });

    const res = await subscribe(u);

    expect(res.status).toBe(200);
    expect(res.body.data.subscriptionId).toBe(sid('mine'));
    expect(cancelMock).not.toHaveBeenCalled();
    expect(await getSub(sid('theirs-live'))).toBeNull();
    expect(await getSub(sid('theirs-chk'))).toBeNull();
  });

  it('items with no notes, malformed items, and a non-string notes.userId are ignored', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({
      items: [
        null,
        'x',
        42,
        { id: sid('nonotes'), status: 'created' },
        { id: sid('nullnotes'), status: 'created', notes: null },
        { id: sid('arrnotes'), status: 'created', notes: [u.userId] },
        { id: sid('objid'), status: 'created', notes: { userId: { toString: () => u.userId } } },
        { status: 'created', notes: { userId: u.userId } },
        { id: sid('nostatus'), notes: { userId: u.userId } },
      ],
    });
    createMock.mockResolvedValue({ id: sid('okc'), short_url: url('okc') });

    const res = await subscribe(u);

    expect(res.status).toBe(200);
    expect(res.body.data.subscriptionId).toBe(sid('okc'));
    expect(cancelMock).not.toHaveBeenCalled();
    expect(await rowsOf(u.userId)).toHaveLength(1);
  });

  it.each(['cancelled', 'completed', 'expired'])(
    'a terminal %s sub at Razorpay is ignored: no adopt, no cancel, create proceeds',
    async (status) => {
      const u = await seedUser();
      await plantMarker(u.userId);
      allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('term'), status)] });
      createMock.mockResolvedValue({ id: sid('after'), short_url: url('after') });

      const res = await subscribe(u);

      expect(res.status).toBe(200);
      expect(await getSub(sid('term'))).toBeNull();
      expect(cancelMock).not.toHaveBeenCalled();
      expect(await markerCount(u.userId)).toBe(0);
    },
  );

  it('an unknown status string is ignored', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('weird'), 'mystery')] });
    createMock.mockResolvedValue({ id: sid('after2'), short_url: url('after2') });

    expect((await subscribe(u)).status).toBe(200);
    expect(cancelMock).not.toHaveBeenCalled();
    expect(await getSub(sid('weird'))).toBeNull();
  });

  it('an item that already has a local row is skipped (no adopt, no cancel, no second row)', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    await Subscription.create({
      userId: u.userId,
      razorpaySubscriptionId: sid('known'),
      status: 'cancelled',
      planId: SOLO,
    });
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('known'), 'created')] });
    createMock.mockResolvedValue({ id: sid('new3'), short_url: url('new3') });

    const res = await subscribe(u);

    expect(res.status).toBe(200);
    expect(res.body.data.subscriptionId).toBe(sid('new3'));
    expect(cancelMock).not.toHaveBeenCalled();
    expect(await Subscription.countDocuments({ razorpaySubscriptionId: sid('known') })).toBe(1);
    expect((await getSub(sid('known')))!.status).toBe('cancelled');
    expect(await markerCount(u.userId)).toBe(0);
  });

  // ── pagination and caps ────────────────────────────────────────────────────
  it('2 full pages + a partial page: all 3 read (skip 0/100/200), the orphan on page 3 is adopted', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock
      .mockResolvedValueOnce({ items: page(RECONCILE_PAGE_SIZE, 'a') })
      .mockResolvedValueOnce({ items: page(RECONCILE_PAGE_SIZE, 'b') })
      .mockResolvedValueOnce({
        items: [...page(5, 'c'), rzpItem(u.userId, sid('deep'), 'created', SOLO)],
      });

    const res = await subscribe(u);

    expect(res.status).toBe(200);
    expect(res.body.data.subscriptionId).toBe(sid('deep'));
    expect(allMock).toHaveBeenCalledTimes(3);
    expect(allMock.mock.calls.map((c) => c[0].skip)).toEqual([0, 100, 200]);
    expect(allMock.mock.calls.every((c) => c[0].count === 100)).toBe(true);
    expect(createMock).not.toHaveBeenCalled();
    expect(await markerCount(u.userId)).toBe(0);
  });

  it('a partial page 1 stops the scan after one call', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: page(RECONCILE_PAGE_SIZE - 1, 'p') });
    createMock.mockResolvedValue({ id: sid('one'), short_url: url('one') });

    expect((await subscribe(u)).status).toBe(200);
    expect(allMock).toHaveBeenCalledTimes(1);
  });

  it('the 3-page cap: 3 full pages -> 503 try_again, marker KEPT, nothing created/adopted/cancelled', async () => {
    const u = await seedUser();
    const m = await plantMarker(u.userId);
    expect(RECONCILE_MAX_PAGES).toBe(3);
    allMock.mockImplementation(async () => ({
      items: [...page(RECONCILE_PAGE_SIZE - 1, 'x'), rzpItem(u.userId, sid('capped'), 'created')],
    }));

    const res = await subscribe(u);

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'try_again' });
    expect(allMock).toHaveBeenCalledTimes(3);
    expect(createMock).not.toHaveBeenCalled();
    expect(cancelMock).not.toHaveBeenCalled();
    expect(await rowsOf(u.userId)).toHaveLength(0);
    expect((await markerOf(u.userId))!._id.equals(m._id)).toBe(true);
    expect(await lockCount(u.userId)).toBe(0);
    expect(callsFor(errorSpy, 'billing.subscription.reconcile_scan_capped')).toHaveLength(1);
  });

  // ── failures keep the marker ───────────────────────────────────────────────
  it('a list ERROR -> 503 try_again, marker kept, no create, response has no provider text', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    const secret = canary('listerr');
    allMock.mockRejectedValue(new Error(secret));

    const res = await subscribe(u);

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: 'try_again' });
    expect(res.text).not.toContain(secret);
    expect(createMock).not.toHaveBeenCalled();
    expect(await markerCount(u.userId)).toBe(1);
    expect(await lockCount(u.userId)).toBe(0);
    expect(observed()).not.toContain(secret);
    expect(callsFor(errorSpy, 'billing.subscription.reconcile_list_failed')[0][0]).toEqual({
      userId: u.userId,
      page: 0,
      errName: 'Error',
    });
  });

  it('a list TIMEOUT -> 503, marker kept, no create, lock released', async () => {
    collapseRazorpayTimeouts();
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockReturnValue(never());

    const res = await subscribe(u);

    expect(res.status).toBe(503);
    expect(createMock).not.toHaveBeenCalled();
    expect(await markerCount(u.userId)).toBe(1);
    expect(await lockCount(u.userId)).toBe(0);
    // A list timeout is not a create timeout: no create-timeout report.
    expect(callsFor(errorSpy, 'billing.subscription.create_timeout_unknown_outcome')).toHaveLength(
      0,
    );
  });

  it('a list error on page 2 keeps the marker and adopts nothing from page 1', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock
      .mockResolvedValueOnce({
        items: [...page(RECONCILE_PAGE_SIZE - 1, 'q'), rzpItem(u.userId, sid('p1'), 'active')],
      })
      .mockRejectedValueOnce(new Error('later page failed'));

    const res = await subscribe(u);

    expect(res.status).toBe(503);
    expect(await getSub(sid('p1'))).toBeNull();
    expect(await markerCount(u.userId)).toBe(1);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('a failed cancel of an orphan -> 503, marker kept, no create', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('stuck'), 'created', SOLO)] });
    cancelMock.mockRejectedValue(new Error('cannot cancel'));
    fetchMock.mockRejectedValue(new Error('cannot fetch'));

    const res = await subscribe(u, PRO);

    expect(res.status).toBe(503);
    expect(createMock).not.toHaveBeenCalled();
    expect(await markerCount(u.userId)).toBe(1);
  });

  it('a cancel that says the orphan is already ended counts as success', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('ended'), 'created', SOLO)] });
    cancelMock.mockRejectedValue(new Error('cannot cancel'));
    fetchMock.mockResolvedValue({ status: 'cancelled' });
    createMock.mockResolvedValue({ id: sid('go'), short_url: url('go') });

    const res = await subscribe(u, PRO);

    expect(res.status).toBe(200);
    expect(await markerCount(u.userId)).toBe(0);
  });

  it('E11000 on the adopt (a webhook wrote the row first): the row is re-read, 409, one row', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('raced'), 'active')] });
    const realCreate = Subscription.create.bind(Subscription) as (
      ...a: unknown[]
    ) => Promise<unknown>;
    jest.spyOn(Subscription, 'create').mockImplementationOnce((async (...args: unknown[]) => {
      await realCreate(...args); // the other writer wins
      throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    }) as never);

    const res = await subscribe(u);

    expect(res.status).toBe(409);
    expect(createMock).not.toHaveBeenCalled();
    expect(await Subscription.countDocuments({ razorpaySubscriptionId: sid('raced') })).toBe(1);
    expect(callsFor(infoSpy, 'billing.subscription.reconcile_adopt_raced')).toHaveLength(1);
    expect(await markerCount(u.userId)).toBe(0);
  });

  it('E11000 on a same-plan checkout adopt: the row is re-read and returned, no create', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('raced2'), 'created')] });
    const realCreate = Subscription.create.bind(Subscription) as (
      ...a: unknown[]
    ) => Promise<unknown>;
    jest.spyOn(Subscription, 'create').mockImplementationOnce((async (...args: unknown[]) => {
      await realCreate(...args);
      throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    }) as never);

    const res = await subscribe(u);

    expect(res.status).toBe(200);
    expect(res.body.data.subscriptionId).toBe(sid('raced2'));
    expect(createMock).not.toHaveBeenCalled();
    expect(await Subscription.countDocuments({ razorpaySubscriptionId: sid('raced2') })).toBe(1);
  });

  it('a non-E11000 DB error on adopt is not swallowed: marker kept, no create', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('dberr'), 'created')] });
    jest.spyOn(Subscription, 'create').mockRejectedValueOnce(new Error('db exploded') as never);

    const res = await subscribe(u);

    expect(res.status).toBe(500);
    expect(createMock).not.toHaveBeenCalled();
    expect(await markerCount(u.userId)).toBe(1);
    expect(await lockCount(u.userId)).toBe(0);
  });

  // ── the lock-time budget ───────────────────────────────────────────────────
  it('budget exceeded DURING the scan (before page 2) -> 503, marker kept, no create', async () => {
    useSkewedClock();
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockImplementation(async () => {
      skew = CREATE_LOCK_BUDGET_MS + 5_000; // the first page was slow
      return { items: page(RECONCILE_PAGE_SIZE, 'slow') };
    });

    const res = await subscribe(u);

    expect(res.status).toBe(503);
    expect(allMock).toHaveBeenCalledTimes(1);
    expect(createMock).not.toHaveBeenCalled();
    expect(await markerCount(u.userId)).toBe(1);
    expect(callsFor(warnSpy, 'billing.subscription.reconcile_budget_exceeded')).toHaveLength(1);
  });

  it('budget exceeded BEFORE the first list call -> no list call at all, 503', async () => {
    useSkewedClock();
    const u = await seedUser();
    await plantMarker(u.userId);
    // The lock is taken, then the clock jumps before the scan starts.
    const realFindOne = SubscriptionReconcile.findOne.bind(SubscriptionReconcile);
    jest.spyOn(SubscriptionReconcile, 'findOne').mockImplementation(((...a: unknown[]) => {
      skew = CREATE_LOCK_BUDGET_MS + 5_000;
      return (realFindOne as (...x: unknown[]) => unknown)(...a);
    }) as never);

    const res = await subscribe(u);

    expect(res.status).toBe(503);
    expect(allMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
    expect(await markerCount(u.userId)).toBe(1);
  });

  it('budget exceeded after the scan, before a cancel -> 503, no cancel, marker kept', async () => {
    useSkewedClock();
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockImplementation(async () => {
      skew = CREATE_LOCK_BUDGET_MS + 5_000;
      return { items: [rzpItem(u.userId, sid('late'), 'created', SOLO)] };
    });

    const res = await subscribe(u, PRO);

    expect(res.status).toBe(503);
    expect(cancelMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
    expect(await markerCount(u.userId)).toBe(1);
  });

  it('a scan within budget but ending past it: the existing create-budget check still blocks the create', async () => {
    useSkewedClock();
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockImplementation(async () => {
      skew = CREATE_LOCK_BUDGET_MS + 5_000;
      return { items: [] }; // partial page: scan complete
    });

    const res = await subscribe(u);

    expect(res.status).toBe(503);
    expect(createMock).not.toHaveBeenCalled();
  });

  // ── "in no timing can two live subs exist" ─────────────────────────────────
  it('a retry inside the lock window is 409 in-progress and does not scan or create', async () => {
    collapseRazorpayTimeouts();
    const u = await seedUser();
    createMock.mockReturnValue(never());
    expect((await subscribe(u)).status).toBe(503);

    const second = await subscribe(u);

    expect(second.status).toBe(409);
    expect(second.body).toEqual({ error: 'subscription_in_progress' });
    expect(allMock).not.toHaveBeenCalled();
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('two timeouts in a row never create a second sub while the first is unreconciled (list down)', async () => {
    collapseRazorpayTimeouts();
    const u = await seedUser();
    await timeoutThenLockExpiry(u);
    allMock.mockRejectedValue(new Error('rzp down'));

    expect((await subscribe(u)).status).toBe(503);
    await SubscriptionCreateLock.deleteMany({ userId: u.userId });
    expect((await subscribe(u)).status).toBe(503);

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(await markerCount(u.userId)).toBe(1);
  });

  it('after a scan that adopts a live sub, a further subscribe is a plain 409 (local live check), no scan', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, sid('lv2'), 'active')] });
    expect((await subscribe(u)).status).toBe(409);
    allMock.mockClear();

    const again = await subscribe(u);

    expect(again.status).toBe(409);
    expect(allMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });
});

// ─── Concurrency: the webhook adopt racing the subscribe reconcile ───────────
describe('T-527 AC2: a webhook adopt racing the subscribe reconcile', () => {
  const orphanPayload = (u: U, id: string) => ({
    subscription: {
      entity: { id, notes: { userId: u.userId, planId: SOLO, email: u.email, name: canary('n') } },
    },
  });

  it('webhook row lands DURING the scan (round 3): the webhook is refused by the lock, the subscribe adopts, the retry finds the row: one row, NO create', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    const id = sid('race-mid');
    let webhookErr: unknown;
    allMock.mockImplementation(async () => {
      // The subscribe holds the per-user lock while it scans.
      webhookErr = await handleWebhookEvent(
        'subscription.authenticated',
        orphanPayload(u, id),
      ).then(
        () => null,
        (e) => e,
      );
      return { items: [rzpItem(u.userId, id, 'created', SOLO)] };
    });
    createMock.mockResolvedValue({ id: sid('race-new'), short_url: url('race-new') });

    const res = await subscribe(u);

    expect(webhookErr).toBeInstanceOf(SubscriptionAdoptBusyError);
    expect(createMock).not.toHaveBeenCalled();
    expect(await Subscription.countDocuments({ userId: u.userId })).toBe(1);
    expect(res.status).toBe(200);
    expect(res.body.data.subscriptionId).toBe(id);
    // Razorpay's retry: the row exists now, the event is applied to it.
    await handleWebhookEvent('subscription.authenticated', orphanPayload(u, id));
    expect(await Subscription.countDocuments({ userId: u.userId })).toBe(1);
    expect((await getSub(id))!.status).toBe('authenticated');
    expect(await lockCount(u.userId)).toBe(0);
  });

  it('webhook row lands just BEFORE the subscribe: local checkout reuse, one row, no create, no scan needed', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    const id = sid('race-before');
    await handleWebhookEvent('subscription.authenticated', orphanPayload(u, id));
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, id, 'authenticated', SOLO)] });
    fetchMock.mockResolvedValue({ status: 'authenticated', short_url: url(id) });

    const res = await subscribe(u);

    expect(res.status).toBe(200);
    expect(res.body.data.subscriptionId).toBe(id);
    expect(createMock).not.toHaveBeenCalled();
    expect(await Subscription.countDocuments({ userId: u.userId })).toBe(1);
  });

  it('webhook arrives AFTER the reconcile adopted the row: the row exists once, the handler applies', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    const id = sid('race-after');
    allMock.mockResolvedValue({ items: [rzpItem(u.userId, id, 'created', SOLO)] });
    expect((await subscribe(u)).status).toBe(200);

    await handleWebhookEvent('subscription.authenticated', orphanPayload(u, id));

    expect(await Subscription.countDocuments({ razorpaySubscriptionId: id })).toBe(1);
    expect((await getSub(id))!.status).toBe('authenticated');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('truly concurrent webhook + subscribe (x8 users): 200 or 409 in-progress, never a create, never more than one non-terminal row', async () => {
    const users = await Promise.all(Array.from({ length: 8 }, () => seedUser()));
    for (const u of users) await plantMarker(u.userId);
    const ids = new Map<string, string>();
    users.forEach((u, i) => ids.set(u.userId, sid(`conc${i}`)));
    // The mock lists every user's orphan; each scan keeps only its own user's.
    allMock.mockImplementation(async () => ({
      items: users.map((u) => rzpItem(u.userId, ids.get(u.userId)!, 'created', SOLO)),
    }));
    fetchMock.mockResolvedValue({ status: 'created', short_url: url('conc') });

    const results = await Promise.all(
      users.map(async (u) => {
        const [res, wh] = await Promise.all([
          subscribe(u),
          handleWebhookEvent(
            'subscription.authenticated',
            orphanPayload(u, ids.get(u.userId)!),
          ).then(
            () => null,
            (e) => e,
          ),
        ]);
        return { res, wh };
      }),
    );

    expect(createMock).not.toHaveBeenCalled();
    for (const [i, u] of users.entries()) {
      const { res, wh } = results[i];
      if (res.status === 200) {
        expect(res.body.data.subscriptionId).toBe(ids.get(u.userId));
      } else {
        expect(res.status).toBe(409);
        expect(res.body).toEqual({ error: 'subscription_in_progress' });
      }
      // The webhook either applied or was refused by the lock (500 -> retry).
      if (wh) expect(wh).toBeInstanceOf(SubscriptionAdoptBusyError);
      const rows = await rowsOf(u.userId);
      const nonTerminal = rows.filter(
        (r) => !['cancelled', 'completed', 'expired', 'halted'].includes(r.status),
      );
      expect(nonTerminal.length).toBeLessThanOrEqual(1);
      expect(rows.length).toBeLessThanOrEqual(1);
      expect(await lockCount(u.userId)).toBe(0);
    }
  });
});

// ─── AC3: logs carry ids only ────────────────────────────────────────────────
describe('T-527 AC3: no payload, email or name reaches a log line, Sentry or a response', () => {
  it('adopt checkout + cancel path: canary email/name/customer in notes never observed', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    const a = rzpItem(u.userId, sid('l1'), 'created', SOLO);
    const b = rzpItem(u.userId, sid('l2'), 'created', PRO);
    allMock.mockResolvedValue({ items: [a, b] });
    const canaries = [
      a.notes.email,
      a.notes.name,
      a.customer_id,
      b.notes.email,
      b.notes.name,
      b.customer_id,
    ];

    const res = await subscribe(u);

    expect(res.status).toBe(200);
    const seen = observed();
    for (const c of canaries) {
      expect(seen).not.toContain(c);
      expect(res.text).not.toContain(c);
    }
    expect(seen).not.toContain(u.email);
  });

  it('live adopt + report path', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    const item = rzpItem(u.userId, sid('l3'), 'active');
    allMock.mockResolvedValue({ items: [item] });

    const res = await subscribe(u);

    expect(res.status).toBe(409);
    const seen = observed();
    for (const c of [item.notes.email, item.notes.name, item.customer_id]) {
      expect(seen).not.toContain(c);
      expect(res.text).not.toContain(c);
    }
    expect(seen).not.toContain(u.email);
  });

  it('failure paths: list error, cancel error, marker write error with canary messages', async () => {
    const msg = canary('msgs');
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockRejectedValueOnce(new Error(msg));
    expect((await subscribe(u)).status).toBe(503);

    const item = rzpItem(u.userId, sid('l4'), 'created', SOLO);
    allMock.mockResolvedValue({ items: [item] });
    cancelMock.mockRejectedValue(new Error(msg));
    fetchMock.mockRejectedValue(new Error(msg));
    const res = await subscribe(u, PRO);

    expect(res.status).toBe(503);
    const seen = observed();
    expect(seen).not.toContain(msg);
    expect(seen).not.toContain(item.notes.email);
    expect(seen).not.toContain(item.notes.name);
    expect(seen).not.toContain(u.email);
  });

  it('every reconcile log object has only id/count/status keys', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({
      items: [rzpItem(u.userId, sid('k1'), 'active'), rzpItem(u.userId, sid('k2'), 'created', PRO)],
    });
    await subscribe(u);

    const allowed = new Set([
      'userId',
      'subscriptionId',
      'status',
      'planId',
      'page',
      'pages',
      'matched',
      'adoptedLive',
      'adoptedCheckout',
      'cancelled',
      'errName',
      'elapsedMs',
      'rzpStatus',
    ]);
    const objs = [...warnSpy.mock.calls, ...errorSpy.mock.calls, ...infoSpy.mock.calls]
      .filter((c) => typeof c[1] === 'string' && /reconcile|Orphan/.test(c[1]))
      .map((c) => c[0] as Record<string, unknown>);
    expect(objs.length).toBeGreaterThan(0);
    for (const o of objs) {
      for (const k of Object.keys(o)) expect(allowed.has(k)).toBe(true);
    }
  });

  it('webhook adopt: notes email/name never observed', async () => {
    const u = await seedUser();
    const nm = canary('wn');
    const em = PII_EMAIL();
    await handleWebhookEvent('subscription.authenticated', {
      subscription: {
        entity: { id: sid('w-l'), notes: { userId: u.userId, planId: SOLO, email: em, name: nm } },
      },
    });

    expect(await getSub(sid('w-l'))).not.toBeNull();
    const seen = observed();
    expect(seen).not.toContain(nm);
    expect(seen).not.toContain(em);
  });

  it('sweep: notes never observed', async () => {
    const u = await seedUser();
    await plantMarker(u.userId, { createdAt: new Date(Date.now() - 600_000) });
    const live = rzpItem(u.userId, sid('sw-l'), 'active');
    const chk = rzpItem(u.userId, sid('sw-c'), 'created');
    allMock.mockResolvedValue({ items: [live, chk] });

    await runReconcileSweep();

    const seen = observed();
    for (const c of [
      live.notes.email,
      live.notes.name,
      live.customer_id,
      chk.notes.email,
      chk.notes.name,
    ]) {
      expect(seen).not.toContain(c);
    }
  });
});

// ─── The sweep ───────────────────────────────────────────────────────────────
describe('T-527 AC4: reconcile sweep', () => {
  const old = () => new Date(Date.now() - RECONCILE_SWEEP_MIN_AGE_MS - 60_000);

  it('constants: every 5 min, markers older than 5 min', () => {
    expect(RECONCILE_SWEEP_INTERVAL_MS).toBe(300_000);
    expect(RECONCILE_SWEEP_MIN_AGE_MS).toBe(300_000);
  });

  it('no markers: no Razorpay call, zero counts', async () => {
    const counts = await runReconcileSweep();
    expect(counts).toEqual({
      found: 0,
      reconciled: 0,
      adoptedLive: 0,
      skippedLocked: 0,
      failed: 0,
    });
    expect(allMock).not.toHaveBeenCalled();
  });

  it('only markers OLDER than 5 min are handled; a young marker is left alone', async () => {
    const oldU = await seedUser();
    const youngU = await seedUser();
    await plantMarker(oldU.userId, { createdAt: old() });
    await plantMarker(youngU.userId, { createdAt: new Date(Date.now() - 60_000) });
    allMock.mockResolvedValue({ items: [] });

    const counts = await runReconcileSweep();

    expect(counts).toMatchObject({ found: 1, reconciled: 1, failed: 0 });
    expect(allMock).toHaveBeenCalledTimes(1);
    expect(await markerCount(oldU.userId)).toBe(0);
    expect(await markerCount(youngU.userId)).toBe(1);
  });

  it('a marker exactly at the boundary is not yet due, one just past it is', async () => {
    const now = new Date();
    const edge = await seedUser();
    const past = await seedUser();
    await plantMarker(edge.userId, {
      createdAt: new Date(now.getTime() - RECONCILE_SWEEP_MIN_AGE_MS),
    });
    await plantMarker(past.userId, {
      createdAt: new Date(now.getTime() - RECONCILE_SWEEP_MIN_AGE_MS - 1),
    });
    allMock.mockResolvedValue({ items: [] });

    const counts = await runReconcileSweep(now);

    expect(counts.found).toBe(1);
    expect(await markerCount(past.userId)).toBe(0);
    expect(await markerCount(edge.userId)).toBe(1);
  });

  it('adopts and reports a live sub, cancels orphans (never adopts a checkout), clears the marker', async () => {
    const u = await seedUser();
    await plantMarker(u.userId, { createdAt: old() });
    allMock.mockResolvedValue({
      items: [
        rzpItem(u.userId, sid('sw-live'), 'active'),
        rzpItem(u.userId, sid('sw-orph'), 'created', SOLO),
      ],
    });

    const counts = await runReconcileSweep();

    expect(counts).toMatchObject({ found: 1, reconciled: 1, adoptedLive: 1, failed: 0 });
    expect((await getSub(sid('sw-live')))!.status).toBe('active');
    expect(await getSub(sid('sw-orph'))).toBeNull();
    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(cancelMock).toHaveBeenCalledWith(sid('sw-orph'), false);
    expect(await markerCount(u.userId)).toBe(0);
    expect(callsFor(errorSpy, 'billing.subscription.reconcile_adopted_live')).toHaveLength(1);
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'billing.subscription.reconcile_adopted_live',
      'warning',
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it('orphans only (even same-plan): all cancelled, none adopted', async () => {
    const u = await seedUser();
    await plantMarker(u.userId, { createdAt: old() });
    allMock.mockResolvedValue({
      items: [
        rzpItem(u.userId, sid('o1'), 'created', SOLO),
        rzpItem(u.userId, sid('o2'), 'authenticated', PRO),
      ],
    });

    const counts = await runReconcileSweep();

    expect(counts).toMatchObject({ reconciled: 1, adoptedLive: 0 });
    expect(cancelMock.mock.calls.map((c) => c[0]).sort()).toEqual([sid('o1'), sid('o2')]);
    expect(await rowsOf(u.userId)).toHaveLength(0);
    expect(await markerCount(u.userId)).toBe(0);
  });

  it('skips a user whose create lock is held: marker kept, no Razorpay call, lock untouched', async () => {
    const held = await seedUser();
    const free = await seedUser();
    await plantMarker(held.userId, { createdAt: old() });
    await plantMarker(free.userId, { createdAt: old() });
    await SubscriptionCreateLock.init();
    await SubscriptionCreateLock.create({ userId: held.userId, createdAt: new Date() });
    allMock.mockResolvedValue({ items: [] });

    const counts = await runReconcileSweep();

    expect(counts).toMatchObject({ found: 2, skippedLocked: 1, reconciled: 1 });
    expect(allMock).toHaveBeenCalledTimes(1);
    expect(await markerCount(held.userId)).toBe(1);
    expect(await markerCount(free.userId)).toBe(0);
    expect(await lockCount(held.userId)).toBe(1); // another caller's lock is not released
    expect(await lockCount(free.userId)).toBe(0); // the sweep's own lock is
  });

  it('holds the user create lock while it reconciles, and releases it after', async () => {
    const u = await seedUser();
    await plantMarker(u.userId, { createdAt: old() });
    let heldDuring = -1;
    allMock.mockImplementation(async () => {
      heldDuring = await lockCount(u.userId);
      return { items: [] };
    });

    await runReconcileSweep();

    expect(heldDuring).toBe(1);
    expect(await lockCount(u.userId)).toBe(0);
  });

  it('a subscribe for that user cannot interleave with the sweep (it gets 409 in-progress)', async () => {
    const u = await seedUser();
    await plantMarker(u.userId, { createdAt: old() });
    let during: { status: number; body: unknown } | undefined;
    allMock.mockImplementation(async () => {
      const r = await subscribe(u);
      during = { status: r.status, body: r.body };
      return { items: [] };
    });

    await runReconcileSweep();

    expect(during).toEqual({ status: 409, body: { error: 'subscription_in_progress' } });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('a list failure keeps the marker, counts failed, releases the lock, and the next user still runs', async () => {
    const bad = await seedUser();
    const good = await seedUser();
    await plantMarker(bad.userId, { createdAt: new Date(Date.now() - 900_000) });
    await plantMarker(good.userId, { createdAt: new Date(Date.now() - 600_000) });
    allMock.mockRejectedValueOnce(new Error('rzp down')).mockResolvedValue({ items: [] });

    const counts = await runReconcileSweep();

    expect(counts).toMatchObject({ found: 2, failed: 1, reconciled: 1 });
    expect(await markerCount(bad.userId)).toBe(1);
    expect(await markerCount(good.userId)).toBe(0);
    expect(await lockCount(bad.userId)).toBe(0);
  });

  it('a page-cap overrun keeps the marker', async () => {
    const u = await seedUser();
    await plantMarker(u.userId, { createdAt: old() });
    allMock.mockImplementation(async () => ({ items: page(RECONCILE_PAGE_SIZE, 'cap') }));

    const counts = await runReconcileSweep();

    expect(counts).toMatchObject({ failed: 1, reconciled: 0 });
    expect(await markerCount(u.userId)).toBe(1);
  });

  it('a lock-create error that is not E11000 counts as failed and keeps the marker', async () => {
    const u = await seedUser();
    await plantMarker(u.userId, { createdAt: old() });
    jest.spyOn(SubscriptionCreateLock, 'create').mockRejectedValueOnce(new Error('db') as never);

    const counts = await runReconcileSweep();

    expect(counts).toMatchObject({ failed: 1, reconciled: 0 });
    expect(allMock).not.toHaveBeenCalled();
    expect(await markerCount(u.userId)).toBe(1);
  });

  it('handles oldest markers first and at most 100 per run', async () => {
    const find = jest.spyOn(SubscriptionReconcile, 'find');
    await runReconcileSweep();
    expect(find).toHaveBeenCalledTimes(1);
    const q = find.mock.results[0].value as { options?: Record<string, unknown> };
    expect(q.options).toMatchObject({ limit: 100, sort: { createdAt: 1, _id: 1 } });
  });

  // ── start / stop / single runner ───────────────────────────────────────────
  describe('timer', () => {
    function stubTimers() {
      const unref = jest.fn();
      const handle = { unref } as unknown as NodeJS.Timeout;
      let tick: (() => void) | undefined;
      const setIntervalSpy = jest.spyOn(global, 'setInterval').mockImplementation(((
        fn: () => void,
        _ms?: number,
      ) => {
        tick = fn;
        return handle;
      }) as never);
      const clearSpy = jest
        .spyOn(global, 'clearInterval')
        .mockImplementation((() => undefined) as never);
      return { unref, handle, setIntervalSpy, clearSpy, tick: () => tick!() };
    }
    const hangingFind = () => {
      let release!: () => void;
      const gate = new Promise<unknown[]>((r) => {
        release = () => r([]);
      });
      const chain: Record<string, unknown> = {};
      for (const m of ['sort', 'limit', 'select']) chain[m] = () => chain;
      chain.lean = () => gate;
      const find = jest
        .spyOn(SubscriptionReconcile, 'find')
        .mockImplementation((() => chain) as never);
      return { find, release };
    };
    const flush = () => new Promise<void>((r) => setImmediate(r));

    it("start: one run now, then an unref'd interval of 5 min; a second start is a no-op", async () => {
      const t = stubTimers();
      const { find, release } = hangingFind();
      release();

      startReconcileSweep();
      startReconcileSweep();
      await flush();

      expect(t.setIntervalSpy).toHaveBeenCalledTimes(1);
      expect(t.setIntervalSpy.mock.calls[0][1]).toBe(RECONCILE_SWEEP_INTERVAL_MS);
      expect(t.unref).toHaveBeenCalledTimes(1);
      expect(find).toHaveBeenCalledTimes(1); // the immediate run
    });

    it('single runner: a tick while a run is in flight starts nothing; after it ends, the next tick runs', async () => {
      const t = stubTimers();
      const { find, release } = hangingFind();

      startReconcileSweep(1000);
      await flush();
      expect(find).toHaveBeenCalledTimes(1);

      t.tick();
      t.tick();
      await flush();
      expect(find).toHaveBeenCalledTimes(1); // overlap prevented

      release();
      await flush();
      await flush();
      t.tick();
      await flush();
      expect(find).toHaveBeenCalledTimes(2);
    });

    it('a run that throws is logged (errName only) and does not wedge the runner', async () => {
      const t = stubTimers();
      const find = jest.spyOn(SubscriptionReconcile, 'find').mockImplementation((() => {
        throw Object.assign(new Error(canary('boom')), { name: 'MongoBoom' });
      }) as never);

      startReconcileSweep(1000);
      await flush();
      await flush();
      expect(callsFor(errorSpy, 'Reconcile sweep failed')).toHaveLength(1);
      expect(callsFor(errorSpy, 'Reconcile sweep failed')[0][0]).toEqual({ errName: 'MongoBoom' });
      expect(observed()).not.toMatch(/leak-canary-boom/);

      t.tick();
      await flush();
      await flush();
      expect(find).toHaveBeenCalledTimes(2); // runner flag was reset
    });

    it('stop clears the interval; stop when not running is safe; start works again after stop', async () => {
      const t = stubTimers();
      const { release } = hangingFind();
      release();

      stopReconcileSweep(); // not running
      expect(t.clearSpy).not.toHaveBeenCalled();

      startReconcileSweep(1000);
      await flush();
      stopReconcileSweep();
      expect(t.clearSpy).toHaveBeenCalledWith(t.handle);
      stopReconcileSweep();
      expect(t.clearSpy).toHaveBeenCalledTimes(1);

      startReconcileSweep(1000);
      expect(t.setIntervalSpy).toHaveBeenCalledTimes(2);
    });

    it("the real timer is unref'd (does not hold the process open)", async () => {
      const probe = setInterval(() => undefined, 1 << 30);
      const unrefSpy = jest.spyOn(Object.getPrototypeOf(probe), 'unref');
      clearInterval(probe);
      const { release } = hangingFind();
      release();
      startReconcileSweep(60_000);
      await flush();
      expect(unrefSpy).toHaveBeenCalled();
      stopReconcileSweep();
    });
  });
});

// ─── Webhook adoption ────────────────────────────────────────────────────────
describe('T-527 webhook: unknown subscription with a valid notes.userId', () => {
  const entity = (id: string, notes: Record<string, unknown> | null, extra = {}) => ({
    subscription: { entity: { id, ...(notes ? { notes } : {}), ...extra } },
    payment: { entity: { email: PII_EMAIL(), contact: '+910000000000' } },
  });
  const UNKNOWN = 'billing.webhook.unknown_subscription';

  async function postWebhook(event: string, payload: unknown) {
    const body = JSON.stringify({ event, payload });
    const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
    return request(app)
      .post('/webhook/razorpay')
      .type('json')
      .set('x-razorpay-signature', sig)
      .send(body);
  }

  it('adopted: row written for the notes user, then the normal handler applies (authenticated); report still fires; 200', async () => {
    const u = await seedUser();
    const id = sid('wh1');

    const res = await postWebhook(
      'subscription.authenticated',
      entity(id, { userId: u.userId, planId: SOLO }),
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    const row = await getSub(id);
    expect(row).not.toBeNull();
    expect(String(row!.userId)).toBe(u.userId);
    expect(row!.planId).toBe(SOLO);
    expect(row!.status).toBe('authenticated');
    expect(await Subscription.countDocuments({ razorpaySubscriptionId: id })).toBe(1);
    expect(callsFor(errorSpy, UNKNOWN)).toHaveLength(1);
    expect(mockCaptureMessage).toHaveBeenCalledWith(UNKNOWN, 'warning');
    expect(callsFor(warnSpy, 'billing.webhook.unknown_subscription_adopted')).toHaveLength(1);
  });

  it('adopted then subscription.activated: the row becomes active', async () => {
    const u = await seedUser();
    const id = sid('wh-act');
    const now = Math.floor(Date.now() / 1000);

    const res = await postWebhook(
      'subscription.activated',
      entity(
        id,
        { userId: u.userId, planId: SOLO },
        { current_start: now, current_end: now + 2_592_000, paid_count: 1 },
      ),
    );

    expect(res.status).toBe(200);
    const row = await getSub(id);
    expect(row!.status).toBe('active');
    expect(String(row!.userId)).toBe(u.userId);
  });

  it('an unknown planId in notes: adopted without a planId', async () => {
    const u = await seedUser();
    const id = sid('wh-noplan');

    await handleWebhookEvent(
      'subscription.authenticated',
      entity(id, { userId: u.userId, planId: 'bogus_plan' }),
    );

    const row = await getSub(id);
    expect(row).not.toBeNull();
    expect(row!.planId).toBeUndefined();
  });

  it.each(['active', 'pending', 'halted', 'paused', 'created', 'authenticated'])(
    'the user already has a %s row: report only, no row for the unknown sub, 200',
    async (status) => {
      const u = await seedUser();
      await Subscription.create({
        userId: u.userId,
        razorpaySubscriptionId: sid(`have-${status}`),
        status,
        planId: SOLO,
      });
      const id = sid(`unk-${status}`);

      const res = await postWebhook(
        'subscription.authenticated',
        entity(id, { userId: u.userId, planId: SOLO }),
      );

      expect(res.status).toBe(200);
      expect(await getSub(id)).toBeNull();
      expect(await Subscription.countDocuments({ userId: u.userId })).toBe(1);
      expect(callsFor(errorSpy, UNKNOWN)).toHaveLength(1);
      expect(callsFor(warnSpy, 'billing.webhook.unknown_subscription_not_adopted')).toHaveLength(1);
    },
  );

  it('a user with only a TERMINAL row can have the unknown sub adopted', async () => {
    const u = await seedUser();
    await Subscription.create({
      userId: u.userId,
      razorpaySubscriptionId: sid('old-cancelled'),
      status: 'cancelled',
      planId: SOLO,
    });
    const id = sid('wh-after-term');

    await handleWebhookEvent(
      'subscription.authenticated',
      entity(id, { userId: u.userId, planId: SOLO }),
    );

    expect(await getSub(id)).not.toBeNull();
  });

  it.each([
    ['no notes', null],
    ['no userId', { planId: SOLO }],
    ['a non-ObjectId string', { userId: 'u-pii' }],
    ['a 12-char string', { userId: 'abcdefghijkl' }],
    ['a 24-char non-hex string', { userId: 'z'.repeat(24) }],
    ['a number', { userId: 1234567890123456 }],
    ['an object', { userId: { $ne: null } }],
    ['an array', { userId: ['a'.repeat(24)] }],
    ['an empty string', { userId: '' }],
  ] as const)('%s: report only, nothing adopted, 200', async (_label, notes) => {
    const id = sid(`inv-${_label.replace(/\W+/g, '')}`);

    const res = await postWebhook('subscription.authenticated', entity(id, notes as never));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(await getSub(id)).toBeNull();
    expect(callsFor(errorSpy, UNKNOWN)).toHaveLength(1);
    expect(mockCaptureMessage).toHaveBeenCalledWith(UNKNOWN, 'warning');
  });

  it('a valid ObjectId for a user that does not exist is NOT adopted (round 2: User lookup; report only)', async () => {
    const ghost = new mongoose.Types.ObjectId().toString();
    const id = sid('wh-ghost');

    await handleWebhookEvent(
      'subscription.authenticated',
      entity(id, { userId: ghost, planId: SOLO }),
    );

    expect(await getSub(id)).toBeNull();
    expect(callsFor(errorSpy, UNKNOWN)).toHaveLength(1);
  });

  it('a non-subscription event with an unknown sub id is never adopted', async () => {
    const u = await seedUser();
    const id = sid('wh-pay');

    const res = await postWebhook('payment.failed', entity(id, { userId: u.userId, planId: SOLO }));

    expect(res.status).toBe(200);
    expect(await getSub(id)).toBeNull();
  });

  it('a duplicate delivery (same unknown id twice) leaves exactly one row', async () => {
    const u = await seedUser();
    const id = sid('wh-dup');

    await handleWebhookEvent(
      'subscription.authenticated',
      entity(id, { userId: u.userId, planId: SOLO }),
    );
    await handleWebhookEvent(
      'subscription.authenticated',
      entity(id, { userId: u.userId, planId: SOLO }),
    );

    expect(await Subscription.countDocuments({ razorpaySubscriptionId: id })).toBe(1);
  });

  it('the same unknown id delivered concurrently (round 3): one row; the others are refused by the lock', async () => {
    const u = await seedUser();
    const id = sid('wh-conc');
    await Subscription.init();

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        handleWebhookEvent(
          'subscription.authenticated',
          entity(id, { userId: u.userId, planId: SOLO }),
        ),
      ),
    );

    expect(await Subscription.countDocuments({ razorpaySubscriptionId: id })).toBe(1);
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    for (const r of results) {
      if (r.status === 'rejected') expect(r.reason).toBeInstanceOf(SubscriptionAdoptBusyError);
    }
    expect(await lockCount(u.userId)).toBe(0);
  });

  it('a webhook adopt does not clear the reconcile marker (only a complete scan does)', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);

    await handleWebhookEvent(
      'subscription.authenticated',
      entity(sid('wh-m'), { userId: u.userId, planId: SOLO }),
    );

    expect(await markerCount(u.userId)).toBe(1);
  });
});

// ─── reconcileRazorpaySubscriptions called directly ──────────────────────────
describe('T-527 reconcileRazorpaySubscriptions (service)', () => {
  it('no marker -> { kind: none } and no Razorpay call', async () => {
    const u = await seedUser();
    expect(
      await reconcileRazorpaySubscriptions(u.userId, {
        requestedPlanId: SOLO,
        lockedAt: Date.now(),
      }),
    ).toEqual({ kind: 'none' });
    expect(allMock).not.toHaveBeenCalled();
  });

  it('empty complete scan -> none, marker deleted', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockResolvedValue({ items: [] });
    expect(
      await reconcileRazorpaySubscriptions(u.userId, {
        requestedPlanId: SOLO,
        lockedAt: Date.now(),
      }),
    ).toEqual({ kind: 'none' });
    expect(await markerCount(u.userId)).toBe(0);
  });

  it('a marker whose lockCreatedAt moved earlier during the scan is NOT deleted', async () => {
    const u = await seedUser();
    const m = await plantMarker(u.userId, { lockCreatedAt: new Date(Date.now() - 60_000) });
    allMock.mockImplementation(async () => {
      // A newer timeout lowered lockCreatedAt while the scan ran.
      await SubscriptionReconcile.updateOne(
        { _id: m._id },
        { $set: { lockCreatedAt: new Date(Date.now() - 600_000) } },
      );
      return { items: [] };
    });

    await reconcileRazorpaySubscriptions(u.userId, { requestedPlanId: SOLO, lockedAt: Date.now() });

    expect(await markerCount(u.userId)).toBe(1);
  });
});

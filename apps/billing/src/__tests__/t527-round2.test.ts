/**
 * T-527 round 2: the behaviour added after the "webhook row lands DURING the
 * scan" race, plus adversarial timing tests.
 *
 *  AC2: in no timing do two live subs (or a duplicate checkout plus a create)
 *    exist for one user. A local row for a listed sub is handled by its status
 *    (other user / own live / own same-plan checkout / own other-plan checkout /
 *    terminal); the belt re-runs the local checks after a reconcile that adopted
 *    nothing when a row landed meanwhile; a malformed list is 503.
 *  AC3: the new log lines carry ids only (a canary email/name never appears).
 *  AC4: the webhook adopt needs an existing user.
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
import {
  RECONCILE_PAGE_SIZE,
  SubscriptionAdoptBusyError,
  handleWebhookEvent,
} from '../services/subscription.service';
import {
  runReconcileSweep,
  stopReconcileSweep,
  RECONCILE_SWEEP_MIN_AGE_MS,
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

const sid = (n: string) => ['sub', '_', 't527r2', n].join('');
const url = (n: string) => ['https://rzp.io/', 't527r2-', n].join('');
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
  const email = `t527r2-${++counter}@example.com`;
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
const markerOf = (userId: string) => SubscriptionReconcile.findOne({ userId }).lean();
const markerCount = (userId: string) => SubscriptionReconcile.countDocuments({ userId });

let seq = 0;
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
const canariesOf = (item: ReturnType<typeof rzpItem>) => [
  item.notes.email,
  item.notes.name,
  item.customer_id,
];

async function plantMarker(userId: string, opts: { createdAt?: Date } = {}) {
  return SubscriptionReconcile.create({
    userId,
    lockCreatedAt: new Date(Date.now() - 120_000),
    planId: SOLO,
    createdAt: opts.createdAt ?? new Date(),
  });
}

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

const orphanPayload = (u: U, id: string, planId = SOLO) => ({
  subscription: {
    entity: { id, notes: { userId: u.userId, planId, email: u.email, name: canary('n') } },
  },
});

/** Run a webhook and return the error it threw (null when it was applied). */
const webhookOutcome = (event: string, payload: unknown) =>
  handleWebhookEvent(event, payload as never).then(
    () => null,
    (e: unknown) => e,
  );

const OTHER_USER_ROW = 'billing.subscription.reconcile_row_of_other_user';
const MALFORMED = 'billing.subscription.reconcile_list_malformed';
const NO_USER = 'billing.webhook.unknown_subscription_no_user';
const CANCELLED_PAID = 'billing.resubscribe.cancelled_paid_sub';

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
  stopReconcileSweep();
  jest.restoreAllMocks();
});

// ─── A local row for a listed sub, written during the scan ───────────────────
describe('T-527 round 2: a listed sub that has a local row (written during the scan)', () => {
  /** The list call writes `row` first, then answers with `items` (a webhook landing mid-scan). */
  function rowLandsDuringScan(
    row: { userId: string; id: string; status: string; planId?: string },
    items: unknown[],
  ) {
    allMock.mockImplementation(async () => {
      await Subscription.create({
        userId: row.userId,
        razorpaySubscriptionId: row.id,
        status: row.status,
        planId: row.planId ?? SOLO,
      });
      return { items };
    });
  }

  describe("another user's row", () => {
    it.each(['created', 'active'])(
      "item %s whose local row is another user's: skipped with a warn (ids only), no adopt, no cancel, no 409, create proceeds",
      async (status) => {
        const u = await seedUser();
        const other = await seedUser();
        await plantMarker(u.userId);
        const id = sid(`other-${status}`);
        const item = rzpItem(u.userId, id, status, SOLO);
        rowLandsDuringScan({ userId: other.userId, id, status: 'created' }, [item]);
        createMock.mockResolvedValue({ id: sid(`new-o-${status}`), short_url: url('new-o') });

        const res = await subscribe(u);

        expect(res.status).toBe(200);
        expect(res.body.data.subscriptionId).toBe(sid(`new-o-${status}`));
        expect(createMock).toHaveBeenCalledTimes(1);
        expect(cancelMock).not.toHaveBeenCalled();
        // The other user's row is untouched, and nothing was written for u under that id.
        const row = await getSub(id);
        expect(String(row!.userId)).toBe(other.userId);
        expect(row!.status).toBe('created');
        expect(await Subscription.countDocuments({ razorpaySubscriptionId: id })).toBe(1);
        expect(await markerCount(u.userId)).toBe(0);
        const warned = callsFor(warnSpy, OTHER_USER_ROW);
        expect(warned).toHaveLength(1);
        expect(warned[0][0]).toEqual({ userId: u.userId, subscriptionId: id });
        for (const c of canariesOf(item)) expect(observed()).not.toContain(c);
        expect(observed()).not.toContain(u.email);
      },
    );
  });

  describe('own live row', () => {
    it.each(['active', 'pending', 'halted', 'paused'])(
      'a %s row written mid-scan: 409, no create, no cancel, one row, marker cleared',
      async (status) => {
        const u = await seedUser();
        await plantMarker(u.userId);
        const id = sid(`live-${status}`);
        // Razorpay's (stale) list says created; the local row is already live.
        const item = rzpItem(u.userId, id, 'created', SOLO);
        rowLandsDuringScan({ userId: u.userId, id, status }, [item]);

        const res = await subscribe(u);

        expect(res.status).toBe(409);
        expect(createMock).not.toHaveBeenCalled();
        expect(cancelMock).not.toHaveBeenCalled();
        expect(await rowsOf(u.userId)).toHaveLength(1);
        expect((await getSub(id))!.status).toBe(status);
        expect(await markerCount(u.userId)).toBe(0);
        expect(await lockCount(u.userId)).toBe(0);
        for (const c of canariesOf(item)) expect(res.text).not.toContain(c);
      },
    );

    it('a live local row AND an unknown orphan: 409, the orphan is cancelled, not adopted', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      const liveId = sid('lo-live');
      const orphanId = sid('lo-orph');
      rowLandsDuringScan({ userId: u.userId, id: liveId, status: 'active' }, [
        rzpItem(u.userId, liveId, 'active'),
        rzpItem(u.userId, orphanId, 'created', SOLO),
      ]);

      const res = await subscribe(u);

      expect(res.status).toBe(409);
      expect(createMock).not.toHaveBeenCalled();
      expect(cancelMock).toHaveBeenCalledTimes(1);
      expect(cancelMock).toHaveBeenCalledWith(orphanId, false);
      expect(await getSub(orphanId)).toBeNull();
      expect(await nonTerminalCount(u.userId)).toBe(1);
    });
  });

  describe('own checkout, same plan', () => {
    it('a webhook during the scan (round 3): refused by the lock, the subscribe adopts the listed sub, the retry finds the row; one row, no create, no cancel', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      const id = sid('same');
      const item = rzpItem(u.userId, id, 'created', SOLO);
      let during: unknown;
      allMock.mockImplementation(async () => {
        during = await webhookOutcome('subscription.authenticated', orphanPayload(u, id, SOLO));
        return { items: [item] };
      });

      const res = await subscribe(u, SOLO);

      expect(during).toBeInstanceOf(SubscriptionAdoptBusyError);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ subscriptionId: id, shortUrl: url(id), planId: SOLO });
      expect(createMock).not.toHaveBeenCalled();
      expect(cancelMock).not.toHaveBeenCalled();
      expect(await rowsOf(u.userId)).toHaveLength(1);
      expect(await markerCount(u.userId)).toBe(0);
      // Razorpay retries the refused event: the row exists, the event applies.
      expect(
        await webhookOutcome('subscription.authenticated', orphanPayload(u, id, SOLO)),
      ).toBeNull();
      expect(await rowsOf(u.userId)).toHaveLength(1);
      expect(await nonTerminalCount(u.userId)).toBe(1);
      expect(await lockCount(u.userId)).toBe(0);
      for (const c of canariesOf(item)) expect(observed()).not.toContain(c);
    });

    it('a plain checkout row (created) for the requested plan: reused, one row', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      const id = sid('same2');
      rowLandsDuringScan({ userId: u.userId, id, status: 'created', planId: PRO }, [
        rzpItem(u.userId, id, 'created', PRO),
      ]);

      const res = await subscribe(u, PRO);

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ subscriptionId: id, planId: PRO });
      expect(createMock).not.toHaveBeenCalled();
      expect(await rowsOf(u.userId)).toHaveLength(1);
    });

    it('an unknown orphan newer than the own same-plan checkout row: the orphan is adopted, the older row cancelled; one non-terminal row, no create', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      const rowId = sid('mix-row');
      const orphanId = sid('mix-orph');
      const older = rzpItem(u.userId, rowId, 'created', SOLO, {
        created_at: Math.floor(Date.now() / 1000) - 100,
      });
      const newer = rzpItem(u.userId, orphanId, 'created', SOLO, {
        created_at: Math.floor(Date.now() / 1000),
      });
      rowLandsDuringScan({ userId: u.userId, id: rowId, status: 'created' }, [older, newer]);

      const res = await subscribe(u, SOLO);

      expect(res.status).toBe(200);
      expect(res.body.data.subscriptionId).toBe(orphanId);
      expect(createMock).not.toHaveBeenCalled();
      expect(cancelMock).toHaveBeenCalledTimes(1);
      expect(cancelMock).toHaveBeenCalledWith(rowId, false);
      expect((await getSub(rowId))!.status).toBe('cancelled');
      expect(await nonTerminalCount(u.userId)).toBe(1);
    });
  });

  describe('own checkout, different plan', () => {
    it('cancelled at Razorpay and locally, then exactly one create for the requested plan', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      const id = sid('diff');
      rowLandsDuringScan({ userId: u.userId, id, status: 'created', planId: PRO }, [
        rzpItem(u.userId, id, 'created', PRO),
      ]);
      createMock.mockResolvedValue({ id: sid('diff-new'), short_url: url('diff-new') });

      const res = await subscribe(u, SOLO);

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ subscriptionId: sid('diff-new'), planId: SOLO });
      expect(cancelMock).toHaveBeenCalledTimes(1);
      expect(cancelMock).toHaveBeenCalledWith(id, false);
      const cancelled = await getSub(id);
      expect(cancelled!.status).toBe('cancelled');
      expect(cancelled!.cancelledAt).toBeTruthy();
      expect(createMock).toHaveBeenCalledTimes(1);
      expect(await nonTerminalCount(u.userId)).toBe(1);
      expect(await markerCount(u.userId)).toBe(0);
    });

    it('the guarded local cancel misses because the row turned ACTIVE: 409, no create, reported as a cancelled paid sub', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      const id = sid('diff-paid');
      rowLandsDuringScan({ userId: u.userId, id, status: 'created', planId: PRO }, [
        rzpItem(u.userId, id, 'created', PRO),
      ]);
      // The payment webhook lands while the cancel is in flight.
      cancelMock.mockImplementation(async () => {
        await Subscription.updateOne(
          { razorpaySubscriptionId: id },
          { $set: { status: 'active' } },
        );
        return {};
      });

      const res = await subscribe(u, SOLO);

      expect(res.status).toBe(409);
      expect(createMock).not.toHaveBeenCalled();
      expect((await getSub(id))!.status).toBe('active');
      expect(await rowsOf(u.userId)).toHaveLength(1);
      const reported = callsFor(errorSpy, CANCELLED_PAID);
      expect(reported).toHaveLength(1);
      expect(reported[0][0]).toEqual({ subscriptionId: id });
      expect(mockCaptureMessage).toHaveBeenCalledWith(CANCELLED_PAID, 'warning');
    });

    it.each(['pending', 'halted', 'paused'])(
      'the row turned %s meanwhile: 409, no create, NOT reported as a cancelled paid sub',
      async (status) => {
        const u = await seedUser();
        await plantMarker(u.userId);
        const id = sid(`diff-${status}`);
        rowLandsDuringScan({ userId: u.userId, id, status: 'created', planId: PRO }, [
          rzpItem(u.userId, id, 'created', PRO),
        ]);
        cancelMock.mockImplementation(async () => {
          await Subscription.updateOne({ razorpaySubscriptionId: id }, { $set: { status } });
          return {};
        });

        const res = await subscribe(u, SOLO);

        expect(res.status).toBe(409);
        expect(createMock).not.toHaveBeenCalled();
        expect(callsFor(errorSpy, CANCELLED_PAID)).toHaveLength(0);
        expect(await nonTerminalCount(u.userId)).toBe(1);
      },
    );

    it('the row turned terminal (cancelled by a webhook) meanwhile: the guarded miss is not live, create proceeds once', async () => {
      const u = await seedUser();
      await plantMarker(u.userId);
      const id = sid('diff-term');
      rowLandsDuringScan({ userId: u.userId, id, status: 'created', planId: PRO }, [
        rzpItem(u.userId, id, 'created', PRO),
      ]);
      cancelMock.mockImplementation(async () => {
        await Subscription.updateOne(
          { razorpaySubscriptionId: id },
          { $set: { status: 'cancelled' } },
        );
        return {};
      });
      createMock.mockResolvedValue({ id: sid('diff-term-new'), short_url: url('dtn') });

      const res = await subscribe(u, SOLO);

      expect(res.status).toBe(200);
      expect(createMock).toHaveBeenCalledTimes(1);
      expect(await nonTerminalCount(u.userId)).toBe(1);
    });

    it('a failed Razorpay cancel of the row-backed checkout: 503, no local write, no create, marker kept', async () => {
      const u = await seedUser();
      const m = await plantMarker(u.userId);
      const id = sid('diff-fail');
      rowLandsDuringScan({ userId: u.userId, id, status: 'created', planId: PRO }, [
        rzpItem(u.userId, id, 'created', PRO),
      ]);
      cancelMock.mockRejectedValue(new Error(canary('cancel')));
      fetchMock.mockRejectedValue(new Error(canary('fetch')));

      const res = await subscribe(u, SOLO);

      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: 'try_again' });
      expect(createMock).not.toHaveBeenCalled();
      expect((await getSub(id))!.status).toBe('created');
      expect((await markerOf(u.userId))!._id.equals(m._id)).toBe(true);
    });
  });

  describe('own terminal row', () => {
    it.each(['cancelled', 'expired', 'completed'])(
      'a %s row for a listed created item is ignored: no cancel, no adopt, create proceeds',
      async (status) => {
        const u = await seedUser();
        await plantMarker(u.userId);
        const id = sid(`term-${status}`);
        rowLandsDuringScan({ userId: u.userId, id, status }, [rzpItem(u.userId, id, 'created')]);
        createMock.mockResolvedValue({ id: sid(`tn-${status}`), short_url: url('tn') });

        const res = await subscribe(u);

        expect(res.status).toBe(200);
        expect(res.body.data.subscriptionId).toBe(sid(`tn-${status}`));
        expect(cancelMock).not.toHaveBeenCalled();
        expect((await getSub(id))!.status).toBe(status);
      },
    );
  });

  describe('the sweep leaves items that have a local row alone', () => {
    const old = () => new Date(Date.now() - RECONCILE_SWEEP_MIN_AGE_MS - 60_000);

    it.each(['created', 'active', 'cancelled'])(
      'a %s local row: no cancel, no adopt, no second row; the marker is cleared',
      async (status) => {
        const u = await seedUser();
        await plantMarker(u.userId, { createdAt: old() });
        const id = sid(`sw-${status}`);
        await Subscription.create({
          userId: u.userId,
          razorpaySubscriptionId: id,
          status,
          planId: SOLO,
        });
        allMock.mockResolvedValue({ items: [rzpItem(u.userId, id, 'created')] });

        const counts = await runReconcileSweep();

        expect(counts).toMatchObject({ found: 1, reconciled: 1, failed: 0 });
        expect(cancelMock).not.toHaveBeenCalled();
        expect(await rowsOf(u.userId)).toHaveLength(1);
        expect((await getSub(id))!.status).toBe(status);
        expect(await markerCount(u.userId)).toBe(0);
      },
    );

    it('a row of another user is skipped by the sweep with the same warn', async () => {
      const u = await seedUser();
      const other = await seedUser();
      await plantMarker(u.userId, { createdAt: old() });
      const id = sid('sw-other');
      await Subscription.create({
        userId: other.userId,
        razorpaySubscriptionId: id,
        status: 'active',
        planId: SOLO,
      });
      allMock.mockResolvedValue({ items: [rzpItem(u.userId, id, 'active')] });

      const counts = await runReconcileSweep();

      expect(counts).toMatchObject({ reconciled: 1, adoptedLive: 0, failed: 0 });
      expect(callsFor(warnSpy, OTHER_USER_ROW)[0][0]).toEqual({
        userId: u.userId,
        subscriptionId: id,
      });
      expect(cancelMock).not.toHaveBeenCalled();
    });
  });
});

// ─── The belt: local checks re-run after a reconcile that adopted nothing ────
describe('T-527 round 2: the belt re-check after the reconcile', () => {
  /** The list call writes a row the list itself does not show. */
  function unlistedRowLands(row: { userId: string; id: string; status: string; planId?: string }) {
    allMock.mockImplementation(async () => {
      await Subscription.create({
        userId: row.userId,
        razorpaySubscriptionId: row.id,
        status: row.status,
        planId: row.planId ?? SOLO,
        // A pending/halted/paused sub only blocks while still paid (T-444b).
        paidThrough: new Date(Date.now() + 10 * 86_400_000),
      });
      return { items: [] };
    });
  }

  it('a same-plan checkout row created during reconcile is REUSED: no create, one row', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    const id = sid('belt-reuse');
    unlistedRowLands({ userId: u.userId, id, status: 'created', planId: SOLO });
    fetchMock.mockResolvedValue({ status: 'created', short_url: url('belt-reuse-fetched') });

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      subscriptionId: id,
      shortUrl: url('belt-reuse-fetched'),
      planId: SOLO,
    });
    expect(createMock).not.toHaveBeenCalled();
    expect(cancelMock).not.toHaveBeenCalled();
    expect(await rowsOf(u.userId)).toHaveLength(1);
  });

  it.each(['active', 'pending', 'halted', 'paused'])(
    'a %s row created during reconcile blocks the create: 409',
    async (status) => {
      const u = await seedUser();
      await plantMarker(u.userId);
      unlistedRowLands({ userId: u.userId, id: sid(`belt-${status}`), status });

      const res = await subscribe(u);

      expect(res.status).toBe(409);
      expect(createMock).not.toHaveBeenCalled();
      expect(await rowsOf(u.userId)).toHaveLength(1);
    },
  );

  it('a different-plan checkout created during reconcile is cancelled (Razorpay + local), then one create', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    const id = sid('belt-diff');
    unlistedRowLands({ userId: u.userId, id, status: 'created', planId: PRO });
    createMock.mockResolvedValue({ id: sid('belt-diff-new'), short_url: url('bdn') });

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(200);
    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(cancelMock).toHaveBeenCalledWith(id, false);
    expect((await getSub(id))!.status).toBe('cancelled');
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(await nonTerminalCount(u.userId)).toBe(1);
  });

  it("another user's row, or a terminal row, created during reconcile does not stop the create", async () => {
    const u = await seedUser();
    const other = await seedUser();
    await plantMarker(u.userId);
    allMock.mockImplementation(async () => {
      await Subscription.create({
        userId: other.userId,
        razorpaySubscriptionId: sid('belt-other'),
        status: 'active',
        planId: SOLO,
      });
      await Subscription.create({
        userId: u.userId,
        razorpaySubscriptionId: sid('belt-term'),
        status: 'cancelled',
        planId: SOLO,
      });
      return { items: [] };
    });
    createMock.mockResolvedValue({ id: sid('belt-ok'), short_url: url('belt-ok') });

    const res = await subscribe(u);

    expect(res.status).toBe(200);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cancelMock).not.toHaveBeenCalled();
  });

  describe("does NOT fire in the t516 'only the newest checkout is cancelled' scenario", () => {
    async function seedTwoCheckouts(u: U) {
      await Subscription.create({
        userId: u.userId,
        razorpaySubscriptionId: sid('older'),
        status: 'created',
        planId: 'solo_monthly',
        createdAt: new Date(Date.now() - 2 * 86_400_000),
      });
      await Subscription.create({
        userId: u.userId,
        razorpaySubscriptionId: sid('newest'),
        status: 'created',
        planId: 'pro_monthly',
        createdAt: new Date(Date.now() - 86_400_000),
      });
      createMock.mockResolvedValue({ id: sid('t516-new'), short_url: url('t516-new') });
    }

    it('with a marker and an empty complete scan: the newest is cancelled once, the older row is left, one create', async () => {
      const u = await seedUser();
      await seedTwoCheckouts(u);
      await plantMarker(u.userId);
      allMock.mockResolvedValue({ items: [] });

      const res = await subscribe(u, 'solo_yearly');

      expect(res.status).toBe(200);
      expect(allMock).toHaveBeenCalledTimes(1);
      expect(cancelMock).toHaveBeenCalledTimes(1);
      expect(cancelMock).toHaveBeenCalledWith(sid('newest'), false);
      expect((await getSub(sid('newest')))!.status).toBe('cancelled');
      expect((await getSub(sid('older')))!.status).toBe('created');
      expect(createMock).toHaveBeenCalledTimes(1);
      // The older checkout was never fetched (a re-run would have cancelled it).
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('without a marker: same result, no list call', async () => {
      const u = await seedUser();
      await seedTwoCheckouts(u);

      const res = await subscribe(u, 'solo_yearly');

      expect(res.status).toBe(200);
      expect(allMock).not.toHaveBeenCalled();
      expect(cancelMock).toHaveBeenCalledTimes(1);
      expect(cancelMock).toHaveBeenCalledWith(sid('newest'), false);
      expect((await getSub(sid('older')))!.status).toBe('created');
      expect(createMock).toHaveBeenCalledTimes(1);
    });
  });

  it('the row the FIRST pass itself cancelled (created before the request) does not re-trigger the belt', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    await Subscription.create({
      userId: u.userId,
      razorpaySubscriptionId: sid('first-pass'),
      status: 'created',
      planId: PRO,
    });
    allMock.mockResolvedValue({ items: [] });
    createMock.mockResolvedValue({ id: sid('fp-new'), short_url: url('fp-new') });

    const res = await subscribe(u, SOLO);

    expect(res.status).toBe(200);
    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});

// ─── A malformed list is not an empty page ───────────────────────────────────
describe('T-527 round 2: a malformed subscriptions.all response', () => {
  const bodies: [string, unknown][] = [
    ['null', null],
    ['undefined', undefined],
    ['an empty object', {}],
    ['items is a string', { items: 'x' }],
    ['items is null', { items: null }],
    ['items is an object', { items: { 0: 'x' } }],
    ['an array body with no items key', []],
  ];

  it.each(bodies)(
    '%s: 503 try_again, marker KEPT, no create, no cancel, no row, lock released, ids-only error log',
    async (_label, body) => {
      const u = await seedUser();
      const m = await plantMarker(u.userId);
      allMock.mockResolvedValue(body);

      const res = await subscribe(u);

      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: 'try_again' });
      expect(createMock).not.toHaveBeenCalled();
      expect(cancelMock).not.toHaveBeenCalled();
      expect(await rowsOf(u.userId)).toHaveLength(0);
      expect((await markerOf(u.userId))!._id.equals(m._id)).toBe(true);
      expect(await lockCount(u.userId)).toBe(0);
      const logged = callsFor(errorSpy, MALFORMED);
      expect(logged).toHaveLength(1);
      expect(logged[0][0]).toEqual({ userId: u.userId, page: 0 });
      // Not the generic list-failure line: this is its own case.
      expect(callsFor(errorSpy, 'billing.subscription.reconcile_list_failed')).toHaveLength(0);
    },
  );

  it('the body is never logged (a canary inside a malformed body does not appear)', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    const secret = canary('body');
    allMock.mockResolvedValue({ items: 'x', error: { description: secret }, email: secret });

    const res = await subscribe(u);

    expect(res.status).toBe(503);
    expect(observed()).not.toContain(secret);
    expect(res.text).not.toContain(secret);
  });

  it('a malformed SECOND page: page index 1 logged, nothing from page 1 is adopted or cancelled, marker kept', async () => {
    const u = await seedUser();
    const m = await plantMarker(u.userId);
    const mine = rzpItem(u.userId, sid('mf-live'), 'active');
    const filler = Array.from({ length: RECONCILE_PAGE_SIZE - 1 }, (_, i) =>
      rzpItem(new mongoose.Types.ObjectId().toString(), sid(`mf-${i}`), 'created'),
    );
    allMock
      .mockResolvedValueOnce({ items: [mine, ...filler] })
      .mockResolvedValueOnce({ items: null });

    const res = await subscribe(u);

    expect(res.status).toBe(503);
    expect(callsFor(errorSpy, MALFORMED)[0][0]).toEqual({ userId: u.userId, page: 1 });
    expect(await getSub(sid('mf-live'))).toBeNull();
    expect(cancelMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
    expect((await markerOf(u.userId))!._id.equals(m._id)).toBe(true);
  });

  it('a retry after a malformed response reconciles once the list is well-formed (the marker survived)', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    const id = sid('mf-retry');
    allMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ items: [rzpItem(u.userId, id, 'created', SOLO)] });

    expect((await subscribe(u)).status).toBe(503);
    const res = await subscribe(u);

    expect(res.status).toBe(200);
    expect(res.body.data.subscriptionId).toBe(id);
    expect(createMock).not.toHaveBeenCalled();
    expect(await markerCount(u.userId)).toBe(0);
  });

  it('the sweep counts a malformed response as failed and keeps the marker', async () => {
    const u = await seedUser();
    await plantMarker(u.userId, {
      createdAt: new Date(Date.now() - RECONCILE_SWEEP_MIN_AGE_MS - 60_000),
    });
    allMock.mockResolvedValue({});

    const counts = await runReconcileSweep();

    expect(counts).toMatchObject({ found: 1, reconciled: 0, failed: 1 });
    expect(await markerCount(u.userId)).toBe(1);
    expect(cancelMock).not.toHaveBeenCalled();
    expect(await lockCount(u.userId)).toBe(0);
  });
});

// ─── Webhook adopt needs an existing user ────────────────────────────────────
describe('T-527 round 2: webhook adopt with a missing user', () => {
  async function postWebhook(event: string, payload: unknown) {
    const body = JSON.stringify({ event, payload });
    const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
    return request(app)
      .post('/webhook/razorpay')
      .type('json')
      .set('x-razorpay-signature', sig)
      .send(body);
  }
  const payloadFor = (id: string, userId: string, em: string, nm: string) => ({
    subscription: { entity: { id, notes: { userId, planId: SOLO, email: em, name: nm } } },
    payment: { entity: { email: em, contact: '+910000000000' } },
  });

  it('a valid ObjectId with no User: report only, no row, 200, warn with ids only', async () => {
    const ghost = new mongoose.Types.ObjectId().toString();
    const id = sid('wh-ghost');
    const em = `${canary('wm')}@example.com`;
    const nm = canary('wn');

    const res = await postWebhook('subscription.authenticated', payloadFor(id, ghost, em, nm));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(await getSub(id)).toBeNull();
    expect(await Subscription.countDocuments({})).toBe(0);
    const warned = callsFor(warnSpy, NO_USER);
    expect(warned).toHaveLength(1);
    expect(warned[0][0]).toEqual({ subId: id, userId: ghost });
    // The existing unknown-sub report still fires; no adopt log does.
    expect(callsFor(errorSpy, 'billing.webhook.unknown_subscription')).toHaveLength(1);
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'billing.webhook.unknown_subscription',
      'warning',
    );
    expect(callsFor(warnSpy, 'billing.webhook.unknown_subscription_adopted')).toHaveLength(0);
    expect(observed()).not.toContain(em);
    expect(observed()).not.toContain(nm);
  });

  it('a user deleted after the sub was created: same, report only', async () => {
    const u = await seedUser();
    await User.deleteOne({ _id: u.userId });
    const id = sid('wh-deleted');

    const res = await postWebhook(
      'subscription.activated',
      payloadFor(id, u.userId, u.email, canary('n')),
    );

    expect(res.status).toBe(200);
    expect(await getSub(id)).toBeNull();
    expect(callsFor(warnSpy, NO_USER)).toHaveLength(1);
    expect(observed()).not.toContain(u.email);
  });

  it('the missing-user path leaves a reconcile marker and other users untouched', async () => {
    const ghost = new mongoose.Types.ObjectId().toString();
    const u = await seedUser();
    await plantMarker(u.userId);

    await handleWebhookEvent('subscription.charged', {
      subscription: { entity: { id: sid('wh-ghost2'), notes: { userId: ghost, planId: SOLO } } },
    });

    expect(await markerCount(u.userId)).toBe(1);
    expect(await Subscription.countDocuments({})).toBe(0);
  });

  it('a User lookup failure is not swallowed into an adopt: no row is written', async () => {
    const u = await seedUser();
    const id = sid('wh-userdb');
    jest.spyOn(User, 'exists').mockRejectedValue(new Error(canary('userdb')));

    await expect(
      handleWebhookEvent('subscription.authenticated', orphanPayload(u, id)),
    ).rejects.toBeDefined();

    expect(await getSub(id)).toBeNull();
  });

  it('an existing user is still adopted (control)', async () => {
    const u = await seedUser();
    const id = sid('wh-ctrl');

    const res = await postWebhook(
      'subscription.authenticated',
      payloadFor(id, u.userId, u.email, canary('n')),
    );

    expect(res.status).toBe(200);
    expect(String((await getSub(id))!.userId)).toBe(u.userId);
    expect(callsFor(warnSpy, NO_USER)).toHaveLength(0);
  });
});

// ─── Adversarial timings ─────────────────────────────────────────────────────
describe('T-527 round 2: adversarial timings (two live subs / duplicate checkout plus a create)', () => {
  it('Razorpay lists the sub ACTIVE but the local row is still a different-plan checkout (webhook not yet applied): must answer 409, never cancel a paid sub', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    const id = sid('adv-active-vs-created');
    allMock.mockImplementation(async () => {
      await Subscription.create({
        userId: u.userId,
        razorpaySubscriptionId: id,
        status: 'created',
        planId: PRO,
      });
      return { items: [rzpItem(u.userId, id, 'active', PRO)] };
    });
    createMock.mockResolvedValue({ id: sid('adv-new'), short_url: url('adv-new') });

    const res = await subscribe(u, SOLO);

    // A sub the list reports as active (paid) must not be cancelled at Razorpay
    // and replaced by a new create.
    expect(cancelMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
    expect(res.status).toBe(409);
  });

  it('Razorpay lists the sub ACTIVE but the local row is a same-plan checkout: must answer 409, not hand back a payment link', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    const id = sid('adv-active-same');
    allMock.mockImplementation(async () => {
      await Subscription.create({
        userId: u.userId,
        razorpaySubscriptionId: id,
        status: 'created',
        planId: SOLO,
      });
      return { items: [rzpItem(u.userId, id, 'active', SOLO)] };
    });

    const res = await subscribe(u, SOLO);

    expect(createMock).not.toHaveBeenCalled();
    expect(res.status).toBe(409);
  });

  // Round 3 (Arjun option (a)): G1-G3 were it.failing gaps; the webhook adopt
  // now takes the per-user SubscriptionCreateLock, so they are plain tests.
  it('G1: two different unknown subs for one user adopted concurrently by webhooks: one is refused (busy), the retry is not adopted; at most one non-terminal row', async () => {
    const u = await seedUser();
    let arrivedUser = 0;
    let openUser!: () => void;
    const gateUser = new Promise<void>((r) => (openUser = r));
    const realUserExists = User.exists.bind(User);
    // Both webhooks pass the "does the user exist" check together, so both
    // reach the lock at the same moment.
    jest.spyOn(User, 'exists').mockImplementation(((...a: Parameters<typeof User.exists>) => {
      if (++arrivedUser >= 2) openUser();
      return gateUser.then(() => realUserExists(...a));
    }) as never);
    const idA = sid('adv-wh-a');
    const idB = sid('adv-wh-b');

    const results = await Promise.allSettled([
      handleWebhookEvent('subscription.authenticated', orphanPayload(u, idA)),
      handleWebhookEvent('subscription.authenticated', orphanPayload(u, idB)),
    ]);

    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(SubscriptionAdoptBusyError);
    expect(await nonTerminalCount(u.userId)).toBe(1);
    // The refused one is retried: another non-terminal row exists, so it is
    // reported, not adopted.
    const loser = (await getSub(idA)) ? idB : idA;
    expect(await webhookOutcome('subscription.authenticated', orphanPayload(u, loser))).toBeNull();
    expect(await getSub(loser)).toBeNull();
    expect(await nonTerminalCount(u.userId)).toBe(1);
    expect(await lockCount(u.userId)).toBe(0);
  });

  it('G2: an orphan webhook while the subscribe create is in flight: busy (500 to Razorpay), the subscribe answers 200, the retry is not adopted; no duplicate checkout', async () => {
    const u = await seedUser();
    const orphan = sid('adv-mid-orphan');
    const newId = sid('adv-mid-new');
    let during: unknown;
    createMock.mockImplementation(async () => {
      during = await webhookOutcome('subscription.authenticated', orphanPayload(u, orphan));
      return { id: newId, short_url: url(newId) };
    });

    const res = await subscribe(u, SOLO);

    expect(during).toBeInstanceOf(SubscriptionAdoptBusyError);
    expect(res.status).toBe(200);
    expect(res.body.data.subscriptionId).toBe(newId);
    expect(await getSub(orphan)).toBeNull();
    expect(await nonTerminalCount(u.userId)).toBe(1);
    expect(await webhookOutcome('subscription.authenticated', orphanPayload(u, orphan))).toBeNull();
    expect(await getSub(orphan)).toBeNull();
    expect(await nonTerminalCount(u.userId)).toBe(1);
    expect(cancelMock).not.toHaveBeenCalled();
    expect(await lockCount(u.userId)).toBe(0);
  });

  it('G2 over HTTP: the busy webhook is a 500 so Razorpay retries (not a 200 ack)', async () => {
    const u = await seedUser();
    await SubscriptionCreateLock.init();
    await SubscriptionCreateLock.create({ userId: u.userId, createdAt: new Date() });
    const id = sid('adv-http');
    const body = JSON.stringify({
      event: 'subscription.authenticated',
      payload: orphanPayload(u, id),
    });
    const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');

    const res = await request(app)
      .post('/webhook/razorpay')
      .type('json')
      .set('x-razorpay-signature', sig)
      .send(body);

    expect(res.status).toBe(500);
    expect(await getSub(id)).toBeNull();
    // The webhook did not delete the lock it never took.
    expect(await lockCount(u.userId)).toBe(1);
  });

  it('G3: an orphan ACTIVATED by a webhook while the subscribe create is in flight: busy, the subscribe answers 200; at most one live-or-checkout row', async () => {
    const u = await seedUser();
    const orphan = sid('adv-mid-live');
    const newId = sid('adv-mid-live-new');
    const activated = {
      subscription: {
        entity: {
          id: orphan,
          current_start: Math.floor(Date.now() / 1000),
          current_end: Math.floor(Date.now() / 1000) + 2_592_000,
          paid_count: 1,
          notes: { userId: u.userId, planId: SOLO },
        },
      },
    };
    let during: unknown;
    createMock.mockImplementation(async () => {
      during = await webhookOutcome('subscription.activated', activated);
      return { id: newId, short_url: url(newId) };
    });

    const res = await subscribe(u, SOLO);

    expect(during).toBeInstanceOf(SubscriptionAdoptBusyError);
    expect(res.status).toBe(200);
    const rows = await rowsOf(u.userId);
    const live = rows.filter((r) => r.status === 'active').length;
    const checkouts = rows.filter((r) => ['created', 'authenticated'].includes(r.status)).length;
    expect(live + checkouts).toBeLessThanOrEqual(1);
    // The retry of the activation finds a checkout row and does not adopt.
    expect(await webhookOutcome('subscription.activated', activated)).toBeNull();
    expect(await nonTerminalCount(u.userId)).toBe(1);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('two concurrent subscribes for one user with a marker: the lock lets one through (409 in-progress for the other), at most one create', async () => {
    const u = await seedUser();
    await plantMarker(u.userId);
    allMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return { items: [] };
    });
    createMock.mockResolvedValue({ id: sid('adv-conc'), short_url: url('adv-conc') });

    const [a, b] = await Promise.all([subscribe(u), subscribe(u)]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(await nonTerminalCount(u.userId)).toBe(1);
  });

  it('a subscribe and the sweep for the same user never both create or cancel under the lock', async () => {
    const u = await seedUser();
    await plantMarker(u.userId, {
      createdAt: new Date(Date.now() - RECONCILE_SWEEP_MIN_AGE_MS - 60_000),
    });
    const id = sid('adv-sweep');
    allMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 30));
      return { items: [rzpItem(u.userId, id, 'created', SOLO)] };
    });

    const [res] = await Promise.all([subscribe(u, SOLO), runReconcileSweep()]);

    // Whichever got the lock first decided; a created orphan is either adopted
    // (subscribe) or cancelled (sweep), never both, and nothing is created.
    expect(createMock).not.toHaveBeenCalled();
    const adopted = (await getSub(id)) !== null;
    const cancelled = cancelMock.mock.calls.some((c) => c[0] === id);
    expect(adopted && cancelled).toBe(false);
    if (res.status === 200) expect(adopted).toBe(true);
  });
});

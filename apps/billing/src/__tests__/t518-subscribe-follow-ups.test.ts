/**
 * T-518: subscribe follow-ups. Rules are Arjun's (21 Oct 2026):
 *  1. a create-lock budget check before subscriptions.create (40 s -> 503);
 *  3. a new paid cycle on a billing-cancelled/expired row is reported (report-only);
 *  5. legacy checkout fetch: timeout / other error -> 503, not-found -> guarded
 *     local cancel then create, 401/403 never not-found, never a 500;
 *  6a. the index-failure log gains codeName / code.
 * (Ruling 2, the concurrency test, lives in t516-retry-and-stale-checkout.test.ts.)
 *
 * Razorpay is mocked. Fake ids are built at runtime so gitleaks sees no
 * secret-looking literals.
 */
import './setupDb';
import './setupEnv';
import mongoose from 'mongoose';
import request from 'supertest';
import { CURRENT_PRIVACY_VERSION } from '@lawie/shared';

import { ensureInkLedgerIndexes } from '../config/ink-ledger-indexes';
import logger from '../config/logger';
import { Subscription } from '../models/Subscription.model';
import { SubscriptionCreateLock } from '../models/SubscriptionCreateLock.model';
import { User } from '../models/User.model';
import * as inkLedger from '../services/ink-ledger.service';
import {
  CREATE_LOCK_BUDGET_MS,
  RAZORPAY_CALL_TIMEOUT_MS,
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
jest.mock('@sentry/node', () => ({
  ...jest.requireActual('@sentry/node'),
  captureMessage: (...a: unknown[]) => mockCaptureMessage(...a),
  withScope: (cb: (scope: unknown) => void) => cb({ setTag: jest.fn(), setExtra: jest.fn() }),
}));

import { razorpay } from '../config/razorpay';
import app from '../app';

const INTERNAL_SECRET = process.env.INTERNAL_SECRET!;
const createMock = razorpay.subscriptions.create as jest.Mock;
const fetchMock = razorpay.subscriptions.fetch as jest.Mock;
const cancelMock = razorpay.subscriptions.cancel as jest.Mock;

const DAY = 86_400_000;
const future = () => new Date(Date.now() + 10 * DAY);
const past = () => new Date(Date.now() - 10 * DAY);
const sid = (n: string) => ['sub', '_', 't518', n].join('');
const url = (n: string) => ['https://rzp.io/', 't518-', n].join('');

const BUDGET_MSG = 'billing.subscription.create_lock_budget_exceeded';
const PAID_SUB_MSG = 'billing.resubscribe.cancelled_paid_sub';
const FETCH_TIMEOUT_MSG = 'billing.subscription.checkout_fetch_timeout';
const NOT_FOUND_MSG = 'billing.subscription.checkout_not_found';
const FETCH_FAILED_MSG = 'billing.subscription.checkout_fetch_failed';

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
  const email = `t518-${++counter}@example.com`;
  const u = await User.create({ email, plan: 'free', emailVerified: true });
  return { userId: u._id.toString(), email };
}
const addSub = (userId: string, id: string, fields: Record<string, unknown>) =>
  Subscription.create({ userId, razorpaySubscriptionId: id, ...fields });
const getSub = (id: string) => Subscription.findOne({ razorpaySubscriptionId: id }).lean();
const lockCount = (userId: string) => SubscriptionCreateLock.countDocuments({ userId });
const subscribe = (u: { userId: string; email: string }, planId?: string) =>
  request(app)
    .post('/subscribe')
    .set(headers(u.userId, u.email))
    .send(planId ? { planId } : {});
const mockNewSub = (id = sid('new'), shortUrl = url('new')) =>
  createMock.mockResolvedValue({ id, short_url: shortUrl });

/** The Razorpay SDK's error shape: { statusCode, error: { code, description } }. */
function rzpError(statusCode: number | undefined, code?: string, description?: string) {
  return Object.assign(new Error('razorpay error'), {
    ...(statusCode !== undefined ? { statusCode } : {}),
    error: { code, description },
  });
}
const notFoundErr = () => rzpError(400, 'BAD_REQUEST_ERROR', 'The id provided does not exist');

let warnSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;
const callsFor = (spy: jest.SpyInstance, msg: string) => spy.mock.calls.filter((c) => c[1] === msg);

// A movable clock: Date.now() is real time plus `skew`. A slow Razorpay mock
// bumps `skew`, so the 40 s budget can be crossed without waiting.
let skew = 0;
function useSkewedClock() {
  skew = 0;
  const realNow = Date.now.bind(Date);
  jest.spyOn(Date, 'now').mockImplementation(() => realNow() + skew);
}

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

beforeEach(() => {
  skew = 0;
  mockCaptureMessage.mockClear();
  createMock.mockReset();
  fetchMock.mockReset();
  cancelMock.mockReset().mockResolvedValue({});
  warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
  errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);
});

afterEach(() => {
  jest.restoreAllMocks();
  skew = 0;
});

// ─── Ruling 1 / AC1: the create-lock budget ──────────────────────────────────
describe('T-518 ruling 1: create-lock budget before subscriptions.create', () => {
  it('pins the constants: budget 40 s, and budget + one bounded create stays inside the 60 s lock TTL', () => {
    expect(CREATE_LOCK_BUDGET_MS).toBe(40_000);
    expect(RAZORPAY_CALL_TIMEOUT_MS).toBe(15_000);
    const ttlSeconds = SubscriptionCreateLock.schema
      .indexes()
      .map(([, opts]) => (opts as { expireAfterSeconds?: number }).expireAfterSeconds)
      .find((v) => typeof v === 'number');
    expect(ttlSeconds).toBe(60);
    expect(CREATE_LOCK_BUDGET_MS + RAZORPAY_CALL_TIMEOUT_MS).toBeLessThan(ttlSeconds! * 1000);
  });

  // Each path that reaches create, with the clock moved past the budget by the
  // step that is slow on that path.
  const slowPaths: Array<{
    name: string;
    arrange: (u: { userId: string }, slow: () => void) => Promise<string | null>;
    planId?: string;
  }> = [
    {
      name: 'plain (no existing sub; a slow step before create)',
      arrange: async () => {
        // The first findOne after the lock is taken is slow.
        const orig = Subscription.findOne.bind(Subscription);
        let bumped = false;
        jest.spyOn(Subscription, 'findOne').mockImplementation(((...a: unknown[]) => {
          if (!bumped) {
            bumped = true;
            skew += CREATE_LOCK_BUDGET_MS + 1_000;
          }
          return (orig as (...x: unknown[]) => unknown)(...a);
        }) as unknown as typeof Subscription.findOne);
        return null;
      },
    },
    {
      name: 'stale cancel (different-plan checkout; slow cancel)',
      planId: 'solo_yearly',
      arrange: async (u, slow) => {
        await addSub(u.userId, sid('slow-stale'), { status: 'created', planId: 'solo_monthly' });
        cancelMock.mockImplementation(async () => slow());
        return sid('slow-stale');
      },
    },
    {
      name: 'stale cancel throws, follow-up fetch shows ended (slow)',
      planId: 'solo_yearly',
      arrange: async (u, slow) => {
        await addSub(u.userId, sid('slow-reread'), { status: 'created', planId: 'solo_monthly' });
        cancelMock.mockRejectedValue(new Error('already ended'));
        fetchMock.mockImplementation(async () => {
          slow();
          return { status: 'cancelled' };
        });
        return sid('slow-reread');
      },
    },
    {
      name: 'lapsed (expired halted sub; slow Razorpay cancel)',
      arrange: async (u, slow) => {
        await addSub(u.userId, sid('slow-lapsed'), { status: 'halted', paidThrough: past() });
        cancelMock.mockImplementation(async () => slow());
        return sid('slow-lapsed');
      },
    },
    {
      name: 'legacy row (no planId; slow fetch, notes name another plan)',
      planId: 'solo_yearly',
      arrange: async (u, slow) => {
        await addSub(u.userId, sid('slow-legacy'), { status: 'created' });
        fetchMock.mockImplementation(async () => {
          slow();
          return { notes: { planId: 'pro_monthly' } };
        });
        return sid('slow-legacy');
      },
    },
    {
      name: 'legacy row not found at Razorpay (slow fetch)',
      planId: 'solo_yearly',
      arrange: async (u, slow) => {
        await addSub(u.userId, sid('slow-nf'), { status: 'created' });
        fetchMock.mockImplementation(async () => {
          slow();
          throw notFoundErr();
        });
        return sid('slow-nf');
      },
    },
  ];

  it.each(slowPaths)(
    '$name: past 40 s is a 503 try_again, create never called, lock released, one warn with userId and elapsedMs',
    async ({ arrange, planId }) => {
      useSkewedClock();
      const u = await seedUser();
      await arrange(u, () => {
        skew += CREATE_LOCK_BUDGET_MS + 1_000;
      });
      mockNewSub();

      const res = await subscribe(u, planId);

      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: 'try_again' });
      expect(createMock).not.toHaveBeenCalled();
      expect(await lockCount(u.userId)).toBe(0);
      const warns = callsFor(warnSpy, BUDGET_MSG);
      expect(warns).toHaveLength(1);
      expect(Object.keys(warns[0][0]).sort()).toEqual(['elapsedMs', 'userId']);
      expect(warns[0][0].userId).toBe(u.userId);
      expect(warns[0][0].elapsedMs).toBeGreaterThan(CREATE_LOCK_BUDGET_MS);
      expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(u.email);
    },
  );

  it('the service throws SubscriptionCancelFailedError (the route maps it to 503)', async () => {
    useSkewedClock();
    const u = await seedUser();
    await addSub(u.userId, sid('svc'), { status: 'created', planId: 'solo_monthly' });
    cancelMock.mockImplementation(async () => {
      skew += CREATE_LOCK_BUDGET_MS + 1_000;
    });
    await expect(createSubscription(u.userId, u.email, 'solo_yearly')).rejects.toMatchObject({
      name: 'SubscriptionCancelFailedError',
    });
  });

  it.each([
    ['stale cancel', 'solo_yearly'],
    ['lapsed', undefined],
  ] as const)('just under the budget (%s path): create proceeds', async (path, planId) => {
    useSkewedClock();
    const u = await seedUser();
    if (path === 'lapsed') {
      await addSub(u.userId, sid('under-l'), { status: 'halted', paidThrough: past() });
    } else {
      await addSub(u.userId, sid('under-s'), { status: 'created', planId: 'solo_monthly' });
    }
    cancelMock.mockImplementation(async () => {
      skew += CREATE_LOCK_BUDGET_MS - 5_000; // 35 s, plus a few ms of real time
    });
    mockNewSub();

    const res = await subscribe(u, planId);

    expect(res.status).toBe(200);
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(callsFor(warnSpy, BUDGET_MSG)).toHaveLength(0);
    expect(await lockCount(u.userId)).toBe(0);
  });

  it('a fast request never trips the budget', async () => {
    const u = await seedUser();
    mockNewSub();
    const res = await subscribe(u);
    expect(res.status).toBe(200);
    expect(callsFor(warnSpy, BUDGET_MSG)).toHaveLength(0);
  });
});

// ─── Ruling 3: late webhook, report-only ─────────────────────────────────────
describe('T-518 ruling 3: a new paid cycle on a billing-ended row is reported', () => {
  const START = new Date('2026-03-01T10:00:00.000Z');
  const END = new Date('2026-04-01T10:00:00.000Z');
  const secs = (d: Date) => Math.floor(d.getTime() / 1000);

  function charge(id: string, paidCount: number, start = START, end = END) {
    return {
      subscription: {
        entity: {
          id,
          paid_count: paidCount,
          current_start: secs(start),
          current_end: secs(end),
          notes: { planId: 'solo_monthly' },
        },
      },
    };
  }
  const reports = () => callsFor(errorSpy, PAID_SUB_MSG);

  async function seedEnded(status: string) {
    const user = await User.create({
      email: `t518-wh-${++counter}@example.com`,
      plan: 'free',
      emailVerified: true,
    });
    const id = sid(`wh-${status}-${counter}`);
    await addSub(user._id.toString(), id, { status, planId: 'solo_monthly' });
    return { user, id };
  }

  it.each(['cancelled', 'expired'] as const)(
    'charged on a %s row: one report, Ink and paidThrough still applied, status kept',
    async (status) => {
      const { user, id } = await seedEnded(status);

      await handleWebhookEvent('subscription.charged', charge(id, 1));

      expect(reports()).toHaveLength(1);
      expect(reports()[0][0]).toEqual({ subscriptionId: id });
      expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
      expect(mockCaptureMessage).toHaveBeenCalledWith(PAID_SUB_MSG, 'warning');
      const row = await getSub(id);
      expect(row!.status).toBe(status); // no un-cancel
      expect(row!.paidThrough!.toISOString()).toBe(END.toISOString());
      expect(row).not.toHaveProperty('lateWebhook');
      const u = await User.findById(user._id).lean();
      expect(u!.inkSub).toBeGreaterThan(0); // the grant is kept
      expect(u!.plan).not.toBe('free');
    },
  );

  it('activated carrying a new paid cycle on a cancelled row is reported once', async () => {
    const { id } = await seedEnded('cancelled');
    await handleWebhookEvent('subscription.activated', charge(id, 1));
    expect(reports()).toHaveLength(1);
  });

  it('activated then charged for the same cycle: reported once (the second loses the claim)', async () => {
    const { id } = await seedEnded('cancelled');
    await handleWebhookEvent('subscription.activated', charge(id, 1));
    await handleWebhookEvent('subscription.charged', charge(id, 1));
    expect(reports()).toHaveLength(1);
  });

  it('a replay of the same event (lost claim) does not report again and does not grant again', async () => {
    const { user, id } = await seedEnded('cancelled');
    await handleWebhookEvent('subscription.charged', charge(id, 1));
    const inkAfterFirst = (await User.findById(user._id).lean())!.inkSub;

    await handleWebhookEvent('subscription.charged', charge(id, 1));
    await handleWebhookEvent('subscription.charged', charge(id, 1));

    expect(reports()).toHaveLength(1);
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    expect((await User.findById(user._id).lean())!.inkSub).toBe(inkAfterFirst);
  });

  it('a replay by current_start only (no paid_count) does not report again', async () => {
    const { id } = await seedEnded('cancelled');
    const p = charge(id, 1);
    delete (p.subscription.entity as Record<string, unknown>).paid_count;
    await handleWebhookEvent('subscription.charged', p);
    await handleWebhookEvent('subscription.charged', p);
    expect(reports()).toHaveLength(1);
  });

  it('each new paid cycle is reported once (cycle 2 on the still-cancelled row)', async () => {
    const { id } = await seedEnded('cancelled');
    await handleWebhookEvent('subscription.charged', charge(id, 1));
    await handleWebhookEvent(
      'subscription.charged',
      charge(id, 2, END, new Date('2026-05-01T10:00:00.000Z')),
    );
    expect(reports()).toHaveLength(2);
    expect((await getSub(id))!.status).toBe('cancelled');
  });

  it('a failed grant reports nothing; the Razorpay retry grants and reports exactly once', async () => {
    const { user, id } = await seedEnded('cancelled');
    const grant = jest
      .spyOn(inkLedger, 'grantSubscriptionInk')
      .mockRejectedValueOnce(new Error('ledger down'));

    await expect(handleWebhookEvent('subscription.charged', charge(id, 1))).rejects.toThrow(
      'ledger down',
    );
    expect(reports()).toHaveLength(0);

    grant.mockRestore();
    await handleWebhookEvent('subscription.charged', charge(id, 1));

    expect(reports()).toHaveLength(1);
    expect((await User.findById(user._id).lean())!.inkSub).toBeGreaterThan(0);
  });

  it('a Razorpay-completed prior status does not report (the grant still applies)', async () => {
    const { user, id } = await seedEnded('completed');
    await handleWebhookEvent('subscription.charged', charge(id, 1));
    expect(reports()).toHaveLength(0);
    expect(mockCaptureMessage).not.toHaveBeenCalled();
    expect((await getSub(id))!.status).toBe('completed');
    expect((await User.findById(user._id).lean())!.inkSub).toBeGreaterThan(0);
  });

  it.each(['created', 'authenticated', 'active', 'halted'] as const)(
    'a %s row does not report',
    async (status) => {
      const { id } = await seedEnded(status);
      await handleWebhookEvent('subscription.charged', charge(id, 1));
      expect(reports()).toHaveLength(0);
      expect(mockCaptureMessage).not.toHaveBeenCalled();
    },
  );

  it('paid_count 0 on a cancelled row (no paid cycle) does not report', async () => {
    const { id } = await seedEnded('cancelled');
    await handleWebhookEvent('subscription.activated', charge(id, 0));
    expect(reports()).toHaveLength(0);
  });

  it('a stale (older) cycle on a cancelled row, after a newer one, does not report', async () => {
    const { id } = await seedEnded('cancelled');
    await handleWebhookEvent(
      'subscription.charged',
      charge(id, 2, END, new Date('2026-05-01T10:00:00.000Z')),
    );
    expect(reports()).toHaveLength(1);
    await handleWebhookEvent('subscription.charged', charge(id, 1));
    expect(reports()).toHaveLength(1);
  });

  it('the report carries the subscription id only (no user id or email)', async () => {
    const { user, id } = await seedEnded('cancelled');
    await handleWebhookEvent('subscription.charged', charge(id, 1));
    const logged = JSON.stringify(reports());
    expect(logged).not.toContain(user._id.toString());
    expect(logged).not.toContain(user.email);
  });
});

// ─── Ruling 5: isRazorpayNotFound ────────────────────────────────────────────
describe('T-518 ruling 5: isRazorpayNotFound', () => {
  it.each([
    ['404', rzpError(404)],
    ['404 with no body', Object.assign(new Error('x'), { statusCode: 404 })],
    [
      'BAD_REQUEST_ERROR "does not exist"',
      rzpError(400, 'BAD_REQUEST_ERROR', 'The id provided does not exist'),
    ],
    [
      '"does not exist" in any case',
      rzpError(400, 'BAD_REQUEST_ERROR', 'Subscription DOES NOT EXIST'),
    ],
    [
      'no statusCode but BAD_REQUEST_ERROR "does not exist"',
      rzpError(undefined, 'BAD_REQUEST_ERROR', 'it does not exist'),
    ],
  ])('%s -> true', (_n, err) => {
    expect(isRazorpayNotFound(err)).toBe(true);
  });

  it.each([
    [
      '401 with the not-found description',
      rzpError(401, 'BAD_REQUEST_ERROR', 'The id provided does not exist'),
    ],
    [
      '403 with the not-found description',
      rzpError(403, 'BAD_REQUEST_ERROR', 'The id provided does not exist'),
    ],
    ['401', rzpError(401)],
    ['403', rzpError(403)],
    ['500', rzpError(500)],
    ['500 with the not-found description', rzpError(500, 'BAD_REQUEST_ERROR', 'does not exist')],
    ['429', rzpError(429)],
    [
      '400 BAD_REQUEST_ERROR with another description',
      rzpError(400, 'BAD_REQUEST_ERROR', 'Plan is invalid'),
    ],
    ['400 with another code and the description', rzpError(400, 'GATEWAY_ERROR', 'does not exist')],
    [
      '400 with a non-string description',
      rzpError(400, 'BAD_REQUEST_ERROR', 5 as unknown as string),
    ],
    ['a bare Error', new Error('does not exist')],
    [
      'an Error with only a message-like description',
      Object.assign(new Error('x'), { description: 'does not exist' }),
    ],
    ['undefined', undefined],
    ['null', null],
    ['a string', 'does not exist'],
    ['a number', 404],
    ['an empty object', {}],
    ['error body is a string', { statusCode: 400, error: 'does not exist' }],
  ])('%s -> false', (_n, err) => {
    expect(isRazorpayNotFound(err)).toBe(false);
  });
});

// ─── Ruling 5: the checkout fetch in createSubscription ──────────────────────
describe('T-518 ruling 5: checkout fetch failures never 500', () => {
  describe('not found at Razorpay: guarded local cancel, then create', () => {
    it.each([
      ['404', () => rzpError(404)],
      ['BAD_REQUEST_ERROR does not exist', notFoundErr],
    ])(
      'legacy row (no planId), lookup fetch -> %s: cancelled locally, no Razorpay cancel, new sub created',
      async (_n, mk) => {
        const u = await seedUser();
        const old = sid('leg-nf');
        await addSub(u.userId, old, { status: 'created' });
        fetchMock.mockRejectedValue(mk());
        mockNewSub();

        const res = await subscribe(u, 'solo_monthly');

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({
          subscriptionId: sid('new'),
          shortUrl: url('new'),
          planId: 'solo_monthly',
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(cancelMock).not.toHaveBeenCalled();
        expect(createMock).toHaveBeenCalledTimes(1);
        const row = await getSub(old);
        expect(row!.status).toBe('cancelled');
        expect(row!.cancelledAt).toBeInstanceOf(Date);
        expect((await getSub(sid('new')))!.status).toBe('created');
        expect(await lockCount(u.userId)).toBe(0);
        const nf = callsFor(warnSpy, NOT_FOUND_MSG);
        expect(nf).toHaveLength(1);
        expect(nf[0][0]).toEqual({ subscriptionId: old });
        expect(errorSpy).not.toHaveBeenCalledWith(expect.anything(), PAID_SUB_MSG);
      },
    );

    it('same-plan reuse fetch -> not found: cancelled locally, no Razorpay cancel, new sub created', async () => {
      const u = await seedUser();
      const old = sid('reuse-nf');
      await addSub(u.userId, old, { status: 'authenticated', planId: 'solo_monthly' });
      fetchMock.mockRejectedValue(notFoundErr());
      mockNewSub();

      const res = await subscribe(u, 'solo_monthly');

      expect(res.status).toBe(200);
      expect(res.body.data.subscriptionId).toBe(sid('new'));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(old);
      expect(cancelMock).not.toHaveBeenCalled();
      expect(createMock).toHaveBeenCalledTimes(1);
      expect((await getSub(old))!.status).toBe('cancelled');
      expect(callsFor(warnSpy, NOT_FOUND_MSG)[0][0]).toEqual({ subscriptionId: old });
    });

    it('the local cancel is guarded: a checkout activated meanwhile is not overwritten (409, no create, no paid-sub report)', async () => {
      const u = await seedUser();
      const old = sid('guard');
      await addSub(u.userId, old, { status: 'created' });
      fetchMock.mockImplementation(async () => {
        await Subscription.updateOne(
          { razorpaySubscriptionId: old },
          { status: 'active', paidThrough: future() },
        );
        throw notFoundErr();
      });

      const res = await subscribe(u, 'solo_monthly');

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('subscription_exists');
      expect(createMock).not.toHaveBeenCalled();
      expect(cancelMock).not.toHaveBeenCalled();
      expect((await getSub(old))!.status).toBe('active');
      // Nothing was cancelled at Razorpay, so no "cancelled a paid sub" report.
      expect(callsFor(errorSpy, PAID_SUB_MSG)).toHaveLength(0);
      expect(mockCaptureMessage).not.toHaveBeenCalled();
      expect(await lockCount(u.userId)).toBe(0);
    });
  });

  describe('timeout -> 503', () => {
    it('legacy row, lookup fetch hangs: 503 try_again, no create, no cancel, row kept, lock released', async () => {
      collapseRazorpayTimeouts();
      const u = await seedUser();
      const id = sid('leg-to');
      await addSub(u.userId, id, { status: 'created' });
      fetchMock.mockReturnValue(new Promise(() => undefined));

      const res = await subscribe(u, 'solo_monthly');

      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: 'try_again' });
      expect(createMock).not.toHaveBeenCalled();
      expect(cancelMock).not.toHaveBeenCalled();
      expect((await getSub(id))!.status).toBe('created');
      expect(await lockCount(u.userId)).toBe(0);
      const w = callsFor(warnSpy, FETCH_TIMEOUT_MSG);
      expect(w).toHaveLength(1);
      expect(w[0][0]).toEqual({ subscriptionId: id });
    });

    it('same-plan reuse fetch hangs: 503 try_again through the route', async () => {
      collapseRazorpayTimeouts();
      const u = await seedUser();
      const id = sid('reuse-to');
      await addSub(u.userId, id, { status: 'created', planId: 'solo_monthly' });
      fetchMock.mockReturnValue(new Promise(() => undefined));

      const res = await subscribe(u, 'solo_monthly');

      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: 'try_again' });
      expect(createMock).not.toHaveBeenCalled();
      expect(callsFor(warnSpy, FETCH_TIMEOUT_MSG)[0][0]).toEqual({ subscriptionId: id });
    });
  });

  describe('any other error -> 503, nothing changed', () => {
    it.each([
      ['401', () => rzpError(401, 'BAD_REQUEST_ERROR', 'Authentication failed')],
      ['403', () => rzpError(403, 'BAD_REQUEST_ERROR', 'Access denied')],
      [
        '401 whose description says "does not exist"',
        () => rzpError(401, 'BAD_REQUEST_ERROR', 'The id provided does not exist'),
      ],
      [
        '403 whose description says "does not exist"',
        () => rzpError(403, 'BAD_REQUEST_ERROR', 'The id provided does not exist'),
      ],
      ['500', () => rzpError(500, 'SERVER_ERROR', 'Server error')],
      ['400 with another description', () => rzpError(400, 'BAD_REQUEST_ERROR', 'Bad input')],
      ['a plain Error', () => new Error('socket hang up')],
    ])(
      'legacy row, lookup fetch -> %s: 503 try_again, row not cancelled, no create',
      async (_n, mk) => {
        const u = await seedUser();
        const id = sid('leg-err');
        await addSub(u.userId, id, { status: 'created' });
        fetchMock.mockRejectedValue(mk());

        const res = await subscribe(u, 'solo_monthly');

        expect(res.status).toBe(503);
        expect(res.body).toEqual({ error: 'try_again' });
        expect(createMock).not.toHaveBeenCalled();
        expect(cancelMock).not.toHaveBeenCalled();
        const row = await getSub(id);
        expect(row!.status).toBe('created'); // no local cancel
        expect(row!.cancelledAt ?? null).toBeNull();
        expect(await Subscription.countDocuments({ userId: u.userId })).toBe(1);
        expect(await lockCount(u.userId)).toBe(0);
        expect(callsFor(warnSpy, NOT_FOUND_MSG)).toHaveLength(0);
        const failed = callsFor(errorSpy, FETCH_FAILED_MSG);
        expect(failed).toHaveLength(1);
        expect(failed[0][0]).toEqual({ subscriptionId: id });
      },
    );

    it.each([
      ['401', () => rzpError(401, 'BAD_REQUEST_ERROR', 'The id provided does not exist')],
      ['500', () => rzpError(500)],
    ])('same-plan reuse fetch -> %s: 503 try_again, no local cancel, no create', async (_n, mk) => {
      const u = await seedUser();
      const id = sid('reuse-err');
      await addSub(u.userId, id, { status: 'created', planId: 'solo_monthly' });
      fetchMock.mockRejectedValue(mk());

      const res = await subscribe(u, 'solo_monthly');

      expect(res.status).toBe(503);
      expect(res.body).toEqual({ error: 'try_again' });
      expect(createMock).not.toHaveBeenCalled();
      expect((await getSub(id))!.status).toBe('created');
      expect(await lockCount(u.userId)).toBe(0);
    });

    it('the failure logs carry the subscription id only (no user id, email or error text)', async () => {
      const u = await seedUser();
      const id = sid('leg-pii');
      await addSub(u.userId, id, { status: 'created' });
      fetchMock.mockRejectedValue(rzpError(500, 'SERVER_ERROR', `leak-${u.email}`));

      await subscribe(u, 'solo_monthly');

      const logged = JSON.stringify([...warnSpy.mock.calls, ...errorSpy.mock.calls]);
      expect(logged).not.toContain(u.email);
      expect(logged).not.toContain(u.userId);
    });
  });

  it('never a 500 for any fetch outcome on an unfinished checkout (route status is 200, 409 or 503)', async () => {
    const outcomes: Array<() => void> = [
      () => fetchMock.mockRejectedValue(rzpError(404)),
      () => fetchMock.mockRejectedValue(rzpError(401)),
      () => fetchMock.mockRejectedValue(rzpError(403)),
      () => fetchMock.mockRejectedValue(rzpError(500)),
      () => fetchMock.mockRejectedValue(new Error('boom')),
      () => fetchMock.mockRejectedValue('weird'),
      () => fetchMock.mockRejectedValue(undefined),
    ];
    for (const arrange of outcomes) {
      fetchMock.mockReset();
      createMock.mockReset();
      mockNewSub();
      const u = await seedUser();
      await addSub(u.userId, sid(`never500-${counter}`), { status: 'created' });
      arrange();
      const res = await subscribe(u, 'solo_monthly');
      expect([200, 409, 503]).toContain(res.status);
    }
  });
});

// ─── Ruling 6a: index failure log ────────────────────────────────────────────
describe('T-518 ruling 6a: ink-ledger index failure log carries codeName and code', () => {
  // Restore the stubbed db before setupDb's afterEach cleans collections.
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function failWith(err: unknown) {
    const createIndex = jest.fn().mockRejectedValue(err);
    jest.replaceProperty(mongoose.connection, 'db', {
      collection: jest.fn().mockReturnValue({ createIndex }),
    } as unknown as typeof mongoose.connection.db);
  }
  const logged = () => errorSpy.mock.calls[0] as unknown as [Record<string, unknown>, string];

  it('a driver error with a string codeName and a numeric code logs both next to errName, and no message', async () => {
    const secret = ['pii', Math.random().toString(36).slice(2)].join('-');
    const err = Object.assign(new Error(`conflict for ${secret}`), {
      name: 'MongoServerError',
      codeName: 'IndexOptionsConflict',
      code: 85,
    });
    failWith(err);

    await expect(ensureInkLedgerIndexes()).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [obj, msg] = logged();
    expect(obj).toEqual({
      errName: 'MongoServerError',
      codeName: 'IndexOptionsConflict',
      code: 85,
    });
    expect(msg).toBe('ink-ledger: index create failed; continuing');
    expect(JSON.stringify([obj, msg])).not.toContain(secret);
  });

  it('code 0 is a number and is kept', async () => {
    failWith(Object.assign(new Error('x'), { code: 0 }));
    await ensureInkLedgerIndexes();
    expect(logged()[0]).toEqual({ errName: 'Error', code: 0 });
  });

  it('a numeric codeName and a string code are left out', async () => {
    failWith(Object.assign(new Error('x'), { codeName: 85, code: 'EBADF' }));
    await ensureInkLedgerIndexes();
    expect(logged()[0]).toEqual({ errName: 'Error' });
  });

  it('only the string codeName when code is the wrong type, and only the number code when codeName is', async () => {
    failWith(Object.assign(new Error('x'), { codeName: 'Unauthorized', code: '13' }));
    await ensureInkLedgerIndexes();
    expect(logged()[0]).toEqual({ errName: 'Error', codeName: 'Unauthorized' });

    errorSpy.mockClear();
    failWith(Object.assign(new Error('x'), { codeName: { nested: 1 }, code: 13 }));
    await ensureInkLedgerIndexes();
    expect(logged()[0]).toEqual({ errName: 'Error', code: 13 });
  });

  it('an error with neither field logs errName only', async () => {
    failWith(new TypeError('plain'));
    await ensureInkLedgerIndexes();
    expect(logged()[0]).toEqual({ errName: 'TypeError' });
  });

  it.each([['boom'], [null], [undefined], [42]])(
    'a non-Error rejection (%p) logs errName "unknown" and no code fields, and does not throw',
    async (rejection) => {
      failWith(rejection);
      await expect(ensureInkLedgerIndexes()).resolves.toBeUndefined();
      expect(logged()[0]).toEqual({ errName: 'unknown' });
    },
  );
});
